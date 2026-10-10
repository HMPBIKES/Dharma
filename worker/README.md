# 网站内 AI 分析 · 后端部署说明

这个文件夹是“十九种人”网站“网站内直接分析”功能的后端：一个跑在 Cloudflare 上的小程序（Cloudflare 叫它 Worker）。
网站本身是纯静态的，不能直接保管 API 密钥；所以由这个 Worker 替网站去调用 Anthropic 的 API，**密钥只存在 Cloudflare 里，不会出现在网站代码或 GitHub 仓库中**。

不部署它也没关系：网站上的“复制给 AI”不需要任何后端，现在就能用。这个后端默认关闭，只有你按下面的步骤部署好，并把网址填进网站配置后，“网站内分析”按钮才会出现。

> 下面的步骤都在“终端”里输入命令。Mac 打开“终端”（Terminal）；Windows 打开“PowerShell”。每一行命令输完按回车。
> 整个过程第一次大约需要 30–60 分钟。

---

## 一、准备两个账号，并先设好花费上限

1. **Cloudflare**：打开 https://dash.cloudflare.com/sign-up 注册（免费版就够用）。
2. **Anthropic Console**：打开 https://console.anthropic.com 注册（可能会自动跳转到新的控制台网址，属正常），然后：
   - 在 **Billing（账单）** 里绑定付款方式、预充少量额度（例如 5–10 美元）；
   - 在 **API Keys** 里点 “Create Key” 新建一个密钥，复制下来（以 `sk-ant-` 开头）。**这个密钥只给自己看，不要发给别人，不要贴进聊天窗口，也不要写进任何文件。**

### 必做：给花费封顶（部署前就设好）

网站是公开的，任何人都能点“网站内分析”；会写程序的人甚至可以绕过网页、直接反复调用你的 Worker。
Worker 已经做了来源检查和按 IP 限流，但这些**挡不住换着 IP 刷请求的人**。真正能保证“最多花多少钱”的，只有 Anthropic 这边的两道闸：

1. **关闭自动充值**：在 Billing 页面确认 **Auto reload / 自动充值** 是关闭的。这样钱花完就停，最多只会用掉你预充的额度。
2. **设每月花费上限**：在 **Limits（用量限制）/ Spend limits** 页面设一个每月上限（例如 20 美元）。

页面位置可能随改版变化，找不到时在控制台里搜索 “limit” 或 “reload”。
额度用完后，网站内分析会暂时无法使用（网页提示稍后再试），“复制给 AI”不受影响；充值后自动恢复，不用重新部署。

---

## 二、安装 Node.js，并把仓库下载到电脑上

1. 打开 https://nodejs.org ，下载 **LTS（长期支持）** 版本并安装，一路“下一步”即可。装好后**重新打开**终端，输入：

   ```
   node -v
   ```

   能看到类似 `v22.x.x` 的版本号就说明装好了。

2. 电脑上要有这个网站仓库的副本。如果还没有：用 GitHub Desktop 的 “Clone repository” 克隆 `hmpbikes/Dharma`，或在 GitHub 网页上点 “Code → Download ZIP” 下载后解压。

> **Windows 提示**：如果 PowerShell 报错说“因为在此系统上禁止运行脚本”（running scripts is disabled），
> 把下面所有命令里的 `npx` 换成 `npx.cmd`、`npm` 换成 `npm.cmd` 即可；或者改用开始菜单里的“命令提示符”（cmd）来操作。

---

## 三、部署

1. 在终端里进入本文件夹（把路径换成你电脑上仓库的实际位置；也可以输入 `cd ` 加一个空格后，把 worker 文件夹直接拖进终端窗口）：

   ```
   cd 你的路径/Dharma/worker
   ```

2. 安装依赖（第一次需要，几分钟；会生成 `node_modules` 文件夹，它已被 `.gitignore` 排除，不会上传）：

   ```
   npm install
   ```

3. 登录 Cloudflare（会自动打开浏览器，点“允许 / Allow”）：

   ```
   npx wrangler login
   ```

4. 把 Anthropic 的 API 密钥存进 Cloudflare（它会提示你粘贴密钥，粘贴后回车；屏幕上不会显示出来，这是正常的）：

   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

   第一次运行时如果问是否创建名为 `dharma-ai` 的 Worker，回答 `Y`。

5. 发布：

   ```
   npx wrangler deploy
   ```

   - 如果这是你在 Cloudflare 上的第一个 Worker，它可能会请你先注册一个 `workers.dev` 子域名（就是网址里“你的名字”那一段），按提示起个名字即可。
   - 如果报错内容提到 `ratelimits`，打开 `wrangler.toml`，在最后 6 行（从 `[[ratelimits]]` 起）每行开头加上 `# ` 关掉限流，再运行一次 `npx wrangler deploy`。

   成功后会显示一个网址，类似：

   ```
   https://dharma-ai.你的名字.workers.dev
   ```

   记下它。

6. 检查是否在运行：用浏览器打开上面的网址**再加上 `/analyze`**。看到一行含有 `"此来源无权使用本服务。"` 的文字，就说明 Worker 已经在正常工作（它只接受来自你网站的请求，直接用浏览器打开会被拒绝，这是对的）。

---

## 四、在网站上打开“网站内分析”

1. 打开网站仓库里的 `assets/config.js`，把 `aiEndpoint` 改成上一步得到的网址 **再加上 `/analyze`**，例如：

   ```js
   aiEndpoint: 'https://dharma-ai.你的名字.workers.dev/analyze'
   ```

2. 保存，提交并推送到 GitHub（`git add`、`git commit`、`git push`，或用 GitHub Desktop）。几分钟后网站更新，结果页就会出现“网站内分析”按钮。写几句“真实反应”试一次。

> 网站的网址必须在 `wrangler.toml` 的 `ALLOWED_ORIGINS` 里，否则 Worker 会拒绝（返回 403）。默认已经写好 `https://hmpbikes.github.io`。
> 如果你在自己电脑上用 `http://localhost:8000` 预览网站，可以改成：
> `ALLOWED_ORIGINS = "https://hmpbikes.github.io,http://localhost:8000"`，然后重新 `npx wrangler deploy`。
> 注意只写“协议 + 域名（+ 端口）”，不要带 `/Dharma` 这样的路径。

---

## 五、选模型与费用估算

`wrangler.toml` 里的 `MODEL` 决定用哪个模型。改完保存，重新运行 `npx wrangler deploy` 即可生效。

| `MODEL` 填写 | 特点 | 价格（美元 / 每百万 token，输入 / 输出） | 一般一次 | 最多一次 | 100 次约 |
|---|---|---|---|---|---|
| `claude-opus-5-5`（默认） | 分析最细致，最贵 | $4 / $20 | $0.08–0.20 | $0.42 | $13 |
| `claude-sonnet-5-5` | 价钱约为默认的一半，质量仍然不错 | $2 / $10 | $0.04–0.10 | $0.21 | $7 |
| `claude-haiku-5-5` | 最便宜、最快，分析会简单一些 | $0.10 / $0.50 | $0.002–0.005 | $0.01 | $0.3 |

怎么算的（粗估；token 是计费单位，一个汉字大约 1–1.5 个 token）：

- **输入**一般 6,000–10,000 token，最多约 25,000：分析说明约 3,000–4,500，输出格式要求约 1,500–2,500，用户的结果与开放回答 500–18,000（Worker 限制每题最多 800 字、合计最多 12,000 字）。
- **输出**一般 3,000–7,000 token：模型先在内部思考（思考也按输出计费），再写出结构化分析。程序设置的上限是 16,000，“最多一次”就是按这个上限算的。
- 举例：花费上限设 20 美元、用默认模型，大约够 100–200 次正常分析；就算有人恶意刷，也最多花掉 20 美元。

说明：

- 以上只是粗估，实际以 Anthropic 控制台的 **Usage / Cost** 页面为准；价格可能调整，以 Anthropic 官网价格页为准。
- 只有用户写了开放回答、勾选同意并点击“网站内分析”时才会调用；一题文字都没写的请求会被直接拒绝，不花钱。
- 万一主模型拒答，服务器会自动改用另一个模型重做（见下文“拒答回退”），重做的部分按那个模型的价格计费。
- Cloudflare Worker 免费版每天 10 万次请求，对本站绰绰有余。

---

## 六、关闭 / 暂停

任选一种：

- **只关网站按钮**：把 `assets/config.js` 里的 `aiEndpoint` 改回空字符串 `''` 并推送。按钮会消失，“复制给 AI”照常可用。
- **彻底删除 Worker**：在本文件夹运行

  ```
  npx wrangler delete
  ```

- **作废密钥**：在 Anthropic 控制台的 API Keys 页面删除（Delete / Disable）那把密钥。之后即使 Worker 还在，也无法再产生费用。怀疑密钥泄露时，先做这一步，再新建密钥、重新执行第三步第 4 条。

---

## 七、按 IP 限流（默认已开启）

`wrangler.toml` 最后 6 行：

```toml
[[ratelimits]]
name = "RATE_LIMITER"
namespace_id = "1901"
  [ratelimits.simple]
  limit = 5
  period = 60
```

意思是同一个 IP 每 60 秒最多 5 次分析，超出时网页会提示“请求太频繁了，请过一分钟再试”。想放宽就改 `limit`（`period` 只能是 10 或 60），保存后 `npx wrangler deploy`。
这个写法在 wrangler 4.149 上验证过可以打包；Cloudflare 的配置方式会更新，**以 Cloudflare 官方文档（Workers → Runtime APIs → Rate Limiting）为准**。如果部署报错，按第三步第 5 条的说明关掉它也能正常使用——花费上限仍然兜底。

---

## 八、以后更新

- 改了 `wrangler.toml`（模型、允许的网站、限流）：在本文件夹运行 `npx wrangler deploy`。
- 改了网站仓库的 `content/ai.json`（分析说明、求助信息等）：先在仓库根目录运行 `node tools/build-data.js`（它会重新生成 `worker/src/prompt.js`），再到本文件夹运行 `npx wrangler deploy`。
- 换密钥：重新运行 `npx wrangler secret put ANTHROPIC_API_KEY`，不需要重新 deploy。

---

## 九、遇到问题

- **查看实时日志**：运行 `npx wrangler tail`，然后在网站上点一次分析，终端会显示错误类型（不会显示用户写的内容，也不会显示密钥）。
  - `auth status=401`：密钥不对或已作废，重新执行第三步第 4 条。
  - `billing status=402`，或 `bad_request status=400` 且控制台显示余额为 0：额度用完或账单有问题，去 Billing 页面充值。
  - `bad_request status=404`：`MODEL` 写错了，或你的账户不能用这个模型。
  - `bad_request status=400`（余额正常时）：请求参数不被接受。若是“拒答回退”的问题（见下），可先关掉回退。
  - `rate_limit status=429`：Anthropic 账户的用量限制或花费上限到了，稍后再试，或在控制台提高额度。
  - `overloaded status=529`：Anthropic 那边暂时太忙，过几分钟自然恢复。
  - `deadline` 或 `timeout`：这次分析超过 140 秒没做完。偶尔一次不要紧；经常出现可以改用 `claude-sonnet-5-5`。
- **网站提示“此来源无权使用本服务”**：检查 `ALLOWED_ORIGINS`。
- **网站提示“请求太频繁了”**：触发了按 IP 限流，等一分钟即可。

### 关于“拒答回退”

为了避免偶尔被误判拒答，程序在调用 API 时加了 `fallbacks: 'default'`，并同时带上 beta 标记 `server-side-fallback-2026-07-01`（通过官方 SDK 的 `client.beta.messages.create` 发送）。主模型拒答时，服务器会自动换一个合适的模型重做，网站不需要做任何事。几点说明：

- 这个写法必须配这个 beta 标记；另一种“自己指定回退模型”的数组写法要配不同的标记，两者混用会报错，所以不要单独改其中一个。
- 选用 `claude-haiku-5-5` 时没有服务器端回退，程序会自动不发这个参数。
- 如果你的账户暂时不支持这个功能（日志里出现 `bad_request status=400`），把 `wrangler.toml` 里 `# FALLBACK = "off"` 这一行开头的 `# ` 删掉，再部署，即可关掉回退。

---

## 十、隐私与安全（给站长的说明）

- Worker 不保存任何用户内容，日志只记录错误类型、状态码和请求编号。
- 只接受 `ALLOWED_ORIGINS` 里的网站发来的请求（没有 `Origin` 或来源不符一律 403）；请求体最大 64KB；最多 40 题；每题文字截断到 800 字，合计最多 12,000 字；每次分析最长 140 秒。
- 用户的文字只放在发给模型的“用户消息”里，包在清楚的分隔标记中，并注明“以下为答题者原文，仅供分析”；文字里的尖括号会被换成全角，无法冒充分隔标记；其中的任何指令都不会被执行。
- 写到轻生、自伤等字词时（截断前的全文都会检查），返回结果会附上求助信息，网站会优先显示；分析失败时也一样。
- AI 分析仅供自我观察，不是心理诊断。网页显示 AI 返回的内容前会先做 HTML 转义。
- 对网站访客而言，他们写的文字会经由本 Worker 发给 Anthropic 处理；网页上的同意勾选和隐私说明已经告知这一点。
- **不要把 API 密钥写进 `wrangler.toml`、`assets/config.js` 或任何文件**；只用 `npx wrangler secret put` 存。本地调试用的 `.dev.vars` 已被 `.gitignore` 排除。

---

## 附：文件说明

| 文件 | 作用 |
|---|---|
| `wrangler.toml` | Worker 的名字、允许的网站、模型、限流等设置 |
| `package.json` | 依赖：官方 SDK `@anthropic-ai/sdk`，部署工具 `wrangler` |
| `src/index.js` | 入口 |
| `src/handler.js` | 主要逻辑：来源检查、限流、数据校验、调用 API、处理结果与错误 |
| `src/prompt.js` | 分析说明与输出格式，由网站仓库的 `tools/build-data.js` 自动生成，**不要手改**；要改请改 `content/ai.json` 后重新运行 `node tools/build-data.js` |

接口：`POST /analyze`，返回 `{ ok: true, analysis, disclaimer, crisis? }` 或 `{ ok: false, code, message, crisis? }`。
