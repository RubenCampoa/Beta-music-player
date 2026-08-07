import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { shallow } from 'zustand/shallow';
import { musicApiAdapter } from '../../services/musicApiAdapter';
import { onAudioSeek } from '../../utils/events';

export const AudioController: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeAnimRef = useRef<number | null>(null);
  const currentSongIdRef = useRef<string | number | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  // Tracks how many times the source of the current song was re-resolved
  // after a media error, so a permanently broken track fails fast instead
  // of retrying forever.
  const sourceRetryRef = useRef(0);

  const {
    currentSong,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    setIsPlaying,
    setCurrentTime,
    setAudioElement,
    setDuration,
    nextSong,
  } = usePlayerStore(
    (state) => ({
      currentSong: state.currentSong,
      isPlaying: state.isPlaying,
      volume: state.volume,
      isMuted: state.isMuted,
      repeatMode: state.repeatMode,
      setIsPlaying: state.setIsPlaying,
      setCurrentTime: state.setCurrentTime,
      setAudioElement: state.setAudioElement,
      setDuration: state.setDuration,
      nextSong: state.nextSong,
    }),
    shallow,
  );

  const safeVolume = typeof volume === 'number' && !isNaN(volume) ? volume : 0.8;
  const targetVolume = isMuted ? 0 : Math.max(0, Math.min(1, safeVolume));

  // play() rejections come in two flavors:
  //  - NotAllowedError: real autoplay-policy block -> surface a paused state.
  //  - NotSupportedError/AbortError etc.: media load/decode failure, already
  //    handled by the onError retry path. Flipping isPlaying to false here
  //    would prevent the freshly re-resolved URL from autoplaying (the user
  //    would have to press play manually), so keep the playing state intact.
  const onPlayRejected = (err: unknown) => {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError') {
      setIsPlaying(false);
    }
  };

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
      currentAudioUrlRef.current = null;
      return;
    }

    const isSongChanged = currentSongIdRef.current !== currentSong.id;
    const isUrlUpdated = currentAudioUrlRef.current !== currentSong.audioUrl;

    if (isSongChanged) {
      sourceRetryRef.current = 0;
    }

    if (!currentSong.audioUrl) {
      // Audio source is still resolving (or unavailable). Never load an empty
      // src: play() on it rejects and flips isPlaying back to false, which
      // kills autoplay once the real URL arrives. Fade out any previous song
      // so the transition still feels intentional while we wait.
      if (isSongChanged) {
        currentSongIdRef.current = currentSong.id;
        currentAudioUrlRef.current = currentSong.audioUrl;
        if (!audio.paused) {
          fadeTo(0, 180, () => {
            if (audioRef.current) audioRef.current.pause();
          });
        }
      }
      return;
    }

    if (isSongChanged || isUrlUpdated) {
      // Only preserve position for mid-song URL refreshes; when the URL just
      // arrived for a freshly selected song (previous ref was empty), start at 0.
      const prevTime = isUrlUpdated && !isSongChanged && currentAudioUrlRef.current ? audio.currentTime : 0;
      currentSongIdRef.current = currentSong.id;
      currentAudioUrlRef.current = currentSong.audioUrl;

      if (isSongChanged && !audio.paused && audio.src) {
        // Fade out current song then load new song
        fadeTo(0, 180, () => {
          if (!audioRef.current) return;
          audioRef.current.src = currentSong.audioUrl;
          audioRef.current.currentTime = 0;
          if (isPlaying) {
            audioRef.current.volume = 0;
            audioRef.current.play().then(() => {
              fadeTo(targetVolume, 260);
              usePlayerStore.getState().setToastMessage(null);
            }).catch(onPlayRejected);
          }
        });
      } else {
        audio.src = currentSong.audioUrl;
        if (prevTime > 0) audio.currentTime = prevTime;
        if (isPlaying) {
          audio.volume = targetVolume;
          audio.play().then(() => {
            usePlayerStore.getState().setToastMessage(null);
          }).catch(onPlayRejected);
        }
      }
    } else {
      // Song is same, handle Play / Pause toggle
      if (isPlaying) {
        if (audio.paused) {
          audio.volume = 0;
          audio.play().then(() => {
            fadeTo(targetVolume, 220);
            usePlayerStore.getState().setToastMessage(null);
          }).catch(onPlayRejected);
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
  }, [currentSong?.id, currentSong?.audioUrl, isPlaying]);

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
    return onAudioSeek((time) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        setCurrentTime(time);
      }
    });
  }, []);

  // Expose the live <audio> element so frame-driven renderers (karaoke
  // words, wave lines) can read the exact media clock instead of
  // extrapolating from coarse timeupdate snapshots.
  useEffect(() => {
    setAudioElement(audioRef.current);
    return () => setAudioElement(null);
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
      onPlay={() => {
        // Clear any transient error toast messages when playback starts
        usePlayerStore.getState().setToastMessage(null);
      }}
      onEnded={() => {
        if (repeatMode === 'one' && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play();
        } else {
          nextSong();
        }
      }}
      onWaiting={() => {
        if (isPlaying && audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
        }
      }}
      onStalled={() => {
        if (isPlaying && audioRef.current && audioRef.current.currentTime < 1.0) {
          setTimeout(() => {
            if (audioRef.current && isPlaying && audioRef.current.paused) {
              audioRef.current.play().catch(() => {});
            }
          }, 200);
        }
      }}
      onError={() => {
        const currentSrc = audioRef.current?.src || '';
        // Suppress false alarm error events during initial URL resolution or empty src
        if (!currentSong?.audioUrl || !currentSrc || currentSrc === window.location.href) {
          return;
        }
        const failedSong = currentSong;
        const failedUrl = currentSong.audioUrl;

        // Signed CDN URLs expire and network hiccups happen: re-resolve the
        // source once (bypassing the URL cache) before surfacing an error.
        if (sourceRetryRef.current < 1) {
          sourceRetryRef.current += 1;
          musicApiAdapter
            .getSongAudioUrl(failedSong, true)
            .then((freshUrl) => {
              const state = usePlayerStore.getState();
              if (state.currentSong?.id !== failedSong.id) return;
              if (freshUrl && freshUrl !== failedUrl) {
                state.updateCurrentSongAudioUrl(freshUrl);
              } else {
                state.setIsPlaying(false);
                const platformName = failedSong.source === 'qq' ? 'QQ 音乐' : '网易云音乐';
                state.setToastMessage(`音源播放失败，请检查网络连接或重新登录 ${platformName} 账号后重试`);
              }
            })
            .catch(() => {
              const state = usePlayerStore.getState();
              if (state.currentSong?.id !== failedSong.id) return;
              state.setIsPlaying(false);
              const platformName = failedSong.source === 'qq' ? 'QQ 音乐' : '网易云音乐';
              state.setToastMessage(`音源播放失败，请检查网络连接或重新登录 ${platformName} 账号后重试`);
            });
          return;
        }

        if (currentSong && isPlaying) {
          setIsPlaying(false);
          const platformName = currentSong.source === 'qq' ? 'QQ 音乐' : '网易云音乐';
          usePlayerStore
            .getState()
            .setToastMessage(`音源播放失败，请检查网络连接或重新登录 ${platformName} 账号后重试`);
        }
      }}
    />
  );
};
