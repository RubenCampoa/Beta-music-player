#ifndef NOMINMAX
#define NOMINMAX
#endif

#include "WebLoginWindow.h"
#include "MusicBridge.h"
#include <QDir>
#include <QStandardPaths>
#include <QDesktopServices>
#include <QUrl>
#include <QIcon>
#include <QDebug>

using namespace Microsoft::WRL;

WebLoginWindow::WebLoginWindow(const QString &platform, MusicBridge *bridge, QWidget *parent)
    : QDialog(parent)
    , m_platform(platform)
    , m_bridge(bridge)
{
    setWindowFlags(Qt::Window | Qt::WindowTitleHint | Qt::WindowSystemMenuHint | Qt::WindowCloseButtonHint | Qt::WindowMinMaxButtonsHint);
    resize(880, 640);
    setMinimumSize(600, 480);
    setWindowIcon(QIcon(QStringLiteral("app.ico")));

    if (m_platform == QStringLiteral("qq")) {
        setWindowTitle(QStringLiteral("QQ 音乐 - 官方网页登录"));
        m_loginUrl = QStringLiteral("https://y.qq.com/portal/profile.html");
    } else {
        setWindowTitle(QStringLiteral("网易云音乐 - 官方网页登录"));
        m_loginUrl = QStringLiteral("https://music.163.com/#/login");
    }

    connect(&m_cookieTimer, &QTimer::timeout, this, &WebLoginWindow::checkCookies);
}

WebLoginWindow::~WebLoginWindow()
{
    m_cookieTimer.stop();
    if (m_controller) {
        m_controller->Close();
        m_controller = nullptr;
    }
    m_webView = nullptr;
    m_environment = nullptr;
}

void WebLoginWindow::showEvent(QShowEvent *event)
{
    QDialog::showEvent(event);
    if (!m_initialized) {
        m_initialized = true;
        initWebView();
    }
}

void WebLoginWindow::resizeEvent(QResizeEvent *event)
{
    QDialog::resizeEvent(event);
    resizeWebView();
}

void WebLoginWindow::closeEvent(QCloseEvent *event)
{
    m_cookieTimer.stop();
    QDialog::closeEvent(event);
}

void WebLoginWindow::initWebView()
{
    const QString profilePath = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
        + QStringLiteral("/webview2_profile");
    QDir().mkpath(profilePath);

    const std::wstring userDataFolder = QDir::toNativeSeparators(profilePath).toStdWString();
    const HWND hwnd = reinterpret_cast<HWND>(this->winId());

    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        userDataFolder.c_str(),
        nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [this, hwnd](HRESULT result, ICoreWebView2Environment *env) -> HRESULT {
                if (FAILED(result) || !env) {
                    qWarning() << "[WebView2] Environment creation failed, fallback to system browser:" << result;
                    QDesktopServices::openUrl(QUrl(m_loginUrl));
                    this->close();
                    return result;
                }

                m_environment = env;
                m_environment->CreateCoreWebView2Controller(
                    hwnd,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [this, hwnd](HRESULT cResult, ICoreWebView2Controller *controller) -> HRESULT {
                            if (FAILED(cResult) || !controller) {
                                qWarning() << "[WebView2] Controller creation failed:" << cResult;
                                QDesktopServices::openUrl(QUrl(m_loginUrl));
                                this->close();
                                return cResult;
                            }

                            m_controller = controller;
                            m_controller->get_CoreWebView2(&m_webView);

                            resizeWebView();
                            m_controller->put_IsVisible(TRUE);

                            if (m_webView) {
                                m_webView->Navigate(m_loginUrl.toStdWString().c_str());
                                m_cookieTimer.start(1000);
                            }
                            return S_OK;
                        }
                    ).Get()
                );
                return S_OK;
            }
        ).Get()
    );

    if (FAILED(hr)) {
        qWarning() << "[WebView2] CreateCoreWebView2EnvironmentWithOptions failed:" << hr;
        QDesktopServices::openUrl(QUrl(m_loginUrl));
        this->close();
    }
}

void WebLoginWindow::resizeWebView()
{
    if (!m_controller) return;
    RECT bounds;
    GetClientRect(reinterpret_cast<HWND>(this->winId()), &bounds);
    m_controller->put_Bounds(bounds);
}

void WebLoginWindow::checkCookies()
{
    if (!m_webView || m_loginCompleted) return;

    ComPtr<ICoreWebView2_2> webView2;
    if (FAILED(m_webView.As(&webView2)) || !webView2) return;

    ComPtr<ICoreWebView2CookieManager> cookieManager;
    if (FAILED(webView2->get_CookieManager(&cookieManager)) || !cookieManager) return;

    std::wstring targetDomain;
    if (m_platform == QStringLiteral("qq")) {
        targetDomain = L"https://y.qq.com";
    } else {
        targetDomain = L"https://music.163.com";
    }

    cookieManager->GetCookies(
        targetDomain.c_str(),
        Callback<ICoreWebView2GetCookiesCompletedHandler>(
            [this](HRESULT hr, ICoreWebView2CookieList *cookieList) -> HRESULT {
                if (FAILED(hr) || !cookieList || m_loginCompleted) return hr;

                UINT count = 0;
                cookieList->get_Count(&count);

                QStringList cookiePairs;
                bool hasValidLoginToken = false;

                for (UINT i = 0; i < count; ++i) {
                    ComPtr<ICoreWebView2Cookie> cookie;
                    if (FAILED(cookieList->GetValueAtIndex(i, &cookie)) || !cookie) continue;

                    LPWSTR name = nullptr;
                    LPWSTR value = nullptr;
                    cookie->get_Name(&name);
                    cookie->get_Value(&value);

                    const QString nameStr = QString::fromWCharArray(name ? name : L"");
                    const QString valueStr = QString::fromWCharArray(value ? value : L"");

                    if (name) CoTaskMemFree(name);
                    if (value) CoTaskMemFree(value);

                    if (nameStr.isEmpty()) continue;

                    if (m_platform == QStringLiteral("netease")) {
                        if (nameStr == QStringLiteral("MUSIC_U") && !valueStr.isEmpty()) {
                            hasValidLoginToken = true;
                        }
                    } else if (m_platform == QStringLiteral("qq")) {
                        if ((nameStr == QStringLiteral("uin") || nameStr == QStringLiteral("p_uin") || nameStr == QStringLiteral("qm_keyst") || nameStr == QStringLiteral("qqmusic_key"))
                            && !valueStr.isEmpty()) {
                            hasValidLoginToken = true;
                        }
                    }

                    cookiePairs.append(QStringLiteral("%1=%2").arg(nameStr, valueStr));
                }

                if (hasValidLoginToken && !m_loginCompleted) {
                    m_loginCompleted = true;
                    m_cookieTimer.stop();
                    const QString fullCookie = cookiePairs.join(QStringLiteral("; "));
                    if (m_bridge) {
                        m_bridge->complete_web_login(m_platform, fullCookie);
                    }
                    this->accept();
                }

                return S_OK;
            }
        ).Get()
    );
}
