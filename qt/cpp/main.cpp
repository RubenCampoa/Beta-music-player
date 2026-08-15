#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QSurfaceFormat>
#include <QUrl>
#include <QDir>
#include <QFileInfo>
#include <QWindow>
#include <QQuickWindow>
#include <QSystemTrayIcon>
#include <QMenu>
#include <QAction>
#include <QCloseEvent>
#include <QSettings>
#include <QIcon>
#include <QScreen>
#include <QTimer>
#include <QFile>
#include <QCoreApplication>
#include <QLocalServer>
#include <QLocalSocket>
#include <algorithm>

#include "MusicBridge.h"
#include "WindowsFrame.h"
#include "WebLoginWindow.h"

namespace {
void traceMain(const QByteArray &message)
{
    const QString path = qEnvironmentVariable("BETA_STARTUP_TRACE");
    if (path.isEmpty()) return;
    QFile file(path);
    if (file.open(QIODevice::WriteOnly | QIODevice::Append)) {
        file.write(message + '\n');
        file.flush();
    }
}

class WindowLifecycle final : public QObject
{
public:
    explicit WindowLifecycle(QWindow *window) : m_window(window) {}
    bool quitting = false;

protected:
    bool eventFilter(QObject *watched, QEvent *event) override
    {
        if (watched == m_window && event->type() == QEvent::Close && !quitting) {
            // 托盘可用时关闭窗口只隐藏到托盘；托盘不可用时继续运行只会
            // 让用户再也找不到窗口，所以直接退出应用。
            if (QSystemTrayIcon::isSystemTrayAvailable()) {
                event->ignore();
                m_window->hide();
                return true;
            }
            QCoreApplication::quit();
            return false;
        }
        if (watched == m_window && (event->type() == QEvent::Move || event->type() == QEvent::Resize)
            && m_window->visibility() == QWindow::Windowed) {
            QSettings settings;
            settings.setValue(QStringLiteral("windowGeometry"), m_window->geometry());
        }
        return QObject::eventFilter(watched, event);
    }

private:
    QPointer<QWindow> m_window;
};
}

int main(int argc, char *argv[])
{
    traceMain("main:begin");
    bool sidecarSelfTest = false;
    for (int index = 1; index < argc; ++index)
        sidecarSelfTest = sidecarSelfTest || QByteArray(argv[index]) == QByteArrayLiteral("--sidecar-self-test");

    // The sidecar smoke test deliberately avoids the GUI stack so it also
    // works on clean CI machines without a windowing platform plugin.
    if (sidecarSelfTest) {
        QCoreApplication app(argc, argv);
        QCoreApplication::setApplicationName(QStringLiteral("BetaMusicPlayerQt"));
        QCoreApplication::setOrganizationName(QStringLiteral("BetaMusicPlayer"));
        QCoreApplication::setOrganizationDomain(QStringLiteral("com.beta.musicplayer"));
        MusicBridge bridge;
        return bridge.sidecarReady() ? 0 : 3;
    }

#ifdef Q_OS_WIN
    // A portable build must not inherit an incompatible platform selection
    // from another Qt installation on the host machine.
    const QString runtimeDirectory = QFileInfo(QString::fromLocal8Bit(argv[0])).absolutePath();
    const QString bundledPlatformDirectory = QDir(runtimeDirectory).filePath(QStringLiteral("platforms"));
    if (QFileInfo::exists(QDir(bundledPlatformDirectory).filePath(QStringLiteral("qwindows.dll")))) {
        qputenv("QT_QPA_PLATFORM", QByteArrayLiteral("windows"));
        qputenv("QT_QPA_PLATFORM_PLUGIN_PATH", QDir::toNativeSeparators(bundledPlatformDirectory).toUtf8());
    }
#endif

    QSurfaceFormat format = QSurfaceFormat::defaultFormat();
    // Four samples keep rounded edges smooth while halving the multisample
    // render-target cost compared with the previous global 8x setting.
    format.setSamples(4);
    format.setAlphaBufferSize(8);
    QSurfaceFormat::setDefaultFormat(format);

    // QWebEngineView（网页登录）与 QML 混用时，需要共享 OpenGL 上下文，
    // 否则 WebEngine 的渲染帧无法合成进窗口，网页会显示为空白。
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    traceMain("main:before-application");
    QApplication app(argc, argv);
    traceMain("main:application-ready");

    // 单实例保护：若已有实例在运行，通知其唤起主窗口后直接退出，
    // 避免多个实例同时写入本地存储造成数据覆盖。
    QLocalSocket probe;
    probe.connectToServer(QStringLiteral("BetaMusicPlayerQt.SingleInstance"));
    if (probe.waitForConnected(300)) {
        probe.write("show");
        probe.flush();
        probe.waitForBytesWritten(300);
        return 0;
    }
    QLocalServer singleInstanceServer;
    singleInstanceServer.setSocketOptions(QLocalServer::UserAccessOption);
    singleInstanceServer.removeServer(QStringLiteral("BetaMusicPlayerQt.SingleInstance"));
    singleInstanceServer.listen(QStringLiteral("BetaMusicPlayerQt.SingleInstance"));

    QApplication::setApplicationName(QStringLiteral("BetaMusicPlayerQt"));
    QApplication::setApplicationDisplayName(QStringLiteral("Beta Music Player"));
    QApplication::setOrganizationName(QStringLiteral("BetaMusicPlayer"));
    QApplication::setOrganizationDomain(QStringLiteral("com.beta.musicplayer"));
    QApplication::setQuitOnLastWindowClosed(false);
    QQuickStyle::setStyle(QStringLiteral("Fusion"));

    // Development builds live in qt/cpp/build-* while the shared QML and
    // local API server live in qt/. Resolve that root so the executable also
    // works when started from Explorer instead of a prepared terminal.
    const QString executableDir = QCoreApplication::applicationDirPath();
    const QStringList rootCandidates{
        QDir::currentPath(),
        QDir(executableDir).absoluteFilePath(QStringLiteral("../..")),
        executableDir
    };
    QString appRoot;
    for (const QString &candidate : rootCandidates) {
        const QString normalized = QDir(candidate).absolutePath();
        if (QFileInfo::exists(QDir(normalized).filePath(QStringLiteral("app/ui/main.qml")))) {
            appRoot = normalized;
            break;
        }
    }
    if (appRoot.isEmpty()) return 2;
    QDir::setCurrent(appRoot);

    traceMain("main:before-bridge");
    MusicBridge bridge;
    traceMain("main:bridge-ready");
    WebLoginWindow webLogin;
    QObject::connect(&bridge, &MusicBridge::webLoginRequested, &webLogin, &WebLoginWindow::begin);
    QObject::connect(&webLogin, &WebLoginWindow::loginCompleted,
                     &bridge, &MusicBridge::complete_web_login);
    WindowsFrame nativeFrame;
    app.installNativeEventFilter(&nativeFrame);
    QQmlApplicationEngine engine;
    engine.addImportPath(QCoreApplication::applicationDirPath() + QStringLiteral("/app/ui"));
    engine.addImportPath(QDir::currentPath() + QStringLiteral("/app/ui"));
    engine.rootContext()->setContextProperty(QStringLiteral("bridge"), &bridge);
    engine.rootContext()->setContextProperty(QStringLiteral("appVersion"), QStringLiteral(BETA_APP_VERSION));

    // run_cpp.bat starts the executable with qt/ as its working directory;
    // keeping QML external lets the existing hand-tuned UI remain editable.
    const QUrl qmlUrl = QUrl::fromLocalFile(
        QDir(appRoot).absoluteFilePath(QStringLiteral("app/ui/main.qml")));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
                     &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.load(qmlUrl);
    if (engine.rootObjects().isEmpty())
        return 1;

    auto *window = qobject_cast<QWindow *>(engine.rootObjects().constFirst());
    bridge.setWindow(window);
    nativeFrame.attach(window);
    // 二次启动时，已有实例收到 "show" 后唤起主窗口（含从托盘恢复）。
    QObject::connect(&singleInstanceServer, &QLocalServer::newConnection, &singleInstanceServer,
                     [window, &singleInstanceServer] {
        while (QLocalSocket *connection = singleInstanceServer.nextPendingConnection()) {
            connection->disconnectFromServer();
            connection->deleteLater();
        }
        if (!window) return;
        // 从隐藏（托盘）或最小化状态恢复并前置主窗口。
        window->show();
        if (window->windowState() & Qt::WindowMinimized)
            window->showNormal();
        window->raise();
        window->requestActivate();
    });
    nativeFrame.setMediaActionHandler([&bridge](int action) {
        if (action == 0) bridge.toggle_play();
        else if (action == 1) bridge.prev();
        else bridge.next();
    });

    QSettings windowSettings;
    const QRect savedGeometry = windowSettings.value(QStringLiteral("windowGeometry")).toRect();
    QScreen *targetScreen = savedGeometry.isValid()
        ? QGuiApplication::screenAt(savedGeometry.center())
        : QGuiApplication::primaryScreen();
    if (!targetScreen) targetScreen = QGuiApplication::primaryScreen();
    if (targetScreen) {
        const QRect available = targetScreen->availableGeometry();
        QRect targetGeometry = savedGeometry.isValid()
            ? savedGeometry
            : QRect(QPoint(), QSize(1240, 820));
        targetGeometry.setWidth(std::min(targetGeometry.width(), available.width()));
        targetGeometry.setHeight(std::min(targetGeometry.height(), available.height()));
        if (!savedGeometry.isValid()) {
            targetGeometry.moveCenter(available.center());
        } else {
            targetGeometry.moveLeft(std::clamp(targetGeometry.left(), available.left(),
                                                available.right() - targetGeometry.width() + 1));
            targetGeometry.moveTop(std::clamp(targetGeometry.top(), available.top(),
                                               available.bottom() - targetGeometry.height() + 1));
        }
        window->setGeometry(targetGeometry);
    }

    WindowLifecycle lifecycle(window);
    window->installEventFilter(&lifecycle);
    window->show();
    window->raise();
    window->requestActivate();
    // Qt 在首次 show() 时可能重新套用 FramelessWindowHint 剥掉 WS_THICKFRAME，
    // 导致无边框窗口无法缩放。显示后再补一次边框样式，恢复原生缩放。
    nativeFrame.applyFrameStyle();
    // 最大化/全屏切换也会被 Qt 重写样式；状态变化后（延迟到下一轮事件循环）
    // 再补一次，保证从全屏/最大化恢复后依然可以缩放。
    QObject::connect(window, &QWindow::windowStateChanged, window, [&nativeFrame] {
        QTimer::singleShot(0, [&nativeFrame] { nativeFrame.applyFrameStyle(); });
    });

    QString iconPath = QDir(appRoot).absoluteFilePath(QStringLiteral("app-icon.png"));
    if (!QFileInfo::exists(iconPath))
        iconPath = QDir(appRoot).absoluteFilePath(QStringLiteral("../public/icon.png"));
    const QIcon appIcon(iconPath);
    if (!appIcon.isNull()) {
        QApplication::setWindowIcon(appIcon);
        window->setIcon(appIcon);
    }

    QSystemTrayIcon tray(appIcon);
    QMenu trayMenu;
    QAction *showAction = trayMenu.addAction(QStringLiteral("显示主界面"));
    trayMenu.addSeparator();
    QAction *playAction = trayMenu.addAction(QStringLiteral("播放 / 暂停"));
    QAction *previousAction = trayMenu.addAction(QStringLiteral("上一首"));
    QAction *nextAction = trayMenu.addAction(QStringLiteral("下一首"));
    trayMenu.addSeparator();
    QAction *quitAction = trayMenu.addAction(QStringLiteral("退出 Beta Music Player"));
    QObject::connect(showAction, &QAction::triggered, window, [window] { window->show(); window->raise(); window->requestActivate(); });
    QObject::connect(playAction, &QAction::triggered, &bridge, &MusicBridge::toggle_play);
    QObject::connect(previousAction, &QAction::triggered, &bridge, &MusicBridge::prev);
    QObject::connect(nextAction, &QAction::triggered, &bridge, &MusicBridge::next);
    QObject::connect(quitAction, &QAction::triggered, &app, [&] { lifecycle.quitting = true; app.quit(); });
    QObject::connect(&tray, &QSystemTrayIcon::activated, window, [window](QSystemTrayIcon::ActivationReason reason) {
        if (reason == QSystemTrayIcon::Trigger || reason == QSystemTrayIcon::DoubleClick) {
            window->show(); window->raise(); window->requestActivate();
        }
    });
    tray.setContextMenu(&trayMenu);
    tray.setToolTip(QStringLiteral("Beta Music Player"));
    if (QSystemTrayIcon::isSystemTrayAvailable()) tray.show();

    // 桌面歌词悬浮窗（初始隐藏，由 bridge.toggle_desktop_lyric 控制显示）。
    const QUrl desktopLyricUrl = QUrl::fromLocalFile(
        QDir(appRoot).absoluteFilePath(QStringLiteral("app/ui/DesktopLyric.qml")));
    engine.load(desktopLyricUrl);
    for (QObject *object : engine.rootObjects()) {
        auto *lyricWindow = qobject_cast<QWindow *>(object);
        if (lyricWindow && lyricWindow != window) {
            bridge.setDesktopLyricWindow(lyricWindow);
            QSettings lyricSettings;
            const QRect lyricGeometry = lyricSettings.value(QStringLiteral("desktopLyricGeometry")).toRect();
            bool lyricVisible = false;
            for (QScreen *screen : QApplication::screens())
                lyricVisible = lyricVisible || screen->availableGeometry().intersects(lyricGeometry);
            if (lyricGeometry.isValid() && lyricVisible
                  && lyricGeometry.width() <= 1200 && lyricGeometry.height() <= 260)
                  lyricWindow->setGeometry(lyricGeometry);
            const auto persistLyricGeometry = [lyricWindow] {
                QSettings settings;
                settings.setValue(QStringLiteral("desktopLyricGeometry"), lyricWindow->geometry());
            };
            QObject::connect(lyricWindow, &QWindow::xChanged, lyricWindow, persistLyricGeometry);
            QObject::connect(lyricWindow, &QWindow::yChanged, lyricWindow, persistLyricGeometry);
            QObject::connect(lyricWindow, &QWindow::widthChanged, lyricWindow, persistLyricGeometry);
            QObject::connect(lyricWindow, &QWindow::heightChanged, lyricWindow, persistLyricGeometry);
            break;
        }
    }

    if (app.arguments().contains(QStringLiteral("--self-test"))) {
        QTimer::singleShot(100, &app, [&app, &bridge] {
            app.exit(bridge.sidecarReady() ? 0 : 3);
        });
    }

    return app.exec();
}
