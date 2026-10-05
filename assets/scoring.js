/*
 * 十九种人 · 计分模块（UMD：浏览器挂在 window.Scoring，node 下 module.exports）
 *
 * 答案格式 answers：{ 题号: 值 }
 *   likert 题：值为 1–5
 *   choice 题：值为所选选项的下标（从 0 开始）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Scoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= 可调常量 ================= */
  // 心性"突出"判定：与最高分相差不超过 GAP，且自身不低于 FLOOR，即视为突出
  // （模拟测试：GAP 8 时两毒并重者约四成因作答误差被判成单一型；GAP 12 时约八成判对，
  //   而一毒明显偏高者仍约 95% 判为单一型。FLOOR 45 使随机乱答者不至于集中到第 7 种。）
  var GAP = 12;
  var FLOOR = 45;
  // likert 中点（值 − LIKERT_MID 再乘权重）
  var LIKERT_MID = 3;
  // 分享编码版本号（改动维度或编码方式时递增）
  var CODE_VERSION = '1';
  /* =========================================== */

  var HEART = ['h_tan', 'h_chen', 'h_chi'];
  var MOUTH = ['m_rou', 'm_cu', 'm_chi'];
  var VIRTUE = ['v_xin', 'v_jin', 'v_hui', 'v_zhi', 'v_yi'];
  var CONTEXTS = ['normal', 'stress'];

  // 心性类型映射
  var HEART_SINGLE = { h_tan: 1, h_chen: 2, h_chi: 3 };
  var HEART_PAIR = { 'h_chen|h_tan': 4, 'h_chi|h_tan': 5, 'h_chen|h_chi': 6 };
  // 口心类型映射：口业 × 心性（婬, 怒, 癡, 三毒）
  var MOUTH_HEART = {
    m_rou: { h_tan: 8, h_chen: 9, h_chi: 10, san: 11 },
    m_cu: { h_tan: 12, h_chen: 13, h_chi: 14, san: 15 },
    m_chi: { h_tan: 16, h_chen: 17, h_chi: 18, san: 19 }
  };

  function questionList(questions) {
    if (!questions) return [];
    if (Array.isArray(questions)) return questions;
    return questions.questions || [];
  }

  function ctxOf(q) {
    return q.context === 'stress' ? 'stress' : 'normal';
  }

  // 单题对各维度的贡献；value 为空时返回 null
  function contribution(q, value) {
    if (value === undefined || value === null || value === '') return null;
    var out = {};
    if (q.format === 'choice') {
      var opt = q.options && q.options[Number(value)];
      if (!opt) return null;
      var w = opt.weights || {};
      Object.keys(w).forEach(function (d) { out[d] = Number(w[d]) || 0; });
    } else {
      var v = Number(value);
      if (!(v >= 1 && v <= 5)) return null;
      var sign = q.reverse ? -1 : 1;
      var ws = q.weights || {};
      Object.keys(ws).forEach(function (d) { out[d] = (v - LIKERT_MID) * ws[d] * sign; });
    }
    return out;
  }

  // 单题对各维度可能的最小 / 最大贡献
  function range(q) {
    var r = {};
    if (q.format === 'choice') {
      var dims = {};
      (q.options || []).forEach(function (o) {
        Object.keys(o.weights || {}).forEach(function (d) { dims[d] = true; });
      });
      Object.keys(dims).forEach(function (d) {
        var vals = (q.options || []).map(function (o) { return Number((o.weights || {})[d]) || 0; });
        r[d] = [Math.min.apply(null, vals), Math.max.apply(null, vals)];
      });
    } else {
      var ws = q.weights || {};
      Object.keys(ws).forEach(function (d) {
        var lo = (1 - LIKERT_MID) * ws[d], hi = (5 - LIKERT_MID) * ws[d];
        if (q.reverse) { var t = -lo; lo = -hi; hi = t; }
        r[d] = [Math.min(lo, hi), Math.max(lo, hi)];
      });
    }
    return r;
  }

  /*
   * 原始分与归一化。min/max 逐题累加：若题目全部作答，即为题库对该维度的
   * 理论最小 / 最大值；若有未答题，只累加已答题，避免未答题把分数拉偏。
   */
  function rawScores(answers, questions) {
    var acc = {};
    CONTEXTS.forEach(function (c) { acc[c] = {}; });
    questionList(questions).forEach(function (q) {
      var c = ctxOf(q);
      var contrib = contribution(q, answers ? answers[q.id] : undefined);
      if (!contrib) return;
      var rg = range(q);
      Object.keys(rg).forEach(function (d) {
        var a = acc[c][d] || (acc[c][d] = { raw: 0, min: 0, max: 0, n: 0 });
        a.raw += contrib[d] || 0;
        a.min += rg[d][0];
        a.max += rg[d][1];
        a.n += 1;
      });
    });
    return acc;
  }

  function normalize(a) {
    if (!a || a.max === a.min) return null;
    var s = (a.raw - a.min) / (a.max - a.min) * 100;
    return Math.round(Math.max(0, Math.min(100, s)));
  }

  function pick(acc, keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = normalize(acc[k]); });
    return o;
  }

  function val(x) { return typeof x === 'number' && isFinite(x) ? x : -1; }

  /*
   * 取最高项。分数是 0–100 的整数，并列并不罕见（"压力下"题目少，尤其常见）。
   * 并列时先比另一情境（alt：平时↔压力下）同一维度的分数，仍并列才按 keys 顺序取前者，
   * 避免固定偏向排在前面的维度（婬 / 口柔）。alt 也来自分享编码，结果仍可复现。
   */
  function argmax(scores, keys, alt) {
    var best = null;
    keys.forEach(function (k) {
      if (best === null) { best = k; return; }
      var d = val(scores[k]) - val(scores[best]);
      if (d > 0 || (d === 0 && alt && val(alt[k]) > val(alt[best]))) best = k;
    });
    return best;
  }

  // 最高项是否只能靠 keys 顺序决出（两种情境的分数都完全并列）
  function tiedByOrder(scores, keys, alt) {
    var best = argmax(scores, keys, alt);
    return keys.some(function (k) {
      return k !== best && val(scores[k]) === val(scores[best]) && (!alt || val(alt[k]) === val(alt[best]));
    });
  }

  // 突出集合 E：与最高分相差不超过 GAP、且不低于 FLOOR；都不到门槛时取最高的一项
  function elevatedSet(H, alt) {
    var top = Math.max.apply(null, HEART.map(function (k) { return val(H[k]); }));
    var E = HEART.filter(function (k) {
      return val(H[k]) >= top - GAP && val(H[k]) >= FLOOR;
    });
    if (!E.length) E = [argmax(H, HEART, alt)];
    return E;
  }

  function hasAny(o, keys) {
    return !!o && keys.some(function (k) { return typeof o[k] === 'number' && isFinite(o[k]); });
  }

  function heartTypeOf(H, alt) {
    if (!hasAny(H, HEART)) return null;
    var E = elevatedSet(H, alt);
    if (E.length === 1) return HEART_SINGLE[E[0]];
    if (E.length === 2) return HEART_PAIR[E.slice().sort().join('|')];
    return 7;
  }

  // 口心类型：口业最高项 × 心性（三毒俱突出→三毒；否则取突出集合中最高的一毒）
  function mouthHeartTypeOf(H, M, altH, altM) {
    if (!hasAny(H, HEART) || !hasAny(M, MOUTH)) return null;
    var E = elevatedSet(H, altH);
    var heartKey = E.length === 3 ? 'san' : argmax(H, E, altH);
    var mouthKey = argmax(M, MOUTH, altM);
    return MOUTH_HEART[mouthKey][heartKey];
  }

  /*
   * 心性 / 口心类型是否有一部分是按固定顺序硬选出来的（例如全选"说不准"、情境题全选中性项，
   * 三毒分数完全相同）。这时结果没有区分度，页面可据此提示"答案缺乏区分度，类型仅按默认顺序给出"。
   */
  function tieInfo(H, M, altH, altM) {
    if (!hasAny(H, HEART)) return { heart: false, mouth: false };
    var E = elevatedSet(H, altH);
    var heartTie = E.length === 1 && tiedByOrder(H, HEART, altH);
    var pairTie = E.length === 2 && tiedByOrder(H, E, altH);
    return {
      heart: heartTie,
      mouth: hasAny(M, MOUTH) ? (heartTie || pairTie || tiedByOrder(M, MOUTH, altM)) : false
    };
  }

  // 由分数（0–100）推出全部类型；分享链接解码后也走这里，保证结果可复现
  function fromScores(s) {
    var stress = s.stress || {};
    var heartType = heartTypeOf(s.heart, stress.heart);
    var stressHeartType = heartTypeOf(stress.heart, s.heart);
    return {
      heart: s.heart,
      mouth: s.mouth,
      virtues: s.virtues,
      stress: { heart: stress.heart, mouth: stress.mouth },
      heartType: heartType,
      mouthHeartType: mouthHeartTypeOf(s.heart, s.mouth, stress.heart, stress.mouth),
      stressHeartType: stressHeartType,
      stressMouthHeartType: mouthHeartTypeOf(stress.heart, stress.mouth, s.heart, s.mouth),
      elevated: heartType ? elevatedSet(s.heart, stress.heart) : [],
      stressElevated: stressHeartType ? elevatedSet(stress.heart, s.heart) : [],
      // 类型因分数完全并列而按固定顺序决出（true 时结果缺乏区分度）
      tie: tieInfo(s.heart, s.mouth, stress.heart, stress.mouth),
      stressTie: tieInfo(stress.heart, stress.mouth, s.heart, s.mouth)
    };
  }

  function score(answers, questions) {
    var acc = rawScores(answers || {}, questions);
    return fromScores({
      heart: pick(acc.normal, HEART),
      mouth: pick(acc.normal, MOUTH),
      virtues: pick(acc.normal, VIRTUE),
      stress: { heart: pick(acc.stress, HEART), mouth: pick(acc.stress, MOUTH) }
    });
  }

  /* ---------- 分享编码：只含分数，不含逐题答案 ---------- */
  var CODE_ORDER = [
    ['heart', HEART], ['mouth', MOUTH], ['virtues', VIRTUE],
    ['stress.heart', HEART], ['stress.mouth', MOUTH]
  ];

  function getPath(o, p) {
    return p.split('.').reduce(function (x, k) { return x ? x[k] : undefined; }, o);
  }

  function encode(result) {
    var s = CODE_VERSION;
    CODE_ORDER.forEach(function (item) {
      var obj = getPath(result, item[0]) || {};
      item[1].forEach(function (k) {
        var v = obj[k];
        s += (typeof v === 'number' && isFinite(v)) ? ('0' + Math.round(v).toString(16)).slice(-2) : 'zz';
      });
    });
    return s;
  }

  function decode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();
    var need = 1 + CODE_ORDER.reduce(function (n, it) { return n + it[1].length * 2; }, 0);
    if (code.length !== need || code.charAt(0) !== CODE_VERSION) return null;
    var pos = 1, out = { stress: {} }, ok = true;
    CODE_ORDER.forEach(function (item) {
      var obj = {};
      item[1].forEach(function (k) {
        var chunk = code.substr(pos, 2); pos += 2;
        if (chunk === 'zz') { obj[k] = null; return; }
        if (!/^[0-9a-f]{2}$/.test(chunk)) { ok = false; return; }
        var v = parseInt(chunk, 16);
        if (v > 100) ok = false;
        obj[k] = v;
      });
      if (item[0].indexOf('stress.') === 0) out.stress[item[0].slice(7)] = obj;
      else out[item[0]] = obj;
    });
    if (!ok) return null;
    return fromScores(out);
  }

  return {
    GAP: GAP,
    FLOOR: FLOOR,
    HEART: HEART,
    MOUTH: MOUTH,
    VIRTUE: VIRTUE,
    score: score,
    fromScores: fromScores,
    heartTypeOf: heartTypeOf,
    mouthHeartTypeOf: mouthHeartTypeOf,
    elevatedSet: elevatedSet,
    contribution: contribution,
    range: range,
    encode: encode,
    decode: decode
  };
});
