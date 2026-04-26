import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeContext, ThemeName } from '@fdc3-poc/fdc3-core';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.component.html',
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  theme: ThemeName = 'quartz-dark';
  status = 'Ready';

  readonly themes = THEMES;
  readonly themeKeys = Object.keys(THEMES) as ThemeName[];

  private unsub?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    document.documentElement.dataset['theme'] = THEMES[this.theme].dataTheme;

    if (!window.fdc3) return;
    this.unsub = window.fdc3.addContextListener<ThemeContext>('com.demo.theme', (ctx) => {
      this.theme = ctx.theme;
      document.documentElement.dataset['theme'] = THEMES[ctx.theme].dataTheme;
      this.status = `Received ${ctx.theme}`;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  async onThemeChange(next: ThemeName): Promise<void> {
    this.theme = next;
    document.documentElement.dataset['theme'] = THEMES[next].dataTheme;
    this.status = 'Broadcasting...';
    this.cdr.markForCheck();

    if (!window.fdc3) {
      this.status = 'FDC3 unavailable';
      this.cdr.markForCheck();
      return;
    }
    await window.fdc3.broadcast({
      type: 'com.demo.theme',
      name: THEMES[next].label,
      theme: next,
    } satisfies ThemeContext);
    this.status = `Broadcast ${next}`;
    this.cdr.markForCheck();
  }
}
