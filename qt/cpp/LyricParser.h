#pragma once

#include <QJsonArray>
#include <QString>

// 纯函数歌词解析器。将 KRC / QRC / YRC / LRC 的解析逻辑从 MusicBridge
// 中拆出，方便单元测试，并避免 C++ 与 TypeScript 两套解析器继续漂移。
namespace LyricParser {
QJsonArray parseLrc(const QString &text);
QJsonArray parseYrc(const QString &text);
QJsonArray parseQrc(const QString &document);
QJsonArray parseKrc(const QString &text);
QString filterQqLyricLines(const QString &text);
} // namespace LyricParser
