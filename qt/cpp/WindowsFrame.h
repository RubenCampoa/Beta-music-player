#pragma once

#include <QAbstractNativeEventFilter>
#include <QPointer>
#include <functional>

class QWindow;

class WindowsFrame final : public QAbstractNativeEventFilter
{
public:
    ~WindowsFrame() override;
    void attach(QWindow *window);
    // 重新把 WS_THICKFRAME 等样式写回原生窗口。Qt 在 show()/状态切换时可能
    // 重新套用 FramelessWindowHint 把边框剥掉，导致无法缩放；故在显示后再次调用。
    void applyFrameStyle();
    void setMediaActionHandler(std::function<void(int)> handler);
    bool nativeEventFilter(const QByteArray &eventType, void *message, qintptr *result) override;

private:
    QPointer<QWindow> m_window;
    quintptr m_hwnd = 0;
    std::function<void(int)> m_mediaActionHandler;
};
