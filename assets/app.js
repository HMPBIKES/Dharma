/*
 * 十九种人 · 单页应用
 * 依赖：data/*.js（window.QUESTIONS / TYPES / PRACTICES / VIRTUES / ABOUT / TEACHINGS / AI_CONTENT）、
 *       assets/config.js（window.SITE_CONFIG）与 assets/scoring.js（window.Scoring）
 * 无框架、无外部库；hash 路由，file:// 直接打开也能用。
 * 路由：#/quiz 选择版本；#/quiz/short 简洁版；#/quiz/full 完整版（两版按题号共用答案）。
 */
(function () {
  'use strict';

  /* ================= 基础 ================= */
  var QDATA = window.QUESTIONS || { questions: [], sections: [], scale: {} };
  var QUESTIONS = QDATA.questions || [];
  var TYPES = window.TYPES || [];
  var PRACTICES = window.PRACTICES || [];
  var VIRTUES = window.VIRTUES || [];
  var ABOUT = window.ABOUT || {};
  var S = window.Scoring;

  var TYPE = {}; TYPES.forEach(function (t) { TYPE[t.id] = t; });
  var PRACTICE = {}; PRACTICES.forEach(function (p) { PRACTICE[p.id] = p; });
  var VIRTUE = {}; VIRTUES.forEach(function (v) { VIRTUE[v.id] = v; });
  var SECTION = {}; (QDATA.sections || []).forEach(function (s) { SECTION[s.id] = s; });

  // 法师宜说之法 / 书单
  var TEACH = window.TEACHINGS || { intro: null, themes: [], cards: [], card_aliases: {}, types: {} };
  var CARDS = TEACH.cards || [];
  var CARD = {}; CARDS.forEach(function (c) { CARD[c.id] = c; });
  var CARD_ALIAS = TEACH.card_aliases || {};
  var THEMES = TEACH.themes || [];
  var THEME = {}; THEMES.forEach(function (th) { THEME[th.key] = th; });
  var CARD_TYPES = {};   // 书卡 id → 把它列入书单的类型编号
  for (var tn = 1; tn <= 19; tn++) {
    ((TEACH.types || {})[tn] && TEACH.types[tn].readings || []).forEach(function (r) {
      (CARD_TYPES[r.id] = CARD_TYPES[r.id] || []).push(tn);
    });
  }

  // AI 深度分析（data/ai.js）与站点配置（assets/config.js）
  var AI = window.AI_CONTENT || null;
  var CONFIG = window.SITE_CONFIG || {};
  var AI_ENDPOINT = typeof CONFIG.aiEndpoint === 'string' && /^https?:\/\/\S+$/.test(CONFIG.aiEndpoint.trim()) ? CONFIG.aiEndpoint.trim() : '';
  var AI_TIMEOUT = 150 * 1000;
  var MAX_TEXT = (AI && AI.limits && AI.limits.max_chars_per_answer) || 800;

  // 测评版本：full = 全部题；short = questions.versions.short.ids（只有“平时”题，不做压力对比）
  var VERSIONS = QDATA.versions || {};
  var QBYID = {}; QUESTIONS.forEach(function (q) { QBYID[q.id] = q; });
  var SHORT_LIST = (function () {
    var ids = VERSIONS.short && Array.isArray(VERSIONS.short.ids) ? VERSIONS.short.ids : [];
    return ids.map(function (id) { return QBYID[id]; }).filter(function (q) { return q && q.context !== 'stress'; });
  })();
  var MODES = SHORT_LIST.length ? ['short', 'full'] : ['full'];
  var MODE_TITLE = {
    short: (VERSIONS.short && VERSIONS.short.title) || '简洁版',
    full: (VERSIONS.full && VERSIONS.full.title) || '完整版'
  };

  var STORE_QUIZ = 'shijiuzhong.quiz.v1';
  var STORE_TEXT = 'shijiuzhong.texts.v1';   // 情境题下写的“真实反应”：只存在本机，不进分享链接
  var STORE_LAST = 'shijiuzhong.last';
  var STORE_THEME = 'shijiuzhong.theme';
  var STORE_RFILTER = 'shijiuzhong.readings.filter';

  var SUTRA_CITE = '《修行道地经》卷二〈分别相品第八〉，CBETA T15n0606';

  var DIM_LABEL = {
    h_tan: '贪婬', h_chen: '瞋恚', h_chi: '愚痴',
    m_rou: '口柔', m_cu: '口粗', m_chi: '口痴',
    v_xin: '信', v_jin: '精进', v_hui: '智慧', v_zhi: '质直', v_yi: '有志',
    xin: '信', jin: '精进', hui: '智慧', zhi: '质直', yi: '有志'
  };
  var DIM_HINT = {
    h_tan: '爱美好饰、柔和多慈、易喜易忧',
    h_chen: '刚强能忍、怒难解、记仇多疑',
    h_chi: '犹疑昏沉、取舍颠倒、难自作主',
    m_rou: '说话柔和顺耳',
    m_cu: '说话直、急、冲',
    m_chi: '说话不了了、听不懂人意'
  };
  var MATRIX = [
    { key: 'm_rou', label: '口柔', ids: [8, 9, 10, 11] },
    { key: 'm_cu', label: '口粗', ids: [12, 13, 14, 15] },
    { key: 'm_chi', label: '口痴', ids: [16, 17, 18, 19] }
  ];
  var MATRIX_COLS = ['心婬（心软重情）', '心怒', '心癡', '心怀三毒'];

  function storageGet(key) {
    try {
      var v = window.localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function storageDel(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // CBETA 私用区罕用字（补充私用区 A/B）：原样保留，加注
  var PUA_RE = /[\uDB80-\uDBFF][\uDC00-\uDFFF]|[-]/g;
  // 已知罕用字：CBETA 组字式与 Unicode 通用字（只作屏幕上的注记，用 CSS ::after 显示，不进入复制的文字）
  var PUA_INFO = {
    '\uDB80\uDE55': { comp: '[麩-夫+黃]', uni: '\u4D43' }   // U+F0255，CB00597
  };
  function markPua(html) {
    return html.replace(PUA_RE, function (c) {
      var info = PUA_INFO[c];
      var title = 'CBETA 罕用字（私用区字符，依原样保留，多数字体无法显示）' +
        (info ? '；组字式 ' + info.comp + '，Unicode 通用字 ' + info.uni : '');
      return '<span class="pua" title="' + title + '"' + (info ? ' data-note="' + info.uni + '"' : '') + '>' + c + '</span>';
    });
  }
  // 普通文字：转义、罕用字加注、「」内引文用衬线体、换行
  function txt(s) {
    var h = esc(s).replace(/「([^「」]*)」/g, '「<span class="quote-inline">$1</span>」');
    h = markPua(h);   // 罕用字最后处理，免得注记属性里的文字再被替换
    return h.replace(/\n/g, '<br>');
  }
  // 经文原文
  function sutra(s) { return '<span lang="zh-Hant">' + markPua(esc(s)) + '</span>'; }
  // 偈颂：原文无换行时，在句号、分号后断行，便于阅读（不改动字）
  function verse(s) {
    s = String(s || '');
    if (s.indexOf('\n') < 0) s = s.replace(/([；。])(?=.)/g, '$1\n');
    return markPua(esc(s));
  }
  function tag(explicit) {
    return explicit
      ? '<span class="tag tag-explicit">经文明说</span>'
      : '<span class="tag tag-derived">依经文通则推出</span>';
  }
  var ANCIENT = '<span class="ancient-note">古代印度观念，仅供了解</span>';

  // 现代修行建议：拆成条目（支持“1. … 2. …”与“① … ②”两种写法）
  function splitAdvice(s) {
    s = String(s || '').trim();
    if (!s) return [];
    var parts;
    if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(s)) {
      parts = s.split(/[①②③④⑤⑥⑦⑧⑨⑩]/);
    } else {
      parts = s.replace(/(^|[。！？；）\s])(\d{1,2})\.(?!\d)\s*/g, '$1\u0000').split('\u0000');
    }
    parts = parts.map(function (p) { return p.trim(); }).filter(Boolean);
    return parts.length ? parts : [s];
  }

  function typeById(n) { return TYPE[Number(n)]; }
  function typeNumLabel(n) { return '第 ' + n + ' 种'; }
  function groupLabel(t) { return t.group === 'heart' ? '心性类型' : '口心类型'; }

  function practiceChips(ids, derivedIds) {
    if (!ids || !ids.length) return '';
    derivedIds = derivedIds || [];
    return '<ul class="practice-links">' + ids.map(function (id) {
      var p = PRACTICE[id];
      if (!p) return '';
      var d = derivedIds.indexOf(id) >= 0;
      return '<li><a class="chip" href="#/practice/' + esc(id) + '">' + esc(p.name) +
        (d ? ' <span class="tag tag-derived" title="此项搭配依经文通则推出">推</span>' : '') + '</a></li>';
    }).join('') + '</ul>';
  }

  /* ================= 主题 ================= */
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function effectiveTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return mqDark && mqDark.matches ? 'dark' : 'light';
  }
  function updateThemeButton() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var cur = effectiveTheme();
    btn.setAttribute('aria-label', cur === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    btn.setAttribute('title', cur === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  }
  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { window.localStorage.setItem(STORE_THEME, next); } catch (e) { /* 忽略 */ }
        updateThemeButton();
      });
    }
    if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', updateThemeButton);
    updateThemeButton();
  }

  /* ================= 浮动提示（图表悬停 / 键盘聚焦） ================= */
  var tipEl = null;
  function initTooltip() {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    function show(target, x, y) {
      var v = target.getAttribute('data-tip-value');
      var l = target.getAttribute('data-tip-label');
      tipEl.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = v;
      var span = document.createElement('span');
      span.textContent = l;
      tipEl.appendChild(strong);
      tipEl.appendChild(span);
      tipEl.hidden = false;
      var r = tipEl.getBoundingClientRect();
      var left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
      var top = y - r.height - 12;
      if (top < 8) top = y + 16;
      tipEl.style.left = left + 'px';
      tipEl.style.top = top + 'px';
    }
    function find(e) { return e.target && e.target.closest ? e.target.closest('[data-tip-value]') : null; }
    document.addEventListener('pointermove', function (e) {
      var t = find(e);
      if (t) show(t, e.clientX, e.clientY); else tipEl.hidden = true;
    });
    document.addEventListener('focusin', function (e) {
      var t = find(e);
      if (!t) { tipEl.hidden = true; return; }
      var r = t.getBoundingClientRect();
      show(t, r.left + r.width / 2, r.top);
    });
    document.addEventListener('focusout', function () { tipEl.hidden = true; });
    window.addEventListener('scroll', function () { tipEl.hidden = true; }, { passive: true });
  }

  /* ================= 路由 ================= */
  var app;
  var firstRender = true;   // 首次载入不抢焦点，让键盘用户从“跳到正文”与导航开始
  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { name: parts[0] || 'home', arg: parts[1] };
  }
  var NAV_OF = { home: 'home', quiz: 'quiz', result: 'quiz', types: 'types', type: 'types', practices: 'practices', practice: 'practices', readings: 'readings', virtues: 'virtues', about: 'about' };

  function render() {
    var r = parseRoute();
    var view = VIEWS[r.name] || viewNotFound;
    if (r.name !== 'quiz') quizKeysOff();
    var out = view(r.arg) || {};
    app.innerHTML = '<div class="wrap">' + (out.html || '') + '</div>';
    document.title = (out.title ? out.title + ' · ' : '') + (ABOUT.site_title || '十九种人');
    var nav = NAV_OF[r.name];
    Array.prototype.forEach.call(document.querySelectorAll('.site-nav a'), function (a) {
      if (a.getAttribute('data-nav') === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (out.after) out.after();
    if (!out.keepScroll) window.scrollTo(0, 0);
    if (!out.noFocus && !firstRender) {
      var h1 = app.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); try { h1.focus({ preventScroll: true }); } catch (e) { h1.focus(); } }
    }
    firstRender = false;
  }

  /* ================= 首页 ================= */
  function viewHome() {
    ensureQuiz();
    var last = storageGet(STORE_LAST);
    var lastValid = typeof last === 'string' && S && S.decode(last);
    var q = (ABOUT.closing && ABOUT.closing.quotes && ABOUT.closing.quotes[1]) || null;
    var pending = pendingMode();
    var actions = '';
    if (pending) {
      var ps = stats(modeList(pending));
      actions += '<a class="btn btn-primary" href="#/quiz/' + pending + '">继续' + esc(MODE_TITLE[pending]) + '（已答 ' + ps.answered + ' / ' + ps.n + '）</a>';
    }
    if (lastValid) actions += '<a class="btn btn-ghost" href="#/result/' + esc(last) + '">查看上次结果</a>';

    var html =
      '<section class="hero">' +
        '<svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 8a24 24 0 1 0 23 17" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3.5" fill="currentColor"/></svg>' +
        '<h1>' + esc(ABOUT.site_title || '十九种人') + '</h1>' +
        '<p class="tagline">' + esc(ABOUT.tagline || '') + '</p>' +
        (actions ? '<div class="btn-row">' + actions + '</div>' : '') +
      '</section>' +
      '<section class="section" aria-labelledby="pick-h"><h2 id="pick-h" class="pick-title">选择测评版本</h2>' + versionCards('h3') + '</section>' +
      '<section class="section"><p class="lead">' + txt(ABOUT.home_intro || '') + '</p></section>' +
      (q ? '<blockquote class="sutra quote-card">' + sutra(q.quote) + '<span class="cite">' + esc(q.pin) + '</span></blockquote>' : '') +
      '<section class="section"><h2>测评怎样分类</h2><p>' + txt(ABOUT.how_it_works || '') + '</p></section>' +
      '<section class="section"><h2>从这里开始了解</h2><div class="grid-cards">' +
        homeCard('#/types', '十九种人', '心性七型 × 口心十二型的经文原文与白话') +
        homeCard('#/practices', '修行法', '不净观、慈心、十二因缘、数息等 ' + PRACTICES.length + ' 种对治方法') +
        (CARDS.length ? homeCard('#/readings', '书单', '法师宜说之法：按类型推荐的 ' + CARDS.length + ' 部经论选段') : '') +
        homeCard('#/virtues', '五德', '信、精进、智慧、质直、有志') +
        homeCard('#/about', '关于与免责声明', '经文出处、测评的局限、AI 分析与隐私') +
      '</div></section>';
    return { html: html, title: '', after: bindRestart };
  }
  function homeCard(href, t, d) {
    return '<a class="mini-card" href="' + href + '"><div class="t">' + esc(t) + '</div><div class="d">' + esc(d) + '</div></a>';
  }

  // 两个版本的入口卡片（首页与 #/quiz 共用）
  var MODE_GETS = {
    short: ['心性类型与口心类型（大致倾向）', '三毒、口业分数与五德雷达图', '对症的修行法与书单', '可选：AI 深度分析'],
    full: ['心性类型与口心类型', '三毒、口业分数与五德雷达图', '平时与压力下的对比', '对症的修行法与书单', '可选：AI 深度分析']
  };
  function versionCards(H) {
    H = H || 'h2';
    var cards = MODES.map(function (m) {
      var V = VERSIONS[m] || {};
      var st = stats(modeList(m));
      var started = st.answered + st.skipped > 0;
      var label = !started ? '开始' + MODE_TITLE[m]
        : (st.todo === 0 ? '回到' + MODE_TITLE[m] + '小结' : '继续' + MODE_TITLE[m] + '（已答 ' + st.answered + ' / ' + st.n + '）');
      return '<article class="version-card' + (m === 'short' ? ' is-short' : '') + '">' +
        '<' + H + ' class="version-title">' + esc(MODE_TITLE[m]) + '</' + H + '>' +
        '<p class="version-meta">共 ' + st.n + ' 题 · 约 ' + esc(V.est_minutes || (m === 'short' ? 10 : 25)) + ' 分钟' +
          (m === 'full' ? ' · 含压力下的对比' : ' · 不含压力对比') + '</p>' +
        (V.intro ? '<p class="version-intro">' + txt(V.intro) + '</p>' : '') +
        '<p class="block-label">你会得到</p><ul class="version-gets">' + MODE_GETS[m].map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' +
        '<a class="btn ' + (m === 'short' ? 'btn-primary' : '') + ' version-go" href="#/quiz/' + m + '">' + esc(label) + '</a>' +
      '</article>';
    }).join('');
    return '<div class="version-cards">' + cards + '</div>' +
      '<p class="small muted version-note">两版共用答案：做完简洁版后再做完整版，已答的题会保留，只需补答其余的题。答案和你写下的文字只保存在你自己的浏览器里。' +
      (hasAnyAnswer() ? ' <button type="button" class="btn btn-ghost btn-small" data-act="restart">清空答案，重新开始</button>' : '') + '</p>';
  }
  function bindRestart() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-act="restart"]'), function (b) {
      b.addEventListener('click', function () {
        if (hasAnyAnswer() && !window.confirm('确定清空全部答案和你写下的真实反应，重新开始吗？')) return;
        resetQuiz();
        if (parseRoute().name === 'quiz') render(); else location.hash = '#/quiz';
      });
    });
  }

  /* ================= 答题 =================
   * quiz = { answers: {题号: 值}, pos: {short: n, full: n}, mode: 'short'|'full'|null }
   *   值：likert 为 1–5；choice 为选项下标（含最后的“以上都不像我”）；null 表示跳过；未答则没有这个键。
   *   两个版本共用 answers（按题号），各自记住答到第几题（pos 等于题数时显示小结）。
   * texts = {题号: '真实反应'}，单独存放（STORE_TEXT），不参与计分，也不进分享链接。
   */
  var quiz = null;
  var texts = {};
  var advanceTimer = null;
  var keyHandler = null;
  var textTimer = null;
  var lastCode = null;   // 本次打开页面后算出的结果码（浏览器禁用存储时也能认出“本机刚测出的结果”）

  function isValidValue(q, v) {
    if (v === null) return true;
    if (typeof v !== 'number' || Math.floor(v) !== v) return false;
    return q.format === 'choice' ? v >= 0 && v < (q.options || []).length : v >= 1 && v <= 5;
  }
  function ensureQuiz() {
    if (quiz) return quiz;
    quiz = { answers: {}, pos: {}, mode: null };
    var s = storageGet(STORE_QUIZ);
    if (s && typeof s === 'object' && s.answers && typeof s.answers === 'object') {
      var legacy = !s.pos;   // 第一版只存 index；那时的情境题选项已改写，旧的选项下标不再对应，只保留 likert 题
      Object.keys(s.answers).forEach(function (id) {
        var q = QBYID[id];
        if (!q || (legacy && q.format === 'choice')) return;
        var v = S.answerValue(s.answers[id]);
        if (isValidValue(q, v)) quiz.answers[id] = v;
      });
      if (s.pos && typeof s.pos === 'object') {
        MODES.forEach(function (m) { if (typeof s.pos[m] === 'number') quiz.pos[m] = s.pos[m]; });
      }
      if (s.mode === 'short' || s.mode === 'full') quiz.mode = MODES.indexOf(s.mode) >= 0 ? s.mode : 'full';
      else if (legacy && Object.keys(quiz.answers).length) quiz.mode = 'full';
    }
    texts = {};
    var t = storageGet(STORE_TEXT);
    if (t && typeof t === 'object') {
      Object.keys(t).forEach(function (id) {
        if (QBYID[id] && QBYID[id].format === 'choice' && typeof t[id] === 'string' && t[id].trim()) texts[id] = t[id].slice(0, MAX_TEXT);
      });
    }
    return quiz;
  }
  function saveQuiz() { if (quiz) storageSet(STORE_QUIZ, { answers: quiz.answers, pos: quiz.pos, mode: quiz.mode, v: 2 }); }
  function saveTexts() {
    if (textTimer) { clearTimeout(textTimer); textTimer = null; }
    storageSet(STORE_TEXT, texts);
  }
  function resetQuiz() {
    quiz = { answers: {}, pos: {}, mode: quiz && quiz.mode || null };
    texts = {};
    storageDel(STORE_QUIZ);
    storageDel(STORE_TEXT);
  }
  function modeList(m) { return m === 'short' && SHORT_LIST.length ? SHORT_LIST : QUESTIONS; }
  function hasText(id) { return !!(texts[id] && texts[id].trim()); }
  function hasAnyAnswer() {
    ensureQuiz();
    return Object.keys(quiz.answers).length > 0 || Object.keys(texts).length > 0;
  }
  function stats(list) {
    ensureQuiz();
    var o = { n: list.length, answered: 0, skipped: 0, todo: 0, none: 0, texts: 0 };
    list.forEach(function (q) {
      var v = quiz.answers[q.id];
      if (v === undefined) o.todo += 1;
      else if (v === null) o.skipped += 1;
      else { o.answered += 1; if (S.isNone(q, v)) o.none += 1; }
      if (q.format === 'choice' && hasText(q.id)) o.texts += 1;
    });
    return o;
  }
  // 有未完成进度的版本（优先上次在做的版本）
  function pendingMode() {
    ensureQuiz();
    var order = quiz.mode ? [quiz.mode].concat(MODES.filter(function (m) { return m !== quiz.mode; })) : MODES;
    for (var i = 0; i < order.length; i++) {
      var st = stats(modeList(order[i]));
      if (st.answered + st.skipped > 0 && st.todo > 0 && (order[i] === quiz.mode || typeof quiz.pos[order[i]] === 'number')) return order[i];
    }
    return null;
  }
  function firstTodo(list, from, includeSkipped) {
    for (var i = from || 0; i < list.length; i++) {
      var v = quiz.answers[list[i].id];
      if (v === undefined || (includeSkipped && v === null)) return i;
    }
    return -1;
  }
  // 进入某个版本：没有记录时从第一道未答题开始（都答过则直接显示小结）
  function enterMode(m, pos) {
    ensureQuiz();
    var list = modeList(m);
    quiz.mode = m;
    if (typeof pos === 'number') quiz.pos[m] = pos;
    var p = quiz.pos[m];
    if (typeof p !== 'number' || p < 0 || p > list.length || Math.floor(p) !== p) {
      var fu = firstTodo(list);
      quiz.pos[m] = fu < 0 ? list.length : fu;
    }
    saveQuiz();
  }
  function quizKeysOff() {
    flushText();
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  }
  function flushText() { if (textTimer) saveTexts(); }

  function viewQuiz(arg) {
    if (!QUESTIONS.length) return { html: '<h1>题库未载入</h1><p>请确认 data/questions.js 存在。</p>' };
    ensureQuiz();
    if (arg !== 'short' && arg !== 'full') return viewQuizPick();
    var mode = MODES.indexOf(arg) >= 0 ? arg : 'full';
    enterMode(mode);
    var focusQ = !firstRender;
    return { html: '<h1 class="sr-only">' + esc(MODE_TITLE[mode]) + '答题</h1><div class="quiz" id="quiz"></div>', title: MODE_TITLE[mode] + '答题', after: function () {
      renderQuestion(focusQ);
      quizKeysOff();
      keyHandler = onQuizKey;
      document.addEventListener('keydown', keyHandler);
    }, noFocus: true };
  }

  // #/quiz：选择版本；有未完成的进度时提示继续
  function viewQuizPick() {
    var pending = pendingMode();
    var html = '<p class="eyebrow">测评</p><h1>选择测评版本</h1>' +
      '<p class="lead">两个版本都依《修行道地经·分别相品》的“十九种人”出题，凭第一感觉作答即可。情境题如果没有符合你的选项，可以选“以上都不像我”，并写下你的真实反应；任何一题都可以跳过。</p>';
    if (pending) {
      var ps = stats(modeList(pending));
      html += '<div class="card resume-card" role="status"><p><strong>你有未完成的' + esc(MODE_TITLE[pending]) + '</strong>：已答 ' + ps.answered + ' 题' +
        (ps.skipped ? '，跳过 ' + ps.skipped + ' 题' : '') + '，还剩 ' + ps.todo + ' 题。</p>' +
        '<div class="btn-row"><a class="btn btn-primary" href="#/quiz/' + pending + '">继续答题</a></div></div>';
    }
    html += versionCards('h2');
    return { html: html, title: '选择测评版本', after: bindRestart };
  }

  function choiceHint(q) {
    return q.format === 'choice' ? ' · 选最接近的一项；都不像就选“以上都不像我”，也可以跳过' : '';
  }

  function renderQuestion(focusQ) {
    var box = document.getElementById('quiz');
    if (!box) return;
    var mode = quiz.mode || 'full';
    var list = modeList(mode);
    var total = list.length;
    var i = quiz.pos[mode];
    if (i >= total) { renderSummary(focusQ); return; }
    var q = list[i];
    var sec = SECTION[q.section] || SECTION[q.context] || { title: q.context === 'stress' ? '压力下的我' : '平时的我', intro: '' };
    var st = stats(list);
    var val = quiz.answers[q.id];
    var prevQ = list[i - 1];
    var sectionStart = !prevQ || prevQ.section !== q.section;
    var secQs = list.filter(function (x) { return x.section === q.section; });
    var secPos = secQs.indexOf(q) + 1;
    var labels = (QDATA.scale && QDATA.scale.likert_labels) || ['完全不像我', '不太像我', '说不准', '比较像我', '非常像我'];
    var isChoice = q.format === 'choice';

    var opts;
    if (isChoice) {
      opts = '<div class="choices" role="group" aria-label="选项">' + q.options.map(function (o, k) {
        var on = val === k;
        return '<button type="button" class="choice-btn' + (o.none ? ' choice-none' : '') + '" data-val="' + k + '" aria-pressed="' + on + '">' +
          '<span class="key" aria-hidden="true">' + (k + 1) + '</span><span>' + esc(o.text) + '</span></button>';
      }).join('') + '</div>' + openBox(q);
    } else {
      opts = '<div class="likert" role="group" aria-label="符合程度">' + [1, 2, 3, 4, 5].map(function (v) {
        var on = val === v;
        return '<button type="button" class="likert-btn" data-val="' + v + '" aria-pressed="' + on + '">' +
          '<span class="key" aria-hidden="true">' + v + '</span><span>' + esc(labels[v - 1]) + '</span></button>';
      }).join('') + '</div>';
    }
    var isLast = i === total - 1;
    var nextEnabled = val !== undefined || (isChoice && hasText(q.id));

    box.innerHTML =
      progressHtml(mode, st, sec.title + ' · 第 ' + secPos + ' / ' + secQs.length + ' 题') +
      '<details class="section-info"' + (sectionStart && val === undefined ? ' open' : '') + '><summary>分区说明：' + esc(sec.title) + '</summary><p>' + esc(sec.intro || '') + '</p>' +
        (q.context === 'stress' ? '<p class="small">这一部分题目较少，结果中的“压力下”分数仅作参考。</p>' : '') + '</details>' +
      '<p class="eyebrow">第 ' + (i + 1) + ' / ' + total + ' 题' + choiceHint(q) +
        (val === null ? ' · <span class="tag tag-plain">已跳过</span>' : '') + '</p>' +
      '<h2 class="q-text" id="q-text" tabindex="-1">' + esc(q.text) + '</h2>' +
      opts +
      '<div class="crisis-slot" id="crisis-slot"></div>' +
      '<p class="skip-row"><button type="button" class="link-btn" data-act="skip">' + (val === null ? '仍然跳过，去下一题' : '跳过此题') + '</button></p>' +
      '<div class="quiz-nav">' +
        '<button type="button" class="btn" data-act="prev"' + (i === 0 ? ' disabled' : '') + '>← 上一题</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-act="restart">重新开始</button>' +
        '<button type="button" class="btn' + (isChoice || isLast ? ' btn-primary' : '') + '" data-act="next"' + (nextEnabled ? '' : ' disabled') + '>' + (isLast ? '完成，看小结 →' : '下一题 →') + '</button>' +
      '</div>' +
      '<p class="kbd-hint">键盘：数字键 1–' + (isChoice ? q.options.length : 5) + ' 选择，← → 切换题目' + (isChoice ? '；在输入框里打字时快捷键不生效' : '') + '</p>';

    Array.prototype.forEach.call(box.querySelectorAll('[data-val]'), function (b) {
      b.addEventListener('click', function () { choose(Number(b.getAttribute('data-val'))); });
    });
    box.querySelector('[data-act="prev"]').addEventListener('click', prev);
    box.querySelector('[data-act="next"]').addEventListener('click', next);
    box.querySelector('[data-act="skip"]').addEventListener('click', skip);
    if (isChoice) bindOpenBox(q);
    bindRestart();
    if (focusQ) {
      var qt = document.getElementById('q-text');
      try { qt.focus({ preventScroll: true }); } catch (e) { qt.focus(); }
      window.scrollTo(0, 0);
    }
  }

  function progressHtml(mode, st, left) {
    var pa = st.n ? st.answered / st.n * 100 : 0, ps = st.n ? st.skipped / st.n * 100 : 0;
    return '<div class="progress">' +
      '<div class="progress-top"><span><span class="tag tag-mode">' + esc(MODE_TITLE[mode]) + '</span> ' + esc(left) + '</span>' +
        '<span class="progress-counts">已答 ' + st.answered + ' · 跳过 ' + st.skipped + ' · 剩余 ' + st.todo + '</span></div>' +
      '<div class="progress-bar" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="' + st.n + '" aria-valuenow="' + (st.answered + st.skipped) + '"' +
        ' aria-valuetext="共 ' + st.n + ' 题：已答 ' + st.answered + '，跳过 ' + st.skipped + '，剩余 ' + st.todo + '">' +
        '<div class="progress-fill" style="width:' + pa.toFixed(1) + '%"></div>' +
        '<div class="progress-skip" style="width:' + ps.toFixed(1) + '%"></div></div>' +
    '</div>';
  }

  // 情境题下的“写下我的真实反应”
  function openBox(q) {
    var op = q.open || { prompt: '这道题你实际会怎么做？心里是什么感觉？（选填）', placeholder: '' };
    var t = texts[q.id] || '';
    var expanded = !!t || S.isNone(q, quiz.answers[q.id]);
    return '<div class="open-box">' +
      '<button type="button" class="link-btn open-toggle" id="open-toggle" aria-expanded="' + expanded + '" aria-controls="open-panel">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm17.7-10.2a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>' +
        '<span>写下我的真实反应</span><span class="open-state" id="open-state">' + (t ? '（已写 ' + t.length + ' 字）' : '（选填）') + '</span></button>' +
      '<div class="open-panel" id="open-panel"' + (expanded ? '' : ' hidden') + '>' +
        '<label class="open-prompt" for="open-text">' + esc(op.prompt) + '</label>' +
        '<textarea id="open-text" rows="4" maxlength="' + MAX_TEXT + '" placeholder="' + esc(op.placeholder || '') + '" aria-describedby="open-count open-privacy">' + esc(t) + '</textarea>' +
        '<div class="open-foot"><span id="open-privacy">只保存在你的浏览器里，不进分享链接。</span><span class="open-count" id="open-count">' + t.length + ' / ' + MAX_TEXT + ' 字</span></div>' +
      '</div>' +
    '</div>';
  }
  function bindOpenBox(q) {
    var toggle = document.getElementById('open-toggle');
    var panel = document.getElementById('open-panel');
    var ta = document.getElementById('open-text');
    var count = document.getElementById('open-count');
    var state = document.getElementById('open-state');
    if (!toggle || !panel || !ta) return;
    toggle.addEventListener('click', function () {
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) ta.focus();
    });
    ta.addEventListener('input', function () {
      var v = ta.value;
      if (v.length > MAX_TEXT) { v = v.slice(0, MAX_TEXT); ta.value = v; }
      if (v.trim()) texts[q.id] = v; else delete texts[q.id];
      count.textContent = v.length + ' / ' + MAX_TEXT + ' 字';
      count.classList.toggle('is-near', v.length >= MAX_TEXT * 0.9);
      state.textContent = v.trim() ? '（已写 ' + v.length + ' 字）' : '（选填）';
      var nb = document.querySelector('#quiz [data-act="next"]');
      if (nb) nb.disabled = !(quiz.answers[q.id] !== undefined || v.trim());
      checkCrisis(v);
      if (textTimer) clearTimeout(textTimer);
      textTimer = setTimeout(saveTexts, 400);
    });
    ta.addEventListener('blur', flushText);
    checkCrisis(ta.value);
  }
  // 输入框里出现轻生、自伤等字词：在题目下方温和地显示求助信息，不阻止答题
  function checkCrisis(text) {
    var slot = document.getElementById('crisis-slot');
    if (!slot || !AI || !AI.detectCrisis) return;
    var hit = AI.detectCrisis(text).length > 0;
    if (hit && !slot.firstChild) slot.innerHTML = crisisHtml();
    else if (!hit && slot.firstChild) slot.innerHTML = '';
  }
  function hotlinesHtml() {
    var C = (AI && AI.crisis) || {};
    return '<ul class="hotlines">' + (C.hotlines || []).map(function (h) {
      var href = String(h.href || '');
      var safe = /^(tel:[0-9]+|https:\/\/[^\s"'<>]+)$/.test(href) ? href : '';
      var ext = /^https:/.test(safe);
      var how = esc(h.how || '');
      return '<li><span class="hl-region">' + esc(h.region || '') + '</span>' +
        '<span class="hl-body"><strong>' + esc(h.name || '') + '</strong>：' +
        (safe ? '<a href="' + esc(safe) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + how + '</a>' : how) + '</span></li>';
    }).join('') + '</ul>';
  }
  function crisisHtml(message) {
    var C = (AI && AI.crisis) || {};
    return '<aside class="crisis-box" role="status" aria-label="求助信息">' +
      (message ? '<p class="crisis-msg">' + aiText(message) + '</p>' : '') +
      '<p class="crisis-lead">' + esc(C.banner || '如果你正经历难以承受的痛苦，请先联系下面的求助资源。') + '</p>' +
      hotlinesHtml() + '</aside>';
  }

  // 下一题的去处：下一题未答就去下一题；否则去其后第一道未答题（例如做完简洁版后续做完整版时，跳过已答的题）
  function advanceTarget(list, i) {
    var nq = list[i + 1];
    if (!nq || quiz.answers[nq.id] === undefined) return i + 1;
    var fu = firstTodo(list, i + 1);
    return fu < 0 ? i + 1 : fu;
  }
  function goTo(p, focus) {
    quiz.pos[quiz.mode] = p;
    saveQuiz();
    renderQuestion(focus !== false);
  }
  function currentQ() {
    var list = modeList(quiz.mode);
    return list[quiz.pos[quiz.mode]];
  }

  function choose(v) {
    var list = modeList(quiz.mode);
    var i = quiz.pos[quiz.mode];
    var q = list[i];
    if (!q) return;
    var max = q.format === 'choice' ? q.options.length - 1 : 5;
    var min = q.format === 'choice' ? 0 : 1;
    if (!(v >= min && v <= max)) return;
    quiz.answers[q.id] = v;
    saveQuiz();
    if (q.format === 'choice') {
      // 情境题选中后不自动跳题：留时间写下真实反应，由“下一题”前进
      Array.prototype.forEach.call(document.querySelectorAll('#quiz .choice-btn'), function (b) {
        b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-val')) === v));
      });
      var nb = document.querySelector('#quiz [data-act="next"]');
      if (nb) nb.disabled = false;
      var sk = document.querySelector('#quiz [data-act="skip"]');
      if (sk) sk.textContent = '跳过此题';
      var tagEl = document.querySelector('#quiz .eyebrow .tag');
      if (tagEl) tagEl.parentNode.innerHTML = '第 ' + (i + 1) + ' / ' + list.length + ' 题' + choiceHint(q);
      if (q.options[v] && q.options[v].none) {
        var panel = document.getElementById('open-panel');
        var toggle = document.getElementById('open-toggle');
        if (panel && panel.hidden) { panel.hidden = false; if (toggle) toggle.setAttribute('aria-expanded', 'true'); }
        var ta = document.getElementById('open-text');
        if (ta) ta.focus();
      }
      return;
    }
    renderQuestion(false);
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      goTo(advanceTarget(list, i));
    }, 220);
  }
  function skip() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    flushText();
    var list = modeList(quiz.mode);
    var i = quiz.pos[quiz.mode];
    var q = list[i];
    if (!q) return;
    quiz.answers[q.id] = null;
    goTo(advanceTarget(list, i));
  }
  function prev() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    flushText();
    var i = quiz.pos[quiz.mode];
    if (i > 0) goTo(i - 1);
  }
  function next() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    flushText();
    var list = modeList(quiz.mode);
    var i = quiz.pos[quiz.mode];
    var q = list[i];
    if (!q) return;
    if (quiz.answers[q.id] === undefined) {
      if (!(q.format === 'choice' && hasText(q.id))) return;
      quiz.answers[q.id] = null;   // 只写了文字、没选选项：记为跳过（文字仍保留）
    }
    goTo(i + 1);
  }
  function onQuizKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    var t = e.target;
    // 在输入框里打字时，快捷键一律不生效
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    var q = currentQ();
    if (!q) {   // 小结页
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      var n = Number(e.key);
      if (q.format === 'choice') { if (n <= q.options.length) { e.preventDefault(); choose(n - 1); } }
      else if (n <= 5) { e.preventDefault(); choose(n); }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  }

  // 维度名（低可信提示用）
  function lowDims(r, ctx) {
    var low = (r && r.lowConfidence && r.lowConfidence[ctx]) || {};
    var keys = ctx === 'stress' ? S.HEART.concat(S.MOUTH) : S.HEART.concat(S.MOUTH, S.VIRTUE);
    return keys.filter(function (k) { return low[k] === true; });
  }
  function scoreMode(mode) { return S.score(quiz.answers, QDATA, { mode: mode }); }

  // 最后一题之后：小结
  function renderSummary(focusQ) {
    var box = document.getElementById('quiz');
    var mode = quiz.mode || 'full';
    var list = modeList(mode);
    var st = stats(list);
    var r = scoreMode(mode);
    var ok = !!(r.heartType && r.mouthHeartType);
    var back = firstTodo(list, 0, true);
    var lowN = lowDims(r, 'normal'), lowS = mode === 'full' ? lowDims(r, 'stress') : [];
    var html = progressHtml(mode, st, '小结') +
      '<h2 class="q-text" id="q-text" tabindex="-1">' + esc(MODE_TITLE[mode]) + '答完了，先看看小结</h2>' +
      '<ul class="summary-list">' +
        '<li>共 ' + st.n + ' 题：已答 <strong>' + st.answered + '</strong> 题' + (st.none ? '（其中 ' + st.none + ' 题选了“以上都不像我”，不计分）' : '') +
          '，跳过 <strong>' + st.skipped + '</strong> 题' + (st.todo ? '，还有 <strong>' + st.todo + '</strong> 题没有作答' : '') + '。</li>' +
        '<li>写下真实反应 <strong>' + st.texts + '</strong> 条' + (st.texts ? '，结果页的“AI 深度分析（选用）”可以帮你读一读。' : '。') + '</li>' +
      '</ul>';
    if (lowN.length || lowS.length) {
      html += '<div class="notice low-notice"><p><strong>以下维度答题较少，结果仅供参考：</strong></p><ul>' +
        (lowN.length ? '<li>' + (mode === 'full' ? '平时：' : '') + lowN.map(function (k) { return esc(DIM_LABEL[k]); }).join('、') + '</li>' : '') +
        (lowS.length ? '<li>压力下：' + lowS.map(function (k) { return esc(DIM_LABEL[k]); }).join('、') + '</li>' : '') +
        '</ul><p class="small">回去补答跳过的题，结果会更可靠。</p></div>';
    }
    if (!ok) {
      html += '<p class="notice">已答的题太少，还算不出心性类型和口心类型。请至少回答一些题后再查看结果。</p>';
    }
    html += '<div class="btn-row summary-actions">' +
      (back >= 0 ? '<button type="button" class="btn" data-act="back">回去补答（第 ' + (back + 1) + ' 题起）</button>' : '') +
      '<button type="button" class="btn btn-primary" data-act="finish"' + (ok ? '' : ' disabled') + '>查看结果</button>' +
      '</div>' +
      '<div class="quiz-nav"><button type="button" class="btn" data-act="prev">← 回到最后一题</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="restart">重新开始</button></div>';
    box.innerHTML = html;
    box.querySelector('[data-act="prev"]').addEventListener('click', prev);
    var b = box.querySelector('[data-act="back"]');
    if (b) b.addEventListener('click', function () { goTo(back); });
    box.querySelector('[data-act="finish"]').addEventListener('click', finish);
    bindRestart();
    if (focusQ) {
      var qt = document.getElementById('q-text');
      try { qt.focus({ preventScroll: true }); } catch (e) { qt.focus(); }
      window.scrollTo(0, 0);
    }
  }
  function finish() {
    flushText();
    var mode = quiz.mode || 'full';
    var result = scoreMode(mode);
    if (!result.heartType || !result.mouthHeartType) return;
    var code = S.encode(result);
    lastCode = code;
    storageSet(STORE_LAST, code);
    quiz.pos[mode] = modeList(mode).length;
    saveQuiz();
    location.hash = '#/result/' + code;
  }

  /* ================= 图表 ================= */
  function fmt(v) { return typeof v === 'number' && isFinite(v) ? String(Math.round(v)) : '—'; }

  // 平时 / 压力并排条形图（单一坐标 0–100）
  function barChart(opts) {
    var showStress = !opts.noStress;
    var low = opts.low || { normal: [], stress: [] };
    var rows = opts.keys.map(function (k) {
      var n = opts.normal ? opts.normal[k] : null;
      var s = opts.stress ? opts.stress[k] : null;
      var flagN = opts.flags && opts.flags.normal.indexOf(k) >= 0;
      var flagS = opts.flags && opts.flags.stress.indexOf(k) >= 0;
      function flagWord(v) { return opts.floor !== undefined && !(v >= opts.floor) ? '最高' : opts.flagShort; }
      function line(v, cls, name, flagged) {
        var has = typeof v === 'number' && isFinite(v);
        var w = has ? Math.max(0, Math.min(100, v)) : 0;
        return '<div class="bar-line">' +
          '<div class="bar-track" tabindex="0" data-tip-value="' + fmt(v) + '" data-tip-label="' + esc(DIM_LABEL[k] + ' · ' + name) + '" aria-label="' + esc(DIM_LABEL[k] + '，' + name + '：' + fmt(v) + (flagged ? '，' + flagWord(v) : '')) + '">' +
            (opts.floor !== undefined ? '<span class="bar-floor" style="left:' + opts.floor + '%" aria-hidden="true"></span>' : '') +
            (has ? '<div class="bar-fill ' + cls + '" style="width:' + w + '%"></div>' : '') +
          '</div>' +
          '<span class="bar-val" aria-hidden="true">' + fmt(v) + (flagged ? '<span class="bar-flag">' + esc(flagWord(v)) + '</span>' : '') + '</span>' +
        '</div>';
      }
      var lowN = low.normal.indexOf(k) >= 0, lowS = showStress && low.stress.indexOf(k) >= 0;
      var lowText = lowN && lowS ? '答题较少，仅供参考' : (lowN ? (showStress ? '平时' : '') + '答题较少，仅供参考' : (lowS ? '压力下答题较少，仅供参考' : ''));
      return '<div class="bar-row' + (lowText ? ' is-low' : '') + '">' +
        '<div class="bar-label">' + esc(DIM_LABEL[k]) + '</div>' +
        '<div class="bar-tracks">' + line(n, 'normal', '平时', flagN) + (showStress ? line(s, 'stress', '压力下（参考）', flagS) : '') +
          (lowText ? '<span class="low-note">' + esc(lowText) + '</span>' : '') + '</div>' +
      '</div>';
    }).join('');
    function lowCell(ctx, k) { return low[ctx].indexOf(k) >= 0 ? '<span class="low-mark" title="答题较少，仅供参考">（答题较少）</span>' : ''; }
    var table = '<details class="table-view"><summary>以表格查看</summary><table class="data-table"><thead><tr><th scope="col">维度</th><th scope="col" class="num">平时</th>' + (showStress ? '<th scope="col" class="num">压力下</th>' : '') + '</tr></thead><tbody>' +
      opts.keys.map(function (k) {
        return '<tr><th scope="row">' + esc(DIM_LABEL[k]) + '<span class="muted small">　' + esc(DIM_HINT[k] || '') + '</span></th><td class="num">' + fmt(opts.normal && opts.normal[k]) + lowCell('normal', k) + '</td>' +
          (showStress ? '<td class="num">' + fmt(opts.stress && opts.stress[k]) + lowCell('stress', k) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></details>';
    return '<div class="card chart-card">' +
      '<h3>' + esc(opts.title) + '</h3>' +
      (showStress ? '<ul class="legend" aria-label="图例"><li><span class="swatch swatch-normal" aria-hidden="true"></span>平时</li><li><span class="swatch swatch-stress" aria-hidden="true"></span>压力下（参考）</li></ul>' : '') +
      '<div class="bars">' + rows + '</div>' +
      '<div class="bar-axis" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>' +
      '<p class="axis-note">' + esc(opts.note) + '</p>' + table +
    '</div>';
  }

  // 五德雷达图（手写 SVG）
  function radarChart(V, lowKeys) {
    var keys = S.VIRTUE;
    lowKeys = lowKeys || [];
    var cx = 170, cy = 160, R = 110;
    function pt(i, r) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / keys.length;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    var grid = [25, 50, 75, 100].map(function (g) {
      return '<polygon class="grid" points="' + keys.map(function (k, i) { return pt(i, R * g / 100).join(','); }).join(' ') + '"/>';
    }).join('');
    var spokes = keys.map(function (k, i) { var p = pt(i, R); return '<line class="spoke" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; }).join('');
    var vals = keys.map(function (k) { var v = V[k]; return typeof v === 'number' ? v : 0; });
    var area = '<polygon class="area" points="' + vals.map(function (v, i) { return pt(i, R * v / 100).map(function (x) { return x.toFixed(1); }).join(','); }).join(' ') + '"/>';
    var dots = keys.map(function (k, i) {
      var p = pt(i, R * vals[i] / 100);
      return '<circle class="hit" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="14" tabindex="0" data-tip-value="' + fmt(V[k]) + '" data-tip-label="' + esc(DIM_LABEL[k]) + '" aria-label="' + esc(DIM_LABEL[k] + '：' + fmt(V[k])) + '"/>' +
        '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.5" aria-hidden="true"/>';
    }).join('');
    var labels = keys.map(function (k, i) {
      var p = pt(i, R + 22);
      var anchor = Math.abs(p[0] - cx) < 4 ? 'middle' : (p[0] > cx ? 'start' : 'end');
      var dy = p[1] < cy - R ? -4 : (p[1] > cy + 20 ? 12 : 4);
      return '<text class="lbl" x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(DIM_LABEL[k]) +
        '<tspan class="lbl-v" dx="6">' + fmt(V[k]) + (lowKeys.indexOf(k) >= 0 ? '※' : '') + '</tspan></text>';
    }).join('');
    var ticks = [50, 100].map(function (g) { return '<text class="tick" x="' + (cx + 4) + '" y="' + (cy - R * g / 100 + 11).toFixed(1) + '">' + g + '</text>'; }).join('');
    var aria = '五德雷达图：' + keys.map(function (k) { return DIM_LABEL[k] + ' ' + fmt(V[k]) + (lowKeys.indexOf(k) >= 0 ? '（答题较少，仅供参考）' : ''); }).join('，');
    return '<svg class="radar" viewBox="0 0 340 320" role="img" aria-label="' + esc(aria) + '"><title>' + esc(aria) + '</title>' +
      grid + spokes + ticks + area + dots + labels + '</svg>';
  }

  /* ================= 类型详情（结果页与 #/type/n 共用） ================= */
  function refLinks(refs) {
    if (!refs || !refs.length) return '';
    return '<p class="small">参看：' + refs.map(function (n) {
      var t = typeById(n); return t ? '<a href="#/type/' + n + '">' + typeNumLabel(n) + '「' + esc(t.name_trad) + '」</a>' : '';
    }).join('、') + '</p>';
  }
  function traitItem(it) {
    return '<li>' + txt(it.text) +
      (it.quote ? '<span class="quote-inline">「' + sutra(it.quote) + '」</span>' : '') +
      (it.derived ? ' <span class="tag tag-derived">依经文通则推出</span>' : '') + '</li>';
  }

  function typeDetail(t, hLevel, opts) {
    var H = 'h' + (hLevel || 2), H2 = 'h' + ((hLevel || 2) + 1);
    var html = '';
    html += '<div class="detail-block"><' + H2 + '>经文原文</' + H2 + '>' +
      '<blockquote class="sutra">' + sutra(t.sutra && t.sutra.text) + '<span class="cite">' + SUTRA_CITE + '</span></blockquote>';
    if (t.sutra && t.sutra.verse) {
      html += '<p class="block-label">偈颂</p><div class="verse" lang="zh-Hant">' + verse(t.sutra.verse) + '</div>';
    }
    html += '</div>';
    html += '<div class="detail-block"><' + H2 + '>白话解释</' + H2 + '><p>' + txt(t.plain) + '</p></div>';
    if (t.metaphor) {
      html += '<div class="detail-block"><' + H2 + '>譬喻：' + esc(t.metaphor.name) + '</' + H2 + '>' +
        (t.metaphor.quote ? '<blockquote class="sutra">' + sutra(t.metaphor.quote) + '</blockquote>' : '') +
        '<p>' + txt(t.metaphor.explain) + '</p></div>';
    }
    if (t.traits) {
      html += '<div class="detail-block cols-2">' +
        '<div><' + H2 + '>优点</' + H2 + '><ul class="trait-list">' + (t.traits.strengths || []).map(traitItem).join('') + '</ul></div>' +
        '<div><' + H2 + '>提醒</' + H2 + '><ul class="trait-list">' + (t.traits.cautions || []).map(traitItem).join('') + '</ul></div>' +
      '</div>';
    }
    // 体貌
    html += '<div class="detail-block"><' + H2 + '>体貌 ' + ANCIENT + '</' + H2 + '>';
    if (t.appearance) {
      html += (t.appearance.quote ? '<blockquote class="sutra">' + sutra(t.appearance.quote) + '</blockquote>' : '') +
        '<p>' + txt(t.appearance.plain) + '</p>' + refLinks(t.appearance.refs);
    } else {
      html += '<p class="muted">经文没有为此型单列体貌描述。</p>';
    }
    html += '</div>';
    // 果报
    html += '<div class="detail-block"><' + H2 + '>果报 ' + ANCIENT + (t.karma ? ' ' + tag(!t.karma.derived) : '') + '</' + H2 + '>';
    if (t.karma) {
      html += (t.karma.quote ? '<blockquote class="sutra">' + sutra(t.karma.quote) + '</blockquote>' : '') +
        '<p>' + txt(t.karma.plain) + '</p>' + refLinks(t.karma.refs);
    } else {
      html += '<p class="muted">经文没有为此型单说果报。</p>';
    }
    html += '</div>';
    // 法师开的药
    if (t.prescription) {
      html += '<div class="detail-block"><' + H2 + '>法师开的药 ' + tag(t.prescription.explicit) + '</' + H2 + '>' +
        (t.prescription.quote ? '<blockquote class="sutra">' + sutra(t.prescription.quote) + '<span class="cite">' + (t.prescription.explicit ? '经文为此型所开' : '经文通则（非为此型单独所开）') + '</span></blockquote>' : '') +
        '<p>' + txt(t.prescription.plain) + '</p></div>';
    }
    // 法师宜说之法
    html += teachSection(t, hLevel || 2, opts || {});
    // 推荐修行法
    html += '<div class="detail-block"><' + H2 + '>推荐修行法</' + H2 + '>' + practiceChips(t.practices, t.practices_derived) +
      (t.practices_derived && t.practices_derived.length
        ? '<p class="small muted">标“推”的修行法为依经文通则推出的搭配，其余为经文对此型所开之药。</p>'
        : '<p class="small muted">修行法的搭配以上方“法师开的药”为本，其余配合项依经文通则推出。</p>') +
    '</div>';
    var adv = splitAdvice(t.advice);
    if (adv.length) {
      html += '<div class="detail-block"><' + H2 + '>现代修行建议 <span class="tag tag-plain">本站建议</span></' + H2 + '><ol class="advice-list">' +
        adv.map(function (a) { return '<li>' + txt(a) + '</li>'; }).join('') + '</ol></div>';
    }
    return html;
  }

  /* ================= 法师宜说之法 · 书卡 ================= */
  function teachOf(n) { return (TEACH.types || {})[String(n)] || null; }
  function cardById(id) { return CARD[id] || CARD[CARD_ALIAS[id]] || null; }
  function hTag(n) { return 'h' + Math.min(6, Math.max(1, n)); }
  function typeRefLink(n) {
    var t = typeById(n);
    return t ? '<a href="#/type/' + n + '">' + typeNumLabel(n) + '「<span lang="zh-Hant">' + esc(t.name_trad) + '</span>」</a>' : '';
  }
  function cardDerivedTag(c) {
    return c.derived
      ? '<span class="tag tag-derived" title="这部书适合哪一型，是本站依经文通则所作的判断">本站推出</span>'
      : '<span class="tag tag-explicit" title="经论本身明说此法对治某种烦恼">经论明说</span>';
  }
  function firstTag() { return '<span class="tag tag-first">先读</span>'; }

  // 一张书卡。opts：forThis（为此型而写的说明）、isFirst、from（来源说明 HTML）、H（标题层级）、anchor（是否带 id，供 #/readings/<id> 定位）
  function readingCard(c, opts) {
    opts = opts || {};
    var H = opts.H || 'h3';
    var noQuote = !c.key_quote;
    var html = '<article class="book-card' + (opts.isFirst ? ' is-first' : '') + '"' +
      (opts.anchor ? ' id="card-' + esc(c.id) + '" tabindex="-1"' : '') + ' data-card="' + esc(c.id) + '">';
    html += '<div class="book-head">' +
      '<' + H + ' class="book-title">' + (opts.isFirst ? firstTag() + ' ' : '') +
        '<a href="#/readings/' + esc(c.id) + '">' + esc(c.title) + '</a>' + '</' + H + '>' +
      (c.title_trad ? '<div class="book-sub" lang="zh-Hant">' + markPua(esc(c.title_trad)) + '</div>' : '') +
      '<div class="book-tags">' +
        (c.tradition ? '<span class="tag tag-plain">' + esc(c.tradition) + '</span>' : '') +
        (c.level ? '<span class="tag tag-plain">' + esc(c.level) + '</span>' : '') +
        cardDerivedTag(c) +
        (noQuote ? '<span class="tag tag-ext">延伸参考</span>' : '') +
      '</div></div>';
    if (opts.from) html += '<p class="book-from">' + opts.from + '</p>';
    var forText = opts.forThis || c.why;
    if (forText) html += '<p class="book-for">' + txt(forText) + '</p>';
    if (c.key_quote) {
      html += '<blockquote class="sutra book-quote">' + sutra(c.key_quote.text) +
        '<span class="cite">' + esc(c.key_quote.where || '') + (c.book ? ' · CBETA ' + esc(c.book) : '') + '</span></blockquote>';
    } else {
      html += '<p class="notice small">本站语料中没有这部书，原文未在本站核对，因此不提供引文；请以原书为准。</p>';
    }
    if (c.read_guide) html += '<p class="block-label">先读哪一段</p><p>' + txt(c.read_guide) + '</p>';
    var meta = [];
    if (c.length_hint) meta.push('<span><span class="meta-k">篇幅</span>' + esc(c.length_hint) + '</span>');
    if (c.canon) meta.push('<span><span class="meta-k">出处</span>' + markPua(esc(c.canon)) + '</span>');
    if (c.parallels) meta.push('<span><span class="meta-k">对应</span>' + esc(c.parallels) + '</span>');
    if (meta.length) html += '<p class="book-meta">' + meta.join('') + '</p>';
    if (c.practices && c.practices.length) html += '<p class="block-label">相关修行法</p>' + practiceChips(c.practices);
    if (!c.derived && c.basis) {
      html += '<p class="book-basis"><span class="meta-k">经论明说</span><span class="quote-inline">「' + sutra(c.basis) + '」</span></p>';
    }
    var more = '';
    if (opts.forThis && c.why) more += '<p>' + txt(c.why) + '</p>';
    if (c.more_quotes && c.more_quotes.length) {
      more += c.more_quotes.map(function (q) {
        return '<blockquote class="sutra">' + sutra(q.text) + '<span class="cite">' + esc(q.where || '') + '</span></blockquote>';
      }).join('');
    }
    if (opts.types && opts.types.length) {
      more += '<p class="small">列入书单的类型：' + opts.types.map(typeRefLink).join('、') + '</p>';
    }
    if (more) html += '<details class="book-more"><summary>' + (opts.forThis ? '关于这部书' : '更多引文') + '</summary>' + more + '</details>';
    if (c.note) html += '<p class="note">' + txt(c.note) + '</p>';
    html += '</article>';
    return html;
  }

  // 精简书目（结果页类型详解中用，避免与合并书单重复）
  function miniReadingList(items) {
    return '<ol class="book-mini-list">' + items.map(function (it) {
      var c = it.card;
      return '<li>' + (it.isFirst ? firstTag() + ' ' : '') + '<a href="#/readings/' + esc(c.id) + '">' + esc(c.title) + '</a>' +
        (it.text ? '<span class="d">' + txt(it.text) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function teachSection(t, hLevel, opts) {
    var T = teachOf(t.id);
    if (!T) return '';
    var H2 = hTag(hLevel + 1), H3 = hTag(hLevel + 2), H4 = hTag(hLevel + 3);
    var te = T.teach_explicit || {};
    var html = '<div class="detail-block teach-block"><' + H2 + '>法师宜说之法</' + H2 + '>' +
      '<p class="small muted">经中法师怎样为这一型说法、宜怎样说，以及这一型宜读的经论。<a href="#/readings">全部书单 →</a></p>';
    html += '<' + H3 + '>经中说法 ' + tag(te.explicit) + '</' + H3 + '>';
    if (te.quote) {
      html += '<blockquote class="sutra">' + sutra(te.quote) + '<span class="cite">' + esc(te.where || '') +
        (te.explicit ? '' : '（经文通则，非为此型单独所说）') + '</span></blockquote>';
    }
    if (te.plain) html += '<p>' + txt(te.plain) + '</p>';
    if (T.approach && T.approach.length) {
      html += '<' + H3 + '>宜怎样说</' + H3 + '><ol class="approach-list">' + T.approach.map(function (a) {
        return '<li>' + txt(a.text) +
          (a.derived ? ' <span class="tag tag-derived" title="依经文通则推出">推</span>' : '') +
          (a.quote ? '<span class="approach-quote"><span class="quote-inline">「' + sutra(a.quote) + '」</span>' +
            (a.where ? '<span class="approach-where">' + esc(a.where) + '</span>' : '') + '</span>' : '') +
        '</li>';
      }).join('') + '</ol>';
    }
    var items = (T.readings || []).map(function (r) {
      var c = cardById(r.id);
      return c ? { card: c, text: r.for_this, isFirst: c.id === (cardById(T.first) || {}).id } : null;
    }).filter(Boolean);
    // “先读”的一部排在最前
    items.sort(function (a, b) { return (b.isFirst ? 1 : 0) - (a.isFirst ? 1 : 0); });
    if (items.length) {
      html += '<' + H3 + '>宜闻之法</' + H3 + '>';
      if (opts.compactReadings) {
        html += miniReadingList(items) +
          '<p class="no-print"><button type="button" class="btn btn-small" data-jump="sec-readings">看合并后的「你的宜闻之法」↓</button></p>';
      } else {
        html += '<p class="small muted">共 ' + items.length + ' 部，标“先读”的一部建议最先读。标“经论明说”的，是经论本身说过此法对治某种烦恼；标“本站推出”的，是本站依经文通则所作的搭配。</p>' +
          '<div class="book-list">' + items.map(function (it) {
            return readingCard(it.card, { forThis: it.text, isFirst: it.isFirst, H: H4 });
          }).join('') + '</div>';
      }
    }
    if (T.caution) html += '<' + H3 + '>读经提醒</' + H3 + '><p class="notice">' + txt(T.caution) + '</p>';
    html += '</div>';
    return html;
  }

  // 结果页：合并心性类型与口心类型的书单（规则见 teachings.json 的 combos_note）
  var COMBO_HEART_TAKE = 5, COMBO_MAX = 8;
  function combineReadings(ht, mt) {
    var A = teachOf(ht.id) || {}, B = teachOf(mt.id) || {};
    var main = [], more = [], seen = {};
    function add(r, t, isHeart, intoMain) {
      var c = cardById(r.id);
      if (!c) return;
      var e = seen[c.id];
      if (e) {
        if (e.from.indexOf(t.id) < 0) e.from.push(t.id);
        if (isHeart && r.for_this) e.text = r.for_this;   // 同一书卡保留心性类型的说明
        return;
      }
      e = { card: c, text: r.for_this, from: [t.id] };
      seen[c.id] = e;
      (intoMain && main.length < COMBO_MAX ? main : more).push(e);
    }
    var hr = A.readings || [], mr = B.readings || [];
    hr.slice(0, COMBO_HEART_TAKE).forEach(function (r) { add(r, ht, true, true); });
    mr.forEach(function (r) { add(r, mt, false, true); });
    hr.slice(COMBO_HEART_TAKE).forEach(function (r) { add(r, ht, true, false); });
    // 入门书用心性类型的 first（没有时退回口心类型的 first）
    var first = cardById(A.first) || cardById(B.first);
    if (first) {
      var idx = -1;
      main.forEach(function (e, i) { if (e.card.id === first.id) idx = i; });
      if (idx < 0) {
        more.forEach(function (e, i) { if (e.card.id === first.id) idx = 1000 + i; });
        var moved = idx >= 1000 ? more.splice(idx - 1000, 1)[0] : null;
        if (moved) { main.unshift(moved); if (main.length > COMBO_MAX) more.unshift(main.pop()); }
      } else if (idx > 0) {
        main.unshift(main.splice(idx, 1)[0]);
      }
      if (main[0] && main[0].card.id === first.id) main[0].isFirst = true;
    }
    return { main: main, more: more };
  }
  function fromLabel(ids) {
    if (ids.length > 1) return '<span class="tag tag-both">两型共荐</span> ' + ids.map(typeRefLink).join('、');
    var t = typeById(ids[0]);
    return '来自' + (t ? groupLabel(t) : '') + ' ' + typeRefLink(ids[0]);
  }
  function resultReadingsSection(ht, mt) {
    var R = combineReadings(ht, mt);
    if (!R.main.length) return '';
    var html = '<hr><section class="section" id="sec-readings"><h2>你的宜闻之法</h2>' +
      '<p class="lead">依你的心性类型「<span lang="zh-Hant">' + esc(ht.name_trad) + '</span>」与口心类型「<span lang="zh-Hant">' + esc(mt.name_trad) + '</span>」合并两张书单：先心性、后口业，同一部书只列一次，共 ' + R.main.length + ' 部。标“先读”的一部建议最先读。</p>' +
      '<p class="small muted">哪部书适合哪一型、怎样排序，是本站依经文通则所作的判断；书中引文都已与 CBETA 原文逐字核对。<a href="#/readings">浏览全部书单 →</a></p>' +
      '<div class="book-list">' + R.main.map(function (e) {
        return readingCard(e.card, { forThis: e.text, isFirst: e.isFirst, from: fromLabel(e.from), H: 'h3' });
      }).join('') + '</div>';
    if (R.more.length) {
      html += '<details class="book-more-list"><summary>更多（' + R.more.length + ' 部）</summary>' +
        miniReadingList(R.more.map(function (e) { return { card: e.card, text: e.text }; })) + '</details>';
    }
    html += '</section>';
    return html;
  }

  /* ================= 书单页 ================= */
  var RFILTER_GROUPS = [
    { key: 'h', label: '三毒', field: 'dims', opts: ['h_tan', 'h_chen', 'h_chi'] },
    { key: 'm', label: '口业', field: 'dims', opts: ['m_rou', 'm_cu', 'm_chi'] },
    { key: 'v', label: '五德', field: 'virtues', opts: ['xin', 'jin', 'hui', 'zhi', 'yi'] }
  ];
  var RFILTER_LABEL = { h_tan: '贪', h_chen: '瞋', h_chi: '痴' };
  function loadRFilter() {
    var f = storageGet(STORE_RFILTER), out = { h: '', m: '', v: '' };
    if (f && typeof f === 'object') {
      RFILTER_GROUPS.forEach(function (g) { if (g.opts.indexOf(f[g.key]) >= 0) out[g.key] = f[g.key]; });
    }
    return out;
  }
  function cardMatches(c, f) {
    var tg = c.targets || {};
    return RFILTER_GROUPS.every(function (g) {
      return !f[g.key] || (tg[g.field] || []).indexOf(f[g.key]) >= 0;
    });
  }
  function themeOf(c) { return (c.themes && c.themes[0]) || ''; }

  function viewReadings(arg) {
    var intro = TEACH.intro || {};
    var html = '<p class="eyebrow">法师宜说之法</p><h1>书单</h1>' +
      (intro.plain ? '<p class="lead">' + txt(intro.plain) + '</p>' : '') +
      (intro.quote ? '<blockquote class="sutra">' + sutra(intro.quote.text) + '<span class="cite">' + esc(intro.quote.where || '') + '</span></blockquote>' : '');
    if (!CARDS.length) return { html: html + '<p class="notice">书单数据未载入，请确认 data/teachings.js 存在。</p>', title: '书单' };
    html += '<div class="rfilter no-print" role="search" aria-label="筛选书卡">' + RFILTER_GROUPS.map(function (g) {
      return '<div class="rfilter-group" role="group" aria-labelledby="rf-' + g.key + '"><span class="rfilter-label" id="rf-' + g.key + '">' + esc(g.label) + '</span><div class="rfilter-opts">' +
        ['' ].concat(g.opts).map(function (o) {
          return '<button type="button" class="chip chip-toggle" data-fgroup="' + g.key + '" data-fval="' + o + '" aria-pressed="false">' +
            esc(o ? (RFILTER_LABEL[o] || DIM_LABEL[o] || o) : '全部') + '</button>';
        }).join('') + '</div></div>';
    }).join('') +
      '<p class="rfilter-foot"><span class="status-msg" id="rfilter-status" role="status" aria-live="polite"></span>' +
      '<button type="button" class="btn btn-ghost btn-small" id="rfilter-reset">清除筛选</button></p></div>';
    html += '<nav class="practice-links theme-toc no-print" aria-label="主题目录">' + THEMES.map(function (th) {
      return '<a class="chip" href="#/readings" data-theme-jump="theme-' + esc(th.key) + '">' + esc(th.name) + '</a>';
    }).join('') + '</nav>';
    html += THEMES.map(function (th) {
      var list = CARDS.filter(function (c) { return themeOf(c) === th.key; });
      if (!list.length) return '';
      return '<section class="section theme-sec" id="theme-' + esc(th.key) + '" data-theme-sec="' + esc(th.key) + '">' +
        '<h2>' + esc(th.name) + ' <span class="muted small theme-count"></span></h2>' +
        (th.plain ? '<p class="muted">' + txt(th.plain) + '</p>' : '') +
        '<div class="book-list">' + list.map(function (c) {
          return readingCard(c, { H: 'h3', anchor: true, types: CARD_TYPES[c.id] || [] });
        }).join('') + '</div>' +
        '<p class="muted small theme-empty" hidden>此主题下没有符合筛选条件的书卡。</p>' +
      '</section>';
    }).join('');
    // 不属于任何已知主题的书卡（正常情况下没有）
    var orphan = CARDS.filter(function (c) { return !THEME[themeOf(c)]; });
    if (orphan.length) {
      html += '<section class="section theme-sec" data-theme-sec="_"><h2>其他</h2><div class="book-list">' +
        orphan.map(function (c) { return readingCard(c, { H: 'h3', anchor: true, types: CARD_TYPES[c.id] || [] }); }).join('') + '</div></section>';
    }

    var target = arg ? cardById(arg) : null;
    return { html: html, title: target ? target.title + ' · 书单' : '书单', keepScroll: !!target, noFocus: !!target, after: function () {
      var f = loadRFilter();
      var status = document.getElementById('rfilter-status');
      function apply(note) {
        var shown = 0;
        Array.prototype.forEach.call(app.querySelectorAll('.book-card[data-card]'), function (el) {
          var ok = cardMatches(CARD[el.getAttribute('data-card')], f);
          el.hidden = !ok;
          if (ok) shown++;
        });
        Array.prototype.forEach.call(app.querySelectorAll('.theme-sec'), function (sec) {
          var all = sec.querySelectorAll('.book-card').length;
          var vis = sec.querySelectorAll('.book-card:not([hidden])').length;
          var cnt = sec.querySelector('.theme-count');
          if (cnt) cnt.textContent = vis === all ? all + ' 部' : vis + ' / ' + all + ' 部';
          var empty = sec.querySelector('.theme-empty');
          if (empty) empty.hidden = vis > 0;
        });
        Array.prototype.forEach.call(app.querySelectorAll('[data-fgroup]'), function (b) {
          b.setAttribute('aria-pressed', String(f[b.getAttribute('data-fgroup')] === b.getAttribute('data-fval')));
        });
        var active = RFILTER_GROUPS.filter(function (g) { return f[g.key]; }).map(function (g) {
          return g.label + '：' + (RFILTER_LABEL[f[g.key]] || DIM_LABEL[f[g.key]]);
        });
        if (status) status.textContent = (note ? note + ' ' : '') + '显示 ' + shown + ' / ' + CARDS.length + ' 部' +
          (active.length ? '（' + active.join('，') + '）' : '') + '。';
        var reset = document.getElementById('rfilter-reset');
        if (reset) reset.hidden = !active.length;
      }
      Array.prototype.forEach.call(app.querySelectorAll('[data-fgroup]'), function (b) {
        b.addEventListener('click', function () {
          f[b.getAttribute('data-fgroup')] = b.getAttribute('data-fval');
          storageSet(STORE_RFILTER, f);
          apply();
        });
      });
      var reset = document.getElementById('rfilter-reset');
      if (reset) reset.addEventListener('click', function () {
        f = { h: '', m: '', v: '' };
        storageSet(STORE_RFILTER, f);
        apply();
        // 按钮清除后隐藏，焦点移到第一组的“全部”，免得键盘焦点丢到页面开头
        var firstAll = app.querySelector('[data-fgroup][data-fval=""]');
        if (firstAll) firstAll.focus();
      });

      Array.prototype.forEach.call(app.querySelectorAll('[data-theme-jump]'), function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var el = document.getElementById(a.getAttribute('data-theme-jump'));
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var h = el.querySelector('h2'); h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (x) { /* 忽略 */ } }
        });
      });
      var note = '';
      if (target && !cardMatches(target, f)) {
        // 直接打开某张书卡，而它被筛选条件隐藏时：清除筛选
        f = { h: '', m: '', v: '' };
        storageSet(STORE_RFILTER, f);
        note = '为显示这张书卡，已清除筛选。';
      }
      apply(note);
      if (target) {
        var el = document.getElementById('card-' + target.id);
        if (el) {
          el.classList.add('is-target');
          el.scrollIntoView({ block: 'start' });
          try { el.focus({ preventScroll: true }); } catch (x) { el.focus(); }
        }
      } else if (arg) {
        if (status) status.textContent = '没有找到书卡「' + arg + '」。' + status.textContent;
      }
    } };
  }

  function typeHead(t, H) {
    H = H || 'h1';
    return '<div class="type-head"><span class="num-big" aria-hidden="true">' + t.id + '</span><div>' +
      '<p class="eyebrow">' + groupLabel(t) + ' · ' + typeNumLabel(t.id) + '</p>' +
      '<' + H + ' lang="zh-Hant">' + esc(t.name_trad) + '</' + H + '>' +
      '<div class="sub">' + esc(t.name) + (t.alias && t.alias !== t.name_trad ? ' · 经文又称「' + esc(t.alias) + '」' : '') + '</div>' +
      '</div></div>' +
      '<p class="lead" style="margin-top:12px">' + esc(t.one_line) + '</p>';
  }

  /* ================= 结果页 ================= */
  function viewResult(code) {
    var r = code && S ? S.decode(code) : null;
    if (!r || !r.heartType || !r.mouthHeartType) {
      return { html: '<h1>无法读取结果</h1><p>这个结果链接不完整或已失效。</p><div class="btn-row"><a class="btn btn-primary" href="#/quiz">去答题</a><a class="btn" href="#/">回首页</a></div>', title: '结果' };
    }
    ensureQuiz();
    var mode = r.mode === 'short' ? 'short' : 'full';
    var isShort = mode === 'short';
    var ht = typeById(r.heartType), mt = typeById(r.mouthHeartType);
    var sht = isShort ? null : typeById(r.stressHeartType), smt = isShort ? null : typeById(r.stressMouthHeartType);
    var shareUrl = location.href.split('#')[0] + '#/result/' + code;
    var lowN = lowDims(r, 'normal'), lowS = isShort ? [] : lowDims(r, 'stress');
    function pickLow(arr, keys) { return arr.filter(function (k) { return keys.indexOf(k) >= 0; }); }
    var low = {
      heart: { normal: pickLow(lowN, S.HEART), stress: pickLow(lowS, S.HEART) },
      mouth: { normal: pickLow(lowN, S.MOUTH), stress: pickLow(lowS, S.MOUTH) },
      virtue: pickLow(lowN, S.VIRTUE)
    };

    var html = '<p class="eyebrow">测评结果 · <span class="tag tag-mode">' + esc(MODE_TITLE[mode]) + '</span></p><h1>你的十九种人结果</h1>' +
      '<p class="muted small">自评结果仅供自我观察，不是诊断；最好与了解你的老师或朋友一起对照。<a href="#/about">免责声明</a></p>';
    if (isShort) {
      var fs = stats(QUESTIONS);
      html += '<div class="card mode-card"><p><strong>这是简洁版的结果，为大致倾向。</strong>简洁版共 ' + SHORT_LIST.length + ' 题，只看“平时的我”，不做压力下的对比；如果你有两种烦恼都比较重，简洁版可能只显示其中更突出的一种。</p>' +
        '<div class="btn-row no-print"><button type="button" class="btn btn-primary" data-act="to-full">继续完成完整版' +
        (fs.answered ? '（已答 ' + fs.answered + ' / ' + fs.n + '，已答的题会保留）' : '') + '</button></div></div>';
    }
    if (low.heart.normal.length || low.mouth.normal.length) {
      html += '<p class="notice small">心性或口业有维度答题较少（见下方图表中的标注），类型仅供参考。回去补答跳过的题，结果会更可靠。</p>';
    }
    if (r.tie && (r.tie.heart || r.tie.mouth)) {
      html += '<p class="notice small">你的几项分数完全相同，答案缺乏区分度，类型只是按默认顺序给出的，请把它当作参考。</p>';
    }

    html += '<div class="type-cards">' + typeCard(ht, '心性类型', 'sec-heart') + typeCard(mt, '口心类型', 'sec-mouth') + '</div>';
    html += '<p class="no-print btn-row"><button type="button" class="btn btn-small btn-ghost" data-jump="sec-readings">看你的宜闻之法（推荐经论）↓</button>' +
      '<button type="button" class="btn btn-small btn-ghost" data-jump="sec-ai">AI 深度分析（选用）↓</button></p>';

    // 图表
    html += '<section class="section"><h2>分数一览</h2><div class="chart-grid">' +
      barChart({
        title: '三毒（心性）', keys: S.HEART, normal: r.heart, stress: r.stress.heart, noStress: isShort, low: low.heart,
        flags: { normal: r.elevated || [], stress: isShort ? [] : (r.stressElevated || []) }, flagText: '突出', flagShort: '突出',
        floor: S.FLOOR,
        note: '0–100，按题库可能的最低与最高分换算（只计已答的题）。浅竖线为“突出”门槛 ' + S.FLOOR + '；与最高分相差不超过 ' + S.GAP + ' 且不低于门槛者记为突出。'
      }) +
      barChart({
        title: '口业（说话方式）', keys: S.MOUTH, normal: r.mouth, stress: r.stress.mouth, noStress: isShort, low: low.mouth,
        flags: { normal: [argmaxKey(r.mouth, S.MOUTH)], stress: isShort ? [] : [argmaxKey(r.stress.mouth, S.MOUTH)] }, flagText: '最高项', flagShort: '最高',
        note: '口柔、口粗、口痴中最高的一项，与心性最突出的一毒相配，得出口心类型。'
      }) +
    '</div></section>';

    // 五德
    var lowKey = argminKey(r.virtues, S.VIRTUE), highKey = argmaxKey(r.virtues, S.VIRTUE);
    var lowV = lowKey ? VIRTUE[lowKey.slice(2)] : null, highV = highKey ? VIRTUE[highKey.slice(2)] : null;
    html += '<section class="section"><h2>五德</h2>' +
      '<p class="muted small">经文说能顺道修行的五种品质：信、精进、智慧、质直（无谄）、有志（心坚强）。只在“平时的我”部分计分。</p>' +
      '<div class="card radar-wrap"><div>' + radarChart(r.virtues, low.virtue) +
      (low.virtue.length ? '<p class="low-note low-note-block">※ ' + low.virtue.map(function (k) { return esc(DIM_LABEL[k]); }).join('、') + '：答题较少，仅供参考</p>' : '') +
      '<details class="table-view"><summary>以表格查看</summary><table class="data-table"><thead><tr><th scope="col">德</th><th scope="col" class="num">分数</th></tr></thead><tbody>' +
      S.VIRTUE.map(function (k) { return '<tr><th scope="row"><a href="#/virtues/' + k.slice(2) + '">' + esc(DIM_LABEL[k]) + '</a></th><td class="num">' + fmt(r.virtues[k]) + (low.virtue.indexOf(k) >= 0 ? '<span class="low-mark">（答题较少）</span>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></details></div><div>' +
      (lowV ? '<p class="eyebrow">最需要培养</p><h3 style="margin-top:0">' + esc(lowV.name) + '（' + fmt(r.virtues[lowKey]) + '）</h3><p>' + txt(lowV.low_advice) + '</p>' +
        practiceChips(lowV.practices) : '') +
      (highV && highV !== lowV ? '<p class="note">你最强的一德是「' + esc(highV.name) + '」：' + txt(highV.high_note) + '</p>' : '') +
      '</div></div></section>';

    // 平时与压力对比（简洁版不做）
    if (!isShort) {
      html += '<section class="section"><h2>平时与压力下</h2><div class="card compare">' + compareText(r, ht, mt, sht, smt) + '</div></section>';
    }

    // 完整内容
    html += '<section class="section" id="sec-heart"><h2 class="sr-only">心性类型详解</h2>' + typeHead(ht, 'h3') + typeDetail(ht, 3, { compactReadings: true }) +
      '<p><a class="solo-link" href="#/type/' + ht.id + '">单独打开此型页面 →</a></p></section>';
    html += '<hr><section class="section" id="sec-mouth"><h2 class="sr-only">口心类型详解</h2>' + typeHead(mt, 'h3') + typeDetail(mt, 3, { compactReadings: true }) +
      '<p><a class="solo-link" href="#/type/' + mt.id + '">单独打开此型页面 →</a></p></section>';

    // 你的宜闻之法（合并两型书单）
    html += resultReadingsSection(ht, mt);

    // AI 深度分析（选用）：放在书单之后——先看本站依类型给的书单，再借 AI 读自己写下的文字作补充
    var aiCtx = aiContext(code, r, mode, ht, mt, sht, smt);
    html += aiSectionHtml(aiCtx);

    // 低分之德的培养方法
    if (lowV) {
      html += '<hr><section class="section"><h2>培养「' + esc(lowV.name) + '」</h2>' +
        '<blockquote class="sutra">' + sutra(lowV.sutra_def.quote) + '<span class="cite">' + esc(lowV.sutra_def.pin) + '</span></blockquote>' +
        '<ul class="advice-list">' + (lowV.grow || []).map(function (g) { return '<li>' + txt(g) + '</li>'; }).join('') + '</ul>' +
        '<p><a class="solo-link" href="#/virtues/' + esc(lowV.id) + '">查看五德详解 →</a></p></section>';
    }

    // 分享
    html += '<section class="section share-section no-print"><h2>保存与分享</h2>' +
      '<p class="small muted">链接里只有各项分数和测评版本，不含逐题答案，也不含你写下的任何文字；打开即可看到同样的结果。</p>' +
      '<div class="share-box"><label class="sr-only" for="share-url">结果链接</label><input id="share-url" type="text" readonly value="' + esc(shareUrl) + '">' +
      '<button type="button" class="btn btn-primary" id="copy-link" aria-label="复制结果链接">复制链接</button>' +
      '<button type="button" class="btn" id="print-btn" aria-label="打印或另存为 PDF">打印</button></div>' +
      '<p class="status-msg" id="copy-status" role="status" aria-live="polite"></p>' +
      '<div class="btn-row"><a class="btn btn-ghost" href="#/quiz">重新测评</a><a class="btn btn-ghost" href="#/types">浏览十九种人</a></div>' +
    '</section>';

    return { html: html, title: '结果：' + ht.name_trad + ' · ' + mt.name_trad, after: function () {
      bindRestart();
      Array.prototype.forEach.call(app.querySelectorAll('[data-jump]'), function (b) {
        b.addEventListener('click', function () {
          var el = document.getElementById(b.getAttribute('data-jump'));
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var h = el.querySelector('h2:not(.sr-only), h3'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } } }
        });
      });
      var toFull = app.querySelector('[data-act="to-full"]');
      if (toFull) toFull.addEventListener('click', function () {
        var fu = firstTodo(QUESTIONS);
        enterMode('full', fu < 0 ? QUESTIONS.length : fu);
        location.hash = '#/quiz/full';
      });
      var copy = document.getElementById('copy-link');
      var input = document.getElementById('share-url');
      var status = document.getElementById('copy-status');
      copy.addEventListener('click', function () {
        copyText(input.value, input, function (ok) { status.textContent = ok ? '已复制到剪贴板。' : '复制失败，请长按或手动选中上面的链接复制。'; });
      });
      input.addEventListener('focus', function () { input.select(); });
      document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
      bindAiSection(aiCtx);
    } };
  }

  // 复制文字：先用 Clipboard API，失败时选中文本框再用 execCommand；都失败就让用户手动复制
  function copyText(text, field, done) {
    function fallback() {
      try {
        field.focus();
        field.select();
        if (field.setSelectionRange) field.setSelectionRange(0, field.value.length);
        done(document.execCommand('copy'));
      } catch (e) { done(false); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* ================= AI 深度分析（选用） =================
   * “复制给 AI”：把分析说明、测评结果摘要与情境题的作答 / 真实反应拼成一段文字，由用户自行粘贴到自己的 AI 助手。
   * “网站内分析”：只有 SITE_CONFIG.aiEndpoint 非空时出现；用户勾选同意后，才把同样的资料 POST 给 Worker。
   * 用户写的文字只在本机（localStorage）；分享链接里没有任何文字。AI 返回的内容一律先转义再渲染。
   */
  function aiText(s) { return esc(s).replace(/\n/g, '<br>'); }

  function aiContext(code, r, mode, ht, mt, sht, smt) {
    // 只有本机最近一次算出的结果，才附上本机保存的作答与文字（打开别人分享的链接时不附）
    // 并且当前答案重新计分后仍是这个结果（之后改过答案就不附，免得作答与结果对不上）
    var local = (storageGet(STORE_LAST) === code || lastCode === code) && S.encode(scoreMode(mode)) === code;
    var list = modeList(mode);
    var items = [];
    if (local) {
      list.forEach(function (q) {
        if (q.format !== 'choice') return;
        var v = quiz.answers[q.id];
        var t = hasText(q.id) ? texts[q.id].trim() : '';
        if (v === undefined && !t) return;
        var none = v !== undefined && v !== null && S.isNone(q, v);
        var skipped = v === undefined || v === null;
        var opt = !skipped && !none ? q.options[v] : null;
        items.push({ id: q.id, question: q.text, context: q.context === 'stress' ? 'stress' : 'normal',
          choice: opt ? opt.text : null, none: none, skipped: skipped, text: t });
      });
    }
    var st = local ? stats(list) : null;
    function ref(t) { return t ? { id: t.id, name: t.name } : null; }
    var payload = {
      mode: mode,
      result: {
        heart: ref(ht),
        mouth_heart: ref(mt),
        stress: mode === 'full' && (sht || smt) ? { heart: ref(sht), mouth_heart: ref(smt) } : null,
        scores: {
          normal: Object.assign({}, r.heart, r.mouth, r.virtues),
          stress: mode === 'full' ? Object.assign({}, r.stress.heart, r.stress.mouth) : null
        },
        low_confidence: { normal: lowDims(r, 'normal'), stress: mode === 'full' ? lowDims(r, 'stress') : [] },
        stats: st ? { total: st.n, answered: st.answered, skipped: st.skipped } : null
      },
      answers: items
    };
    var nText = items.filter(function (a) { return a.text; }).length;
    var firstChoice = -1;
    list.some(function (q, i) { if (q.format === 'choice') { firstChoice = i; return true; } return false; });
    return { code: code, mode: mode, local: local, payload: payload, nText: nText, nItems: items.length, firstChoice: firstChoice };
  }

  function aiSectionHtml(ctx) {
    if (!AI) return '';
    var html = '<hr><section class="section ai-section" id="sec-ai" aria-labelledby="ai-h"><h2 id="ai-h">AI 深度分析（选用）</h2>' +
      '<p class="lead">' + esc(AI.intro) + '</p>' +
      '<p class="notice ai-disclaimer">' + esc(AI.disclaimer) + '</p>' +
      // 免责说明里提到“下方的求助热线”：常备一份，折叠显示
      '<details class="ai-help"><summary>求助热线</summary>' + hotlinesHtml() + '</details>' +
      '<details class="ai-privacy"><summary>隐私说明</summary><p>' + esc(AI.privacy) + '</p></details>';
    // 用户写了几条真实反应
    if (!ctx.local) {
      html += '<p class="ai-count">这个结果不是在这台设备上刚测出的（或之后答案有改动），所以没有可附上的作答和真实反应。也可以只凭测评结果让 AI 分析。</p>';
    } else if (ctx.nText) {
      html += '<p class="ai-count">你在情境题下写了 <strong>' + ctx.nText + '</strong> 条真实反应' +
        (ctx.nItems > ctx.nText ? '，另有 ' + (ctx.nItems - ctx.nText) + ' 道情境题只选了选项或跳过' : '') + '，会一并附上。</p>';
    } else {
      html += '<p class="ai-count">你还没有写下任何真实反应。也可以只凭测评结果让 AI 分析' +
        (ctx.nItems ? '（会附上你在 ' + ctx.nItems + ' 道情境题里的选择）' : '') + '；写下几句自己的真实反应，分析会更有参考价值。' +
        (ctx.firstChoice >= 0 ? ' <button type="button" class="btn btn-small" data-act="ai-write">回去补写真实反应</button>' : '') + '</p>';
    }
    // 复制给 AI
    html += '<div class="card ai-card"><h3>方式一：复制给 AI</h3>' +
      '<p>把分析说明、你的测评结果和情境题作答打包成一段文字，复制后粘贴到你自己常用的 AI 助手里即可。粘贴到哪里、要不要粘贴，都由你决定。</p>' +
      '<div class="btn-row no-print"><button type="button" class="btn btn-primary" id="ai-copy">复制给 AI</button>' +
      '<span class="status-msg" id="ai-copy-status" role="status" aria-live="polite"></span></div>' +
      '<details class="ai-preview no-print" id="ai-preview"><summary>预览将要复制的全文</summary>' +
      '<label class="sr-only" for="ai-copy-text">将要复制给 AI 的全文</label>' +
      '<textarea id="ai-copy-text" class="ai-copy-text" readonly rows="12"></textarea></details></div>';
    // 网站内分析
    if (AI_ENDPOINT) {
      var can = ctx.nText > 0;
      html += '<div class="card ai-card"><h3>方式二：网站内直接分析</h3>' +
        '<p>由本站的转发服务把资料交给 AI 做一次分析，结果直接显示在下面，通常需要半分钟到一分钟。</p>' +
        (can ? '' : '<p class="notice small">网站内分析需要至少一条你写下的真实反应。可以先回去补写，或用上面的“复制给 AI”只凭测评结果分析。</p>') +
        '<div class="no-print"><label class="consent"><input type="checkbox" id="ai-consent"' + (can ? '' : ' disabled') + '><span>' + esc(AI.consent) + '</span></label>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary" id="ai-run" disabled>网站内分析</button></div></div>' +
        '<p class="status-msg" id="ai-status" role="status" aria-live="polite"></p>' +
        '<div class="ai-result" id="ai-result"></div></div>';
    }
    html += '</section>';
    return html;
  }

  function bindAiSection(ctx) {
    if (!AI || !document.getElementById('sec-ai')) return;
    var write = app.querySelector('[data-act="ai-write"]');
    if (write) write.addEventListener('click', function () {
      enterMode(ctx.mode, ctx.firstChoice);
      location.hash = '#/quiz/' + ctx.mode;
    });
    var copyBtn = document.getElementById('ai-copy');
    var ta = document.getElementById('ai-copy-text');
    var cst = document.getElementById('ai-copy-status');
    var preview = document.getElementById('ai-preview');
    var full = AI.buildCopyText(ctx.payload);
    ta.value = full;
    copyBtn.addEventListener('click', function () {
      copyText(full, ta, function (ok) {
        if (ok) { cst.textContent = '已复制（约 ' + full.length + ' 字）。打开你的 AI 助手，粘贴后发送即可。'; return; }
        preview.open = true;
        try { ta.focus(); ta.select(); } catch (e) { /* 忽略 */ }
        cst.textContent = '没能自动复制。已展开并选中下面的全文，请手动复制（Ctrl/⌘ + C，或长按选择“复制”）。';
      });
    });

    if (!AI_ENDPOINT) return;
    var consent = document.getElementById('ai-consent');
    var run = document.getElementById('ai-run');
    var status = document.getElementById('ai-status');
    var out = document.getElementById('ai-result');
    var busy = false;
    consent.addEventListener('change', function () { run.disabled = busy || !consent.checked; });
    run.addEventListener('click', function () {
      if (busy || !consent.checked || !ctx.nText) return;
      busy = true;
      run.disabled = true;
      run.textContent = '正在分析……';
      out.setAttribute('aria-busy', 'true');
      out.innerHTML = '';
      status.innerHTML = '<span class="spinner" aria-hidden="true"></span>正在分析，通常需要半分钟到一分钟，请不要关闭页面。';
      var finished = false;
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        done(null, { code: 'timeout' });
      }, AI_TIMEOUT);
      function done(data, err) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        busy = false;
        run.textContent = '网站内分析';
        run.disabled = !consent.checked;
        out.removeAttribute('aria-busy');
        if (data && data.ok && data.analysis && AI.normalizeAnalysis(data.analysis)) {
          status.textContent = '分析完成。';
          out.innerHTML = analysisHtml(AI.normalizeAnalysis(data.analysis), data);
          // 有求助信息时先把焦点放在求助信息上，读屏用户不会错过
          var h = out.querySelector('.crisis-box') || out.querySelector('h4, h3');
          if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: false }); } catch (e) { /* 忽略 */ } }
          return;
        }
        var msg = aiErrorMessage(data, err);
        status.textContent = '';
        out.innerHTML = (data && data.crisis ? crisisHtml() : '') + '<p class="notice ai-error" role="alert">' + esc(msg) + '</p>';
      }
      try {
        fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ctx.payload),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) {
          return res.json().then(function (j) { return { res: res, data: j }; }, function () { return { res: res, data: null }; });
        }).then(function (x) {
          if (x.data && typeof x.data === 'object') done(x.data, x.res.ok ? null : { status: x.res.status });
          else done(null, { status: x.res.status, code: 'bad_json' });
        }, function (e) {
          done(null, { code: e && e.name === 'AbortError' ? 'timeout' : 'network' });
        });
      } catch (e) { done(null, { code: 'network' }); }
    });
  }

  function aiErrorMessage(data, err) {
    if (data && typeof data.message === 'string' && data.message) return data.message;
    var code = err && err.code, st = err && err.status;
    if (code === 'timeout') return '分析用时超过 150 秒，暂时没有结果。请稍后再试，或改用“复制给 AI”。';
    if (code === 'network') return '暂时连不上分析服务，请检查网络后再试，或改用“复制给 AI”。';
    if (st === 403) return '此来源无权使用分析服务。可以先用“复制给 AI”。';
    if (st === 429) return '请求太频繁了，请过一分钟再试。';
    if (st >= 500) return 'AI 服务暂时出了问题，请稍后再试，或改用“复制给 AI”。';
    return '这次没能得到分析结果，请稍后再试，或改用“复制给 AI”。';
  }

  // 渲染 AI 返回的结构化结果：所有字段都先经 esc 转义，链接只指向本站已存在的类型 / 修行法 / 书卡
  function analysisHtml(a, data) {
    var LEVEL_CLS = { '高': 'lv-high', '中': 'lv-mid', '低': 'lv-low', '不明': 'lv-unknown' };
    function chips(list) {
      return list.length ? '<ul class="ai-chips">' + list.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted small">（没有提到）</p>';
    }
    function para(s) { return s ? '<p>' + aiText(s) + '</p>' : ''; }
    var html = '';
    if ((a.safety && a.safety.concern) || (data && data.crisis)) html += crisisHtml(a.safety && a.safety.concern ? a.safety.message : '');
    html += '<div class="ai-analysis">';
    html += '<p class="ai-badge"><span class="tag tag-plain">AI 分析</span> 仅供自我观察，不是心理诊断。</p>';
    html += '<h4>总体印象</h4>' + (para(a.overview) || '<p class="muted small">（没有内容）</p>');
    html += '<h4>心理状态</h4><dl class="ai-state">' +
      '<dt>情绪</dt><dd>' + chips(a.state.emotions) + '</dd>' +
      '<dt>需要</dt><dd>' + chips(a.state.needs) + '</dd>' +
      '<dt>意图</dt><dd>' + chips(a.state.intentions) + '</dd></dl>' + para(a.state.notes);
    html += '<h4>三毒线索</h4><ul class="ai-poisons">' + S.HEART.map(function (k) {
      var p = a.poisons[k] || { level: '不明', evidence: '' };
      return '<li><span class="ai-dim">' + esc(DIM_LABEL[k]) + '</span><span class="tag ai-level ' + (LEVEL_CLS[p.level] || '') + '">' + esc(p.level) + '</span>' +
        (p.evidence ? '<span class="ai-ev">' + aiText(p.evidence) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
    html += '<h4>口业</h4><p><span class="tag ai-level">' + esc(a.mouth.tendency) + '</span> ' + aiText(a.mouth.evidence) + '</p>';
    if (a.consistency) html += '<h4>与测评对照</h4>' + para(a.consistency);
    if (a.suggested_types.length) {
      html += '<h4>可能更接近的类型</h4><ul class="ai-list">' + a.suggested_types.map(function (t) {
        var T = typeById(t.id);
        var label = typeNumLabel(t.id) + (T ? '「' + T.name_trad + '」' : '');
        return '<li>' + (T ? '<a href="#/type/' + T.id + '">' + esc(label) + '</a>' : esc(label)) + (t.reason ? '<span class="d">' + aiText(t.reason) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (a.practices.length) {
      html += '<h4>修行法</h4><ul class="ai-list">' + a.practices.map(function (p) {
        var P = PRACTICE[p.id];
        var name = P ? P.name : (p.name || p.id);
        return '<li>' + (P ? '<a href="#/practice/' + esc(p.id) + '">' + esc(name) + '</a>' : '<strong>' + esc(name) + '</strong>') + (p.why ? '<span class="d">' + aiText(p.why) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (a.readings.length) {
      html += '<h4>书单</h4><ul class="ai-list">' + a.readings.map(function (b) {
        var c = cardById(b.id);
        var title = c ? c.title : (b.title || b.id);
        return '<li>' + (c ? '<a href="#/readings/' + esc(c.id) + '">' + esc(title) + '</a>' : '<strong>' + esc(title) + '</strong>') + (b.why ? '<span class="d">' + aiText(b.why) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (a.advice) html += '<h4>建议</h4>' + para(a.advice);
    html += '<p class="ai-conf">这次分析的把握：<span class="tag ai-level ' + (LEVEL_CLS[a.confidence] || '') + '">' + esc(a.confidence) + '</span>' +
      (a.confidence === '低' ? '<span class="small muted">　文字较少或较含糊，结论请多打折扣。</span>' : '') + '</p>';
    html += '<p class="small muted ai-foot">' + esc((data && typeof data.disclaimer === 'string' && data.disclaimer) || AI.disclaimer) + '</p>';
    html += '</div>';
    return html;
  }

  function argmaxKey(o, keys) {
    var best = null;
    (keys || []).forEach(function (k) { if (o && typeof o[k] === 'number' && (best === null || o[k] > o[best])) best = k; });
    return best;
  }
  function argminKey(o, keys) {
    var best = null;
    (keys || []).forEach(function (k) { if (o && typeof o[k] === 'number' && (best === null || o[k] < o[best])) best = k; });
    return best;
  }

  function typeCard(t, kind, anchor) {
    return '<article class="type-card">' +
      '<div class="kind">' + esc(kind) + '</div>' +
      '<span class="num" aria-label="' + typeNumLabel(t.id) + '">第' + t.id + '种</span>' +
      '<div class="name" lang="zh-Hant">' + esc(t.name_trad) + '</div>' +
      '<div class="name-s">' + esc(t.name) + (t.alias && t.alias !== t.name_trad ? ' · ' + esc(t.alias) : '') + '</div>' +
      '<p class="one">' + esc(t.one_line) + '</p>' +
      '<div class="card-actions no-print"><button type="button" class="btn btn-small" data-jump="' + anchor + '" aria-label="跳到' + esc(kind) + '「' + esc(t.name_trad) + '」的完整内容">看完整内容 ↓</button></div>' +
    '</article>';
  }

  function compareText(r, ht, mt, sht, smt) {
    var out = '<p class="small muted">“压力下的我”只有 ' + QUESTIONS.filter(function (q) { return q.context === 'stress'; }).length +
      ' 道情境题，平时与压力两套分数各自换算，所以压力结果只作参考。经文描述的是常态性情；压力下的变化如何解读，依经文通则推出。</p>';
    if (!sht && !smt) {
      return out + '<p>“压力下的我”这一部分的题大多跳过了，暂时无法对比。回去补答这一部分，就能看到你在压力下的样子。</p>';
    }
    function row(label, a, b) {
      var same = a && b && a.id === b.id;
      return '<li><strong>' + label + '</strong>：平时「' + (a ? '<a href="#/type/' + a.id + '">' + esc(a.name_trad) + '</a>' : '—') + '」，压力下「' +
        (b ? '<a href="#/type/' + b.id + '">' + esc(b.name_trad) + '</a>' : '—') + '」' + (same ? '，两者一致。' : '，<strong>两者不同</strong>。') + '</li>';
    }
    out += '<ul>' + row('心性类型', ht, sht) + row('口心类型', mt, smt) + '</ul>';

    var shifts = [];
    S.HEART.concat(S.MOUTH).forEach(function (k) {
      var isH = k.charAt(0) === 'h';
      var a = (isH ? r.heart : r.mouth)[k], b = (isH ? r.stress.heart : r.stress.mouth)[k];
      if (typeof a === 'number' && typeof b === 'number' && Math.abs(b - a) >= 15) shifts.push({ k: k, a: a, b: b });
    });
    shifts.sort(function (x, y) { return Math.abs(y.b - y.a) - Math.abs(x.b - x.a); });

    var diffHeart = sht && ht.id !== sht.id, diffMouth = smt && mt.id !== smt.id;
    if (diffHeart || diffMouth) {
      out += '<p>你在顺境和逆境中的样子并不完全一样。';
      if (diffHeart) out += '平时偏向「' + esc(ht.name_trad) + '」（' + esc(ht.one_line) + '），压力下更接近「' + esc(sht.name_trad) + '」（' + esc(sht.one_line) + '）。';
      if (diffMouth) out += '说话与内心的组合，平时是「' + esc(mt.name_trad) + '」，压力下变成「' + esc(smt.name_trad) + '」。';
      out += '经文说法师「隨其行跡，而為說法」；压力下冒出来的那一面，往往正是平时不容易看见的习气，可以把它也当作修行的对象（此句依经文通则推出）。</p>';
    } else {
      out += '<p>无论平时还是压力下，你的类型都相同，说明这一型的习气在你身上相当稳定。修行时可以就这一型的药方持续用功。</p>';
    }
    if (shifts.length) {
      out += '<p>变化较大的几项（相差 15 分以上）：' + shifts.slice(0, 4).map(function (s) {
        return DIM_LABEL[s.k] + ' 平时 ' + fmt(s.a) + '，压力下 ' + fmt(s.b) + '（' + (s.b > s.a ? '升高' : '降低') + ' ' + Math.abs(Math.round(s.b - s.a)) + '）';
      }).join('；') + '。</p>';
      var up = shifts.filter(function (s) { return s.b > s.a; })[0];
      if (up) {
        var hint = {
          h_tan: '压力下更想找人倾诉、寻求安慰或用享乐来缓解，可留意“求安慰”背后的贪爱。',
          h_chen: '压力下更容易起瞋，此时尤其适合修慈心、除九恼。',
          h_chi: '压力下更容易发懵、拖延、昏沉，此时尤其适合数息与观因缘，先把心安住。',
          m_rou: '压力下说话反而更软、更顺从，可留意是否把真实想法压在心里。',
          m_cu: '压力下更容易出口伤人，此时可先停一停再开口。',
          m_chi: '压力下更难把话说清楚、听明白，可放慢语速、先复述对方的意思。'
        }[up.k];
        if (hint) out += '<p>' + esc(hint) + '<span class="tag tag-derived">依经文通则推出</span></p>';
      }
    }
    return out;
  }

  /* ================= 十九种总览 ================= */
  function viewTypes() {
    var heart = TYPES.filter(function (t) { return t.group === 'heart'; });
    var html = '<p class="eyebrow">《分别相品》</p><h1>十九种人</h1>' +
      '<p class="lead">法师说法之前先观察学人的性情：以贪、瞋、痴三毒分出七种心性，又以口（说话方式）与心（内心所怀）是否一致，分出十二种口心组合，合为十九种。</p>' +
      '<h2>心性七型</h2><div class="grid-cards">' + heart.map(miniCard).join('') + '</div>' +
      '<h2>口心十二型</h2><p>横看心里所怀，竖看嘴上怎么说。注意：这里的“心婬／心欲”指心软、重情、对人好，不是好色。</p>' +
      '<div class="matrix-wrap"><div class="matrix" role="group" aria-label="口心十二型：口业 × 心性">' +
        '<div class="hd" aria-hidden="true"></div>' + MATRIX_COLS.map(function (c) { return '<div class="hd" aria-hidden="true">' + esc(c) + '</div>'; }).join('') +
        MATRIX.map(function (row) {
          return '<h3 class="hd row-hd">' + esc(row.label) + '</h3>' + row.ids.map(function (id) {
            var t = typeById(id); return t ? miniCard(t) : '<div></div>';
          }).join('');
        }).join('') +
      '</div></div>';
    return { html: html, title: '十九种人' };
  }
  function miniCard(t) {
    return '<a class="mini-card" href="#/type/' + t.id + '"><div class="n">' + typeNumLabel(t.id) + '</div>' +
      '<div class="t" lang="zh-Hant">' + esc(t.name_trad) + '</div>' +
      '<div class="s">' + esc(t.name) + (t.alias && t.alias !== t.name_trad ? ' · ' + esc(t.alias) : '') + '</div>' +
      '<div class="d">' + esc(t.one_line) + '</div></a>';
  }

  function viewType(n) {
    var t = typeById(n);
    if (!t) return viewNotFound();
    var p = typeById(t.id - 1), q = typeById(t.id + 1);
    var html = '<p class="small"><a class="solo-link" href="#/types">← 十九种人</a></p>' + typeHead(t, 'h1') + typeDetail(t, 1) +
      '<div class="pager">' + (p ? '<a class="btn" href="#/type/' + p.id + '">← ' + typeNumLabel(p.id) + ' ' + esc(p.name_trad) + '</a>' : '<span></span>') +
      (q ? '<a class="btn" href="#/type/' + q.id + '">' + typeNumLabel(q.id) + ' ' + esc(q.name_trad) + ' →</a>' : '') + '</div>' +
      '<p class="center" style="margin-top:24px"><a class="btn btn-primary" href="#/quiz">测测我是哪一种</a></p>';
    return { html: html, title: typeNumLabel(t.id) + ' ' + t.name_trad };
  }

  /* ================= 修行法 ================= */
  // 说明文字里的维度键名（h_chen、jin 等）换成中文名称，不把内部键名露给读者
  var DIM_KEY_RE = /\b(?:[hmv]_[a-z]+|xin|jin|hui|zhi|yi)\b/g;
  function dimWords(s) {
    return String(s || '').replace(DIM_KEY_RE, function (k) { return DIM_LABEL[k] ? '“' + DIM_LABEL[k] + '”' : k; });
  }
  function targetsText(p) {
    return (p.targets || []).map(function (k) { return DIM_LABEL[k] || k; }).join('、');
  }
  function viewPractices() {
    var html = '<p class="eyebrow">对症下药</p><h1>修行法</h1>' +
      '<p class="lead">经文为不同的人开出不同的药：贪多观不净，瞋多修慈心，痴多观十二因缘，三毒俱重先诵经修福。以下 ' + PRACTICES.length + ' 种方法取自《修行道地经》与《达摩多罗禅经》。</p>' +
      '<div class="grid-cards">' + PRACTICES.map(function (p) {
        return '<a class="mini-card" href="#/practice/' + esc(p.id) + '"><div class="t">' + esc(p.name) + '</div>' +
          '<div class="s">对治：' + esc(targetsText(p)) + '</div>' +
          '<div class="d">' + esc(shorten(p.summary, 60)) + '</div></a>';
      }).join('') + '</div>';
    return { html: html, title: '修行法' };
  }
  function shorten(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  function viewPractice(id) {
    var p = PRACTICE[id];
    if (!p) return viewNotFound();
    var users = TYPES.filter(function (t) { return (t.practices || []).indexOf(id) >= 0; });
    var vUsers = VIRTUES.filter(function (v) { return (v.practices || []).indexOf(id) >= 0; });
    var html = '<p class="small"><a class="solo-link" href="#/practices">← 修行法</a></p><p class="eyebrow">修行法</p><h1>' + esc(p.name) + '</h1>' +
      '<p class="muted">对治：' + esc(targetsText(p)) + '</p>' +
      (p.targets_note ? '<p class="small muted">' + txt(dimWords(p.targets_note)) + '</p>' : '') +
      '<div class="detail-block"><h2>这是什么</h2><p>' + txt(p.summary) + '</p></div>' +
      '<div class="detail-block"><h2>经文出处</h2>' + (p.source || []).map(function (s) {
        return '<blockquote class="sutra">' + sutra(s.quote) + '<span class="cite">《' + esc(s.book) + '》〈' + esc(s.pin) + '〉</span></blockquote>';
      }).join('') + '</div>' +
      '<div class="detail-block"><h2>修法次第（依经文）</h2><ol class="advice-list">' + (p.steps || []).map(function (s) { return '<li>' + txt(s) + '</li>'; }).join('') + '</ol></div>';
    if (p.modern) {
      html += '<div class="detail-block"><h2>现代做法 ' + (p.modern.derived ? tag(false) : '') + '</h2>' +
        (p.modern.daily ? '<h3>每天怎么做</h3><p>' + txt(p.modern.daily) + '</p>' : '') +
        (p.modern.when ? '<h3>什么时候用</h3><p>' + txt(p.modern.when) + '</p>' : '') + '</div>';
    }
    if (p.cautions) html += '<div class="detail-block"><h2>注意</h2><p class="notice">' + txt(p.cautions) + '</p></div>';
    var pCards = CARDS.filter(function (c) { return (c.practices || []).indexOf(id) >= 0; });
    if (pCards.length) html += '<div class="detail-block"><h2>相关书卡</h2>' +
      miniReadingList(pCards.map(function (c) { return { card: c }; })) + '</div>';
    if (users.length) html += '<div class="detail-block"><h2>推荐给</h2><ul class="practice-links">' + users.map(function (t) {
      return '<li><a class="chip" href="#/type/' + t.id + '">' + typeNumLabel(t.id) + ' ' + esc(t.name_trad) + '</a></li>';
    }).join('') + (vUsers.map(function (v) { return '<li><a class="chip" href="#/virtues/' + esc(v.id) + '">培养「' + esc(v.name) + '」</a></li>'; }).join('')) + '</ul></div>';
    return { html: html, title: p.name };
  }

  /* ================= 五德 ================= */
  function viewVirtues(arg) {
    var q = ABOUT.closing && ABOUT.closing.quotes && ABOUT.closing.quotes[2];
    var html = '<p class="eyebrow">能顺道修行的五种品质</p><h1>五德</h1>' +
      '<p class="lead">经文问：谁能顺道修行？答：有信、精进、智慧、无谄（质直）、有志（心坚强）的人。</p>' +
      (q ? '<blockquote class="sutra">' + sutra(q.quote) + '<span class="cite">' + esc(q.pin) + '</span></blockquote>' : '') +
      '<nav class="practice-links" aria-label="五德目录">' + VIRTUES.map(function (v) { return '<a class="chip" href="#/virtues/' + esc(v.id) + '" data-jump="v-' + esc(v.id) + '">' + esc(v.name) + '</a>'; }).join('') + '</nav>';
    html += VIRTUES.map(function (v) {
      return '<section class="section" id="v-' + esc(v.id) + '"><h2>' + esc(v.name) + (v.alias ? '<span class="muted small">（' + esc(v.alias) + '）</span>' : '') + '</h2>' +
        '<p class="block-label">经文定义 ' + tag(v.sutra_def.explicit) + '</p>' +
        '<blockquote class="sutra">' + sutra(v.sutra_def.quote) + '<span class="cite">' + esc(v.sutra_def.pin) + '</span></blockquote>' +
        (v.sutra_def.note ? '<p class="small muted">' + txt(v.sutra_def.note) + '</p>' : '') +
        '<p>' + txt(v.plain) + '</p>' +
        '<h3>反面：' + esc(v.fault.name) + ' ' + tag(v.fault.explicit) + '</h3>' +
        (v.fault.quote ? '<blockquote class="sutra">' + sutra(v.fault.quote) + '<span class="cite">' + esc(v.fault.pin || '') + '</span></blockquote>' : '') +
        (v.fault.note ? '<p class="small muted">' + txt(v.fault.note) + '</p>' : '') +
        '<h3>怎样培养</h3><ul class="advice-list">' + (v.grow || []).map(function (g) { return '<li>' + txt(g) + '</li>'; }).join('') + '</ul>' +
        '<h3>相应的修行法</h3>' + practiceChips(v.practices) +
        (v.practices_note ? '<p class="small muted">' + txt(v.practices_note) + '</p>' : '') +
      '</section>';
    }).join('');
    return { html: html, title: '五德', keepScroll: !!arg, noFocus: !!arg, after: function () {
      // #/virtues/<id>：直接定位到该德
      var sec = arg ? document.getElementById('v-' + arg) : null;
      if (sec) {
        sec.scrollIntoView({ block: 'start' });
        var sh = sec.querySelector('h2'); sh.setAttribute('tabindex', '-1');
        try { sh.focus({ preventScroll: true }); } catch (x) { /* 忽略 */ }
      } else if (arg) { window.scrollTo(0, 0); }
      Array.prototype.forEach.call(app.querySelectorAll('[data-jump]'), function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var el = document.getElementById(a.getAttribute('data-jump'));
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var h = el.querySelector('h2'); h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (x) { /* 忽略 */ } }
        });
      });
    } };
  }

  /* ================= 关于 ================= */
  function viewAbout() {
    var c = ABOUT.closing || {};
    var html = '<p class="eyebrow">关于</p><h1>关于与免责声明</h1>' +
      '<section class="section" id="disclaimer"><h2>免责声明</h2><p class="notice">' + txt(ABOUT.disclaimer) + '</p></section>' +
      '<section class="section"><h2>关于两部经</h2><p>' + txt(ABOUT.about_sutra) + '</p></section>' +
      '<section class="section"><h2>测评怎样分类</h2><p>' + txt(ABOUT.how_it_works) + '</p>' +
        '<p>计分方式：每道“像不像我”的题，按 1–5 分减去中间值 3 再乘以权重（反向题取反）；情境选择题计入所选选项的分数；跳过的题和选“以上都不像我”的题不计分，也不计入换算的上下限。每个维度在“平时”与“压力下”两种情境中分别换算为 0–100。三毒中与最高分相差不超过 ' + S.GAP + ' 分、且不低于 ' + S.FLOOR + ' 分的记为“突出”；若都不到门槛，取最高的一项。这些门槛是本站为了分类而设的约定，不是经文的规定。</p></section>' +
      (ABOUT.readings_sources ? '<section class="section" id="readings-sources"><h2>书单的来源与核对</h2>' + String(ABOUT.readings_sources).split('\n').map(function (p) { return '<p>' + txt(p) + '</p>'; }).join('') +
        '<p><a class="solo-link" href="#/readings">打开书单 →</a></p></section>' : '') +
      '<section class="section"><h2>隐私</h2><p>本站是纯静态网页，不收集任何数据。你的答案和你在情境题下写的真实反应，只保存在你自己浏览器的本地存储里（无法保存时也能正常答题，只是刷新后不能续答）。分享链接只包含各项分数和测评版本，不含逐题答案，也不含任何文字。清除浏览器中本站的数据，或在测评页点“清空答案，重新开始”，即可删除它们。</p></section>' +
      aboutAiSection() +
      '<section class="section"><h2>出处与体例</h2><p>' + txt(ABOUT.sources) + '</p>' +
        '<p class="small muted">标注说明：<span class="tag tag-explicit">经文明说</span> 指经文直接说出的内容；<span class="tag tag-derived">依经文通则推出</span> 指经文没有直说、本站依经文的一般原则推出的内容；体貌与果报的描述反映古代印度观念，仅供了解。</p></section>';
    if (c.quotes && c.quotes.length) {
      html += '<section class="section"><h2>结语</h2>' + c.quotes.map(function (q) {
        return '<blockquote class="sutra">' + sutra(q.quote) + '<span class="cite">' + esc(q.pin) + '</span></blockquote>';
      }).join('') + '<p>' + txt(c.plain) + '</p></section>';
    }
    return { html: html, title: '关于' };
  }

  function aboutAiSection() {
    if (!AI) return '';
    return '<section class="section" id="about-ai"><h2>AI 深度分析与隐私</h2>' +
      '<p>结果页有一节“AI 深度分析（选用）”，借助 AI 读一读你在情境题下写的真实反应：文字背后可能的情绪、需要和用意，与选择题结果哪里一致、哪里不一致，以及可以从哪种修行法、哪部书入手。它是选用的，不用也完全不影响测评结果。</p>' +
      '<ul class="advice-list">' +
        '<li><strong>复制给 AI</strong>：网站把分析说明、测评结果摘要和你的情境题作答打包成一段文字，放进你的剪贴板；粘贴到哪个 AI 助手、要不要粘贴，都由你决定。这一步不经过本站的任何服务器。</li>' +
        '<li><strong>网站内分析</strong>：' + (AI_ENDPOINT ? '本站已开通。' : '本站目前没有开通；开通后结果页才会出现这个按钮。') +
          '只有在你勾选同意并点击之后，才会把你写的文字和本次测评结果经本站的转发服务发给第三方 AI 服务商做一次分析；本站不保存这些内容。</li>' +
      '</ul>' +
      '<p>' + esc(AI.privacy) + '</p>' +
      '<p class="notice">' + esc(AI.disclaimer) + '</p>' +
      '<p class="small muted">如果你写下的文字流露出很沉重的念头，答题页和分析结果都会先显示求助信息：美国可拨打或发短信 988；台湾可拨打 1925 安心专线；其他地区可在 <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a> 查找当地热线；有紧急危险时请拨 911 或当地急救电话。</p>' +
    '</section>';
  }

  function viewNotFound() {
    return { html: '<h1>找不到这个页面</h1><p><a class="solo-link" href="#/">回首页</a></p>', title: '找不到页面' };
  }

  var VIEWS = {
    home: viewHome, quiz: viewQuiz, result: viewResult, types: viewTypes, type: viewType,
    practices: viewPractices, practice: viewPractice, readings: viewReadings, virtues: viewVirtues, about: viewAbout
  };

  /* ================= 启动 ================= */
  function boot() {
    app = document.getElementById('app');
    initTheme();
    initTooltip();
    // 打印前展开所有折叠内容（表格视图、分区说明）
    window.addEventListener('beforeprint', function () {
      Array.prototype.forEach.call(document.querySelectorAll('details'), function (d) { d.setAttribute('data-was-open', d.open ? '1' : '0'); d.open = true; });
    });
    window.addEventListener('afterprint', function () {
      Array.prototype.forEach.call(document.querySelectorAll('details[data-was-open]'), function (d) { d.open = d.getAttribute('data-was-open') === '1'; d.removeAttribute('data-was-open'); });
    });
    var skip = document.getElementById('skip-link');
    if (skip) skip.addEventListener('click', function (e) { e.preventDefault(); app.focus(); });
    if (!S) { app.innerHTML = '<div class="wrap"><p class="notice">计分模块未载入，请确认 assets/scoring.js 存在。</p></div>'; return; }
    window.addEventListener('hashchange', render);
    // 离开或切到后台时，把还在等待写入的“真实反应”立即存下
    window.addEventListener('pagehide', flushText);
    // 另一个标签页改了答案或文字：丢掉内存里的副本，下次使用时重新读取（不打断正在显示的页面）
    window.addEventListener('storage', function (e) {
      if (e.key === STORE_QUIZ || e.key === STORE_TEXT || e.key === null) { flushText(); quiz = null; }
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushText(); });
    // 点当前已打开的书卡标题（hash 不变，不会触发 hashchange）：重新定位并聚焦该书卡
    app.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#/readings/"]') : null;
      if (!a || a.getAttribute('href') !== location.hash) return;
      var c = cardById(a.getAttribute('href').split('/').pop());
      var card = c ? document.getElementById('card-' + c.id) : null;
      if (!card || card.hidden) return;
      e.preventDefault();
      card.scrollIntoView({ block: 'start' });
      try { card.focus({ preventScroll: true }); } catch (x) { card.focus(); }
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
