# Engineering brief for the implementing agent
## `SearchBarComponent` focus/lifecycle defect under HarmonIX workspace switching — Angular web-app side

> **Fill before sending:** `<TICKET_ID>`, `<REPO_ROOT>`, `<SHARED_LIB_PATH>` (expected `libs/shared/ui/search-bar`), `<CONSUMER_APPS>` (e.g. `apps/fmr-ap113173-eqt-cancel-adjust-ui`), `<BRANCH_NAME>`, `<TRACE_OWNER>` (the human who can run the app inside HarmonIX and return the trace).

---

## 1. Role and mission

You are acting as a **Principal Front-End Engineer / Angular platform architect** working in an NX monorepo for a financial-services desktop suite. You own the shared UI library and are accountable for correctness, accessibility, and low regression risk across every application that consumes it.

**Mission:** eliminate the defect in which `SearchBarComponent` (shared, consumed by multiple UIs) stops working after the user switches away from and back to a HarmonIX workspace, and can only be recovered by an OS-level Alt+Tab. Deliver a **principled, evidence-backed fix on the Angular application side**, with tests that fail on the current implementation and pass on the fix, plus the artefacts needed to hand the platform-side defect to the HarmonIX/Elevate team.

You have full repository access. **The repository is the primary source of truth.** This brief contains a prior analysis that was produced *without* repository access; every statement it makes about the code is a hypothesis for you to confirm or refute. Where the repository contradicts this brief, follow the repository and say so explicitly in your report.

---

## 2. Context

### 2.1 System
- Angular application(s) built on the internal **AMES (Angular Modular Extensions)** framework, NX monorepo, Jest unit tests, NgRx state, Playwright available for E2E.
- Applications run inside **HarmonIX Elevate**, a desktop workspace platform integrated via `@fmr-pr000264/harmonix-elevate-desktop` (`DesktopCoreService.initializeHarmonix()`, `getHarmonixDesktop()` → object exposing `app.register`, `channels`, …).
- Evidence from an earlier integration diff: the wrapper required `@interopio/desktop` to be whitelisted in `allowedCommonJsDependencies`. This indicates HarmonIX Elevate is built on **io.Connect Desktop (formerly Glue42)**. Treat this as *likely, to be confirmed* by inspecting the wrapper's `package.json` and typings in `node_modules`.
- Consequence if confirmed: a HarmonIX "workspace" is an io.Connect Workspace. The Workspaces Frame is a shell holding workspaces as tabs; each application in a workspace is its own io.Connect window (a separate Chromium window). A workspace switch **hides/shows the app's own native window**; it is not a same-document DOM operation and not an iframe.

### 2.2 The component
- `SearchBarComponent`, `<SHARED_LIB_PATH>`, consumed by multiple UIs.
- Tracks input focus in component state `isInputInFocus: boolean`, set from native `(focus)` → `true` and `(blur)` → `false` on the input.
- The boolean drives dropdown visibility, clear-button behaviour and focused visual state.

### 2.3 Reproduction and symptoms
1. Open a HarmonIX workspace containing the app. 2. Click into the search input. 3. Switch to another workspace. 4. Return. 5. The input looks clickable, but search/dropdown/clear-button behaviour is frozen. 6. Alt+Tab away and back restores normal behaviour.

### 2.4 The failed first attempt (do not repeat)
```ts
@HostListener('window:focus')
onWindowFocus(): void {
  if (document.activeElement !== this.inputRef.nativeElement) { this.isInputInFocus = false; }
}
```
This did **not** resolve the issue. Note the shape of the predicate: it can only ever set the flag to `false`.

---

## 3. What the prior analysis established (facts vs. hypotheses)

### 3.1 Browser/engine facts (treat as reliable; verify in the trace if convenient)
- `mousedown` on the element that is already `document.activeElement` fires **no** `focus`/`focusin`; `el.focus()` on it fires nothing (HTML focusing steps return early when the target is the focused area).
- Losing *system* focus (Alt+Tab away) does **not** change `document.activeElement`; `document.hasFocus()` becomes `false`; `blur`+`focusout` fire on the element, then `blur` on `window`. Regaining fires `focus` on `window`, then `focus`+`focusin` on the same element. **This is why Alt+Tab repairs every stale state: it is a real blur→focus pair on an unchanged `activeElement`.**
- Chromium: removing the focused element from the DOM (Angular `ViewContainerRef.detach()`, `RouteReuseStrategy` detach, portal re-attach, `*ngIf` on an ancestor) fires **no** `blur`; `activeElement` silently becomes `<body>`. Making it unfocusable via `display:none` fires an *asynchronous* `blur`.
- During `blur`/`focusout`, Chrome already reports `activeElement === body`; `relatedTarget` is the receiving element or `null` (ambiguous).
- `focusin`/`focusout` fire in exactly the same circumstances as `focus`/`blur`; they change *where* you listen, not *whether* an event fires.
- An `input` or `keydown` event delivered to the input proves the input is the focused element.

### 3.2 Platform facts (io.Connect Desktop, docs.interop.io)
- `IOConnectWindow` exposes `isVisible`, `isFocused`, `isTabSelected`, and subscriptions `onVisibilityChanged`, `onFocusChanged`, `onStateChanged`.
- Workspaces API exposes `onWindowSelected`, `onWorkspaceHibernated`, `onWorkspaceResumed`, `onWorkspaceOpened/Closed`; `Frame.onFocusChanged`; per-workspace `onHibernated()/onResumed()`.
- **Hibernation exists**: a hibernated workspace's apps are closed and re-launched on resume. If enabled, "returning" is a *fresh instance* and the diagnosis changes entirely. Confirm the configuration with the platform team early.
- Hidden Chromium windows report `document.visibilityState === 'hidden'`; expect `visibilitychange` to fire on a workspace switch (to be confirmed by the trace). `window.focus` fires only when the app window is (re)activated, which is typically the user's first click into it — i.e. *after* the moment any reconciliation was needed.

### 3.3 Two mutually exclusive root-cause candidates — both must be handled
| | **A — stale TRUE** (the ticket's diagnosis) | **B — stale FALSE** (the inverse) |
|---|---|---|
| Component flag on return | `true` | `false` |
| `document.activeElement` on return | `<body>` / other | **the input** |
| `document.hasFocus()` while typing | `true` | probably **`false`** |
| Click on input fires `focus`? | yes | **no** |
| Why frozen | only if open/close logic is *edge*-triggered | flag is `false`; dropdown/clear never engage; typing still works |
| Missing browser event | `blur` (silent DOM detach) | `focus` (page focus never restored at Chromium level) |
| Effect of the failed patch | no-op unless `window.focus` fired during the switch | **no-op by construction** |

B explains the failed patch without extra assumptions; A requires two. Neither is proven. **The fix you implement must be correct under both.**

### 3.4 The discriminator
At the moment of the frozen click after returning, record: `document.activeElement === input`, `document.hasFocus()`, and whether `focus` fired.
`(input, false, no)` ⇒ B. `(not input, true, yes)` ⇒ A. Anything else ⇒ the model is incomplete; report the trace.

### 3.5 Root defect (independent of A/B)
A boolean that can only change by receiving paired events is a state machine with no reconciliation path, and the browser does not guarantee pairing. The remedy is **derived state**: compute focus from `document.activeElement` at every observable transition and every decision point so that any single missed event self-heals.

---

## 4. Scope and boundaries

**In scope (Angular web-app side):**
- `SearchBarComponent` and its template, styles, tests, and public API in `<SHARED_LIB_PATH>`.
- A platform-agnostic `WORKSPACE_VISIBILITY` abstraction in the shared lib with a default Page-Visibility implementation.
- An app-side adapter that implements the abstraction on top of the HarmonIX wrapper (`DesktopCoreService`) with graceful fallback when not running inside HarmonIX.
- Temporary, dev-only diagnostic instrumentation plus a runbook for the human to execute inside HarmonIX.
- Consumer migration in `<CONSUMER_APPS>` where they read/write `isInputInFocus`.
- Unit tests (Jest), a real-Chromium component test if the workspace has Playwright component testing or Storybook interaction tests, an E2E spec skeleton for io.Connect over CDP.
- PR description, changelog entry, and a platform hand-off note.

**Out of scope:**
- Changes to `@fmr-pr000264/harmonix-elevate-desktop`, io.Connect configuration, or any platform package. Document what the platform should change; do not implement it.
- Unrelated refactors, formatting sweeps, dependency upgrades, or changes to other shared components (unless they share the same `(focus)/(blur)` boolean pattern — then *list* them in the report; do not fix them in this PR).
- Any UX redesign of the search bar beyond what accessibility correctness requires.

---

## 5. Non-negotiable engineering principles
1. **Evidence before code.** Complete Phase 0 (discovery) and produce the findings table before modifying any production file. Do not accept this brief's hypotheses, the ticket's diagnosis, or the previous `pointerdown` proposal without repository evidence.
2. **Single source of truth.** The browser (`document.activeElement`, connectedness, containment) is the truth; component state is a derived cache refreshed by exactly one function.
3. **Level-triggered rendering.** Dropdown, clear button and focused styling are computed from state; no handler "opens" or "closes" anything on an edge.
4. **Deterministic, timer-free focus logic.** No `setTimeout`/`queueMicrotask` in focus paths.
5. **Minimal, justified listeners.** The component registers listeners only on its own host/template. One shared service owns the single `visibilitychange` listener for the whole app. Every listener must be traceable to a demonstrated reason in the report.
6. **Accessibility by construction.** WAI-ARIA combobox pattern; no focus stealing on activation; keyboard-only and screen-reader paths must recover without pointer events.
7. **Change-detection safe.** Works under `OnPush` and zoneless; out-of-Angular callbacks are wrapped or use signals.
8. **Lifecycle hygiene.** All subscriptions/observers cleaned up via `DestroyRef`; no leaks across component recreation.
9. **Zero HarmonIX coupling in the shared lib.** The lib depends on an injection token only; the adapter lives in the app.
10. **Backward compatibility.** Keep the public surface compiling for existing consumers; deprecate rather than remove.
11. **Smallest robust diff.** No speculative workarounds; the conditional parts of the fix are enabled only when the trace demonstrates the corresponding path.
12. **Honesty in reporting.** Separate verified facts, inferences and assumptions. If a finding contradicts this brief, stop and report before proceeding with the affected part.

---

## 6. Working method — phases with exit criteria

### Phase 0 — Discovery and evidence (no production edits)
Locate and read, then record findings (file path + line numbers) for each item:
- `SearchBarComponent` class, template, styles, spec; the `isInputInFocus` field and **every** read/write of it (`grep -rn isInputInFocus <REPO_ROOT>/libs <REPO_ROOT>/apps`).
- All focus/blur/focusin/focusout handlers; dropdown open/close logic (edge- or level-triggered?); clear-button logic; any `setTimeout` in blur paths; any `document:click`/`mousedown` outside-click listeners; any `HostListener` usage; `document.activeElement` usage; `window` focus/blur and `visibilitychange` listeners anywhere in the lib/apps; CDK `FocusMonitor`/`cdkTrapFocus`/overlay usage.
- Consumers of `SearchBarComponent` and what they bind/read.
- Angular version, Zone.js vs zoneless (`bootstrapApplication` providers / `main.ts`), availability of `signal/computed/input/output`, `ChangeDetectionStrategy` of the component, RxJS streams tied to focus.
- Routing/reuse behaviour that could detach DOM while keeping the component alive (`RouteReuseStrategy`, `ViewContainerRef.detach`, CDK portals) and any HarmonIX-triggered navigation on workspace events.
- `@fmr-pr000264/harmonix-elevate-desktop` in `node_modules`: `package.json` dependencies (confirm `@interopio/desktop`, note versions), exported API of `DesktopCoreService`/`getHarmonixDesktop()`, and whether the io.Connect API object (`windows`, `workspaces`) is reachable from it.
- `git log -S isInputInFocus -- <SHARED_LIB_PATH>` and `git blame` on the handlers: why the flag was introduced; link the original PR/ticket if present.
- The project's actual commands for lint, unit tests, build, and E2E (`project.json`, `package.json`, `nx.json`).

**Exit criteria:** a findings table in the report (see §12), an explicit statement of which of A/B/other the code makes more plausible, and a list of contradictions with this brief. **Stop and report before Phase 2 if** any of the following is true: the component already derives state from `activeElement`; Angular < 16 (signals unavailable — the design still applies, fall back per §9 of the reference); evidence that HarmonIX re-creates the app on return (hibernation); or the flag has consumers whose behaviour this fix would change materially.

### Phase 1 — Diagnostic instrumentation and runbook
- Add the `focus-trace.ts` utility from §8.5 as a **dev-only** module (guarded by `isDevMode()` or a query flag such as `?focusTrace=1`; never shipped enabled).
- Install it from `SearchBarComponent` (`ngAfterViewInit`) passing `() => ({ isInputInFocus: this.isInputInFocus })` and, if reachable, the io.Connect API object.
- Write `docs/focus-trace-runbook.md` (or the repo's docs location): steps for `<TRACE_OWNER>` to reproduce inside HarmonIX, dump `copy(__focusTrace.dump())`, and paste the JSON into `<TICKET_ID>`; include the discriminator table (§3.4) and what to look for (`⚠ SILENT-CHANGE` rows, `visibilitychange`, `io.window.onVisibilityChanged`, `window.focus`).
- You cannot run HarmonIX. **Request the trace from `<TRACE_OWNER>` and continue with Phase 2 in parallel**; the core fix does not depend on the trace, only the conditional parts do.

### Phase 2 — Core fix (correct under A and B)
Implement the reference design in §8 adapted to the real code found in Phase 0. Keep search/emit logic; replace only focus-state management, open/close logic, and the clear/option interaction model. Remove the items in §8.6.

### Phase 3 — App-side lifecycle adapter
Implement `HarmonixWorkspaceVisibility` (§8.4) in the application layer, provided via `WORKSPACE_VISIBILITY`, sourcing `io.windows.my().onVisibilityChanged` (and initial `isVisible`) when the wrapper exposes it, falling back silently to the Page-Visibility default when not running inside HarmonIX. Verify every io.Connect method name against the installed typings; do not invent APIs.

### Phase 4 — Tests
Implement the unit specification in §9 (all cases), the real-Chromium component test for candidate A if the tooling exists, and the E2E skeleton (skipped unless `IO_CDP_URL` is set). Run the full lint/test/build pipeline for affected projects (`nx affected`).

### Phase 5 — Migration, docs, PR
- Migrate consumers from `isInputInFocus` to `focusWithin()`; keep a deprecated getter.
- Changelog entry for the shared lib; JSDoc on the public API; note the behaviour change (focus-within keeps the popup open when focus moves to the clear button/listbox).
- Conventional commits on `<BRANCH_NAME>`; one PR with the description template in §12.

### Phase 6 — Conditional parts (only with trace evidence)
- If the trace shows `⚠ SILENT-CHANGE` with `activeElement: input → body` (or `connected: false`) and no `blur`: enable the `ResizeObserver` rendering observer (§8.3).
- If the trace shows `visibilitychange` **does not** fire on a switch and the wrapper exposes no visibility event: document this as the platform gap (§12 hand-off note); the derived-state core still recovers on first interaction.
- If the trace shows something outside A/B: stop, attach the trace, and report.

---

## 7. Prohibited patterns (reject in your own diff and in review)
- `@HostListener('window:focus')`, `window:blur`, or `document:visibilitychange` **inside the component** (the shared service owns visibility; the component owns only its host).
- `document.hasFocus()` in the focus predicate — under candidate B it is exactly the value that is wrong while the user is typing.
- `setTimeout`/`queueMicrotask`/`debounceTime` in blur/focus paths to "let the option click land".
- `document:click`/`document:mousedown` outside-click listeners as the mechanism for closing (use `focusout` + `relatedTarget`; if a click-outside handler must remain for non-focusable regions, it must decide via `syncFocusState()`).
- Edge-triggered guards: `if (this.isInputInFocus) return;`, `if (!flag) open()`, `distinctUntilChanged` on the focus stream feeding open/close.
- CDK `FocusMonitor` as the source of state (it is event-driven and would carry the same stale value; optional for focus-ring *origin* styling only).
- Calling `focus()` on activation/visibility change or from the visibility effect (focus stealing; fights the platform's own restoration).
- Any import from `@fmr-pr000264/*` or `@interopio/*` inside `libs/shared/**`.
- New global listeners "just in case" (`pointerdown`, `click`, `focusin` on `document`, etc.).
- `detectChanges()` inside focus handlers.

---

## 8. Reference implementation (adapt to the real code; keep the design)

### 8.1 `workspace-visibility.ts` — shared lib (the only global listener, shared by all instances)
```ts
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, NgZone, Signal, inject, signal } from '@angular/core';

/** Abstraction the shared lib depends on. Apps may provide a platform-backed implementation. */
export interface WorkspaceVisibility { readonly hidden: Signal<boolean>; }

export const WORKSPACE_VISIBILITY = new InjectionToken<WorkspaceVisibility>('WORKSPACE_VISIBILITY', {
  providedIn: 'root',
  factory: () => inject(PageVisibilityService),
});

/** Default: Page Visibility API. Fires when the hosting Chromium window is hidden/shown. */
@Injectable({ providedIn: 'root' })
export class PageVisibilityService implements WorkspaceVisibility {
  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  readonly hidden = signal(this.document.visibilityState === 'hidden');

  constructor() {
    const onChange = () => this.ngZone.run(() => this.hidden.set(this.document.visibilityState === 'hidden'));
    this.document.addEventListener('visibilitychange', onChange);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('visibilitychange', onChange));
  }
}
```

### 8.2 `search-bar.component.ts` — focus-related parts
```ts
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, ViewChild,
  computed, effect, inject, input, output, signal,
} from '@angular/core';
import { WORKSPACE_VISIBILITY } from './workspace-visibility';

@Component({
  selector: 'ui-search-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-bar.component.html',
  host: {
    // Bubbling focus events: one pair covers input, clear button and listbox (focus-within semantics).
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
    // Pre-decision reconciliation for pointer users; fires before the browser moves focus (mouse/touch/pen).
    '(pointerdown)': 'syncFocusState()',
  },
})
export class SearchBarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceVisibility = inject(WORKSPACE_VISIBILITY, { optional: true });

  @ViewChild('input', { static: true }) private readonly inputRef!: ElementRef<HTMLInputElement>;

  readonly suggestions = input<readonly string[]>([]);
  readonly search = output<string>();
  readonly cleared = output<void>();
  readonly selected = output<string>();

  /** Derived cache of the browser's focus state. Written only by syncFocusState() and onFocusOut(). */
  readonly focusWithin = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(-1);

  // Level-triggered: no handler ever "opens" or "closes" anything.
  readonly showClear = computed(() => this.query().length > 0);
  readonly dropdownOpen = computed(() => this.focusWithin() && this.suggestions().length > 0);
  readonly activeOptionId = computed(() => (this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null));

  constructor() {
    if (this.workspaceVisibility) {
      // Deactivation: release focus so the NEXT interaction is a real focusing transition.
      // Activation: sync only. Never call focus() here.
      effect(() => {
        if (this.workspaceVisibility!.hidden()) this.releaseFocusIfWithin();
        this.syncFocusState();
      }, { allowSignalWrites: true }); // option required on v17/v18; default on v19+
    }
  }

  /** The single reconciliation point. Reads the browser, never trusts the cache. Safe from any context. */
  syncFocusState(): boolean {
    const active = this.document.activeElement;
    const within = !!active
      && active !== this.document.body
      && active.isConnected
      && this.host.nativeElement.contains(active);
    if (within !== this.focusWithin()) this.focusWithin.set(within);
    return within;
  }

  protected onFocusIn(): void { this.syncFocusState(); }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return; // input → clear/listbox: still ours
    // Focus is leaving us (window blur, click elsewhere, programmatic or platform-induced blur). Believe it.
    this.focusWithin.set(false);
    this.activeIndex.set(-1);
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(-1);
    this.syncFocusState();            // an input event proves the input is focused — free reconciliation
    this.search.emit(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    this.syncFocusState();            // keyboard events are delivered to the focused element by definition
    const n = this.suggestions().length;
    switch (event.key) {
      case 'ArrowDown': if (this.dropdownOpen()) { event.preventDefault(); this.activeIndex.set((this.activeIndex() + 1) % n); } break;
      case 'ArrowUp':   if (this.dropdownOpen()) { event.preventDefault(); this.activeIndex.set((this.activeIndex() - 1 + n) % n); } break;
      case 'Enter':     if (this.activeIndex() >= 0) { event.preventDefault(); this.selectOption(this.suggestions()[this.activeIndex()]); } break;
      case 'Escape':    if (this.query()) { event.preventDefault(); this.clear(); } break;
    }
  }

  /** Combobox pattern: options are not focusable; keep focus on the input while clicking one. */
  protected onOptionMouseDown(event: MouseEvent): void { event.preventDefault(); }

  protected selectOption(value: string): void {
    this.query.set(value);
    this.inputRef.nativeElement.value = value;
    this.activeIndex.set(-1);
    this.selected.emit(value);
    this.focus();
  }

  protected optionId(i: number): string { return `${this.host.nativeElement.id || 'ui-search-bar'}-option-${i}`; }

  /** Public API. focus() on an already-focused node fires no event, so reconcile explicitly. */
  focus(): void {
    this.inputRef.nativeElement.focus();
    this.syncFocusState();
  }

  clear(): void {
    this.query.set('');
    this.inputRef.nativeElement.value = '';
    this.activeIndex.set(-1);
    this.cleared.emit();
    this.focus();
  }

  private releaseFocusIfWithin(): void {
    const active = this.document.activeElement;
    if (active instanceof HTMLElement && this.host.nativeElement.contains(active)) active.blur();
  }

  /** @deprecated Read `focusWithin()`; kept so existing consumers compile. */
  get isInputInFocus(): boolean { return this.focusWithin(); }
}
```

`search-bar.component.html`
```html
<div class="search-bar" [class.search-bar--focused]="focusWithin()">
  <input #input
         type="text"
         role="combobox"
         aria-autocomplete="list"
         aria-haspopup="listbox"
         [attr.aria-expanded]="dropdownOpen()"
         [attr.aria-controls]="dropdownOpen() ? 'ui-search-bar-listbox' : null"
         [attr.aria-activedescendant]="activeOptionId()"
         [value]="query()"
         (input)="onInput($any($event.target).value)"
         (keydown)="onKeydown($event)" />

  @if (showClear()) {
    <button type="button" class="clear" aria-label="Clear search" (click)="clear()">×</button>
  }

  @if (dropdownOpen()) {
    <ul id="ui-search-bar-listbox" role="listbox" (mousedown)="onOptionMouseDown($event)">
      @for (s of suggestions(); track s; let i = $index) {
        <li role="option" [id]="optionId(i)" [attr.aria-selected]="i === activeIndex()" (click)="selectOption(s)">{{ s }}</li>
      }
    </ul>
  }
</div>
```
Adaptation notes: keep the existing inputs/outputs and search pipeline; if the lib targets Angular < 17 use `*ngIf`/`*ngFor` and `@Input/@Output`; if signals are unavailable (< 16) use plain fields plus `cdr.markForCheck()` at the end of `syncFocusState()` and `onFocusOut()`. If the listbox id must be unique per instance, derive it from a per-instance id. If the existing component uses a CDK overlay for the dropdown, keep the overlay but drive `attach/detach` from `dropdownOpen()` in an `effect`, never from handlers.

### 8.3 Conditional — silent-detach observer (enable only with trace evidence, see Phase 6)
```ts
// Called from the constructor. ResizeObserver fires when the observed element is removed from the DOM or
// set to display:none — a portable "the host stopped being rendered" signal. Do NOT use IntersectionObserver.
private observeRendering(): void {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => this.ngZone.run(() => this.syncFocusState()));
  ro.observe(this.host.nativeElement);
  this.destroyRef.onDestroy(() => ro.disconnect());
}
```

### 8.4 App-side adapter — `harmonix-workspace-visibility.service.ts` (application layer, not the lib)
```ts
import { Injectable, NgZone, signal } from '@angular/core';
import { DesktopCoreService } from '@fmr-pr000264/harmonix-elevate-desktop';
import { WorkspaceVisibility } from '@<scope>/shared/ui/search-bar'; // adjust to the lib's public API path

@Injectable()
export class HarmonixWorkspaceVisibility implements WorkspaceVisibility {
  readonly hidden = signal(false);

  constructor(desktop: DesktopCoreService, ngZone: NgZone) {
    desktop.getHarmonixDesktop().then((hx: any) => {
      const io = hx?.io ?? hx?.desktop;                      // ← verify how the wrapper exposes the io.Connect API object
      const win = io?.windows?.my?.();
      if (!win) return;                                      // not inside HarmonIX: Page-Visibility default stays in effect
      this.hidden.set(win.isVisible === false);
      win.onVisibilityChanged?.((w: { isVisible: boolean }) => ngZone.run(() => this.hidden.set(!w.isVisible)));
    }).catch(() => { /* outside HarmonIX */ });
  }
}
// app providers: { provide: WORKSPACE_VISIBILITY, useClass: HarmonixWorkspaceVisibility }
```
If both signals are wanted, compose: `hidden = computed(() => pageHidden() || ioHidden())`. Verify `windows.my()`, `isVisible`, `onVisibilityChanged` against the installed `@interopio/desktop` typings before use.

### 8.5 `focus-trace.ts` — temporary, dev-only diagnostic
```ts
type Snap = { active: string; hasFocus: boolean; vis: DocumentVisibilityState; connected: boolean; rendered: boolean };

export function installFocusTrace(input: HTMLElement, readState: () => unknown, io?: any, capacity = 1000): () => void {
  const buf: unknown[] = [];
  const name = (n: EventTarget | null | undefined): string => {
    if (!n) return 'null';
    if (n === window) return 'window';
    if (n === document) return 'document';
    if (n === input) return '*INPUT*';
    const e = n as Element;
    return e.tagName ? e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (e.classList?.[0] ? `.${e.classList[0]}` : '') : String(n);
  };
  const snap = (): Snap => ({
    active: name(document.activeElement), hasFocus: document.hasFocus(), vis: document.visibilityState,
    connected: input.isConnected, rendered: input.getClientRects().length > 0,
  });
  const log = (ev: string, target?: EventTarget | null, related?: EventTarget | null, extra?: unknown) => {
    buf.push({ t: Math.round(performance.now()), ev, target: name(target), related: name(related), ...snap(), state: readState(), extra });
    if (buf.length > capacity) buf.shift();
  };
  const cleanups: Array<() => void> = [];
  const on = (t: EventTarget, type: string, h: (e: any) => void, capture = true) => {
    t.addEventListener(type, h, capture); cleanups.push(() => t.removeEventListener(type, h, capture));
  };
  for (const type of ['focus', 'blur', 'focusin', 'focusout']) on(document, type, (e: FocusEvent) => log(type, e.target, e.relatedTarget));
  for (const type of ['mousedown', 'keydown', 'input', 'click']) on(document, type, (e: Event) => log(type, e.target));
  on(document, 'pointerdown', (e: PointerEvent) =>
    log('pointerdown', e.target, null, { hit: name(document.elementFromPoint(e.clientX, e.clientY)), pointerType: e.pointerType }));
  on(window, 'focus', () => log('window.focus'), false);
  on(window, 'blur', () => log('window.blur'), false);
  on(window, 'pageshow', () => log('pageshow'), false);
  on(window, 'pagehide', () => log('pagehide'), false);
  on(document, 'visibilitychange', () => log('visibilitychange'));
  // Heartbeat: records changes that arrive WITHOUT an event — this answers "which event is missing".
  let last = JSON.stringify(snap());
  const id = setInterval(() => { const now = JSON.stringify(snap()); if (now !== last) { last = now; log('⚠ SILENT-CHANGE'); } }, 100);
  cleanups.push(() => clearInterval(id));
  try {
    const win = io?.windows?.my?.();
    win?.onVisibilityChanged?.((w: any) => log('io.window.onVisibilityChanged', null, null, { isVisible: w?.isVisible }));
    win?.onFocusChanged?.((w: any) => log('io.window.onFocusChanged', null, null, { isFocused: w?.isFocused }));
    io?.workspaces?.onWindowSelected?.((w: any) => log('io.workspaces.onWindowSelected', null, null, { id: w?.id }));
    io?.workspaces?.onWorkspaceHibernated?.((w: any) => log('io.workspaces.onWorkspaceHibernated', null, null, { id: w?.id }));
    io?.workspaces?.onWorkspaceResumed?.((w: any) => log('io.workspaces.onWorkspaceResumed', null, null, { id: w?.id }));
  } catch (e) { log('io.hook.error', null, null, String(e)); }
  log('installed', null, null, { isTopWindow: window.top === window, ua: navigator.userAgent });
  (window as any).__focusTrace = { buf, dump: () => JSON.stringify(buf, null, 1), clear: () => { buf.length = 0; } };
  return () => cleanups.forEach(c => c());
}
```

### 8.6 What to remove from the current component
- `(focus)="isInputInFocus = true"` / `(blur)="isInputInFocus = false"` and any `setTimeout` in blur handling.
- `@HostListener('window:focus')` and its test.
- Every `if (this.isInputInFocus …)` guard in open/close paths — replaced by `computed()` signals.
- Outside-click document listeners used for closing (see §7).

---

## 9. Test specification (Jest + TestBed; all cases are required)

Rationale: the tests construct **both stale states explicitly** (in jsdom `Document.prototype.activeElement` is an accessor and can be spied) and exercise every recovery path (pointer, keyboard, typing, lifecycle) plus focus-within, option selection, clear, public `focus()`, ARIA, and cleanup. Requires jsdom ≥ 16.4 for `focusin`/`focusout` (Jest 27+); otherwise dispatch them manually.

```ts
// search-bar.component.spec.ts
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SearchBarComponent } from './search-bar.component';
import { WORKSPACE_VISIBILITY } from './workspace-visibility';

@Component({
  standalone: true,
  imports: [SearchBarComponent],
  template: `<button id="outside">outside</button><ui-search-bar [suggestions]="suggestions()" />`,
})
class HostCmp { readonly suggestions = signal(['alpha', 'alps', 'beta']); }

beforeAll(() => { if (!('PointerEvent' in globalThis)) (globalThis as any).PointerEvent = class extends MouseEvent {}; });

describe('SearchBarComponent — focus state is derived, not accumulated', () => {
  let fixture: ComponentFixture<HostCmp>;
  let cmp: SearchBarComponent;
  let sb: HTMLElement;
  let input: HTMLInputElement;
  const hidden = signal(false);

  const flush = () => { (TestBed as any).tick?.() ?? (TestBed as any).flushEffects?.(); fixture.detectChanges(); };
  const listbox = () => sb.querySelector('[role=listbox]');
  const fakeActive = (el: Element) => jest.spyOn(Document.prototype, 'activeElement', 'get').mockReturnValue(el);
  const fire = (t: EventTarget, type: string, init: Record<string, unknown> = {}) => {
    const Ctor = type.startsWith('focus') ? FocusEvent : type.startsWith('pointer') ? PointerEvent : type.startsWith('key') ? KeyboardEvent : Event;
    t.dispatchEvent(new (Ctor as any)(type, { bubbles: true, ...init }));
  };
  const type = (text: string) => { input.value = text; fire(input, 'input'); };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostCmp],
      providers: [{ provide: WORKSPACE_VISIBILITY, useValue: { hidden } }],
    }).compileComponents();
    fixture = TestBed.createComponent(HostCmp);
    document.body.appendChild(fixture.nativeElement);         // activeElement/contains need a connected DOM
    flush();
    cmp = fixture.debugElement.query(By.directive(SearchBarComponent)).componentInstance;
    sb = fixture.nativeElement.querySelector('ui-search-bar');
    input = sb.querySelector('input')!;
  });

  afterEach(() => { hidden.set(false); fixture.destroy(); fixture.nativeElement.remove(); jest.restoreAllMocks(); });

  it('genuine focus opens the dropdown; genuine blur closes it', () => {
    input.focus(); flush();
    expect(cmp.focusWithin()).toBe(true); expect(listbox()).not.toBeNull();
    (document.getElementById('outside') as HTMLElement).focus(); flush();
    expect(cmp.focusWithin()).toBe(false); expect(listbox()).toBeNull();
  });

  describe('stale TRUE — focus lost silently (Chromium detach/removal: no blur)', () => {
    beforeEach(() => { input.focus(); flush(); expect(cmp.focusWithin()).toBe(true); });

    it('pointerdown reconciles before the browser refocuses; focusin restores', () => {
      const spy = fakeActive(document.body);
      fire(sb, 'pointerdown'); flush();
      expect(cmp.focusWithin()).toBe(false);
      spy.mockRestore();
      fire(input, 'focusin'); flush();
      expect(cmp.focusWithin()).toBe(true); expect(listbox()).not.toBeNull();
    });

    it('a workspace-hidden signal releases focus and closes the dropdown without user interaction', () => {
      hidden.set(true); flush();
      expect(document.activeElement).not.toBe(input);
      expect(cmp.focusWithin()).toBe(false); expect(listbox()).toBeNull();
      hidden.set(false); flush();
      expect(cmp.focusWithin()).toBe(false);                  // activation never steals focus back
      expect(document.activeElement).not.toBe(input);
    });

    it('keyboard-only: a keydown re-derives truth', () => {
      const spy = fakeActive(document.body);
      fire(input, 'keydown', { key: 'a' }); flush();
      expect(cmp.focusWithin()).toBe(false);
      spy.mockRestore();
    });
  });

  describe('stale FALSE — browser never re-fired focus (platform page-focus desync)', () => {
    beforeEach(() => {
      input.focus(); flush();
      fire(input, 'focusout', { relatedTarget: null }); flush();
      expect(cmp.focusWithin()).toBe(false);
      expect(document.activeElement).toBe(input);
    });

    it('keyboard-only user: first keystroke reconciles', () => {
      fire(input, 'keydown', { key: 'a' }); flush();
      expect(cmp.focusWithin()).toBe(true); expect(listbox()).not.toBeNull();
    });

    it('typing reconciles via the input event and shows the clear button', () => {
      type('al'); flush();
      expect(cmp.focusWithin()).toBe(true); expect(sb.querySelector('.clear')).not.toBeNull();
    });

    it('pointer user: pointerdown reconciles even though no focus event follows', () => {
      fire(sb, 'pointerdown'); flush();
      expect(cmp.focusWithin()).toBe(true); expect(listbox()).not.toBeNull();
    });

    it('documents why the old window:focus patch was a no-op in this state', () => {
      expect(document.activeElement).toBe(input);             // old predicate `activeEl !== input` is false → no change
      expect(cmp.focusWithin()).toBe(false);
    });
  });

  it('focus-within: moving focus to the clear button keeps state and dropdown', () => {
    input.focus(); type('al'); flush();
    sb.querySelector<HTMLButtonElement>('.clear')!.focus(); flush();
    expect(cmp.focusWithin()).toBe(true); expect(listbox()).not.toBeNull();
  });

  it('clicking an option keeps focus on the input (mousedown default prevented) and selects', () => {
    input.focus(); flush();
    const option = sb.querySelector<HTMLElement>('[role=option]')!;
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    listbox()!.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    option.click(); flush();
    expect(cmp.query()).toBe('alpha'); expect(document.activeElement).toBe(input); expect(cmp.focusWithin()).toBe(true);
  });

  it('clear() empties, refocuses and reconciles', () => {
    input.focus(); type('al'); flush();
    cmp.clear(); flush();
    expect(cmp.query()).toBe(''); expect(input.value).toBe('');
    expect(document.activeElement).toBe(input); expect(cmp.focusWithin()).toBe(true);
  });

  it('public focus() reconciles even when the input is already focused (browser fires no event)', () => {
    input.focus(); fire(input, 'focusout', { relatedTarget: null }); flush();
    expect(cmp.focusWithin()).toBe(false);
    cmp.focus(); flush();
    expect(cmp.focusWithin()).toBe(true);
  });

  it('Escape clears when there is a query; ArrowDown/Enter select via aria-activedescendant', () => {
    input.focus(); flush();
    fire(input, 'keydown', { key: 'ArrowDown' }); flush();
    expect(input.getAttribute('aria-activedescendant')).toContain('option-0');
    fire(input, 'keydown', { key: 'Enter' }); flush();
    expect(cmp.query()).toBe('alpha');
    fire(input, 'keydown', { key: 'Escape' }); flush();
    expect(cmp.query()).toBe('');
  });

  it('registers no document/window listeners of its own', () => {
    const docAdd = jest.spyOn(document, 'addEventListener');
    const winAdd = jest.spyOn(window, 'addEventListener');
    const f = TestBed.createComponent(HostCmp); f.detectChanges(); f.destroy();
    expect(docAdd).not.toHaveBeenCalled(); expect(winAdd).not.toHaveBeenCalled();
  });
});
```
If §8.3 is enabled, add a test that mocks `ResizeObserver` and asserts `disconnect()` is called once on destroy.

**Real-Chromium component test (candidate A, exact reproduction)** — add if Playwright CT / Storybook interaction tests exist:
```ts
await page.getByRole('combobox').click();
await expect(page.getByRole('combobox')).toBeFocused();
await page.evaluate(() => {
  const host = document.querySelector('ui-search-bar')!;
  const parent = host.parentElement!, next = host.nextSibling;
  host.remove();                                          // Chromium fires no blur; activeElement → body
  (window as any).__reattach = () => parent.insertBefore(host, next);
});
await page.evaluate(() => (window as any).__reattach());
await page.getByRole('combobox').click();
await page.keyboard.type('alp');
await expect(page.getByRole('listbox')).toBeVisible();
```

**E2E skeleton (io.Connect over CDP; `test.skip` unless `IO_CDP_URL` is set)**
```ts
import { chromium, expect, test } from '@playwright/test';

test.skip(!process.env.IO_CDP_URL, 'requires a running io.Connect Desktop with remote debugging');
test('search bar works after a HarmonIX workspace switch without Alt+Tab', async () => {
  const browser = await chromium.connectOverCDP(process.env.IO_CDP_URL!);
  const pages = browser.contexts().flatMap(c => c.pages());
  const app = pages.find(p => p.url().includes('<APP_ROUTE>'))!;
  const frame = pages.find(p => p.url().includes('workspaces'))!;
  const input = app.getByRole('combobox', { name: /search/i });
  await input.click(); await expect(input).toBeFocused();
  await frame.getByRole('tab', { name: '<WORKSPACE_B>' }).click();
  await app.waitForTimeout(500);
  await frame.getByRole('tab', { name: '<WORKSPACE_A>' }).click();
  const state = await app.evaluate(() => ({
    activeIsInput: document.activeElement?.getAttribute('role') === 'combobox',
    hasFocus: document.hasFocus(), visibility: document.visibilityState,
  }));
  test.info().annotations.push({ type: 'focus-state-after-return', description: JSON.stringify(state) });
  await input.click();
  await app.keyboard.type('alp');
  await expect(app.getByRole('listbox')).toBeVisible();
  await expect(app.getByRole('button', { name: /clear/i })).toBeVisible();
});
```
Run the E2E once against the **current** build to confirm it fails (that is what makes it a regression test), then against the fix.

---

## 10. Acceptance criteria / definition of done
- [ ] AC1 Phase-0 findings table delivered with file:line evidence; contradictions with this brief listed; A/B plausibility stated.
- [ ] AC2 Dev-only trace utility and runbook merged; trace requested from `<TRACE_OWNER>`; trace result (or its absence) recorded in the report.
- [ ] AC3 Focus state is a derived cache written only by `syncFocusState()`/`onFocusOut()`; dropdown/clear/focused styling are `computed()`; no edge-triggered open/close remains.
- [ ] AC4 Under stale-TRUE simulation, `pointerdown` yields `focusWithin() === false` and a following `focusin` yields `true` with the listbox rendered.
- [ ] AC5 Under stale-FALSE simulation, `keydown`, `input`, and `pointerdown` each restore `focusWithin() === true` with no focus event.
- [ ] AC6 `WORKSPACE_VISIBILITY.hidden === true` releases focus only when it is inside the host; `false` never focuses.
- [ ] AC7 Focus moving input → clear → listbox keeps the popup; option `mousedown` is default-prevented; selection keeps focus on the input.
- [ ] AC8 The component registers no `document`/`window` listeners; the only `visibilitychange` listener lives in the shared service; observers/subscriptions are released via `DestroyRef`.
- [ ] AC9 No `setTimeout`/`queueMicrotask`, no `document.hasFocus()` in the predicate, no `window:focus` host listener, no CDK `FocusMonitor` as state source, no `@fmr-pr000264/*`/`@interopio/*` import in `libs/shared/**`.
- [ ] AC10 ARIA: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant`; options `role="option"` with `aria-selected`.
- [ ] AC11 Works under `OnPush`; out-of-Angular callbacks wrapped in `ngZone.run` (or signals on ≥ 18); `effect` write option set per Angular version.
- [ ] AC12 `isInputInFocus` retained as a deprecated getter; all consumers compile; consumers that wrote to it migrated.
- [ ] AC13 App-side `HarmonixWorkspaceVisibility` provided, API names verified against installed typings, silent fallback outside HarmonIX.
- [ ] AC14 Unit spec (§9) green; real-Chromium component test added if tooling exists; E2E skeleton added and documented; `nx affected` lint/test/build green.
- [ ] AC15 Conditional §8.3 enabled only with trace evidence, and the evidence is quoted in the PR.
- [ ] AC16 PR description, changelog, and platform hand-off note delivered in the format of §12.

---

## 11. Communication protocol
- Post the Phase-0 findings and a short implementation plan **before** editing production code.
- Stop and ask when: a Phase-0 exit condition triggers (§6); an io.Connect/wrapper API you need is not present in the typings; a consumer depends on a behaviour this fix changes; the trace contradicts both candidates.
- Never claim something was verified unless you executed the check (command, file read, test run) in this session. Distinguish `verified` / `inferred` / `assumed` in every table.
- Keep the diff reviewable: focused commits (`fix(search-bar): derive focus state from document.activeElement`, `feat(search-bar): add WORKSPACE_VISIBILITY abstraction`, `test(search-bar): …`, `chore(search-bar): dev-only focus trace`). No drive-by changes.

---

## 12. Deliverables and report format

Produce a single report (markdown) with these sections, in this order:
1. **Executive summary** (3–5 sentences): what was wrong, what changed, what remains for the platform team.
2. **Phase-0 findings table**: item · location (file:line) · finding · status (`verified`/`inferred`/`assumed`).
3. **Root-cause statement**: which of A/B/other the code and (if available) the trace support, with evidence; the exact missing browser event; why the `window:focus` patch failed in this codebase.
4. **Event/lifecycle sequence** observed or predicted for: normal click; Alt+Tab; workspace switch away; workspace switch back.
5. **Change summary**: files changed, public-API changes, behaviour changes, removed patterns.
6. **Test evidence**: commands run and results; the regression test's failure on the old implementation (if reproducible) and pass on the new one.
7. **Accessibility and change-detection notes**.
8. **Conditional parts**: enabled/disabled and the evidence for each decision.
9. **Risks and regressions to watch** (include: focus-within behaviour change; option `mousedown` prevention and interactive children; `releaseFocusIfWithin()` on hide; jsdom polyfills; Angular-version fallbacks).
10. **Platform hand-off note** for HarmonIX/Elevate: the trace, the discriminator values, the requested change (symmetric page-focus on show, or a documented visibility/focus lifecycle exposed by the wrapper), and whether hibernation is enabled.
11. **Assumptions register**: every unverified assumption with the check that would resolve it.
12. **PR description** (ready to paste): problem · root cause · fix · tests · risks · rollout notes.

---

## 13. Assumptions register (fill during Phase 0)
| Assumption from this brief | Status | How verified / what would verify it |
|---|---|---|
| HarmonIX Elevate wraps io.Connect Desktop | | wrapper `package.json`; `navigator.userAgent`/`io.version` in trace |
| Workspace switch = hide/show of a separate Chromium window; not iframe; hibernation off | | trace `isTopWindow`, `visibilitychange`, `io.window.onVisibilityChanged`; platform config |
| Which stale state occurs (A vs B) | | discriminator from trace |
| `window.focus` does not fire during the switch | | trace |
| Current open/close logic is edge-triggered; blur `setTimeout`/click-outside exist | | code read; `git log -S isInputInFocus` |
| Angular ≥ 17, Zone.js, signals available in the shared lib | | `package.json`, `main.ts` |
| Wrapper exposes `io.windows`/`io.workspaces` | | wrapper typings; `getHarmonixDesktop()` return shape |
| Consumers only read `isInputInFocus` | | `grep -rn isInputInFocus libs apps` |
