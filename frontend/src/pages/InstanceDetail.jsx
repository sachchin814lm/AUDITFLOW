import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const InstanceDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const [instance, setInstance] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Action states
  const [decision, setDecision] = useState('APPROVED');
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Verification states
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    fetchInstanceDetails();
  }, [id]);

  const fetchInstanceDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const [instRes, ledgerRes] = await Promise.all([
        api.get(`/instances/${id}/`),
        api.get(`/instances/${id}/ledger/`),
      ]);
      setInstance(instRes.data);
      setLedgerEntries(ledgerRes.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to load document details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWorkflow = async () => {
    setActionLoading(true);
    setError('');
    setActionSuccess('');
    try {
      const res = await api.post(`/instances/${id}/submit/`);
      setInstance(res.data);
      setActionSuccess('Workflow successfully submitted into active review!');
      // Refresh ledger
      const ledgerRes = await api.get(`/instances/${id}/ledger/`);
      setLedgerEntries(ledgerRes.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to submit workflow.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecisionSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setActionSuccess('');
    try {
      const res = await api.post(`/instances/${id}/decide/`, {
        decision,
        comment,
      });
      setInstance(res.data.instance);
      setActionSuccess(`Decision recorded: ${decision}. Cryptographic signature generated.`);
      setComment('');
      // Refresh ledger
      const ledgerRes = await api.get(`/instances/${id}/ledger/`);
      setLedgerEntries(ledgerRes.data);
      // If verification was open, re-run
      if (verificationResult) {
        handleVerifyIntegrity();
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to record decision.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    try {
      const res = await api.get(`/instances/${id}/verify/`);
      setVerificationResult(res.data);
    } catch (err) {
      console.error(err);
      setError('Cryptographic verification failed to execute.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading document workflow and audit trail...</p>
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="page-container">
        <div className="alert alert-error">{error || 'Document not found.'}</div>
        <Link to="/instances" className="btn btn-outline">
          &larr; Back to Documents
        </Link>
      </div>
    );
  }

  // Determine user capabilities
  const isSubmitterOrStaff = user && (user.is_staff || instance.submitted_by === user.id);
  const canSubmit = instance.status === 'DRAFT' && isSubmitterOrStaff;

  // Active step assignment for current user
  const currentAssignment = instance.assignments?.find(
    (a) => a.step_order === instance.current_step_order
  );
  const isCurrentApprover =
    instance.status === 'IN_REVIEW' &&
    currentAssignment &&
    user &&
    currentAssignment.approver === user.id &&
    currentAssignment.decision === 'PENDING';

  const getStatusBadge = (st) => {
    const map = {
      DRAFT: 'badge-draft',
      IN_REVIEW: 'badge-review',
      APPROVED: 'badge-approved',
      REJECTED: 'badge-rejected',
    };
    return <span className={`badge ${map[st] || 'badge-default'}`}>{st.replace('_', ' ')}</span>;
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            <Link to="/instances">Documents</Link> &gt; <span>#{instance.id}</span>
          </div>
          <h1 className="page-title">{instance.title}</h1>
          <div className="instance-meta-row">
            {getStatusBadge(instance.status)}
            <span className="meta-item">
              Workflow: <strong>{instance.definition_name}</strong>
            </span>
            <span className="meta-item">
              Submitted by: <strong>{instance.submitted_by_username}</strong>
            </span>
            <span className="meta-item">
              Created: {new Date(instance.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            onClick={handleVerifyIntegrity}
            className="btn btn-secondary"
            disabled={verifying}
          >
            {verifying ? 'Verifying Hashes...' : '🔍 Verify Integrity'}
          </button>

          {canSubmit && (
            <button
              onClick={handleSubmitWorkflow}
              className="btn btn-primary"
              disabled={actionLoading}
            >
              {actionLoading ? 'Submitting...' : '🚀 Submit for Approval'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}

      {/* Verification Result Banner (when triggered) */}
      {verificationResult && (
        <div
          className={`crypto-verification-panel ${
            verificationResult.all_valid ? 'verified-pass' : 'verified-fail'
          }`}
        >
          <div className="verification-header">
            <span className="verification-icon">
              {verificationResult.all_valid ? '✅' : '❌'}
            </span>
            <div>
              <h3>
                {verificationResult.all_valid
                  ? 'Cryptographic Integrity Verified'
                  : 'Integrity Tamper Detected'}
              </h3>
              <p className="font-sm">
                Document contents and digital approver signatures checked against cryptographic HMAC keys.
              </p>
            </div>
          </div>

          <div className="verification-details-grid">
            <div className="verification-check-card">
              <div className="check-title">Document Content SHA-256 Check:</div>
              <div className="check-status">
                {verificationResult.document_valid ? (
                  <span className="text-success font-semibold">✔ Match (Authentic)</span>
                ) : (
                  <span className="text-danger font-semibold">✖ Mismatch or File Missing</span>
                )}
              </div>
              <div className="font-xs font-mono mt-1 text-muted break-all">
                Stored: {verificationResult.expected_sha256}
              </div>
              {verificationResult.computed_sha256 && (
                <div className="font-xs font-mono text-muted break-all">
                  Computed: {verificationResult.computed_sha256}
                </div>
              )}
            </div>

            <div className="verification-check-card">
              <div className="check-title">Digital Signatures Check:</div>
              <div className="check-status">
                {verificationResult.signatures_valid ? (
                  <span className="text-success font-semibold">
                    ✔ All Recorded Signatures Valid
                  </span>
                ) : (
                  <span className="text-danger font-semibold">✖ Invalid Signature Found</span>
                )}
              </div>
              <div className="font-xs text-muted mt-1">
                {verificationResult.signatures.length} signature(s) verified via constant-time HMAC digest.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Info + Timeline */}
      <div className="instance-grid">
        {/* Left Column: Document info & active decision card */}
        <div className="instance-main-col">
          {/* Document Spec Card */}
          <div className="card mb-4">
            <h3 className="card-title">Document Details</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Title</span>
                <span className="detail-value">{instance.title}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className="detail-value">{getStatusBadge(instance.status)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">SHA-256 Digest</span>
                <span className="detail-value font-mono font-xs bg-code">
                  {instance.document_sha256}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Document Source</span>
                <span className="detail-value">
                  {instance.document_file ? (
                    <a
                      href={instance.document_file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-primary"
                    >
                      📥 Download Local Media File
                    </a>
                  ) : instance.document_path ? (
                    <span className="text-muted">
                      Cloud Storage Path: <code className="font-xs">{instance.document_path}</code>
                    </span>
                  ) : (
                    <span className="text-muted">No file attached</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Current Approver Action Box */}
          {isCurrentApprover && (
            <div className="card card-action-prompt mb-4">
              <div className="action-header">
                <h3>✍️ Your Authorization is Required</h3>
                <p className="font-sm muted-text">
                  You are the designated approver for <strong>Step #{instance.current_step_order} ({currentAssignment?.step_name})</strong>.
                  Recording your decision will cryptographically sign this record.
                </p>
              </div>

              <form onSubmit={handleDecisionSubmit} className="form-vertical">
                <div className="form-group">
                  <label>Decision</label>
                  <div className="radio-button-group">
                    <label className={`radio-pill ${decision === 'APPROVED' ? 'selected-approve' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={decision === 'APPROVED'}
                        onChange={(e) => setDecision(e.target.value)}
                      />
                      <span>✔ Approve Step</span>
                    </label>
                    <label className={`radio-pill ${decision === 'REJECTED' ? 'selected-reject' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="REJECTED"
                        checked={decision === 'REJECTED'}
                        onChange={(e) => setDecision(e.target.value)}
                      />
                      <span>✖ Reject Workflow</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="decision-comment">Comments / Justification</label>
                  <textarea
                    id="decision-comment"
                    className="form-control"
                    rows="3"
                    placeholder="Enter audit comment or review remarks..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  ></textarea>
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className={`btn ${decision === 'APPROVED' ? 'btn-success' : 'btn-danger'}`}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? 'Signing Record...'
                      : decision === 'APPROVED'
                      ? 'Sign & Authorize'
                      : 'Reject Workflow'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step Timeline */}
          <div className="card mb-4">
            <h3 className="card-title">Approval Sequence & Digital Signatures</h3>
            <p className="card-subtitle">
              Sequential review chain. Each decision generates an HMAC-SHA256 digital signature.
            </p>

            <div className="step-timeline">
              {instance.assignments && instance.assignments.length > 0 ? (
                instance.assignments.map((asgn) => {
                  const isCurrent =
                    instance.status === 'IN_REVIEW' &&
                    instance.current_step_order === asgn.step_order;

                  let stepBadgeClass = 'step-pending';
                  if (asgn.decision === 'APPROVED') stepBadgeClass = 'step-approved';
                  if (asgn.decision === 'REJECTED') stepBadgeClass = 'step-rejected';

                  return (
                    <div
                      key={asgn.id}
                      className={`timeline-item ${isCurrent ? 'timeline-active' : ''}`}
                    >
                      <div className={`timeline-marker ${stepBadgeClass}`}>
                        {asgn.decision === 'APPROVED'
                          ? '✓'
                          : asgn.decision === 'REJECTED'
                          ? '✗'
                          : asgn.step_order}
                      </div>

                      <div className="timeline-content">
                        <div className="timeline-title-row">
                          <h4>
                            Step {asgn.step_order}: {asgn.step_name}
                          </h4>
                          <span className={`badge ${asgn.decision === 'APPROVED' ? 'badge-approved' : asgn.decision === 'REJECTED' ? 'badge-rejected' : 'badge-draft'}`}>
                            {asgn.decision}
                          </span>
                        </div>

                        <div className="timeline-meta">
                          Approver: <strong>{asgn.approver_username}</strong>
                          {asgn.decided_at && (
                            <span> &bull; Decided: {new Date(asgn.decided_at).toLocaleString()}</span>
                          )}
                        </div>

                        {asgn.comment && (
                          <div className="timeline-comment">
                            "{asgn.comment}"
                          </div>
                        )}

                        {asgn.signature && (
                          <div className="timeline-signature">
                            <span className="sig-label">Digital Signature (HMAC-SHA256):</span>
                            <code className="sig-code" title={asgn.signature}>
                              {asgn.signature.slice(0, 24)}...{asgn.signature.slice(-8)}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state-text">
                  Workflow not yet submitted. Steps will be instantiated once submitted.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right / Bottom Column: Append-Only Audit Log Ledger Table */}
        <div className="instance-ledger-col">
          <div className="card">
            <div className="card-header-flex">
              <div>
                <h3 className="card-title">Instance Audit Ledger</h3>
                <p className="card-subtitle">
                  Append-only cryptographic chain for this document.
                </p>
              </div>
              <span className="badge badge-default">{ledgerEntries.length} Records</span>
            </div>

            {ledgerEntries.length === 0 ? (
              <div className="empty-state-text">No ledger entries recorded yet.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Hash</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="font-mono text-muted">#{entry.id}</td>
                        <td>
                          <span className="action-tag">{entry.action}</span>
                        </td>
                        <td>{entry.actor_username || 'System'}</td>
                        <td className="font-mono font-xs" title={entry.entry_hash}>
                          {entry.entry_hash.slice(0, 10)}...
                        </td>
                        <td className="text-muted font-xs">
                          {new Date(entry.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstanceDetail;
