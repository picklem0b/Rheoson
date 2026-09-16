package com.lethabo.rheoson;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * DownloadForegroundService — keeps the OS from killing Rheoson while a
 * download is running, even when the WebView is backgrounded or the screen
 * is off.
 *
 * This is the missing piece behind "downloads die when I lock my phone":
 * the actual transfer runs in the Termux/backend process (yt-dlp), but the
 * OS was free to freeze the whole app — including the WebView that drives
 * it and the HTTP connection that polls progress. A started foreground
 * service with a persistent notification holds a foreground-service slot
 * for the app's process group.
 *
 * It carries no download logic — start/stop with counts, update the
 * notification text. The JS side calls start when the first job begins
 * and stop when the last one ends (see downloadForeground.lib.ts).
 */
public class DownloadForegroundService extends Service {

    public static final String CHANNEL_ID = "rheoson_downloads";
    private static final int NOTIFICATION_ID = 41;

    private static final String ACTION_START = "START";
    private static final String ACTION_STOP = "STOP";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_COUNT = "count";

    /** entry point used by the Capacitor plugin */
    public static void start(Context context, String title, int count) {
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(EXTRA_COUNT, Math.max(1, count));
        context.startForegroundService(intent);
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_STOP;
        if (ACTION_STOP.equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        int count = intent.getIntExtra(EXTRA_COUNT, 1);
        Notification notification = buildNotification(title, count);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    private Notification buildNotification(String title, int count) {
        // Launch the app on tap — progress detail lives in the WebView.
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = launch != null
            ? PendingIntent.getActivity(
                  this, 0, launch,
                  PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
            : null;

        String text = count <= 1
            ? (title == null || title.isEmpty() ? "Downloading…" : "Downloading: " + title)
            : "Downloading " + count + " tracks…";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Rheoson")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build();
    }

    private static void createChannel(Context context) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Active download progress");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
