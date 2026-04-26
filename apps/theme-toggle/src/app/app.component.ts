import { Component } from '@angular/core';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ThemeToggleComponent],
  template: `<app-theme-toggle></app-theme-toggle>`,
})
export class AppComponent {}
