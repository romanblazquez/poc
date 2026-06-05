import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { TagModule } from 'primeng/tag';
import type { ColDef, RowClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService } from '@fdc3-poc/interop-angular';
import type { Channel, FundContext, ThemeName } from '@fdc3-poc/interop-angular';
import { FUND_ALLOCATIONS } from '@fdc3-poc/shared-domain';
import type { FundAllocation } from '@fdc3-poc/shared-domain';

/**
 * Dedicated buy-side App Channel. Keeps fund/order/audit traffic off the user
 * channels (where the trader story lives) so the two workflows can run side
 * by side without colliding. All three apps in this trio subscribe here.
 */
const FUNDOPS_CHANNEL_ID = 'com.demo.fundops';

@Component({
  selector: 'app-funds-allocations',
  standalone: true,
  imports: [CommonModule, AgGridAngular, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './funds-allocations.component.html',
})
export class FundsAllocationsComponent implements OnDestroy {
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

  private fundOpsChannel?: Channel;
  private fundOpsUnsub?: () => void;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    void this.bootstrapChannel();

    // The shell's `ViewFund` intent still arrives via the agent (intents are
    // global, not channel-scoped). When a fund context arrives that way we
    // adopt it too — keeps cross-shell interop intact.
    this.interop.intents$<FundContext>('ViewFund').subscribe(({ context }) => {
      const id = context?.id?.fundId;
      if (!id) return;
      this.selectedFundId = id;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.fundOpsUnsub?.();
  }

  private async bootstrapChannel(): Promise<void> {
    try {
      this.fundOpsChannel = await this.interop.getOrCreateChannel(FUNDOPS_CHANNEL_ID);
      const handle = await this.fundOpsChannel.addContextListener<FundContext>('com.demo.fund', (ctx) => {
        this.selectedFundId = ctx.id.fundId;
        this.cdr.markForCheck();
      });
      this.fundOpsUnsub = (): void => handle.unsubscribe();

      // Catch up on the latest fund broadcast on the channel — last-value
      // cache means a late-joining app sees the current selection instantly.
      const last = await this.fundOpsChannel.getCurrentContext('com.demo.fund');
      if (last && (last as FundContext).id?.fundId) {
        this.selectedFundId = (last as FundContext).id.fundId;
        this.cdr.markForCheck();
      }
    } catch (err) {
      console.warn('[funds-allocations] AppChannel unavailable; staying offline', err);
    }
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
    if (!this.fundOpsChannel) return;
    const context: FundContext = {
      type: 'com.demo.fund',
      name: fund.name,
      id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
      strategy: fund.strategy,
    };
    await this.fundOpsChannel.broadcast(context);
  }
}
