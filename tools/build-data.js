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
if (problems.length) {
  console.error('数据检查发现问题：\n  ' + problems.join('\n  '));
  process.exit(1);
}

write('questions.js', 'QUESTIONS', questions, 'content/questions.json');
write('types.js', 'TYPES', types, 'content/types_1_7.json + types_8_13.json + types_14_19.json');
write('practices.js', 'PRACTICES', practices, 'content/practices.json');
write('virtues.js', 'VIRTUES', virtues, 'content/virtues.json');
write('about.js', 'ABOUT', about, 'content/about.json');
console.log('完成：' + questions.questions.length + ' 题，' + types.length + ' 种类型，' +
  practices.length + ' 种修行法，' + virtues.length + ' 德。');
