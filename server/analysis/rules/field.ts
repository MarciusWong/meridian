// Findings from Chrome UX Report data: what real visitors experienced over the last 28 days.

import type { FieldMetric } from '../../../shared/types';
import { formatMs, type Finding, type Rule } from './types';

const ADVICE: Record<FieldMetric['id'], { title: string; why: string; fixes: string[] }> = {
  lcp: {
    title: 'Real visitors see the main content late (LCP)',
    why: 'Largest Contentful Paint measures when the main image or text block appears. Google uses it as a ranking signal; good is 2.5 s or less.',
    fixes: [
      'Cut time to first byte everywhere (CDN edge caching, faster back end) — see the global delivery findings.',
      'Make the LCP image discoverable in the HTML, give it fetchpriority="high", and serve it in AVIF/WebP at the displayed size.',
      'Remove render-blocking CSS and JavaScript from the <head>.',
    ],
  },
  inp: {
    title: 'Real visitors find the page slow to respond (INP)',
    why: 'Interaction to Next Paint measures how quickly the page reacts to taps, clicks and key presses; good is 200 ms or less.',
    fixes: [
      'Break up long JavaScript tasks and yield to the main thread in event handlers.',
      'Reduce and defer third-party scripts, which often run during interactions.',
      'Avoid large re-renders on input; debounce expensive work.',
    ],
  },
  cls: {
    title: 'Real visitors see the layout jump (CLS)',
    why: 'Cumulative Layout Shift measures unexpected movement of page content; good is 0.1 or less.',
    fixes: [
      'Reserve space for images, ads and embeds with width/height or aspect-ratio.',
      'Do not insert banners or content above what the visitor is reading.',
      'Use size-adjusted fallback fonts or font-display: optional.',
    ],
  },
  fcp: {
    title: 'Real visitors wait for the first paint (FCP)',
    why: 'First Contentful Paint is when anything first appears; good is 1.8 s or less.',
    fixes: [
      'Reduce server response time and redirects.',
      'Inline critical CSS and defer the rest.',
      'Preconnect to required origins.',
    ],
  },
  ttfb: {
    title: 'Real visitors wait for the server (TTFB)',
    why: 'Time to First Byte from real users includes redirects, DNS, connection set-up and server time; good is 0.8 s or less.',
    fixes: [
      'Serve HTML from a CDN edge cache close to visitors.',
      'Remove redirects.',
      'Speed up the back end with page caching.',
    ],
  },
};

function format(metric: FieldMetric): string {
  return metric.unit === 'ms' ? formatMs(metric.p75) : metric.p75.toFixed(2);
}

export const fieldRule: Rule = ({ field }) => {
  if (!field) return [];
  return field.metrics
    .filter((m) => m.status !== 'good')
    .map((m): Finding => {
      const advice = ADVICE[m.id];
      return {
        id: `field-${m.id}`,
        title: advice.title,
        severity: m.status === 'poor' ? 'critical' : 'medium',
        category: m.id === 'inp' ? 'JavaScript' : m.id === 'ttfb' ? 'Server' : 'Rendering',
        summary: advice.why,
        evidence: [
          `75th percentile of real Chrome users (${field.scope === 'url' ? 'this page' : 'whole origin'}): ${format(m)} — ${m.status.replace('-', ' ')}`,
        ],
        fixes: advice.fixes,
        sources: ['PageSpeed Insights'],
        learnMoreUrl: `https://web.dev/articles/${m.id}`,
      };
    });
};
