#include "WindowsFrame.h"

#include <QWindow>
#include <QVariant>
#include <QtMath>

#ifdef Q_OS_WIN
#  include <windows.h>
#  include <windowsx.h>
#  include <dwmapi.h>

namespace {
constexpr int kResizeBorder = 8;

int hitTest(int x, int y, int width, int height, bool maximized, qreal dpr)
{
    const int border = qMax(6, qRound(kResizeBorder * qMax<qreal>(1.0, dpr)));
    if (!maximized) {
        const bool left = x < border, right = x >= width - border;
        const bool top = y < border, bottom = y >= height - border;
        if (top && left) return HTTOPLEFT;
        if (top && right) return HTTOPRIGHT;
        if (bottom && left) return HTBOTTOMLEFT;
        if (bottom && right) return HTBOTTOMRIGHT;
        if (left) return HTLEFT;
        if (right) return HTRIGHT;
        if (top) return HTTOP;
        if (bottom) return HTBOTTOM;
    }
    return HTCLIENT;
}
}
#endif

WindowsFrame::~WindowsFrame()
{
#ifdef Q_OS_WIN
    if (m_hwnd) {
        UnregisterHotKey(reinterpret_cast<HWND>(m_hwnd), 0xB001);
        UnregisterHotKey(reinterpret_cast<HWND>(m_hwnd), 0xB002);
        UnregisterHotKey(reinterpret_cast<HWND>(m_hwnd), 0xB003);
    }
#endif
}

void WindowsFrame::setMediaActionHandler(std::function<void(int)> handler)
{
    m_mediaActionHandler = std::move(handler);
}

void WindowsFrame::attach(QWindow *window)
{
    m_window = window;
#ifdef Q_OS_WIN
    if (!window) return;
    m_hwnd = quintptr(window->winId());
    const HWND hwnd = reinterpret_cast<HWND>(m_hwnd);
    applyFrameStyle();
    const DWORD corner = 2; // DWMWCP_ROUND
    DwmSetWindowAttribute(hwnd, 33, &corner, sizeof(corner));
    const COLORREF noBorder = 0xFFFFFFFE;
    DwmSetWindowAttribute(hwnd, 34, &noBorder, sizeof(noBorder));
    RegisterHotKey(hwnd, 0xB001, 0, VK_MEDIA_PLAY_PAUSE);
    RegisterHotKey(hwnd, 0xB002, 0, VK_MEDIA_PREV_TRACK);
    RegisterHotKey(hwnd, 0xB003, 0, VK_MEDIA_NEXT_TRACK);
#else
    Q_UNUSED(window);
#endif
}

void WindowsFrame::applyFrameStyle()
{
#ifdef Q_OS_WIN
    if (!m_window || !m_hwnd) return;
    const HWND hwnd = reinterpret_cast<HWND>(m_hwnd);
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style |= WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU;
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);
    SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
#else
    Q_UNUSED(nullptr);
#endif
}

bool WindowsFrame::nativeEventFilter(const QByteArray &eventType, void *message, qintptr *result)
{
#ifdef Q_OS_WIN
    if (!m_window || eventType != "windows_generic_MSG") return false;
    MSG *msg = static_cast<MSG *>(message);
    if (msg->message == WM_HOTKEY && m_mediaActionHandler) {
        if (msg->wParam == 0xB001) m_mediaActionHandler(0);
        else if (msg->wParam == 0xB002) m_mediaActionHandler(1);
        else if (msg->wParam == 0xB003) m_mediaActionHandler(2);
        return true;
    }
    if (quintptr(msg->hwnd) != m_hwnd) return false;
    if (msg->message == WM_NCCALCSIZE && msg->wParam) {
        *result = 0;
        return true;
    }
    if (msg->message != WM_NCHITTEST) return false;
    RECT rect{};
    GetWindowRect(msg->hwnd, &rect);
    const int screenX = GET_X_LPARAM(msg->lParam);
    const int screenY = GET_Y_LPARAM(msg->lParam);
    const int code = hitTest(screenX - rect.left, screenY - rect.top,
        rect.right - rect.left, rect.bottom - rect.top,
        m_window->visibility() == QWindow::Maximized,
        m_window->devicePixelRatio());
    if (code == HTCLIENT) return false;
    *result = code;
    return true;
#else
    Q_UNUSED(eventType); Q_UNUSED(message); Q_UNUSED(result);
    return false;
#endif
}
