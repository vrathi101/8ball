/**
 * 8-Ball Pool - Sound Manager
 * Procedural audio synthesis using Web Audio API — no external sound files needed
 */

export class SoundManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;

    /** Initialize AudioContext (must be called from a user gesture) */
    init(): void {
        if (this.ctx) return;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);
    }

    get ready(): boolean {
        return this.ctx !== null && this.ctx.state === 'running';
    }

    async resume(): Promise<void> {
        if (this.ctx?.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    /** Ball-ball hit: sharp "clack" */
    playBallBall(speed: number): void {
        if (!this.ctx || !this.masterGain) return;
        const vol = Math.min(1, speed / 5);
        if (vol < 0.02) return;

        const now = this.ctx.currentTime;
        const duration = 0.08;

        // Two sine oscillators for the clack
        this.playTone(3000, now, duration, vol * 0.5, 'sine');
        this.playTone(5000, now, duration, vol * 0.3, 'sine');

        // Noise burst for impact texture
        this.playNoiseBurst(now, duration * 0.6, vol * 0.15);
    }

    /** Cue strike: lower thud */
    playCueStrike(speed: number): void {
        if (!this.ctx || !this.masterGain) return;
        const vol = Math.min(1, speed / 5);
        if (vol < 0.02) return;

        const now = this.ctx.currentTime;
        const duration = 0.1;

        this.playTone(800, now, duration, vol * 0.5, 'sine');
        this.playTone(1500, now, duration, vol * 0.3, 'sine');
        this.playNoiseBurst(now, duration * 0.5, vol * 0.1);
    }

    /** Ball-cushion: muffled thud */
    playBallCushion(speed: number): void {
        if (!this.ctx || !this.masterGain) return;
        const vol = Math.min(1, speed / 5);
        if (vol < 0.02) return;

        const now = this.ctx.currentTime;
        const duration = 0.06;

        this.playTone(500, now, duration, vol * 0.4, 'sine');
        this.playTone(1000, now, duration, vol * 0.2, 'sine');
    }

    /** Pocket drop: deep resonant thud */
    playPocketDrop(speed: number): void {
        if (!this.ctx || !this.masterGain) return;
        const vol = Math.min(1, Math.max(0.3, speed / 5)); // always audible

        const now = this.ctx.currentTime;
        const duration = 0.2;

        this.playTone(200, now, duration, vol * 0.5, 'sine');
        this.playTone(400, now, duration * 0.8, vol * 0.3, 'sine');
        this.playNoiseBurst(now, duration * 0.3, vol * 0.1);
    }

    // --- Internal helpers ---

    private playTone(
        freq: number,
        startTime: number,
        duration: number,
        volume: number,
        type: OscillatorType,
    ): void {
        if (!this.ctx || !this.masterGain) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    private playNoiseBurst(startTime: number, duration: number, volume: number): void {
        if (!this.ctx || !this.masterGain) return;

        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // decaying noise
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        source.connect(gain);
        gain.connect(this.masterGain!);

        source.start(startTime);
    }
}
