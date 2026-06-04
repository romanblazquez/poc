# @fdc3-poc/interop-angular

Angular 21 interoperability library for the FDC3 Desktop POC ecosystem. Drop-in for
**any** Angular app — local to the monorepo, npm-installed into a third-party app, or
served from any cloud origin — to participate in FDC3 channels, contexts, intents, and
private channels without writing shell-specific code.

## What it does

- **Three-tier agent discovery**, transparent to the app:
  1. Uses `window.fdc3` synchronously when running inside the FDC3 Desktop shell.
  2. Falls back to FDC3 2.1 `getAgent()` for web hosts (io.Connect / Glue42 / Cosaic).
  3. Falls back to an in-page **BroadcastChannel** adapter so two tabs of a cloud-served
     Angular app still talk to each other, with no shell at all.
- **Signals-first** Angular API: `currentChannel`, `availableChannels`, `mode`, `ready` are all
  signals. Streams of contexts and intents come as RxJS Observables that auto-tear-down
  via `takeUntilDestroyed()`.
- **Standalone-safe**: register once with `provideInterop({ appId })` in your `ApplicationConfig`.
- **Tree-shakable**: import only what you use.

## Quick start

```ts
import { ApplicationConfig } from '@angular/core';
import { provideInterop } from '@fdc3-poc/interop-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideInterop({ appId: 'my-app' }),
  ],
};
```

```ts
import { Component, inject } from '@angular/core';
import { InteropService } from '@fdc3-poc/interop-angular';

@Component({ /* ... */ })
export class MyComponent {
  private readonly interop = inject(InteropService);
  readonly currentChannel = this.interop.currentChannel;

  ngOnInit() {
    this.interop.contexts$<InstrumentContext>('fdc3.instrument').subscribe((ctx) => {
      // ...auto-unsubscribes when the component is destroyed
    });
  }
}
```
