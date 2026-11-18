"""
Workflow state machine and business logic services for AuditFlow.
Handles workflow submissions, step approvals/rejections, cryptographic HMAC signing,
and verification.
"""

import hmac
import hashlib
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from .models import WorkflowInstance, ApproverAssignment, ApprovalStep
from . import ledger

# Explicit Finite State Machine Transitions
VALID_TRANSITIONS = {
    WorkflowInstance.STATUS_DRAFT: [WorkflowInstance.STATUS_IN_REVIEW],
    WorkflowInstance.STATUS_IN_REVIEW: [
        WorkflowInstance.STATUS_APPROVED,
        WorkflowInstance.STATUS_REJECTED,
    ],
    WorkflowInstance.STATUS_APPROVED: [],  # Terminal state
    WorkflowInstance.STATUS_REJECTED: [],  # Terminal state
}


def validate_transition(current_status, target_status):
    """
    Validates whether transitioning from current_status to target_status is permitted.
    Raises ValueError on illegal transitions.
    """
    allowed_next_states = VALID_TRANSITIONS.get(current_status, [])
    if target_status not in allowed_next_states:
        raise ValueError(
            f"Illegal state transition from '{current_status}' to '{target_status}'. "
            f"Allowed transitions: {allowed_next_states or 'None (Terminal state)'}"
        )


def submit(instance_id, actor):
    """
    Submits a draft workflow instance into active review.
    - Locks the instance row using select_for_update.
    - Verifies permissions: only the submitter or staff can submit.
    - Verifies definition has at least one approval step.
    - Creates ApproverAssignment records for every step.
    - Transitions instance from DRAFT -> IN_REVIEW.
    - Appends 'SUBMITTED' record to the audit ledger.
    """
    with transaction.atomic():
        instance = WorkflowInstance.objects.select_for_update().get(pk=instance_id)

        # Validate state machine transition
        validate_transition(instance.status, WorkflowInstance.STATUS_IN_REVIEW)

        # Enforce submitter or staff permission
        if not (actor.is_staff or instance.submitted_by_id == actor.id):
            raise PermissionError("Only the submitter or a staff administrator may submit this workflow.")

        # Require at least one step in the workflow definition
        steps = list(instance.definition.steps.order_by("order"))
        if not steps:
            raise ValueError("Cannot submit workflow: definition has no configured approval steps.")

        # Instantiate approver assignments for all steps
        for step in steps:
            ApproverAssignment.objects.create(
                instance=instance,
                step=step,
                approver=step.approver,
                decision=ApproverAssignment.DECISION_PENDING
            )

        # Advance to first step
        first_step = steps[0]
        instance.status = WorkflowInstance.STATUS_IN_REVIEW
        instance.current_step_order = first_step.order
        instance.save()

        # Record in append-only audit ledger
        ledger.append(
            instance=instance,
            actor=actor,
            action="SUBMITTED",
            payload={
                "status": instance.status,
                "current_step_order": instance.current_step_order,
                "total_steps": len(steps),
            }
        )

        return instance


def decide(instance_id, actor, decision, comment=""):
    """
    Records an approval or rejection decision on the current workflow step.
    - Locks the instance and assignment rows using select_for_update.
    - Validates decision value (APPROVED or REJECTED) and instance status (IN_REVIEW).
    - Verifies actor is the designated approver for the current step (else PermissionError).
    - Signs the decision with HMAC-SHA256 using SIGNING_SECRET.
    - If REJECTED -> moves instance to REJECTED.
    - If APPROVED -> advances to next step, or marks instance APPROVED if all steps complete.
    - Appends 'STEP_APPROVED' or 'STEP_REJECTED' to the audit ledger.
    """
    if decision not in (ApproverAssignment.DECISION_APPROVED, ApproverAssignment.DECISION_REJECTED):
        raise ValueError(f"Invalid decision '{decision}'. Must be APPROVED or REJECTED.")

    with transaction.atomic():
        instance = WorkflowInstance.objects.select_for_update().get(pk=instance_id)

        if instance.status != WorkflowInstance.STATUS_IN_REVIEW:
            raise ValueError(f"Cannot record decision: instance is currently in '{instance.status}', not IN_REVIEW.")

        if instance.current_step_order is None:
            raise ValueError("Instance does not have an active pending step.")

        # Retrieve the assignment for the active step
        assignment = instance.assignments.select_for_update().filter(
            step__order=instance.current_step_order
        ).first()

        if not assignment:
            raise ValueError(f"No assignment found for current step order {instance.current_step_order}.")

        if assignment.decision != ApproverAssignment.DECISION_PENDING:
            raise ValueError(f"Step {instance.current_step_order} has already been decided.")

        # Authorization check: only the assigned approver may decide this step
        if assignment.approver_id != actor.id:
            raise PermissionError("You are not the designated approver for the current step.")

        # Generate cryptographic HMAC-SHA256 signature
        decided_at = timezone.now()
        signing_key = settings.SIGNING_SECRET.encode("utf-8")
        # Canonical message: instance_id|document_sha256|actor_id|decision|timestamp
        message = f"{instance.id}|{instance.document_sha256}|{actor.id}|{decision}|{decided_at.isoformat()}".encode("utf-8")
        signature = hmac.new(signing_key, message, hashlib.sha256).hexdigest()

        # Update assignment details
        assignment.decision = decision
        assignment.comment = comment or ""
        assignment.signature = signature
        assignment.decided_at = decided_at
        assignment.save()

        if decision == ApproverAssignment.DECISION_REJECTED:
            validate_transition(instance.status, WorkflowInstance.STATUS_REJECTED)
            instance.status = WorkflowInstance.STATUS_REJECTED
            instance.current_step_order = None
            instance.save()

            ledger.append(
                instance=instance,
                actor=actor,
                action="STEP_REJECTED",
                payload={
                    "step_order": assignment.step.order,
                    "comment": assignment.comment,
                    "signature": signature,
                    "status": instance.status,
                }
            )
        else:  # APPROVED
            # Look for next pending step
            next_step = instance.definition.steps.filter(
                order__gt=assignment.step.order
            ).order_by("order").first()

            if next_step:
                # Advance to next step
                instance.current_step_order = next_step.order
                instance.save()

                ledger.append(
                    instance=instance,
                    actor=actor,
                    action="STEP_APPROVED",
                    payload={
                        "step_order": assignment.step.order,
                        "comment": assignment.comment,
                        "signature": signature,
                        "status": instance.status,
                        "current_step_order": instance.current_step_order,
                    }
                )
            else:
                # All steps approved: finalize instance as APPROVED
                validate_transition(instance.status, WorkflowInstance.STATUS_APPROVED)
                instance.status = WorkflowInstance.STATUS_APPROVED
                instance.current_step_order = None
                instance.save()

                ledger.append(
                    instance=instance,
                    actor=actor,
                    action="STEP_APPROVED",
                    payload={
                        "step_order": assignment.step.order,
                        "comment": assignment.comment,
                        "signature": signature,
                        "status": instance.status,
                        "current_step_order": None,
                    }
                )

        return assignment


def verify_signature(assignment):
    """
    Recomputes the HMAC-SHA256 signature for an ApproverAssignment and verifies it
    using constant-time comparison against the stored signature.
    Returns True if valid, False otherwise.
    """
    if not assignment.signature or not assignment.decided_at:
        return False

    signing_key = settings.SIGNING_SECRET.encode("utf-8")
    message = f"{assignment.instance_id}|{assignment.instance.document_sha256}|{assignment.approver_id}|{assignment.decision}|{assignment.decided_at.isoformat()}".encode("utf-8")
    expected_signature = hmac.new(signing_key, message, hashlib.sha256).hexdigest()

    return hmac.compare_digest(expected_signature, assignment.signature)
