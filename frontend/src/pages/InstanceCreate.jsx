import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const InstanceCreate = () => {
  const [title, setTitle] = useState('');
  const [definitionId, setDefinitionId] = useState('');
  const [file, setFile] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingDefinitions, setFetchingDefinitions] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchDefinitions();
  }, []);

  const fetchDefinitions = async () => {
    try {
      const res = await api.get('/definitions/');
      setDefinitions(res.data.filter((d) => d.is_active));
      if (res.data.length > 0) {
        setDefinitionId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load workflow definitions.');
    } finally {
      setFetchingDefinitions(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }

    if (!definitionId) {
      setError('Please select a workflow definition.');
      return;
    }

    if (!file) {
      setError('Please upload a document file.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('definition', definitionId);
      formData.append('file', file);

      const res = await api.post('/instances/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Redirect to the newly created instance detail page
      navigate(`/instances/${res.data.id}`);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Failed to submit document.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">Submit Document for Approval</h1>
          <p className="page-subtitle">
            Upload your document and choose an authorization sequence.
          </p>
        </div>
        <Link to="/instances" className="btn btn-outline">
          &larr; Back to Documents
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {fetchingDefinitions ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading available workflows...</p>
          </div>
        ) : definitions.length === 0 ? (
          <div className="empty-card">
            <div className="empty-icon">⚠️</div>
            <h3>No Active Workflows</h3>
            <p className="muted-text">
              A staff administrator must create at least one workflow definition first.
            </p>
            <Link to="/definitions" className="btn btn-secondary btn-sm mt-3">
              Go to Definitions
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-vertical">
            <div className="form-group">
              <label htmlFor="doc-title">Document Title</label>
              <input
                id="doc-title"
                type="text"
                className="form-control"
                placeholder="e.g. Q4 Server Infrastructure Purchase Order"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="doc-definition">Workflow Approval Path</label>
              <select
                id="doc-definition"
                className="form-control"
                value={definitionId}
                onChange={(e) => setDefinitionId(e.target.value)}
                required
              >
                {definitions.map((def) => (
                  <option key={def.id} value={def.id}>
                    {def.name} ({def.steps?.length || 0} sequential steps)
                  </option>
                ))}
              </select>
              <p className="form-help">
                Approval steps and designated approvers are enforced according to the definition.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="doc-file">Document File</label>
              <div className="file-drop-area">
                <input
                  id="doc-file"
                  type="file"
                  className="file-input"
                  onChange={handleFileChange}
                  required
                />
                <div className="file-drop-label">
                  <span className="file-icon">📎</span>
                  {file ? (
                    <div>
                      <strong className="text-primary">{file.name}</strong>
                      <div className="font-xs text-muted">
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span>Click to select or drag and drop a file</span>
                      <div className="font-xs text-muted">PDF, DOCX, CSV, TXT, etc.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cryptographic Assurance Banner */}
            <div className="crypto-notice-box">
              <div className="crypto-notice-icon">🔒</div>
              <div className="crypto-notice-body">
                <h4>Server-Side Cryptographic Hashing</h4>
                <p>
                  To prevent tamper and client-side forgery, the server computes the document's
                  <strong> SHA-256 digest directly from the raw uploaded bytes</strong>. This hash
                  is permanently bound to every digital signature in the approval chain.
                </p>
              </div>
            </div>

            <div className="form-actions">
              <Link to="/instances" className="btn btn-outline">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="button-spinner"></span> : 'Create Draft Document'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default InstanceCreate;
