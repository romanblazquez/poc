import { Component } from '@angular/core';
import { InteropThemeService } from '@fdc3-poc/interop-angular/theme';
import { CustomerSearchComponent } from './components/customer-search/customer-search.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CustomerSearchComponent],
  template: `<app-customer-search [theme]="theme.theme()"></app-customer-search>`,
})
export class AppComponent {
  constructor(public theme: InteropThemeService) {}
}
