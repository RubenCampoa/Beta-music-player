import { create } from 'zustand';
import { Song, LyricLine, UserProfile, Playlist } from '../types/music';
import { neteaseApi } from '../services/neteaseApi';

interface PlayerState {
  // Audio & Playback state
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Song[];
  queueIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  isShuffle: boolean;

  // Queue Drawer State
  isQueueOpen: boolean;

  // Search State
  searchQuery: string;
  searchResults: Song[];
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
  toggleFavorite: (song: Song) => void;
  isFavorite: (songId: string | number) => boolean;

  // Settings & Motion Controls State
  isFluidBgEnabled: boolean;
  enableLyricAnimation: boolean;
  enableLyricGlow: boolean;
  enableLyricBlur: boolean;
  enableArtworkAnimation: boolean;
  lyricFontSize: 'normal' | 'large';
  autoCheckUpdate: boolean;

  // NetEase User & Playlists
  user: UserProfile | null;
  playlists: Playlist[];
  isLoginModalOpen: boolean;

  // Actions
  setCurrentSong: (song: Song) => void;
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  togglePlayPause: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
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

  // Search Actions
  setSearchQuery: (query: string) => void;
  performSearch: (query: string) => Promise<void>;
  removeSearchHistoryItem: (query: string) => void;
  clearSearchHistory: () => void;

  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setFullLyricsMode: (open: boolean) => void;
  setActiveTab: (tab: 'listen-now' | 'browse' | 'local' | 'playlist' | 'search' | 'changelog' | 'settings' | 'notice' | 'about') => void;
  setSelectedPlaylist: (playlist: Playlist | null) => void;
  setUser: (user: UserProfile | null) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setIsLoginModalOpen: (open: boolean) => void;
  setToastMessage: (msg: string | null) => void;

  // Settings Actions
  setIsFluidBgEnabled: (enabled: boolean) => void;
  setEnableLyricAnimation: (enabled: boolean) => void;
  setEnableLyricGlow: (enabled: boolean) => void;
  setEnableLyricBlur: (enabled: boolean) => void;
  setEnableArtworkAnimation: (enabled: boolean) => void;
  setLyricFontSize: (size: 'normal' | 'large') => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  queue: [],
  queueIndex: 0,
  repeatMode: 'off',
  isShuffle: false,

  isQueueOpen: false,

  searchQuery: '',
  searchResults: [],
  searchHistory: (() => {
    try {
      return JSON.parse(localStorage.getItem('search_history') || '[]');
    } catch {
      return [];
    }
  })(),
  isSearching: false,

  isFullLyricsMode: false,
  lyrics: [],
  activeTab: 'listen-now',
  selectedPlaylist: null,
  favoriteSongs: (() => {
    try {
      return JSON.parse(localStorage.getItem('favorite_songs') || '[]');
    } catch {
      return [];
    }
  })(),
  neteaseLikeIds: [],
  setNeteaseLikeIds: (neteaseLikeIds) => set({ neteaseLikeIds }),
  toastMessage: null,

  // Default motion & app settings
  isFluidBgEnabled: true,
  enableLyricAnimation: true,
  enableLyricGlow: true,
  enableLyricBlur: true,
  enableArtworkAnimation: true,
  lyricFontSize: 'large',
  autoCheckUpdate: (() => {
    try {
      const saved = localStorage.getItem('auto_check_update');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  })(),

  user: null,
  playlists: [],
  isLoginModalOpen: false,

  setCurrentSong: (song) => set({ currentSong: song }),

  playSong: async (song, newQueue) => {
    // Check VIP Streaming Access & Trigger Toast
    const isVipSong = Boolean(song.isVip || song.fee === 1);
    if (isVipSong) {
      const user = get().user;
      const isUserVip = user && user.isLoggedIn && (user.vipType ?? 0) > 0;
      if (!isUserVip) {
        set({ toastMessage: '当前未开通网易云VIP，无法收听VIP歌曲' });
        setTimeout(() => {
          if (get().toastMessage === '当前未开通网易云VIP，无法收听VIP歌曲') {
            set({ toastMessage: null });
          }
        }, 4000);
      }
    }

    let queue = newQueue || get().queue;
    if (!queue.find((s) => s.id === song.id)) {
      queue = [song, ...queue];
    }
    const queueIndex = queue.findIndex((s) => s.id === song.id);

    set({
      currentSong: song,
      queue,
      queueIndex,
      isPlaying: true,
      currentTime: 0,
    });

    // Fetch lyrics if NetEase track or lyrics missing
    if (song.source === 'netease' && song.neteaseId) {
      const fetchedLyrics = await neteaseApi.getSongLyrics(song.neteaseId);
      set({ lyrics: fetchedLyrics });
    } else if (song.lyric) {
      set({ lyrics: song.lyric });
    } else {
      set({
        lyrics: [
          { time: 0, text: `♪ ${song.name} - ${song.artist}` },
          { time: 5, text: '本地音频播放中' },
        ],
      });
    }
  },

  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
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
      const newIndex = state.currentSong
        ? newQueue.findIndex((s) => s.id === state.currentSong?.id)
        : 0;
      return { queue: newQueue, queueIndex: Math.max(0, newIndex) };
    }),
  clearQueue: () => set({ queue: [], queueIndex: 0 }),
  toggleQueueDrawer: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
  setQueueOpen: (isQueueOpen) => set({ isQueueOpen }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  performSearch: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Update history deduplicated max 10
    const currentHistory = get().searchHistory;
    const filtered = currentHistory.filter((item) => item !== trimmed);
    const updatedHistory = [trimmed, ...filtered].slice(0, 10);
    try {
      localStorage.setItem('search_history', JSON.stringify(updatedHistory));
    } catch {}

    set({
      searchHistory: updatedHistory,
      isSearching: true,
      searchQuery: trimmed,
      activeTab: 'search',
    });
    try {
      const results = await neteaseApi.searchSongs(trimmed);
      set({ searchResults: results, isSearching: false });
    } catch {
      set({ searchResults: [], isSearching: false });
    }
  },

  removeSearchHistoryItem: (item) => {
    const updatedHistory = get().searchHistory.filter((h) => h !== item);
    try {
      localStorage.setItem('search_history', JSON.stringify(updatedHistory));
    } catch {}
    set({ searchHistory: updatedHistory });
  },

  clearSearchHistory: () => {
    try {
      localStorage.removeItem('search_history');
    } catch {}
    set({ searchHistory: [] });
  },

  toggleRepeat: () =>
    set((state) => ({
      repeatMode:
        state.repeatMode === 'off'
          ? 'all'
          : state.repeatMode === 'all'
          ? 'one'
          : 'off',
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
  setEnableLyricAnimation: (enableLyricAnimation) => set({ enableLyricAnimation }),
  setEnableLyricGlow: (enableLyricGlow) => set({ enableLyricGlow }),
  setEnableLyricBlur: (enableLyricBlur) => set({ enableLyricBlur }),
  setEnableArtworkAnimation: (enableArtworkAnimation) => set({ enableArtworkAnimation }),
  setLyricFontSize: (lyricFontSize) => set({ lyricFontSize }),
  setAutoCheckUpdate: (autoCheckUpdate) => {
    try {
      localStorage.setItem('auto_check_update', JSON.stringify(autoCheckUpdate));
    } catch {}
    set({ autoCheckUpdate });
  },

  toggleFavorite: async (song) => {
    const isFav = get().isFavorite(song.id);
    const favorites = get().favoriteSongs;
    let updatedFavorites: Song[];
    let msg: string;

    const strId = String(song.id);
    const numericId = song.neteaseId || Number(strId.replace(/^netease-/, ''));

    if (isFav) {
      updatedFavorites = favorites.filter((s) => s.id !== song.id && (numericId === 0 || s.neteaseId !== numericId));
      msg = `已取消收藏歌曲：${song.name}`;
      if (numericId > 0) {
        set((state) => ({
          neteaseLikeIds: state.neteaseLikeIds.filter((id) => id !== numericId),
        }));
        neteaseApi.likeSong(numericId, false).catch(() => {});
      }
    } else {
      updatedFavorites = [song, ...favorites.filter((s) => s.id !== song.id)];
      msg = `已成功收藏歌曲：${song.name}`;
      if (numericId > 0) {
        set((state) => ({
          neteaseLikeIds: [numericId, ...state.neteaseLikeIds.filter((id) => id !== numericId)],
        }));
        neteaseApi.likeSong(numericId, true).catch(() => {});
      }
    }

    try {
      localStorage.setItem('favorite_songs', JSON.stringify(updatedFavorites));
    } catch {}

    set({ favoriteSongs: updatedFavorites });
    get().setToastMessage(msg);
  },

  isFavorite: (songId) => {
    if (!songId) return false;
    const strId = String(songId);
    const numericId = Number(strId.replace(/^netease-/, ''));
    const inLocal = get().favoriteSongs.some(
      (s) => s.id === strId || (numericId > 0 && s.neteaseId === numericId)
    );
    const inNetease = numericId > 0 && get().neteaseLikeIds.includes(numericId);
    return inLocal || inNetease;
  },
}));

