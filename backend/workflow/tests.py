"""
Automated test suite for AUDITFLOW Document Approval Engine.
Covers happy paths, state transitions, permissions, tamper detection,
ORM immutability, server-side hash computation, and digital signature verification.
"""

import hashlib
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from rest_framework.test import APIClient
from rest_framework import status

from .models import (
    WorkflowDefinition,
    ApprovalStep,
    WorkflowInstance,
    ApproverAssignment,
    AuditLogLedger,
)
from .exceptions import ImmutableError
from . import services, ledger


class AuditFlowTests(TestCase):
    def setUp(self):
        # Create test users
        self.admin = User.objects.create_superuser("admin_user", "admin@test.com", "pass123")
        self.submitter = User.objects.create_user("submitter_user", "sub@test.com", "pass123")
        self.alice = User.objects.create_user("alice_approver", "alice@test.com", "pass123")
        self.bob = User.objects.create_user("bob_approver", "bob@test.com", "pass123")
        self.eve = User.objects.create_user("eve_intruder", "eve@test.com", "pass123")

        # Create a 2-step workflow definition: Alice (Step 1) -> Bob (Step 2)
        self.definition = WorkflowDefinition.objects.create(
            name="Two Step Review",
            description="Alice then Bob approval",
            created_by=self.admin
        )
        self.step1 = ApprovalStep.objects.create(
            definition=self.definition,
            order=1,
            name="Initial Review",
            approver=self.alice
        )
        self.step2 = ApprovalStep.objects.create(
            definition=self.definition,
            order=2,
            name="Final Authorization",
            approver=self.bob
        )

        self.client = APIClient()

    def _create_sample_instance(self, title="Test Contract"):
        content = b"Contractual Terms and Conditions content v1.0"
        digest = hashlib.sha256(content).hexdigest()
        uploaded_file = SimpleUploadedFile("contract.pdf", content, content_type="application/pdf")
        instance = WorkflowInstance.objects.create(
            definition=self.definition,
            title=title,
            document_file=uploaded_file,
            document_sha256=digest,
            submitted_by=self.submitter,
            status=WorkflowInstance.STATUS_DRAFT
        )
        ledger.append(
            instance=instance,
            actor=self.submitter,
            action="CREATED",
            payload={"title": instance.title, "document_sha256": digest}
        )
        return instance

    def test_full_two_step_approval_happy_path(self):
        """Test full 2-step approval workflow through Alice then Bob to final APPROVED state."""
        instance = self._create_sample_instance("Happy Path Document")
        self.assertEqual(instance.status, WorkflowInstance.STATUS_DRAFT)

        # 1. Submitter submits workflow
        services.submit(instance.id, self.submitter)
        instance.refresh_from_db()
        self.assertEqual(instance.status, WorkflowInstance.STATUS_IN_REVIEW)
        self.assertEqual(instance.current_step_order, 1)
        self.assertEqual(instance.assignments.count(), 2)

        # 2. Step 1: Alice approves
        asgn1 = services.decide(instance.id, self.alice, "APPROVED", comment="Looks great from my end")
        instance.refresh_from_db()
        self.assertEqual(instance.status, WorkflowInstance.STATUS_IN_REVIEW)
        self.assertEqual(instance.current_step_order, 2)
        self.assertEqual(asgn1.decision, "APPROVED")
        self.assertTrue(bool(asgn1.signature))
        self.assertTrue(services.verify_signature(asgn1))

        # 3. Step 2: Bob authorizes
        asgn2 = services.decide(instance.id, self.bob, "APPROVED", comment="Final sign-off confirmed")
        instance.refresh_from_db()
        self.assertEqual(instance.status, WorkflowInstance.STATUS_APPROVED)
        self.assertIsNone(instance.current_step_order)
        self.assertEqual(asgn2.decision, "APPROVED")
        self.assertTrue(bool(asgn2.signature))
        self.assertTrue(services.verify_signature(asgn2))

        # 4. Verify cryptographic ledger
        is_valid, bad_id = ledger.verify_chain()
        self.assertTrue(is_valid)
        self.assertIsNone(bad_id)

    def test_rejection_at_step_one(self):
        """Test that rejecting at step 1 immediately marks the instance REJECTED and terminates."""
        instance = self._create_sample_instance("Flawed Proposal")
        services.submit(instance.id, self.submitter)

        # Alice rejects step 1
        asgn1 = services.decide(instance.id, self.alice, "REJECTED", comment="Terms unacceptable")
        instance.refresh_from_db()

        self.assertEqual(instance.status, WorkflowInstance.STATUS_REJECTED)
        self.assertIsNone(instance.current_step_order)
        self.assertEqual(asgn1.decision, "REJECTED")
        self.assertTrue(services.verify_signature(asgn1))

        # Step 2 assignment must remain PENDING
        asgn2 = instance.assignments.get(step__order=2)
        self.assertEqual(asgn2.decision, "PENDING")
        self.assertEqual(asgn2.signature, "")

        is_valid, _ = ledger.verify_chain()
        self.assertTrue(is_valid)

    def test_wrong_user_cannot_decide_forbidden(self):
        """Test that an unauthorized user attempting to approve receives PermissionError / 403."""
        instance = self._create_sample_instance("Secure Memo")
        services.submit(instance.id, self.submitter)

        # Eve is not assigned to step 1 (Alice is) -> raises PermissionError
        with self.assertRaises(PermissionError):
            services.decide(instance.id, self.eve, "APPROVED", comment="Sneaky approval")

        # Submitter can see the instance, but is not the approver for step 1 -> returns 403
        self.client.force_authenticate(user=self.submitter)
        response = self.client.post(
            f"/api/instances/{instance.id}/decide/",
            {"decision": "APPROVED", "comment": "Submitter cannot approve"}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_out_of_order_decision_blocked(self):
        """Test that Bob (step 2) cannot approve while step 1 is still pending."""
        instance = self._create_sample_instance("Order Dependent Document")
        services.submit(instance.id, self.submitter)

        # Current step is 1 (Alice). Bob attempts to decide early:
        with self.assertRaises(PermissionError):
            services.decide(instance.id, self.bob, "APPROVED", comment="Jumping the queue")

    def test_illegal_transitions_blocked(self):
        """Test that state machine disallows invalid transitions and raises ValueError."""
        instance = self._create_sample_instance("Draft Document")

        # Cannot decide when instance is in DRAFT status
        with self.assertRaises(ValueError):
            services.decide(instance.id, self.alice, "APPROVED")

        # Advance to APPROVED terminal status
        services.submit(instance.id, self.submitter)
        services.decide(instance.id, self.alice, "APPROVED")
        services.decide(instance.id, self.bob, "APPROVED")
        instance.refresh_from_db()
        self.assertEqual(instance.status, WorkflowInstance.STATUS_APPROVED)

        # Cannot decide on already APPROVED instance
        with self.assertRaises(ValueError):
            services.decide(instance.id, self.alice, "APPROVED")

        # Cannot re-submit already APPROVED instance
        with self.assertRaises(ValueError):
            services.submit(instance.id, self.submitter)

    def test_ledger_chain_valid_after_workflow(self):
        """Verify the complete audit ledger chain integrity after multiple lifecycle events."""
        instance = self._create_sample_instance("Lifecycle Audit Check")
        services.submit(instance.id, self.submitter)
        services.decide(instance.id, self.alice, "APPROVED", comment="Alice OK")
        services.decide(instance.id, self.bob, "APPROVED", comment="Bob OK")

        is_valid, bad_id = ledger.verify_chain()
        self.assertTrue(is_valid)
        self.assertIsNone(bad_id)

    def test_ledger_chain_detected_as_invalid_after_tampering_raw_sql(self):
        """Tamper with a ledger entry via raw SQL and confirm verify_chain flags the corruption."""
        instance = self._create_sample_instance("Tamper Target Document")
        services.submit(instance.id, self.submitter)

        # Chain should be valid prior to tampering
        is_valid, _ = ledger.verify_chain()
        self.assertTrue(is_valid)

        # Target an entry and modify payload directly in SQLite bypassing ORM
        target_entry = AuditLogLedger.objects.order_by("id").first()
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE workflow_auditlogledger SET action = 'MALICIOUS_TAMPER' WHERE id = %s;",
                [target_entry.id]
            )

        is_valid_after, bad_entry_id = ledger.verify_chain()
        self.assertFalse(is_valid_after)
        self.assertEqual(bad_entry_id, target_entry.id)

    def test_immutable_error_on_ledger_update_delete_via_orm(self):
        """Confirm that updating or deleting an AuditLogLedger entry via the ORM raises ImmutableError."""
        instance = self._create_sample_instance("Immutability Test")
        entry = AuditLogLedger.objects.filter(instance=instance).first()
        self.assertIsNotNone(entry)

        # 1. Instance save() modification
        with self.assertRaises(ImmutableError):
            entry.action = "ALTERED_ACTION"
            entry.save()

        # 2. Instance delete()
        with self.assertRaises(ImmutableError):
            entry.delete()

        # 3. QuerySet update()
        with self.assertRaises(ImmutableError):
            AuditLogLedger.objects.filter(id=entry.id).update(action="ALTERED_BY_QS")

        # 4. QuerySet delete()
        with self.assertRaises(ImmutableError):
            AuditLogLedger.objects.filter(id=entry.id).delete()

        # 5. QuerySet bulk_update()
        with self.assertRaises(ImmutableError):
            AuditLogLedger.objects.bulk_update([entry], ["action"])

    def test_server_side_hash_matches_uploaded_file(self):
        """Test file upload via API endpoint and ensure server computes correct SHA-256."""
        self.client.force_authenticate(user=self.submitter)

        payload_bytes = b"EXACT TEST CONTENT TO BE CRYPTOGRAPHICALLY HASHED"
        expected_hash = hashlib.sha256(payload_bytes).hexdigest()
        uploaded_doc = SimpleUploadedFile("spec.pdf", payload_bytes, content_type="application/pdf")

        response = self.client.post(
            "/api/instances/",
            {
                "title": "API Uploaded Spec",
                "definition": self.definition.id,
                "file": uploaded_doc,
            },
            format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        instance_id = response.data["id"]

        instance = WorkflowInstance.objects.get(id=instance_id)
        self.assertEqual(instance.document_sha256, expected_hash)

        # Call verify endpoint
        verify_resp = self.client.get(f"/api/instances/{instance.id}/verify/")
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_resp.data["document_valid"])
        self.assertEqual(verify_resp.data["computed_sha256"], expected_hash)

    def test_signature_verification_passes_and_fails_on_tampered_data(self):
        """Test digital HMAC signature verification passes originally and fails if payload is tampered."""
        instance = self._create_sample_instance("Signature Verification Doc")
        services.submit(instance.id, self.submitter)

        asgn = services.decide(instance.id, self.alice, "APPROVED", comment="Authentic Signature Test")
        self.assertTrue(services.verify_signature(asgn))

        # Verify via API endpoint
        self.client.force_authenticate(user=self.submitter)
        verify_resp = self.client.get(f"/api/instances/{instance.id}/verify/")
        self.assertTrue(verify_resp.data["signatures_valid"])

        # Tamper with the decision on the assignment
        asgn.decision = "REJECTED"
        asgn.save()
        self.assertFalse(services.verify_signature(asgn))

        # Restore valid decision and tamper with signature string
        asgn.decision = "APPROVED"
        asgn.signature = "a" * 64
        asgn.save()
        self.assertFalse(services.verify_signature(asgn))
