/**
 * setup.js
 * Sets up the browser globals required by the Betaflight parser source
 * (jQuery stub, semver, window/document) and exports a cached FlightLog loader.
 *
 * Call setupBrowserGlobals() before the first dynamic import of any src/ file.
 * Idempotent — safe to call multiple times.
 */

export function setupBrowserGlobals() {
  if (typeof globalThis._bblStubsInstalled !== 'undefined') return;
  globalThis._bblStubsInstalled = true;

  const noopChain = () => {
    const o = { length: 0 };
    for (const m of ['addClass','removeClass','toggleClass','css','html','text','show','hide','on','off','find','attr','val','trigger','each','data','prop']) {
      o[m] = () => o;
    }
    return o;
  };

  globalThis.window = { requestAnimationFrame: (cb) => setTimeout(cb, 16) };
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  globalThis.$ = Object.assign(noopChain, { extend: Object.assign });
  globalThis.semver = {
    gte(v1, v2) {
      const p = (v) => String(v).split('.').map((x) => parseInt(x) || 0);
      const [a, b] = [p(v1), p(v2)];
      for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
      }
      return true;
    },
    lte(v1, v2) { return !globalThis.semver.gt(v1, v2); },
    gt(v1, v2) {
      const p = (v) => String(v).split('.').map((x) => parseInt(x) || 0);
      const [a, b] = [p(v1), p(v2)];
      for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
      }
      return false;
    },
    lt(v1, v2) { return !globalThis.semver.gte(v1, v2); },
  };
}

// Module-level cache — Vercel warm-starts reuse the same module instance.
let _FlightLog = null;

export async function getFlightLog() {
  if (!_FlightLog) {
    setupBrowserGlobals();
    const mod = await import('../../src/flightlog.js');
    _FlightLog = mod.FlightLog;
  }
  return _FlightLog;
}
