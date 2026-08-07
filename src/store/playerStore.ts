import { create } from 'zustand';
import { Song, LyricLine, UserProfile, Playlist, Platform } from '../types/music';
import { neteaseApi } from '../services/neteaseApi';
import { musicApiAdapter } from '../services/musicApiAdapter';
import { qqMusicApi } from '../services/qqMusicApi';
import { StorageKeys, loadJSON, saveJSON, getItem, setItem, removeItem } from '../utils/storage';

interface PlayerState {
  // Audio & Playback state
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  // Direct reference to the <audio> element, so time-sensitive renderers
  // (e.g. karaoke words) can read the exact media clock every frame instead
  // of extrapolating from the coarse ~250ms timeupdate snapshots.
  audioElement: HTMLAudioElement | null;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Song[];
  queueIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  isShuffle: boolean;

  // Queue Drawer State
  isQueueOpen: boolean;

  // Multi-Platform & User Accounts
  activePlatform: Platform;
  searchPlatform: Platform;
  accounts: { netease: UserProfile | null; qq: UserProfile | null };
  user: UserProfile | null;
  playlists: Playlist[];
  isLoginModalOpen: boolean;
  loginModalPlatform: Platform;

  // Search State
  searchQuery: string;
  searchResults: Song[];
  searchPlatformResults: { netease: Song[]; qq: Song[] };
  searchHistory: string[];
  isSearching: boolean;

  // Lyrics & UI State
  isFullLyricsMode: boolean;
  lyrics: LyricLine[];
  activeTab: 'listen-now' | 'browse' | 'local' | 'playlist' | 'search' | 'changelog' | 'settings' | 'notice' | 'about';
  selectedPlaylist: Playlist | null;
  toastMessage: string | null;

  // Favorite Songs State
  favoriteSongs: Song[];
  neteaseLikeIds: number[];
  setNeteaseLikeIds: (ids: number[]) => void;
  qqLikeMids: string[];
  setQqLikeMids: (mids: string[]) => void;
  toggleFavorite: (song: Song) => void;
  isFavorite: (songId: string | number) => boolean;

  // Settings & Motion Controls State
  isFluidBgEnabled: boolean;
  // Per-song lyric line switch offset in milliseconds (positive = earlier,
  // negative = later). Resets to 0 (default) whenever a new song plays.
  lyricSwitchOffsetMs: number;
  enableLyricAnimation: boolean;
  enableLyricGlow: boolean;
  enableLyricBlur: boolean;
  enableArtworkAnimation: boolean;
  lyricFontSize: 'normal' | 'large';
  autoCheckUpdate: boolean;

  // Actions
  setCurrentSong: (song: Song) => void;
  updateCurrentSongAudioUrl: (audioUrl: string) => void;
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  togglePlayPause: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setQueue: (queue: Song[]) => void;
  removeFromQueue: (songId: string) => void;
  clearQueue: () => void;
  toggleQueueDrawer: () => void;
  setQueueOpen: (open: boolean) => void;

  // Multi-Platform Actions
  setActivePlatform: (platform: Platform) => void;
  setSearchPlatform: (platform: Platform) => void;
  setLoginModalPlatform: (platform: Platform) => void;
  setAccount: (platform: Platform, user: UserProfile | null) => void;
  switchAccountPlatform: (platform: Platform) => void;
  refreshPlaylistsForPlatform: (platform: Platform) => Promise<void>;

  // Search Actions
  setSearchQuery: (query: string) => void;
  performSearch: (query: string, searchPlatformOverride?: Platform) => Promise<void>;
  removeSearchHistoryItem: (query: string) => void;
  clearSearchHistory: () => void;

  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setFullLyricsMode: (open: boolean) => void;
  setActiveTab: (tab: PlayerState['activeTab']) => void;
  setSelectedPlaylist: (playlist: Playlist | null) => void;

  setUser: (user: UserProfile | null) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setIsLoginModalOpen: (open: boolean) => void;
  setToastMessage: (msg: string | null) => void;

  setIsFluidBgEnabled: (enabled: boolean) => void;
  setLyricSwitchOffsetMs: (ms: number) => void;
  setEnableLyricAnimation: (enabled: boolean) => void;
  setEnableLyricGlow: (enabled: boolean) => void;
  setEnableLyricBlur: (enabled: boolean) => void;
  setEnableArtworkAnimation: (enabled: boolean) => void;
  setLyricFontSize: (size: 'normal' | 'large') => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
}

// Initial state helpers
const initialHistory = (() => {
  return loadJSON<string[]>(StorageKeys.searchHistory, []);
})();

const initialFavorites = (() => {
  return loadJSON<Song[]>(StorageKeys.favoriteSongs, []);
})();

const initialAutoCheck = (() => {
  return loadJSON<boolean>(StorageKeys.autoCheckUpdate, true);
})();

const initialPlatform: Platform = (getItem(StorageKeys.activePlatform) as Platform) || 'netease';

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Playback & Queue
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  audioElement: null,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  queue: [],
  queueIndex: 0,
  repeatMode: 'off',
  isShuffle: false,
  isQueueOpen: false,

  // Multi-Platform & User Accounts
  activePlatform: initialPlatform,
  searchPlatform: initialPlatform,
  accounts: {
    netease: null,
    qq: qqMusicApi.getCookie() ? { userId: 'qq_user', nickname: 'QQ 音乐用户', avatarUrl: '', isLoggedIn: true, platform: 'qq' } : null,
  },
  user: null,
  playlists: [],
  isLoginModalOpen: false,
  loginModalPlatform: 'netease',

  // Search State
  searchQuery: '',
  searchResults: [],
  searchPlatformResults: { netease: [], qq: [] },
  searchHistory: initialHistory,
  isSearching: false,

  // Lyrics & UI State
  isFullLyricsMode: false,
  lyrics: [],
  activeTab: 'listen-now',
  selectedPlaylist: null,
  toastMessage: null,

  // Favorites
  favoriteSongs: initialFavorites,
  neteaseLikeIds: [],
  setNeteaseLikeIds: (neteaseLikeIds) => set({ neteaseLikeIds }),
  qqLikeMids: [],
  setQqLikeMids: (mids) =>
    set((state) => ({
      qqLikeMids: Array.from(new Set([...state.qqLikeMids, ...mids])),
    })),

  // Motion Settings
  isFluidBgEnabled: true,
  lyricSwitchOffsetMs: 0,
  enableLyricAnimation: true,
  enableLyricGlow: true,
  enableLyricBlur: true,
  enableArtworkAnimation: true,
  lyricFontSize: 'normal',
  autoCheckUpdate: initialAutoCheck,

  // --- Actions ---
  setCurrentSong: (currentSong) => set({ currentSong }),

  // Replace the resolved audio URL of the song that is currently playing.
  // Used by the AudioController retry path when a signed CDN URL expires or
  // a transient network error breaks the media element.
  updateCurrentSongAudioUrl: (audioUrl) =>
    set((state) => (state.currentSong ? { currentSong: { ...state.currentSong, audioUrl } } : {})),

  playSong: async (song, newQueue) => {
    const { queue } = get();
    const finalQueue = newQueue || (queue.length > 0 ? queue : [song]);
    const index = finalQueue.findIndex((s) => s.id === song.id);

    // Resolve fresh audio URL FIRST before setting currentSong so that currentSong
    // always carries a valid audioUrl on the very first state update for instant autoplay.
    let resolvedAudioUrl = song.audioUrl || '';
    if (song.source !== 'local') {
      try {
        const fetchedUrl = await musicApiAdapter.getSongAudioUrl(song);
        if (fetchedUrl) resolvedAudioUrl = fetchedUrl;
      } catch {}
    }

    const playTarget: Song = { ...song, audioUrl: resolvedAudioUrl };

    set({
      currentSong: playTarget,
      isPlaying: true,
      currentTime: 0,
      duration: song.duration || 0,
      queue: finalQueue,
      queueIndex: index >= 0 ? index : 0,
      lyrics: [],
      // Per-song lyric switch offset: next song starts from the 0ms default.
      lyricSwitchOffsetMs: 0,
    });

    if (!resolvedAudioUrl && song.source !== 'local') {
      set({ isPlaying: false });
      const platformName = song.source === 'qq' ? 'QQ 音乐' : '网易云音乐';
      get().setToastMessage(`无法获取《${song.name}》音源，该歌曲可能需要登录 ${platformName} VIP 账号`);
      return;
    }

    // Resolve Lyrics asynchronously in background without blocking audio player startup
    setTimeout(async () => {
      if (get().currentSong?.id !== song.id) return;
      try {
        const lyrics = await musicApiAdapter.getSongLyrics(song);
        if (get().currentSong?.id === song.id && lyrics.length > 0) {
          set({ lyrics });
        }
      } catch {}
    }, 30);
  },

  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setAudioElement: (audioElement) => set({ audioElement }),
  setDuration: (duration) => set({ duration }),

  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  nextSong: () => {
    const { queue, queueIndex, repeatMode, isShuffle, playSong } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      nextIndex = repeatMode === 'all' ? 0 : queueIndex;
    }

    if (queue[nextIndex]) {
      playSong(queue[nextIndex], queue);
    }
  },

  prevSong: () => {
    const { queue, queueIndex, playSong } = get();
    if (queue.length === 0) return;
    const prevIndex = queueIndex - 1 < 0 ? queue.length - 1 : queueIndex - 1;
    if (queue[prevIndex]) {
      playSong(queue[prevIndex], queue);
    }
  },

  setQueue: (queue) => set({ queue }),
  removeFromQueue: (songId) =>
    set((state) => {
      const newQueue = state.queue.filter((s) => s.id !== songId);
      const newIndex = state.currentSong ? newQueue.findIndex((s) => s.id === state.currentSong?.id) : 0;
      return { queue: newQueue, queueIndex: Math.max(0, newIndex) };
    }),
  clearQueue: () => set({ queue: [], queueIndex: 0 }),
  toggleQueueDrawer: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
  setQueueOpen: (isQueueOpen) => set({ isQueueOpen }),

  // --- Multi-Platform Actions ---
  setActivePlatform: (activePlatform) => {
    setItem(StorageKeys.activePlatform, activePlatform);
    set({
      activePlatform,
      user: get().accounts[activePlatform] || null,
      // Clear stale playlists and selection from the previous platform so
      // the sidebar doesn't show the old platform's covers under the new
      // platform's label while the async refresh is in flight (or if it
      // fails because the user isn't logged in to the new platform).
      playlists: [],
      selectedPlaylist: null,
      // Reset to the home tab: the playlist detail view returns null when
      // selectedPlaylist is cleared, which would render a blank white area
      // if the user was viewing a playlist at the time of the switch.
      activeTab: 'listen-now',
    });
    get().setToastMessage(`已切换为 ${activePlatform === 'qq' ? 'QQ 音乐' : '网易云音乐'} 平台`);
    // Reload user playlists for the newly active platform
    get().refreshPlaylistsForPlatform(activePlatform);
  },

  refreshPlaylistsForPlatform: async (platform) => {
    try {
      if (platform === 'qq') {
        if (!qqMusicApi.getCookie()) {
          if (get().activePlatform === 'qq') set({ playlists: [] });
          return;
        }
        const userPlaylists = await qqMusicApi.getUserPlaylists();
        if (get().activePlatform === 'qq') {
          set({ playlists: userPlaylists });
        }
      } else {
        const account = get().accounts.netease || (await neteaseApi.getUserAccount());
        if (account) {
          const userPlaylists = await neteaseApi.getUserPlaylists(Number(account.userId) || 0);
          if (get().activePlatform === 'netease') {
            set({ playlists: userPlaylists });
          }
        } else if (get().activePlatform === 'netease') {
          set({ playlists: [] });
        }
      }
    } catch {
      // Keep previous playlist list on failure
    }
  },

  setSearchPlatform: (searchPlatform) => set({ searchPlatform }),
  setLoginModalPlatform: (loginModalPlatform) => set({ loginModalPlatform }),

  setAccount: (platform, accountUser) =>
    set((state) => {
      const updatedAccounts = {
        ...state.accounts,
        [platform]: accountUser,
      };
      return {
        accounts: updatedAccounts,
        user: state.activePlatform === platform ? accountUser : state.user,
      };
    }),

  switchAccountPlatform: (platform) => {
    get().setActivePlatform(platform);
  },

  // --- Search Actions ---
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  performSearch: async (query, searchPlatformOverride) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const targetPlatform = searchPlatformOverride || get().searchPlatform;

    // Update search history
    const currentHistory = get().searchHistory;
    const filtered = currentHistory.filter((item) => item !== trimmed);
    const updatedHistory = [trimmed, ...filtered].slice(0, 10);
    try {
      saveJSON(StorageKeys.searchHistory, updatedHistory);
    } catch {}

    set({
      searchHistory: updatedHistory,
      isSearching: true,
      searchQuery: trimmed,
      searchPlatform: targetPlatform,
      activeTab: 'search',
    });

    try {
      const results = await musicApiAdapter.search(targetPlatform, trimmed);
      set((state) => ({
        searchResults: results,
        searchPlatformResults: {
          ...state.searchPlatformResults,
          [targetPlatform]: results,
        },
        isSearching: false,
      }));
    } catch {
      set({ searchResults: [], isSearching: false });
    }
  },

  removeSearchHistoryItem: (item) => {
    const updatedHistory = get().searchHistory.filter((h) => h !== item);
    try {
      saveJSON(StorageKeys.searchHistory, updatedHistory);
    } catch {}
    set({ searchHistory: updatedHistory });
  },

  clearSearchHistory: () => {
    try {
      removeItem(StorageKeys.searchHistory);
    } catch {}
    set({ searchHistory: [] });
  },

  toggleRepeat: () =>
    set((state) => ({
      repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off',
    })),

  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),

  setFullLyricsMode: (isFullLyricsMode) => set({ isFullLyricsMode }),

  setActiveTab: (activeTab) => set({ activeTab, selectedPlaylist: null }),
  setSelectedPlaylist: (selectedPlaylist) => set({ selectedPlaylist, activeTab: 'playlist' }),

  setUser: (user) => set({ user }),
  setPlaylists: (playlists) => set({ playlists }),
  setIsLoginModalOpen: (isLoginModalOpen) => set({ isLoginModalOpen }),

  setToastMessage: (toastMessage) => {
    set({ toastMessage });
    if (toastMessage) {
      setTimeout(() => {
        if (get().toastMessage === toastMessage) {
          set({ toastMessage: null });
        }
      }, 5000);
    }
  },

  setIsFluidBgEnabled: (isFluidBgEnabled) => set({ isFluidBgEnabled }),
  setLyricSwitchOffsetMs: (lyricSwitchOffsetMs) => set({ lyricSwitchOffsetMs }),
  setEnableLyricAnimation: (enableLyricAnimation) => set({ enableLyricAnimation }),
  setEnableLyricGlow: (enableLyricGlow) => set({ enableLyricGlow }),
  setEnableLyricBlur: (enableLyricBlur) => set({ enableLyricBlur }),
  setEnableArtworkAnimation: (enableArtworkAnimation) => set({ enableArtworkAnimation }),
  setLyricFontSize: (lyricFontSize) => set({ lyricFontSize }),

  setAutoCheckUpdate: (autoCheckUpdate) => {
    try {
      saveJSON(StorageKeys.autoCheckUpdate, autoCheckUpdate);
    } catch {}
    set({ autoCheckUpdate });
  },

  toggleFavorite: async (song) => {
    const isFav = get().isFavorite(song.id);
    const favorites = get().favoriteSongs;
    let updatedFavorites: Song[];
    let msg: string;

    const strId = String(song.id);
    const cleanId = strId.replace(/^(netease-|qq_|qq_rec_)/, '');
    const numericId = song.neteaseId || Number(cleanId);
    const qqMid = song.songmid || (song.source === 'qq' || strId.startsWith('qq_') ? cleanId : '');

    if (isFav) {
      updatedFavorites = favorites.filter(
        (s) =>
          s.id !== song.id &&
          (numericId === 0 || s.neteaseId !== numericId) &&
          (!qqMid || (s.songmid !== qqMid && String(s.id).replace(/^(qq_|qq_rec_)/, '') !== qqMid))
      );
      msg = `已取消收藏歌曲：${song.name}`;

      if (numericId > 0 && song.source === 'netease') {
        set((state) => ({
          neteaseLikeIds: state.neteaseLikeIds.filter((id) => id !== numericId),
        }));
        neteaseApi.likeSong(numericId, false).catch(() => {});
      }
      if (qqMid) {
        set((state) => ({
          qqLikeMids: state.qqLikeMids.filter((m) => m !== qqMid && m !== cleanId),
        }));
      }
    } else {
      updatedFavorites = [song, ...favorites.filter((s) => s.id !== song.id)];
      msg = `已成功收藏歌曲：${song.name}`;

      if (numericId > 0 && song.source === 'netease') {
        set((state) => ({
          neteaseLikeIds: [numericId, ...state.neteaseLikeIds.filter((id) => id !== numericId)],
        }));
        neteaseApi.likeSong(numericId, true).catch(() => {});
      }
      if (qqMid) {
        set((state) => ({
          qqLikeMids: Array.from(new Set([qqMid, cleanId, ...state.qqLikeMids])),
        }));
      }
    }

    try {
      saveJSON(StorageKeys.favoriteSongs, updatedFavorites);
    } catch {}

    set({ favoriteSongs: updatedFavorites });
    get().setToastMessage(msg);
  },

  isFavorite: (songId) => {
    if (!songId) return false;
    const strId = String(songId);
    const cleanId = strId.replace(/^(netease-|qq_|qq_rec_)/, '');
    const numericId = Number(cleanId);

    const inLocal = get().favoriteSongs.some((s) => {
      const sId = String(s.id);
      const sCleanId = sId.replace(/^(netease-|qq_|qq_rec_)/, '');
      return (
        sId === strId ||
        sCleanId === cleanId ||
        (Boolean(s.songmid) && (s.songmid === strId || s.songmid === cleanId)) ||
        (numericId > 0 && isFinite(numericId) && s.neteaseId === numericId)
      );
    });

    const inNetease = numericId > 0 && isFinite(numericId) && get().neteaseLikeIds.includes(numericId);
    const inQq = Boolean(cleanId) && (get().qqLikeMids.includes(cleanId) || get().qqLikeMids.includes(strId));
    return inLocal || inNetease || inQq;
  },
}));
