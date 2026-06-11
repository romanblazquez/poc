import appDirectorySample from '@samples/app-directory.json';

export const SAMPLES = {
  appDirectory: {
    title: 'App Directory JSON format',
    description:
      'The JSON served at your App Directory URL. ' +
      'Required fields: version ("1.0"), applications array with appId, title, and url per entry. ' +
      'Optional: directoryVersion and directoryLabel for update tracking in Distribution, ' +
      'intents for FDC3 intent routing, capabilities for Interop Flow wiring, ' +
      'roles for entitlement gating, listensForContexts for passive subscriptions.',
    sample: appDirectorySample,
  },
} as const;
