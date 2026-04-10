import { getSandbox } from '@cloudflare/sandbox';
import type { OpenClawEnv } from '../types';
import { buildSandboxOptions } from '../index';
import { ensureGateway } from '../gateway';
import { shouldWakeContainer, DEFAULT_LEAD_TIME_MS, CRON_STORE_R2_KEY } from './wake';
import { createSnapshot } from './persistence'; // 导入持久化逻辑

/**
 * 优化后的定时处理器：
 * 1. 资源节约：每 5 分钟检查一次唤醒任务。
 * 2. 稳定备份：每 60 分钟执行一次状态持久化。
 */
export async function handleScheduled(env: OpenClawEnv): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  
  // 初始化 Sandbox 实例
  const sandbox = getSandbox(env.Sandbox, 'openclaw', buildSandboxOptions(env));

  // --- 逻辑 1：按需唤醒 (节约计算资源) ---
  const cronStoreObject = await env.BACKUP_BUCKET.get(CRON_STORE_R2_KEY);
  if (cronStoreObject) {
    const cronStoreJson = await cronStoreObject.text();
    // 默认预热时间改为 5 分钟，进一步压缩运行成本
    const leadMinutes = parseInt(env.CRON_WAKE_AHEAD_MINUTES || '5', 10);
    const leadTimeMs = leadMinutes * 60 * 1000;

    const earliestRun = shouldWakeContainer(cronStoreJson, nowMs, leadTimeMs);
    if (earliestRun) {
      console.log(`[CRON] Job due soon, waking container...`);
      await ensureGateway(sandbox, env);
    }
  }

  // --- 逻辑 2：整点备份 (修复 Never 备份问题) ---
  // 只有在每小时的 0-5 分钟这个区间（即每小时第一次运行）才触发备份
  if (now.getMinutes() < 5) {
    console.log('[CRON] Starting hourly persistent backup...');
    try {
      // 备份前强制同步文件系统缓存
      await sandbox.exec('sync').catch(() => {}); 
      
      // 执行快照并上传至 myoclawtbot-data
      await createSnapshot(sandbox, env.BACKUP_BUCKET);
      
      console.log('[CRON] Hourly backup successful.');
    } catch (err) {
      console.error('[CRON] Automatic backup failed:', err);
      // 如果失败，会在下一个 5 分钟重试一次，直到成功进入下一个小时
    }
  }
}
