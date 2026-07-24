import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';

interface FluidBackgroundProps {
  coverUrl?: string;
  isFullLyricsMode?: boolean;
}

export const FluidBackground: React.FC<FluidBackgroundProps> = ({
  coverUrl,
  isFullLyricsMode = false,
}) => {
  const isFluidBgEnabled = usePlayerStore((state) => state.isFluidBgEnabled);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<string[]>([
    '#ff2d55', '#5856d6', '#af52de', '#ff9500'
  ]);

  // Extract palette from coverUrl when it changes
  useEffect(() => {
    if (!coverUrl) return;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = coverUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0, 64, 64);

        const imgData = ctx.getImageData(0, 0, 64, 64).data;
        const sampledColors: string[] = [];

        // Sample 4 distinct color quadrants
        const positions = [
          (16 * 64 + 16) * 4,
          (16 * 64 + 48) * 4,
          (48 * 64 + 16) * 4,
          (48 * 64 + 48) * 4,
        ];

        positions.forEach((pos) => {
          const r = imgData[pos];
          const g = imgData[pos + 1];
          const b = imgData[pos + 2];
          sampledColors.push(`rgb(${r}, ${g}, ${b})`);
        });

        if (sampledColors.length >= 4) {
          colorsRef.current = sampledColors;
        }
      } catch (e) {
        // Fallback default colors
        colorsRef.current = ['#fa233b', '#60a5fa', '#a855f7', '#f59e0b'];
      }
    };
  }, [coverUrl]);

  const isPlaying = usePlayerStore((state) => state.isPlaying);

  // Fluid Mesh Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const handleResize = () => {
      // Downscale internal canvas resolution by 4x for 60FPS+ ultra-fast GPU rendering
      canvas.width = Math.ceil(window.innerWidth / 4);
      canvas.height = Math.ceil(window.innerHeight / 4);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    let isTabHidden = document.hidden;

    const render = () => {
      // Render frame only if tab is visible and music is playing or initial frame
      if (!isTabHidden && (isPlaying || time === 0)) {
        if (isPlaying) time += 0.006;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const width = canvas.width;
        const height = canvas.height;
        const colors = colorsRef.current;

        // Draw dark underlying base
        ctx.fillStyle = '#0f0f12';
        ctx.fillRect(0, 0, width, height);

        // Blobs trajectories
        const blobs = [
          {
            x: width * (0.3 + 0.2 * Math.sin(time * 0.8)),
            y: height * (0.3 + 0.2 * Math.cos(time * 0.6)),
            r: width * 0.5,
            color: colors[0] || '#ff2d55',
          },
          {
            x: width * (0.7 + 0.2 * Math.cos(time * 0.7)),
            y: height * (0.4 + 0.25 * Math.sin(time * 0.9)),
            r: width * 0.55,
            color: colors[1] || '#5856d6',
          },
          {
            x: width * (0.4 + 0.25 * Math.sin(time * 0.5 + 1)),
            y: height * (0.7 + 0.2 * Math.cos(time * 0.8)),
            r: width * 0.45,
            color: colors[2] || '#af52de',
          },
          {
            x: width * (0.8 + 0.15 * Math.cos(time * 1.1)),
            y: height * (0.8 + 0.15 * Math.sin(time * 0.7)),
            r: width * 0.4,
            color: colors[3] || '#ff9500',
          },
        ];

        blobs.forEach((blob) => {
          const gradient = ctx.createRadialGradient(
            blob.x,
            blob.y,
            0,
            blob.x,
            blob.y,
            blob.r
          );
          gradient.addColorStop(0, blob.color);
          gradient.addColorStop(1, 'transparent');

          ctx.fillStyle = gradient;
          ctx.globalCompositeOperation = 'screen';
          ctx.beginPath();
          ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    const handleVisibilityChange = () => {
      isTabHidden = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  if (!isFluidBgEnabled) {
    return <div className="fixed inset-0 pointer-events-none z-0 bg-[#0a0a0d]" />;
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none transition-all duration-700 z-0 transform-gpu ${
        isFullLyricsMode ? 'opacity-100 scale-100' : 'opacity-40 scale-105'
      }`}
    >
      <canvas ref={canvasRef} className="w-full h-full filter blur-[50px] saturate-[180%] transform-gpu" />
      {/* Ambient Dark Overlay */}
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
};
