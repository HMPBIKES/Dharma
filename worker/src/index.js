/*
 * 十九种人 · AI 分析后端（Cloudflare Worker）入口。
 * 逻辑都在 handler.js；提示词与输出结构在 prompt.js（由 tools/build-data.js 生成，不要手改）。
 * 部署方法见 worker/README.md。
 */
import { createWorker } from './handler.js';

export default createWorker();
