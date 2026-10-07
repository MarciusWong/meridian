import type { CreateTestRequest, RegionId, Report, ReportListItem, ServerCapabilities, TestLocation } from '../../shared/types';

export interface AppConfig {
  locations: TestLocation[];
  regions: Array<{ id: RegionId; label: string }>;
  capabilities: ServerCapabilities;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  reports: () => request<ReportListItem[]>('/api/tests'),
  report: (id: string) => request<Report>(`/api/tests/${encodeURIComponent(id)}`),
  createTest: (body: CreateTestRequest) => request<{ id: string }>('/api/tests', { method: 'POST', body: JSON.stringify(body) }),
};
