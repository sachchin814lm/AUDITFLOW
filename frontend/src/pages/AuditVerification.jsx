import React, { useState, useEffect } from 'react';
import api from '../api';

const AuditVerification = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    runAuditVerification();
  }, []);

  const runAuditVerification = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/ledger/verify/');
      setResult(res.data);
      setLastChecked(new Date());
    } catch (err) {
      console.error(err);
      setError('Failed to communicate with ledger verification engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cryptographic Chain Audit</h1>
          <p className="page-subtitle">
            Global ledger verification: inspects every block from genesis hash to head
          </p>
        </div>
        <button
          onClick={runAuditVerification}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Auditing Ledger...' : '🔄 Run Chain Audit Now'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Main Verification Status Card */}
      {result && (
        <div
          className={`audit-banner-card ${
            result.valid ? 'audit-pass' : 'audit-fail'
          }`}
        >
          <div className="audit-banner-icon">
            {result.valid ? '🛡️' : '🚨'}
          </div>

          <div className="audit-banner-content">
            <h2 className="audit-banner-title">
              {result.valid
                ? 'Chain Valid — All Hashes Verified'
                : `Tamper Detected at Entry #${result.first_bad_entry}`}
            </h2>
            <p className="audit-banner-subtitle">
              {result.valid
                ? 'Every ledger entry SHA-256 digest correctly binds to its historical predecessor. Zero data corruption detected.'
                : `Cryptographic chaining failure detected at entry ID #${result.first_bad_entry}. The entry hash or predecessor hash does not match canonical recomputed values.`}
            </p>

            {lastChecked && (
              <div className="audit-banner-timestamp">
                Last verified: {lastChecked.toLocaleTimeString()} ({lastChecked.toLocaleDateString()})
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Engine Architecture Details */}
      <div className="card mt-4">
        <h3 className="card-title">How AuditFlow Cryptographic Chain Works</h3>
        <p className="card-subtitle">
          Guaranteed immutability and complete mathematical auditability
        </p>

        <div className="architecture-steps">
          <div className="arch-step">
            <div className="arch-step-num">1</div>
            <div>
              <h4>Genesis Chaining</h4>
              <p className="font-sm text-muted">
                The first system entry binds to a 64-zero genesis hash. Each successive record
                includes the exact SHA-256 digest of the previous record.
              </p>
            </div>
          </div>

          <div className="arch-step">
            <div className="arch-step-num">2</div>
            <div>
              <h4>Canonical JSON Hashing</h4>
              <p className="font-sm text-muted">
                Hashes are computed over compact, key-sorted canonical JSON representations of
                <code>[prev_hash, instance_id, actor_id, action, payload, created_at]</code>.
              </p>
            </div>
          </div>

          <div className="arch-step">
            <div className="arch-step-num">3</div>
            <div>
              <h4>Two-Layer Immutability Enforcement</h4>
              <p className="font-sm text-muted">
                <strong>ORM Layer:</strong> Custom QuerySet and Model methods prevent updates and deletions.
                <br />
                <strong>PostgreSQL Engine Layer:</strong> Row-level triggers completely reject UPDATE,
                DELETE, and TRUNCATE statements even if an attacker executes raw SQL.
              </p>
            </div>
          </div>

          <div className="arch-step">
            <div className="arch-step-num">4</div>
            <div>
              <h4>Digital Signatures on Decisions</h4>
              <p className="font-sm text-muted">
                Every approval and rejection generates an HMAC-SHA256 signature binding the document's
                content digest, approver identity, decision, and exact timestamp.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditVerification;
