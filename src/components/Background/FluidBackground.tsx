import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { getOptimizedCoverUrl } from '../../utils/format';
import { SongSource } from '../../types/music';

interface FluidBackgroundProps {
  coverUrl?: string;
  isFullLyricsMode?: boolean;
  source?: SongSource;
}

type Rgb = [number, number, number];

const DEFAULT_COLORS = [
  'rgba(76, 128, 214, 0.52)',
  'rgba(210, 105, 158, 0.42)',
  'rgba(238, 163, 83, 0.34)',
  'rgba(76, 178, 163, 0.32)',
];

const paletteCache = new Map<string, Rgb[]>();

const parseColor = (value: string): Rgb => {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return [90, 120, 210];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const clamp = (value: number, min = 0, max = 255) => Math.max(min, Math.min(max, value));

const smoothStep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Mute a sampled artwork colour so a saturated album cover (pure red/yellow
// blocks) cannot flood the whole background. 55% grey keeps the hue while
// removing the intensity that made the fluid read as a flat colour field.
const desaturate = ([red, green, blue]: Rgb): Rgb => {
  const gray = red * 0.299 + green * 0.587 + blue * 0.114;
  const mix = 0.45;
  return [
    Math.round(gray + (red - gray) * mix),
    Math.round(gray + (green - gray) * mix),
    Math.round(gray + (blue - gray) * mix),
  ];
};

const toRgba = ([red, green, blue]: Rgb, alpha: number) =>
  `rgba(${red}, ${green}, ${blue}, ${alpha})`;

export const FluidBackground: React.FC<FluidBackgroundProps> = ({
  coverUrl,
  isFullLyricsMode = false,
  source,
}) => {
  const isFluidBgEnabled = usePlayerStore((state) => state.isFluidBgEnabled);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<Rgb[]>(DEFAULT_COLORS.map(parseColor));
  const [palette, setPalette] = useState<string[]>(DEFAULT_COLORS);
  const shouldShow = isFluidBgEnabled && isFullLyricsMode;
  const [isMounted, setIsMounted] = useState(shouldShow);

  useEffect(() => {
    if (shouldShow) {
      setIsMounted(true);
      return;
    }

    const timer = window.setTimeout(() => setIsMounted(false), 520);
    return () => window.clearTimeout(timer);
  }, [shouldShow]);

  // The artwork is sampled for its palette only. It is intentionally not
  // rendered as a blurred full-screen image: the visible ambience below is a
  // procedurally animated liquid field.
  useEffect(() => {
    // Never make the fluid canvas wait for a remote artwork request. Some
    // KuGou CDN responses do not complete a CORS-enabled image read, which
    // would otherwise leave the whole background transparent indefinitely.
    const resetToDefaultPalette = () => {
      colorsRef.current = DEFAULT_COLORS.map(parseColor);
      setPalette(DEFAULT_COLORS);
    };

    if (!coverUrl || !isFullLyricsMode) {
      resetToDefaultPalette();
      return;
    }

    // Match the URL used by the visible cover image so providers such as
    // KuGou get the same normalized/thumbnail URL when possible.
    const sampleUrl = getOptimizedCoverUrl(coverUrl, 300);
    resetToDefaultPalette();

    const cachedColors = paletteCache.get(sampleUrl);
    if (cachedColors) {
      // Cache entries from older builds hold raw (unmuted) sampled colours —
      // mute them again on the hit path so a saturated cover still cannot
      // flood the background.
      const muted = cachedColors.map((color) => desaturate([...color] as Rgb));
      colorsRef.current = muted.map((color) => [...color] as Rgb);
      setPalette(muted.map((color) => toRgba(color, 0.5)));
      return;
    }

    // Sample the palette from an image URL (either a data URL from the main
    // process, or the raw artwork URL). Data URLs are same-origin so they
    // never hit CORS; raw URLs use crossOrigin and fall back to the proxy.
    const fallbackTimer = window.setTimeout(resetToDefaultPalette, 1800);
    const sampleFromImageUrl = (imageUrl: string) => {
      const image = new Image();
      if (!imageUrl.startsWith('data:')) image.crossOrigin = 'Anonymous';
      image.src = imageUrl;
      let cancelled = false;

      const trySample = () => {
        if (cancelled) return;
        try {
          const sampleCanvas = document.createElement('canvas');
          const context = sampleCanvas.getContext('2d');
          if (!context) {
            resetToDefaultPalette();
            return;
          }

          sampleCanvas.width = 48;
          sampleCanvas.height = 48;
          context.drawImage(image, 0, 0, 48, 48);
          const pixels = context.getImageData(0, 0, 48, 48).data;

          // Weighted-average the whole downsampled cover, weighting the
          // centre higher than the edges: corners are often background or
          // letterbox white, which is why fixed corner sampling picked the
          // wrong colour for centred artwork.
          let redSum = 0;
          let greenSum = 0;
          let blueSum = 0;
          let weightSum = 0;
          for (let y = 0; y < 48; y += 1) {
            for (let x = 0; x < 48; x += 1) {
              const offset = (y * 48 + x) * 4;
              const cx = (x - 23.5) / 24;
              const cy = (y - 23.5) / 24;
              const weight = 1 / (1 + (cx * cx + cy * cy) * 1.4);
              redSum += pixels[offset] * weight;
              greenSum += pixels[offset + 1] * weight;
              blueSum += pixels[offset + 2] * weight;
              weightSum += weight;
            }
          }
          const base: Rgb = [redSum / weightSum, greenSum / weightSum, blueSum / weightSum];

          // Derive four palette variants from the dominant colour so the
          // fluid reads as one cohesive hue with subtle depth instead of
          // four unrelated corner colours.
          const [r, g, b] = base;
          const sampledColors = [
            base as Rgb,
            [Math.min(255, r + 26), Math.min(255, g + 12), Math.max(0, b - 20)] as Rgb,
            [Math.max(0, r - 34), Math.max(0, g - 14), Math.min(255, b + 18)] as Rgb,
            [
              Math.min(255, (r + g) / 2 + 26),
              Math.min(255, (g + b) / 2 + 8),
              Math.max(0, (r + b) / 2 - 12),
            ] as Rgb,
          ].map(desaturate);

          paletteCache.set(sampleUrl, sampledColors);
          colorsRef.current = sampledColors.map((color) => [...color] as Rgb);
          setPalette(sampledColors.map((color) => toRgba(color, 0.5)));
          // Sampling succeeded — cancel the fallback so it does not reset the
          // correct palette back to the default colours a moment later.
          window.clearTimeout(fallbackTimer);
        } catch {
          resetToDefaultPalette();
        }
      };

      image.onload = trySample;
      image.onerror = () => {
        if (cancelled) return;
        if (!imageUrl.startsWith('data:')) {
          // Cross-origin read rejected (KuGou CDN): retry through the main
          // process, which has no CORS restrictions.
          window.electronAPI?.fetchCoverAsDataUrl?.(sampleUrl).then((dataUrl) => {
            if (cancelled) return;
            if (!dataUrl) {
              resetToDefaultPalette();
              return;
            }
            sampleFromImageUrl(dataUrl);
          });
        } else {
          resetToDefaultPalette();
        }
      };

      return () => {
        cancelled = true;
        image.onload = null;
        image.onerror = null;
      };
    };

    // Prefer the main-process proxy (no CORS at all) — most reliable for
    // KuGou CDNs. Fall back to the direct crossOrigin image otherwise.
    let cancelSampling: (() => void) | undefined;
    if (window.electronAPI?.fetchCoverAsDataUrl) {
      window.electronAPI.fetchCoverAsDataUrl(sampleUrl).then((dataUrl) => {
        if (dataUrl) {
          cancelSampling = sampleFromImageUrl(dataUrl);
        } else {
          cancelSampling = sampleFromImageUrl(sampleUrl);
        }
      });
    } else {
      cancelSampling = sampleFromImageUrl(sampleUrl);
    }

    return () => {
      cancelSampling?.();
      window.clearTimeout(fallbackTimer);
    };
  }, [coverUrl, isFullLyricsMode]);

  useEffect(() => {
    // When the setting is enabled while the lyric view is already open, the
    // first effect pass happens before the delayed canvas is mounted. Observe
    // `isMounted` as well so the animation loop starts on the next commit.
    if (!shouldShow || !isMounted) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true })
      || canvas?.getContext('2d');
    if (!canvas || !context) return;

    let frameId: number | null = null;
    let time = 0;
    let previousTimestamp = performance.now();
    let lastDrawTimestamp = 0;
    let normalizedX = new Float32Array(0);
    let normalizedY = new Float32Array(0);
    let rowWarpX = new Float32Array(0);
    let columnWarpY = new Float32Array(0);

    const resize = () => {
      // The canvas is intentionally much smaller than the window. It is
      // enlarged by CSS, so the liquid stays organic without spending most of
      // the frame budget on a full-size per-pixel simulation.
      canvas.width = Math.min(280, Math.max(180, Math.floor(window.innerWidth / 5)));
      canvas.height = Math.min(188, Math.max(120, Math.floor(window.innerHeight / 5)));
      normalizedX = new Float32Array(canvas.width);
      normalizedY = new Float32Array(canvas.height);
      rowWarpX = new Float32Array(canvas.height);
      columnWarpY = new Float32Array(canvas.width);
      for (let x = 0; x < canvas.width; x += 1) normalizedX[x] = x / canvas.width;
      for (let y = 0; y < canvas.height; y += 1) normalizedY[y] = y / canvas.height;
      context.imageSmoothingEnabled = true;
    };

    const drawFrame = (timestamp: number) => {
      const delta = Math.min(48, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      // One full shape cycle takes roughly 18–30 seconds, so the motion reads
      // as liquid drift instead of a quickly looping screensaver.
      time += delta * 0.0009;

      const width = canvas.width;
      const height = canvas.height;
      const imageData = context.createImageData(width, height);
      const pixels = imageData.data;
      const colors = colorsRef.current;

      // These are moving metaballs, not DOM circles. Their fields merge into
      // one continuous surface and their radius/aspect ratio changes over time.
      const blobs = [
        { baseX: 0.18, baseY: 0.25, rx: 0.23, ry: 0.29, phase: 0.2, color: colors[0] },
        { baseX: 0.78, baseY: 0.2, rx: 0.27, ry: 0.24, phase: 2.1, color: colors[1] },
        { baseX: 0.67, baseY: 0.78, rx: 0.3, ry: 0.27, phase: 4.4, color: colors[2] },
        { baseX: 0.2, baseY: 0.78, rx: 0.25, ry: 0.22, phase: 5.8, color: colors[3] },
      ];

      const positions = blobs.map((blob, index) => {
        const phase = blob.phase + index * 0.17;
        return {
          x: blob.baseX + Math.sin(time * (0.72 + index * 0.035) + phase) * 0.15 + Math.cos(time * 0.31 + phase) * 0.055,
          y: blob.baseY + Math.cos(time * (0.58 + index * 0.045) + phase) * 0.15 + Math.sin(time * 0.27 + phase) * 0.055,
          rx: blob.rx * (1 + Math.sin(time * 0.8 + phase) * 0.18),
          ry: blob.ry * (1 + Math.cos(time * 0.67 + phase) * 0.18),
          color: blob.color,
        };
      });

      for (let y = 0; y < height; y += 1) {
        const yValue = normalizedY[y];
        rowWarpX[y] =
          Math.sin(yValue * 8.4 + time * 1.4) * 0.025
          + Math.sin(yValue * 21 - time * 0.9) * 0.009;
      }
      for (let x = 0; x < width; x += 1) {
        const xValue = normalizedX[x];
        columnWarpY[x] =
          Math.cos(xValue * 7.2 - time * 1.1) * 0.025
          + Math.sin(xValue * 17 + time * 0.75) * 0.009;
      }

      for (let y = 0; y < height; y += 1) {
        const yValue = normalizedY[y];
        for (let x = 0; x < width; x += 1) {
          const xValue = normalizedX[x];

          // Warp the sampling coordinates with two low-frequency flow waves.
          // This gives the liquid boundary a continuously folding surface.
          const warpedX = xValue + rowWarpX[y];
          const warpedY = yValue + columnWarpY[x];

          let field = 0;
          let weightSum = 0;
          let red = 0;
          let green = 0;
          let blue = 0;

          for (let blobIndex = 0; blobIndex < positions.length; blobIndex += 1) {
            const blob = positions[blobIndex];
            const dx = (warpedX - blob.x) / blob.rx;
            const dy = (warpedY - blob.y) / blob.ry;
            // A reciprocal falloff is considerably cheaper than four exp()
            // calls per pixel while preserving the merged metaball silhouette.
            const influence = 1 / (1 + (dx * dx + dy * dy) * 2.6);
            const weight = influence * influence;
            field += influence;
            weightSum += weight;
            red += blob.color[0] * weight;
            green += blob.color[1] * weight;
            blue += blob.color[2] * weight;
          }

          const flowWave = Math.sin((warpedX * 5.6 + warpedY * 4.8) * Math.PI + time * 2.2) * 0.055;
          field += Math.max(0, flowWave);

          const softEdge = smoothStep(0.08, 0.52, field);
          if (softEdge <= 0.001 || weightSum <= 0) continue;

          const liquidBody = smoothStep(0.38, 1.12, field);
          const liquidRim = smoothStep(0.28, 0.62, field) * (1 - smoothStep(0.72, 1.3, field));
          const mixedRed = red / weightSum;
          const mixedGreen = green / weightSum;
          const mixedBlue = blue / weightSum;
          const highlight = liquidRim * 0.22;
          const pixelIndex = (y * width + x) * 4;

          pixels[pixelIndex] = clamp(mixedRed * (0.82 + liquidBody * 0.12) + 255 * highlight);
          pixels[pixelIndex + 1] = clamp(mixedGreen * (0.82 + liquidBody * 0.12) + 255 * highlight);
          pixels[pixelIndex + 2] = clamp(mixedBlue * (0.82 + liquidBody * 0.12) + 255 * highlight);
          // Semi-transparent liquid body: even if Chromium fails to apply
          // mix-blend-mode: screen (a known quirk with <canvas> + scale),
          // the fluid stays translucent over the dark base instead of
          // painting an opaque colour rectangle over the whole backdrop.
          pixels[pixelIndex + 3] = clamp((softEdge * 0.42 + liquidBody * 0.06) * 255, 0, 255);
        }
      }

      context.putImageData(imageData, 0, 0);
    };

    const render = (timestamp: number) => {
      if (document.hidden) {
        frameId = null;
        previousTimestamp = timestamp;
        return;
      }

      // 30fps is enough for this low-frequency liquid motion and leaves the
      // high-priority lyric spring animation on the browser's main thread.
      if (timestamp - lastDrawTimestamp >= 33) {
        drawFrame(timestamp);
        lastDrawTimestamp = timestamp;
      }
      frameId = requestAnimationFrame(render);
    };

    resize();
    const firstFrameTimestamp = performance.now();
    drawFrame(firstFrameTimestamp);
    lastDrawTimestamp = firstFrameTimestamp;
    frameId = requestAnimationFrame(render);

    window.addEventListener('resize', resize);
    const handleVisibilityChange = () => {
      if (!document.hidden && frameId === null) {
        previousTimestamp = performance.now();
        lastDrawTimestamp = 0;
        frameId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldShow, isMounted]);

  if (!isMounted) return null;

  // Keep the sampled palette in CSS variables for the surrounding glass
  // treatment, while the actual moving shapes are rendered by the canvas.
  const fluidStyle = {
    '--fluid-color-a': palette[0] || DEFAULT_COLORS[0],
    '--fluid-color-b': palette[1] || DEFAULT_COLORS[1],
    '--fluid-color-c': palette[2] || DEFAULT_COLORS[2],
    '--fluid-color-d': palette[3] || DEFAULT_COLORS[3],
  } as React.CSSProperties;

  return (
    <div
      className={`full-lyrics-fluid absolute inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-500 ease-out ${
        source === 'kugou' ? 'full-lyrics-fluid-kugou ' : ''
      }${
        shouldShow ? 'opacity-100' : 'opacity-0'
      }`}
      style={fluidStyle}
      aria-hidden="true"
    >
      {/* CSS blobs are an intentional fallback layer. They keep the liquid
          ambience visible when a Chromium build declines a Canvas context or
          the artwork palette cannot be sampled because of CDN CORS headers. */}
      <div className="full-lyrics-fluid-glow absolute inset-0" aria-hidden="true">
        <span className="full-lyrics-fluid-blob full-lyrics-fluid-blob-a" />
        <span className="full-lyrics-fluid-blob full-lyrics-fluid-blob-b" />
        <span className="full-lyrics-fluid-blob full-lyrics-fluid-blob-c" />
        <span className="full-lyrics-fluid-blob full-lyrics-fluid-blob-d" />
      </div>
      {/* KuGou CDN/Chromium combinations can starve the sampled Canvas. Keep
          the extra fallback provider-scoped so it never tints the established
          NetEase/QQ fluid treatment. */}
      {source === 'kugou' && <div className="full-lyrics-fluid-flow absolute inset-0" aria-hidden="true" />}
      <canvas
        ref={canvasRef}
        className="full-lyrics-fluid-canvas absolute inset-0 w-full h-full transition-opacity duration-700 ease-out"
        // The procedural field must be visible even when a provider blocks
        // cross-origin palette sampling. The palette is an enhancement, not a
        // prerequisite for rendering the fluid background.
        style={{ opacity: source === 'kugou' ? 0.72 : 0.94 }}
      />
      <div className="full-lyrics-fluid-scrim absolute inset-0" />
    </div>
  );
};
