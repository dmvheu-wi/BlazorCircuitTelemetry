(() => {
  if (window.blazorTelemetryObserver) return;
  const entries = [], subscribers = new Set(), max = 2000, original = window.WebSocket;
  let sequence = 0, dropped = 0;
  const trim = value => String(value ?? "").slice(0, 512);
  const emit = (name, detail = {}) => {
    const entry = { sequence: ++sequence, timestamp: new Date().toISOString(), category: name === "Message" ? "RawFrame" : "SignalR", name, summary: detail.summary || name, direction: detail.direction || "None", source: "Browser WebSocket observer", confidence: "Observed", ...detail };
    if (entries.length === max) { entries.shift(); dropped++; }
    entries.push(entry); subscribers.forEach(s => s(entry));
  };
  function ObservedWebSocket(url, protocols) {
    const socket = arguments.length > 1 ? new original(url, protocols) : new original(url);
    if (!String(url).includes("/_blazor")) return socket;
    emit("Constructed", { summary: "Blazor WebSocket constructed", url: String(url) });
    socket.addEventListener("open", () => emit("Opened", { summary: "Blazor WebSocket opened", url: String(url) }));
    socket.addEventListener("error", () => emit("Error", { summary: "Blazor WebSocket error", url: String(url) }));
    socket.addEventListener("close", e => emit("Closed", { summary: "Blazor WebSocket closed", url: String(url), metadata: { code: e.code, reason: e.reason, wasClean: e.wasClean } }));
    socket.addEventListener("message", e => emit("Message", describe(e.data, "Incoming")));
    const send = socket.send.bind(socket);
    socket.send = data => { emit("Message", describe(data, "Outgoing")); return send(data); };
    return socket;
  }
  function describe(data, direction) {
    if (typeof data === "string") return { summary: "Blazor frame", direction, payloadType: "string", byteLength: new TextEncoder().encode(data).length, preview: trim(data) };
    if (data instanceof Blob) return { summary: "Blazor frame", direction, payloadType: "Blob", byteLength: data.size };
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    return { summary: "Blazor frame", direction, payloadType: bytes ? "binary" : typeof data, byteLength: bytes?.byteLength, preview: bytes ? Array.from(bytes.slice(0, 128), b => b.toString(16).padStart(2, "0")).join(" ") : undefined };
  }
  ObservedWebSocket.prototype = original.prototype;
  Object.setPrototypeOf(ObservedWebSocket, original);
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(key => Object.defineProperty(ObservedWebSocket, key, { value: original[key] }));
  window.WebSocket = ObservedWebSocket;
  window.blazorTelemetryObserver = { getBuffered: () => ({ entries, dropped }), subscribe: callback => { subscribers.add(callback); return () => subscribers.delete(callback); } };
  emit("ObserverInstalled", { summary: "Early Blazor WebSocket observer installed" });
})();
