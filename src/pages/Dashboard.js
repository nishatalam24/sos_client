import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';

export default function Dashboard({ onLogout }) {
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5500';

  const [emergencyId, setEmergencyId] = useState(() => localStorage.getItem('sosEmergencyId'));
  const [active, setActive] = useState(() => Boolean(localStorage.getItem('sosEmergencyId')));
  const [status, setStatus] = useState('');
  const [coords, setCoords] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const socket = useMemo(
    () =>
      io(API_BASE, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        reconnectionAttempts: 3
      }),
    [API_BASE]
  );

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const intervalRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchLocation = useCallback(
    () =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true }
        );
      }),
    []
  );

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const safeEnsureLocalStream = useCallback(async () => {
    try {
      await ensureLocalStream();
      return true;
    } catch (error) {
      console.warn('Media blocked, fallback to coordinates only.', error);
      setStatus('Camera blocked; sharing only coordinates.');
      return false;
    }
  }, [ensureLocalStream]);

  const createPeerConnection = useCallback(
    (peerId) => {
      try {
        const pc = new RTCPeerConnection();
        peersRef.current[peerId] = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('signal', { target: peerId, candidate: event.candidate });
          }
        };

        pc.ontrack = (event) => {
          setRemoteStreams((prev) => {
            if (prev.find((p) => p.peerId === peerId)) return prev;
            return [...prev, { peerId, stream: event.streams[0] }];
          });
        };

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
        }
        return pc;
      } catch (err) {
        console.warn('Peer connection failed, continuing without video.', err);
        setStatus('Video link unavailable; coordinates still sending.');
        return null;
      }
    },
    [socket]
  );

  const beginLocationLoop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const fresh = await fetchLocation();
        setCoords(fresh);
        await api.post('/api/sos/update', fresh);
      } catch (err) {
        console.error('Location update failed', err);
      }
    }, 5000);
  }, [fetchLocation]);

  const startSOS = async () => {
    try {
      const loc = await fetchLocation();
      const { data } = await api.post('/api/sos/start', loc);
      setEmergencyId(data.emergencyId);
      localStorage.setItem('sosEmergencyId', data.emergencyId);
      setCoords(loc);
      setActive(true);
      setStatus('SOS active, updating every 5s');

      await safeEnsureLocalStream();
      beginLocationLoop();
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
      if (emergencyId) socket.emit('leave-room', { roomId: emergencyId });
      setEmergencyId(null);
      localStorage.removeItem('sosEmergencyId');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to stop');
    } finally {
      clearInterval(intervalRef.current);
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
      setRemoteStreams([]);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    }
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  useEffect(() => {
    if (!emergencyId) return;
    setActive(true);
    setStatus('Reconnected to existing SOS session');
    beginLocationLoop();

    fetchLocation()
      .then(async (loc) => {
        setCoords(loc);
        await api.post('/api/sos/update', loc);
      })
      .catch((err) => console.error('Restore location failed', err));
  }, [beginLocationLoop, emergencyId, fetchLocation]);

  useEffect(() => {
    if (!emergencyId) return;

    socket.emit('join-room', { roomId: emergencyId, user });

    const handlePeerJoined = async ({ socketId }) => {
      const allowed = await safeEnsureLocalStream();
      if (!allowed) return;
      const pc = createPeerConnection(socketId);
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { target: socketId, description: offer });
    };

    const handleSignal = async ({ from, description, candidate }) => {
      const ensurePeer = () => peersRef.current[from] || createPeerConnection(from);
      if (description) {
        const pc = ensurePeer();
        if (!pc) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { target: from, description: answer });
        }
      }
      if (candidate) {
        const pc = ensurePeer();
        if (!pc) return;
        await pc.addIceCandidate(candidate);
      }
    };

    const handlePeerLeft = ({ socketId }) => {
      const pc = peersRef.current[socketId];
      if (pc) pc.close();
      delete peersRef.current[socketId];
      setRemoteStreams((prev) => prev.filter((p) => p.peerId !== socketId));
    };

    const handleChat = (payload) => setMessages((prev) => [...prev, payload]);

    socket.on('peer-joined', handlePeerJoined);
    socket.on('signal', handleSignal);
    socket.on('peer-left', handlePeerLeft);
    socket.on('chat-message', handleChat);

    return () => {
      socket.off('peer-joined', handlePeerJoined);
      socket.off('signal', handleSignal);
      socket.off('peer-left', handlePeerLeft);
      socket.off('chat-message', handleChat);
    };
  }, [createPeerConnection, emergencyId, safeEnsureLocalStream, socket, user]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !emergencyId) return;
    socket.emit('chat-message', { roomId: emergencyId, message: chatInput.trim() });
    setChatInput('');
  };

  return (
    <div className="min-h-screen px-4 py-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black h-64 object-cover" />
        <div className="grid gap-4">
          {remoteStreams.length === 0 && (
            <div className="rounded-xl bg-slate-900 text-white h-64 flex items-center justify-center">
              Waiting for responders… (coordinates still active)
            </div>
          )}
          {remoteStreams.map((remote) => (
            <video
              key={remote.peerId}
              autoPlay
              playsInline
              className="w-full rounded-xl bg-black h-64 object-cover"
              ref={(node) => {
                if (node && remote.stream) node.srcObject = remote.stream;
              }}
            />
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white shadow-md rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">SOS Control</h1>
            <p className="text-slate-600">Send live location, video, and chat.</p>
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
          {active ? (
            <>
              <div className="mb-6">
                <p className="text-lg font-semibold text-green-600">SOS is live</p>
                {coords && (
                  <p className="text-sm text-slate-500">
                    Lat {coords.latitude?.toFixed(5)} — Lng {coords.longitude?.toFixed(5)}
                  </p>
                )}
              </div>
              <button onClick={stopSOS} className="w-full py-4 rounded-xl text-xl font-semibold text-white bg-green-600 hover:bg-green-700">
                Stop SOS
              </button>
            </>
          ) : (
            <button onClick={startSOS} className="w-full py-6 rounded-2xl text-2xl font-bold text-white bg-gradient-to-r from-red-500 to-pink-500 hover:opacity-90">
              🚨 Start SOS
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Room chat</h2>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full">
              {messages.length} messages
            </span>
          </div>
          <div className="h-64 overflow-y-auto border rounded-2xl p-4 space-y-3 bg-slate-50">
            {messages.length === 0 && <p className="text-sm text-slate-400 text-center">No messages yet.</p>}
            {messages.map((msg, idx) => {
              const mine = msg.from?.email === user?.email;
              return (
                <div key={`${msg.timestamp}-${idx}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow ${mine ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800'}`}>
                    <p className="text-[11px] opacity-70 mb-1">
                      {msg.from?.name || 'User'} · {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                    <p>{msg.text}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="mt-4 flex gap-3">
            <input
              className="flex-1 border rounded-2xl px-4 py-3 bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Type message…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button className="px-6 py-3 rounded-2xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}