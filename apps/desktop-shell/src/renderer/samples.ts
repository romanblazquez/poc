import appDirectorySample from '@samples/app-directory.json';
import fdc3ConfigSample from '@samples/fdc3-config.json';

export const SAMPLES = {
  appDirectory: {
    title: 'App Directory JSON',
    description:
      'A JSON array of app definitions served by your AppD endpoint. ' +
      'Each entry declares the app ID, launch URL, FDC3 intents it handles, and context types it listens to. ' +
      'The shell fetches this URL on env activation and again on each Distribution sync.',
    sample: appDirectorySample,
  },
  fdc3Config: {
    title: 'FDC3 Bootstrap Config (fdc3-config.json)',
    description:
      'IT-managed file deployed via SCCM/Intune/GPO alongside the installer. ' +
      'Seeds the default environment list and bridge settings for new installs. ' +
      'User preferences always take precedence — this file only sets the initial state.',
    sample: fdc3ConfigSample,
  },
} as const;
