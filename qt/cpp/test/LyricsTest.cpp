// LyricsTest — 歌词解析纯函数单元测试。
// 覆盖 MusicBridge::parseLrc / parseYrc / parseKrc / filterQqLyricLines，
// 数据模型与 Electron 原版 src/utils/{lrc,yrc,krc}.ts + qqMusicApi 对齐。
#include "MusicBridge.h"
#include "LyricParser.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <cstdio>
#include <cmath>

namespace {
int failures = 0;

#define CHECK(cond)                                                          \
    do {                                                                     \
        if (!(cond)) {                                                       \
            std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);      \
            ++failures;                                                      \
        }                                                                    \
    } while (0)

bool near(double a, double b, double eps = 1e-6)
{
    return std::abs(a - b) < eps;
}

void testParseLrc()
{
    const QJsonArray lines = MusicBridge::parseLrc(
        QStringLiteral("[00:12.34]第一句歌词\n[01:05.00]第二句\n[ti:元信息应忽略]\n"));
    CHECK(lines.size() == 2);
    if (lines.size() == 2) {
        const QJsonObject a = lines.at(0).toObject();
        const QJsonObject b = lines.at(1).toObject();
        CHECK(near(a.value("time").toDouble(), 12.34));
        CHECK(a.value("text").toString() == QStringLiteral("第一句歌词"));
        CHECK(near(b.value("time").toDouble(), 65.0));
        CHECK(b.value("text").toString() == QStringLiteral("第二句"));
    }
}

void testParseYrc()
{
    const QJsonArray lines = MusicBridge::parseYrc(
        QStringLiteral("[23990,4920](23990,350,0)你(24340,480,0)的\n{\"t\":0,\"c\":[]}\n"));
    CHECK(lines.size() == 1);
    if (lines.size() == 1) {
        const QJsonObject line = lines.at(0).toObject();
        CHECK(near(line.value("time").toDouble(), 23.99));
        CHECK(line.value("text").toString() == QStringLiteral("你的"));
        const QJsonArray words = line.value("words").toArray();
        CHECK(words.size() == 2);
        if (words.size() == 2) {
            const QJsonObject w0 = words.at(0).toObject();
            CHECK(w0.value("text").toString() == QStringLiteral("你"));
            CHECK(near(w0.value("time").toDouble(), 23.99));
            CHECK(near(w0.value("duration").toDouble(), 0.35));
            const QJsonObject w1 = words.at(1).toObject();
            CHECK(w1.value("text").toString() == QStringLiteral("的"));
            CHECK(near(w1.value("time").toDouble(), 24.34));
        }
    }
}

void testParseKrc()
{
    const QJsonArray lines = MusicBridge::parseKrc(
        QStringLiteral("[1200,3000]<0,400,0>你好<400,2600,0>世界\n"));
    CHECK(lines.size() == 1);
    if (lines.size() == 1) {
        const QJsonObject line = lines.at(0).toObject();
        CHECK(near(line.value("time").toDouble(), 1.2));
        CHECK(line.value("text").toString() == QStringLiteral("你好世界"));
        const QJsonArray words = line.value("words").toArray();
        CHECK(words.size() == 2);
        if (words.size() == 2) {
            const QJsonObject w0 = words.at(0).toObject();
            CHECK(w0.value("text").toString() == QStringLiteral("你好"));
            CHECK(near(w0.value("time").toDouble(), 1.2));
            CHECK(near(w0.value("duration").toDouble(), 0.4));
            const QJsonObject w1 = words.at(1).toObject();
            CHECK(w1.value("text").toString() == QStringLiteral("世界"));
            CHECK(near(w1.value("time").toDouble(), 1.6));
            CHECK(near(w1.value("duration").toDouble(), 2.6));
        }
    }
}

void testParseQrc()
{
    const QJsonArray lines = MusicBridge::parseQrc(QStringLiteral(
        "<Lyric_1 LyricContent=\"[190871,1984]For (190871,361)the (191232,172)first (191404,376)\"/>"));
    CHECK(lines.size() == 1);
    if (lines.size() == 1) {
        const QJsonObject line = lines.first().toObject();
        CHECK(near(line.value("time").toDouble(), 190.871));
        CHECK(line.value("text").toString() == QStringLiteral("For the first "));
        CHECK(line.value("words").toArray().size() == 3);
    }
}

void testVersionComparison()
{
    CHECK(MusicBridge::compareVersions(QStringLiteral("1.0.8"), QStringLiteral("1.0.8")) == 0);
    CHECK(MusicBridge::compareVersions(QStringLiteral("v1.0.9"), QStringLiteral("1.0.8")) > 0);
    CHECK(MusicBridge::compareVersions(QStringLiteral("1.10.0"), QStringLiteral("1.9.9")) > 0);
    CHECK(MusicBridge::compareVersions(QStringLiteral("1.0.7"), QStringLiteral("1.0.8")) < 0);
}

void testJsonListModel()
{
    JsonListModel model;
    model.setItems(QJsonArray{QJsonObject{{"id", "qq-1"}, {"name", "测试"},
        {"source", "qq"}, {"vip", true}}});
    CHECK(model.count() == 1);
    CHECK(model.get(0).value(QStringLiteral("name")).toString() == QStringLiteral("测试"));
    CHECK(model.get(0).value(QStringLiteral("vip")).toBool());
    CHECK(model.get(1).isEmpty());
}

void testFilterQqLyricLines()
{
    const QString filtered = MusicBridge::filterQqLyricLines(QStringLiteral(
        "[ti:测试]\n"
        "[00:00.00]歌曲名 - 歌手名\n"
        "[00:01.00]作词：张三\n"
        "[00:02.00]编曲：李四\n"
        "[00:15.00]真正的歌词第一句\n"
        "[00:30.00]真正的歌词第二句\n"));
    CHECK(filtered.contains(QStringLiteral("[00:15.00]真正的歌词第一句")));
    CHECK(filtered.contains(QStringLiteral("[00:30.00]真正的歌词第二句")));
    CHECK(!filtered.contains(QStringLiteral("歌曲名 - 歌手名")));
    CHECK(!filtered.contains(QStringLiteral("作词")));
    CHECK(!filtered.contains(QStringLiteral("编曲")));
}
void testLyricParserNamespace()
{
    const QJsonArray lrc = LyricParser::parseLrc(QStringLiteral("[00:08.00]测试歌词\n"));
    CHECK(lrc.size() == 1);
    if (lrc.size() == 1) {
        CHECK(near(lrc.at(0).toObject().value("time").toDouble(), 8.0));
    }

    const QJsonArray krc = LyricParser::parseKrc(
        QStringLiteral("[offset:500]\n[1000,2000]<0,500,0>你好\n"));
    CHECK(krc.size() == 1);
    if (krc.size() == 1) {
        CHECK(near(krc.at(0).toObject().value("time").toDouble(), 1.5));
    }

    const QJsonArray qrc = LyricParser::parseQrc(
        QStringLiteral("<Lyric_1 LyricContent=\"[1000,2000](1000,500)你好\"/>"));
    CHECK(qrc.size() == 1);
}

} // namespace

int main()
{
    testParseLrc();
    testParseYrc();
    testParseQrc();
    testParseKrc();
    testFilterQqLyricLines();
    testVersionComparison();
    testJsonListModel();
    testLyricParserNamespace();
    if (failures == 0) {
        std::printf("LyricsTest: 全部通过\n");
        return 0;
    }
    std::printf("LyricsTest: %d 项失败\n", failures);
    return 1;
}
