import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('auditflow_token') || null);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('auditflow_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);

  // Validate or refresh current user on app load
  useEffect(() => {
    const fetchMe = async () => {
      if (token) {
        try {
          const res = await api.get('/me/');
          setUser(res.data);
          localStorage.setItem('auditflow_user', JSON.stringify(res.data));
        } catch (err) {
          console.error('Failed to authenticate session:', err);
          logout();
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    fetchMe();
  }, [token]);

  const login = async (username, password) => {
    // 1. Obtain DRF token
    const tokenRes = await api.post('/token/', { username, password });
    const authToken = tokenRes.data.token;
    localStorage.setItem('auditflow_token', authToken);
    setToken(authToken);

    // 2. Fetch authenticated user profile
    const meRes = await api.get('/me/', {
      headers: { Authorization: `Token ${authToken}` },
    });
    setUser(meRes.data);
    localStorage.setItem('auditflow_user', JSON.stringify(meRes.data));
    return meRes.data;
  };

  const register = async (username, password, email) => {
    const res = await api.post('/register/', { username, password, email });
    const { token: authToken, user: newUser } = res.data;
    localStorage.setItem('auditflow_token', authToken);
    localStorage.setItem('auditflow_user', JSON.stringify(newUser));
    setToken(authToken);
    setUser(newUser);
    return newUser;
  };

  const logout = () => {
    localStorage.removeItem('auditflow_token');
    localStorage.removeItem('auditflow_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isAuthenticated: !!token,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
