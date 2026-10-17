package com.lethabo.rheoson;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;

/**
 * Records native crashes to a file so they can be reported on the next launch.
 *
 * A native crash cannot be uploaded when it happens — the process is already
 * dying, and any work on the crashing thread is lost. The only reliable
 * approach is to write the trace to disk synchronously, then let the JS layer
 * pick it up on the next start (see {@link CrashLogPlugin} and the app's
 * `lib/crashReporter.ts`). Without this, a hard crash is invisible: the
 * WebView never runs its error handlers, so the JS reporter sees nothing at
 * all — which is exactly why the Android directory-scan crashes left no trace.
 *
 * The file is written under the app's own {@code filesDir}, so it survives the
 * crash and needs no storage permission.
 */
public final class CrashLogger {

    private static final String TAG = "RheosonCrash";
    private static final String DIRECTORY = "crashes";
    /** Bounded so a crash loop cannot fill the device. */
    private static final int MAX_FILES = 10;
    private static final int MAX_CHARS = 48_000;

    private static volatile boolean installed = false;

    private CrashLogger() {}

    /**
     * Install the handler once per process.
     *
     * Call this as early as possible (MainActivity.onCreate, before the bridge
     * is built) — a crash during startup is the most valuable one to capture.
     */
    public static void install(Context context) {
        if (installed) {
            return;
        }
        installed = true;

        final Context appContext = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous =
                Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler(
                (thread, throwable) -> {
                    // Wrap everything: an exception thrown from an uncaught
                    // exception handler replaces the original stack trace with
                    // a useless one, and leaves the app in a zombie state.
                    try {
                        write(appContext, thread, throwable);
                    } catch (Throwable inner) {
                        Log.w(TAG, "could not persist crash", inner);
                    }
                    // Hand back to the platform so the process still dies the
                    // way Android expects (and logcat keeps its trace).
                    if (previous != null) {
                        previous.uncaughtException(thread, throwable);
                    }
                });
    }

    private static void write(Context context, Thread thread, Throwable throwable) {
        File dir = new File(context.getFilesDir(), DIRECTORY);
        if (!dir.exists() && !dir.mkdirs()) {
            return;
        }

        StringWriter buffer = new StringWriter();
        try (PrintWriter writer = new PrintWriter(buffer)) {
            writer.println("Native crash: " + throwable.getClass().getName());
            writer.println(
                    "Thread: " + (thread == null ? "?" : thread.getName()));
            writer.println(
                    "Time: "
                            + new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
                                    .format(new Date()));
            // The app version is attached by the JS layer when it drains the
            // file, so this stays independent of BuildConfig generation.
            writer.println();
            throwable.printStackTrace(writer);
        }

        String text = buffer.toString();
        if (text.length() > MAX_CHARS) {
            text = text.substring(0, MAX_CHARS);
        }

        String name =
                "crash-"
                        + System.currentTimeMillis()
                        + "-"
                        + Thread.currentThread().getId()
                        + ".txt";
        File target = new File(dir, name);

        // Written synchronously on purpose: the process may be gone in
        // milliseconds, so nothing may be deferred to another thread.
        try (FileOutputStream out = new FileOutputStream(target)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.flush();
            // Force the bytes out so a hard kill cannot leave an empty file.
            out.getFD().sync();
        } catch (Throwable writeFailure) {
            Log.w(TAG, "crash trace write failed", writeFailure);
            return;
        }

        prune(dir);
    }

    /** Keep only the newest {@link #MAX_FILES} traces. */
    private static void prune(File dir) {
        try {
            File[] files = dir.listFiles();
            if (files == null || files.length <= MAX_FILES) {
                return;
            }
            Arrays.sort(files, Comparator.comparingLong(File::lastModified));
            for (int i = 0; i < files.length - MAX_FILES; i++) {
                //noinspection ResultOfMethodCallIgnored
                files[i].delete();
            }
        } catch (Throwable ignored) {
            // Pruning is housekeeping; never let it break reporting.
        }
    }
}
