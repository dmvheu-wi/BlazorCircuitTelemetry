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

  function bytesOf(data) {
    return data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
  }

  function describe(data, direction) {
    if (typeof data === "string") return { summary: "Blazor frame", direction, payloadType: "string", byteLength: new TextEncoder().encode(data).length, preview: data.slice(0, 512) };
    if (data instanceof Blob) return { summary: "Blazor frame", direction, payloadType: "Blob", byteLength: data.size };
    const bytes = bytesOf(data);
    return { summary: "Blazor frame", direction, payloadType: bytes ? "binary" : typeof data, byteLength: bytes?.byteLength, preview: bytes ? Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(" ") : undefined };
  }

  function readMessagePack(bytes) {
    let offset = 0;
    const textDecoder = new TextDecoder();
    const take = count => { if (offset + count > bytes.length) throw new Error("Incomplete MessagePack value"); const value = bytes.subarray(offset, offset + count); offset += count; return value; };
    const integer = (count, signed = false) => {
      const view = new DataView(take(count).buffer, bytes.byteOffset + offset - count, count);
      if (count === 1) return signed ? view.getInt8(0) : view.getUint8(0);
      if (count === 2) return signed ? view.getInt16(0) : view.getUint16(0);
      if (count === 4) return signed ? view.getInt32(0) : view.getUint32(0);
      return Number(signed ? view.getBigInt64(0) : view.getBigUint64(0));
    };
    const value = () => {
      const marker = integer(1);
      if (marker <= 0x7f) return marker;
      if (marker >= 0xe0) return marker - 0x100;
      if ((marker & 0xf0) === 0x80) { const result = {}; for (let i = 0; i < (marker & 0x0f); i++) result[value()] = value(); return result; }
      if ((marker & 0xf0) === 0x90) return Array.from({ length: marker & 0x0f }, value);
      if ((marker & 0xe0) === 0xa0) return textDecoder.decode(take(marker & 0x1f));
      switch (marker) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: return take(integer(1));
        case 0xc5: return take(integer(2));
        case 0xc6: return take(integer(4));
        case 0xcc: return integer(1);
        case 0xcd: return integer(2);
        case 0xce: return integer(4);
        case 0xcf: return integer(8);
        case 0xd0: return integer(1, true);
        case 0xd1: return integer(2, true);
        case 0xd2: return integer(4, true);
        case 0xd3: return integer(8, true);
        case 0xd9: return textDecoder.decode(take(integer(1)));
        case 0xda: return textDecoder.decode(take(integer(2)));
        case 0xdb: return textDecoder.decode(take(integer(4)));
        case 0xdc: return Array.from({ length: integer(2) }, value);
        case 0xdd: return Array.from({ length: integer(4) }, value);
        default: throw new Error(`Unsupported MessagePack marker 0x${marker.toString(16)}`);
      }
    };
    return value();
  }

  function signalRPayloads(frame) {
    const payloads = [];
    for (let offset = 0; offset < frame.length;) {
      let length = 0, shift = 0, current;
      do {
        if (offset >= frame.length || shift >= 35) throw new Error("Invalid SignalR binary frame length");
        current = frame[offset++];
        length |= (current & 0x7f) << shift;
        shift += 7;
      } while (current & 0x80);
      if (offset + length > frame.length) throw new Error("Incomplete SignalR binary frame");
      payloads.push(frame.subarray(offset, offset + length));
      offset += length;
    }
    return payloads;
  }

  function visualKind(data) {
    const frame = bytesOf(data);
    if (!frame) return "protocol";
    try {
      const payload = signalRPayloads(frame)[0];
      const message = payload && readMessagePack(payload);
      if (!Array.isArray(message)) return "protocol";
      if (message[0] === 6) return "ping";
      if (message[0] === 3) return "completion";
      if (message[0] !== 1) return "protocol";
      const targetName = message[3];
      if (targetName === "JS.RenderBatch") return "render-batch";
      if (targetName === "OnRenderCompleted") return "render-completed";
      if (targetName === "JS.EndInvokeDotNet") return "dotnet-completed";
      return "invocation";
    } catch {
      return "decode-error";
    }
  }

  function emitDecoded(data, direction) {
    const frame = bytesOf(data);
    if (!frame) return;
    try {
      for (const payload of signalRPayloads(frame)) {
        const message = readMessagePack(payload);
        if (!Array.isArray(message) || typeof message[0] !== "number") continue;
        const type = message[0];
        if (type === 6) {
          observer.emit("Ping", { category: 1, summary: "SignalR keep-alive ping", direction, source: "SignalR MessagePack decoder", byteLength: payload.length, visualKind: "ping", confidence: 1 });
          continue;
        }
        if (type === 1) {
          const targetName = message[3];
          const args = Array.isArray(message[4]) ? message[4] : [];
          const metadata = { target: targetName, messageType: "Invocation" };
          if (targetName === "JS.RenderBatch") {
            const batchId = args[0];
            const renderBytes = args[1] instanceof Uint8Array ? args[1].byteLength : 0;
            observer.emit("Render batch", { category: 2, summary: `Batch ${batchId} · ${renderBytes} render bytes`, direction, source: "Blazor protocol decoder", byteLength: renderBytes, correlationId: String(batchId), visualKind: "render-batch", confidence: 1, metadata: { ...metadata, batchId, renderBytes } });
          } else if (targetName === "OnRenderCompleted") {
            const batchId = args[0], error = args[1];
            observer.emit("Render completed", { category: 2, summary: error == null ? `Batch ${batchId} applied successfully` : `Batch ${batchId} failed: ${error}`, direction, source: "Blazor protocol decoder", correlationId: String(batchId), visualKind: "render-completed", confidence: 1, metadata: { ...metadata, batchId, error } });
          } else if (targetName === "JS.EndInvokeDotNet") {
            const callId = args[0], success = args[1], result = args[2];
            observer.emit(".NET invocation completed", { category: 2, summary: `Call ${callId} ${success ? "succeeded" : "failed"}`, direction, source: "Blazor protocol decoder", correlationId: String(callId), visualKind: "dotnet-completed", confidence: 1, preview: result == null ? undefined : String(result), metadata: { ...metadata, callId, success, result } });
          } else {
            observer.emit("Invocation", { category: 1, summary: String(targetName || "SignalR invocation"), direction, source: "SignalR MessagePack decoder", byteLength: payload.length, visualKind: "invocation", confidence: 1, metadata });
          }
          continue;
        }
        const typeNames = { 2: "Stream item", 3: "Completion", 4: "Stream invocation", 5: "Cancel invocation", 7: "Close", 8: "Ack", 9: "Sequence" };
        observer.emit(typeNames[type] || `Message type ${type}`, { category: 1, summary: `SignalR ${typeNames[type] || `message type ${type}`}`, direction, source: "SignalR MessagePack decoder", byteLength: payload.length, visualKind: type === 3 ? "completion" : "protocol", confidence: 1, metadata: { messageType: type } });
      }
    } catch (error) {
      observer.emit("Decode skipped", { category: 1, summary: error.message, direction, source: "SignalR MessagePack decoder", visualKind: "decode-error", confidence: 3 });
    }
  }

  function observe(data, direction) {
    observer.emit("Message", { ...describe(data, direction), visualKind: visualKind(data) });
    emitDecoded(data, direction);
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
      socket.addEventListener("message", event => observe(event.data, 1));
      const nativeSend = socket.send.bind(socket);
      socket.send = data => { observe(data, 2); return nativeSend(data); };
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
