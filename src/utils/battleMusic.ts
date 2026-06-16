class BattleMusicPlayer {
  private audio: HTMLAudioElement | null = null;

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio('/battle-music.mp3');
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
