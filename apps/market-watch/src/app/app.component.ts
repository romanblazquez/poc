import { Component } from '@angular/core';
import { InteropThemeService } from '@fdc3-poc/interop-angular/theme';
import { MarketWatchComponent } from './components/market-watch/market-watch.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarketWatchComponent],
  template: `<app-market-watch [theme]="theme.theme()"></app-market-watch>`,
})
export class AppComponent {
  constructor(public theme: InteropThemeService) {}
}
