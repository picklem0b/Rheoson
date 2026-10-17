package com.lethabo.rheoson;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Capacitor bridge for {@link CrashLogger}.
 *
 * `consume()` returns the traces a previous run persisted and deletes them, so
 * a report can never be delivered twice. Both methods resolve under every
 * failure mode — a plugin that rejects (or worse, throws) while the app is
 * already recovering from a crash turns one problem into two.
 *
 * File I/O runs on a single background executor rather than the main thread:
 * plugin methods are invoked on the UI thread, and reading several traces
 * during startup is exactly where an ANR would be blamed on the crash it is
 * trying to report.
 */
@CapacitorPlugin(name = "CrashLog")
public class CrashLogPlugin extends Plugin {

    /** Matches CrashLogger's cap; a larger file is truncated rather than skipped. */
    private static final long MAX_TRACE_BYTES = 128 * 1024;

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void consume(PluginCall call) {
        io.execute(
                () -> {
                    JSArray crashes = new JSArray();
                    try {
                        for (File file : crashFiles()) {
                            String text = read(file);
                            if (text != null && !text.isEmpty()) {
                                crashes.put(text);
                            }
                            //noinspection ResultOfMethodCallIgnored
                            file.delete();
                        }
                    } catch (Throwable ignored) {
                        // Resolve with whatever was read; leftover files are
                        // retried on the next launch.
                    }
                    JSObject result = new JSObject();
                    result.put("crashes", crashes);
                    resolveQuietly(call, result);
                });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        io.execute(
                () -> {
                    try {
                        for (File file : crashFiles()) {
                            //noinspection ResultOfMethodCallIgnored
                            file.delete();
                        }
                    } catch (Throwable ignored) {
                        // Nothing to do — the next consume() will retry.
                    }
                    resolveQuietly(call, new JSObject());
                });
    }

    private File[] crashFiles() {
        Context context = getContext();
        if (context == null) {
            return new File[0];
        }
        File dir = new File(context.getFilesDir(), "crashes");
        File[] files = dir.listFiles();
        return files == null ? new File[0] : files;
    }

    private String read(File file) {
        long length = file.length();
        if (length <= 0 || length > MAX_TRACE_BYTES) {
            return null;
        }
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[(int) length];
            int offset = 0;
            // A single read() is allowed to return fewer bytes than asked for;
            // looping is what makes a truncated trace impossible.
            while (offset < buffer.length) {
                int read = in.read(buffer, offset, buffer.length - offset);
                if (read <= 0) {
                    break;
                }
                offset += read;
            }
            return offset == 0 ? null : new String(buffer, 0, offset, StandardCharsets.UTF_8);
        } catch (Throwable ignored) {
            return null;
        }
    }

    /** The WebView may already be gone by the time I/O finishes. */
    private void resolveQuietly(PluginCall call, JSObject result) {
        try {
            call.resolve(result);
        } catch (Throwable ignored) {
            // Bridge torn down — the file was already deleted, so a stale
            // report is not a risk.
        }
    }
}
