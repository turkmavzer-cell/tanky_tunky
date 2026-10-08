# Tank sınıfları

Değerler `src/data/tanks.json` ve `src/data/combat.json` dosyalarından alınmıştır (oyun kodunda sabit değer yoktur).
Birimler: hız tile/sn, süre sn, mesafe tile. Şarj ölçekleri tüm sınıflar için ortaktır:
hasar 1x → 3x (tam şarj), "mükemmel şarj" +%15, mermi hızı 1x → 1,6x, menzil 1x → 1,5x, patlama yarıçapı 1x → 3x.

## Özet

| Sınıf | Kod adı | Rol | Hız | Can | Zırh | Efektif can* | Görüş | Atış tipi |
|---|---|---|---|---|---|---|---|---|
| Çevik | `scout` | Kanat / keşif | 4,2 (çok yüksek) | 70 | %0 | 70 | 6 | Düz, seri |
| Ağır | `heavy` | Hat tutucu | 1,5 (çok düşük) | 220 | %25 | 293 | 4,5 | Düz, ağır, 1 kez seker |
| Dengeli | `standard` | Her işi gören | 2,7 (orta) | 120 | %10 | 133 | 6 | Düz |
| Topçu | `artillery` | Arkadan destek | 1,9 (düşük) | 85 | %5 | 89 | 6 | Kavisli, engel üstünden, alan hasarı |
| Tuzakçı | `trapper` | Bilgi / kontrol | 2,2 (orta-düşük) | 95 | %5 | 100 | **Tüm harita** (+ mini harita) | Düz, zayıf |

\* Efektif can = can / (1 − zırh).

## Ateş özellikleri

| Sınıf | Hasar (dokunuş) | Hasar (tam şarj) | Mükemmel şarj | Bekleme (cooldown) | Şarj süresi | Şarjda yavaşlama | Mermi hızı | Menzil | Patlama yarıçapı | Özel |
|---|---|---|---|---|---|---|---|---|---|---|
| Çevik | 9 | 27 | 31 | 0,28 sn | 0,8 sn | %20 | 11 | 7 | 0,25 | — |
| Ağır | 38 | 114 | 131 | 1,4 sn | 2,2 sn | %50 | 8 | 7,5 | 0,55 | Duvardan 1 kez seker |
| Dengeli | 18 | 54 | 62 | 0,7 sn | 1,4 sn | %35 | 10 | 7 | 0,35 | — |
| Topçu | 26 | 78 | 90 | 1,8 sn | 1,8 sn | %45 | 7 | 10 | 0,9 | Kavisli; şarj atış mesafesini belirler; min. menzil 3 |
| Tuzakçı | 12 | 36 | 41 | 1,0 sn | 1,5 sn | %35 | 9 | 6,5 | 0,3 | — |

## Hareket özellikleri

| Sınıf | Maks. hız | İvme | Gövde dönüşü (rad/sn) | Taret dönüşü (rad/sn) | Gövde yarıçapı (tile) |
|---|---|---|---|---|---|
| Çevik | 4,2 | 14 | 7,0 | 9,0 | 0,32 (küçük hitbox) |
| Ağır | 1,5 | 4 | 1,8 | 2,2 | 0,50 |
| Dengeli | 2,7 | 8 | 3,6 | 4,5 | 0,42 |
| Topçu | 1,9 | 5 | 2,6 | 3,0 | 0,44 |
| Tuzakçı | 2,2 | 7 | 3,2 | 3,8 | 0,42 |

## Yetenekler (YETENEK butonu) — sahibi tarafından doldurulacak

Brief'teki öneriler parantez içinde referans olarak duruyor; her sınıf için istediğin yeteneği yaz.
Mümkünse şunları da belirt: süre, bekleme süresi, etkisi (sayısal), kullanırken kısıtlar.

| Sınıf | Yetenek adı | Ne yapar | Süre | Bekleme | Notlar |
|---|---|---|---|---|---|
| Çevik | | | | | (brief: Dash) |
| Ağır | | | | | (brief: Siper modu: +%40 zırh, mermi sektirme) |
| Dengeli | | | | | (brief: Geçici kalkan) |
| Topçu | | | | | (brief: Engel üstünden atış, min. menzil — şu an zaten pasif olarak var) |
| Tuzakçı | | | | | (brief: 6 tür tuzak; tüm haritayı görme pasif) |
