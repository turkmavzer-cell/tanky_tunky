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

## 2. Oyun şu an nasıl işliyor (özet, 2026-10-11, `fix/round-03-maps` dalı, oyun kodu tur 03)

> Dikkat: varsayılan dal (`claude/tanky-tunky-setup-dw06hp`, `5b8654e`) hâlâ Faz 3 hâlinde. Tur 01–03 birleştirilmemiş
> PR #1 → #2 → #3 dallarında. Sadece varsayılan dala bakan oturum oyunu eksik görür (2026-10-10 bulut notunda olduğu gibi).

- **Tür:** Android, yatay, çevrimdışı izometrik tank savaşı (PixiJS 8 + React menüler + Capacitor).
- **Maç:** 3'e 3 Hızlı Maç, 5 dakika, 3-2-1 geri sayım, öldüğün yerden uzakta ve düşmanın görmediği yerde yeniden doğma
  (2 sn bekleme + 2 sn koruma), canlı Ö/Ö ve maç sonu skor tablosu, en iyi skor kaydı.
- **Sınıflar:** Çevik, Ağır, Dengeli, Topçu. Tuzakçı kapalı (`enabled: false`, verisi duruyor). Can/hasar orijinalin ×25'i.
  Değerler `src/data/tanks.json`, tablolar `docs/TANKS.md`.
- **Yetenekler (tank başına 1):** Saklan (Çevik, 5 sn, bekleme 4 sn), Gümbürtü (Ağır, anlık, 2,4 kare, 850 → 298 hasar,
  bekleme 12 sn), Swift (Dengeli, 4 sn, bekleme 8 sn), Yaylım Ateşi (Topçu, 1 sn'de 6 mermi, bekleme 10 sn).
- **Haritalar:** Çöl harabesi (varsayılan), Modern şehir, Orman/nehir. Seçim tank ekranında.
- **Görüş:** Kararma yok, herkes her şeyi görür. Ormandaki düşman sadece 3 kareden yakında, yarı saydam. Saklan görünmez yapar.
- **Yükseltme ve can yenilenmesi:** Kutudan +%5 can ve hasar (en fazla +%60, ölünce sıfır). Çatışma dışında 5 sn'de bir +%5 can.
- **Botlar:** Gerçek yapay zekâ (devriye/şüphe/takip/saldırı/geri çekilme), Kolay/Normal/Zor/Ekstrem, müttefikler de aynı seviyede.
- **Otomatik nişan:** En yakın görünen düşman. Bilinen sorun: tam görünürlükten beri ekran dışındaki düşmana da dönebiliyor (düzeltilmedi).
- **APK:** GitHub Actions "Android APK", son çalıştırma #16. Debug imzası projedeki anahtarla açıkça yapılıyor, CI imzayı doğruluyor (D-035).
  Telefonda bir kez kaldırıp kurmak gerekiyor; telefonda doğrulanmadı.
- **Git:** Tur başına dal (`fix/round-NN-...`), PR'lar zincir hâlinde, birleştirme sahibinde.

## 3. Açık sorular ve bekleyenler

Tam liste ve öneriler: `CLAUDE.md` §1 "Pending owner decisions" (B1, B2, A, K1–K11, T, G). Özet:
- Topçu zayıf / Ağır güçlü (denge kararı).
- Taret sadece ekranda görünen düşmana nişan alsın (hata, iş akışı A).
- Ana menü (Tek/Çok oyunculu), kampanya, ilerleme, çok oyunculu mod — karar bekliyor.
- Tank başına 2 yetenek (skill + ulti), Çevik taramalı ateş — sayılar karar bekliyor (×25 ölçeğe göre yeniden hesaplanmalı).
- Tuzakçı koddan tamamen silinsin mi? Mini harita / yön oku?
- PR'lar birleştirilsin mi? Tank görselleri (4 görsel sahibinde, repoda yok).
- Telefon testi ve imza düzeltmesinin telefonda doğrulanması.

## 4. Günlük (en yeni en üstte)

<!-- LOG:START -->
### 2026-10-11 — [duzeltme] A: Otomatik nişan sadece ekrandaki düşmana
Tam görünürlükten (D-037) beri taret ekran dışındaki en yakın düşmana kilitleniyordu. SimState.view (kamera dikdörtgeni, iso ekran px) GameScene.updateView() ile her tick yenilenir; targeting.onScreen() yalnız yerel oyuncuyu sınırlar, botlar sınırsız. Kilitlenen hedef ekrandan çıkarsa bırakılır. Test: tests/targeting.test.ts (2 yeni). Gerçek cihazda doğrulanmadı.
### 2026-10-11 — [degisiklik] B1: Topçu inişte +%25 hasar
combat.json shell.artilleryDamageMul=1.25; combat.ts shellExplosion artillery mermisinin hasarını çarpar (Yaylım Ateşi dahil, arazi hasarı değişmez). Test: tests/combat.test.ts (merkezde ≥ taban hasar, ≤ ×1,25). Birim testler 143 geçti; denge etkisi henüz ölçülmedi (tools/balance.ts turun sonunda koşulacak).
### 2026-10-11 — [konusma] Sahip: B1 ve tüm kalan güncellemelere başla
B1: Topçunun düşen mermileri düştüğü yerde patlama hasarının %25'i kadar daha fazla hasar versin. Ardından 'geri kalan tüm güncellemelere başla' dendi (A, C, B, D–G sırayla; açık kararlar için makul varsayım + DECISIONS/PROGRESS notu). Çalışma branch'i: fix/round-04-balance-aim-skills.
### 2026-10-11 — [karar] PR #1-#3 birleştirildi
Sahip 'birleştir' dedi (PR #1 → #2 → #3, base'ler varsayılan branch'e çevrilerek). Varsayılan branch artık round 03 oyununu içeriyor (merge f94cbf8). CI (checks, debug-apk, changelog) c2fde90 için yeşildi. Sahip bundan sonra telefondan/bulut oturumundan devam ediyor; masaüstü oturumu çalışmadan önce pull yapar.
### 2026-10-11 — [degisiklik] Belgeler güncellendi: CLAUDE.md, TANKS.md, PROGRESS.md, DECISIONS.md, CHANGELOG bölüm 2–3
CLAUDE.md: durum, PR zinciri, son APK #16, bekleyen kararlar tablosu (B1, B2, A, K1–K11, T, G), iş akışları A–G, yol haritası, iki oturumun paralel çalışma kuralı ve çakışma riski olan dosyalar, riskler (INTERNET izni, taramalı ateş yükü). TANKS.md: Tuzakçı 'kapalı' işaretlendi, 'ÖNERİ — onay bekliyor' bölümü (Çevik güncellemesi, tank başına 2 yetenek). PROGRESS.md: uzlaştırma bölümü ve açık sorular. DECISIONS.md: sadece D-043. CHANGELOG: bölüm 2–3 güncel hâle getirildi, Tur 01–03 ve bu sohbetteki kayıtsız istekler geriye dönük eklendi. Oyun kodu değişmedi.
### 2026-10-11 — [acik-soru] Otomatik nişan ekran dışındaki düşmana kilitlenebiliyor
Tam görünürlükten (D-037) beri selectTarget haritadaki en yakın düşmanı seçiyor; ekran ya da menzil sınırı yok. Sahibinin isteği: sadece ekranda görünen düşmana nişan. Kod okundu, oyunda doğrulanmadı. Düzeltilmedi (iş akışı A, onay bekliyor).
### 2026-10-11 — [konusma] Bulut devir notu (2026-10-10) repoyla karşılaştırıldı
Not sadece varsayılan dalı (5b8654e, Faz 3) görmüş. PR #1–#3 dallarında zaten yapılmış olanlar: Tuzakçı kapatıldı (b5810c8), Saklan ve Gümbürtü yetenekleri, otomatik nişan, yükseklik netliği, gerçek bot yapay zekâsı, 60 sn → 5 dk maç, farklı yerde yeniden doğma, skor tablosu, imza düzeltmesi (c7ff097). Yapılmayanlar: yetenek ağacı; sahibinin 4 tank görseli repoda yok. Bulut sohbetindeki yeni istekler CLAUDE.md §1'e (K1–K11) ve docs/TANKS.md 'ÖNERİ' bölümüne yazıldı.
### 2026-10-11 — [karar] Değişiklik günlüğü benimsendi, docs/changelog birleştirildi (D-043)
Sahibi onayladı. origin/docs/changelog, fix/round-03-maps dalına birleştirildi (commit 3f5e915). CLAUDE.md çakışması iki taraf korunarak çözüldü: bulut oturumunun §4b günlük kuralı + tur 03 devir içeriği. package.json'a 'log' komutu eklendi, 'icons' komutu korundu. Doğrulama: npm run lint ve npm run typecheck temiz; birim/E2E çalıştırılmadı (oyun kodu değişmedi).
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

### 2026-10-09 — [yenilik] Tur 03 (PR #3, `fix/round-03-maps`) — geriye dönük kayıt (2026-10-11)
İmza düzeltmesi (D-035, `build.gradle` açık debug imzası + CI imza kontrolü); Tuzakçı kapatıldı (D-036), Çevik can 1900 → 2200;
kararma kalktı, ormanda 3 kare kuralı (D-037); kutu yükseltmeleri +%5, en fazla %60 (D-038); çatışma dışı can yenilenmesi (D-039);
Çöl ve Şehir haritaları + harita seçici, kayıt şeması v4 (D-040); bot yol araması kısıtlandı (D-041); belgeler her değişiklikte (D-042).
Doğrulama: 140 birim, 25 E2E, performans kapısı ve CI yeşil; APK #15/#16. Denge ölçüldü, değiştirilmedi.

### 2026-10-09 — [konusma] Görselden 3D'ye ücretsiz araçlar — geriye dönük kayıt
Tek görselden diğer açılar üretilemez (Claude görsel üretmez). Üç yol önerildi: 8–16 yön çizdirmek, üstten görünüm, 3D model.
Ücretsiz araçlar (lisanslar sitelerden doğrulanmalı): Tripo (ücretsiz plan ticari değil), Meshy (ücretsiz modeller CC BY, kaynak gösterilmeli),
Hunyuan3D, TRELLIS.2 (MIT). Öneri: gövde ve tareti ayrı üret, `.glb` indir; önce Tripo/Meshy ile dene.

### 2026-10-09 — [karar] Sahibin kuralı: "uygula" demeden başlama — geriye dönük kayıt
Tur 02'de ×25 ölçek ve 6 mermilik Yaylım Ateşi, sahibi listesini bitirmeden uygulandı. Sahibi: değişiklikleri topla, plan göster,
"uygula" deyince başla. Kural `CLAUDE.md` §0'da.

### 2026-10-09 — [konusma] Sahibinin alternatif can/zırh tablosu (uygulanmadı) — geriye dönük kayıt
Sahibi şu tabloyu önermişti: Çevik 1050 / %10, Ağır 5500 / %35, Dengeli 2640 / %25, Topçu 1670 / %15, Tuzakçı 1990 / %15.
Sonra "şimdilik senin tablona göre" diyerek ×25 orantılı tabloyu seçti (D-027). Claude'un ilk hasar önerisi
(Çevik 240, Ağır 900, Dengeli 420, Topçu 720, Tuzakçı 300) de uygulanmadı. İleride dönülebilir.

### 2026-10-09 — [degisiklik] Tur 02 (PR #2, `fix/round-02-feedback`) — geriye dönük kayıt (2026-10-11)
Can/hasar ×25 (D-027), Yaylım Ateşi 1 sn'de 6 mermi (D-028), maç 5 dakika (D-029), bot zorluğu Kolay/Normal/Zor/Ekstrem, müttefik dahil (D-030),
taret dokunma düzeltmesi (D-031), kaydırmalı tank kartları (D-032), uygulama ikonu (D-033), denge B seçeneği 3 tur (D-034).
Doğrulama: 125 birim, 19 E2E, CI yeşil; APK #13.

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

### 2026-10-08 — [yenilik] Tur 01 (PR #1, `fix/round-01-core-loop`) — geriye dönük kayıt (2026-10-11)
Görünürlük sistemi (D-015…D-017), otomatik taret nişanı, yükseklik/uçurum netliği tek `isPassable` kuralıyla (D-020, D-021),
gerçek bot yapay zekâsı (D-025), 60 sn maç + farklı yerde yeniden doğma + skor tablosu (D-022), 5 yetenek veri + modül olarak (D-023),
zemin pişirme ile performans düzeltmesi (D-026). Doğrulama: 115 birim, 16 E2E, CI yeşil.

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
