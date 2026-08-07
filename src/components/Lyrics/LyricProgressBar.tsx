import React, { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { formatTime, formatRemainingTime } from '../../utils/format';
import { emitAudioSeek } from '../../utils/events';

/**
 * Fullscreen-lyrics progress bar. Dragging updates a local preview so the
 * fill follows the pointer immediately; the seek is committed once on
 * release (one seek per drag, matching the player-bar behaviour).
 */
export const LyricProgressBar: React.FC = () => {
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  // Local drag preview so the fill follows the pointer immediately; the seek
  // is committed once on release.
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  const progressPercent =
    dragPercent !== null
      ? dragPercent * 100
      : duration
      ? Math.min(100, (currentTime / duration) * 100)
      : 0;

  const updatePreview = (clientX: number) => {
    if (!duration || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setDragPercent(percent);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePreview(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration || !draggingRef.current) return;
    updatePreview(e.clientX);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (duration && trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        emitAudioSeek(percent * duration);
      }
    }
    setDragPercent(null);
  };
  const handlePointerCancel = () => {
    draggingRef.current = false;
    setDragPercent(null);
  };

  return (
    <div className="w-full space-y-1.5 pt-1">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="progress-track relative w-full h-2 hover:h-2.5 rounded-full cursor-pointer overflow-visible transition-all touch-none"
      >
        <div
          className={`progress-fill h-full rounded-full relative ${
            dragPercent !== null ? 'transition-none' : 'transition-[width] duration-150 ease-out'
          }`}
          style={{ width: `${progressPercent}%` }}
        >
          <div className="progress-thumb absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-md" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-white/50 px-0.5">
        <span>{formatTime(currentTime)}</span>
        <div className="flex items-center space-x-1 bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-white/10">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>高解析无损</span>
        </div>
        <span>{formatRemainingTime(currentTime, duration)}</span>
      </div>
    </div>
  );
};
