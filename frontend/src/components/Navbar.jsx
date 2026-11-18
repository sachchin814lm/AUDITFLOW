import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand-group">
          <Link to="/" className="brand-logo">
            <span className="brand-icon">🛡️</span>
            <span className="brand-title">AUDITFLOW</span>
          </Link>
          <span className="brand-tag">Audit-Ready Engine</span>
        </div>

        <nav className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Dashboard
          </NavLink>
          <NavLink to="/instances" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Documents
          </NavLink>
          <NavLink to="/instances/new" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            + New Document
          </NavLink>
          <NavLink to="/definitions" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Definitions
          </NavLink>
          <NavLink to="/audit" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Chain Audit
          </NavLink>
        </nav>

        <div className="navbar-user-group">
          {user && (
            <div className="user-pill">
              <span className="user-icon">👤</span>
              <span className="username">{user.username}</span>
              {user.is_staff && <span className="badge badge-staff">Staff</span>}
            </div>
          )}
          <button onClick={handleLogout} className="btn btn-outline-danger btn-sm">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
