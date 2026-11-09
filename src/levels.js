// ステージ定義（記号の意味は logic.js の parse() を参照）
//   lockSun: true … 太陽を回せない（チュートリアル用）
//   en: { name, hint } … 英語版の名前とヒント（記録の保存キーは日本語の name）
// チュートリアル以外は tools/generate.js で生成し、tools/verify.js で検証済み。
(function (root) {
  const LEVELS = [
    // ---- 基本：影の上を歩く ----
    {
      name: '影をつたって', en: { name: "Follow the Shade", hint: "You can't step into sunlight. Follow the pillars' shadows to the moon shard." }, lockSun: true, sun: 3,
      hint: '日なたには出られない。柱の影をつたってゴールの月のかけらへ。',
      map: ['4....   ', ' P.3... ', '     2..', '       G'],
    },
    {
      name: '影の長さ', en: { name: "Shadow Length", hint: "The number on a pillar is its height. Taller pillars cast longer shadows." }, lockSun: true, sun: 3,
      hint: '柱の数字は高さ。高い柱ほど影が長く伸びる。',
      map: ['2.....  ', ' P      ', '6......G'],
    },
    {
      name: '日傘', en: { name: "Parasol", hint: "The shade under a parasol is always safe." }, lockSun: true, sun: 0,
      hint: '日傘の下は、いつでも歩ける。',
      map: [' 1 1  1 ', 'P.S.SS.G'],
    },
    // ---- 太陽を回す ----
    {
      name: '太陽を回す', en: { name: "Turn the Sun", hint: "Press Q / E (or the buttons below) to turn the sun. The shadows turn with it." }, sun: 0,
      hint: 'Q / E（または下のボタン）で太陽を回すと、影の向きが変わる。',
      map: ['.5.....G', '..P.....'],
    },
    {
      name: '回せる場所', en: { name: "Pivot Point", hint: "You can't turn the sun if it would leave you in sunlight. Find a tile that stays shaded both ways." }, sun: 0,
      hint: '回したあと日なたになる場所では、太陽を回せない。どちらの向きでも影になるマスを探そう。',
      map: ['  3    ', '  .    ', '5.....G', '  .    ', '  P    '],
    },
    { name: '踊り場', en: { name: "Landing" }, sun: 2, map: ['.2...', '..4.G', '.2...', '.4...', '.P...'] },
    { name: '三つの塔', en: { name: "Three Towers" }, sun: 0, map: ['..P..', '.3..4', '.....', '.4...', '...3G'] },
    { name: '穴あきの庭', en: { name: "Garden of Holes" }, sun: 2, map: ['.....', '4P ..', '..4..', '.4...', '...1G'] },
    { name: '石の森', en: { name: "Stone Forest" }, sun: 0, map: ['..P3...', '4. ..4.', '.......', '....4..', '.4. ..4', '...G...', '...3...'] },
    // ---- 木箱 ----
    {
      name: '木箱', en: { name: "Crate", hint: "Crates can be pushed. A crate casts a one-tile shadow." }, lockSun: true, sun: 0,
      hint: '木箱は押せる。木箱も1マス分の影を落とす。',
      map: [' 11.1 ', 'P..C.G', 'SSSS  '],
    },
    {
      name: '箱の陰', en: { name: "In the Crate's Shade", hint: "You can push a sunlit crate toward the sun: you step right into its shadow." }, lockSun: true, sun: 3,
      hint: '太陽に向かって押すなら、日なたの箱も押せる（押した箱の影に入れるから）。',
      map: ['....CP', ' G    '],
    },
    {
      name: '木箱と太陽', en: { name: "Crate and Sun", hint: "If you can't push, try turning the sun." }, sun: 2,
      hint: '押せないときは、太陽の向きを変えてみよう。',
      map: ['P4...', '.4..G', '...4.', '.3C .', '...4.'],
    },
    { name: '夕暮れの回廊', en: { name: "Dusk Corridor" }, sun: 3, map: ['.P...4', '.3. .4', '3... .', '..2. .', '..1...', 'G.4 4.'] },
    { name: 'ひだまり', en: { name: "Sunny Spot" }, sun: 2, map: ['...P..', '3.....', '...4..', '....1.', '.3....', '..G4 .'] },
    { name: '広場', en: { name: "Plaza" }, sun: 1, map: ['...3..P', '..4..2.', '1......', '....4..', '.......', '...4...', 'G....2.'] },
    {
      name: '遠回り', en: { name: "The Long Way", hint: "Crates can't be pulled back. Press Z to undo." }, sun: 0,
      hint: '押した箱は引けない。困ったら Z で戻そう。',
      map: ['P....G', '.2... ', '3.... ', '.C4. .', '....4.', '.4....'],
    },
    { name: '二つの木箱', en: { name: "Two Crates" }, sun: 2, map: ['.......', '...... ', '2.4...G', '.C..C.3', '.......', '..P...1'] },
    { name: '長い午後', en: { name: "Long Afternoon" }, sun: 0, map: ['3.....', '.1P...', '..2...', '...4.3', '...C..', '.....G'] },
    // ---- 上級 ----
    { name: '崩れた庭', en: { name: "Ruined Garden" }, sun: 0, map: ['P.333..', '4C....4', '.... 4.', '.......', '.......', '.4..G .'] },
    { name: '影送り', en: { name: "Shadow Relay" }, sun: 2, map: ['4....G.', '...4 ..', ' ...2..', '..C...4', '.......', '1.P.4. '] },
    { name: '長い影', en: { name: "Long Shadows" }, sun: 0, map: [' G.4...', ' .....P', '. 2....', '..2....', '3...C4.', '.4....4'] },
    { name: '二つの重荷', en: { name: "Twin Burdens" }, sun: 2, map: ['...C. 4', '.. 4.4 ', '.C4...4', '......P', '. . ...', '.. G...'] },
    { name: '迷い箱', en: { name: "Lost Crate" }, sun: 2, map: ['G3.....', '...C...', '....43P', '...C4..', '. 3....', '... 4..'] },
    { name: '夜明け前', en: { name: "Before Dawn" }, sun: 2, map: ['....22.', '4......', '.3..C..', '..C.4. ', '......4', 'P.2.3.G'] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.SHADOW_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
