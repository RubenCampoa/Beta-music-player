import React, { useEffect, useState } from 'react';
import { Play, Music, ListMusic } from 'lucide-react';
import { Song } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';

export const PlaylistView: React.FC = () => {
  const { selectedPlaylist, playSong, currentSong, isPlaying } = usePlayerStore();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedPlaylist) return;

    const fetchSongs = async () => {
      setIsLoading(true);
      const trackList = await neteaseApi.getPlaylistSongs(selectedPlaylist.id);
      setSongs(trackList);
      setIsLoading(false);
    };

    fetchSongs();
  }, [selectedPlaylist?.id]);

  if (!selectedPlaylist) return null;

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
            src={selectedPlaylist.coverImgUrl}
            alt={selectedPlaylist.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2 text-apple-red text-xs font-bold uppercase tracking-wider">
            <ListMusic className="w-4 h-4" />
            <span>网易云歌单</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {selectedPlaylist.name}
          </h1>

          {selectedPlaylist.description && (
            <p className="text-xs text-white/60 line-clamp-2 max-w-xl">
              {selectedPlaylist.description}
            </p>
          )}

          <div className="pt-1 flex items-center space-x-4">
            <button
              onClick={() => songs[0] && playSong(songs[0], songs)}
              className="flex items-center space-x-2 bg-apple-red hover:bg-apple-red/90 text-white font-semibold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg shadow-apple-red/30"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>播放全部 ({songs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Playlist Tracks Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        {isLoading ? (
          <div className="py-16 text-center text-white/40 space-y-2">
            <Music className="w-8 h-8 mx-auto animate-spin text-apple-red" />
            <p className="text-sm">获取歌曲列表中...</p>
          </div>
        ) : songs.length === 0 ? (
          <div className="py-16 text-center text-white/40 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">歌单暂无歌曲</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider font-semibold">
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
                    <td className="py-3 px-4 text-center text-white/40 group-hover:text-white">
                      {isCurrent && isPlaying ? (
                        <Play className="w-3.5 h-3.5 text-apple-red fill-current mx-auto animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="py-3 px-4 flex items-center space-x-3">
                      <img
                        src={song.coverUrl}
                        alt={song.name}
                        className="w-9 h-9 rounded-md object-cover border border-white/10"
                      />
                      <span className="truncate max-w-[220px] text-white font-medium flex items-center space-x-1.5">
                        <span className="truncate">{song.name}</span>
                        {song.isVip && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider">
                            VIP
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/70 truncate max-w-[150px]">
                      {song.artist}
                    </td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-[150px]">
                      {song.album}
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 font-mono">
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
