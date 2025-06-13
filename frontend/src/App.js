import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

function App() {
  const [state, setState] = useState({
    socket: null,
    username: '',
    isConnected: false,
    isVerified: false,
    showLogin: true,
    showChat: false,
    messages: [],
    rooms: [],
    users: [],
    currentRoom: 'genel',
    messageInput: '',
    error: null,
    isLoading: true,
    showNewRoomModal: false,
    newRoomName: '',
    showPrivateChat: false,
    selectedPrivateUser: null,
    privateMessageInput: '',
    privateMessages: {},
    lastStartCommand: null,
    verificationError: null
  });

  const messagesEndRef = useRef(null);
  const privateMessagesEndRef = useRef(null);

  const scrollToBottom = (ref) => {
    ref?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      verifyToken(token);
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    if (state.isVerified && !state.socket) {
      initializeSocket();
    }
  }, [state.isVerified]);

  useEffect(() => {
    if (state.messages.length > 0) {
      scrollToBottom(messagesEndRef);
    }
  }, [state.messages]);

  useEffect(() => {
    if (state.selectedPrivateUser && state.privateMessages[state.selectedPrivateUser]) {
      scrollToBottom(privateMessagesEndRef);
    }
  }, [state.privateMessages, state.selectedPrivateUser]);

  const verifyToken = async (token) => {
    try {
      const response = await fetch(`${SOCKET_URL}/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          isVerified: true,
          username: data.username,
          isLoading: false,
          showLogin: false,
          showChat: true,
          lastStartCommand: data.lastStartCommand
        }));
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          showLogin: true,
          verificationError: data.message || 'Token doğrulama hatası'
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        showLogin: true,
        verificationError: 'Sunucu hatası'
      }));
    }
  };

  const initializeSocket = () => {
    const socket = io(SOCKET_URL, {
      query: {
        username: state.username,
        token: new URLSearchParams(window.location.search).get('token')
      }
    });

    socket.on('connect', () => {
      setState(prev => ({
        ...prev,
        isConnected: true,
        error: null
      }));
    });

    socket.on('disconnect', () => {
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Sunucu bağlantısı kesildi'
      }));
    });

    socket.on('message', (message) => {
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, message]
      }));
    });

    socket.on('private-message', ({ from, message }) => {
      setState(prev => ({
        ...prev,
        privateMessages: {
          ...prev.privateMessages,
          [from]: [...(prev.privateMessages[from] || []), message]
        }
      }));
    });

    socket.on('room-list', (rooms) => {
      setState(prev => ({
        ...prev,
        rooms: rooms
      }));
    });

    socket.on('user-list', (users) => {
      setState(prev => ({
        ...prev,
        users: users.filter(user => user.username !== prev.username)
      }));
    }));

    socket.on('error', (error) => {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
    });

    setState(prev => ({
      ...prev,
      socket
    }));

    return () => {
      socket.disconnect();
    };
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!state.messageInput.trim() || !state.socket) return;

    const message = {
      room: state.currentRoom,
      content: state.messageInput,
      username: state.username,
      timestamp: new Date().toISOString()
    };

    state.socket.emit('message', message);
    setState(prev => ({
      ...prev,
      messageInput: '',
      messages: [...prev.messages, { ...message, isOwn: true }]
    }));
  };

  const handleSendPrivateMessage = (e) => {
    e.preventDefault();
    if (!state.privateMessageInput.trim() || !state.socket || !state.selectedPrivateUser) return;

    const message = {
      content: state.privateMessageInput,
      from: state.username,
      to: state.selectedPrivateUser,
      timestamp: new Date().toISOString()
    };

    state.socket.emit('private-message', message);
    setState(prev => ({
      ...prev,
      privateMessageInput: '',
      privateMessages: {
        ...prev.privateMessages,
        [state.selectedPrivateUser]: [
          ...(prev.privateMessages[state.selectedPrivateUser] || []),
          { ...message, isOwn: true }
        ]
      }
    }));
  };

  const handleRoomChange = (room) => {
    if (state.socket) {
      state.socket.emit('leave-room', state.currentRoom);
      state.socket.emit('join-room', room);
      setState(prev => ({
        ...prev,
        currentRoom: room,
        messages: []
      }));
    }
  };

  const handleStartPrivateChat = (username) => {
    setState(prev => ({
      ...prev,
      showPrivateChat: true,
      selectedPrivateUser: username,
      privateMessages: {
        ...prev.privateMessages,
        [username]: prev.privateMessages[username] || []
      }
    }));
  };

  const handleClosePrivateChat = () => {
    setState(prev => ({
      ...prev,
      showPrivateChat: false,
      selectedPrivateUser: null
    }));
  };

  const handleCreateRoom = () => {
    if (!state.newRoomName.trim() || !state.socket) return;

    state.socket.emit('create-room', state.newRoomName);
    setState(prev => ({
      ...prev,
      showNewRoomModal: false,
      newRoomName: ''
    }));
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (state.isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="error-screen">
        <h2>Hata</h2>
        <p>{state.error}</p>
        <button onClick={() => window.location.reload()}>Yeniden Dene</button>
      </div>
    );
  }

  if (state.showLogin) {
    return (
      <div className="login-screen">
        <div className="login-content">
          <h1>Telegram Chat</h1>
          {state.verificationError ? (
            <div className="error-message">
              <p>{state.verificationError}</p>
              <p>Lütfen Telegram botunuza gidip /start komutunu gönderin.</p>
            </div>
          ) : (
            <>
              <p>Giriş yapmak için Telegram botunuza gidip /start komutunu gönderin.</p>
              <p>Bot size özel bir link gönderecektir.</p>
            </>
          )}
          {state.lastStartCommand && (
            <p className="last-command-info">
              Son /start komutu: {new Date(state.lastStartCommand).toLocaleString('tr-TR')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="user-info">
          <h3>{state.username}</h3>
          <button className="logout-button" onClick={() => window.location.reload()}>
            Çıkış Yap
          </button>
        </div>

        <div className="rooms-section">
          <h4>Sohbet Odaları</h4>
          <button className="new-room-button" onClick={() => setState(prev => ({ ...prev, showNewRoomModal: true }))}>
            Yeni Oda Oluştur
          </button>
          <ul className="room-list">
            {state.rooms.map(room => (
              <li key={room}>
                <button
                  className={state.currentRoom === room ? 'active-room' : ''}
                  onClick={() => handleRoomChange(room)}
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
              <li key={user.username}>
                <button onClick={() => handleStartPrivateChat(user.username)}>
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
              <h3>{state.selectedPrivateUser}</h3>
              <button className="close-button" onClick={handleClosePrivateChat}>×</button>
            </div>
            <div className="private-messages">
              {state.privateMessages[state.selectedPrivateUser]?.map((message, index) => (
                <div
                  key={index}
                  className={`message ${message.isOwn ? 'sent' : 'received'}`}
                >
                  <div className="message-header">
                    <span className="message-user">{message.from}</span>
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                  <div className="message-content">{message.content}</div>
                </div>
              ))}
              <div ref={privateMessagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendPrivateMessage}>
              <input
                type="text"
                value={state.privateMessageInput}
                onChange={(e) => setState(prev => ({ ...prev, privateMessageInput: e.target.value }))}
                placeholder="Özel mesajınızı yazın..."
              />
              <button type="submit">Gönder</button>
            </form>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <h2>{state.currentRoom}</h2>
            </div>
            <div className="messages">
              {state.messages.map((message, index) => (
                <div
                  key={index}
                  className={`message ${message.isOwn ? 'sent' : 'received'}`}
                >
                  <div className="message-header">
                    <span className="message-user">{message.username}</span>
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                  <div className="message-content">{message.content}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={state.messageInput}
                onChange={(e) => setState(prev => ({ ...prev, messageInput: e.target.value }))}
                placeholder="Mesajınızı yazın..."
              />
              <button type="submit">Gönder</button>
            </form>
          </>
        )}
      </div>

      {state.showNewRoomModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Yeni Oda Oluştur</h3>
            <input
              type="text"
              value={state.newRoomName}
              onChange={(e) => setState(prev => ({ ...prev, newRoomName: e.target.value }))}
              placeholder="Oda adı"
            />
            <div className="modal-buttons">
              <button onClick={handleCreateRoom}>Oluştur</button>
              <button onClick={() => setState(prev => ({ ...prev, showNewRoomModal: false }))}>
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