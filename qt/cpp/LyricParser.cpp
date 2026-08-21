#include "LyricParser.h"

#include <QJsonObject>
#include <QList>
#include <QRegularExpression>
#include <QStringList>

#include <algorithm>
#include <cmath>
#include <utility>

namespace {

bool isPersonnelOrMetaLine(const QString &text)
{
    const QString trimmed = text.trimmed();
    if (trimmed.isEmpty()) return true;

    static const QRegularExpression metaTags(
        QStringLiteral("^\\[(ti|ar|al|by|offset|length|re|ve):"),
        QRegularExpression::CaseInsensitiveOption
    );
    if (metaTags.match(trimmed).hasMatch()) return true;

    static const QRegularExpression personnel(
        QStringLiteral("^(制作公司|唱片公司|发行公司|出品公司|企划公司|经纪公司|录音公司|版权公司|版权|提供|提供方|发行方|出品方|词|作词|曲|作曲|编曲|词曲|作词作曲|作曲作词|制作人|制作|和声|合音|录音|混音|母带|监制|出品|发行|企划|统筹|文案|封面|OP|SP|吉他|钢琴|贝斯|鼓|弦乐|弦乐团|伴奏|伴唱|配唱|合唱|录音室|录音棚|混音室|混音棚|母带室|母带棚|录音师|混音师|母带师|出品人|发行人|总策划|总监制|总监|音乐总监|项目统筹|宣发|推广|原唱|翻唱|演唱|歌手|表演者|Programming|Vocal|Guitar|Bass|Drums|Strings|Chorus|Mix|Mixed|Mastering|Mastered|Studio|Arrangement|Publisher|Publishing|Label|Record|Company)[：:\\s]"),
        QRegularExpression::CaseInsensitiveOption
    );
    if (personnel.match(trimmed).hasMatch()) return true;

    // 过滤单独的说话人/演唱者标签行，如 "晓华:", "男:", "女:", "合:", "(女)", "(男)"
    static const QRegularExpression speakerColon(QStringLiteral("^[\\p{Han}\\w\\s/&]{1,12}[：:]\\s*$"));
    if (speakerColon.match(trimmed).hasMatch()) return true;

    static const QRegularExpression parenSpeaker(QStringLiteral("^[(（][男女合全客伴主和][)）]$"));
    if (parenSpeaker.match(trimmed).hasMatch()) return true;

    return false;
}

} // namespace

namespace LyricParser {

QJsonArray parseLrc(const QString &text)
{
    QJsonArray parsed;
    const QRegularExpression pattern(QStringLiteral("\\[(\\d+):(\\d{2})(?:[.:](\\d{1,3}))?\\]\\s*(.*)"));
    for (const QString &line : text.split('\n')) {
        const auto match = pattern.match(line);
        if (!match.hasMatch() || match.captured(4).trimmed().isEmpty()) continue;
        const QString lyricText = match.captured(4).trimmed();
        if (isPersonnelOrMetaLine(lyricText)) continue;
        const double fraction = match.captured(3).isEmpty() ? 0.0
            : match.captured(3).toDouble() / (match.captured(3).size() >= 3 ? 1000.0 : 100.0);
        parsed.append(QJsonObject{
            {"time", match.captured(1).toDouble() * 60 + match.captured(2).toDouble() + fraction},
            {"text", lyricText}, {"translation", ""}, {"words", QJsonArray()}
        });
    }
    return parsed;
}

QJsonArray parseYrc(const QString &text)
{
    QJsonArray lines;
    const QRegularExpression linePattern(QStringLiteral("^\\[(\\d+),(\\d+)\\](.*)$"));
    const QRegularExpression wordPattern(
        QStringLiteral("\\((\\d+),(\\d+),(\\d+)\\)(.*?)(?=\\(\\d+,\\d+,\\d+\\)|$)"));
    for (const QString &raw : text.split('\n')) {
        const QString value = raw.trimmed();
        if (value.isEmpty()) continue;
        // Skip JSONL meta lines (e.g. {"t":0,"c":[{"tx":"作词: ..."}]})
        if (value.startsWith('{')) continue;

        const auto lineMatch = linePattern.match(value);
        if (!lineMatch.hasMatch()) continue;
        QJsonArray words;
        QString rendered;
        auto iterator = wordPattern.globalMatch(lineMatch.captured(3));
        while (iterator.hasNext()) {
            const auto wordMatch = iterator.next();
            const QString wordText = wordMatch.captured(4);
            if (wordText.isEmpty()) continue;
            rendered += wordText;
            words.append(QJsonObject{
                {"time", wordMatch.captured(1).toDouble() / 1000.0},
                {"duration", std::max(0.05, wordMatch.captured(2).toDouble() / 1000.0)},
                {"text", wordText}
            });
        }
        if (!words.isEmpty() && !isPersonnelOrMetaLine(rendered)) {
            lines.append(QJsonObject{
                {"time", lineMatch.captured(1).toDouble() / 1000.0},
                {"text", rendered.trimmed()}, {"translation", ""}, {"words", words}
            });
        }
    }
    return lines;
}

QJsonArray preferCompleteLyrics(const QJsonArray &wordTimed, const QJsonArray &plainTimed)
{
    if (wordTimed.isEmpty()) return plainTimed;
    if (plainTimed.isEmpty()) return wordTimed;

    // Some providers occasionally return a truncated word-timed payload while
    // the ordinary LRC in the same response is complete. A non-empty YRC/QRC
    // must not win merely because one line happened to parse successfully.
    if (plainTimed.size() >= 4 && wordTimed.size() * 2 < plainTimed.size())
        return plainTimed;
    return wordTimed;
}

QJsonArray parseQrc(const QString &document)
{
    QString content = document;
    if (content.trimmed().startsWith(QLatin1Char('<'))) {
        const QRegularExpression attribute(
            QStringLiteral("LyricContent=(['\"])([\\s\\S]*?)\\1"),
            QRegularExpression::CaseInsensitiveOption);
        const auto match = attribute.match(content);
        content = match.hasMatch() ? match.captured(2) : QString();
        content.replace(QStringLiteral("&quot;"), QStringLiteral("\""));
        content.replace(QStringLiteral("&apos;"), QStringLiteral("'"));
        content.replace(QStringLiteral("&lt;"), QStringLiteral("<"));
        content.replace(QStringLiteral("&gt;"), QStringLiteral(">"));
        content.replace(QStringLiteral("&amp;"), QStringLiteral("&"));
    }
    QList<QJsonObject> collected;
    const QRegularExpression linePattern(QStringLiteral("^\\[(-?\\d+),(\\d+)\\](.*)$"));
    const QRegularExpression timingPattern(QStringLiteral("\\((-?\\d+),(\\d+)(?:,\\d+)?\\)"));
    for (const QString &raw : content.split(QLatin1Char('\n'))) {
        const auto lineMatch = linePattern.match(raw.trimmed());
        if (!lineMatch.hasMatch()) continue;
        const QString timedText = lineMatch.captured(3);
        QJsonArray words;
        QList<QRegularExpressionMatch> timings;
        auto iterator = timingPattern.globalMatch(timedText);
        while (iterator.hasNext()) timings.append(iterator.next());
        const bool timingBeforeWord = !timings.isEmpty() && timings.first().capturedStart() == 0;
        int previousEnd = 0;
        for (int index = 0; index < timings.size(); ++index) {
            const auto &timing = timings.at(index);
            const int wordStart = timingBeforeWord ? timing.capturedEnd() : previousEnd;
            const int wordEnd = timingBeforeWord
                ? (index + 1 < timings.size() ? timings.at(index + 1).capturedStart() : timedText.size())
                : timing.capturedStart();
            const QString word = timedText.mid(wordStart, wordEnd - wordStart);
            if (!word.isEmpty()) {
                words.append(QJsonObject{{"text", word},
                    {"time", timing.captured(1).toDouble() / 1000.0},
                    {"duration", std::max(0.05, timing.captured(2).toDouble() / 1000.0)}});
            }
            previousEnd = timing.capturedEnd();
        }
        const QString trailing = timingBeforeWord ? QString() : timedText.mid(previousEnd);
        if (!trailing.isEmpty() && !words.isEmpty()) {
            QJsonObject last = words.last().toObject();
            last.insert(QStringLiteral("text"), last.value(QStringLiteral("text")).toString() + trailing);
            words.replace(words.size() - 1, last);
        }
        if (words.isEmpty()) continue;
        QString rendered;
        for (const QJsonValue &word : std::as_const(words))
            rendered += word.toObject().value(QStringLiteral("text")).toString();
        if (isPersonnelOrMetaLine(rendered)) continue;
        collected.append(QJsonObject{{"time", lineMatch.captured(1).toDouble() / 1000.0},
            {"text", rendered}, {"translation", QString()}, {"words", words}});
    }
    std::sort(collected.begin(), collected.end(), [](const QJsonObject &left, const QJsonObject &right) {
        return left.value(QStringLiteral("time")).toDouble() < right.value(QStringLiteral("time")).toDouble();
    });
    QJsonArray lines;
    for (const QJsonObject &line : std::as_const(collected)) lines.append(line);
    return lines;
}

QString filterQqLyricLines(const QString &text)
{
    // 与原版 qqMusicApi.filterQqMetaLines 对齐：去掉 QQ 歌词里无时间戳的
    // 元信息行，以及词/曲/编曲等制作人员行和首行的 "歌名 - 歌手" 标题行。
    if (text.isEmpty()) return text;
    const QRegularExpression timeTag(QStringLiteral("\\[(\\d+):(\\d{2})(?:[.:]\\d{1,3})?\\]"));
    const QRegularExpression personnel(QStringLiteral("^(词|作词|曲|作曲|编曲|制作人|制作|和声|录音|混音|母带|监制|出品|发行|企划|统筹|文案|封面|OP|SP)[：:]\\s*"));
    const QRegularExpression titleLine(QStringLiteral("^.+[-—–－]\\s*\\S.*$"));
    QStringList kept;
    int firstTimedIdx = -1;
    const QStringList rawLines = text.split(QLatin1Char('\n'));
    for (int idx = 0; idx < rawLines.size(); ++idx) {
        const QString line = rawLines.at(idx);
        if (!timeTag.match(line).hasMatch()) continue;
        if (firstTimedIdx < 0) firstTimedIdx = idx;
        const auto m = timeTag.match(line);
        const int time = m.captured(1).toInt() * 60 + m.captured(2).toInt();
        QString stripped = line;
        stripped.remove(timeTag);
        stripped = stripped.trimmed();
        if (personnel.match(stripped).hasMatch()) continue;
        if (idx == firstTimedIdx && time == 0 && titleLine.match(stripped).hasMatch()) continue;
        kept << line;
    }
    return kept.join(QLatin1Char('\n'));
}

} // namespace LyricParser
