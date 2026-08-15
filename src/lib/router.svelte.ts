import { parseRoute } from './routes';

export type { Route, RouteName } from './routes';

class Router {
  current = $state(parseRoute(location.hash));

  /**
   * In-app history entries behind the current one.
   *
   * Counted here rather than in {@link go} because `TabBar` navigates with
   * plain `<a href="#/…">` anchors that never call it. Assigning an unchanged
   * hash pushes no entry and fires no `hashchange`, so a repeated navigation to
   * the route already on screen cannot inflate the count either.
   */
  #depth = 0;
  #goingBack = false;

  constructor() {
    window.addEventListener('hashchange', () => {
      this.current = parseRoute(location.hash);
      if (this.#goingBack) {
        this.#goingBack = false;
        this.#depth = Math.max(0, this.#depth - 1);
      } else {
        this.#depth += 1;
      }
    });
  }

  go(path: string): void {
    location.hash = path;
  }

  /**
   * Step back through the app's own history, or go to `fallback` when there is
   * none of it left.
   *
   * The fallback is the point: a link opened straight into `#/post/…` has
   * nothing of ours behind it, and `history.back()` would take the user off the
   * site. The count is approximate the other way — the browser's own back
   * button also reads as a forward move — so after one of those this may hand
   * off to `history.back()` once more than it should. The deep-link case, which
   * is the one that would strand the user, is exact.
   */
  back(fallback = '/'): void {
    if (this.#depth === 0) {
      this.go(fallback);
      return;
    }
    this.#goingBack = true;
    history.back();
  }
}

export const router = new Router();
