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

  // Lyrics & UI State
  isFullLyricsMode: boolean;
  lyrics: LyricLine[];
  activeTab: 'listen-now' | 'browse' | 'local' | 'playlist' | 'settings';
  selectedPlaylist: Playlist | null;
  toastMessage: string | null;

  // Settings & Motion Controls State
  isFluidBgEnabled: boolean;
  enableLyricAnimation: boolean;
  enableLyricGlow: boolean;
  enableLyricBlur: boolean;
  enableArtworkAnimation: boolean;
  lyricFontSize: 'normal' | 'large';

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
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setFullLyricsMode: (open: boolean) => void;
  setActiveTab: (tab: 'listen-now' | 'browse' | 'local' | 'playlist' | 'settings') => void;
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

  isFullLyricsMode: false,
  lyrics: [],
  activeTab: 'listen-now',
  selectedPlaylist: null,
  toastMessage: null,

  // Default motion toggles
  isFluidBgEnabled: true,
  enableLyricAnimation: true,
  enableLyricGlow: true,
  enableLyricBlur: true,
  enableArtworkAnimation: true,
  lyricFontSize: 'large',

  user: null,
  playlists: [],
  isLoginModalOpen: false,

  setCurrentSong: (song) => set({ currentSong: song }),

  playSong: async (song, newQueue) => {
    // Check VIP Access & Trigger Toast
    const isVipSong = song.isVip || (song.fee !== undefined && song.fee > 0);
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
}));
