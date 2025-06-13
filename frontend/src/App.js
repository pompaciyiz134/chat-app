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
    newRoomName: "",
    showPrivateChat: false,
    selectedPrivateUser: null,
    privateMessageInput: ""
  });

  // State güncelleme fonksiyonu
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Refs
  const messagesEndRef = useRef(null);
  const socketRef = useRef();
  const privateMessagesEndRef = useRef(null);

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

    socket.on("privateMessage", (message) => {
      updateState(prev => ({
        privateMessages: {
          ...prev.privateMessages,
          [message.from]: [...(prev.privateMessages[message.from] || []), message]
        }
      }));
      scrollPrivateToBottom();
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

  const scrollPrivateToBottom = () => {
    privateMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Özel mesaj gönderme
  const sendPrivateMessage = (e) => {
    e.preventDefault();
    if (!state.privateMessageInput.trim() || !socketRef.current || !state.selectedPrivateUser) return;

    socketRef.current.emit("privateMessage", {
      to: state.selectedPrivateUser.id,
      text: state.privateMessageInput
    });

    updateState({ privateMessageInput: "" });
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

  // Özel sohbet başlatma
  const startPrivateChat = (user) => {
    updateState({
      showPrivateChat: true,
      selectedPrivateUser: user
    });
  };

  // Özel sohbeti kapatma
  const closePrivateChat = () => {
    updateState({
      showPrivateChat: false,
      selectedPrivateUser: null,
      privateMessageInput: ""
    });
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
      replyTo: null,
      showPrivateChat: false,
      selectedPrivateUser: null,
      privateMessageInput: ""
    });
  };

  // Modal kapatma
  const closeModal = () => {
    updateState({ showNewRoomModal: false, newRoomName: "" });
  };

  return (
    <div className="app-container">
      {state.isLoading ? (
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Bağlanıyor...</p>
        </div>
      ) : state.connectionError ? (
        <div className="error-screen">
          <h2>Bağlantı Hatası</h2>
          <p>Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.</p>
          <button onClick={() => window.location.reload()}>Yeniden Dene</button>
        </div>
      ) : state.showLogin ? (
        <div className="login-screen">
          {state.verificationError ? (
            <div className="error-message">
              <h2>Doğrulama Hatası</h2>
              <p>{state.verificationError}</p>
              <p>Lütfen Telegram botuna gidip /start komutunu tekrar gönderin.</p>
              <a href="https://t.me/klfh_bot" target="_blank" rel="noopener noreferrer" className="telegram-button">
                Telegram Botuna Git
              </a>
            </div>
          ) : (
            <div className="login-content">
              <h1>Sohbet Uygulaması</h1>
              <p>Giriş yapmak için Telegram botunu kullanın.</p>
              <a href="https://t.me/klfh_bot" target="_blank" rel="noopener noreferrer" className="telegram-button">
                Telegram ile Giriş Yap
              </a>
            </div>
          )}
        </div>
      ) : state.showChat ? (
        <div className="chat-container">
          <div className="chat-sidebar">
            <div className="user-info">
              <h3>Hoş geldin, {state.username}!</h3>
              <button onClick={handleLogout} className="logout-button">Çıkış Yap</button>
            </div>
            
            <div className="rooms-section">
              <h4>Odalar</h4>
              <button onClick={() => updateState({ showNewRoomModal: true })} className="new-room-button">
                Yeni Oda Oluştur
              </button>
              <ul className="room-list">
                {state.rooms.map(room => (
                  <li key={room}>
                    <button
                      onClick={() => changeRoom(room)}
                      className={state.room === room ? "active-room" : ""}
                    >
                      {room}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="users-section">
              <h4>Çevrimiçi Kullanıcılar</h4>
              <ul className="user-list">
                {state.users.map(user => (
                  <li key={user.id}>
                    <button
                      onClick={() => startPrivateChat(user)}
                      className={state.selectedPrivateUser?.id === user.id ? "active-user" : ""}
                    >
                      {user.username}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="chat-main">
            {state.showPrivateChat ? (
              <div className="private-chat">
                <div className="private-chat-header">
                  <h3>{state.selectedPrivateUser?.username} ile özel sohbet</h3>
                  <button onClick={closePrivateChat} className="close-button">✕</button>
                </div>
                <div className="private-messages">
                  {(state.privateMessages[state.selectedPrivateUser?.id] || []).map((msg, index) => (
                    <div key={index} className={`message ${msg.from === state.user?.id ? "sent" : "received"}`}>
                      <div className="message-content">{msg.text}</div>
                      <div className="message-time">{new Date(msg.time).toLocaleTimeString()}</div>
                    </div>
                  ))}
                  <div ref={privateMessagesEndRef} />
                </div>
                <form onSubmit={sendPrivateMessage} className="message-form">
                  <input
                    type="text"
                    value={state.privateMessageInput}
                    onChange={(e) => updateState({ privateMessageInput: e.target.value })}
                    placeholder="Mesajınızı yazın..."
                  />
                  <button type="submit">Gönder</button>
                </form>
              </div>
            ) : (
              <>
                <div className="chat-header">
                  <h2>{state.room} Odası</h2>
                </div>
                <div className="messages">
                  {state.messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.user === state.username ? "sent" : "received"}`}>
                      <div className="message-header">
                        <span className="message-user">{msg.user}</span>
                        <span className="message-time">{new Date(msg.time).toLocaleTimeString()}</span>
                      </div>
                      <div className="message-content">{msg.text}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="message-form">
                  <input
                    type="text"
                    value={state.message}
                    onChange={(e) => updateState({ message: e.target.value })}
                    placeholder="Mesajınızı yazın..."
                  />
                  <button type="submit">Gönder</button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      {state.showNewRoomModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Yeni Oda Oluştur</h3>
            <input
              type="text"
              value={state.newRoomName}
              onChange={(e) => updateState({ newRoomName: e.target.value })}
              placeholder="Oda adı"
            />
            <div className="modal-buttons">
              <button onClick={createNewRoom}>Oluştur</button>
              <button onClick={closeModal}>İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 