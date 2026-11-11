/**
 * 滑管星 — original 2D canvas renderer.
 * Layout follows the trombone-rhythm genre; art, colours, typography
 * and the school-style trombonist are original and not copied.
 */
(function (root) {
  "use strict";

  var E = root.SlideStarEngine;

  var GOLD = "#e8c15a";
  var BRASS = "#c9923a";
  var CREAM = "#f3ecdc";
  var INK = "#0e141c";

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec + 1e-6));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function formatScore(n) {
    var v = Math.round(n);
    var str = String(v);
    var out = "";
    for (var i = 0; i < str.length; i++) {
      if (i && (str.length - i) % 3 === 0) out += ",";
      out += str[i];
    }
    return out;
  }

  function layout(cssW, cssH) {
    var portrait = cssH > cssW + 1;
    var banner = portrait ? Math.max(40, Math.min(58, cssH * 0.09)) : 0;
    var availW = cssW;
    var availH = cssH - banner;
    var aspect = 16 / 9;
    var w;
    var h;
    if (availW / Math.max(availH, 1) > aspect) {
      h = availH;
      w = h * aspect;
    } else {
      w = availW;
      h = w / aspect;
    }
    var x = (cssW - w) / 2;
    var y = banner + (availH - h) / 2;
    var hudH = h * 0.11;
    var judgeX = x + w * 0.155;
    var charX = x + w * 0.655;
    var fieldTop = y + hudH;
    var fieldBot = y + h * 0.965;
    var fieldH = fieldBot - fieldTop;
    var pps = (charX - judgeX) / 2.55;
    return {
      cssW: cssW,
      cssH: cssH,
      portrait: portrait,
      banner: banner,
      x: x,
      y: y,
      w: w,
      h: h,
      hudH: hudH,
      judgeX: judgeX,
      charX: charX,
      charW: x + w - charX,
      fieldTop: fieldTop,
      fieldBot: fieldBot,
      fieldH: fieldH,
      pps: pps,
      pad: Math.max(8, w * 0.012),
    };
  }

  function midiToY(midi, L) {
    var n = (E.PITCH_MAX - midi) / (E.PITCH_MAX - E.PITCH_MIN);
    return L.fieldTop + clamp(n, 0, 1) * L.fieldH;
  }

  function yToMidi(y, L) {
    var n = (y - L.fieldTop) / L.fieldH;
    return E.normToMidi(n);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function fillRound(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }

  function drawCapsule(ctx, x0, y0, x1, y1, r, fill, stroke, sw) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) {
      ctx.beginPath();
      ctx.arc(x0, y0, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = sw || 1.4;
        ctx.stroke();
      }
      return;
    }
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(len, -r);
    ctx.arc(len, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, r);
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw || 1.4;
      ctx.stroke();
    }
    // Soft highlight along the bar — a continuous capsule, not a dumbbell.
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(len, -r * 0.45);
    ctx.arc(len, 0, r * 0.45, -Math.PI / 2, 0);
    ctx.strokeStyle = "rgba(255, 248, 220, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function paintNight(ctx, L) {
    var g = ctx.createLinearGradient(L.x, L.y, L.x, L.y + L.h);
    g.addColorStop(0, "#0b1220");
    g.addColorStop(0.55, "#15233a");
    g.addColorStop(1, "#1a2a28");
    ctx.fillStyle = g;
    ctx.fillRect(L.x, L.y, L.w, L.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.y, L.w, L.h);
    ctx.clip();
    // Original simple star field — no large painted moon.
    var seed = 17;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (var i = 0; i < 70; i++) {
      var sx = L.x + rnd() * L.w;
      var sy = L.y + rnd() * L.h * 0.72;
      var sr = 0.6 + rnd() * 1.4;
      ctx.fillStyle = "rgba(243, 236, 220, " + (0.35 + rnd() * 0.55) + ")";
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few four-point sparkles, original and sparse.
    for (var k = 0; k < 6; k++) {
      var px = L.x + L.w * (0.18 + rnd() * 0.5);
      var py = L.y + L.h * (0.16 + rnd() * 0.4);
      var arm = 3 + rnd() * 3;
      ctx.strokeStyle = "rgba(232, 193, 90, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - arm, py);
      ctx.lineTo(px + arm, py);
      ctx.moveTo(px, py - arm);
      ctx.lineTo(px, py + arm);
      ctx.stroke();
    }
    // Quiet hillside silhouette.
    ctx.fillStyle = "#0a1418";
    ctx.beginPath();
    ctx.moveTo(L.x, L.y + L.h);
    ctx.lineTo(L.x, L.y + L.h * 0.82);
    ctx.quadraticCurveTo(L.x + L.w * 0.2, L.y + L.h * 0.7, L.x + L.w * 0.42, L.y + L.h * 0.8);
    ctx.quadraticCurveTo(L.x + L.w * 0.7, L.y + L.h * 0.9, L.x + L.w, L.y + L.h * 0.78);
    ctx.lineTo(L.x + L.w, L.y + L.h);
    ctx.fill();
    ctx.restore();
  }

  function paintClassroom(ctx, L) {
    var g = ctx.createLinearGradient(L.x, L.y, L.x, L.y + L.h);
    g.addColorStop(0, "#f3c789");
    g.addColorStop(0.45, "#e08a4c");
    g.addColorStop(1, "#5a2a28");
    ctx.fillStyle = g;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.y, L.w, L.h);
    ctx.clip();

    // Window frame and sunset panes.
    var wx = L.x + L.w * 0.22;
    var wy = L.y + L.h * 0.16;
    var ww = L.w * 0.4;
    var wh = L.h * 0.46;
    ctx.fillStyle = "rgba(80, 36, 28, 0.55)";
    ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    var sky = ctx.createLinearGradient(wx, wy, wx, wy + wh);
    sky.addColorStop(0, "#f8e0a8");
    sky.addColorStop(0.55, "#ef9a55");
    sky.addColorStop(1, "#c45a48");
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = "rgba(62, 28, 22, 0.7)";
    ctx.lineWidth = 6;
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2);
    ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.lineWidth = 5;
    ctx.stroke();

    // Chalkboard hint on the left.
    ctx.fillStyle = "rgba(36, 64, 52, 0.55)";
    ctx.fillRect(L.x + L.w * 0.02, L.y + L.h * 0.22, L.w * 0.16, L.h * 0.4);

    // Desk silhouettes.
    ctx.fillStyle = "rgba(28, 16, 14, 0.72)";
    for (var i = 0; i < 4; i++) {
      var dx = L.x + L.w * (0.08 + i * 0.16);
      var dy = L.y + L.h * 0.78;
      ctx.fillRect(dx, dy, L.w * 0.12, L.h * 0.05);
      ctx.fillRect(dx + L.w * 0.01, dy + L.h * 0.05, L.w * 0.012, L.h * 0.14);
      ctx.fillRect(dx + L.w * 0.1, dy + L.h * 0.05, L.w * 0.012, L.h * 0.14);
    }
    ctx.restore();
  }

  function paintHall(ctx, L) {
    var g = ctx.createLinearGradient(L.x, L.y, L.x, L.y + L.h);
    g.addColorStop(0, "#2a1c1a");
    g.addColorStop(0.5, "#3a2420");
    g.addColorStop(1, "#1a1012");
    ctx.fillStyle = g;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.y, L.w, L.h);
    ctx.clip();

    // Proscenium frame — a shallow top lintel and side posts, not a long arc
    // through the player.
    ctx.strokeStyle = "rgba(120, 72, 36, 0.55)";
    ctx.lineWidth = Math.max(10, L.w * 0.014);
    ctx.beginPath();
    ctx.moveTo(L.x + L.w * 0.07, L.y + L.h * 0.88);
    ctx.lineTo(L.x + L.w * 0.07, L.y + L.h * 0.14);
    ctx.lineTo(L.x + L.w * 0.93, L.y + L.h * 0.14);
    ctx.lineTo(L.x + L.w * 0.93, L.y + L.h * 0.88);
    ctx.stroke();
    ctx.fillStyle = "rgba(120, 72, 36, 0.22)";
    ctx.fillRect(L.x + L.w * 0.07, L.y + L.h * 0.08, L.w * 0.86, L.h * 0.06);

    // Soft stage lights.
    function cone(cx) {
      var cg = ctx.createLinearGradient(cx, L.y + L.h * 0.08, cx, L.y + L.h * 0.9);
      cg.addColorStop(0, "rgba(244, 214, 140, 0.28)");
      cg.addColorStop(1, "rgba(244, 214, 140, 0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(cx - L.w * 0.02, L.y + L.h * 0.1);
      ctx.lineTo(cx + L.w * 0.02, L.y + L.h * 0.1);
      ctx.lineTo(cx + L.w * 0.14, L.y + L.h * 0.92);
      ctx.lineTo(cx - L.w * 0.14, L.y + L.h * 0.92);
      ctx.closePath();
      ctx.fill();
    }
    cone(L.x + L.w * 0.34);
    cone(L.x + L.w * 0.58);

    // Curtain edges.
    ctx.fillStyle = "rgba(110, 28, 36, 0.45)";
    ctx.beginPath();
    ctx.moveTo(L.x, L.y);
    ctx.lineTo(L.x + L.w * 0.12, L.y);
    ctx.quadraticCurveTo(L.x + L.w * 0.08, L.y + L.h * 0.4, L.x + L.w * 0.13, L.y + L.h);
    ctx.lineTo(L.x, L.y + L.h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(L.x + L.w, L.y);
    ctx.lineTo(L.x + L.w * 0.88, L.y);
    ctx.quadraticCurveTo(L.x + L.w * 0.92, L.y + L.h * 0.4, L.x + L.w * 0.87, L.y + L.h);
    ctx.lineTo(L.x + L.w, L.y + L.h);
    ctx.fill();

    // Stage floor.
    ctx.fillStyle = "rgba(72, 40, 28, 0.65)";
    ctx.fillRect(L.x, L.y + L.h * 0.86, L.w, L.h * 0.14);
    ctx.restore();
  }

  function paintRiver(ctx, L) {
    var g = ctx.createLinearGradient(L.x, L.y, L.x, L.y + L.h);
    g.addColorStop(0, "#f0c8a0");
    g.addColorStop(0.35, "#c47a7a");
    g.addColorStop(0.55, "#5a6a8a");
    g.addColorStop(1, "#243044");
    ctx.fillStyle = g;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.y, L.w, L.h);
    ctx.clip();

    // Distant bank.
    ctx.fillStyle = "#2a3030";
    ctx.beginPath();
    ctx.moveTo(L.x, L.y + L.h * 0.52);
    ctx.quadraticCurveTo(L.x + L.w * 0.3, L.y + L.h * 0.46, L.x + L.w * 0.55, L.y + L.h * 0.54);
    ctx.quadraticCurveTo(L.x + L.w * 0.8, L.y + L.h * 0.6, L.x + L.w, L.y + L.h * 0.5);
    ctx.lineTo(L.x + L.w, L.y + L.h * 0.58);
    ctx.lineTo(L.x, L.y + L.h * 0.58);
    ctx.fill();

    // Water with simple reflections (no painted moon).
    var water = ctx.createLinearGradient(L.x, L.y + L.h * 0.56, L.x, L.y + L.h);
    water.addColorStop(0, "#4a6080");
    water.addColorStop(0.4, "#2c3c58");
    water.addColorStop(1, "#1a2434");
    ctx.fillStyle = water;
    ctx.fillRect(L.x, L.y + L.h * 0.56, L.w, L.h * 0.44);

    ctx.strokeStyle = "rgba(240, 200, 160, 0.18)";
    ctx.lineWidth = 2;
    for (var i = 0; i < 7; i++) {
      var wy = L.y + L.h * (0.62 + i * 0.05);
      ctx.beginPath();
      ctx.moveTo(L.x, wy);
      ctx.quadraticCurveTo(L.x + L.w * 0.5, wy + (i % 2 ? 6 : -6), L.x + L.w, wy);
      ctx.stroke();
    }

    // Reeds in the foreground corner.
    ctx.strokeStyle = "rgba(28, 36, 28, 0.8)";
    ctx.lineWidth = 2;
    for (var r = 0; r < 8; r++) {
      var rx = L.x + L.w * (0.04 + r * 0.03);
      ctx.beginPath();
      ctx.moveTo(rx, L.y + L.h);
      ctx.quadraticCurveTo(rx + 8, L.y + L.h * 0.85, rx - 6, L.y + L.h * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintLobby(ctx, L) {
    paintHall(ctx, L);
    // Darken a little so title typography stays readable.
    ctx.fillStyle = "rgba(10, 14, 22, 0.18)";
    ctx.fillRect(L.x, L.y, L.w, L.h);
  }

  function paintBackground(ctx, L, bg) {
    if (bg === "night") paintNight(ctx, L);
    else if (bg === "classroom") paintClassroom(ctx, L);
    else if (bg === "hall") paintHall(ctx, L);
    else if (bg === "river") paintRiver(ctx, L);
    else paintLobby(ctx, L);
  }

  function drawPitchGuides(ctx, L) {
    // Faint horizontal pitch lines, stronger on C and G.
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.fieldTop - 2, L.charX - L.x + 8, L.fieldH + 4);
    ctx.clip();
    for (var m = E.PITCH_MIN; m <= E.PITCH_MAX; m++) {
      var y = midiToY(m, L);
      var pc = m % 12;
      var isC = pc === 0;
      var isG = pc === 7;
      ctx.strokeStyle = isC
        ? "rgba(243, 236, 220, 0.22)"
        : isG
          ? "rgba(243, 236, 220, 0.12)"
          : "rgba(243, 236, 220, 0.05)";
      ctx.lineWidth = isC ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(L.x + L.w * 0.015, y);
      ctx.lineTo(L.charX + L.w * 0.04, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNotes(ctx, L, song, now) {
    if (!song) return;
    var notes = song.notes;
    var r = Math.max(6, L.h * 0.018);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x, L.fieldTop - r * 2, L.w, L.fieldH + r * 4);
    ctx.clip();
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var x0 = L.judgeX + (n.start - now) * L.pps;
      var x1 = L.judgeX + (n.end - now) * L.pps;
      if (x1 < L.x - r * 2) continue;
      if (x0 > L.x + L.w + r * 2) break;
      var y0 = midiToY(n.pitch, L);
      var y1 = midiToY(n.endPitch, L);
      var vis = 1;
      if (x1 < L.judgeX) vis = clamp(1 - (L.judgeX - x1) / (L.pps * 0.35), 0, 1);
      ctx.globalAlpha = vis;
      var approaching = n.start - now < 0.35 && n.end - now > 0;
      if (approaching) {
        ctx.shadowColor = "rgba(232, 193, 90, 0.55)";
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }
      drawCapsule(ctx, x0, y0, x1, y1, r, "#d9a33a", "#6a3e12", 1.6);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawJudgeLine(ctx, L) {
    var x = L.judgeX;
    ctx.strokeStyle = "rgba(243, 236, 220, 0.92)";
    ctx.lineWidth = Math.max(3, L.w * 0.004);
    ctx.beginPath();
    ctx.moveTo(x, L.fieldTop);
    ctx.lineTo(x, L.fieldBot);
    ctx.stroke();
    ctx.strokeStyle = "rgba(232, 193, 90, 0.28)";
    ctx.lineWidth = Math.max(8, L.w * 0.01);
    ctx.beginPath();
    ctx.moveTo(x, L.fieldTop);
    ctx.lineTo(x, L.fieldBot);
    ctx.stroke();
  }

  function drawCursor(ctx, L, engine) {
    var y = midiToY(engine.cursorPitch, L);
    var x = L.judgeX;
    var r = Math.max(8, L.h * 0.022);
    var blowing = engine.blowing;
    var feel = engine.feel;
    var glow =
      feel === "good"
        ? "rgba(232, 193, 90, 0.7)"
        : feel === "bad"
          ? "rgba(196, 90, 90, 0.55)"
          : "rgba(200, 210, 220, 0.45)";
    if (blowing) {
      ctx.beginPath();
      ctx.arc(x, y, r * (feel === "good" ? 2.1 : 1.7), 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = blowing ? CREAM : "rgba(243, 236, 220, 0.7)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = blowing ? "#8a5a16" : "rgba(40, 36, 28, 0.7)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = blowing ? BRASS : "#8a8a8a";
    ctx.fill();
  }

  function drawBreathMeter(ctx, L, engine) {
    var w = L.w * 0.14;
    var h = Math.max(10, L.h * 0.022);
    var x = L.x + L.w * 0.02;
    var y = L.y + L.h * 0.132;
    fillRound(ctx, x, y, w, h, h / 2, "rgba(10, 14, 22, 0.55)");
    var fill = engine ? engine.breathFill() : 1;
    var fw = Math.max(0, (w - 4) * fill);
    if (fw > 0) {
      var color = fill < 0.2 ? "#c45a48" : fill < 0.45 ? "#e0a04a" : "#4aa0a8";
      fillRound(ctx, x + 2, y + 2, fw, h - 4, (h - 4) / 2, color);
    }
    ctx.fillStyle = CREAM;
    ctx.font = "600 " + Math.max(10, L.h * 0.02) + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("氣", x, y - 3);
    // Small original air-puff marks, not a trombone widget.
    ctx.strokeStyle = "rgba(243, 236, 220, 0.7)";
    ctx.lineWidth = 1.2;
    var ax = x + w + 8;
    var ay = y + h / 2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(ax + i * 6, ay, 3 + i, Math.PI * 0.8, Math.PI * 1.7, false);
      ctx.stroke();
    }
  }

  function drawPops(ctx, L, engine) {
    if (!engine || !engine.pops) return;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (var i = 0; i < engine.pops.length; i++) {
      var p = engine.pops[i];
      var life = p.life;
      var a = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.95;
      if (a <= 0) continue;
      var y = midiToY(p.pitch, L) - life * L.h * 0.06;
      var x = L.judgeX + L.w * 0.03;
      var color = "#f3ecdc";
      if (p.label === "超準") color = GOLD;
      else if (p.label === "準") color = "#f0e6c0";
      else if (p.label === "尚可") color = "#c8d0d8";
      else if (p.label === "走音") color = "#e09080";
      else color = "#9aa0a8";
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = color;
      ctx.font =
        "700 " +
        Math.max(16, L.h * 0.042) +
        "px 'PingFang HK', 'Noto Sans TC', sans-serif";
      ctx.fillText(p.label, x, y);
      ctx.restore();
    }
  }

  function drawHud(ctx, L, state) {
    var engine = state.engine;
    var song = engine && engine.song;
    var playing = state.playing;
    ctx.save();
    ctx.textBaseline = "middle";
    var fs = Math.max(13, L.h * 0.032);
    var fsSm = Math.max(10, L.h * 0.022);
    var top = L.y + L.hudH * 0.55;

    // Centre: longest combo + time.
    ctx.textAlign = "center";
    ctx.fillStyle = CREAM;
    ctx.font = "600 " + fsSm + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    var combo = playing && engine ? engine.maxCombo : 0;
    ctx.fillText("最長連擊：" + combo, L.x + L.w * 0.42, top - fs * 0.35);
    var elapsed = playing && engine ? engine.elapsedDisplay() : 0;
    var total = song ? song.total : 0;
    ctx.font = "500 " + fsSm + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    ctx.fillStyle = "rgba(243, 236, 220, 0.8)";
    ctx.fillText(formatTime(elapsed) + " / " + formatTime(total), L.x + L.w * 0.42, top + fs * 0.45);

    // Right: title + score.
    ctx.textAlign = "right";
    var rx = L.x + L.w - L.pad * 1.6;
    ctx.fillStyle = "rgba(243, 236, 220, 0.85)";
    ctx.font = "600 " + fsSm + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    ctx.fillText(song ? song.title : "滑管星", rx, top - fs * 0.45);
    ctx.fillStyle = CREAM;
    ctx.font = "700 " + Math.max(20, L.h * 0.055) + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    var score = playing && engine ? engine.score : 0;
    ctx.fillText(playing ? formatScore(score) : "", rx, top + fs * 0.55);
    ctx.restore();
  }

  function drawCountIn(ctx, L, engine) {
    if (!engine || engine.time >= engine.song.lead || engine.time < 0) return;
    var remain = engine.song.lead - engine.time;
    var beat = engine.song.beat;
    var n = Math.ceil(remain / beat);
    if (n < 1) return;
    var phase = 1 - (remain % beat) / beat;
    var alpha = 0.85 - phase * 0.4;
    var scale = 1 + phase * 0.12;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font =
      "700 " +
      L.h * 0.16 * scale +
      "px 'Songti TC', 'PMingLiU', 'Noto Serif TC', serif";
    ctx.fillText(String(n), (L.judgeX + L.charX) / 2, (L.fieldTop + L.fieldBot) / 2);
    ctx.restore();
  }

  function drawCurrentCombo(ctx, L, engine) {
    if (!engine || engine.combo < 2) return;
    ctx.save();
    ctx.fillStyle = GOLD;
    ctx.font = "700 " + Math.max(14, L.h * 0.036) + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(engine.combo + " 連擊", L.judgeX + 10, L.fieldTop + 6);
    ctx.restore();
  }

  /**
   * Original school-style trombonist, 3/4 view facing left.
   * Navy blazer and a straight school tie — not a tuxedo chibi.
   */
  function drawPlayer(ctx, L, engine, idleT) {
    var cx = L.charX + L.charW * 0.58;
    var cy = L.y + L.h * 0.58;
    var scale = L.h / 210;
    var t = idleT || 0;
    var blowing = engine && engine.blowing;
    var feel = (engine && engine.feel) || "idle";
    var pitch = engine ? engine.cursorPitch : 66;
    var slide = clamp((E.PITCH_MAX - pitch) / (E.PITCH_MAX - E.PITCH_MIN), 0, 1);
    // Higher pitch = slide in (real trombone).
    var bob = Math.sin(t * 2.2) * 1.2;
    if (blowing) bob += Math.sin(t * 10) * 0.4;
    var cheek = blowing ? 1 : 0;
    if (feel === "breath") cheek = 0.15;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(scale, scale);

    // Ground shadow.
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 78, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs / trousers.
    ctx.fillStyle = "#2a2e38";
    ctx.beginPath();
    ctx.roundRect ? (ctx.roundRect(-18, 18, 14, 52, 5), ctx.fill()) : (ctx.fillRect(-18, 18, 14, 52));
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(2, 18, 14, 52, 5);
      ctx.fill();
    } else ctx.fillRect(2, 18, 14, 52);

    // Shoes.
    ctx.fillStyle = "#16141a";
    ctx.beginPath();
    ctx.ellipse(-14, 72, 12, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 72, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Torso — navy school blazer.
    ctx.fillStyle = "#1a3358";
    ctx.beginPath();
    ctx.moveTo(-22, -44);
    ctx.lineTo(22, -44);
    ctx.lineTo(26, 22);
    ctx.lineTo(-26, 22);
    ctx.closePath();
    ctx.fill();
    // Lapels.
    ctx.fillStyle = "#152848";
    ctx.beginPath();
    ctx.moveTo(-2, -44);
    ctx.lineTo(-18, -8);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, -44);
    ctx.lineTo(18, -8);
    ctx.lineTo(6, -8);
    ctx.closePath();
    ctx.fill();
    // Shirt.
    ctx.fillStyle = "#e8e4d8";
    ctx.beginPath();
    ctx.moveTo(-5, -44);
    ctx.lineTo(5, -44);
    ctx.lineTo(4, 8);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fill();
    // Straight school tie (red with a gold stripe) — not a bow tie.
    ctx.fillStyle = "#8b1e2d";
    ctx.beginPath();
    ctx.moveTo(-3.2, -42);
    ctx.lineTo(3.2, -42);
    ctx.lineTo(2.2, 14);
    ctx.lineTo(0, 18);
    ctx.lineTo(-2.2, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, 15);
    ctx.stroke();

    // Head.
    var hx = 6;
    var hy = -66;
    ctx.fillStyle = "#f0c7a0";
    ctx.beginPath();
    ctx.ellipse(hx, hy, 18, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears.
    ctx.beginPath();
    ctx.arc(hx + 16, hy + 2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Hair — short black school cut, original.
    ctx.fillStyle = "#1a1614";
    ctx.beginPath();
    ctx.ellipse(hx + 1, hy - 8, 18, 14, -0.15, Math.PI, Math.PI * 2.1);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 16, hy - 4);
    ctx.quadraticCurveTo(hx - 10, hy - 22, hx + 4, hy - 20);
    ctx.quadraticCurveTo(hx + 18, hy - 20, hx + 20, hy - 2);
    ctx.quadraticCurveTo(hx + 8, hy - 14, hx - 8, hy - 6);
    ctx.closePath();
    ctx.fill();
    // Nape tucked behind the head, not over the cheek.
    ctx.beginPath();
    ctx.moveTo(hx + 14, hy - 6);
    ctx.quadraticCurveTo(hx + 21, hy + 2, hx + 16, hy + 12);
    ctx.lineTo(hx + 12, hy + 2);
    ctx.fill();

    // Face: eyes + mouth, react to blowing and accuracy.
    var eyeY = hy - 1;
    ctx.fillStyle = "#1a1614";
    if (feel === "good" && blowing) {
      // Happy closed-curve eyes.
      ctx.strokeStyle = "#1a1614";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(hx - 4, eyeY, 3.2, Math.PI * 1.05, Math.PI * 1.95, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + 8, eyeY, 3.2, Math.PI * 1.05, Math.PI * 1.95, false);
      ctx.stroke();
    } else if (feel === "bad") {
      ctx.beginPath();
      ctx.ellipse(hx - 4, eyeY, 2.1, 2.6, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + 8, eyeY - 0.5, 2.1, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a1614";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy - 10);
      ctx.lineTo(hx + 12, hy - 14);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(hx - 4, eyeY, 2.2, 2.8, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + 8, eyeY, 2.2, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f7f4ee";
      ctx.beginPath();
      ctx.arc(hx - 3.2, eyeY - 0.8, 0.8, 0, Math.PI * 2);
      ctx.arc(hx + 8.8, eyeY - 0.8, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cheeks puff when blowing.
    if (cheek > 0) {
      ctx.fillStyle = "rgba(224, 120, 110, " + (0.28 + cheek * 0.25) + ")";
      ctx.beginPath();
      ctx.ellipse(hx - 10, hy + 8, 6 + cheek * 3, 5 + cheek * 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + 14, hy + 8, 5.5 + cheek * 2.5, 4.5 + cheek * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth on the mouthpiece.
    var mx = hx - 8;
    var my = hy + 10;
    ctx.fillStyle = "#c47a72";
    ctx.beginPath();
    if (blowing) ctx.ellipse(mx, my, 4.2, 3.2, 0, 0, Math.PI * 2);
    else ctx.ellipse(mx, my, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // ——— Trombone (original simple brass, pointing left) ———
    // Bell sits a little above the slide, both facing left.
    // Higher pitch shortens the slide, as on a real trombone.
    var slideOut = 28 + slide * 70;
    ctx.save();
    ctx.translate(mx - 2, my + 1);
    ctx.rotate(-0.16);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    var slideX = -30 - slideOut;

    // Bell branch (upper tube + flare).
    var bell = ctx.createLinearGradient(-90, -28, -40, 8);
    bell.addColorStop(0, "#f3d68a");
    bell.addColorStop(0.45, "#d4a042");
    bell.addColorStop(1, "#8a5a16");
    ctx.strokeStyle = "#c9923a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-36, 0);
    ctx.quadraticCurveTo(-52, 0, -60, -10);
    ctx.lineTo(-78, -12);
    ctx.stroke();
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(-74, -20);
    ctx.lineTo(-74, -4);
    ctx.quadraticCurveTo(-88, -8, -102, -12);
    ctx.quadraticCurveTo(-110, -16, -102, -28);
    ctx.quadraticCurveTo(-88, -32, -74, -20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6a3e12";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "rgba(40, 22, 8, 0.5)";
    ctx.beginPath();
    ctx.ellipse(-100, -20, 5, 7.5, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Slide: two parallel rails + U-bend (extends left when pitch is low).
    ctx.strokeStyle = "#e0b75a";
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-18, 4);
    ctx.lineTo(slideX, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, 13);
    ctx.lineTo(slideX, 13);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(slideX, 8.5, 4.5, Math.PI * 0.5, Math.PI * 1.5, true);
    ctx.stroke();

    // Inner slide sleeve near the grip.
    ctx.strokeStyle = "#b88232";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-18, 4);
    ctx.lineTo(-34, 4);
    ctx.moveTo(-18, 13);
    ctx.lineTo(-34, 13);
    ctx.stroke();

    // Brace between slide and bell branch.
    ctx.strokeStyle = "#c9923a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-30, 13);
    ctx.stroke();

    // Mouthpiece.
    ctx.fillStyle = "#efe0a8";
    ctx.beginPath();
    ctx.ellipse(3, 0, 3.4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a5a16";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    // Hands (simple rounded shapes). Left hand rides the slide.
    ctx.fillStyle = "#f0c7a0";
    var leftHandX = mx - 36 - slide * 62;
    var leftHandY = my + 12;
    ctx.beginPath();
    ctx.ellipse(leftHandX, leftHandY, 6, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Right hand near the stay.
    ctx.beginPath();
    ctx.ellipse(mx - 22, my + 6, 6.5, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Sleeves over wrists.
    ctx.fillStyle = "#1a3358";
    ctx.beginPath();
    ctx.ellipse(mx - 16, my + 8, 7, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(leftHandX + 7, leftHandY - 1, 6, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Breath puff when forced exhale.
    if (engine && engine.breathLock > 0) {
      ctx.strokeStyle = "rgba(200, 220, 230, 0.7)";
      ctx.lineWidth = 1.4;
      for (var p = 0; p < 3; p++) {
        ctx.beginPath();
        ctx.arc(mx - 18 - p * 8, my - 6 - p * 2, 4 + p * 2, Math.PI * 1.1, Math.PI * 1.8);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function paintLetterbox(ctx, L, cssW, cssH) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, cssW, cssH);
    if (L.portrait && L.banner > 0) {
      ctx.fillStyle = "#121820";
      ctx.fillRect(0, 0, cssW, L.banner);
      ctx.fillStyle = CREAM;
      ctx.font = "600 " + Math.max(14, L.banner * 0.38) + "px 'PingFang HK', 'Noto Sans TC', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("請將手機橫過來玩", cssW / 2, L.banner / 2);
    }
  }

  function paint(ctx, state) {
    var cssW = state.cssW;
    var cssH = state.cssH;
    var L = layout(cssW, cssH);
    paintLetterbox(ctx, L, cssW, cssH);

    var song = state.engine && state.engine.song;
    var bg = "lobby";
    if (state.playing && song) bg = song.bg;
    else if (state.screen === "result" && song) bg = song.bg;
    paintBackground(ctx, L, bg);

    // Soft vignette so the left staff stays readable.
    var vg = ctx.createLinearGradient(L.x, L.y, L.charX, L.y);
    vg.addColorStop(0, "rgba(8, 12, 20, 0.38)");
    vg.addColorStop(0.4, "rgba(8, 12, 20, 0.12)");
    vg.addColorStop(1, "rgba(8, 12, 20, 0)");
    ctx.fillStyle = vg;
    ctx.fillRect(L.x, L.y, L.charX - L.x, L.h);

    drawPitchGuides(ctx, L);

    if (state.playing && song) {
      drawNotes(ctx, L, song, state.engine.time);
    }

    drawPlayer(ctx, L, state.playing ? state.engine : state.engine, state.nowIdle || 0);

    if (state.playing) {
      drawJudgeLine(ctx, L);
      drawCursor(ctx, L, state.engine);
      drawBreathMeter(ctx, L, state.engine);
      drawPops(ctx, L, state.engine);
      drawCurrentCombo(ctx, L, state.engine);
      drawCountIn(ctx, L, state.engine);
      drawHud(ctx, L, state);
    } else if (state.screen === "title") {
      // Idle cursor is hidden; a quiet breath meter is unnecessary on the title.
    }
  }

  root.SlideStarRender = {
    layout: layout,
    midiToY: midiToY,
    yToMidi: yToMidi,
    formatTime: formatTime,
    formatScore: formatScore,
    paint: paint,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
