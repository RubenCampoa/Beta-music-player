import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';

export const AudioController: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeAnimRef = useRef<number | null>(null);
  const currentSongIdRef = useRef<string | number | null>(null);

  const {
    currentSong,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    nextSong,
  } = usePlayerStore();

  const safeVolume = typeof volume === 'number' && !isNaN(volume) ? volume : 0.8;
  const targetVolume = isMuted ? 0 : Math.max(0, Math.min(1, safeVolume));

  const stopFade = () => {
    if (fadeAnimRef.current !== null) {
      cancelAnimationFrame(fadeAnimRef.current);
      fadeAnimRef.current = null;
    }
  };

  const fadeTo = (endVol: number, durationMs: number, onEnd?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;

    stopFade();

    const startVol = audio.volume;
    const startTime = performance.now();
    const clampedEnd = Math.max(0, Math.min(1, endVol));

    if (durationMs <= 0 || Math.abs(startVol - clampedEnd) < 0.01) {
      audio.volume = clampedEnd;
      if (onEnd) onEnd();
      return;
    }

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const current = startVol + (clampedEnd - startVol) * ease;

      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, current));
      }

      if (progress < 1) {
        fadeAnimRef.current = requestAnimationFrame(step);
      } else {
        fadeAnimRef.current = null;
        if (audioRef.current) audioRef.current.volume = clampedEnd;
        if (onEnd) onEnd();
      }
    };

    fadeAnimRef.current = requestAnimationFrame(step);
  };

  // Synchronize Source and Play / Pause state cleanly
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentSong) {
      stopFade();
      audio.pause();
      currentSongIdRef.current = null;
      return;
    }

    const isSongChanged = currentSongIdRef.current !== currentSong.id;

    if (isSongChanged) {
      currentSongIdRef.current = currentSong.id;
      if (!audio.paused && audio.src) {
        // Fade out current song then load new song
        fadeTo(0, 180, () => {
          if (!audioRef.current) return;
          audioRef.current.src = currentSong.audioUrl;
          audioRef.current.currentTime = 0;
          if (isPlaying) {
            audioRef.current.volume = 0;
            audioRef.current.play().then(() => {
              fadeTo(targetVolume, 260);
            }).catch(() => setIsPlaying(false));
          }
        });
      } else {
        audio.src = currentSong.audioUrl;
        audio.currentTime = 0;
        if (isPlaying) {
          audio.volume = 0;
          audio.play().then(() => {
            fadeTo(targetVolume, 260);
          }).catch(() => setIsPlaying(false));
        }
      }
    } else {
      // Song is same, handle Play / Pause toggle
      if (isPlaying) {
        if (audio.paused) {
          audio.volume = 0;
          audio.play().then(() => {
            fadeTo(targetVolume, 220);
          }).catch(() => setIsPlaying(false));
        } else {
          fadeTo(targetVolume, 220);
        }
      } else {
        if (!audio.paused) {
          fadeTo(0, 180, () => {
            if (audioRef.current) audioRef.current.pause();
          });
        }
      }
    }
  }, [currentSong?.id, isPlaying]);

  // Volume & Mute Sync when volume slider moves
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying && !audio.paused && fadeAnimRef.current === null) {
      audio.volume = targetVolume;
    }
  }, [targetVolume, isPlaying]);

  // Handle Seek from custom events
  useEffect(() => {
    const handleSeekEvent = (e: CustomEvent<number>) => {
      if (audioRef.current) {
        audioRef.current.currentTime = e.detail;
        setCurrentTime(e.detail);
      }
    };

    window.addEventListener('audio-seek' as any, handleSeekEvent);
    return () => {
      window.removeEventListener('audio-seek' as any, handleSeekEvent);
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      }}
      onLoadedMetadata={() => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration || currentSong?.duration || 0);
        }
      }}
      onEnded={() => {
        if (repeatMode === 'one' && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play();
        } else {
          nextSong();
        }
      }}
    />
  );
};
