import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { FundContext, ThemeContext } from '@fdc3-poc/fdc3-core';
import { FUND_ALLOCATIONS } from '@fdc3-poc/shared-domain';
import type { FundAllocation } from '@fdc3-poc/shared-domain';
import { AppHeader } from '@fdc3-poc/shared-ui';

type ThemeName = 'light' | 'dark';

const themeStyles = {
  light: {
    background: '#f6f8fb',
    panel: '#ffffff',
    text: '#172033',
    muted: '#64748b',
    border: '#d8e0ec',
  },
  dark: {
    background: '#101720',
    panel: '#17212d',
    text: '#e7edf5',
    muted: '#9aa9ba',
    border: '#2c3c4f',
  },
};

export function FundsAllocations() {
  const [theme, setTheme] = useState<ThemeName>('light');
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const colors = themeStyles[theme];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!window.fdc3) return;
    const unsubscribe = window.fdc3.addContextListener<ThemeContext>('com.demo.theme', (ctx) => {
      setTheme(ctx.theme);
      document.documentElement.dataset.theme = ctx.theme;
    });
    const unsubscribeFund = window.fdc3.addContextListener<FundContext>('com.demo.fund', (ctx) => {
      setSelectedFundId(ctx.id.fundId);
    });
    const unsubscribeIntent = window.fdc3.addIntentListener('ViewFund', (ctx) => {
      if (ctx?.type === 'com.demo.fund') {
        setSelectedFundId((ctx as FundContext).id.fundId);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeFund();
      unsubscribeIntent();
    };
  }, []);

  const columnDefs = useMemo<ColDef<FundAllocation>[]>(
    () => [
      { field: 'ticker', headerName: 'Ticker', width: 105, pinned: 'left' },
      { field: 'name', headerName: 'Fund', minWidth: 210, flex: 1 },
      { field: 'strategy', width: 150 },
      { field: 'manager', width: 150 },
      {
        field: 'nav',
        headerName: 'NAV',
        width: 110,
        type: 'rightAligned',
        valueFormatter: ({ value }) => Number(value).toFixed(2),
      },
      {
        field: 'aum',
        headerName: 'AUM',
        width: 120,
        type: 'rightAligned',
        valueFormatter: ({ value }) => `${(Number(value) / 1_000_000_000).toFixed(2)}B`,
      },
      {
        field: 'targetWeight',
        headerName: 'Target',
        width: 110,
        type: 'rightAligned',
        valueFormatter: ({ value }) => `${Number(value).toFixed(1)}%`,
      },
      {
        field: 'actualWeight',
        headerName: 'Actual',
        width: 110,
        type: 'rightAligned',
        valueFormatter: ({ value }) => `${Number(value).toFixed(1)}%`,
      },
      {
        field: 'drift',
        width: 100,
        type: 'rightAligned',
        valueFormatter: ({ value }) => `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`,
        cellStyle: ({ value }) => ({
          color: Number(value) >= 0 ? '#0f8a4b' : '#b42318',
          fontWeight: 700,
        }),
      },
      { field: 'risk', width: 110 },
    ],
    [],
  );

  const broadcastFund = useCallback(async (fund: FundAllocation) => {
    setSelectedFundId(fund.fundId);
    if (!window.fdc3) return;
    const context: FundContext = {
      type: 'com.demo.fund',
      name: fund.name,
      id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
      strategy: fund.strategy,
    };
    await window.fdc3.broadcast(context);
  }, []);

  const selected = FUND_ALLOCATIONS.find((fund) => fund.fundId === selectedFundId);

  return (
    <div className="workstation-app" style={{ background: colors.background, color: colors.text }}>
      <AppHeader title="Funds Allocations" icon="▦" />

      <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: colors.panel, borderBottom: `1px solid ${colors.border}` }}>
        <Metric label="Selected Fund" value={selected?.ticker ?? 'None'} colors={colors} />
        <Metric label="Total AUM" value="$4.41B" colors={colors} />
        <Metric label="Largest Drift" value="+2.7%" colors={colors} />
      </div>

      <div className={`${theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'} workstation-grid`}>
        <AgGridReact
          key={theme}
          rowData={FUND_ALLOCATIONS}
          columnDefs={columnDefs}
          rowSelection="single"
          animateRows
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          getRowId={({ data }) => data.fundId}
          onRowClicked={(event: RowClickedEvent<FundAllocation>) => {
            if (event.data) void broadcastFund(event.data);
          }}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: (typeof themeStyles)['light'];
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: colors.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: colors.text, fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}
