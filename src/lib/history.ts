// Reports this browser has run, kept in localStorage. Storage can be missing or
// blocked (private mode, previews), so every access is guarded.

import type { Report, ReportListItem } from '../../shared/types';

const KEY = 'meridian-history';
const MAX = 25;

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readHistory(storage: Storage | null = storageOrNull()): ReportListItem[] {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ReportListItem[]) : [];
  } catch {
    return [];
  }
}

export function rememberReport(report: Report, storage: Storage | null = storageOrNull()): void {
  const item: ReportListItem = {
    id: report.id,
    url: report.url,
    createdAt: report.createdAt,
    status: report.status,
    grade: report.scores?.grade ?? null,
    overall: report.scores?.overall ?? null,
  };
  const items = [item, ...readHistory(storage).filter((i) => i.id !== report.id)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX);
  try {
    storage?.setItem(KEY, JSON.stringify(items));
  } catch {
    // Not saved; history is a convenience only.
  }
}

export function clearHistory(storage: Storage | null = storageOrNull()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
