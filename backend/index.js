import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import TelegramBot from "node-telegram-bot-api";
import crypto from "crypto";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const app = express();

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://your-mongodb-uri", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Kullanıcı şeması
const userSchema = new mongoose.Schema({
  telegramId: String,
  username: String,
  displayName: String,
  isAdmin: Boolean,
  verificationCode: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// Oda şeması
const roomSchema = new mongoose.Schema({
  name: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isPrivate: Boolean,
  createdAt: { type: Date, default: Date.now }
});

const Room = mongoose.model("Room", roomSchema);

// Mesaj şeması
const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text: String,
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// CORS ayarları
app.use(cors({
  origin: ["https://chat-app-1-bhl9.onrender.com", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://chat-app-1-bhl9.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Telegram Bot setup
const TELEGRAM_TOKEN = "8070821143:AAG20-yS1J4hxoNB50e5eH2A3GYME3p7CXM";
const WEBHOOK_URL = "https://chat-app-bb7l.onrender.com/telegram/webhook";
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Doğrulama kodları için geçici depo
const verificationCodes = new Map();

// 6 haneli kod oluştur
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Backend çalışıyor" });
});

// Telegram doğrulama kodu endpoint'i
app.post("/api/telegram/verify", async (req, res) => {
  const { code } = req.body;
  const telegramData = verificationCodes.get(code);
  
  if (!telegramData) {
    return res.status(400).json({ error: "Geçersiz kod" });
  }

  try {
    let user = await User.findOne({ telegramId: telegramData.telegramId });
    
    if (!user) {
      user = await User.create({
        telegramId: telegramData.telegramId,
        username: telegramData.username,
        displayName: telegramData.firstName,
        isAdmin: telegramData.telegramId === "8146375647"
      });
    }

    verificationCodes.delete(code);
    res.json({ 
      success: true, 
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Kullanıcı oluşturulamadı" });
  }
});

// Webhook endpoint
app.post("/telegram/webhook", async (req, res) => {
  const update = req.body;
  
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;

    if (msg.text) {
      if (msg.text.startsWith("/start")) {
        const code = generateVerificationCode();
        verificationCodes.set(code, {
          telegramId: msg.from.id.toString(),
          username: msg.from.username,
          firstName: msg.from.first_name
        });

        await bot.sendMessage(chatId, 
          `Merhaba ${msg.from.first_name}! Sohbet uygulamasına hoş geldiniz.\n\n` +
          `Doğrulama kodunuz: ${code}\n\n` +
          `Bu kodu web sitesinde kullanarak giriş yapabilirsiniz.`
        );
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

// Socket.IO bağlantı yönetimi
io.on("connection", async (socket) => {
  let currentUser = null;

  socket.on("authenticate", async ({ userId }) => {
    try {
      const user = await User.findById(userId);
      if (user) {
        currentUser = user;
        socket.data.user = user;
        socket.emit("authenticated", {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          isAdmin: user.isAdmin
        });
      }
    } catch (error) {
      socket.emit("error", "Kimlik doğrulama hatası");
    }
  });

  socket.on("join", async ({ room }) => {
    if (!currentUser) return;

    try {
      let roomDoc = await Room.findOne({ name: room });
      
      if (!roomDoc) {
        if (!currentUser.isAdmin) {
          socket.emit("error", "Sadece adminler yeni oda oluşturabilir");
          return;
        }
        roomDoc = await Room.create({
          name: room,
          createdBy: currentUser._id
        });
      }

      socket.join(room);
      socket.data.room = room;

      const messages = await Message.find({ room: roomDoc._id })
        .populate("sender", "displayName")
        .populate("replyTo")
        .sort({ createdAt: -1 })
        .limit(50);

      socket.emit("roomHistory", messages.reverse());

      io.to(room).emit("message", {
        name: "Sistem",
        text: `${currentUser.displayName} ${currentUser.isAdmin ? "(Admin) " : ""}odaya katıldı.`
      });
    } catch (error) {
      socket.emit("error", "Oda katılım hatası");
    }
  });

  socket.on("message", async ({ room, text, replyTo }) => {
    if (!currentUser) return;

    try {
      const roomDoc = await Room.findOne({ name: room });
      if (!roomDoc) return;

      const message = await Message.create({
        room: roomDoc._id,
        sender: currentUser._id,
        text,
        replyTo
      });

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "displayName")
        .populate("replyTo");

      io.to(room).emit("message", {
        id: message._id,
        name: currentUser.displayName,
        text,
        replyTo: populatedMessage.replyTo,
        isAdmin: currentUser.isAdmin,
        timestamp: message.createdAt
      });

      // Telegram kullanıcılarına bildirim
      const telegramChats = roomTelegramChats.get(room) || new Set();
      telegramChats.forEach(chatId => {
        bot.sendMessage(chatId, 
          `${currentUser.displayName}${currentUser.isAdmin ? " (Admin)" : ""}: ${text}`
        );
      });
    } catch (error) {
      socket.emit("error", "Mesaj gönderme hatası");
    }
  });

  socket.on("privateMessage", async ({ to, text }) => {
    if (!currentUser) return;

    try {
      const recipient = await User.findById(to);
      if (!recipient) return;

      const message = {
        from: currentUser._id,
        to: recipient._id,
        text,
        timestamp: new Date()
      };

      // Alıcının socket'ini bul ve mesajı gönder
      const recipientSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.data.user?._id.toString() === to);

      if (recipientSocket) {
        recipientSocket.emit("privateMessage", {
          from: {
            id: currentUser._id,
            displayName: currentUser.displayName
          },
          text,
          timestamp: message.timestamp
        });
      }

      socket.emit("privateMessage", {
        to: {
          id: recipient._id,
          displayName: recipient.displayName
        },
        text,
        timestamp: message.timestamp
      });
    } catch (error) {
      socket.emit("error", "Özel mesaj gönderme hatası");
    }
  });

  socket.on("disconnecting", () => {
    if (currentUser && socket.data.room) {
      io.to(socket.data.room).emit("message", {
        name: "Sistem",
        text: `${currentUser.displayName} odadan ayrıldı.`
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Telegram bot webhook modunda başlatıldı");
}); 