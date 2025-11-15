import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function Login({ onAuth }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { data } = await api.post('/api/auth/login', form);
      onAuth(data.token, data.user);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-center mb-6">SOS Login</h1>
        {msg && <p className="text-red-600 mb-4 text-center">{msg}</p>}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input className="w-full border rounded-lg px-4 py-3" placeholder="Email" type="email"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="w-full border rounded-lg px-4 py-3" placeholder="Password" type="password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700">
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          No account yet? <Link className="text-indigo-600 font-semibold" to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}