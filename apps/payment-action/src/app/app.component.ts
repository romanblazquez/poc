import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import { PaymentActionComponent } from './components/payment-action/payment-action.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PaymentActionComponent],
  template: `<app-payment-action [theme]="theme"></app-payment-action>`,
})
export class AppComponent implements OnInit, OnDestroy {
  theme: ThemeName = 'dark-financial';
  private unsubTheme?: () => void;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.applyTheme(this.theme);
    if (window.fdc3) {
      void window.fdc3.getTheme().then((theme) => {
        this.zone.run(() => {
          this.theme = theme;
          this.applyTheme(theme);
          this.cdr.markForCheck();
        });
      });
      this.unsubTheme = window.fdc3.onThemeChanged((theme) => {
        this.zone.run(() => {
          this.theme = theme;
          this.applyTheme(theme);
          this.cdr.markForCheck();
        });
      });
    }
  }

  ngOnDestroy(): void {
    this.unsubTheme?.();
  }

  private applyTheme(t: ThemeName): void {
    document.documentElement.dataset['theme'] = THEMES[t].dataTheme;
  }
}
