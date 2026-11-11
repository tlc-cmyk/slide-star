/**
 * 滑管星 — play engine (pure logic, no DOM / no Web Audio).
 * Original trombone-rhythm rules and public-domain melody charts
 * with original simple accompaniments.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SlideStarEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAIL = 0.45;
  var BREATH_MAX = 5.0;
  var BREATH_LOCK = 0.6;
  var BREATH_REFILL = 3.2;
  var PITCH_LAG = 0.012;
  var GRACE_PRE = 0.08;
  var GRACE_POST = 0.1;
  var BAND_SUPER = 0.4;
  var BAND_GOOD = 0.8;
  var BAND_OK = 1.3;
  var BASE_POINTS = 400;
  var COMBO_STEP = 0.08;
  var COMBO_CAP = 12;

  // Playfield pitch window (MIDI). Covers G3–A5 with a little margin.
  var PITCH_MIN = 53; // F3
  var PITCH_MAX = 84; // C6

  var JUDGE = {
    super: "超準",
    good: "準",
    ok: "尚可",
    off: "走音",
    silent: "靜咗",
  };

  var GRADES = [
    { min: 95, name: "首席" },
    { min: 85, name: "好手" },
    { min: 70, name: "合格" },
    { min: 40, name: "練習" },
    { min: 0, name: "噪音" },
  ];

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function pitchToNorm(midi) {
    return (PITCH_MAX - midi) / (PITCH_MAX - PITCH_MIN);
  }

  function normToMidi(n) {
    return PITCH_MAX - clamp(n, 0, 1) * (PITCH_MAX - PITCH_MIN);
  }

  /**
   * Parse "C4", "F#5", "Bb3" into MIDI. Numbers pass through.
   */
  function midiOf(name) {
    if (typeof name === "number") return name;
    var m = /^([A-G])([#b]?)(-?\d+)$/.exec(String(name));
    if (!m) throw new Error("bad pitch: " + name);
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    if (m[2] === "#") base += 1;
    if (m[2] === "b") base -= 1;
    return (parseInt(m[3], 10) + 1) * 12 + base;
  }

  function N(pitch, beats, endPitch) {
    return [pitch, beats, endPitch == null ? pitch : endPitch];
  }

  function buildNotes(tune, lead, beat) {
    var notes = [];
    var t = lead;
    for (var i = 0; i < tune.length; i++) {
      var pitch = midiOf(tune[i][0]);
      var beats = tune[i][1];
      var endPitch = midiOf(tune[i][2] == null ? tune[i][0] : tune[i][2]);
      var dur = beats * beat;
      notes.push({
        index: i,
        pitch: pitch,
        endPitch: endPitch,
        beats: beats,
        start: t,
        end: t + dur,
        dur: dur,
      });
      t += dur;
    }
    return notes;
  }

  // Chord tones as MIDI, mid register, for a light piano / pizz backing.
  var CHORD_MIDI = {
    C: [48, 52, 55],
    F: [53, 57, 60],
    G: [43, 47, 50],
    D: [50, 54, 57],
    A: [45, 49, 52],
    E: [40, 44, 47],
    Am: [45, 48, 52],
    Dm: [50, 53, 57],
    A7: [45, 49, 52, 55],
    G7: [43, 47, 50, 53],
  };

  function buildPianoEvents(chordSeq, meter, lead, beat, songEnd, melodyBeats) {
    var events = [];
    var slotBeats = melodyBeats / chordSeq.length;
    if (!isFinite(slotBeats) || Math.abs(slotBeats * chordSeq.length - melodyBeats) > 1e-6) {
      throw new Error("chord sequence does not tile the melody");
    }
    for (var i = 0; i < chordSeq.length; i++) {
      var name = chordSeq[i];
      var tones = CHORD_MIDI[name];
      if (!tones) throw new Error("unknown chord: " + name);
      var t0 = lead + i * slotBeats * beat;
      if (t0 >= songEnd - 1e-9) break;
      var root = tones[0] - 12;
      if (Math.abs(slotBeats - 3) < 1e-9) {
        events.push({ time: t0, kind: "bass", freqs: [midiToFreq(root)] });
        events.push({
          time: t0 + beat,
          kind: "pizz",
          freqs: tones.map(midiToFreq),
        });
        events.push({
          time: t0 + 2 * beat,
          kind: "pizz",
          freqs: tones.map(midiToFreq),
        });
      } else if (slotBeats >= 3.5) {
        events.push({
          time: t0,
          kind: "downbeat",
          freqs: [midiToFreq(root)].concat(tones.map(midiToFreq)),
        });
        events.push({
          time: t0 + 2 * beat,
          kind: "pizz",
          freqs: tones.map(midiToFreq),
        });
      } else {
        events.push({
          time: t0,
          kind: "downbeat",
          freqs: [midiToFreq(root)].concat(tones.map(midiToFreq)),
        });
      }
    }
    return events;
  }

  function buildSong(spec) {
    var beat = 60 / spec.bpm;
    var lead = spec.leadBeats * beat;
    var notes = buildNotes(spec.tune, lead, beat);
    var melodyBeats = 0;
    for (var i = 0; i < spec.tune.length; i++) melodyBeats += spec.tune[i][1];
    var total = melodyBeats * beat;
    var songEnd = lead + total;
    var piano = buildPianoEvents(spec.chords, spec.meter, lead, beat, songEnd, melodyBeats);
    return {
      id: spec.id,
      title: spec.title,
      label: spec.label,
      key: spec.key,
      bpm: spec.bpm,
      meter: spec.meter,
      leadBeats: spec.leadBeats,
      beat: beat,
      lead: lead,
      total: total,
      songEnd: songEnd,
      resultAt: songEnd + TAIL,
      notes: notes,
      chordSeq: spec.chords,
      piano: piano,
      chordSlotBeats: melodyBeats / spec.chords.length,
      bg: spec.bg,
    };
  }

  // ——— Songs (public-domain melodies, original simple arrangements) ———

  var TWINKLE_TUNE = [
    N("C4", 1), N("C4", 1), N("G4", 1), N("G4", 1), N("A4", 1), N("A4", 1), N("G4", 2),
    N("F4", 1), N("F4", 1), N("E4", 1), N("E4", 1), N("D4", 1), N("D4", 1), N("C4", 2),
    N("G4", 1), N("G4", 1), N("F4", 1), N("F4", 1), N("E4", 1), N("E4", 1), N("D4", 2),
    N("G4", 1), N("G4", 1), N("F4", 1), N("F4", 1), N("E4", 1), N("E4", 1), N("D4", 2),
    N("C4", 1), N("C4", 1), N("G4", 1), N("G4", 1), N("A4", 1), N("A4", 1), N("G4", 2),
    N("F4", 1), N("F4", 1), N("E4", 1), N("E4", 1), N("D4", 1), N("D4", 1), N("C4", 2),
  ];
  var TWINKLE_CHORDS = [
    "C", "C", "F", "C", "F", "C", "G", "C",
    "C", "F", "C", "G", "C", "F", "C", "G",
    "C", "C", "F", "C", "F", "C", "G", "C",
  ];

  // Frère Jacques twice through, still a short early level.
  var TIGERS_ONCE = [
    N("C4", 1), N("D4", 1), N("E4", 1), N("C4", 1),
    N("C4", 1), N("D4", 1), N("E4", 1), N("C4", 1),
    N("E4", 1), N("F4", 1), N("G4", 2),
    N("E4", 1), N("F4", 1), N("G4", 2),
    N("G4", 0.5), N("A4", 0.5), N("G4", 0.5), N("F4", 0.5), N("E4", 1), N("C4", 1),
    N("G4", 0.5), N("A4", 0.5), N("G4", 0.5), N("F4", 0.5), N("E4", 1), N("C4", 1),
    N("C4", 1), N("G3", 1), N("C4", 2),
    N("C4", 1), N("G3", 1), N("C4", 2),
  ];
  var TIGERS_TUNE = TIGERS_ONCE.concat(TIGERS_ONCE);
  var TIGERS_CHORDS = [
    "C", "C", "C", "C", "C", "C", "F", "C", "G", "C", "G", "C", "C", "G", "C", "C",
    "C", "C", "C", "C", "C", "C", "F", "C", "G", "C", "G", "C", "C", "G", "C", "C",
  ];

  var JOY_TUNE = [
    N("E4", 1), N("E4", 1), N("F4", 1), N("G4", 1),
    N("G4", 1), N("F4", 1), N("E4", 1), N("D4", 1),
    N("C4", 1), N("C4", 1), N("D4", 1), N("E4", 1),
    N("E4", 1.5), N("D4", 0.5), N("D4", 2),
    N("E4", 1), N("E4", 1), N("F4", 1), N("G4", 1),
    N("G4", 1), N("F4", 1), N("E4", 1), N("D4", 1),
    N("C4", 1), N("C4", 1), N("D4", 1), N("E4", 1),
    N("D4", 1.5), N("C4", 0.5), N("C4", 2),
    N("D4", 1), N("D4", 1), N("E4", 1), N("C4", 1),
    N("D4", 1), N("E4", 0.5), N("F4", 0.5), N("E4", 1), N("C4", 1),
    N("D4", 1), N("E4", 0.5), N("F4", 0.5), N("E4", 1), N("D4", 1),
    N("C4", 1), N("D4", 1), N("G3", 2),
    N("E4", 1), N("E4", 1), N("F4", 1), N("G4", 1),
    N("G4", 1), N("F4", 1), N("E4", 1), N("D4", 1),
    N("C4", 1), N("C4", 1), N("D4", 1), N("E4", 1),
    N("D4", 1.5), N("C4", 0.5), N("C4", 2),
  ];
  var JOY_CHORDS = [
    "C", "G", "C", "G",
    "C", "G", "C", "C",
    "G", "C", "G", "C",
    "C", "G", "C", "C",
  ];

  // Famous opening + main waltz theme of The Blue Danube (PD melody only).
  var DANUBE_THEME = [
    N("D5", 2), N("C#5", 1), N("B4", 2), N("A4", 1), N("G4", 2), N("F#4", 1), N("E4", 2), N("D4", 1),
    N("F#4", 2), N("A4", 1), N("A4", 3), N("E4", 2), N("G4", 1), N("G4", 3),
    N("D5", 2), N("C#5", 1), N("B4", 2), N("A4", 1), N("G4", 2), N("F#4", 1), N("E4", 2), N("D4", 1),
    N("A4", 2), N("C#5", 1), N("E5", 3), N("D5", 3), N("D5", 3),
  ];
  var DANUBE_TUNE = [
    N("A4", 3), N("A4", 3), N("A4", 1), N("G#4", 1), N("A4", 1), N("C#5", 1), N("E5", 1), N("A5", 1),
    N("D4", 1), N("F#4", 1), N("A4", 1),
  ].concat(DANUBE_THEME, DANUBE_THEME);

  var DANUBE_CHORDS = [
    "A", "A", "A", "A",
    "D",
    "D", "D", "G", "D", "D", "A", "A", "A",
    "D", "D", "G", "D", "A", "A", "D", "D",
    "D", "D", "G", "D", "D", "A", "A", "A",
    "D", "D", "G", "D", "A", "A", "D", "D",
  ];

  var SONG_SPECS = [
    {
      id: "twinkle",
      title: "一閃一閃",
      label: "第一首　一閃一閃",
      key: "C",
      bpm: 100,
      meter: 4,
      leadBeats: 4,
      tune: TWINKLE_TUNE,
      chords: TWINKLE_CHORDS,
      bg: "night",
    },
    {
      id: "tigers",
      title: "兩隻老虎",
      label: "第二首　兩隻老虎",
      key: "C",
      bpm: 108,
      meter: 4,
      leadBeats: 4,
      tune: TIGERS_TUNE,
      chords: TIGERS_CHORDS,
      bg: "classroom",
    },
    {
      id: "joy",
      title: "歡樂頌",
      label: "第三首　歡樂頌",
      key: "C",
      bpm: 100,
      meter: 4,
      leadBeats: 4,
      tune: JOY_TUNE,
      chords: JOY_CHORDS,
      bg: "hall",
    },
    {
      id: "danube",
      title: "藍色多瑞河",
      label: "第四首　藍色多瑞河",
      key: "D",
      bpm: 120,
      meter: 3,
      leadBeats: 6,
      tune: DANUBE_TUNE,
      chords: DANUBE_CHORDS,
      bg: "river",
    },
  ];

  var SONGS = SONG_SPECS.map(buildSong);
  var SONG_MAP = {};
  SONGS.forEach(function (s) {
    SONG_MAP[s.id] = s;
  });

  var currentSong = SONGS[0];

  function getSong(id) {
    return SONG_MAP[id] || SONGS[0];
  }

  function setSong(id) {
    currentSong = getSong(id);
    return currentSong;
  }

  function getCurrentSong() {
    return currentSong;
  }

  function nextSongId(id) {
    for (var i = 0; i < SONGS.length - 1; i++) {
      if (SONGS[i].id === id) return SONGS[i + 1].id;
    }
    return null;
  }

  function notePitchAt(note, t) {
    if (note.pitch === note.endPitch) return note.pitch;
    var u = clamp((t - note.start) / (note.dur || 1e-6), 0, 1);
    return note.pitch + (note.endPitch - note.pitch) * u;
  }

  function noteAt(t, song) {
    song = song || currentSong;
    var notes = song.notes;
    for (var i = 0; i < notes.length; i++) {
      if (t >= notes[i].start && t < notes[i].end) return notes[i];
    }
    return null;
  }

  function lastNoteAt(t, song) {
    song = song || currentSong;
    var notes = song.notes;
    var found = notes[0];
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].start <= t) found = notes[i];
    }
    return found;
  }

  function gradeFor(accuracy) {
    var a = accuracy;
    for (var i = 0; i < GRADES.length; i++) {
      if (a >= GRADES[i].min) return GRADES[i].name;
    }
    return GRADES[GRADES.length - 1].name;
  }

  function emptyStat() {
    return {
      blowTime: 0,
      silentTime: 0,
      errSum: 0,
      errWeight: 0,
      touched: false,
    };
  }

  function PlayEngine(songId) {
    this.song = songId ? getSong(songId) : currentSong;
    this.reset();
  }

  PlayEngine.prototype.setSong = function (songId) {
    this.song = getSong(songId);
    this.reset();
    return this.song;
  };

  PlayEngine.prototype.reset = function () {
    var mid = (PITCH_MIN + PITCH_MAX) / 2;
    this.time = 0;
    this.finished = false;
    this.cursorPitch = mid;
    this.targetPitch = mid;
    this.blowing = false;
    this.wantBlow = false;
    this.breathHold = 0;
    this.breathLock = 0;
    this.justBreathed = false;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastJudge = null;
    this.pops = [];
    this.stats = [];
    this.results = [];
    this.accuracyNum = 0;
    this.accuracyDen = 0;
    this._finalized = {};
    this.feel = "idle";
    this.lookPitch = mid;
  };

  PlayEngine.prototype.breathFill = function () {
    if (this.breathLock > 0) return 0;
    return clamp(1 - this.breathHold / BREATH_MAX, 0, 1);
  };

  PlayEngine.prototype._setPitchFromInput = function (input) {
    if (!input) return;
    if (input.pitchMidi != null && isFinite(input.pitchMidi)) {
      this.targetPitch = clamp(input.pitchMidi, PITCH_MIN, PITCH_MAX);
    } else if (input.pitchNorm != null && isFinite(input.pitchNorm)) {
      this.targetPitch = normToMidi(input.pitchNorm);
    }
  };

  PlayEngine.prototype._updateCursor = function (dt) {
    var a = 1 - Math.exp(-dt / PITCH_LAG);
    this.cursorPitch += (this.targetPitch - this.cursorPitch) * a;
    this.lookPitch = this.cursorPitch;
  };

  PlayEngine.prototype._updateBreath = function (dt, input) {
    this.justBreathed = false;
    this.wantBlow = !!(input && input.blowing);
    if (this.breathLock > 0) {
      this.breathLock -= dt;
      this.blowing = false;
      if (this.breathLock <= 0) {
        this.breathLock = 0;
        this.breathHold = 0;
      }
      return;
    }
    if (this.wantBlow) {
      this.blowing = true;
      this.breathHold += dt;
      if (this.breathHold >= BREATH_MAX) {
        this.blowing = false;
        this.breathLock = BREATH_LOCK;
        this.justBreathed = true;
        this.feel = "breath";
      }
    } else {
      this.blowing = false;
      // Any release ends the continuous hold; the 5s cap only applies
      // to an unbroken blow. The meter snaps back to full.
      this.breathHold = 0;
    }
  };

  PlayEngine.prototype._ensureStat = function (index) {
    if (!this.stats[index]) this.stats[index] = emptyStat();
    return this.stats[index];
  };

  PlayEngine.prototype._accumulate = function (note, t, dt) {
    var st = this._ensureStat(note.index);
    var inside = t >= note.start && t < note.end;
    if (!inside) return;
    var target = notePitchAt(note, t);
    if (this.blowing) {
      st.blowTime += dt;
      st.touched = true;
      var err = Math.abs(this.cursorPitch - target);
      st.errSum += err * dt;
      st.errWeight += dt;
    } else {
      st.silentTime += dt;
    }
  };

  PlayEngine.prototype._finalizeNote = function (note) {
    if (this._finalized[note.index]) return;
    this._finalized[note.index] = true;
    var st = this._ensureStat(note.index);
    var coverage = st.blowTime / Math.max(note.dur, 1e-6);
    var meanErr = st.errWeight > 0 ? st.errSum / st.errWeight : 99;
    var label;
    var quality;
    if (coverage < 0.35 || (!st.touched && coverage < 0.5)) {
      label = JUDGE.silent;
      quality = 0;
    } else if (meanErr > BAND_OK) {
      label = JUDGE.off;
      quality = clamp(0.18 * (1 - (meanErr - BAND_OK) / 4), 0.02, 0.18);
    } else if (coverage < 0.55) {
      label = JUDGE.silent;
      quality = clamp(coverage * 0.25, 0, 0.2);
    } else if (meanErr <= BAND_SUPER && coverage >= 0.82) {
      label = JUDGE.super;
      quality = 1;
    } else if (meanErr <= BAND_GOOD) {
      label = JUDGE.good;
      quality = 0.84;
    } else {
      label = JUDGE.ok;
      quality = 0.58;
    }

    var comboOk = label === JUDGE.super || label === JUDGE.good || label === JUDGE.ok;
    if (comboOk) this.combo += 1;
    else this.combo = 0;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    var mult = 1 + COMBO_STEP * Math.min(this.combo, COMBO_CAP);
    var points = Math.round(BASE_POINTS * note.beats * quality * mult);
    this.score += points;
    this.accuracyNum += quality * note.dur;
    this.accuracyDen += note.dur;

    var rec = {
      index: note.index,
      label: label,
      quality: quality,
      points: points,
      coverage: coverage,
      meanErr: meanErr,
      combo: this.combo,
    };
    this.results.push(rec);
    this.lastJudge = rec;
    this.pops.push({
      label: label,
      t: this.time,
      pitch: notePitchAt(note, note.end - 1e-4),
      life: 0,
    });
    if (this.pops.length > 8) this.pops.shift();

    if (label === JUDGE.super || label === JUDGE.good) this.feel = "good";
    else if (label === JUDGE.ok) this.feel = "ok";
    else if (label === JUDGE.silent) this.feel = "idle";
    else this.feel = "bad";
  };

  PlayEngine.prototype._scoreNotes = function (dt) {
    var notes = this.song.notes;
    var t = this.time;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (this._finalized[n.index]) continue;
      if (t < n.start) break;
      var overlapStart = Math.max(n.start, t - dt);
      var overlapEnd = Math.min(n.end, t);
      if (overlapEnd > overlapStart) {
        this._accumulate(n, (overlapStart + overlapEnd) / 2, overlapEnd - overlapStart);
      }
      if (t >= n.end) this._finalizeNote(n);
    }
    if (this.pops.length) {
      for (var p = 0; p < this.pops.length; p++) this.pops[p].life += dt;
      while (this.pops.length && this.pops[0].life > 1.1) this.pops.shift();
    }
  };

  PlayEngine.prototype.step = function (dt, input) {
    if (this.finished) return;
    dt = clamp(dt, 0, 0.08);
    if (dt <= 0) return;
    this._setPitchFromInput(input);
    this._updateCursor(dt);
    this._updateBreath(dt, input);
    this.time += dt;
    this._scoreNotes(dt);
    if (this.time >= this.song.resultAt) {
      var notes = this.song.notes;
      for (var i = 0; i < notes.length; i++) this._finalizeNote(notes[i]);
      this.finished = true;
      this.blowing = false;
    }
  };

  PlayEngine.prototype.accuracy = function () {
    if (this.accuracyDen <= 0) return 0;
    return (this.accuracyNum / this.accuracyDen) * 100;
  };

  PlayEngine.prototype.liveAccuracy = function () {
    return this.accuracy();
  };

  PlayEngine.prototype.result = function () {
    if (!this.finished) {
      var notes = this.song.notes;
      for (var i = 0; i < notes.length; i++) this._finalizeNote(notes[i]);
    }
    var acc = this.accuracy();
    var grade = gradeFor(acc);
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy: acc,
      shown: Math.round(acc * 10) / 10,
      grade: grade,
      headline: grade,
      results: this.results,
      songId: this.song.id,
      title: this.song.title,
    };
  };

  PlayEngine.prototype.elapsedDisplay = function () {
    var t = clamp(this.time - this.song.lead, 0, this.song.total);
    return t;
  };

  return {
    TAIL: TAIL,
    BREATH_MAX: BREATH_MAX,
    BREATH_LOCK: BREATH_LOCK,
    PITCH_LAG: PITCH_LAG,
    PITCH_MIN: PITCH_MIN,
    PITCH_MAX: PITCH_MAX,
    JUDGE: JUDGE,
    GRADES: GRADES,
    SONGS: SONGS,
    CHORD_MIDI: CHORD_MIDI,
    midiOf: midiOf,
    midiToFreq: midiToFreq,
    pitchToNorm: pitchToNorm,
    normToMidi: normToMidi,
    notePitchAt: notePitchAt,
    noteAt: noteAt,
    lastNoteAt: lastNoteAt,
    getSong: getSong,
    setSong: setSong,
    getCurrentSong: getCurrentSong,
    nextSongId: nextSongId,
    gradeFor: gradeFor,
    PlayEngine: PlayEngine,
    clamp: clamp,
  };
});
