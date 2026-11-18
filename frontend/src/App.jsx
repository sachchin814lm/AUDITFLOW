import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import InstancesList from './pages/InstancesList';
import InstanceCreate from './pages/InstanceCreate';
import InstanceDetail from './pages/InstanceDetail';
import DefinitionsList from './pages/DefinitionsList';
import DefinitionCreate from './pages/DefinitionCreate';
import AuditVerification from './pages/AuditVerification';

function Layout({ children }) {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route
              path="/"
              element={
                <Layout>
                  <Dashboard />
                </Layout>
              }
            />
            <Route
              path="/instances"
              element={
                <Layout>
                  <InstancesList />
                </Layout>
              }
            />
            <Route
              path="/instances/new"
              element={
                <Layout>
                  <InstanceCreate />
                </Layout>
              }
            />
            <Route
              path="/instances/:id"
              element={
                <Layout>
                  <InstanceDetail />
                </Layout>
              }
            />
            <Route
              path="/definitions"
              element={
                <Layout>
                  <DefinitionsList />
                </Layout>
              }
            />
            <Route
              path="/definitions/new"
              element={
                <Layout>
                  <DefinitionCreate />
                </Layout>
              }
            />
            <Route
              path="/audit"
              element={
                <Layout>
                  <AuditVerification />
                </Layout>
              }
            />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
