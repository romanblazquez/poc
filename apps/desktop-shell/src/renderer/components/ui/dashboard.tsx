import type * as React from 'react';
import { cn } from '../../lib/utils.js';
import { Badge } from './badge.js';
import { Card, CardContent, CardHeader, CardTitle } from './card.js';

type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-border text-muted-foreground',
  accent: 'border-[color:var(--shell-accent-border)] text-[color:var(--shell-accent-text)]',
  success: 'border-[color:color-mix(in_srgb,var(--shell-positive)_50%,transparent)] text-[color:var(--shell-positive)]',
  warning: 'border-[color:rgba(245,158,11,0.5)] text-[#f59e0b]',
  destructive: 'border-[color:color-mix(in_srgb,var(--shell-negative)_50%,transparent)] text-[color:var(--shell-negative)]',
};

const softToneClasses: Record<StatusTone, string> = {
  neutral: 'bg-secondary/55',
  accent: 'bg-[color:var(--shell-accent-soft)]',
  success: 'bg-[color:color-mix(in_srgb,var(--shell-positive)_12%,transparent)]',
  warning: 'bg-[color:rgba(245,158,11,0.1)]',
  destructive: 'bg-[color:color-mix(in_srgb,var(--shell-negative)_12%,transparent)]',
};

function DashboardPage({ className, children }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 overflow-hidden text-foreground', className)}>
      {children}
    </div>
  );
}

function DashboardHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-start gap-3 border-b border-border/80 pb-3', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="m-0 truncate text-lg font-black leading-6 text-foreground">{title}</h1>
          {meta}
        </div>
        {description && (
          <div className="mt-1 max-w-4xl text-xs font-bold leading-5 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

function DashboardMetric({
  label,
  value,
  detail,
  tone = 'accent',
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}): React.JSX.Element {
  return (
    <Card className={cn('min-w-0 rounded-lg px-3 py-2.5', className)}>
      <div className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 truncate text-2xl font-black leading-7 tabular-nums', toneClasses[tone])}>
        {value}
      </div>
      {detail && <div className="truncate text-xs font-bold text-[color:var(--shell-subtle)]">{detail}</div>}
    </Card>
  );
}

function DashboardMetricGrid({ className, children }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6', className)}>
      {children}
    </div>
  );
}

function DashboardPanel({
  title,
  meta,
  children,
  className,
  contentClassName,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}): React.JSX.Element {
  return (
    <Card className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg', className)}>
      <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b border-border">
        <CardTitle className="truncate text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </CardTitle>
        {meta}
      </CardHeader>
      <CardContent className={cn('min-h-0 flex-1 pt-4', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function StatusCallout({
  tone = 'neutral',
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement> & { tone?: StatusTone }): React.JSX.Element {
  return (
    <div className={cn('rounded-md border p-3 text-xs font-bold leading-relaxed', toneClasses[tone], softToneClasses[tone], className)}>
      {children}
    </div>
  );
}

function DashboardEmpty({
  title,
  detail,
  className,
}: {
  title: string;
  detail?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-28 flex-col items-center justify-center gap-1 text-center text-muted-foreground', className)}>
      <strong className="text-sm font-black text-foreground">{title}</strong>
      {detail && <span className="text-xs font-bold">{detail}</span>}
    </div>
  );
}

function StatusBadge({ label, tone = 'neutral' }: { label: React.ReactNode; tone?: StatusTone }): React.JSX.Element {
  const variant = tone === 'success'
    ? 'success'
    : tone === 'warning'
      ? 'warning'
      : tone === 'destructive'
        ? 'destructive'
        : tone === 'accent'
          ? 'default'
          : 'secondary';

  return <Badge variant={variant}>{label}</Badge>;
}

export {
  DashboardEmpty,
  DashboardHeader,
  DashboardMetric,
  DashboardMetricGrid,
  DashboardPage,
  DashboardPanel,
  StatusBadge,
  StatusCallout,
};
