/**
 * 滑管星 — original canvas game shell: input, screens, loop.
 */
(function () {
  "use strict";

  var E = window.SlideStarEngine;
  var R = window.SlideStarRender;
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");

  var el = {
    hudMute: document.getElementById("btn-mute"),
    title: document.getElementById("screen-title"),
    result: document.getElementById("screen-result"),
    headline: document.getElementById("result-headline"),
    score: document.getElementById("result-score"),
    combo: document.getElementById("result-combo"),
    best: document.getElementById("result-best"),
    sub: document.getElementById("result-sub"),
    resultSong: document.getElementById("result-song"),
    rotate: document.getElementById("rotate-hint"),
    muteTitle: document.getElementById("btn-mute-title"),
    muteResult: document.getElementById("btn-mute-result"),
    retry: document.getElementById("btn-retry"),
    next: document.getElementById("btn-next"),
    home: document.getElementById("btn-home"),
    songList: document.getElementById("song-list"),
  };

  var STORE_MUTE = "slidestar-v1-mute";

  function bestKey(songId) {
    return "slidestar-v1-best-" + songId;
  }

  function readBest(songId) {
    try {
      var raw = localStorage.getItem(bestKey(songId));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && typeof o.score === "number") return o;
      return null;
    } catch (err) {
      return null;
    }
  }

  function writeBest(songId, rec) {
    try {
      localStorage.setItem(bestKey(songId), JSON.stringify(rec));
    } catch (err) {}
  }

  var audio = new window.SlideStarAudio();
  var engine = new E.PlayEngine();

  var input = {
    pointerDown: false,
    keyBlow: false,
    aimY: null,
    id: null,
    lastY: 0,
  };

  var screen = "title";
  var lastResult = null;
  var startAudioTime = null;
  var startPerf = 0;
  var cssW = 1280;
  var cssH = 720;
  var dpr = 1;
  var muted = false;
  try {
    muted = localStorage.getItem(STORE_MUTE) === "1";
  } catch (err) {}
  var lastFrame = 0;
  var idleT = 0;

  function isBlowing() {
    return !!(input.pointerDown || input.keyBlow);
  }

  function layoutNow() {
    return R.layout(cssW, cssH);
  }

  function pitchFromY(y) {
    var L = layoutNow();
    return R.yToMidi(y, L);
  }

  function pointerXY(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function consumeInput() {
    var pack = { blowing: isBlowing() };
    if (input.aimY != null) pack.pitchNorm = E.pitchToNorm(pitchFromY(input.aimY));
    return pack;
  }

  function updateRotate() {
    var portrait = cssH > cssW + 1;
    el.rotate.classList.toggle("hidden", !portrait);
  }

  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateRotate();
  }

  function setMuted(next) {
    muted = !!next;
    try {
      localStorage.setItem(STORE_MUTE, muted ? "1" : "0");
    } catch (err) {}
    audio.setMuted(muted);
    var label = muted ? "聲音：關" : "聲音：開";
    if (el.muteTitle) el.muteTitle.textContent = label;
    if (el.muteResult) el.muteResult.textContent = label;
    if (el.hudMute) {
      el.hudMute.classList.toggle("is-muted", muted);
      el.hudMute.setAttribute("aria-label", muted ? "開啟聲音" : "靜音");
      el.hudMute.setAttribute("title", muted ? "開啟聲音" : "靜音");
    }
  }

  function showScreen(name) {
    screen = name;
    el.title.classList.toggle("hidden", name !== "title");
    el.result.classList.toggle("hidden", name !== "result");
    if (el.hudMute) el.hudMute.classList.toggle("hidden", name !== "play");
    if (name === "title") renderSongList();
  }

  function nowT() {
    if (audio.ctx && startAudioTime != null) {
      return audio.ctx.currentTime - startAudioTime;
    }
    return (performance.now() - startPerf) / 1000;
  }

  function renderSongList() {
    if (!el.songList) return;
    el.songList.innerHTML = "";
    E.SONGS.forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn primary song-btn";
      btn.setAttribute("data-song", s.id);
      var best = readBest(s.id);
      var bestLine = best
        ? "最佳 " + R.formatScore(best.score) + "　" + (best.grade || "")
        : "尚未吹奏";
      btn.innerHTML =
        "<span class=\"song-label\">" +
        s.label +
        "</span><span class=\"song-best\">" +
        bestLine +
        "</span>";
      el.songList.appendChild(btn);
    });
  }

  function onPointerDown(ev) {
    if (screen !== "play") return;
    if (ev.target && ev.target.closest && ev.target.closest("button, .panel, .icon-btn")) return;
    ev.preventDefault();
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {}
    var p = pointerXY(ev);
    input.pointerDown = true;
    input.id = ev.pointerId;
    input.lastY = p.y;
    input.aimY = p.y;
  }

  function onPointerMove(ev) {
    var p = pointerXY(ev);
    if (screen === "play") {
      if (!input.pointerDown || ev.pointerId === input.id || ev.pointerId == null) {
        // Desktop: mouse move aims even without a button.
        if (ev.pointerType === "mouse" || ev.pointerType === "pen" || ev.pointerType == null) {
          if (!input.pointerDown || ev.pointerId === input.id) input.aimY = p.y;
        } else if (input.pointerDown && ev.pointerId === input.id) {
          input.aimY = p.y;
        }
      }
      if (input.pointerDown && ev.pointerId === input.id) {
        ev.preventDefault();
        input.aimY = p.y;
        input.lastY = p.y;
      }
    }
  }

  function onPointerUp(ev) {
    if (ev.pointerId !== input.id) return;
    ev.preventDefault();
    input.pointerDown = false;
    input.id = null;
  }

  function preventScroll(ev) {
    if (ev.target && ev.target.closest && ev.target.closest("button, .panel, .icon-btn")) return;
    ev.preventDefault();
  }

  function isBlowKey(ev) {
    var k = ev.code || ev.key;
    if (k === "Space" || ev.key === " ") return true;
    if (k === "ShiftLeft" || k === "ShiftRight" || ev.key === "Shift") return true;
    if (k === "Enter") return true;
    if (k === "KeyF" || k === "KeyJ" || k === "KeyZ" || k === "KeyX") return true;
    return false;
  }

  function onKeyDown(ev) {
    if (!isBlowKey(ev)) return;
    if (ev.repeat) {
      ev.preventDefault();
      return;
    }
    ev.preventDefault();
    input.keyBlow = true;
  }

  function onKeyUp(ev) {
    if (!isBlowKey(ev)) return;
    ev.preventDefault();
    input.keyBlow = false;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("touchstart", preventScroll, { passive: false });
  window.addEventListener("touchmove", preventScroll, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  async function beginPlay(songId) {
    await audio.unlock();
    if (songId) engine.setSong(songId);
    else engine.reset();
    input.pointerDown = false;
    input.keyBlow = false;
    input.id = null;
    var first = engine.song.notes[0];
    engine.cursorPitch = first.pitch;
    engine.targetPitch = first.pitch;
    engine.lookPitch = first.pitch;
    input.aimY = R.midiToY(first.pitch, layoutNow());
    startPerf = performance.now();
    if (audio.ctx) {
      if (audio.ctx.state === "suspended") await audio.ctx.resume();
      startAudioTime = audio.ctx.currentTime + 0.06;
      audio.scheduleScore(startAudioTime, engine.song);
    } else {
      startAudioTime = null;
    }
    showScreen("play");
  }

  function finishPlay() {
    audio.stopVoices();
    audio.cancelAccompaniment();
    var result = engine.result();
    lastResult = result;
    var songId = engine.song.id;
    var prev = readBest(songId);
    var isNew = !prev || result.score > prev.score;
    if (isNew && result.score > 0) {
      writeBest(songId, {
        score: result.score,
        grade: result.grade,
        combo: result.maxCombo,
        accuracy: result.shown,
      });
    }
    el.resultSong.textContent = "《" + engine.song.title + "》";
    el.headline.textContent = result.grade;
    el.score.textContent = "分數 " + R.formatScore(result.score);
    if (el.combo) el.combo.textContent = "最長連擊 " + result.maxCombo;
    el.best.classList.toggle("hidden", !isNew || result.score <= 0);
    el.sub.textContent = "準確度 " + result.shown.toFixed(1) + "%";
    var nextId = E.nextSongId(songId);
    el.next.classList.toggle("hidden", !nextId);
    el.next.dataset.song = nextId || "";
    el.retry.classList.toggle("primary", !nextId);
    el.retry.classList.toggle("ghost", !!nextId);
    showScreen("result");
  }

  if (el.songList) {
    el.songList.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-song]");
      if (!btn) return;
      beginPlay(btn.getAttribute("data-song"));
    });
  }
  el.retry.addEventListener("click", function () {
    beginPlay();
  });
  el.next.addEventListener("click", function () {
    var id = el.next.dataset.song;
    if (id) beginPlay(id);
  });
  el.home.addEventListener("click", function () {
    audio.stopVoices();
    audio.cancelAccompaniment();
    startAudioTime = null;
    engine.reset();
    showScreen("title");
  });
  function toggleMute() {
    setMuted(!muted);
  }
  if (el.hudMute) el.hudMute.addEventListener("click", toggleMute);
  el.muteTitle.addEventListener("click", toggleMute);
  el.muteResult.addEventListener("click", toggleMute);

  function paintFrame(ts) {
    R.paint(ctx, {
      cssW: cssW,
      cssH: cssH,
      playing: screen === "play",
      screen: screen,
      engine: engine,
      nowIdle: idleT,
    });
  }

  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    var wallDt = (ts - lastFrame) / 1000;
    if (wallDt > 0.08) wallDt = 0.08;
    lastFrame = ts;
    idleT += wallDt;

    if (screen === "play") {
      var t = nowT();
      var dt = t - engine.time;
      if (dt > 0.08) dt = 0.08;
      if (dt > 0) {
        engine.step(dt, consumeInput());
        audio.update(engine);
        if (engine.finished || t >= engine.song.resultAt) {
          finishPlay();
        }
      }
    } else {
      audio.stopVoices();
    }

    paintFrame(ts);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () {
    setTimeout(resize, 80);
  });

  setMuted(muted);
  resize();
  showScreen("title");
  requestAnimationFrame(loop);
})();
