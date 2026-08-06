package com.beta.musicplayer.runtime;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import com.beta.musicplayer.BuildConfig;

/** Starts and keeps the bundled api-enhanced Node service available. */
public final class EmbeddedNodeRuntime {
    private static final String ASSET_ROOT = "nodejs-project";
    private static volatile boolean started = false;
    /**
     * 16KB 页设备上 nodejs-mobile 18.20.4 预构建的 libnode.so / libc++_shared.so
     * 段布局不兼容（不同权限的 LOAD 段共享 16KB 页，RELRO mprotect 会剥夺代码页
     * 执行权限），加载后在构造函数阶段触发不可捕获的 SIGSEGV，故直接跳过加载，
     * 由上层捕获 UnsupportedOperationException 并降级到外部 API。
     */
    private static final boolean nativeSupported;

    static {
        long pageSize = 4096;
        try {
            pageSize = android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE);
        } catch (Throwable ignored) {
        }
        nativeSupported = pageSize <= 4096;
        if (nativeSupported) {
            System.loadLibrary("node");
            System.loadLibrary("embeddednode");
        }
    }

    private EmbeddedNodeRuntime() { }

    public static synchronized void start(Context context) {
        if (!nativeSupported) {
            throw new UnsupportedOperationException(
                    "Embedded Node runtime is not supported on 16KB page devices");
        }
        if (started) return;
        started = true;
        Context appContext = context.getApplicationContext();
        Thread thread = new Thread(() -> {
            try {
                File nodeDirectory = new File(appContext.getFilesDir(), ASSET_ROOT);
                String markerValue = BuildConfig.VERSION_CODE + ":" + BuildConfig.VERSION_NAME;
                File marker = new File(nodeDirectory, ".version");
                if (!marker.exists() || !markerValue.equals(readText(marker))) {
                    deleteRecursively(nodeDirectory);
                    copyAssetFolder(appContext.getAssets(), ASSET_ROOT, nodeDirectory);
                    writeText(marker, markerValue);
                }
                File readyFile = new File(nodeDirectory, ".ready");
                //noinspection ResultOfMethodCallIgnored
                readyFile.delete();
                int result = startNodeWithArguments(new String[]{
                        "node",
                        new File(nodeDirectory, "main.js").getAbsolutePath(),
                        readyFile.getAbsolutePath(),
                });
                // node::Start blocks while the HTTP server is alive. If it returns,
                // the service stopped and the next app entry must be allowed to restart it.
                started = false;
                android.util.Log.w("EmbeddedNode", "Bundled api-enhanced stopped (code=" + result + ")");
            } catch (Throwable error) {
                started = false;
                android.util.Log.e("EmbeddedNode", "Unable to start bundled api-enhanced", error);
            }
        }, "embedded-node-runtime");
        thread.setDaemon(true);
        thread.start();
    }

    /** Force a restart after a health check detects a stale/dead Node service. */
    public static synchronized void restart(Context context) {
        if (!nativeSupported) {
            throw new UnsupportedOperationException(
                    "Embedded Node runtime is not supported on 16KB page devices");
        }
        started = false;
        File readyFile = new File(
                context.getApplicationContext().getFilesDir(),
                ASSET_ROOT + "/.ready"
        );
        //noinspection ResultOfMethodCallIgnored
        readyFile.delete();
        start(context);
    }

    private static native int startNodeWithArguments(String[] arguments);

    public static boolean isReady(Context context) {
        return new File(
                context.getApplicationContext().getFilesDir(),
                ASSET_ROOT + "/.ready"
        ).isFile();
    }

    private static void copyAssetFolder(AssetManager assets, String assetPath, File destination)
            throws IOException {
        String[] children = assets.list(assetPath);
        if (children == null || children.length == 0) {
            copyAsset(assets, assetPath, destination);
            return;
        }
        if (!destination.exists() && !destination.mkdirs()) {
            throw new IOException("Cannot create " + destination);
        }
        for (String child : children) {
            copyAssetFolder(assets, assetPath + "/" + child, new File(destination, child));
        }
    }

    private static void copyAsset(AssetManager assets, String assetPath, File destination)
            throws IOException {
        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Cannot create " + parent);
        }
        try (InputStream input = assets.open(assetPath);
             OutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        }
    }

    private static String readText(File file) {
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int read = input.read(bytes);
            return new String(bytes, 0, Math.max(0, read), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            return "";
        }
    }

    private static void writeText(File file, String value) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(value.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
