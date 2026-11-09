// 影渡り — 描画・入力・進行管理（ブラウザ層）
(function () {
  'use strict';
  const L = window.ShadowLogic;
  const LEVELS = window.SHADOW_LEVELS;

  // ---------- 定数 ----------
  // 高さ1単位 = 床1マスの辺の長さ（立方体）。太陽の高度は45°なので、影の長さ = 柱の高さ。
  const TW = 64, TH = 32, TZ = 32; // タイル幅・高さ・高さ1単位
  const FLOOR_T = 0.3;             // 床の厚み（TZ単位）
  const MOVE_DUR = 0.12;
  const SUN_ROT_DUR = 0.45;        // 太陽が90°回る時間
  const SHADOW_ALPHA = 0.6;
  const COLORS = {
    floorTop: [244, 214, 158], floorL: [205, 163, 105], floorR: [180, 138, 84],
    shadeTint: [62, 64, 118],
    goalTop: [235, 228, 250],
    pillarTop: [226, 218, 206], pillarL: [190, 178, 162], pillarR: [160, 148, 134],
    crateTop: [214, 156, 92], crateL: [176, 118, 62], crateR: [148, 96, 48],
  };

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    num: $('level-num'), name: $('level-name'), moves: $('moves'), hint: $('hint'),
    toast: $('toast'), clear: $('clear'), clearMoves: $('clear-moves'), clearNote: $('clear-note'),
    best: $('best'), select: $('select'), selectGrid: $('select-grid'), selectSum: $('select-sum'),
  };

  // ---------- 状態 ----------
  let levelIndex = 0;
  let level, state, history;
  let sunAngle = 0, sunAngleTarget = 0;
  let sunTween = null;
  let focusPts = [];        // 柱に隠れたら柱を透かす対象（プレイヤー・木箱・ゴール）      // { from, to, t } 太陽の回転アニメ
  let anim = null;          // { from:[x,y], to:[x,y], t, pushed }
  let queue = [];           // タップ移動の予約
  let flash = null;         // { x, y, t } 日なたへの警告
  let shake = 0;
  let facing = [1, 0];
  let won = false;
  let time = 0;
  let view = { scale: 1, ox: 0, oy: 0 };
  // ---------- 記録（ブラウザの localStorage に保存） ----------
  // { [ステージ名]: { best: ベスト手数 } } … ステージ名をキーにするので、並べ替えても記録はずれない
  const records = loadRecords();

  function loadRecords() {
    let r = {};
    try { r = JSON.parse(localStorage.getItem('kagewatari.records') || '{}') || {}; } catch { /* 読めなければ空 */ }
    // 旧形式（クリア済みステージ番号の配列）からの引き継ぎ
    try {
      const old = JSON.parse(localStorage.getItem('kagewatari.cleared') || '[]');
      for (const i of old) if (LEVELS[i] && !r[LEVELS[i].name]) r[LEVELS[i].name] = { best: null };
    } catch { /* noop */ }
    return r;
  }
  function saveRecords() {
    try { localStorage.setItem('kagewatari.records', JSON.stringify(records)); } catch { /* 保存不可でも続行 */ }
  }
  const recordOf = (i) => records[LEVELS[i].name];

  // 最短手数（ソルバーで計算してキャッシュ）
  const parCache = {};
  function par(i) {
    const def = LEVELS[i];
    if (!(def.name in parCache)) {
      const p = L.parse(def);
      const sol = L.solve(p.level, p.state);
      parCache[def.name] = sol ? sol.path.length : null;
    }
    return parCache[def.name];
  }
  function mark(i) {
    const r = recordOf(i);
    if (!r) return '';
    return r.best != null && r.best === par(i) ? '★' : '✓';
  }

  function loadLevel(i) {
    levelIndex = (i + LEVELS.length) % LEVELS.length;
    const parsed = L.parse(LEVELS[levelIndex]);
    level = parsed.level;
    state = parsed.state;
    history = [];
    anim = null; queue = []; flash = null; won = false;
    sunAngle = sunAngleTarget = state.sun * 90;
    sunTween = null;
    ui.num.textContent = `${levelIndex + 1} / ${LEVELS.length}`;
    ui.name.textContent = level.name + (mark(levelIndex) ? ' ' + mark(levelIndex) : '');
    updateBest();
    ui.hint.textContent = level.hint;
    ui.hint.hidden = !level.hint;
    ui.clear.hidden = true;
    $('btn-ccw').disabled = $('btn-cw').disabled = level.lockSun;
    updateMoves();
    layout();
    try { localStorage.setItem('kagewatari.lastName', level.name); } catch { /* noop */ }
  }

  function updateMoves() { ui.moves.textContent = `${history.length} 手`; }
  function updateBest() {
    const r = recordOf(levelIndex);
    const best = r && r.best != null ? `ベスト ${r.best} 手` : 'ベスト —';
    ui.best.textContent = `${best} ／ 最短 ${par(levelIndex)} 手`;
  }

  // ---------- ステージ選択 ----------
  function openSelect() {
    ui.selectGrid.textContent = '';
    let cleared = 0, stars = 0;
    LEVELS.forEach((def, i) => {
      const r = recordOf(i), m = mark(i);
      if (r) cleared++;
      if (m === '★') stars++;
      const b = document.createElement('button');
      b.className = 'stage' + (i === levelIndex ? ' current' : '') + (r ? ' done' : '');
      b.innerHTML = `<span class="no"></span><span class="nm"></span><span class="bt"></span>`;
      b.querySelector('.no').textContent = `${i + 1}${m ? ' ' + m : ''}`;
      b.querySelector('.nm').textContent = def.name;
      b.querySelector('.bt').textContent = r && r.best != null ? `${r.best} / ${par(i)} 手` : r ? 'クリア' : '';
      b.onclick = () => { closeSelect(); loadLevel(i); };
      ui.selectGrid.appendChild(b);
    });
    ui.selectSum.textContent = `クリア ${cleared} / ${LEVELS.length}　★ ${stars}`;
    ui.select.hidden = false;
  }
  function closeSelect() { ui.select.hidden = true; }

  // ---------- 操作 ----------
  function act(action) {
    if (won) return false;
    const r = L.step(level, state, action);
    if (!r.ok) {
      queue = [];
      if (r.reason === 'burn') {
        shake = 0.3;
        if (r.target) flash = { x: r.target[0], y: r.target[1], t: 0.45 };
        toast(action === '+' || action === '-' ? 'その向きだと日なたになってしまう！' : '日なたには出られない！');
      } else if (r.reason === 'locked') {
        toast('このステージでは太陽は動かない');
      }
      return false;
    }
    history.push(state);
    const prev = state;
    state = r.state;
    if (action === '+') rotateSunTo(sunAngleTarget + 90);
    if (action === '-') rotateSunTo(sunAngleTarget - 90);
    if (L.MOVES[action]) {
      facing = L.MOVES[action];
      anim = { from: [prev.x, prev.y], to: [state.x, state.y], t: 0, pushed: r.pushed };
    }
    updateMoves();
    if (L.isWin(level, state)) {
      won = true;
      const n = history.length, p = par(levelIndex);
      const rec = records[level.name];
      const prevBest = rec ? rec.best : null;
      const improved = prevBest != null && n < prevBest;
      if (!rec || rec.best == null || n < rec.best) records[level.name] = { best: n };
      saveRecords();
      ui.name.textContent = level.name + ' ' + mark(levelIndex);
      updateBest();
      setTimeout(() => {
        ui.clearMoves.textContent = `${n} 手でクリア（最短 ${p} 手）`;
        ui.clearNote.textContent = n === p ? '★ 最短手数でクリア！' : improved ? 'ベスト更新！' : '';
        ui.clearNote.hidden = !ui.clearNote.textContent;
        ui.clear.hidden = false;
      }, 350);
    }
    return true;
  }

  function undo() {
    if (!history.length) return;
    state = history.pop();
    rotateSunTo(nearestAngle(sunAngleTarget, state.sun * 90));
    anim = null; queue = []; won = false;
    ui.clear.hidden = true;
    updateMoves();
  }

  function rotateSunTo(target) {
    if (target === sunAngleTarget) return;
    sunAngleTarget = target;
    sunTween = { from: sunAngle, to: target, t: 0 };
  }

  function nearestAngle(current, target) {
    let d = ((target - current) % 360 + 540) % 360 - 180;
    return current + d;
  }

  let toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1300);
  }

  // タップ先まで、現在の影の中だけを通る最短経路
  function pathTo(tx, ty) {
    const sh = L.shadowMap(level, state.sun, state.crates);
    const w = level.w;
    const crate = (x, y) => state.crates.includes(y * w + x);
    const start = state.y * w + state.x, goal = ty * w + tx;
    const prev = new Map([[start, null]]);
    const q = [start];
    while (q.length) {
      const i = q.shift();
      if (i === goal) break;
      const x = i % w, y = (i / w) | 0;
      for (const [a, [dx, dy]] of Object.entries(L.MOVES)) {
        const nx = x + dx, ny = y + dy, ni = ny * w + nx;
        if (prev.has(ni) || !L.isStandable(level, nx, ny) || crate(nx, ny)) continue;
        if (!L.isSafeCell(level, sh, nx, ny)) continue;
        prev.set(ni, [i, a]);
        q.push(ni);
      }
    }
    if (!prev.has(goal)) return null;
    const path = [];
    for (let i = goal; prev.get(i); i = prev.get(i)[0]) path.push(prev.get(i)[1]);
    return path.reverse();
  }

  function onTap(px, py) {
    if (won) return;
    const [gx, gy] = screenToGrid(px, py);
    if (!L.isStandable(level, gx, gy)) return;
    const dx = gx - state.x, dy = gy - state.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      // 隣なら直接（木箱押し・日なたの警告もここで出る）
      const a = Object.keys(L.MOVES).find((k) => L.MOVES[k][0] === dx && L.MOVES[k][1] === dy);
      queue = [a];
      return;
    }
    const p = pathTo(gx, gy);
    if (p) queue = p;
    else { flash = { x: gx, y: gy, t: 0.45 }; toast('影の中を通って行けない'); }
  }

  // ---------- 入力 ----------
  const KEYMAP = {
    ArrowUp: 'U', KeyW: 'U', ArrowRight: 'R', KeyD: 'R', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L',
    KeyE: '+', KeyQ: '-',
  };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!ui.select.hidden) { if (e.code === 'Escape') closeSelect(); return; }
    if (e.code === 'Escape' || e.code === 'KeyM') { openSelect(); return; }
    if (won && (e.code === 'Enter' || e.code === 'Space')) { loadLevel(levelIndex + 1); e.preventDefault(); return; }
    if (e.code === 'KeyZ' || e.code === 'Backspace') { undo(); e.preventDefault(); return; }
    if (e.code === 'KeyR') { loadLevel(levelIndex); return; }
    if (e.code === 'BracketRight' || e.code === 'KeyN') { loadLevel(levelIndex + 1); return; }
    if (e.code === 'BracketLeft' || e.code === 'KeyP') { loadLevel(levelIndex - 1); return; }
    const a = KEYMAP[e.code];
    if (a) { enqueue(a); e.preventDefault(); }
  });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    onTap(e.clientX - r.left, e.clientY - r.top);
  });
  // アニメ中の入力は3つまで予約しておく
  function enqueue(a) { if (queue.length < 3) queue.push(a); }
  $('btn-ccw').onclick = () => enqueue('-');
  $('btn-cw').onclick = () => enqueue('+');
  $('btn-undo').onclick = undo;
  $('btn-reset').onclick = () => loadLevel(levelIndex);
  $('btn-menu').onclick = openSelect;
  $('btn-select-close').onclick = closeSelect;
  ui.select.addEventListener('click', (e) => { if (e.target === ui.select) closeSelect(); });
  $('btn-prev').onclick = () => loadLevel(levelIndex - 1);
  $('btn-next').onclick = () => loadLevel(levelIndex + 1);
  $('btn-clear-next').onclick = () => loadLevel(levelIndex + 1);

  // ---------- 座標変換 ----------
  function project(x, y, z) {
    return [
      view.ox + (x - y) * (TW / 2) * view.scale,
      view.oy + (x + y) * (TH / 2) * view.scale - z * TZ * view.scale,
    ];
  }
  function screenToGrid(sx, sy) {
    const a = (sx - view.ox) / ((TW / 2) * view.scale);
    const b = (sy - view.oy) / ((TH / 2) * view.scale);
    return [Math.floor((a + b) / 2), Math.floor((b - a) / 2)];
  }

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!level) return;
    const maxH = Math.max(1, ...level.cells.map((c) => (c.t === 'pillar' ? c.h : 0))) + 1.5;
    let minX = -level.h * TW / 2, maxX = level.w * TW / 2;
    let minY = -maxH * TZ, maxY = (level.w + level.h) * TH / 2 + FLOOR_T * TZ;
    // 4方向どこに太陽が来ても画面内に収める
    for (let k = 0; k < 4; k++) {
      const [sx, sy, sz] = sunGridPos(k * 90);
      const px = (sx - sy) * TW / 2, py = (sx + sy) * TH / 2 - sz * TZ;
      minX = Math.min(minX, px - 24); maxX = Math.max(maxX, px + 24);
      minY = Math.min(minY, py - 24); maxY = Math.max(maxY, py + 24);
    }
    const top = 96, bottom = 104, side = 16;
    const availW = cw - side * 2, availH = ch - top - bottom;
    view.scale = Math.min(availW / (maxX - minX), availH / (maxY - minY), 1.6);
    view.ox = side + (availW - (maxX - minX) * view.scale) / 2 - minX * view.scale;
    view.oy = top + (availH - (maxY - minY) * view.scale) / 2 - minY * view.scale;
  }
  window.addEventListener('resize', layout);

  // ---------- 描画ヘルパ ----------
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function poly(pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // 直方体 (x0..x1, y0..y1, z0..z1) を手前2面＋上面で描く
  function box(x0, y0, x1, y1, z0, z1, top, left, right, stroke) {
    poly([project(x0, y1, z1), project(x1, y1, z1), project(x1, y1, z0), project(x0, y1, z0)], rgb(left), stroke);
    poly([project(x1, y0, z1), project(x1, y1, z1), project(x1, y1, z0), project(x1, y0, z0)], rgb(right), stroke);
    poly([project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)], rgb(top), stroke);
  }

  // ---------- メインループ ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (anim) {
      anim.t += dt / MOVE_DUR;
      if (anim.t >= 1) anim = null;
    }
    if (sunTween) {
      sunTween.t += dt / SUN_ROT_DUR;
      const t = Math.min(1, sunTween.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
      sunAngle = sunTween.from + (sunTween.to - sunTween.from) * e;
      if (t >= 1) { sunAngle = sunTween.to; sunTween = null; }
    }
    if (!anim && !sunTween && queue.length) act(queue.shift());
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
    if (shake > 0) shake = Math.max(0, shake - dt);
  }

  function draw() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    // 空：太陽の向きでうっすら色が変わる
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#f7e3c4');
    g.addColorStop(1, '#e7c9a4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    drawSun();
    refreshLitCache();

    const { w, h, cells } = level;
    // 1パス目：床
    for (let s = 0; s < w + h - 1; s++) {
      for (let x = 0; x < w; x++) {
        const y = s - x;
        if (y < 0 || y >= h) continue;
        const c = cells[y * w + x];
        if (c.t === 'void') continue;
        drawFloor(x, y, c);
      }
    }
    // 木箱の表示位置（押しているときは補間）
    const cratePos = state.crates.map((i) => {
      let x = i % w, y = (i / w) | 0;
      if (anim && anim.pushed && anim.pushed.to[0] === x && anim.pushed.to[1] === y) {
        const t = ease(anim.t);
        x = anim.pushed.from[0] + (x - anim.pushed.from[0]) * t;
        y = anim.pushed.from[1] + (y - anim.pushed.from[1]) * t;
      }
      return [x, y];
    });
    // 影（床の上に、柱・木箱・日傘の影をまとめて落とす）
    drawShadows(cratePos);
    if (flash) {
      const { x, y } = flash;
      poly([project(x, y, 0), project(x + 1, y, 0), project(x + 1, y + 1, 0), project(x, y + 1, 0)], `rgba(255,90,40,${flash.t * 1.4})`);
    }
    // 2パス目：立体物（奥から手前へ）
    const objs = [];
    const [px, py] = playerPos();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells[y * w + x];
      if (c.t === 'pillar') objs.push({ d: x + y, draw: () => drawPillar(x, y, c.h) });
      if (c.t === 'goal') objs.push({ d: x + y, draw: () => drawGoal(x, y) });
      if (c.t === 'safe') {
        const under = Math.abs(px - x) < 0.6 && Math.abs(py - y) < 0.6;
        objs.push({ d: x + y + 0.1, draw: () => drawParasol(x, y, under) });
      }
    }
    focusPts = [[px, py], ...cratePos];
    for (let i = 0; i < cells.length; i++) if (cells[i].t === 'goal') focusPts.push([i % w, (i / w) | 0]);
    for (const [cx, cy] of cratePos) objs.push({ d: cx + cy + 0.02, draw: () => drawCrate(cx, cy) });
    objs.push({ d: px + py + 0.05, draw: () => drawPlayer(px, py) });
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) o.draw();
  }

  const ease = (t) => 1 - (1 - t) * (1 - t);

  function playerPos() {
    if (!anim) return [state.x, state.y];
    const t = ease(Math.min(1, anim.t));
    return [anim.from[0] + (anim.to[0] - anim.from[0]) * t, anim.from[1] + (anim.to[1] - anim.from[1]) * t];
  }

  function drawFloor(x, y, c) {
    const top = c.t === 'goal' ? COLORS.goalTop : COLORS.floorTop;
    box(x, y, x + 1, y + 1, -FLOOR_T, 0, top, COLORS.floorL, COLORS.floorR, 'rgba(90,60,40,0.18)');
    // 日なたのきらめき（太陽が止まっているときだけ）
    if (c.t === 'floor' && !sunTween && !litCache.sh[y * level.w + x]) {
      const a = 0.12 * (0.6 + 0.4 * Math.sin(time * 3 + x * 1.7 + y * 2.3));
      poly([project(x + 0.2, y + 0.2, 0), project(x + 0.8, y + 0.2, 0), project(x + 0.8, y + 0.8, 0), project(x + 0.2, y + 0.8, 0)], `rgba(255,250,220,${a})`);
    }
  }

  // 現在の盤面の影マップ（きらめき用。状態が変わったときだけ再計算）
  const litCache = { key: '', sh: new Uint8Array(0) };
  function refreshLitCache() {
    const k = L.key(state) + levelIndex;
    if (k !== litCache.key) { litCache.key = k; litCache.sh = L.shadowMap(level, state.sun, state.crates); }
  }

  // 凸包（影の多角形用）
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // 影は別キャンバスに不透明で塗り重ね（重なっても濃くならない）、床の形で切り抜いてから半透明で合成する
  let shadowCanvas = null, sctx = null;
  function drawShadows(cratePos) {
    if (!shadowCanvas) { shadowCanvas = document.createElement('canvas'); sctx = shadowCanvas.getContext('2d'); }
    if (shadowCanvas.width !== canvas.width || shadowCanvas.height !== canvas.height) {
      shadowCanvas.width = canvas.width; shadowCanvas.height = canvas.height;
    }
    const tr = ctx.getTransform();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
    sctx.setTransform(tr);
    sctx.fillStyle = rgb(COLORS.shadeTint);

    const th = (sunAngle + 90) * Math.PI / 180;
    const dx = Math.cos(th), dy = Math.sin(th);
    const fillPoly = (pts) => {
      sctx.beginPath();
      pts.forEach(([gx, gy], k) => { const [sx, sy] = project(gx, gy, 0); k ? sctx.lineTo(sx, sy) : sctx.moveTo(sx, sy); });
      sctx.closePath();
      sctx.fill();
    };
    // 1マスの底面から高さ len の影：底面の四角形と、それを影の方向へ len ずらした四角形の凸包
    const cast = (x, y, len) => {
      const sq = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      fillPoly(hull(sq.concat(sq.map(([a, b]) => [a + dx * len, b + dy * len]))));
    };
    const { w, h, cells } = level;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells[y * w + x];
      if (c.t === 'pillar') cast(x, y, c.h);
      else if (c.t === 'safe') fillPoly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]); // 日傘の影
    }
    for (const [x, y] of cratePos) cast(x, y, 1);

    // 床の形で切り抜き
    sctx.globalCompositeOperation = 'destination-in';
    sctx.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cells[y * w + x].t === 'void') continue;
      const p = [project(x, y, 0), project(x + 1, y, 0), project(x + 1, y + 1, 0), project(x, y + 1, 0)];
      sctx.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < 4; k++) sctx.lineTo(p[k][0], p[k][1]);
      sctx.closePath();
    }
    sctx.fillStyle = '#000';
    sctx.fill();
    sctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(shadowCanvas, 0, 0);
    ctx.restore();
  }

  // 日傘：赤白しましまの傘。下にいるときは半透明にして中が見えるように
  function drawParasol(x, y, under) {
    const cx = x + 0.5, cy = y + 0.5, s = view.scale;
    ctx.save();
    if (under) ctx.globalAlpha = 0.45;
    const [bx, by] = project(cx, cy, 0), [tx, ty] = project(cx, cy, 1.35);
    ctx.strokeStyle = '#6b4a3a';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    const N = 12, R = 0.66, zr = 1.05, za = 1.42;
    const sway = Math.sin(time * 1.3 + x + y) * 0.02;
    const apex = [cx + sway, cy - sway, za];
    const rim = [];
    for (let k = 0; k < N; k++) {
      const a = k / N * Math.PI * 2;
      rim.push([cx + Math.cos(a) * R + sway, cy + Math.sin(a) * R - sway, zr]);
    }
    const segs = [];
    for (let k = 0; k < N; k++) {
      const p = rim[k], q = rim[(k + 1) % N];
      segs.push({ k, p, q, d: (p[0] + q[0] + p[1] + q[1]) / 2 });
    }
    segs.sort((a, b) => a.d - b.d);
    for (const { k, p, q } of segs) {
      poly([project(...apex), project(...p), project(...q)], k % 2 ? '#fff4e6' : '#e8604c', 'rgba(120,40,30,0.25)');
    }
    ctx.restore();
  }

  function drawPillar(x, y, hgt) {
    // プレイヤー・木箱・ゴールを隠している柱は半透明に
    const reach = hgt * TZ / (TH / 2) + 1; // 柱の高さで隠れる奥行き
    const front = focusPts.some(([ox, oy]) => {
      const d = (x + y) - (ox + oy);
      return d > 0 && d <= reach && Math.abs((x - y) - (ox - oy)) <= 1.2;
    });
    ctx.save();
    if (front) ctx.globalAlpha = 0.4;
    drawPillarBody(x, y, hgt);
    ctx.restore();
  }

  function drawPillarBody(x, y, hgt) {
    box(x + 0.08, y + 0.08, x + 0.92, y + 0.92, 0, hgt, COLORS.pillarTop, COLORS.pillarL, COLORS.pillarR, 'rgba(80,60,50,0.25)');
    // 段の目地
    ctx.strokeStyle = 'rgba(90,70,60,0.18)';
    ctx.lineWidth = 1;
    for (let k = 1; k < hgt; k++) {
      const a = project(x + 0.08, y + 0.92, k), b = project(x + 0.92, y + 0.92, k), c = project(x + 0.92, y + 0.08, k);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    // 高さの数字（影の長さ）
    const [tx, ty] = project(x + 0.5, y + 0.5, hgt);
    ctx.fillStyle = 'rgba(110,90,75,0.55)';
    ctx.font = `bold ${Math.round(12 * view.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(hgt), tx, ty);
  }

  function drawCrate(x, y) {
    box(x + 0.14, y + 0.14, x + 0.86, y + 0.86, 0, 0.9, COLORS.crateTop, COLORS.crateL, COLORS.crateR, 'rgba(90,50,20,0.45)');
    const a = project(x + 0.14, y + 0.86, 0.9), b = project(x + 0.86, y + 0.86, 0), c = project(x + 0.86, y + 0.86, 0.9), d = project(x + 0.14, y + 0.86, 0);
    ctx.strokeStyle = 'rgba(90,50,20,0.4)';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }

  function drawGoal(x, y) {
    const bob = Math.sin(time * 2.2) * 0.12;
    const [cx, cy] = project(x + 0.5, y + 0.5, 0.9 + bob);
    const [gx, gy] = project(x + 0.5, y + 0.5, 0);
    const s = view.scale;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 26 * s);
    glow.addColorStop(0, 'rgba(190,180,255,0.6)');
    glow.addColorStop(1, 'rgba(190,180,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(gx, gy, 28 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
    // 月のかけら（三日月）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.4 + Math.sin(time) * 0.15);
    ctx.fillStyle = '#f4f0ff';
    ctx.shadowColor = 'rgba(170,160,255,0.9)';
    ctx.shadowBlur = 12 * s;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * s, Math.PI * 0.3, Math.PI * 1.7, false);
    ctx.arc(4 * s, 0, 8 * s, Math.PI * 1.55, Math.PI * 0.45, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(x, y) {
    const s = view.scale;
    const hop = anim ? Math.sin(Math.min(1, anim.t) * Math.PI) * 0.25 : 0;
    const breathe = Math.sin(time * 3) * 0.04;
    let [gx, gy] = project(x + 0.5, y + 0.5, 0);
    const sx = shake > 0 ? Math.sin(time * 70) * 4 * s * (shake / 0.3) : 0;
    gx += sx;
    // 足元
    ctx.fillStyle = 'rgba(30,25,60,0.35)';
    ctx.beginPath(); ctx.ellipse(gx, gy, 13 * s, 6.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    const [, by] = project(x + 0.5, y + 0.5, 0.55 + hop + breathe);
    // 体（ゆらめく影のしずく形）
    const bw = 12 * s, bh = 20 * s;
    ctx.fillStyle = shake > 0 ? '#5a2a3a' : '#2c2747';
    ctx.beginPath();
    ctx.moveTo(gx - bw, by + bh * 0.45);
    ctx.quadraticCurveTo(gx - bw * 1.05, by - bh * 0.7, gx, by - bh * 0.75);
    ctx.quadraticCurveTo(gx + bw * 1.05, by - bh * 0.7, gx + bw, by + bh * 0.45);
    // すそのギザギザ
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const wx = gx + bw - t * bw * 2;
      const wy = by + bh * 0.45 + (k % 2 ? 4 * s : 0) + Math.sin(time * 6 + k) * 1.2 * s;
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();
    // 目：向いている方向に寄せる
    const fx = (facing[0] - facing[1]) * 3 * s, fy = (facing[0] + facing[1]) * 1.2 * s;
    const blink = (time % 4) > 3.85 ? 0.2 : 1;
    ctx.fillStyle = '#fff6d8';
    for (const ex of [-4.5, 4.5]) {
      ctx.beginPath();
      ctx.ellipse(gx + ex * s + fx, by - bh * 0.25 + fy, 2.4 * s, 3.4 * s * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 太陽：盤面の外、影と反対側の空に置く
  // 太陽の位置 [x, y, z]。奥側にあるときは空高く、手前側にあるときは
  // 持ち上げずに盤面から離して置く（持ち上げると盤面に重なって地面の下に見えるため）
  const SUN_Z = 3.2;
  function sunGridPos(angle) {
    const th = (angle + 90) * Math.PI / 180;
    const dx = -Math.cos(th), dy = -Math.sin(th);       // 盤面中心から見た太陽の方向
    const front = Math.min(1, Math.max(0, dx + dy));    // 0: 奥〜横, 1: 手前（左下・右下）
    const R = Math.max(level.w, level.h) * 0.5 + 1.2 + front * 1.0;
    return [level.w / 2 + dx * R, level.h / 2 + dy * R, SUN_Z * (1 - front)];
  }
  function drawSun() {
    const [cx, cy, cz] = sunGridPos(sunAngle);
    const [sx, sy] = project(cx, cy, cz);
    const s = view.scale;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60 * s);
    glow.addColorStop(0, 'rgba(255,220,120,0.9)');
    glow.addColorStop(0.35, 'rgba(255,200,90,0.35)');
    glow.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, sy, 60 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,80,0.8)';
    ctx.lineWidth = 2.5 * s;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2 + time * 0.3;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * 20 * s, sy + Math.sin(a) * 20 * s);
      ctx.lineTo(sx + Math.cos(a) * 28 * s, sy + Math.sin(a) * 28 * s);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd56a';
    ctx.beginPath(); ctx.arc(sx, sy, 15 * s, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- 開始 ----------
  let start = 0;
  try {
    const lastName = localStorage.getItem('kagewatari.lastName');
    const byName = LEVELS.findIndex((d) => d.name === lastName);
    start = byName >= 0 ? byName : Math.min(LEVELS.length - 1, Math.max(0, +localStorage.getItem('kagewatari.last') || 0));
  } catch { /* noop */ }
  loadLevel(start);
  requestAnimationFrame(frame);
})();
