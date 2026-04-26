import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import type { FundContext, OrderContext, ThemeContext } from '@fdc3-poc/fdc3-core';
import { AUDIT_EVENTS, getAuditEventsByFund, getFundById } from '@fdc3-poc/shared-domain';
import type { AuditEvent } from '@fdc3-poc/shared-domain';
import { AppHeader } from '@fdc3-poc/shared-ui';

type ThemeName = 'light' | 'dark';

const palettes = {
  light: { background: '#f8fafc', panel: '#ffffff', text: '#172033', muted: '#697586', border: '#d9e1ec' },
  dark: { background: '#0f1720', panel: '#182231', text: '#e8eef6', muted: '#9fb0c2', border: '#314158' },
};

export function AuditLog() {
  const [theme, setTheme] = useState<ThemeName>('light');
  const [fundId, setFundId] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
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
    const unsubOrder = window.fdc3.addContextListener<OrderContext>('com.demo.order', (ctx) => {
      setLastOrderId(ctx.orderId);
      setFundId(ctx.fundId);
    });
    return () => {
      unsubTheme();
      unsubFund();
      unsubOrder();
    };
  }, []);

  const selectedFund = fundId ? getFundById(fundId) : undefined;
  const events = fundId ? getAuditEventsByFund(fundId) : AUDIT_EVENTS;

  const columnDefs = useMemo<ColDef<AuditEvent>[]>(
    () => [
      { field: 'timestamp', width: 115, sort: 'desc' },
      { field: 'severity', width: 120, cellStyle: ({ value }) => ({ color: severityColor(String(value)), fontWeight: 800 }) },
      { field: 'actor', width: 150 },
      { field: 'action', width: 150 },
      { field: 'details', minWidth: 280, flex: 1, wrapText: true, autoHeight: true },
      { field: 'auditId', headerName: 'Audit ID', width: 130 },
    ],
    [],
  );

  return (
    <div className="workstation-app" style={{ background: colors.background, color: colors.text }}>
      <AppHeader title="Audit" icon="!" />

      <div style={{ background: colors.panel, borderBottom: `1px solid ${colors.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: colors.muted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Listening To Fund Selection</div>
          <div style={{ color: colors.text, fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFund ? `${selectedFund.ticker} · ${selectedFund.name}` : 'All fund events'}
          </div>
        </div>
        {lastOrderId && <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>Last order: {lastOrderId}</div>}
      </div>

      <div className={`${theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'} workstation-grid`}>
        <AgGridReact
          key={theme}
          rowData={events}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          getRowId={({ data }) => data.auditId}
        />
      </div>
    </div>
  );
}

function severityColor(severity: string): string {
  if (severity === 'Critical') return '#b42318';
  if (severity === 'Warning') return '#b76e00';
  return '#087443';
}
