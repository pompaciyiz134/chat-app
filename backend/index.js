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
  isAdmin: { type: Boolean, default: false },
  lastStartCommand: { type: Date, default: null },
  isVerified: { type: Boolean, default: false },
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
  origin: ["https://chat-app-frontend-stnq.onrender.com", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://chat-app-frontend-stnq.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Telegram bot token ve webhook URL
const TELEGRAM_TOKEN = "8070821143:AAG20-yS1J4hxoNB50e5eH2A3GYME3p7CXM";
const WEBHOOK_URL = "https://chat-app-bb7l.onrender.com/telegram/webhook";
const BOT_USERNAME = "klfh_bot";
const FRONTEND_URL = "https://chat-app-frontend-stnq.onrender.com";

// Telegram bot oluştur
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Deep link token'ları için geçici depo (gerçek uygulamada Redis kullanılabilir)
const deepLinkTokens = new Map();

// Deep link token oluştur
const generateDeepLinkToken = () => {
  const token = uuidv4();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 saat geçerli
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

    // Kullanıcıyı doğrula ve güncelle
    user.isVerified = true;
    await user.save();

    // Token'ı kullanıldıktan sonra sil
    deepLinkTokens.delete(token);

    // Başarılı yanıt
    res.json({
      success: true,
      username: user.username,
      userId: user._id,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error("Deep link doğrulama hatası:", error);
    res.status(500).json({ 
      success: false, 
      message: "Sunucu hatası" 
    });
  }
});

// Webhook endpoint'i
app.post("/telegram/webhook", express.json(), async (req, res) => {
  try {
    const update = req.body;
    console.log("Telegram webhook güncellemesi:", update);

    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const username = update.message.from.username || update.message.from.first_name;
      const userId = update.message.from.id.toString();

      // /start komutu için deep link token oluştur
      if (text === "/start") {
        // Kullanıcıyı veritabanında ara
        let user = await User.findOne({ telegramId: userId });
        
        if (user) {
          // Son /start komutundan bu yana 24 saat geçti mi kontrol et
          const lastStart = user.lastStartCommand || new Date(0);
          const hoursSinceLastStart = (Date.now() - lastStart.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceLastStart < 24) {
            const remainingHours = Math.ceil(24 - hoursSinceLastStart);
            await bot.sendMessage(chatId, 
              `Üzgünüm, yeni bir giriş linki almak için ${remainingHours} saat beklemelisiniz.`
            );
            return res.sendStatus(200);
          }
        } else {
          // Yeni kullanıcı oluştur
          user = new User({
            telegramId: userId,
            username: username,
            displayName: username,
            isVerified: false
          });
        }

        // Token oluştur ve kullanıcıyı güncelle
        const { token, expiresAt } = generateDeepLinkToken();
        deepLinkTokens.set(token, {
          telegramId: userId,
          expiresAt
        });

        user.lastStartCommand = new Date();
        await user.save();

        const deepLinkUrl = `${FRONTEND_URL}?token=${token}`;
        await bot.sendMessage(chatId, 
          `Merhaba ${username}! Sohbet uygulamasına hoş geldiniz.\n\n` +
          `Giriş yapmak için aşağıdaki linke tıklayın:\n${deepLinkUrl}\n\n` +
          `Bu link 24 saat süreyle geçerlidir.`
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook işleme hatası:", error);
    res.sendStatus(500);
  }
});

// Socket.IO bağlantı yönetimi
io.on("connection", (socket) => {
  console.log("Yeni socket bağlantısı:", socket.id);

  socket.on("authenticate", async ({ userId }) => {
    try {
      const user = await User.findById(userId);
      if (user) {
        socket.userId = userId;
        socket.username = user.username;
        socket.isAdmin = user.isAdmin;
        
        // Kullanıcıyı genel odaya ekle
        socket.join("genel");
        
        // Kullanıcı listesini güncelle
        const users = await User.find({ isVerified: true });
        io.emit("userList", users.map(u => ({
          id: u._id,
          username: u.username,
          displayName: u.displayName || u.username,
          isAdmin: u.isAdmin
        })));
      }
    } catch (error) {
      console.error("Socket kimlik doğrulama hatası:", error);
    }
  });

  socket.on("join", async ({ room }) => {
    if (socket.userId) {
      // Kullanıcının admin olup olmadığını kontrol et
      const user = await User.findById(socket.userId);
      if (!user.isAdmin && room !== "genel") {
        socket.emit("error", { message: "Sadece adminler yeni oda oluşturabilir" });
        return;
      }

      socket.join(room);
      socket.emit("roomJoined", room);
    }
  });

  socket.on("message", async (message) => {
    if (socket.userId) {
      const user = await User.findById(socket.userId);
      if (user) {
        const messageData = {
          ...message,
          userId: socket.userId,
          username: user.username,
          time: new Date().toISOString()
        };
        io.to(message.room).emit("message", messageData);
      }
    }
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      // Kullanıcı listesini güncelle
      io.emit("userLeft", socket.userId);
    }
  });
}); 