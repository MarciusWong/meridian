import { describe, expect, it } from 'vitest';
import { detectCdn, inspectHtml, registrableDomain } from '../server/analysis/pageAnalysis';

describe('detectCdn', () => {
  it.each([
    [{ server: 'cloudflare', 'cf-ray': 'abc-LHR' }, 'Cloudflare'],
    [{ 'x-amz-cf-id': 'xyz', via: '1.1 abc.cloudfront.net (CloudFront)' }, 'Amazon CloudFront'],
    [{ 'x-served-by': 'cache-lhr7351-LHR', 'x-fastly-request-id': '1' }, 'Fastly'],
    [{ server: 'AkamaiGHost' }, 'Akamai'],
    [{ 'x-vercel-id': 'lhr1::abc', server: 'Vercel' }, 'Vercel'],
    [{ 'x-nf-request-id': '01', server: 'Netlify' }, 'Netlify'],
    [{ 'x-azure-ref': 'abc' }, 'Azure Front Door'],
    [{ server: 'BunnyCDN-DE1-1084' }, 'Bunny CDN'],
    [{ server: 'nginx' }, null],
  ])('detects %j as %s', (headers, expected) => {
    expect(detectCdn(headers as Record<string, string>)).toBe(expected);
  });
});

describe('registrableDomain', () => {
  it('handles common and two-part public suffixes', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com');
    expect(registrableDomain('cdn.shop.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('a.b.example.com.au')).toBe('example.com.au');
    expect(registrableDomain('localhost')).toBe('localhost');
  });
});

const PAGE = `<!doctype html>
<html><head>
  <title>  Example shop </title>
  <meta name="viewport" content="width=device-width">
  <link rel="preconnect" href="https://fonts.gstatic.com">
  <link rel="stylesheet" href="/app.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
  <link rel="preload" href="/hero.avif" as="image">
  <script src="https://www.googletagmanager.com/gtag/js?id=1"></script>
  <script src="/vendor.js"></script>
  <script src="/app.js" defer></script>
  <script type="module" src="/mod.js"></script>
  <script async src="https://cdn.segment.com/a.js"></script>
  <script>window.x = 1;</script>
  <style>body{margin:0}</style>
</head><body>
  <img src="/hero.jpg" width="800" height="400">
  <picture><source srcset="/b.avif" type="image/avif"><img src="/b.jpg" width="1" height="1"></picture>
  <img src="/c.png">
  <img src="/d.webp" loading="lazy" width="1" height="1">
  <img src="https://images.example.com/e.jpg" width="1" height="1">
  <script src="/footer.js"></script>
</body></html>`;

describe('inspectHtml', () => {
  const insights = inspectHtml(PAGE, 'https://www.example.com/');

  it('reads basic document facts', () => {
    expect(insights.title).toBe('Example shop');
    expect(insights.hasViewport).toBe(true);
    expect(insights.bytes).toBe(Buffer.byteLength(PAGE));
  });
  it('finds render-blocking head scripts only', () => {
    expect(insights.renderBlockingScripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=1', 'https://www.example.com/vendor.js']);
    expect(insights.scripts).toBe(6);
    expect(insights.stylesheets).toBe(2);
  });
  it('measures inline code', () => {
    expect(insights.inlineScriptBytes).toBe('window.x = 1;'.length);
    expect(insights.inlineStyleBytes).toBe('body{margin:0}'.length);
  });
  it('audits images', () => {
    expect(insights.images).toBe(5);
    expect(insights.imagesWithoutDimensions).toBe(1);
    // lazy-loading is only expected beyond the first two images
    expect(insights.imagesWithoutLazy).toBe(2);
    // hero.jpg, c.png and e.jpg; b.jpg is inside a <picture> with an AVIF source
    expect(insights.legacyImageFormats).toBe(3);
  });
  it('lists third-party origins and preconnects', () => {
    expect(insights.thirdPartyOrigins.sort()).toEqual(
      ['https://cdn.segment.com', 'https://fonts.googleapis.com', 'https://www.googletagmanager.com'].sort(),
    );
    expect(insights.preconnectOrigins).toEqual(['https://fonts.gstatic.com']);
    expect(insights.preloads).toBe(1);
  });
  it('detects font loading strategy', () => {
    expect(insights.usesGoogleFonts).toBe(true);
    expect(insights.fontDisplaySwap).toBe(true);
  });
  it('returns null font-display when no web fonts are found', () => {
    expect(inspectHtml('<html><head></head><body></body></html>', 'https://a.com/').fontDisplaySwap).toBeNull();
  });
  it('detects @font-face without font-display', () => {
    const html = '<style>@font-face{font-family:X;src:url(x.woff2)}</style>';
    expect(inspectHtml(html, 'https://a.com/').fontDisplaySwap).toBe(false);
  });
});
