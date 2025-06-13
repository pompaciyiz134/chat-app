import React, { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import { useSearchParams } from "react-router-dom";
import "./App.css";

const SERVER_URL = "https://chat-app-bb7l.onrender.com";

function App() {
  // URL parametreleri
  const [searchParams] = useSearchParams();

  // State tanımlamaları
  const [state, setState] = useState({
    username: "",
    message: "",
    messages: [],
    room: "genel",
    showLogin: true,
    showChat: false,
    users: [],
    isLoading: true,
    connectionError: false,
    verificationError: "",
    user: null,
    rooms: ["genel"],
    selectedUser: null,
    privateMessages: {},
    replyTo: null,
    showNewRoomModal: false,
    newRoomName: ""
  });

  // State güncelleme fonksiyonu
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Refs
  const messagesEndRef = useRef(null);
  const socketRef = useRef();

  // Backend bağlantısını kontrol et
  useEffect(() => {
    const checkBackendConnection = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/`);
        if (response.ok) {
          updateState({ isLoading: false, connectionError: false });
        } else {
          throw new Error("Backend bağlantısı başarısız");
        }
      } catch (error) {
        console.error("Backend bağlantı hatası:", error);
        updateState({ isLoading: false, connectionError: true });
      }
    };

    checkBackendConnection();
  }, [updateState]);

  // Deep link token kontrolü
  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      console.log("Deep link token bulundu:", token);
      verifyDeepLinkToken(token);
    }
  }, [searchParams]);

  // Deep link token doğrulama
  const verifyDeepLinkToken = async (token) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/telegram/deep-link?token=${token}`);
      const data = await response.json();

      if (data.success) {
        console.log("Deep link doğrulama başarılı:", data);
        updateState({
          username: data.username,
          showLogin: false,
          showChat: true,
          user: data.user
        });
        initializeSocket(data.userId);
      } else {
        console.error("Deep link doğrulama hatası:", data.message);
        updateState({ verificationError: data.message });
      }
    } catch (error) {
      console.error("Deep link doğrulama hatası:", error);
      updateState({ verificationError: "Doğrulama sırasında bir hata oluştu" });
    }
  };

  // Socket bağlantısını başlat
  const initializeSocket = (userId) => {
    const socket = io(SERVER_URL, {
      withCredentials: true,
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on("connect", () => {
      console.log("Socket.IO bağlantısı başarılı");
      socket.emit("authenticate", { userId });
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO bağlantı hatası:", error);
      updateState({ connectionError: true });
    });

    socket.on("message", (message) => {
      updateState(prev => ({
        messages: [...prev.messages, message]
      }));
      scrollToBottom();
    });

    socket.on("userList", (userList) => {
      updateState({ users: userList });
    });

    socketRef.current = socket;
  };

  // Mesajları en alta kaydır
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Mesaj gönderme
  const sendMessage = (e) => {
    e.preventDefault();
    if (!state.message.trim() || !socketRef.current) return;

    socketRef.current.emit("message", {
      room: state.room,
      text: state.message,
      user: state.username
    });

    updateState({ message: "" });
  };

  // Oda değiştirme
  const changeRoom = (newRoom) => {
    if (socketRef.current) {
      socketRef.current.emit("join", { room: newRoom });
      updateState({ room: newRoom });
    }
  };

  // Yeni oda oluşturma
  const createNewRoom = () => {
    if (!state.newRoomName.trim()) return;
    
    const newRoom = state.newRoomName.trim();
    if (!state.rooms.includes(newRoom)) {
      updateState(prev => ({
        rooms: [...prev.rooms, newRoom],
        room: newRoom,
        showNewRoomModal: false,
        newRoomName: ""
      }));
      
      if (socketRef.current) {
        socketRef.current.emit("join", { room: newRoom });
      }
    }
  };

  // Çıkış yapma
  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    updateState({
      username: "",
      message: "",
      messages: [],
      room: "genel",
      showLogin: true,
      showChat: false,
      users: [],
      user: null,
      selectedUser: null,
      privateMessages: {},
      replyTo: null
    });
  };

  // Modal kapatma
  const closeModal = () => {
    updateState({ showNewRoomModal: false, newRoomName: "" });
  };

  return (
    <div className="app-container">
      {state.isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Uygulama yükleniyor...</p>
        </div>
      ) : state.connectionError ? (
        <div className="error-container">
          <p>Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.</p>
          <button onClick={() => window.location.reload()}>Tekrar Dene</button>
        </div>
      ) : state.showLogin ? (
        <div className="login-container">
          <h2>Sohbet Uygulaması</h2>
          {state.verificationError ? (
            <div className="error-message">
              <p>{state.verificationError}</p>
              <p>Lütfen Telegram'da @klfh_bot ile konuşup /start komutunu gönderin.</p>
            </div>
          ) : (
            <>
              <p>Telegram hesabınızla giriş yapın</p>
              <p>Telegram'da @klfh_bot ile konuşup /start komutunu gönderin.</p>
              <p>Bot size özel bir link gönderecek, bu linke tıklayarak giriş yapabilirsiniz.</p>
            </>
          )}
        </div>
      ) : state.showChat ? (
        <div className="chat-container">
          <div className="rooms-container">
            <h3>Odalar</h3>
            {state.rooms.map((room) => (
              <div
                key={room}
                className={`room-item ${state.room === room ? "active" : ""}`}
                onClick={() => changeRoom(room)}
              >
                {room}
              </div>
            ))}
            {state.user?.isAdmin && (
              <button 
                className="new-room-button"
                onClick={() => updateState({ showNewRoomModal: true })}
              >
                Yeni Oda Oluştur
              </button>
            )}
            <button className="logout-button" onClick={handleLogout}>
              Çıkış Yap
            </button>
          </div>

          <div className="messages-container">
            <div className="messages-header">
              <h3>{state.room} Odası</h3>
            </div>
            <div className="messages-list">
              {state.messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.user === state.username ? "sent" : "received"}`}
                >
                  <div className="message-header">
                    {msg.user} - {new Date(msg.time).toLocaleTimeString()}
                  </div>
                  <div className="message-content">{msg.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={sendMessage}>
              <input
                type="text"
                className="message-input"
                value={state.message}
                onChange={(e) => updateState({ message: e.target.value })}
                placeholder="Mesajınızı yazın..."
              />
              <button type="submit" className="send-button">
                Gönder
              </button>
            </form>
          </div>

          <div className="users-container">
            <h3>Çevrimiçi Kullanıcılar</h3>
            {state.users.map((user) => (
              <div key={user.id} className="user-item">
                {user.username}
                {user.isAdmin && <span className="admin-badge">Admin</span>}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Yeni Oda Modalı */}
      {state.showNewRoomModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Yeni Oda Oluştur</h3>
            <input
              type="text"
              value={state.newRoomName}
              onChange={(e) => updateState({ newRoomName: e.target.value })}
              placeholder="Oda adı"
              className="modal-input"
            />
            <div className="modal-buttons">
              <button onClick={createNewRoom} className="modal-button confirm">
                Oluştur
              </button>
              <button onClick={closeModal} className="modal-button cancel">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 