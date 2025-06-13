# Sohbet Uygulaması

Telegram entegrasyonlu gerçek zamanlı sohbet uygulaması.

## Özellikler

- Gerçek zamanlı mesajlaşma
- Telegram bot entegrasyonu
- Çoklu oda desteği
- Kullanıcı listesi
- Modern ve responsive arayüz

## Teknolojiler

- Frontend: React, Chakra UI, Socket.IO
- Backend: Node.js, Express, Socket.IO
- Telegram Bot API
- Cloudflare (DDoS koruması)

## Kurulum

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm start
```

## Telegram Bot

Bot komutları:
- `/start` - Hoş geldin mesajı ve komutları gösterir
- `/rooms` - Mevcut odaları listeler
- `/join <oda_adı>` - Belirtilen odaya katılır

## Lisans

MIT 