import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideInterop } from '@fdc3-poc/interop-angular';
import { provideInteropTheme } from '@fdc3-poc/interop-angular/theme';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideInterop({ appId: 'payment-action' }),
    provideInteropTheme(),
  ],
}).catch(console.error);
