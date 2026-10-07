// Findings from fetching the page directly: transport, headers and HTML structure.

import { formatBytes, formatMs, type Rule } from './types';

const compression: Rule = ({ inspection }) => {
  if (!inspection?.html || inspection.compression || inspection.html.bytes < 1024) return [];
  return [
    {
      id: 'compression',
      title: 'Compress text responses',
      severity: 'high',
      category: 'Page weight',
      summary: `The HTML (${formatBytes(inspection.html.bytes)}) was sent uncompressed. Brotli or gzip typically shrink HTML, CSS and JavaScript by 70–80%, which matters most on slow and distant connections.`,
      evidence: [`No Content-Encoding on ${inspection.finalUrl}`],
      fixes: [
        'Enable Brotli (preferred) and gzip compression in the web server or CDN for text/html, text/css, application/javascript, application/json and image/svg+xml.',
        'nginx: `brotli on; gzip on; gzip_types text/css application/javascript application/json image/svg+xml;` — Apache: enable mod_brotli / mod_deflate.',
        'Pre-compress static build output (.br / .gz files) so the server does not compress on every request.',
      ],
      impactBytes: Math.round(inspection.html.bytes * 0.7),
      sources: ['Page inspector'],
      learnMoreUrl: 'https://developer.chrome.com/docs/lighthouse/performance/uses-text-compression',
    },
  ];
};

const brotli: Rule = ({ inspection }) => {
  if (!inspection?.compression || inspection.supportsBrotli !== false || !inspection.compression.includes('gzip')) return [];
  return [
    {
      id: 'brotli',
      title: 'Switch from gzip to Brotli',
      severity: 'low',
      category: 'Page weight',
      summary: 'Brotli compresses text roughly 15–20% smaller than gzip and every modern browser supports it.',
      evidence: [`Server answered with "${inspection.compression}" even when Brotli was offered`],
      fixes: [
        'Enable Brotli on the server or CDN (most CDNs have a one-click setting).',
        'Keep gzip as the fallback for old clients.',
      ],
      impactBytes: inspection.html ? Math.round(inspection.html.bytes * 0.05) : undefined,
      sources: ['Page inspector'],
    },
  ];
};

const redirects: Rule = ({ inspection }) => {
  if (!inspection || inspection.redirects.length === 0) return [];
  const hops = inspection.redirects;
  const time = hops.reduce((sum, h) => sum + h.timeMs, 0);
  return [
    {
      id: 'redirects',
      title: hops.length > 1 ? `Remove ${hops.length} chained redirects` : 'Avoid the redirect before the page',
      severity: hops.length > 1 ? 'high' : 'medium',
      category: 'Server',
      summary:
        'Each redirect costs a full round trip — DNS, connection and request — before the page can start loading. For distant visitors that is hundreds of milliseconds per hop.',
      evidence: [
        ...hops.map((h) => `${h.status} ${h.url}`),
        `→ ${inspection.finalUrl}`,
        `${formatMs(time)} spent on redirects from the test server`,
      ],
      fixes: [
        `Link to and advertise the final URL (${inspection.finalUrl}) everywhere: ads, emails, social profiles and sitemaps.`,
        'Collapse chains so any old URL redirects to the final URL in a single hop (e.g. http://example.com → https://www.example.com directly).',
        'Enable HSTS (and preload) so browsers go straight to HTTPS without the http → https redirect.',
      ],
      impactMs: time,
      sources: ['Page inspector'],
    },
  ];
};

const http2: Rule = ({ inspection }) => {
  if (!inspection || inspection.httpVersion !== 'http/1.1' || !inspection.finalUrl.startsWith('https:')) return [];
  return [
    {
      id: 'http2',
      title: 'Enable HTTP/2',
      severity: 'high',
      category: 'Protocol & security',
      summary:
        'The server only speaks HTTP/1.1, so browsers must open several connections and requests queue behind each other. HTTP/2 multiplexes all requests over one connection.',
      evidence: ['ALPN negotiation offered h2 but the server chose http/1.1'],
      fixes: [
        'Enable HTTP/2 in the web server (nginx: `listen 443 ssl http2;`) or put the site behind a CDN, which enables it by default.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const http3: Rule = ({ inspection }) => {
  if (!inspection || inspection.supportsHttp3 || !inspection.finalUrl.startsWith('https:')) return [];
  return [
    {
      id: 'http3',
      title: 'Enable HTTP/3 (QUIC)',
      severity: 'low',
      category: 'Protocol & security',
      summary: 'HTTP/3 sets up connections faster and copes better with packet loss on mobile and long-distance links.',
      evidence: ['No "h3" advertised in the Alt-Svc response header'],
      fixes: [
        'Turn on HTTP/3 at the CDN (Cloudflare, Fastly, CloudFront and others support it) or in nginx 1.25+ / Caddy / LiteSpeed.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const hsts: Rule = ({ inspection }) => {
  if (!inspection || inspection.hsts || !inspection.finalUrl.startsWith('https:')) return [];
  return [
    {
      id: 'hsts',
      title: 'Add a Strict-Transport-Security header',
      severity: 'low',
      category: 'Protocol & security',
      summary:
        'Without HSTS, visitors who type the domain go to http:// first and pay for an extra redirect. HSTS makes the browser use HTTPS straight away.',
      evidence: ['No Strict-Transport-Security header on the final response'],
      fixes: [
        'Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` and consider submitting the domain to hstspreload.org.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const viewport: Rule = ({ inspection }) => {
  if (!inspection?.html || inspection.html.hasViewport) return [];
  return [
    {
      id: 'viewport',
      title: 'Add a mobile viewport meta tag',
      severity: 'high',
      category: 'Rendering',
      summary: 'Without a viewport tag mobile browsers render a zoomed-out desktop layout and can delay taps.',
      evidence: ['No <meta name="viewport"> found in the HTML'],
      fixes: ['Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to the <head>.'],
      sources: ['Page inspector'],
    },
  ];
};

const renderBlocking: Rule = ({ inspection }) => {
  const scripts = inspection?.html?.renderBlockingScripts ?? [];
  if (scripts.length === 0) return [];
  return [
    {
      id: 'render-blocking',
      title: 'Eliminate render-blocking resources',
      severity: scripts.length > 2 ? 'high' : 'medium',
      category: 'Rendering',
      summary:
        'Scripts and stylesheets in the <head> without async/defer stop the browser from painting anything until they have downloaded and run.',
      evidence: scripts.slice(0, 6).map((s) => `Blocking script: ${s}`),
      fixes: [
        'Add `defer` to scripts that need the DOM, `async` to independent ones (analytics, tags), or load them as `type="module"`.',
        'Inline the small amount of critical CSS needed for the first screen and load the rest without blocking (media/onload swap).',
        'Move third-party tags into a tag manager that loads after the page has rendered.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const largeHtml: Rule = ({ inspection }) => {
  const bytes = inspection?.html?.bytes ?? 0;
  if (bytes <= 150_000) return [];
  const inline = (inspection?.html?.inlineScriptBytes ?? 0) + (inspection?.html?.inlineStyleBytes ?? 0);
  return [
    {
      id: 'large-html',
      title: 'Reduce the size of the HTML document',
      severity: bytes > 500_000 ? 'high' : 'medium',
      category: 'Page weight',
      summary: `The HTML is ${formatBytes(bytes)} before compression. The browser must download and parse it before discovering the page's images, styles and scripts.`,
      evidence: [`HTML: ${formatBytes(bytes)}`, `Inline <script>/<style>: ${formatBytes(inline)}`],
      fixes: [
        'Move large inline scripts, JSON state blobs and styles into cacheable external files.',
        'Paginate or lazy-render long lists and below-the-fold sections.',
        'Strip unused markup, comments and duplicate SVG icons (use an SVG sprite).',
      ],
      impactBytes: bytes - 100_000,
      sources: ['Page inspector'],
    },
  ];
};

const unsizedImages: Rule = ({ inspection }) => {
  const count = inspection?.html?.imagesWithoutDimensions ?? 0;
  if (count === 0) return [];
  return [
    {
      id: 'unsized-images',
      title: 'Give images explicit width and height',
      severity: count >= 5 ? 'medium' : 'low',
      category: 'Rendering',
      summary:
        'Images without dimensions make the layout jump as they load (Cumulative Layout Shift), which users notice and Google measures.',
      evidence: [`${count} of ${inspection?.html?.images} <img> elements have no width/height attributes`],
      fixes: ['Add width and height attributes (or CSS aspect-ratio) to every <img>, <video> and <iframe>.'],
      sources: ['Page inspector'],
    },
  ];
};

const lazyImages: Rule = ({ inspection }) => {
  const count = inspection?.html?.imagesWithoutLazy ?? 0;
  if (count < 3) return [];
  return [
    {
      id: 'lazy-images',
      title: 'Lazy-load below-the-fold images',
      severity: count >= 10 ? 'medium' : 'low',
      category: 'Images',
      summary: 'Images further down the page compete for bandwidth with what the visitor sees first.',
      evidence: [`${count} images after the first two have no loading="lazy"`],
      fixes: [
        'Add `loading="lazy"` to images below the first screen.',
        'Never lazy-load the main (LCP) image — give it `fetchpriority="high"` instead.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const modernImages: Rule = ({ inspection }) => {
  const count = inspection?.html?.legacyImageFormats ?? 0;
  if (count < 2) return [];
  return [
    {
      id: 'modern-images',
      title: 'Serve images in modern formats',
      severity: 'medium',
      category: 'Images',
      summary: 'AVIF and WebP are typically 25–50% smaller than JPEG and PNG at the same visual quality.',
      evidence: [`${count} images are JPEG/PNG/GIF without an AVIF or WebP alternative`],
      fixes: [
        'Convert images to AVIF/WebP at build time, or use an image CDN that negotiates the format automatically.',
        'Use <picture> with AVIF/WebP <source> elements and a JPEG fallback.',
        'Serve responsive sizes with srcset/sizes so phones do not download desktop-sized images.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

const thirdParties: Rule = ({ inspection }) => {
  const html = inspection?.html;
  if (!html) return [];
  const origins = html.thirdPartyOrigins;
  const missingPreconnect = origins.filter((o) => !html.preconnectOrigins.includes(o));
  if (origins.length >= 8) {
    return [
      {
        id: 'third-parties',
        title: `Reduce third-party origins (${origins.length})`,
        severity: origins.length >= 15 ? 'high' : 'medium',
        category: 'Third parties',
        summary:
          'Each third-party origin needs its own DNS lookup, connection and TLS handshake, and its scripts compete with yours for the main thread.',
        evidence: origins.slice(0, 8).map((o) => `Loads from ${o}`),
        fixes: [
          'Remove tags and widgets nobody uses; audit the tag manager.',
          'Self-host critical third-party assets (fonts, libraries) on your own domain/CDN.',
          'Load the rest after the page is interactive, and preconnect to the one or two most important origins.',
        ],
        sources: ['Page inspector'],
      },
    ];
  }
  if (missingPreconnect.length >= 3) {
    return [
      {
        id: 'preconnect',
        title: 'Preconnect to key third-party origins',
        severity: 'low',
        category: 'Third parties',
        summary: 'A preconnect hint lets the browser set up the connection to an origin while it is still parsing the page.',
        evidence: missingPreconnect.slice(0, 5).map((o) => `No preconnect for ${o}`),
        fixes: [
          'Add `<link rel="preconnect" href="https://origin" crossorigin>` for the two or three origins needed to render the first screen.',
        ],
        sources: ['Page inspector'],
      },
    ];
  }
  return [];
};

const fontDisplay: Rule = ({ inspection }) => {
  if (inspection?.html?.fontDisplaySwap !== false) return [];
  return [
    {
      id: 'font-display',
      title: 'Show text while web fonts load',
      severity: 'medium',
      category: 'Fonts',
      summary: 'Without font-display, text can stay invisible for up to 3 seconds while a web font downloads.',
      evidence: [
        inspection.html.usesGoogleFonts ? 'Google Fonts URL without display=swap' : '@font-face rules without font-display',
      ],
      fixes: [
        'Add `font-display: swap` (or optional) to every @font-face rule; append `&display=swap` to Google Fonts URLs.',
        'Self-host fonts as WOFF2, subset them, and preload the one or two used above the fold.',
      ],
      sources: ['Page inspector'],
    },
  ];
};

export const pageRules: Rule[] = [
  compression,
  brotli,
  redirects,
  http2,
  http3,
  hsts,
  viewport,
  renderBlocking,
  largeHtml,
  unsizedImages,
  lazyImages,
  modernImages,
  thirdParties,
  fontDisplay,
];
