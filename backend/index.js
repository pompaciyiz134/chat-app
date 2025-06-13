import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import TelegramBot from "node-telegram-bot-api";
import crypto from "crypto";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 5000;
const app = express();

// MongoDB bağlantısı - deprecated seçenekleri kaldırdık
mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://your-mongodb-uri")
  .then(() => console.log("MongoDB bağlantısı başarılı"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

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

// Telegram bot token ve webhook URL
const TELEGRAM_TOKEN = "8070821143:AAG20-yS1J4hxoNB50e5eH2A3GYME3p7CXM";
const WEBHOOK_URL = "https://chat-app-bb7l.onrender.com/telegram/webhook";
const BOT_USERNAME = "klfh_bot";
const FRONTEND_URL = "https://chat-app-1-bhl9.onrender.com";

// Telegram bot oluştur
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Deep link token'ları için geçici depo (gerçek uygulamada Redis kullanılabilir)
const deepLinkTokens = new Map();

// Deep link token oluştur
const generateDeepLinkToken = () => {
  const token = uuidv4();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 dakika geçerli
  return { token, expiresAt };
};

// Telegram Login Widget doğrulama
const verifyTelegramLogin = (authData) => {
  const { hash, ...userData } = authData;
  const dataCheckString = Object.keys(userData)
    .sort()
    .map(k => `${k}=${userData[k]}`)
    .join('\n');
  
  const secretKey = crypto.createHash('sha256')
    .update(TELEGRAM_TOKEN)
    .digest();
  
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return calculatedHash === hash;
};

// Telegram Login Widget doğrulama endpoint'i
app.post("/api/telegram/verify", async (req, res) => {
  try {
    const authData = req.body;
    console.log("Telegram auth verisi:", authData);

    if (!verifyTelegramLogin(authData)) {
      console.log("Telegram doğrulama başarısız - hash eşleşmiyor");
      return res.json({ success: false, message: "Geçersiz doğrulama" });
    }

    // Kullanıcıyı veritabanında ara veya oluştur
    let user = await User.findOne({ telegramId: authData.id.toString() });
    
    if (!user) {
      console.log("Yeni kullanıcı oluşturuluyor:", authData.id);
      user = new User({
        telegramId: authData.id.toString(),
        username: authData.username || `user_${authData.id}`,
        firstName: authData.first_name,
        photoUrl: authData.photo_url,
        isVerified: true
      });
    } else {
      console.log("Mevcut kullanıcı güncelleniyor:", authData.id);
      user.username = authData.username || user.username;
      user.firstName = authData.first_name;
      user.photoUrl = authData.photo_url;
      user.isVerified = true;
    }

    await user.save();
    console.log("Kullanıcı kaydedildi:", {
      telegramId: user.telegramId,
      username: user.username,
      isVerified: user.isVerified
    });

    res.json({
      success: true,
      username: user.username,
      userId: user._id
    });
  } catch (error) {
    console.error("Telegram doğrulama hatası:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Test endpoint'i
app.get("/api/telegram/test", async (req, res) => {
  try {
    const botInfo = await bot.getMe();
    const webhookInfo = await bot.getWebhookInfo();
    
    res.json({
      botInfo,
      webhookInfo,
      webhookUrl: WEBHOOK_URL,
      message: "Telegram bot ayarları başarılı"
    });
  } catch (error) {
    console.error("Test endpoint hatası:", error);
    res.status(500).json({
      error: "Telegram bot testi başarısız",
      details: error.message
    });
  }
});

// Webhook'u ayarla
const setupWebhook = async () => {
  try {
    // Önce mevcut webhook'u kaldır
    await bot.deleteWebHook();
    console.log("Mevcut webhook kaldırıldı");

    // Yeni webhook'u ayarla
    const result = await bot.setWebHook(WEBHOOK_URL, {
      max_connections: 40,
      allowed_updates: ["message"],
      drop_pending_updates: true // Bekleyen güncellemeleri temizle
    });
    console.log("Webhook ayarlama sonucu:", result);

    // Webhook bilgilerini kontrol et
    const webhookInfo = await bot.getWebHookInfo();
    console.log("Webhook durumu:", webhookInfo);
  } catch (error) {
    console.error("Webhook ayarlanırken hata:", error);
  }
};

// Sunucuyu başlat
const startServer = async () => {
  try {
    // Önce webhook'u ayarla
    await setupWebhook();
    
    // Sonra Express sunucusunu başlat
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Telegram bot webhook modunda başlatıldı");
    });
  } catch (error) {
    console.error("Server başlatma hatası:", error);
    process.exit(1);
  }
};

startServer();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Backend çalışıyor" });
});

// Deep link endpoint'i
app.get("/api/telegram/deep-link", async (req, res) => {
  try {
    const { token } = req.query;
    console.log("Deep link token kontrolü:", token);

    if (!token || !deepLinkTokens.has(token)) {
      return res.status(400).json({ 
        success: false, 
        message: "Geçersiz veya süresi dolmuş token" 
      });
    }

    const tokenData = deepLinkTokens.get(token);
    if (Date.now() > tokenData.expiresAt) {
      deepLinkTokens.delete(token);
      return res.status(400).json({ 
        success: false, 
        message: "Token süresi dolmuş" 
      });
    }

    const user = await User.findOne({ telegramId: tokenData.telegramId });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Kullanıcı bulunamadı" 
      });
    }

    // Token'ı kullanıldığı için sil
    deepLinkTokens.delete(token);

    res.json({
      success: true,
      username: user.username,
      userId: user._id
    });
  } catch (error) {
    console.error("Deep link doğrulama hatası:", error);
    res.status(500).json({ 
      success: false, 
      message: "Sunucu hatası" 
    });
  }
});

// Telegram webhook endpoint
app.post("/telegram/webhook", async (req, res) => {
  try {
    console.log("Telegram webhook'a istek geldi:", JSON.stringify(req.body, null, 2));
    const { message } = req.body;

    if (!message) {
      console.log("Mesaj içeriği yok:", req.body);
      return res.sendStatus(200);
    }

    const { text, from, chat } = message;
    console.log("Gelen mesaj detayları:", {
      text,
      from: {
        id: from.id,
        username: from.username,
        first_name: from.first_name
      },
      chat: {
        id: chat.id,
        type: chat.type
      }
    });

    if (text === "/start") {
      console.log("Start komutu alındı, deep link oluşturuluyor...");
      const userId = from.id.toString();
      
      try {
        // Kullanıcıyı veritabanında ara veya oluştur
        let user = await User.findOne({ telegramId: userId });
        
        if (!user) {
          console.log("Yeni kullanıcı oluşturuluyor:", userId);
          user = new User({
            telegramId: userId,
            username: from.username || `user_${userId}`,
            firstName: from.first_name,
            isVerified: false
          });
          await user.save();
        }

        // Deep link token oluştur
        const { token, expiresAt } = generateDeepLinkToken();
        deepLinkTokens.set(token, {
          telegramId: userId,
          expiresAt
        });

        // Deep link URL'i oluştur
        const deepLinkUrl = `${FRONTEND_URL}/verify?token=${token}`;
        
        const response = await bot.sendMessage(
          chat.id,
          `Merhaba! Web uygulamasına giriş yapmak için aşağıdaki linke tıklayın:\n\n${deepLinkUrl}\n\nBu link 5 dakika geçerlidir.`
        );
        console.log("Deep link mesajı gönderildi:", response);
      } catch (error) {
        console.error("Deep link oluşturma hatası:", error);
        await bot.sendMessage(chat.id, "Üzgünüm, bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
      }
    } else if (text === "/rooms") {
      console.log("Rooms komutu alındı");
      const rooms = Array.from(io.sockets.adapter.rooms.keys())
        .filter(room => room.startsWith("room_"))
        .map(room => room.replace("room_", ""));
      
      if (rooms.length === 0) {
        await bot.sendMessage(chat.id, "Şu anda aktif oda bulunmuyor.");
      } else {
        const message = "Aktif odalar:\n" + rooms.map(room => `- ${room}`).join("\n");
        await bot.sendMessage(chat.id, message);
      }
    } else if (text.startsWith("/join ")) {
      console.log("Join komutu alındı");
      const roomName = text.split(" ")[1];
      if (!roomName) {
        await bot.sendMessage(chat.id, "Lütfen bir oda adı belirtin. Örnek: /join genel");
        return;
      }

      const roomId = `room_${roomName}`;
      if (!io.sockets.adapter.rooms.has(roomId)) {
        await bot.sendMessage(chat.id, "Bu oda mevcut değil. /rooms komutu ile mevcut odaları görebilirsiniz.");
        return;
      }

      // Kullanıcıyı odaya ekle
      const userId = from.id.toString();
      const user = await User.findOne({ telegramId: userId });
      
      if (!user || !user.isVerified) {
        await bot.sendMessage(chat.id, "Önce /start komutu ile doğrulama yapmalısınız.");
        return;
      }

      // Kullanıcıyı odaya ekle ve bilgilendir
      await bot.sendMessage(chat.id, `${roomName} odasına katıldınız. Artık bu odaya mesaj gönderebilirsiniz.`);
    } else {
      console.log("Normal mesaj alındı");
      // Normal mesaj işleme
      const userId = from.id.toString();
      const user = await User.findOne({ telegramId: userId });
      
      if (!user || !user.isVerified) {
        await bot.sendMessage(chat.id, "Önce /start komutu ile doğrulama yapmalısınız.");
        return;
      }

      // Kullanıcının aktif olduğu odayı bul
      const activeRoom = user.activeRoom;
      if (!activeRoom) {
        await bot.sendMessage(chat.id, "Bir odaya katılmak için /join <oda_adı> komutunu kullanın.");
        return;
      }

      // Mesajı odaya gönder
      const messageData = {
        user: user.username,
        text,
        room: activeRoom,
        time: new Date().toISOString(),
        source: "telegram"
      };

      io.to(`room_${activeRoom}`).emit("message", messageData);
      console.log("Telegram mesajı odaya iletildi:", messageData);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook işleme hatası:", error);
    res.sendStatus(500);
  }
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