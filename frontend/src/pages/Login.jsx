import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.non_field_errors?.[0] ||
                     err.response?.data?.detail ||
                     'Invalid credentials. Please verify your username and password.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (user, pass) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-logo large">
            <span className="brand-icon">🛡️</span>
            <span className="brand-title">AUDITFLOW</span>
          </div>
          <h2>Sign in to your account</h2>
          <p className="muted-text">Audit-Ready Document Approval Workflow Engine</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <span className="button-spinner"></span> : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account? <Link to="/register">Create an account</Link>
          </p>
        </div>

        <div className="demo-credentials-box">
          <div className="demo-credentials-title">Demo Accounts (Seed Data):</div>
          <div className="demo-buttons-grid">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickLogin('admin', 'admin123')}
            >
              admin (Staff)
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickLogin('alice', 'demo12345')}
            >
              alice (Step 1)
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickLogin('bob', 'demo12345')}
            >
              bob (Step 2)
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => handleQuickLogin('carol', 'demo12345')}
            >
              carol (Step 3)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
