import { useCallback, useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'report'; id: string } | { name: 'not-found' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  const match = pathname.match(/^\/report\/([a-z0-9-]+)\/?$/);
  if (match) return { name: 'report', id: match[1] };
  return { name: 'not-found' };
}

export function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}
