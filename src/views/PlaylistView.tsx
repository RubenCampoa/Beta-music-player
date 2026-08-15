import React, { useEffect, useState } from 'react';
import { Play, Music, ListMusic } from 'lucide-react';
import { Song } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { shallow } from 'zustand/shallow';
import { getOptimizedCoverUrl, cleanTitle, handleImageError } from '../utils/format';
import { musicApiAdapter } from '../services/musicApiAdapter';
import { getPlatformName } from '../utils/platform';

export const PlaylistView: React.FC = () => {
  const { selectedPlaylist, playSong, currentSong, isPlaying, activePlatform } = usePlayerStore(
    (state) => ({
      selectedPlaylist: state.selectedPlaylist,
      playSong: state.playSong,
      currentSong: state.currentSong,
      isPlaying: state.isPlaying,
      activePlatform: state.activePlatform,
    }),
    shallow,
  );
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [playlistCoverFallback, setPlaylistCoverFallback] = useState('');

  useEffect(() => {
    if (!selectedPlaylist) {
      setSongs([]);
      setPlaylistCoverFallback('');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setSongs([]);
    setPlaylistCoverFallback('');
    const fetchSongs = async () => {
      setIsLoading(true);
      try {
        // Always use the playlist's own platform, not activePlatform.
        // A playlist created on QQ Music must be fetched from QQ Music even
        // if the user has since switched the active platform to NetEase.
        const platform = selectedPlaylist.platform || activePlatform;
        const trackList = await musicApiAdapter.getPlaylistSongs(
          platform,
          selectedPlaylist.id
        );
        if (cancelled) return;
        setSongs(trackList);
        if (!selectedPlaylist.coverImgUrl) {
          setPlaylistCoverFallback(trackList.find((song) => song.coverUrl)?.coverUrl || '');
        }

        // If this is a user favorite playlist or user playlist on QQ Music,
        // sync song mids to store so heart icons light up in red instantly
        if (platform === 'qq' || String(selectedPlaylist.id).startsWith('qq_')) {
          const isFav =
            selectedPlaylist.isUserPlaylist ||
            selectedPlaylist.name.includes('我喜欢') ||
            selectedPlaylist.name.includes('喜欢');
          if (isFav && trackList.length > 0) {
            const mids: string[] = [];
            trackList.forEach((s) => {
              if (s.songmid) mids.push(s.songmid);
              const clean = String(s.id).replace(/^qq_/, '');
              if (clean) mids.push(clean);
            });
            usePlayerStore.getState().setQqLikeMids(mids);
          }
        }
      } catch (error) {
        console.warn('Failed to load playlist songs:', error);
        if (!cancelled) setSongs([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSongs();
    return () => {
      cancelled = true;
    };
  }, [selectedPlaylist, activePlatform]);

  if (!selectedPlaylist) return null;

  const isQqPlaylist = selectedPlaylist.platform === 'qq' || String(selectedPlaylist.id).startsWith('qq_');
  const isKugouPlaylist = selectedPlaylist.platform === 'kugou' || String(selectedPlaylist.id).startsWith('kg_');
  const playlistPlatform = isQqPlaylist ? 'qq' : isKugouPlaylist ? 'kugou' : 'netease';
  const playlistCoverUrl = selectedPlaylist.coverImgUrl || playlistCoverFallback || songs.find((song) => song.coverUrl)?.coverUrl || '';

  const handlePlaylistCoverError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // KuGou's private/favourite lists occasionally return a stale cover URL
    // even though their track artwork is valid. Show the first real track art
    // before falling back to the generic placeholder.
    const firstTrackCover = songs.find((song) => song.coverUrl)?.coverUrl || '';
    if (selectedPlaylist.coverImgUrl && firstTrackCover && playlistCoverFallback !== firstTrackCover) {
      setPlaylistCoverFallback(firstTrackCover);
      return;
    }
    handleImageError(event);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-12 select-none animate-fadeIn">
      {/* Playlist Header */}
      <div className="flex items-end space-x-6 glass-panel rounded-2xl p-6 border border-white/10">
        <div className="relative w-40 h-40 rounded-xl overflow-hidden shadow-2xl border border-white/15 shrink-0">
          <img
            src={getOptimizedCoverUrl(playlistCoverUrl, 400)}
            alt={selectedPlaylist.name}
            className="w-full h-full object-cover"
            onError={handlePlaylistCoverError}
          />
        </div>

        <div className="flex flex-col space-y-3">
          <div
            className={`flex items-center space-x-2 text-xs font-bold uppercase tracking-wider ${
              isQqPlaylist ? 'text-emerald-400' : isKugouPlaylist ? 'text-sky-400' : 'text-apple-red'
            }`}
          >
            <ListMusic className="w-4 h-4" />
            <span>{getPlatformName(playlistPlatform)}歌单</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight">{selectedPlaylist.name}</h1>

          {selectedPlaylist.description && (
            <p className="text-xs text-white/60 line-clamp-2 max-w-xl">{selectedPlaylist.description}</p>
          )}

          <div className="pt-1 flex items-center space-x-4">
            <button
              onClick={() => songs[0] && playSong(songs[0], songs)}
              disabled={isLoading || songs.length === 0}
              className={`flex items-center space-x-2 text-white font-semibold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg cursor-pointer ${
                isQqPlaylist
                  ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'
                  : isKugouPlaylist
                    ? 'bg-sky-500 hover:bg-sky-600 shadow-sky-500/30'
                    : 'bg-apple-red hover:bg-apple-red/90 shadow-apple-red/30'
              }`}
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>播放全部 ({songs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Playlist Tracks Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center text-white/40 space-y-2">
            <Music
              className={`w-8 h-8 mx-auto animate-spin ${isQqPlaylist ? 'text-emerald-400' : isKugouPlaylist ? 'text-sky-400' : 'text-apple-red'}`}
            />
            <p className="text-sm">获取 {getPlatformName(playlistPlatform)}歌曲列表中...</p>
          </div>
        ) : songs.length === 0 ? (
          <div className="py-16 text-center text-white/40 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">歌单暂无歌曲</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse min-w-[550px]">
            <thead>
              <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider font-semibold whitespace-nowrap">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">标题</th>
                <th className="py-3 px-4">歌手</th>
                <th className="py-3 px-4">专辑</th>
                <th className="py-3 px-4 text-right">时长</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {songs.map((song, idx) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <tr
                    key={song.id}
                    onClick={() => playSong(song, songs)}
                    className={`group hover:bg-white/10 transition-colors cursor-pointer ${
                      isCurrent ? 'bg-white/15 text-apple-red font-semibold' : 'text-white/80'
                    }`}
                  >
                    <td className="py-3 px-4 text-center text-white/40 group-hover:text-white whitespace-nowrap">
                      {isCurrent && isPlaying ? (
                        <Play className="w-3.5 h-3.5 text-apple-red fill-current mx-auto animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="py-3 px-4 flex items-center space-x-3 whitespace-nowrap">
                      <img
                        src={getOptimizedCoverUrl(song.coverUrl, 100)}
                        alt={song.name}
                        loading="lazy"
                        decoding="async"
                        className="w-9 h-9 rounded-md object-cover border border-white/10 shrink-0"
                        onError={handleImageError}
                      />
                      <span className="truncate max-w-[220px] text-white font-medium flex items-center space-x-1.5">
                        <span className="truncate">{cleanTitle(song.name)}</span>
                        {Boolean(song.isVip) && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider whitespace-nowrap">
                            VIP
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/70 truncate max-w-[150px] whitespace-nowrap">{cleanTitle(song.artist)}</td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-[150px] whitespace-nowrap">{cleanTitle(song.album)}</td>
                    <td className="py-3 px-4 text-right text-white/50 font-mono whitespace-nowrap">
                      {formatDuration(song.duration)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
