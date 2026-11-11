/**
 * 滑管星 — original Web Audio synthesis.
 * Brassy trombone voice, light piano / pizzicato accompaniment, count-in ticks.
 * No samples, no CDN, no official game audio.
 */
(function (root) {
  "use strict";

  var E = root.SlideStarEngine;

  function ramps(param, value, t, attack) {
    param.cancelScheduledValues(t);
    var cur = param.value;
    param.setValueAtTime(cur, t);
    param.linearRampToValueAtTime(value, t + (attack || 0.02));
  }

  function makeBrassWave(ctx) {
    var n = 32;
    var real = new Float32Array(n);
    var imag = new Float32Array(n);
    for (var i = 1; i < n; i++) {
      var odd = i % 2 === 1;
      var amp = 1 / Math.pow(i, odd ? 0.85 : 1.35);
      imag[i] = odd ? amp * 1.35 : amp * 0.22;
    }
    return ctx.createPeriodicWave(real, imag);
  }

  function SlideStarAudio() {
    this.ctx = null;
    this.master = null;
    this.hornBus = null;
    this.accBus = null;
    this.horn = null;
    this.unlocked = false;
    this.muted = false;
    this._on = false;
    this._accNodes = [];
    this._wobblePhase = 0;
  }

  SlideStarAudio.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  };

  SlideStarAudio.prototype.unlock = function () {
    var AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) return Promise.resolve(false);
    var self = this;
    if (!this.ctx) {
      var ctx = new AudioCtx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);

      this.hornBus = ctx.createGain();
      this.hornBus.gain.value = 1;
      this.hornBus.connect(this.master);

      this.accBus = ctx.createGain();
      this.accBus.gain.value = 0.62;
      this.accBus.connect(this.master);

      this.horn = createHorn(ctx);
      this.horn.out.connect(this.hornBus);
    }
    var ctx2 = this.ctx;
    var p = ctx2.state === "suspended" ? ctx2.resume() : Promise.resolve();
    return p.then(function () {
      self.unlocked = true;
      self.setMuted(self.muted);
      return true;
    });
  };

  function createHorn(ctx) {
    var wave = makeBrassWave(ctx);
    var osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);

    var body = ctx.createOscillator();
    body.type = "triangle";

    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 90;
    hp.Q.value = 0.7;

    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600;
    bp.Q.value = 1.1;

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.Q.value = 0.85;

    var glow = ctx.createBiquadFilter();
    glow.type = "peaking";
    glow.frequency.value = 800;
    glow.Q.value = 1.2;
    glow.gain.value = 3.5;

    var oscGain = ctx.createGain();
    oscGain.gain.value = 0.85;
    var bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.22;

    var env = ctx.createGain();
    env.gain.value = 0;

    osc.connect(oscGain);
    body.connect(bodyGain);
    oscGain.connect(hp);
    bodyGain.connect(hp);
    hp.connect(bp);
    bp.connect(glow);
    glow.connect(lp);
    lp.connect(env);

    var out = ctx.createGain();
    out.gain.value = 1;
    env.connect(out);

    osc.start();
    body.start();

    return {
      osc: osc,
      body: body,
      bp: bp,
      lp: lp,
      glow: glow,
      env: env,
      out: out,
    };
  }

  function hornLevel(midi) {
    // Slightly gentler on very high notes so the brass does not shriek.
    var t = (midi - 55) / 30;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return 0.34 - t * 0.1;
  }

  SlideStarAudio.prototype._attack = function (t) {
    var env = this.horn.env.gain;
    env.cancelScheduledValues(t);
    var cur = env.value;
    env.setValueAtTime(cur, t);
    env.linearRampToValueAtTime(Math.max(cur, 0.02) + 0.12, t + 0.012);
  };

  SlideStarAudio.prototype._release = function (t) {
    ramps(this.horn.env.gain, 0, t, 0.05);
  };

  SlideStarAudio.prototype.update = function (engine) {
    if (!this.ctx || !this.horn || !engine) return;
    var t = this.ctx.currentTime;
    var freq = E.midiToFreq(engine.cursorPitch);
    var note = E.noteAt(engine.time, engine.song);
    var wobble = 0;
    if (engine.blowing && note) {
      var err = Math.abs(engine.cursorPitch - E.notePitchAt(note, engine.time));
      if (err > 0.35) {
        this._wobblePhase += 0.35;
        wobble = Math.min(1, (err - 0.35) / 1.6) * 0.011 * Math.sin(this._wobblePhase);
      }
    }
    var f = freq * (1 + wobble);
    this.horn.osc.frequency.setTargetAtTime(f, t, 0.008);
    this.horn.body.frequency.setTargetAtTime(f * 0.5, t, 0.008);
    this.horn.bp.frequency.setTargetAtTime(Math.min(1800, f * 1.35), t, 0.02);
    this.horn.lp.frequency.setTargetAtTime(Math.min(3200, 1400 + f * 1.1), t, 0.03);
    this.horn.glow.frequency.setTargetAtTime(Math.min(1600, f * 1.6), t, 0.03);

    var on = !!(engine.blowing && !engine.finished);
    if (on && !this._on) this._attack(t);
    if (!on && this._on) this._release(t);
    this._on = on;

    var target = on ? hornLevel(engine.cursorPitch) : 0;
    this.horn.env.gain.setTargetAtTime(target, t, on ? 0.018 : 0.05);
  };

  SlideStarAudio.prototype.stopVoices = function () {
    if (!this.ctx || !this.horn) return;
    this._on = false;
    ramps(this.horn.env.gain, 0, this.ctx.currentTime, 0.04);
  };

  SlideStarAudio.prototype.cancelAccompaniment = function () {
    for (var i = 0; i < this._accNodes.length; i++) {
      try {
        this._accNodes[i].stop();
      } catch (err) {}
    }
    this._accNodes.length = 0;
  };

  function startOsc(ctx, type, freq, dest, when, peak, attack, dur, nodes) {
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    nodes.push(osc);
  }

  SlideStarAudio.prototype.scheduleScore = function (startAt, song) {
    this.cancelAccompaniment();
    if (!this.ctx || !song) return;
    var ctx = this.ctx;
    var dest = this.accBus;
    var nodes = this._accNodes;
    var i;

    // Count-in ticks on each lead-in beat.
    for (i = 0; i < song.leadBeats; i++) {
      var tt = startAt + i * song.beat;
      var accent = i % song.meter === 0;
      startOsc(ctx, "square", accent ? 1320 : 990, dest, tt, accent ? 0.07 : 0.045, 0.004, 0.07, nodes);
      startOsc(ctx, "sine", accent ? 660 : 495, dest, tt, accent ? 0.05 : 0.03, 0.004, 0.08, nodes);
    }

    var events = song.piano || [];
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      var when = startAt + ev.time;
      var freqs = ev.freqs;
      var k;
      if (ev.kind === "bass") {
        startOsc(ctx, "sine", freqs[0], dest, when, 0.16, 0.01, 0.42, nodes);
      } else if (ev.kind === "downbeat") {
        startOsc(ctx, "sine", freqs[0], dest, when, 0.14, 0.01, 0.4, nodes);
        for (k = 1; k < freqs.length; k++) {
          startOsc(ctx, "triangle", freqs[k], dest, when, 0.05, 0.008, 0.28, nodes);
        }
      } else {
        for (k = 0; k < freqs.length; k++) {
          startOsc(ctx, "triangle", freqs[k], dest, when, 0.045 - k * 0.006, 0.006, 0.2, nodes);
        }
      }
    }
  };

  root.SlideStarAudio = SlideStarAudio;
})(typeof globalThis !== "undefined" ? globalThis : this);
