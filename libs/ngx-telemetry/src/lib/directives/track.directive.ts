import {
  Directive,
  Input,
  HostListener,
  inject,
  ElementRef,
} from '@angular/core';
import { type Attributes } from '@opentelemetry/api';
import { TelemetryService } from '../telemetry.service';

/**
 * Declarative event tracking — drop on any element like a GTM click trigger.
 *
 * @example
 * <button [track]="'place-order'" [trackData]="{ instrument: 'AAPL' }">Place Order</button>
 * <input [track]="'search-focus'" trackOn="focus" />
 */
@Directive({
  selector: '[track]',
  standalone: true,
})
export class TrackDirective {
  /** Telemetry event / span name */
  @Input({ required: true }) track!: string;

  /** Extra attributes attached to the span */
  @Input() trackData?: Attributes;

  /** DOM event to capture. @default 'click' */
  @Input() trackOn: string = 'click';

  private readonly _telemetry = inject(TelemetryService);
  private readonly _el = inject(ElementRef) as ElementRef<HTMLElement>;

  @HostListener('click', ['$event'])
  onHostClick(event: MouseEvent) {
    if (this.trackOn === 'click') this._record(event);
  }

  @HostListener('focus', ['$event'])
  onHostFocus(event: FocusEvent) {
    if (this.trackOn === 'focus') this._record(event);
  }

  @HostListener('blur', ['$event'])
  onHostBlur(event: FocusEvent) {
    if (this.trackOn === 'blur') this._record(event);
  }

  @HostListener('change', ['$event'])
  onHostChange(event: Event) {
    if (this.trackOn === 'change') this._record(event);
  }

  private _record(_event: Event): void {
    this._telemetry.recordEvent(this.track, {
      'ui.element.tag': this._el.nativeElement.tagName.toLowerCase(),
      'ui.element.id': this._el.nativeElement.id || undefined,
      'ui.element.text': this._el.nativeElement.textContent?.trim().slice(0, 64) || undefined,
      ...this.trackData,
    });
  }
}
