#pragma once

#include <QJsonArray>
#include <QString>

// 纯函数歌词解析器。将 QRC / YRC / LRC 的解析逻辑从 MusicBridge
// 中拆出，方便单元测试，并让平台歌词解析保持统一。
namespace LyricParser {
QJsonArray parseLrc(const QString &text);
QJsonArray parseYrc(const QString &text);
QJsonArray parseQrc(const QString &document);
QJsonArray preferCompleteLyrics(const QJsonArray &wordTimed, const QJsonArray &plainTimed);
QString filterQqLyricLines(const QString &text);
} // namespace LyricParser
