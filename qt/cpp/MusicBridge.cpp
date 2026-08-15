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
#include <QStandardPaths>
#include <QTcpSocket>
#include <QTcpServer>
#include <QThread>
#include <QUrlQuery>
#include <QWindow>
#include <QRegularExpression>
#include <QSaveFile>
#include <QRandomGenerator>
#include <QJsonParseError>
#include <algorithm>
#include <cmath>
#include <utility>

namespace {
#ifndef BETA_APP_VERSION
#define BETA_APP_VERSION "1.0.8-Beta"
#endif
constexpr auto kNeteaseBase = "https://music.163.com";

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
    if (url.contains(QStringLiteral("kugou.com")))
        return QByteArray("https://www.kugou.com/");
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
    appendTrace("bridge:storage-loaded");
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
    });
    connect(&m_player, &QMediaPlayer::playbackStateChanged, this, [this] {
        emit playingChanged(isPlaying());
        if (isPlaying() && m_settings.value(QStringLiteral("autoDesktopLyric")).toBool(false)
            && !m_desktopLyricActive)
            toggle_desktop_lyric();
    });
    connect(&m_player, &QMediaPlayer::errorOccurred, this, [this](QMediaPlayer::Error, const QString &message) {
        if (!m_current.isEmpty() && m_current.value(QStringLiteral("source")).toString() != QStringLiteral("local")
            && !m_playRecoveryAttempted) {
            m_playRecoveryAttempted = true;
            show_toast(QStringLiteral("播放连接已失效，正在刷新音源"));
            requestPlayUrl(m_current, true);
            return;
        }
        if (!message.isEmpty()) show_toast(message);
    });
    connect(&m_player, &QMediaPlayer::mediaStatusChanged, this, [this](QMediaPlayer::MediaStatus status) {
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
    if (storedPlatform == QStringLiteral("netease") || storedPlatform == QStringLiteral("qq")
        || storedPlatform == QStringLiteral("kugou"))
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
    m_kugouCookie = decodeStoredCookie(auth.value("kugou").toString());
    m_accounts = m_storageRoot.value("accounts").toObject();
    for (auto accountIt = m_accounts.begin(); accountIt != m_accounts.end(); ++accountIt) {
        QJsonObject profile = accountIt.value().toObject();
        const QString avatar = highResolutionCover(profile.value("avatarUrl").toString(), accountIt.key());
        if (!avatar.isEmpty()) profile.insert("avatarUrl", avatar);
        accountIt.value() = profile;
    }
    m_userPlaylistsByPlatform = m_storageRoot.value("userPlaylists").toObject();
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
    const QString kugouCookie = encodeStoredCookie(m_kugouCookie);
    if (neteaseCookie.isEmpty()) auth.remove("netease"); else auth.insert("netease", neteaseCookie);
    if (qqCookie.isEmpty()) auth.remove("qq"); else auth.insert("qq", qqCookie);
    if (kugouCookie.isEmpty()) auth.remove("kugou"); else auth.insert("kugou", kugouCookie);
    m_storageRoot.insert("auth", auth);
    m_storageRoot.insert(QStringLiteral("activePlatform"), m_platform);
    m_storageRoot.insert("accounts", m_accounts);
    m_userPlaylistsByPlatform.insert(m_platform, m_userPlaylists);
    m_storageRoot.insert("userPlaylists", m_userPlaylistsByPlatform);
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
    const auto portReady = [](quint16 port) {
        QTcpSocket probe;
        probe.connectToHost(QHostAddress::LocalHost, port);
        const bool connected = probe.waitForConnected(120);
        if (connected) probe.disconnectFromHost();
        return connected;
    };

    QString script;
    const QStringList roots{QCoreApplication::applicationDirPath(), QDir::currentPath()};
    for (const QString &root : roots) {
        QDir directory(root);
        for (int depth = 0; depth < 5 && script.isEmpty(); ++depth) {
            const QString candidate = directory.absoluteFilePath(QStringLiteral("netease_server.js"));
            if (QFile::exists(candidate)) script = candidate;
            else if (!directory.cdUp()) break;
        }
        if (!script.isEmpty()) break;
    }
    if (!QFile::exists(script)) {
        setLastError(QStringLiteral("内置音乐平台服务文件缺失"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }

    QTcpServer neteaseReservation;
    QTcpServer qqReservation;
    QTcpServer kugouReservation;
    const bool portsReserved = neteaseReservation.listen(QHostAddress::LocalHost, 0)
        && qqReservation.listen(QHostAddress::LocalHost, 0)
        && kugouReservation.listen(QHostAddress::LocalHost, 0);
    if (portsReserved) {
        m_neteasePort = neteaseReservation.serverPort();
        m_qqPort = qqReservation.serverPort();
        m_kugouPort = kugouReservation.serverPort();
    }
    if (!m_neteasePort || !m_qqPort || !m_kugouPort) {
        setLastError(QStringLiteral("无法分配本地音乐平台服务端口"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }
    // Keep all three sockets reserved until every port has been chosen, then
    // release them together immediately before starting the bundled services.
    neteaseReservation.close();
    qqReservation.close();
    kugouReservation.close();
    const QString bundledNode = QDir(QFileInfo(script).absolutePath())
                                    .filePath(QStringLiteral("node/node.exe"));
    m_localApi.setProgram(QFileInfo::exists(bundledNode) ? bundledNode : QStringLiteral("node"));
    m_localApi.setArguments({script});
    m_localApi.setWorkingDirectory(QFileInfo(script).absolutePath());
    QProcessEnvironment environment = QProcessEnvironment::systemEnvironment();
    environment.insert(QStringLiteral("BETA_NETEASE_PORT"), QString::number(m_neteasePort));
    environment.insert(QStringLiteral("BETA_QQ_PORT"), QString::number(m_qqPort));
    environment.insert(QStringLiteral("BETA_KUGOU_PORT"), QString::number(m_kugouPort));
    m_localApi.setProcessEnvironment(environment);
    m_localApi.setProcessChannelMode(QProcess::ForwardedErrorChannel);
    m_localApi.start();
    m_ownsLocalApi = m_localApi.waitForStarted(1500);
    if (!m_ownsLocalApi) {
        setLastError(QStringLiteral("内置音乐平台服务启动失败"));
        QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
        return;
    }
    for (int attempt = 0; attempt < 50; ++attempt) {
        if (portReady(m_neteasePort) && portReady(m_qqPort) && portReady(m_kugouPort)) {
            m_sidecarReady = true;
            return;
        }
        QThread::msleep(80);
    }
    setLastError(QStringLiteral("内置音乐平台服务健康检查失败"));
    m_localApi.kill();
    m_localApi.waitForFinished(1000);
    m_ownsLocalApi = false;
    QTimer::singleShot(0, this, [this] { show_toast(m_lastError); });
}

QUrl MusicBridge::localApiUrl(const QString &path, const QUrlQuery &sourceQuery) const
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_neteasePort) + path);
    QUrlQuery query(sourceQuery);
    if (!m_cookie.isEmpty()) {
        QString cookie = m_cookie;
        if (!cookie.contains(QRegularExpression(QStringLiteral("(?:^|;\\s*)os="))))
            cookie += QStringLiteral("; os=pc");
        query.addQueryItem(QStringLiteral("cookie"), cookie);
    }
    query.addQueryItem(QStringLiteral("timestamp"), QString::number(QDateTime::currentMSecsSinceEpoch()));
    url.setQuery(query);
    return url;
}

int MusicBridge::activeIndex() const
{
    // 支持与原版一致的每首歌歌词快慢偏移（正 = 提前）。
    const double platformOffsetMs = m_current.value(QStringLiteral("source")).toString() == QStringLiteral("kugou")
        ? 400.0 : 0.0;
    const double offsetSeconds = (m_lyricOffset + platformOffsetMs) / 1000.0;
    const double seconds = m_player.position() / 1000.0 + offsetSeconds;
    int active = -1;
    for (int i = 0; i < m_lyrics.size(); ++i) {
        if (m_lyrics.at(i).toObject().value("time").toDouble() <= seconds) active = i;
        else break;
    }
    return active;
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

    if (source == "kugou" || url.contains("kugou.com")) {
        url.replace("{size}", "800");
        url.replace(QRegularExpression(QStringLiteral("/(?:120|150|240|300|400|480|600|800)/")), QStringLiteral("/800/"));
        url.replace(QRegularExpression(QStringLiteral("_(?:120|150|240|300|400|480|600|800)(?=\\.(?:jpg|jpeg|png|webp))")), QStringLiteral("_800"));
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
    if (value == m_platform) return;
    m_platform = value;
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
        } else if (m_platform == "kugou" && m_accounts.contains("kugou")) {
            const auto cookieValue = [](const QString &cookie, const QString &name) {
                for (const QString &part : cookie.split(';')) {
                    const QString trimmed = part.trimmed();
                    if (trimmed.startsWith(name + '=')) {
                        return QUrl::fromPercentEncoding(trimmed.mid(name.size() + 1).toUtf8());
                    }
                }
                return QString();
            };
            const QString userId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
            const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
            requestKugouUserPlaylists(userId, token);
        } else if (m_platform == "netease" && m_accounts.contains("netease")) {
            requestUserPlaylists(m_accounts.value("netease").toObject().value("userId").toString());
        }
    }
}
void MusicBridge::load_home_recommendations()
{
    setBusy(true);
    setLastError({});
    if (m_platform == QStringLiteral("qq")) { requestQqHome(); return; }
    if (m_platform == QStringLiteral("kugou")) { requestKugouHome(); return; }
    if (m_platform == "netease") requestHome();
    else if (m_platform == "qq") requestQqSearch(QStringLiteral("热门歌曲"));
    else if (m_platform == "kugou") requestKugouSearch(QStringLiteral("热门歌曲"));
    else setSongs(fallbackSongs());
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
    requestNeteaseHomePlaylists();
    // 与原版 Electron 对齐：主页推荐使用网易云精选歌单 3778678，其歌曲带
    // 真实的 fee/privileges（VIP 信息正确）。/personalized/newsong 返回的歌
    // 曲几乎全是 fee=8 的试听曲，导致 VIP 标记无法正确识别。
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_neteasePort)
             + QStringLiteral("/playlist/track/all"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("id"), QStringLiteral("3778678"));
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("100"));
    query.addQueryItem(QStringLiteral("offset"), QStringLiteral("0"));
    if (!m_cookie.isEmpty()) query.addQueryItem(QStringLiteral("cookie"), m_cookie);
    url.setQuery(query);
    QNetworkRequest request{url};
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto data = reply->readAll(); const auto error = reply->error(); reply->deleteLater();
        appendTrace(QByteArray("home:reply error=") + QByteArray::number(int(error))
                    + " bytes=" + QByteArray::number(data.size()));
        if (error == QNetworkReply::NoError && !data.isEmpty()) handleNeteaseHomeSongs(data);
        else { setBusy(false); setLastError(QStringLiteral("网易云推荐加载失败")); show_toast(m_lastError); }
    });
}

void MusicBridge::requestNeteaseHomePlaylists()
{
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("6"));
    query.addQueryItem(QStringLiteral("timestamp"), QString::number(QDateTime::currentMSecsSinceEpoch()));
    QNetworkRequest request{localApiUrl(QStringLiteral("/personalized"), query)};
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QByteArray payload = reply->readAll();
        const auto error = reply->error();
        reply->deleteLater();
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
    if (m_platform == "qq") { requestQqSearch(query); return; }
    if (m_platform == "kugou") { requestKugouSearch(query); return; }
    QNetworkRequest request{QUrl(QString::fromLatin1(kNeteaseBase) + "/api/cloudsearch/pc")};
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/x-www-form-urlencoded");
    request.setRawHeader("User-Agent", "Mozilla/5.0"); request.setRawHeader("Referer", "https://music.163.com/");
    request.setTransferTimeout(15000);
    QUrlQuery form; form.addQueryItem("s", query); form.addQueryItem("type", "1"); form.addQueryItem("limit", "30"); form.addQueryItem("offset", "0");
    auto *reply = m_network.post(request, form.query(QUrl::FullyEncoded).toUtf8());
    connect(reply, &QNetworkReply::finished, this, [this, reply, query] {
        const auto data = reply->readAll(); const auto error = reply->error(); reply->deleteLater();
        if (query != m_searchQuery) return;
        if (error == QNetworkReply::NoError && !data.isEmpty()) handleSongs(data, false);
        else { setBusy(false); setLastError(QStringLiteral("网易云搜索失败")); show_toast(m_lastError); }
    });
}

void MusicBridge::requestQqSearch(const QString &query)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getSearchByKey"));
    QUrlQuery params;
    params.addQueryItem("key", query);
    params.addQueryItem("limit", "30");
    params.addQueryItem("page", "1");
    if (!m_qqCookie.isEmpty()) params.addQueryItem("cookie", m_qqCookie);
    url.setQuery(params);
    QNetworkRequest request(url);
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, query, reply] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (query != m_searchQuery) return;
        if (!ok || payload.isEmpty()) {
            requestQqPublicSearch(query);
            return;
        }
        handleQqSongs(payload);
    });
}

void MusicBridge::requestQqHome()
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort)
             + QStringLiteral("/getSongLists"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("limit"), QStringLiteral("20"));
    query.addQueryItem(QStringLiteral("page"), QStringLiteral("0"));
    query.addQueryItem(QStringLiteral("sortId"), QStringLiteral("5"));
    query.addQueryItem(QStringLiteral("categoryId"), QStringLiteral("10000000"));
    if (!m_qqCookie.isEmpty()) query.addQueryItem(QStringLiteral("cookie"), m_qqCookie);
    url.setQuery(query);

    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, query] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const auto error = reply->error();
        reply->deleteLater();
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
    connect(reply, &QNetworkReply::finished, this, [this, reply, query] {
        setBusy(false);
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        if (query != m_searchQuery) return;
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

void MusicBridge::requestKugouSearch(const QString &query)
{
    // KuGou's public mobile endpoint is HTTP in the upstream desktop client;
    // forcing HTTPS breaks on Windows installations missing its legacy chain.
    QUrl url(QStringLiteral("http://mobilecdn.kugou.com/api/v3/search/song"));
    QUrlQuery params;
    params.addQueryItem("format", "json");
    params.addQueryItem("keyword", query);
    params.addQueryItem("page", "1");
    params.addQueryItem("pagesize", "30");
    params.addQueryItem("showtype", "1");
    url.setQuery(params);
    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", "https://www.kugou.com/");
    request.setTransferTimeout(15000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, query] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (query != m_searchQuery) return;
        setBusy(false);
        if (!ok) { show_toast(QStringLiteral("酷狗概念版搜索服务连接失败")); return; }
        handleKugouSongs(payload);
    });
}

void MusicBridge::requestKugouHome()
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/top/playlist"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("category_id"), QStringLiteral("0"));
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const auto error = reply->error();
        reply->deleteLater();
        const QJsonObject data = root.value(QStringLiteral("data")).toObject();
        QJsonArray list = data.value(QStringLiteral("special_list")).toArray();
        if (list.isEmpty()) list = data.value(QStringLiteral("info")).toArray();
        if (list.isEmpty()) list = data.value(QStringLiteral("lists")).toArray();
        if (error != QNetworkReply::NoError || list.isEmpty()) {
            setBusy(false);
            setLastError(QStringLiteral("酷狗概念版推荐歌单加载失败"));
            show_toast(m_lastError);
            return;
        }
        QJsonArray playlists;
        for (int i = 0; i < qMin(6, list.size()); ++i) {
            const QJsonObject candidate = list.at(i).toObject();
            QString candidateId = candidate.value(QStringLiteral("global_collection_id")).toVariant().toString();
            if (candidateId.isEmpty()) candidateId = candidate.value(QStringLiteral("specialid")).toVariant().toString();
            if (candidateId.isEmpty()) candidateId = candidate.value(QStringLiteral("id")).toVariant().toString();
            if (candidateId.isEmpty()) continue;
            playlists.append(QJsonObject{
                {QStringLiteral("id"), QStringLiteral("kg_pl_") + candidateId},
                {QStringLiteral("name"), candidate.value(QStringLiteral("specialname")).toString(candidate.value(QStringLiteral("name")).toString())},
                {QStringLiteral("description"), candidate.value(QStringLiteral("intro")).toString(candidate.value(QStringLiteral("description")).toString()).left(100)},
                {QStringLiteral("cover"), highResolutionCover(candidate.value(QStringLiteral("imgurl")).toString(candidate.value(QStringLiteral("flexible_cover")).toString()), QStringLiteral("kugou"))},
                {QStringLiteral("trackCount"), candidate.value(QStringLiteral("song_count")).toInt(candidate.value(QStringLiteral("songcount")).toInt())},
                {QStringLiteral("source"), QStringLiteral("kugou")}
            });
        }
        if (!playlists.isEmpty()) setHomePlaylists(playlists);
        const QJsonObject item = list.first().toObject();
        QString id = item.value(QStringLiteral("global_collection_id")).toVariant().toString();
        if (id.isEmpty()) id = item.value(QStringLiteral("specialid")).toVariant().toString();
        if (id.isEmpty()) id = item.value(QStringLiteral("id")).toVariant().toString();
        if (id.isEmpty()) {
            setBusy(false);
            setLastError(QStringLiteral("酷狗音乐推荐歌单数据无效"));
            show_toast(m_lastError);
            return;
        }
        requestKugouPlaylistDetail(QJsonObject{
            {QStringLiteral("id"), QStringLiteral("kg_pl_") + id},
            {QStringLiteral("name"), item.value(QStringLiteral("specialname")).toString(
                 item.value(QStringLiteral("name")).toString())},
            {QStringLiteral("cover"), item.value(QStringLiteral("imgurl")).toString(
                 item.value(QStringLiteral("flexible_cover")).toString())},
            {QStringLiteral("source"), QStringLiteral("kugou")},
            {QStringLiteral("_home"), true}
        });
    });
}

void MusicBridge::handleKugouSongs(const QByteArray &payload)
{
    setBusy(false);
    const QJsonObject root = QJsonDocument::fromJson(payload).object();
    const QJsonObject data = root.value("data").toObject();
    QJsonArray raw = data.value("info").toArray();
    if (raw.isEmpty()) raw = data.value("lists").toArray();
    if (raw.isEmpty()) raw = data.value("songs").toArray();
    QJsonArray parsed;
    for (const QJsonValue &value : raw) {
        const QJsonObject item = value.toObject();
        const QString hash = item.value("hash").toString(item.value("filehash").toString()).toUpper();
        if (hash.isEmpty()) continue;

        // 标题：酷狗概念版歌单用 `name`（常为 "歌手 - 歌名"），公开搜索用
        // `songname`/`song_name`/`filename`。
        QString title = item.value("songname").toString(item.value("song_name").toString());
        if (title.isEmpty()) title = item.value("name").toString();
        if (title.isEmpty()) title = item.value("filename").toString();

        // 歌手：概念版歌单用 `singerinfo`（对象或数组），公开搜索用
        // `singername`/`author_name`。
        QStringList artists;
        const QJsonValue singerValue = item.value("singerinfo");
        if (singerValue.isArray()) {
            for (const QJsonValue &s : singerValue.toArray())
                artists << s.toObject().value("name").toString();
        } else if (singerValue.isObject()) {
            artists << singerValue.toObject().value("name").toString();
        }
        if (artists.isEmpty())
            artists << item.value("singername").toString(item.value("author_name").toString());
        QString artist = artists.join(QStringLiteral(", "));

        if (title.isEmpty()) {
            const QString filename = item.value("filename").toString();
            const int separator = filename.indexOf(QStringLiteral(" - "));
            title = separator >= 0 ? filename.mid(separator + 3) : filename;
            if (artist.isEmpty() && separator > 0) artist = filename.left(separator);
        }

        // 歌单 `name` 形如 "歌手 - 歌名"，与歌手一致时剥离前缀避免重复显示。
        if (!artist.isEmpty()) {
            const int separator = title.indexOf(QStringLiteral(" - "));
            if (separator > 0) {
                const auto normalize = [](QString s) {
                    s = s.toLower();
                    s.remove(QRegularExpression(QStringLiteral("[\\s/／、，,&·.\\-—–_]")));
                    return s;
                };
                if (normalize(title.left(separator)) == normalize(artist))
                    title = title.mid(separator + 3).trimmed();
            }
        }

        const QJsonObject albumInfo = item.value("albuminfo").toObject();
        const QJsonObject songInfo = item.value("info").toObject().isEmpty()
            ? item.value("audio_info").toObject() : item.value("info").toObject();
        const QJsonObject transParam = item.value("trans_param").toObject();
        QString cover = item.value("album_cover").toString();
        if (cover.isEmpty()) cover = item.value("album_pic").toString();
        if (cover.isEmpty()) cover = item.value("album_img").toString(item.value("album_imgurl").toString());
        if (cover.isEmpty()) cover = songInfo.value("image").toString(songInfo.value("cover").toString(songInfo.value("pic").toString(songInfo.value("imgurl").toString())));
        if (cover.isEmpty()) cover = albumInfo.value("cover").toString(albumInfo.value("pic").toString(albumInfo.value("imgurl").toString(albumInfo.value("img").toString())));
        if (cover.isEmpty()) cover = item.value("imgurl").toString(item.value("img_url").toString(item.value("img").toString(item.value("pic").toString())));
        if (cover.isEmpty()) cover = item.value("sizable_cover").toString(item.value("cover").toString(item.value("cover_url").toString(item.value("coverUrl").toString())));
        if (cover.isEmpty()) cover = transParam.value("union_cover").toString(transParam.value("unionCover").toString(transParam.value("sizable_cover").toString()));

        const int duration = item.value("duration").toInt(int(item.value("timelen").toDouble() / 1000.0));
        const QJsonObject pay = item.value("pay").toObject();
        const QJsonArray download = item.value("download").toArray();
        const QJsonArray relateGoods = item.value("relate_goods").toArray();

        // 与 Electron kugouMusicApi.getVipRequirement 对齐：
        // - privilege>=10 仅在无 status/play_status 时作为付费信号；
        // - relate_goods 子项与 pkg_price / pay_block 同样参与判定。
        const bool explicitVip = jsonPositive(item.value("is_vip"))
            || jsonPositive(item.value("isvip"))
            || jsonPositive(item.value("isVip"))
            || jsonPositive(item.value("vip"))
            || jsonPositive(item.value("vip_song"))
            || jsonPositive(item.value("vipSong"));
        const int musicPackAdvance = jsonInteger(transParam.value("musicpack_advance"),
                                                 jsonInteger(transParam.value("musicpackAdvance")));
        const int downloadPayType = download.isEmpty() ? 0
            : jsonInteger(download.first().toObject().value("pay_type"));
        const int payType = jsonInteger(item.value("pay_type"),
                                        jsonInteger(item.value("payType"),
                                                    jsonInteger(pay.value("pay_type"),
                                                                jsonInteger(pay.value("payType"), downloadPayType))));
        const double price = item.value("price").toDouble(pay.value("price").toDouble(0));
        const double packagePrice = item.value("pkg_price").toDouble(item.value("pkgPrice").toDouble(
            pay.value("pkg_price").toDouble(pay.value("pkgPrice").toDouble(0))));
        const int fee = jsonInteger(item.value("fee"),
                                    jsonInteger(item.value("fee_type"),
                                                jsonInteger(item.value("feeType"),
                                                            jsonInteger(pay.value("fee")))));
        const int privilege = jsonInteger(item.value("privilege"),
                                          jsonInteger(item.value("privilege_type"),
                                                      jsonInteger(item.value("privilegeType"))));
        const int status = jsonInteger(item.value("status"),
                                       jsonInteger(item.value("play_status"),
                                                   jsonInteger(item.value("playStatus"), -1)));
        const int payBlock = jsonInteger(item.value("pay_block_text"),
                                         jsonInteger(item.value("payBlockText"),
                                                     jsonInteger(transParam.value("pay_block_tpl"),
                                                                 jsonInteger(transParam.value("payBlockTpl")))));
        bool relatedPaid = false;
        for (const QJsonValue &gv : relateGoods) {
            const QJsonObject g = gv.toObject();
            if (jsonInteger(g.value("privilege")) >= 10
                || jsonInteger(g.value("pay_type")) > 0
                || jsonPositive(g.value("is_vip")) || jsonPositive(g.value("isvip")))
                relatedPaid = true;
        }
        const bool hasStatus = status >= 0;
        const bool vip = explicitVip
            || musicPackAdvance > 0
            || payType > 0
            || price > 0
            || packagePrice > 0
            || fee > 0
            || jsonInteger(item.value("feetype")) > 0
            || relatedPaid
            || (privilege >= 10 && !hasStatus)
            || (payBlock > 1 && !hasStatus);

        const QString kugouAlbumId = item.value("album_id").toVariant().toString().isEmpty()
            ? item.value("albumid").toVariant().toString() : item.value("album_id").toVariant().toString();
        const QString kugouAlbumAudioId = item.value("album_audio_id").toVariant().toString().isEmpty()
            ? (item.value("audio_id").toVariant().toString().isEmpty()
                ? item.value("album_audioid").toVariant().toString()
                : item.value("audio_id").toVariant().toString())
            : item.value("album_audio_id").toVariant().toString();

        parsed.append(QJsonObject{
            {"id", QStringLiteral("kugou-") + hash}, {"platformId", hash},
            {"name", title}, {"artist", artist},
            {"album", item.value("album_name").toString(
                 item.value("albuminfo").toObject().value("name").toString())},
            {"cover", highResolutionCover(cover, "kugou")}, {"duration", duration},
            {"source", "kugou"}, {"vip", vip}, {"isLiked", false},
            {"kugouAlbumId", kugouAlbumId},
            {"kugouAlbumAudioId", kugouAlbumAudioId}});
    }
    if (parsed.isEmpty()) { show_toast(QStringLiteral("酷狗概念版未返回可用歌曲")); return; }
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
    if (!parsed.isEmpty()) setSongs(parsed);
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

void MusicBridge::setHomePlaylists(QJsonArray playlists)
{
    for (int i = 0; i < playlists.size(); ++i) {
        QJsonObject playlist = playlists.at(i).toObject();
        const QString source = playlist.value(QStringLiteral("source")).toString(m_platform);
        playlist.insert(QStringLiteral("cover"), highResolutionCover(playlist.value(QStringLiteral("cover")).toString(), source));
        playlists[i] = playlist;
    }
    m_homePlaylists = std::move(playlists);
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
void MusicBridge::setCurrentIndex(int index, bool autoplay)
{
    if (index < 0 || index >= m_queue.size()) return;
    set_lyric_offset(0);
    m_playRecoveryAttempted = false;
    m_currentIndex = index; m_current = m_queue.at(index).toObject();
    if (songIsFavorite(m_current))
        m_current.insert(QStringLiteral("isLiked"), true);
    requestCoverPalette(m_current.value("cover").toString());
    // QML's image loader cannot attach the Referer header required by some
    // music CDNs. Fetch the selected cover once through the bridge and then
    // switch every view to the locally cached, lossless file URL.
    cacheCover(m_current.value("cover").toString());
    if (m_current.value("source").toString() == "kugou"
        && m_current.value("cover").toString().isEmpty()) {
        requestKugouCover(m_current);
    }
    if (m_current.value("source").toString() == "local") {
        m_player.setSource(QUrl(m_current.value("audioUrl").toString()));
        requestLyrics(m_current);
        if (autoplay) m_player.play();
        emit currentSongChanged();
        return;
    }
    const QString nativeId = m_current.value("platformId").toString();
    if (nativeId.isEmpty()) { show_toast(QStringLiteral("该曲目暂时没有可用音源")); return; }
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
    if (song.value("source").toString() == "qq") {
        requestQqPlayUrl(song, autoplay, serial);
        return;
    }
    if (song.value("source").toString() == "kugou") {
        requestKugouPlayUrl(song, autoplay, serial);
        return;
    }
    const QString quality = m_settings.value("audioQuality").toString("high");
    const QString requested = quality == "lossless" ? "lossless"
                              : quality == "standard" ? "standard" : "exhigh";
    QStringList levels{requested, QStringLiteral("exhigh"), QStringLiteral("standard")};
    levels.removeDuplicates();
    requestPlayLevel(song, levels, 0, autoplay, serial);
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
        show_toast(song.value("vip").toBool()
            ? QStringLiteral("QQ 音乐提示：该曲需要当前账号的播放权益")
            : QStringLiteral("QQ 音乐未返回可播放音源"));
        return;
    }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getMusicPlay"));
    QUrlQuery params;
    params.addQueryItem("songmid", song.value("platformId").toString());
    params.addQueryItem("quality", qualities.at(qualityIndex));
    if (!m_qqCookie.isEmpty()) params.addQueryItem("cookie", m_qqCookie);
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
        m_player.setSource(QUrl(mediaUrl));
        if (autoplay) m_player.play();
    });
}

void MusicBridge::requestKugouPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial)
{
    const QString hash = song.value("platformId").toString();
    if (hash.isEmpty()) {
        show_toast(QStringLiteral("酷狗概念版未返回可播放音源"));
        return;
    }

    // 已登录的酷狗概念版账号优先走本地 API /song/url，可解析 VIP/高音质；
    // 未登录或本地 API 不可用时回退到酷狗移动端公开接口。
    const QString userId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
    const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
    const bool authenticated = !userId.isEmpty() && !token.isEmpty();

    QStringList qualities;
    if (m_settings.value(QStringLiteral("audioQuality")).toString() == QStringLiteral("standard"))
        qualities = {QStringLiteral("128")};
    else if (authenticated)
        qualities = {QStringLiteral("320"), QStringLiteral("128")};
    else
        qualities = {QStringLiteral("128")};

    if (m_kugouPort > 0)
        requestKugouDeviceRegistration([this, song, autoplay, serial, qualities] { requestKugouPlayUrlLevel(song, autoplay, serial, qualities, 0); });
    else
        requestKugouLegacyPlayUrl(song, autoplay, serial);
}

void MusicBridge::requestKugouPlayUrlLevel(const QJsonObject &song, bool autoplay, quint64 serial,
                                            const QStringList &qualities, int qualityIndex)
{
    if (serial != m_playRequestSerial) return;
    if (qualityIndex >= qualities.size()) {
        requestKugouLegacyPlayUrl(song, autoplay, serial);
        return;
    }

    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/song/url"));
    QUrlQuery params;
    params.addQueryItem(QStringLiteral("hash"), song.value("platformId").toString());
    params.addQueryItem(QStringLiteral("album_id"), song.value("kugouAlbumId").toString());
    params.addQueryItem(QStringLiteral("album_audio_id"), song.value("kugouAlbumAudioId").toString());
    params.addQueryItem(QStringLiteral("quality"), qualities.at(qualityIndex));

    QStringList cookieParts;
    if (!m_kugouDfid.isEmpty())
        cookieParts << QStringLiteral("dfid=") + m_kugouDfid;
    const QString userId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
    const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
    if (!userId.isEmpty())
        cookieParts << QStringLiteral("userid=") + userId;
    if (!token.isEmpty())
        cookieParts << QStringLiteral("token=") + token;
      for (const QString &part : m_kugouCookie.split(QLatin1Char(';'))) {
          const int separator = part.indexOf(QLatin1Char('='));
          if (separator <= 0) continue;
          const QString key = part.left(separator).trimmed();
          if (key == QStringLiteral("vip_type") || key == QStringLiteral("vip_token")
              || key == QStringLiteral("t1")) {
              cookieParts << key + QLatin1Char('=') + part.mid(separator + 1).trimmed();
          }
      }
    if (!cookieParts.isEmpty())
        params.addQueryItem(QStringLiteral("cookie"), cookieParts.join(QStringLiteral("; ")));
    url.setQuery(params);

    QNetworkRequest request(url);
    request.setTransferTimeout(12000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, autoplay, song, serial, qualities, qualityIndex] {
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        if (serial != m_playRequestSerial) return;

        const QString mediaUrl = findAudioUrlInJson(QJsonDocument::fromJson(payload).object());
        if (!mediaUrl.isEmpty()) {
            m_player.setSource(QUrl(mediaUrl));
            if (autoplay) m_player.play();
            return;
        }
        // 接口返回了错误提示（例如需要设备验证）时继续下一音质或回退公开源。
        requestKugouPlayUrlLevel(song, autoplay, serial, qualities, qualityIndex + 1);
    });
}

void MusicBridge::requestKugouLegacyPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial)
{
    QUrl url(QStringLiteral("http://m.kugou.com/app/i/getSongInfo.php"));
    QUrlQuery params;
    params.addQueryItem("cmd", "playInfo");
    params.addQueryItem("hash", song.value("platformId").toString());
    url.setQuery(params);
    QNetworkRequest request(url);
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    request.setRawHeader("Referer", "https://www.kugou.com/");
    request.setTransferTimeout(12000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, autoplay, song, serial] {
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        if (serial != m_playRequestSerial) return;
        QString mediaUrl = findAudioUrlInJson(QJsonDocument::fromJson(payload).object());
        if (mediaUrl.isEmpty()) {
            const QJsonObject data = QJsonDocument::fromJson(payload).object();
            const QJsonArray backups = data.value("backup_url").toArray();
            if (!backups.isEmpty()) mediaUrl = backups.first().toString();
        }
        if (mediaUrl.isEmpty()) {
            show_toast(song.value("vip").toBool()
                ? QStringLiteral("该酷狗歌曲需要当前账号的播放权益")
                : QStringLiteral("酷狗音乐未返回可播放音源"));
            return;
        }
        m_player.setSource(QUrl(mediaUrl));
        if (autoplay) m_player.play();
    });
}

void MusicBridge::requestKugouCover(const QJsonObject &song)
{
    const QString hash = song.value("platformId").toString();
    if (hash.isEmpty() || !m_kugouPort) return;
    const QString songId = song.value("id").toString();

    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/song/url"));
    QUrlQuery params;
    params.addQueryItem("hash", hash);
    params.addQueryItem("album_id", song.value("kugouAlbumId").toString());
    params.addQueryItem("album_audio_id", song.value("kugouAlbumAudioId").toString());
    params.addQueryItem("quality", "128");

    QStringList cookieParts;
    if (!m_kugouDfid.isEmpty())
        cookieParts << QStringLiteral("dfid=") + m_kugouDfid;
    for (const QString &part : m_kugouCookie.split(QLatin1Char(';'))) {
        const int separator = part.indexOf(QLatin1Char('='));
        if (separator <= 0) continue;
        const QString key = part.left(separator).trimmed();
        if (key == QStringLiteral("userid") || key == QStringLiteral("token"))
            cookieParts << key + QLatin1Char('=') + part.mid(separator + 1).trimmed();
    }
    if (!cookieParts.isEmpty())
        params.addQueryItem("cookie", cookieParts.join(QStringLiteral("; ")));
    url.setQuery(params);

    QNetworkRequest request(url);
    request.setTransferTimeout(10000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, songId] {
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        if (m_current.value("id").toString() != songId) return;

        const QString cover = findImageUrlInJson(QJsonDocument::fromJson(payload).object());
        if (cover.isEmpty()) return;
        const QString highCover = highResolutionCover(cover, "kugou");
        if (highCover.isEmpty()) return;

        m_current.insert("cover", highCover);
        bool songsDirty = false;
        bool queueDirty = false;
        for (int i = 0; i < m_songs.size(); ++i) {
            QJsonObject item = m_songs.at(i).toObject();
            if (item.value("id").toString() == songId && item.value("cover").toString().isEmpty()) {
                item.insert("cover", highCover);
                m_songs[i] = item;
                songsDirty = true;
            }
        }
        for (int i = 0; i < m_queue.size(); ++i) {
            QJsonObject item = m_queue.at(i).toObject();
            if (item.value("id").toString() == songId && item.value("cover").toString().isEmpty()) {
                item.insert("cover", highCover);
                m_queue[i] = item;
                queueDirty = true;
            }
        }
        if (songsDirty) emit songsChanged();
        if (queueDirty) emit queueChanged();
        emit currentSongChanged();
        requestCoverPalette(highCover);
        cacheCover(highCover);
    });
}

void MusicBridge::requestPlayLevel(const QJsonObject &song, const QStringList &levels,
                                   int levelIndex, bool autoplay, quint64 serial)
{
    if (serial != m_playRequestSerial) return;
    if (levelIndex >= levels.size()) {
        if (!song.value("vip").toBool()) {
            const QString id = song.value("platformId").toString();
            m_player.setSource(QUrl(QStringLiteral("https://music.163.com/song/media/outer/url?id=") + id + ".mp3"));
            if (autoplay) m_player.play();
        } else {
            show_toast(QStringLiteral("无法获取 VIP 音源，请确认网易云会员登录状态"));
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
        if (networkOk) {
            const QJsonDocument document = QJsonDocument::fromJson(payload);
            const QJsonArray data = document.object().value("data").toArray();
            if (!data.isEmpty()) mediaUrl = data.first().toObject().value("url").toString();
        }
        if (!mediaUrl.isEmpty()) {
            m_player.setSource(QUrl(mediaUrl));
            if (autoplay) m_player.play();
            return;
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

QJsonArray MusicBridge::parseKrc(const QString &text)
{
    return LyricParser::parseKrc(text);
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
    if (song.value("source").toString() == "local") {
        const QUrl audioUrl(song.value("audioUrl").toString());
        QFileInfo audioFile(audioUrl.toLocalFile());
        QFile lrc(QDir(audioFile.absolutePath()).filePath(audioFile.completeBaseName() + QStringLiteral(".lrc")));
        m_lyrics = lrc.open(QIODevice::ReadOnly) ? parseLrc(QString::fromUtf8(lrc.readAll())) : QJsonArray{};
        emit lyricsChanged();
        return;
    }
    if (song.value("source").toString() == "qq") {
        QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/getLyric"));
        QUrlQuery params;
        params.addQueryItem("songmid", song.value("platformId").toString());
        if (!m_qqCookie.isEmpty()) params.addQueryItem("cookie", m_qqCookie);
        url.setQuery(params);
        auto *reply = m_network.get(QNetworkRequest(url));
        connect(reply, &QNetworkReply::finished, this, [this, reply] {
            const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
            reply->deleteLater();
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
    if (song.value("source").toString() == "kugou") {
        requestKugouLyrics(song);
        return;
    }
    QUrlQuery query;
    query.addQueryItem("id", song.value("platformId").toString());
    QNetworkRequest request{localApiUrl(QStringLiteral("/lyric/new"), query)};
    request.setRawHeader("User-Agent", "Mozilla/5.0");
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto document = QJsonDocument::fromJson(reply->readAll());
        reply->deleteLater();
        if (!document.isObject()) return;
        const QJsonObject root = document.object();
        const QString yrc = root.value("yrc").toObject().value("lyric").toString();
        const QString lrc = root.value("lrc").toObject().value("lyric").toString();
        QJsonArray parsed = parseYrc(yrc);
        const QJsonArray lrcLines = parseLrc(lrc);
        if (parsed.isEmpty()) {
            parsed = lrcLines;
        }

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

void MusicBridge::requestKugouLyrics(const QJsonObject &song)
{
    const QString hash = song.value("platformId").toString();
    if (hash.isEmpty()) {
        m_lyrics = {};
        emit lyricsChanged();
        return;
    }
    requestKugouLyricSearch(song, hash, 0);
}

void MusicBridge::requestKugouLyricSearch(const QJsonObject &song, const QString &hash, int attempt)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/search/lyric"));
    QUrlQuery params;
    params.addQueryItem("hash", hash);
    if (!song.value("kugouAlbumAudioId").toString().isEmpty())
        params.addQueryItem("album_audio_id", song.value("kugouAlbumAudioId").toString());
    params.addQueryItem("duration", QString::number(song.value("duration").toInt() * 1000));
    if (attempt > 0)
        params.addQueryItem("keywords", (song.value("name").toString()
            + QLatin1Char(' ') + song.value("artist").toString()).trimmed());
      if (!m_kugouCookie.isEmpty())
          params.addQueryItem(QStringLiteral("cookie"), m_kugouCookie);
    url.setQuery(params);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, song, hash, attempt] {
        const QByteArray payload = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        reply->deleteLater();
        if (!ok || payload.isEmpty()) {
            m_lyrics = {};
            emit lyricsChanged();
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(payload).object();
        auto pick = [](const QJsonObject &o) {
            if (o.value(QStringLiteral("candidates")).isArray())
                return o.value(QStringLiteral("candidates")).toArray();
            if (o.value(QStringLiteral("info")).isArray())
                return o.value(QStringLiteral("info")).toArray();
            return QJsonArray{};
        };
        QJsonArray candidates = pick(root);
        const QJsonObject body = root.value(QStringLiteral("body")).toObject();
        if (candidates.isEmpty() && !body.isEmpty()) {
            candidates = pick(body);
            if (candidates.isEmpty())
                candidates = pick(body.value(QStringLiteral("data")).toObject());
        }
        if (candidates.isEmpty())
            candidates = pick(root.value(QStringLiteral("data")).toObject());

        QString id;
        QString accessKey;
        for (const QJsonValue &value : std::as_const(candidates)) {
            const QJsonObject item = value.toObject();
            const QString cid = item.value(QStringLiteral("id")).toString();
            const QString key = item.value(QStringLiteral("accesskey")).toString();
            if (!cid.isEmpty() && !key.isEmpty()) { id = cid; accessKey = key; break; }
        }
        if (id.isEmpty() || accessKey.isEmpty()) {
            if (attempt == 0) {
                requestKugouLyricSearch(song, hash, 1);
            } else {
                m_lyrics = {};
                emit lyricsChanged();
            }
            return;
        }
        requestKugouLyricContent(id, accessKey, 0);
    });
}

void MusicBridge::requestKugouLyricContent(const QString &id, const QString &accessKey, int fmtIndex)
{
    const QStringList formats{QStringLiteral("krc"), QStringLiteral("lrc")};
    if (fmtIndex >= formats.size()) {
        m_lyrics = {};
        emit lyricsChanged();
        return;
    }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/lyric"));
    QUrlQuery params;
    params.addQueryItem("id", id);
    params.addQueryItem("accesskey", accessKey);
    params.addQueryItem("fmt", formats.at(fmtIndex));
    params.addQueryItem("decode", QStringLiteral("true"));
      if (!m_kugouCookie.isEmpty())
          params.addQueryItem(QStringLiteral("cookie"), m_kugouCookie);
    url.setQuery(params);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, id, accessKey, fmtIndex] {
        const QByteArray payload = reply->readAll();
        reply->deleteLater();
        const QJsonObject root = QJsonDocument::fromJson(payload).object();
        const QJsonObject body = root.value(QStringLiteral("body")).toObject();
        const QJsonObject data = body.value(QStringLiteral("data")).toObject();
        const QJsonObject rootData = root.value(QStringLiteral("data")).toObject();
        QString content = root.value(QStringLiteral("decodeContent")).toString();
        if (content.isEmpty()) content = root.value(QStringLiteral("content")).toString();
        if (content.isEmpty()) content = body.value(QStringLiteral("decodeContent")).toString();
        if (content.isEmpty()) content = data.value(QStringLiteral("decodeContent")).toString();
        if (content.isEmpty()) content = body.value(QStringLiteral("content")).toString();
        if (content.isEmpty()) content = data.value(QStringLiteral("content")).toString();
        if (content.isEmpty()) content = rootData.value(QStringLiteral("decodeContent")).toString();
        if (content.isEmpty()) content = rootData.value(QStringLiteral("content")).toString();
        content.remove(QChar(0xFEFF));

        QJsonArray parsed = parseKrc(content);
        if (parsed.isEmpty()) parsed = parseLrc(content);
        if (!parsed.isEmpty()) {
            m_lyrics = parsed;
            emit lyricsChanged();
            return;
        }
        requestKugouLyricContent(id, accessKey, fmtIndex + 1);
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
    // 删除后按当前歌曲 id 重新定位索引。原版 Electron 的 removeFromQueue
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
void MusicBridge::set_audio_quality(const QString &quality) { m_settings.insert("audioQuality", quality); saveSettings(); emit settingsChanged(); }
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
            QDesktopServices::openUrl(QUrl(release.value(QStringLiteral("html_url")).toString(
                QStringLiteral("https://github.com/RubenCampoa/Beta-music-player/releases/latest"))));
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
    if (platform == "kugou") {
        m_loginStatus = QStringLiteral("正在生成酷狗概念版微信登录二维码");
        emit loginStateChanged();
        requestKugouLoginQr();
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
    if (m_loginPlatform == "kugou") { pollKugouLoginQr(); return; }
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
    query.addQueryItem("cookie", m_qqCookie);
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
        requestQqUserPlaylists(uin);
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
    query.addQueryItem("cookie", m_qqCookie);
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
        requestQqCollectedPlaylists(uin, created);
    });
}

void MusicBridge::requestQqCollectedPlaylists(const QString &uin, const QJsonArray &createdPlaylists)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_qqPort) + QStringLiteral("/user/getUserCollectedSongLists"));
    QUrlQuery query;
    query.addQueryItem("uin", uin);
    query.addQueryItem("page", "1");
    query.addQueryItem("limit", "50");
    query.addQueryItem("cookie", m_qqCookie);
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
    saveLegacyStorage();
    m_loginStatus = QStringLiteral("QQ 音乐 Cookie 已绑定，正在获取账号信息…");
    emit loginStateChanged();
    requestQqAccount();
}

void MusicBridge::requestKugouLoginQr()
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort) + QStringLiteral("/login/wx/create"));
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        const QJsonObject data = root.value("data").toObject();
        const QJsonObject qrcode = root.value("qrcode").toObject().isEmpty()
            ? data.value("qrcode").toObject() : root.value("qrcode").toObject();
        const QString uuid = root.value("uuid").toString(data.value("uuid").toString());
        const QString base64 = qrcode.value("qrcodebase64").toString(qrcode.value("base64").toString());
        if (uuid.isEmpty() || base64.isEmpty()) {
            m_loginStatus = QStringLiteral("酷狗微信二维码生成失败，请确认本地酷狗 API 服务已启动");
            emit loginStateChanged();
            return;
        }
        m_kugouLoginUuid = uuid;
        m_loginQrImage = base64.startsWith("data:image/") ? base64
            : QStringLiteral("data:image/jpeg;base64,") + base64;
        m_loginStatus = QStringLiteral("请使用微信扫描二维码登录酷狗概念版");
        m_loginTimer.start();
        emit loginStateChanged();
    });
}

void MusicBridge::pollKugouLoginQr()
{
    if (m_kugouLoginUuid.isEmpty()) return;
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort) + QStringLiteral("/login/wx/check"));
    QUrlQuery query;
    query.addQueryItem("uuid", m_kugouLoginUuid);
    query.addQueryItem("timestamp", QString::number(QDateTime::currentMSecsSinceEpoch()));
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        const QJsonObject data = root.value("data").toObject();
        const int status = root.value("wx_errcode").toInt(data.value("wx_errcode").toInt(408));
        if (status == 402) {
            m_loginTimer.stop();
            m_loginStatus = QStringLiteral("二维码已过期，请点击刷新");
            emit loginStateChanged();
        } else if (status == 403) {
            m_loginTimer.stop();
            m_loginStatus = QStringLiteral("已拒绝微信登录");
            emit loginStateChanged();
        } else if (status == 404) {
            m_loginStatus = QStringLiteral("已扫码，请在微信上确认登录");
            emit loginStateChanged();
        } else if (status == 405) {
            const QString wxCode = root.value("wx_code").toString(data.value("wx_code").toString());
            if (!wxCode.isEmpty()) {
                m_loginTimer.stop();
                completeKugouLogin(wxCode);
            }
        }
    });
}

void MusicBridge::completeKugouLogin(const QString &wxCode)
{
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort) + QStringLiteral("/login/openplat"));
    QUrlQuery query; query.addQueryItem("code", wxCode);
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        // 兼容 kugoumusicapi 直接返回或 body 包装两种形态。
        QJsonObject data = root.value("data").toObject();
        if (data.isEmpty() && root.value("body").isObject())
            data = root.value("body").toObject().value("data").toObject();
        const QString token = data.value("token").toString(data.value("access_token").toString());
        const QString userId = data.value("userid").toString(data.value("user_id").toString());
        if (token.isEmpty() || userId.isEmpty()) {
            m_loginStatus = QStringLiteral("酷狗微信登录凭证转换失败，请刷新重试");
            emit loginStateChanged();
            return;
        }
        QStringList parts{QStringLiteral("token=") + token, QStringLiteral("userid=") + userId};
        const QString vipType = data.value("vip_type").toString();
        const QString vipToken = data.value("vip_token").toString();
        const QString t1 = data.value("t1").toString();
        if (!vipType.isEmpty()) parts << QStringLiteral("vip_type=") + vipType;
        if (!vipToken.isEmpty()) parts << QStringLiteral("vip_token=") + vipToken;
        if (!t1.isEmpty()) parts << QStringLiteral("t1=") + t1;
        m_kugouCookie = parts.join(QStringLiteral("; "));
        saveLegacyStorage();
        requestKugouAccount();
    });
}

void MusicBridge::requestKugouAccount()
{
    // 从 cookie 解析 userid/token 作为显式查询参数（与原版 getUserAccount 一致）。
    const auto cookieValue = [](const QString &cookie, const QString &name) {
        for (const QString &part : cookie.split(';')) {
            const QString trimmed = part.trimmed();
            if (trimmed.startsWith(name + '=')) {
                const QString value = trimmed.mid(name.size() + 1);
                return QUrl::fromPercentEncoding(value.toUtf8());
            }
        }
        return QString();
    };
    const QString userId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
    const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
    if (userId.isEmpty() || token.isEmpty()) {
        m_loginStatus = QStringLiteral("酷狗登录凭证不完整，请重新登录");
        emit loginStateChanged();
        return;
    }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort) + QStringLiteral("/user/detail"));
    QUrlQuery query;
    query.addQueryItem("userid", userId);
    query.addQueryItem("token", token);
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, userId] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        QJsonObject user = root.value("data").toObject();
        if (user.isEmpty()) user = root;
        const QJsonObject accountObj = user.value("account").toObject();
        const QString nickname = user.value("nickname").toString(
            user.value("username").toString(accountObj.value("nickname").toString(QStringLiteral("酷狗概念版用户"))));
        QString avatar = user.value("pic").toString(user.value("avatar").toString(accountObj.value("pic").toString()));
        avatar = highResolutionCover(avatar, "kugou");
        QJsonObject account{{"userId", userId}, {"nickname", nickname},
            {"avatarUrl", avatar}, {"platform", "kugou"}};
        m_accounts.insert("kugou", account);
        if (!avatar.isEmpty()) cacheAvatar(avatar, QStringLiteral("kugou"));
        emit accountChanged();
        const auto cookieValue = [](const QString &cookie, const QString &name) {
            for (const QString &part : cookie.split(';')) {
                const QString trimmed = part.trimmed();
                if (trimmed.startsWith(name + '=')) {
                    return QUrl::fromPercentEncoding(trimmed.mid(name.size() + 1).toUtf8());
                }
            }
            return QString();
        };
        const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
        requestKugouUserPlaylists(userId, token);
        m_loginStatus = QStringLiteral("酷狗概念版登录成功");
        emit loginStateChanged();
        if (m_loginModalOpen) { m_loginModalOpen = false; emit loginModalChanged(false); }
        show_toast(QStringLiteral("酷狗概念版账号已同步"));
    });
}

void MusicBridge::requestKugouUserPlaylists(const QString &userId, const QString &token)
{
    if (userId.isEmpty() || token.isEmpty()) return;
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort) + QStringLiteral("/user/playlist"));
    QUrlQuery query;
    query.addQueryItem("userid", userId);
    query.addQueryItem("token", token);
    query.addQueryItem("page", "1");
    query.addQueryItem("pagesize", "50");
    url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        QJsonObject data = root.value("data").toObject();
        if (data.isEmpty() && root.value("body").isObject())
            data = root.value("body").toObject().value("data").toObject();

        QJsonArray raw = data.value("info").toArray();
        if (raw.isEmpty()) raw = data.value("lists").toArray();
        if (raw.isEmpty()) raw = data.value("list").toArray();
        if (raw.isEmpty()) raw = data.value("collections").toArray();
        if (raw.isEmpty()) raw = data.value("collection").toArray();
        if (raw.isEmpty()) raw = findFirstPlaylistArrayInJson(root);

        QJsonArray playlists;
        QSet<QString> seen;
        for (const QJsonValue &value : raw) {
            QJsonObject item = value.toObject();
            if (item.value("info").isObject()) item = item.value("info").toObject();
            QString listId = item.value("listid").toVariant().toString();
            if (listId.isEmpty()) listId = item.value("list_id").toVariant().toString();
            if (listId.isEmpty()) listId = item.value("specialid").toVariant().toString();
            if (listId.isEmpty()) listId = item.value("special_id").toVariant().toString();
            QString globalCollectionId = item.value("global_collection_id").toVariant().toString();
            if (globalCollectionId.isEmpty()) globalCollectionId = item.value("global_collectionid").toVariant().toString();
              // 与 Electron kugouMusicApi.getUserPlaylists 对齐：
              // 用户歌单必须以 kg_user_ 前缀打开 /playlist/track/all/new；
              // 同时携带 global_collection_id 时编码到 id 中，供云端歌单接口回退。
              QString id;
              if (!listId.isEmpty()) {
                  id = QStringLiteral("kg_user_") + listId;
                  if (!globalCollectionId.isEmpty())
                      id += QStringLiteral("::") + QString::fromUtf8(QUrl::toPercentEncoding(globalCollectionId));
              } else if (!globalCollectionId.isEmpty()) {
                  id = QStringLiteral("kg_pl_") + globalCollectionId;
              } else {
                  id = item.value("id").toVariant().toString();
              }
            if (id.isEmpty() || seen.contains(id)) continue;
            seen.insert(id);

            QString name = item.value("name").toString(item.value("specialname").toString(item.value("listname").toString(item.value("title").toString("酷狗歌单"))));
            QString cover = item.value("pic").toString(item.value("imgurl").toString(item.value("cover").toString(item.value("flexible_cover").toString())));
            if (cover.contains("{size}")) cover.replace("{size}", "400");
            int count = item.value("count").toInt(item.value("songcount").toInt(item.value("total").toInt(item.value("song_count").toInt())));

            playlists.append(QJsonObject{
                {"id", id},
                {"name", name},
                {"cover", highResolutionCover(cover, "kugou")},
                {"trackCount", count},
                {"source", "kugou"}
            });
        }

        m_userPlaylistsByPlatform.insert("kugou", playlists);
        if (m_platform == "kugou") {
            m_userPlaylists = playlists;
            emit userPlaylistsChanged();
        }
        saveLegacyStorage();
    });
}

void MusicBridge::requestKugouDeviceRegistration(std::function<void()> onReady)
{
    if (!m_kugouDfid.isEmpty()) { onReady(); return; }
    QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
             + QStringLiteral("/register/dev"));
      QUrlQuery query;
      const QString userId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
      const QString token = cookieValue(m_kugouCookie, QStringLiteral("token"));
      if (!userId.isEmpty()) query.addQueryItem(QStringLiteral("userid"), userId);
      if (!token.isEmpty()) query.addQueryItem(QStringLiteral("token"), token);
      url.setQuery(query);
    auto *reply = m_network.get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, onReady] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        reply->deleteLater();
        const QString dfid = root.value(QStringLiteral("data")).toObject()
            .value(QStringLiteral("dfid")).toString();
        if (!dfid.isEmpty()) m_kugouDfid = dfid;
        onReady();
    });
}

void MusicBridge::completeNeteaseLogin(const QString &cookie)
{
    if (cookie.isEmpty()) return;
    m_cookie = cookie;
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
        requestUserPlaylists(userId);
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
    if (platform != QStringLiteral("netease") && platform != QStringLiteral("qq")
        && platform != QStringLiteral("kugou")) return;
    const QString name = platform == QStringLiteral("qq") ? QStringLiteral("QQ 音乐")
        : platform == QStringLiteral("kugou") ? QStringLiteral("酷狗概念版")
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
    } else if (platform == QStringLiteral("kugou")) {
        m_kugouCookie = cookie;
        saveLegacyStorage();
        requestKugouAccount();
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
    if (source == QStringLiteral("kugou")) { requestKugouPlaylistDetail(playlistSummary); return; }
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
    if (!m_qqCookie.isEmpty()) query.addQueryItem(QStringLiteral("cookie"), m_qqCookie);
    url.setQuery(query);
    setBusy(true);
    QNetworkRequest request(url);
    request.setTransferTimeout(20000);
    auto *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, playlistSummary, homeRequest, requestKey, requestSerial] {
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const auto error = reply->error();
        reply->deleteLater();
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
            if (!m_qqCookie.isEmpty()) fallbackParams.addQueryItem(QStringLiteral("cookie"), m_qqCookie);
            fallbackUrl.setQuery(fallbackParams);
            QNetworkRequest fallbackRequest(fallbackUrl);
            fallbackRequest.setTransferTimeout(15000);
            auto *fallbackReply = m_network.get(fallbackRequest);
            connect(fallbackReply, &QNetworkReply::finished, this,
                    [this, fallbackReply, homeRequest, requestKey, requestSerial] {
                const QByteArray payload = fallbackReply->readAll();
                const bool ok = fallbackReply->error() == QNetworkReply::NoError;
                fallbackReply->deleteLater();
                if (!homeRequest && (requestSerial != m_playlistRequestSerial || requestKey != m_activePlaylistKey)) return;
                if (!ok || payload.isEmpty()) {
                    setBusy(false);
                    setLastError(QStringLiteral("QQ 歌单加载失败"));
                    show_toast(m_lastError);
                    return;
                }
                handleQqSongs(payload);
                if (!homeRequest && !m_songs.isEmpty()) {
                    m_playlistDetail.insert(QStringLiteral("count"), m_songs.size());
                    emit playlistDetailChanged();
                }
            });
            return;
        }
        handleQqSongs(QJsonDocument(QJsonObject{{QStringLiteral("data"), QJsonObject{{QStringLiteral("list"), tracks}}}})
                          .toJson(QJsonDocument::Compact));
        if (!playlistSummary.value(QStringLiteral("_home")).toBool()) {
            m_playlistDetail = {{"name", detail.value("dissname").toString(playlistSummary.value("name").toString())},
                {"description", detail.value("desc").toString()},
                {"cover", highResolutionCover(detail.value("logo").toString(playlistSummary.value("cover").toString()), "qq")},
                {"source", "qq"}, {"count", tracks.size()}};
            emit playlistDetailChanged();
            set_view_mode(QStringLiteral("playlist_detail"));
            storePlaylistCache(playlistSummary, m_playlistDetail, m_songs);
        }
    });
}

void MusicBridge::requestKugouPlaylistDetail(const QJsonObject &playlistSummary)
{
    const bool homeRequest = playlistSummary.value(QStringLiteral("_home")).toBool();
    const QString requestKey = playlistCacheKey(playlistSummary);
    const quint64 requestSerial = homeRequest ? 0 : m_playlistRequestSerial;
    QString id = playlistSummary.value(QStringLiteral("id")).toString();
    const bool userPlaylist = id.startsWith(QStringLiteral("kg_user_"));
    id.remove(QRegularExpression(QStringLiteral("^(?:kg_pl_|kugou_|kg_user_)")));
    const QStringList pieces = id.split(QStringLiteral("::"));
    setBusy(true);

    // 酷狗概念版(lite)歌单接口需要已注册设备 dfid，否则上游直接返回 502。
    requestKugouDeviceRegistration([this, playlistSummary, homeRequest, requestKey,
                                    requestSerial, userPlaylist, pieces] {
        QUrl url(QStringLiteral("http://127.0.0.1:") + QString::number(m_kugouPort)
                 + (userPlaylist ? QStringLiteral("/playlist/track/all/new")
                                 : QStringLiteral("/playlist/track/all")));
        QUrlQuery query;
        query.addQueryItem(userPlaylist ? QStringLiteral("listid") : QStringLiteral("id"),
                           pieces.value(0));
        query.addQueryItem(QStringLiteral("page"), QStringLiteral("1"));
        query.addQueryItem(QStringLiteral("pagesize"), QStringLiteral("1000"));
          const QString kugouUserId = cookieValue(m_kugouCookie, QStringLiteral("userid"));
          const QString kugouToken = cookieValue(m_kugouCookie, QStringLiteral("token"));
          if (userPlaylist && !kugouUserId.isEmpty())
              query.addQueryItem(QStringLiteral("userid"), kugouUserId);
          if (userPlaylist && !kugouToken.isEmpty())
              query.addQueryItem(QStringLiteral("token"), kugouToken);
        // 统一通过 `cookie` 查询参数传递 dfid / userid / token，与
        // kugoumusicapi 的 cookie 解析约定一致。
        QStringList cookieParts;
        if (!m_kugouDfid.isEmpty())
            cookieParts << QStringLiteral("dfid=") + m_kugouDfid;
        for (const QString &part : m_kugouCookie.split(QLatin1Char(';'))) {
            const int separator = part.indexOf(QLatin1Char('='));
            if (separator <= 0) continue;
            const QString key = part.left(separator).trimmed();
            if (key == QStringLiteral("userid") || key == QStringLiteral("token"))
                cookieParts << key + QLatin1Char('=') + part.mid(separator + 1).trimmed();
        }
        if (!cookieParts.isEmpty())
            query.addQueryItem(QStringLiteral("cookie"), cookieParts.join(QStringLiteral("; ")));
        url.setQuery(query);

        QNetworkRequest request(url);
        request.setTransferTimeout(20000);
        auto *reply = m_network.get(request);
        connect(reply, &QNetworkReply::finished, this,
                [this, reply, playlistSummary, homeRequest, requestKey, requestSerial] {
            const QByteArray payload = reply->readAll();
            const auto error = reply->error();
            reply->deleteLater();
            if (!homeRequest && (requestSerial != m_playlistRequestSerial
                                 || requestKey != m_activePlaylistKey)) return;
            if (error != QNetworkReply::NoError) {
                setBusy(false); setLastError(QStringLiteral("酷狗概念版歌单加载失败"));
                show_toast(m_lastError); return;
            }
            handleKugouSongs(payload);
            if (m_songs.isEmpty()) return;
            if (!homeRequest) {
                m_playlistDetail = {{"name", playlistSummary.value("name").toString()},
                    {"description", playlistSummary.value("description").toString()},
                    {"cover", playlistSummary.value("cover").toString()}, {"source", "kugou"},
                    {"count", m_songs.size()}};
                emit playlistDetailChanged();
                set_view_mode(QStringLiteral("playlist_detail"));
                storePlaylistCache(playlistSummary, m_playlistDetail, m_songs);
            }
        });
    });
}

void MusicBridge::logout(const QString &platform)
{
    if (platform != "netease" && platform != "qq" && platform != "kugou") return;
    if (platform == "netease") m_cookie.clear();
    if (platform == "qq") m_qqCookie.clear();
    if (platform == "kugou") m_kugouCookie.clear();
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
    } else if (source == QStringLiteral("qq") || source == QStringLiteral("kugou")) {
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
