import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');

  const submitForm = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post('/api/auth/register', form);
      setStep('otp');
      setMsg('OTP printed on server console. Enter it below.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Registration failed');
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post('/api/auth/verify-otp', { email: form.email, otp });
      setMsg('Verified! Redirecting…');
      setTimeout(() => nav('/login'), 1500);
    } catch (err) {
      setMsg(err.response?.data?.message || 'OTP invalid');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Create account</h1>
        {msg && <p className="text-center text-sm text-indigo-600 mb-4">{msg}</p>}
        {step === 'form' ? (
          <form className="space-y-4" onSubmit={submitForm}>
            <input className="w-full border rounded-lg px-4 py-3" placeholder="Full name"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="w-full border rounded-lg px-4 py-3" placeholder="Email" type="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input className="w-full border rounded-lg px-4 py-3" placeholder="Password" type="password"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700">
              Register
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyOtp}>
            <input className="w-full border rounded-lg px-4 py-3" placeholder="6-digit OTP"
              value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required />
            <button className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700">
              Verify OTP
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          Already verified? <Link className="text-indigo-600 font-semibold" to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}