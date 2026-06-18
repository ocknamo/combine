import type { Action } from 'svelte/action';

/**
 * Nostr Web Components renders user names inside an (open) Shadow DOM and exposes
 * no `slot` / `::part` / `::slotted`, so app CSS can't reach the name text. This
 * action injects a stylesheet into the component's open shadow root to keep a long
 * name on a single line with a trailing ellipsis (…), preventing layout breakage.
 *
 * - mode "name" (`<nostr-profile display="name">`): with `nolink`, the name is a
 *   bare text node on the host, so we constrain the host box itself. The width cap
 *   (~12 文字相当) is tunable via the `--combine-name-max` custom property.
 * - mode "card" (`<nostr-profile display="card">`): the name lives in
 *   `.profile-header`, so we clip that element at the available card width.
 *
 * 文字数ではなく幅ベースの省略のため、全角（日本語）名は 12 文字より手前で切れる
 * ことがあります。
 */
export const truncateName: Action<HTMLElement, 'name' | 'card' | undefined> = (node, mode) => {
  const STYLE_ID = 'combine-name-truncate';
  const css =
    (mode ?? 'name') === 'card'
      ? '.profile-header{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}'
      : ':host{display:inline-block;max-width:var(--combine-name-max,12ch);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;}';

  let raf = 0;

  function inject(): boolean {
    const root = node.shadowRoot;
    if (!root) return false;
    if (root.getElementById(STYLE_ID)) return true;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    // Appended last, so it overrides the component's own shadow styles by source
    // order, and it survives the component's internal re-renders.
    root.appendChild(style);
    return true;
  }

  // The shadow root is attached when the custom element upgrades; retry across a
  // few frames in case the element isn't defined/upgraded at action mount time.
  if (!inject()) {
    let tries = 0;
    const tick = () => {
      if (inject() || tries++ > 120) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
};
