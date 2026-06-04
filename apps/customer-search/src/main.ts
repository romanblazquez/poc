import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { provideInterop } from '@fdc3-poc/interop-angular';
import { provideInteropTheme } from '@fdc3-poc/interop-angular/theme';

ModuleRegistry.registerModules([AllCommunityModule]);

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideInterop({ appId: 'customer-search' }),
    provideInteropTheme(),
  ],
}).catch(console.error);
