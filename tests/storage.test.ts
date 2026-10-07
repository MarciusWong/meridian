import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportStore } from '../server/storage';
import type { Report } from '../shared/types';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function report(id: string, createdAt: string): Report {
  return { id, url: 'https://example.com/', createdAt, status: 'complete', scores: null } as unknown as Report;
}

describe('ReportStore', () => {
  it('saves, loads and lists newest first', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'store-'));
    dirs.push(dir);
    const store = new ReportStore(dir);
    await store.save(report('aaaaaa-1', '2026-01-01T00:00:00Z'));
    await store.save(report('bbbbbb-2', '2026-02-01T00:00:00Z'));
    expect(store.load('aaaaaa-1')?.id).toBe('aaaaaa-1');
    expect(store.list().map((r) => r.id)).toEqual(['bbbbbb-2', 'aaaaaa-1']);
    // survives a restart
    expect(new ReportStore(dir).list()).toHaveLength(2);
  });

  it('rejects path-like ids', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'store-'));
    dirs.push(dir);
    expect(new ReportStore(dir).load('../../etc/passwd')).toBeNull();
  });

  it('prunes reports older than the retention period', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'store-'));
    dirs.push(dir);
    const store = new ReportStore(dir);
    await store.save(report('oldold-1', '2026-01-01T00:00:00Z'));
    await store.save(report('newnew-2', '2026-03-01T00:00:00Z'));
    const removed = store.prune(30, new Date('2026-03-10T00:00:00Z'));
    expect(removed).toBe(1);
    expect(store.list().map((r) => r.id)).toEqual(['newnew-2']);
    expect(store.load('oldold-1')).toBeNull();
    expect(new ReportStore(dir).list().map((r) => r.id)).toEqual(['newnew-2']);
  });

  it('keeps everything when retention is 0', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'store-'));
    dirs.push(dir);
    const store = new ReportStore(dir);
    await store.save(report('oldold-1', '2020-01-01T00:00:00Z'));
    expect(store.prune(0)).toBe(0);
  });
});
