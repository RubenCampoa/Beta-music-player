#pragma once

#include <QObject>
#include <QMap>
#include <QPointer>
#include <QWebEnginePage>

class QWebEngineView;

class LoginWebPage final : public QWebEnginePage
{
    Q_OBJECT

public:
    explicit LoginWebPage(QWebEngineProfile *profile, QObject *parent = nullptr);

protected:
    QWebEnginePage *createWindow(QWebEnginePage::WebWindowType type) override;
};

class WebLoginWindow final : public QObject
{
    Q_OBJECT

public:
    explicit WebLoginWindow(QObject *parent = nullptr);
    void begin(const QString &platform);

signals:
    void loginCompleted(const QString &platform, const QString &cookie);
    void loginCancelled(const QString &platform);

private:
    void inspectCookies();
    QString serializedCookies() const;

    QPointer<QWebEngineView> m_view;
    QString m_platform;
    QMap<QByteArray, QByteArray> m_cookies;
    bool m_completed = false;
};
