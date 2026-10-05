# 十九种人 · 静态网站

依《修行道地经·分别相品》的“十九种人”编写的自我观察问卷。纯静态网站：没有构建步骤、没有框架、没有外部 JS 库，只从 Google Fonts 加载字体（加载失败时自动退回系统字体）。直接双击 `index.html`（file://）也能完整使用。

在线地址：<https://hmpbikes.github.io/Dharma/>

## 目录结构

```
index.html            页面骨架（页眉、导航、页脚、内联 SVG 图标）
assets/style.css      样式（纸墨风格；颜色全部是 :root 上的 CSS 变量，含深色模式与打印样式）
assets/app.js         单页应用：hash 路由、答题、结果页、图表、各内容页
assets/scoring.js     计分模块（UMD：浏览器为 window.Scoring，node 下 module.exports）
data/*.js             由 tools/build-data.js 生成的数据文件（window.QUESTIONS 等），请勿手改
content/*.json        题库与内容的源文件（JSON），修改内容请改这里
tools/build-data.js   把 content/*.json 包装成 data/*.js，并做一致性检查
.nojekyll             告诉 GitHub Pages 不要用 Jekyll 处理
```

`content/` 目录是数据的唯一源文件，`tools/build-data.js` 需要它来重新生成 `data/`，所以保留。网站运行时只读取 `data/*.js`，不读取 `content/`。

### 页面路由

| 地址 | 内容 |
| --- | --- |
| `#/` | 首页 |
| `#/quiz` | 答题（一屏一题，可返回上一题，键盘 1–5 选择、← → 翻题） |
| `#/result/<编码>` | 结果页（编码只含各项分数，不含逐题答案）；两型详解之后是“你的宜闻之法”，合并两型书单 |
| `#/types`、`#/type/<n>` | 十九种总览、单型详情（“法师开的药”之后为“法师宜说之法”：经中说法、宜怎样说、宜闻之法书卡、读经提醒） |
| `#/practices`、`#/practice/<id>` | 修行法列表、修行法详情 |
| `#/readings`、`#/readings/<书卡 id>` | 书单（法师宜说之法）：按七个主题列出全部书卡，可按三毒、口业、五德筛选（筛选条件存在 localStorage）；带 id 时直接定位并聚焦该书卡，已合并的旧 id 也能打开 |
| `#/virtues`、`#/virtues/<id>` | 五德（`<id>` 为 `xin jin hui zhi yi`，直接定位到该德） |
| `#/about` | 关于与免责声明 |

## 部署到 GitHub Pages

本仓库已部署在 <https://hmpbikes.github.io/Dharma/>：仓库根目录就是网站根目录（`index.html` 在根目录），推送到 `main` 分支后一两分钟内自动更新。

若要另建一份：

1. 在 GitHub 新建一个公开仓库，把本仓库的**全部内容**推送上去（`index.html` 必须在仓库根目录）。
2. 打开仓库的 **Settings → Pages**，在 **Build and deployment** 中把 Source 设为 **Deploy from a branch**，Branch 选 `main`、目录选 `/ (root)`，点 **Save**。
3. 等一两分钟，页面顶部会显示网址，形如 `https://<用户名>.github.io/<仓库名>/`。

本站全部使用相对路径和 hash 路由，放在子路径下也能正常工作，不需要额外配置 404 页面。

## 绑定自定义域名（CNAME）

1. 在仓库根目录（与 `index.html` 同级）新建文件 `CNAME`，内容只有一行，即你的域名，例如：
   ```
   quiz.example.com
   ```
   提交并推送。也可以在 **Settings → Pages → Custom domain** 里直接填写域名，GitHub 会自动生成这个文件。
2. 到域名服务商的 DNS 设置中添加记录：
   - **子域名**（如 `quiz.example.com`）：添加一条 `CNAME` 记录，主机名 `quiz`，指向 `<你的用户名>.github.io`。
   - **根域名**（如 `example.com`）：添加四条 `A` 记录，指向
     `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`；
     如需 IPv6，再添加 `AAAA` 记录 `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`。
     建议同时为 `www` 添加一条指向 `<你的用户名>.github.io` 的 `CNAME` 记录。
3. DNS 生效后（几分钟到 24 小时），回到 **Settings → Pages**，等域名检查通过，勾选 **Enforce HTTPS**。
4. 建议在 GitHub 账户的 **Settings → Pages** 中验证域名，防止域名被他人仓库占用。

部署到其他静态托管（自己的服务器、Netlify、Cloudflare Pages 等）时，把这些文件原样上传到网站根目录即可，不需要任何构建命令。

## 修改题目和内容

1. 编辑 `content/` 中对应的 JSON 文件：
   - `questions.json`：题库。每题字段：
     - `id`：题号，不可重复；
     - `section` / `context`：`normal`（平时的我）或 `stress`（压力大、被冒犯时的我）；
     - `format`：`likert`（五级“像不像我”）或 `choice`（情境选择）；
     - likert 题：`weights` 为各维度权重，`reverse: true` 表示反向计分；
     - choice 题：`options` 为选项数组，每项的 `weights` 即选中后计入的分数，`{}` 表示中性选项；
     - 维度键名固定为 `h_tan h_chen h_chi`（三毒）、`m_rou m_cu m_chi`（口业）、`v_xin v_jin v_hui v_zhi v_yi`（五德）。
   - `types_1_7.json`、`types_8_13.json`、`types_14_19.json`：十九种的经文、白话、譬喻、优点提醒、体貌、果报、药方、推荐修行法与现代建议。`practices` 是推荐修行法 id 列表；其中经文没有直接给这一型开、由本站依经文通则搭配的，同时列入 `practices_derived`，页面上会标“推”。
   - `practices.json`、`virtues.json`、`about.json`：修行法、五德、关于页（`about.json` 的 `readings_sources` 是关于页“书单的来源与核对”一段，用换行分段）。
   - `teachings.json`：“法师宜说之法”与书单，生成 `data/teachings.js`（`window.TEACHINGS`）。结构：
     - `intro`：书单页导语与一句经文（`quote.text` / `quote.where`）；
     - `themes`：七个主题 `{key, name, plain}`，书单页按书卡 `themes` 的第一项分组；
     - `cards`：书卡。`id` 唯一；`title`（简体名）、`title_trad`（繁体原名，作副标题）、`book`（CBETA 文件号，语料外的典籍为 `null`）、`canon`、`section`、`tradition`（汉传 / 南传对应 / 藏传 / 通用）、`parallels`（南传等对应经号，只作对照）、`level`（入门 / 进阶 / 深入）、`themes`、`targets`（`dims` 用 `h_* m_*` 键、`virtues` 用五德 id、`types` 为类型编号，供书单页筛选）、`why`（书单页显示的说明）、`key_quote`（`{text, where}`；语料外的“延伸参考”为 `null`，并在 `note` 写明原文未在本站核对）、`more_quotes`、`read_guide`（先读哪一段）、`length_hint`（篇幅）、`practices`（修行法 id）、`derived`（`true` 表示“这部书适合这一型”是本站判断，页面标“本站推出”；`false` 表示经论本身明说此法对治某毒，页面标“经论明说”）、`basis`（`derived` 为 `false` 时引出的那句原文）、`note`；
     - `card_aliases`：已合并书卡的旧 id → 新 id，旧链接 `#/readings/<旧 id>` 仍可打开；
     - `types`：`"1"`–`"19"`，每型有 `teach_explicit`（经中说法：`quote`、`where`、`explicit`、`plain`）、`approach`（宜怎样说：`text`、`quote`、`where`、`derived`，`derived` 的标“推”）、`readings`（`[{id, for_this}]`，`for_this` 是为此型写的推荐理由）、`first`（标“先读”的书卡 id，须在 `readings` 中）、`caution`；
     - `combos_note`：结果页合并规则的说明。结果页“你的宜闻之法”按此实现（`assets/app.js` 的 `combineReadings`）：先取心性类型书单前 5 部，再按口心类型书单顺序补入未出现的书卡，合计最多 8 部；同一书卡只列一次，保留心性类型的推荐理由，“先读”用心性类型的 `first`；其余放在“更多”中。
     - 所有引文（`key_quote`、`more_quotes`、`basis`、`teach_explicit.quote`、`approach[].quote`）都须逐字出自 CBETA 原文，`where` 按原文的卷名与品名 / 经名填写。
2. 在站点根目录（即 `index.html` 所在目录）下运行（需要 Node.js，无需安装任何依赖）：
   ```bash
   node tools/build-data.js
   ```
   脚本会检查 JSON 是否合法、十九种是否齐全、修行法 id 是否存在、维度键名是否正确；对 `teachings.json` 还检查十九种齐全、书卡 id 唯一、`readings` 与 `first` 引用的书卡存在（`first` 须在 `readings` 中）、书卡的修行法 id / 主题 / 维度 / 五德合法、别名指向存在的书卡，然后重写 `data/*.js`。有问题时会列出并中止，不会写入。
3. 刷新浏览器查看效果，确认无误后提交推送。

注意：经文引文必须逐字出自 CBETA 原文；依经文通则推出、经文没有直说的内容，请在对应字段（`explicit` / `derived`）或文字中注明。

## 修改阈值与计分

阈值是 `assets/scoring.js` 顶部的常量：

```js
var GAP = 12;    // 与三毒最高分相差不超过 GAP，视为“并列突出”
var FLOOR = 45;  // 低于 FLOOR 的不算突出（若三项都低于门槛，取最高的一项）
var LIKERT_MID = 3;
var CODE_VERSION = '1';
```

- 调大 `GAP`，两毒、三毒并具（第 4–7 种）会更常见；调小则单一类型（第 1–3 种）更常见。
- 调高 `FLOOR`，需要更高的分数才算“突出”。
- 计分规则：likert 贡献 = (值 − 3) × 权重，反向题取反；choice 题取所选项的 weights。每个维度、每个 context 分别按题库逐题算出的最小 / 最大可能值归一化为 0–100（有未答题时只按已答题计算）。
- 分享链接只保存分数，类型在打开时由分数按当前阈值重新推出。如果修改了维度或编码方式，请把 `CODE_VERSION` 加 1，旧链接会显示“无法读取结果”，而不会显示错误的结果。

用 node 自测计分：

```bash
node -e "
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync('data/questions.js','utf8'),c);
const S=require('./assets/scoring.js');const Q=c.window.QUESTIONS.questions;const a={};
Q.forEach(q=>a[q.id]=q.format==='choice'?0:4);console.log(S.score(a,Q));"
```

## 隐私

答案只保存在访问者自己浏览器的 localStorage 中（所有读写都有容错，存储不可用时也能答题，只是刷新后不能续答）。网站没有服务器端程序，不收集任何数据。
