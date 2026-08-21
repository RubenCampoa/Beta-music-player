#include "MusicBridge.h"
#include "LyricParser.h"

#ifdef Q_OS_WIN
#  include <windows.h>
#  include <dpapi.h>
#endif

#include <QDesktopServices>
#include <QDateTime>
#include <QDir>
#include <QDirIterator>
#include <QFileDialog>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QHostAddress>
#include <QHash>
#include <QImage>
#include <QColor>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QMediaMetaData>
#include <QMediaDevices>
#include <QAudioDevice>
#include <QStandardPaths>
#include <QTcpSocket>
#include <QTcpServer>
#include <QThread>
#include <QThreadPool>
#include <QElapsedTimer>
#include <QUuid>
#include <QUrlQuery>
#include <QWindow>
#include <QRegularExpression>
#include <QSaveFile>
#include <QRandomGenerator>
#include <QJsonParseError>
#include <algorithm>
#include <cmath>
#include <utility>

void SidecarNetworkAccessManager::setSidecarIdentity(quint16 neteasePort, quint16 qqPort,
                                                     const QByteArray &token)
{
    m_neteasePort = neteasePort;
    m_qqPort = qqPort;
    m_token = token;
}

void SidecarNetworkAccessManager::setSidecarCookies(const QByteArray &neteaseCookie,
                                                    const QByteArray &qqCookie)
{
    m_neteaseCookie = neteaseCookie;
    m_qqCookie = qqCookie;
}

QNetworkReply *SidecarNetworkAccessManager::createRequest(
    Operation operation, const QNetworkRequest &sourceRequest, QIODevice *outgoingData)
{
    QNetworkRequest request(sourceRequest);
    const QUrl url = request.url();
    const bool isLoopback = url.host() == QStringLiteral("127.0.0.1")
        || url.host().compare(QStringLiteral("localhost"), Qt::CaseInsensitive) == 0;
    if (isLoopback && !m_token.isEmpty()
        && (url.port() == m_neteasePort || url.port() == m_qqPort)) {
        request.setRawHeader("X-Beta-Sidecar-Token", m_token);
        const QByteArray cookie = url.port() == m_neteasePort ? m_neteaseCookie : m_qqCookie;
        if (!cookie.isEmpty()) request.setRawHeader("Cookie", cookie);
        // The provider can forward upstream Set-Cookie headers. If Qt stores
        // those against 127.0.0.1, a later anonymous cookie may replace the
        // explicitly selected account and turn VIP URLs into 30-second trials.
        // Sidecar authentication is managed by MusicBridge, so keep Qt's
        // automatic cookie jar out of both request and response handling.
        request.setAttribute(QNetworkRequest::CookieLoadControlAttribute,
                             QNetworkRequest::Manual);
        request.setAttribute(QNetworkRequest::CookieSaveControlAttribute,
                             QNetworkRequest::Manual);
    }
    return QNetworkAccessManager::createRequest(operation, request, outgoingData);
}

namespace {
#ifndef BETA_APP_VERSION
#define BETA_APP_VERSION "1.0.9"
#endif
constexpr auto kNeteaseBase = "https://music.163.com";
constexpr qint64 kMaximumImageBytes = 16LL * 1024 * 1024;

void limitImageDownload(QNetworkReply *reply)
{
    QObject::connect(reply, &QNetworkReply::downloadProgress, reply,
                     [reply](qint64 received, qint64 total) {
        if (received > kMaximumImageBytes || total > kMaximumImageBytes)
            reply->abort();
    });
}

void pruneCacheDirectory(const QString &path, qint64 maximumBytes, int maximumAgeDays)
{
    QDir root(path);
    if (!root.exists()) return;

    const QDateTime cutoff = QDateTime::currentDateTimeUtc().addDays(-maximumAgeDays);
    QList<QFileInfo> retained;
    qint64 totalBytes = 0;
    QDirIterator iterator(path, QDir::Files | QDir::NoDotAndDotDot | QDir::NoSymLinks,
                          QDirIterator::Subdirectories);
    while (iterator.hasNext()) {
        const QFileInfo info(iterator.next());
        if (info.lastModified().toUTC() < cutoff) {
            QFile::remove(info.absoluteFilePath());
            continue;
        }
        retained.push_back(info);
        totalBytes += info.size();
    }
    if (totalBytes <= maximumBytes) return;

    std::sort(retained.begin(), retained.end(), [](const QFileInfo &left, const QFileInfo &right) {
        return left.lastModified() < right.lastModified();
    });
    for (const QFileInfo &info : std::as_const(retained)) {
        if (totalBytes <= maximumBytes) break;
        if (QFile::remove(info.absoluteFilePath())) totalBytes -= info.size();
    }
}

bool probeSidecar(quint16 port, const QByteArray &service, const QByteArray &token,
                  int timeoutMilliseconds)
{
    if (!port || token.isEmpty()) return false;
    QTcpSocket probe;
    probe.connectToHost(QHostAddress::LocalHost, port);
    if (!probe.waitForConnected(timeoutMilliseconds)) return false;

    QByteArray request = "GET /__beta_health HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                         "Connection: close\r\nX-Beta-Sidecar-Token: ";
    request += token;
    request += "\r\n\r\n";
    if (probe.write(request) != request.size()
        || !probe.waitForBytesWritten(timeoutMilliseconds))
        return false;

    QByteArray response;
    QElapsedTimer timer;
    timer.start();
    while (timer.elapsed() < timeoutMilliseconds) {
        const int remaining = timeoutMilliseconds - int(timer.elapsed());
        if (!probe.waitForReadyRead(std::max(1, remaining))) break;
        response += probe.readAll();
        if (response.contains("\r\n\r\n") && response.contains("\"ok\":true")) break;
    }
    response += probe.readAll();
    const QByteArray expectedHeader = QByteArray("X-Beta-Sidecar: ") + service;
    const QByteArray expectedBody = QByteArray("\"service\":\"") + service + '"';
    return response.startsWith("HTTP/1.1 200")
        && response.contains(expectedHeader)
        && response.contains(expectedBody);
}

void appendTrace(const QByteArray &message)
{
    const QString path = qEnvironmentVariable("BETA_STARTUP_TRACE");
    if (path.isEmpty()) return;
    QFile file(path);
    if (file.open(QIODevice::WriteOnly | QIODevice::Append)) {
        file.write(message + '\n');
        file.flush();
    }
}

QJsonObject songObject(qint64 id, const QString &name, const QString &artist,
                       const QString &album, const QString &cover, int duration)
{
    return {
        {"id", QStringLiteral("netease-") + QString::number(id)},
        {"platformId", QString::number(id)},
        {"name", name}, {"artist", artist}, {"album", album},
        {"cover", cover}, {"duration", duration}, {"source", "netease"},
        {"vip", false}, {"isLiked", false}
    };
}

int jsonInteger(const QJsonValue &value, int fallback = 0)
{
    if (value.isDouble()) return value.toInt(fallback);
    if (value.isBool()) return value.toBool() ? 1 : 0;
    if (value.isString()) {
        bool ok = false;
        const int parsed = value.toString().trimmed().toInt(&ok);
        return ok ? parsed : fallback;
    }
    return fallback;
}

bool jsonPositive(const QJsonValue &value)
{
    if (value.isBool()) return value.toBool();
    if (value.isString()) {
        const QString text = value.toString().trimmed();
        if (text.compare(QStringLiteral("true"), Qt::CaseInsensitive) == 0
            || text.compare(QStringLiteral("vip"), Qt::CaseInsensitive) == 0
            || text.compare(QStringLiteral("paid"), Qt::CaseInsensitive) == 0
            || text.compare(QStringLiteral("charge"), Qt::CaseInsensitive) == 0)
            return true;
    }
    return jsonInteger(value) > 0;
}

qint64 jsonInt64(const QJsonValue &value)
{
    if (value.isDouble()) return qint64(value.toDouble());
    if (value.isString()) {
        bool ok = false;
        const qint64 result = value.toString().toLongLong(&ok);
        if (ok) return result;
    }
    return 0;
}

bool isShortTrialResponse(const QJsonObject &media, const QJsonObject &song)
{
    const QJsonValue trialInfo = media.value(QStringLiteral("freeTrialInfo"));
    if (!trialInfo.isUndefined() && !trialInfo.isNull()) {
        // Some third-party providers serialize null as the literal string
        // "null". Do not mistake that compatibility value for a real trial.
        if (!trialInfo.isString()
            || trialInfo.toString().trimmed().compare(QStringLiteral("null"),
                                                       Qt::CaseInsensitive) != 0)
            return true;
    }

    const qint64 returnedMs = jsonInt64(media.value(QStringLiteral("time")));
    const qint64 expectedMs = jsonInt64(song.value(QStringLiteral("duration"))) * 1000;
    return expectedMs >= 120000 && returnedMs >= 10000 && returnedMs <= 60000
        && returnedMs + 30000 < expectedMs;
}

QString expiryDateText(qint64 milliseconds)
{
    if (milliseconds <= 0) return {};
    return QDateTime::fromMSecsSinceEpoch(milliseconds).date().toString(QStringLiteral("yyyy-MM-dd"));
}

QDate latestQqExpiry(const QJsonObject &identity, const QJsonObject &data)
{
    QDate latest;
    const QStringList keys = {
        QStringLiteral("HugeVipEnd"), QStringLiteral("GroupVipEnd"),
        QStringLiteral("eightEnd"), QStringLiteral("twelveEnd"),
        QStringLiteral("LMEnd"), QStringLiteral("CPLoverEnd")
    };
    for (const QString &key : keys) {
        const QDate date = QDate::fromString(identity.value(key).toString(), Qt::ISODate);
        if (date.isValid() && (!latest.isValid() || date > latest)) latest = date;
    }
    for (const QString &key : {QStringLiteral("send"), QStringLiteral("starend"),
                               QStringLiteral("ystarend")}) {
        const QDate date = QDate::fromString(data.value(key).toString(), Qt::ISODate);
        if (date.isValid() && (!latest.isValid() || date > latest)) latest = date;
    }
    return latest;
}

#ifdef Q_OS_WIN
QByteArray dpapiProtect(const QByteArray &plain)
{
    if (plain.isEmpty()) return {};
    DATA_BLOB input;
    DATA_BLOB output;
    input.pbData = reinterpret_cast<BYTE *>(const_cast<char *>(plain.constData()));
    input.cbData = static_cast<DWORD>(plain.size());
    output.pbData = nullptr;
    output.cbData = 0;
    if (!CryptProtectData(&input, L"BetaMusicPlayerQt", nullptr, nullptr, nullptr,
                          CRYPTPROTECT_UI_FORBIDDEN, &output))
        return {};
    const QByteArray encrypted(reinterpret_cast<const char *>(output.pbData),
                               int(output.cbData));
    LocalFree(output.pbData);
    return encrypted.toBase64();
}

QByteArray dpapiUnprotect(const QByteArray &base64)
{
    if (base64.isEmpty()) return {};
    const QByteArray encrypted = QByteArray::fromBase64(base64);
    if (encrypted.isEmpty()) return {};
    DATA_BLOB input;
    DATA_BLOB output;
    input.pbData = reinterpret_cast<BYTE *>(const_cast<char *>(encrypted.constData()));
    input.cbData = static_cast<DWORD>(encrypted.size());
    output.pbData = nullptr;
    output.cbData = 0;
    if (!CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr,
                            CRYPTPROTECT_UI_FORBIDDEN, &output))
        return {};
    const QByteArray plain(reinterpret_cast<const char *>(output.pbData),
                           int(output.cbData));
    LocalFree(output.pbData);
    return plain;
}
#endif

QByteArray coverReferer(const QString &url)
{
    if (url.contains(QStringLiteral("gtimg.cn"))
        || url.contains(QStringLiteral("q.qlogo.cn"))
        || url.contains(QStringLiteral("y.qq.com")))
        return QByteArray("https://y.qq.com/");
    return QByteArray("https://music.163.com/");
}

QString findImageUrlInJson(const QJsonValue &value, int depth = 0)
{
    if (depth > 5 || value.isNull() || value.isUndefined()) return {};
    if (value.isString()) {
        QString candidate = value.toString().trimmed();
        if (candidate.startsWith(QStringLiteral("//")))
            candidate.prepend(QStringLiteral("https:"));
        else if (candidate.startsWith(QStringLiteral("http://")))
            candidate.replace(0, 7, QStringLiteral("https://"));
        const QString pathPart = candidate.section(QChar('?'), 0, 0);
        const bool looksLikeImage = pathPart.endsWith(QStringLiteral(".jpg"), Qt::CaseInsensitive)
            || pathPart.endsWith(QStringLiteral(".jpeg"), Qt::CaseInsensitive)
            || pathPart.endsWith(QStringLiteral(".png"), Qt::CaseInsensitive)
            || pathPart.endsWith(QStringLiteral(".webp"), Qt::CaseInsensitive)
            || pathPart.endsWith(QStringLiteral(".gif"), Qt::CaseInsensitive);
        if (candidate.startsWith(QStringLiteral("https://")) && looksLikeImage)
            return candidate;
        return {};
    }
    if (value.isArray()) {
        const QJsonArray array = value.toArray();
        for (const QJsonValue &item : array) {
            const QString found = findImageUrlInJson(item, depth + 1);
            if (!found.isEmpty()) return found;
        }
        return {};
    }
    if (value.isObject()) {
        const QJsonObject object = value.toObject();
        static const char *priorityKeys[] = {
            "album_cover", "album_img", "album_pic", "album_imgurl", "albumCover",
            "image", "img", "imgurl", "img_url", "pic", "cover", "cover_url",
            "coverUrl", "sizable_cover", "trans_param", "info", "data", "body"
        };
        for (const char *key : priorityKeys) {
            const QString found = findImageUrlInJson(object.value(QString::fromLatin1(key)), depth + 1);
            if (!found.isEmpty()) return found;
        }
        for (auto it = object.constBegin(); it != object.constEnd(); ++it) {
            bool alreadyScanned = false;
            for (const char *key : priorityKeys) {
                if (it.key() == QString::fromLatin1(key)) { alreadyScanned = true; break; }
            }
            if (alreadyScanned) continue;
            const QString found = findImageUrlInJson(it.value(), depth + 1);
            if (!found.isEmpty()) return found;
        }
    }
    return {};
}

QString cookieValue(const QString &cookie, const QString &name)
{
    for (const QString &part : cookie.split(QLatin1Char(';'))) {
        const QString trimmed = part.trimmed();
        if (trimmed.startsWith(name + QLatin1Char('='))) {
            return QUrl::fromPercentEncoding(trimmed.mid(name.size() + 1).toUtf8());
        }
    }
    return {};
}

QString findAudioUrlInJson(const QJsonValue &value, int depth = 0)
{
    if (depth > 7 || value.isNull() || value.isUndefined()) return {};
    if (value.isString()) {
        QString candidate = value.toString().trimmed();
        if (candidate.startsWith(QStringLiteral("//")))
            candidate.prepend(QStringLiteral("https:"));
        return (candidate.startsWith(QStringLiteral("http://"))
                || candidate.startsWith(QStringLiteral("https://"))) ? candidate : QString();
    }
    if (value.isArray()) {
        const QJsonArray array = value.toArray();
        for (const QJsonValue &item : array) {
            const QString found = findAudioUrlInJson(item, depth + 1);
            if (!found.isEmpty()) return found;
        }
        return {};
    }
    if (value.isObject()) {
        const QJsonObject object = value.toObject();
        static const char *priorityKeys[] = {
            "url", "play_url", "playUrl", "audio_url", "audioUrl",
            "file_url", "fileUrl", "backup_url", "backupUrl", "downurl",
            "down_url", "url_128", "url_320", "url_flac", "high_url"
        };
        for (const char *key : priorityKeys) {
            const QString found = findAudioUrlInJson(object.value(QString::fromLatin1(key)), depth + 1);
            if (!found.isEmpty()) return found;
        }
        static const char *containerKeys[] = {
            "body", "data", "urls", "info", "result", "response", "extra",
            "play_info", "playInfo"
        };
        for (const char *key : containerKeys) {
            const QString found = findAudioUrlInJson(object.value(QString::fromLatin1(key)), depth + 1);
            if (!found.isEmpty()) return found;
        }
    }
    return {};
}


QJsonArray findFirstPlaylistArrayInJson(const QJsonValue &value, int depth = 0)
{
    if (depth > 6 || value.isNull() || value.isUndefined()) return {};
    if (value.isArray()) {
        const QJsonArray array = value.toArray();
        bool looksLikePlaylistArray = false;
        for (const QJsonValue &itemValue : array) {
            const QJsonObject item = itemValue.toObject();
            if (item.isEmpty()) continue;
            if (item.contains("dissid") || item.contains("dissname")
                || item.contains("tid") || item.contains("songnum")
                || item.contains("song_cnt") || item.contains("songCount")
                || (item.contains("logo") && (item.contains("title") || item.contains("name")))) {
                looksLikePlaylistArray = true;
                break;
            }
        }
        if (looksLikePlaylistArray) return array;
        for (const QJsonValue &itemValue : array) {
            const QJsonArray found = findFirstPlaylistArrayInJson(itemValue, depth + 1);
            if (!found.isEmpty()) return found;
        }
        return {};
    }
    if (value.isObject()) {
        const QJsonObject object = value.toObject();
        for (auto it = object.constBegin(); it != object.constEnd(); ++it) {
            const QJsonArray found = findFirstPlaylistArrayInJson(it.value(), depth + 1);
            if (!found.isEmpty()) return found;
        }
    }
    return {};
}
}

QJsonObject MusicBridge::qqPlaylistFromJson(const QJsonObject &item)
{
    QString id;
    const char *idKeys[] = {"dissid", "diss_id", "tid", "cid", "id", "dirid", "dir_id", "mid"};
    for (const char *key : idKeys) {
        const QString candidate = item.value(QString::fromLatin1(key)).toVariant().toString().trimmed();
        if (!candidate.isEmpty()) { id = candidate; break; }
    }
    if (id.isEmpty()) return {};
    return QJsonObject{
        {"id", id},
        {"name", item.value("dissname").toString(item.value("diss_name").toString(item.value("title").toString(item.value("name").toString(item.value("dirname").toString("QQ音乐歌单")))))},
        {"cover", highResolutionCover(item.value("logo").toString(item.value("cover").toString(item.value("imgurl").toString(item.value("picurl").toString(item.value("coverUrl").toString(item.value("pic_url").toString()))))), "qq")},
        {"trackCount", item.value("songnum").toInt(item.value("song_cnt").toInt(item.value("songCount").toInt(item.value("total_song_num").toInt(item.value("total").toInt(item.value("count").toInt())))))},
        {"source", "qq"}
    };
}

MusicBridge::MusicBridge(QObject *parent)
    : QObject(parent), m_songsModel(this), m_queueModel(this),
      m_lyricsModel(this), m_playlistsModel(this), m_homePlaylistsModel(this),
      m_localSongsModel(this)
{
    appendTrace("bridge:begin");
    m_storageSaveTimer.setSingleShot(true);
    m_storageSaveTimer.setInterval(300);
    connect(&m_storageSaveTimer, &QTimer::timeout, this, &MusicBridge::flushLegacyStorage);
    m_player.setAudioOutput(&m_audio);
    m_audio.setVolume(0.80);
    prepareAudioOutput();
    m_settings = {{"audioQuality", "high"}, {"lyricAnimation", true},
                  {"lyricGlow", true}, {"lyricBlur", true},
                  {"lyricZoom", true}, {"lyricFade", true},
                  {"lyricStagger", true}, {"karaokeAnimation", "slide"},
                  {"fluidBackground", true}, {"artworkAnimation", true},
                  {"enableKaraoke", true}, {"lyricFontSize", "normal"},
                  {"lyricSwitchOffsetMs", 0}, {"smoothAnimations", true},
                  {"autoDesktopLyric", false}, {"autoCheckUpdate", true},
                  {"desktopLyricColor", 0}, {"desktopLyricFontSize", "normal"},
                  {"desktopLyricLocked", false}};
    m_fluidColors = {QStringLiteral("#4473b8"), QStringLiteral("#c0608f"),
                     QStringLiteral("#d98c46"), QStringLiteral("#44a392")};
    loadLegacyStorage();
    refreshSidecarCookies();
    appendTrace("bridge:storage-loaded");
    QTimer::singleShot(2500, [] {
        const QString cacheRoot = QDir(QStandardPaths::writableLocation(QStandardPaths::CacheLocation))
                                      .filePath(QStringLiteral("BetaMusicPlayerQt"));
        QThreadPool::globalInstance()->start([cacheRoot] {
            pruneCacheDirectory(QDir(cacheRoot).filePath(QStringLiteral("covers")),
                                256LL * 1024 * 1024, 60);
            pruneCacheDirectory(QDir(cacheRoot).filePath(QStringLiteral("avatars")),
                                32LL * 1024 * 1024, 60);
            pruneCacheDirectory(QDir(cacheRoot).filePath(QStringLiteral("playlists")),
                                64LL * 1024 * 1024, 30);
        });
    });
    restoreLocalLibrary();
    appendTrace("bridge:library-restored");
    ensureLocalApi();
    appendTrace(QByteArray("bridge:sidecar=") + (m_sidecarReady ? "ready" : "failed"));

    connect(this, &MusicBridge::songsChanged, this, [this] { m_songsModel.setItems(m_songs); });
    connect(this, &MusicBridge::queueChanged, this, [this] { m_queueModel.setItems(m_queue); });
    connect(this, &MusicBridge::lyricsChanged, this, [this] { m_lyricsModel.setItems(m_lyrics); });
    connect(this, &MusicBridge::userPlaylistsChanged, this, [this] { m_playlistsModel.setItems(m_userPlaylists); });
    connect(this, &MusicBridge::localSongsChanged, this, [this] { m_localSongsModel.setItems(m_localSongs); });
    m_songsModel.setItems(m_songs);
    m_queueModel.setItems(m_queue);
    m_lyricsModel.setItems(m_lyrics);
    m_playlistsModel.setItems(m_userPlaylists);
    m_homePlaylistsModel.setItems(m_homePlaylists);
    m_localSongsModel.setItems(m_localSongs);

    m_loginTimer.setInterval(1800);
    connect(&m_loginTimer, &QTimer::timeout, this, &MusicBridge::pollLoginQr);

    connect(&m_player, &QMediaPlayer::positionChanged, this, &MusicBridge::refreshPosition);
    connect(&m_player, &QMediaPlayer::durationChanged, this, [this](qint64 value) {
        emit durationChanged(int(value));
        const QString source = m_current.value(QStringLiteral("source")).toString();
        const QJsonObject account = m_accounts.value(source).toObject();
        const qint64 expectedMs = jsonInt64(m_current.value(QStringLiteral("duration"))) * 1000;
        const bool looksLikeTrial = account.value(QStringLiteral("vipActive")).toBool()
            && expectedMs >= 120000 && value >= 10000 && value <= 60000
            && value + 30000 < expectedMs;
        if (!looksLikeTrial || m_playRecoveryAttempted || source == QStringLiteral("local"))
            return;

        // A provider can return an apparently valid CDN URL whose media is only
        // the 30-second preview. Invalidate the prefetched URL and resolve once
        // more with the current VIP cookie instead of silently playing the clip.
        m_playRecoveryAttempted = true;
        const QString expectedKey = playCacheKey(m_current);
        invalidatePlayUrlCache();
        m_player.stop();
        show_toast(QStringLiteral("检测到试听音源，正在使用会员凭据刷新完整歌曲"));
        QTimer::singleShot(0, this, [this, expectedKey] {
            if (playCacheKey(m_current) == expectedKey)
                requestPlayUrl(m_current, true);
        });
    });
    connect(&m_player, &QMediaPlayer::playbackStateChanged, this, [this] {
        emit playingChanged(isPlaying());
        if (isPlaying()) {
            m_consecutivePlaybackFailures = 0;
            m_handlingPlaybackFailure = false;
        }
        if (isPlaying() && m_settings.value(QStringLiteral("autoDesktopLyric")).toBool(false)
            && !m_desktopLyricActive)
            toggle_desktop_lyric();
    });
    connect(&m_player, &QMediaPlayer::errorOccurred, this, [this](QMediaPlayer::Error, const QString &message) {
        appendTrace(QByteArray("player:error=") + message.toUtf8());
        if (!m_current.isEmpty() && m_current.value(QStringLiteral("source")).toString() != QStringLiteral("local")
            && !m_playRecoveryAttempted) {
            m_playRecoveryAttempted = true;
            const QString key = playCacheKey(m_current);
            m_playUrlCache.remove(key);
            m_playUrlCachedAt.remove(key);
            show_toast(QStringLiteral("播放连接已失效，正在刷新音源"));
            requestPlayUrl(m_current, true);
            return;
        }
        skipUnavailableTrack(message.isEmpty()
            ? QStringLiteral("当前歌曲无法播放") : message);
    });
    connect(&m_player, &QMediaPlayer::mediaStatusChanged, this, [this](QMediaPlayer::MediaStatus status) {
        appendTrace(QByteArray("player:status=") + QByteArray::number(int(status)));
        if (status != QMediaPlayer::EndOfMedia) return;
        // 与原版 AudioController 一致：单曲循环只重播当前曲，其余模式切下一首。
        if (m_repeatMode == QStringLiteral("one") && m_currentIndex >= 0) {
            m_player.setPosition(0);
            m_player.play();
        } else {
            next();
        }
    });

    // 本地音乐元数据读取器（仅读 metaData，不参与播放）。
    connect(&m_metaReader, &QMediaPlayer::mediaStatusChanged, this, [this](QMediaPlayer::MediaStatus status) {
        if (status == QMediaPlayer::LoadedMedia) {
            applyLocalMetadata();
        } else if (status == QMediaPlayer::InvalidMedia) {
            m_metaSongIndex = -1;
            probeNextLocalMetadata();
        }
    });

    m_songs = fallbackSongs();
    applyFavoriteStates(m_songs);
    m_queue = m_songs;
    m_songsModel.setItems(m_songs);
    m_queueModel.setItems(m_queue);
    // Normal launches finish sidecar health checks asynchronously and trigger
    // this load from probeLocalApi(). Synchronous self-tests already have a
    // ready sidecar, but do not enter an event loop long enough to need home.
    if (m_sidecarReady
        && !QCoreApplication::arguments().contains(QStringLiteral("--sidecar-self-test")))
        QTimer::singleShot(0, this, &MusicBridge::load_home_recommendations);
    if (m_settings.value(QStringLiteral("autoCheckUpdate")).toBool(true))
        QTimer::singleShot(1800, this, [this] { checkForUpdates(true); });
    appendTrace("bridge:end");
}

MusicBridge::~MusicBridge()
{
    if (m_storageDirty)
        flushLegacyStorage();
    if (m_ownsLocalApi && m_localApi.state() != QProcess::NotRunning) {
        m_localApi.terminate();
        if (!m_localApi.waitForFinished(1500)) {
            m_localApi.kill();
            m_localApi.waitForFinished(1500);
        }
    }
}

void MusicBridge::setWindow(QWindow *window) { m_window = window; }
void MusicBridge::setDesktopLyricWindow(QWindow *window) { m_desktopLyricWindow = window; }
void MusicBridge::prepareAudioOutput()
{
    const QAudioDevice device = QMediaDevices::defaultAudioOutput();
    if (!device.isNull() && m_audio.device() != device)
        m_audio.setDevice(device);
    m_audio.setVolume(std::clamp(m_volume, 0, 100) / 100.0);
    m_audio.setMuted(m_muted);
    appendTrace(QByteArray("audio:device=") + device.description().toUtf8()
                + " volume=" + QByteArray::number(m_volume)
                + " muted=" + (m_muted ? "1" : "0"));
}
QString MusicBridge::compactJson(const QJsonValue &value)
{
    if (value.isArray())
        return QString::fromUtf8(QJsonDocument(value.toArray()).toJson(QJsonDocument::Compact));
    if (value.isObject())
        return QString::fromUtf8(QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact));
    return QStringLiteral("{}");
}
QString MusicBridge::songs() const { return compactJson(m_songs); }
QVariantMap MusicBridge::currentSong() const { return m_current.toVariantMap(); }
QString MusicBridge::lyrics() const { return compactJson(m_lyrics); }
bool MusicBridge::isPlaying() const { return m_player.playbackState() == QMediaPlayer::PlayingState; }
int MusicBridge::positionMs() const { return int(m_player.position()); }
int MusicBridge::durationMs() const { return int(m_player.duration()); }
QString MusicBridge::platform() const { return m_platform; }
QString MusicBridge::viewMode() const { return m_viewMode; }
QVariantList MusicBridge::fluidColors() const { return m_fluidColors.toVariantList(); }
bool MusicBridge::fullLyrics() const { return m_fullLyrics; }
bool MusicBridge::windowFullscreen() const { return m_fullscreen; }
bool MusicBridge::desktopLyricActive() const { return m_desktopLyricActive; }
QString MusicBridge::repeatMode() const { return m_repeatMode; }
bool MusicBridge::isShuffle() const { return m_shuffle; }
int MusicBridge::volume() const { return m_volume; }
QString MusicBridge::queueList() const { return compactJson(m_queue); }
QString MusicBridge::toastMessage() const { return m_toast; }
bool MusicBridge::isQueueDrawerOpen() const { return m_queueDrawerOpen; }
bool MusicBridge::isLoginModalOpen() const { return m_loginModalOpen; }
QVariantMap MusicBridge::playlistDetail() const { return m_playlistDetail.toVariantMap(); }
QString MusicBridge::searchQuery() const { return m_searchQuery; }
QStringList MusicBridge::searchHistory() const { return m_searchHistory; }
QVariantMap MusicBridge::settings() const { return m_settings.toVariantMap(); }
QString MusicBridge::loginPlatform() const { return m_loginPlatform; }
QString MusicBridge::loginStatus() const { return m_loginStatus; }
QString MusicBridge::loginQrImage() const { return m_loginQrImage; }
QVariantMap MusicBridge::account() const { return m_accounts.value(m_platform).toObject().toVariantMap(); }
QVariantMap MusicBridge::accounts() const { return m_accounts.toVariantMap(); }
QString MusicBridge::userPlaylists() const { return compactJson(m_userPlaylists); }
QString MusicBridge::localSongs() const { return compactJson(m_localSongs); }

void MusicBridge::loadLegacyStorage()
{
    QString base = qEnvironmentVariable("LOCALAPPDATA");
    if (base.isEmpty())
        base = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    m_storagePath = QDir(base).filePath(QStringLiteral("BetaMusicPlayerQt/storage.json"));
    QFile file(m_storagePath);
    if (!file.open(QIODevice::ReadOnly)) return;
    const QJsonDocument document = QJsonDocument::fromJson(file.readAll());
    if (!document.isObject()) return;
    m_storageRoot = document.object();
    const QString storedPlatform = m_storageRoot.value(QStringLiteral("activePlatform")).toString();
    if (storedPlatform == QStringLiteral("netease") || storedPlatform == QStringLiteral("qq"))
        m_platform = storedPlatform;
    const QJsonObject auth = m_storageRoot.value("auth").toObject();
    const auto decodeStoredCookie = [](const QString &value) -> QString {
        if (value.startsWith(QStringLiteral("dpapi:"))) {
#ifdef Q_OS_WIN
            const QByteArray plain = dpapiUnprotect(value.mid(6).toUtf8());
            if (!plain.isEmpty()) return QString::fromUtf8(plain);
#else
            Q_UNUSED(value)
#endif
            return QString();
        }
        return value;
    };
    m_cookie = decodeStoredCookie(auth.value("netease").toString());
    m_qqCookie = decodeStoredCookie(auth.value("qq").toString());
    m_storageRoot["auth"] = QJsonObject{{"netease", auth.value("netease")}, {"qq", auth.value("qq")}};
    m_accounts = m_storageRoot.value("accounts").toObject();
    for (auto accountIt = m_accounts.begin(); accountIt != m_accounts.end(); ++accountIt) {
        QJsonObject profile = accountIt.value().toObject();
        const QString avatar = highResolutionCover(profile.value("avatarUrl").toString(), accountIt.key());
        if (!avatar.isEmpty()) profile.insert("avatarUrl", avatar);
        accountIt.value() = profile;
    }
    m_userPlaylistsByPlatform = m_storageRoot.value("userPlaylists").toObject();
    m_homeSongsByPlatform = m_storageRoot.value(QStringLiteral("homeSongs")).toObject();
    m_homePlaylistsByPlatform = m_storageRoot.value(QStringLiteral("homePlaylists")).toObject();
    const auto retainSupportedPlatforms = [](QJsonObject &map) {
        QJsonObject supported;
        for (const QString &key : {QStringLiteral("netease"), QStringLiteral("qq")}) {
            if (map.contains(key)) supported.insert(key, map.value(key));
        }
        map = supported;
    };
    retainSupportedPlatforms(m_accounts);
    retainSupportedPlatforms(m_userPlaylistsByPlatform);
    retainSupportedPlatforms(m_homeSongsByPlatform);
    retainSupportedPlatforms(m_homePlaylistsByPlatform);
    m_userPlaylists = m_userPlaylistsByPlatform.value(m_platform).toArray();
    m_favorites = m_storageRoot.value("favorites").toObject();
    // Older Qt builds stored the song snapshot without an isLiked field.  The
    // object key is the source of truth, so migrate the snapshot in memory and
    // let the next normal storage flush persist the normalized representation.
    for (auto favorite = m_favorites.begin(); favorite != m_favorites.end(); ++favorite) {
        QJsonObject song = favorite.value().toObject();
        if (!song.contains(QStringLiteral("id")))
            song.insert(QStringLiteral("id"), favorite.key());
        if (!song.contains(QStringLiteral("platformId"))
            && song.contains(QStringLiteral("platform_id")))
            song.insert(QStringLiteral("platformId"), song.value(QStringLiteral("platform_id")));
        song.insert(QStringLiteral("isLiked"), true);
        favorite.value() = song;
    }
    const QJsonArray storedHistory = m_storageRoot.value("searchHistory").toArray();
    m_searchHistory.clear();
    for (const QJsonValue &entry : storedHistory)
        m_searchHistory << entry.toString();
    const QJsonObject storedSettings = m_storageRoot.value("settings").toObject();
    for (auto it = storedSettings.begin(); it != storedSettings.end(); ++it)
        m_settings.insert(it.key(), it.value());
    m_volume = std::clamp(m_settings.value("volume").toInt(80), 0, 100);
    m_repeatMode = m_settings.value("repeatMode").toString("off");
    if (m_repeatMode != QStringLiteral("off") && m_repeatMode != QStringLiteral("all")
        && m_repeatMode != QStringLiteral("one"))
        m_repeatMode = QStringLiteral("off");
    m_shuffle = m_settings.value("shuffle").toBool(false);
    m_muted = m_settings.value(QStringLiteral("muted")).toBool(false);
    m_volumeBeforeMute = std::max(1, m_settings.value(QStringLiteral("volumeBeforeMute")).toInt(m_volume));
    m_audio.setVolume(m_volume / 100.0);
    m_audio.setMuted(m_muted);
    for (auto accountIt = m_accounts.constBegin(); accountIt != m_accounts.constEnd(); ++accountIt)
        cacheAvatar(accountIt.value().toObject().value("avatarUrl").toString(), accountIt.key());
}

void MusicBridge::saveLegacyStorage()
{
    if (m_storagePath.isEmpty()) return;
    m_storageDirty = true;
    // Slider drags and rapid setting changes used to rewrite the complete JSON
    // file for every mouse move. Coalesce them into one atomic write.
    m_storageSaveTimer.start();
}

void MusicBridge::flushLegacyStorage()
{
    if (m_storagePath.isEmpty()) return;
    m_storageSaveTimer.stop();
    QJsonObject auth = m_storageRoot.value("auth").toObject();
    const auto encodeStoredCookie = [](const QString &value) -> QString {
        if (value.isEmpty()) return QString();
#ifdef Q_OS_WIN
        const QByteArray protectedValue = dpapiProtect(value.toUtf8());
        if (protectedValue.isEmpty()) return QString();
        return QStringLiteral("dpapi:") + QString::fromUtf8(protectedValue);
#else
        return value;
#endif
    };
    const QString neteaseCookie = encodeStoredCookie(m_cookie);
    const QString qqCookie = encodeStoredCookie(m_qqCookie);
    if (neteaseCookie.isEmpty()) auth.remove("netease"); else auth.insert("netease", neteaseCookie);
    if (qqCookie.isEmpty()) auth.remove("qq"); else auth.insert("qq", qqCookie);
    m_storageRoot.insert("auth", auth);
    m_storageRoot.insert(QStringLiteral("activePlatform"), m_platform);
    m_storageRoot.insert("accounts", m_accounts);
    m_userPlaylistsByPlatform.insert(m_platform, m_userPlaylists);
    m_storageRoot.insert("userPlaylists", m_userPlaylistsByPlatform);
    m_storageRoot.insert(QStringLiteral("homeSongs"), m_homeSongsByPlatform);
    m_storageRoot.insert(QStringLiteral("homePlaylists"), m_homePlaylistsByPlatform);
    m_storageRoot.insert("favorites", m_favorites);
    QJsonArray history;
    for (const QString &entry : m_searchHistory) history.append(entry);
    m_storageRoot.insert("searchHistory", history);
    m_settings.insert("volume", m_volume);
    m_settings.insert("repeatMode", m_repeatMode);
    m_settings.insert("shuffle", m_shuffle);
    m_settings.insert(QStringLiteral("muted"), m_muted);
    m_settings.insert(QStringLiteral("volumeBeforeMute"), m_volumeBeforeMute);
    m_storageRoot.insert(QStringLiteral("localLibrary"), m_localSongs);
    m_storageRoot.insert("settings", m_settings);
    QDir().mkpath(QFileInfo(m_storagePath).absolutePath());
    QSaveFile file(m_storagePath);
    if (file.open(QIODevice::WriteOnly)) {
        file.write(QJsonDocument(m_storageRoot).toJson(QJsonDocument::Compact));
        if (file.commit())
            m_storageDirty = false;
    }
}

void MusicBridge::restoreLocalLibrary()
{
    m_localSongs = m_storageRoot.value(QStringLiteral("localLibrary")).toArray();
    QJsonArray existing;
    QSet<QString> seen;
    for (const QJsonValue &value : std::as_const(m_localSongs)) {
        const QJsonObject song = value.toObject();
        const QString path = QUrl(song.value(QStringLiteral("audioUrl")).toString()).toLocalFile();
        const QString canonical = QFileInfo(path).canonicalFilePath();
        if (canonical.isEmpty() || seen.contains(canonical)) continue;
        seen.insert(canonical);
        existing.append(song);
    }
    m_localSongs = existing;
    applyFavoriteStates(m_localSongs);
}

void MusicBridge::persistLocalLibrary()
{
    m_storageRoot.insert(QStringLiteral("localLibrary"), m_localSongs);
    saveLegacyStorage();
    emit localSongsChanged();
}

void MusicBridge::ensureLocalApi()
{
    const QString appDirectory = QCoreApplication::applicationDirPath();
    QString script = QDir(appDirectory).absoluteFilePath(QStringLiteral("netease_server.js"));
    bool bundledSidecar = QFileInfo::exists(script);
    if (!bundledSidecar) {
        const QString developmentScript = QString::fromUtf8(BETA_DEV_SIDECAR_PATH);
        if (QFileInfo(developmentScript).isFile()) script = developmentScript;
    }
    if (!QFile::exists(script)) {
        setLastError(QStringLiteral("内置音乐平台服务文件缺失"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }

    QTcpServer neteaseReservation;
    QTcpServer qqReservation;
    const bool portsReserved = neteaseReservation.listen(QHostAddress::LocalHost, 0)
        && qqReservation.listen(QHostAddress::LocalHost, 0);
    if (portsReserved) {
        m_neteasePort = neteaseReservation.serverPort();
        m_qqPort = qqReservation.serverPort();
    }
    if (!m_neteasePort || !m_qqPort) {
        setLastError(QStringLiteral("无法分配本地音乐平台服务端口"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }
    // Keep all three sockets reserved until every port has been chosen, then
    // release them together immediately before starting the bundled services.
    neteaseReservation.close();
    qqReservation.close();
    m_sidecarToken = (QUuid::createUuid().toString(QUuid::WithoutBraces)
                      + QUuid::createUuid().toString(QUuid::WithoutBraces)).toUtf8();
    m_network.setSidecarIdentity(m_neteasePort, m_qqPort, m_sidecarToken);
    const QString bundledNode = QDir(QFileInfo(script).absolutePath())
                                    .filePath(QStringLiteral("node/node.exe"));
    if (QFileInfo::exists(bundledNode)) {
        m_localApi.setProgram(bundledNode);
    } else if (!bundledSidecar) {
        const QString developmentNode = QStandardPaths::findExecutable(QStringLiteral("node"));
        if (developmentNode.isEmpty()) {
            setLastError(QStringLiteral("开发环境未找到 Node.js；请先在 qt 目录安装侧车依赖"));
            QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
            return;
        }
        m_localApi.setProgram(developmentNode);
    } else {
        setLastError(QStringLiteral("内置 Node.js 运行时缺失，拒绝从系统 PATH 启动"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }
    m_localApi.setArguments({script});
    m_localApi.setWorkingDirectory(QFileInfo(script).absolutePath());
    QProcessEnvironment environment = QProcessEnvironment::systemEnvironment();
    environment.insert(QStringLiteral("BETA_NETEASE_PORT"), QString::number(m_neteasePort));
    environment.insert(QStringLiteral("BETA_QQ_PORT"), QString::number(m_qqPort));
    // QProcess cleanup covers normal shutdown.  Give the sidecar the parent
    // PID as well so it can terminate itself after a debugger stop, crash or
    // forced process termination, where MusicBridge::~MusicBridge never runs.
    environment.insert(QStringLiteral("BETA_PARENT_PID"),
                       QString::number(QCoreApplication::applicationPid()));
    environment.insert(QStringLiteral("BETA_SIDECAR_TOKEN"), QString::fromUtf8(m_sidecarToken));
    m_localApi.setProcessEnvironment(environment);
    // Always drain the child output.  Besides making startup failures visible
    // in an opt-in trace, this prevents a long-running provider process from
    // ever blocking on a full redirected output pipe.
    m_localApi.setProcessChannelMode(QProcess::MergedChannels);
    connect(&m_localApi, &QProcess::readyReadStandardOutput, this, [this] {
        const QByteArray output = m_localApi.readAllStandardOutput();
        // Provider request logs may contain authentication cookies.  Record
        // only coarse startup milestones while still draining all output.
        if (output.contains("[NetEase API] Ready")) appendTrace("sidecar:netease-ready");
        if (output.contains("[QQ Music API] Ready")) appendTrace("sidecar:qq-ready");
        if (output.contains("Startup failed") || output.contains("Server error"))
            appendTrace("sidecar:provider-error");
    });
    connect(&m_localApi, &QProcess::errorOccurred, this, [](QProcess::ProcessError error) {
        appendTrace(QByteArray("sidecar:error=") + QByteArray::number(int(error)));
    });
    connect(&m_localApi, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
            [](int code, QProcess::ExitStatus status) {
        appendTrace(QByteArray("sidecar:finished code=") + QByteArray::number(code)
                    + " status=" + QByteArray::number(int(status)));
    });
    appendTrace(QByteArray("sidecar:start program=") + m_localApi.program().toUtf8()
                + " ports=" + QByteArray::number(m_neteasePort) + ','
                + QByteArray::number(m_qqPort));
    m_localApi.start();
    m_ownsLocalApi = m_localApi.waitForStarted(1500);
    if (!m_ownsLocalApi) {
        setLastError(QStringLiteral("内置音乐平台服务启动失败"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }
    // Packaging/CI explicitly asks for a synchronous health result. During a
    // normal GUI launch, poll from the event loop instead: provider modules can
    // take several seconds to initialise and must not delay the first window.
    if (QCoreApplication::arguments().contains(QStringLiteral("--sidecar-self-test"))) {
        for (int attempt = 0; attempt < 50; ++attempt) {
            if (probeSidecar(m_neteasePort, "netease", m_sidecarToken, 120)
                && probeSidecar(m_qqPort, "qq", m_sidecarToken, 120)) {
                m_sidecarReady = true;
                return;
            }
            QThread::msleep(80);
        }
        setLastError(QStringLiteral("内置音乐平台服务健康检查失败"));
        m_localApi.kill();
        m_localApi.waitForFinished(1000);
        m_ownsLocalApi = false;
        return;
    }
    QTimer::singleShot(0, this, [this] { probeLocalApi(50); });
}

void MusicBridge::probeLocalApi(int attemptsRemaining)
{
    if (probeSidecar(m_neteasePort, "netease", m_sidecarToken, 60)
        && probeSidecar(m_qqPort, "qq", m_sidecarToken, 60)) {
        m_sidecarReady = true;
        appendTrace("sidecar:ready");
        const QString neteaseUserId = m_accounts.value(QStringLiteral("netease")).toObject()
                                           .value(QStringLiteral("userId")).toString();
        if (!m_cookie.isEmpty() && !neteaseUserId.isEmpty())
            requestNeteaseVipInfo(neteaseUserId);
        if (!m_qqCookie.isEmpty() && m_accounts.contains(QStringLiteral("qq")))
            requestQqVipInfo();
        load_home_recommendations();
        return;
    }
    if (attemptsRemaining > 1 && m_localApi.state() != QProcess::NotRunning) {
        QTimer::singleShot(80, this, [this, attemptsRemaining] {
            probeLocalApi(attemptsRemaining - 1);
        });
        return;
    }
    setLastError(QStringLiteral("内置音乐平台服务健康检查失败"));
    appendTrace(QByteArray("sidecar:health-failed state=")
                + QByteArray::number(int(m_localApi.state())));
    if (m_localApi.state() != QProcess::NotRunning) {
        m_localApi.kill();
        m_localApi.waitForFinished(1000);
    }
    m_ownsLocalApi = false;
    show_toast(m_lastError);
}

QUrl MusicBridge::localApiUrl(const QString &path, const QUrlQuery &sourceQuery) const
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_neteasePort) + path);
    QUrlQuery query(sourceQuery);
    query.addQueryItem(QStringLiteral("timestamp"), QString::number(QDateTime::currentMSecsSinceEpoch()));
    url.setQuery(query);
    return url;
}

void MusicBridge::refreshSidecarCookies()
{
    QString neteaseCookie = m_cookie;
    if (!neteaseCookie.isEmpty()
        && !neteaseCookie.contains(QRegularExpression(QStringLiteral("(?:^|;\\s*)os=")))) {
        neteaseCookie += QStringLiteral("; os=pc");
    }
    m_network.setSidecarCookies(neteaseCookie.toUtf8(), m_qqCookie.toUtf8());
    appendTrace(QByteArray("auth:sidecar netease=")
                + (m_cookie.isEmpty() ? "empty"
                   : m_cookie.contains(QStringLiteral("MUSIC_U=")) ? "music-u" : "other")
                + " qq=" + (m_qqCookie.isEmpty() ? "empty" : "present"));
}

int MusicBridge::activeIndex() const
{
    // 支持与原版一致的每首歌歌词快慢偏移（正 = 提前）。
    const double offsetSeconds = m_lyricOffset / 1000.0;
    return lyric_index_at(int(m_player.position() + offsetSeconds * 1000.0));
}

int MusicBridge::lyric_index_at(int adjustedMilliseconds) const
{
    const double seconds = adjustedMilliseconds / 1000.0;
    // Lyrics are sorted by the parsers. This getter is evaluated by several
    // QML bindings on every media position notification, so use an upper-bound
    // search instead of scanning all elapsed lines for each binding.
    int first = 0;
    int last = m_lyrics.size();
    while (first < last) {
        const int middle = first + (last - first) / 2;
        if (m_lyrics.at(middle).toObject().value("time").toDouble() <= seconds)
            first = middle + 1;
        else
            last = middle;
    }
    return first - 1;
}

QString MusicBridge::highResolutionCover(QString url, const QString &source)
{
    url = url.trimmed().replace("&amp;", "&");
    if (url.startsWith(QStringLiteral("//")))
        url.prepend(QStringLiteral("https:"));
    else if (url.startsWith(QStringLiteral("http://")))
        url.replace(0, 4, QStringLiteral("https"));

    if (url.isEmpty() || url.contains(QStringLiteral("00000000000000"))) return {};

    // The providers often return a 150/300 px thumbnail by default.  Keep a
    // 1200 px master in the model so every QML surface can decode its own
    // DPR-aware texture instead of upscaling the first tiny list thumbnail.
    if (source == "netease" || url.contains("music.126.net"))
        return url.section('?', 0, 0) + "?param=1200y1200";

    if (source == "qq" || url.contains("gtimg.cn") || url.contains("q.qlogo.cn")) {
        url.replace("y.qq.com/music/photo_new/", "y.gtimg.cn/music/photo_new/");
        url.replace(QRegularExpression(QStringLiteral("R\\d+x\\d+M")), QStringLiteral("R800x800M"));
        url.replace("music/photo/album_300/", "music/photo/album_800/");
        url.replace(QRegularExpression(QStringLiteral("/(?:150|300|480|600)_albumpic_")), QStringLiteral("/800_albumpic_"));
        if (url.contains("q.qlogo.cn/headimg_dl")) {
            QUrl avatar(url);
            QUrlQuery avatarQuery(avatar);
            avatarQuery.removeAllQueryItems("spec");
            avatarQuery.addQueryItem("spec", "640");
            avatar.setQuery(avatarQuery);
            return avatar.toString();
        }
        return url;
    }

    return url;
}

QJsonArray MusicBridge::fallbackSongs()
{
    return {
        songObject(1824020871, QStringLiteral("热爱105°C的你"), QStringLiteral("阿肆"), QStringLiteral("热爱105°C的你"), QString(), 196),
        songObject(1824045033, QStringLiteral("漠河舞厅"), QStringLiteral("柳爽"), QStringLiteral("漠河舞厅"), QString(), 261),
        songObject(186016, QStringLiteral("晴天"), QStringLiteral("周杰伦"), QStringLiteral("叶惠美"), QString(), 269)
    };
}

void MusicBridge::show_toast(const QString &message) { m_toast = message; emit toastChanged(message); }
void MusicBridge::set_platform(const QString &value)
{
    if (value != QStringLiteral("netease") && value != QStringLiteral("qq")) return;
    if (value == m_platform) return;
    ++m_contentRequestSerial;
    ++m_playlistRequestSerial;
    m_activePlaylistKey.clear();
    m_platform = value;
    m_songs = {};
    m_queue = {};
    m_homePlaylists = {};
    emit songsChanged();
    emit queueChanged();
    m_homePlaylistsModel.setItems(m_homePlaylists);
    m_playlistDetail = {};
    emit playlistDetailChanged();
    m_userPlaylists = m_userPlaylistsByPlatform.value(m_platform).toArray();
    emit platformChanged(value);
    emit accountChanged();
    emit userPlaylistsChanged();
    saveLegacyStorage();
    load_home_recommendations();

    // 切换平台时，如果已登录但歌单列表为空，自动刷新用户歌单
    if (m_userPlaylists.isEmpty()) {
        if (m_platform == "qq" && m_accounts.contains("qq")) {
            requestQqUserPlaylists(m_accounts.value("qq").toObject().value("userId").toString());
        } else if (m_platform == "netease" && m_accounts.contains("netease")) {
            requestUserPlaylists(m_accounts.value("netease").toObject().value("userId").toString());
        }
    }
}
void MusicBridge::load_home_recommendations()
{
    ++m_contentRequestSerial;
    setLastError({});
    const QJsonArray cachedSongs = m_homeSongsByPlatform.value(m_platform).toArray();
    const QJsonArray cachedPlaylists = m_homePlaylistsByPlatform.value(m_platform).toArray();
    if (!cachedPlaylists.isEmpty()) setHomePlaylists(cachedPlaylists);
    if (!cachedSongs.isEmpty()) setSongs(cachedSongs);
    else setBusy(true);
    if (m_platform == QStringLiteral("qq")) {
        requestQqHome();
        requestFastHomeSongs();
        return;
    }
    if (m_platform == "netease") requestHome();
    else { setSongs(fallbackSongs()); setBusy(false); }
}
void MusicBridge::load_browse(const QString &category)
{
    m_searchQuery = category == "all" ? QStringLiteral("热门歌曲") : category;
    emit searchQueryChanged(m_searchQuery);
    set_view_mode(QStringLiteral("browse"));
    requestSearch(m_searchQuery);
}
void MusicBridge::open_playlist(const QString &name, const QString &query, const QString &cover)
{
    m_playlistDetail = {{"name", name}, {"description", QStringLiteral("精选热门曲目")}, {"cover", cover}, {"source", m_platform}, {"count", 0}};
    emit playlistDetailChanged();
    m_searchQuery = query.isEmpty() ? name : query;
    emit searchQueryChanged(m_searchQuery);
    set_view_mode("playlist_detail");
    requestSearch(m_searchQuery);
}
void MusicBridge::set_view_mode(const QString &mode) { if (m_viewMode != mode) { m_viewMode = mode; emit viewModeChanged(mode); } }

void MusicBridge::requestHome()
{
    const quint64 contentSerial = m_contentRequestSerial;
    requestNeteaseHomePlaylists();
    // 主页推荐使用网易云精选歌单 3778678，其歌曲带
    // 真实的 fee/privileges（VIP 信息正确）。/personalized/newsong 返回的歌
    // 曲几乎全是 fee=8 的试听曲，导致 VIP 标记无法正确识别。
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_neteasePort)
             + QStringLiteral("/playlist/track/all"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("id"), QStringLiteral("3778678"));
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("100"));
    query.addQueryItem(QStringLiteral("offset"), QStringLiteral("0"));
    url.setQuery(query);
    QNetworkRequest request{url};
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, contentSerial] {
        const auto data = reply->readAll(); const auto error = reply->error(); reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("netease")) return;
        appendTrace(QByteArray("home:reply error=") + QByteArray::number(int(error))
                    + " bytes=" + QByteArray::number(data.size()));
        if (error == QNetworkReply::NoError && !data.isEmpty()) handleNeteaseHomeSongs(data);
        else { setBusy(false); setLastError(QStringLiteral("网易云推荐加载失败")); show_toast(m_lastError); }
    });
}

void MusicBridge::requestFastHomeSongs()
{
    const QString source = m_platform;
    const quint64 contentSerial = m_contentRequestSerial;
    const QString query = QStringLiteral("热门歌曲");
    QUrl url;
    if (source == QStringLiteral("qq")) {
        url = QUrl(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
                   + QStringLiteral("/getSearchByKey"));
        QUrlQuery params;
        params.addQueryItem(QStringLiteral("key"), query);
        params.addQueryItem(QStringLiteral("limit"), QStringLiteral("30"));
        params.addQueryItem(QStringLiteral("page"), QStringLiteral("1"));
        url.setQuery(params);
    } else {
        return;
    }

    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", "https://y.qq.com/");
    request.setTransferTimeout(8000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, source, contentSerial] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (!ok || payload.isEmpty() || source != m_platform
            || contentSerial != m_contentRequestSerial) return;
        handleQqSongs(payload);
        cacheCurrentHomeSongs();
    });
}

void MusicBridge::requestNeteaseHomePlaylists()
{
    const quint64 contentSerial = m_contentRequestSerial;
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("6"));
    query.addQueryItem(QStringLiteral("timestamp"), QString::number(QDateTime::currentMSecsSinceEpoch()));
    QNetworkRequest request{localApiUrl(QStringLiteral("/personalized"), query)};
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, contentSerial] {
        const QByteArray payload = reply->readAll();
        const auto error = reply->error();
        reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("netease")) return;
        if (error != QNetworkReply::NoError || payload.isEmpty()) return;
        const QJsonArray raw = QJsonDocument::fromJson(payload).object().value(QStringLiteral("result")).toArray();
        QJsonArray playlists;
        for (const QJsonValue &value : raw) {
            const QJsonObject item = value.toObject();
            const QString id = QString::number(item.value(QStringLiteral("id")).toInteger());
            if (id == QStringLiteral("0")) continue;
            playlists.append(QJsonObject{
                {QStringLiteral("id"), id},
                {QStringLiteral("name"), item.value(QStringLiteral("name")).toString()},
                {QStringLiteral("description"), item.value(QStringLiteral("copywriter")).toString()},
                {QStringLiteral("cover"), highResolutionCover(item.value(QStringLiteral("picUrl")).toString(), QStringLiteral("netease"))},
                {QStringLiteral("trackCount"), item.value(QStringLiteral("trackCount")).toInt()},
                {QStringLiteral("source"), QStringLiteral("netease")}
            });
        }
        if (!playlists.isEmpty()) setHomePlaylists(playlists);
    });
}
void MusicBridge::search(const QString &query)
{
    if (query.trimmed().isEmpty()) return;
    m_searchQuery = query; emit searchQueryChanged(query); set_view_mode("search");
    add_search_history(query);
    setBusy(true);
    setLastError({});
    requestSearch(query);
}
void MusicBridge::add_search_history(const QString &query)
{
    const QString trimmed = query.trimmed();
    if (trimmed.isEmpty()) return;
    m_searchHistory.removeAll(trimmed);
    m_searchHistory.prepend(trimmed);
    while (m_searchHistory.size() > 10) m_searchHistory.removeLast();
    saveLegacyStorage();
    emit searchHistoryChanged();
}
void MusicBridge::remove_search_history_item(const QString &query)
{
    m_searchHistory.removeAll(query);
    saveLegacyStorage();
    emit searchHistoryChanged();
}
void MusicBridge::clear_search_history()
{
    m_searchHistory.clear();
    saveLegacyStorage();
    emit searchHistoryChanged();
}
void MusicBridge::requestSearch(const QString &query)
{
    const quint64 contentSerial = ++m_contentRequestSerial;
    if (m_platform == "qq") { requestQqSearch(query); return; }
    QNetworkRequest request{QUrl(QString::fromLatin1(kNeteaseBase) + "/api/cloudsearch/pc")};
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/x-www-form-urlencoded");
    request.setRawHeader("User-Agent", "Mozilla/5.0"); request.setRawHeader("Referer", "https://music.163.com/");
    request.setTransferTimeout(15000);
    QUrlQuery form; form.addQueryItem("s", query); form.addQueryItem("type", "1"); form.addQueryItem("limit", "30"); form.addQueryItem("offset", "0");
    auto *reply = m_network.post(request, form.query(QUrl::FullyEncoded).toUtf8());
    connect(reply, &QNetworkReply::finished, this, [this, reply, query, contentSerial] {
        const auto data = reply->readAll(); const auto error = reply->error(); reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("netease")
            || query != m_searchQuery) return;
        if (error == QNetworkReply::NoError && !data.isEmpty()) handleSongs(data, false);
        else { setBusy(false); setLastError(QStringLiteral("网易云搜索失败")); show_toast(m_lastError); }
    });
}

void MusicBridge::requestQqSearch(const QString &query)
{
    const quint64 contentSerial = m_contentRequestSerial;
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getSearchByKey"));
    QUrlQuery params;
    params.addQueryItem("key", query);
    params.addQueryItem("limit", "30");
    params.addQueryItem("page", "1");
    url.setQuery(params);
    QNetworkRequest request(url);
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, query, reply, contentSerial] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("qq")
            || query != m_searchQuery) return;
        if (!ok || payload.isEmpty()) {
            requestQqPublicSearch(query);
            return;
        }
        handleQqSongs(payload);
    });
}

void MusicBridge::requestQqHome()
{
    const quint64 contentSerial = m_contentRequestSerial;
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
             + QStringLiteral("/getSongLists"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("20"));
    query.addQueryItem(QStringLiteral("page"), QStringLiteral("0"));
    query.addQueryItem(QStringLiteral("sortId"), QStringLiteral("5"));
    query.addQueryItem(QStringLiteral("categoryId"), QStringLiteral("10000000"));
    url.setQuery(query);

    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, query, contentSerial] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const auto error = reply->error();
        reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("qq")) return;
        const QJsonArray list = root.value(QStringLiteral("response")).toObject()
            .value(QStringLiteral("data")).toObject().value(QStringLiteral("list")).toArray();
        if (error != QNetworkReply::NoError || list.isEmpty()) {
            setBusy(false);
            setLastError(QStringLiteral("QQ 音乐推荐歌单加载失败"));
            show_toast(m_lastError);
            return;
        }
        QJsonArray playlists;
        for (int i = 0; i < qMin(6, list.size()); ++i) {
            const QJsonObject candidate = list.at(i).toObject();
            QString candidateId = candidate.value(QStringLiteral("dissid")).toVariant().toString();
            if (candidateId.isEmpty()) candidateId = candidate.value(QStringLiteral("id")).toVariant().toString();
            if (candidateId.isEmpty()) continue;
            playlists.append(QJsonObject{
                {QStringLiteral("id"), QStringLiteral("qq_pl_") + candidateId},
                {QStringLiteral("name"), candidate.value(QStringLiteral("dissname")).toString(candidate.value(QStringLiteral("name")).toString())},
                {QStringLiteral("description"), candidate.value(QStringLiteral("desc")).toString(candidate.value(QStringLiteral("introduction")).toString())},
                {QStringLiteral("cover"), highResolutionCover(candidate.value(QStringLiteral("imgurl")).toString(candidate.value(QStringLiteral("logo")).toString()), QStringLiteral("qq"))},
                {QStringLiteral("trackCount"), candidate.value(QStringLiteral("songnum")).toInt()},
                {QStringLiteral("source"), QStringLiteral("qq")}
            });
        }
        if (!playlists.isEmpty()) setHomePlaylists(playlists);
        const QJsonObject item = list.first().toObject();
        const QString id = item.value(QStringLiteral("dissid")).toVariant().toString().isEmpty()
            ? item.value(QStringLiteral("id")).toVariant().toString()
            : item.value(QStringLiteral("dissid")).toVariant().toString();
        if (id.isEmpty()) {
            setBusy(false);
            setLastError(QStringLiteral("QQ 音乐推荐歌单数据无效"));
            show_toast(m_lastError);
            return;
        }
        requestQqPlaylistDetail(QJsonObject{
            {QStringLiteral("id"), QStringLiteral("qq_pl_") + id},
            {QStringLiteral("name"), item.value(QStringLiteral("dissname")).toString()},
            {QStringLiteral("cover"), item.value(QStringLiteral("imgurl")).toString()},
            {QStringLiteral("source"), QStringLiteral("qq")},
            {QStringLiteral("_home"), true}
        });
    });
}

void MusicBridge::requestQqPublicSearch(const QString &query)
{
    const quint64 contentSerial = m_contentRequestSerial;
    QUrl url(QStringLiteral("https://c.y.qq.com/soso/fcgi-bin/client_search_cp"));
    QUrlQuery params;
    params.addQueryItem("w", query);
    params.addQueryItem("p", "1");
    params.addQueryItem("n", "30");
    params.addQueryItem("format", "json");
    params.addQueryItem("ct", "24");
    params.addQueryItem("cv", "0");
    url.setQuery(params);

    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", "https://y.qq.com/");
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, query, contentSerial] {
        setBusy(false);
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        if (contentSerial != m_contentRequestSerial || m_platform != QStringLiteral("qq")
            || query != m_searchQuery) return;
        if (!payload.isEmpty()) {
            const auto doc = QJsonDocument::fromJson(payload);
            if (doc.isObject()) {
                const QJsonObject data = doc.object().value("data").toObject();
                const QJsonArray songList = data.value("song").toObject().value("list").toArray();
                QJsonArray parsed;
                for (const QJsonValue &val : songList) {
                    const QJsonObject item = val.toObject();
                    const QString songmid = item.value("songmid").toString();
                    if (songmid.isEmpty()) continue;
                    const QString albummid = item.value("albummid").toString();
                    QStringList singers;
                    for (const auto &s : item.value("singer").toArray()) singers << s.toObject().value("name").toString();
                    QString cover;
                    if (!albummid.isEmpty() && albummid != QStringLiteral("00000000000000"))
                        cover = QStringLiteral("https://y.gtimg.cn/music/photo_new/T002R800x800M000") + albummid + QStringLiteral(".jpg");
                    parsed.append(QJsonObject{
                        {"id", QStringLiteral("qq-") + songmid},
                        {"platformId", songmid},
                        {"name", item.value("songname").toString()},
                        {"artist", singers.join(QStringLiteral(", "))},
                        {"album", item.value("albumname").toString()},
                        {"cover", highResolutionCover(cover, "qq")},
                        {"duration", item.value("interval").toInt()},
                        {"source", "qq"},
                        {"vip", jsonInteger(item.value("pay").toObject().value("payplay")) == 1},
                        {"isLiked", false}
                    });
                }
                if (!parsed.isEmpty()) {
                    setSongs(parsed);
                    return;
                }
            }
        }
        show_toast(QStringLiteral("QQ 音乐未返回可用歌曲"));
    });
}

void MusicBridge::handleQqSongs(const QByteArray &payload)
{
    setBusy(false);
    const QJsonObject root = QJsonDocument::fromJson(payload).object();
    const QJsonObject response = root.value("response").toObject();
    const QJsonObject data = response.value("data").toObject().isEmpty()
        ? root.value("data").toObject() : response.value("data").toObject();
    QJsonArray raw = data.value("song").toObject().value("list").toArray();
    if (raw.isEmpty()) raw = data.value("list").toArray();
    QJsonArray parsed;
    for (const QJsonValue &value : raw) {
        const QJsonObject item = value.toObject();
        const QString mid = item.value("songmid").toString(item.value("mid").toString());
        if (mid.isEmpty()) continue;
        QStringList artists;
        const QJsonArray singers = item.value("singer").toArray();
        for (const QJsonValue &singer : singers)
            artists << singer.toObject().value("name").toString();
        if (artists.isEmpty()) artists << item.value("singerName").toString();
        const QJsonObject album = item.value("album").toObject();
        QString albumMid = item.value("albummid").toString(album.value("mid").toString());
        QString cover = item.value("cover").toString(item.value("pic").toString());
        if (cover.isEmpty() && !albumMid.isEmpty())
            cover = QStringLiteral("https://y.gtimg.cn/music/photo_new/T002R800x800M000") + albumMid + QStringLiteral(".jpg");
        const QJsonObject pay = item.value("pay").toObject();
        const int payPlay = jsonInteger(pay.value("payplay"),
                                        jsonInteger(pay.value("pay_play"), -1));
        const bool vip = payPlay >= 0 ? payPlay == 1
                                      : jsonPositive(item.value("isvip"))
                                            || jsonPositive(item.value("is_vip"))
                                            || jsonPositive(item.value("vip"))
                                            || jsonInteger(item.value("vip_type")) > 0;
        QJsonObject song{{"id", QStringLiteral("qq-") + mid}, {"platformId", mid},
            {"name", item.value("songname").toString(item.value("name").toString())},
            {"artist", artists.join(QStringLiteral(", "))},
            {"album", item.value("albumname").toString(album.value("name").toString())},
            {"cover", highResolutionCover(cover, "qq")},
            {"duration", item.value("interval").toInt(item.value("duration").toInt())},
            {"source", "qq"}, {"vip", vip}, {"isLiked", false}};
        parsed.append(song);
    }
    if (parsed.isEmpty()) { show_toast(QStringLiteral("QQ 音乐未返回可用歌曲")); return; }
    setSongs(parsed);
}

void MusicBridge::handleSongs(const QByteArray &payload, bool home)
{
    setBusy(false);
    const auto doc = QJsonDocument::fromJson(payload); if (!doc.isObject()) return;
    const QJsonObject root = doc.object(); QJsonArray raw;
    if (home) raw = root.value("result").toArray(); else raw = root.value("result").toObject().value("songs").toArray();
    QJsonArray parsed;
    for (const QJsonValue &entry : raw) {
        const QJsonObject rawEntry = entry.toObject();
        const QJsonObject item = home ? rawEntry.value("song").toObject() : rawEntry;
        const QJsonObject album = item.value(home ? "album" : "al").toObject();
        const QJsonArray artists = item.value(home ? "artists" : "ar").toArray();
        QStringList names; for (const auto &artist : artists) names << artist.toObject().value("name").toString();
        const qint64 id = item.value("id").toInteger(); if (!id) continue;
        int fee = jsonInteger(item.value("privilege").toObject().value("fee"),
                              jsonInteger(item.value("fee")));
        const bool vip = fee == 1 || fee == 4;
        const QString cover = home ? rawEntry.value("picUrl").toString(album.value("picUrl").toString())
                                   : album.value("picUrl").toString();
        QJsonObject song = songObject(id, item.value("name").toString(), names.join(QStringLiteral(", ")),
                                      album.value("name").toString(), highResolutionCover(cover, "netease"),
                                      int((item.value("dt").toDouble(item.value("duration").toDouble())) / 1000));
        song.insert("vip", vip); parsed.append(song);
    }
    appendTrace(QByteArray("home:parsed=") + QByteArray::number(parsed.size()));
    if (!parsed.isEmpty()) setSongs(parsed);
}
void MusicBridge::handleNeteaseHomeSongs(const QByteArray &payload)
{
    setBusy(false);
    const QJsonObject root = QJsonDocument::fromJson(payload).object();
    QJsonArray raw = root.value("songs").toArray();
    QJsonArray privileges = root.value("privileges").toArray();
    QHash<QString, int> feeById;
    for (const QJsonValue &value : privileges) {
        const QJsonObject item = value.toObject();
        feeById.insert(QString::number(item.value("id").toInteger()),
                       item.value("fee").toInt());
    }
    QJsonArray parsed;
    for (const QJsonValue &value : raw) {
        const QJsonObject item = value.toObject();
        const qint64 numericId = item.value("id").toInteger();
        if (!numericId) continue;
        const QJsonObject album = item.value("al").toObject();
        QStringList artistNames;
        for (const QJsonValue &artist : item.value("ar").toArray())
            artistNames << artist.toObject().value("name").toString();
        const int fee = feeById.value(QString::number(numericId), item.value("fee").toInt());
        QJsonObject song = songObject(numericId, item.value("name").toString(),
            artistNames.join(QStringLiteral(", ")), album.value("name").toString(),
            highResolutionCover(album.value("picUrl").toString(), QStringLiteral("netease")),
            int(item.value("dt").toDouble() / 1000));
        song.insert(QStringLiteral("vip"), fee == 1 || fee == 4);
        parsed.append(song);
    }
    appendTrace(QByteArray("home:parsed=") + QByteArray::number(parsed.size()));
    if (!parsed.isEmpty()) {
        setSongs(parsed);
        cacheCurrentHomeSongs();
    }
    else { setLastError(QStringLiteral("网易云推荐加载失败")); show_toast(m_lastError); }
}
void MusicBridge::setSongs(QJsonArray songs)
{
    for (int i = 0; i < songs.size(); ++i) {
        QJsonObject song = songs.at(i).toObject();
        const QString source = song.value("source").toString("netease");
        song.insert("cover", highResolutionCover(song.value("cover").toString(), source));
        songs[i] = song;
    }
    applyFavoriteStates(songs);
    m_songs = std::move(songs); m_queue = m_songs; emit songsChanged(); emit queueChanged();
    if (!m_songs.isEmpty())
        appendTrace(QByteArray("songs:first-cover=")
                    + m_songs.first().toObject().value("cover").toString().toUtf8());
    setBusy(false);
    setLastError({});
    // Preload only the first visible rows. Eagerly downloading every cover in
    // a 200/1000-track playlist saturates the network queue and makes the
    // detail page feel stuck even after its song data has arrived.
    const int preloadCount = qMin(16, int(m_songs.size()));
    for (int index = 0; index < preloadCount; ++index)
        cacheCover(m_songs.at(index).toObject().value("cover").toString());
}

void MusicBridge::cacheCurrentHomeSongs()
{
    if (m_platform == QStringLiteral("netease") || m_platform == QStringLiteral("qq")) {
        m_homeSongsByPlatform.insert(m_platform, m_songs);
        saveLegacyStorage();
    }
}

bool MusicBridge::isFavorite(const QString &songId) const
{
    if (songId.isEmpty()) return false;
    if (m_favorites.contains(songId)) return true;
    for (auto favorite = m_favorites.constBegin(); favorite != m_favorites.constEnd(); ++favorite) {
        const QJsonObject stored = favorite.value().toObject();
        if (stored.value(QStringLiteral("id")).toVariant().toString() == songId)
            return true;
        const QString storedPlatformId = stored.value(QStringLiteral("platformId")).toVariant().toString();
        if (!storedPlatformId.isEmpty() && storedPlatformId == songId)
            return true;
    }
    return false;
}

bool MusicBridge::songIsFavorite(const QJsonObject &song) const
{
    if (song.value(QStringLiteral("isLiked")).toBool()) return true;
    const QString id = song.value(QStringLiteral("id")).toVariant().toString();
    if (!id.isEmpty() && isFavorite(id)) return true;

    const QString source = song.value(QStringLiteral("source")).toString();
    QString platformId = song.value(QStringLiteral("platformId")).toVariant().toString();
    if (platformId.isEmpty())
        platformId = song.value(QStringLiteral("platform_id")).toVariant().toString();
    if (!platformId.isEmpty() && isFavorite(platformId)) return true;
    if (!source.isEmpty() && !platformId.isEmpty()) {
        if (isFavorite(source + QLatin1Char('-') + platformId)
            || isFavorite(source + QLatin1Char('_') + platformId))
            return true;
    }

    for (auto favorite = m_favorites.constBegin(); favorite != m_favorites.constEnd(); ++favorite) {
        const QJsonObject stored = favorite.value().toObject();
        if (!id.isEmpty()
            && stored.value(QStringLiteral("id")).toVariant().toString() == id)
            return true;
        const QString storedSource = stored.value(QStringLiteral("source")).toString();
        QString storedPlatformId = stored.value(QStringLiteral("platformId")).toVariant().toString();
        if (storedPlatformId.isEmpty())
            storedPlatformId = stored.value(QStringLiteral("platform_id")).toVariant().toString();
        if (!source.isEmpty() && source == storedSource && !platformId.isEmpty()
            && platformId == storedPlatformId)
            return true;
    }
    return false;
}

void MusicBridge::applyFavoriteStates(QJsonArray &songs) const
{
    for (int index = 0; index < songs.size(); ++index) {
        QJsonObject song = songs.at(index).toObject();
        song.insert(QStringLiteral("isLiked"), songIsFavorite(song));
        songs[index] = song;
    }
}

void MusicBridge::mergeSongsIntoFavorites(const QJsonArray &songs)
{
    for (const QJsonValue &value : songs) {
        QJsonObject song = value.toObject();
        const QString id = song.value(QStringLiteral("id")).toVariant().toString();
        if (id.isEmpty()) continue;
        song.insert(QStringLiteral("isLiked"), true);
        m_favorites.insert(id, song);
    }
    applyFavoriteStates(m_songs);
    applyFavoriteStates(m_queue);
    if (songIsFavorite(m_current)) {
        m_current.insert(QStringLiteral("isLiked"), true);
        emit currentSongChanged();
    }
    saveLegacyStorage();
    emit favoritesChanged();
    emit songsChanged();
    emit queueChanged();
}

void MusicBridge::setHomePlaylists(QJsonArray playlists)
{
    for (int i = 0; i < playlists.size(); ++i) {
        QJsonObject playlist = playlists.at(i).toObject();
        const QString source = playlist.value(QStringLiteral("source")).toString(m_platform);
        playlist.insert(QStringLiteral("cover"), highResolutionCover(playlist.value(QStringLiteral("cover")).toString(), source));
        playlists[i] = playlist;
    }
    m_homePlaylists = std::move(playlists);
    if (!m_homePlaylists.isEmpty()) {
        const QString source = m_homePlaylists.first().toObject()
                                   .value(QStringLiteral("source")).toString(m_platform);
        if (!source.isEmpty()) {
            m_homePlaylistsByPlatform.insert(source, m_homePlaylists);
            saveLegacyStorage();
        }
    }
    m_homePlaylistsModel.setItems(m_homePlaylists);
    for (const QJsonValue &value : std::as_const(m_homePlaylists))
        cacheCover(value.toObject().value(QStringLiteral("cover")).toString());
}

void MusicBridge::play(int index) { setCurrentIndex(index); }
void MusicBridge::play_search_result(int index)
{
    if (index < 0 || index >= m_songs.size()) return;
    // The search view is backed by songsModel. Rebuild the queue from that
    // exact model immediately before playback so a late page/cover update or
    // a previously opened playlist cannot leave play(index) addressing a
    // different queue.
    m_queue = m_songs;
    emit queueChanged();
    setCurrentIndex(index);
}
void MusicBridge::play_local(int index)
{
    if (index < 0 || index >= m_localSongs.size()) return;
    m_songs = m_localSongs;
    m_queue = m_localSongs;
    emit songsChanged();
    emit queueChanged();
    setCurrentIndex(index);
}
void MusicBridge::play_queue_index(int index) { setCurrentIndex(index); }
void MusicBridge::setCurrentIndex(int index, bool autoplay, bool resetFailureCount)
{
    if (index < 0 || index >= m_queue.size()) return;
    if (resetFailureCount) m_consecutivePlaybackFailures = 0;
    m_handlingPlaybackFailure = false;
    // 立即终止上一首，避免用户点击后旧歌曲还继续播放、造成“切歌没响应”的感觉。
    m_player.stop();
    set_lyric_offset(0);
    m_playRecoveryAttempted = false;
    prepareAudioOutput();
    m_currentIndex = index; m_current = m_queue.at(index).toObject();
    if (songIsFavorite(m_current))
        m_current.insert(QStringLiteral("isLiked"), true);
    requestCoverPalette(m_current.value("cover").toString());
    // QML's image loader cannot attach the Referer header required by some
    // music CDNs. Fetch the selected cover once through the bridge and then
    // switch every view to the locally cached, lossless file URL.
    cacheCover(m_current.value("cover").toString());
    if (m_current.value("source").toString() == "local") {
        m_player.setSource(QUrl(m_current.value("audioUrl").toString()));
        requestLyrics(m_current);
        if (autoplay) m_player.play();
        emit currentSongChanged();
        return;
    }
    const QString nativeId = m_current.value("platformId").toString();
    if (nativeId.isEmpty()) {
        skipUnavailableTrack(QStringLiteral("该曲目暂时没有可用音源"));
        return;
    }
    requestPlayUrl(m_current, autoplay);
    requestLyrics(m_current);
    emit currentSongChanged();
}

void MusicBridge::cacheCover(const QString &coverUrl)
{
    if (!coverUrl.startsWith(QStringLiteral("http"))) return;

    const QString key = QString::fromLatin1(QCryptographicHash::hash(
        coverUrl.toUtf8(), QCryptographicHash::Sha256).toHex());
    const QString cacheRoot = QDir(QStandardPaths::writableLocation(
        QStandardPaths::CacheLocation)).filePath(QStringLiteral("BetaMusicPlayerQt/covers"));
    const QString cachedPath = QDir(cacheRoot).filePath(key + QStringLiteral(".jpg"));
    const QString cachedUrl = QUrl::fromLocalFile(cachedPath).toString();
    if (QFile::exists(cachedPath)) {
        replaceCoverWithCachedFile(coverUrl, cachedUrl);
        return;
    }
    if (m_pendingCoverDownloads.contains(coverUrl)) return;
    m_pendingCoverDownloads.insert(coverUrl);

    QNetworkRequest request{QUrl(coverUrl)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", coverReferer(coverUrl));
    auto *reply = m_network.get(request);
    limitImageDownload(reply);
    connect(reply, &QNetworkReply::finished, this, [this, reply, coverUrl, cacheRoot, cachedPath, cachedUrl] {
        m_pendingCoverDownloads.remove(coverUrl);
        const QByteArray bytes = reply->readAll();
        reply->deleteLater();
        QImage probe;
        if (bytes.isEmpty() || !probe.loadFromData(bytes)) return;

        QDir().mkpath(cacheRoot);
        QSaveFile target(cachedPath);
        if (!target.open(QIODevice::WriteOnly) || target.write(bytes) != bytes.size() || !target.commit()) return;
        const bool isCurrentCover = m_current.value("cover").toString() == coverUrl;
        replaceCoverWithCachedFile(coverUrl, cachedUrl);
        if (isCurrentCover) requestCoverPalette(cachedUrl);
    });
}

void MusicBridge::cacheAvatar(const QString &avatarUrl, const QString &platform)
{
    if (!avatarUrl.startsWith(QStringLiteral("http")) || platform.isEmpty()) return;
    const QString key = QString::fromLatin1(QCryptographicHash::hash(
        avatarUrl.toUtf8(), QCryptographicHash::Sha256).toHex());
    const QString cacheRoot = QDir(QStandardPaths::writableLocation(
        QStandardPaths::CacheLocation)).filePath(QStringLiteral("BetaMusicPlayerQt/avatars"));
    const QString cachedPath = QDir(cacheRoot).filePath(key + QStringLiteral(".img"));
    const QString cachedUrl = QUrl::fromLocalFile(cachedPath).toString();
    if (QFile::exists(cachedPath)) {
        replaceAvatarWithCachedFile(platform, avatarUrl, cachedUrl);
        return;
    }
    const QString requestKey = platform + QLatin1Char('|') + avatarUrl;
    if (m_pendingAvatarDownloads.contains(requestKey)) return;
    m_pendingAvatarDownloads.insert(requestKey);
    QNetworkRequest request{QUrl(avatarUrl)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", platform == "qq"
        ? "https://y.qq.com/" : "https://music.163.com/");
    auto *reply = m_network.get(request);
    limitImageDownload(reply);
    connect(reply, &QNetworkReply::finished, this, [this, reply, platform, avatarUrl, cacheRoot, cachedPath, cachedUrl, requestKey] {
        m_pendingAvatarDownloads.remove(requestKey);
        const QByteArray bytes = reply->readAll();
        reply->deleteLater();
        QImage probe;
        if (bytes.isEmpty() || !probe.loadFromData(bytes)) return;
        QDir().mkpath(cacheRoot);
        QSaveFile target(cachedPath);
        if (!target.open(QIODevice::WriteOnly) || target.write(bytes) != bytes.size() || !target.commit()) return;
        replaceAvatarWithCachedFile(platform, avatarUrl, cachedUrl);
    });
}

void MusicBridge::replaceCoverWithCachedFile(const QString &remoteUrl, const QString &localUrl)
{
    bool songsDirty = false;
    bool queueDirty = false;
    bool currentDirty = false;
    bool detailDirty = false;
    bool playlistsDirty = false;
    for (int i = 0; i < m_songs.size(); ++i) {
        QJsonObject song = m_songs.at(i).toObject();
        if (song.value("cover").toString() != remoteUrl) continue;
        song.insert("cover", localUrl);
        m_songs[i] = song;
        songsDirty = true;
    }
    for (int i = 0; i < m_queue.size(); ++i) {
        QJsonObject song = m_queue.at(i).toObject();
        if (song.value("cover").toString() != remoteUrl) continue;
        song.insert("cover", localUrl);
        m_queue[i] = song;
        queueDirty = true;
    }
    if (m_current.value("cover").toString() == remoteUrl) {
        m_current.insert("cover", localUrl);
        currentDirty = true;
    }
    if (m_playlistDetail.value("cover").toString() == remoteUrl) {
        m_playlistDetail.insert("cover", localUrl);
        detailDirty = true;
    }
    for (auto platform = m_userPlaylistsByPlatform.begin(); platform != m_userPlaylistsByPlatform.end(); ++platform) {
        QJsonArray lists = platform.value().toArray();
        bool listDirty = false;
        for (int i = 0; i < lists.size(); ++i) {
            QJsonObject playlist = lists.at(i).toObject();
            if (playlist.value("cover").toString() != remoteUrl) continue;
            playlist.insert("cover", localUrl);
            lists[i] = playlist;
            listDirty = true;
        }
        if (listDirty) {
            platform.value() = lists;
            if (platform.key() == m_platform) m_userPlaylists = lists;
            playlistsDirty = true;
        }
    }
    if (songsDirty) emit songsChanged();
    if (queueDirty) emit queueChanged();
    if (currentDirty) emit currentSongChanged();
    if (detailDirty) emit playlistDetailChanged();
    if (playlistsDirty) emit userPlaylistsChanged();
    if (songsDirty)
        appendTrace(QByteArray("cover:cached=") + localUrl.toUtf8());
}

void MusicBridge::replaceAvatarWithCachedFile(const QString &platform, const QString &remoteUrl, const QString &localUrl)
{
    QJsonObject account = m_accounts.value(platform).toObject();
    if (account.value("avatarUrl").toString() != remoteUrl) return;
    account.insert("avatarUrl", localUrl);
    m_accounts.insert(platform, account);
    emit accountChanged();
}

void MusicBridge::requestCoverPalette(const QString &coverUrl)
{
    if (coverUrl.isEmpty()) return;
    // 封面缓存成功后 m_current.cover 会替换为 file:// 本地路径，而
    // QNetworkAccessManager 不支持 file 协议，直接读文件，否则缓存封面
    // 会卡在"调色板永不更新"。
    if (!coverUrl.startsWith(QStringLiteral("http"))) {
        computeFluidPalette(QImage(QUrl(coverUrl).toLocalFile()));
        return;
    }
    QNetworkRequest request{QUrl(coverUrl)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", coverReferer(coverUrl));
    auto *reply = m_network.get(request);
    limitImageDownload(reply);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        QImage image;
        image.loadFromData(reply->readAll());
        reply->deleteLater();
        computeFluidPalette(image);
    });
}

void MusicBridge::computeFluidPalette(QImage image)
{
    if (image.isNull()) return;
    image = image.convertToFormat(QImage::Format_RGB32).scaled(
        48, 48, Qt::IgnoreAspectRatio, Qt::SmoothTransformation);

    auto desaturate = [](int r, int g, int b) -> QColor {
        const double gray = r * 0.299 + g * 0.587 + b * 0.114;
        const double mix = 0.45;
        const int nr = std::clamp(int(std::round(gray + (r - gray) * mix)), 0, 255);
        const int ng = std::clamp(int(std::round(gray + (g - gray) * mix)), 0, 255);
        const int nb = std::clamp(int(std::round(gray + (b - gray) * mix)), 0, 255);
        return QColor(nr, ng, nb);
    };

    struct Region { int x, y, w, h; };
    const Region regions[4] = {
        {0, 0, 24, 24},   // Top-Left (Color A)
        {24, 0, 24, 24},  // Top-Right (Color B)
        {24, 24, 24, 24}, // Bottom-Right (Color C)
        {0, 24, 24, 24}   // Bottom-Left (Color D)
    };

    QJsonArray palette;
    for (int i = 0; i < 4; ++i) {
        const auto &reg = regions[i];
        quint64 rSum = 0, gSum = 0, bSum = 0;
        int count = 0;
        for (int y = reg.y; y < reg.y + reg.h; ++y) {
            const QRgb *line = reinterpret_cast<const QRgb *>(image.constScanLine(y));
            for (int x = reg.x; x < reg.x + reg.w; ++x) {
                const QColor c(line[x]);
                rSum += c.red();
                gSum += c.green();
                bSum += c.blue();
                ++count;
            }
        }
        if (count > 0) {
            const QColor desat = desaturate(int(rSum / count), int(gSum / count), int(bSum / count));
            palette.append(desat.name(QColor::HexRgb));
        }
    }

    if (palette.size() == 4) {
        m_fluidColors = palette;
        emit fluidColorsChanged();
    }
}

void MusicBridge::requestPlayUrl(const QJsonObject &song, bool autoplay)
{
    const quint64 serial = ++m_playRequestSerial;
    const QString cacheKey = playCacheKey(song);
    const qint64 cachedAt = m_playUrlCachedAt.value(cacheKey);
    if (!cacheKey.isEmpty() && !m_playUrlCache.value(cacheKey).isEmpty()
        && QDateTime::currentMSecsSinceEpoch() - cachedAt < 8 * 60 * 1000) {
        startResolvedPlayback(song, m_playUrlCache.value(cacheKey), autoplay, serial);
        return;
    }
    if (song.value("source").toString() == "qq") {
        requestQqPlayUrl(song, autoplay, serial);
        return;
    }
    const QString quality = m_settings.value("audioQuality").toString("high");
    const QString requested = quality == "lossless" ? "lossless"
                              : quality == "standard" ? "standard" : "exhigh";
    QStringList levels{requested, QStringLiteral("exhigh"), QStringLiteral("standard")};
    levels.removeDuplicates();
    requestPlayLevel(song, levels, 0, autoplay, serial);
}

void MusicBridge::invalidatePlayUrlCache()
{
    ++m_playCacheGeneration;
    m_playUrlCache.clear();
    m_playUrlCachedAt.clear();
    m_pendingPlayPrefetch.clear();
}

QString MusicBridge::playCacheKey(const QJsonObject &song) const
{
    const QString source = song.value(QStringLiteral("source")).toString();
    const QString platformId = song.value(QStringLiteral("platformId")).toVariant().toString();
    if (source.isEmpty() || platformId.isEmpty()) return {};
    return source + QLatin1Char(':') + platformId;
}

void MusicBridge::startResolvedPlayback(const QJsonObject &song, const QString &mediaUrl,
                                        bool autoplay, quint64 serial)
{
    if (serial != m_playRequestSerial || mediaUrl.isEmpty()) return;
    const QString key = playCacheKey(song);
    if (!key.isEmpty()) {
        m_playUrlCache.insert(key, mediaUrl);
        m_playUrlCachedAt.insert(key, QDateTime::currentMSecsSinceEpoch());
    }
    appendTrace(QByteArray("player:resolved source=")
                + song.value(QStringLiteral("source")).toString().toUtf8()
                + " cached=" + (key.isEmpty() ? "0" : "1"));
    m_player.setSource(QUrl(mediaUrl));
    if (autoplay) m_player.play();
    QTimer::singleShot(200, this, &MusicBridge::prefetchNextPlayUrl);
}

void MusicBridge::skipUnavailableTrack(const QString &reason)
{
    if (m_handlingPlaybackFailure) return;
    m_handlingPlaybackFailure = true;
    ++m_playRequestSerial; // Ignore late replies belonging to the failed song.
    m_player.stop();

    ++m_consecutivePlaybackFailures;
    if (m_queue.size() <= 1 || m_consecutivePlaybackFailures >= m_queue.size()) {
        show_toast(QStringLiteral("%1；播放列表中没有其他可播放歌曲").arg(reason));
        return;
    }

    int nextIndex = m_currentIndex + 1;
    if (nextIndex >= m_queue.size()) {
        if (m_repeatMode == QStringLiteral("all")) nextIndex = 0;
        else {
            show_toast(QStringLiteral("%1；后面没有可播放歌曲").arg(reason));
            return;
        }
    }

    show_toast(QStringLiteral("%1，已自动跳到下一首").arg(reason));
    QTimer::singleShot(0, this, [this, nextIndex] {
        setCurrentIndex(nextIndex, true, false);
    });
}

void MusicBridge::prefetchNextPlayUrl()
{
    if (m_queue.isEmpty() || m_currentIndex < 0) return;
    int nextIndex = m_currentIndex + 1;
    if (nextIndex >= m_queue.size()) {
        if (m_repeatMode != QStringLiteral("all")) return;
        nextIndex = 0;
    }
    const QJsonObject song = m_queue.at(nextIndex).toObject();
    const QString source = song.value(QStringLiteral("source")).toString();
    const QString platformId = song.value(QStringLiteral("platformId")).toVariant().toString();
    const QString key = playCacheKey(song);
    if (key.isEmpty() || source == QStringLiteral("local")
        || m_pendingPlayPrefetch.contains(key)) return;
    const qint64 cachedAt = m_playUrlCachedAt.value(key);
    if (!m_playUrlCache.value(key).isEmpty()
        && QDateTime::currentMSecsSinceEpoch() - cachedAt < 8 * 60 * 1000) return;

    QUrl url;
    if (source == QStringLiteral("netease")) {
        QUrlQuery query;
        query.addQueryItem(QStringLiteral("id"), platformId);
        query.addQueryItem(QStringLiteral("level"), QStringLiteral("standard"));
        url = localApiUrl(QStringLiteral("/song/url/v1"), query);
    } else if (source == QStringLiteral("qq")) {
        url = QUrl(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
                   + QStringLiteral("/getMusicPlay"));
        QUrlQuery query;
        query.addQueryItem(QStringLiteral("songmid"), platformId);
        query.addQueryItem(QStringLiteral("quality"), QStringLiteral("128"));
        url.setQuery(query);
    } else {
        return;
    }

    m_pendingPlayPrefetch.insert(key);
    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setTransferTimeout(8000);
    const quint64 cacheGeneration = m_playCacheGeneration;
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, song, source, platformId, key, cacheGeneration] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (cacheGeneration != m_playCacheGeneration) return;
        m_pendingPlayPrefetch.remove(key);
        if (!ok || payload.isEmpty()) return;
        const QJsonObject root = QJsonDocument::fromJson(payload).object();
        QString mediaUrl;
        if (source == QStringLiteral("netease")) {
            const QJsonArray data = root.value(QStringLiteral("data")).toArray();
            if (!data.isEmpty()) {
                const QJsonObject media = data.first().toObject();
                const bool vipActive = m_accounts.value(source).toObject()
                                           .value(QStringLiteral("vipActive")).toBool();
                if (vipActive && isShortTrialResponse(media, song)) {
                    appendTrace(QByteArray("player:prefetch-trial-rejected key=") + key.toUtf8());
                    return;
                }
                mediaUrl = media.value(QStringLiteral("url")).toString();
            }
        } else if (source == QStringLiteral("qq")) {
            QJsonObject data = root.value(QStringLiteral("data")).toObject();
            if (data.isEmpty()) data = root.value(QStringLiteral("response")).toObject()
                                           .value(QStringLiteral("data")).toObject();
            mediaUrl = data.value(QStringLiteral("playUrl")).toObject()
                           .value(platformId).toObject().value(QStringLiteral("url")).toString();
            if (mediaUrl.isEmpty()) mediaUrl = data.value(QStringLiteral("url")).toString();
        }
        if (mediaUrl.isEmpty()) return;
        m_playUrlCache.insert(key, mediaUrl);
        m_playUrlCachedAt.insert(key, QDateTime::currentMSecsSinceEpoch());
        appendTrace(QByteArray("player:prefetched key=") + key.toUtf8());
    });
}

void MusicBridge::requestQqPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial, int qualityIndex)
{
    QStringList qualities;
    if (m_settings.value(QStringLiteral("audioQuality")).toString() == QStringLiteral("standard"))
        qualities = {QStringLiteral("128"), QStringLiteral("m4a")};
      else if (m_qqCookie.isEmpty())
          qualities = {QStringLiteral("128"), QStringLiteral("m4a")};
    else
        qualities = {QStringLiteral("320"), QStringLiteral("128"), QStringLiteral("m4a")};
    if (qualityIndex >= qualities.size()) {
        skipUnavailableTrack(song.value("vip").toBool()
            ? QStringLiteral("QQ 音乐提示：该曲需要当前账号的播放权益")
            : QStringLiteral("QQ 音乐未返回可播放音源"));
        return;
    }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getMusicPlay"));
    QUrlQuery params;
    params.addQueryItem("songmid", song.value("platformId").toString());
    params.addQueryItem("quality", qualities.at(qualityIndex));
    url.setQuery(params);
    QNetworkRequest request(url);
    request.setTransferTimeout(12000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, autoplay, song, serial, qualityIndex] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        if (serial != m_playRequestSerial) return;
        QJsonObject data = root.value("data").toObject();
        if (data.isEmpty()) data = root.value("response").toObject().value("data").toObject();
        const QString mid = song.value(QStringLiteral("platformId")).toString();
        QString mediaUrl = data.value("playUrl").toObject().value(mid).toObject().value("url").toString();
        if (mediaUrl.isEmpty()) mediaUrl = data.value("url").toString();
        if (mediaUrl.isEmpty()) {
            requestQqPlayUrl(song, autoplay, serial, qualityIndex + 1);
            return;
        }
        startResolvedPlayback(song, mediaUrl, autoplay, serial);
    });
}

void MusicBridge::requestPlayLevel(const QJsonObject &song, const QStringList &levels,
                                   int levelIndex, bool autoplay, quint64 serial)
{
    if (serial != m_playRequestSerial) return;
    if (levelIndex >= levels.size()) {
        if (!song.value("vip").toBool()) {
            const QString id = song.value("platformId").toString();
            startResolvedPlayback(song,
                QStringLiteral("https://music.163.com/song/media/outer/url?id=") + id + QStringLiteral(".mp3"),
                autoplay, serial);
        } else {
            skipUnavailableTrack(QStringLiteral("无法获取 VIP 音源，请确认网易云会员登录状态"));
        }
        return;
    }

    QUrlQuery query;
    query.addQueryItem("id", song.value("platformId").toString());
    query.addQueryItem("level", levels.at(levelIndex));
    QNetworkRequest request{localApiUrl(QStringLiteral("/song/url/v1"), query)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, song, levels, levelIndex, autoplay, serial] {
        const QByteArray payload = reply->readAll();
        const bool networkOk = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (serial != m_playRequestSerial) return;
        QString mediaUrl;
        QJsonObject media;
        if (networkOk) {
            const QJsonDocument document = QJsonDocument::fromJson(payload);
            const QJsonArray data = document.object().value("data").toArray();
            if (!data.isEmpty()) {
                media = data.first().toObject();
                mediaUrl = media.value(QStringLiteral("url")).toString();
            }
        }
        if (!mediaUrl.isEmpty()) {
            const QString source = song.value(QStringLiteral("source")).toString();
            const bool vipActive = m_accounts.value(source).toObject()
                                       .value(QStringLiteral("vipActive")).toBool();
            if (!vipActive || !isShortTrialResponse(media, song)) {
                startResolvedPlayback(song, mediaUrl, autoplay, serial);
                return;
            }
            appendTrace(QByteArray("player:trial-rejected level=")
                        + levels.at(levelIndex).toUtf8());
        }
        requestPlayLevel(song, levels, levelIndex + 1, autoplay, serial);
    });
}

QJsonArray MusicBridge::parseLrc(const QString &text)
{
    return LyricParser::parseLrc(text);
}

QJsonArray MusicBridge::parseYrc(const QString &text)
{
    return LyricParser::parseYrc(text);
}

QJsonArray MusicBridge::parseQrc(const QString &document)
{
    return LyricParser::parseQrc(document);
}

QString MusicBridge::filterQqLyricLines(const QString &text)
{
    return LyricParser::filterQqLyricLines(text);
}

void MusicBridge::requestLyrics(const QJsonObject &song)
{
    const quint64 serial = ++m_lyricRequestSerial;
    m_lyrics = {};
    emit lyricsChanged();

    if (song.value("source").toString() == "local") {
        const QUrl audioUrl(song.value("audioUrl").toString());
        QFileInfo audioFile(audioUrl.toLocalFile());
        QFile lrc(QDir(audioFile.absolutePath()).filePath(audioFile.completeBaseName() + QStringLiteral(".lrc")));
        m_lyrics = lrc.open(QIODevice::ReadOnly) ? parseLrc(QString::fromUtf8(lrc.readAll())) : QJsonArray{};
        if (serial == m_lyricRequestSerial) emit lyricsChanged();
        return;
    }
    if (song.value("source").toString() == "qq") {
        QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getLyric"));
        QUrlQuery params;
        params.addQueryItem("songmid", song.value("platformId").toString());
        url.setQuery(params);
        auto *reply = m_network.get(QNetworkRequest(url));
        connect(reply, &QNetworkReply::finished, this, [this, reply, serial] {
            const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
            reply->deleteLater();
            if (serial != m_lyricRequestSerial) return;
            QJsonObject lyricData = root.value("response").toObject();
            if (lyricData.isEmpty()) lyricData = root.value("data").toObject();
            if (lyricData.value("lyric").isUndefined()) {
                const QJsonObject nestedData = root.value("response").toObject().value("data").toObject();
                if (!nestedData.isEmpty()) lyricData = nestedData;
            }

            QJsonArray parsed;
            const QJsonValue lyricValue = lyricData.value("lyric");
            if (lyricValue.isString()) {
                const QString lyricPayload = lyricValue.toString();
                parsed = parseQrc(lyricPayload);
                if (parsed.isEmpty())
                    parsed = parseLrc(filterQqLyricLines(lyricPayload));
            } else if (lyricValue.isObject()) {
                // Compatibility with older sidecar builds that may return a
                // pre-parsed { lines: [{ time, txt }] } lyric payload.
                const QJsonArray lines = lyricValue.toObject().value("lines").toArray();
                for (const QJsonValue &lineValue : lines) {
                    const QJsonObject line = lineValue.toObject();
                    const QString text = line.value("txt").toString(line.value("text").toString());
                    if (text.isEmpty()) continue;
                    parsed.append(QJsonObject{
                        {"time", line.value("time").toDouble() / 1000.0},
                        {"text", text}, {"translation", ""}, {"words", QJsonArray()}
                    });
                }
            }

            const QJsonArray translations = parseLrc(lyricData.value("trans").toString());
            for (int i = 0; i < parsed.size(); ++i) {
                QJsonObject line = parsed.at(i).toObject();
                const double at = line.value("time").toDouble();
                for (const QJsonValue &candidateValue : translations) {
                    const QJsonObject candidate = candidateValue.toObject();
                    if (std::abs(candidate.value("time").toDouble() - at) < 0.8) {
                        line.insert("translation", candidate.value("text").toString());
                        break;
                    }
                }
                parsed.replace(i, line);
            }
            m_lyrics = parsed;
            emit lyricsChanged();
        });
        return;
    }
    QUrlQuery query;
    query.addQueryItem("id", song.value("platformId").toString());
    QNetworkRequest request{localApiUrl(QStringLiteral("/lyric/new"), query)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, serial] {
        const auto document = QJsonDocument::fromJson(reply->readAll());
        reply->deleteLater();
        if (serial != m_lyricRequestSerial) return;
        if (!document.isObject()) return;
        const QJsonObject root = document.object();
        const QString yrc = root.value("yrc").toObject().value("lyric").toString();
        const QString lrc = root.value("lrc").toObject().value("lyric").toString();
        const QJsonArray yrcLines = parseYrc(yrc);
        const QJsonArray lrcLines = parseLrc(lrc);
        QJsonArray parsed = LyricParser::preferCompleteLyrics(yrcLines, lrcLines);

        const QJsonArray translations = parseLrc(root.value("tlyric").toObject().value("lyric").toString());
        for (int i = 0; i < parsed.size(); ++i) {
            QJsonObject line = parsed.at(i).toObject();
            const double lineTime = line.value("time").toDouble();
            double closest = 1.5;
            QString translation;
            for (const auto &candidateValue : translations) {
                const QJsonObject candidate = candidateValue.toObject();
                const double delta = std::abs(candidate.value("time").toDouble() - lineTime);
                if (delta < closest) { closest = delta; translation = candidate.value("text").toString(); }
            }
            if (!translation.isEmpty()) line.insert("translation", translation);
            parsed.replace(i, line);
        }
        m_lyrics = parsed;
        emit lyricsChanged();
    });
}

void MusicBridge::toggle_play() { if (isPlaying()) m_player.pause(); else if (!m_current.isEmpty()) m_player.play(); else if (!m_queue.isEmpty()) setCurrentIndex(0); }
void MusicBridge::seek(int milliseconds) { m_player.setPosition(std::max(0, milliseconds)); }
void MusicBridge::next() { if (m_queue.isEmpty()) return; int index = m_currentIndex < 0 ? 0 : m_shuffle ? QRandomGenerator::global()->bounded(m_queue.size()) : (m_currentIndex + 1 >= m_queue.size() ? (m_repeatMode == QStringLiteral("all") ? 0 : m_currentIndex) : m_currentIndex + 1); setCurrentIndex(index); }
void MusicBridge::prev() { if (m_queue.isEmpty()) return; int index = m_currentIndex <= 0 ? m_queue.size() - 1 : m_currentIndex - 1; setCurrentIndex(index); }
void MusicBridge::remove_queue_index(int index)
{
    if (index < 0 || index >= m_queue.size()) return;
    m_queue.removeAt(index);
    // 删除后按当前歌曲 id 重新定位索引，避免索引错位
    // 以 songId 过滤后重新 findIndex，这里复刻同一语义，避免删除当前播放
    // 项之前的条目时 m_currentIndex 漂移导致下一首/上一首错位。
    const QString currentId = m_current.value("id").toString();
    int newIndex = -1;
    for (int i = 0; i < m_queue.size(); ++i) {
        if (m_queue.at(i).toObject().value("id").toString() == currentId) {
            newIndex = i;
            break;
        }
    }
    m_currentIndex = newIndex < 0 ? (m_queue.isEmpty() ? -1 : 0) : newIndex;
    emit queueChanged();
}
void MusicBridge::clear_queue() { m_queue = {}; m_current = {}; m_currentIndex = -1; m_player.stop(); emit queueChanged(); emit currentSongChanged(); }
void MusicBridge::toggle_repeat() { if (m_repeatMode == QStringLiteral("off")) m_repeatMode = QStringLiteral("all"); else if (m_repeatMode == QStringLiteral("all")) m_repeatMode = QStringLiteral("one"); else m_repeatMode = QStringLiteral("off"); saveLegacyStorage(); emit repeatModeChanged(m_repeatMode); }
void MusicBridge::toggle_shuffle() { m_shuffle = !m_shuffle; saveLegacyStorage(); emit shuffleChanged(m_shuffle); }
void MusicBridge::set_volume(int value)
{
    m_volume = std::clamp(value, 0, 100);
    if (m_volume > 0) m_volumeBeforeMute = m_volume;
    if (m_muted && m_volume > 0) {
        m_muted = false;
        m_audio.setMuted(false);
        emit mutedChanged(false);
    }
    m_audio.setVolume(m_volume / 100.0);
    saveLegacyStorage();
    emit volumeChanged(m_volume);
}
void MusicBridge::toggle_mute()
{
    if (!m_muted && m_volume > 0) m_volumeBeforeMute = m_volume;
    m_muted = !m_muted;
    m_audio.setMuted(m_muted);
    saveLegacyStorage();
    emit mutedChanged(m_muted);
}
void MusicBridge::set_setting(const QString &key, bool value) { m_settings.insert(key, value); saveSettings(); emit settingsChanged(); }
void MusicBridge::set_setting_value(const QString &key, const QVariant &value)
{
    m_settings.insert(key, QJsonValue::fromVariant(value));
    saveSettings();
    emit settingsChanged();
}
void MusicBridge::set_audio_quality(const QString &quality)
{
    if (m_settings.value(QStringLiteral("audioQuality")).toString() == quality) return;
    m_settings.insert(QStringLiteral("audioQuality"), quality);
    invalidatePlayUrlCache();
    saveSettings();
    emit settingsChanged();
}
void MusicBridge::set_lyric_offset(int milliseconds)
{
    const int clamped = std::clamp(milliseconds, -2000, 2000);
    if (m_lyricOffset == clamped) return;
    m_lyricOffset = clamped;
    emit lyricOffsetChanged(m_lyricOffset);
    // 立即重算 activeIndex，让全屏/桌面歌词行随偏移即时跳动。
    emit positionChanged(positionMs());
}
void MusicBridge::saveSettings() { saveLegacyStorage(); }
void MusicBridge::setBusy(bool busy)
{
    if (m_busy == busy) return;
    m_busy = busy;
    emit busyChanged();
}

void MusicBridge::setLastError(const QString &message)
{
    if (m_lastError == message) return;
    m_lastError = message;
    emit lastErrorChanged();
}

int MusicBridge::compareVersions(const QString &left, const QString &right)
{
    const auto parts = [](QString value) {
        value.remove(QRegularExpression(QStringLiteral("^[vV]")));
        QList<int> result;
        for (const QString &part : value.split(QLatin1Char('.')))
            result << QRegularExpression(QStringLiteral("^(\\d+)")).match(part).captured(1).toInt();
        return result;
    };
    const QList<int> a = parts(left);
    const QList<int> b = parts(right);
    const int count = std::max(a.size(), b.size());
    for (int i = 0; i < count; ++i) {
        const int av = i < a.size() ? a.at(i) : 0;
        const int bv = i < b.size() ? b.at(i) : 0;
        if (av != bv) return av > bv ? 1 : -1;
    }
    return 0;
}

void MusicBridge::check_for_updates()
{
    checkForUpdates(false);
}

void MusicBridge::checkForUpdates(bool silent)
{
    setBusy(true);
    setLastError({});
    QNetworkRequest request{QUrl(QStringLiteral("https://api.github.com/repos/RubenCampoa/Beta-music-player/releases/latest"))};
    request.setRawHeader("User-Agent", "BetaMusicPlayerQt/" BETA_APP_VERSION);
    request.setRawHeader("Accept", "application/vnd.github+json");
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, silent] {
        setBusy(false);
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QByteArray payload = reply->readAll();
        const auto error = reply->error();
        reply->deleteLater();
        // 自动检查（启动时）静默失败，只有手动点击“检查更新”才提示错误，
        // 避免 GitHub API 限流时每次启动都弹出打扰性提示。
        const auto fail = [this, silent](const QString &message) {
            setLastError(message);
            if (!silent)
                show_toast(message);
        };
        if (status == 403 || status == 429) {
            fail(QStringLiteral("GitHub API 请求受限，请稍后重试"));
            return;
        }
        if (error != QNetworkReply::NoError) {
            fail(QStringLiteral("无法连接更新服务器"));
            return;
        }
        const QJsonObject release = QJsonDocument::fromJson(payload).object();
        const QString tag = release.value(QStringLiteral("tag_name")).toString();
        if (tag.isEmpty()) {
            fail(QStringLiteral("更新服务器没有可用版本信息"));
            return;
        }
        if (compareVersions(tag, QStringLiteral(BETA_APP_VERSION)) > 0) {
            show_toast(QStringLiteral("发现新版本 %1，正在打开发布页面").arg(tag));
            QDesktopServices::openUrl(QUrl(QStringLiteral(
                "https://github.com/RubenCampoa/Beta-music-player/releases/latest")));
        } else if (!silent) {
            show_toast(QStringLiteral("当前已经是最新版本 (v%1)").arg(QStringLiteral(BETA_APP_VERSION)));
        }
    });
}

void MusicBridge::clear_cache()
{
    const QString cacheRoot = QDir(QStandardPaths::writableLocation(QStandardPaths::CacheLocation))
                                  .filePath(QStringLiteral("BetaMusicPlayerQt"));
    QDir target(cacheRoot);
    const bool removed = !target.exists() || target.removeRecursively();
    if (removed) {
        m_pendingCoverDownloads.clear();
        m_pendingAvatarDownloads.clear();
        m_playlistCache.clear();
        show_toast(QStringLiteral("缓存已清理，账号、收藏和本地资料库均已保留"));
    } else {
        setLastError(QStringLiteral("部分缓存正在使用，请重启应用后重试"));
        show_toast(m_lastError);
    }
}

void MusicBridge::apply_performance_preset()
{
    m_settings.insert(QStringLiteral("fluidBackground"), true);
    m_settings.insert(QStringLiteral("smoothAnimations"), true);
    m_settings.insert(QStringLiteral("lyricAnimation"), false);
    m_settings.insert(QStringLiteral("lyricGlow"), false);
    m_settings.insert(QStringLiteral("lyricBlur"), false);
    m_settings.insert(QStringLiteral("artworkAnimation"), false);
    m_settings.insert(QStringLiteral("enableKaraoke"), false);
    saveSettings();
    emit settingsChanged();
    show_toast(QStringLiteral("已应用性能优化预设"));
}
void MusicBridge::toggle_queue_drawer() { m_queueDrawerOpen = !m_queueDrawerOpen; emit queueDrawerChanged(m_queueDrawerOpen); }
void MusicBridge::toggle_login_modal()
{
    m_loginModalOpen = !m_loginModalOpen;
    emit loginModalChanged(m_loginModalOpen);
    if (m_loginModalOpen) begin_login(m_platform == "local" ? QStringLiteral("netease") : m_platform);
    else m_loginTimer.stop();
}

void MusicBridge::begin_login(const QString &platform)
{
    m_loginTimer.stop();
    m_loginPlatform = platform;
    m_loginQrImage.clear();
    if (platform == "qq") {
        m_loginStatus = QStringLiteral("正在生成 QQ 音乐扫码登录二维码");
        emit loginStateChanged();
        requestQqLoginQr();
        return;
    }
    if (platform != "netease") {
        m_loginStatus = QStringLiteral("登录接口仍在迁移");
        emit loginStateChanged();
        return;
    }
    m_loginStatus = QStringLiteral("正在生成二维码…");
    emit loginStateChanged();
    requestLoginQrKey();
}

void MusicBridge::requestLoginQrKey()
{
    QNetworkRequest request{localApiUrl(QStringLiteral("/login/qr/key"))};
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        reply->deleteLater();
        m_loginQrKey = doc.object().value("data").toObject().value("unikey").toString();
        if (m_loginQrKey.isEmpty()) {
            m_loginStatus = QStringLiteral("二维码生成失败，请检查本地 API 服务");
            emit loginStateChanged();
            return;
        }
        requestLoginQrImage(m_loginQrKey);
    });
}

void MusicBridge::requestLoginQrImage(const QString &key)
{
    QUrlQuery query; query.addQueryItem("key", key); query.addQueryItem("qrimg", "true");
    QNetworkRequest request{localApiUrl(QStringLiteral("/login/qr/create"), query)};
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        reply->deleteLater();
        m_loginQrImage = doc.object().value("data").toObject().value("qrimg").toString();
        if (m_loginQrImage.isEmpty()) {
            m_loginStatus = QStringLiteral("二维码图片生成失败，请点击刷新");
        } else {
            m_loginStatus = QStringLiteral("请使用网易云音乐 App 扫码登录");
            m_loginTimer.start();
        }
        emit loginStateChanged();
    });
}

void MusicBridge::pollLoginQr()
{
    if (m_loginQrKey.isEmpty()) return;
    if (m_loginPlatform == "qq") {
        const QJsonObject state = QJsonDocument::fromJson(m_loginQrKey.toUtf8()).object();
        const QString qrsig = state.value("qrsig").toString();
        const QString token = state.value("ptqrtoken").toString();
        if (qrsig.isEmpty()) return;
        QNetworkRequest request{QUrl(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/checkQQLoginQr"))};
        request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        const QByteArray body = QJsonDocument(QJsonObject{{"qrsig", qrsig}, {"ptqrtoken", token}}).toJson(QJsonDocument::Compact);
        auto *reply = m_network.post(request, body);
        connect(reply, &QNetworkReply::finished, this, [this, reply] {
            const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
            reply->deleteLater();
            if (!root.value("isOk").toBool()) {
                const QString message = root.value("message").toString();
                if (!message.isEmpty()) { m_loginStatus = message; emit loginStateChanged(); }
                return;
            }
            const QString cookie = root.value("session").toObject().value("cookie").toString(root.value("cookie").toString());
            if (cookie.isEmpty()) { m_loginStatus = QStringLiteral("QQ 登录成功但未收到会话 Cookie"); emit loginStateChanged(); return; }
            m_loginTimer.stop();
            m_qqCookie = cookie;
            refreshSidecarCookies();
            invalidatePlayUrlCache();
            requestQqAccount();
        });
        return;
    }
    if (m_loginPlatform != "netease") return;
    QUrlQuery query; query.addQueryItem("key", m_loginQrKey);
    QNetworkRequest request{localApiUrl(QStringLiteral("/login/qr/check"), query)};
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        const int code = root.value("code").toInt();
        if (code == 803) {
            m_loginTimer.stop();
            completeNeteaseLogin(root.value("cookie").toString());
        } else if (code == 800) {
            m_loginTimer.stop();
            m_loginStatus = QStringLiteral("二维码已失效，请点击刷新");
            emit loginStateChanged();
        } else if (code == 802) {
            m_loginStatus = QStringLiteral("扫码成功，请在手机上确认"); emit loginStateChanged();
        }
    });
}

void MusicBridge::requestQqLoginQr()
{
    auto *reply = m_network.get(QNetworkRequest(QUrl(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/getQQLoginQr"))));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        const QJsonObject data = root.value("response").toObject().isEmpty()
            ? root : root.value("response").toObject();
        const QString image = data.value("img").toString();
        const QString qrsig = data.value("qrsig").toString();
        const QString token = data.value("ptqrtoken").toString();
        if (image.isEmpty() || qrsig.isEmpty()) {
            m_loginStatus = QStringLiteral("QQ 登录二维码生成失败，请确认本地 QQ API 服务已启动");
            emit loginStateChanged();
            return;
        }
        m_loginQrImage = image;
        m_loginQrKey = QString::fromUtf8(QJsonDocument(QJsonObject{{"qrsig", qrsig}, {"ptqrtoken", token}}).toJson(QJsonDocument::Compact));
        m_loginStatus = QStringLiteral("请使用 QQ 音乐或 QQ 扫描二维码确认登录");
        m_loginTimer.start();
        emit loginStateChanged();
    });
}

void MusicBridge::requestQqAccount()
{
    const QRegularExpression uinPattern(QStringLiteral("(?:^|;\\s*)(?:uin|p_uin)=o?(\\d+)"));
    const auto match = uinPattern.match(m_qqCookie);
    const QString uin = match.captured(1);
    if (uin.isEmpty()) { m_loginStatus = QStringLiteral("QQ 登录会话中没有有效 UIN"); emit loginStateChanged(); return; }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/getUserDetail"));
    QUrlQuery query;
    query.addQueryItem("uin", uin);
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, uin] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        QJsonObject data = root.value("response").toObject().value("data").toObject();
        if (data.isEmpty()) data = root.value("data").toObject();
        const QJsonObject profile = data.value("creator").toObject().isEmpty()
            ? data.value("userinfo").toObject() : data.value("creator").toObject();
        QString avatar = profile.value("avatarUrl").toString(profile.value("headimg").toString());
        if (avatar.isEmpty()) avatar = QStringLiteral("https://q.qlogo.cn/headimg_dl?dst_uin=") + uin + QStringLiteral("&spec=640");
        QJsonObject account{{"userId", uin},
            {"nickname", profile.value("nick").toString(profile.value("nickname").toString(QStringLiteral("QQ用户") + uin.right(4)))},
            {"avatarUrl", highResolutionCover(avatar, "qq")}, {"platform", "qq"}};
        m_accounts.insert("qq", account);
        cacheAvatar(account.value("avatarUrl").toString(), QStringLiteral("qq"));
        emit accountChanged();
        requestQqVipInfo();
        requestQqUserPlaylists(uin);
    });
}

void MusicBridge::requestQqVipInfo()
{
    if (m_qqCookie.isEmpty()) return;
    const QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
                   + QStringLiteral("/user/getVipInfo"));
    QNetworkRequest request(url);
    request.setTransferTimeout(12000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (!ok || m_qqCookie.isEmpty()) return;

        const QJsonObject root = QJsonDocument::fromJson(payload).object();
        QJsonObject data = root.value(QStringLiteral("response")).toObject()
                               .value(QStringLiteral("req_1")).toObject()
                               .value(QStringLiteral("data")).toObject();
        if (data.isEmpty())
            data = root.value(QStringLiteral("response")).toObject()
                       .value(QStringLiteral("data")).toObject();
        if (data.isEmpty()) return;

        const QJsonObject identity = data.value(QStringLiteral("identity")).toObject();
        const bool hugeVip = jsonPositive(identity.value(QStringLiteral("HugeVip")));
        const bool luxuryVip = jsonPositive(data.value(QStringLiteral("svip")));
        const bool greenVip = jsonPositive(identity.value(QStringLiteral("vip")));
        const bool groupVip = jsonPositive(identity.value(QStringLiteral("GroupVipFlag")));
        const bool active = hugeVip || luxuryVip || greenVip || groupVip;
        QString label = QStringLiteral("普通用户");
        if (hugeVip) label = QStringLiteral("超级会员");
        else if (luxuryVip) label = QStringLiteral("豪华绿钻");
        else if (greenVip) label = QStringLiteral("绿钻会员");
        else if (groupVip) label = QStringLiteral("团体会员");

        const int level = active ? jsonInteger(identity.value(QStringLiteral("level"))) : 0;
        if (active && level > 0) label += QStringLiteral(" Lv.%1").arg(level);
        const QDate expiry = latestQqExpiry(identity, data);
        const QString expiryText = active && expiry.isValid()
            ? expiry.toString(QStringLiteral("yyyy-MM-dd")) : QString();

        QJsonObject account = m_accounts.value(QStringLiteral("qq")).toObject();
        if (account.isEmpty()) return;
        account.insert(QStringLiteral("vipActive"), active);
        account.insert(QStringLiteral("vipLabel"), label);
        account.insert(QStringLiteral("vipLevel"), level);
        account.insert(QStringLiteral("vipExpireDate"), expiryText);
        m_accounts.insert(QStringLiteral("qq"), account);
        saveLegacyStorage();
        emit accountChanged();
    });
}

void MusicBridge::requestQqUserPlaylists(const QString &uin)
{
    requestQqCreatedPlaylists(uin);
}

void MusicBridge::requestQqCreatedPlaylists(const QString &uin)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/getUserPlaylists"));
    QUrlQuery query;
    query.addQueryItem("uin", uin);
    query.addQueryItem("offset", "0");
    query.addQueryItem("limit", "50");
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, uin] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        QJsonObject data = root.value("response").toObject().value("data").toObject();
        if (data.isEmpty()) data = root.value("data").toObject();
        QJsonArray raw = data.value("playlists").toArray();
        if (raw.isEmpty()) raw = data.value("list").toArray();
        if (raw.isEmpty()) raw = data.value("vecSongList").toArray();
        if (raw.isEmpty()) raw = data.value("diss_list").toArray();
        if (raw.isEmpty()) raw = findFirstPlaylistArrayInJson(root);
        QJsonArray created;
        for (const QJsonValue &value : raw) {
            const QJsonObject playlist = qqPlaylistFromJson(value.toObject());
            if (!playlist.isEmpty()) created.append(playlist);
        }
        requestQqLikedPlaylist(uin, created);
    });
}

void MusicBridge::requestQqLikedPlaylist(const QString &uin, const QJsonArray &createdPlaylists)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
             + QStringLiteral("/user/getUserLikedSongs"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("uin"), uin);
    query.addQueryItem(QStringLiteral("offset"), QStringLiteral("0"));
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("50"));
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, uin, createdPlaylists] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        QJsonArray merged = createdPlaylists;
        QJsonObject data = root.value(QStringLiteral("response")).toObject()
                               .value(QStringLiteral("data")).toObject();
        if (data.isEmpty()) data = root.value(QStringLiteral("data")).toObject();
        QJsonObject likedInfo = data.value(QStringLiteral("info")).toObject();
        if (likedInfo.isEmpty()) {
            const QJsonArray songs = data.value(QStringLiteral("songs")).toArray();
            if (!songs.isEmpty()) likedInfo = songs.first().toObject();
        }
        if (!likedInfo.isEmpty()) {
            if (!likedInfo.contains(QStringLiteral("dissid")))
                likedInfo.insert(QStringLiteral("dissid"), likedInfo.value(QStringLiteral("id")));
            if (!likedInfo.contains(QStringLiteral("dissname")))
                likedInfo.insert(QStringLiteral("dissname"), likedInfo.value(QStringLiteral("title")));
            if (!likedInfo.contains(QStringLiteral("songnum")))
                likedInfo.insert(QStringLiteral("songnum"), likedInfo.value(QStringLiteral("songCount")));
            const QJsonObject playlist = qqPlaylistFromJson(likedInfo);
            bool duplicate = false;
            for (const QJsonValue &value : std::as_const(merged)) {
                if (value.toObject().value(QStringLiteral("id")) == playlist.value(QStringLiteral("id"))) {
                    duplicate = true;
                    break;
                }
            }
            if (!playlist.isEmpty() && !duplicate) merged.prepend(playlist);
        }
        requestQqCollectedPlaylists(uin, merged);
    });
}

void MusicBridge::requestQqCollectedPlaylists(const QString &uin, const QJsonArray &createdPlaylists)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/getUserCollectedSongLists"));
    QUrlQuery query;
    query.addQueryItem("uin", uin);
    query.addQueryItem("page", "1");
    query.addQueryItem("limit", "50");
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, createdPlaylists] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();

        QJsonArray raw;
        QJsonObject response = root.value("response").toObject();
        if (response.isEmpty()) response = root;
        const QJsonObject data = response.value("data").toObject();
        raw = data.value("vecSongList").toArray();
        if (raw.isEmpty()) raw = data.value("vecDiss").toArray();
        if (raw.isEmpty()) raw = data.value("songlist").toArray();
        if (raw.isEmpty()) raw = data.value("list").toArray();
        if (raw.isEmpty()) raw = data.value("playlists").toArray();
        if (raw.isEmpty()) raw = response.value("vecSongList").toArray();
        if (raw.isEmpty()) raw = response.value("vecDiss").toArray();
        if (raw.isEmpty()) raw = response.value("songlist").toArray();
        if (raw.isEmpty()) raw = response.value("list").toArray();
        if (raw.isEmpty()) raw = findFirstPlaylistArrayInJson(root);

        QJsonArray collected;
        for (const QJsonValue &value : raw) {
            const QJsonObject playlist = qqPlaylistFromJson(value.toObject());
            if (!playlist.isEmpty()) collected.append(playlist);
        }

        QJsonArray merged = createdPlaylists;
        QSet<QString> seen;
        for (const QJsonValue &value : merged) {
            seen.insert(value.toObject().value("id").toString());
        }
        for (const QJsonValue &value : collected) {
            const QString qqId = value.toObject().value("id").toString();
              const QString id = qqId;
            if (id.isEmpty() || seen.contains(id)) continue;
            seen.insert(id);
            merged.append(value);
        }

        // 两个只读上游偶发 502 时保留上次已同步的数据，避免一次刷新把
        // 用户侧边栏清空；任一接口成功返回歌单时再替换缓存。
        if (merged.isEmpty())
            merged = m_userPlaylistsByPlatform.value(QStringLiteral("qq")).toArray();
        m_userPlaylists = merged;
        m_userPlaylistsByPlatform.insert("qq", merged);
        saveLegacyStorage();
        emit userPlaylistsChanged();
        m_loginStatus = QStringLiteral("QQ 音乐登录成功");
        emit loginStateChanged();
        if (m_loginModalOpen) { m_loginModalOpen = false; emit loginModalChanged(false); }
        show_toast(QStringLiteral("QQ 音乐账号已同步"));
    });
}

void MusicBridge::set_qq_cookie(const QString &cookie)
{
    const QString trimmed = cookie.trimmed();
    if (trimmed.isEmpty()) { show_toast(QStringLiteral("Cookie 不能为空")); return; }
    m_qqCookie = trimmed;
    refreshSidecarCookies();
    invalidatePlayUrlCache();
    saveLegacyStorage();
    m_loginStatus = QStringLiteral("QQ 音乐 Cookie 已绑定，正在获取账号信息…");
    emit loginStateChanged();
    requestQqAccount();
}

void MusicBridge::completeNeteaseLogin(const QString &cookie)
{
    if (cookie.isEmpty()) return;
    m_cookie = cookie;
    refreshSidecarCookies();
    invalidatePlayUrlCache();
    requestNeteaseAccount();
}

void MusicBridge::requestNeteaseAccount()
{
    QNetworkRequest request{localApiUrl(QStringLiteral("/user/account"))};
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject profile = QJsonDocument::fromJson(reply->readAll()).object().value("profile").toObject();
        reply->deleteLater();
        const QString userId = QString::number(profile.value("userId").toInteger());
        if (userId == "0") {
            m_loginStatus = QStringLiteral("登录凭据未通过校验，请重新登录"); emit loginStateChanged(); return;
        }
        QJsonObject account{{"userId", userId}, {"nickname", profile.value("nickname")},
                            {"avatarUrl", highResolutionCover(profile.value("avatarUrl").toString(), "netease")},
                            {"platform", "netease"}};
        m_accounts.insert("netease", account);
        cacheAvatar(account.value("avatarUrl").toString(), QStringLiteral("netease"));
        emit accountChanged();
        requestNeteaseVipInfo(userId);
        requestUserPlaylists(userId);
    });
}

void MusicBridge::requestNeteaseVipInfo(const QString &userId)
{
    if (m_cookie.isEmpty() || userId.isEmpty()) return;
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("uid"), userId);
    QNetworkRequest request{localApiUrl(QStringLiteral("/vip/info/v2"), query)};
    request.setTransferTimeout(12000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (!ok || m_cookie.isEmpty()) return;

        const QJsonObject root = QJsonDocument::fromJson(payload).object();
        const QJsonObject data = root.value(QStringLiteral("data")).toObject();
        if (data.isEmpty()) return;
        const QJsonObject redplus = data.value(QStringLiteral("redplus")).toObject();
        const QJsonObject associator = data.value(QStringLiteral("associator")).toObject();
        const QJsonObject musicPackage = data.value(QStringLiteral("musicPackage")).toObject();
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        const qint64 redplusExpiry = jsonInt64(redplus.value(QStringLiteral("expireTime")));
        const qint64 associatorExpiry = jsonInt64(associator.value(QStringLiteral("expireTime")));
        const qint64 packageExpiry = jsonInt64(musicPackage.value(QStringLiteral("expireTime")));
        const bool redplusActive = jsonInteger(redplus.value(QStringLiteral("vipLevel"))) > 0
            && redplusExpiry > now;
        const bool associatorActive = jsonInteger(associator.value(QStringLiteral("vipLevel"))) > 0
            && associatorExpiry > now;
        const bool packageActive = jsonInteger(musicPackage.value(QStringLiteral("vipLevel"))) > 0
            && packageExpiry > now;
        const bool active = redplusActive || associatorActive || packageActive;
        const int level = active ? jsonInteger(data.value(QStringLiteral("redVipLevel")),
            std::max({jsonInteger(redplus.value(QStringLiteral("vipLevel"))),
                      jsonInteger(associator.value(QStringLiteral("vipLevel"))),
                      jsonInteger(musicPackage.value(QStringLiteral("vipLevel"))) })) : 0;
        QString label = QStringLiteral("普通用户");
        if (redplusActive) label = QStringLiteral("黑胶 SVIP");
        else if (associatorActive) label = QStringLiteral("黑胶 VIP");
        else if (packageActive) label = QStringLiteral("音乐包会员");
        if (active && level > 0) label += QStringLiteral(" Lv.%1").arg(level);
        const qint64 expiry = std::max({redplusActive ? redplusExpiry : 0,
                                        associatorActive ? associatorExpiry : 0,
                                        packageActive ? packageExpiry : 0});

        QJsonObject account = m_accounts.value(QStringLiteral("netease")).toObject();
        if (account.isEmpty()) return;
        account.insert(QStringLiteral("vipActive"), active);
        account.insert(QStringLiteral("vipLabel"), label);
        account.insert(QStringLiteral("vipLevel"), level);
        account.insert(QStringLiteral("vipExpireDate"), expiryDateText(expiry));
        m_accounts.insert(QStringLiteral("netease"), account);
        saveLegacyStorage();
        emit accountChanged();
    });
}

void MusicBridge::requestUserPlaylists(const QString &userId)
{
    QUrlQuery query; query.addQueryItem("uid", userId); query.addQueryItem("limit", "50");
    QNetworkRequest request{localApiUrl(QStringLiteral("/user/playlist"), query)};
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, userId] {
        const QJsonArray raw = QJsonDocument::fromJson(reply->readAll()).object().value("playlist").toArray();
        reply->deleteLater();
        QJsonArray playlists;
        for (const QJsonValue &value : raw) {
            const QJsonObject item = value.toObject();
            playlists.append(QJsonObject{{"id", QString::number(item.value("id").toInteger())},
                {"name", item.value("name")}, {"cover", highResolutionCover(item.value("coverImgUrl").toString(), "netease")},
                {"trackCount", item.value("trackCount")}, {"source", "netease"}});
        }
        m_userPlaylists = playlists;
        m_userPlaylistsByPlatform.insert("netease", playlists);
        saveLegacyStorage();
        emit userPlaylistsChanged();
        m_loginStatus = QStringLiteral("登录成功"); emit loginStateChanged();
        if (m_loginModalOpen) { m_loginModalOpen = false; emit loginModalChanged(false); }
        show_toast(QStringLiteral("网易云音乐登录成功"));

        // 同步用户喜欢的歌曲 ID 列表
        QUrlQuery likeQuery; likeQuery.addQueryItem("uid", userId);
        auto *likeReply = m_network.get(QNetworkRequest(localApiUrl(QStringLiteral("/likelist"), likeQuery)));
        connect(likeReply, &QNetworkReply::finished, this, [this, likeReply] {
            const QJsonObject doc = QJsonDocument::fromJson(likeReply->readAll()).object();
            likeReply->deleteLater();
            const QJsonArray ids = doc.value("ids").toArray();
            for (const auto &idVal : ids) {
                const QString numId = QString::number(idVal.toInteger());
                const QString fullId = QStringLiteral("netease-") + numId;
                if (!m_favorites.contains(fullId)) {
                    m_favorites.insert(fullId, QJsonObject{
                        {"id", fullId},
                        {"platformId", numId},
                        {"source", "netease"},
                        {"isLiked", true}
                    });
                }
            }
            applyFavoriteStates(m_songs);
            applyFavoriteStates(m_queue);
            if (songIsFavorite(m_current)) {
                m_current.insert(QStringLiteral("isLiked"), true);
                emit currentSongChanged();
            }
            saveLegacyStorage();
            emit favoritesChanged();
            emit songsChanged();
            emit queueChanged();
        });
    });
}

void MusicBridge::refresh_login_qr() { begin_login(m_loginPlatform); }
void MusicBridge::login_via_web(const QString &platform)
{
    if (platform != QStringLiteral("netease") && platform != QStringLiteral("qq")) return;
    const QString name = platform == QStringLiteral("qq") ? QStringLiteral("QQ 音乐")
                                                           : QStringLiteral("网易云音乐");
    show_toast(QStringLiteral("已打开 %1 官方网页登录窗口").arg(name));
    emit webLoginRequested(platform);
}

void MusicBridge::complete_web_login(const QString &platform, const QString &cookie)
{
    if (cookie.trimmed().isEmpty()) {
        setLastError(QStringLiteral("网页登录未捕获到有效登录凭据"));
        show_toast(m_lastError);
        return;
    }
    if (platform == QStringLiteral("netease")) {
        completeNeteaseLogin(cookie);
    } else if (platform == QStringLiteral("qq")) {
        set_qq_cookie(cookie);
    }
    show_toast(QStringLiteral("网页登录凭据已保存，正在同步账号资料"));
}
void MusicBridge::open_user_playlist(int index)
{
    if (index < 0 || index >= m_userPlaylists.size()) return;
    requestPlaylistDetail(m_userPlaylists.at(index).toObject());
}

void MusicBridge::open_home_playlist(int index)
{
    if (index < 0 || index >= m_homePlaylists.size()) return;
    requestPlaylistDetail(m_homePlaylists.at(index).toObject());
}

void MusicBridge::open_daily_playlist()
{
    if (m_songs.isEmpty()) return;
    m_playlistDetail = {
        {QStringLiteral("name"), m_platform == QStringLiteral("netease") ? QStringLiteral("每日推荐")
                                                                          : QStringLiteral("平台每日推荐")},
        {QStringLiteral("description"), QStringLiteral("从你的听歌轨迹中精选的每日推荐歌曲")},
        {QStringLiteral("cover"), m_songs.first().toObject().value(QStringLiteral("cover")).toString()},
        {QStringLiteral("source"), m_platform},
        {QStringLiteral("count"), m_songs.size()}
    };
    m_queue = m_songs;
    emit playlistDetailChanged();
    emit queueChanged();
    set_view_mode(QStringLiteral("playlist_detail"));
}

QString MusicBridge::playlistCacheKey(const QJsonObject &playlist) const
{
    const QString source = playlist.value(QStringLiteral("source")).toString(m_platform);
    return source + QLatin1Char(':') + playlist.value(QStringLiteral("id")).toVariant().toString();
}

qint64 MusicBridge::restorePlaylistCache(const QJsonObject &playlist)
{
    if (playlist.value(QStringLiteral("_home")).toBool()) return -1;
    const QString key = playlistCacheKey(playlist);
    if (key.endsWith(QLatin1Char(':'))) return -1;

    QJsonObject cached = m_playlistCache.value(key);
    if (cached.isEmpty()) {
        const QString digest = QString::fromLatin1(
            QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256).toHex());
        const QString cachePath = QDir(QStandardPaths::writableLocation(QStandardPaths::CacheLocation))
                                      .filePath(QStringLiteral("BetaMusicPlayerQt/playlists/")
                                                + digest + QStringLiteral(".json"));
        QFile file(cachePath);
        if (file.open(QIODevice::ReadOnly))
            cached = QJsonDocument::fromJson(file.readAll()).object();
        if (cached.value(QStringLiteral("key")).toString() != key)
            cached = {};
        if (!cached.isEmpty()) m_playlistCache.insert(key, cached);
    }

    const QJsonObject detail = cached.value(QStringLiteral("detail")).toObject();
    const QJsonArray songs = cached.value(QStringLiteral("songs")).toArray();
    if (detail.isEmpty() || songs.isEmpty()) return -1;

    m_playlistDetail = detail;
    setSongs(songs);
    emit playlistDetailChanged();
    set_view_mode(QStringLiteral("playlist_detail"));
    return cached.value(QStringLiteral("savedAt")).toVariant().toLongLong();
}

void MusicBridge::storePlaylistCache(const QJsonObject &playlist, const QJsonObject &detail,
                                     const QJsonArray &songs)
{
    if (playlist.value(QStringLiteral("_home")).toBool() || detail.isEmpty() || songs.isEmpty()) return;
    const QString key = playlistCacheKey(playlist);
    if (key.endsWith(QLatin1Char(':'))) return;
    const QJsonObject cached{
        {QStringLiteral("key"), key},
        {QStringLiteral("savedAt"), QDateTime::currentMSecsSinceEpoch()},
        {QStringLiteral("detail"), detail},
        {QStringLiteral("songs"), songs}
    };
    m_playlistCache.insert(key, cached);

    const QString digest = QString::fromLatin1(
        QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256).toHex());
    const QString directory = QDir(QStandardPaths::writableLocation(QStandardPaths::CacheLocation))
                                  .filePath(QStringLiteral("BetaMusicPlayerQt/playlists"));
    QDir().mkpath(directory);
    QSaveFile file(QDir(directory).filePath(digest + QStringLiteral(".json")));
    if (file.open(QIODevice::WriteOnly)) {
        file.write(QJsonDocument(cached).toJson(QJsonDocument::Compact));
        file.commit();
    }
}

void MusicBridge::requestPlaylistDetail(const QJsonObject &playlistSummary)
{
    const bool homeRequest = playlistSummary.value(QStringLiteral("_home")).toBool();
    const QString requestKey = playlistCacheKey(playlistSummary);
    const quint64 requestSerial = homeRequest ? 0 : ++m_playlistRequestSerial;
    if (!homeRequest) {
        m_activePlaylistKey = requestKey;
        const qint64 savedAt = restorePlaylistCache(playlistSummary);
        const bool hasCache = savedAt >= 0;
        if (!hasCache) {
            m_playlistDetail = {
                {QStringLiteral("name"), playlistSummary.value(QStringLiteral("name")).toString()},
                {QStringLiteral("description"), playlistSummary.value(QStringLiteral("description")).toString()},
                {QStringLiteral("cover"), playlistSummary.value(QStringLiteral("cover")).toString()},
                {QStringLiteral("source"), playlistSummary.value(QStringLiteral("source")).toString(m_platform)},
                {QStringLiteral("count"), 0}
            };
            m_songs = {};
            m_queue = {};
            emit songsChanged();
            emit queueChanged();
            emit playlistDetailChanged();
            set_view_mode(QStringLiteral("playlist_detail"));
            setBusy(true);
        }
        // A recently fetched playlist is complete enough to reuse directly.
        // Older cache remains visible while a silent background refresh runs.
        if (hasCache && QDateTime::currentMSecsSinceEpoch() - savedAt < 15 * 60 * 1000)
            return;
    }
    const QString source = playlistSummary.value(QStringLiteral("source")).toString(m_platform);
    if (source == QStringLiteral("qq")) { requestQqPlaylistDetail(playlistSummary); return; }
    if (!homeRequest && m_songs.isEmpty()) setBusy(true);
    setLastError({});
    QUrlQuery query;
    query.addQueryItem("id", playlistSummary.value("id").toString());
    query.addQueryItem("s", "8");
    QNetworkRequest request{localApiUrl(QStringLiteral("/playlist/detail"), query)};
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, playlistSummary, requestKey, requestSerial, homeRequest] {
        const QJsonObject detailRoot = QJsonDocument::fromJson(reply->readAll()).object();
        const auto detailError = reply->error();
        reply->deleteLater();
        if (m_platform != QStringLiteral("netease")) return;
        if (!homeRequest && (requestSerial != m_playlistRequestSerial || requestKey != m_activePlaylistKey)) return;
        const QJsonObject playlist = detailRoot.value(QStringLiteral("playlist")).toObject();
        if (detailError != QNetworkReply::NoError || playlist.isEmpty()) {
            setBusy(false);
            setLastError(QStringLiteral("网易云歌单详情加载失败"));
            show_toast(m_lastError);
            return;
        }

        QUrlQuery tracksQuery;
        tracksQuery.addQueryItem(QStringLiteral("id"), playlistSummary.value(QStringLiteral("id")).toString());
        // The sidecar resolves trackIds through /api/v3/song/detail.  A large
        // limit is intentional here: the playlist page must not silently show
        // only the first batch returned by /playlist/detail.
        tracksQuery.addQueryItem(QStringLiteral("limit"), QStringLiteral("10000"));
        tracksQuery.addQueryItem(QStringLiteral("offset"), QStringLiteral("0"));
        QNetworkRequest tracksRequest{localApiUrl(QStringLiteral("/playlist/track/all"), tracksQuery)};
        tracksRequest.setTransferTimeout(20000);
        auto *tracksReply = m_network.get(tracksRequest);
        connect(tracksReply, &QNetworkReply::finished, this,
                [this, tracksReply, playlistSummary, playlist, detailRoot, requestKey, requestSerial, homeRequest] {
            const QJsonObject tracksRoot = QJsonDocument::fromJson(tracksReply->readAll()).object();
            const auto tracksError = tracksReply->error();
            tracksReply->deleteLater();
            if (m_platform != QStringLiteral("netease")) return;
            if (!homeRequest && (requestSerial != m_playlistRequestSerial || requestKey != m_activePlaylistKey)) return;

            QJsonArray tracks = tracksRoot.value(QStringLiteral("songs")).toArray();
            QJsonArray privileges = tracksRoot.value(QStringLiteral("privileges")).toArray();
            if (tracksError != QNetworkReply::NoError || tracks.isEmpty()) {
                tracks = playlist.value(QStringLiteral("tracks")).toArray();
                privileges = detailRoot.value(QStringLiteral("privileges")).toArray();
            }

            QHash<QString, int> feeById;
            for (const QJsonValue &value : privileges) {
                const QJsonObject item = value.toObject();
                feeById.insert(QString::number(item.value(QStringLiteral("id")).toInteger()),
                               item.value(QStringLiteral("fee")).toInt());
            }

            const QString playlistName = playlist.value(QStringLiteral("name")).toString(playlistSummary.value(QStringLiteral("name")).toString());
            const bool isFavoriteList = playlist.value(QStringLiteral("specialType")).toInt() == 5
                || playlistName.contains(QStringLiteral("我喜欢的音乐"))
                || playlistName.contains(QStringLiteral("Favorite"))
                || playlistSummary.value(QStringLiteral("name")).toString().contains(QStringLiteral("我喜欢的音乐"));

            QJsonArray parsed;
            for (const QJsonValue &value : tracks) {
                const QJsonObject item = value.toObject();
                const qint64 numericId = item.value(QStringLiteral("id")).toInteger();
                if (!numericId) continue;
                const QString id = QString::number(numericId);
                const QJsonObject album = item.value(QStringLiteral("al")).toObject();
                QStringList artistNames;
                for (const QJsonValue &artist : item.value(QStringLiteral("ar")).toArray())
                    artistNames << artist.toObject().value(QStringLiteral("name")).toString();
                const int fee = feeById.value(id, item.value(QStringLiteral("fee")).toInt());
                QJsonObject song = songObject(numericId, item.value(QStringLiteral("name")).toString(),
                    artistNames.join(QStringLiteral(", ")), album.value(QStringLiteral("name")).toString(),
                    highResolutionCover(album.value(QStringLiteral("picUrl")).toString(), QStringLiteral("netease")),
                    int(item.value(QStringLiteral("dt")).toDouble() / 1000));
                song.insert(QStringLiteral("vip"), fee == 1 || fee == 4);
                if (isFavoriteList || songIsFavorite(song)) {
                    song.insert(QStringLiteral("isLiked"), true);
                    m_favorites.insert(song.value(QStringLiteral("id")).toString(), song);
                }
                parsed.append(song);
            }
            if (isFavoriteList) {
                saveLegacyStorage();
                emit favoritesChanged();
            }
            if (parsed.isEmpty()) {
                setBusy(false);
                setLastError(QStringLiteral("歌单中没有可显示的歌曲"));
                show_toast(m_lastError);
                return;
            }
            m_playlistDetail = {
                {QStringLiteral("name"), playlistName},
                {QStringLiteral("description"), playlist.value(QStringLiteral("description")).toString()},
                {QStringLiteral("cover"), highResolutionCover(playlist.value(QStringLiteral("coverImgUrl")).toString(playlistSummary.value(QStringLiteral("cover")).toString()), QStringLiteral("netease"))},
                {QStringLiteral("source"), QStringLiteral("netease")},
                {QStringLiteral("count"), parsed.size()}
            };
            setSongs(parsed);
            emit playlistDetailChanged();
            set_view_mode(QStringLiteral("playlist_detail"));
            storePlaylistCache(playlistSummary, m_playlistDetail, parsed);
        });
    });
}

void MusicBridge::requestQqPlaylistDetail(const QJsonObject &playlistSummary)
{
    const bool homeRequest = playlistSummary.value(QStringLiteral("_home")).toBool();
    const QString requestKey = playlistCacheKey(playlistSummary);
    const quint64 requestSerial = homeRequest ? 0 : m_playlistRequestSerial;
    QString id = playlistSummary.value(QStringLiteral("id")).toString();
    id.remove(QRegularExpression(QStringLiteral("^qq_pl_")));
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getSongListDetail"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("disstid"), id);
    url.setQuery(query);
    if (!homeRequest) setBusy(true);
    QNetworkRequest request(url);
    request.setTransferTimeout(20000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, playlistSummary, homeRequest, requestKey, requestSerial] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const auto error = reply->error();
        reply->deleteLater();
        if (m_platform != QStringLiteral("qq")) return;
        if (!homeRequest && (requestSerial != m_playlistRequestSerial || requestKey != m_activePlaylistKey)) return;
        const QJsonArray detailList = root.value(QStringLiteral("response")).toObject()
            .value(QStringLiteral("cdlist")).toArray();
        const QJsonObject detail = detailList.isEmpty() ? QJsonObject() : detailList.at(0).toObject();
        const QJsonArray tracks = detail.value(QStringLiteral("songlist")).toArray();
        if (error != QNetworkReply::NoError) {
            setBusy(false); setLastError(QStringLiteral("QQ 歌单加载失败")); show_toast(m_lastError); return;
        }
        if (tracks.isEmpty()) {
            // QQ 上游已把部分推荐歌单标记为私密：getSongListDetail 返回
            // subcode 4000（"check privacy error!"）且 songlist 为空。此时按
            // 歌单名回退搜索，避免整页空白或“加载失败”弹窗。
            QString fallbackQuery = playlistSummary.value(QStringLiteral("name")).toString();
            const int separator = fallbackQuery.indexOf(QRegularExpression(QStringLiteral("\\s*[|丨]")));
            if (separator > 0)
                fallbackQuery = fallbackQuery.left(separator).trimmed();
            if (fallbackQuery.isEmpty())
                fallbackQuery = QStringLiteral("热门歌曲");

            if (!homeRequest) {
                m_playlistDetail = {{QStringLiteral("name"), playlistSummary.value(QStringLiteral("name")).toString()},
                    {QStringLiteral("description"), QStringLiteral("该歌单暂不可用，已为你展示相关歌曲")},
                    {QStringLiteral("cover"), playlistSummary.value(QStringLiteral("cover")).toString()},
                    {QStringLiteral("source"), QStringLiteral("qq")},
                    {QStringLiteral("count"), 0}};
                emit playlistDetailChanged();
                set_view_mode(QStringLiteral("playlist_detail"));
            }

            QUrl fallbackUrl(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
                             + QStringLiteral("/getSearchByKey"));
            QUrlQuery fallbackParams;
            fallbackParams.addQueryItem(QStringLiteral("key"), fallbackQuery);
            fallbackParams.addQueryItem(QStringLiteral("limit"), QStringLiteral("30"));
            fallbackParams.addQueryItem(QStringLiteral("page"), QStringLiteral("1"));
            fallbackUrl.setQuery(fallbackParams);
            QNetworkRequest fallbackRequest(fallbackUrl);
            fallbackRequest.setTransferTimeout(15000);
            auto *fallbackReply = m_network.get(fallbackRequest);
            connect(fallbackReply, &QNetworkReply::finished, this,
                    [this, fallbackReply, playlistSummary, homeRequest, requestKey, requestSerial] {
                const QByteArray payload = fallbackReply->readAll();
                const bool ok = fallbackReply->error() == QNetworkReply::NoError;
                fallbackReply->deleteLater();
                if (m_platform != QStringLiteral("qq")) return;
                if (!homeRequest && (requestSerial != m_playlistRequestSerial || requestKey != m_activePlaylistKey)) return;
                if (!ok || payload.isEmpty()) {
                    setBusy(false);
                    setLastError(QStringLiteral("QQ 歌单加载失败"));
                    show_toast(m_lastError);
                    return;
                }
                handleQqSongs(payload);
                if (homeRequest) cacheCurrentHomeSongs();
                const QString playlistName = playlistSummary.value(QStringLiteral("name")).toString();
                if (!homeRequest && (playlistName.contains(QStringLiteral("我喜欢"))
                                     || playlistName.contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)))
                    mergeSongsIntoFavorites(m_songs);
                if (!homeRequest && !m_songs.isEmpty()) {
                    m_playlistDetail.insert(QStringLiteral("count"), m_songs.size());
                    emit playlistDetailChanged();
                }
            });
            return;
        }
        handleQqSongs(QJsonDocument(QJsonObject{{QStringLiteral("data"), QJsonObject{{QStringLiteral("list"), tracks}}}})
                          .toJson(QJsonDocument::Compact));
        if (homeRequest) cacheCurrentHomeSongs();
        if (!playlistSummary.value(QStringLiteral("_home")).toBool()) {
            const QString playlistName = detail.value("dissname").toString(playlistSummary.value("name").toString());
            if (playlistName.contains(QStringLiteral("我喜欢"))
                || playlistName.contains(QStringLiteral("Favorite"), Qt::CaseInsensitive))
                mergeSongsIntoFavorites(m_songs);
            m_playlistDetail = {{"name", playlistName},
                {"description", detail.value("desc").toString()},
                {"cover", highResolutionCover(detail.value("logo").toString(playlistSummary.value("cover").toString()), "qq")},
                {"source", "qq"}, {"count", tracks.size()}};
            emit playlistDetailChanged();
            set_view_mode(QStringLiteral("playlist_detail"));
            storePlaylistCache(playlistSummary, m_playlistDetail, m_songs);
        }
    });
}

void MusicBridge::logout(const QString &platform)
{
    if (platform != "netease" && platform != "qq") return;
    if (platform == "netease") m_cookie.clear();
    if (platform == "qq") m_qqCookie.clear();
    refreshSidecarCookies();
    invalidatePlayUrlCache();
    m_accounts.remove(platform);
    m_userPlaylistsByPlatform.remove(platform);
    if (m_platform == platform) m_userPlaylists = {};
    saveLegacyStorage();
    emit accountChanged(); emit userPlaylistsChanged();
    show_toast(QStringLiteral("已退出当前平台账号"));
}
void MusicBridge::toggle_like(const QString &songId)
{
    if (songId.isEmpty()) return;
    const bool liked = m_favorites.contains(songId);
    QJsonObject target;
    auto updateArray = [&target, &songId, liked](QJsonArray &items) {
        for (int index = 0; index < items.size(); ++index) {
            QJsonObject song = items.at(index).toObject();
            if (song.value(QStringLiteral("id")).toVariant().toString() != songId) continue;
            if (target.isEmpty()) target = song;
            song.insert(QStringLiteral("isLiked"), !liked);
            items[index] = song;
        }
    };
    updateArray(m_songs);
    updateArray(m_queue);
    updateArray(m_localSongs);
    if (m_current.value(QStringLiteral("id")).toVariant().toString() == songId) {
        if (target.isEmpty()) target = m_current;
        m_current.insert(QStringLiteral("isLiked"), !liked);
    }
    if (target.isEmpty()) target = m_current;
    target.insert(QStringLiteral("isLiked"), !liked);
    if (liked) m_favorites.remove(songId);
    else m_favorites.insert(songId, target);
    saveLegacyStorage();
    emit favoritesChanged(); emit songsChanged(); emit queueChanged();
    emit localSongsChanged(); emit currentSongChanged();

    const QString source = target.value(QStringLiteral("source")).toString();
    if (!m_cookie.isEmpty() && source == QStringLiteral("netease")) {
        const QString platformId = target.value(QStringLiteral("platformId")).toString();
        bool ok = false;
        const qint64 numericId = platformId.toLongLong(&ok);
        if (ok && numericId > 0) {
            QUrlQuery query;
            query.addQueryItem("id", platformId);
            query.addQueryItem("like", liked ? QStringLiteral("false") : QStringLiteral("true"));
            auto *reply = m_network.get(QNetworkRequest(localApiUrl(QStringLiteral("/like"), query)));
            connect(reply, &QNetworkReply::finished, reply, &QObject::deleteLater);
        }
    } else if (source == QStringLiteral("qq")) {
        show_toast(QStringLiteral("已保存到本地收藏；当前平台不支持从此客户端写入云端喜欢列表"));
    }
}
void MusicBridge::import_local_files()
{
    importLocalFiles(QFileDialog::getOpenFileNames(nullptr, QStringLiteral("导入本地音乐"), {},
        QStringLiteral("Audio (*.mp3 *.flac *.wav *.m4a *.aac *.ogg *.opus)")));
}

void MusicBridge::import_local_folder()
{
    const QString folder = QFileDialog::getExistingDirectory(nullptr, QStringLiteral("选择音乐文件夹"));
    if (folder.isEmpty()) return;
    QStringList paths;
    QDirIterator iterator(folder, {QStringLiteral("*.mp3"), QStringLiteral("*.flac"), QStringLiteral("*.wav"),
                                   QStringLiteral("*.m4a"), QStringLiteral("*.aac"), QStringLiteral("*.ogg"),
                                   QStringLiteral("*.opus")}, QDir::Files, QDirIterator::Subdirectories);
    while (iterator.hasNext()) paths << iterator.next();
    importLocalFiles(paths);
}

void MusicBridge::import_local_paths(const QVariantList &urls)
{
    {
        QStringList expanded;
        for (const QVariant &value : urls) {
            const QUrl url(value.toString());
            const QString path = url.isLocalFile() ? url.toLocalFile() : value.toString();
            if (QFileInfo(path).isDir()) {
                QDirIterator iterator(path, {QStringLiteral("*.mp3"), QStringLiteral("*.flac"), QStringLiteral("*.wav"),
                                             QStringLiteral("*.m4a"), QStringLiteral("*.aac"), QStringLiteral("*.ogg"),
                                             QStringLiteral("*.opus")}, QDir::Files, QDirIterator::Subdirectories);
                while (iterator.hasNext()) expanded << iterator.next();
            } else {
                expanded << path;
            }
        }
        importLocalFiles(expanded);
        return;
    }
    QStringList paths;
    for (const QVariant &value : urls) {
        const QUrl url(value.toString());
        paths << (url.isLocalFile() ? url.toLocalFile() : value.toString());
    }
    importLocalFiles(paths);
}

void MusicBridge::remove_local_song(const QString &songId)
{
    for (int i = 0; i < m_localSongs.size(); ++i) {
        if (m_localSongs.at(i).toObject().value(QStringLiteral("id")).toString() != songId) continue;
        m_localSongs.removeAt(i);
        persistLocalLibrary();
        show_toast(QStringLiteral("已从本地资料库移除，不会删除原音频文件"));
        return;
    }
}

void MusicBridge::importLocalFiles(const QStringList &paths)
{
    QSet<QString> knownPaths;
    for (const QJsonValue &value : std::as_const(m_localSongs)) {
        const QString path = QUrl(value.toObject().value(QStringLiteral("audioUrl")).toString()).toLocalFile();
        knownPaths.insert(QFileInfo(path).canonicalFilePath().toLower());
    }
    QJsonArray addedSongs;
    for (const QString &path : paths) {
        const QFileInfo file(path);
        const QString canonical = file.canonicalFilePath();
        if (!file.exists() || !file.isFile() || canonical.isEmpty()
            || knownPaths.contains(canonical.toLower())) continue;
        knownPaths.insert(canonical.toLower());
        const QString stableId = QString::fromLatin1(QCryptographicHash::hash(
            canonical.toUtf8(), QCryptographicHash::Sha256).toHex());
        const QJsonObject song{{"id", QStringLiteral("local-") + stableId},
            {"platformId", ""}, {"name", file.completeBaseName()}, {"artist", QStringLiteral("本地音乐")},
            {"album", file.dir().dirName()}, {"cover", ""}, {"duration", 0}, {"source", "local"},
            {"audioUrl", QUrl::fromLocalFile(canonical).toString()}, {"vip", false}, {"isLiked", false}};
        m_localSongs.append(song);
        addedSongs.append(song);
    }
    if (addedSongs.isEmpty()) {
        show_toast(QStringLiteral("没有发现新的受支持音频文件"));
        return;
    }
    persistLocalLibrary();
    set_view_mode(QStringLiteral("local"));
    show_toast(QStringLiteral("已导入 %1 首本地音乐").arg(addedSongs.size()));

    m_metaQueue.clear();
    for (const QJsonValue &song : std::as_const(addedSongs))
        m_metaQueue << QUrl(song.toObject().value("audioUrl").toString()).toLocalFile();
    m_metaSongIndex = -1;
    probeNextLocalMetadata();
}

void MusicBridge::probeNextLocalMetadata()
{
    while (!m_metaQueue.isEmpty()) {
        const QString path = m_metaQueue.takeFirst();
        if (path.isEmpty() || !QFile::exists(path)) continue;
        m_metaSongIndex = -1;
        const QString fileUrl = QUrl::fromLocalFile(path).toString();
        for (int i = 0; i < m_localSongs.size(); ++i) {
            if (m_localSongs.at(i).toObject().value(QStringLiteral("audioUrl")).toString() == fileUrl) {
                m_metaSongIndex = i;
                break;
            }
        }
        if (m_metaSongIndex < 0) continue;
        m_metaReader.setSource(QUrl::fromLocalFile(path));
        return;
    }
}

void MusicBridge::applyLocalMetadata()
{
    if (m_metaSongIndex < 0 || m_metaSongIndex >= m_localSongs.size()) return;
    QJsonObject song = m_localSongs.at(m_metaSongIndex).toObject();
    const QMediaMetaData md = m_metaReader.metaData();

    const QString title = md.stringValue(QMediaMetaData::Title).trimmed();
    const QString artist = md.stringValue(QMediaMetaData::ContributingArtist).trimmed();
    const QString album = md.stringValue(QMediaMetaData::AlbumTitle).trimmed();
    const qint64 durationMs = m_metaReader.duration();
    if (!title.isEmpty()) song.insert(QStringLiteral("name"), title);
    if (!artist.isEmpty()) song.insert(QStringLiteral("artist"), artist);
    if (!album.isEmpty()) song.insert(QStringLiteral("album"), album);
    if (durationMs > 0) song.insert(QStringLiteral("duration"), int(durationMs / 1000));

    const QVariant thumb = md.value(QMediaMetaData::ThumbnailImage);
    const QImage image = thumb.canConvert<QImage>() ? thumb.value<QImage>() : QImage();
    if (!image.isNull()) {
        const QString cacheRoot = QDir(QStandardPaths::writableLocation(
            QStandardPaths::CacheLocation)).filePath(QStringLiteral("BetaMusicPlayerQt/covers"));
        QDir().mkpath(cacheRoot);
        const QString sourceUrl = song.value(QStringLiteral("audioUrl")).toString();
        const QString key = QString::fromLatin1(QCryptographicHash::hash(
            QUrl(sourceUrl).toLocalFile().toUtf8(), QCryptographicHash::Sha256).toHex());
        const QString cachedPath = QDir(cacheRoot).filePath(key + QStringLiteral(".jpg"));
        if (image.save(cachedPath, "JPG"))
            song.insert(QStringLiteral("cover"), QUrl::fromLocalFile(cachedPath).toString());
    }

    const int index = m_metaSongIndex;
    m_localSongs[index] = song;
    const QString songId = song.value(QStringLiteral("id")).toString();
    for (int i = 0; i < m_songs.size(); ++i) {
        if (m_songs.at(i).toObject().value(QStringLiteral("id")).toString() == songId)
            m_songs[i] = song;
    }
    for (int i = 0; i < m_queue.size(); ++i) {
        if (m_queue.at(i).toObject().value(QStringLiteral("id")).toString() == songId)
            m_queue[i] = song;
    }
    if (m_current.value(QStringLiteral("id")).toString() == songId) {
        m_current = song;
        emit currentSongChanged();
    }
    persistLocalLibrary();
    emit songsChanged();
    emit queueChanged();

    m_metaSongIndex = -1;
    probeNextLocalMetadata();
}
void MusicBridge::toggle_full_lyrics() { m_fullLyrics = !m_fullLyrics; emit fullLyricsChanged(m_fullLyrics); }
void MusicBridge::window_set_fullscreen(bool enabled)
{
    if (!m_window || enabled == m_fullscreen) return;
    if (enabled) {
        m_beforeFullscreenGeometry = m_window->geometry();
        m_beforeFullscreenMaximized = (m_window->windowState() & Qt::WindowMaximized) != 0;
        m_window->showFullScreen();
    } else if (m_beforeFullscreenMaximized) {
        m_window->showMaximized();
    } else {
        m_window->showNormal();
        if (m_beforeFullscreenGeometry.isValid()) m_window->setGeometry(m_beforeFullscreenGeometry);
    }
    m_fullscreen = enabled;
    emit windowFullscreenChanged(enabled);
}
void MusicBridge::window_toggle_fullscreen() { window_set_fullscreen(!m_fullscreen); }
void MusicBridge::toggle_desktop_lyric()
{
    if (!m_desktopLyricWindow) {
        show_toast(QStringLiteral("桌面歌词窗口未就绪"));
        return;
    }
    m_desktopLyricActive = !m_desktopLyricActive;
    if (m_desktopLyricActive) { m_desktopLyricWindow->setWindowState(Qt::WindowNoState); m_desktopLyricWindow->show(); }
    else m_desktopLyricWindow->hide();
    emit desktopLyricActiveChanged(m_desktopLyricActive);
}
void MusicBridge::set_desktop_lyric_locked(bool locked)
{
    if (!m_desktopLyricWindow) return;
    m_settings.insert(QStringLiteral("desktopLyricLocked"), locked);
    saveSettings();
    emit settingsChanged();
#ifdef Q_OS_WIN
    // 锁定后鼠标穿透，可操作背景窗口（原版 setDesktopLyricIgnoreMouse）。
    const HWND hwnd = reinterpret_cast<HWND>(m_desktopLyricWindow->winId());
    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (locked) exStyle |= WS_EX_TRANSPARENT | WS_EX_LAYERED;
    else exStyle &= ~LONG_PTR(WS_EX_TRANSPARENT);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle);
#else
    Q_UNUSED(locked);
#endif
}
void MusicBridge::window_start_drag() { if (m_window) m_window->startSystemMove(); }
void MusicBridge::window_minimize() { if (m_window) m_window->showMinimized(); }
void MusicBridge::window_maximize() { if (!m_window) return; (m_window->windowState() & Qt::WindowMaximized) ? m_window->showNormal() : m_window->showMaximized(); }
void MusicBridge::window_close() { if (m_window) m_window->close(); }
void MusicBridge::refreshPosition(qint64 position) { emit positionChanged(int(position)); }
