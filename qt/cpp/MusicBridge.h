#pragma once

#include <QObject>
#include <QJsonArray>
#include <QJsonObject>
#include <QImage>
#include <QMediaPlayer>
#include <QAudioOutput>
#include <QHash>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QProcess>
#include <QSet>
#include <QStringList>
#include <QTimer>
#include <QUrl>
#include <QUrlQuery>
#include <QVariantList>
#include <QVariantMap>
#include <QRect>
#include <functional>

#include "JsonListModel.h"

class QWindow;
class QNetworkReply;

// Native C++ replacement for the former PySide `bridge` context object.
// Property names deliberately remain identical, so the QML UI does not need a
// second rewrite while services migrate from Python to Qt/C++.
class MusicBridge final : public QObject
{
    Q_OBJECT

    Q_PROPERTY(QString songs READ songs NOTIFY songsChanged)
    Q_PROPERTY(QVariantMap currentSong READ currentSong NOTIFY currentSongChanged)
    Q_PROPERTY(QString lyrics READ lyrics NOTIFY lyricsChanged)
    Q_PROPERTY(int activeIndex READ activeIndex NOTIFY positionChanged)
    Q_PROPERTY(bool isPlaying READ isPlaying NOTIFY playingChanged)
    Q_PROPERTY(int positionMs READ positionMs NOTIFY positionChanged)
    Q_PROPERTY(int durationMs READ durationMs NOTIFY durationChanged)
    Q_PROPERTY(QString platform READ platform NOTIFY platformChanged)
    Q_PROPERTY(QString viewMode READ viewMode NOTIFY viewModeChanged)
    Q_PROPERTY(QVariantList fluidColors READ fluidColors NOTIFY fluidColorsChanged)
    Q_PROPERTY(bool fullLyrics READ fullLyrics NOTIFY fullLyricsChanged)
    Q_PROPERTY(bool windowFullscreen READ windowFullscreen NOTIFY windowFullscreenChanged)
    Q_PROPERTY(bool desktopLyricActive READ desktopLyricActive NOTIFY desktopLyricActiveChanged)
    Q_PROPERTY(QString repeatMode READ repeatMode NOTIFY repeatModeChanged)
    Q_PROPERTY(bool isShuffle READ isShuffle NOTIFY shuffleChanged)
    Q_PROPERTY(int volume READ volume NOTIFY volumeChanged)
    Q_PROPERTY(QString queueList READ queueList NOTIFY queueChanged)
    Q_PROPERTY(QString toastMessage READ toastMessage NOTIFY toastChanged)
    Q_PROPERTY(bool isQueueDrawerOpen READ isQueueDrawerOpen NOTIFY queueDrawerChanged)
    Q_PROPERTY(bool isLoginModalOpen READ isLoginModalOpen NOTIFY loginModalChanged)
    Q_PROPERTY(QVariantMap playlistDetail READ playlistDetail NOTIFY playlistDetailChanged)
    Q_PROPERTY(QString searchQuery READ searchQuery NOTIFY searchQueryChanged)
    Q_PROPERTY(QStringList searchHistory READ searchHistory NOTIFY searchHistoryChanged)
    Q_PROPERTY(QVariantMap settings READ settings NOTIFY settingsChanged)
    Q_PROPERTY(int lyricOffset READ lyricOffset WRITE set_lyric_offset NOTIFY lyricOffsetChanged)
    Q_PROPERTY(QString loginPlatform READ loginPlatform NOTIFY loginStateChanged)
    Q_PROPERTY(QString loginStatus READ loginStatus NOTIFY loginStateChanged)
    Q_PROPERTY(QString loginQrImage READ loginQrImage NOTIFY loginStateChanged)
    Q_PROPERTY(QVariantMap account READ account NOTIFY accountChanged)
    Q_PROPERTY(QVariantMap accounts READ accounts NOTIFY accountChanged)
    Q_PROPERTY(QString userPlaylists READ userPlaylists NOTIFY userPlaylistsChanged)
    Q_PROPERTY(QString localSongs READ localSongs NOTIFY localSongsChanged)
    Q_PROPERTY(QAbstractItemModel *songsModel READ songsModel CONSTANT)
    Q_PROPERTY(QAbstractItemModel *queueModel READ queueModel CONSTANT)
    Q_PROPERTY(QAbstractItemModel *lyricsModel READ lyricsModel CONSTANT)
    Q_PROPERTY(QAbstractItemModel *playlistsModel READ playlistsModel CONSTANT)
    Q_PROPERTY(QAbstractItemModel *homePlaylistsModel READ homePlaylistsModel CONSTANT)
    Q_PROPERTY(QAbstractItemModel *localSongsModel READ localSongsModel CONSTANT)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(bool muted READ muted NOTIFY mutedChanged)

public:
    explicit MusicBridge(QObject *parent = nullptr);
    ~MusicBridge() override;
    void setWindow(QWindow *window);
    void setDesktopLyricWindow(QWindow *window);

    // 纯函数，公开以便单元测试直接调用（不依赖 QMediaPlayer/网络状态）。
    static QJsonArray parseLrc(const QString &text);
    static QJsonArray parseYrc(const QString &text);
    static QJsonArray parseQrc(const QString &text);
    static QJsonArray parseKrc(const QString &text);
    static QString filterQqLyricLines(const QString &text);
    static int compareVersions(const QString &left, const QString &right);

    QString songs() const;
    QVariantMap currentSong() const;
    QString lyrics() const;
    int activeIndex() const;
    bool isPlaying() const;
    int positionMs() const;
    int durationMs() const;
    QString platform() const;
    QString viewMode() const;
    QVariantList fluidColors() const;
    bool fullLyrics() const;
    bool windowFullscreen() const;
    bool desktopLyricActive() const;
    QString repeatMode() const;
    bool isShuffle() const;
    int volume() const;
    QString queueList() const;
    QString toastMessage() const;
    bool isQueueDrawerOpen() const;
    bool isLoginModalOpen() const;
    QVariantMap playlistDetail() const;
    QString searchQuery() const;
    QStringList searchHistory() const;
    QVariantMap settings() const;
    int lyricOffset() const { return m_settings.value(QStringLiteral("lyricSwitchOffsetMs")).toInt(0); }
    QString loginPlatform() const;
    QString loginStatus() const;
    QString loginQrImage() const;
    QVariantMap account() const;
    QVariantMap accounts() const;
    QString userPlaylists() const;
    QString localSongs() const;
    QAbstractItemModel *songsModel() { return &m_songsModel; }
    QAbstractItemModel *queueModel() { return &m_queueModel; }
    QAbstractItemModel *lyricsModel() { return &m_lyricsModel; }
    QAbstractItemModel *playlistsModel() { return &m_playlistsModel; }
    QAbstractItemModel *homePlaylistsModel() { return &m_homePlaylistsModel; }
    QAbstractItemModel *localSongsModel() { return &m_localSongsModel; }
    bool busy() const { return m_busy; }
    QString lastError() const { return m_lastError; }
    bool muted() const { return m_muted; }
    bool sidecarReady() const { return m_sidecarReady; }

    Q_INVOKABLE void show_toast(const QString &message);
    Q_INVOKABLE void set_platform(const QString &platform);
    Q_INVOKABLE void load_home_recommendations();
    Q_INVOKABLE void load_browse(const QString &category = QStringLiteral("all"));
    Q_INVOKABLE void open_playlist(const QString &name, const QString &query, const QString &cover = {});
    Q_INVOKABLE void set_view_mode(const QString &mode);
    Q_INVOKABLE void search(const QString &query);
    Q_INVOKABLE void add_search_history(const QString &query);
    Q_INVOKABLE void remove_search_history_item(const QString &query);
    Q_INVOKABLE void clear_search_history();
    Q_INVOKABLE void play(int index);
    Q_INVOKABLE void play_search_result(int index);
    Q_INVOKABLE void play_local(int index);
    Q_INVOKABLE void play_queue_index(int index);
    Q_INVOKABLE void remove_queue_index(int index);
    Q_INVOKABLE void clear_queue();
    Q_INVOKABLE void toggle_repeat();
    Q_INVOKABLE void toggle_shuffle();
    Q_INVOKABLE void set_volume(int volume);
    Q_INVOKABLE void toggle_mute();
    Q_INVOKABLE void set_setting(const QString &key, bool value);
    Q_INVOKABLE void set_setting_value(const QString &key, const QVariant &value);
    Q_INVOKABLE void set_audio_quality(const QString &quality);
    Q_INVOKABLE void set_lyric_offset(int milliseconds);
    Q_INVOKABLE void set_qq_cookie(const QString &cookie);
    Q_INVOKABLE void toggle_queue_drawer();
    Q_INVOKABLE void toggle_login_modal();
    Q_INVOKABLE void begin_login(const QString &platform);
    Q_INVOKABLE void refresh_login_qr();
    Q_INVOKABLE void login_via_web(const QString &platform);
    Q_INVOKABLE void complete_web_login(const QString &platform, const QString &cookie);
    Q_INVOKABLE void open_user_playlist(int index);
    Q_INVOKABLE void open_home_playlist(int index);
    Q_INVOKABLE void open_daily_playlist();
    Q_INVOKABLE void logout(const QString &platform);
    Q_INVOKABLE void toggle_like(const QString &songId);
    Q_INVOKABLE bool isFavorite(const QString &songId) const;
    Q_INVOKABLE void import_local_files();
    Q_INVOKABLE void import_local_folder();
    Q_INVOKABLE void import_local_paths(const QVariantList &urls);
    Q_INVOKABLE void remove_local_song(const QString &songId);
    Q_INVOKABLE void clear_cache();
    Q_INVOKABLE void check_for_updates();
    Q_INVOKABLE void apply_performance_preset();
    Q_INVOKABLE void toggle_play();
    Q_INVOKABLE void seek(int milliseconds);
    Q_INVOKABLE void next();
    Q_INVOKABLE void prev();
    Q_INVOKABLE void toggle_full_lyrics();
    Q_INVOKABLE void window_set_fullscreen(bool enabled);
    Q_INVOKABLE void window_toggle_fullscreen();
    Q_INVOKABLE void toggle_desktop_lyric();
    Q_INVOKABLE void set_desktop_lyric_locked(bool locked);
    Q_INVOKABLE void window_start_drag();
    Q_INVOKABLE void window_minimize();
    Q_INVOKABLE void window_maximize();
    Q_INVOKABLE void window_close();

signals:
    void songsChanged();
    void currentSongChanged();
    void lyricsChanged();
    void positionChanged(int milliseconds);
    void durationChanged(int milliseconds);
    void playingChanged(bool playing);
    void fullLyricsChanged(bool visible);
    void windowFullscreenChanged(bool fullscreen);
    void desktopLyricActiveChanged(bool active);
    void platformChanged(const QString &platform);
    void fluidColorsChanged();
    void viewModeChanged(const QString &mode);
    void favoritesChanged();
    void repeatModeChanged(const QString &mode);
    void shuffleChanged(bool shuffle);
    void volumeChanged(int volume);
    void queueChanged();
    void toastChanged(const QString &message);
    void searchQueryChanged(const QString &query);
    void searchHistoryChanged();
    void queueDrawerChanged(bool open);
    void loginModalChanged(bool open);
    void playlistDetailChanged();
    void settingsChanged();
    void lyricOffsetChanged(int offset);
    void loginStateChanged();
    void accountChanged();
    void userPlaylistsChanged();
    void webLoginRequested(const QString &platform);
    void localSongsChanged();
    void busyChanged();
    void lastErrorChanged();
    void mutedChanged(bool muted);

private:
    void checkForUpdates(bool silent);
    void requestHome();
    void requestNeteaseHomePlaylists();
    void requestSearch(const QString &query);
    void requestQqSearch(const QString &query);
    void requestQqHome();
    void requestQqPublicSearch(const QString &query);
    void handleQqSongs(const QByteArray &payload);
    void requestKugouSearch(const QString &query);
    void requestKugouHome();
    void handleKugouSongs(const QByteArray &payload);
    void requestLyrics(const QJsonObject &song);
    void requestKugouLyrics(const QJsonObject &song);
    void requestKugouLyricSearch(const QJsonObject &song, const QString &hash, int attempt);
    void requestKugouLyricContent(const QString &id, const QString &accessKey, int fmtIndex);
    void requestPlayUrl(const QJsonObject &song, bool autoplay);
    void requestQqPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial, int qualityIndex = 0);
    void requestKugouPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial);
      void requestKugouPlayUrlLevel(const QJsonObject &song, bool autoplay, quint64 serial,
                                    const QStringList &qualities, int qualityIndex);
      void requestKugouLegacyPlayUrl(const QJsonObject &song, bool autoplay, quint64 serial);
    void requestKugouCover(const QJsonObject &song);
    void requestQqCreatedPlaylists(const QString &uin);
    void requestQqCollectedPlaylists(const QString &uin, const QJsonArray &createdPlaylists);
    void requestPlayLevel(const QJsonObject &song, const QStringList &levels,
                          int levelIndex, bool autoplay, quint64 serial);
    void requestLoginQrKey();
    void requestLoginQrImage(const QString &key);
    void pollLoginQr();
    void completeNeteaseLogin(const QString &cookie);
    void requestNeteaseAccount();
    void requestQqLoginQr();
    void requestQqAccount();
    void requestQqUserPlaylists(const QString &uin);
    void requestKugouLoginQr();
    void pollKugouLoginQr();
    void completeKugouLogin(const QString &wxCode);
    void requestKugouAccount();
    void requestKugouUserPlaylists(const QString &userId, const QString &token);
    void requestKugouDeviceRegistration(std::function<void()> onReady);
    void requestUserPlaylists(const QString &userId);
    void requestPlaylistDetail(const QJsonObject &playlist);
    void requestQqPlaylistDetail(const QJsonObject &playlist);
    void requestKugouPlaylistDetail(const QJsonObject &playlist);
    QString playlistCacheKey(const QJsonObject &playlist) const;
    qint64 restorePlaylistCache(const QJsonObject &playlist);
    void storePlaylistCache(const QJsonObject &playlist, const QJsonObject &detail,
                            const QJsonArray &songs);
    void requestCoverPalette(const QString &coverUrl);
    void computeFluidPalette(QImage image);
    void cacheCover(const QString &coverUrl);
    void cacheAvatar(const QString &avatarUrl, const QString &platform);
    void replaceCoverWithCachedFile(const QString &remoteUrl, const QString &localUrl);
    void replaceAvatarWithCachedFile(const QString &platform, const QString &remoteUrl, const QString &localUrl);
    void importLocalFiles(const QStringList &paths);
    void probeNextLocalMetadata();
    void applyLocalMetadata();
    void handleSongs(const QByteArray &payload, bool home);
    void handleNeteaseHomeSongs(const QByteArray &payload);
    void setHomePlaylists(QJsonArray playlists);
    void setSongs(QJsonArray songs);
    bool songIsFavorite(const QJsonObject &song) const;
    void applyFavoriteStates(QJsonArray &songs) const;
    void setCurrentIndex(int index, bool autoplay = true);
    void loadLegacyStorage();
    void saveLegacyStorage();
    void flushLegacyStorage();
    void ensureLocalApi();
    QUrl localApiUrl(const QString &path, const QUrlQuery &query = {}) const;
    void saveSettings();
    void setBusy(bool busy);
    void setLastError(const QString &message);
    void persistLocalLibrary();
    void restoreLocalLibrary();
    void refreshPosition(qint64 position);
    static QString compactJson(const QJsonValue &value);
    static QString highResolutionCover(QString url, const QString &source);
    static QJsonObject qqPlaylistFromJson(const QJsonObject &item);
    static QJsonArray fallbackSongs();

    QPointer<QWindow> m_window;
    QPointer<QWindow> m_desktopLyricWindow;
    QNetworkAccessManager m_network;
    QMediaPlayer m_player;
    QMediaPlayer m_metaReader;
    QAudioOutput m_audio;
    QProcess m_localApi;
    QJsonArray m_songs;
    QJsonArray m_queue;
    QJsonArray m_lyrics;
    QJsonArray m_fluidColors;
    QJsonObject m_current;
    QJsonObject m_favorites;
    QJsonObject m_settings;
    QJsonObject m_playlistDetail;
    QJsonObject m_accounts;
    QJsonObject m_userPlaylistsByPlatform;
    QJsonArray m_userPlaylists;
    QJsonArray m_homePlaylists;
    QJsonArray m_localSongs;
    QJsonObject m_storageRoot;
    JsonListModel m_songsModel;
    JsonListModel m_queueModel;
    JsonListModel m_lyricsModel;
    JsonListModel m_playlistsModel;
    JsonListModel m_homePlaylistsModel;
    JsonListModel m_localSongsModel;
    QSet<QString> m_pendingCoverDownloads;
    QSet<QString> m_pendingAvatarDownloads;
    QHash<QString, QJsonObject> m_playlistCache;
    QString m_storagePath;
    QString m_cookie;
    QString m_qqCookie;
    QString m_kugouCookie;
    QString m_kugouDfid;
    QString m_loginQrKey;
    QString m_kugouLoginUuid;
    QString m_platform = QStringLiteral("netease");
    QString m_viewMode = QStringLiteral("discover");
    QString m_repeatMode = QStringLiteral("off");
    bool m_shuffle = false;
    QString m_searchQuery;
    QStringList m_searchHistory;
    QStringList m_metaQueue;
    int m_metaSongIndex = -1;
    QString m_toast;
    QString m_loginPlatform = QStringLiteral("netease");
    QString m_loginStatus;
    QString m_loginQrImage;
    int m_currentIndex = -1;
    int m_volume = 80;
    int m_volumeBeforeMute = 80;
    quint64 m_playRequestSerial = 0;
    quint64 m_playlistRequestSerial = 0;
    QString m_activePlaylistKey;
    quint16 m_neteasePort = 0;
    quint16 m_qqPort = 0;
    quint16 m_kugouPort = 0;
    QRect m_beforeFullscreenGeometry;
    bool m_beforeFullscreenMaximized = false;
    bool m_fullLyrics = false;
    bool m_fullscreen = false;
    bool m_desktopLyricActive = false;
    bool m_queueDrawerOpen = false;
    bool m_loginModalOpen = false;
    bool m_ownsLocalApi = false;
    bool m_busy = false;
    bool m_muted = false;
    bool m_sidecarReady = false;
    bool m_playRecoveryAttempted = false;
    QString m_lastError;
    QTimer m_loginTimer;
    QTimer m_storageSaveTimer;
    bool m_storageDirty = false;
};
