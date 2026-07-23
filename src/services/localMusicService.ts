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

class LocalMusicService {
  // Parse local File or Blob and save to IndexedDB
  public async addLocalAudioFile(file: File | { name: string; path: string; buffer: ArrayBuffer }): Promise<Song> {
    let name = 'Unknown Song';
    let artist = 'Unknown Artist';
    let album = 'Local Library';
    let duration = 180;
    let coverUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop';
    let blob: Blob;
    let filePath: string | undefined;

    if (file instanceof File) {
      blob = file;
      filePath = (file as any).path || file.name;
      name = file.name.replace(/\.[^/.]+$/, '');
      
      // Native duration extraction without external libraries that might cause Vite build errors
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
      name = file.name.replace(/\.[^/.]+$/, '');
    }

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
      audioUrl: rec.filePath && window.electronAPI ? `app-audio://${encodeURIComponent(rec.filePath)}` : audioUrl,
      source: 'local',
      filePath: rec.filePath,
    };
  }
}

export const localMusicService = new LocalMusicService();
