// Curated guidance for Lighthouse audits. `key` merges an audit with the same
// problem found by another tool (and merges legacy audits with their newer
// "insight" equivalents). Audits not listed here fall back to Lighthouse's own
// title and description.

import type { RecommendationCategory } from '../../shared/types';

export interface AuditGuide {
  key?: string;
  category: RecommendationCategory;
  title?: string;
  fixes: string[];
}

export const AUDIT_GUIDE: Record<string, AuditGuide> = {
  'render-blocking-insight': {
    key: 'render-blocking',
    category: 'Rendering',
    title: 'Eliminate render-blocking resources',
    fixes: [
      'Add `defer` or `async` to scripts in the <head>, or load them as `type="module"`.',
      'Inline the critical CSS for the first screen and load the full stylesheet without blocking.',
      'Remove or delay non-essential CSS/JS (e.g. split per-route bundles).',
    ],
  },
  'render-blocking-resources': { key: 'render-blocking', category: 'Rendering', fixes: [] },
  'unused-javascript': {
    category: 'JavaScript',
    title: 'Reduce unused JavaScript',
    fixes: [
      'Code-split by route and component so each page loads only the JavaScript it needs (dynamic `import()`).',
      'Analyse bundles (e.g. with source-map-explorer or the bundler visualiser) and remove or replace heavy dependencies.',
      'Delay non-critical third-party scripts until after the page is interactive or the user engages.',
    ],
  },
  'unused-css-rules': {
    category: 'Rendering',
    title: 'Reduce unused CSS',
    fixes: [
      'Purge unused selectors at build time (e.g. PurgeCSS, Tailwind content scanning).',
      'Split CSS per page or component and inline only critical above-the-fold rules.',
    ],
  },
  'unminified-javascript': {
    category: 'JavaScript',
    title: 'Minify JavaScript',
    fixes: ['Enable minification in the build (esbuild, Terser, SWC) for every production bundle.'],
  },
  'unminified-css': {
    category: 'Rendering',
    title: 'Minify CSS',
    fixes: ['Enable CSS minification in the build (Lightning CSS, cssnano).'],
  },
  'legacy-javascript-insight': {
    key: 'legacy-javascript',
    category: 'JavaScript',
    title: 'Stop shipping legacy JavaScript to modern browsers',
    fixes: [
      'Update the browserslist / build target so modern browsers do not get polyfills and transpiled code they do not need.',
      'Remove unnecessary polyfill packages (core-js) or load them only for old browsers.',
    ],
  },
  'legacy-javascript': { key: 'legacy-javascript', category: 'JavaScript', fixes: [] },
  'duplicated-javascript-insight': {
    key: 'duplicated-javascript',
    category: 'JavaScript',
    title: 'Remove duplicated JavaScript modules',
    fixes: ['Deduplicate dependencies (npm dedupe), align package versions, and share common chunks between bundles.'],
  },
  'duplicated-javascript': { key: 'duplicated-javascript', category: 'JavaScript', fixes: [] },
  'bootup-time': {
    category: 'JavaScript',
    title: 'Reduce JavaScript execution time',
    fixes: [
      'Ship less JavaScript: remove unused code and heavy libraries.',
      'Defer non-critical scripts and hydrate interactive islands only when visible.',
      'Break long tasks into smaller chunks (yield to the main thread with scheduler.yield or setTimeout).',
    ],
  },
  'mainthread-work-breakdown': {
    category: 'JavaScript',
    title: 'Minimise main-thread work',
    fixes: [
      'Reduce script evaluation, style recalculation and layout work — the breakdown shows which dominates.',
      'Move heavy computation to a Web Worker.',
      'Simplify CSS selectors and reduce DOM size to cut style and layout cost.',
    ],
  },
  'forced-reflow-insight': {
    category: 'JavaScript',
    title: 'Avoid forced synchronous layouts',
    fixes: ['Batch DOM reads before writes; avoid reading offsetWidth/getBoundingClientRect right after changing styles.'],
  },
  'long-tasks': {
    category: 'JavaScript',
    title: 'Avoid long main-thread tasks',
    fixes: ['Split work into tasks under 50 ms and yield to the main thread between them.'],
  },
  'image-delivery-insight': {
    key: 'modern-images',
    category: 'Images',
    title: 'Improve image delivery',
    fixes: [
      'Serve AVIF or WebP, compressed at a sensible quality (e.g. 60–80).',
      'Resize images to the size they are displayed at and use srcset/sizes for responsive variants.',
      'Use an image CDN to automate format negotiation and resizing.',
    ],
  },
  'modern-image-formats': { key: 'modern-images', category: 'Images', fixes: [] },
  'uses-optimized-images': { key: 'modern-images', category: 'Images', fixes: [] },
  'uses-responsive-images': { key: 'modern-images', category: 'Images', fixes: [] },
  'offscreen-images': { key: 'lazy-images', category: 'Images', fixes: ['Add loading="lazy" to below-the-fold images.'] },
  'efficient-animated-content': {
    category: 'Images',
    title: 'Use video instead of animated GIFs',
    fixes: ['Convert animated GIFs to MP4/WebM and play them with <video autoplay muted loop playsinline>.'],
  },
  'unsized-images': {
    key: 'unsized-images',
    category: 'Rendering',
    title: 'Give images explicit width and height',
    fixes: ['Add width and height attributes (or CSS aspect-ratio) to images.'],
  },
  'cls-culprits-insight': {
    category: 'Rendering',
    title: 'Fix layout shifts',
    fixes: [
      'Reserve space for images, ads, embeds and late-loading banners with explicit sizes or aspect-ratio.',
      'Avoid inserting content above existing content after load.',
      'Use font-display: optional or size-adjusted fallback fonts to stop text reflowing.',
    ],
  },
  'non-composited-animations': {
    category: 'Rendering',
    title: 'Use compositor-friendly animations',
    fixes: ['Animate only transform and opacity; avoid animating layout properties like top, width or margin.'],
  },
  'lcp-discovery-insight': {
    category: 'Rendering',
    title: 'Make the main (LCP) image discoverable early',
    fixes: [
      'Reference the LCP image directly in the HTML with <img>, not via CSS background or JavaScript.',
      'Add `fetchpriority="high"` to it and never `loading="lazy"`.',
      'Preload it with <link rel="preload" as="image"> if it cannot be in the initial HTML.',
    ],
  },
  'lcp-breakdown-insight': {
    category: 'Rendering',
    title: 'Speed up the Largest Contentful Paint element',
    fixes: ['Reduce server response time, remove render-blocking resources, and prioritise the LCP resource.'],
  },
  'network-dependency-tree-insight': {
    category: 'Rendering',
    title: 'Shorten critical request chains',
    fixes: [
      'Flatten chains where one file loads another (CSS @import, JS that loads more JS, font in CSS in CSS).',
      'Preload late-discovered critical resources and preconnect to the origins they come from.',
    ],
  },
  'document-latency-insight': {
    key: 'document-latency',
    category: 'Server',
    title: 'Speed up the main document response',
    fixes: ['Avoid redirects, enable compression, and reduce server response time (caching, faster back end).'],
  },
  'server-response-time': {
    key: 'document-latency',
    category: 'Server',
    title: 'Reduce server response time',
    fixes: ['Add page caching at the server or CDN edge and optimise slow database queries.'],
  },
  redirects: { key: 'redirects', category: 'Server', fixes: [] },
  'uses-text-compression': { key: 'compression', category: 'Page weight', fixes: [] },
  'cache-insight': {
    key: 'static-caching',
    category: 'Caching',
    title: 'Cache static assets for longer',
    fixes: [
      'Serve fingerprinted assets (app.3f9a1c.js) with `Cache-Control: public, max-age=31536000, immutable`.',
      'Give images and fonts long lifetimes too; change the file name when the content changes.',
    ],
  },
  'uses-long-cache-ttl': { key: 'static-caching', category: 'Caching', fixes: [] },
  'font-display-insight': {
    key: 'font-display',
    category: 'Fonts',
    fixes: ['Add font-display: swap or optional to @font-face rules.'],
  },
  'font-display': { key: 'font-display', category: 'Fonts', fixes: [] },
  'third-parties-insight': {
    key: 'third-parties',
    category: 'Third parties',
    title: 'Reduce the impact of third-party code',
    fixes: [
      'Remove unused tags and widgets; load the rest after the page is interactive.',
      'Use facades for heavy embeds (chat widgets, video players) that load on interaction.',
    ],
  },
  'third-party-summary': { key: 'third-parties', category: 'Third parties', fixes: [] },
  'total-byte-weight': {
    category: 'Page weight',
    title: 'Reduce total page weight',
    fixes: ['Compress and resize images, remove unused JavaScript/CSS, and lazy-load below-the-fold media.'],
  },
  'dom-size-insight': {
    category: 'Rendering',
    title: 'Reduce DOM size',
    fixes: [
      'Render long lists virtually or paginate them; remove wrapper elements and hidden duplicate markup (e.g. separate mobile/desktop menus).',
    ],
  },
  'modern-http-insight': { key: 'http2', category: 'Protocol & security', fixes: ['Serve all resources over HTTP/2 or HTTP/3.'] },
  'uses-http2': { key: 'http2', category: 'Protocol & security', fixes: [] },
  'viewport-insight': {
    key: 'viewport',
    category: 'Rendering',
    fixes: ['Add <meta name="viewport" content="width=device-width, initial-scale=1">.'],
  },
  'bf-cache': {
    category: 'Caching',
    title: 'Allow the back/forward cache',
    fixes: ['Avoid `unload` handlers and `Cache-Control: no-store` on pages so back/forward navigations restore instantly.'],
  },
};
