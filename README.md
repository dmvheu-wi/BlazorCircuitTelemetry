# Blazor Circuit Telemetry POC

Open `/blazor-internals` in Development. The static SSR page hosts sibling Interactive Server (the observed playground) and Interactive WebAssembly (the observer) components. This separation prevents terminal rendering and controls from adding traffic to the circuit being studied.

The early browser observer captures only `/_blazor` WebSocket activity. Server lifecycle and application annotations use a separate SSE endpoint (`/_telemetry/events`) and bounded per-subscriber channels. The endpoint is enabled only in Development and when `BlazorTelemetry:Enabled` is true. Captured payloads can include user data; previews are bounded and exports remain in the browser.

Raw frames are observed, circuit events are framework supplied, playground operations are instrumented, and any interpretation by time proximity is inferred. Frame payloads are not decoded as BlazorPack, so no render-tree reconstruction is claimed. Use DevTools Offline mode to inspect connection-down/reconnect behavior; a circuit closing is distinct from a connection going down.
