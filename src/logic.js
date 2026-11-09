// 影渡り — ゲームロジック（描画・入力に依存しない純粋なルール）
// ブラウザでは window.ShadowLogic、Node では require() で使える。
(function (root) {
  'use strict';

  // 太陽の向き 0..3 ごとの「影が伸びる方向」(dx, dy)
  // 0: 影が +y（画面左下）へ, 1: -x（左上）, 2: -y（右上）, 3: +x（右下）
  const SHADOW_DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];

  const MOVES = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };

  const CRATE_HEIGHT = 1;

  // マップ文字:
  //   ' ' / '_' : 穴（床なし）
  //   '.'       : 床（日なたでは歩けない）
  //   '1'..'9'  : 柱（その高さ分だけ影が伸びる）
  //   'S'       : 日傘（その下は常に影）
  //   'P'       : 日傘 + プレイヤー初期位置
  //   'p'       : 床 + プレイヤー初期位置
  //   'G'       : ゴール（常に歩ける）
  //   'C'       : 床 + 木箱（押せる。高さ1の影を落とす）
  function parse(def) {
    const rows = def.map;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const cells = [];
    let player = null;
    const crates = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x] || ' ';
        let cell = { t: 'void', h: 0 };
        if (ch === '.') cell = { t: 'floor', h: 0 };
        else if (ch >= '1' && ch <= '9') cell = { t: 'pillar', h: ch.charCodeAt(0) - 48 };
        else if (ch === 'S') cell = { t: 'safe', h: 0 };
        else if (ch === 'P') { cell = { t: 'safe', h: 0 }; player = [x, y]; }
        else if (ch === 'p') { cell = { t: 'floor', h: 0 }; player = [x, y]; }
        else if (ch === 'G') cell = { t: 'goal', h: 0 };
        else if (ch === 'C') { cell = { t: 'floor', h: 0 }; crates.push(y * w + x); }
        cells.push(cell);
      }
    }
    if (!player) throw new Error('level has no player: ' + def.name);
    const level = { name: def.name, hint: def.hint || '', w, h, cells, lockSun: !!def.lockSun };
    const state = { x: player[0], y: player[1], sun: def.sun || 0, crates: crates.sort((a, b) => a - b) };
    return { level, state };
  }

  function inBounds(level, x, y) {
    return x >= 0 && y >= 0 && x < level.w && y < level.h;
  }

  function cellAt(level, x, y) {
    return inBounds(level, x, y) ? level.cells[y * level.w + x] : { t: 'void', h: 0 };
  }

  // 影マップ: 1 = 影
  function shadowMap(level, sun, crates) {
    const out = new Uint8Array(level.w * level.h);
    const [dx, dy] = SHADOW_DIRS[sun];
    const cast = (x, y, len) => {
      for (let k = 1; k <= len; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (!inBounds(level, nx, ny)) break;
        out[ny * level.w + nx] = 1;
      }
    };
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const c = level.cells[y * level.w + x];
        if (c.t === 'pillar') cast(x, y, c.h);
      }
    }
    for (const i of crates) cast(i % level.w, Math.floor(i / level.w), CRATE_HEIGHT);
    return out;
  }

  function isSafeCell(level, shadow, x, y) {
    const c = cellAt(level, x, y);
    if (c.t === 'safe' || c.t === 'goal') return true;
    return c.t === 'floor' && shadow[y * level.w + x] === 1;
  }

  function isStandable(level, x, y) {
    const t = cellAt(level, x, y).t;
    return t === 'floor' || t === 'safe' || t === 'goal';
  }

  function hasCrate(state, level, x, y) {
    return state.crates.includes(y * level.w + x);
  }

  // 1手進める。戻り値 { ok, state, reason, pushed }
  //   action: 'U' 'R' 'D' 'L' 移動 / '+' 太陽を時計回り / '-' 反時計回り
  function step(level, state, action) {
    if (action === '+' || action === '-') {
      if (level.lockSun) return { ok: false, reason: 'locked', state };
      const sun = (state.sun + (action === '+' ? 1 : 3)) % 4;
      const sh = shadowMap(level, sun, state.crates);
      if (!isSafeCell(level, sh, state.x, state.y)) return { ok: false, reason: 'burn', state };
      return { ok: true, state: { ...state, sun } };
    }
    const mv = MOVES[action];
    if (!mv) return { ok: false, reason: 'bad', state };
    const nx = state.x + mv[0], ny = state.y + mv[1];
    if (!isStandable(level, nx, ny)) return { ok: false, reason: 'wall', state };

    let crates = state.crates;
    let pushed = null;
    if (hasCrate(state, level, nx, ny)) {
      const cx = nx + mv[0], cy = ny + mv[1];
      const ct = cellAt(level, cx, cy).t;
      if (!(ct === 'floor' || ct === 'safe') || hasCrate(state, level, cx, cy)) {
        return { ok: false, reason: 'wall', state };
      }
      const from = ny * level.w + nx, to = cy * level.w + cx;
      crates = state.crates.map((i) => (i === from ? to : i)).sort((a, b) => a - b);
      pushed = { from: [nx, ny], to: [cx, cy] };
    }
    const sh = shadowMap(level, state.sun, crates);
    if (!isSafeCell(level, sh, nx, ny)) return { ok: false, reason: 'burn', state, target: [nx, ny] };
    return { ok: true, state: { x: nx, y: ny, sun: state.sun, crates }, pushed };
  }

  function isWin(level, state) {
    return cellAt(level, state.x, state.y).t === 'goal';
  }

  function key(state) {
    return state.x + ',' + state.y + ',' + state.sun + ',' + state.crates.join('.');
  }

  // 幅優先探索で最短解を返す（なければ null）
  function solve(level, start, opts = {}) {
    const actions = opts.noRotate || level.lockSun ? ['U', 'R', 'D', 'L'] : ['U', 'R', 'D', 'L', '+', '-'];
    const limit = opts.limit || 200000;
    const seen = new Map();
    seen.set(key(start), null);
    let frontier = [start];
    const prev = new Map();
    while (frontier.length) {
      const next = [];
      for (const s of frontier) {
        if (isWin(level, s)) {
          const path = [];
          let k = key(s);
          while (prev.has(k)) { const [pk, a] = prev.get(k); path.push(a); k = pk; }
          return { path: path.reverse(), explored: seen.size };
        }
        for (const a of actions) {
          const r = step(level, s, a);
          if (!r.ok) continue;
          const k = key(r.state);
          if (seen.has(k)) continue;
          seen.set(k, true);
          prev.set(k, [key(s), a]);
          next.push(r.state);
          if (seen.size > limit) return null;
        }
      }
      frontier = next;
    }
    return null;
  }

  const api = { SHADOW_DIRS, MOVES, parse, shadowMap, isSafeCell, isStandable, cellAt, step, isWin, solve, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShadowLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
