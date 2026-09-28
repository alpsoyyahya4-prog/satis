package com.satis.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/**
 * Daily price reminders. Each alarm posts its notification and books the next day's,
 * and boot / time changes / app updates re-book both.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL = "hatirlatma";
    static final String BACKUP_CHANNEL = "yedekleme";
    static final String[] ALL = { "sabah", "aksam" };

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("satis", Context.MODE_PRIVATE);
    }

    static boolean on(Context c, String which) { return prefs(c).getBoolean("rem-" + which, true); }

    static String time(Context c, String which) {
        return prefs(c).getString("remtime-" + which, "sabah".equals(which) ? "08:00" : "19:00");
    }

    static void scheduleAll(Context c) { for (String w : ALL) schedule(c, w); }

    static void schedule(Context c, String which) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = pending(c, which);
        am.cancel(pi);
        if (!on(c, which)) return;
        String[] hm = time(c, which).split(":");
        Calendar t = Calendar.getInstance();
        try {
            t.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
            t.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
        } catch (Exception e) { return; }
        t.set(Calendar.SECOND, 0);
        t.set(Calendar.MILLISECOND, 0);
        if (t.getTimeInMillis() <= System.currentTimeMillis() + 1000) t.add(Calendar.DAY_OF_YEAR, 1);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi);
    }

    private static PendingIntent pending(Context c, String which) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction("satis-" + which).putExtra("which", which);
        return PendingIntent.getBroadcast(c, "sabah".equals(which) ? 1 : 2, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        String which = i == null ? null : i.getStringExtra("which");
        if (which == null) { scheduleAll(c); return; }   // boot, time change, app updated
        if (on(c, which)) post(c, which);
        schedule(c, which);                               // book tomorrow
    }

    static void post(Context c, String which) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Fiyat hatırlatmaları", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Sabah ve akşam fiyat hatırlatmaları");
            nm.createNotificationChannel(ch);
        }
        boolean sabah = "sabah".equals(which);
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, sabah ? 11 : 12, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(c.getResources().getIdentifier("ic_notif", "drawable", c.getPackageName()))
                .setContentTitle(sabah ? "Patron, yeni fiyatlar hazır mı?" : "Patron, kapanış saatin geldi")
                .setContentText(sabah ? "Günün fiyatlarını girmeyi unutma." : "Fiyatları yenilemeyi unutma.")
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build();
        nm.notify(sabah ? 1 : 2, n);
    }
    static void postBackup(Context c, boolean ok, String text) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(BACKUP_CHANNEL, "Yedekleme bildirimleri",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Satış kayıtlarının otomatik yedekleme durumu");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 90, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, BACKUP_CHANNEL)
                .setSmallIcon(c.getResources().getIdentifier("ic_notif", "drawable", c.getPackageName()))
                .setContentTitle(ok ? "Yedekleme tamamlandı" : "Yedekleme uyarısı")
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build();
        nm.notify(90, n);
    }

}
