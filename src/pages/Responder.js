import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import api from '../api';
import EmergencyMap from '../components/EmergencyMap';

export default function Responder({ onLogout }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const loadEmergencies = async () => {
    try {
      const { data } = await api.get('/api/sos/active');
      setItems(data);
    } catch (err) {
      if (err.response?.data?.expired) onLogout();
    }
  };

  useEffect(() => {
    loadEmergencies();
    const interval = setInterval(loadEmergencies, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* header stays the same */}
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
            <p className="text-2xl font-semibold text-green-600">No active emergencies 🎉</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl divide-y">
              {items.map((item) => {
                const isActive = selected?._id === item._id;
                return (
                  <button
                    key={item._id}
                    onClick={() => setSelected(item)}
                    className={`w-full text-left px-5 py-4 hover:bg-indigo-50 ${isActive ? 'bg-indigo-100' : ''}`}
                  >
                    <p className="font-semibold flex items-center gap-2">
                      <span className="text-red-500">●</span> {item.name}
                    </p>
                    <p className="text-xs text-slate-500">{item.email}</p>
                    <p className="text-xs text-slate-400">
                      Updated {new Date(item.updatedAt).toLocaleTimeString()}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-3 h-[480px] bg-white rounded-2xl shadow-xl overflow-hidden">
              <EmergencyMap
                position={
                  selected
                    ? { lat: selected.latitude, lng: selected.longitude }
                    : null
                }
                label={selected?.name}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}