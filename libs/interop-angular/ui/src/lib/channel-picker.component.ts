import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { InteropService } from '@fdc3-poc/interop-angular';

/**
 * Drop-in user-channel picker. Reads from `InteropService.availableChannels`
 * and `currentChannel` (signals) so it updates automatically when channels
 * change — joining one is as simple as clicking it. Self-closes when the user
 * clicks outside.
 *
 * @example
 *   <interop-channel-picker />
 */
@Component({
  selector: 'interop-channel-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <button type="button" class="trigger" (click)="open.set(!open())">
        <span class="dot" [style.background]="currentColor()"></span>
        <span class="name">{{ currentName() }}</span>
        <span class="chev">▾</span>
      </button>
      @if (open()) {
        <div class="menu" role="menu">
          @for (ch of channels(); track ch.id) {
            <button type="button" class="item" role="menuitem"
                    [class.active]="ch.id === currentId()"
                    (click)="join(ch.id)">
              <span class="dot" [style.background]="ch.displayMetadata.color"></span>
              <span>{{ ch.displayMetadata.name }}</span>
            </button>
          }
          @if (currentId()) {
            <button type="button" class="item leave" role="menuitem" (click)="leave()">
              Leave channel
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; position: relative; }
    .picker { position: relative; }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.1)));
      background: var(--interop-trigger-bg, transparent);
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      font-size: 12px;
      cursor: pointer;
    }
    .trigger:hover {
      background: var(--interop-trigger-hover, var(--ws-panel-2, rgba(255,255,255,0.04)));
    }
    .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--interop-muted, var(--ws-muted, #8d93b8));
      box-shadow: 0 0 0 1px rgba(0,0,0,0.2) inset;
    }
    .chev { font-size: 10px; opacity: 0.6; margin-left: 4px; }
    .menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 180px;
      padding: 4px;
      background: var(--interop-menu-bg, var(--ws-panel, #1e2240));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.1)));
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.25);
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      border: 0;
      background: transparent;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      cursor: pointer;
      text-align: left;
      font-size: 12px;
    }
    .item:hover { background: var(--interop-menu-hover, rgba(255,255,255,0.06)); }
    .item.active { background: var(--interop-menu-active, rgba(64,128,232,0.18)); }
    .item.leave { color: var(--interop-negative, var(--ws-negative, #b42318)); margin-top: 4px; border-top: 1px solid var(--interop-border, rgba(255,255,255,0.08)); }
  `],
})
export class InteropChannelPickerComponent {
  private readonly interop = inject(InteropService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);
  readonly channels = this.interop.availableChannels;
  readonly current = this.interop.currentChannel;
  readonly currentId = computed(() => this.current()?.id ?? null);
  readonly currentName = computed(() => this.current()?.displayMetadata.name ?? 'No Channel');
  readonly currentColor = computed(() => this.current()?.displayMetadata.color ?? 'var(--interop-muted, var(--ws-muted, #8d93b8))');

  async join(id: string): Promise<void> {
    await this.interop.joinUserChannel(id);
    this.open.set(false);
  }

  async leave(): Promise<void> {
    await this.interop.leaveCurrentChannel();
    this.open.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (!this.open()) return;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.open.set(false);
  }
}
