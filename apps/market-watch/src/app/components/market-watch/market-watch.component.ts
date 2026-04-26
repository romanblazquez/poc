import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { InstrumentContext } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import { MARKET_QUOTES } from '@fdc3-poc/shared-domain';
import type { MarketQuote } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-market-watch',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './market-watch.component.html',
})
export class MarketWatchComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'quartz-dark';

  quotes: MarketQuote[] = MARKET_QUOTES.map((q) => ({ ...q }));
  highlighted: string | null = null;
  intentStatus = '';

  channels: Array<{ id: string; displayMetadata: { name: string; color: string } }> = [];
  currentChannel: { id: string; displayMetadata: { name: string; color: string } } | null = null;
  channelOpen = false;

  private tickInterval?: ReturnType<typeof setInterval>;
  private unsub1?: () => void;
  private unsub2?: () => void;
  private unsubChannel?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Simulate live ticks
    this.tickInterval = setInterval(() => {
      this.quotes = this.quotes.map((q) => {
        const delta = (Math.random() - 0.5) * q.price * 0.003;
        const newPrice = Math.max(q.price + delta, 0.01);
        return {
          ...q,
          price: +newPrice.toFixed(2),
          change: +(q.change + delta).toFixed(2),
          changePct: +(q.changePct + (delta / q.price) * 100).toFixed(2),
        };
      });
      this.cdr.markForCheck();
    }, 2000);

    if (!window.fdc3) return;

    this.unsub1 = window.fdc3.addContextListener<InstrumentContext>('fdc3.instrument', (ctx) => {
      if (ctx.id?.ticker) {
        this.highlighted = ctx.id.ticker;
        this.cdr.markForCheck();
      }
    });
    this.unsub2 = window.fdc3.addIntentListener('ViewInstrument', (ctx) => {
      const instrument = ctx as InstrumentContext | undefined;
      if (instrument?.id?.ticker) {
        this.highlighted = instrument.id.ticker;
        this.cdr.markForCheck();
      }
    });

    void window.fdc3.getUserChannels().then((chs) => {
      this.channels = chs as typeof this.channels;
      this.cdr.markForCheck();
    });
    void window.fdc3.getCurrentChannel().then((ch) => {
      this.currentChannel = ch as typeof this.currentChannel;
      this.cdr.markForCheck();
    });
    this.unsubChannel = window.fdc3.onChannelChanged((ch) => {
      this.currentChannel = ch as typeof this.currentChannel;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.unsub1?.();
    this.unsub2?.();
    this.unsubChannel?.();
  }

  async onRowClick(q: MarketQuote): Promise<void> {
    if (!window.fdc3) return;
    this.highlighted = q.ticker;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: q.name,
      id: { ticker: q.ticker, ISIN: q.isin },
    };
    this.intentStatus = 'Broadcasting…';
    this.cdr.markForCheck();
    await window.fdc3.broadcast(ctx);
    this.intentStatus = '';
    this.cdr.markForCheck();
  }

  async joinChannel(ch: { id: string; displayMetadata: { name: string; color: string } }): Promise<void> {
    await window.fdc3.joinUserChannel(ch.id);
    this.currentChannel = ch;
    this.channelOpen = false;
    this.cdr.markForCheck();
  }

  async leaveChannel(): Promise<void> {
    await window.fdc3.leaveCurrentChannel();
    this.currentChannel = null;
    this.channelOpen = false;
    this.cdr.markForCheck();
  }

  trackByTicker(_index: number, q: MarketQuote): string {
    return q.ticker;
  }

  trackByChannelId(_index: number, ch: { id: string }): string {
    return ch.id;
  }
}
