package com.satis.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Hosts the Cariler web UI (assets/index.html) and keeps its data safe:
 *  - every save is written atomically to files/satis.json
 *  - hourly (and before deletes/restores) gzip snapshots in files/yedekler; snapshots are never deleted
 *  - Download/Satış: the latest copy plus one archive file per month, surviving uninstall (Android 10+)
 *  - satis.json and the snapshots go into Android's Google backup; phone-to-phone transfer carries everything
 */
public class MainActivity extends Activity {
    private static final int REQ_SAVE = 11, REQ_OPEN = 12;
    private static final long SNAP_EVERY = 60L * 60 * 1000;
    private static final long BACKUP_NOTICE_EVERY = 6L * 60 * 60 * 1000;
    private static final String MIRROR_NAME = "satis-otomatik-yedek.json";

    private final Object lock = new Object();
    private final Object mirrorLock = new Object();
    private FrameLayout root;
    private WebView web;
    private String pendingSave;
    private volatile boolean mirrorDirty;
    private volatile long lastMirror;
    private int navInset;
    private boolean pageReady, importWaiting;
    private String pendingImport;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // denim like the system splash, so the page's own launch animation continues it seamlessly
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B4650"));
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            // draw edge to edge; the status bar strip takes the page colour, the page pads the nav bar itself
            w.setDecorFitsSystemWindows(false);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
            w.setNavigationBarContrastEnforced(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                boolean typing = ime.bottom > bars.bottom;
                v.setPadding(bars.left, bars.top, bars.right, typing ? ime.bottom : 0);
                navInset = typing ? 0 : bars.bottom;
                pushInset();
                return WindowInsets.CONSUMED;
            });
        }
        applyBarIcons(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;   // tel:, WhatsApp and web links open in their own apps
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pushInset();
                if (importWaiting) { importWaiting = false; callJs("import", pendingImport != null ? "ok" : "error", pendingImport); pendingImport = null; }
            }
        });
        // renamed to Satış: forget the old Download/Satış targets so new files land in the Satış folder
        SharedPreferences p0 = prefs();
        if (!p0.getBoolean("renamed-satis", false)) {
            p0.edit().remove("mirrorUri").remove("apkUri").putBoolean("renamed-satis", true).apply();
        }

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.loadUrl("file:///android_asset/index.html");
        handleIncoming(getIntent());

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        ReminderReceiver.scheduleAll(this);
        // reminders are on by default, so ask for the notification permission on the first start
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !prefs().getBoolean("askedNotif", false)
                && (ReminderReceiver.on(this, "sabah") || ReminderReceiver.on(this, "aksam"))) {
            prefs().edit().putBoolean("askedNotif", true).apply();
            requestPermissions(new String[]{ android.Manifest.permission.POST_NOTIFICATIONS }, 21);
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == 21) callJs("perm", res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED ? "ok" : "no", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncoming(intent);
    }

    /** A backup file opened with "Cariler ile aç" from WhatsApp, Files, Quick Share… is handed to the page to import. */
    @SuppressWarnings("deprecation")
    private void handleIncoming(Intent it) {
        if (it == null) return;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(it.getAction())) u = it.getData();
        else if (Intent.ACTION_SEND.equals(it.getAction())) u = it.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u == null) return;
        setIntent(new Intent(this, MainActivity.class));   // import once, not again after a restart
        final Uri src = u;
        new Thread(() -> {
            String text = null;
            try (InputStream in = getContentResolver().openInputStream(src)) {
                if (in != null) text = new String(readAll(in, 30 * 1024 * 1024), StandardCharsets.UTF_8);
            } catch (Exception ignored) { }
            final String t = text;
            runOnUiThread(() -> {
                if (pageReady) callJs("import", t != null ? "ok" : "error", t);
                else { pendingImport = t; importWaiting = true; }
            });
        }).start();
    }

    // The page closes sheets / goes up a level first; at the home screen the app goes to the background.
    private void handleBack() {
        web.evaluateJavascript("(window.appBack && window.appBack()) ? 1 : 0", v -> {
            if (!"1".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { handleBack(); }

    @Override
    protected void onPause() {
        super.onPause();
        if (mirrorDirty) new Thread(() -> {
            String s;
            synchronized (lock) { s = readFile(dataFile()); }
            if (!s.isEmpty()) mirror(s);
        }).start();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void pushInset() {
        if (web == null) return;
        int css = Math.round(navInset / getResources().getDisplayMetrics().density);
        web.evaluateJavascript("document.documentElement.style.setProperty('--nav-inset','" + css + "px')", null);
    }

    @SuppressWarnings("deprecation")
    private void applyBarIcons(boolean lightBg) {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            int m = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (c != null) c.setSystemBarsAppearance(lightBg ? m : 0, m);
        } else {
            View d = w.getDecorView();
            int f = d.getSystemUiVisibility();
            int m = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            d.setSystemUiVisibility(lightBg ? (f | m) : (f & ~m));
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        final Uri u = res == RESULT_OK && data != null ? data.getData() : null;
        if (req == REQ_SAVE) {
            final String body = pendingSave;
            pendingSave = null;
            if (u == null || body == null) { callJs("save", u == null ? "cancel" : "error", null); return; }
            new Thread(() -> {
                boolean ok = false;
                try (OutputStream o = getContentResolver().openOutputStream(u, "w")) {
                    if (o != null) { o.write(body.getBytes(StandardCharsets.UTF_8)); ok = true; }
                } catch (Exception ignored) { }
                final boolean done = ok;
                runOnUiThread(() -> callJs("save", done ? "ok" : "error", null));
            }).start();
        } else if (req == REQ_OPEN) {
            if (u == null) { callJs("open", "cancel", null); return; }
            new Thread(() -> {
                String text = null;
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    if (in != null) text = new String(readAll(in, 30 * 1024 * 1024), StandardCharsets.UTF_8);
                } catch (Exception ignored) { }
                final String t = text;
                runOnUiThread(() -> callJs("open", t != null ? "ok" : "error", t));
            }).start();
        }
    }

    private void callJs(String kind, String status, String payload) {
        web.evaluateJavascript("window.onNative && window.onNative(" + JSONObject.quote(kind) + "," + JSONObject.quote(status) + ","
                + (payload == null ? "null" : JSONObject.quote(payload)) + ")", null);
    }

    /* ---------------- storage ---------------- */

    private File dataFile() { return new File(getFilesDir(), "satis.json"); }

    private File backupDir() {
        File d = new File(getFilesDir(), "yedekler");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private SharedPreferences prefs() { return getSharedPreferences("satis", MODE_PRIVATE); }

    /** Snapshot files, newest first (names start with a timestamp). */
    private File[] snapshots() {
        File[] fs = backupDir().listFiles((dir, n) -> n.startsWith("yedek-") && (n.endsWith(".json") || n.endsWith(".json.gz")));
        if (fs == null) return new File[0];
        Arrays.sort(fs, (a, b) -> b.getName().compareTo(a.getName()));
        return fs;
    }

    /** yedek-20260922-143512_12_48_oto.json.gz : time, supplier count, fabric count, reason. Never deleted. */
    private void writeSnapshot(String tag, String json) throws IOException {
        int c = -1, k = -1;
        try {
            JSONObject d = new JSONObject(json);
            c = d.getJSONArray("cariler").length();
            k = d.getJSONArray("kumaslar").length();
        } catch (Exception ignored) { }
        String ts = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        writeGzAtomic(new File(backupDir(), "yedek-" + ts + "_" + c + "_" + k + "_" + tag + ".json.gz"), json);
    }

    /** Download/Satış keeps the latest copy and Download/Satış/Arsiv one file per month; both stay if the app is removed. */
    private void mirror(String json) {
        if (Build.VERSION.SDK_INT < 29) return;
        synchronized (mirrorLock) {
            SharedPreferences p = prefs();
            Uri u = keepWriting(p, "mirrorUri", MIRROR_NAME, "", json);
            String month = new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date());
            Uri archive = keepWriting(p, "arsiv-" + month, "satis-" + month + ".json", "/Arsiv", json);
            long now = System.currentTimeMillis();
            boolean complete = u != null && archive != null;
            if (!complete) {
                long lastNotice = p.getLong("backupErrorNoticeTime", 0L);
                if (now - lastNotice >= BACKUP_NOTICE_EVERY) {
                    p.edit().putLong("backupErrorNoticeTime", now).apply();
                    ReminderReceiver.postBackup(this, false,
                            "İndirilenler/Satış yedeği tamamlanamadı; uygulama içi yedeklerin korunuyor.");
                }
                return;
            }
            lastMirror = now;
            mirrorDirty = false;
            p.edit().putLong("mirrorTime", lastMirror).apply();
            long lastNotice = p.getLong("backupNoticeTime", 0L);
            if (now - lastNotice >= BACKUP_NOTICE_EVERY) {
                p.edit().putLong("backupNoticeTime", now).apply();
                ReminderReceiver.postBackup(this, true,
                        "Güncel kopya ve aylık arşiv güvenle kaydedildi.");
            }
        }
    }

    /** Rewrites the file remembered under key; if it is gone or no longer ours, creates a new one. */
    private Uri keepWriting(SharedPreferences p, String key, String name, String sub, String json) {
        String saved = p.getString(key, null);
        Uri u = null;
        if (saved != null) {
            try { u = writeDownload(name, json, Uri.parse(saved), sub); } catch (Exception e) { u = null; }
        }
        if (u == null) {
            try { u = writeDownload(name, json, null, sub); } catch (Exception e) { return null; }
            if (u != null) p.edit().putString(key, u.toString()).apply();
        }
        return u;
    }

    private Uri writeDownload(String name, String content, Uri existing, String sub) throws IOException {
        return writeDownload(name, content.getBytes(StandardCharsets.UTF_8), existing, sub, "application/json");
    }

    private Uri writeDownload(String name, byte[] bytes, Uri existing, String sub, String mime) throws IOException {
        ContentResolver cr = getContentResolver();
        Uri u = existing;
        if (u == null) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Satış" + sub);
            u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (u == null) return null;
        }
        try (OutputStream o = cr.openOutputStream(u, "wt")) {
            if (o == null) throw new IOException("no stream");
            o.write(bytes);
        }
        return u;
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    private static void writeAtomic(File f, String s) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write(s.getBytes(StandardCharsets.UTF_8));
            o.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new IOException("rename failed");
    }

    private static String readFile(File f) {
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            return new String(readAll(in, Integer.MAX_VALUE), StandardCharsets.UTF_8);
        } catch (IOException e) { return ""; }
    }

    private static void writeGzAtomic(File f, String s) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream fo = new FileOutputStream(tmp); GZIPOutputStream o = new GZIPOutputStream(fo)) {
            o.write(s.getBytes(StandardCharsets.UTF_8));
            o.finish();
            fo.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new IOException("rename failed");
    }

    private static String readSnapshot(File f) {
        if (!f.getName().endsWith(".gz")) return readFile(f);
        try (InputStream in = new GZIPInputStream(new FileInputStream(f))) {
            return new String(readAll(in, Integer.MAX_VALUE), StandardCharsets.UTF_8);
        } catch (IOException e) { return ""; }
    }

    /** Accept only a complete data document; this prevents a partial/corrupt write replacing real records. */
    private static boolean validData(String json) {
        if (json == null || json.isEmpty()) return false;
        try {
            JSONObject d = new JSONObject(json);
            return d.optJSONArray("cariler") != null && d.optJSONArray("kumaslar") != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** If the primary file is missing or damaged, restore the newest readable snapshot before the page opens. */
    private String loadSafe() {
        String current = readFile(dataFile());
        if (validData(current)) return current;
        for (File f : snapshots()) {
            String candidate = readSnapshot(f);
            if (!validData(candidate)) continue;
            try { writeAtomic(dataFile(), candidate); } catch (Exception ignored) { }
            return candidate;
        }
        return "";
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            b.write(buf, 0, n);
            if (b.size() > max) throw new IOException("too large");
        }
        return b.toByteArray();
    }

    private static String clean(String s) { return s == null ? "x" : s.replaceAll("[^A-Za-z0-9._-]", "-"); }

    /* ---------------- bridge used by the page ---------------- */

    public class Bridge {
        @JavascriptInterface
        public String load() { synchronized (lock) { return loadSafe(); } }

        @JavascriptInterface
        public boolean save(String json) {
            if (!validData(json)) return false;
            try {
                synchronized (lock) {
                    File[] snaps = snapshots();
                    // Keep a complete compressed copy before replacing the primary file.
                    if (snaps.length == 0 || System.currentTimeMillis() - snaps[0].lastModified() > SNAP_EVERY) {
                        writeSnapshot("oto", json);
                    }
                    writeAtomic(dataFile(), json);
                    if (!validData(readFile(dataFile()))) return false;
                }
            } catch (Exception e) { return false; }
            mirrorDirty = true;
            if (System.currentTimeMillis() - lastMirror > 30_000) mirror(json);
            return true;
        }

        @JavascriptInterface
        public boolean snapshot(String tag) {
            try {
                synchronized (lock) {
                    String cur = readFile(dataFile());
                    if (!validData(cur)) return false;
                    writeSnapshot(clean(tag), cur);
                }
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String backups() {
            JSONArray a = new JSONArray();
            File[] fs;
            synchronized (lock) { fs = snapshots(); }
            for (File f : fs) {
                try {
                    String n = f.getName();
                    String[] p = n.substring(6, n.length() - (n.endsWith(".gz") ? 8 : 5)).split("_");
                    JSONObject o = new JSONObject();
                    o.put("name", n);
                    o.put("time", f.lastModified());
                    o.put("size", f.length());
                    if (p.length >= 4) {
                        if (!"-1".equals(p[1])) o.put("cariler", Integer.parseInt(p[1]));
                        if (!"-1".equals(p[2])) o.put("kumaslar", Integer.parseInt(p[2]));
                        o.put("tag", p[3]);
                    }
                    a.put(o);
                } catch (Exception ignored) { }
            }
            return a.toString();
        }

        @JavascriptInterface
        public String readBackup(String name) {
            if (name == null || name.contains("/") || name.contains("\\") || name.contains("..")) return "";
            synchronized (lock) { return readSnapshot(new File(backupDir(), name)); }
        }

        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                File[] s;
                synchronized (lock) { s = snapshots(); }
                o.put("snapshots", s.length);
                o.put("lastSnapshot", s.length > 0 ? s[0].lastModified() : 0);
                o.put("dataTime", dataFile().exists() ? dataFile().lastModified() : 0);
                o.put("mirrorTime", prefs().getLong("mirrorTime", 0));
                o.put("mirrorPath", Build.VERSION.SDK_INT >= 29 ? "İndirilenler › Satış" : "");
                o.put("canShare", Build.VERSION.SDK_INT >= 29);
                o.put("version", versionName());
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public void saveFile(String content, String name, String mime) {
            pendingSave = content;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime)
                        .putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE); } catch (Exception e) { pendingSave = null; callJs("save", "error", null); }
            });
        }

        @JavascriptInterface
        public void openFile() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                                Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADownload"));
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { callJs("open", "error", null); }
            });
        }

        @JavascriptInterface
        public boolean share(String content, String name) {
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                Uri u = writeDownload(clean(name), content, null, "");
                if (u == null) return false;
                Intent send = new Intent(Intent.ACTION_SEND).setType("application/json")
                        .putExtra(Intent.EXTRA_STREAM, u)
                        .putExtra(Intent.EXTRA_SUBJECT, name)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newRawUri(name, u));
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Yedeği gönder")));
                return true;
            } catch (Exception e) { return false; }
        }

        /** Sends the installed app (Satis.apk) and all records together, for moving to a new phone. */
        @JavascriptInterface
        public boolean shareTransfer(String content, String name) {
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                Uri data = writeDownload(clean(name), content, null, "");
                byte[] apkBytes;
                try (InputStream in = new FileInputStream(getApplicationInfo().sourceDir)) { apkBytes = readAll(in, 200 * 1024 * 1024); }
                String apkMime = "application/vnd.android.package-archive";
                SharedPreferences p = prefs();
                Uri apk = null;
                String saved = p.getString("apkUri", null);
                if (saved != null) {
                    try { apk = writeDownload("Satis.apk", apkBytes, Uri.parse(saved), "", apkMime); } catch (Exception e) { apk = null; }
                }
                if (apk == null) {
                    apk = writeDownload("Satis.apk", apkBytes, null, "", apkMime);
                    if (apk != null) p.edit().putString("apkUri", apk.toString()).apply();
                }
                if (data == null || apk == null) return false;
                ArrayList<Uri> uris = new ArrayList<>();
                uris.add(apk);
                uris.add(data);
                Intent send = new Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*")
                        .putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ClipData clip = ClipData.newRawUri("Satış", apk);
                clip.addItem(new ClipData.Item(data));
                send.setClipData(clip);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Yeni telefona gönder")));
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void setBars(String bg, String nav, boolean dark) {
            runOnUiThread(() -> {
                try {
                    int c = Color.parseColor(bg);
                    root.setBackgroundColor(c);
                    if (Build.VERSION.SDK_INT < 30) {
                        getWindow().setStatusBarColor(c);
                        getWindow().setNavigationBarColor(Color.parseColor(nav));
                    }
                    applyBarIcons(!dark);
                } catch (Exception ignored) { }
            });
        }

        /** Daily reminder state for the settings screen. */
        @JavascriptInterface
        public String reminders() {
            JSONObject o = new JSONObject();
            try {
                for (String w : ReminderReceiver.ALL) {
                    JSONObject x = new JSONObject();
                    x.put("on", ReminderReceiver.on(MainActivity.this, w));
                    x.put("time", ReminderReceiver.time(MainActivity.this, w));
                    o.put(w, x);
                }
                NotificationManager nm = getSystemService(NotificationManager.class);
                o.put("notif", nm != null && nm.areNotificationsEnabled());
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public boolean setReminder(String which, boolean on, String time) {
            if (which == null || (!"sabah".equals(which) && !"aksam".equals(which))) return false;
            if (time == null || !time.matches("\\d{1,2}:\\d{2}")) time = ReminderReceiver.time(MainActivity.this, which);
            prefs().edit().putBoolean("rem-" + which, on).putString("remtime-" + which, time).apply();
            ReminderReceiver.schedule(MainActivity.this, which);
            return true;
        }

        @JavascriptInterface
        public void testNotif() { ReminderReceiver.post(MainActivity.this, "sabah"); }

        /** Asks for the notification permission, or opens the app's notification settings if it was refused before. */
        @JavascriptInterface
        public void askNotif() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{ android.Manifest.permission.POST_NOTIFICATIONS }, 21);
                    return;
                }
                try {
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void haptic(String kind) {
            runOnUiThread(() -> {
                int c = HapticFeedbackConstants.KEYBOARD_TAP;
                if (Build.VERSION.SDK_INT >= 30) {
                    c = "ok".equals(kind) ? HapticFeedbackConstants.CONFIRM
                            : "warn".equals(kind) ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.CLOCK_TICK;
                }
                web.performHapticFeedback(c);
            });
        }
    }
}
