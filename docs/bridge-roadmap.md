# Bridge Roadmap

## Current scope

The shell implements non-experimental FINOS bridge readiness:

- Persisted bridge settings in Electron `userData`.
- Local loopback scan for a FINOS Backplane-style service.
- Bridge console status, candidate endpoints, and last-error reporting.
- No FDC3 traffic is routed through the bridge.

`fdc3.getInfo().optionalFeatures.DesktopAgentBridging` must remain `false` until
the shell implements a standards-safe bridge protocol.

## Deferred scope

The FDC3 Desktop Agent Bridging protocol is documented by FINOS/FDC3, but it is
marked experimental in the 2.x documentation. Do not build production routing on
that protocol by default.

Future work can add an explicitly named experimental pass when product risk is
accepted:

- Backplane BCP/BMP handshake implementation.
- Agent discovery over the bridge.
- Cross-agent channel/context/intent forwarding.
- Conformance tests and a kill switch.

References:

- https://fdc3.finos.org/docs/next/api/ref/DesktopAgentBridging
- https://fdc3.finos.org/docs/next/agent-bridging/spec
- https://backplane.finos.org/
- https://github.com/finos/backplane
