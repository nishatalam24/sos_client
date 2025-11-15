import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5500';

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;