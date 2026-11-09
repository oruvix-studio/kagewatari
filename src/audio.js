// サウンド：効果音と BGM を Web Audio でその場で合成する（音声ファイル・外部素材なし）
// 将来フリー素材に差し替える場合も、外から呼ぶ Sound.play('step') などの名前はそのまま使える。
(function (root) {
  'use strict';

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* noop */ } };

  let ac = null, master, sfxBus, bgmBus, echo;
  let sfxOn = load('kagewatari.sfx', true);
  let bgmOn = load('kagewatari.bgm', true);
  let noiseBuf = null;

  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.7 : 0; sfxBus.connect(master);
    bgmBus = ac.createGain(); bgmBus.gain.value = 0; bgmBus.connect(master);
    // BGM 用のやわらかい残響（ディレイ＋フィードバック）
    echo = ac.createDelay(1); echo.delayTime.value = 0.36;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200;
    echo.connect(tone); tone.connect(fb); fb.connect(echo); tone.connect(bgmBus);
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

  // ---------- BGM：オルゴール風。コード進行に沿って音を選ぶ、ゆっくりした自動演奏 ----------
  const BPM = 76, STEP = 60 / BPM / 2; // 8分音符
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // C – Am – F – G（ペンタトニック寄りに）
  const CHORDS = [
    { bass: 48, tones: [60, 64, 67, 72, 76, 79] },
    { bass: 45, tones: [57, 60, 64, 69, 72, 76] },
    { bass: 41, tones: [57, 60, 65, 69, 72, 77] },
    { bass: 43, tones: [55, 59, 62, 67, 71, 74] },
  ];
  let bgmTimer = null, nextTime = 0, stepIdx = 0, melodyIdx = 3;
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  function bell(freq, at, vol) {
    const t = at;
    for (const [mul, v, dur] of [[1, 1, 1.6], [2, 0.25, 0.8], [3.01, 0.08, 0.4]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bgmBus); g.connect(echo);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  function scheduleBgm() {
    while (nextTime < ac.currentTime + 0.4) {
      const bar = Math.floor(stepIdx / 8) % CHORDS.length;
      const beat = stepIdx % 8;
      const ch = CHORDS[bar];
      if (beat === 0) bell(midi(ch.bass), nextTime, 0.09);
      if (beat === 4) bell(midi(ch.bass + 7), nextTime, 0.05);
      // メロディ：コードの音を隣へ少しずつ動く。休符も入れて余白を残す
      const play = beat === 0 || rnd() < (beat % 2 ? 0.35 : 0.6);
      if (play) {
        melodyIdx = Math.max(0, Math.min(ch.tones.length - 1, melodyIdx + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.8 ? 1 : 2)));
        bell(midi(ch.tones[melodyIdx] + 12), nextTime, 0.06);
      }
      nextTime += STEP;
      stepIdx++;
      if (stepIdx % 64 === 0) seed = 7 + (stepIdx / 64) % 3; // 8小節ごとに少し変化
    }
  }

  function startBgm() {
    if (!ac || bgmTimer) return;
    nextTime = ac.currentTime + 0.1;
    bgmBus.gain.cancelScheduledValues(ac.currentTime);
    bgmBus.gain.setTargetAtTime(0.55, ac.currentTime, 0.5);
    bgmTimer = setInterval(scheduleBgm, 100);
    scheduleBgm();
  }
  function stopBgm() {
    if (!ac) return;
    bgmBus.gain.setTargetAtTime(0, ac.currentTime, 0.2);
    clearInterval(bgmTimer); bgmTimer = null;
  }

  const Sound = {
    // ブラウザは操作があるまで音を鳴らせないので、最初のタップ・キー入力で呼ぶ
    unlock() {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      if (bgmOn) startBgm();
    },
    play(name, ...args) {
      if (!sfxOn || !ac || ac.state !== 'running' || !SFX[name]) return;
      SFX[name](...args);
    },
    get sfxOn() { return sfxOn; },
    get bgmOn() { return bgmOn; },
    setSfx(on) {
      sfxOn = on; save('kagewatari.sfx', on);
      if (ac) sfxBus.gain.value = on ? 0.7 : 0;
    },
    setBgm(on) {
      bgmOn = on; save('kagewatari.bgm', on);
      if (!ac) return;
      if (on) startBgm(); else stopBgm();
    },
  };

  // タブが裏に回ったら止める
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (bgmOn || sfxOn) ac.resume();
  });

  root.Sound = Sound;
})(window);
