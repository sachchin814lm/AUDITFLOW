"""
Django administration configuration for AuditFlow models.
"""

from django.contrib import admin
from .models import (
    WorkflowDefinition,
    ApprovalStep,
    WorkflowInstance,
    ApproverAssignment,
    AuditLogLedger,
)


class ApprovalStepInline(admin.TabularInline):
    model = ApprovalStep
    extra = 1
    ordering = ["order"]


@admin.register(WorkflowDefinition)
class WorkflowDefinitionAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "is_active", "created_by", "created_at"]
    list_filter = ["is_active", "created_at"]
    search_fields = ["name", "description"]
    inlines = [ApprovalStepInline]


class ApproverAssignmentInline(admin.TabularInline):
    model = ApproverAssignment
    extra = 0
    readonly_fields = ["step", "approver", "decision", "comment", "signature", "decided_at"]
    can_delete = False


@admin.register(WorkflowInstance)
class WorkflowInstanceAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "title",
        "definition",
        "status",
        "current_step_order",
        "submitted_by",
        "created_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["title", "document_sha256"]
    inlines = [ApproverAssignmentInline]


@admin.register(AuditLogLedger)
class AuditLogLedgerAdmin(admin.ModelAdmin):
    """
    Read-only admin view for the append-only cryptographic ledger.
    No add, change, or delete operations permitted.
    """
    list_display = ["id", "action", "instance", "actor", "entry_hash_short", "created_at"]
    list_filter = ["action", "created_at"]
    search_fields = ["action", "entry_hash", "prev_hash"]
    readonly_fields = [field.name for field in AuditLogLedger._meta.fields]

    def entry_hash_short(self, obj):
        return f"{obj.entry_hash[:16]}..."
    entry_hash_short.short_description = "Hash"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
