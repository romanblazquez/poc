import { ApplicationConfig } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideInterop } from '@fdc3-poc/interop-angular';
import { provideInteropTheme } from '@fdc3-poc/interop-angular/theme';
import { provideInteropLogs } from '@fdc3-poc/interop-angular/logs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideInterop({ appId: 'compliance-check' }),
    provideInteropTheme(),
    provideInteropLogs({ category: 'compliance-check' }),
  ],
};
