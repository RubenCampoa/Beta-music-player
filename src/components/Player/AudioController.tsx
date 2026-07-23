import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';

export const AudioController: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Audio Source Init
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSong) {
      audio.src = currentSong.audioUrl;
      audio.currentTime = 0;
      if (isPlaying) {
        audio.play().catch((err) => {
          console.warn('Playback autoplay interrupted:', err);
          setIsPlaying(false);
        });
      }
    }
  }, [currentSong?.id]);

  // Play / Pause Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Volume & Mute Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

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
