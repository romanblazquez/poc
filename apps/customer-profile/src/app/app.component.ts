import { Component, OnInit, OnDestroy } from '@angular/core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { CustomerProfileComponent } from './components/customer-profile/customer-profile.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CustomerProfileComponent],
  template: `<app-customer-profile [theme]="theme"></app-customer-profile>`,
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
