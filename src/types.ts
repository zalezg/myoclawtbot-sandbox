import type { DurableObjectNamespace, R2Bucket, Fetcher } from '@cloudflare/workers-types';

/**
 * OpenClaw 运行环境接口定义
 */
export interface OpenClawEnv {
  // --- 资源绑定 (Bindings)  ---
  Sandbox: DurableObjectNamespace;     // 容器实例命名空间
  BACKUP_BUCKET: R2Bucket;             // R2 存储桶绑定，用于存放备份文件 [cite: 1, 4]
  BROWSER: any;                        // 浏览器渲染绑定 
  ASSETS: Fetcher;                     // 静态资产绑定（由 Vite 构建） 

  // --- 加密密钥 (Secrets) [cite: 1, 9] ---
  // R2 持久化所需 (用于容器内部通过 S3 协议上传)
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  BACKUP_BUCKET_NAME?: string;         // 默认应为 "myoclawtbot-data"

  // AI 服务供应商密钥
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  MOLTBOT_GATEWAY_TOKEN?: string;      // 网关鉴权令牌 [cite: 8]

  // 可选配置
  CRON_WAKE_AHEAD_MINUTES?: string;    // 提前唤醒时间（分钟） [cite: 5]
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  WORKER_URL?: string;
}
