import { Platform, SongSource } from '../types/music';

export const PLATFORM_META: Record<Platform, {
  name: string;
  shortName: string;
  dotClass: string;
  textClass: string;
  activeClass: string;
}> = {
  netease: {
    name: '网易云音乐',
    shortName: '网易云',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-500',
    activeClass: 'bg-rose-500/10 border-rose-500/30',
  },
  qq: {
    name: 'QQ 音乐',
    shortName: 'QQ 音乐',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-500',
    activeClass: 'bg-emerald-500/10 border-emerald-500/30',
  },
  kugou: {
    name: '酷狗概念版',
    shortName: '酷狗',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-500',
    activeClass: 'bg-sky-500/10 border-sky-500/30',
  },
};

export const PLATFORM_ORDER: Platform[] = ['netease', 'qq', 'kugou'];

export function getPlatformName(source?: Platform | SongSource, short = false): string {
  if (!source || source === 'local') return '本地音乐';
  return short ? PLATFORM_META[source].shortName : PLATFORM_META[source].name;
}

export function getNextPlatform(platform: Platform): Platform {
  const index = PLATFORM_ORDER.indexOf(platform);
  return PLATFORM_ORDER[(index + 1) % PLATFORM_ORDER.length];
}
