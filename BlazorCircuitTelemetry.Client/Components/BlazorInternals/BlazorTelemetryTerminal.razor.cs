using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using BlazorCircuitTelemetry.Shared;

namespace BlazorCircuitTelemetry.Client.Components.BlazorInternals;

public partial class BlazorTelemetryTerminal
{
    private static readonly JsonSerializerOptions BrowserJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TelemetryCategory[] Categories = [TelemetryCategory.RawFrame, TelemetryCategory.SignalR, TelemetryCategory.Circuit, TelemetryCategory.Server, TelemetryCategory.Annotation];
    private readonly List<TelemetryEntry> _entries = []; private readonly Queue<TelemetryEntry> _pending = [];
    private IJSObjectReference? _module; private DotNetObjectReference<BlazorTelemetryTerminal>? _self;
    private TelemetryCategory _active = TelemetryCategory.RawFrame; private bool _paused; private string _search = "", _observerStatus = "Loading observer", _sseStatus = "SSE connecting"; private int _minBytes, _dropped;
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        _module = await JS.InvokeAsync<IJSObjectReference>("import", "./js/blazor-telemetry-terminal.js");
        _self = DotNetObjectReference.Create(this);
        var startup = await _module.InvokeAsync<ObserverStartupState>("start", _self);
        _observerStatus = startup.ObserverInstalled ? "Observer active" : "WebSocket capture unavailable";
        await InvokeAsync(StateHasChanged);
    }
    [JSInvokable] public Task ReceiveBatch(JsonElement[] batch) { foreach (var item in batch) { try { Add(item.Deserialize<TelemetryEntry>(BrowserJsonOptions)!); } catch { _dropped++; } } return InvokeAsync(StateHasChanged); }
    [JSInvokable] public Task SetSseStatus(string status) { _sseStatus = status; return InvokeAsync(StateHasChanged); }
    private void Add(TelemetryEntry entry) { if (_paused) { if (_pending.Count >= 1000) { _pending.Dequeue(); _dropped++; } _pending.Enqueue(entry); return; } if (_entries.Count >= 5000) { _entries.RemoveAt(0); _dropped++; } _entries.Add(entry); }
    private IEnumerable<TelemetryEntry> Filtered() => _entries.Where(x => x.Category == _active && (x.ByteLength ?? 0) >= _minBytes && ($"{x.Name} {x.Summary} {x.Preview}".Contains(_search, StringComparison.OrdinalIgnoreCase)));
    private int Count(TelemetryCategory category) => _entries.Count(x => x.Category == category);
    private void TogglePause() { _paused = !_paused; if (!_paused) while (_pending.TryDequeue(out var entry)) Add(entry); }
    private void Clear() => _entries.Clear();
    private async Task Export() { if (_module is not null) await _module.InvokeVoidAsync("exportEntries", _entries); }
    public async ValueTask DisposeAsync() { _self?.Dispose(); if (_module is not null) { await _module.InvokeVoidAsync("dispose"); await _module.DisposeAsync(); } }
    private sealed record ObserverStartupState(bool ObserverAvailable, bool ObserverInstalled);
}
