let unsubscribe, source, batch = [], timer, target;
function enqueue(entry) { batch.push(entry); if (batch.length >= 25) flush(); }
function flush() { if (!batch.length || !target) return; const current = batch; batch = []; target.invokeMethodAsync("ReceiveBatch", current); }
export function start(dotNet) {
  target = dotNet;
  const observer = window.blazorTelemetryObserver;
  if (observer) { observer.getBuffered().entries.forEach(enqueue); unsubscribe = observer.subscribe(enqueue); }
  timer = setInterval(flush, 250);
  source = new EventSource("/_telemetry/events");
  source.onopen = () => target.invokeMethodAsync("SetSseStatus", "SSE connected");
  source.onerror = () => target.invokeMethodAsync("SetSseStatus", "SSE reconnecting");
  source.onmessage = e => { try { enqueue(JSON.parse(e.data)); } catch { } };
  return { observerAvailable: !!observer?.available, observerInstalled: !!observer?.installed };
}
export function exportEntries(entries) { const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "blazor-telemetry.json"; a.click(); URL.revokeObjectURL(a.href); }
export function dispose() { if (unsubscribe) unsubscribe(); if (source) source.close(); clearInterval(timer); target = null; }
