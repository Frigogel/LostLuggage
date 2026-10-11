// Tiny Web Audio synth: every sound is generated, so there are no audio files to download.
// The design doc asks for one distinct sound per attack type; these are placeholders for that.

type Wave = OscillatorType;

class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private last = new Map<string, number>();
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  private ok(name: string, minGapMs: number): boolean {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return false;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < minGapMs) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(freq: number, to: number, dur: number, type: Wave, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, to = freq, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: string): void {
    switch (name) {
      case "pistol":
        if (this.ok(name, 30)) { this.tone(900, 300, 0.08, "square", 0.25); this.noise(0.05, 0.2, 4000, 1000); }
        break;
      case "shotgun":
        if (this.ok(name, 30)) { this.noise(0.22, 0.6, 3000, 200); this.tone(160, 50, 0.15, "square", 0.3); }
        break;
      case "smg":
        if (this.ok(name, 25)) { this.tone(1200, 600, 0.04, "square", 0.15); this.noise(0.03, 0.12, 5000); }
        break;
      case "sniper":
        if (this.ok(name, 30)) { this.tone(2200, 120, 0.3, "sawtooth", 0.3); this.noise(0.25, 0.5, 6000, 300); }
        break;
      case "launcher":
        if (this.ok(name, 30)) { this.tone(220, 90, 0.18, "triangle", 0.5); this.noise(0.1, 0.3, 1500, 300); }
        break;
      case "charge":
        if (this.ok(name, 30)) this.tone(300, 1400, 0.28, "sine", 0.2);
        break;
      case "hit":
        if (this.ok(name, 35)) this.tone(500, 180, 0.06, "square", 0.15);
        break;
      case "kill":
        if (this.ok(name, 40)) { this.tone(700, 1400, 0.08, "square", 0.18); this.noise(0.12, 0.25, 2500, 400); }
        break;
      case "explode":
        if (this.ok(name, 50)) { this.noise(0.5, 0.8, 1800, 60); this.tone(120, 30, 0.4, "sine", 0.6); }
        break;
      case "mortarBoom":
        if (this.ok(name, 50)) { this.noise(0.4, 0.55, 1200, 60); this.tone(90, 30, 0.35, "sine", 0.5); }
        break;
      case "hurt":
        if (this.ok(name, 80)) { this.tone(260, 70, 0.22, "sawtooth", 0.4); this.noise(0.1, 0.3, 1200); }
        break;
      case "dash":
        if (this.ok(name, 60)) this.noise(0.18, 0.35, 600, 4000);
        break;
      case "skill":
        if (this.ok(name, 100)) { this.tone(200, 800, 0.35, "triangle", 0.35); this.tone(400, 1600, 0.35, "sine", 0.2, 0.05); }
        break;
      case "blocked":
        if (this.ok(name, 60)) this.tone(1800, 1500, 0.12, "triangle", 0.25);
        break;
      case "throw":
        if (this.ok(name, 60)) this.tone(400, 900, 0.12, "triangle", 0.25);
        break;
      case "swap":
        if (this.ok(name, 60)) { this.tone(600, 600, 0.04, "square", 0.15); this.tone(900, 900, 0.04, "square", 0.15, 0.05); }
        break;
      case "pickup":
        if (this.ok(name, 60)) [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.1, "square", 0.18, i * 0.06));
        break;
      // Lobby: someone lands on the stage, someone emotes.
      case "land":
        if (this.ok(name, 80)) { this.tone(180, 60, 0.12, "square", 0.25); this.noise(0.1, 0.2, 800, 200); }
        break;
      case "emote":
        if (this.ok(name, 80)) [784, 988].forEach((f, i) => this.tone(f, f * 1.05, 0.07, "triangle", 0.16, i * 0.07));
        break;
      // Enemy telegraphs: each attack type has its own warning sound.
      case "windupMelee":
        if (this.ok(name, 90)) this.tone(1400, 2200, 0.08, "square", 0.1);
        break;
      case "windupDash":
        if (this.ok(name, 120)) { this.tone(90, 260, 0.6, "sawtooth", 0.22); this.noise(0.6, 0.1, 300, 1500); }
        break;
      case "windupLob":
        if (this.ok(name, 120)) this.tone(700, 350, 0.25, "triangle", 0.2);
        break;
      case "mortarFire":
        if (this.ok(name, 80)) { this.tone(160, 80, 0.12, "square", 0.25); this.noise(0.08, 0.2, 900); }
        break;
      case "bite":
        if (this.ok(name, 60)) this.noise(0.06, 0.3, 2500, 800);
        break;
      case "bonk":
        if (this.ok(name, 80)) { this.tone(180, 60, 0.15, "square", 0.4); this.tone(1200, 1300, 0.3, "sine", 0.15, 0.08); }
        break;
      case "spawn":
        if (this.ok(name, 70)) this.tone(300, 900, 0.12, "sine", 0.08);
        break;
      case "wave":
        if (this.ok(name, 200)) [392, 523, 659].forEach((f, i) => this.tone(f, f, 0.18, "square", 0.18, i * 0.1));
        break;
      case "clear":
        if (this.ok(name, 200)) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.15, "square", 0.18, i * 0.08));
        break;
      case "downed":
        if (this.ok(name, 200)) [400, 300, 200, 120].forEach((f, i) => this.tone(f, f * 0.9, 0.2, "sawtooth", 0.25, i * 0.15));
        break;
      case "revive":
        if (this.ok(name, 200)) { this.tone(200, 1200, 0.5, "triangle", 0.35); this.noise(0.4, 0.3, 500, 4000); }
        break;
      case "weakHit":
        if (this.ok(name, 40)) { this.tone(900, 300, 0.07, "square", 0.18); this.tone(1800, 1800, 0.05, "sine", 0.12, 0.02); }
        break;
      case "shieldHit":
        if (this.ok(name, 45)) this.tone(1500, 1100, 0.06, "triangle", 0.15);
        break;
      case "shieldUp":
        if (this.ok(name, 150)) this.tone(500, 1500, 0.25, "sine", 0.18);
        break;
      case "shieldBreak":
        if (this.ok(name, 60)) { this.noise(0.18, 0.4, 7000, 1500); this.tone(1600, 400, 0.18, "triangle", 0.2); }
        break;
      case "freeze":
        if (this.ok(name, 80)) { this.tone(2400, 1800, 0.2, "sine", 0.2); this.noise(0.2, 0.15, 8000, 3000); }
        break;
      case "zap":
        if (this.ok(name, 50)) this.noise(0.08, 0.25, 9000, 2000);
        break;
      case "burn":
        if (this.ok(name, 120)) this.noise(0.1, 0.12, 1200, 600);
        break;
      case "ventWarn":
        if (this.ok(name, 150)) this.noise(0.9, 0.12, 200, 900);
        break;
      case "ventErupt":
        if (this.ok(name, 100)) { this.noise(0.7, 0.45, 1400, 120); this.tone(70, 40, 0.5, "sawtooth", 0.25); }
        break;
      case "reveal":
        if (this.ok(name, 100)) { this.tone(200, 900, 0.15, "square", 0.3); this.tone(150, 80, 0.25, "sawtooth", 0.3, 0.12); }
        break;
      case "split":
        if (this.ok(name, 80)) { this.tone(300, 900, 0.1, "sine", 0.2); this.noise(0.1, 0.2, 1500); }
        break;
      case "summon":
        if (this.ok(name, 150)) this.tone(200, 600, 0.4, "triangle", 0.15);
        break;
      case "slam":
        if (this.ok(name, 100)) { this.noise(0.45, 0.7, 900, 50); this.tone(80, 30, 0.4, "sine", 0.6); }
        break;
      case "bolt":
        if (this.ok(name, 80)) this.tone(900, 500, 0.15, "sawtooth", 0.12);
        break;
      case "bossPhase":
        if (this.ok(name, 400)) { this.tone(110, 55, 0.8, "sawtooth", 0.4); this.noise(0.8, 0.3, 600, 100); }
        break;
      case "loot":
        if (this.ok(name, 80)) this.tone(700, 1400, 0.12, "triangle", 0.15);
        break;
      case "lootRare":
        if (this.ok(name, 80)) [784, 988, 1175].forEach((f, i) => this.tone(f, f, 0.12, "triangle", 0.2, i * 0.05));
        break;
      case "lootLegendary":
        if (this.ok(name, 200)) [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f * 1.01, 0.25, "square", 0.18, i * 0.07));
        break;
      case "lootMythic":
        // A shimmering run up two octaves, then a chord that hangs in the air.
        if (this.ok(name, 400)) {
          [523, 659, 784, 988, 1175, 1318, 1568, 2093].forEach((f, i) => this.tone(f, f * 1.005, 0.18, "triangle", 0.16, i * 0.05));
          [1046, 1318, 1568].forEach((f) => this.tone(f, f * 1.01, 1.1, "sine", 0.14, 0.45));
          this.noise(0.6, 0.08, 9000, 6000, 0.4);
        }
        break;
      case "confiscate":
        // A rubber stamp coming down.
        if (this.ok(name, 90)) { this.tone(160, 70, 0.12, "square", 0.35); this.noise(0.08, 0.35, 1800, 300); this.tone(1400, 1100, 0.08, "triangle", 0.12, 0.06); }
        break;
      case "snooze":
        if (this.ok(name, 300)) [880, 740, 587, 440].forEach((f, i) => this.tone(f, f * 0.98, 0.22, "sine", 0.18, i * 0.12));
        break;
      case "chime":
        // The airport PA: ding-dong.
        if (this.ok(name, 200)) { this.tone(784, 784, 0.35, "sine", 0.22); this.tone(622, 622, 0.5, "sine", 0.22, 0.28); }
        break;
      // Grabbers: a heavy grab, and a pop when you get loose.
      case "grab":
        if (this.ok(name, 150)) { this.tone(140, 60, 0.25, "sawtooth", 0.35); this.noise(0.15, 0.35, 900, 150); }
        break;
      case "freed":
        if (this.ok(name, 150)) { this.tone(300, 900, 0.14, "square", 0.22); this.noise(0.1, 0.2, 3000, 800); }
        break;
      // Drowned Crypt: a candle catching, and every light going out at once.
      case "candle":
        if (this.ok(name, 80)) { this.noise(0.12, 0.15, 2500, 600); this.tone(1320, 1760, 0.12, "sine", 0.1, 0.03); }
        break;
      case "blackout":
        if (this.ok(name, 400)) { this.noise(0.6, 0.4, 2000, 80); this.tone(330, 55, 0.9, "sawtooth", 0.3); }
        break;
      case "ghost":
        // A spooky slide down, then back up.
        if (this.ok(name, 150)) { this.tone(900, 300, 0.35, "sine", 0.16); this.tone(300, 700, 0.3, "sine", 0.12, 0.3); }
        break;
      case "misplace":
        if (this.ok(name, 150)) { this.noise(0.18, 0.3, 3000, 600); this.tone(700, 200, 0.2, "triangle", 0.16); }
        break;
      case "found":
        if (this.ok(name, 120)) { this.tone(400, 900, 0.12, "triangle", 0.18); this.tone(900, 700, 0.1, "triangle", 0.12, 0.12); }
        break;
      case "rewind":
        // Tape spooling backwards.
        if (this.ok(name, 200)) { this.tone(1800, 300, 0.45, "sawtooth", 0.1); this.tone(300, 1200, 0.35, "sine", 0.25, 0.4); this.noise(0.4, 0.12, 5000, 2000); }
        break;
      case "heal":
        if (this.ok(name, 100)) [660, 880].forEach((f, i) => this.tone(f, f, 0.1, "sine", 0.2, i * 0.07));
        break;
      case "shrine":
        if (this.ok(name, 200)) [392, 494, 587, 784].forEach((f, i) => this.tone(f, f, 0.3, "triangle", 0.2, i * 0.09));
        break;
      case "chest":
        if (this.ok(name, 200)) { this.noise(0.1, 0.3, 2000); [523, 784].forEach((f, i) => this.tone(f, f, 0.15, "square", 0.15, 0.1 + i * 0.08)); }
        break;
      case "door":
        if (this.ok(name, 200)) { this.noise(0.5, 0.2, 400, 1500); this.tone(300, 600, 0.3, "square", 0.12, 0.3); }
        break;
      // Phase 5: hero gadgets, elites and the caverns.
      case "mark":
        if (this.ok(name, 60)) [1320, 1760].forEach((f, i) => this.tone(f, f, 0.07, "square", 0.12, i * 0.05));
        break;
      case "crit":
        if (this.ok(name, 60)) { this.tone(2000, 900, 0.12, "square", 0.18); this.noise(0.06, 0.2, 6000); }
        break;
      case "turret":
        if (this.ok(name, 40)) this.tone(1500, 700, 0.05, "square", 0.08);
        break;
      case "build":
        if (this.ok(name, 120)) [300, 450, 600].forEach((f, i) => { this.noise(0.04, 0.2, 3000, 800, i * 0.07); this.tone(f, f, 0.05, "square", 0.12, i * 0.07); });
        break;
      case "owl":
        if (this.ok(name, 200)) { this.tone(500, 420, 0.18, "sine", 0.22); this.tone(420, 380, 0.25, "sine", 0.22, 0.22); }
        break;
      case "gadgetGone":
        if (this.ok(name, 120)) this.tone(500, 120, 0.25, "triangle", 0.15);
        break;
      case "saved":
        if (this.ok(name, 200)) { this.tone(400, 1600, 0.3, "sine", 0.3); this.tone(800, 2400, 0.3, "triangle", 0.15, 0.08); }
        break;
      case "blink":
        if (this.ok(name, 120)) this.tone(1800, 300, 0.25, "sine", 0.15);
        break;
      case "blinkDone":
        if (this.ok(name, 120)) { this.tone(300, 1800, 0.12, "sine", 0.2); this.noise(0.1, 0.15, 4000); }
        break;
      case "deflect":
        if (this.ok(name, 50)) this.tone(2600, 2200, 0.05, "triangle", 0.15);
        break;
      case "relink":
        if (this.ok(name, 200)) { this.tone(150, 600, 0.4, "sawtooth", 0.2); this.tone(600, 150, 0.3, "sawtooth", 0.15, 0.3); }
        break;
      case "spiked":
        if (this.ok(name, 80)) { this.noise(0.12, 0.4, 5000, 900); this.tone(700, 200, 0.12, "square", 0.2); }
        break;
      // Bilge Sewers and the Orbital Deck.
      case "pipeBlast":
        if (this.ok(name, 100)) { this.noise(0.6, 0.4, 900, 200); this.tone(110, 60, 0.4, "triangle", 0.25); }
        break;
      case "laserOn":
        if (this.ok(name, 100)) this.tone(1800, 2400, 0.12, "sawtooth", 0.1);
        break;
      case "warp":
        if (this.ok(name, 80)) { this.tone(400, 1600, 0.16, "sine", 0.25); this.tone(1600, 800, 0.1, "square", 0.08); }
        break;
      case "splash":
        if (this.ok(name, 120)) { this.noise(0.5, 0.6, 1600, 150); this.tone(90, 40, 0.35, "sine", 0.5); }
        break;
      case "sweep":
        if (this.ok(name, 200)) this.tone(300, 900, 0.6, "sawtooth", 0.18);
        break;
      case "breath":
        if (this.ok(name, 150)) { this.noise(0.6, 0.5, 6000, 400); this.tone(200, 90, 0.5, "sawtooth", 0.15); }
        break;
      case "windupBreath":
        if (this.ok(name, 150)) this.noise(0.9, 0.15, 300, 3000);
        break;
      case "victory":
        if (this.ok(name, 500)) [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.2, "square", 0.2, i * 0.12));
        break;
    }
  }
}

export const sfx = new Sfx();
