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
| `#/result/<编码>` | 结果页（编码只含各项分数，不含逐题答案） |
| `#/types`、`#/type/<n>` | 十九种总览、单型详情 |
| `#/practices`、`#/practice/<id>` | 修行法列表、修行法详情 |
| `#/virtues`、`#/virtues/<id>` | 五德（`<id>` 为 `xin jin hui zhi yi`，直接定位到该德） |
| `#/about` | 关于与免责声明 |

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库（例如 `shijiuzhong`）。
2. 把 `site/` 目录里的**全部内容**（`index.html` 必须在仓库根目录）提交并推送：
   ```bash
   cd site
   git init
   git add .
   git commit -m "十九种人 网站"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/shijiuzhong.git
   git push -u origin main
   ```
   如果网站放在已有仓库的子目录中，也可以在下一步选择 `/docs` 目录，把这些文件放进 `docs/`。
3. 打开仓库的 **Settings → Pages**，在 **Build and deployment** 中把 Source 设为 **Deploy from a branch**，Branch 选 `main`、目录选 `/ (root)`（或 `/docs`），点 **Save**。
4. 等一两分钟，页面顶部会显示网址，形如 `https://<你的用户名>.github.io/shijiuzhong/`。

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
   - `practices.json`、`virtues.json`、`about.json`：修行法、五德、关于页。
2. 在 `site/` 目录下运行（需要 Node.js，无需安装任何依赖）：
   ```bash
   node tools/build-data.js
   ```
   脚本会检查 JSON 是否合法、十九种是否齐全、修行法 id 是否存在、维度键名是否正确，然后重写 `data/*.js`。有问题时会列出并中止，不会写入。
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
