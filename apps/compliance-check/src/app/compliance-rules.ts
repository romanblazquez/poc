import type { ComplianceVerdict, TraderOrderContext } from '@fdc3-poc/interop-angular';
import { getQuoteByTicker } from '@fdc3-poc/shared-domain';

/**
 * Editable policy fed by the screen's config panel. Everything else here is
 * pure functions so a future test harness can drive them deterministically.
 */
export interface CompliancePolicy {
  /** Per-order notional that triggers manual review. Default $1m. */
  reviewNotionalCap: number;
  /** Per-order notional that is hard-blocked. Default $5m. */
  hardNotionalCap: number;
  /** Tickers blocked outright (e.g. export-license review in effect). */
  restrictedTickers: ReadonlySet<string>;
  /** Limit-price deviation from last that triggers review. 0.03 = 3%. */
  priceCollar: number;
}

export const DEFAULT_POLICY: CompliancePolicy = {
  reviewNotionalCap: 1_000_000,
  hardNotionalCap: 5_000_000,
  restrictedTickers: new Set<string>([]),
  priceCollar: 0.03,
};

/** One per-rule outcome — composed into the final order verdict. */
export interface RuleOutcome {
  rule: string;
  verdict: ComplianceVerdict;
  reason: string;
}

export interface OrderEvaluation {
  verdict: ComplianceVerdict;
  outcomes: RuleOutcome[];
  /** Notional derived from the order if it didn't carry one. */
  notional: number;
}

/** The most severe verdict wins. */
function worst(a: ComplianceVerdict, b: ComplianceVerdict): ComplianceVerdict {
  const rank: Record<ComplianceVerdict, number> = { approved: 0, review: 1, blocked: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function deriveNotional(order: TraderOrderContext): number {
  if (typeof order.notional === 'number' && order.notional > 0) return order.notional;
  const qty = Number(order.quantity) || 0;
  let price: number = 0;
  if (order.orderType === 'Limit' && typeof order.limitPrice === 'number') {
    price = order.limitPrice;
  } else {
    const quote = getQuoteByTicker(order.instrument.ticker);
    price = quote?.price ?? 0;
  }
  return Math.abs(qty * price);
}

/**
 * Evaluate an order against the policy and return the aggregated verdict.
 * Pure function — no I/O, no interop calls, safe to reuse from tests.
 */
export function evaluateOrder(order: TraderOrderContext, policy: CompliancePolicy): OrderEvaluation {
  const outcomes: RuleOutcome[] = [];
  const notional = deriveNotional(order);
  const ticker = order.instrument.ticker;

  // 1. Restricted ticker list
  if (policy.restrictedTickers.has(ticker)) {
    outcomes.push({
      rule: 'RestrictedSymbols',
      verdict: 'blocked',
      reason: `${ticker} is on the restricted-symbol list`,
    });
  }

  // 2. Hard notional cap
  if (notional > policy.hardNotionalCap) {
    outcomes.push({
      rule: 'NotionalLimit',
      verdict: 'blocked',
      reason: `Notional ${order.currency} ${Math.round(notional).toLocaleString()} exceeds hard cap of ${order.currency} ${policy.hardNotionalCap.toLocaleString()}`,
    });
  } else if (notional > policy.reviewNotionalCap) {
    outcomes.push({
      rule: 'NotionalReview',
      verdict: 'review',
      reason: `Notional ${order.currency} ${Math.round(notional).toLocaleString()} exceeds review threshold ${order.currency} ${policy.reviewNotionalCap.toLocaleString()}`,
    });
  }

  // 3. Limit-price collar (only on Limit orders, and only if we have a reference)
  if (order.orderType === 'Limit' && typeof order.limitPrice === 'number') {
    const quote = getQuoteByTicker(ticker);
    if (quote?.price && order.limitPrice > 0) {
      const deviation = Math.abs(order.limitPrice - quote.price) / quote.price;
      if (deviation > policy.priceCollar) {
        outcomes.push({
          rule: 'PriceCollar',
          verdict: 'review',
          reason: `Limit ${order.limitPrice.toFixed(2)} is ${(deviation * 100).toFixed(1)}% off last ${quote.price.toFixed(2)} (collar ${(policy.priceCollar * 100).toFixed(1)}%)`,
        });
      }
    }
  }

  const verdict = outcomes.reduce<ComplianceVerdict>((acc, o) => worst(acc, o.verdict), 'approved');
  if (outcomes.length === 0) {
    outcomes.push({
      rule: 'BaselineChecks',
      verdict: 'approved',
      reason: 'All baseline checks passed',
    });
  }
  return { verdict, outcomes, notional };
}
