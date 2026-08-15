#pragma once

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <QDialog>
#include <QTimer>
#include <QString>
#include <QPointer>
#include <windows.h>
#include <wrl.h>
#include "WebView2.h"

class MusicBridge;

class WebLoginWindow : public QDialog
{
    Q_OBJECT
public:
    explicit WebLoginWindow(const QString &platform, MusicBridge *bridge, QWidget *parent = nullptr);
    ~WebLoginWindow() override;

protected:
    void showEvent(QShowEvent *event) override;
    void resizeEvent(QResizeEvent *event) override;
    void closeEvent(QCloseEvent *event) override;

private:
    void initWebView();
    void resizeWebView();
    void checkCookies();

    QString m_platform;
    MusicBridge *m_bridge = nullptr;
    QString m_loginUrl;
    bool m_initialized = false;
    bool m_loginCompleted = false;

    QTimer m_cookieTimer;
    Microsoft::WRL::ComPtr<ICoreWebView2Environment> m_environment;
    Microsoft::WRL::ComPtr<ICoreWebView2Controller> m_controller;
    Microsoft::WRL::ComPtr<ICoreWebView2> m_webView;
};
