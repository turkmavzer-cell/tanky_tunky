# Tank sınıfları

Değerler `src/data/tanks.json` ve `src/data/combat.json` dosyalarından alınmıştır (oyun kodunda sabit değer yoktur).
Birimler: hız tile/sn, süre sn, mesafe tile. Şarj ölçekleri tüm sınıflar için ortaktır:
hasar 1x → 3x (tam şarj), "mükemmel şarj" +%15, mermi hızı 1x → 1,6x, menzil 1x → 1,5x, patlama yarıçapı 1x → 3x.

## Özet

| Sınıf | Kod adı | Rol | Hız | Can | Zırh | Efektif can* | Görüş | Atış tipi |
|---|---|---|---|---|---|---|---|---|
| Çevik | `scout` | Kanat / keşif | 4,2 (çok yüksek) | 2.200 | %0 | 2.200 | 6 | Düz, seri |
| Ağır | `heavy` | Hat tutucu | 1,5 (çok düşük) | 5.500 | %20 | 6.875 | 4,5 | Düz, ağır, 1 kez seker |
| Dengeli | `standard` | Her işi gören | 2,7 (orta) | 3.000 | %10 | 3.333 | 6 | Düz |
| Topçu | `artillery` | Arkadan destek | 1,9 (düşük) | 2.550 | %5 | 2.684 | 6 | Kavisli, engel üstünden, alan hasarı |
| Tuzakçı *(kapalı, D-036)* | `trapper` | Bilgi / kontrol | 2,2 (orta-düşük) | 2.375 | %5 | 2.500 | **Tüm harita** (+ mini harita) | Düz, zayıf |

\* Efektif can = can / (1 − zırh).

**Tur 03 (D-036):** Tuzakçı şimdilik oyundan çıkarıldı (veriler duruyor), Çevik canı 2.200. Kutulardan yükseltme: her biri +%5 can ve hasar, en fazla +%60; çatışma dışında 5 sn'de bir +%5 can.

**Denge turu (2026-10-09, D-034):** B seçeneği uygulandı; aşağıdaki değerler güncel.

**Ölçek (2026-10-09, D-027):** sahibinin kararıyla tüm can ve hasarlar eski değerlerin **×25**'i (Ağır can = 5500 referans); oranlar ve denge aynı. Yarım şarj ×1,6 hasar verir.

## Ateş özellikleri

| Sınıf | Hasar (dokunuş) | Hasar (tam şarj) | Mükemmel şarj | Bekleme (cooldown) | Şarj süresi | Şarjda yavaşlama | Mermi hızı | Menzil | Patlama yarıçapı | Özel |
|---|---|---|---|---|---|---|---|---|---|---|
| Çevik | 260 | 780 | 897 | 0,28 sn | 0,8 sn | %20 | 11 | 7 | 0,25 | — |
| Ağır | 760 | 2.280 | 2.622 | 1,68 sn | 2,2 sn | %50 | 8 | 7,5 | 0,55 | Duvardan 1 kez seker |
| Dengeli | 360 | 1.080 | 1.242 | 0,7 sn | 1,4 sn | %35 | 10 | 7 | 0,35 | — |
| Topçu | 780 (inişte ×1,25 = 975) | 2.340 | 2.691 | 1,5 sn | 1,8 sn | %45 | 7 | 10 | 1,1 | Kavisli; şarj atış mesafesini belirler; min. menzil 2 |
| Tuzakçı | 300 | 900 | 1.035 | 1 sn | 1,5 sn | %35 | 9 | 6,5 | 0,3 | — |

## Hareket özellikleri

| Sınıf | Maks. hız | İvme | Gövde dönüşü (rad/sn) | Taret dönüşü (rad/sn) | Gövde yarıçapı (tile) |
|---|---|---|---|---|---|
| Çevik | 4,2 | 14 | 7,0 | 9,0 | 0,32 (küçük hitbox) |
| Ağır | 1,5 | 4 | 1,8 | 2,2 | 0,50 |
| Dengeli | 2,7 | 8 | 3,6 | 4,5 | 0,42 |
| Topçu | 1,9 | 5 | 2,6 | 3,0 | 0,44 |
| Tuzakçı | 2,2 | 7 | 3,2 | 3,8 | 0,42 |

## Yetenekler (YETENEK ve ULTİ butonları) — round 04

Her tankın iki yeteneği var: **yetenek** (hızlı dolar, 5–10 sn) ve **ulti** (yavaş dolar, 30–45 sn). Değerler `src/data/abilities.json`,
hangi tankın hangisini kullandığı `tanks.json` (`ability`, `ult`). Bekleme süresi etki bittikten sonra başlar. Ölünce ikisi de sıfırlanır.
Klavye: E = yetenek, Q = ulti.

| Sınıf | Yetenek (düğme 1) | Süre / bekleme | Ulti (düğme 2) | Süre / bekleme |
|---|---|---|---|---|
| Çevik | **Saklan**: görünmez; ateş edince biter, vurulunca 0,5 sn parıldar | 5 sn / 5 sn | **Aşırı Yük**: atış hızı ×3 | 5 sn / 30 sn |
| Ağır | **Gümbürtü**: anlık şok dalgası, yarıçap 4 kare, **merkezden uca aynı 1000 hasar**, geri iter, duvar arkasına geçmez | anlık / 10 sn | **Onarım**: canı bir anda tamamen doldurur (can doluysa kullanılmaz) | anlık / 45 sn |
| Dengeli | **Swift**: 2x hız ve atış hızı, şarj yarıya | 4 sn / 8 sn | **EMP**: 4 kare içindeki düşmanları 2,5 sn sersemletir (hareket/ateş yok) | anlık / 40 sn |
| Topçu | **Hazır Atış**: sonraki atış şarjsız, anında, tam menzil (güç %50) | en çok 6 sn / 8 sn | **Yaylım Ateşi**: 6 mermi, 1 sn içinde, 450'şer, iniş yerleri uyarılır | 1 sn / 45 sn |
| Tuzakçı *(kapalı)* | Mayın: arkaya, en çok 3 aktif | anlık / 2 sn | — | — |

> Tuzakçı satırları sadece bilgi içindir: sınıf oyunda kapalı (`enabled: false`). Koddan silinip silinmeyeceği sahibinin kararı (K11).

### Çevik: taramalı ateş (round 04)
Çevik artık şarj etmez: ATEŞ'e basılı tutunca saniyede **10 mermi**, mermi başına **80 hasar** (eskiden dokunma 260), ±2° rastgele sapma.
Hız 4,2 → **5,0** (ivme 16,5, dönüş 8,0). Saniyedeki hasar ≈ 800 (eski dokunma hızında ≈ 930; şarjlı vuruş yok).
Aşırı Yük ile 30 mermi/sn.

### Topçu: inişte +%25 (B1, round 04)
Kavisli mermiler (Topçu atışı ve Yaylım Ateşi) düştükleri yerde patlama hasarının **×1,25**'ini verir (780 → 975 merkez).

## Kampanya yapıları (round 05) — ilk öneri, sen karar verirsin

| Yapı | Can | Zırh | Hasar | Atış arası | Menzil | Not |
|---|---|---|---|---|---|---|
| Kule | 3200 | %10 | 340 | 1,8 sn | 7,5 | Hareket etmez, yeniden doğmaz, can yenilemez. İlk atış zorluk gecikmesiyle (Kolay 5 sn … Ekstrem 0). |
| Karargâh (HQ) | 12000 | %15 | — | — | — | Silahı yok; yıkılınca görev kazanılır. |

Karakol "tehdit bütçesi" (`enemies.json`): Kule 2, Çevik 2, Dengeli 3, Topçu 3, Ağır 4. Düşman tankları karakolunun 3 kare çevresinde
dolaşır, karakola 9 kareden uzak düşmana tepki vermez.

## Güçlendirme parçaları (round 06) — ilk öneri, sen karar verirsin

Kazanılan her görev **1 parça**; bir görevi ilk kez 3 yıldızla kazanınca **+1 parça**. Bir parça = seçtiğin tanka 1 seviye özel güçlendirme
(en fazla 5 seviye). Sadece senin tankına, her modda.

| Tank | Güçlendirme | Seviye başına | 5 seviyede |
|---|---|---|---|
| Ağır | can (senin isteğin) | +%6 | +%30 |
| Çevik | atış hızı (senin isteğin; taramalı ateş ve Aşırı Yük ile çarpılır) | +%6 | +%30 |
| Dengeli | şarj süresi kısalır | −%6 | −%30 |
| Topçu | patlama alanı büyür (mermiler hedefin kenarına düştüğü için en çok bu yardım eder) | +%6 | +%30 |

## Garaj yükseltmeleri (round 05) — ilk öneri

| Dal | Seviye başına | En fazla | Fiyat (1/2/3. seviye) |
|---|---|---|---|
| Zırh | +%4 can | 3 (+%12) | 150 / 300 / 500 kredi |
| Motor | +%3 hız | 3 (+%9) | 150 / 300 / 500 |
| Top | +%4 hasar | 3 (+%12) | 150 / 300 / 500 |

Sadece senin tankına, her modda uygulanır. Kredi: kampanya bölümü ilk geçiş 120/160/200 + yıldız başına 40/50/60; Hızlı Maç öldürme başına 5, kazanınca +25.

## ESKİ ÖNERİ (round 04'te büyük bölümü uygulandı; aşağıdaki tablolar tarihsel)

Bu bölüm 2026-10-10 bulut oturumunda konuşulan istek ve önerilerdir. **Hiçbiri uygulanmadı**; sayılar sahibinin onayıyla
kesinleşir (`CLAUDE.md` §1, K5/K7/K8). Not: buluttaki öneriler eski ölçekteydi (Çevik hasarı 9); oyun şu an ×25 ölçekte
(Çevik dokunma hasarı 260), bu yüzden hasar sayıları yeniden hesaplanmalı.

### Çevik güncellemesi (istek: daha hızlı, taramalı seri ateş)
| Değer | Şimdi | Öneri |
|---|---|---|
| Azami hız | 4,2 | ~5,0 (ivme ve dönüş orantılı) |
| Ateş | dokun / basılı tut şarj, atış arası 0,28 sn | basılı tut = tarama, şarj yok, ~10 mermi/sn, ±2° sapma |
| Mermi başına hasar | 260 (dokunma) | düşük; saniyedeki hasar bugünküne yakın kalacak şekilde hesaplanacak (×25 ölçek) |
| Taramalı ateş kimde | — | sadece Çevik mi, tüm tanklar mı? (K5) |

### Tank başına iki yetenek: hızlı dolan + ulti (istek)
| Tank | Şimdi (1 yetenek) | 1. yetenek önerisi (hızlı dolan) | Ulti önerisi |
|---|---|---|---|
| Çevik | Saklan: 5 sn, bekleme 4 sn, ateşle biter | Saklan (bulut önerisi 2 sn / 10 sn; şimdiki değerler korunabilir) | Tarama ×3 (10 → 30 mermi/sn), 5 sn, bekleme 30 sn |
| Ağır | Gümbürtü: anlık, 2,4 kare, 850 → 298 hasar, bekleme 12 sn | Gümbürtü: biraz daha büyük (~4 kare), **merkezden uca aynı hasar**, hasar artsın | Tam onarım: canı bir kerede fuller, bekleme 45 mi 60 sn mi? |
| Dengeli | Swift: 4 sn, bekleme 8 sn | Swift kalsın mı, yoksa geçici kalkan (2 sn / 5 sn) mı? | EMP darbesi: 4 karede düşmanları 2,5 sn sersemletir, bekleme 40 sn |
| Topçu | Yaylım Ateşi: 1 sn'de 6 mermi, 450'şer, bekleme 10 sn | Hazır atış: sonraki mermi şarjsız, anında, tam menzil, bekleme 8 sn | Bombardıman (bugünkü Yaylım Ateşi ulti olabilir), bekleme 45 sn |

Ek varsayımlar (itiraz bekleniyor): ölünce tüm bekleme sayaçları sıfırlanır; görünmez tank botlara ve otomatik nişana hedef olmaz.

