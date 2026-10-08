# TANKY TUNKY — Game Brief (source of truth)

> Original project brief from the product owner, kept verbatim (Turkish). If context is lost, resume from here.
> Note: the brief mentions phase branches (`phase/01-skeleton`); in this cloud session work happens on the
> session branch — see `docs/DECISIONS.md` (D-001).

Repo: github.com/turkmavzer-cell/tanky_tunky
Tür: Mobil (Android, yatay) izometrik tank savaş oyunu, sis savaşı (fog of war) ve asimetrik görüş mekaniği ile.

Sen bu projenin baş mühendisi, oyun tasarımcısı ve QA'sısın. Hedef: dünya standardında hissettiren, tamamen offline çalışan, akıcı ve eğlenceli bir oyun. Ödün verme: önce çalışsın, sonra parlasın, her adımda doğrula.

İletişim dili Türkçe. Kod, yorum, commit mesajları İngilizce. Oyun içi metinler i18n ile (TR varsayılan, EN ve AR hazır).

---

## 0. ÇALIŞMA ŞEKLİ

**Otonomi:** Küçük belirsizliklerde en makul varsayımı seç, `docs/DECISIONS.md`'ye gerekçesiyle yaz, devam et. Sadece geri dönüşü pahalı büyük mimari ikilemlerde dur ve sor.

**Kendi işini doğrula:** "Bitti" demek için kanıt gerekir. Her aşamada: derleme, lint, birim testleri, headless oyun testi ve görsel doğrulama çalışmış ve geçmiş olmalı. Çalıştıramadığını "çalışıyor" diye raporlama. Çalışmayanı açıkça yaz.

**Paralel çalış:** Birbirinden bağımsız işleri alt ajanlara böl. Alt ajanlara net arayüz sözleşmesi (TypeScript interface) ver, sonuçlarını entegre eden sen ol. Keşif ve geniş arama işlerini salt-okunur ajanlara yaptır.

**Bağlam disiplini:** `CLAUDE.md`: mimari özet, komutlar (build/test/lint/apk), kodlama kuralları, aşama durumu. Her aşama sonunda güncelle.

**Git akışı:** Her aşama ayrı branch, küçük anlamlı commit'ler (Conventional Commits), aşama sonunda PR, CI yeşilse `main`'e birleştir. Önemli işler için GitHub Issue. `main` her zaman derlenebilir ve oynanabilir.

**Dürüst raporlama:** Her aşama sonunda `docs/PROGRESS.md`: ne çalışıyor, ne çalışmıyor, ölçülen FPS/boyut, bilinen hatalar.

## 1. MOTOR KARARI (zaman kutulu, ölçüme dayalı)

`docs/ENGINE_DECISION.md`: Phaser 3, PixiJS, Three.js/Babylon.js (ortografik izometrik), Godot 4, Unity, Defold, Cocos Creator, Kaplay/Excalibur.

Kriterler: React/Vite/TypeScript/Capacitor uyumu, GitHub Actions'ta bulut APK build, orta seviye Android'de 60 FPS, APK < 40 MB, offline, çoklu dokunuş, izometrik depth sort, sis maskeleme performansı, CLI'dan test edilebilirlik.

Kanıt zorunlu: En iyi 2 adayla 96×96 izometrik tile haritası + 200 mermi/parçacık + sis maskesi içeren benchmark spike, headless tarayıcıda (Playwright, CPU throttling 4x) frame süresi ölçümü, tablo. Unity/Godot seçilirse GitHub Actions ile APK üretimi de kanıtlanmalı.

## 2. OYUN ÖZETİ

- Atari sadeliğinde, modern görünümlü, hızlı tank savaşı.
- Yalnızca yatay ekran, kilitli, immersive tam ekran.
- İzometrik 2:1 dimetrik harita, Warcraft hissinde boyalı/stilize fantezi-askeri dünya.
- Solda kayan sanal joystick; sağda ATEŞ (basılı tut = güç biriktir), YETENEK ve duraklat.
- **Görüş asimetrisi:** her tank yalnızca yakın çevresini görür. **Sadece Tuzakçı tüm haritayı görür**; sol üst mini haritada düşmanlar kırmızı nokta.
- "Hızlı = güçsüz, yavaş = güçlü".

## 3. TANK SINIFLARI (`src/data/tanks.json`, kodda sabit değer yok)

| Sınıf | Hız | Can/Zırh | Ateş | Görüş | Özel yetenek |
|---|---|---|---|---|---|
| Çevik (Scout) | Çok yüksek | Düşük | Düşük, seri | Orta | Dash, küçük hitbox |
| Ağır (Heavy) | Çok düşük | Çok yüksek | Çok yüksek, yavaş şarj | Küçük | Siper modu (+%40 zırh, mermi sektirme) |
| Dengeli (Standard) | Orta | Orta | Orta | Orta | Geçici kalkan |
| Topçu (Artillery) | Düşük | Düşük | Kavisli, alan hasarı | Orta | Engel üstünden atış, min. menzil |
| Tuzakçı (Trapper) | Orta-düşük | Düşük-orta | Düşük | TÜM HARİTA + mini harita | 6 tür tuzak |

- Ayrı silüet, taret/gövde ayrımı, ses karakteri, takım rengine ek şekil işareti (renk körü dostu).
- Meta ilerleme: sınıf başına 3 yükseltme dalı (zırh, motor, top), kredi ile.

## 4. KONTROL VE ŞARJLI ATEŞ

- Joystick: floating, ölü bölge, yumuşatma, analog hız; izometrik dünyaya dönüşüm (ekranda yukarı = dünyada çapraz). Gövde hareket yönüne yumuşak döner, taret bağımsız (otomatik hedefleme yardımı ayarı).
- Kısa dokunuş: hızlı atış (cooldown). Basılı tutma: 0–100% güç, namluda ve butonda halka; süre sınıfa bağlı. Bırakınca hasar/hız/menzil/patlama yarıçapı 1x→3x (eğri `data/` içinde).
- %100'de "mükemmel şarj" ışığı/sesi; fazla tutarsan aşırı ısınma (kısa kilit). Şarjda tank yavaşlar (%20–50, sınıfa göre).
- Heavy mermisi duvardan bir kez seker. Topçu mermisi kavislidir.
- Geri bildirim: kamera shake, Haptics (şarja göre desen), duman, kıvılcım, hasar sayıları.
- Çoklu dokunuş: joystick + ateş + yetenek aynı anda. Butonlar ≥48dp, sol/sağ el modu, konum ayarı.
- Geliştirme için WASD + fare + boşluk.

## 5. GÖRÜŞ SİSTEMİ (FOG OF WAR)

Normal tanklar: görüş yarıçapı, yumuşak kenar; gerçek LOS (shadowcasting/raycast; duvar, kaya, yüksek zemin keser), ~15–20 Hz hesap + render interpolasyonu; orman içindeki tank yalnızca çok yakından görünür; keşfedilen alan koyu "hafıza" (düşman göstermez); görünmeyen düşman render edilmez/hedeflenemez; ipuçları: motor sesi, mermi ıslığı, kenarda yön oku. Mini harita yok.

Tuzakçı: tüm harita açık; sol üst mini harita (düşman kırmızı nokta + yön çentiği, müttefik mavi, kendi tuzakları turuncu, hedefler simgeli); dokununca tam harita modu (oyun akar; "haritada yavaşlat" ayarı); tam haritadan tuzak hedefi seçimi (menzil içinde). Denge: ana ekran görüşü sınırlı; orman/yüksek zemindeki düşman noktaları titrer; düşük can, yavaş ateş, tuzak limit/cooldown.

Teknik: `VisibilitySystem` tek doğruluk kaynağı (render, AI, ateş kilidi, ses). Bitmask hücre ızgarası, nesne havuzu. Sis: ayrı karanlık katman + maske, düşük çözünürlükte üret, bulanık büyüt. Kalite seviyeleri. Birim testleri: LOS doğruluğu, simetri, performans bütçesi.

## 6. TUZAK SİSTEMİ (`src/data/traps.json`)

Düşmana görünmez (≤1,5 tile'dan soluk parıltı), mini haritada yalnızca Tuzakçı ve takımına görünür.
1. Mayın: büyük hasar + savrulma
2. Çamur ağı: 4 sn %70 yavaşlatma
3. Dikenli bariyer: yolu geçici kapatır, mermiyle kırılır
4. Alarm/Beacon: tetiklenince düşmanı 6 sn tüm takıma açık işaretler
5. Hologram yem: sahte tank, AI'yı yanıltır
6. Sis bombası: alanda geçici görüş kapatma (dost-düşman fark etmez)

Kurallar: en fazla 6 tuzak, tür başına cooldown, 0,8 sn bırakma süresi (savunmasız), tetiklenince bildirim + mini harita ping.

## 7. DÜNYA VE HARİTA

- 2:1 tile (128×64), yükseklik katmanları (plato, uçurum, rampa); yüksekte görüş +1, alçaktan yükseğe isabet düşer.
- Arazi: çim, çamur, kum, derin su (geçilmez), sığ su, orman, kaya, yıkılabilir duvar/sandık, köprü, harabe, kale kapısı. Yıkılabilirler LOS ve yol bulmayı günceller.
- Prosedürel (seed'li): simplex gürültü + kural tabanlı üs/köprü/geçit + flood-fill erişilebilirlik + adalet kontrolü. Günlük seed. 5 el yapımı kampanya haritası (Tiled JSON).
- Boyutlar: 40×40, 64×64, 96×96. Chunk çizim, kamera culling.
- Dinamik hava ve gün/gece oynanışı etkiler (görüş), meşaleler ışık.
- (x+y) z-sort, ağaç arkasında silüet outline.
- Kamera: yumuşak takip, ileri bakış, şarjda zoom-out, shake.
- Ortam: ağaç sallanması, su dalgası, palet izleri, ortam sesleri.

## 8. MODLAR

1. Kampanya (12 bölüm, her 4 bölümde patron). 2. Hayatta Kal (dalgalar + roguelite kart). 3. Takım Savaşı (bot, 3v3/5v5). 4. Hızlı Maç. 5. Günlük Meydan Okuma (sabit seed, yerel skor). 6. Çok oyunculu zorunlu değil ama mimari hazır: deterministik sabit adım, girdi/durum ayrımı, seed'li RNG, anlık görüntü → replay.

## 9. YAPAY ZEKA

FSM/davranış ağacı (devriye → şüphe → takip → saldırı → geri çekilme → siper). AI aynı sis kurallarına tabi. A* (arazi maliyetli), yol yumuşatma, çarpışma önleme. Sınıf rolleri. Zorluk: tepki süresi, isabet hatası, şarj kullanımı, taktik derinlik.

## 10. TEST, DENGE VE DOĞRULAMA

1. Headless simülasyon (Node, deterministik). 2. Bot-vs-bot denge döngüsü (%45–55 bandı, `docs/BALANCE_REPORT.md`). 3. Playwright E2E (mobil viewport, dokunmatik, ekran görüntüsü + kendin bak). 4. Performans kapısı: CPU 4x throttle, 96×96, p95 < 22 ms (`docs/PERF.md`, CI regresyon). 5. Vitest birim testleri. 6. Fuzz/property harita testleri. 7. Game feel kontrol listesi (`docs/PLAYTEST_CHECKLIST.md`).

## 11. MİMARİ

TS strict. `src/core`, `src/world`, `src/entities`, `src/systems`, `src/ui`, `src/data`, `src/scenes`, `src/sim`, `tests/`, `docs/`. Simülasyon çekirdeği render'dan bağımsız. Sabit adım 60 Hz + interpolasyon. Izgara geniş faz + daire/OBB dar faz. Pooling. Kayıt (Preferences + localStorage fallback, sürümlü şema). Ayarlar (kalite, ses, titreşim, kontrol, el, dil, FPS 30/60, yüksek kontrast sis, shake azaltma). Otomatik pause, yükleme ekranı, hata günlüğü.

## 12. GÖRSEL VE SES

Telifli varlık yok; prosedürel/vektör sprite'lar, atlas yükleyici. Gövde + bağımsız taret. Parçacıklar. Ses tamamen prosedürel (Web Audio), pozisyonel; görünmeyen düşmanlara boğuk filtre. Koyu askeri-fantezi UI, renk körü dostu. İlk 3 dakika öğretici.

## 13. ANDROID VE CI/CD

Capacitor Android, `sensorLandscape`, immersive, safe-area, ekran açık, internet izni yok. Haptics, App, Preferences, Splash. GitHub Actions: PR'da lint+tip+test+sim+Playwright+perf; `main`'de debug APK; tag'de imzalı release APK/AAB (sabit keystore, Secrets; `docs/RELEASE.md`). Cache. Bütçe: APK < 40 MB, açılış < 3 sn, 60 FPS (alt 45).

## 14. AŞAMALAR

1. İskelet (CLAUDE.md, motor kararı, Capacitor, yatay kilit, sabit adım, `src/sim`, CI + APK)
2. İzometrik dünya (tile, kamera, z-sort, arazi, prosedürel üretici + testler)
3. Tank ve kontrol (joystick, hareket, taret, ateş, şarj, mermi, çarpışma, hasar, haptics) → **APK ile oynanış hissi testi için dur**
4. Görüş sistemi
5. Sınıflar ve Tuzakçı haritası
6. Tuzaklar
7. AI
8. Headless simülasyon ve denge döngüsü
9. Modlar ve ilerleme
10. Cila
11. Sürüm (v1.0.0)

## 15. TESLİM KRİTERLERİ

- CI yeşil, imzalı APK artifact.
- 96×96, CPU 4x: p95 frame < 22 ms.
- Normal tankta sis + LOS doğru; Tuzakçı'da tam harita + kırmızı noktalar (test + ekran görüntüsü).
- Çoklu dokunuşta joystick + şarjlı ateş + yetenek sorunsuz.
- 5 sınıf belirgin farklı; bot simülasyonunda %45–55 bandı.
- Aynı seed + girdi = aynı maç.
- İlk açılıştan 60 sn içinde oynanıyor.
