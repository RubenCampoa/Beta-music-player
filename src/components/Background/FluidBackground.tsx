import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';

interface FluidBackgroundProps {
  coverUrl?: string;
  isFullLyricsMode?: boolean;
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

export const FluidBackground: React.FC<FluidBackgroundProps> = ({
  coverUrl,
  isFullLyricsMode = false,
}) => {
  const isFluidBgEnabled = usePlayerStore((state) => state.isFluidBgEnabled);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<Rgb[]>(DEFAULT_COLORS.map(parseColor));
  const [palette, setPalette] = useState<string[]>(DEFAULT_COLORS);
  const shouldShow = isFluidBgEnabled && isFullLyricsMode;
  const [isMounted, setIsMounted] = useState(shouldShow);
  const [paletteReadyFor, setPaletteReadyFor] = useState<string | null>(coverUrl ? null : '');
  const isPaletteReady = !coverUrl || paletteReadyFor === coverUrl;

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
    if (!coverUrl || !isFullLyricsMode) {
      if (!coverUrl) setPaletteReadyFor('');
      return;
    }

    const cachedColors = paletteCache.get(coverUrl);
    if (cachedColors) {
      colorsRef.current = cachedColors.map((color) => [...color] as Rgb);
      setPalette(cachedColors.map(([red, green, blue]) => `rgba(${red}, ${green}, ${blue}, 0.72)`));
      setPaletteReadyFor(coverUrl);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'Anonymous';
    image.src = coverUrl;
    let cancelled = false;

    image.onload = () => {
      if (cancelled) return;
      try {
        const sampleCanvas = document.createElement('canvas');
        const context = sampleCanvas.getContext('2d');
        if (!context) return;

        sampleCanvas.width = 48;
        sampleCanvas.height = 48;
        context.drawImage(image, 0, 0, 48, 48);
        const pixels = context.getImageData(0, 0, 48, 48).data;
        const positions = [
          (10 * 48 + 10) * 4,
          (10 * 48 + 38) * 4,
          (38 * 48 + 10) * 4,
          (38 * 48 + 38) * 4,
        ];

        const sampledColors = positions.map((position) => {
          const red = pixels[position];
          const green = pixels[position + 1];
          const blue = pixels[position + 2];
          return [red, green, blue] as Rgb;
        });

        paletteCache.set(coverUrl, sampledColors);
        // The canvas is hidden until this assignment completes, so the first
        // visible frame already uses the correct artwork palette.
        colorsRef.current = sampledColors.map((color) => [...color] as Rgb);
        setPalette(sampledColors.map(([red, green, blue]) => `rgba(${red}, ${green}, ${blue}, 0.72)`));
        setPaletteReadyFor(coverUrl);
      } catch {
        colorsRef.current = DEFAULT_COLORS.map(parseColor);
        setPalette(DEFAULT_COLORS);
        setPaletteReadyFor(coverUrl);
      }
    };

    image.onerror = () => {
      if (cancelled) return;
      colorsRef.current = DEFAULT_COLORS.map(parseColor);
      setPalette(DEFAULT_COLORS);
      setPaletteReadyFor(coverUrl);
    };

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [coverUrl, isFullLyricsMode]);

  useEffect(() => {
    if (!isFluidBgEnabled || !isFullLyricsMode) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true });
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
      time += delta * 0.00062;

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
          pixels[pixelIndex + 3] = clamp((softEdge * 0.84 + liquidBody * 0.1) * 255, 0, 255);
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
  }, [isFluidBgEnabled, isFullLyricsMode]);

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
      className={`full-lyrics-fluid fixed inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-500 ease-out ${
        shouldShow ? 'opacity-100' : 'opacity-0'
      }`}
      style={fluidStyle}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="full-lyrics-fluid-canvas absolute inset-0 w-full h-full transition-opacity duration-700 ease-out"
        style={{ opacity: isPaletteReady ? 0.94 : 0 }}
      />
      <div className="full-lyrics-fluid-scrim absolute inset-0" />
    </div>
  );
};
