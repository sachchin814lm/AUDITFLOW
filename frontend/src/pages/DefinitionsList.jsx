import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const DefinitionsList = () => {
  const { user } = useAuth();
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDefinitions();
  }, []);

  const fetchDefinitions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/definitions/');
      setDefinitions(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch workflow definitions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Definitions</h1>
          <p className="page-subtitle">
            Configured sequential approval templates and designated approvers
          </p>
        </div>
        {user?.is_staff && (
          <Link to="/definitions/new" className="btn btn-primary">
            + New Definition
          </Link>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading workflow templates...</p>
        </div>
      ) : definitions.length === 0 ? (
        <div className="empty-card">
          <div className="empty-icon">⚙️</div>
          <h3>No Definitions Configured</h3>
          <p className="muted-text">
            {user?.is_staff
              ? 'Create a workflow definition to start accepting document submissions.'
              : 'Contact an administrator to create approval workflow definitions.'}
          </p>
          {user?.is_staff && (
            <Link to="/definitions/new" className="btn btn-primary btn-sm mt-3">
              Create Definition
            </Link>
          )}
        </div>
      ) : (
        <div className="definitions-grid">
          {definitions.map((def) => (
            <div key={def.id} className="definition-card">
              <div className="definition-header">
                <div>
                  <h3 className="definition-name">{def.name}</h3>
                  <div className="font-xs text-muted">
                    Created by {def.created_by_username} &bull;{' '}
                    {new Date(def.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`badge ${def.is_active ? 'badge-approved' : 'badge-draft'}`}>
                  {def.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {def.description && (
                <p className="definition-description">{def.description}</p>
              )}

              <div className="definition-steps-list">
                <div className="steps-title">Configured Steps:</div>
                <div className="steps-chips">
                  {def.steps && def.steps.length > 0 ? (
                    def.steps
                      .sort((a, b) => a.order - b.order)
                      .map((step, idx) => (
                        <div key={step.id || idx} className="step-chip">
                          <span className="step-num">{step.order}</span>
                          <span className="step-chip-name">{step.name}</span>
                          <span className="step-chip-approver">
                            ({step.approver_username || `User #${step.approver}`})
                          </span>
                        </div>
                      ))
                  ) : (
                    <span className="text-muted font-xs">No steps defined</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DefinitionsList;
