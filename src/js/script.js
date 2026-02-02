/* =========================================
   1. KÜTÜPHANELER VE İMPORTLAR
   ========================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================
   2. AYARLAR (CONFIG)
   ========================================= */

// --- FIREBASE AYARLARI ---
const firebaseConfig = {
  apiKey: "AIzaSyDsxF2oJB3L9-0s4igZOAEYEl5jcRreBns",
  authDomain: "las-noches-73146.firebaseapp.com",
  projectId: "las-noches-73146",
  storageBucket: "las-noches-73146.firebasestorage.app",
  messagingSenderId: "416786450763",
  appId: "1:416786450763:web:b122b6a665df3c082dc0ce",
  measurementId: "G-HJMSDHF2V2"
};

// --- DISCORD AYARLARI ---
const CLIENT_ID = "1466766670801539117"; 
const DISCORD_SERVER_ID = "771671568405364749";
// Canlıya aldığında burayı kendi site adresinle değiştir
const REDIRECT_URI = "http://127.0.0.1:5500/index.html"; 

// --- WEBHOOK URL'LERİ ---
const JOIN_WEBHOOK_URL = "https://discord.com/api/webhooks/1464544708255547520/CMqGMits99YFybRHyFsZaZukrb3zfeES8axsdYJlBYWSzykIcHCkvx1Cmw6G11w-x3l1"; 
const SCRIM_WEBHOOK_URL = "https://discord.com/api/webhooks/1465082632717992027/tFlQmkjvzu1gZ9Ud9pXqcQPvVNmTbSYsesapAmFlpKj2vzl37NLswzIZRVgsfJJEefp0"; 

/* =========================================
   3. BAŞLATMA (INITIALIZATION)
   ========================================= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global Değişkenler
let discordUser = null;

/* =========================================
   4. TOAST BİLDİRİM SİSTEMİ
   ========================================= */
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return;

    let iconClass = 'fa-check-circle';
    if(type === 'error') iconClass = 'fa-times-circle';
    if(type === 'info') iconClass = 'fa-info-circle';

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);

    toast.addEventListener('click', () => toast.remove());
};

/* =========================================
   5. DISCORD OAUTH İŞLEMLERİ
   ========================================= */

window.loginWithDiscord = function() {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=identify`;
    window.location.href = url;
};

window.logoutDiscord = function() {
    discordUser = null;
    updateUIState(false);
    window.showToast("Başarıyla çıkış yapıldı.", "info");
    history.pushState("", document.title, window.location.pathname);
};

function checkDiscordAuth() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('access_token');

    if (accessToken) {
        fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${accessToken}` }
        })
        .then(res => res.json())
        .then(response => {
            discordUser = response;
            updateUIState(true);
            window.showToast(`Hoş geldin, ${discordUser.global_name || discordUser.username}!`, "success");
            history.pushState("", document.title, window.location.pathname + window.location.search);
        })
        .catch(err => {
            console.error(err);
            window.showToast("Giriş yapılırken hata oluştu.", "error");
        });
    }
}

function updateUIState(isLoggedIn) {
    const loginSections = document.querySelectorAll('#discordLoginSection, #scrimLoginSection');
    const userDisplays = document.querySelectorAll('#discordUserDisplay, #scrimUserDisplay');
    const forms = document.querySelectorAll('#appForm, #scrimForm');
    
    const avatars = document.querySelectorAll('#userAvatar, #scrimUserAvatar');
    const names = document.querySelectorAll('#userName, #scrimUserName');
    const idDisplay = document.getElementById('userId');
    const hiddenIdInput = document.getElementById('discordIdHidden');

    if (isLoggedIn && discordUser) {
        loginSections.forEach(el => el.style.display = 'none');
        
        const avatarUrl = discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` 
            : "https://cdn.discordapp.com/embed/avatars/0.png";

        avatars.forEach(img => img.src = avatarUrl);
        names.forEach(txt => txt.innerText = discordUser.global_name || discordUser.username);
        if(idDisplay) idDisplay.innerText = `@${discordUser.username}`;
        if(hiddenIdInput) hiddenIdInput.value = discordUser.id; 

        userDisplays.forEach(el => el.style.display = 'flex');
        forms.forEach(el => el.style.display = 'block');
    } else {
        loginSections.forEach(el => el.style.display = 'block');
        userDisplays.forEach(el => el.style.display = 'none');
        forms.forEach(el => el.style.display = 'none');
        discordUser = null;
    }
}

/* =========================================
   6. VERİTABANI İŞLEMLERİ (DATA LOADING)
   ========================================= */

async function refreshAllData() {
    await loadRoster();
    await loadMatches();
    await loadNews();
    await loadMedia();
    await loadHistory();
}

// --- 6.1 KADRO YÜKLEME ---
async function loadRoster() {
    const container = document.getElementById("dynamic-roster");
    if(!container) return;
    
    container.innerHTML = `<div class="loader-wrapper" style="position:absolute; width:100%; background:transparent;"><div class="loader-bar"></div></div>`;
    
    const q = query(collection(db, "players"), orderBy("createdAt", "asc"));
    
    try {
        const snapshot = await getDocs(q);
        container.innerHTML = ""; 
        
        if(snapshot.empty) {
            container.innerHTML = "<p style='color:white; text-align:center; width:100%; font-size:1.5rem;'>Kadro verisi bulunamadı.</p>";
            return;
        }

        snapshot.forEach(doc => {
            const p = doc.data();
            const themeClass = (p.game && p.game.toLowerCase().includes('cs')) ? 'cs-theme' : 'val-theme';

            let socialHTML = '';
            if (p.socials && Array.isArray(p.socials) && p.socials.length > 0) {
                p.socials.forEach(s => {
                    let iconClass = 'fa-link';
                    let platformClass = 'default';
                    const plat = s.platform.toLowerCase();
                    if(plat.includes('twitter') || plat.includes('x')) { iconClass = 'fa-x-twitter'; platformClass = 'twitter'; }
                    else if(plat.includes('instagram')) { iconClass = 'fa-instagram'; platformClass = 'instagram'; }
                    else if(plat.includes('twitch')) { iconClass = 'fa-twitch'; platformClass = 'twitch'; }
                    else if(plat.includes('youtube')) { iconClass = 'fa-youtube'; platformClass = 'youtube'; }
                    else if(plat.includes('discord')) { iconClass = 'fa-discord'; platformClass = 'discord'; }
                    
                    socialHTML += `<a href="${s.url}" target="_blank" class="social-icon ${platformClass}" title="${s.platform.toUpperCase()}"><i class="fab ${iconClass}"></i></a>`;
                });
            } else if (p.twitter) {
                socialHTML = `<a href="${p.twitter}" target="_blank" class="social-icon twitter"><i class="fab fa-twitter"></i></a>`;
            }

            const html = `
            <div class="pro-card ${themeClass} hidden-animate">
                <div class="role-badge">
                    <i class="fas fa-crosshairs"></i> ${p.role || 'PLAYER'}
                </div>
                <div class="card-inner">
                    <div class="card-img-wrapper">
                        <img class="card-img" src="${p.image}" alt="${p.nickname}" onerror="this.onerror=null;this.src='src/img/logo.jpeg';">
                    </div>
                    <div class="card-content">
                        <div class="main-info">
                            <h3>${p.nickname}</h3>
                            <p class="real-name">${p.realname || ''}</p>
                        </div>
                        <div class="card-details">
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <span class="lbl">MAIN AGENT</span>
                                    <span class="val">${p.agent || '-'}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="lbl">RANK</span>
                                    <span class="val">${p.rank || 'Belirtilmedi'}</span>
                                </div>
                            </div>
                            <div class="action-row">
                                <button class="copy-crosshair-btn" data-code="${p.crosshair || ''}">
                                    <i class="fas fa-bullseye"></i> CROSSHAIR
                                </button>
                            </div>
                            <div class="social-row">
                                ${socialHTML}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
            container.innerHTML += html;
        });
        
        reattachCrosshairEvents();
        
        // Animasyonları başlat
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('show-animate'); });
        });
        document.querySelectorAll('.pro-card').forEach((el) => observer.observe(el));

    } catch (e) {
        console.error("Kadro yüklenirken hata:", e);
    }
}
   

// --- 6.2 MAÇLARI YÜKLEME ---
async function loadMatches() {
    const upcomingList = document.getElementById("upcoming-list");
    const resultsList = document.getElementById("results-list");
    if(!upcomingList || !resultsList) return;
    
    // Temizle ama loader koyabilirsin istersen
    upcomingList.innerHTML = "";
    resultsList.innerHTML = "";

    // Harita Görselleri
    const mapImages = {
        'ascent': 'https://static.wikia.nocookie.net/valorant/images/e/e7/Loading_Screen_Ascent.png',
        'bind': 'https://static.wikia.nocookie.net/valorant/images/2/23/Loading_Screen_Bind.png',
        'haven': 'https://static.wikia.nocookie.net/valorant/images/7/70/Loading_Screen_Haven.png',
        'split': 'https://static.wikia.nocookie.net/valorant/images/d/d6/Loading_Screen_Split.png',
        'icebox': 'https://static.wikia.nocookie.net/valorant/images/1/13/Loading_Screen_Icebox.png',
        'breeze': 'https://static.wikia.nocookie.net/valorant/images/1/10/Loading_Screen_Breeze.png',
        'fracture': 'https://static.wikia.nocookie.net/valorant/images/f/fc/Loading_Screen_Fracture.png',
        'pearl': 'https://static.wikia.nocookie.net/valorant/images/a/af/Loading_Screen_Pearl.png',
        'lotus': 'https://static.wikia.nocookie.net/valorant/images/d/d0/Loading_Screen_Lotus.png',
        'sunset': 'https://static.wikia.nocookie.net/valorant/images/5/5c/Loading_Screen_Sunset.png',
        'abyss': 'https://static.wikia.nocookie.net/valorant/images/6/61/Loading_Screen_Abyss.png'
    };

    const getMapBg = (mapName) => {
        if(!mapName) return 'https://static.wikia.nocookie.net/valorant/images/d/d6/Loading_Screen_Split.png';
        const key = mapName.toLowerCase().trim();
        return mapImages[key] || 'src/img/logo.jpeg'; 
    };

    try {
        const q = query(collection(db, "matches"));
        const snapshot = await getDocs(q);
        let matches = [];
        snapshot.forEach(doc => matches.push(doc.data()));
        
        // Maçları tarihe göre sırala (Eskiden Yeniye)
        matches.sort((a, b) => new Date(a.date) - new Date(b.date));

        // --- GELECEK MAÇLAR ---
        const upcomingMatches = matches.filter(m => m.status === 'upcoming');
        upcomingMatches.forEach(m => {
            const bg = getMapBg(m.map);
            
            upcomingList.innerHTML += `
            <div class="match-strip upcoming hidden-animate">
                <div class="status-bar"></div>
                <div class="strip-bg" style="background-image: url('${bg}');"></div>
                
                <div class="strip-info">
                    <span class="map-name">${m.opponent}</span>
                    <div class="match-meta">
                        <span><i class="fas fa-trophy"></i> ${m.tournament || 'Hazırlık'}</span>
                        <span><i class="far fa-clock"></i> ${m.date}</span>
                    </div>
                </div>

                <div class="strip-score">
                    <span class="vs-badge">VS</span>
                </div>

                <div class="strip-opponent">
                    <span class="opp-name">${m.map || 'TBA'}</span>
                    <div class="opp-logo"><i class="fas fa-map"></i></div>
                </div>
            </div>`;
        });
        if(upcomingMatches.length === 0) upcomingList.innerHTML = "<p style='color:#666; text-align:center; padding:20px;'>Planlanmış maç yok.</p>";

        // --- MAÇ SONUÇLARI (Ters Sıralı) ---
        const finishedMatches = matches.filter(m => m.status === 'finished').reverse();
        finishedMatches.forEach(m => {
            const resultClass = m.result === 'win' ? 'win' : 'lose';
            const bg = getMapBg(m.map);
            const mapName = m.map || 'UNKNOWN';

            resultsList.innerHTML += `
            <div class="match-strip ${resultClass} hidden-animate">
                <div class="status-bar"></div>
                <div class="strip-bg" style="background-image: url('${bg}');"></div>
                
                <div class="strip-info">
                    <span class="map-name">${mapName}</span>
                    <div class="match-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${m.date}</span>
                        <span><i class="fas fa-trophy"></i> ${m.tournament || 'Dereceli'}</span>
                    </div>
                </div>

                <div class="strip-score">
                    <span class="score-box ${resultClass}">${m.score1}</span>
                    <span style="color:#555; font-size:1.5rem;">:</span>
                    <span class="score-box" style="color:#888;">${m.score2}</span>
                </div>

                <div class="strip-opponent">
                    <span class="opp-name">${m.opponent}</span>
                    <div class="opp-logo">${m.opponent.substring(0,2).toUpperCase()}</div>
                </div>
            </div>`;
        });
        if(finishedMatches.length === 0) resultsList.innerHTML = "<p style='color:#666; text-align:center; padding:20px;'>Henüz maç sonucu yok.</p>";

        // --- DÜZELTME: Animasyon Gözlemcisini Yeni Eklenen Maçlara Bağla ---
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('show-animate'); });
        });
        document.querySelectorAll('.match-strip').forEach((el) => observer.observe(el));

    } catch (e) {
        console.error("Maçlar yüklenirken hata:", e);
        upcomingList.innerHTML = "<p style='color:red; text-align:center'>Veri alınamadı.</p>";
    }
}

// --- 6.3 HABERLERİ YÜKLEME ---
async function loadNews() {
    const container = document.getElementById("dynamic-news");
    if(!container) return;
    container.innerHTML = "";
    
    const q = query(collection(db, "news"), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(doc => {
        const n = doc.data();
        // opacity:1 ekledik ki animasyon takılırsa bile görünsün
        container.innerHTML += `
        <div class="news-card hidden-animate" style="opacity:1; position:relative;">
            <div class="news-img"><img src="${n.image}" alt="Haber"><span class="news-date">${n.date}</span></div>
            <div class="news-content">
                <span class="news-tag val">VALORANT</span>
                <h3>${n.title}</h3>
                <p>${n.summary}</p>
                <button class="read-more-btn" data-title="${n.title}" data-img="${n.image}" data-date="${n.date}" data-text="${n.content}">OKU <i class="fas fa-arrow-right"></i></button>
            </div>
        </div>`;
    });
    
    setTimeout(() => {
        const newsBtns = document.querySelectorAll('.read-more-btn');
        const modal = document.getElementById('newsModal');
        newsBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('modalNewsTitle').innerText = btn.getAttribute('data-title');
                document.getElementById('modalNewsImg').src = btn.getAttribute('data-img');
                document.getElementById('modalNewsDate').innerText = btn.getAttribute('data-date');
                document.getElementById('modalNewsText').innerText = btn.getAttribute('data-text');
                modal.style.display = 'flex';
            });
        });
    }, 500);
}


async function fetchDiscordStats() {
    const countSpan = document.getElementById('memberCount');
    if(!countSpan) return;

    try {
        const response = await fetch(`https://discord.com/api/guilds/${DISCORD_SERVER_ID}/widget.json`);
        const data = await response.json();

        if(data && data.presence_count) {
            let start = 0;
            let end = data.presence_count;
            let duration = 2000;
            let range = end - start;
            let current = start;
            let increment = end > start ? 1 : -1;
            let stepTime = Math.abs(Math.floor(duration / range));
            
            let timer = setInterval(function() {
                current += increment;
                countSpan.innerText = current;
                if (current == end) {
                    clearInterval(timer);
                }
            }, stepTime);
        } else {
            countSpan.innerText = "N/A";
        }
    } catch (error) {
        console.error("Discord verisi çekilemedi. Widget açık mı?", error);
        countSpan.innerText = "-"; 
    }
}

// --- 6.4 MEDYA YÜKLEME ---
async function loadMedia() {
    const container = document.getElementById("dynamic-media");
    if(!container) return;
    container.innerHTML = "";
    
    const q = query(collection(db, "media"), orderBy("id", "desc"), limit(4));
    const snapshot = await getDocs(q);
    
    if(snapshot.empty) { container.innerHTML = "<h3 style='color:white; text-align:center'>Görüntülenecek medya yok.</h3>"; return; }
    
    snapshot.forEach(doc => {
        const m = doc.data();
        const thumb = m.thumb || 'src/img/logo.jpeg';
        
        container.innerHTML += `
        <div class="clip-item" style="position:relative; width:300px; height:200px; background:url('${thumb}') center/cover; display:inline-block; margin:10px; border-radius:10px; overflow:hidden;">
            <div class="play-overlay yt-trigger" data-youtube-id="${m.link}" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); cursor:pointer;">
                <i class="fas fa-play" style="font-size:3rem; color:white;"></i>
            </div>
            <div class="clip-info" style="position:absolute; bottom:0; width:100%; padding:10px; background:linear-gradient(to top, black, transparent);">
                <h3 style="color:white; font-size:1rem;">${m.title}</h3>
            </div>
        </div>`;
    });

    setTimeout(() => {
        const videoTriggers = document.querySelectorAll('.yt-trigger');
        const videoModal = document.getElementById('videoModal');
        const youtubePlayer = document.getElementById('youtubePlayer');

        videoTriggers.forEach(trigger => {
            trigger.addEventListener('click', () => {
                const rawId = trigger.getAttribute('data-youtube-id');
                let videoId = rawId;
                if(rawId.includes('v=')) videoId = rawId.split('v=')[1];
                else if(rawId.includes('youtu.be/')) videoId = rawId.split('youtu.be/')[1];

                if(youtubePlayer && videoModal) {
                    youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                    videoModal.style.display = 'flex';
                }
            });
        });
    }, 500);
}



// --- 6.5 TARİHÇE YÜKLEME ---
async function loadHistory() {
    const container = document.getElementById("dynamic-history");
    if(!container) return;
    container.innerHTML = "";
    
    const q = query(collection(db, "history"), orderBy("year", "asc"));
    const snapshot = await getDocs(q);
    let side = 'left';
    
    snapshot.forEach(doc => {
        const h = doc.data();
        container.innerHTML += `
        <div class="timeline-item ${side} hidden-animate" style="opacity:1;">
            <div class="timeline-content">
                <span class="date">${h.year}</span>
                <h3>${h.title}</h3>
                <p>${h.desc}</p>
            </div>
        </div>`;
        side = side === 'left' ? 'right' : 'left';
    });
}

/* =========================================
   7. 3D TILT EFEKTİ
   ========================================= */
document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.pro-card').forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / 20) * -1;
            const rotateY = (x - centerX) / 20;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
            card.style.zIndex = "10";
            card.style.setProperty('--glare-x', `${x}px`);
            card.style.setProperty('--glare-y', `${y}px`);
        } else {
            card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
            card.style.zIndex = "1";
        }
    });
});


/* =========================================
   8. SAYFA YÜKLENDİĞİNDE ÇALIŞACAKLAR
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    
    checkDiscordAuth(); 
    refreshAllData();   
    fetchDiscordStats();
    
    // Loader
    const loader = document.querySelector('.loader-wrapper');
    const body = document.body;
    body.classList.add('no-scroll');
    setTimeout(() => {
        if(loader) loader.classList.add('fade-out');
        body.classList.remove('no-scroll');
    }, 1200);

    // Scroll Animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('show-animate');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.hidden-animate').forEach((el) => observer.observe(el));

    // Menü
    const hamburger = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if(hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('active');
        });
    }
    window.closeMenu = function() {
        if(hamburger) hamburger.classList.remove('active');
        if(mobileMenu) mobileMenu.classList.remove('active');
    };
    window.openModalFromMobile = function() {
        window.closeMenu();
        document.getElementById('joinModal').style.display = 'flex';
    };

    // Tabs
    window.openTab = function(evt, tabName) {
        var i, tabcontent, tablinks;
        tabcontent = document.getElementsByClassName("tab-content");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
            tabcontent[i].classList.remove("active");
        }
        tablinks = document.getElementsByClassName("tab-btn");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        const selectedTab = document.getElementById(tabName);
        if(selectedTab) {
            selectedTab.style.display = "flex";
            setTimeout(() => selectedTab.classList.add("active"), 10);
        }
        if(evt) evt.currentTarget.className += " active";
    };

    // Typewriter
    const typeText = "Taktiksel zeka ve keskin aim'in buluşma noktası. Las Noches arenaya hükmediyor.";
    const typeElement = document.getElementById('typewriter');
    if (typeElement) {
        let i = 0;
        function typeWriter() {
            if (i < typeText.length) {
                typeElement.innerHTML += typeText.charAt(i);
                i++;
                setTimeout(typeWriter, 50); 
            } else {
                typeElement.innerHTML += '<span class="cursor-blink"></span>';
            }
        }
        setTimeout(typeWriter, 1500); 
    }

    // Webhooks ve Formlar
    const appForm = document.getElementById('appForm');
    const formContainer = document.getElementById('applicationFormContainer');
    const submitBtn = document.getElementById('submitBtn');

    // --- GÜNCELLENMİŞ TAKIMA KATILIM FORMU LOGİC'İ ---
    if (appForm) {
        appForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // 1. Giriş Kontrolü
            if (!discordUser) { 
                window.showToast("Lütfen önce Discord ile giriş yapın!", "error"); 
                return; 
            }

            // 2. Form Verilerini Al
            const ign = document.getElementById('ign').value;
            const rank = document.getElementById('rankSelect').value;
            const age = document.getElementById('ageSelect').value;
            const tracker = document.getElementById('trackerLink').value;
            
            // Seçili rolü bul (Radio button)
            const roleInput = document.querySelector('input[name="role"]:checked');
            const role = roleInput ? roleInput.value : "Belirtilmedi";

            // 3. Butonu Yükleniyor Moduna Al
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GÖNDERİLİYOR...';
            submitBtn.disabled = true;

            // 4. Discord Profil Resmi (Varsa)
            const avatarUrl = discordUser.avatar 
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` 
                : "https://i.imgur.com/AfFp7pu.png";

            // 5. Webhook Veri Paketi (Payload)
            const payload = {
                username: "Las Noches Recruit",
                avatar_url: "https://i.imgur.com/AfFp7pu.png",
                embeds: [{
                    title: `🛡️ Yeni Oyuncu Başvurusu: ${ign}`,
                    description: "**Las Noches** kadrosuna katılmak için yeni bir başvuru alındı.",
                    color: 16729685, // Val-Red Rengi
                    thumbnail: { url: avatarUrl },
                    fields: [
                        { name: "🎮 Ana Rol", value: role, inline: true },
                        { name: "🏆 Rank", value: rank, inline: true },
                        { name: "🎂 Yaş", value: age, inline: true },
                        { name: "🔗 Tracker", value: `[Profile Git](${tracker})`, inline: false },
                        { name: "👤 Discord", value: `<@${discordUser.id}>`, inline: false }
                    ],
                    footer: { text: "Las Noches Başvuru Sistemi", icon_url: "https://i.imgur.com/AfFp7pu.png" },
                    timestamp: new Date().toISOString()
                }]
            };

            // 6. Webhook Gönderimi
            fetch(JOIN_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }).then(res => {
                if(res.ok) {
                    formContainer.style.display = 'none';
                    window.showToast("Başvurunuz koçlara iletildi!", "success");
                    document.getElementById('successMessage').style.display = 'block';
                    
                    // 3 saniye sonra modalı kapat ve formu sıfırla
                    setTimeout(() => { 
                        document.getElementById('joinModal').style.display = 'none'; 
                        // Formu eski haline getir
                        document.getElementById('successMessage').style.display = 'none';
                        formContainer.style.display = 'block';
                        appForm.reset();
                        submitBtn.innerHTML = '<span>BAŞVURU GÖNDER</span>';
                        submitBtn.disabled = false;
                    }, 3000);
                } else {
                    throw new Error("Webhook hatası");
                }
            }).catch(err => {
                console.error(err);
                window.showToast("Bir hata oluştu, lütfen tekrar deneyin.", "error");
                submitBtn.innerHTML = '<span>BAŞVURU GÖNDER</span>';
                submitBtn.disabled = false;
            });
        });
    }

    const scrimForm = document.getElementById('scrimForm');
    const scrimBtn = document.getElementById('scrimSubmitBtn');
    
    // --- GÜNCELLENMİŞ SCRIM FORMU LOGİC'İ ---
    if (scrimForm) {
        scrimForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!discordUser) { window.showToast("Lütfen giriş yapın!", "error"); return; }

            const teamName = document.getElementById('teamName').value;
            const date = document.getElementById('scrimDate').value.replace('T', ' '); // Tarih formatı düzeltme
            const avgElo = document.getElementById('avgElo').value;
            
            scrimBtn.innerHTML = 'GÖNDERİLİYOR...';
            scrimBtn.disabled = true;

            const payload = {
                username: "Las Noches Scrim",
                embeds: [{
                    title: `⚔️ VS İsteği: ${teamName}`,
                    description: `<@${discordUser.id}> bir hazırlık maçı ayarlamak istiyor.`,
                    color: 15105570, // CS Orange tonu
                    fields: [
                        { name: "Tarih & Saat", value: date, inline: false },
                        { name: "Avg Elo", value: avgElo, inline: true },
                        { name: "Kaptan", value: `<@${discordUser.id}>`, inline: true }
                    ],
                    footer: { text: "Las Noches Scrim System" }
                }]
            };

            fetch(SCRIM_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }).then(res => {
                if(res.ok) window.showToast("Scrim isteği koçlara iletildi!", "success");
                document.getElementById('scrimModal').style.display = 'none';
                scrimForm.reset();
                scrimBtn.innerHTML = "<span>SCRIM İSTEĞİ GÖNDER</span>";
                scrimBtn.disabled = false;
            }).catch(err => {
                window.showToast("Hata oluştu.", "error");
                scrimBtn.innerHTML = "<span>SCRIM İSTEĞİ GÖNDER</span>";
                scrimBtn.disabled = false;
            });
        });
    }
    const modals = document.querySelectorAll('.modal');
    const closeBtns = document.querySelectorAll('.close-btn, .close-scrim, .close-news, .close-video');
    
    closeBtns.forEach(btn => btn.addEventListener('click', () => {
        modals.forEach(m => m.style.display = 'none');
        const iframe = document.getElementById('youtubePlayer');
        if(iframe) iframe.src = "";
    }));

    document.getElementById('openModalBtn').addEventListener('click', () => {
        document.getElementById('joinModal').style.display = 'flex';
    });
    
    const openScrimBtn = document.getElementById('openScrimBtn');
    if(openScrimBtn) openScrimBtn.addEventListener('click', () => {
        document.getElementById('scrimModal').style.display = 'flex';
    });

    window.reattachCrosshairEvents = function() {
        const btns = document.querySelectorAll('.copy-crosshair-btn');
        btns.forEach(btn => {
            btn.onclick = function() {
                const code = btn.getAttribute('data-code');
                navigator.clipboard.writeText(code);
                const oldText = btn.innerHTML;
                btn.innerHTML = "KOPYALANDI!";
                window.showToast("Crosshair kodu kopyalandı!", "success");
                setTimeout(() => btn.innerHTML = oldText, 2000);
            };
        });
    };

    const canvas = document.getElementById('matrixCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const chars = "LASNOCHES01";
    const drops = Array(Math.floor(canvas.width / 20)).fill(1);
    
    function drawMatrix() {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0f0";
        ctx.font = "15px monospace";
        for (let i = 0; i < drops.length; i++) {
            const text = chars.charAt(Math.floor(Math.random() * chars.length));
            ctx.fillText(text, i * 20, drops[i] * 20);
            if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
        requestAnimationFrame(drawMatrix);
    }
    
    let tapCount = 0;
    document.querySelector('.brand').addEventListener('click', () => {
        tapCount++;
        if(tapCount === 7) {
            document.body.classList.add('hacked-mode');
            document.getElementById('hackedOverlay').style.display = 'flex';
            setTimeout(() => document.getElementById('hackedOverlay').style.display = 'none', 3000);
            canvas.style.display = 'block';
            drawMatrix();
            window.showToast("SİSTEM HACKLENDİ!", "error");
        }
        setTimeout(() => tapCount = 0, 500);
    });

// --- GELİŞMİŞ CURSOR MANTIĞI ---
    // --- GELİŞMİŞ PRO CURSOR MANTIĞI ---
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');

    // Mouse Hareketini Takip Et
    document.addEventListener('mousemove', (e) => {
        // Küçük nokta anlık takip eder
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
        
        // Büyük çember hafif gecikmeli gelir (Akıcılık hissi)
        // requestAnimationFrame kullanarak performansı artırıyoruz
        requestAnimationFrame(() => {
            follower.style.left = e.clientX + 'px';
            follower.style.top = e.clientY + 'px';
        });
    });

    // Hover (Üzerine Gelme) Efekti
    // 'mouseover' kullanarak tüm elementleri dinliyoruz (Event Delegation)
    document.addEventListener('mouseover', (e) => {
        // Etkileşime girilecek elementlerin listesi
        const target = e.target.closest('a, button, input, select, textarea, .pro-card, .match-strip, .clip-item, .faq-question, .role-selector label, .map-check, .news-card');

        if (target) {
            follower.classList.add('active');
            cursor.classList.add('active');
        } else {
            follower.classList.remove('active');
            cursor.classList.remove('active');
        }
    });

    // Tıklama (Click) Efekti - Silah tepmesi gibi
    document.addEventListener('mousedown', () => {
        follower.classList.add('click');
        cursor.style.transform = "translate(-50%, -50%) scale(0.5)";
    });

    document.addEventListener('mouseup', () => {
        follower.classList.remove('click');
        // Hover durumundaysa hover boyutuna dön, değilse normale dön
        if(follower.classList.contains('active')) {
             cursor.style.transform = "translate(-50%, -50%) scale(0.5)";
        } else {
             cursor.style.transform = "translate(-50%, -50%) scale(1)";
        }
    });


    window.addEventListener('click', (e) => {
        // Tıklanan elementin class listesinde 'modal' var mı?
        // (Yani şeffaf siyah arka plana mı tıklandı?)
        if (e.target.classList.contains('modal')) {
            
            // 1. Tıklanan modalı gizle
            e.target.style.display = 'none';

            // 2. Eğer kapatılan modal "Video Modalı" ise videoyu durdur
            // (Yoksa arkada çalmaya devam eder)
            const iframe = document.getElementById('youtubePlayer');
            if (iframe && e.target.id === 'videoModal') {
                iframe.src = ""; 
            }
        }
    });

});

// --- S.S.S. (FAQ) ACCORDION ---
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const item = question.parentElement;
            
            // İsteğe bağlı: Diğer açık olanları kapatmak için
            document.querySelectorAll('.faq-item').forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });

            // Tıklananı aç/kapat
            item.classList.toggle('active');
        });
    });

    // --- CLICK SPARK EFFECT ---
document.addEventListener('click', (e) => {
    const spark = document.createElement('div');
    spark.classList.add('click-spark');
    spark.style.left = e.pageX + 'px';
    spark.style.top = e.pageY + 'px';
    document.body.appendChild(spark);

    setTimeout(() => {
        spark.remove();
    }, 500);
});

window.onscroll = function() {
    handleScroll();
};

function handleScroll() {
    // 1. Progress Bar Mantığı
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    document.getElementById("myBar").style.width = scrolled + "%";

    // 2. Başa Dön Butonu Mantığı
    var scrollBtn = document.getElementById("scrollToTop");
    if (winScroll > 300) {
        scrollBtn.classList.add("visible");
    } else {
        scrollBtn.classList.remove("visible");
    }
}

// Butona tıklama olayı
document.getElementById("scrollToTop").onclick = function() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

