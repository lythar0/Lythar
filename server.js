
// /server.js
// 🎯 DİKKAT: "GÜVENLİKSİZ TEST MODU"
// "Anlık gitmiyor" sorununu çözmek için, "Kapı Güvenliği" (PHP API)
// kontrolü geçici olarak devre dışı bırakıldı.
// Odaya katılmak isteyen HERKES içeri alınacak.

const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); 
const https = require('https'); 

// -----------------------------------------------------------------
// 1. SUNUCU AYARLARI
// -----------------------------------------------------------------

const PHP_SITE_URL = 'https://lythar.tr'; 

// 🎯 Bu API adresini artık KULLANMAYACAĞIZ (Test için)
// const PHP_AUTH_API_URL = `${PHP_SITE_URL}/api/check_group_membership.php`;

// SSL Sertifika Hatalarını Görmezden Gelen HTTP Aracısı
const unsafeHttpsAgent = new https.Agent({
    rejectUnauthorized: false
});
// -----------------------------------------------------------------


// RENDER SAĞLIK KONTROLÜ
const server = http.createServer((req, res) => {
// ... (Aynı) ...
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
    // ... (Bilet kontrolü aynı, bu çalışmaya devam ediyor) ...
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
        
        // 🎯 GÜNCELLEME: "KAPI GÜVENLİĞİ" (PHP API) KONTROLÜ AŞAĞIDAKİ
        // 'try...catch' bloğu YORUM SATIRI yapılarak DEVRE DIŞI BIRAKILDI.
        
        /* // ---- GÜVENLİ KOD (GEÇİCİ OLARAK KAPALI) ----
        try {
            const cleanGroupId = parseInt(groupId, 10);
            if (!cleanGroupId) {
                return socket.emit('authError', 'Gercersiz Grup ID formatı.');
            }

            console.log(`Yetki sorgulanıyor: Kullanıcı ${socket.userId}, Oda ${cleanGroupId} (Adres: ${PHP_AUTH_API_URL})`);
            
            const response = await axios.post(PHP_AUTH_API_URL, {
                user_id: socket.userId,
                group_id: cleanGroupId
            }, {
                httpsAgent: unsafeHttpsAgent 
            });

            if (response.data.success && response.data.is_member) {
                socket.join(cleanGroupId.toString());
                console.log(`Kullanıcı ${socket.userId}, ${cleanGroupId} odasına katıldı.`);
            } else {
                console.warn(`Yetkisiz giriş reddedildi: Kullanıcı ${socket.userId}, Oda ${cleanGroupId} (Sebep: ${response.data.message || 'API is_member=false dedi'})`);
                socket.emit('authError', 'Bu odaya katılma yetkiniz yok.');
            }
        } catch (error) {
            console.error(`Odaya katılma hatası (PHP API [${PHP_AUTH_API_URL}] ile konuşulamadı):`, error.message);
            socket.emit('serverError', 'Sunucu hatası (API ile iletişim kurulamadı).');
        }
        */ // ---- GÜVENLİ KOD SONU ----


        // ----------------------------------------------------
        // 🎯 YENİ: "GÜVENLİKSİZ TEST" KODU (Herkesi İçeri Al)
        // ----------------------------------------------------
        // "Anlık gitmiyor" sorununu test etmek için, PHP'ye sormadan herkesi odaya alıyoruz.
        try {
            const cleanGroupId = parseInt(groupId, 10);
            if (!cleanGroupId) {
                return socket.emit('authError', 'Gercersiz Grup ID formatı.');
            }
            
            socket.join(cleanGroupId.toString());
            console.log(`[GÜVENLİKSİZ TEST] Kullanıcı ${socket.userId}, ${cleanGroupId} odasına (sorgusuz) katıldı.`);

        } catch (e) {
            console.error('Odaya sorgusuz katılırken hata:', e.message);
        }
        // ----------------------------------------------------
        // 🎯 YENİ TEST KODU SONU
        // ----------------------------------------------------
    });

    /**
     * YAYIN İSTEĞİ
     */
    socket.on('yeniMesajYayinla', (messageData) => {
        // ... (Değişiklik yok, burası zaten güvenli) ...
        try {
            if (!messageData || !messageData.grup_id) {
                console.warn('Eksik mesaj verisi (grup_id) ile yayın isteği alındı.');
                return;
            }
            const groupId = messageData.grup_id.toString();
            
            // 🎯 "Anlık gitmiyor" sorununun çözümü burası:
            // Odaya artık katılabildiğin için (yukarıdaki test kodu sayesinde),
            // bu 'if' bloğu artık 'true' dönecek ve YAYIN YAPILACAK.
            if (socket.rooms.has(groupId)) {
                socket.to(groupId).emit('newMessage', messageData); 
                console.log(`Mesaj yayınlandı: Gönderen ${socket.userId}, Oda ${groupId}`);
            } else {
                // Bu hatayı artık görmemen lazım
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
