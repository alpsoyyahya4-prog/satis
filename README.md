# Satış

Kumaş alımı için cari ve fiyat takibi yapan Android uygulaması. İnternet izni yok; veriler
telefonda saklanır, yedekler telefondan çıkmaz.

## Yapısı

- `web/` — uygulamanın ekranları (parça parça HTML/CSS/JS, sırayla birleştirilir)
- `android/` — Android kabuğu: WebView, dosya saklama, otomatik yedekler, 08:00/19:00 hatırlatmaları
- `tools/` — derleme yardımcıları (APK paketleyici, önizleme sunucusu)
- `build.ps1` — derleme betiği

## Derleme

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1 -VersionCode <n> -VersionName <x.y>
```

Android SDK (build-tools 36, platform 37) ve Android Studio'nun JDK'sını kullanır, Gradle
gerektirmez. Çıktı: `Satis.apk`.

Sadece ekranları denemek için: `build.ps1 -WebOnly` sonra `node tools/serve.js`.

## Önemli

- `android/satis.keystore` yerel imza dosyasıdır. Dosya yoksa `build.ps1` ilk derlemede oluşturur; sonraki güncellemelerde telefondaki verileri korumak için **aynı** dosyayı sakla.
- Sürüm numarası (`-VersionCode`) her yeni kurulumda artmalıdır.
