// 文言の多言語対応（日本語 / English）
// HTML 側は data-i18n="キー"（textContent）と data-i18n-aria="キー"（aria-label）で指定する。
(function (root) {
  'use strict';

  const STR = {
    ja: {
      title: '影渡り',
      tagline: '影だけを渡って、月のかけらへ。',
      continue: 'つづきから',
      start: 'はじめる',
      stages: 'ステージ一覧',
      langSwitch: 'English',
      sfx: '効果音',
      on: 'ON',
      off: 'OFF',
      sun: '太陽',
      undo: '戻す',
      restart: '最初から',
      next: '次へ',
      close: '閉じる',
      toTitle: 'タイトル',
      clearTitle: '月のかけらを手に入れた',
      ariaMenu: 'ステージ一覧',
      ariaPrev: '前のステージ',
      ariaNext: '次のステージ',
      moves: (n) => `${n} 手`,
      best: (b, p) => `ベスト ${b == null ? '—' : b + ' 手'} ／ 最短 ${p} 手`,
      clearMoves: (n, p) => `${n} 手でクリア（最短 ${p} 手）`,
      perfect: '★ 最短手数でクリア！',
      newBest: 'ベスト更新！',
      burnMove: '日なたには出られない！',
      burnRotate: 'その向きだと日なたになってしまう！',
      locked: 'このステージでは太陽は動かない',
      noPath: '影の中を通って行けない',
      selectSum: (c, n, s) => `クリア ${c} / ${n}　★ ${s}`,
      cardCleared: 'クリア',
      cardBest: (b, p) => `${b} / ${p} 手`,
      continueAt: (i, name) => `${i}. ${name}`,
      help: 'タップ / クリック：そこまで歩く<br>矢印・WASD：移動　Q / E：太陽を回す<br>Z：戻す　R：最初から　Esc：ステージ一覧',
    },
    en: {
      title: 'Kagewatari',
      tagline: 'Walk only in the shade. Reach the moon shard.',
      continue: 'Continue',
      start: 'Start',
      stages: 'Stages',
      langSwitch: '日本語',
      sfx: 'Sound',
      on: 'ON',
      off: 'OFF',
      sun: 'Sun',
      undo: 'Undo',
      restart: 'Restart',
      next: 'Next',
      close: 'Close',
      toTitle: 'Title',
      clearTitle: 'You found a moon shard!',
      ariaMenu: 'Stages',
      ariaPrev: 'Previous stage',
      ariaNext: 'Next stage',
      moves: (n) => `${n} ${n === 1 ? 'move' : 'moves'}`,
      best: (b, p) => `Best ${b == null ? '—' : b} / Par ${p}`,
      clearMoves: (n, p) => `Cleared in ${n} moves (par ${p})`,
      perfect: '★ Perfect — you matched par!',
      newBest: 'New best!',
      burnMove: "Can't step into sunlight!",
      burnRotate: "That would leave you in the sun!",
      locked: 'The sun is fixed in this stage',
      noPath: 'No shaded path to there',
      selectSum: (c, n, s) => `Cleared ${c} / ${n}   ★ ${s}`,
      cardCleared: 'Cleared',
      cardBest: (b, p) => `${b} / ${p}`,
      continueAt: (i, name) => `${i}. ${name}`,
      help: 'Tap / click: walk there<br>Arrows / WASD: move　Q / E: turn the sun<br>Z: undo　R: restart　Esc: stages',
    },
  };

  function detect() {
    try {
      const saved = localStorage.getItem('kagewatari.lang');
      if (saved === 'ja' || saved === 'en') return saved;
    } catch { /* noop */ }
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
    return /^ja\b/i.test(nav) ? 'ja' : 'en';
  }

  let lang = detect();
  const listeners = [];

  const I18N = {
    get lang() { return lang; },
    t(key, ...args) {
      const v = STR[lang][key] ?? STR.ja[key];
      return typeof v === 'function' ? v(...args) : v;
    },
    setLang(l) {
      lang = l;
      try { localStorage.setItem('kagewatari.lang', l); } catch { /* noop */ }
      I18N.apply();
      listeners.forEach((f) => f(l));
    },
    toggle() { I18N.setLang(lang === 'ja' ? 'en' : 'ja'); },
    onChange(f) { listeners.push(f); },
    // ステージ名とヒント（levels.js の en: { name, hint } を使う）
    levelName(def) { return lang === 'en' && def.en ? def.en.name : def.name; },
    levelHint(def) { return (lang === 'en' && def.en ? def.en.hint : def.hint) || ''; },
    apply() {
      document.documentElement.lang = lang;
      document.title = STR[lang].title;
      document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18N.t(el.dataset.i18n); });
      document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = I18N.t(el.dataset.i18nHtml); });
      document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', I18N.t(el.dataset.i18nAria)); });
    },
  };
  root.I18N = I18N;
})(window);
