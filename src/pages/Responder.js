import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';
import EmergencyMap from '../components/EmergencyMap';

export default function Responder({ onLogout }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
//  const socket = useMemo(() => io(API_BASE), []);
const socket = useMemo(() => io("http://92.5.79.20:9000", {
  transports: ["websocket", "polling"],
  upgrade: true
}), []);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
const messagesEndRef = useRef(null);
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5500';


useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

  const loadEmergencies = useCallback(async () => {
    try {
      const { data } = await api.get('/api/sos/active');
      setItems(data);
      if (data.length) {
        setSelected((prev) => (prev && data.find((x) => x._id === prev._id) ? prev : data[0]));
      } else {
        setSelected(null);
      }
    } catch (err) {
      if (err.response?.data?.expired) onLogout();
    }
  }, [onLogout]);

  useEffect(() => {
    loadEmergencies();
    const interval = setInterval(loadEmergencies, 5000);
    return () => clearInterval(interval);
  }, [loadEmergencies]);

  const ensureLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId) => {
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
    },
    [socket]
  );

  useEffect(() => {
    if (!roomId) return;

    socket.emit('join-room', { roomId, user });

    const handlePeerJoined = async ({ socketId }) => {
      await ensureLocalStream();
      const pc = createPeerConnection(socketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { target: socketId, description: offer });
    };

    const handleSignal = async ({ from, description, candidate }) => {
      if (description) {
        const pc = peersRef.current[from] || createPeerConnection(from);
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { target: from, description: answer });
        }
      }
      if (candidate) {
        const pc = peersRef.current[from] || createPeerConnection(from);
        await pc.addIceCandidate(candidate);
      }
    };

    const handlePeerLeft = ({ socketId }) => {
      const pc = peersRef.current[socketId];
      if (pc) pc.close();
      delete peersRef.current[socketId];
      setRemoteStreams((prev) => prev.filter((p) => p.peerId !== socketId));
    };

    const handleChat = (payload) => {
      setMessages((prev) => [...prev, payload]);
    };

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
  }, [createPeerConnection, ensureLocalStream, roomId, socket, user]);

  const handleJoinCall = async (emergency) => {
    setRoomId(emergency._id);
    setMessages([]);
    await ensureLocalStream();
  };

  const cleanupCall = () => {
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    setRemoteStreams([]);
    if (roomId) socket.emit('leave-room', { roomId });
    setRoomId(null);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => () => cleanupCall(), []);

const sendMessage = (e) => {
  e.preventDefault();
  if (!chatInput.trim() || !roomId) return;
  socket.emit('chat-message', { roomId, message: chatInput.trim() });
  setChatInput('');
};


  return (
    <div className="min-h-screen px-4 py-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white shadow-md rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">Responder Dashboard</h1>
            <p className="text-slate-600">Join video + chat to assist.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/dashboard" className="px-4 py-2 rounded-lg border border-indigo-600 text-indigo-600 font-semibold">
              Back
            </Link>
            <button
              onClick={() => {
                cleanupCall();
                onLogout();
              }}
              className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold"
            >
              Logout
            </button>
          </div>
        </header>

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
                  <div key={item._id} className={`px-5 py-4 ${isActive ? 'bg-indigo-50' : ''}`}>
                    <button onClick={() => setSelected(item)} className="w-full text-left">
                      <p className="font-semibold flex items-center gap-2">
                        <span className="text-red-500">●</span> {item.name}
                      </p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                      <p className="text-xs text-slate-400">
                        Updated {new Date(item.updatedAt).toLocaleTimeString()}
                      </p>
                    </button>
                    <button
                      onClick={() => handleJoinCall(item)}
                      className="mt-3 text-sm text-white bg-indigo-600 px-3 py-2 rounded-lg w-full"
                    >
                      Join call
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-3 space-y-4">
              <div className="h-[300px] bg-white rounded-2xl shadow-xl overflow-hidden">
                <EmergencyMap position={selected ? { lat: selected.latitude, lng: selected.longitude } : null} label={selected?.name} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black h-64 object-cover" />
                <div className="grid gap-4">
                  {remoteStreams.length === 0 && (
                    <div className="rounded-xl bg-slate-900 text-white h-64 flex items-center justify-center">Waiting for video…</div>
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

             <div className="bg-white rounded-2xl shadow-xl p-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold">Room chat</h2>
    <span className="text-xs bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full">
      {messages.length} messages
    </span>
  </div>
  <div className="h-48 overflow-y-auto border rounded-2xl p-4 space-y-3 bg-slate-50">
    {messages.length === 0 && <p className="text-sm text-slate-400 text-center">No messages yet.</p>}
    {messages.map((msg, idx) => {
      const mine = msg.from?.email === user?.email;
      return (
        <div  ref={messagesEndRef} key={`${msg.timestamp}-${idx}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow ${mine ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800'}`}>
            <p className="text-[11px] opacity-70 mb-1">
              {msg.from?.name || 'User'} · {new Date(msg.timestamp).toLocaleTimeString()}
            </p>
            <p>{msg.text}</p>
          </div>
        </div>
      );
    })}
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
        )}
      </div>
    </div>
  );
}