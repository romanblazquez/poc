import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { FundContext, OrderContext, ThemeContext } from '@fdc3-poc/fdc3-core';
import { getFundById, INCOMING_ORDERS } from '@fdc3-poc/shared-domain';
import type { IncomingOrder } from '@fdc3-poc/shared-domain';
import { AppHeader } from '@fdc3-poc/shared-ui';

type ThemeName = 'light' | 'dark';

const palettes = {
  light: { background: '#f7f9fc', panel: '#ffffff', text: '#172033', muted: '#667085', border: '#d9e1ec' },
  dark: { background: '#111827', panel: '#192231', text: '#edf2f7', muted: '#aab6c5', border: '#324154' },
};

export function IncomingOrders() {
  const [theme, setTheme] = useState<ThemeName>('light');
  const [fundId, setFundId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const colors = palettes[theme];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!window.fdc3) return;
    const unsubTheme = window.fdc3.addContextListener<ThemeContext>('com.demo.theme', (ctx) => {
      setTheme(ctx.theme);
      document.documentElement.dataset.theme = ctx.theme;
    });
    const unsubFund = window.fdc3.addContextListener<FundContext>('com.demo.fund', (ctx) => {
      setFundId(ctx.id.fundId);
    });
    return () => {
      unsubTheme();
      unsubFund();
    };
  }, []);

  const orders = fundId ? INCOMING_ORDERS.filter((order) => order.fundId === fundId) : INCOMING_ORDERS;
  const selectedFund = fundId ? getFundById(fundId) : undefined;

  const columnDefs = useMemo<ColDef<IncomingOrder>[]>(
    () => [
      { field: 'orderId', headerName: 'Order', width: 115, pinned: 'left' },
      { field: 'fundName', headerName: 'Fund', minWidth: 210, flex: 1 },
      {
        field: 'side',
        width: 90,
        cellStyle: ({ value }) => ({ color: value === 'Buy' ? '#087443' : '#b42318', fontWeight: 800 }),
      },
      {
        field: 'quantity',
        width: 120,
        type: 'rightAligned',
        valueFormatter: ({ value }) => Number(value).toLocaleString(),
      },
      {
        field: 'notional',
        width: 130,
        type: 'rightAligned',
        valueFormatter: ({ data, value }) => `${data?.currency ?? ''} ${Number(value).toLocaleString()}`,
      },
      { field: 'receivedAt', headerName: 'Received', width: 120 },
      { field: 'status', width: 125 },
      { field: 'source', width: 130 },
      { field: 'trader', width: 130 },
    ],
    [],
  );

  const broadcastOrder = useCallback(async (order: IncomingOrder) => {
    setSelectedOrder(order.orderId);
    if (!window.fdc3) return;
    const orderContext: OrderContext = {
      type: 'com.demo.order',
      name: order.orderId,
      orderId: order.orderId,
      fundId: order.fundId,
      side: order.side,
      quantity: order.quantity,
      notional: order.notional,
      currency: order.currency,
      status: order.status,
    };
    const fund = getFundById(order.fundId);
    await window.fdc3.broadcast(orderContext);
    if (fund) {
      await window.fdc3.broadcast({
        type: 'com.demo.fund',
        name: fund.name,
        id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
        strategy: fund.strategy,
      } satisfies FundContext);
    }
  }, []);

  return (
    <div className="workstation-app" style={{ background: colors.background, color: colors.text }}>
      <AppHeader title="Incoming Orders" icon="≡" />

      <div style={{ padding: '10px 14px', background: colors.panel, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: colors.muted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Filter</div>
          <div style={{ color: colors.text, fontSize: 14, fontWeight: 700 }}>{selectedFund ? selectedFund.name : 'All funds'}</div>
        </div>
        <button
          onClick={() => setFundId(null)}
          style={{ border: `1px solid ${colors.border}`, background: colors.panel, color: colors.text, borderRadius: 6, padding: '7px 10px', cursor: 'pointer', fontWeight: 700 }}
        >
          Clear
        </button>
      </div>

      <div className={`${theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'} workstation-grid`}>
        <AgGridReact
          key={theme}
          rowData={orders}
          columnDefs={columnDefs}
          rowSelection="single"
          animateRows
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          getRowId={({ data }) => data.orderId}
          rowClassRules={{ 'ag-row-selected': ({ data }) => data?.orderId === selectedOrder }}
          onRowClicked={(event: RowClickedEvent<IncomingOrder>) => {
            if (event.data) void broadcastOrder(event.data);
          }}
        />
      </div>
    </div>
  );
}
