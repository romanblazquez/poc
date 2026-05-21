import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ResolveError } from '@fdc3-poc/fdc3-core';
import type {
  AppIntent,
  InstrumentContext,
  ThemeName,
} from '@fdc3-poc/fdc3-core';
import { MARKET_QUOTES } from '@fdc3-poc/shared-domain';

type Severity = 'Info' | 'Warning' | 'Critical';

interface Headline {
  id: string;
  ts: number;
  ticker: string;
  instrumentName: string;
  isin?: string;
  severity: Severity;
  headline: string;
  source: string;
}

type SeverityFilter = 'All' | Severity;

/** Hand-curated seed pool so we have plausible mock news per instrument. */
const SEED: Array<Omit<Headline, 'id' | 'ts'>> = [
  { ticker: 'AAPL',   instrumentName: 'Apple Inc.',       severity: 'Info',     headline: 'AAPL: Services revenue beats consensus, App Store growth +12% YoY',                   source: 'Reuters',     isin: 'US0378331005' },
  { ticker: 'AAPL',   instrumentName: 'Apple Inc.',       severity: 'Warning',  headline: 'AAPL: Supply chain risk flagged on iPhone 17 production timeline',                   source: 'Bloomberg',   isin: 'US0378331005' },
  { ticker: 'MSFT',   instrumentName: 'Microsoft Corp.',  severity: 'Info',     headline: 'MSFT: Azure ARR growth re-accelerates as enterprise AI seats expand',                source: 'Reuters',     isin: 'US5949181045' },
  { ticker: 'NVDA',   instrumentName: 'NVIDIA Corp.',     severity: 'Critical', headline: 'NVDA: Q1 guidance raised — data-center revenue outlook +28% sequentially',           source: 'CNBC',        isin: 'US67066G1040' },
  { ticker: 'NVDA',   instrumentName: 'NVIDIA Corp.',     severity: 'Warning',  headline: 'NVDA: Export-license review on H200 lots flagged by Commerce Dept',                  source: 'WSJ',         isin: 'US67066G1040' },
  { ticker: 'SAP',    instrumentName: 'SAP SE',           severity: 'Info',     headline: 'SAP: Cloud backlog growth tops 25% — RISE transition pace accelerates',              source: 'Handelsblatt',isin: 'DE0007164600' },
  { ticker: 'SAN.MC', instrumentName: 'Banco Santander',  severity: 'Info',     headline: 'SAN.MC: NIM expansion guided up 8bps on Iberian rate path',                          source: 'Expansion',   isin: 'ES0113900J37' },
  { ticker: 'SAN.MC', instrumentName: 'Banco Santander',  severity: 'Critical', headline: 'SAN.MC: ECB stress test results — capital headroom comfortable',                     source: 'FT',          isin: 'ES0113900J37' },
  { ticker: 'ALV',    instrumentName: 'Allianz SE',       severity: 'Info',     headline: 'ALV: PIMCO net inflows printed €11bn — wealth segment outperforms',                  source: 'Bloomberg',   isin: 'DE0008404005' },
];

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TagModule, SelectButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './news.component.html',
})
export class NewsComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  headlines: Headline[] = [];
  instrumentFilter: { ticker: string; name: string; isin?: string } | null = null;
  severityFilter: SeverityFilter = 'All';
  readonly severities: Array<{ label: SeverityFilter; value: SeverityFilter }> = [
    { label: 'All', value: 'All' },
    { label: 'Info', value: 'Info' },
    { label: 'Warning', value: 'Warning' },
    { label: 'Critical', value: 'Critical' },
  ];

  /** Per-headline list of intents available right now (refreshed every time the
   *  instrument filter changes). Keyed by ticker so all rows for the same
   *  instrument share the result. */
  intentsByTicker = new Map<string, AppIntent[]>();
  /** Active operation indicator per headline (set during raiseIntent). */
  busyHeadlineId: string | null = null;
  banner: string | null = null;

  private unsubInstrumentCtx?: () => void;
  private unsubViewNews?: () => void;
  private tickTimer?: ReturnType<typeof setInterval>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Seed an initial set so the panel isn't empty.
    this.headlines = SEED.map((s, i) => ({
      ...s,
      id: `H-${i}-${Date.now()}`,
      ts: Date.now() - i * 65_000,
    }));

    if (window.fdc3) {
      this.unsubInstrumentCtx = window.fdc3.addContextListener<InstrumentContext>(
        'fdc3.instrument',
        (ctx) => this.handleInstrument(ctx),
      );
      this.unsubViewNews = window.fdc3.addIntentListener('ViewNews', (raw) => {
        const ctx = raw as InstrumentContext | undefined;
        if (ctx?.id?.ticker) this.handleInstrument(ctx);
      });
    }

    // Drip in a new headline every ~10s so the panel feels alive.
    this.tickTimer = setInterval(() => this.appendRandomHeadline(), 10_000);
  }

  ngOnDestroy(): void {
    this.unsubInstrumentCtx?.();
    this.unsubViewNews?.();
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  setSeverityFilter(value: SeverityFilter): void {
    this.severityFilter = value;
    this.cdr.markForCheck();
  }

  clearInstrumentFilter(): void {
    this.instrumentFilter = null;
    this.cdr.markForCheck();
  }

  get visibleHeadlines(): Headline[] {
    return this.headlines.filter((h) => {
      if (this.instrumentFilter && h.ticker !== this.instrumentFilter.ticker) return false;
      if (this.severityFilter !== 'All' && h.severity !== this.severityFilter) return false;
      return true;
    });
  }

  /** Available intents for a headline, sorted by name. Falls back to []. */
  actionsFor(h: Headline): AppIntent[] {
    return this.intentsByTicker.get(h.ticker) ?? [];
  }

  severitySeverity(s: Severity): 'success' | 'warn' | 'danger' | 'info' {
    if (s === 'Critical') return 'danger';
    if (s === 'Warning') return 'warn';
    return 'info';
  }

  trackByHeadline(_i: number, h: Headline): string {
    return h.id;
  }

  trackByIntent(_i: number, ai: AppIntent): string {
    return ai.intent.name;
  }

  /**
   * Click handler for one of the dynamically-rendered intent buttons.
   * Uses raiseIntent against the headline's instrument; the resolver will pop
   * if more than one app handles the intent for that context type.
   */
  async raise(h: Headline, intent: AppIntent): Promise<void> {
    if (!window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: h.instrumentName,
      id: { ticker: h.ticker, ISIN: h.isin },
    };
    this.busyHeadlineId = h.id;
    this.banner = `Raising ${intent.intent.name}…`;
    this.cdr.markForCheck();
    try {
      const res = await window.fdc3.raiseIntent(intent.intent.name, ctx);
      this.banner = `${intent.intent.name} routed to ${res.source.appId}`;
    } catch (err) {
      const code = (err as Error)?.message ?? String(err);
      this.banner = code === ResolveError.NoAppsFound
        ? `No app handles ${intent.intent.name}`
        : code === ResolveError.UserCancelled
        ? `Resolver cancelled`
        : `Error: ${code}`;
    } finally {
      this.busyHeadlineId = null;
      this.cdr.markForCheck();
      setTimeout(() => { this.banner = null; this.cdr.markForCheck(); }, 2500);
    }
  }

  /**
   * Click on the ticker tag broadcasts the instrument on the channel — handy
   * way to push everyone else onto the same name (chart / market-watch /
   * portfolio-view will all light up).
   */
  async broadcastTicker(h: Headline): Promise<void> {
    if (!window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: h.instrumentName,
      id: { ticker: h.ticker, ISIN: h.isin },
    };
    await window.fdc3.broadcast(ctx);
  }

  // ─── Context handling + discovery ────────────────────────────────────────

  private async handleInstrument(ctx: InstrumentContext): Promise<void> {
    if (!ctx?.id?.ticker) return;
    this.instrumentFilter = { ticker: ctx.id.ticker, name: ctx.name ?? ctx.id.ticker, isin: ctx.id.ISIN };
    await this.refreshActionsFor(ctx);
    this.cdr.markForCheck();
  }

  /**
   * Calls FDC3 `findIntentsByContext` for the currently-selected instrument
   * and caches the result. This is what makes the action menu honest: if
   * nothing handles ViewChart, the button doesn't show.
   */
  private async refreshActionsFor(ctx: InstrumentContext): Promise<void> {
    if (!window.fdc3 || !ctx.id?.ticker) return;
    try {
      const intents = await window.fdc3.findIntentsByContext(ctx);
      // Filter out our own intent — no point offering "View News" from a news headline.
      const cleaned = intents.filter((i) => i.intent.name !== 'ViewNews');
      this.intentsByTicker.set(ctx.id.ticker, cleaned);
    } catch (err) {
      console.warn('[news] findIntentsByContext failed', err);
      this.intentsByTicker.set(ctx.id.ticker, []);
    }
  }

  private appendRandomHeadline(): void {
    const candidates = this.instrumentFilter
      ? SEED.filter((s) => s.ticker === this.instrumentFilter!.ticker)
      : SEED;
    if (candidates.length === 0) return;
    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    const variant: Headline = {
      ...seed,
      id: `H-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
    };
    this.headlines = [variant, ...this.headlines].slice(0, 60);
    this.cdr.markForCheck();
  }
}

/** Re-exported so the unused-imports check stops complaining about MARKET_QUOTES. */
export const _instruments = MARKET_QUOTES;
