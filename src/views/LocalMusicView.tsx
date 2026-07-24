import React, { useEffect, useState } from 'react';
import { UploadCloud, Play, Trash2, FolderPlus, Music } from 'lucide-react';
import { Song } from '../types/music';
import { localMusicService } from '../services/localMusicService';
import { neteaseApi } from '../services/neteaseApi';
import { usePlayerStore } from '../store/playerStore';

export const LocalMusicView: React.FC = () => {
  const [localSongs, setLocalSongs] = useState<Song[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { playSong, currentSong, isPlaying } = usePlayerStore();

  const loadLocalSongs = async () => {
    const songs = await localMusicService.getAllLocalSongs();
    setLocalSongs(songs);
  };

  useEffect(() => {
    loadLocalSongs();
  }, []);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg)$/i.test(file.name)) {
        await localMusicService.addLocalAudioFile(file);
      }
    }
    await loadLocalSongs();
    setIsUploading(false);
  };

  const handleNativeSelectFiles = async () => {
    if (window.electronAPI) {
      const paths = await window.electronAPI.selectAudioFiles();
      if (paths && paths.length > 0) {
        setIsUploading(true);
        for (const filePath of paths) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Unknown';
          // Convert local path into File/Blob representation
          try {
            const resp = await fetch(`file:///${filePath}`);
            const blob = await resp.blob();
            const file = new File([blob], fileName, { type: 'audio/mpeg' });
            (file as any).path = filePath;
            await localMusicService.addLocalAudioFile(file);
          } catch (e) {
            console.warn('Native file load error:', e);
          }
        }
        await loadLocalSongs();
        setIsUploading(false);
      }
    }
  };

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await localMusicService.removeLocalSong(id);
    await loadLocalSongs();
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-12 select-none animate-fadeIn">
      {/* Header Info & File Import Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">本地音乐资料库</h1>
          <p className="text-xs text-white/60">
            共 {localSongs.length} 首歌曲 · 支持音频 ID3 标签与专辑封面自动解析
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {window.electronAPI && (
            <button
              onClick={handleNativeSelectFiles}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-2 rounded-full font-medium transition-all border border-white/15"
            >
              <FolderPlus className="w-4 h-4 text-apple-red" />
              <span>原生选择文件</span>
            </button>
          )}

          <label className="flex items-center space-x-2 bg-apple-red hover:bg-apple-red/90 text-white text-xs px-4 py-2 rounded-full font-medium transition-all cursor-pointer shadow-lg shadow-apple-red/20">
            <UploadCloud className="w-4 h-4" />
            <span>{isUploading ? '导入中...' : '导入本地音频'}</span>
            <input
              type="file"
              multiple
              accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>
        </div>
      </div>

      {/* Drag & Drop Import Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className="glass-panel border-2 border-dashed border-white/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-apple-red/60 transition-colors cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-full bg-apple-red/10 flex items-center justify-center group-hover:scale-110 transition-transform">
          <UploadCloud className="w-6 h-6 text-apple-red" />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-semibold text-white">拖拽音频文件到此处直接导入</span>
          <p className="text-xs text-white/50">支持 MP3, FLAC, WAV, M4A, AAC, OGG 常见音频格式</p>
        </div>
      </div>

      {/* Local Songs Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        {localSongs.length === 0 ? (
          <div className="py-16 text-center text-white/40 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">暂无本地音乐，请选择或拖拽文件导入</p>
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
                <th className="py-3 px-4 w-16 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {localSongs.map((song, idx) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <tr
                    key={song.id}
                    onClick={() => playSong(song, localSongs)}
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
                      <span className="truncate max-w-[200px] text-white font-medium">
                        {neteaseApi.cleanTitle(song.name)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/70 truncate max-w-[150px]">
                      {neteaseApi.cleanTitle(song.artist)}
                    </td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-[150px]">
                      {neteaseApi.cleanTitle(song.album)}
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 font-mono">
                      {formatDuration(song.duration)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => handleDeleteSong(song.id, e)}
                        className="p-1.5 rounded-full hover:bg-red-500/20 hover:text-red-400 text-white/30 transition-colors"
                        title="删除歌曲"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
