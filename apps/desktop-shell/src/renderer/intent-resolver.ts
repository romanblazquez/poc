/**
 * Renderer for the intent resolver modal.
 *
 * Loaded into a small BrowserWindow that the shell pops when more than one app
 * can handle a raised intent. Uses the existing preload (`window.fdc3`) for IPC
 * — three internal helpers (__intentResolverGetPayload / Pick / Cancel) shuttle
 * data between this window and the main process.
 */

interface ResolverCandidate {
  appId: string;
  title?: string;
  description?: string;
  icon?: string;
  isRunning: boolean;
  instanceId?: number;
}

interface ResolverPayload {
  intent: string;
  contextType?: string;
  contextName?: string;
  theme?: 'dark-financial' | 'light-financial' | 'high-contrast' | 'luxury-neutral';
  candidates: ResolverCandidate[];
}

interface ResolverApi {
  __intentResolverGetPayload(): Promise<ResolverPayload>;
  __intentResolverPick(appId: string, instanceId?: number): Promise<void>;
  __intentResolverCancel(): Promise<void>;
}

const fdc3 = (window as unknown as { fdc3: ResolverApi }).fdc3;

const intentNameEl = document.getElementById('intent-name')!;
const contextHintEl = document.getElementById('context-hint')!;
const listEl = document.getElementById('list')!;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

function render(payload: ResolverPayload): void {
  if (payload.theme) document.documentElement.setAttribute('data-theme', payload.theme);
  intentNameEl.textContent = payload.intent;
  contextHintEl.textContent = payload.contextType
    ? `with ${payload.contextType}${payload.contextName ? ` — ${payload.contextName}` : ''}`
    : 'no context';

  listEl.innerHTML = '';
  if (payload.candidates.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'No apps available for this intent.';
    listEl.appendChild(div);
    return;
  }

  payload.candidates.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'candidate';
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.dataset.appId = c.appId;
    row.innerHTML = `
      <div class="icon">${escapeHtml(c.icon ?? '◇')}</div>
      <div class="meta">
        <div class="title">${escapeHtml(c.title ?? c.appId)}</div>
        ${c.description ? `<div class="description">${escapeHtml(c.description)}</div>` : ''}
      </div>
      <div class="badge ${c.isRunning ? '' : 'open'}">${c.isRunning ? 'Running' : 'Open'}</div>
    `;
    const onPick = (): void => {
      void fdc3.__intentResolverPick(c.appId, c.instanceId);
    };
    row.addEventListener('click', onPick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick();
      }
    });
    if (i === 0) queueMicrotask(() => row.focus());
    listEl.appendChild(row);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

cancelBtn.addEventListener('click', () => {
  void fdc3.__intentResolverCancel();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    void fdc3.__intentResolverCancel();
  }
});

void fdc3.__intentResolverGetPayload().then(render).catch((err: unknown) => {
  console.error('[intent-resolver] failed to fetch payload', err);
  listEl.innerHTML = '<div class="empty">Failed to load resolver payload.</div>';
});

export {};
