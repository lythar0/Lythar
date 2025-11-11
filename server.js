
// /server.js
// Lythar.tr "Santral" (Radyo Kulesi) Sunucusu
// Görevi: Güvenlik, odalara alma ve anlık mesaj yayını.

const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // PHP API'mızla konuşmak için

// -----------------------------------------------------------------
// 1. SUNUCU AYARLARI
// -----------------------------------------------------------------

// Ana PHP sitenin adresi (Güvenlik için çok önemli)
// 🎯 DİKKAT: Buraya kendi sitenin tam adresini yaz.
const PHP_SITE_URL = 'https://lythar.tr'; // VEYA 'https://lythar.onrender.com'

// "Kapı Güvenliği" API'mızın tam adresi
const PHP_AUTH_API_URL = `${PHP_SITE_URL}/api/check_group_membership.php`;

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: PHP_SITE_URL, // Sadece senin PHP sitenden gelen bağlantıları kabul et
        methods: ["GET", "POST"]
    }
});

// -----------------------------------------------------------------
// 2. GÜVENLİK (Middleware - "Bilet" Kontrolü)
// -----------------------------------------------------------------
// Bu, birisi bağlanmaya çalıştığında İLK çalışan koddur.
io.use(async (socket, next) => {
    try {
        // 1. Adım: "Bileti" (Token) Al
        // (group_room.php'de oluşturduğumuz 'data-chat-token')
        const token = socket.handshake.auth.token;

        if (!token) {
            console.warn('Bağlantı reddedildi: Token (Bilet) eksik.');
            return next(new Error('Kimlik Doğrulama Hatası: Token (Bilet) eksik.'));
        }

        // ---------------------------------------------------------------
        // ⚠️ DİKKAT: GÜVENLİK UYARISI ⚠️
        // Aşağıdaki kod SADECE TEST amaçlıdır.
        // 'user-id-123' formatı güvenli DEĞİLDİR.
        // Canlı sistemde burayı MUTLAKA PHP'de ürettiğin bir JWT (JSON Web Token)
        // veya veritabanında saklanan tek kullanımlık bir token ile doğrula.
        // ---------------------------------------------------------------
        
        // 2. Adım: Bileti (Token) Doğrula (Geçici Yöntem)
        const parts = token.split('-');
        const userId = (parts.length === 3 && parts[0] === 'user' && parts[1] === 'id') ? parts[2] : null;
        
        if (!userId || !/^\d+$/.test(userId)) { // Sadece sayısal bir ID olmalı
            console.warn(`Bağlantı reddedildi: Geçersiz Bilet formatı alındı: ${token}`);
            return next(new Error('Geçersiz Bilet (Token).'));
        }
        // ---------------------------------------------------------------
        // GÜVENLİK UYARISI SONU
        // ---------------------------------------------------------------

        // 3. Adım: Kullanıcıyı "Telsiz"e (Socket) işle
        // Artık bu 'socket' objesini "Kullanıcı 123" olarak tanıyoruz.
        socket.userId = userId;
        console.log(`Bilet doğrulandı: Kullanıcı ID ${socket.userId} (Socket ${socket.id})`);
        next(); // Güvenlikten geçti, bağlantıyı kabul et

    } catch (err) {
        console.error('Kimlik doğrulama sırasında beklenmedik hata:', err.message);
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
     * JS (Telsiz) 'joinRoom' dediğinde çalışır
     */
    socket.on('joinRoom', async (groupId) => {
        try {
            // Güvenlik: Gelen groupId'nin sayı olduğundan emin ol
            const cleanGroupId = parseInt(groupId, 10);
            if (!cleanGroupId) {
                console.warn(`Geçersiz grup ID'si alındı: ${groupId}`);
                return socket.emit('authError', 'Geçersiz Grup ID formatı.');
            }

            // 1. Kural: "Kapı Güvenliği"ne (PHP API) sor!
            // "Bu kullanıcı (socket.userId) bu odaya (cleanGroupId) girebilir mi?"
            console.log(`Yetki sorgulanıyor: Kullanıcı ${socket.userId}, Oda ${cleanGroupId}`);
            
            const response = await axios.post(PHP_AUTH_API_URL, {
                user_id: socket.userId,
                group_id: cleanGroupId
            });

            // 2. Kural: PHP "evet" (is_member: true) derse odaya al.
            if (response.data.success && response.data.is_member) {
                socket.join(cleanGroupId.toString());
                console.log(`Kullanıcı ${socket.userId}, ${cleanGroupId} odasına katıldı.`);
                // İsteğe bağlı olarak kullanıcıya "başarıyla katıldın" diyebilirsin
                // socket.emit('joinedRoom', cleanGroupId); 
            } else {
                // 3. Kural: PHP "hayır" (is_member: false) derse odaya ALMA.
                console.warn(`Yetkisiz giriş reddedildi: Kullanıcı ${socket.userId}, Oda ${cleanGroupId}`);
                socket.emit('authError', 'Bu odaya katılma yetkiniz yok.');
            }
        } catch (error) {
            // Bu hata, PHP API'nin kendisine ulaşılamadığında (500, 404) olur
            console.error(`Odaya katılma hatası (PHP API [${PHP_AUTH_API_URL}] ile konuşulamadı):`, error.message);
            socket.emit('serverError', 'Sunucu hatası (API ile iletişim kurulamadı).');
        }
    });

    /**
     * YAYIN İSTEĞİ (Mesaj, Resim, Video... hepsi)
     * JS (Telsiz) 'yeniMesajYayinla' dediğinde çalışır
     */
    socket.on('yeniMesajYayinla', (messageData) => {
        // messageData = PHP'den gelen { id, grup_id, sender_id, message_text, user_resim ... } verisi
        
        try {
            if (!messageData || !messageData.grup_id) {
                console.warn('Eksik mesaj verisi (grup_id) ile yayın isteği alındı.');
                return;
            }

            const groupId = messageData.grup_id.toString();
            
            // 1. Kural: Gönderen kişinin (socket.userId) o odada (odaya 'join' olmuş mu) olduğundan emin ol
            if (socket.rooms.has(groupId)) {
                
                // 2. Kural: Gönderen hariç ODADAKİ HERKESE yayınla (broadcast)
                // 'newMessage' -> bu, JS Telsizimizin dinlediği sinyal adıdır
                socket.to(groupId).emit('newMessage', messageData); 
                
                console.log(`Mesaj yayınlandı: Gönderen ${socket.userId}, Oda ${groupId}`);
            } else {
                // 3. Kural: Odanın üyesi değilse (veya 'join' olmamışsa) yayın yapamaz
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
// Render, 'PORT' adında bir ortam değişkeni (environment variable) verir.
// Bu PORT'u kullanmak zorundasın.
const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`Lythar Chat Sunucusu (Radyo Kulesi) ${PORT} portunda dinlemede...`);
});
