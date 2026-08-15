#include "WebLoginWindow.h"

#include <QNetworkCookie>
#include <QTimer>
#include <QUrl>
#include <QWebEngineCookieStore>
#include <QWebEngineProfile>
#include <QWebEngineSettings>
#include <QWebEngineView>
#include <QWebEngineCertificateError>
#include <QColor>
#include <QDebug>
#include <QFile>
#include <QTextStream>
#include <QStandardPaths>
#include <QDateTime>

namespace {
void webLoginLog(const QString &message)
{
    const QString path = QStandardPaths::writableLocation(QStandardPaths::TempLocation)
        + QStringLiteral("/BetaMusicPlayerWebLogin.log");
    QFile file(path);
    if (file.open(QIODevice::Append | QIODevice::WriteOnly)) {
        QTextStream stream(&file);
        stream << QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss.zzz"))
               << " " << message << "\n";
    }
}
}

LoginWebPage::LoginWebPage(QWebEngineProfile *profile, QObject *parent)
    : QWebEnginePage(profile, parent)
{
}

QWebEnginePage *LoginWebPage::createWindow(QWebEnginePage::WebWindowType type)
{
    Q_UNUSED(type);
    webLoginLog(QStringLiteral("createWindow: popup window requested for OAuth login"));

    auto *popupView = new QWebEngineView;
    popupView->setAttribute(Qt::WA_DeleteOnClose);
    popupView->resize(800, 650);
    popupView->setWindowTitle(QStringLiteral("第三方授权登录"));

    auto *popupPage = new LoginWebPage(profile(), popupView);
    popupView->setPage(popupPage);
    popupPage->setBackgroundColor(QColor(255, 255, 255));

    auto *settings = popupPage->settings();
    settings->setAttribute(QWebEngineSettings::JavascriptEnabled, true);
    settings->setAttribute(QWebEngineSettings::LocalStorageEnabled, true);
    settings->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, false);
    settings->setAttribute(QWebEngineSettings::AllowRunningInsecureContent, false);
    settings->setAttribute(QWebEngineSettings::ScrollAnimatorEnabled, true);
    settings->setAttribute(QWebEngineSettings::PluginsEnabled, false);
    settings->setAttribute(QWebEngineSettings::FullScreenSupportEnabled, true);
    settings->setAttribute(QWebEngineSettings::JavascriptCanOpenWindows, true);
    settings->setAttribute(QWebEngineSettings::JavascriptCanAccessClipboard, false);

    connect(popupPage, &QWebEnginePage::windowCloseRequested, popupView, &QWidget::close);
    connect(popupPage, &QWebEnginePage::certificateError, this,
            [](QWebEngineCertificateError certError) {
        webLoginLog(QStringLiteral("popup certificateError url=") + certError.url().toString());
        certError.rejectCertificate();
    });

    popupView->show();
    popupView->raise();
    popupView->activateWindow();

    return popupPage;
}

WebLoginWindow::WebLoginWindow(QObject *parent) : QObject(parent) {}

void WebLoginWindow::begin(const QString &platform)
{
    if (platform != QStringLiteral("netease") && platform != QStringLiteral("qq") && platform != QStringLiteral("kugou")) return;
    m_platform = platform;
    m_cookies.clear();
    m_completed = false;

    if (m_view) m_view->deleteLater();
    m_view = new QWebEngineView;
    m_view->setAttribute(Qt::WA_DeleteOnClose);
    m_view->resize(1024, 768);

    const QString title = platform == QStringLiteral("qq")
        ? QStringLiteral("登录 QQ 音乐")
        : (platform == QStringLiteral("kugou")
            ? QStringLiteral("登录酷狗概念版")
            : QStringLiteral("登录网易云音乐"));
    m_view->setWindowTitle(title);

    auto *profile = m_view->page()->profile();
    profile->setHttpUserAgent(QStringLiteral(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ));
    profile->cookieStore()->deleteAllCookies();

    auto *page = new LoginWebPage(profile, m_view);
    m_view->setPage(page);
    page->setBackgroundColor(QColor(255, 255, 255));

    auto *settings = page->settings();
    settings->setAttribute(QWebEngineSettings::JavascriptEnabled, true);
    settings->setAttribute(QWebEngineSettings::LocalStorageEnabled, true);
    settings->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, false);
    settings->setAttribute(QWebEngineSettings::AllowRunningInsecureContent, false);
    settings->setAttribute(QWebEngineSettings::ScrollAnimatorEnabled, true);
    settings->setAttribute(QWebEngineSettings::PluginsEnabled, false);
    settings->setAttribute(QWebEngineSettings::FullScreenSupportEnabled, true);
    settings->setAttribute(QWebEngineSettings::JavascriptCanOpenWindows, true);
    settings->setAttribute(QWebEngineSettings::JavascriptCanAccessClipboard, false);

    connect(page, &QWebEnginePage::certificateError, this,
            [](QWebEngineCertificateError certError) {
        webLoginLog(QStringLiteral("certificateError url=") + certError.url().toString());
        certError.rejectCertificate();
    });

    connect(profile->cookieStore(), &QWebEngineCookieStore::cookieAdded, this,
            [this](const QNetworkCookie &cookie) {
        m_cookies.insert(cookie.name(), cookie.value());
        QTimer::singleShot(250, this, &WebLoginWindow::inspectCookies);
    });

    connect(m_view, &QObject::destroyed, this, [this] {
        if (!m_completed && !m_platform.isEmpty()) emit loginCancelled(m_platform);
        m_view = nullptr;
    });

    connect(m_view, &QWebEngineView::loadStarted, this, [] {
        webLoginLog(QStringLiteral("loadStarted"));
    });
    connect(m_view, &QWebEngineView::loadProgress, this, [](int progress) {
        if (progress == 0 || progress == 25 || progress == 50 || progress == 75 || progress == 100)
            webLoginLog(QStringLiteral("loadProgress=") + QString::number(progress));
    });
    connect(m_view, &QWebEngineView::loadFinished, this, [](bool ok) {
        webLoginLog(QStringLiteral("loadFinished ok=") + QString::number(ok));
    });
    connect(page, &QWebEnginePage::renderProcessTerminated, this,
            [](QWebEnginePage::RenderProcessTerminationStatus status, int code) {
        webLoginLog(QStringLiteral("renderProcessTerminated status=")
                    + QString::number(int(status)) + QStringLiteral(" code=") + QString::number(code));
    });

    QUrl url;
    if (platform == QStringLiteral("qq")) {
        url = QUrl(QStringLiteral("https://y.qq.com/"));
    } else if (platform == QStringLiteral("kugou")) {
        url = QUrl(QStringLiteral("http://www.kugou.com/newuc/login/weblogin"));
    } else {
        url = QUrl(QStringLiteral("https://music.163.com/"));
    }

    webLoginLog(QStringLiteral("loading ") + url.toString());

    m_view->load(url);
    m_view->show();
    m_view->raise();
    m_view->activateWindow();
}

QString WebLoginWindow::serializedCookies() const
{
    QStringList parts;
    for (auto it = m_cookies.cbegin(); it != m_cookies.cend(); ++it)
        parts << QString::fromUtf8(it.key()) + QLatin1Char('=') + QString::fromUtf8(it.value());
    return parts.join(QStringLiteral("; "));
}

void WebLoginWindow::inspectCookies()
{
    if (m_completed || m_platform.isEmpty()) return;
    bool ready = false;
    if (m_platform == QStringLiteral("netease")) {
        ready = m_cookies.contains("MUSIC_U") || m_cookies.contains("MUSIC_A");
    } else if (m_platform == QStringLiteral("qq")) {
        const bool hasUin = m_cookies.contains("uin") || m_cookies.contains("wxuin") || m_cookies.contains("p_uin");
        const bool hasKey = m_cookies.contains("p_skey") || m_cookies.contains("qm_keyst")
            || m_cookies.contains("qqmusic_key") || m_cookies.contains("skey")
            || m_cookies.contains("musickey");
        ready = hasUin && hasKey;
    } else if (m_platform == QStringLiteral("kugou")) {
        QByteArray webSession;
        if (m_cookies.contains("KuGoo")) webSession = m_cookies.value("KuGoo");
        else if (m_cookies.contains("kugoo")) webSession = m_cookies.value("kugoo");

        if (!webSession.isEmpty()) {
            QString userId;
            QString token;
            const QList<QByteArray> fields = webSession.split('&');
            for (const QByteArray &field : fields) {
                const int separator = field.indexOf('=');
                if (separator <= 0) continue;
                const QByteArray key = field.left(separator).trimmed();
                const QByteArray value = field.mid(separator + 1).trimmed();
                if (key == "KugooID" || key == "userid") userId = QString::fromUtf8(value);
                else if (key == "t" || key == "token") token = QString::fromUtf8(value);
            }
            if (!userId.isEmpty() && !token.isEmpty()) {
                m_cookies.insert(QByteArray("userid"), userId.toUtf8());
                m_cookies.insert(QByteArray("token"), token.toUtf8());
                ready = true;
            }
        }
        if (!ready) ready = m_cookies.contains("token") && m_cookies.contains("userid");
    }
    if (!ready) return;
    webLoginLog(QStringLiteral("cookies detected"));
    m_completed = true;
    emit loginCompleted(m_platform, serializedCookies());
    if (m_view) m_view->close();
}
