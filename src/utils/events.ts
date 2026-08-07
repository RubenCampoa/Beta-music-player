// Typed window-event helpers. The app communicates seeks through a
// window-level CustomEvent so any component (progress bars, lyric views,
// playback shortcuts) can seek the single <audio> element without coupling.
export const AUDIO_SEEK_EVENT = 'audio-seek';

export function emitAudioSeek(time: number): void {
  window.dispatchEvent(new CustomEvent<number>(AUDIO_SEEK_EVENT, { detail: time }));
}

// Subscribe to seeks; returns an unsubscribe function for effect cleanup.
export function onAudioSeek(handler: (time: number) => void): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<number>).detail);
  };
  window.addEventListener(AUDIO_SEEK_EVENT, listener);
  return () => window.removeEventListener(AUDIO_SEEK_EVENT, listener);
}
