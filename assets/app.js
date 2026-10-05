/*
 * 十九种人 · 单页应用
 * 依赖：data/*.js（window.QUESTIONS / TYPES / PRACTICES / VIRTUES / ABOUT）与 assets/scoring.js（window.Scoring）
 * 无框架、无外部库；hash 路由，file:// 直接打开也能用。
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

  var STORE_QUIZ = 'shijiuzhong.quiz.v1';
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
    var saved = loadQuiz();
    var answered = saved ? countAnswered(saved.answers) : 0;
    var last = storageGet(STORE_LAST);
    var lastValid = typeof last === 'string' && S && S.decode(last);
    var q = (ABOUT.closing && ABOUT.closing.quotes && ABOUT.closing.quotes[1]) || null;
    var actions = '';
    if (answered > 0 && answered < QUESTIONS.length) {
      actions += '<a class="btn btn-primary" href="#/quiz">继续答题（已答 ' + answered + ' / ' + QUESTIONS.length + '）</a>' +
        '<button type="button" class="btn" data-act="restart">重新开始</button>';
    } else {
      actions += '<button type="button" class="btn btn-primary" data-act="restart">开始测评</button>';
    }
    if (lastValid) actions += '<a class="btn btn-ghost" href="#/result/' + esc(last) + '">查看上次结果</a>';

    var html =
      '<section class="hero">' +
        '<svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 8a24 24 0 1 0 23 17" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3.5" fill="currentColor"/></svg>' +
        '<h1>' + esc(ABOUT.site_title || '十九种人') + '</h1>' +
        '<p class="tagline">' + esc(ABOUT.tagline || '') + '</p>' +
        '<div class="btn-row">' + actions + '</div>' +
        '<p class="meta-line">共 ' + QUESTIONS.length + ' 题，约 12–15 分钟。答案只保存在你自己的浏览器里。</p>' +
      '</section>' +
      '<section class="section"><p class="lead">' + txt(ABOUT.home_intro || '') + '</p></section>' +
      (q ? '<blockquote class="sutra quote-card">' + sutra(q.quote) + '<span class="cite">' + esc(q.pin) + '</span></blockquote>' : '') +
      '<section class="section"><h2>测评怎样分类</h2><p>' + txt(ABOUT.how_it_works || '') + '</p></section>' +
      '<section class="section"><h2>从这里开始了解</h2><div class="grid-cards">' +
        homeCard('#/types', '十九种人', '心性七型 × 口心十二型的经文原文与白话') +
        homeCard('#/practices', '修行法', '不净观、慈心、十二因缘、数息等 ' + PRACTICES.length + ' 种对治方法') +
        (CARDS.length ? homeCard('#/readings', '书单', '法师宜说之法：按类型推荐的 ' + CARDS.length + ' 部经论选段') : '') +
        homeCard('#/virtues', '五德', '信、精进、智慧、质直、有志') +
        homeCard('#/about', '关于与免责声明', '经文出处、测评的局限') +
      '</div></section>';
    return { html: html, title: '', after: bindRestart };
  }
  function homeCard(href, t, d) {
    return '<a class="mini-card" href="' + href + '"><div class="t">' + esc(t) + '</div><div class="d">' + esc(d) + '</div></a>';
  }
  function bindRestart() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-act="restart"]'), function (b) {
      b.addEventListener('click', function () {
        if (countAnswered((loadQuiz() || {}).answers) > 0 && !window.confirm('确定清空已作答的内容，重新开始吗？')) return;
        resetQuiz();
        if (parseRoute().name === 'quiz') render(); else location.hash = '#/quiz';
      });
    });
  }

  /* ================= 答题 ================= */
  var quiz = null;          // { answers: {id: value}, index: n }
  var advanceTimer = null;
  var keyHandler = null;

  function loadQuiz() {
    var s = storageGet(STORE_QUIZ);
    if (!s || typeof s !== 'object' || typeof s.answers !== 'object' || s.answers === null) return quiz;
    return s;
  }
  function saveQuiz() { if (quiz) storageSet(STORE_QUIZ, quiz); }
  function resetQuiz() {
    quiz = { answers: {}, index: 0 };
    storageDel(STORE_QUIZ);
  }
  function countAnswered(a) {
    if (!a) return 0;
    return QUESTIONS.filter(function (q) { return a[q.id] !== undefined && a[q.id] !== null; }).length;
  }
  function firstUnanswered(a) {
    for (var i = 0; i < QUESTIONS.length; i++) if (a[QUESTIONS[i].id] === undefined) return i;
    return -1;
  }
  function quizKeysOff() {
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  }

  function viewQuiz() {
    if (!QUESTIONS.length) return { html: '<h1>题库未载入</h1><p>请确认 data/questions.js 存在。</p>' };
    if (!quiz) quiz = loadQuiz() || { answers: {}, index: 0 };
    if (typeof quiz.index !== 'number' || quiz.index < 0 || quiz.index >= QUESTIONS.length) {
      var fu = firstUnanswered(quiz.answers);
      quiz.index = fu < 0 ? QUESTIONS.length - 1 : fu;
    }
    var focusQ = !firstRender;
    return { html: '<h1 class="sr-only">答题</h1><div class="quiz" id="quiz"></div>', title: '答题', after: function () {
      renderQuestion(focusQ);
      quizKeysOff();
      keyHandler = onQuizKey;
      document.addEventListener('keydown', keyHandler);
    }, noFocus: true };
  }

  function renderQuestion(focusQ) {
    var box = document.getElementById('quiz');
    if (!box) return;
    var i = quiz.index;
    var q = QUESTIONS[i];
    var sec = SECTION[q.section] || SECTION[q.context] || { title: q.context === 'stress' ? '压力下的我' : '平时的我', intro: '' };
    var answered = countAnswered(quiz.answers);
    var total = QUESTIONS.length;
    var val = quiz.answers[q.id];
    var prevQ = QUESTIONS[i - 1];
    var sectionStart = !prevQ || prevQ.section !== q.section;
    var secQs = QUESTIONS.filter(function (x) { return x.section === q.section; });
    var secPos = secQs.indexOf(q) + 1;
    var labels = (QDATA.scale && QDATA.scale.likert_labels) || ['完全不像我', '不太像我', '说不准', '比较像我', '非常像我'];

    var opts;
    if (q.format === 'choice') {
      opts = '<div class="choices" role="group" aria-label="选项">' + q.options.map(function (o, k) {
        var on = val === k;
        return '<button type="button" class="choice-btn" data-val="' + k + '" aria-pressed="' + on + '">' +
          '<span class="key" aria-hidden="true">' + (k + 1) + '</span><span>' + esc(o.text) + '</span></button>';
      }).join('') + '</div>';
    } else {
      opts = '<div class="likert" role="group" aria-label="符合程度">' + [1, 2, 3, 4, 5].map(function (v) {
        var on = val === v;
        return '<button type="button" class="likert-btn" data-val="' + v + '" aria-pressed="' + on + '">' +
          '<span class="key" aria-hidden="true">' + v + '</span><span>' + esc(labels[v - 1]) + '</span></button>';
      }).join('') + '</div>';
    }
    var isLast = i === total - 1;
    var allDone = answered === total;
    var nextLabel = isLast ? '查看结果' : '下一题';
    var nextEnabled = isLast ? allDone : val !== undefined;

    box.innerHTML =
      '<div class="progress">' +
        '<div class="progress-top"><span>' + esc(sec.title) + ' · 本部分第 ' + secPos + ' / ' + secQs.length + ' 题</span><span>已答 ' + answered + ' / ' + total + '</span></div>' +
        '<div class="progress-bar" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + answered + '">' +
          '<div class="progress-fill" style="width:' + (answered / total * 100).toFixed(1) + '%"></div></div>' +
      '</div>' +
      '<details class="section-info"' + (sectionStart && val === undefined ? ' open' : '') + '><summary>分区说明：' + esc(sec.title) + '</summary><p>' + esc(sec.intro || '') + '</p>' +
        (q.context === 'stress' ? '<p class="small">这一部分题目较少，结果中的“压力下”分数仅作参考。</p>' : '') + '</details>' +
      '<p class="eyebrow">第 ' + (i + 1) + ' 题' + (q.format === 'choice' ? ' · 选最接近的一项' : '') + '</p>' +
      '<h2 class="q-text" id="q-text" tabindex="-1">' + esc(q.text) + '</h2>' +
      opts +
      '<div class="quiz-nav">' +
        '<button type="button" class="btn" data-act="prev"' + (i === 0 ? ' disabled' : '') + '>← 上一题</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-act="restart">重新开始</button>' +
        '<button type="button" class="btn ' + (isLast ? 'btn-primary' : '') + '" data-act="next"' + (nextEnabled ? '' : ' disabled') + '>' + nextLabel + (isLast ? '' : ' →') + '</button>' +
      '</div>' +
      (isLast && !allDone ? '<p class="status-msg center">还有 ' + (total - answered) + ' 题未答。<button type="button" class="btn btn-small btn-ghost" data-act="jump">跳到未答的题</button></p>' : '') +
      '<p class="kbd-hint">键盘：数字键 1–' + (q.format === 'choice' ? q.options.length : 5) + ' 选择，← → 切换题目</p>';

    Array.prototype.forEach.call(box.querySelectorAll('[data-val]'), function (b) {
      b.addEventListener('click', function () { choose(Number(b.getAttribute('data-val'))); });
    });
    box.querySelector('[data-act="prev"]').addEventListener('click', prev);
    box.querySelector('[data-act="next"]').addEventListener('click', next);
    var jump = box.querySelector('[data-act="jump"]');
    if (jump) jump.addEventListener('click', function () { quiz.index = firstUnanswered(quiz.answers); saveQuiz(); renderQuestion(true); });
    bindRestart();
    if (focusQ) {
      var qt = document.getElementById('q-text');
      try { qt.focus({ preventScroll: true }); } catch (e) { qt.focus(); }
      window.scrollTo(0, 0);
    }
  }

  function choose(v) {
    var q = QUESTIONS[quiz.index];
    var max = q.format === 'choice' ? q.options.length - 1 : 5;
    var min = q.format === 'choice' ? 0 : 1;
    if (!(v >= min && v <= max)) return;
    quiz.answers[q.id] = v;
    saveQuiz();
    renderQuestion(false);
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      if (quiz.index < QUESTIONS.length - 1) { quiz.index += 1; saveQuiz(); renderQuestion(true); }
      else if (countAnswered(quiz.answers) === QUESTIONS.length) finish();
    }, 220);
  }
  function prev() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    if (quiz.index > 0) { quiz.index -= 1; saveQuiz(); renderQuestion(true); }
  }
  function next() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    var q = QUESTIONS[quiz.index];
    if (quiz.index === QUESTIONS.length - 1) {
      if (countAnswered(quiz.answers) === QUESTIONS.length) finish();
      return;
    }
    if (quiz.answers[q.id] === undefined) return;
    quiz.index += 1; saveQuiz(); renderQuestion(true);
  }
  function onQuizKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var q = QUESTIONS[quiz.index];
    if (/^[1-9]$/.test(e.key)) {
      var n = Number(e.key);
      if (q.format === 'choice') { if (n <= q.options.length) { e.preventDefault(); choose(n - 1); } }
      else if (n <= 5) { e.preventDefault(); choose(n); }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  }
  function finish() {
    var result = S.score(quiz.answers, QUESTIONS);
    var code = S.encode(result);
    storageSet(STORE_LAST, code);
    quiz.index = QUESTIONS.length - 1;
    saveQuiz();
    location.hash = '#/result/' + code;
  }

  /* ================= 图表 ================= */
  function fmt(v) { return typeof v === 'number' && isFinite(v) ? String(Math.round(v)) : '—'; }

  // 平时 / 压力并排条形图（单一坐标 0–100）
  function barChart(opts) {
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
      return '<div class="bar-row">' +
        '<div class="bar-label">' + esc(DIM_LABEL[k]) + '</div>' +
        '<div class="bar-tracks">' + line(n, 'normal', '平时', flagN) + line(s, 'stress', '压力下（参考）', flagS) + '</div>' +
      '</div>';
    }).join('');
    var table = '<details class="table-view"><summary>以表格查看</summary><table class="data-table"><thead><tr><th scope="col">维度</th><th scope="col" class="num">平时</th><th scope="col" class="num">压力下</th></tr></thead><tbody>' +
      opts.keys.map(function (k) {
        return '<tr><th scope="row">' + esc(DIM_LABEL[k]) + '<span class="muted small">　' + esc(DIM_HINT[k] || '') + '</span></th><td class="num">' + fmt(opts.normal && opts.normal[k]) + '</td><td class="num">' + fmt(opts.stress && opts.stress[k]) + '</td></tr>';
      }).join('') + '</tbody></table></details>';
    return '<div class="card chart-card">' +
      '<h3>' + esc(opts.title) + '</h3>' +
      '<ul class="legend" aria-label="图例"><li><span class="swatch swatch-normal" aria-hidden="true"></span>平时</li><li><span class="swatch swatch-stress" aria-hidden="true"></span>压力下（参考）</li></ul>' +
      '<div class="bars">' + rows + '</div>' +
      '<div class="bar-axis" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>' +
      '<p class="axis-note">' + esc(opts.note) + '</p>' + table +
    '</div>';
  }

  // 五德雷达图（手写 SVG）
  function radarChart(V) {
    var keys = S.VIRTUE;
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
        '<tspan class="lbl-v" dx="6">' + fmt(V[k]) + '</tspan></text>';
    }).join('');
    var ticks = [50, 100].map(function (g) { return '<text class="tick" x="' + (cx + 4) + '" y="' + (cy - R * g / 100 + 11).toFixed(1) + '">' + g + '</text>'; }).join('');
    var aria = '五德雷达图：' + keys.map(function (k) { return DIM_LABEL[k] + ' ' + fmt(V[k]); }).join('，');
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
    var ht = typeById(r.heartType), mt = typeById(r.mouthHeartType);
    var sht = typeById(r.stressHeartType), smt = typeById(r.stressMouthHeartType);
    var shareUrl = location.href.split('#')[0] + '#/result/' + code;

    var html = '<p class="eyebrow">测评结果</p><h1>你的十九种人结果</h1>' +
      '<p class="muted small">自评结果仅供自我观察，不是诊断；最好与了解你的老师或朋友一起对照。<a href="#/about">免责声明</a></p>';

    html += '<div class="type-cards">' + typeCard(ht, '心性类型', 'sec-heart') + typeCard(mt, '口心类型', 'sec-mouth') + '</div>';
    html += '<p class="no-print"><button type="button" class="btn btn-small btn-ghost" data-jump="sec-readings">看你的宜闻之法（推荐经论）↓</button></p>';

    // 图表
    html += '<section class="section"><h2>分数一览</h2><div class="chart-grid">' +
      barChart({
        title: '三毒（心性）', keys: S.HEART, normal: r.heart, stress: r.stress.heart,
        flags: { normal: r.elevated || [], stress: r.stressElevated || [] }, flagText: '突出', flagShort: '突出',
        floor: S.FLOOR,
        note: '0–100，按题库可能的最低与最高分换算。浅竖线为“突出”门槛 ' + S.FLOOR + '；与最高分相差不超过 ' + S.GAP + ' 且不低于门槛者记为突出。'
      }) +
      barChart({
        title: '口业（说话方式）', keys: S.MOUTH, normal: r.mouth, stress: r.stress.mouth,
        flags: { normal: [argmaxKey(r.mouth, S.MOUTH)], stress: [argmaxKey(r.stress.mouth, S.MOUTH)] }, flagText: '最高项', flagShort: '最高',
        note: '口柔、口粗、口痴中最高的一项，与心性最突出的一毒相配，得出口心类型。'
      }) +
    '</div></section>';

    // 五德
    var lowKey = argminKey(r.virtues, S.VIRTUE), highKey = argmaxKey(r.virtues, S.VIRTUE);
    var lowV = lowKey ? VIRTUE[lowKey.slice(2)] : null, highV = highKey ? VIRTUE[highKey.slice(2)] : null;
    html += '<section class="section"><h2>五德</h2>' +
      '<p class="muted small">经文说能顺道修行的五种品质：信、精进、智慧、质直（无谄）、有志（心坚强）。只在“平时的我”部分计分。</p>' +
      '<div class="card radar-wrap"><div>' + radarChart(r.virtues) +
      '<details class="table-view"><summary>以表格查看</summary><table class="data-table"><thead><tr><th scope="col">德</th><th scope="col" class="num">分数</th></tr></thead><tbody>' +
      S.VIRTUE.map(function (k) { return '<tr><th scope="row"><a href="#/virtues/' + k.slice(2) + '">' + esc(DIM_LABEL[k]) + '</a></th><td class="num">' + fmt(r.virtues[k]) + '</td></tr>'; }).join('') +
      '</tbody></table></details></div><div>' +
      (lowV ? '<p class="eyebrow">最需要培养</p><h3 style="margin-top:0">' + esc(lowV.name) + '（' + fmt(r.virtues[lowKey]) + '）</h3><p>' + txt(lowV.low_advice) + '</p>' +
        practiceChips(lowV.practices) : '') +
      (highV && highV !== lowV ? '<p class="note">你最强的一德是「' + esc(highV.name) + '」：' + txt(highV.high_note) + '</p>' : '') +
      '</div></div></section>';

    // 平时与压力对比
    html += '<section class="section"><h2>平时与压力下</h2><div class="card compare">' + compareText(r, ht, mt, sht, smt) + '</div></section>';

    // 完整内容
    html += '<section class="section" id="sec-heart"><h2 class="sr-only">心性类型详解</h2>' + typeHead(ht, 'h3') + typeDetail(ht, 3, { compactReadings: true }) +
      '<p><a href="#/type/' + ht.id + '">单独打开此型页面 →</a></p></section>';
    html += '<hr><section class="section" id="sec-mouth"><h2 class="sr-only">口心类型详解</h2>' + typeHead(mt, 'h3') + typeDetail(mt, 3, { compactReadings: true }) +
      '<p><a href="#/type/' + mt.id + '">单独打开此型页面 →</a></p></section>';

    // 你的宜闻之法（合并两型书单）
    html += resultReadingsSection(ht, mt);

    // 低分之德的培养方法
    if (lowV) {
      html += '<hr><section class="section"><h2>培养「' + esc(lowV.name) + '」</h2>' +
        '<blockquote class="sutra">' + sutra(lowV.sutra_def.quote) + '<span class="cite">' + esc(lowV.sutra_def.pin) + '</span></blockquote>' +
        '<ul class="advice-list">' + (lowV.grow || []).map(function (g) { return '<li>' + txt(g) + '</li>'; }).join('') + '</ul>' +
        '<p><a href="#/virtues/' + esc(lowV.id) + '">查看五德详解 →</a></p></section>';
    }

    // 分享
    html += '<section class="section share-section no-print"><h2>保存与分享</h2>' +
      '<p class="small muted">链接里只有各项分数，不含逐题答案；打开即可看到同样的结果。</p>' +
      '<div class="share-box"><label class="sr-only" for="share-url">结果链接</label><input id="share-url" type="text" readonly value="' + esc(shareUrl) + '">' +
      '<button type="button" class="btn btn-primary" id="copy-link" aria-label="复制结果链接">复制链接</button>' +
      '<button type="button" class="btn" id="print-btn" aria-label="打印或另存为 PDF">打印</button></div>' +
      '<p class="status-msg" id="copy-status" role="status" aria-live="polite"></p>' +
      '<div class="btn-row"><button type="button" class="btn btn-ghost" data-act="restart">重新测评</button><a class="btn btn-ghost" href="#/types">浏览十九种人</a></div>' +
    '</section>';

    return { html: html, title: '结果：' + ht.name_trad + ' · ' + mt.name_trad, after: function () {
      bindRestart();
      Array.prototype.forEach.call(app.querySelectorAll('[data-jump]'), function (b) {
        b.addEventListener('click', function () {
          var el = document.getElementById(b.getAttribute('data-jump'));
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var h = el.querySelector('h2:not(.sr-only), h3'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } } }
        });
      });
      var copy = document.getElementById('copy-link');
      var input = document.getElementById('share-url');
      var status = document.getElementById('copy-status');
      copy.addEventListener('click', function () {
        function done(ok) { status.textContent = ok ? '已复制到剪贴板。' : '复制失败，请长按或手动选中上面的链接复制。'; }
        function fallback() {
          try { input.focus(); input.select(); done(document.execCommand('copy')); } catch (e) { done(false); }
        }
        try {
          if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(input.value).then(function () { done(true); }, fallback);
          else fallback();
        } catch (e) { fallback(); }
      });
      input.addEventListener('focus', function () { input.select(); });
      document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
    } };
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
    var html = '<p class="small"><a href="#/types">← 十九种人</a></p>' + typeHead(t, 'h1') + typeDetail(t, 1) +
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
    var html = '<p class="small"><a href="#/practices">← 修行法</a></p><p class="eyebrow">修行法</p><h1>' + esc(p.name) + '</h1>' +
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
        '<p>计分方式：每道“像不像我”的题，按 1–5 分减去中间值 3 再乘以权重（反向题取反）；情境选择题计入所选选项的分数。每个维度在“平时”与“压力下”两种情境中分别换算为 0–100。三毒中与最高分相差不超过 ' + S.GAP + ' 分、且不低于 ' + S.FLOOR + ' 分的记为“突出”；若都不到门槛，取最高的一项。这些门槛是本站为了分类而设的约定，不是经文的规定。</p></section>' +
      (ABOUT.readings_sources ? '<section class="section" id="readings-sources"><h2>书单的来源与核对</h2>' + String(ABOUT.readings_sources).split('\n').map(function (p) { return '<p>' + txt(p) + '</p>'; }).join('') +
        '<p><a href="#/readings">打开书单 →</a></p></section>' : '') +
      '<section class="section"><h2>隐私</h2><p>本站是纯静态网页，没有服务器端程序，也不收集任何数据。你的答案只保存在你自己浏览器的本地存储里（无法保存时也能正常答题，只是刷新后不能续答）。分享链接只包含各项分数，不含逐题答案。</p></section>' +
      '<section class="section"><h2>出处与体例</h2><p>' + txt(ABOUT.sources) + '</p>' +
        '<p class="small muted">标注说明：<span class="tag tag-explicit">经文明说</span> 指经文直接说出的内容；<span class="tag tag-derived">依经文通则推出</span> 指经文没有直说、本站依经文的一般原则推出的内容；体貌与果报的描述反映古代印度观念，仅供了解。</p></section>';
    if (c.quotes && c.quotes.length) {
      html += '<section class="section"><h2>结语</h2>' + c.quotes.map(function (q) {
        return '<blockquote class="sutra">' + sutra(q.quote) + '<span class="cite">' + esc(q.pin) + '</span></blockquote>';
      }).join('') + '<p>' + txt(c.plain) + '</p></section>';
    }
    return { html: html, title: '关于' };
  }

  function viewNotFound() {
    return { html: '<h1>找不到这个页面</h1><p><a href="#/">回首页</a></p>', title: '找不到页面' };
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
