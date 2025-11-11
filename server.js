
// /server.js
// 🎯 GÜNCELLEME: "Güzel URL" sistemini (htaccess) atlatmak için
// API yolu .php uzantılı dosya olarak değiştirildi.

const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); 
const https = require('https'); 

// -----------------------------------------------------------------
// 1. SUNUCU AYARLARI
// -----------------------------------------------------------------

const PHP_SITE_URL = 'https://lythar.tr'; 

// 🎯 DİKKAT: "Güzel URL" sistemini atlatmak için YENİ ADRES KULLANILIYOR
const PHP_AUTH_API_URL = `${PHP_SITE_URL}/api/test_bypass.php`;

// SSL Sertifika Hatalarını Görmezden Gelen HTTP Aracısı
const unsafeHttpsAgent = new https.Agent({
    rejectUnauthorized: false
});
// -----------------------------------------------------------------


// RENDER SAĞLIK KONTROLÜ
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Lythar Chat Santral Aktif. Socket.IO baglantisi bekleniyor.');
    } else {
        res.writeHead(404);
        res.end();
    }
});
// -----------------------------------------------------------------

const io = new Server(server, {
    cors: {
        origin: PHP_SITE_URL, 
        methods: ["GET", "POST"]
    }
});

// -----------------------------------------------------------------
// 2. GÜVENLİK (Middleware - "Bilet" Kontrolü)
// -----------------------------------------------------------------
io.use(async (socket, next) => {
    // ... (Bilet kontrolü aynı, değişiklik yok) ...
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Kimlik Doğrulama Hatası: Token (Bilet) eksik.'));
        }
        const parts = token.split('-');
        const userId = (parts.length === 3 && parts[0] === 'user' && parts[1] === 'id') ? parts[2] : null;
        if (!userId || !/^\d+$/.test(userId)) {
            return next(new Error('Geçersiz Bilet (Token).'));
        }
        socket.userId = userId;
        console.log(`Bilet doğrulandı: Kullanıcı ID ${socket.userId} (Socket ${socket.id})`);
        next(); 
    } catch (err) {
        console.error('Kimlik doğrulama sırasında beklenmeyen hata:', err.message);
        next(new Error('Kimlik doğrulama başarısız.'));
    }
});


// -----------------------------------------------------------------
// 3. ANA BAĞLANTI YÖNETİMİ
// -----------------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`Bir kullanıcı bağlandı: ID ${socket.id}, (Doğrulanan Kullanıcı: ${socket.userId})`);

    /**
     * ODAYA KATILMA İSTEĞİ (Kapı Güvenliği)
     */
    socket.on('joinRoom', async (groupId) => {
        try {
            const cleanGroupId = parseInt(groupId, 10);
            if (!cleanGroupId) {
                return socket.emit('authError', 'Gercersiz Grup ID formatı.');
            }

            // 🎯 "Güzel URL" sistemini atlatmak için YENİ ADRES'e soruluyor
            console.log(`Yetki sorgulanıyor: Kullanıcı ${socket.userId}, Oda ${cleanGroupId} (Adres: ${PHP_AUTH_API_URL})`);
            
            const response = await axios.post(PHP_AUTH_API_URL, {
                user_id: socket.userId,
                group_id: cleanGroupId
            }, {
                httpsAgent: unsafeHttpsAgent 
            });

            // 🎯 Artık "response" cevabının GELMESİ LAZIM
            if (response.data.success && response.data.is_member) {
                socket.join(cleanGroupId.toString());
                // 🎯 BAŞARI BURADA OLMALI!
                console.log(`Kullanıcı ${socket.userId}, ${cleanGroupId} odasına katıldı.`);
            } else {
                // 🎯 (Bu test kodu 'false' dönemez, ama log burada kalsın)
                console.warn(`Yetkisiz giriş reddedildi: Kullanıcı ${socket.userId}, Oda ${cleanGroupId}`);
                socket.emit('authError', 'Bu odaya katılma yetkiniz yok.');
            }
        } catch (error) {
            // 🎯 Eğer 404 veya 500 hatası alırsak, burada göreceğiz.
            console.error(`Odaya katılma hatası (PHP API [${PHP_AUTH_API_URL}] ile konuşulamadı):`, error.message);
            socket.emit('serverError', 'Sunucu hatası (API ile iletişim kurulamadı).');
        }
    });

    /**
     * YAYIN İSTEĞİ
     */
    socket.on('yeniMesajYayinla', (messageData) => {
        // ... (Bu kısımda değişiklik yok) ...
        try {
            if (!messageData || !messageData.grup_id) {
                console.warn('Eksik mesaj verisi (grup_id) ile yayın isteği alındı.');
                return;
            }
            const groupId = messageData.grup_id.toString();
            
            if (socket.rooms.has(groupId)) {
                socket.to(groupId).emit('newMessage', messageData); 
                console.log(`Mesaj yayınlandı: Gönderen ${socket.userId}, Oda ${groupId}`);
            } else {
                console.warn(`Yetkisiz yayın denemesi: Kullanıcı ${socket.userId}, Oda ${groupId} (odaya katılmamış)`);
                socket.emit('authError', 'Mesaj göndermek için önce odaya katılmalısınız.');
            }
        } catch (e) {
            console.error("Yayınlama sırasında hata oluştu: ", e.message);
        }
    });

    /**
     * Bağlantı Kesildiğinde
     */
    socket.on('disconnect', (reason) => {
        console.log(`Kullanıcı ayrıldı: ID ${socket.id} (Kullanıcı ${socket.userId}). Sebep: ${reason}`);
    });
});


// -----------------------------------------------------------------
// 4. SUNUCUYU BAŞLAT
// -----------------------------------------------------------------
const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`Lythar Chat Sunucusu (Radyo Kulesi) ${PORT} portunda dinlemede...`);
});
