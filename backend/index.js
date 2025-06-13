import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import TelegramBot from "node-telegram-bot-api";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Telegram Bot setup
const TELEGRAM_TOKEN = "8070821143:AAG20-yS1J4hxoNB50e5eH2A3GYME3p7CXM";
// Render.com otomatik olarak bir URL sağlayacak
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL 
  ? `${process.env.RENDER_EXTERNAL_URL}/telegram/webhook`
  : "https://your-app-name.onrender.com/telegram/webhook"; // Render.com'da oluşturduğunuz uygulamanın adını buraya yazın

const bot = new TelegramBot(TELEGRAM_TOKEN);

// Webhook güvenliği için secret token
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');

// Store active users in each room
const roomUsers = new Map();
// Store Telegram chat IDs for each room
const roomTelegramChats = new Map();

// Webhook endpoint
app.post("/telegram/webhook", (req, res) => {
  const update = req.body;
  
  // Mesaj kontrolü
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;

    // Komut işleme
    if (msg.text) {
      if (msg.text.startsWith("/start")) {
        bot.sendMessage(chatId, "Merhaba! Sohbet uygulamasına hoş geldiniz. Kullanılabilir komutlar:\n/rooms - Mevcut odaları listele\n/join <oda_adı> - Bir odaya katıl");
      }
      else if (msg.text.startsWith("/rooms")) {
        const roomsList = Array.from(roomUsers.keys()).join("\n");
        bot.sendMessage(chatId, `Mevcut odalar:\n${roomsList || "Henüz oda yok"}`);
      }
      else if (msg.text.startsWith("/join ")) {
        const roomName = msg.text.split(" ")[1].trim();
        
        // Add chat to room's Telegram chats
        const chats = roomTelegramChats.get(roomName) || new Set();
        chats.add(chatId);
        roomTelegramChats.set(roomName, chats);
        
        bot.sendMessage(chatId, `${roomName} odasına katıldınız! Artık bu odadaki mesajları görebileceksiniz.`);
        
        // Notify web users
        io.to(roomName).emit("message", { 
          name: "Sistem", 
          text: `Telegram kullanıcısı ${msg.from.first_name} odaya katıldı.` 
        });
      }
      else {
        // Normal mesaj işleme
        for (const [room, chats] of roomTelegramChats.entries()) {
          if (chats.has(chatId)) {
            io.to(room).emit("message", {
              name: `Telegram: ${msg.from.first_name}`,
              text: msg.text
            });
            break;
          }
        }
      }
    }
  }
  
  res.sendStatus(200);
});

// Webhook'u ayarla
const setupWebhook = async () => {
  try {
    await bot.setWebHook(WEBHOOK_URL, {
      max_connections: 40,
      allowed_updates: ["message"]
    });
    console.log("Telegram webhook başarıyla ayarlandı:", WEBHOOK_URL);
  } catch (error) {
    console.error("Webhook ayarlanırken hata:", error);
  }
};

// Sunucu başladığında webhook'u ayarla
setupWebhook();

io.on("connection", (socket) => {
  socket.on("join", ({ room, name }) => {
    // Leave previous room if any
    if (socket.data.room) {
      const prevRoom = socket.data.room;
      const users = roomUsers.get(prevRoom) || new Set();
      users.delete(socket.id);
      if (users.size === 0) {
        roomUsers.delete(prevRoom);
      } else {
        roomUsers.set(prevRoom, users);
      }
      io.to(prevRoom).emit("userList", Array.from(users).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean));
    }

    // Join new room
    socket.join(room);
    socket.data.name = name;
    socket.data.room = room;
    
    // Add user to room's user list
    const users = roomUsers.get(room) || new Set();
    users.add(socket.id);
    roomUsers.set(room, users);
    
    // Send updated user list to room
    io.to(room).emit("userList", Array.from(users).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean));
    io.to(room).emit("message", { name: "Sistem", text: `${name} odaya katıldı.` });

    // Notify Telegram users
    const telegramChats = roomTelegramChats.get(room) || new Set();
    telegramChats.forEach(chatId => {
      bot.sendMessage(chatId, `${name} odaya katıldı.`);
    });
  });

  socket.on("message", ({ room, name, text }) => {
    io.to(room).emit("message", { name, text });

    // Forward message to Telegram users
    const telegramChats = roomTelegramChats.get(room) || new Set();
    telegramChats.forEach(chatId => {
      bot.sendMessage(chatId, `${name}: ${text}`);
    });
  });

  socket.on("disconnecting", () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (room && name) {
      const users = roomUsers.get(room);
      if (users) {
        users.delete(socket.id);
        if (users.size === 0) {
          roomUsers.delete(room);
        } else {
          roomUsers.set(room, users);
          io.to(room).emit("userList", Array.from(users).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean));
        }
      }
      io.to(room).emit("message", { name: "Sistem", text: `${name} odadan ayrıldı.` });

      // Notify Telegram users
      const telegramChats = roomTelegramChats.get(room) || new Set();
      telegramChats.forEach(chatId => {
        bot.sendMessage(chatId, `${name} odadan ayrıldı.`);
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Telegram bot webhook modunda başlatıldı");
}); 