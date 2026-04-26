import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import { StandardIntents } from '@fdc3-poc/fdc3-core';

/**
 * In-memory sample app directory used as fallback if app-directory.json is not found.
 * This mirrors the config/app-directory.json file exactly.
 */
export const SAMPLE_APP_DIRECTORY: AppDefinition[] = [
  {
    appId: 'customer-search',
    title: 'Customer Search',
    description: 'Search and browse customers by name, ID, or segment.',
    url: 'file://apps/customer-search/dist/index.html',
    devPort: 4001,
    icon: '🔍',
    category: 'CRM',
    initialLayout: { x: 50, y: 80, width: 480, height: 560 },
    listensForContexts: ['fdc3.contact'],
  },
  {
    appId: 'customer-profile',
    title: 'Customer Profile',
    description: 'Full customer profile including KYC, accounts, and recent activity.',
    url: 'file://apps/customer-profile/dist/index.html',
    devPort: 4002,
    icon: '👤',
    category: 'CRM',
    initialLayout: { x: 560, y: 80, width: 560, height: 560 },
    listensForContexts: ['fdc3.contact'],
    intents: [
      {
        intent: StandardIntents.VIEW_CONTACT,
        contextTypes: ['fdc3.contact'],
        appId: 'customer-profile',
        displayName: 'View Customer Profile',
      },
    ],
  },
  {
    appId: 'portfolio-view',
    title: 'Portfolio View',
    description: 'Real-time portfolio positions, P&L, and allocation.',
    url: 'file://apps/portfolio-view/dist/index.html',
    devPort: 4003,
    icon: '📊',
    category: 'Investments',
    initialLayout: { x: 1150, y: 80, width: 560, height: 560 },
    listensForContexts: ['fdc3.contact', 'fdc3.portfolio'],
    intents: [
      {
        intent: StandardIntents.VIEW_PORTFOLIO,
        contextTypes: ['fdc3.contact'],
        appId: 'portfolio-view',
        displayName: 'View Portfolio',
      },
    ],
  },
  {
    appId: 'market-watch',
    title: 'Market Watch',
    description: 'Live instrument prices, news, and market data.',
    url: 'file://apps/market-watch/dist/index.html',
    devPort: 4004,
    icon: '📈',
    category: 'Markets',
    initialLayout: { x: 50, y: 680, width: 700, height: 460 },
    listensForContexts: ['fdc3.instrument'],
    intents: [
      {
        intent: StandardIntents.VIEW_INSTRUMENT,
        contextTypes: ['fdc3.instrument'],
        appId: 'market-watch',
        displayName: 'View in Market Watch',
      },
    ],
  },
  {
    appId: 'payment-action',
    title: 'Payment Action',
    description: 'Initiate and authorise customer payment instructions.',
    url: 'file://apps/payment-action/dist/index.html',
    devPort: 4005,
    icon: '💳',
    category: 'Payments',
    initialLayout: { x: 780, y: 680, width: 500, height: 460 },
    listensForContexts: ['com.demo.paymentRequest'],
    intents: [
      {
        intent: StandardIntents.START_PAYMENT,
        contextTypes: ['com.demo.paymentRequest'],
        appId: 'payment-action',
        displayName: 'Start Payment',
      },
    ],
  },
];
