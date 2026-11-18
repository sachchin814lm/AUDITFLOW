import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();
  const [instances, setInstances] = useState([]);
  const [pendingInstances, setPendingInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const [instancesRes, pendingRes] = await Promise.all([
        api.get('/instances/'),
        api.get('/instances/my_pending/'),
      ]);
      setInstances(instancesRes.data);
      setPendingInstances(pendingRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Compute status metrics
  const statusCounts = instances.reduce(
    (acc, inst) => {
      acc[inst.status] = (acc[inst.status] || 0) + 1;
      return acc;
    },
    { DRAFT: 0, IN_REVIEW: 0, APPROVED: 0, REJECTED: 0 }
  );

  const getStatusBadge = (status) => {
    const map = {
      DRAFT: 'badge-draft',
      IN_REVIEW: 'badge-review',
      APPROVED: 'badge-approved',
      REJECTED: 'badge-rejected',
    };
    return <span className={`badge ${map[status] || 'badge-default'}`}>{status.replace('_', ' ')}</span>;
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Approval Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, <strong>{user?.username}</strong>. Real-time document workflow metrics.
          </p>
        </div>
        <div className="header-actions">
          <Link to="/instances/new" className="btn btn-primary">
            + Submit New Document
          </Link>
          {user?.is_staff && (
            <Link to="/definitions/new" className="btn btn-secondary">
              + New Workflow Definition
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Documents</div>
          <div className="metric-value">{instances.length}</div>
          <div className="metric-sub">Across all visible workflows</div>
        </div>

        <div className="metric-card warning">
          <div className="metric-label">In Review</div>
          <div className="metric-value">{statusCounts.IN_REVIEW}</div>
          <div className="metric-sub">Active multi-step reviews</div>
        </div>

        <div className="metric-card success">
          <div className="metric-label">Approved</div>
          <div className="metric-value">{statusCounts.APPROVED}</div>
          <div className="metric-sub">Signed & cryptographic audit pass</div>
        </div>

        <div className="metric-card danger">
          <div className="metric-label">Rejected</div>
          <div className="metric-value">{statusCounts.REJECTED}</div>
          <div className="metric-sub">Terminated requests</div>
        </div>
      </div>

      {/* Awaiting My Approval Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <div className="section-title-group">
            <h2 className="section-title">⚡ Awaiting My Approval</h2>
            {pendingInstances.length > 0 && (
              <span className="badge badge-warning">{pendingInstances.length} Action Required</span>
            )}
          </div>
          <button onClick={fetchDashboardData} className="btn btn-xs btn-outline">
            Refresh
          </button>
        </div>

        {pendingInstances.length === 0 ? (
          <div className="empty-card">
            <div className="empty-icon">🎉</div>
            <h3>All caught up!</h3>
            <p className="muted-text">There are no documents waiting for your authorization right now.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Workflow</th>
                  <th>Submitted By</th>
                  <th>Current Step</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingInstances.map((inst) => (
                  <tr key={inst.id} className="highlight-row">
                    <td>
                      <Link to={`/instances/${inst.id}`} className="table-link font-medium">
                        {inst.title}
                      </Link>
                    </td>
                    <td>{inst.definition_name}</td>
                    <td>{inst.submitted_by_username}</td>
                    <td>
                      <span className="step-tag">Step #{inst.current_step_order}</span>
                    </td>
                    <td>
                      <Link to={`/instances/${inst.id}`} className="btn btn-sm btn-primary">
                        Review & Sign
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Activity Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2 className="section-title">Recent Documents</h2>
          <Link to="/instances" className="view-all-link">
            View All Documents &rarr;
          </Link>
        </div>

        {instances.length === 0 ? (
          <div className="empty-card">
            <div className="empty-icon">📄</div>
            <h3>No documents found</h3>
            <p className="muted-text">Submit your first document for workflow approval.</p>
            <Link to="/instances/new" className="btn btn-primary btn-sm mt-3">
              Submit Document
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Workflow Definition</th>
                  <th>Status</th>
                  <th>Submitted By</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {instances.slice(0, 7).map((inst) => (
                  <tr key={inst.id}>
                    <td className="font-mono text-muted">#{inst.id}</td>
                    <td>
                      <Link to={`/instances/${inst.id}`} className="table-link font-medium">
                        {inst.title}
                      </Link>
                    </td>
                    <td>{inst.definition_name}</td>
                    <td>{getStatusBadge(inst.status)}</td>
                    <td>{inst.submitted_by_username}</td>
                    <td className="text-muted font-sm">
                      {new Date(inst.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <Link to={`/instances/${inst.id}`} className="btn btn-xs btn-outline">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
