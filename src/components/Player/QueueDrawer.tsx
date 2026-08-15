import React from 'react';
import { X, Play, Trash2, Music, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../store/playerStore';
import { shallow } from 'zustand/shallow';
import { neteaseApi } from '../../services/neteaseApi';
import { getOptimizedCoverUrl, handleImageError } from '../../utils/format';

export const QueueDrawer: React.FC = () => {
  const {
    isQueueOpen,
    setQueueOpen,
    queue,
    currentSong,
    isPlaying,
    playSong,
    removeFromQueue,
    clearQueue,
  } = usePlayerStore(
    (state) => ({
      isQueueOpen: state.isQueueOpen,
      setQueueOpen: state.setQueueOpen,
      queue: state.queue,
      currentSong: state.currentSong,
      isPlaying: state.isPlaying,
      playSong: state.playSong,
      removeFromQueue: state.removeFromQueue,
      clearQueue: state.clearQueue,
    }),
    shallow,
  );

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <AnimatePresence initial={false}>
      {isQueueOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setQueueOpen(false)}
          className="absolute inset-0 bg-black/40 backdrop-blur-xs"
        />

        {/* Right Drawer Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="absolute right-0 top-0 bottom-0 w-96 bg-[#12141d]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col z-10"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <ListMusic className="w-5 h-5 text-apple-red" />
              <h2 className="text-base font-bold text-white tracking-tight">
                播放队列 ({queue.length})
              </h2>
            </div>

            <div className="flex items-center space-x-2">
              {queue.length > 0 && (
                <button
                  onClick={clearQueue}
                  className="text-xs text-white/50 hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-white/5 transition-colors"
                >
                  清空
                </button>
              )}
              <button
                onClick={() => setQueueOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Queue List Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {queue.length === 0 ? (
              <div className="py-20 text-center text-white/40 space-y-2">
                <Music className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm font-medium">队列暂无歌曲</p>
              </div>
            ) : (
              queue.map((song, idx) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <div
                    key={`${song.id}-${idx}`}
                    onClick={() => playSong(song, queue)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                      isCurrent
                        ? 'bg-apple-red/15 border-apple-red/30 text-white shadow-sm'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate flex-1 pr-2">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10">
                        <img
                          src={getOptimizedCoverUrl(song.coverUrl, 100)}
                          alt={song.name}
                          loading="lazy"
                          decoding="async"
                          onError={handleImageError}
                          className="w-full h-full object-cover"
                        />
                        {isCurrent && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Play
                              className={`w-4 h-4 text-apple-red fill-current ${
                                isPlaying ? 'animate-pulse' : ''
                              }`}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col truncate">
                        <span
                          className={`text-xs font-semibold truncate ${
                            isCurrent ? 'text-apple-red' : 'text-white group-hover:text-apple-red'
                          }`}
                        >
                          {neteaseApi.cleanTitle(song.name)}
                        </span>
                        <span className="text-[11px] text-white/50 truncate">
                          {neteaseApi.cleanTitle(song.artist)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[11px] font-mono text-white/40">
                        {formatDuration(song.duration)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(song.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-opacity"
                        title="从队列中移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
