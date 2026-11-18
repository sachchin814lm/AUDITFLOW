"""
Database models for AuditFlow workflow engine.
Defines definitions, steps, instances, assignments, and the immutable audit log ledger.
"""

from django.db import models
from django.contrib.auth.models import User
from .exceptions import ImmutableError


class WorkflowDefinition(models.Model):
    """
    Blueprint defining an approval process and its sequence of approval steps.
    """
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="workflow_definitions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ApprovalStep(models.Model):
    """
    Single step inside a workflow definition, assigned to a specific approver.
    """
    definition = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.CASCADE,
        related_name="steps"
    )
    order = models.PositiveIntegerField(
        help_text="Sequence order of the step (1-indexed)"
    )
    name = models.CharField(max_length=255)
    approver = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="approval_steps"
    )

    class Meta:
        ordering = ["order"]
        unique_together = [("definition", "order")]

    def __str__(self):
        return f"{self.definition.name} - Step {self.order}: {self.name} ({self.approver.username})"


class WorkflowInstance(models.Model):
    """
    A concrete document submitted into a workflow definition for multi-step approval.
    """
    STATUS_DRAFT = "DRAFT"
    STATUS_IN_REVIEW = "IN_REVIEW"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_IN_REVIEW, "In Review"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    definition = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.PROTECT,
        related_name="instances"
    )
    title = models.CharField(max_length=255)
    document_file = models.FileField(
        upload_to="documents/",
        null=True,
        blank=True,
        help_text="Locally stored document file if Supabase storage is not configured"
    )
    document_path = models.CharField(
        max_length=1024,
        blank=True,
        default="",
        help_text="Supabase Storage path when cloud storage is active"
    )
    document_sha256 = models.CharField(
        max_length=64,
        help_text="Server-computed SHA-256 cryptographic digest of document bytes"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT
    )
    current_step_order = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Current pending step order; null when draft or terminal"
    )
    submitted_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="submitted_instances"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.status}] {self.title} (#{self.pk})"


class ApproverAssignment(models.Model):
    """
    Assignment record for an approver at a specific step in a workflow instance.
    Stores cryptographic signature upon decision.
    """
    DECISION_PENDING = "PENDING"
    DECISION_APPROVED = "APPROVED"
    DECISION_REJECTED = "REJECTED"

    DECISION_CHOICES = [
        (DECISION_PENDING, "Pending"),
        (DECISION_APPROVED, "Approved"),
        (DECISION_REJECTED, "Rejected"),
    ]

    instance = models.ForeignKey(
        WorkflowInstance,
        on_delete=models.CASCADE,
        related_name="assignments"
    )
    step = models.ForeignKey(
        ApprovalStep,
        on_delete=models.PROTECT,
        related_name="assignments"
    )
    approver = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="approver_assignments"
    )
    decision = models.CharField(
        max_length=20,
        choices=DECISION_CHOICES,
        default=DECISION_PENDING
    )
    comment = models.TextField(blank=True, default="")
    signature = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="HMAC-SHA256 signature generated upon decision"
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["step__order"]

    def __str__(self):
        return f"{self.instance.title} - Step {self.step.order}: {self.decision} by {self.approver.username}"


class AuditLogLedgerQuerySet(models.QuerySet):
    """
    Custom QuerySet enforcing append-only immutability at the ORM level.
    """
    def update(self, **kwargs):
        raise ImmutableError("AuditLogLedger entries are immutable and cannot be updated.")

    def delete(self):
        raise ImmutableError("AuditLogLedger entries are immutable and cannot be deleted.")

    def bulk_update(self, objs, fields, batch_size=None):
        raise ImmutableError("AuditLogLedger entries are immutable and cannot be bulk updated.")


class AuditLogLedger(models.Model):
    """
    Cryptographically chained, append-only ledger for all system state changes.
    Each entry includes the SHA-256 hash of its contents plus the previous entry hash.
    """
    instance = models.ForeignKey(
        WorkflowInstance,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ledger_entries"
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ledger_actions"
    )
    action = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    prev_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hash of the preceding ledger entry (or 64 zeros for genesis)"
    )
    entry_hash = models.CharField(
        max_length=64,
        unique=True,
        help_text="SHA-256 hash computed over [prev_hash, instance_id, actor_id, action, payload, created_at]"
    )
    # Explicit datetime set by code (not auto_now_add) to ensure canonical hash input matches DB value exactly
    created_at = models.DateTimeField()

    objects = AuditLogLedgerQuerySet.as_manager()

    class Meta:
        ordering = ["id"]
        verbose_name = "Audit Log Ledger Entry"
        verbose_name_plural = "Audit Log Ledger Entries"

    def save(self, *args, **kwargs):
        # Prevent updating existing rows via save()
        if self.pk is not None:
            raise ImmutableError("AuditLogLedger entries are immutable and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Prevent deletion via delete()
        raise ImmutableError("AuditLogLedger entries are immutable and cannot be deleted.")

    def __str__(self):
        return f"Ledger #{self.id}: {self.action} ({self.entry_hash[:8]}...)"
