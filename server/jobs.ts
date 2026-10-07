// Orchestrates one test: runs every provider, records step progress, and
// produces a report even when some providers fail.

import { randomBytes } from 'node:crypto';
import type {
  CreateTestRequest,
  FieldData,
  FormFactor,
  JobStep,
  LighthouseSummary,
  LocationResult,
  PageInspection,
  Report,
  ReportListItem,
  StepId,
  TestLocation,
  WptLocationRun,
} from '../shared/types';
import { detectCdn } from './analysis/pageAnalysis';
import { buildRecommendations } from './analysis/recommendations';
import { computeGlobalStats, computeScores, globalDeliveryScore } from './analysis/scoring';
import { resolveLocations } from './locations';
import type { LighthouseOutcome } from './providers/lighthouseRunner';
import { normaliseUrl } from './security/targetGuard';
import type { ReportStore } from './storage';

type Detail = (detail: string) => void;

export interface Providers {
  guard: (url: string) => Promise<void>;
  inspect: (url: string) => Promise<PageInspection>;
  network: (
    url: string,
    locations: TestLocation[],
    onDetail: Detail,
  ) => Promise<{ locations: LocationResult[]; measurementIds: string[] }>;
  lighthouse: (url: string, formFactor: FormFactor, onDetail: Detail) => Promise<LighthouseOutcome>;
  webpagetest?: (url: string, locations: TestLocation[], onDetail: Detail) => Promise<WptLocationRun[]>;
}

export class BusyError extends Error {
  readonly status = 429;
}

const STEP_LABELS: Record<StepId, string> = {
  inspect: 'Inspecting page, headers and protocol',
  network: 'Measuring from global locations',
  'lighthouse-mobile': 'Lighthouse audit — mobile',
  'lighthouse-desktop': 'Lighthouse audit — desktop',
  webpagetest: 'WebPageTest real-browser loads',
  analyse: 'Prioritising fixes',
};

function newId(): string {
  return `${Date.now().toString(36)}-${randomBytes(10).toString('hex')}`;
}

export class JobManager {
  private readonly running = new Map<string, Report>();
  private readonly owners = new Map<string, string>();

  constructor(
    private readonly providers: Providers,
    private readonly store: ReportStore,
    private readonly options: { maxConcurrentJobs: number },
  ) {}

  /** Validates the request and registers a report without running it. */
  create(request: CreateTestRequest, clientKey: string): Report {
    const url = normaliseUrl(request.url);
    if (this.running.size >= this.options.maxConcurrentJobs) {
      throw new BusyError('The server is busy running other tests. Please try again in a minute.');
    }
    if ([...this.owners.values()].includes(clientKey)) {
      throw new BusyError('You already have a test running. Wait for it to finish first.');
    }

    const withLighthouse = request.lighthouse !== false;
    const step = (id: StepId, enabled = true): JobStep => ({
      id,
      label: STEP_LABELS[id],
      status: enabled ? 'pending' : 'skipped',
    });
    const report: Report = {
      id: newId(),
      url,
      createdAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      steps: [
        step('inspect'),
        step('network'),
        step('lighthouse-mobile', withLighthouse),
        step('lighthouse-desktop', withLighthouse),
        step('webpagetest', Boolean(this.providers.webpagetest)),
        step('analyse'),
      ],
      locations: resolveLocations(request.locations),
      inspection: null,
      network: null,
      lighthouse: { mobile: null, desktop: null },
      field: null,
      webpagetest: null,
      scores: null,
      stats: null,
      recommendations: [],
      errors: [],
    };
    this.running.set(report.id, report);
    this.owners.set(report.id, clientKey);
    return report;
  }

  /** Validates (including DNS checks), registers and starts a test in the background. */
  async start(request: CreateTestRequest, clientKey: string): Promise<Report> {
    await this.providers.guard(normaliseUrl(request.url));
    const report = this.create(request, clientKey);
    void this.run(report.id);
    return report;
  }

  get(id: string): Report | null {
    return this.running.get(id) ?? this.store.load(id);
  }

  list(): ReportListItem[] {
    return this.store.list();
  }

  async run(id: string): Promise<Report> {
    const report = this.running.get(id);
    if (!report) throw new Error(`No pending job ${id}`);

    const setStep = (stepId: StepId, status: JobStep['status'], detail?: string) => {
      const step = report.steps.find((s) => s.id === stepId);
      if (step) Object.assign(step, { status, detail });
    };
    const attempt = async <T>(stepId: StepId, task: (onDetail: Detail) => Promise<T>): Promise<T | null> => {
      const step = report.steps.find((s) => s.id === stepId);
      if (step?.status === 'skipped') return null;
      setStep(stepId, 'running');
      try {
        const result = await task((detail) => setStep(stepId, 'running', detail));
        setStep(stepId, 'done');
        return result;
      } catch (error) {
        const message = (error as Error).message || String(error);
        setStep(stepId, 'failed', message);
        report.errors.push(`${STEP_LABELS[stepId]}: ${message}`);
        return null;
      }
    };

    // The final status is published only after the report is saved, so a
    // client that sees "complete" can always find it in the stored list.
    let finalStatus: Report['status'] = 'failed';
    try {
      report.inspection = await attempt('inspect', () => this.providers.inspect(report.url));
      const target = report.inspection?.finalUrl ?? report.url;
      if (report.inspection && report.inspection.status >= 400) {
        report.errors.push(
          `The page answered Meridian's server with HTTP ${report.inspection.status} (often bot protection or a firewall), ` +
            'so header and HTML checks were skipped. Global and Lighthouse results are unaffected.',
        );
      }

      let field: FieldData | null = null;
      const lighthouse = async (formFactor: FormFactor): Promise<LighthouseSummary | null> => {
        const outcome = await attempt(`lighthouse-${formFactor}`, (onDetail) =>
          this.providers.lighthouse(target, formFactor, onDetail),
        );
        if (!outcome) return null;
        report.errors.push(...outcome.notes.map((n) => `Lighthouse (${formFactor}): ${n}`));
        field = field ?? outcome.field;
        return outcome.summary;
      };

      const [network, mobile, desktop, wpt] = await Promise.all([
        attempt('network', (onDetail) => this.providers.network(target, report.locations, onDetail)),
        lighthouse('mobile'),
        lighthouse('desktop'),
        attempt('webpagetest', (onDetail) => this.providers.webpagetest!(target, report.locations, onDetail)),
      ]);

      report.network = network ? { target, locations: network.locations, measurementIds: network.measurementIds } : null;
      if (report.inspection && !report.inspection.cdn && network) {
        // Probes reach more edges than our single request; their headers may name the CDN.
        report.inspection.cdn = network.locations.map((l) => detectCdn(l.headers)).find(Boolean) ?? null;
      }
      report.lighthouse = { mobile, desktop };
      report.field = field;
      report.webpagetest = wpt;

      await attempt('analyse', async () => {
        const results = report.network?.locations ?? [];
        report.stats = report.network ? computeGlobalStats(report.locations, results) : null;
        report.scores = computeScores({
          performanceMobile: mobile?.scores.performance ?? null,
          performanceDesktop: desktop?.scores.performance ?? null,
          globalDelivery: report.network ? globalDeliveryScore(results) : null,
        });
        report.recommendations = buildRecommendations({
          locations: report.locations,
          network: report.network?.locations ?? null,
          inspection: report.inspection,
          mobile,
          desktop,
          field: report.field,
        });
      });

      const nothingWorked = !report.inspection && !report.network && !mobile && !desktop;
      finalStatus = nothingWorked ? 'failed' : 'complete';
    } catch (error) {
      report.errors.push((error as Error).message);
    } finally {
      report.completedAt = new Date().toISOString();
      try {
        await this.store.save({ ...report, status: finalStatus });
      } catch (error) {
        report.errors.push(`Could not save report: ${(error as Error).message}`);
      }
      report.status = finalStatus;
      this.running.delete(id);
      this.owners.delete(id);
    }
    return report;
  }
}
