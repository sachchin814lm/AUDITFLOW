"""
DRF Serializers for AuditFlow models and requests.
"""

from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    WorkflowDefinition,
    ApprovalStep,
    WorkflowInstance,
    ApproverAssignment,
    AuditLogLedger,
)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "is_staff"]


class ApprovalStepSerializer(serializers.ModelSerializer):
    approver_username = serializers.CharField(source="approver.username", read_only=True)

    class Meta:
        model = ApprovalStep
        fields = ["id", "order", "name", "approver", "approver_username"]


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    steps = ApprovalStepSerializer(many=True, required=False)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = WorkflowDefinition
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "created_by",
            "created_by_username",
            "created_at",
            "steps",
        ]
        read_only_fields = ["created_by", "created_at"]


class ApproverAssignmentSerializer(serializers.ModelSerializer):
    approver_username = serializers.CharField(source="approver.username", read_only=True)
    step_order = serializers.IntegerField(source="step.order", read_only=True)
    step_name = serializers.CharField(source="step.name", read_only=True)

    class Meta:
        model = ApproverAssignment
        fields = [
            "id",
            "step",
            "step_order",
            "step_name",
            "approver",
            "approver_username",
            "decision",
            "comment",
            "signature",
            "decided_at",
        ]


class WorkflowInstanceSerializer(serializers.ModelSerializer):
    definition_name = serializers.CharField(source="definition.name", read_only=True)
    submitted_by_username = serializers.CharField(source="submitted_by.username", read_only=True)
    assignments = ApproverAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowInstance
        fields = [
            "id",
            "definition",
            "definition_name",
            "title",
            "document_file",
            "document_path",
            "document_sha256",
            "status",
            "current_step_order",
            "submitted_by",
            "submitted_by_username",
            "created_at",
            "assignments",
        ]
        read_only_fields = [
            "document_sha256",
            "status",
            "current_step_order",
            "submitted_by",
            "created_at",
        ]


class AuditLogLedgerSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditLogLedger
        fields = [
            "id",
            "instance",
            "actor",
            "actor_username",
            "action",
            "payload",
            "prev_hash",
            "entry_hash",
            "created_at",
        ]
