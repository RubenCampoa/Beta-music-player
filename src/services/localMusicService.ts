import Dexie, { Table } from 'dexie';
import { Song } from '../types/music';

export interface LocalSongRecord {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioBlob: Blob;
  filePath?: string;
  addedAt: number;
}

class LocalMusicDatabase extends Dexie {
  public songs!: Table<LocalSongRecord, string>;

  constructor() {
    super('AppleMusicLocalLibrary');
    this.version(1).stores({
      songs: 'id, name, artist, album, addedAt',
    });
  }
}

export const db = new LocalMusicDatabase();

import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { cleanTitle } from '../utils/format';

class LocalMusicService {
  private cleanTitle(str?: string): string {
    return cleanTitle(str);
  }

  // Extract ID3 Tags (Title, Artist, Album, Cover Artwork) from Blob
  private async parseId3Metadata(blob: Blob): Promise<{ title?: string; artist?: string; album?: string; coverUrl?: string }> {
    return new Promise((resolve) => {
      try {
        jsmediatags.read(blob, {
          onSuccess: (tag: any) => {
            const tags = tag.tags;
            let coverUrl: string | undefined;
            if (tags.picture) {
              const { format, data } = tags.picture;
              let base64String = '';
              const chunkSize = 8192;
              for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                base64String += String.fromCharCode.apply(null, chunk as unknown as number[]);
              }
              coverUrl = `data:${format};base64,${btoa(base64String)}`;
            }
            resolve({
              title: this.cleanTitle(tags.title),
              artist: this.cleanTitle(tags.artist),
              album: this.cleanTitle(tags.album),
              coverUrl,
            });
          },
          onError: () => resolve({}),
        });
      } catch {
        resolve({});
      }
    });
  }

  // Parse local File or Blob and save to IndexedDB
  public async addLocalAudioFile(file: File | { name: string; path: string; buffer: ArrayBuffer }): Promise<Song> {
    let name = 'Unknown Song';
    let artist = '本地歌手';
    let album = '本地资料库';
    let duration = 180;
    let coverUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop';
    let blob: Blob;
    let filePath: string | undefined;

    if (file instanceof File) {
      blob = file;
      filePath = (file as any).path || file.name;
      name = this.cleanTitle(file.name.replace(/\.[^/.]+$/, ''));

      // Native duration extraction
      duration = await new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          resolve(Math.floor(audio.duration || 180));
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          resolve(180);
          URL.revokeObjectURL(url);
        };
      });
    } else {
      blob = new Blob([file.buffer]);
      filePath = file.path;
      name = this.cleanTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    // Attempt ID3 Tag Extraction
    const id3Data = await this.parseId3Metadata(blob);
    if (id3Data.title) name = this.cleanTitle(id3Data.title);
    if (id3Data.artist) artist = this.cleanTitle(id3Data.artist);
    if (id3Data.album) album = this.cleanTitle(id3Data.album);
    if (id3Data.coverUrl) coverUrl = id3Data.coverUrl;

    const songId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const songRecord: LocalSongRecord = {
      id: songId,
      name,
      artist,
      album,
      duration,
      coverUrl,
      audioBlob: blob,
      filePath,
      addedAt: Date.now(),
    };

    await db.songs.put(songRecord);

    return this.recordToSong(songRecord);
  }

  // Retrieve all local songs
  public async getAllLocalSongs(): Promise<Song[]> {
    const records = await db.songs.orderBy('addedAt').reverse().toArray();
    return records.map((rec) => this.recordToSong(rec));
  }

  // Delete local song
  public async removeLocalSong(id: string): Promise<void> {
    await db.songs.delete(id);
  }

  private recordToSong(rec: LocalSongRecord): Song {
    const audioUrl = URL.createObjectURL(rec.audioBlob);
    return {
      id: rec.id,
      name: rec.name,
      artist: rec.artist,
      album: rec.album,
      duration: rec.duration,
      coverUrl: rec.coverUrl,
      audioUrl:
        rec.filePath && window.electronAPI
          ? `app-audio://local/${encodeURIComponent(rec.filePath.replace(/\\/g, '/'))}`
          : audioUrl,
      source: 'local',
      filePath: rec.filePath,
    };
  }
}

export const localMusicService = new LocalMusicService();
