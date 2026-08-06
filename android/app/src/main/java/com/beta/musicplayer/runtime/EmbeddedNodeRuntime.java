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
    private static final int SERVICE_PORT = 3000;
    private static volatile boolean started = false;
    /**
     * node::Start 在同一进程内只允许调用一次（Node 18 的 V8 trap handler 状态
     * 是一次性的，二次调用会触发不可捕获的 SIGTRAP 使整个进程崩溃）。
     */
    private static volatile boolean nodeStartInvoked = false;

    static {
        System.loadLibrary("node");
        System.loadLibrary("embeddednode");
    }

    private EmbeddedNodeRuntime() { }

    public static synchronized void start(Context context) {
        if (started) return;
        // 服务已在监听（上一轮线程仍阻塞在 node::Start 中）→ 无需再启动
        if (isServiceListening()) return;
        // 本进程已调用过 node::Start 且服务已退出：Node 不支持同进程二次
        // 启动，交由上层降级到外部 API
        if (nodeStartInvoked) return;
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
                try {
                    // Android 上 /tmp 不可写，api-enhanced 依赖 os.tmpdir() 写
                    // anonymous_token，改指向应用私有目录
                    android.system.Os.setenv("TMPDIR", nodeDirectory.getAbsolutePath(), true);
                } catch (Throwable ignored) {
                }
                nodeStartInvoked = true;
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

    /** 探测本机 3000 端口是否有 API 服务在监听。 */
    private static boolean isServiceListening() {
        try (java.net.Socket socket = new java.net.Socket()) {
            socket.connect(
                    new java.net.InetSocketAddress("127.0.0.1", SERVICE_PORT), 300);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
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
