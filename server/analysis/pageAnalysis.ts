import * as cheerio from 'cheerio';
import type { HtmlInsights } from '../../shared/types';

// ------------------------------------------------------------------ CDN detection

type HeaderTest = (h: Record<string, string>) => boolean;

const has = (name: string): HeaderTest => (h) => name in h;
const matches = (name: string, pattern: RegExp): HeaderTest => (h) => pattern.test(h[name] ?? '');

// Order matters: more specific signatures first (e.g. Netlify and Vercel both sit behind other networks).
const CDN_SIGNATURES: Array<[string, HeaderTest[]]> = [
  ['Cloudflare', [has('cf-ray'), matches('server', /^cloudflare/i)]],
  ['Amazon CloudFront', [has('x-amz-cf-id'), has('x-amz-cf-pop'), matches('via', /cloudfront/i)]],
  ['Vercel', [has('x-vercel-id'), matches('server', /^vercel/i)]],
  ['Netlify', [has('x-nf-request-id'), matches('server', /^netlify/i)]],
  ['Akamai', [matches('server', /akamai/i), has('x-akamai-transformed'), has('akamai-grn'), has('x-akamai-request-id')]],
  ['Fastly', [has('x-fastly-request-id'), matches('x-served-by', /^cache-/i), matches('via', /varnish.*fastly|fastly/i)]],
  ['Azure Front Door', [has('x-azure-ref'), has('x-fd-int-roxy-purgeid')]],
  ['Google Cloud CDN', [matches('via', /\bgoogle\b/i), has('x-goog-cache-status')]],
  ['Bunny CDN', [matches('server', /^bunnycdn/i), has('cdn-pullzone')]],
  ['KeyCDN', [matches('server', /keycdn/i)]],
  ['CDN77', [matches('server', /cdn77/i)]],
  ['Sucuri', [has('x-sucuri-id')]],
  ['Imperva', [has('x-iinfo'), matches('x-cdn', /imperva|incapsula/i)]],
  ['StackPath', [has('x-hw'), matches('server', /stackpath/i)]],
  ['Gcore', [matches('server', /gcore/i), has('x-id-fe')]],
];

/** Returns the CDN serving the response, judged by its headers, or null. */
export function detectCdn(rawHeaders: Record<string, string>): string | null {
  const headers = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  for (const [name, tests] of CDN_SIGNATURES) {
    if (tests.some((test) => test(headers))) return name;
  }
  return null;
}

// ------------------------------------------------------------------ domains

const TWO_PART_SUFFIXES = /\.(co|com|net|org|gov|edu|ac|or|ne|go)\.[a-z]{2}$/i;

/** Approximates the registrable domain (eTLD+1) without a full public-suffix list. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.');
  if (labels.length <= 2) return hostname.toLowerCase();
  const take = TWO_PART_SUFFIXES.test(hostname) ? 3 : 2;
  return labels.slice(-take).join('.');
}

function resolve(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ HTML inspection

const LEGACY_IMAGE = /\.(jpe?g|png|gif|bmp)(\?|#|$)/i;
const MODERN_SOURCE = /image\/(avif|webp)|\.(avif|webp)(\?|\s|$)/i;
/** Images this early in the document are likely above the fold and should not be lazy-loaded. */
const EAGER_IMAGE_ALLOWANCE = 2;

export function inspectHtml(html: string, pageUrl: string): HtmlInsights {
  const $ = cheerio.load(html);
  const site = registrableDomain(new URL(pageUrl).hostname);
  const thirdParty = new Set<string>();

  const noteOrigin = (url: URL | null) => {
    if (url && /^https?:$/.test(url.protocol) && registrableDomain(url.hostname) !== site) thirdParty.add(url.origin);
  };

  const renderBlockingScripts: string[] = [];
  let scripts = 0;
  let inlineScriptBytes = 0;
  $('script').each((_, el) => {
    const node = $(el);
    const src = node.attr('src');
    const type = (node.attr('type') ?? '').toLowerCase();
    if (!src) {
      if (!type || type.includes('javascript') || type === 'module') inlineScriptBytes += Buffer.byteLength(node.html() ?? '');
      return;
    }
    scripts++;
    const url = resolve(src, pageUrl);
    noteOrigin(url);
    const blocking =
      node.closest('head').length > 0 &&
      node.attr('async') === undefined &&
      node.attr('defer') === undefined &&
      type !== 'module';
    if (blocking && url) renderBlockingScripts.push(url.toString());
  });

  let stylesheets = 0;
  let usesGoogleFonts = false;
  let googleFontsSwap = false;
  $('link[rel]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet')) return;
    stylesheets++;
    const url = resolve($(el).attr('href'), pageUrl);
    noteOrigin(url);
    if (url?.hostname === 'fonts.googleapis.com') {
      usesGoogleFonts = true;
      if (url.searchParams.get('display') === 'swap' || url.searchParams.get('display') === 'optional') googleFontsSwap = true;
    }
  });

  const preconnectOrigins = $('link[rel~="preconnect"], link[rel~="dns-prefetch"]')
    .map((_, el) => resolve($(el).attr('href'), pageUrl)?.origin)
    .get()
    .filter((o): o is string => Boolean(o));

  let inlineStyleBytes = 0;
  let fontFaces = 0;
  let fontFacesWithDisplay = 0;
  $('style').each((_, el) => {
    const css = $(el).html() ?? '';
    inlineStyleBytes += Buffer.byteLength(css);
    for (const block of css.match(/@font-face\s*{[^}]*}/gi) ?? []) {
      fontFaces++;
      if (/font-display\s*:\s*(swap|optional|fallback)/i.test(block)) fontFacesWithDisplay++;
    }
  });

  let images = 0;
  let imagesWithoutDimensions = 0;
  let imagesWithoutLazy = 0;
  let legacyImageFormats = 0;
  $('img').each((_, el) => {
    const img = $(el);
    images++;
    const src = img.attr('src') ?? img.attr('data-src');
    noteOrigin(resolve(src, pageUrl));
    if (img.attr('width') === undefined || img.attr('height') === undefined) imagesWithoutDimensions++;
    if (images > EAGER_IMAGE_ALLOWANCE && (img.attr('loading') ?? '').toLowerCase() !== 'lazy') imagesWithoutLazy++;
    const picture = img.closest('picture');
    const hasModernSource = picture.find('source').toArray().some((s) => MODERN_SOURCE.test(`${$(s).attr('type') ?? ''} ${$(s).attr('srcset') ?? ''}`));
    const modernSrcset = MODERN_SOURCE.test(img.attr('srcset') ?? '');
    if (src && LEGACY_IMAGE.test(src) && !hasModernSource && !modernSrcset) legacyImageFormats++;
  });

  let fontDisplaySwap: boolean | null = null;
  if (fontFaces > 0 || usesGoogleFonts) {
    const inlineOk = fontFaces === 0 || fontFacesWithDisplay === fontFaces;
    const googleOk = !usesGoogleFonts || googleFontsSwap;
    fontDisplaySwap = inlineOk && googleOk;
  }

  const title = $('title').first().text().trim();

  return {
    bytes: Buffer.byteLength(html),
    title: title || null,
    hasViewport: $('meta[name="viewport"]').length > 0,
    renderBlockingScripts,
    stylesheets,
    scripts,
    inlineScriptBytes,
    inlineStyleBytes,
    images,
    imagesWithoutDimensions,
    imagesWithoutLazy,
    legacyImageFormats,
    thirdPartyOrigins: [...thirdParty],
    preconnectOrigins: [...new Set(preconnectOrigins)],
    preloads: $('link[rel~="preload"], link[rel~="modulepreload"]').length,
    fontDisplaySwap,
    usesGoogleFonts,
  };
}
