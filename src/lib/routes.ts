/**
 * The app's URL vocabulary, kept apart from the router itself.
 *
 * `router.svelte.ts` reads `location` and subscribes to `hashchange` at module
 * scope, so importing it from a test would throw — the suite runs in node with
 * no DOM. Parsing is the part worth testing, so it lives here where a test can
 * reach it.
 */

export type RouteName =
  | 'home'
  | 'search'
  | 'compose'
  | 'notifications'
  | 'profile'
  | 'user'
  | 'post';

export interface Route {
  name: RouteName;
  /** Identifier for the `user` route (npub / hex) and the `post` route. */
  param?: string;
}

/**
 * Read a route out of a location hash (with or without the leading `#`).
 *
 * Only two segments are recognised, so an identifier must not contain a `/` —
 * hex and bech32 never do. Anything unrecognised, and a parameterised route
 * with no parameter, falls back to home.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, param] = path.split('/');
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
    case 'post':
      return param ? { name: 'post', param: decodeURIComponent(param) } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}
