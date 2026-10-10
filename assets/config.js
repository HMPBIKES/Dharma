/*
 * 十九种人 · 站点配置（由站长手动修改）
 *
 * aiEndpoint：结果页“网站内分析”所用的后端地址（Cloudflare Worker）。
 *
 *   - 留空 ''（默认）：结果页不显示“网站内分析”，只提供“复制给 AI”。
 *     “复制给 AI”不需要任何后端，现在就能用。
 *
 *   - 开启方法：先按 worker/README.md 的步骤部署好 worker/ 目录里的后端，
 *     部署成功后会得到一个网址，把它 **加上 /analyze** 填在下面的引号里，例如：
 *
 *       aiEndpoint: 'https://dharma-ai.你的名字.workers.dev/analyze'
 *
 *     保存、提交并推送到 GitHub，几分钟后结果页就会出现“网站内分析”。
 *
 *   - 关闭方法：改回 aiEndpoint: '' 并推送即可，“复制给 AI”不受影响。
 *
 * 注意：这个文件是公开的，任何人都能看到。这里只填网址，
 *       千万不要写 API 密钥——密钥只存在 Cloudflare Worker 里（npx wrangler secret put）。
 */
window.SITE_CONFIG = {
  aiEndpoint: ''
};
