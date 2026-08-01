(() => {
  const observer = window.blazorTelemetryObserver ?? (() => {
    const entries = [], subscribers = new Set(), maximumEntries = 2000;
    let sequence = 0, dropped = 0;
    const emit = (name, detail = {}) => {
      // These numeric enum values match the shared .NET contract. Server SSE uses the
      // same representation, so the WebAssembly client can deserialize both sources.
      const entry = { sequence: ++sequence, timestamp: new Date().toISOString(), category: name === "Message" ? 0 : 1, name, summary: detail.summary || name, direction: detail.direction ?? 0, source: "Browser WebSocket observer", confidence: 0, ...detail };
      if (entries.length === maximumEntries) { entries.shift(); dropped++; }
      entries.push(entry); subscribers.forEach(callback => callback(entry));
    };
    return { installed: false, available: typeof window.WebSocket === "function", getBuffered: () => ({ entries, dropped }), subscribe: callback => { subscribers.add(callback); return () => subscribers.delete(callback); }, emit };
  })();
  window.blazorTelemetryObserver = observer;
  if (observer.installed) return;

  function describe(data, direction) {
    if (typeof data === "string") return { summary: "Blazor frame", direction, payloadType: "string", byteLength: new TextEncoder().encode(data).length, preview: data.slice(0, 512) };
    if (data instanceof Blob) return { summary: "Blazor frame", direction, payloadType: "Blob", byteLength: data.size };
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    return { summary: "Blazor frame", direction, payloadType: bytes ? "binary" : typeof data, byteLength: bytes?.byteLength, preview: bytes ? Array.from(bytes.slice(0, 128), byte => byte.toString(16).padStart(2, "0")).join(" ") : undefined };
  }

  function install() {
    const nativeWebSocket = window.WebSocket;
    if (typeof nativeWebSocket !== "function") return false;
    if (nativeWebSocket.__blazorTelemetryWrapped) return true;
    function ObservedWebSocket(url, protocols) {
      const socket = arguments.length > 1 ? new nativeWebSocket(url, protocols) : new nativeWebSocket(url);
      if (!String(url).includes("/_blazor")) return socket;
      observer.emit("Constructed", { summary: "Blazor WebSocket constructed", url: String(url) });
      socket.addEventListener("open", () => observer.emit("Opened", { summary: "Blazor WebSocket opened", url: String(url) }));
      socket.addEventListener("error", () => observer.emit("Error", { summary: "Blazor WebSocket error", url: String(url) }));
      socket.addEventListener("close", event => observer.emit("Closed", { summary: "Blazor WebSocket closed", url: String(url), metadata: { code: event.code, reason: event.reason, wasClean: event.wasClean } }));
      socket.addEventListener("message", event => observer.emit("Message", describe(event.data, 1)));
      const nativeSend = socket.send.bind(socket);
      socket.send = data => { observer.emit("Message", describe(data, 2)); return nativeSend(data); };
      return socket;
    }
    ObservedWebSocket.prototype = nativeWebSocket.prototype;
    Object.setPrototypeOf(ObservedWebSocket, nativeWebSocket);
    Object.defineProperty(ObservedWebSocket, "__blazorTelemetryWrapped", { value: true });
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(name => Object.defineProperty(ObservedWebSocket, name, { value: nativeWebSocket[name] }));
    window.WebSocket = ObservedWebSocket;
    observer.available = true;
    observer.installed = true;
    observer.emit("ObserverInstalled", { summary: "Early Blazor WebSocket observer installed" });
    return true;
  }

  if (!install()) {
    observer.available = false;
    observer.emit("ObserverUnavailable", { summary: "WebSocket was unavailable during observer bootstrap" });
  }
})();
