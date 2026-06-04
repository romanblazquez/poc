import { Component } from '@angular/core';
import { InteropThemeService } from '@fdc3-poc/interop-angular/theme';
import { CustomerProfileComponent } from './components/customer-profile/customer-profile.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CustomerProfileComponent],
  template: `<app-customer-profile [theme]="theme.theme()"></app-customer-profile>`,
})
export class AppComponent {
  constructor(public theme: InteropThemeService) {}
}
