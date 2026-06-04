import { Component } from '@angular/core';
import { InteropThemeService } from '@fdc3-poc/interop-angular/theme';
import { PaymentActionComponent } from './components/payment-action/payment-action.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PaymentActionComponent],
  template: `<app-payment-action [theme]="theme.theme()"></app-payment-action>`,
})
export class AppComponent {
  constructor(public theme: InteropThemeService) {}
}
