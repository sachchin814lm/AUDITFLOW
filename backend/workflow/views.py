"""
API Views and ViewSets for AuditFlow.
"""

import uuid
import hashlib
from django.contrib.auth.models import User
from django.db import models, transaction
from django.conf import settings
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import (
    WorkflowDefinition,
    ApprovalStep,
    WorkflowInstance,
    ApproverAssignment,
    AuditLogLedger,
)
from .serializers import (
    UserSerializer,
    WorkflowDefinitionSerializer,
    WorkflowInstanceSerializer,
    ApproverAssignmentSerializer,
    AuditLogLedgerSerializer,
)
from . import services, ledger


# ---------------------------------------------------------------------------
# Authentication & User Views
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register_view(request):
    """
    Registers a new standard user account and returns an authentication token.
    """
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    email = request.data.get("email", "").strip()

    if not username or not password:
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": f"Username '{username}' is already taken."},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = User.objects.create_user(username=username, password=password, email=email)
    token, _ = Token.objects.get_or_create(user=user)

    return Response(
        {
            "token": token.key,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_staff": user.is_staff,
            },
        },
        status=status.HTTP_201_CREATED
    )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me_view(request):
    """
    Returns current authenticated user details.
    """
    user = request.user
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_staff": user.is_staff,
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def users_list_view(request):
    """
    Returns list of active users so the frontend can populate approver selectors.
    """
    users = User.objects.filter(is_active=True).order_by("username")
    return Response(UserSerializer(users, many=True).data)


# ---------------------------------------------------------------------------
# Workflow Definition ViewSet
# ---------------------------------------------------------------------------

class WorkflowDefinitionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for viewing and creating workflow definitions.
    Creation is restricted to staff administrators.
    """
    queryset = WorkflowDefinition.objects.all().prefetch_related("steps__approver")
    serializer_class = WorkflowDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        # Only staff members can define new workflows
        if not request.user.is_staff:
            raise PermissionError("Only staff administrators can create workflow definitions.")

        name = request.data.get("name", "").strip()
        description = request.data.get("description", "").strip()
        steps_data = request.data.get("steps", [])

        if not name:
            return Response(
                {"detail": "Workflow definition name is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not steps_data or not isinstance(steps_data, list):
            return Response(
                {"detail": "At least one step is required in the workflow definition."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            definition = WorkflowDefinition.objects.create(
                name=name,
                description=description,
                created_by=request.user,
                is_active=True,
            )

            created_steps = []
            for item in steps_data:
                order = int(item.get("order", 1))
                step_name = item.get("name", f"Step {order}").strip()
                approver_id = item.get("approver")
                if not approver_id:
                    raise ValueError(f"Step '{step_name}' must specify an approver.")

                step = ApprovalStep.objects.create(
                    definition=definition,
                    order=order,
                    name=step_name,
                    approver_id=approver_id,
                )
                created_steps.append(step)

            # Record creation in append-only audit ledger
            ledger.append(
                instance=None,
                actor=request.user,
                action="DEFINITION_CREATED",
                payload={
                    "definition_id": definition.id,
                    "name": definition.name,
                    "step_count": len(created_steps),
                }
            )

        serializer = self.get_serializer(definition)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Workflow Instance ViewSet
# ---------------------------------------------------------------------------

class WorkflowInstanceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for workflow instances (documents going through approval).
    Immutable: update (PUT/PATCH) and delete (DELETE) are disabled.
    """
    serializer_class = WorkflowInstanceSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return WorkflowInstance.objects.none()

        # Staff can see all workflow instances
        if user.is_staff:
            return WorkflowInstance.objects.all().select_related(
                "definition", "submitted_by"
            ).prefetch_related("assignments__step", "assignments__approver")

        # Non-staff users see instances they submitted or are assigned to as approvers
        return WorkflowInstance.objects.filter(
            models.Q(submitted_by=user) |
            models.Q(assignments__approver=user) |
            models.Q(definition__steps__approver=user)
        ).distinct().select_related(
            "definition", "submitted_by"
        ).prefetch_related("assignments__step", "assignments__approver")

    def create(self, request, *args, **kwargs):
        """
        Creates a new workflow instance in DRAFT status.
        Computes SHA-256 hash server-side from uploaded file bytes.
        Saves to Supabase Storage if configured; otherwise to local MEDIA storage.
        """
        title = request.data.get("title", "").strip()
        definition_id = request.data.get("definition")
        uploaded_file = request.FILES.get("file") or request.FILES.get("document_file")

        if not title:
            return Response(
                {"detail": "Title is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not definition_id:
            return Response(
                {"detail": "Workflow definition is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not uploaded_file:
            return Response(
                {"detail": "A document file must be uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            definition = WorkflowDefinition.objects.get(pk=definition_id, is_active=True)
        except WorkflowDefinition.DoesNotExist:
            return Response(
                {"detail": "Valid active workflow definition not found."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Server-side cryptographic digest: never trust client-provided hash
        file_bytes = uploaded_file.read()
        sha256_digest = hashlib.sha256(file_bytes).hexdigest()
        uploaded_file.seek(0)

        # File storage strategy: Supabase Storage if configured, else local MEDIA
        document_path = ""
        document_file = None

        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            try:
                from supabase import create_client
                supabase_client = create_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SERVICE_ROLE_KEY
                )
                bucket_name = settings.SUPABASE_STORAGE_BUCKET or "auditflow-documents"
                file_ext = uploaded_file.name.split(".")[-1] if "." in uploaded_file.name else "bin"
                storage_path = f"documents/{uuid.uuid4()}.{file_ext}"

                content_type = getattr(uploaded_file, "content_type", "application/octet-stream")
                supabase_client.storage.from_(bucket_name).upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"content-type": content_type}
                )
                document_path = storage_path
            except Exception as e:
                # If remote storage encounters an error, fallback to local storage
                document_file = uploaded_file
        else:
            document_file = uploaded_file

        with transaction.atomic():
            instance = WorkflowInstance.objects.create(
                definition=definition,
                title=title,
                document_file=document_file,
                document_path=document_path,
                document_sha256=sha256_digest,
                status=WorkflowInstance.STATUS_DRAFT,
                submitted_by=request.user,
            )

            # Record creation in immutable audit ledger
            ledger.append(
                instance=instance,
                actor=request.user,
                action="CREATED",
                payload={
                    "title": instance.title,
                    "document_sha256": sha256_digest,
                    "definition_id": definition.id,
                }
            )

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """
        Transition instance from DRAFT -> IN_REVIEW and instantiate step assignments.
        """
        instance = self.get_object()
        services.submit(instance.id, request.user)
        instance.refresh_from_db()
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        """
        Record APPROVE or REJECT decision on the current step with an HMAC-SHA256 signature.
        """
        instance = self.get_object()
        decision = request.data.get("decision", "").strip().upper()
        comment = request.data.get("comment", "").strip()

        assignment = services.decide(
            instance_id=instance.id,
            actor=request.user,
            decision=decision,
            comment=comment
        )
        instance.refresh_from_db()
        return Response({
            "instance": self.get_serializer(instance).data,
            "assignment": ApproverAssignmentSerializer(assignment).data
        })

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        """
        Retrieve all ledger entries recorded for this specific workflow instance.
        """
        instance = self.get_object()
        entries = instance.ledger_entries.order_by("id")
        return Response(AuditLogLedgerSerializer(entries, many=True).data)

    @action(detail=True, methods=["get"])
    def verify(self, request, pk=None):
        """
        Cryptographic integrity check for this workflow instance:
        1. Recomputes document SHA-256 hash from stored file and compares against document_sha256.
        2. Recomputes and verifies HMAC signatures for every completed step assignment.
        """
        instance = self.get_object()

        # 1. Read document bytes and recompute document hash
        doc_bytes = None
        if instance.document_file:
            try:
                with instance.document_file.open("rb") as f:
                    doc_bytes = f.read()
            except Exception:
                doc_bytes = None
        elif instance.document_path and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            try:
                from supabase import create_client
                client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
                bucket = settings.SUPABASE_STORAGE_BUCKET or "auditflow-documents"
                doc_bytes = client.storage.from_(bucket).download(instance.document_path)
            except Exception:
                doc_bytes = None

        if doc_bytes is not None:
            computed_sha256 = hashlib.sha256(doc_bytes).hexdigest()
            document_valid = (computed_sha256 == instance.document_sha256)
        else:
            computed_sha256 = None
            document_valid = False

        # 2. Verify digital signatures on each decided assignment
        assignments = instance.assignments.select_related("step", "approver").order_by("step__order")
        signatures_report = []
        signatures_all_valid = True

        for asgn in assignments:
            if asgn.decision in (ApproverAssignment.DECISION_APPROVED, ApproverAssignment.DECISION_REJECTED):
                is_valid = services.verify_signature(asgn)
                if not is_valid:
                    signatures_all_valid = False
                signatures_report.append({
                    "step_order": asgn.step.order,
                    "step_name": asgn.step.name,
                    "approver": asgn.approver.username,
                    "decision": asgn.decision,
                    "signature": asgn.signature,
                    "decided_at": asgn.decided_at.isoformat() if asgn.decided_at else None,
                    "valid": is_valid,
                })

        overall_valid = bool(document_valid and signatures_all_valid)

        return Response({
            "document_valid": document_valid,
            "expected_sha256": instance.document_sha256,
            "computed_sha256": computed_sha256,
            "signatures": signatures_report,
            "signatures_valid": signatures_all_valid,
            "all_valid": overall_valid,
        })

    @action(detail=False, methods=["get"])
    def my_pending(self, request):
        """
        Returns instances that are IN_REVIEW and where the current step approver is the requesting user.
        """
        user = request.user
        instances = WorkflowInstance.objects.filter(
            status=WorkflowInstance.STATUS_IN_REVIEW,
            assignments__approver=user,
            assignments__decision=ApproverAssignment.DECISION_PENDING,
            assignments__step__order=models.F("current_step_order")
        ).distinct().select_related("definition", "submitted_by")

        serializer = self.get_serializer(instances, many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Global Ledger Verification View
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def verify_ledger_view(request):
    """
    Global ledger cryptographic verification.
    Walks the entire chain of AuditLogLedger entries, recomputing hashes and validating links.
    Returns: {"valid": bool, "first_bad_entry": id | null}
    """
    is_valid, bad_entry_id = ledger.verify_chain()
    return Response({
        "valid": is_valid,
        "first_bad_entry": bad_entry_id,
    })
