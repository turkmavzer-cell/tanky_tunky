# Tanky Tunky — Değişiklik ve Konuşma Günlüğü

Bu dosya projenin **tek hafıza defteridir**. Sohbet arayüzü her yerde görünmese bile, burada her değişiklik,
yenilik, düzeltme, geri alma, karar ve sahibinin (Cihan) isteği kayıtlıdır. Yeni bir oturum açan herkes
(insan veya Claude) önce `CLAUDE.md`, sonra bu dosyayı okur.

## 1. Bu dosya nasıl çalışır

- **Kayıt kuralı:** Her değişiklik, yenilik, düzeltme, geri alma, karar veya sahibinin yeni isteği aynı commit içinde
  buraya yazılır. Elle düzenlemek yerine script kullanılır:

  ```
  npm run log -- <tür> "Kısa başlık" "İsteğe bağlı ayrıntı"
  ```

  Türler: `yenilik`, `degisiklik`, `duzeltme`, `geri-alma`, `karar`, `konusma`, `acik-soru`.
  Script yeni kaydı aşağıdaki `LOG:START` işaretinin hemen altına, en yeni en üstte olacak şekilde ekler.
- **Kontrol:** `.github/workflows/changelog-check.yml` her push/PR'da `src/`, `android/app/` veya `tools/`
  değişmiş ama bu dosya değişmemişse GitHub Actions'ta **uyarı** verir (build'i bozmaz).
- **Doğruluk kuralı:** Çalıştırılıp doğrulanmayan şey "çalışıyor" diye yazılmaz. Emin olunmayan bilgi
  "doğrulanmadı" diye işaretlenir.
- **Diğer dokümanlarla ilişki:** Ayrıntılı ölçümler `PROGRESS.md`, kararların gerekçeleri `DECISIONS.md`,
  performans `PERF.md`, gerçek cihaz listesi `PLAYTEST_CHECKLIST.md` içindedir. Bu dosya hepsini zaman çizgisinde birbirine bağlar.

## 2. Oyun şu an nasıl işliyor (özet, 2026-10-09, commit `5b8654e`)

- **Tür:** Android, yatay, çevrimdışı izometrik tank savaşı (PixiJS 8 + React menüler + Capacitor).
- **Kontrol:** Solda kayan joystick, sağda basılı tutarak şarj edilen ATEŞ (1x → 3x hasar), YETENEK ve duraklat butonları.
  Çoklu dokunuş çalışıyor. Klavye/fare geliştirme için var.
- **Sınıflar (kodda şu an):** Çevik, Ağır, Dengeli, Topçu, Tuzakçı. Değerler `src/data/tanks.json`. Yetenekler henüz boş.
- **Harita:** Seed'li, nokta-simetrik, adil üretim (40/64/96). Nehir/köprü, plato/rampa, orman, yıkılabilir duvar.
- **Yapay zeka:** Sadece geçici botlar (`dummyBot.ts`). Gerçek AI Faz 7.
- **Sis savaşı:** Henüz yok (Faz 4).
- **Simülasyon:** Deterministik, 60 Hz sabit adım, render'dan bağımsız (`src/sim`). Aynı seed + girdi = aynı sonuç hedefi.
- **APK:** Sadece GitHub Actions üretir (`Android APK` iş akışı). Sabit debug keystore repoda (`keystore/debug.keystore`),
  güncellemeler aynı imzayla üst üste kurulur. Release imzası GitHub Secrets'tan (`docs/RELEASE.md`).
- **Git:** Tek branch `claude/tanky-tunky-setup-dw06hp` (D-001). `main` + PR akışı sahibin onayını bekliyor.

## 3. Açık sorular ve bekleyenler

- **Tuzakçı kaldırıldı mı?** Sahibi oyundan kaldırıldığını söyledi (2026-10-09). Repo kopyasında (`5b8654e`) hâlâ var.
  Kod, `tanks.json`, `TANKS.md`, `CLAUDE.md` yol haritası güncellenmeli. Bkz. 2026-10-09 kayıtları.
- **Tüm haritayı kim görecek?** Tuzakçı gidince "sadece Tuzakçı tüm haritayı görür" mekaniği ve mini harita/tuzak
  fazları (5–6) yeniden tasarlanmalı. Sahibin kararı bekleniyor.
- **Yetenek tablosu** (`docs/TANKS.md`) boş. Sahibi dolduracak veya taslağı onaylayacak.
- **Gerçek cihaz testi** (his, titreşim, ses, FPS, INTERNET izni olmadan WebView) yapılmadı.
- **Git akışı:** `main` + PR'a geçilsin mi? (D-001)
- **Tank görselleri:** Nano Banana ile üretilecek, sahibi görselleri paylaşacak. Sonra `tools/import-art` yazılacak.

## 4. Günlük (en yeni en üstte)

<!-- LOG:START -->
### 2026-10-10 — [acik-soru] Tank güncellemesi kararları bekliyor
Sorular: taramalı ateş sadece Çevik'te mi; gümbürtü/görünmezlik şu anki değerleri; ateş edince görünmezlik bozulsun mu; Dengeli/Topçu skill seçimleri; dolma süreleri; sıra (taret+menü önce mi, tank güncellemesi mi). Not: Tuzakçı kodda hâlâ var (sahibi kaldırıldığını söyledi).
### 2026-10-10 — [konusma] Sahibi tank güncellemesi istedi: hızlı tank, taramalı ateş, 2 skill/tank
İstekler: (1) Çevik tank biraz daha hızlı; (2) ateşleme taramalı gibi hızlı ve seri, mermi başına hasar düşük; (3) her tankta 2 skill: birincisi hızlı dolan (5 veya 10 sn), ikincisi ulti (30/45 sn); (4) Çevik: 1. görünmezlik, ulti = ateş hızı x3 (10/sn -> 30/sn); (5) Ağır: 1. gümbürtü dalgası biraz daha büyük, merkezden uca aynı hasar, hasar artsın; ulti = canı bir kerede fulle, dolma 45-60 sn; (6) Dengeli ve Topçu için ulti önerisi istendi. Kod okundu: sim'de yetenek mantığı yok (BTN_ABILITY sim.ts içinde kullanılmıyor), ateş = dokun/şarj/bırak. Repoda görünmezlik ve gümbürtü yok, bilgisayardaki oturumda olup olmadığı soruldu. Henüz kod yazılmadı, plan sohbette sunuldu.
### 2026-10-10 — [acik-soru] Multiplayer için kararlar bekliyor
Sorular: (a) online mı, aynı Wi-Fi mı? (b) INTERNET izni eklenmesi (şu an yok, CLAUDE.md) kabul mü? (c) kaç oyuncu, hangi mod? (d) tek oyunculuda yön bulma yardımı (mini harita yok). Netcode: sim deterministik (D-004), kilit adımlı (lockstep) girdi aktarımı mümkün, iki farklı cihazda doğrulanmadı.
### 2026-10-10 — [acik-soru] Taret nişanı ekranda görünmeyen düşmanlara kilitleniyor (hata)
Neden (kod okundu, çalıştırılmadı): GameScene.assistTarget() sadece mesafeye bakıyor (menzil x 1,15), ekranda/görüşte olup olmadığına bakmıyor. İstenen: sadece ekranda görünen düşmana nişan. Faz 4'te VisibilitySystem'e bağlanacak. Henüz düzeltilmedi.
### 2026-10-10 — [konusma] Sahibi yeni istekler: Tek/Çok oyunculu menü, ilerleme modu, büyük harita + düşman
Sahibi şunları istedi: (1) açılışta Tek Oyunculu ve Çok Oyunculu seçenekleri, gerekirse ek menüler; (2) multiplayer ve ilerleme (progression) modu; (3) singleplayer için daha büyük harita, belirli yerlerde düşman askerler ve savunma kuleleri. Önce karar verilecek, kod yazılmadı. Plan sohbette sunuldu: sıra = taret nişan düzeltmesi + menü iskeleti, görüş sistemi, PvE varlıkları, kampanya haritası, ilerleme, multiplayer (en son).

### 2026-10-09 — [konusma] Tuzakçı oyundan kaldırıldı (sahibinin kararı)
Sahibi Tuzakçı'nın oyundan kaldırıldığını bildirdi. Nano Banana prompt listesinden çıkarıldı (4 tank kaldı).
Repo kopyasında hâlâ var, kod/dokümanlar henüz güncellenmedi. Açık soru: tüm haritayı görme mekaniği ne olacak?

### 2026-10-09 — [konusma] Nano Banana tank promptları (4 sınıf)
Sınıflar: Dengeli, Çevik, Ağır, Topçu. Ortak stil: izometrik 2:1 dimetrik, sağ alta bakan, boyalı fantezi-askeri,
mavi takım rengi, düz macenta (#FF00FF) arka plan (sonra silmek kolay olsun diye), gölge/yazı/logo yok.
Sınıfları silüetten ayırmak için emblem şekilleri: Dengeli = kalkan, Çevik = üçgen, Ağır = kare, Topçu = daire.
Üretilen görseller sahibi tarafından paylaşılacak; kırmızı takım renk değişimiyle yapılacak.

### 2026-10-09 — [yenilik] Değişiklik günlüğü ve otomatik kayıt altyapısı eklendi
`docs/CHANGELOG.md`, `tools/changelog.mjs`, `npm run log`, `.github/workflows/changelog-check.yml` ve
`CLAUDE.md` içine "kayıt kuralı" eklendi. Branch: `docs/changelog` (ana çalışma branch'ine dokunulmadı).

### 2026-10-09 — [konusma] Repo incelemesi ve plan
Repo okundu (`5b8654e`). `CLAUDE.md` var ve güncel (Faz 3'e kadar). Faz 0–3 tamam, Faz 4–11 bekliyor.
Önerilen sıra: cihaz testi → yetenek tablosu → Faz 4 görüş → Faz 5 sınıflar → Faz 6 tuzaklar → Faz 7 AI →
Faz 8 denge → Faz 9–11 modlar/cila/sürüm. Not: Tuzakçı sonradan kaldırıldı, Faz 5–6 değişecek.

### 2026-10-09 — [karar] APK güncelleme/imza hatası hakkında teşhis
İlk tahmin ("her build rastgele geçici anahtarla imzalanıyor") repo okununca **kısmen yanlış** çıktı: sabit debug keystore
zaten commit'li (`keystore/debug.keystore`, D-007) ve CI her build'de onu `~/.android/debug.keystore` olarak kullanıyor.
En olası neden: telefondaki uygulama bu anahtardan önce, rastgele anahtarla yüklenmişti. Çözüm: telefondan uygulamayı
**bir kez sil**, güncel APK'yı yükle. Sonraki güncellemeler üstüne kurulmalı. Hata sürerse tekrar bakılacak
(CI çıktısına erişilemediği için doğrulanmadı).

### 2026-10-09 — [konusma] Eşzamanlı çalışma / çakışma sorusu
Bilgisayardaki oturumla buradaki oturum aynı dosyalara veya aynı branch'e yazarsa merge conflict / non-fast-forward
olur. Çözüm: bu oturum ayrı branch'te çalışır, sadece yeni dosyalara dokunur, birleştirmeyi sahibi yapar.

### 2026-10-09 — [konusma] Sahibin daha önce istediği değişiklikler (sahibi bildirimi, repoda doğrulanmadı)
Sahibi geçmiş oturumlarda şunları istediğini bildirdi. `5b8654e` kopyasında karşılıkları kontrol edilmedi veya
görülmedi, sürümde olup olmadığı belirsiz:
- Taret en yakın tanka otomatik nişan alsın (not: repoda ayarlardan aç/kapa nişan yardımı var).
- Yükseklik ve geçilemez arazi daha net görünsün.
- Dolaşan düşman tank.
- 1 dakikalık turlar, farklı yerde yeniden doğma, öldürme/ölme skor tablosu.
- Her tank için beceri ağacı (sonraki adım olarak planlanmıştı).

### 2026-10-08 — [yenilik] Faz 3 — Tank ve kontrol (commit `5b8654e`)
Çoklu dokunuş joystick + şarjlı ateş + yetenek, 5 sınıf oynanabilir, mermi/hasar/sektirme/kavisli atış/alan hasarı,
yıkılabilir yapılar, yeniden doğma, efektler, titreşim, prosedürel ses (35 efekt, 5 motor sesi), geçici sınıf seçim ekranı,
geçici botlar (2'ye 3). Doğrulama (PROGRESS.md'ye göre, bu oturumda yeniden çalıştırılmadı): lint, typecheck,
65 birim testi, 6 E2E, performans kapısı 60 FPS / p95 16,7 ms (96×96, CPU 4x). Gerçek cihaz testi **bekliyor**.

### 2026-10-08 — [yenilik] Faz 2 — İzometrik dünya
Seed'li simetrik harita üreticisi, doğrulama ve fuzz (300+ seed), yönlü rampalar, uçurumlar, çarpışma, boyalı prosedürel
arazi sanatı. Bilinen eksikler: göllerde kum lekeleri, plato arkasındaki nesnelerin kenarın üstüne çizilmesi, kapı hasar görseli tek yönlü.

### 2026-10-08 — [yenilik] Faz 1 — İskelet (commit `eae030a`)
Deterministik sim çekirdeği, 60 Hz sabit adım, izometri matematiği, kayıt şeması + migrasyon, TR/EN/AR, React kabuğu,
Capacitor Android (yatay kilit, tam ekran, INTERNET izni yok), CI (lint → typecheck → test → build → E2E), debug APK ≈ 4 MB,
sabit debug keystore, release imzası için secrets altyapısı.

### 2026-10-08 — [karar] Faz 0 — Motor: PixiJS 8
Phaser 4 ile aynı sahnede ölçüldü (96×96 harita, 200 nesne, sis maskesi, 4x CPU): Pixi 60 FPS / p95 23,9 ms,
Phaser 4 30 FPS / p95 53,3 ms; paket boyutu 2,4–4,5 kat küçük. Not: bulutta GPU yok, tam çözünürlük FPS telefonu temsil etmez.
Diğer kararlar (D-001…D-014): `docs/DECISIONS.md`.

<!-- LOG:END -->
