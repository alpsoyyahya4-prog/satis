# Satış — proje notları

Bu depo, Yahya'nın kumaş alımı için kullandığı **Satış** adlı Android uygulamasıdır
(paket adı `com.cariler.app`). Bu dosya, yeni bir oturumda her şeyi bilmen içindir.

## Kullanıcıyla konuşma

- Kullanıcı **Türkçe** konuşuyor, samimi ("kanka"). Cevaplar Türkçe, kısa ve teknik terimsiz olsun.
- Kullanıcı yazılımcı değil. Telefonda yapacağı adımları tek tek, sade anlat.
- Telefonları: **Xiaomi 14T Pro** (Android 16, asıl kullandığı, verileri burada) ve **Xiaomi 11T Pro** (Android 14, yedek).
- Xiaomi'de bilgisayardan kurulum için telefondaki "USB aracılığıyla yükle" ayarı açık olmalı.

## Uygulama ne yapıyor

- **Cariler**: tedarikçi listesi (firma, yetkili, telefon, not). Arama: firma adı, yetkili,
  telefon numarası ve o carinin kumaş adlarıyla. Sıralama: A–Z, Z–A, en çok kumaş, son eklenen.
- **Kumaşlar**: kumaş adına göre gruplu liste. Aynı kumaş birden fazla carideyse tek satır olur,
  "3 caride · en ucuz Deniz Kumaşçılık" yazar; dokununca bütün cariler en ucuzdan pahalıya sıralanır.
- **Kumaş sayfası**: güncel fiyat, değişim yüzdesi, basamaklı fiyat grafiği, fiyat geçmişi,
  aynı kumaşın diğer carilerdeki fiyatları.
- **Ayarlar**: yedekleme, Silinenler, telefon değiştirme, tema, animasyon, hatırlatmalar, Excel'e aktarma.
- Açılışta kısa bir animasyon (etiket sallanır, altın dikiş çizilir, "Satış" yazısı belirir).
- Fiyatlar etiket görünümünde: rakam kalın, ₺ ve kuruş daha küçük.

## Değişmez kurallar (kullanıcının açık isteği)

1. **Hiçbir kayıt kalıcı silinmez.** Silinen cari/kumaş/fiyat `silindi` damgası alır,
   Ayarlar › Silinenler'de durur, geri alınabilir. Kalıcı silme özelliği eklenmeyecek.
2. **Yedekler hiç silinmez.** Saatlik gzip anlık görüntüler `files/yedekler` içinde birikir, budanmaz.
3. **Yedekten yükleme sadece ekler.** Eksik cari/kumaş/fiyatı ekler; mevcut kayıtları silmez, üzerine yazmaz.
4. **Güncellemeler veriyi korumalı**: aynı imza dosyası kullanılmalı, paket adı değişmemeli.
5. İnternet izni yok; veriler telefondan çıkmaz.
6. Hatırlatmalar: her gün **08:00** "Patron, yeni fiyatlar hazır mı?" ve **19:00** "Patron, kapanış
   saatin geldi". Ayarlar'dan kapatılabilir, saatleri değiştirilebilir.

## Dosya yapısı

- `web/` — arayüz, parça parça. Sıra: `00-head.html`, `01-style-a.html`, `02-style-b.html`,
  `03-markup.html`, sonra script olarak `04-core.js`, `05-views.js`, `06-settings.js`, `07-forms.js`.
  - `04-core.js`: yardımcılar, para/tarih biçimleri, veri saklama (telefon dosyası / tarayıcı), yönlendirme.
  - `05-views.js`: ekranlar (cariler, kumaşlar, grup karşılaştırma, cari, kumaş) ve grafik.
  - `06-settings.js`: ayarlar, yedekleme, Silinenler, hatırlatma kartı, Excel.
  - `07-forms.js`: alttan açılan formlar, silme/geri alma, olaylar, açılış animasyonu.
- `android/` — `MainActivity.java` (WebView kabuğu, dosya saklama, otomatik yedek, paylaşım,
  bildirim izni), `ReminderReceiver.java` (08:00/19:00 alarmları), manifest, kaynaklar.
- `tools/AddDex.java` — APK paketleyici. `tools/serve.js` — tarayıcı önizlemesi (node).
- `build.ps1` — Windows derleme betiği (Gradle yok).

## Derleme

Windows'ta (kullanıcının bilgisayarı):

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1 -VersionCode <n> -VersionName <x.y>
```

Adımlar: web parçalarını birleştir → `aapt2 compile/link` → `javac` → `d8` → `AddDex` → `zipalign`
→ `apksigner`. Android SDK: build-tools 36.0.0, platform android-37. JDK: Android Studio'nun JBR'si.
minSdk 26, targetSdk 37. **Son yayınlanan: versionCode 9, versionName 1.8.** Her yeni kurulumda
versionCode artmalı.

Bulut ortamında (Linux) SDK yok. Derleme gerekirse JDK 17+, Android command-line tools,
`build-tools;36.0.0` ve `platforms;android-37` kurup `build.ps1`in adımlarını bash'e çevir.

**İmza:** `android/cariler.keystore`, alias `cariler`, parola `cariler-app`. Her sürüm bununla
imzalanmalı, yoksa telefona güncelleme olarak kurulamaz ve kullanıcının verileri risk altına girer.

## Yeni sürümü kullanıcıya ulaştırma

- Bilgisayar açıksa: telefon kabloyla takılı, `adb install -r Satış.apk`.
- Bulutta: APK'yı kullanıcıya dosya olarak gönder; telefonda dosyaya dokunup kurar
  ("Bilinmeyen uygulamalara izin ver" çıkarsa izin verir). Kurulum güncelleme olur, veriler kalır.

## Veri dosyası biçimi (yedekler de bu biçimde)

```json
{ "app": "cariler", "v": 1, "savedAt": "ISO tarih",
  "cariler": [ { "id", "ad", "yetkili", "telefon", "not", "olusturma", "guncelleme", "silindi?" } ],
  "kumaslar": [ { "id", "cariId", "ad", "kod", "para": "TRY|USD|EUR", "birim": "mt|kg|adet|top|yard",
                  "not", "fiyatlar": [ { "id", "f": 272.5, "t": "2026-09-16", "n": "not", "silindi?" } ] } ] }
```

Telefonda: ana dosya `files/cariler.json`, yedekler `files/yedekler/*.json.gz`,
dışarıdaki kopya `İndirilenler/Satış/maliyet-otomatik-yedek.json` + `Arsiv/maliyet-YYYY-MM.json`.
