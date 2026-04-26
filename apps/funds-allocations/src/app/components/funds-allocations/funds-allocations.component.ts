import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { TagModule } from 'primeng/tag';
import type { ColDef, RowClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { FundContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { FUND_ALLOCATIONS } from '@fdc3-poc/shared-domain';
import type { FundAllocation } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-funds-allocations',
  standalone: true,
  imports: [CommonModule, AgGridAngular, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './funds-allocations.component.html',
})
export class FundsAllocationsComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  selectedFundId: string | null = null;
  readonly rowData = FUND_ALLOCATIONS;

  readonly columnDefs: ColDef<FundAllocation>[] = [
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
      cellStyle: ({ value, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' : Number(value) >= 0 ? '#0f8a4b' : '#b42318',
        fontWeight: 700,
      }),
    },
    { field: 'risk', width: 110 },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  private unsubFund?: () => void;
  private unsubIntent?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsubFund = window.fdc3.addContextListener<FundContext>('com.demo.fund', (ctx) => {
      this.selectedFundId = ctx.id.fundId;
      this.cdr.markForCheck();
    });

    this.unsubIntent = window.fdc3.addIntentListener('ViewFund', (raw) => {
      if (raw?.type === 'com.demo.fund') {
        this.selectedFundId = (raw as FundContext).id.fundId;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.unsubFund?.();
    this.unsubIntent?.();
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  get selectedFund(): FundAllocation | undefined {
    return FUND_ALLOCATIONS.find((f) => f.fundId === this.selectedFundId);
  }

  getRowId = (params: GetRowIdParams<FundAllocation>): string => params.data.fundId;

  async onRowClicked(event: RowClickedEvent<FundAllocation>): Promise<void> {
    if (!event.data) return;
    const fund = event.data;
    this.selectedFundId = fund.fundId;
    this.cdr.markForCheck();
    if (!window.fdc3) return;
    const context: FundContext = {
      type: 'com.demo.fund',
      name: fund.name,
      id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
      strategy: fund.strategy,
    };
    await window.fdc3.broadcast(context);
  }
}
