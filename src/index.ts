import { getSandbox } from '@cloudflare/sandbox';
import { restoreIfNeeded } from './persistence'; // 导入恢复逻辑 
import type { OpenClawEnv } from './types';

/**
 * 构造 Sandbox 启动配置 [cite: 3]
 */
export function buildSandboxOptions(env: OpenClawEnv) {
  return {
    env: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      BACKUP_BUCKET_NAME: env.BACKUP_BUCKET_NAME || 'myoclawtbot-data',
    }
  };
}

export default {
  /**
   * HTTP 请求入口
   */
  async fetch(request: Request, env: OpenClawEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // 1. 静态资源分流：优先处理前端页面，减少容器负担 
    if (url.pathname.startsWith('/_static') || url.pathname.includes('.')) {
      return env.ASSETS.fetch(request);
    }

    // 2. 初始化 Sandbox 实例
    const sandbox = getSandbox(env.Sandbox, 'openclaw', buildSandboxOptions(env));

    // 3. 自动恢复逻辑 (Persistence)
    // 仅在访问 API 或首页时触发恢复，避开 /admin 或 /debug 路由以减少冲突 
    const isMainPath = url.pathname.startsWith('/api') || url.pathname === '/';
    if (isMainPath) {
      try {
        // 调用 persistence.ts 中的恢复函数 
        await restoreIfNeeded(sandbox, env.BACKUP_BUCKET);
      } catch (err) {
        console.error('[Persistence] Auto-restore failed:', err);
        // 即使恢复失败，通常也允许继续访问，防止服务彻底宕机
      }
    }

    // 4. 将请求转发给容器网关处理
    return sandbox.fetch(request);
  },

  /**
   * 定时任务入口 (Cron Triggers) [cite: 7]
   */
  async scheduled(controller: ScheduledController, env: OpenClawEnv, ctx: ExecutionContext) {
    // 动态导入 Cron 处理器以优化 fetch 路径的冷启动速度 [cite: 3]
    const { handleScheduled } = await import('./cron/handler');
    
    // 使用 ctx.waitUntil 确保异步备份任务能完整执行，不会被 Worker 强制终止 [cite: 3]
    ctx.waitUntil(handleScheduled(env));
  }
};
