import { EnvironmentProviders, InjectionToken, Provider, makeEnvironmentProviders } from '@angular/core';

/**
 * The minimal shape an autocomplete row needs. Keeps the lib decoupled from
 * the demo `MarketQuote` shape — production deployments inject a service
 * that maps a real symbology endpoint into this shape.
 */
export interface InstrumentRecord {
  ticker: string;
  name: string;
  isin?: string;
  currency?: string;
  exchange?: string;
  lastPrice?: number;
}

const DEFAULT_INSTRUMENTS: InstrumentRecord[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', isin: 'US0378331005', currency: 'USD', exchange: 'NASDAQ', lastPrice: 189.3 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', isin: 'US5949181045', currency: 'USD', exchange: 'NASDAQ', lastPrice: 415.6 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', isin: 'US67066G1040', currency: 'USD', exchange: 'NASDAQ', lastPrice: 875.4 },
  { ticker: 'SAP', name: 'SAP SE', isin: 'DE0007164600', currency: 'EUR', exchange: 'XETRA', lastPrice: 178.6 },
  { ticker: 'SAN.MC', name: 'Banco Santander', isin: 'ES0113900J37', currency: 'EUR', exchange: 'BME', lastPrice: 4.15 },
  { ticker: 'ALV', name: 'Allianz SE', isin: 'DE0008404005', currency: 'EUR', exchange: 'XETRA', lastPrice: 265.3 },
];

/**
 * Source-of-truth for instrument lookup. Implementations may hit a remote
 * symbology service; they're called on every keystroke so the implementation
 * should be cheap (in-memory cache) or debounced by the caller.
 */
export interface InstrumentSource {
  search(query: string, max?: number): InstrumentRecord[] | Promise<InstrumentRecord[]>;
}

/**
 * Default implementation backed by a tiny bundled starter catalogue.
 * Case-insensitive substring match on ticker, name, and ISIN.
 */
export const defaultInstrumentSource: InstrumentSource = {
  search(query: string, max = 8): InstrumentRecord[] {
    const q = query.trim().toLowerCase();
    const all = DEFAULT_INSTRUMENTS;
    if (!q) return all.slice(0, max);
    return all
      .filter((r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.isin?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, max);
  },
};

export const INSTRUMENT_SOURCE = new InjectionToken<InstrumentSource>('INSTRUMENT_SOURCE', {
  providedIn: 'root',
  factory: () => defaultInstrumentSource,
});

/**
 * Override the default instrument source with a custom implementation. Use in
 * `ApplicationConfig.providers`:
 *
 * @example
 *   provideInstrumentSource({ useFactory: () => inject(MyRemoteCatalogue) }),
 */
export function provideInstrumentSource(provider: Provider): EnvironmentProviders {
  return makeEnvironmentProviders([provider]);
}
