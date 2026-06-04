import { Component } from '@angular/core';
import { InteropThemeService } from '@fdc3-poc/interop-angular/theme';
import { PortfolioViewComponent } from './components/portfolio-view/portfolio-view.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PortfolioViewComponent],
  template: `<app-portfolio-view [theme]="theme.theme()"></app-portfolio-view>`,
})
export class AppComponent {
  constructor(public theme: InteropThemeService) {}
}
