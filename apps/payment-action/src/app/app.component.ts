import { Component, OnInit, OnDestroy } from '@angular/core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { PaymentActionComponent } from './components/payment-action/payment-action.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PaymentActionComponent],
  template: `<app-payment-action [theme]="theme"></app-payment-action>`,
})
export class AppComponent implements OnInit, OnDestroy {
  theme: ThemeName = 'quartz-dark';
  private unsubTheme?: () => void;

  ngOnInit(): void {
    this.applyTheme(this.theme);
    if (window.fdc3) {
      this.unsubTheme = window.fdc3.addContextListener<ThemeContext>('com.demo.theme', (ctx) => {
        this.theme = ctx.theme;
        this.applyTheme(ctx.theme);
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
