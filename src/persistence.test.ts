import { describe, expect, it, vi } from 'vitest';
import type { Sandbox } from '@cloudflare/sandbox';
import { getAutoBackupIntervalMs, getLastBackupCreatedAtMs, maybeAutoBackup } from './persistence';

type StoredValue = string;

class MemoryR2Bucket {
  private store = new Map<string, StoredValue>();

  async get(key: string) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return {
      async json() {
        return JSON.parse(value) as unknown;
      },
      async text() {
        return value;
      },
    };
  }

  async put(key: string, value: string) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async head(key: string) {
    return this.store.has(key) ? ({ key } as unknown) : null;
  }
}

function makeSandbox() {
  const createBackup = vi.fn(async () => ({ id: 'backup-1', dir: '/home/openclaw' }));
  return {
    exec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    createBackup,
    restoreBackup: vi.fn(async () => undefined),
    __mockCreateBackup: createBackup,
  } as unknown as Sandbox & { __mockCreateBackup: ReturnType<typeof vi.fn> };
}

describe('persistence auto backup', () => {
  it('uses a 5 minute default interval', () => {
    expect(getAutoBackupIntervalMs()).toBe(5 * 60 * 1000);
  });

  it('accepts a custom interval in minutes', () => {
    expect(getAutoBackupIntervalMs('12')).toBe(12 * 60 * 1000);
  });

  it('creates a snapshot when no backup exists', async () => {
    const bucket = new MemoryR2Bucket();
    const sandbox = makeSandbox();
    const mock = (sandbox as Sandbox & { __mockCreateBackup: ReturnType<typeof vi.fn> })
      .__mockCreateBackup;

    const result = await maybeAutoBackup(sandbox, bucket as unknown as R2Bucket, 5 * 60 * 1000);

    expect(result.created).toBe(true);
    expect(result.handle?.id).toBe('backup-1');
    expect(await getLastBackupCreatedAtMs(bucket as unknown as R2Bucket)).toBeGreaterThan(0);
    expect(mock.mock.calls.length).toBe(1);
  });

  it('skips auto backup when the last snapshot is still fresh', async () => {
    const bucket = new MemoryR2Bucket();
    const sandbox = makeSandbox();
    const mock = (sandbox as Sandbox & { __mockCreateBackup: ReturnType<typeof vi.fn> })
      .__mockCreateBackup;
    const recentCreatedAtMs = Date.now() - 60_000;

    await bucket.put(
      'backup-handle.json',
      JSON.stringify({
        id: 'backup-old',
        dir: '/home/openclaw',
        createdAtMs: recentCreatedAtMs,
      }),
    );

    const result = await maybeAutoBackup(sandbox, bucket as unknown as R2Bucket, 5 * 60 * 1000);

    expect(result.created).toBe(false);
    expect(result.skippedReason).toContain('last backup');
    expect(mock.mock.calls.length).toBe(0);
  });
});
