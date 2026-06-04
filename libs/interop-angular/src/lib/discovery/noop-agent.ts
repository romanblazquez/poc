import type {
  AppIntent,
  Channel,
  Fdc3Context,
  Fdc3DesktopAgent,
  Fdc3EventHandler,
  Fdc3EventType,
  ImplementationMetadata,
  IntentInvocationMetadata,
  IntentResolution,
  ListenerHandle,
  PrivateChannel,
  ThemeName,
  Unsubscribe,
  UserChannel,
} from '../fdc3-types';
import { NoAppsFoundError } from '../fdc3-types';
import { toListenerHandle } from '../listener-handle';

/**
 * No-op desktop agent — used when `offline: 'noop'`. Every call resolves
 * silently with a safe default. Intent discovery and resolution still throw
 * the spec-correct `NoAppsFound` so app-level error handlers don't break.
 */
export function makeNoopAgent(appId: string): Fdc3DesktopAgent {
  const noopUnsub: Unsubscribe = () => undefined;
  const noopHandle: ListenerHandle = toListenerHandle(noopUnsub);
  const meta: ImplementationMetadata = {
    fdc3Version: '2.0',
    provider: 'interop-angular/noop',
    providerVersion: '0.1.0',
    appMetadata: { appId, instanceId: 'noop' },
    optionalFeatures: {
      OriginatingAppMetadata: false,
      UserChannelMembershipAPIs: false,
      DesktopAgentBridging: false,
    },
  };

  function addContextListener<T extends Fdc3Context>(handler: (context: T) => void): ListenerHandle;
  function addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T) => void,
  ): ListenerHandle;
  function addContextListener<T extends Fdc3Context>(
    _typeOrHandler: string | null | ((context: T) => void),
    _maybeHandler?: (context: T) => void,
  ): ListenerHandle {
    return noopHandle;
  }

  return {
    broadcast: async () => undefined,
    addContextListener,
    raiseIntent: async (): Promise<IntentResolution> => { throw new NoAppsFoundError(); },
    raiseIntentForContext: async (): Promise<IntentResolution> => { throw new NoAppsFoundError(); },
    addIntentListener: (
      _intent: string,
      _h: (_c?: Fdc3Context, _m?: IntentInvocationMetadata) => Promise<void> | void,
    ) => noopHandle,
    addEventListener: (_type: Fdc3EventType | null, _h: Fdc3EventHandler) => noopHandle,
    completeIntent: async (_requestId: string, _result?: Fdc3Context | PrivateChannel) => undefined,
    closeWindow: async () => false,
    getTheme: async () => 'dark-financial' as ThemeName,
    setTheme: async (theme: ThemeName) => theme,
    onThemeChanged: (_h: (_t: ThemeName) => void) => noopUnsub,
    joinUserChannel: async (_channelId: string) => undefined,
    leaveCurrentChannel: async () => undefined,
    getCurrentChannel: async () => null,
    getUserChannels: async () => [] as UserChannel[],
    open: async (_app: { appId: string }, _ctx?: Fdc3Context) => undefined,
    getInfo: async () => meta,
    findIntent: async (): Promise<AppIntent> => { throw new NoAppsFoundError(); },
    findIntentsByContext: async (): Promise<AppIntent[]> => [],
    getOrCreateChannel: async (): Promise<Channel> => {
      throw new Error('No-op agent: App Channels not supported');
    },
    createPrivateChannel: async (): Promise<PrivateChannel> => {
      throw new Error('No-op agent: Private Channels not supported');
    },
  };
}
