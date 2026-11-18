import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const DefinitionCreate = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([
    { order: 1, name: 'Initial Review', approver: '' },
    { order: 2, name: 'Management Sign-Off', approver: '' },
  ]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users/');
      setUsers(res.data);
      if (res.data.length > 0) {
        // Set initial approvers if empty
        setSteps((prev) =>
          prev.map((s, idx) => ({
            ...s,
            approver: res.data[idx % res.data.length].id,
          }))
        );
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load user list.');
    } finally {
      setFetchingUsers(false);
    }
  };

  const handleAddStep = () => {
    const nextOrder = steps.length + 1;
    const defaultApprover = users.length > 0 ? users[0].id : '';
    setSteps([
      ...steps,
      { order: nextOrder, name: `Approval Step ${nextOrder}`, approver: defaultApprover },
    ]);
  };

  const handleRemoveStep = (index) => {
    if (steps.length <= 1) {
      setError('A workflow must have at least one approval step.');
      return;
    }
    const updated = steps.filter((_, idx) => idx !== index);
    // Re-index orders sequentially
    const reordered = updated.map((s, idx) => ({ ...s, order: idx + 1 }));
    setSteps(reordered);
  };

  const handleMoveStep = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const copy = [...steps];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    // Recalculate orders
    const reordered = copy.map((s, idx) => ({ ...s, order: idx + 1 }));
    setSteps(reordered);
  };

  const handleStepChange = (index, field, value) => {
    const copy = [...steps];
    copy[index][field] = value;
    setSteps(copy);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Workflow definition name is required.');
      return;
    }

    if (steps.length === 0) {
      setError('At least one step is required.');
      return;
    }

    for (const step of steps) {
      if (!step.name.trim()) {
        setError(`Step #${step.order} is missing a name.`);
        return;
      }
      if (!step.approver) {
        setError(`Step #${step.order} must have an assigned approver.`);
        return;
      }
    }

    setLoading(true);
    try {
      await api.post('/definitions/', {
        name: name.trim(),
        description: description.trim(),
        steps: steps.map((s) => ({
          order: s.order,
          name: s.name.trim(),
          approver: s.approver,
        })),
      });

      navigate('/definitions');
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Failed to create workflow definition.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  if (!user?.is_staff) {
    return (
      <div className="page-container narrow">
        <div className="alert alert-error">
          Access Denied: Only staff administrators have permission to create workflow definitions.
        </div>
        <Link to="/definitions" className="btn btn-outline">
          &larr; Back to Definitions
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Workflow Definition</h1>
          <p className="page-subtitle">
            Configure a sequential multi-step approval chain and designate approvers
          </p>
        </div>
        <Link to="/definitions" className="btn btn-outline">
          &larr; Back to Definitions
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {fetchingUsers ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading user list for approver selection...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-vertical">
            <div className="form-group">
              <label htmlFor="wf-name">Workflow Name</label>
              <input
                id="wf-name"
                type="text"
                className="form-control"
                placeholder="e.g. Capital Expenditure Authorization"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="wf-desc">Description (Optional)</label>
              <textarea
                id="wf-desc"
                className="form-control"
                rows="2"
                placeholder="Describe the governance criteria and usage of this workflow..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            {/* Sequential Steps Builder */}
            <div className="steps-builder-section">
              <div className="steps-builder-header">
                <h3>Sequential Approval Steps</h3>
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="btn btn-sm btn-outline-primary"
                >
                  + Add Step
                </button>
              </div>
              <p className="form-help">
                Approval requests will route strictly in this order. Each step requires designated approver authorization.
              </p>

              <div className="steps-builder-list">
                {steps.map((step, idx) => (
                  <div key={idx} className="step-builder-row">
                    <div className="step-builder-num">#{step.order}</div>

                    <div className="step-builder-fields">
                      <div className="form-group flex-2">
                        <label className="font-xs">Step Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="e.g. Financial Review"
                          value={step.name}
                          onChange={(e) => handleStepChange(idx, 'name', e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group flex-2">
                        <label className="font-xs">Assigned Approver</label>
                        <select
                          className="form-control form-control-sm"
                          value={step.approver}
                          onChange={(e) => handleStepChange(idx, 'approver', e.target.value)}
                          required
                        >
                          <option value="">-- Choose Approver --</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username} {u.is_staff ? '(Staff)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="step-builder-actions">
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        title="Move Up"
                        disabled={idx === 0}
                        onClick={() => handleMoveStep(idx, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        title="Move Down"
                        disabled={idx === steps.length - 1}
                        onClick={() => handleMoveStep(idx, 1)}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline-danger"
                        title="Remove Step"
                        onClick={() => handleRemoveStep(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <Link to="/definitions" className="btn btn-outline">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="button-spinner"></span> : 'Save Definition'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DefinitionCreate;
