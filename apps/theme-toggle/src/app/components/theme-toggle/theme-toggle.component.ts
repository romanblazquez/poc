import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.component.html',
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  theme: ThemeName = 'dark-financial';
  status = 'Ready';

  readonly themes = THEMES;
  readonly themeKeys = Object.keys(THEMES) as ThemeName[];

  private unsubTheme?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    document.documentElement.dataset['theme'] = THEMES[this.theme].dataTheme;

    if (!window.fdc3) return;
    void window.fdc3.getTheme().then((theme) => {
      this.theme = theme;
      document.documentElement.dataset['theme'] = THEMES[theme].dataTheme;
      this.status = `Loaded ${theme}`;
      this.cdr.markForCheck();
    });
    this.unsubTheme = window.fdc3.onThemeChanged((theme) => {
      this.theme = theme;
      document.documentElement.dataset['theme'] = THEMES[theme].dataTheme;
      this.status = `Received ${theme}`;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.unsubTheme?.();
  }

  async onThemeChange(next: ThemeName): Promise<void> {
    this.theme = next;
    document.documentElement.dataset['theme'] = THEMES[next].dataTheme;
    this.status = 'Applying theme...';
    this.cdr.markForCheck();

    if (!window.fdc3) {
      this.status = 'FDC3 unavailable';
      this.cdr.markForCheck();
      return;
    }
    await window.fdc3.setTheme(next);
    this.status = `Applied ${next}`;
    this.cdr.markForCheck();
  }
}
