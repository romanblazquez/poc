import type { WebContents } from 'electron';
import type { AppAdapterConfig, AppDefinition } from '@fdc3-poc/fdc3-core';
import { resolveAppIdentityFromUrl } from './window-manager.js';

/**
 * AdapterInjector — bridges non-FDC3 apps into the interop fabric.
 *
 * For apps whose directory entry declares an `adapter`, this injects a small
 * runtime into the page after each load. The runtime:
 *  - emit rules:   delegated DOM listeners → window.fdc3.broadcast / raiseIntent
 *  - listen rules: window.fdc3.addContextListener → DOM updates (+ optional click)
 *
 * The preload has already exposed window.fdc3, so the injected script only
 * translates between the app's DOM and the standard FDC3 API. Configuration
 * is passed as JSON — no app-provided code is ever evaluated.
 */
export function injectAppAdapter(wc: WebContents, appDefs: AppDefinition[]): void {
  const url = wc.getURL();
  if (!url || url.startsWith('devtools://')) return;

  const appId = resolveAppIdentityFromUrl(url, appDefs);
  if (!appId) return;

  const adapter = appDefs.find((a) => a.appId === appId)?.adapter;
  if (!adapter || adapter.enabled === false) return;
  if (!adapter.emit?.length && !adapter.listen?.length) return;

  wc.executeJavaScript(buildAdapterScript(adapter))
    .then(() => console.log(`[adapter] injected into ${appId} (${adapter.emit?.length ?? 0} emit, ${adapter.listen?.length ?? 0} listen)`))
    .catch((error) => console.warn(`[adapter] injection failed for ${appId}:`, (error as Error).message));
}

function buildAdapterScript(config: AppAdapterConfig): string {
  // The runtime is a plain IIFE evaluated in the page's main world. Config is
  // serialized as JSON, so selectors/paths are data — never executed as code.
  return `(${ADAPTER_RUNTIME})(${JSON.stringify(config)});`;
}

const ADAPTER_RUNTIME = String.raw`function installFdc3Adapter(config) {
  if (window.__fdc3AdapterInstalled) return;
  window.__fdc3AdapterInstalled = true;

  var log = function () {
    var args = ['[fdc3-adapter]'].concat(Array.prototype.slice.call(arguments));
    console.debug.apply(console, args);
  };

  if (!window.fdc3) {
    console.warn('[fdc3-adapter] window.fdc3 not available — adapter inactive');
    return;
  }

  function readPath(obj, path) {
    var node = obj;
    var keys = path.split('.');
    for (var i = 0; i < keys.length; i++) {
      if (node == null) return undefined;
      node = node[keys[i]];
    }
    return node;
  }

  function writePath(obj, path, value) {
    var keys = path.split('.');
    var node = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }

  function readElement(el, accessor) {
    if (accessor.indexOf('attr:') === 0) return el.getAttribute(accessor.slice(5));
    var value = readPath(el, accessor);
    return typeof value === 'string' ? value.trim() : value;
  }

  (config.emit || []).forEach(function (rule) {
    document.addEventListener(rule.on.event, function (event) {
      var origin = event.target instanceof Element ? event.target.closest(rule.on.selector) : null;
      if (!origin) return;

      var context = JSON.parse(JSON.stringify((rule.context && rule.context.template) || {}));
      context.type = rule.context.type;
      var map = (rule.context && rule.context.map) || {};
      Object.keys(map).forEach(function (field) {
        var value = readElement(origin, map[field]);
        if (value !== undefined && value !== null && value !== '') writePath(context, field, value);
      });

      if (rule.action === 'raiseIntent' && rule.intent) {
        Promise.resolve(window.fdc3.raiseIntent(rule.intent, context))
          .then(function () { log('raised', rule.intent, context); })
          .catch(function (err) { log('raiseIntent failed', rule.intent, err); });
      } else {
        Promise.resolve(window.fdc3.broadcast(context))
          .then(function () { log('broadcast', context.type, context); })
          .catch(function (err) { log('broadcast failed', context.type, err); });
      }
    }, true); // capture phase — the app's own stopPropagation cannot hide events
    log('emit rule armed:', rule.on.event, 'on', rule.on.selector, '->', rule.context.type);
  });

  (config.listen || []).forEach(function (rule) {
    window.fdc3.addContextListener(rule.contextType, function (context) {
      (rule.apply || []).forEach(function (step) {
        var el = document.querySelector(step.selector);
        if (!el) { log('selector not found:', step.selector); return; }
        var value = readPath(context, step.from);
        if (value === undefined || value === null) return;
        if (step.set === 'textContent') {
          el.textContent = String(value);
        } else {
          el.value = String(value);
        }
        if (step.thenDispatch) el.dispatchEvent(new Event(step.thenDispatch, { bubbles: true }));
      });
      if (rule.thenClick) {
        var btn = document.querySelector(rule.thenClick);
        if (btn) btn.click();
      }
      log('applied', rule.contextType, context);
    });
    log('listening for', rule.contextType);
  });
}`;
