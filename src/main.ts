import '@konemono/nostr-web-components/style.css';

// The package marks its JS as side-effect-free, so a static side-effect import
// gets tree-shaken and the customElements.define() calls never run.
// A dynamic import always executes the module, keeping the registration.
await import('@konemono/nostr-web-components');

import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { installNip07 } from './lib/nip07';

// Before the app mounts, so anything that looks for a signer on load finds one.
installNip07();

const app = mount(App, {
  target: document.getElementById('app') as HTMLElement,
});

export default app;
