# Plan Prompt — Shared Search Components (Angular 20 + PrimeNG AutoComplete)

> **Usage:** paste everything below the divider into the planning agent, verbatim.
> Target: the Angular micro-frontend monorepo (guest apps only — **no Electron shell access**).
> Scope: guest-side focus workaround for the dockview/webview stale-focus bug, shared
> search/autocomplete component library, performance budget, motion system.

---

# ROLE

Act as a master-level expert in **Angular 20**, **Nx monorepo architecture**, and **TypeScript UI engineering**. You have deep, current knowledge of: standalone components, signals and signal-based inputs/outputs, zoneless change detection, the built-in control flow (`@if/@for/@switch`), `@defer` blocks, the modern `animate` API, PrimeNG 19/20 internals, and Electron-embedded micro-frontend rendering. You design for the long term: every decision must scale to dozens of apps and hundreds of component instances without degrading.

Your job is to produce an **implementation plan** (not code yet) for the work described below. Be opinionated. Where the existing codebase pattern is good, follow it; where it is weaker than the state of the art, improve it — but justify every deviation in one sentence and keep migration cost in view.

# CONTEXT

- Nx monorepo of Angular micro-frontend apps hosted inside an Electron desktop shell. Apps render inside pooled `<webview>` elements arranged by **dockview** workspaces; workspace switching toggles webview visibility, webviews are never destroyed.
- **You have NO access to the Electron shell code.** All changes must live inside the Angular monorepo (apps + shared libs). Shell-side fixes are out of scope; where a shell fix would be superior, note it in a handoff section but do not depend on it.
- There is a family of **shared search components**: text inputs with **PrimeNG AutoComplete**, used many times per screen, across many apps. They are the highest-traffic UI surface in the product.
- Known bug (already diagnosed — do not re-litigate, plan around it): after a workspace switch, the newly visible webview receives mouse/scroll (hit-tested routing) but **keyboard focus is stale** — the guest webContents is never re-focused, `document.hasFocus()` is false, inputs won't accept typing until an OS-level window blur/focus (alt-tab). Clicks reach the DOM and set `activeElement`, but keystrokes are not routed to the guest.

# FOCUS WORKAROUND — GUEST-SIDE ONLY (first-class scope)

Design and plan a self-healing focus mechanism that lives entirely in the Angular monorepo:

1. **Primary — app-wide initializer (shared lib):** a `provideAppInitializer` (or equivalent bootstrap provider) exported from a shared lib and added to every app's `app.config.ts`. It installs ONE capture-phase `pointerdown` listener on `window` that:
   - checks `document.hasFocus()`; if false, calls `window.focus()` (valid — it runs inside a user gesture),
   - then re-focuses the event's intended focus target on the next tick (`requestAnimationFrame` or microtask) so the element registers with keyboard/IME routing AFTER webContents focus lands,
   - is idempotent, guards against double-install, and no-ops in dev-server/browser contexts where `document.hasFocus()` is already true.
2. **Secondary — `visibilitychange` / `focusin` opportunistic heal:** on document becoming visible or on `focusin` with `!document.hasFocus()`, attempt `window.focus()` + restore last-focused element. Treat as best-effort (may be ignored without a user gesture); it must never steal focus when the app legitimately lacks it (Electron window itself unfocused, DevTools open, another app focused). Define the guard conditions precisely.
3. **Tertiary — `FocusHealDirective`:** a small reusable directive applied inside the shared search components as defense-in-depth. Never per-component copies of listener code.
4. **Handoff note:** a short markdown doc for the shell team describing the proper shell-side fix (re-focus active webview on workspace activation; `blurWebView()/focusOnWebView()` fallback) and what residual gap the guest-side workaround leaves (typing immediately after a switch, before any click).

# OBJECTIVES

1. **Shared search component library** (Nx lib): design the definitive reusable search/autocomplete component(s) on PrimeNG AutoComplete, consumed by all apps. Follow existing monorepo library boundary conventions (domain libs, shared-ui primitives; libs stay Electron-agnostic — the focus initializer must feature-detect, never import Electron).
2. **Peak input performance with many instances on one screen.** Plan for:
   - `ChangeDetectionStrategy.OnPush` everywhere; signals for all component state; evaluate zoneless (`provideZonelessChangeDetection`) per-app feasibility and give a migration verdict.
   - Query pipeline: debounced (per-instance configurable), `switchMap`-cancelled, request de-duplication, and a shared LRU suggestion cache keyed by (source, query) so N instances don't issue N identical requests.
   - PrimeNG AutoComplete tuning: `virtualScroll` for large suggestion lists, lazy suggestion loading, `optionLabel`/`dataKey` correctness, overlay `appendTo` strategy that is safe inside webviews (overlay clipping/z-index inside dockview panels — call out the risk and the fix).
   - Render cost: `@for` with stable `track`, `@defer` for below-the-fold or non-critical panels, no template-invoked functions in hot paths, no unnecessary pipe recomputation.
3. **Transitions & animations** that never fight performance:
   - Compositor-friendly properties only (`transform`, `opacity`); no layout-triggering animations on hot paths.
   - A small, tokenized motion system (durations/easings as design tokens in the shared lib) for: panel transitions, autocomplete overlay enter/leave, input focus states, skeleton/loading states.
   - Respect `prefers-reduced-motion`.
   - Choose Angular animation APIs vs pure CSS per case; default to CSS for anything that runs during typing.

# CONSTRAINTS

- Follow the monorepo's existing patterns first (project layout, lib boundaries, naming, interop/FDC3 wiring); improve only with stated justification.
- All code lives in the Angular monorepo. No shell changes, no preload assumptions.
- No premature abstraction: one lib for the search components, not a framework.
- Every performance claim in the plan must name its mechanism (what work is avoided and where).

# DELIVERABLE — THE PLAN

Produce a step-by-step implementation plan with:

1. **Architecture**: proposed Nx lib(s), public API of the shared search component(s) (signal inputs/outputs sketch), dependency graph, and where the focus-heal initializer lives.
2. **Phased steps** in dependency order, each with: files touched, effort estimate (S/M/L), and risk. Phase 1 must be the focus workaround — it unblocks users immediately and is independent of the component work.
3. **Performance budget**: target metrics (input latency < 16ms per keystroke, suggestion render < 100ms, zero long tasks > 50ms while typing) and how each phase protects them.
4. **Test/verification plan**: unit, component harness, and manual Electron scenarios (workspace switch → click → type; switch → type WITHOUT clicking, to document the known residual gap; multi-instance stress with 20+ autocompletes; verify no focus-stealing when the Electron window is unfocused).
5. **Handoff doc** for the shell team as described above.
6. **Explicit list of pattern deviations** from the current codebase and the one-line justification for each.

Do not write implementation code in this pass. Ask at most 3 clarifying questions ONLY if an answer would materially change the architecture; otherwise state your assumptions and proceed.
