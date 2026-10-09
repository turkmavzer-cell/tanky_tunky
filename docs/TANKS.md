# Tank sınıfları

Değerler `src/data/tanks.json` ve `src/data/combat.json` dosyalarından alınmıştır (oyun kodunda sabit değer yoktur).
Birimler: hız tile/sn, süre sn, mesafe tile. Şarj ölçekleri tüm sınıflar için ortaktır:
hasar 1x → 3x (tam şarj), "mükemmel şarj" +%15, mermi hızı 1x → 1,6x, menzil 1x → 1,5x, patlama yarıçapı 1x → 3x.

## Özet

| Sınıf | Kod adı | Rol | Hız | Can | Zırh | Efektif can* | Görüş | Atış tipi |
|---|---|---|---|---|---|---|---|---|
| Çevik | `scout` | Kanat / keşif | 4,2 (çok yüksek) | 1.900 | %0 | 1.900 | 6 | Düz, seri |
| Ağır | `heavy` | Hat tutucu | 1,5 (çok düşük) | 5.500 | %20 | 6.875 | 4,5 | Düz, ağır, 1 kez seker |
| Dengeli | `standard` | Her işi gören | 2,7 (orta) | 3.000 | %10 | 3.333 | 6 | Düz |
| Topçu | `artillery` | Arkadan destek | 1,9 (düşük) | 2.550 | %5 | 2.684 | 6 | Kavisli, engel üstünden, alan hasarı |
| Tuzakçı | `trapper` | Bilgi / kontrol | 2,2 (orta-düşük) | 2.375 | %5 | 2.500 | **Tüm harita** (+ mini harita) | Düz, zayıf |

\* Efektif can = can / (1 − zırh).

**Denge turu (2026-10-09, D-034):** B seçeneği uygulandı; aşağıdaki değerler güncel.

**Ölçek (2026-10-09, D-027):** sahibinin kararıyla tüm can ve hasarlar eski değerlerin **×25**'i (Ağır can = 5500 referans); oranlar ve denge aynı. Yarım şarj ×1,6 hasar verir.

## Ateş özellikleri

| Sınıf | Hasar (dokunuş) | Hasar (tam şarj) | Mükemmel şarj | Bekleme (cooldown) | Şarj süresi | Şarjda yavaşlama | Mermi hızı | Menzil | Patlama yarıçapı | Özel |
|---|---|---|---|---|---|---|---|---|---|---|
| Çevik | 260 | 780 | 897 | 0,28 sn | 0,8 sn | %20 | 11 | 7 | 0,25 | — |
| Ağır | 760 | 2.280 | 2.622 | 1,68 sn | 2,2 sn | %50 | 8 | 7,5 | 0,55 | Duvardan 1 kez seker |
| Dengeli | 360 | 1.080 | 1.242 | 0,7 sn | 1,4 sn | %35 | 10 | 7 | 0,35 | — |
| Topçu | 780 | 2.340 | 2.691 | 1,5 sn | 1,8 sn | %45 | 7 | 10 | 1,1 | Kavisli; şarj atış mesafesini belirler; min. menzil 2 |
| Tuzakçı | 300 | 900 | 1.035 | 1 sn | 1,5 sn | %35 | 9 | 6,5 | 0,3 | — |

## Hareket özellikleri

| Sınıf | Maks. hız | İvme | Gövde dönüşü (rad/sn) | Taret dönüşü (rad/sn) | Gövde yarıçapı (tile) |
|---|---|---|---|---|---|
| Çevik | 4,2 | 14 | 7,0 | 9,0 | 0,32 (küçük hitbox) |
| Ağır | 1,5 | 4 | 1,8 | 2,2 | 0,50 |
| Dengeli | 2,7 | 8 | 3,6 | 4,5 | 0,42 |
| Topçu | 1,9 | 5 | 2,6 | 3,0 | 0,44 |
| Tuzakçı | 2,2 | 7 | 3,2 | 3,8 | 0,42 |

## Yetenekler (YETENEK butonu)

Değerler `src/data/abilities.json`. Bekleme süresi etki bittikten sonra başlar.

| Sınıf | Yetenek | Ne yapar | Süre | Bekleme | Hasar |
|---|---|---|---|---|---|
| Çevik | Saklan | Görünmezlik; ateş edince biter, vurulunca 0,5 sn parıldar | 5 sn | 4 sn | — |
| Ağır | Gümbürtü | Anlık şok dalgası, 2,4 kare; geri iter, duvar arkasına geçmez | anlık | 12 sn | 850 merkez → 298 kenar |
| Dengeli | Swift | 2x hız ve atış hızı, şarj süresi yarıya | 4 sn | 8 sn | — |
| Topçu | Yaylım Ateşi | **6 mermi, 1 sn içinde** (0,18 sn arayla) hedef bölgeye; iniş yerleri herkese uyarılır | 1 sn | 10 sn | 450 / mermi (en çok 2700) |
| Tuzakçı | Mayın | Arkaya mayın; en çok 3 aktif | anlık | 2 sn | 1500 (basana), çevreye en çok %60 |
