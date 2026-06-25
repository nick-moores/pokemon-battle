export interface MusicTrack {
  id: string;
  label: string;
  file: string;
}

export const TRACKS: MusicTrack[] = [
  { id: 'battle1', label: 'Red & Blue Battle Theme', file: '/pokemon-red-battle-music.mp3' },
  { id: 'battle2', label: 'Sword & Shield Gym Leader Battle', file: '/sword-shield-gym-leader.mp3' }
  // Add more tracks here — drop MP3s into /public/ and add an entry:
  // { id: 'battle2', label: 'Battle Theme 2', file: '/battle-music-2.mp3' },
];

const STORAGE_KEY = 'pokemon-battle-music-track';

class BattleMusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentTrackId: string;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const valid = TRACKS.find(t => t.id === saved);
    this.currentTrackId = valid ? valid.id : TRACKS[0].id;
  }

  get track(): MusicTrack {
    return TRACKS.find(t => t.id === this.currentTrackId) ?? TRACKS[0];
  }

  setTrack(id: string) {
    if (id === this.currentTrackId) return;
    const next = TRACKS.find(t => t.id === id);
    if (!next) return;
    const wasPlaying = this.audio && !this.audio.paused;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.currentTrackId = id;
    localStorage.setItem(STORAGE_KEY, id);
    if (wasPlaying) this.play();
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio(this.track.file);
      this.audio.loop = true;
      this.audio.volume = 0.5;
    }
    return this.audio;
  }

  play() {
    const audio = this.getAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }
}

export const battleMusic = new BattleMusicPlayer();
