/*
 * 十九种人 · 计分模块（UMD：浏览器挂在 window.Scoring，node 下 module.exports）
 *
 * 答案格式 answers：{ 题号: 值 }，两种写法都接受：
 *   旧格式：likert 题为 1–5；choice 题为所选选项的下标（从 0 开始）
 *   新格式：{ v: 值, text: '写下的真实反应' }
 *           v 为 1–5（likert）、选项下标（choice）、'none'（以上都不像我）或 null（跳过）
 * 计分只看 v；text 不参与计分，也不进分享编码。
 * 选了 none 选项（"以上都不像我"）一律当作未答：不计分，也不计入该维度的 min/max 归一化。
 *
 * score(answers, questions, options)
 *   options.mode：'full'（默认）或 'short'
 *   options.ids ：只计这些题号；mode 为 'short' 且未给 ids 时，取 questions.versions.short.ids
 *   简洁版只计"平时"题，不做压力对比（stress 分数全为 null）。
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
  // 可信度：已答少于 CONF_MIN_N 题或比例低于 CONF_LOW 为"低"；
  //         已答不少于 CONF_FULL_N 题且比例不低于 CONF_FULL 为"足"；其余为"中"
  var CONF_MIN_N = 2;
  var CONF_LOW = 0.5;
  var CONF_FULL_N = 3;
  var CONF_FULL = 0.8;
  // 分享编码版本号（改动维度或编码方式时递增）。v2 加入测评版本与低可信标记；decode 仍兼容 v1。
  var CODE_VERSION = '2';
  /* =========================================== */

  var HEART = ['h_tan', 'h_chen', 'h_chi'];
  var MOUTH = ['m_rou', 'm_cu', 'm_chi'];
  var VIRTUE = ['v_xin', 'v_jin', 'v_hui', 'v_zhi', 'v_yi'];
  var CONTEXTS = ['normal', 'stress'];
  // 每个情境报告的维度（压力下只有心性与口业）
  var CTX_DIMS = { normal: HEART.concat(MOUTH, VIRTUE), stress: HEART.concat(MOUTH) };

  var CONF = { LOW: '低', MID: '中', FULL: '足' };

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

  function isNoneOption(o) {
    return !!o && o.none === true;
  }

  // 从答案中取出计分值 v（兼容旧格式的裸值与新格式的 {v, text}）
  function answerValue(a) {
    if (a !== null && typeof a === 'object') return a.v;
    return a;
  }

  // 该值是否表示"以上都不像我"：v 为 'none'，或下标指向 none 选项
  function isNone(q, value) {
    var v = answerValue(value);
    if (v === 'none') return true;
    if (!q || q.format !== 'choice' || v === undefined || v === null || v === '') return false;
    return isNoneOption(q.options && q.options[Number(v)]);
  }

  // 单题对各维度的贡献；未答、跳过、选 none 或值非法时返回 null
  function contribution(q, value) {
    var v0 = answerValue(value);
    if (v0 === undefined || v0 === null || v0 === '' || v0 === 'none') return null;
    if (typeof v0 !== 'number' && typeof v0 !== 'string') return null;
    var out = {};
    if (q.format === 'choice') {
      var idx = Number(v0);
      if (!(idx >= 0) || Math.floor(idx) !== idx) return null;
      var opt = q.options && q.options[idx];
      if (!opt || isNoneOption(opt)) return null;
      var w = opt.weights || {};
      Object.keys(w).forEach(function (d) { out[d] = Number(w[d]) || 0; });
    } else {
      var v = Number(v0);
      if (!(v >= 1 && v <= 5)) return null;
      var sign = q.reverse ? -1 : 1;
      var ws = q.weights || {};
      Object.keys(ws).forEach(function (d) { out[d] = (v - LIKERT_MID) * ws[d] * sign; });
    }
    return out;
  }

  // 单题对各维度可能的最小 / 最大贡献（none 选项不参与）
  function range(q) {
    var r = {};
    if (q.format === 'choice') {
      var opts = (q.options || []).filter(function (o) { return o && !isNoneOption(o); });
      var dims = {};
      opts.forEach(function (o) {
        Object.keys(o.weights || {}).forEach(function (d) { dims[d] = true; });
      });
      Object.keys(dims).forEach(function (d) {
        var vals = opts.map(function (o) { return Number((o.weights || {})[d]) || 0; });
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

  // 简洁版题号：questions.versions.short.ids
  function shortIds(questions) {
    var v = questions && !Array.isArray(questions) && questions.versions;
    var ids = v && v.short && v.short.ids;
    return Array.isArray(ids) ? ids.slice() : null;
  }

  // 按 mode / ids 选出本次计分范围内的题
  function scopeOf(questions, options) {
    options = options || {};
    var mode = options.mode === 'short' ? 'short' : 'full';
    var ids = Array.isArray(options.ids) ? options.ids : (mode === 'short' ? shortIds(questions) : null);
    var set = null;
    if (ids) { set = {}; ids.forEach(function (id) { set[id] = true; }); }
    var list = questionList(questions).filter(function (q) {
      if (!q) return false;
      if (set && !set[q.id]) return false;
      // 简洁版不做压力对比
      if (mode === 'short' && ctxOf(q) === 'stress') return false;
      return true;
    });
    return { mode: mode, list: list };
  }

  /*
   * 原始分与归一化。min/max 逐题累加：若题目全部作答，即为题库对该维度的
   * 理论最小 / 最大值；若有未答题（含跳过、选 none），只累加已答题，避免未答题把分数拉偏。
   * 同时统计每个维度、每个情境的总题数 total 与已答题数 n。
   */
  function rawScores(answers, list) {
    var acc = {}, stat = { answered: 0, skipped: 0, none: 0 };
    CONTEXTS.forEach(function (c) { acc[c] = {}; });
    list.forEach(function (q) {
      var c = ctxOf(q);
      var value = answers ? answers[q.id] : undefined;
      var rg = range(q);
      var contrib = contribution(q, value);
      Object.keys(rg).forEach(function (d) {
        var a = acc[c][d] || (acc[c][d] = { raw: 0, min: 0, max: 0, n: 0, total: 0 });
        a.total += 1;
        if (!contrib) return;
        a.raw += contrib[d] || 0;
        a.min += rg[d][0];
        a.max += rg[d][1];
        a.n += 1;
      });
      if (contrib) stat.answered += 1;
      else {
        stat.skipped += 1;
        if (isNone(q, value)) stat.none += 1;
      }
    });
    return { acc: acc, stat: stat };
  }

  function normalize(a) {
    if (!a || !a.n || a.max === a.min) return null;
    var s = (a.raw - a.min) / (a.max - a.min) * 100;
    return Math.round(Math.max(0, Math.min(100, s)));
  }

  function pick(acc, keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = normalize(acc[k]); });
    return o;
  }

  function confidenceOf(answered, total) {
    var ratio = total ? answered / total : 0;
    if (answered < CONF_MIN_N || ratio < CONF_LOW) return CONF.LOW;
    if (answered >= CONF_FULL_N && ratio >= CONF_FULL) return CONF.FULL;
    return CONF.MID;
  }

  // coverage[ctx][dim] = {answered, total, ratio}；confidence[ctx][dim] = '低'|'中'|'足'
  function coverageOf(acc) {
    var coverage = {}, confidence = {}, low = {};
    CONTEXTS.forEach(function (c) {
      coverage[c] = {}; confidence[c] = {}; low[c] = {};
      CTX_DIMS[c].forEach(function (d) {
        var a = acc[c][d] || { n: 0, total: 0 };
        var ratio = a.total ? Math.round(a.n / a.total * 1000) / 1000 : 0;
        coverage[c][d] = { answered: a.n, total: a.total, ratio: ratio };
        confidence[c][d] = confidenceOf(a.n, a.total);
        low[c][d] = confidence[c][d] === CONF.LOW;
      });
    });
    return { coverage: coverage, confidence: confidence, lowConfidence: low };
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

  function score(answers, questions, options) {
    var sc = scopeOf(questions, options);
    var r = rawScores(answers || {}, sc.list);
    var acc = r.acc;
    var out = fromScores({
      heart: pick(acc.normal, HEART),
      mouth: pick(acc.normal, MOUTH),
      virtues: pick(acc.normal, VIRTUE),
      stress: { heart: pick(acc.stress, HEART), mouth: pick(acc.stress, MOUTH) }
    });
    var cov = coverageOf(acc);
    out.mode = sc.mode;
    out.coverage = cov.coverage;
    out.confidence = cov.confidence;
    out.lowConfidence = cov.lowConfidence;
    out.total = sc.list.length;
    out.answered = r.stat.answered;
    out.skipped = r.stat.skipped;
    out.noneCount = r.stat.none;
    return out;
  }

  /* ---------- 分享编码：只含分数、测评版本与低可信标记，不含逐题答案与开放回答 ----------
   * v1：'1' + 17 个维度各 2 位十六进制（'zz' 表示无分数），共 35 位
   * v2：'2' + 版本字母（f 完整 / s 简洁）+ 同上 34 位分数 + 5 位十六进制低可信位图，共 41 位
   *     位图第 i 位对应 CODE_ORDER 展开后的第 i 个维度（平时心性、口业、五德，再压力下心性、口业）
   */
  var CODE_ORDER = [
    ['heart', HEART], ['mouth', MOUTH], ['virtues', VIRTUE],
    ['stress.heart', HEART], ['stress.mouth', MOUTH]
  ];
  var CODE_DIMS = []; // [[ctx, dim, path], …]
  CODE_ORDER.forEach(function (item) {
    var ctx = item[0].indexOf('stress.') === 0 ? 'stress' : 'normal';
    item[1].forEach(function (k) { CODE_DIMS.push([ctx, k, item[0]]); });
  });
  var SCORE_LEN = CODE_DIMS.length * 2;
  var MASK_LEN = Math.ceil(CODE_DIMS.length / 4);
  var MODE_CHAR = { full: 'f', short: 's' };

  function getPath(o, p) {
    return p.split('.').reduce(function (x, k) { return x ? x[k] : undefined; }, o);
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function encode(result) {
    result = result || {};
    var s = CODE_VERSION + (result.mode === 'short' ? MODE_CHAR.short : MODE_CHAR.full);
    var mask = 0;
    CODE_DIMS.forEach(function (cd, i) {
      var v = (getPath(result, cd[2]) || {})[cd[1]];
      s += isNum(v) ? ('0' + Math.max(0, Math.min(100, Math.round(v))).toString(16)).slice(-2) : 'zz';
      var lowCtx = result.lowConfidence && result.lowConfidence[cd[0]];
      // 没有可信度信息（如直接由 fromScores 得到的结果）时，只把无分数的维度标为低可信
      var low = lowCtx && typeof lowCtx[cd[1]] === 'boolean' ? lowCtx[cd[1]] : !isNum(v);
      if (low) mask += Math.pow(2, i);
    });
    s += ('0000000' + mask.toString(16)).slice(-MASK_LEN);
    return s;
  }

  function decodeScores(str) {
    var out = { stress: {} }, ok = true;
    CODE_DIMS.forEach(function (cd, i) {
      var chunk = str.substr(i * 2, 2);
      var target = cd[0] === 'stress' ? (out.stress[cd[2].slice(7)] = out.stress[cd[2].slice(7)] || {})
        : (out[cd[2]] = out[cd[2]] || {});
      if (chunk === 'zz') { target[cd[1]] = null; return; }
      if (!/^[0-9a-f]{2}$/.test(chunk)) { ok = false; return; }
      var v = parseInt(chunk, 16);
      if (v > 100) ok = false;
      target[cd[1]] = v;
    });
    return ok ? out : null;
  }

  function decode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();
    var ver = code.charAt(0), mode, scores, low;
    if (ver === '1') {
      if (code.length !== 1 + SCORE_LEN) return null;
      mode = 'full';
      scores = decodeScores(code.slice(1));
      low = null;
    } else if (ver === '2') {
      if (code.length !== 2 + SCORE_LEN + MASK_LEN) return null;
      var mc = code.charAt(1);
      if (mc === MODE_CHAR.short) mode = 'short';
      else if (mc === MODE_CHAR.full) mode = 'full';
      else return null;
      scores = decodeScores(code.slice(2, 2 + SCORE_LEN));
      var mstr = code.slice(2 + SCORE_LEN);
      if (!/^[0-9a-f]+$/.test(mstr)) return null;
      low = parseInt(mstr, 16);
      if (low >= Math.pow(2, CODE_DIMS.length)) return null;
    } else {
      return null;
    }
    if (!scores) return null;
    var res = fromScores(scores);
    res.version = Number(ver);
    res.mode = mode;
    // 分享链接里只有"是否低可信"：confidence 为 '低' 或 null（不确定是"中"还是"足"）
    res.lowConfidence = {};
    res.confidence = {};
    CONTEXTS.forEach(function (c) { res.lowConfidence[c] = {}; res.confidence[c] = {}; });
    CODE_DIMS.forEach(function (cd, i) {
      var v = (getPath(scores, cd[2]) || {})[cd[1]];
      var isLow = low === null ? !isNum(v) : Math.floor(low / Math.pow(2, i)) % 2 === 1;
      res.lowConfidence[cd[0]][cd[1]] = isLow;
      res.confidence[cd[0]][cd[1]] = isLow ? CONF.LOW : null;
    });
    res.coverage = null;
    res.total = null;
    res.answered = null;
    res.skipped = null;
    res.noneCount = null;
    return res;
  }

  return {
    GAP: GAP,
    FLOOR: FLOOR,
    CODE_VERSION: CODE_VERSION,
    HEART: HEART,
    MOUTH: MOUTH,
    VIRTUE: VIRTUE,
    CONTEXTS: CONTEXTS,
    CONFIDENCE: CONF,
    score: score,
    fromScores: fromScores,
    heartTypeOf: heartTypeOf,
    mouthHeartTypeOf: mouthHeartTypeOf,
    elevatedSet: elevatedSet,
    contribution: contribution,
    range: range,
    answerValue: answerValue,
    isNone: isNone,
    shortIds: shortIds,
    confidenceOf: confidenceOf,
    encode: encode,
    decode: decode
  };
});
