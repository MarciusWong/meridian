// Finished reports are kept as JSON files so their URLs survive a restart.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Report, ReportListItem } from '../shared/types';

const ID_PATTERN = /^[a-z0-9-]{6,64}$/;

export function isValidReportId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function toListItem(report: Report): ReportListItem {
  return {
    id: report.id,
    url: report.url,
    createdAt: report.createdAt,
    status: report.status,
    grade: report.scores?.grade ?? null,
    overall: report.scores?.overall ?? null,
  };
}

export class ReportStore {
  private readonly index = new Map<string, ReportListItem>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const report = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Report;
        this.index.set(report.id, toListItem(report));
      } catch {
        // Skip unreadable files rather than refusing to start.
      }
    }
  }

  async save(report: Report): Promise<void> {
    if (!isValidReportId(report.id)) throw new Error(`Invalid report id: ${report.id}`);
    await writeFile(path.join(this.dir, `${report.id}.json`), JSON.stringify(report));
    this.index.set(report.id, toListItem(report));
  }

  load(id: string): Report | null {
    if (!isValidReportId(id) || !this.index.has(id)) return null;
    try {
      return JSON.parse(readFileSync(path.join(this.dir, `${id}.json`), 'utf8')) as Report;
    } catch {
      return null;
    }
  }

  list(limit = 20): ReportListItem[] {
    return [...this.index.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}
