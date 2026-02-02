import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, updateDoc, getDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. AYARLAR (CONFIG)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDsxF2oJB3L9-0s4igZOAEYEl5jcRreBns",
  authDomain: "las-noches-73146.firebaseapp.com",
  projectId: "las-noches-73146",
  storageBucket: "las-noches-73146.firebasestorage.app",
  messagingSenderId: "416786450763",
  appId: "1:416786450763:web:b122b6a665df3c082dc0ce",
  measurementId: "G-HJMSDHF2V2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// YETKİLİ AYARLARI 
const ADMIN_IDS = ["517023660972834847", "1466766670801539117", "766290817592852480", "777880085483094036"]; 
const CLIENT_ID = "1466766670801539117"; 
const REDIRECT_URI = "https://lasnochesv2.vercel.app/admin.html"; // Canlıya alınca domaini güncelle!

// --- WEBHOOK AYARLARI ---
// 1. GENEL LOGLAR (Veri ekleme/silme vb. buraya düşer)
const WEBHOOK_URL = "https://discord.com/api/webhooks/1467821222485033094/VYYy29v50-XAZDITvRGlXKvnvpsMyqCFdoUr9YJ1juRHiOpLET9tf1k45Zby1J-bI6I9"; 

// 2. GÜVENLİK KODLARI (Sadece giriş OTP kodları buraya düşer - BURAYI DOLDUR!)
const OTP_WEBHOOK_URL = "https://discord.com/api/webhooks/1467858885745311787/JXVYm8j5PWtKr06pmvjTPlaNzPFhDPlk8faBEwWV8aU_jGHfBwq6vhm_tR_FXfiC3BEp"; 

// GLOBAL DEĞİŞKENLER
window.tempSocials = []; 
let editingId = null; 
let currentEditingData = {}; 
let currentUser = null;

// 2FA Değişkenleri
let generatedOTP = null;
let otpExpiryTime = null;
let otpTimerInterval = null;

// ==========================================
// 2. GELİŞMİŞ DISCORD LOG SİSTEMİ (v6.0)
// ==========================================

function getChanges(oldData, newData) {
    let changeLog = "";
    const labelMap = {
        'nickname': 'Oyun İçi İsim', 'realname': 'Gerçek İsim', 'role': 'Rol',
        'rank': 'Rank', 'status': 'Durum', 'score1': 'Bizim Skor', 
        'score2': 'Rakip Skor', 'opponent': 'Rakip', 'map': 'Harita',
        'title': 'Başlık', 'summary': 'Özet', 'link': 'Video Linki', 'date': 'Tarih'
    };

    const keysToCheck = Object.keys(labelMap);

    keysToCheck.forEach(key => {
        if (oldData[key] != newData[key] && newData[key] !== undefined) {
            const oldVal = oldData[key] === "" || oldData[key] === undefined ? "(Boş)" : oldData[key];
            const newVal = newData[key] === "" ? "(Boş)" : newData[key];
            changeLog += `• **${labelMap[key]}:** \`${oldVal}\` ➔ \`${newVal}\`\n`;
        }
    });
    return changeLog ? changeLog : null;
}

function createDetailedFields(category, data) {
    const fields = [];

    if (category === 'matches') {
        const isFinished = data.status === 'finished';
        const statusText = isFinished 
            ? (data.result === 'win' ? "🏆 KAZANDIK" : "❌ KAYBETTİK") 
            : "⏳ OYNANMADI";

        fields.push({ name: "🆚 Rakip Takım", value: `\`${data.opponent}\``, inline: true });
        fields.push({ name: "📅 Tarih & Durum", value: `${data.date}\n${statusText}`, inline: true });
        
        if (isFinished) {
            fields.push({ 
                name: "📊 Maç Skoru", 
                value: `\`\`\`js\nLAS NOCHES [ ${data.score1} - ${data.score2} ] ${data.opponent}\n\`\`\``, 
                inline: false 
            });
            fields.push({ name: "🗺️ Harita", value: data.map || "Seçilmedi", inline: true });
        } else {
            fields.push({ name: "🏆 Turnuva", value: data.tournament || "Belirtilmedi", inline: true });
        }
    } 
    
    else if (category === 'players') {
        fields.push({ name: "🆔 Kimlik", value: `**Nick:** ${data.nickname}\n**İsim:** ${data.realname || '-'}`, inline: true });
        fields.push({ name: "⚔️ Oyun Bilgisi", value: `**Rol:** ${data.role}\n**Rank:** ${data.rank}\n**Ajan:** ${data.agent || '-'}`, inline: true });
        
        if (data.socials && data.socials.length > 0) {
            const socialLinks = data.socials.map(s => `[${s.platform}](${s.url})`).join(' • ');
            fields.push({ name: "🔗 Sosyal Medya", value: socialLinks, inline: false });
        }
    }

    else if (category === 'news') {
        fields.push({ name: "📄 Başlık", value: data.title, inline: false });
        if(data.summary) fields.push({ name: "📝 Özet", value: `*${data.summary}*`, inline: false });
    }

    return fields;
}

async function sendLog(type, category, title, description, data = null, oldData = null) {
    if (!WEBHOOK_URL) return;

    const adminName = currentUser ? (currentUser.global_name || currentUser.username) : "Sistem";
    const adminAvatar = currentUser ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png` : "https://cdn-icons-png.flaticon.com/512/906/906343.png";
    const adminId = currentUser ? currentUser.id : "Bilinmiyor";
    
    let device = "Masaüstü";
    if (/Mobi|Android/i.test(navigator.userAgent)) device = "📱 Mobil";
    else if (/Mac/i.test(navigator.userAgent)) device = "💻 Mac";

    const styles = {
        create: { color: 5763719,  emoji: "✅", title: "YENİ KAYIT EKLENDİ" },
        update: { color: 16776960, emoji: "📝", title: "KAYIT GÜNCELLENDİ" },
        delete: { color: 15548997, emoji: "🗑️", title: "KAYIT SİLİNDİ" },
        login:  { color: 10181046, emoji: "🛡️", title: "YETKİLİ GİRİŞİ" }
    };
    const style = styles[type] || { color: 3447003, emoji: "ℹ️", title: "BİLDİRİM" };

    let embedFields = [
        { name: "👤 İşlemi Yapan", value: `<@${adminId}>`, inline: true },
        { name: "🖥️ Cihaz", value: `${device}`, inline: true }
    ];

    if (type === 'update' && oldData && data) {
        const changes = getChanges(oldData, data);
        if (changes) {
            embedFields.push({ name: "📋 Yapılan Değişiklikler", value: changes, inline: false });
        }
    } else if (type === 'create' && data) {
        const detailFields = createDetailedFields(category, data);
        embedFields = embedFields.concat(detailFields);
    } else if (type === 'delete') {
        embedFields.push({ name: "🗑️ Silinen Veri", value: description, inline: false });
    }

    const payload = {
        username: "LAS NOCHES SYSTEM",
        avatar_url: "https://i.imgur.com/AfFp7pu.png",
        embeds: [{
            author: { name: `${style.title}`, icon_url: adminAvatar },
            title: `${style.emoji} ${title}`,
            description: type === 'update' ? description : "", 
            color: style.color,
            fields: embedFields,
            footer: { text: "Panel v2.2 • Las Noches", icon_url: "https://cdn-icons-png.flaticon.com/512/2092/2092663.png" },
            timestamp: new Date().toISOString()
        }]
    };

    if (data && data.image && type !== 'delete') {
        payload.embeds[0].thumbnail = { url: data.image };
    }

    try { 
        await fetch(WEBHOOK_URL, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }); 
    } catch (e) { console.error("Log Hatası:", e); }
}

// ==========================================
// 3. UI ARAÇLARI
// ==========================================
window.showToast = (msg, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-times-circle' : 'fa-check-circle'}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};

window.toggleLoader = (sectionId, show) => {
    const loader = document.getElementById(`loader${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`);
    if(loader) loader.style.display = show ? 'flex' : 'none';
};

window.openModal = (id, isEdit = false) => {
    document.getElementById(id).style.display = 'flex';
    if (!isEdit) {
        editingId = null; currentEditingData = {};
        const form = document.querySelector(`#${id} form`);
        if(form) form.reset();
        
        if(id === 'playerModal') { 
            window.tempSocials = []; 
            window.renderSocials(); 
            window.clearPreview();
        }

        if(id === 'matchModal') {
            const dateInput = document.getElementById('mDate');
            dateInput.disabled = false;
            dateInput.style.opacity = "1";
            window.toggleScoreInput('upcoming'); 
        }
        
        const btn = document.querySelector(`#${id} .save-btn`);
        if(btn) btn.innerText = "KAYDET";
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';

window.showSection = (sectionId) => {
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.remove('open'); 
    
    document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    const btns = document.querySelectorAll('.menu-btn');
    btns.forEach(btn => {
        if(btn.onclick && btn.onclick.toString().includes(sectionId)) btn.classList.add('active');
    });
    
    if(sectionId === 'players') loadPlayers();
    else if(sectionId === 'matches') loadMatches();
    else if(sectionId === 'news') loadNews();
    else if(sectionId === 'media') loadMedia();
    else if(sectionId === 'history') loadHistory();
};

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const closeBtn = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');

    if(toggleBtn) toggleBtn.onclick = () => sidebar.classList.add('open');
    if(closeBtn) closeBtn.onclick = () => sidebar.classList.remove('open');
});

// ==========================================
// 4. AUTH & 2FA & LOGOUT
// ==========================================

window.logout = () => { 
    localStorage.removeItem('admin_token'); 
    window.location.href = window.location.pathname; 
};

window.loginWithDiscord = () => {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=identify`;
};

function checkAuth() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('access_token') || localStorage.getItem('admin_token');

    if (token) {
        fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(user => {
            if(ADMIN_IDS.includes(user.id)) {
                currentUser = user;
                localStorage.setItem('admin_token', token);
                
                if(fragment.get('access_token')) {
                     window.history.replaceState({}, document.title, window.location.pathname);
                     start2FA(user);
                } else {
                    initSystem(user);
                }
            } else {
                alert("Yetkisiz Erişim! ID'niz sistemde kayıtlı değil.");
                window.logout();
            }
        })
        .catch(() => { document.getElementById('loginOverlay').style.display = 'flex'; });
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
    }
}

// 2FA BAŞLAT
function start2FA(user) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('twoFactorOverlay').style.display = 'flex';
    
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    otpExpiryTime = Date.now() + 60000; // 60 saniye
    
    sendOTPWebhook(user.id, generatedOTP);
    
    let timeLeft = 60;
    const timerEl = document.getElementById('otpTimer');
    otpTimerInterval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(otpTimerInterval);
            alert("Süre doldu! Giriş sayfasına yönlendiriliyorsunuz.");
            window.logout();
        }
    }, 1000);
}

// 2FA DOĞRULA
window.verifyOTP = () => {
    const input = document.getElementById('otpInput').value;
    
    if(Date.now() > otpExpiryTime) {
        alert("Kodun süresi dolmuş.");
        window.logout();
        return;
    }
    
    if(input === generatedOTP) {
        clearInterval(otpTimerInterval);
        document.getElementById('twoFactorOverlay').style.display = 'none';
        initSystem(currentUser);
    } else {
        alert("Hatalı kod! Tekrar deneyin.");
        document.getElementById('otpInput').value = "";
    }
};

// SİSTEMİ BAŞLAT
function initSystem(user) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('twoFactorOverlay').style.display = 'none';
    document.getElementById('adminMainPanel').style.display = 'flex';
    document.getElementById('adminName').innerText = user.global_name || user.username;
    
    sendLog('login', 'system', 'Admin Girişi Yapıldı', `2FA Doğrulaması Başarılı.\nKullanıcı: ${user.global_name}`);
    startRealtimeDashboard();
    window.showSection('dashboard');
}

// ÖZEL OTP WEBHOOK (Sadece buraya yeni webhook eklenecek)
async function sendOTPWebhook(userId, code) {
    if(!OTP_WEBHOOK_URL || OTP_WEBHOOK_URL.includes("BURAYA")) {
        console.error("OTP Webhook URL ayarlanmamış!");
        alert("Sistem Hatası: Güvenlik Webhook Ayarı Yapılmamış.");
        return;
    }

    const formattedCode = code.match(/.{1,3}/g).join(''); 
    
    const payload = {
        username: "LAS NOCHES SECURITY",
        avatar_url: "https://cdn-icons-png.flaticon.com/512/2092/2092663.png",
        content: `<@${userId}>`, 
        embeds: [{
            title: "🔐 GÜVENLİK KODU",
            description: `Admin paneline giriş için doğrulama kodu istendi.\n\n# \`${formattedCode}\`\n\n*Bu kod **60 saniye** boyunca geçerlidir.*`,
            color: 16711680, 
            footer: { text: "Bu işlemi siz yapmadıysanız tokeninizi sıfırlayın!" }
        }]
    };

    try { 
        await fetch(OTP_WEBHOOK_URL, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }); 
    } catch (e) { console.error("Webhook Error:", e); }
}


// ==========================================
// 5. OYUNCU YÖNETİMİ
// ==========================================

window.previewUrl = (url) => {
    const previewArea = document.getElementById('uploadPreview');
    const img = document.getElementById('previewImg');
    const errorMsg = document.getElementById('imgError');

    if(url && url.length > 5) {
        previewArea.style.display = 'block';
        img.style.display = 'block';
        if(errorMsg) errorMsg.style.display = 'none';
        img.src = url;
    } else {
        previewArea.style.display = 'none';
    }
};

window.clearPreview = () => {
    document.getElementById('pImage').value = '';
    document.getElementById('uploadPreview').style.display = 'none';
};

window.detectPlatform = (url) => {
    const iconBox = document.getElementById('detectedIcon');
    let platform = 'website';
    url = url.toLowerCase();
    
    if(url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
    else if(url.includes('instagram.com')) platform = 'instagram';
    else if(url.includes('youtube.com')) platform = 'youtube';
    else if(url.includes('twitch.tv')) platform = 'twitch';
    else if(url.includes('discord')) platform = 'discord';
    else if(url.includes('tiktok.com')) platform = 'tiktok';
    
    iconBox.setAttribute('data-platform', platform);
    
    const iconMap = { 'twitter': 'fa-x-twitter', 'instagram': 'fa-instagram', 'youtube': 'fa-youtube', 'twitch': 'fa-twitch', 'discord': 'fa-discord', 'tiktok': 'fa-tiktok', 'website': 'fa-globe' };
    let faClass = iconMap[platform];
    if(platform === 'twitter') faClass = 'fa-twitter';
    
    iconBox.innerHTML = `<i class="fab ${faClass} fas"></i>`;
};

window.addSocialLink = () => {
    const urlInput = document.getElementById('sUrl');
    const url = urlInput.value.trim();
    if(!url) { window.showToast("Lütfen link girin", "error"); return; }
    
    const iconBox = document.getElementById('detectedIcon');
    const platform = iconBox.getAttribute('data-platform') || 'website';
    
    window.tempSocials.push({ platform, url });
    window.renderSocials();
    
    urlInput.value = '';
    iconBox.innerHTML = '<i class="fas fa-link"></i>';
};

window.renderSocials = () => {
    const list = document.getElementById('addedSocialsList');
    if(!list) return;
    list.innerHTML = window.tempSocials.map((s, index) => `
        <div class="social-tag" style="background:#222; padding:5px 10px; border-radius:15px; display:inline-flex; align-items:center; gap:5px; margin:2px; border:1px solid #333;">
            <i class="fab fa-${s.platform === 'website' ? 'globe' : s.platform}"></i>
            <span style="font-size:0.8rem; color:#ccc;">${s.platform.toUpperCase()}</span>
            <button type="button" onclick="removeSocial(${index})" style="background:none; border:none; color:#ff4655; cursor:pointer; font-weight:bold; margin-left:5px;">&times;</button>
        </div>
    `).join('');
};

window.removeSocial = (i) => { window.tempSocials.splice(i, 1); window.renderSocials(); };

window.savePlayer = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.save-btn');
    btn.innerText = "⏳ İŞLENİYOR..."; btn.disabled = true;

    try {
        const imageUrl = document.getElementById('pImage').value;
        const data = {
            nickname: document.getElementById('pNick').value,
            realname: document.getElementById('pReal').value,
            role: document.getElementById('pRole').value,
            rank: document.getElementById('pRank').value,
            agent: document.getElementById('pAgent').value,
            crosshair: document.getElementById('pCross').value,
            image: imageUrl,
            socials: window.tempSocials,
            updatedAt: Date.now()
        };

        if (editingId) {
            await updateDoc(doc(db, "players", editingId), data);
            sendLog('update', 'players', `Oyuncu Düzenlendi: ${data.nickname}`, `**${data.nickname}** profilinde değişiklik yapıldı.`, data, currentEditingData);
            window.showToast("Oyuncu Güncellendi", "success");
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, "players"), data);
            sendLog('create', 'players', `Kadroya Yeni Oyuncu!`, null, data);
            window.showToast("Oyuncu Eklendi", "success");
        }
        
        window.closeModal('playerModal');
        loadPlayers();
    } catch (err) {
        console.error(err);
        window.showToast("Hata: " + err.message, "error");
    } finally {
        btn.innerText = "KAYDET"; btn.disabled = false; editingId = null;
    }
};

async function loadPlayers() {
    window.toggleLoader('players', true);
    const tbody = document.getElementById('tablePlayers');
    tbody.innerHTML = "";
    try {
        const snap = await getDocs(query(collection(db, "players"), orderBy("createdAt", "desc")));
        
        const header = document.querySelector('#players header');
        if(header && !document.getElementById('searchPlayer')) {
            const s = document.createElement('input'); 
            s.id = 'searchPlayer'; s.placeholder = '🔍 Oyuncu Ara...'; s.className = 'search-bar'; 
            s.onkeyup = () => window.filterTable('searchPlayer', 'tablePlayers');
            header.appendChild(s);
        }

        snap.forEach(doc => {
            const p = doc.data();
            tbody.innerHTML += `
            <tr id="row-${doc.id}">
                <td><img src="${p.image}" onerror="this.src='https://via.placeholder.com/50'"></td>
                <td><strong>${p.nickname}</strong><br><small>${p.realname || ''}</small></td>
                <td><span class="badge badge-role">${p.role}</span></td>
                <td><span class="badge badge-rank">${p.rank}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-btn edit" onclick="editItem('players', '${doc.id}', 'playerModal')"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn delete" onclick="customDelete('players', '${doc.id}', '${p.nickname}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });
    } finally { window.toggleLoader('players', false); }
}

// ==========================================
// 6. MAÇ YÖNETİMİ
// ==========================================

window.saveMatch = async (e) => {
    e.preventDefault();
    const status = document.getElementById('mStatus').value;
    
    let finalDate;
    if(status === 'finished') {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        finalDate = `${year}-${month}-${day}`;
    } else {
        finalDate = document.getElementById('mDate').value;
    }

    const data = {
        opponent: document.getElementById('mOpponent').value,
        tournament: document.getElementById('mTourney').value,
        date: finalDate,
        status: status,
        score1: status === 'finished' ? document.getElementById('mS1').value : 0,
        score2: status === 'finished' ? document.getElementById('mS2').value : 0,
        result: status === 'finished' ? document.getElementById('mResult').value : '',
        map: document.getElementById('mMap').value
    };

    if(editingId) {
        await updateDoc(doc(db, "matches", editingId), data);
        sendLog('update', 'matches', `Maç Düzenlendi: VS ${data.opponent}`, `Maç verileri güncellendi.`, data, currentEditingData);
        window.showToast("Maç Güncellendi");
    } else {
        data.createdAt = Date.now();
        await addDoc(collection(db, "matches"), data);
        sendLog('create', 'matches', `Fikstüre Maç Eklendi`, null, data);
        window.showToast("Maç Eklendi");
    }
    window.closeModal('matchModal'); loadMatches(); editingId = null;
};

async function loadMatches() {
    window.toggleLoader('matches', true);
    const tbody = document.getElementById('tableMatches');
    tbody.innerHTML = "";
    try {
        const snap = await getDocs(query(collection(db, "matches"), orderBy("date", "desc")));
        snap.forEach(doc => {
            const m = doc.data();
            let statusBadge = m.status === 'upcoming' 
                ? '<span style="color:var(--cs-orange)">⏳ Gelecek</span>' 
                : (m.result === 'win' ? '<span class="badge badge-rank">KAZANDI</span>' : '<span style="color:red; font-weight:bold">KAYBETTİ</span>');
            
            tbody.innerHTML += `
            <tr id="row-${doc.id}">
                <td>${statusBadge}</td>
                <td>${m.opponent}</td>
                <td>${m.status === 'finished' ? `${m.score1}-${m.score2}` : '-'}</td>
                <td>${m.date}</td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-btn edit" onclick="editItem('matches', '${doc.id}', 'matchModal')"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn delete" onclick="customDelete('matches', '${doc.id}', '${m.opponent}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });
    } finally { window.toggleLoader('matches', false); }
}

window.toggleScoreInput = (v) => {
    document.getElementById('scoreArea').style.display = v === 'finished' ? 'flex' : 'none';
    const dateInput = document.getElementById('mDate');
    if(v === 'finished') {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
        dateInput.disabled = true;
        dateInput.style.opacity = "0.5";
    } else {
        dateInput.disabled = false;
        dateInput.style.opacity = "1";
    }
};

// ==========================================
// 7. GENERIC SAVE/LOAD
// ==========================================
window.saveNews = async (e) => genericSave(e, 'news', 'nTitle', {title:'nTitle', summary:'nSummary', image:'nImage', content:'nContent'});
window.saveMedia = async (e) => genericSave(e, 'media', 'vidTitle', {title:'vidTitle', link:'vidLink', thumb:'vidThumb'});
window.saveHistory = async (e) => genericSave(e, 'history', 'hTitle', {year:'hYear', title:'hTitle', desc:'hDesc'});

async function genericSave(e, col, titleFieldId, map) {
    e.preventDefault();
    let data = {};
    for (let key in map) data[key] = document.getElementById(map[key]).value;
    
    if (col === 'news') { data.date = new Date().toLocaleDateString('tr-TR'); data.createdAt = Date.now(); }
    if (col === 'media') data.id = Date.now();

    const title = data.title || data.year;

    if(editingId) {
        await updateDoc(doc(db, col, editingId), data);
        sendLog('update', col, `${col.toUpperCase()} Güncellendi`, `${title} içeriği değiştirildi.`, data, currentEditingData);
    } else {
        await addDoc(collection(db, col), data);
        sendLog('create', col, `Yeni ${col.toUpperCase()} Paylaşıldı`, null, data);
    }
    
    window.closeModal(`${col}Modal`); 
    if(col==='news') loadNews(); if(col==='media') loadMedia(); if(col==='history') loadHistory();
    window.showToast("Kaydedildi");
    editingId = null;
}

async function loadNews() { genericLoad('news', (d) => `<div class="list-item" id="row-${d.id}"><div class="list-content"><img src="${d.data().image}"><div><strong>${d.data().title}</strong><br><small>${d.data().date}</small></div></div><div class="action-buttons"><button class="icon-btn edit" onclick="editItem('news', '${d.id}', 'newsModal')"><i class="fas fa-edit"></i></button><button class="icon-btn delete" onclick="customDelete('news', '${d.id}', '${d.data().title}')"><i class="fas fa-trash"></i></button></div></div>`); }
async function loadMedia() { genericLoad('media', (d) => `<div class="list-item" id="row-${d.id}"><div class="list-content"><strong>${d.data().title}</strong></div><div class="action-buttons"><button class="icon-btn edit" onclick="editItem('media', '${d.id}', 'mediaModal')"><i class="fas fa-edit"></i></button><button class="icon-btn delete" onclick="customDelete('media', '${d.id}', '${d.data().title}')"><i class="fas fa-trash"></i></button></div></div>`); }
async function loadHistory() { genericLoad('history', (d) => `<div class="list-item" id="row-${d.id}"><div class="list-content"><strong>${d.data().year} - ${d.data().title}</strong></div><div class="action-buttons"><button class="icon-btn edit" onclick="editItem('history', '${d.id}', 'historyModal')"><i class="fas fa-edit"></i></button><button class="icon-btn delete" onclick="customDelete('history', '${d.id}', '${d.data().title}')"><i class="fas fa-trash"></i></button></div></div>`); }

async function genericLoad(col, templateFunc) {
    window.toggleLoader(col, true);
    const w = document.getElementById(`table${col.charAt(0).toUpperCase() + col.slice(1)}`);
    if(w) w.innerHTML = "";
    try {
        const s = await getDocs(query(collection(db, col)));
        s.forEach(d => w.innerHTML += templateFunc(d));
    } finally { window.toggleLoader(col, false); }
}

// ==========================================
// 8. SİLME VE DÜZENLEME
// ==========================================
window.editItem = async (col, id, modalId) => {
    const d = await getDoc(doc(db, col, id));
    if (!d.exists()) return;
    const data = d.data();
    editingId = id; currentEditingData = data;

    window.openModal(modalId, true);
    document.querySelector(`#${modalId} .save-btn`).innerText = "GÜNCELLE";

    if(col==='players'){
        document.getElementById('pNick').value=data.nickname; document.getElementById('pReal').value=data.realname;
        document.getElementById('pRole').value=data.role; document.getElementById('pRank').value=data.rank;
        document.getElementById('pAgent').value=data.agent; document.getElementById('pCross').value=data.crosshair;
        document.getElementById('pImage').value=data.image; 
        window.previewUrl(data.image);
        window.tempSocials=data.socials||[]; window.renderSocials();
    }
    if(col==='matches'){
        document.getElementById('mOpponent').value=data.opponent; document.getElementById('mTourney').value=data.tournament;
        document.getElementById('mDate').value=data.date; document.getElementById('mStatus').value=data.status;
        
        window.toggleScoreInput(data.status);
        
        if(data.status==='finished'){ 
            document.getElementById('mS1').value=data.score1; 
            document.getElementById('mS2').value=data.score2; 
            document.getElementById('mResult').value=data.result; 
            document.getElementById('mMap').value=data.map; 
        }
    }
    if(col==='news'){ document.getElementById('nTitle').value=data.title; document.getElementById('nSummary').value=data.summary; document.getElementById('nImage').value=data.image; document.getElementById('nContent').value=data.content; }
};

window.customDelete = (col, id, name) => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('deleteItemName').innerText = name;
    modal.style.display = 'flex';

    document.getElementById('btnYes').onclick = async () => {
        document.getElementById('btnYes').innerText = "Siliniyor...";
        try {
            await deleteDoc(doc(db, col, id));
            sendLog('delete', col, 'Veri Silindi', `**Kategori:** ${col.toUpperCase()}\n**Silinen:** ${name}`);
            
            const row = document.getElementById(`row-${id}`);
            if(row) row.remove();
            window.showToast("Başarıyla Silindi", "info");
        } catch(e) { window.showToast("Silme hatası", "error"); }
        finally { modal.style.display = 'none'; document.getElementById('btnYes').innerText = "EVET, SİL"; }
    };
    document.getElementById('btnNo').onclick = () => modal.style.display = 'none';
};

// ==========================================
// 9. YARDIMCI VE INIT
// ==========================================
window.filterTable = (inputId, tableId) => {
    const input = document.getElementById(inputId);
    const filter = input.value.toUpperCase();
    const rows = document.getElementById(tableId).getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) {
        const txtValue = rows[i].textContent || rows[i].innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) rows[i].style.display = "";
        else rows[i].style.display = "none";
    }
};

function startRealtimeDashboard() {
    ['players', 'matches', 'news'].forEach(c => {
        onSnapshot(collection(db, c), snap => {
            const el = document.getElementById(`count${c.charAt(0).toUpperCase()+c.slice(1)}`);
            if(el) el.innerText = snap.size;
        });
    });
}

// Uygulamayı Başlat
checkAuth();


