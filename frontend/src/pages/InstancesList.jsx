import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const InstancesList = () => {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInstances();
  }, []);

  const fetchInstances = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/instances/');
      setInstances(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch workflow instances.');
    } finally {
      setLoading(false);
    }
  };

  const filteredInstances = instances.filter((inst) => {
    const matchesStatus = statusFilter === 'ALL' || inst.status === statusFilter;
    const matchesSearch =
      inst.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.definition_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.submitted_by_username.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status) => {
    const map = {
      DRAFT: 'badge-draft',
      IN_REVIEW: 'badge-review',
      APPROVED: 'badge-approved',
      REJECTED: 'badge-rejected',
    };
    return <span className={`badge ${map[status] || 'badge-default'}`}>{status.replace('_', ' ')}</span>;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Documents</h1>
          <p className="page-subtitle">Track, review, and audit all submitted approval documents</p>
        </div>
        <Link to="/instances/new" className="btn btn-primary">
          + Submit New Document
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <input
            type="text"
            className="form-control"
            placeholder="Search by title, workflow, or submitter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="status-filter-group">
          {['ALL', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'].map((st) => (
            <button
              key={st}
              className={`filter-btn ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading workflow instances...</p>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="empty-card">
          <div className="empty-icon">📂</div>
          <h3>No matching documents</h3>
          <p className="muted-text">
            {searchTerm || statusFilter !== 'ALL'
              ? 'Try adjusting your filters or search keywords.'
              : 'Submit your first document to initiate the approval process.'}
          </p>
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Workflow Definition</th>
                <th>Status</th>
                <th>Current Step</th>
                <th>SHA-256 Digest</th>
                <th>Submitted By</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstances.map((inst) => (
                <tr key={inst.id}>
                  <td className="font-mono text-muted">#{inst.id}</td>
                  <td>
                    <Link to={`/instances/${inst.id}`} className="table-link font-medium">
                      {inst.title}
                    </Link>
                  </td>
                  <td>{inst.definition_name}</td>
                  <td>{getStatusBadge(inst.status)}</td>
                  <td>
                    {inst.current_step_order ? (
                      <span className="step-tag">Step {inst.current_step_order}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="font-mono font-xs text-muted" title={inst.document_sha256}>
                    {inst.document_sha256 ? `${inst.document_sha256.slice(0, 12)}...` : '—'}
                  </td>
                  <td>{inst.submitted_by_username}</td>
                  <td className="text-muted font-sm">
                    {new Date(inst.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <Link to={`/instances/${inst.id}`} className="btn btn-xs btn-outline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InstancesList;
