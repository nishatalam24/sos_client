import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function Dashboard({ onLogout }) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const [coords, setCoords] = useState(null);
  const intervalRef = useRef(null);

  const fetchLocation = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });

  const startSOS = async () => {
    try {
      const loc = await fetchLocation();
      await api.post('/api/sos/start', loc);
      setCoords(loc);
      setActive(true);
      setStatus('SOS active, updating every 5s');
      intervalRef.current = setInterval(async () => {
        try {
          const fresh = await fetchLocation();
          setCoords(fresh);
          await api.post('/api/sos/update', fresh);
        } catch (err) {
          console.error(err);
        }
      }, 5000);
    } catch (err) {
      if (err.response?.data?.expired) onLogout();
      setStatus(err.response?.data?.message || 'Unable to start SOS');
    }
  };

  const stopSOS = async () => {
    try {
      await api.post('/api/sos/stop');
      setActive(false);
      setCoords(null);
      setStatus('SOS stopped');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to stop');
    } finally {
      clearInterval(intervalRef.current);
    }
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white shadow-md rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">SOS Control</h1>
            <p className="text-slate-600">Send real-time emergency coordinates.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/responder" className="px-4 py-2 rounded-lg border border-indigo-600 text-indigo-600 font-semibold">
              Responder view
            </Link>
            <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold">
              Logout
            </button>
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {status && <p className="mb-4 text-sm text-slate-500">{status}</p>}
          {!active ? (
            <button onClick={startSOS} className="w-full py-6 rounded-2xl text-2xl font-bold text-white bg-gradient-to-r from-red-500 to-pink-500 hover:opacity-90">
              🚨 Start SOS
            </button>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-lg font-semibold text-green-600">SOS is live</p>
                {coords && (
                  <p className="text-sm text-slate-500">
                    Lat {coords.latitude.toFixed(5)} — Lng {coords.longitude.toFixed(5)}
                  </p>
                )}
              </div>
              <button onClick={stopSOS} className="w-full py-4 rounded-xl text-xl font-semibold text-white bg-green-600 hover:bg-green-700">
                Stop SOS
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}