"""
Audit log ledger service for AuditFlow.
Provides append-only, cryptographically chained hashing and verification for all system operations.
"""

import json
import hashlib
from django.db import transaction, connection
from django.utils import timezone
from .models import AuditLogLedger

GENESIS_HASH = "0" * 64
ADVISORY_LOCK_ID = 8472910384


def compute_canonical_hash(prev_hash, instance_id, actor_id, action, payload, ts_iso):
    """
    Computes SHA-256 hash from canonical JSON representation.
    Ensures sort_keys=True and compact separators (no whitespace).
    Input tuple: [prev_hash, instance_id, actor_id, action, payload, ts_iso]
    """
    canonical_data = [
        prev_hash,
        instance_id,
        actor_id,
        action,
        payload,
        ts_iso,
    ]
    canonical_json = json.dumps(canonical_data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def append(instance, actor, action, payload):
    """
    Appends a new immutable entry to the AuditLogLedger inside an atomic transaction.
    - Serializes PostgreSQL writers using pg_advisory_xact_lock.
    - Chains against the last entry's entry_hash (or genesis hash).
    - Sets created_at timestamp and computes canonical SHA-256 hash.
    - Inserts and returns the AuditLogLedger entry.
    """
    with transaction.atomic():
        # On PostgreSQL, serialize ledger appenders to prevent concurrent race conditions
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s);", [ADVISORY_LOCK_ID])

        # Find the most recent ledger entry
        last_entry = AuditLogLedger.objects.order_by("-id").first()
        prev_hash = last_entry.entry_hash if last_entry else GENESIS_HASH

        # Use current UTC timestamp
        ts = timezone.now()
        ts_iso = ts.isoformat()

        instance_id = instance.pk if instance is not None else None
        actor_id = actor.pk if actor is not None else None

        entry_hash = compute_canonical_hash(
            prev_hash=prev_hash,
            instance_id=instance_id,
            actor_id=actor_id,
            action=action,
            payload=payload,
            ts_iso=ts_iso
        )

        entry = AuditLogLedger.objects.create(
            instance=instance,
            actor=actor,
            action=action,
            payload=payload,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
            created_at=ts
        )

        return entry


def verify_chain():
    """
    Verifies the integrity of the entire cryptographic audit log ledger.
    Iterates all entries ordered by id and verifies:
    1. prev_hash matches preceding entry's entry_hash (or genesis).
    2. entry_hash matches recomputed SHA-256 digest of entry data.
    Returns:
        (True, None) if the chain is intact.
        (False, first_bad_entry_id) if any tampering or broken link is found.
    """
    entries = AuditLogLedger.objects.order_by("id")
    expected_prev = GENESIS_HASH

    for entry in entries:
        # Check chaining pointer
        if entry.prev_hash != expected_prev:
            return (False, entry.id)

        # Recompute SHA-256 hash
        computed_hash = compute_canonical_hash(
            prev_hash=entry.prev_hash,
            instance_id=entry.instance_id,
            actor_id=entry.actor_id,
            action=entry.action,
            payload=entry.payload,
            ts_iso=entry.created_at.isoformat()
        )

        if computed_hash != entry.entry_hash:
            return (False, entry.id)

        expected_prev = entry.entry_hash

    return (True, None)
