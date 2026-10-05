#!/usr/bin/env node
/*
 * 把 content/*.json 包装成 data/*.js（window.XXX = {...};），
 * 这样网站用 file:// 直接打开也能读到数据。
 *
 * 用法（在 site 目录下）：
 *   node tools/build-data.js
 * 可选：指定其他 JSON 来源目录
 *   node tools/build-data.js /path/to/json_dir
 */
'use strict';
const fs = require('fs');
const path = require('path');

const siteDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(process.argv[2] || path.join(siteDir, 'content'));
const outDir = path.join(siteDir, 'data');

function readJSON(name) {
  const file = path.join(srcDir, name);
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON 解析失败：' + file + '\n' + e.message);
    process.exit(1);
  }
}

function write(name, globalName, value, sourceNote) {
  const body =
    '/* 由 tools/build-data.js 自动生成，请勿手改。来源：' + sourceNote + ' */\n' +
    'window.' + globalName + ' = ' + JSON.stringify(value, null, 1) + ';\n';
  fs.writeFileSync(path.join(outDir, name), body, 'utf8');
  console.log('写入 data/' + name);
}

fs.mkdirSync(outDir, { recursive: true });

const questions = readJSON('questions.json');
const types = []
  .concat(readJSON('types_1_7.json'), readJSON('types_8_13.json'), readJSON('types_14_19.json'))
  .sort(function (a, b) { return a.id - b.id; });
const practices = readJSON('practices.json');
const virtues = readJSON('virtues.json');
const about = readJSON('about.json');
const teachings = readJSON('teachings.json');

// —— 基本一致性检查 ——
const problems = [];
const practiceIds = new Set(practices.map(function (p) { return p.id; }));
for (let i = 1; i <= 19; i++) {
  if (!types.find(function (t) { return t.id === i; })) problems.push('缺少第 ' + i + ' 种');
}
types.forEach(function (t) {
  (t.practices || []).concat(t.practices_derived || []).forEach(function (pid) {
    if (!practiceIds.has(pid)) problems.push('第 ' + t.id + ' 种引用了不存在的修行法 ' + pid);
  });
});
virtues.forEach(function (v) {
  (v.practices || []).forEach(function (pid) {
    if (!practiceIds.has(pid)) problems.push('五德 ' + v.id + ' 引用了不存在的修行法 ' + pid);
  });
});
const seen = new Set();
const DIMS = new Set(['h_tan', 'h_chen', 'h_chi', 'm_rou', 'm_cu', 'm_chi',
  'v_xin', 'v_jin', 'v_hui', 'v_zhi', 'v_yi']);
function checkWeights(id, w) {
  Object.keys(w || {}).forEach(function (d) {
    if (!DIMS.has(d)) problems.push(id + ' 使用了未知维度 ' + d);
    if (typeof w[d] !== 'number') problems.push(id + ' 的权重 ' + d + ' 不是数字');
  });
}
(questions.questions || []).forEach(function (q) {
  if (seen.has(q.id)) problems.push('题号重复 ' + q.id);
  seen.add(q.id);
  if (q.context !== 'normal' && q.context !== 'stress') problems.push(q.id + ' 的 context 应为 normal 或 stress');
  if (q.format === 'likert') {
    if (!q.weights) problems.push(q.id + ' 缺少 weights');
    checkWeights(q.id, q.weights);
  } else if (q.format === 'choice') {
    if (!(q.options && q.options.length)) problems.push(q.id + ' 缺少 options');
    (q.options || []).forEach(function (o, i) { checkWeights(q.id + ' 选项' + (i + 1), o.weights); });
  } else {
    problems.push(q.id + ' 的 format 应为 likert 或 choice');
  }
});
// —— 法师宜说之法 / 书单（teachings.json）——
(function checkTeachings(T) {
  const cards = Array.isArray(T.cards) ? T.cards : [];
  if (!cards.length) problems.push('teachings.json 缺少 cards');
  const themeKeys = new Set((T.themes || []).map(function (th) { return th.key; }));
  const cardIds = new Set();
  const HEART_MOUTH = new Set(['h_tan', 'h_chen', 'h_chi', 'm_rou', 'm_cu', 'm_chi']);
  const VIRTUE_IDS = new Set(virtues.map(function (v) { return v.id; }));
  cards.forEach(function (c, i) {
    const label = '书卡 ' + (c.id || '#' + (i + 1));
    if (!c.id) problems.push('第 ' + (i + 1) + ' 张书卡缺少 id');
    else if (cardIds.has(c.id)) problems.push('书卡 id 重复 ' + c.id);
    cardIds.add(c.id);
    if (!c.title) problems.push(label + ' 缺少 title');
    if (!(c.themes && c.themes.length)) problems.push(label + ' 缺少 themes');
    (c.themes || []).forEach(function (k) { if (!themeKeys.has(k)) problems.push(label + ' 使用了未知主题 ' + k); });
    (c.practices || []).forEach(function (pid) {
      if (!practiceIds.has(pid)) problems.push(label + ' 引用了不存在的修行法 ' + pid);
    });
    const tg = c.targets || {};
    (tg.dims || []).forEach(function (k) { if (!HEART_MOUTH.has(k)) problems.push(label + ' 使用了未知维度 ' + k); });
    (tg.virtues || []).forEach(function (k) { if (!VIRTUE_IDS.has(k)) problems.push(label + ' 使用了未知五德 ' + k); });
    (tg.types || []).forEach(function (n) { if (!(n >= 1 && n <= 19)) problems.push(label + ' 的 targets.types 含无效类型 ' + n); });
    if (typeof c.derived !== 'boolean') problems.push(label + ' 的 derived 应为 true 或 false');
    if (c.key_quote !== null && !(c.key_quote && c.key_quote.text)) problems.push(label + ' 的 key_quote 应为 {text, where} 或 null');
  });
  Object.keys(T.card_aliases || {}).forEach(function (a) {
    if (cardIds.has(a)) problems.push('别名 ' + a + ' 与书卡 id 重复');
    if (!cardIds.has(T.card_aliases[a])) problems.push('别名 ' + a + ' 指向不存在的书卡 ' + T.card_aliases[a]);
  });
  const TT = T.types || {};
  for (let i = 1; i <= 19; i++) {
    const t = TT[i];
    if (!t) { problems.push('teachings.json 缺少第 ' + i + ' 种'); continue; }
    if (!(t.teach_explicit && t.teach_explicit.plain)) problems.push('teachings 第 ' + i + ' 种缺少 teach_explicit');
    if (!(t.approach && t.approach.length)) problems.push('teachings 第 ' + i + ' 种缺少 approach');
    const rids = (t.readings || []).map(function (r) { return r.id; });
    if (!rids.length) problems.push('teachings 第 ' + i + ' 种缺少 readings');
    const seenR = new Set();
    rids.forEach(function (rid) {
      if (!cardIds.has(rid)) problems.push('teachings 第 ' + i + ' 种的 readings 引用了不存在的书卡 ' + rid);
      if (seenR.has(rid)) problems.push('teachings 第 ' + i + ' 种的 readings 重复列出 ' + rid);
      seenR.add(rid);
    });
    if (!t.first) problems.push('teachings 第 ' + i + ' 种缺少 first');
    else if (!cardIds.has(t.first)) problems.push('teachings 第 ' + i + ' 种的 first 引用了不存在的书卡 ' + t.first);
    else if (rids.indexOf(t.first) < 0) problems.push('teachings 第 ' + i + ' 种的 first 不在其 readings 中');
  }
  Object.keys(TT).forEach(function (k) {
    if (!(/^\d+$/.test(k) && Number(k) >= 1 && Number(k) <= 19)) problems.push('teachings.types 含无效键 ' + k);
  });
})(teachings);

if (problems.length) {
  console.error('数据检查发现问题：\n  ' + problems.join('\n  '));
  process.exit(1);
}

write('questions.js', 'QUESTIONS', questions, 'content/questions.json');
write('types.js', 'TYPES', types, 'content/types_1_7.json + types_8_13.json + types_14_19.json');
write('practices.js', 'PRACTICES', practices, 'content/practices.json');
write('virtues.js', 'VIRTUES', virtues, 'content/virtues.json');
write('about.js', 'ABOUT', about, 'content/about.json');
write('teachings.js', 'TEACHINGS', teachings, 'content/teachings.json');
console.log('完成：' + questions.questions.length + ' 题，' + types.length + ' 种类型，' +
  practices.length + ' 种修行法，' + virtues.length + ' 德，' + teachings.cards.length + ' 张书卡。');
