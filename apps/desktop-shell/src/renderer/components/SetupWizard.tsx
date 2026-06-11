import React, { useState, useCallback } from 'react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { AlertTriangle, CheckCircle2, Globe, Layers, Lock, Server, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { JsonSampleButton } from './JsonSampleButton.js';
import { SAMPLES } from '../samples.js';

interface EnvironmentProfile {
  id: string;
  name: string;
  color?: string;
  appDirectoryUrl?: string;
}

interface WizardStep {
  id: 'app-dir' | 'bridge' | 'confirm';
  title: string;
}

const STEPS: WizardStep[] = [
  { id: 'app-dir', title: 'App Directory' },
  { id: 'bridge',  title: 'Bridge' },
  { id: 'confirm', title: 'Confirm' },
];

export interface SetupWizardProps {
  env: EnvironmentProfile;
  onComplete(updates: { appDirectoryUrl?: string; bridgeHost?: string; bridgePort?: number }): void;
  onSkip(): void;
}

function getEnvApi() {
  return (window as unknown as { shellChrome: { environment: {
    update(id: string, patch: Record<string, unknown>): Promise<EnvironmentProfile | null>;
    activate(id: string): Promise<{ profile: EnvironmentProfile; appCount: number | null } | null>;
    fetchRemote?: (url: string) => Promise<{ ok: boolean; apps: unknown[]; error?: string }>;
  } } }).shellChrome.environment;
}

function getAppDirApi() {
  return (window as unknown as { shellChrome: { appDirectory: {
    fetchRemote(url: string): Promise<{ ok: boolean; apps: unknown[]; error?: string }>;
  } } }).shellChrome.appDirectory;
}

function getBridgeApi() {
  return (window as unknown as { shellChrome: { bridge: {
    updateSettings(patch: Record<string, unknown>): Promise<unknown>;
  } } }).shellChrome.bridge;
}

function isHttps(url: string): boolean {
  return url.trim().startsWith('https://');
}

function isLocalhost(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
}

function urlSecurityLevel(url: string): 'secure' | 'insecure' | 'local' | 'empty' {
  if (!url.trim()) return 'empty';
  if (isLocalhost(url)) return 'local';
  return isHttps(url) ? 'secure' : 'insecure';
}

export function SetupWizard({ env, onComplete, onSkip }: SetupWizardProps): React.JSX.Element {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [appDirUrl, setAppDirUrl] = useState(env.appDirectoryUrl ?? '');
  const [appDirTesting, setAppDirTesting] = useState(false);
  const [appDirResult, setAppDirResult] = useState<{ ok: boolean; count?: number; error?: string } | null>(null);

  const [bridgeHost, setBridgeHost] = useState('');
  const [bridgePort, setBridgePort] = useState('4475');

  const [saving, setSaving] = useState(false);

  const testAppDir = useCallback(async () => {
    if (!appDirUrl.trim()) return;
    setAppDirTesting(true);
    setAppDirResult(null);
    try {
      const result = await getAppDirApi().fetchRemote(appDirUrl.trim());
      setAppDirResult(result.ok
        ? { ok: true, count: Array.isArray(result.apps) ? result.apps.length : 0 }
        : { ok: false, error: result.error ?? 'Request failed' });
    } catch (e) {
      setAppDirResult({ ok: false, error: (e as Error).message });
    } finally {
      setAppDirTesting(false);
    }
  }, [appDirUrl]);

  const canProceedAppDir = (): boolean => {
    if (!appDirUrl.trim()) return true; // optional — can skip
    const sec = urlSecurityLevel(appDirUrl);
    return sec === 'secure' || sec === 'local';
  };

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      const updates: { appDirectoryUrl?: string; bridgeHost?: string; bridgePort?: number } = {};
      if (appDirUrl.trim()) updates.appDirectoryUrl = appDirUrl.trim();
      if (bridgeHost.trim()) {
        updates.bridgeHost = bridgeHost.trim();
        const port = parseInt(bridgePort, 10);
        if (!isNaN(port)) updates.bridgePort = port;
      }

      // Save appDirectoryUrl to the env profile
      if (updates.appDirectoryUrl) {
        await getEnvApi().update(env.id, { appDirectoryUrl: updates.appDirectoryUrl });
      }

      // Save bridge config if provided
      if (updates.bridgeHost) {
        await getBridgeApi().updateSettings({ host: updates.bridgeHost, portStart: updates.bridgePort, portEnd: updates.bridgePort });
      }

      onComplete(updates);
    } finally {
      setSaving(false);
    }
  }, [appDirUrl, bridgeHost, bridgePort, env.id, onComplete]);

  const secLevel = urlSecurityLevel(appDirUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
            style={{ background: env.color ?? '#888' }}
          >
            {env.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-extrabold text-foreground">Setup — {env.name}</div>
            <div className="text-[11px] text-muted-foreground">Configure this environment to activate it</div>
          </div>
        </div>

        {/* Step pills */}
        <div className="flex items-center gap-2 border-b px-6 py-3">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 text-[11px] font-bold ${i === stepIdx ? 'text-foreground' : i < stepIdx ? 'text-[color:var(--shell-positive)]' : 'text-muted-foreground'}`}>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black
                  ${i === stepIdx ? 'bg-foreground text-background' : i < stepIdx ? 'bg-[color:var(--shell-positive)] text-black' : 'bg-muted text-muted-foreground'}`}>
                  {i < stepIdx ? '✓' : i + 1}
                </div>
                {s.title}
              </div>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 px-6 py-5">

          {step.id === 'app-dir' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  For <strong className="text-foreground">{env.name}</strong>, apps should be served from a cloud URL — not localhost.
                  Point to a hosted <code className="text-[10px] bg-muted px-1 py-0.5 rounded">app-directory.json</code> that lists your environment's apps.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  App Directory URL
                  <span className="ml-1.5 font-normal normal-case text-muted-foreground/60">(optional — skip to use local file)</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={appDirUrl}
                    onChange={(e) => { setAppDirUrl(e.currentTarget.value); setAppDirResult(null); }}
                    placeholder="https://apps.firm.internal/app-directory.json"
                    className="h-9 font-mono text-xs"
                  />
                  <JsonSampleButton {...SAMPLES.appDirectory} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void testAppDir()}
                    disabled={!appDirUrl.trim() || appDirTesting}
                    className="h-9 shrink-0"
                  >
                    {appDirTesting ? <Loader2 className="size-3.5 animate-spin" /> : 'Test'}
                  </Button>
                </div>

                {/* Security indicator */}
                {appDirUrl.trim() && (
                  <div className={`flex items-center gap-1.5 text-[11px] font-semibold mt-0.5
                    ${secLevel === 'secure' ? 'text-[color:var(--shell-positive)]' :
                      secLevel === 'local'  ? 'text-[color:var(--shell-warning,#f59e0b)]' :
                      secLevel === 'insecure' ? 'text-destructive' : ''}`}>
                    {secLevel === 'secure'   && <><Lock className="size-3" /> HTTPS — secure</>}
                    {secLevel === 'local'    && <><Server className="size-3" /> Localhost — dev only</>}
                    {secLevel === 'insecure' && <><AlertTriangle className="size-3" /> HTTP not allowed for {env.name} — use https://</>}
                  </div>
                )}

                {/* Test result */}
                {appDirResult && (
                  <div className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold mt-1
                    ${appDirResult.ok ? 'bg-[color:color-mix(in_srgb,var(--shell-positive)_10%,transparent)] text-[color:var(--shell-positive)]'
                                      : 'bg-destructive/10 text-destructive'}`}>
                    {appDirResult.ok
                      ? <><CheckCircle2 className="size-3.5" /> Reachable — {appDirResult.count} app{appDirResult.count !== 1 ? 's' : ''} found</>
                      : <><AlertTriangle className="size-3.5" /> {appDirResult.error}</>}
                  </div>
                )}
              </div>
            </div>
          )}

          {step.id === 'bridge' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Optionally point to a FINOS Desktop Agent Bridge for cross-app context sharing.
                  Leave blank to keep the current bridge configuration.
                </p>
              </div>

              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bridge Host <span className="font-normal normal-case text-muted-foreground/60">(optional)</span></label>
                  <Input
                    value={bridgeHost}
                    onChange={(e) => setBridgeHost(e.currentTarget.value)}
                    placeholder="bridge.firm.internal"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Port</label>
                  <Input
                    value={bridgePort}
                    onChange={(e) => setBridgePort(e.currentTarget.value)}
                    placeholder="4475"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {step.id === 'confirm' && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-muted-foreground">Review your configuration for <strong className="text-foreground">{env.name}</strong>:</p>
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4 text-[12px]">
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-semibold text-muted-foreground">App Directory: </span>
                    {appDirUrl.trim()
                      ? <code className="font-mono text-[11px] text-foreground">{appDirUrl.trim()}</code>
                      : <span className="italic text-muted-foreground/60">local file / bundled</span>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-semibold text-muted-foreground">Bridge: </span>
                    {bridgeHost.trim()
                      ? <code className="font-mono text-[11px] text-foreground">{bridgeHost.trim()}:{bridgePort}</code>
                      : <span className="italic text-muted-foreground/60">unchanged</span>}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">After saving, the environment will activate and the app directory will load.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Skip setup
          </Button>
          <div className="flex gap-2">
            {stepIdx > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStepIdx((i) => i - 1)}>
                <ArrowLeft className="mr-1.5 size-3.5" /> Back
              </Button>
            )}
            {stepIdx < STEPS.length - 1 ? (
              <Button
                type="button"
                size="sm"
                disabled={!canProceedAppDir() && step.id === 'app-dir'}
                onClick={() => setStepIdx((i) => i + 1)}
              >
                Next <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={saving} onClick={() => void handleFinish()}>
                {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-3.5" />}
                Activate {env.name}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
