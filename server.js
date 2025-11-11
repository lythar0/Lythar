
// /server.js
// 🎯 "Chat Santrali" (Nihai Güncelleme)
// "Anlık gitmiyor" (Yetkisiz giriş) sorununu çözmek için,
// "Arama Santrali"nin "Güvene Dayalı" (io.use olmayan)
// kimlik doğrulama mantığı kopyalandı.

const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios'); // Bunu HALA tutuyoruz, ama farklı bir yerde kullanacağız (İsteğe bağlı)
const https = require('https'); 

// -----------------------------------------------------------------
// 1. SUNUCU AYARLARI
// -----------------------------------------------------------------

const PHP_SITE_URL = 'https://lythar.tr'; 

// 🎯 BU ADRESE ARTIK BAĞLANTI ANINDA DEĞİL, İSTEĞE BAĞLI SORULACAK
const PHP_AUTH_API_URL = `${PHP_SITE_URL}/api/check_group_membership.php`;

// SSL Sertifika Hatalarını Görmezden Gelen HTTP Aracısı
const unsafeHttpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// RENDER SAĞLIK KONTROLÜ
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Lythar Chat Santrali (WebSocket) sunucusu aktif.');
    } else {
        res.writeHead(404);
        res.end();
    }
});
// -----------------------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: "*", // 🎯 "Arama Santrali" gibi yaptık (Güvenliksiz)
    methods: ["GET", "POST"]
  }
});

console.log(`🚀 Lythar Chat Santrali ${process.env.PORT || 3001} portunda dinlemeye hazır...`);

// -----------------------------------------------------------------
// 2. YENİ KİMLİK DOĞRULAMA (Arama Santrali'nden Kopyalandı)
// -----------------------------------------------------------------
// io.use(...) GÜVENLİK KATMANI TAMAMEN KALDIRILDI.

let kullaniciSoketleri = new Map(); // key: userId, value: socket.id

io.on("connection", (socket) => {
  console.log(`[BAĞLANTI] Bir kullanıcı bağlandı: ${socket.id}`);

  // 1. KULLANICI KİMLİĞİNİ KAYDETME (Arama Santrali'nden Kopyalandı)
  socket.on("store_user_id", (userId) => {
    if (!userId) return;
    const userIdStr = userId.toString();
    
    // 🎯 "Chat Santrali" Eklemesi: socket'in içine de kaydedelim
    socket.userId = userIdStr; 
    
    kullaniciSoketleri.set(userIdStr, socket.id);
    console.log(`[KİMLİK] Kullanıcı ${userIdStr} soket ${socket.id} ile eşleşti.`);
  });

  // ----------------------------------------------------
  // 3. ODAYA KATILMA (GÜVENLİKSİZ - SENİN İSTEĞİN)
  // ----------------------------------------------------
  socket.on('joinRoom', (groupId) => {
        // 🎯 GÜNCELLEME: PHP API'ye (Kapı Güvenliği) sormayı BIRAKTIK.
        // "Telsiz"den (JS) gelen 'joinRoom' emrine GÜVENİYORUZ.
        try {
            const cleanGroupId = parseInt(groupId, 10);
            if (!cleanGroupId) {
                console.warn("Geçersiz Grup ID formatı alındı.");
                return;
            }
            
            socket.join(cleanGroupId.toString());
            console.log(`[ODA KATILMA] Kullanıcı ${socket.userId || '(henüz kimliksiz)'}, ${cleanGroupId} odasına (sorgusuz) katıldı.`);

        } catch (e) {
            console.error('Odaya sorgusuz katılırken hata:', e.message);
        }
  });

  // ----------------------------------------------------
  // 4. YAYIN İSTEĞİ (ANLIK GİTMEYİ ÇÖZEN YER)
  // ----------------------------------------------------
  socket.on('yeniMesajYayinla', (messageData) => {
        try {
            if (!messageData || !messageData.grup_id) {
                console.warn('Eksik mesaj verisi (grup_id) ile yayın isteği alındı.');
                return;
            }
            const groupId = messageData.grup_id.toString();
            
            // 🎯 "Anlık Gitmiyor" Sorununun Çözümü:
            // Odaya artık katılabildiğin için (yukarıdaki 'joinRoom' sayesinde),
            // bu 'if' bloğu artık 'true' dönecek ve YAYIN YAPILACAK.
            if (socket.rooms.has(groupId)) {
                socket.to(groupId).emit('newMessage', messageData); 
                console.log(`[YAYIN] Mesaj yayınlandı: Gönderen ${messageData.sender_id}, Oda ${groupId}`);
            } else {
                // Bu hatayı artık görmemen lazım
                console.warn(`[YAYIN HATASI] Yetkisiz yayın denemesi: Kullanıcı ${socket.userId}, Oda ${groupId} (odaya katılmamış)`);
                // socket.emit('authError', 'Mesaj göndermek için önce odaya katılmalısınız.');
            }
        } catch (e) {
            console.error("Yayınlama sırasında hata oluştu: ", e.message);
        }
  });

  // 5. BAĞLANTI KOPMASI (Arama Santrali'nden Kopyalandı)
  socket.on("disconnect", () => {
    console.log(`[BAĞLANTI KESİLDİ] Kullanıcı ayrıldı: ${socket.id}`);
    for (let [userId, sockId] of kullaniciSoketleri.entries()) {
      if (sockId === socket.id) {
        kullaniciSoketleri.delete(userId);
        console.log(`[KİMLİK] Kullanıcı ${userId} eşleşmesi kaldırıldı.`);
        break;
      }
    }
  });
});

// 6. SUNUCUYU BAŞLAT
const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda başarıyla başlatıldı.`);
});
