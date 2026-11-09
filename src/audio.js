// サウンド：効果音を Web Audio でその場で合成する（音声ファイル・外部素材なし）
// 将来フリー素材に差し替える場合も、外から呼ぶ Sound.play('step') などの名前はそのまま使える。
(function (root) {
  'use strict';

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* noop */ } };

  let ac = null, master, sfxBus;
  let sfxOn = load('kagewatari.sfx', true);
  let noiseBuf = null;

  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.7 : 0; sfxBus.connect(master);
    // ホワイトノイズ（風・ジュッという音用）
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // ---------- 音の部品 ----------
  function tone({ freq, to, dur = 0.15, type = 'sine', vol = 0.3, at = 0, attack = 0.005, out }) {
    const t = ac.currentTime + at;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.2, type = 'bandpass', freq = 1000, to, q = 1, at = 0, attack = 0.01 }) {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- 効果音 ----------
  const SFX = {
    step() { // ぽてっ
      const f = 300 + Math.random() * 60;
      tone({ freq: f, to: f * 0.6, dur: 0.08, type: 'sine', vol: 0.22 });
      noise({ dur: 0.05, vol: 0.05, type: 'lowpass', freq: 900 });
    },
    push() { // ずずっ
      tone({ freq: 120, to: 70, dur: 0.16, type: 'triangle', vol: 0.3 });
      noise({ dur: 0.18, vol: 0.12, type: 'lowpass', freq: 500, to: 250 });
    },
    sun(dir) { // ひゅうん＋きらり
      noise({ dur: 0.45, vol: 0.09, type: 'bandpass', freq: dir > 0 ? 500 : 1800, to: dir > 0 ? 1800 : 500, q: 2, attack: 0.12 });
      const base = dir > 0 ? [880, 1320] : [1320, 880];
      tone({ freq: base[0], dur: 0.35, vol: 0.07, at: 0.1, attack: 0.02 });
      tone({ freq: base[1], dur: 0.45, vol: 0.06, at: 0.22, attack: 0.02 });
    },
    burn() { // じゅっ
      noise({ dur: 0.22, vol: 0.14, type: 'highpass', freq: 2500, attack: 0.005 });
      tone({ freq: 220, to: 120, dur: 0.18, type: 'square', vol: 0.06 });
    },
    locked() {
      tone({ freq: 330, dur: 0.09, type: 'triangle', vol: 0.15 });
      tone({ freq: 247, dur: 0.14, type: 'triangle', vol: 0.15, at: 0.09 });
    },
    undo() { // しゅるっ
      tone({ freq: 520, to: 340, dur: 0.1, type: 'sine', vol: 0.15 });
    },
    click() {
      tone({ freq: 1200, dur: 0.04, type: 'sine', vol: 0.08 });
    },
    clear() { // きらきら上がるアルペジオ
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone({ freq: f, dur: 0.9, type: 'sine', vol: 0.16, at: i * 0.09, attack: 0.01 });
        tone({ freq: f * 2, dur: 0.5, type: 'sine', vol: 0.04, at: i * 0.09, attack: 0.01 });
      });
    },
  };

  const Sound = {
    // ブラウザは操作があるまで音を鳴らせないので、最初のタップ・キー入力で呼ぶ
    unlock() {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
    },
    play(name, ...args) {
      if (!sfxOn || !ac || ac.state !== 'running' || !SFX[name]) return;
      SFX[name](...args);
    },
    get sfxOn() { return sfxOn; },
    setSfx(on) {
      sfxOn = on; save('kagewatari.sfx', on);
      if (ac) sfxBus.gain.value = on ? 0.7 : 0;
    },
  };

  // タブが裏に回ったら止める
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (sfxOn) ac.resume();
  });

  root.Sound = Sound;
})(window);
