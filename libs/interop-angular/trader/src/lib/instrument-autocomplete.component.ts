import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { INSTRUMENT_SOURCE } from './instrument-source';
import type { InstrumentRecord } from './instrument-source';

/**
 * Fuzzy instrument autocomplete.
 *
 * - Calls `InstrumentSource.search()` on every keystroke (the default source
 *   is in-memory, so no debounce is required; consumers injecting a remote
 *   source should debounce in their own implementation).
 * - Emits `(selected)` with the chosen `InstrumentRecord` — typical wiring is
 *   to forward it to `InteropService.broadcast()` as an `fdc3.instrument`
 *   context.
 *
 * @example
 *   <interop-instrument-autocomplete (selected)="onPick($event)" />
 */
@Component({
  selector: 'interop-instrument-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ac">
      <input
        type="text"
        class="input"
        autocomplete="off"
        placeholder="Search instrument — ticker, name, or ISIN"
        [(ngModel)]="query"
        (focus)="open.set(true)"
        (input)="refresh()"
        (keydown)="onKey($event)" />
      @if (open() && results().length > 0) {
        <ul class="menu" role="listbox">
          @for (r of results(); track r.ticker; let i = $index) {
            <li class="row"
                role="option"
                [class.active]="i === activeIndex()"
                [attr.aria-selected]="i === activeIndex()"
                (mousedown)="pick(r)"
                (mouseenter)="activeIndex.set(i)">
              <div class="row-main">
                <strong class="ticker">{{ r.ticker }}</strong>
                <span class="name">{{ r.name }}</span>
              </div>
              <div class="row-aux">
                @if (r.exchange) { <span class="ex">{{ r.exchange }}</span> }
                @if (r.lastPrice != null) { <span class="px">{{ r.lastPrice.toFixed(2) }}</span> }
                @if (r.currency) { <span class="ccy">{{ r.currency }}</span> }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; }
    .ac { position: relative; }
    .input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.12)));
      background: var(--interop-input-bg, var(--ws-panel-2, rgba(255,255,255,0.04)));
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      font-size: 13px;
      outline: none;
    }
    .input:focus {
      border-color: var(--interop-accent, var(--ws-accent, #4080e8));
    }
    .menu {
      list-style: none;
      margin: 4px 0 0;
      padding: 4px;
      position: absolute;
      top: 100%; left: 0; right: 0;
      max-height: 320px;
      overflow-y: auto;
      background: var(--interop-menu-bg, var(--ws-panel, #1e2240));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.1)));
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.3);
      z-index: 200;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      font-size: 12px;
      align-items: center;
    }
    .row:hover, .row.active {
      background: var(--interop-menu-hover, rgba(255,255,255,0.06));
    }
    .row-main { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
    .ticker { font-weight: 800; letter-spacing: 0.03em; }
    .name {
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .row-aux {
      display: flex; gap: 8px; align-items: baseline;
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .px { color: var(--interop-text, var(--ws-text, #e6e9ff)); font-weight: 700; }
    .ex, .ccy { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  `],
})
export class InteropInstrumentAutocompleteComponent {
  private readonly source = inject(INSTRUMENT_SOURCE);
  private readonly host = inject(ElementRef<HTMLElement>);

  query = '';
  readonly open = signal(false);
  readonly results = signal<InstrumentRecord[]>([]);
  readonly activeIndex = signal(0);

  @Output() readonly selected = new EventEmitter<InstrumentRecord>();

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const result = await Promise.resolve(this.source.search(this.query, 10));
    this.results.set(result);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  pick(r: InstrumentRecord): void {
    this.query = r.ticker;
    this.open.set(false);
    this.selected.emit(r);
  }

  onKey(event: KeyboardEvent): void {
    const list = this.results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const r = list[this.activeIndex()];
      if (r) this.pick(r);
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  @HostListener('document:click', ['$event.target'])
  onOutside(target: EventTarget | null): void {
    if (!this.open()) return;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }
}
