/**
 * Headless tests for the 滑管星 play engine.
 * No browser, no Web Audio.
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const E = require("./engine.js");

const DT = 1 / 60;

function songOf(eng) {
  return (eng && eng.song) || E.getCurrentSong();
}

function run(inputFn, songId) {
  const eng = new E.PlayEngine(songId);
  const resultAt = songOf(eng).resultAt;
  let steps = 0;
  const maxSteps = Math.ceil(resultAt / DT) + 16;
  while (eng.time < resultAt && steps < maxSteps) {
    const input = inputFn(eng, DT) || {};
    eng.step(DT, input);
    steps++;
  }
  return eng;
}

/**
 * Perfect bot: sits on the current (or soon-to-arrive) note pitch,
 * blows through each note, and tongues briefly at boundaries so the
 * 5-second breath cap never cuts a phrase mid-note.
 */
function perfectBot() {
  return function (eng) {
    const t = eng.time;
    const song = songOf(eng);
    const notes = song.notes;
    let note = E.noteAt(t, song);
    if (!note) {
      note = notes.find((n) => n.start > t) || notes[notes.length - 1];
    }
    const upcoming = notes.find((n) => n.start >= t && n.start - t <= 0.04);
    const pitchNote = upcoming || note;
    const pitchMidi = pitchNote ? E.notePitchAt(pitchNote, Math.max(t, pitchNote.start)) : 60;

    let blowing = t >= song.lead - 0.04 && t <= song.songEnd + 0.02;
    // Tongue in the grace window at the end of a note if the next one is adjacent,
    // which also resets the breath timer.
    const current = E.noteAt(t, song);
    if (current) {
      const next = notes[current.index + 1];
      const nearEnd = current.end - t <= 0.05 && current.end - t > 0.01;
      if (next && Math.abs(next.start - current.end) < 1e-9 && nearEnd) {
        blowing = false;
      }
      // If breath is getting low, release in the same tiny end window.
      if (eng.breathHold > E.BREATH_MAX - 0.7 && current.end - t <= 0.08) {
        blowing = false;
      }
    }
    if (t < song.lead || t >= song.songEnd) blowing = t >= song.lead && t < song.lead + 0.01 ? false : blowing;
    if (t < song.lead || t >= song.songEnd) blowing = false;
    return { blowing, pitchMidi };
  };
}

function stillBot() {
  return function () {
    return { blowing: false, pitchMidi: 60 };
  };
}

function offPitchBot() {
  return function (eng) {
    const t = eng.time;
    const song = songOf(eng);
    const note = E.noteAt(t, song) || song.notes[0];
    const target = note ? E.notePitchAt(note, t) : 60;
    let blowing = t >= song.lead && t < song.songEnd;
    const current = E.noteAt(t, song);
    if (current) {
      const next = song.notes[current.index + 1];
      const nearEnd = current.end - t <= 0.05 && current.end - t > 0.01;
      if (next && Math.abs(next.start - current.end) < 1e-9 && nearEnd) blowing = false;
      if (eng.breathHold > E.BREATH_MAX - 0.7 && current.end - t <= 0.08) blowing = false;
    }
    return { blowing, pitchMidi: target + 7 };
  };
}

function assertContinuous(song) {
  const notes = song.notes;
  assert.ok(notes.length > 0, song.id + " should have notes");
  assert.ok(Math.abs(notes[0].start - song.lead) < 1e-9, song.id + " should start after lead-in");
  for (let i = 1; i < notes.length; i++) {
    assert.ok(
      Math.abs(notes[i].start - notes[i - 1].end) < 1e-9,
      song.id + " should tile without gaps at note " + i + " (" + notes[i - 1].end + " -> " + notes[i].start + ")"
    );
  }
  assert.ok(Math.abs(notes[notes.length - 1].end - song.songEnd) < 1e-9, song.id + " last note should end at songEnd");
  const sum = notes.reduce((a, n) => a + n.dur, 0);
  assert.ok(Math.abs(sum - song.total) < 1e-9, song.id + " durations should sum to total");
  assert.ok(Math.abs(song.total - (song.songEnd - song.lead)) < 1e-9);
  const chordBeats = song.chordSeq.length * song.chordSlotBeats;
  const melodyBeats = song.total / song.beat;
  assert.ok(
    Math.abs(chordBeats - melodyBeats) < 1e-6,
    song.id + " chords should cover the melody, got " + chordBeats + " vs " + melodyBeats
  );
}

function expectHighRank(r, label) {
  assert.ok(r.accuracy >= 95, label + " accuracy should be 95+, got " + r.accuracy.toFixed(2));
  assert.ok(r.grade === "首席", label + " grade should be 首席, got " + r.grade);
  assert.ok(r.score > 1000, label + " score should be substantial, got " + r.score);
  assert.ok(r.maxCombo >= Math.floor(r.results.length * 0.9), label + " combo should cover almost all notes");
}

assert.equal(E.midiOf("C4"), 60);
assert.equal(E.midiOf("A4"), 69);
assert.equal(E.midiOf("G3"), 55);
assert.equal(E.midiOf("A5"), 81);
assert.ok(Math.abs(E.midiToFreq(69) - 440) < 1e-6);
assert.equal(E.pitchToNorm(E.PITCH_MAX), 0);
assert.equal(E.pitchToNorm(E.PITCH_MIN), 1);
assert.ok(Math.abs(E.normToMidi(0) - E.PITCH_MAX) < 1e-9);
assert.ok(Math.abs(E.normToMidi(1) - E.PITCH_MIN) < 1e-9);
// Up on the screen (norm 0) is a higher pitch.
assert.ok(E.normToMidi(0) > E.normToMidi(1), "up = higher pitch");

assert.equal(E.SONGS.length, 4);
assert.deepEqual(E.SONGS.map((s) => s.id), ["twinkle", "tigers", "joy", "danube"]);
assert.equal(E.nextSongId("twinkle"), "tigers");
assert.equal(E.nextSongId("tigers"), "joy");
assert.equal(E.nextSongId("joy"), "danube");
assert.equal(E.nextSongId("danube"), null);

const twinkle = E.getSong("twinkle");
assertContinuous(twinkle);
assert.equal(twinkle.title, "一閃一閃");
assert.equal(twinkle.key, "C");
assert.equal(twinkle.bpm, 100);
assert.equal(twinkle.notes.length, 42);
assert.equal(twinkle.notes[0].pitch, E.midiOf("C4"));
assert.equal(twinkle.notes[twinkle.notes.length - 1].pitch, E.midiOf("C4"));
assert.ok(Math.abs(twinkle.total - 48 * twinkle.beat) < 1e-9, "twinkle should be 48 beats");
assert.ok(twinkle.total > 20 && twinkle.total < 50, "twinkle length should be 20–50s, got " + twinkle.total);
assert.ok(twinkle.notes.every((n) => n.endPitch === n.pitch), "twinkle is stepwise, no forced slides");

const tigers = E.getSong("tigers");
assertContinuous(tigers);
assert.equal(tigers.title, "兩隻老虎");
assert.equal(tigers.key, "C");
assert.equal(tigers.bpm, 108);
assert.equal(tigers.notes[0].pitch, E.midiOf("C4"));
assert.ok(tigers.notes.some((n) => n.pitch === E.midiOf("G3")), "Frère Jacques dips to G3");
assert.ok(Math.abs(tigers.total - 64 * tigers.beat) < 1e-9, "tigers should be two passes, 64 beats");
assert.ok(tigers.total > 20 && tigers.total < 50, "tigers length should be 20–50s, got " + tigers.total);

const joy = E.getSong("joy");
assertContinuous(joy);
assert.equal(joy.title, "歡樂頌");
assert.equal(joy.key, "C");
assert.equal(joy.bpm, 100);
assert.equal(joy.notes[0].pitch, E.midiOf("E4"));
assert.equal(joy.notes[joy.notes.length - 1].pitch, E.midiOf("C4"));
assert.ok(Math.abs(joy.total - 64 * joy.beat) < 1e-9, "joy should be 64 beats");
assert.ok(joy.total > 20 && joy.total < 50, "joy length should be 20–50s, got " + joy.total);

const danube = E.getSong("danube");
assertContinuous(danube);
assert.equal(danube.title, "藍色多瑙河");
assert.equal(danube.key, "D");
assert.equal(danube.bpm, 120);
assert.equal(danube.meter, 3);
assert.equal(danube.notes[0].pitch, E.midiOf("A4"));
assert.ok(danube.notes.some((n) => n.pitch === E.midiOf("A5")), "intro rises to A5");
assert.equal(danube.notes[danube.notes.length - 1].pitch, E.midiOf("D5"));
assert.ok(Math.abs(danube.total - 111 * danube.beat) < 1e-9, "danube should be 111 beats, got " + danube.total / danube.beat);
assert.ok(danube.total > 45 && danube.total <= 60, "danube length should be around a minute, got " + danube.total);
assert.ok(danube.notes.length >= 50, "danube should have a substantial chart, got " + danube.notes.length);

for (const s of E.SONGS) {
  for (const n of s.notes) {
    assert.ok(n.pitch >= E.PITCH_MIN && n.pitch <= E.PITCH_MAX, s.id + " pitch in range");
    assert.ok(n.endPitch >= E.PITCH_MIN && n.endPitch <= E.PITCH_MAX);
    assert.ok(n.dur > 0);
  }
  assert.ok(s.piano.length > 0, s.id + " has accompaniment events");
  assert.ok(s.piano.every((e) => e.freqs && e.freqs.length && e.time >= s.lead - 1e-9));
}

console.log("Charts:");
for (const s of E.SONGS) {
  console.log(
    "  " +
      s.title +
      "  bpm=" +
      s.bpm +
      "  notes=" +
      s.notes.length +
      "  length=" +
      s.total.toFixed(2) +
      "s  lead=" +
      s.lead.toFixed(2) +
      "s"
  );
}

for (const id of ["twinkle", "tigers", "joy", "danube"]) {
  const eng = run(perfectBot(), id);
  const r = eng.result();
  console.log("\n[perfect] " + id);
  console.log(
    "  acc:",
    r.accuracy.toFixed(2),
    " grade:",
    r.grade,
    " score:",
    r.score,
    " maxCombo:",
    r.maxCombo,
    "/",
    r.results.length,
    " finished:",
    eng.finished
  );
  const labels = {};
  for (const rec of r.results) labels[rec.label] = (labels[rec.label] || 0) + 1;
  console.log("  judges:", labels);
  assert.ok(eng.finished, id + " should finish");
  expectHighRank(r, id + " perfect bot");
}

for (const id of ["twinkle", "tigers", "joy", "danube"]) {
  const eng = run(stillBot(), id);
  const r = eng.result();
  console.log("\n[idle] " + id, "acc:", r.accuracy.toFixed(2), "score:", r.score, "grade:", r.grade);
  assert.ok(eng.finished, id + " idle should still finish");
  assert.ok(r.accuracy <= 2, id + " idle accuracy should be near 0, got " + r.accuracy);
  assert.equal(r.score, 0, id + " idle score should be 0");
  assert.equal(r.maxCombo, 0);
  assert.equal(r.grade, "噪音");
  assert.ok(r.results.every((rec) => rec.label === "靜咗"));
}

for (const id of ["twinkle", "tigers", "joy", "danube"]) {
  const eng = run(offPitchBot(), id);
  const r = eng.result();
  console.log("\n[off-pitch +7st] " + id, "acc:", r.accuracy.toFixed(2), "score:", r.score, "grade:", r.grade, "time:", eng.time.toFixed(2));
  assert.ok(eng.finished, id + " off-pitch should still finish");
  assert.ok(eng.time >= E.getSong(id).resultAt - 1e-6, id + " clock should reach the end");
  assert.ok(r.accuracy < 40, id + " off-pitch accuracy should be low, got " + r.accuracy);
  assert.ok(r.score < r.accuracy + 5000, "sanity"); // loose
  // Engine must not skip notes.
  assert.equal(r.results.length, E.getSong(id).notes.length, id + " should judge every note");
  assert.ok(
    r.results.every((rec) => rec.label === "走音" || rec.label === "靜咗"),
    id + " off-pitch should not be marked accurate"
  );
}

// Breath lock: holding longer than BREATH_MAX forces a short silence.
{
  const eng = new E.PlayEngine("twinkle");
  const mid = 60;
  let sawLock = false;
  const steps = Math.ceil(6.2 / DT);
  for (let i = 0; i < steps; i++) {
    eng.step(DT, { blowing: true, pitchMidi: mid });
    if (eng.breathLock > 0) sawLock = true;
  }
  assert.ok(sawLock, "holding a blow past 5s should trigger a breath-out");
  assert.ok(eng.breathLock > 0 || eng.time > E.BREATH_MAX, "lock or post-lock after a long hold");
  console.log("\n[breath] lock triggered after a long hold, fill=", eng.breathFill().toFixed(2), "lock=", eng.breathLock.toFixed(3));
}

// Cursor lag is tiny: after a short settle, pitch should be very close.
{
  const eng = new E.PlayEngine("twinkle");
  eng.step(0, { blowing: false, pitchMidi: 72 });
  for (let i = 0; i < 8; i++) eng.step(DT, { blowing: false, pitchMidi: 72 });
  assert.ok(Math.abs(eng.cursorPitch - 72) < 0.05, "cursor should settle quickly, got " + eng.cursorPitch);
  console.log("\n[lag] cursor after 8 frames:", eng.cursorPitch.toFixed(3));
}

E.setSong("twinkle");
assert.equal(E.getCurrentSong().id, "twinkle");

console.log("\nAll headless tests passed.");
