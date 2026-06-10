export type RouteName = 'home' | 'search' | 'compose' | 'notifications' | 'profile' | 'user';

export interface Route {
  name: RouteName;
  /** Identifier for the `user` route (npub / hex). */
  param?: string;
}

function parseHash(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [head, param] = hash.split('/');
  switch (head) {
    case 'search':
      return { name: 'search' };
    case 'compose':
      return { name: 'compose' };
    case 'notifications':
      return { name: 'notifications' };
    case 'profile':
      return { name: 'profile' };
    case 'user':
      return param ? { name: 'user', param: decodeURIComponent(param) } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

class Router {
  current = $state<Route>(parseHash());

  constructor() {
    window.addEventListener('hashchange', () => {
      this.current = parseHash();
    });
  }

  go(path: string): void {
    location.hash = path;
  }
}

export const router = new Router();
