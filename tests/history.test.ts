import { describe, expect, it } from 'vitest';
import { clearHistory, readHistory, rememberReport } from '../src/lib/history';
import type { Report } from '../shared/types';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const report = (id: string, createdAt: string, grade = 'A') =>
  ({ id, url: `https://${id}.com/`, createdAt, status: 'complete', scores: { grade, overall: 95 } }) as unknown as Report;

describe('report history', () => {
  it('remembers reports newest first without duplicates', () => {
    const storage = memoryStorage();
    rememberReport(report('one', '2026-01-01T00:00:00Z'), storage);
    rememberReport(report('two', '2026-01-02T00:00:00Z'), storage);
    rememberReport(report('one', '2026-01-01T00:00:00Z', 'B'), storage);
    const items = readHistory(storage);
    expect(items.map((i) => i.id)).toEqual(['two', 'one']);
    expect(items.find((i) => i.id === 'one')?.grade).toBe('B');
  });

  it('caps the list', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 40; i++) rememberReport(report(`r${i}`, new Date(2026, 0, 1, 0, i).toISOString()), storage);
    expect(readHistory(storage)).toHaveLength(25);
  });

  it('survives corrupt or unavailable storage', () => {
    const storage = memoryStorage();
    storage.setItem('meridian-history', '{not json');
    expect(readHistory(storage)).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(readHistory(broken)).toEqual([]);
    expect(() => rememberReport(report('x', '2026-01-01T00:00:00Z'), broken)).not.toThrow();
  });

  it('clears', () => {
    const storage = memoryStorage();
    rememberReport(report('one', '2026-01-01T00:00:00Z'), storage);
    clearHistory(storage);
    expect(readHistory(storage)).toEqual([]);
  });
});
