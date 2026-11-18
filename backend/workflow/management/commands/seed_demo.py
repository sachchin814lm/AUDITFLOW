"""
Management command: seed_demo
DEVELOPMENT ONLY. Seeds test users and a sample multi-step workflow.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from workflow.models import WorkflowDefinition, ApprovalStep
from workflow import ledger


class Command(BaseCommand):
    help = "DEVELOPMENT ONLY: Seeds demo users and a sample Purchase Order Approval workflow."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(self.style.WARNING("  AUDITFLOW - DEMO DATA SEED (DEVELOPMENT ONLY)"))
        self.stdout.write(self.style.WARNING("=" * 60))

        # 1. Create or update Demo Users
        users_info = [
            {"username": "admin", "email": "admin@auditflow.local", "password": "admin123", "is_staff": True, "is_superuser": True},
            {"username": "alice", "email": "alice@auditflow.local", "password": "demo12345", "is_staff": False, "is_superuser": False},
            {"username": "bob", "email": "bob@auditflow.local", "password": "demo12345", "is_staff": False, "is_superuser": False},
            {"username": "carol", "email": "carol@auditflow.local", "password": "demo12345", "is_staff": False, "is_superuser": False},
        ]

        created_users = {}
        for u in users_info:
            user, created = User.objects.get_or_create(username=u["username"])
            user.set_password(u["password"])
            user.email = u["email"]
            user.is_staff = u["is_staff"]
            user.is_superuser = u["is_superuser"]
            user.save()
            created_users[u["username"]] = user
            status_text = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"  [{status_text}] User: {u['username']} (password: {u['password']}) | Staff: {u['is_staff']}"))

        # 2. Create Demo Workflow Definition
        wf_name = "Purchase Order Approval"
        definition = WorkflowDefinition.objects.filter(name=wf_name).first()

        if not definition:
            admin_user = created_users["admin"]
            definition = WorkflowDefinition.objects.create(
                name=wf_name,
                description="Standard three-tier enterprise purchase order review and authorization.",
                created_by=admin_user,
                is_active=True
            )

            # Steps: alice -> bob -> carol
            steps = [
                {"order": 1, "name": "Department Review", "approver": created_users["alice"]},
                {"order": 2, "name": "Finance Review", "approver": created_users["bob"]},
                {"order": 3, "name": "Executive Sign-Off", "approver": created_users["carol"]},
            ]

            for s in steps:
                ApprovalStep.objects.create(
                    definition=definition,
                    order=s["order"],
                    name=s["name"],
                    approver=s["approver"]
                )

            # Record in audit ledger
            ledger.append(
                instance=None,
                actor=admin_user,
                action="DEFINITION_CREATED",
                payload={
                    "definition_id": definition.id,
                    "name": definition.name,
                    "step_count": len(steps)
                }
            )

            self.stdout.write(self.style.SUCCESS(f"\n  [Created] Workflow: '{wf_name}' (ID: {definition.id})"))
            self.stdout.write(self.style.SUCCESS("    Step 1: Department Review -> alice"))
            self.stdout.write(self.style.SUCCESS("    Step 2: Finance Review     -> bob"))
            self.stdout.write(self.style.SUCCESS("    Step 3: Executive Sign-Off -> carol"))
        else:
            self.stdout.write(self.style.NOTICE(f"\n  [Existing] Workflow: '{wf_name}' (ID: {definition.id}) already exists."))

        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(self.style.WARNING("  DEMO CREDENTIALS SUMMARY:"))
        self.stdout.write("  - Staff/Admin: admin / admin123")
        self.stdout.write("  - Approver 1:  alice / demo12345")
        self.stdout.write("  - Approver 2:  bob   / demo12345")
        self.stdout.write("  - Approver 3:  carol / demo12345")
        self.stdout.write(self.style.WARNING("=" * 60))
