// Types shared by the server and the browser client.

export type RegionId = 'north-america' | 'south-america' | 'europe' | 'middle-east' | 'africa' | 'asia' | 'oceania';

export interface TestLocation {
  id: string;
  city: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  region: RegionId;
  /** Short label for the area this city stands in for, e.g. "UK", "Central Europe". */
  covers: string;
  lat: number;
  lon: number;
  defaultSelected: boolean;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type MetricStatus = 'good' | 'needs-improvement' | 'poor';

export type RecommendationCategory =
  | 'Global delivery'
  | 'Server'
  | 'Caching'
  | 'Protocol & security'
  | 'Rendering'
  | 'JavaScript'
  | 'Images'
  | 'Fonts'
  | 'Third parties'
  | 'Page weight';

export type DataSource = 'Globalping' | 'Lighthouse' | 'PageSpeed Insights' | 'Page inspector' | 'WebPageTest';

export interface Recommendation {
  id: string;
  title: string;
  severity: Severity;
  category: RecommendationCategory;
  /** One or two sentences: what is wrong and why it matters. */
  summary: string;
  /** Concrete measurements backing the finding. */
  evidence: string[];
  /** Ordered steps to fix it. */
  fixes: string[];
  /** Estimated time saved, when known. */
  impactMs?: number;
  /** Estimated bytes saved, when known. */
  impactBytes?: number;
  /** Location ids affected (network findings). */
  locations?: string[];
  sources: DataSource[];
  learnMoreUrl?: string;
  /** Ranking score: higher = more important within the same severity. */
  priority: number;
}

// ---------------------------------------------------------------- Globalping

export interface HttpTimings {
  total: number | null;
  dns: number | null;
  tcp: number | null;
  tls: number | null;
  firstByte: number | null;
  download: number | null;
}

export interface HttpProbeRun {
  statusCode: number | null;
  timings: HttpTimings;
  /** Time to first byte measured from the start of the request (dns + tcp + tls + firstByte). */
  ttfb: number | null;
  cacheStatus: string | null;
  resolvedAddress: string | null;
  error: string | null;
}

export interface TlsInfo {
  protocol: string | null;
  cipher: string | null;
  issuer: string | null;
  expiresAt: string | null;
  authorized: boolean | null;
}

export interface ProbeInfo {
  city: string;
  country: string;
  continent: string;
  network: string;
  asn: number | null;
  lat: number;
  lon: number;
}

export interface LocationResult {
  locationId: string;
  probe: ProbeInfo | null;
  /** First (cold) request. */
  cold: HttpProbeRun | null;
  /** Second request from the same probe (warm DNS/CDN cache). */
  warm: HttpProbeRun | null;
  /** Network round-trip time from ping, in ms. */
  rttMs: number | null;
  packetLoss: number | null;
  tls: TlsInfo | null;
  headers: Record<string, string>;
  /** Overall status of the measurement from this location. */
  status: 'ok' | 'http-error' | 'failed' | 'no-probe';
  error: string | null;
}

export interface GlobalNetworkResult {
  target: string;
  locations: LocationResult[];
  measurementIds: string[];
}

// ---------------------------------------------------------------- Lighthouse

export type FormFactor = 'mobile' | 'desktop';

export interface LabMetric {
  id: 'fcp' | 'lcp' | 'tbt' | 'cls' | 'si' | 'tti' | 'ttfb';
  label: string;
  value: number;
  unit: 'ms' | 'unitless';
  displayValue: string;
  score: number | null;
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  /** Savings reported by the audit in ms (overallSavingsMs or metricSavings). */
  savingsMs?: number;
  savingsBytes?: number;
  /** Metrics this audit affects, with their estimated savings. */
  metricSavings?: Partial<Record<'LCP' | 'FCP' | 'TBT' | 'CLS' | 'INP', number>>;
  /** Up to a handful of example items (URLs etc.) for evidence. */
  items: string[];
  learnMoreUrl?: string;
}

export interface ResourceSummaryRow {
  type: string;
  label: string;
  requestCount: number;
  transferSize: number;
}

export interface LighthouseSummary {
  formFactor: FormFactor;
  source: 'PageSpeed Insights' | 'Lighthouse';
  lighthouseVersion: string;
  fetchTime: string;
  finalUrl: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  metrics: LabMetric[];
  /** Failing audits relevant to performance. */
  audits: LighthouseAudit[];
  resourceSummary: ResourceSummaryRow[];
  /** Base64 data URI of the final screenshot, if any. */
  screenshot?: string;
}

export interface FieldMetric {
  id: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';
  label: string;
  p75: number;
  unit: 'ms' | 'unitless';
  status: MetricStatus;
}

export interface FieldData {
  scope: 'url' | 'origin';
  overall: MetricStatus | null;
  metrics: FieldMetric[];
}

// ---------------------------------------------------------------- Page inspector

export interface RedirectHop {
  url: string;
  status: number;
  timeMs: number;
}

export interface HtmlInsights {
  bytes: number;
  title: string | null;
  hasViewport: boolean;
  renderBlockingScripts: string[];
  stylesheets: number;
  scripts: number;
  inlineScriptBytes: number;
  inlineStyleBytes: number;
  images: number;
  imagesWithoutDimensions: number;
  imagesWithoutLazy: number;
  legacyImageFormats: number;
  thirdPartyOrigins: string[];
  preconnectOrigins: string[];
  preloads: number;
  fontDisplaySwap: boolean | null;
  usesGoogleFonts: boolean;
}

export interface PageInspection {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: RedirectHop[];
  ttfbMs: number;
  totalMs: number;
  headers: Record<string, string>;
  compression: string | null;
  /** Whether the server accepts Brotli when asked. */
  supportsBrotli: boolean | null;
  httpVersion: 'h2' | 'http/1.1' | 'unknown';
  supportsHttp3: boolean;
  cdn: string | null;
  server: string | null;
  cacheControl: string | null;
  hsts: boolean;
  html: HtmlInsights | null;
}

// ---------------------------------------------------------------- WebPageTest

export interface WptLocationRun {
  locationId: string;
  wptLocation: string;
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  speedIndex: number | null;
  fullyLoaded: number | null;
  bytesIn: number | null;
  testUrl: string | null;
  error: string | null;
}

// ---------------------------------------------------------------- Report

export type StepId = 'inspect' | 'network' | 'lighthouse-mobile' | 'lighthouse-desktop' | 'webpagetest' | 'analyse';

export interface JobStep {
  id: StepId;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail?: string;
}

export interface Scores {
  /** 0-100. Blend of lab performance and global delivery. */
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  /** 0-100. How fast the page's first byte arrives across all locations. */
  globalDelivery: number | null;
  performanceMobile: number | null;
  performanceDesktop: number | null;
}

export interface GlobalStats {
  medianTtfb: number | null;
  p90Ttfb: number | null;
  fastest: { locationId: string; ttfb: number } | null;
  slowest: { locationId: string; ttfb: number } | null;
  locationsTested: number;
  locationsFailed: number;
  regions: Array<{ region: RegionId; medianTtfb: number | null; status: MetricStatus | null }>;
}

export interface Report {
  id: string;
  url: string;
  createdAt: string;
  completedAt: string | null;
  status: 'running' | 'complete' | 'failed';
  steps: JobStep[];
  locations: TestLocation[];
  inspection: PageInspection | null;
  network: GlobalNetworkResult | null;
  lighthouse: { mobile: LighthouseSummary | null; desktop: LighthouseSummary | null };
  field: FieldData | null;
  webpagetest: WptLocationRun[] | null;
  scores: Scores | null;
  stats: GlobalStats | null;
  recommendations: Recommendation[];
  errors: string[];
}

export interface ReportListItem {
  id: string;
  url: string;
  createdAt: string;
  status: Report['status'];
  grade: Scores['grade'] | null;
  overall: number | null;
}

export interface CreateTestRequest {
  url: string;
  locations?: string[];
  lighthouse?: boolean;
}

export interface ServerCapabilities {
  lighthouseMode: 'auto' | 'psi' | 'local' | 'off';
  psiKey: boolean;
  globalpingToken: boolean;
  webpagetest: boolean;
  localChrome: boolean;
  /** When true, the server shares a list of recent reports with every visitor. */
  publicHistory: boolean;
}
