import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Responder from './pages/Responder';

const isExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const authed = token && !isExpired(token);

  useEffect(() => {
    if (!authed) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [authed]);

  const handleAuth = (jwt, user) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(jwt);
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={authed ? <Navigate to="/dashboard" /> : <Login onAuth={handleAuth} />} />
        <Route path="/register" element={authed ? <Navigate to="/dashboard" /> : <Register />} />
        <Route path="/dashboard" element={authed ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="/responder" element={authed ? <Responder onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={authed ? '/dashboard' : '/login'} />} />
      </Routes>
    </BrowserRouter>
  );
}