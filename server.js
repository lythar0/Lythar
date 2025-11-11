
// /server.js
// Lythar.tr "Santral" (Radyo Kulesi) Sunucusu
// 🎯 "Güzel URL" (.htaccess) uyumu ve "Render Port Scan" hatası için güncellendi.

const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // PHP API'mızla konuşmak için

// -----------------------------------------------------------------
// 1. SUNUCU AYARLARI
// -----------------------------------------------------------------

// Ana PHP sitenin adresi (Güvenlik için çok önemli)
// 🎯 DİKKAT: Burayı kendi sitenin tam adresiyle değiştirdiğinden emin ol!
const PHP_SITE_URL = 'https://lythar.tr'; // VEYA 'https://lythar.onrender.com'

// "Kapı Güvenliği" API'mızın tam adresi
// 🎯 GÜNCELLEME: .php uzantısı, "Güzel URL" (.htaccess) sistemine uyması için SİLİNDİ.
const PHP_AUTH_API_URL = `${PHP_SITE_URL}/api/check_group_membership`;


// -----------------------------------------------------------------
// RENDER SAĞLIK KONTROLÜ (Port Scan Hatası Çözümü)
// -----------------------------------------------------------------
const server = http.createServer((req, res) => {
    // Sadece 'GET /' isteğine (Render'ın "ping"ine) cevap ver
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Lythar Chat Santral Aktif. Socket.IO baglantisi bekleniyor.');
    } else {
        // Diğer tüm HTTP isteklerini reddet
        res.writeHead(404);
        res.end();
    }
});
// -----------------------------------------------------------------

const io = new Server(server, {
    cors: {
        origin: PHP_SITE_URL, // Sadece senin PHP sitenden gelen bağlantıları kabul et
        methods: ["GET", "POST"]
    }
});

// -----------------------------------------------------------------
// 2. GÜVENLİK (Middleware - "Bilet" Kontrolü)
// -----------------------------------------------------------------
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Kimlik Doğrulama Hatası: Token (Bilet) eksik.'));
        }
        
        // ---- GEÇİCİ TEST KODU (Canlıda JWT ile değiştirilmeli) ----
        const parts = token.split('-');
        const userId = (parts.length === 3 && parts[0] === 'user' && parts[1] === 'id') ? parts[2] : null;
        if (!userId || !/^\d+$/.test(userId)) {
            return next(new Error('Geçersiz Bilet (Token).'));
        }
        // ---- TEST KODU SONU ----

        socket.userId = userId;
        console.log(`Bilet doğrulandı: Kullanıcı ID ${socket.userId} (Socket ${socket.id})`);
        next(); // Güvenlikten geçti, bağlantıyı kabul et

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
                return socket.emit('authError', 'Geçersiz Grup ID formatı.');
            }

            // 1. Kural: "Kapı Güvenliği"ne (PHP API) sor!
            console.log(`Yetki sorgulanıyor: Kullanıcı ${socket.userId}, Oda ${cleanGroupId} (Adres: ${PHP_AUTH_API_URL})`);
            
            const response = await axios.post(PHP_AUTH_API_URL, {
                user_id: socket.userId,
                group_id: cleanGroupId
            });

            // 2. Kural: PHP "evet" (is_member: true) derse odaya al.
            if (response.data.success && response.data.is_member) {
                socket.join(cleanGroupId.toString());
                console.log(`Kullanıcı ${socket.userId}, ${cleanGroupId} odasına katıldı.`);
            } else {
                // 3. Kural: PHP "hayır" (is_member: false) derse odaya ALMA.
                console.warn(`Yetkisiz giriş reddedildi: Kullanıcı ${socket.userId}, Oda ${cleanGroupId}`);
                socket.emit('authError', 'Bu odaya katılma yetkiniz yok.');
            }
        } catch (error) {
            // Bu hata, PHP API'nin kendisine ulaşılamadığında (404, 500) veya adres yanlışsa olur
            console.error(`Odaya katılma hatası (PHP API [${PHP_AUTH_API_URL}] ile konuşulamadı):`, error.message);
            socket.emit('serverError', 'Sunucu hatası (API ile iletişim kurulamadı).');
        }
    });

    /**
     * YAYIN İSTEĞİ (Mesaj, Resim, Video... hepsi)
     */
    socket.on('yeniMesajYayinla', (messageData) => {
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
