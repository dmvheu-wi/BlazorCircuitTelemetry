using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using BlazorCircuitTelemetry.Telemetry;

namespace BlazorCircuitTelemetry.Components.BlazorInternals;

public partial class BlazorServerPlayground
{
    private int _count, _requestedRows = 20, _rows, _ticks;
    private string _changeValue = "", _inputValue = "", _browserValue = "", _error = "", _lastTick = "not started";
    private bool _busy;
    private PeriodicTimer? _timer;
    private CancellationTokenSource _disposeCts = new();
    private async Task Increment() { using var op = Telemetry.Begin("Counter button handler", new { PreviousValue = _count }); _count++; Telemetry.Annotate("Counter value changed", new { NewValue = _count }); await Task.CompletedTask; }
    private async Task Reset() { Telemetry.Annotate("Counter reset", new { PreviousValue = _count }); _count = 0; await Task.CompletedTask; }
    private Task ApplyRows() { _rows = Math.Clamp(_requestedRows, 0, 1000); Telemetry.Annotate("Generated rows applied", new { Requested = _requestedRows, Applied = _rows }); return Task.CompletedTask; }
    private void StartTimer() { _timer = new PeriodicTimer(TimeSpan.FromSeconds(1)); Telemetry.Annotate("Server timer started"); _ = TickAsync(_timer, _disposeCts.Token); }
    private void StopTimer() { _timer?.Dispose(); _timer = null; Telemetry.Annotate("Server timer stopped"); }
    private async Task TickAsync(PeriodicTimer timer, CancellationToken token) { try { while (await timer.WaitForNextTickAsync(token)) { await InvokeAsync(() => { _ticks++; _lastTick = DateTimeOffset.Now.ToString("T"); Telemetry.Annotate("Server timer tick", new { _ticks }); StateHasChanged(); }); } } catch (OperationCanceledException) { } }
    private async Task ReadBrowserTime() { using var op = Telemetry.Begin("JavaScript interop call"); try { _browserValue = await JS.InvokeAsync<string>("eval", "new Date().toISOString()"); Telemetry.Annotate("JavaScript interop completed", new { _browserValue }); } catch (JSDisconnectedException) { _browserValue = "Browser disconnected."; } }
    private async Task RunLongOperation() { if (_busy) return; _busy = true; using var op = Telemetry.Begin("Async long-running handler"); try { await Task.Delay(TimeSpan.FromSeconds(3), _disposeCts.Token); Telemetry.Annotate("Async operation completed"); } catch (OperationCanceledException) { } finally { _busy = false; } }
    private Task DemonstrateHandledError() { try { throw new InvalidOperationException("Controlled demonstration exception"); } catch (Exception ex) { _error = ex.Message; Telemetry.Annotate("Handled exception", new { ex.Message }); } return Task.CompletedTask; }
    private void Navigate() { Telemetry.Annotate("Navigation requested", new { Target = "/blazor-internals" }); Navigation.NavigateTo("/blazor-internals?from=navigation"); }
    public ValueTask DisposeAsync() { StopTimer(); _disposeCts.Cancel(); _disposeCts.Dispose(); Telemetry.Annotate("Playground disposed"); return ValueTask.CompletedTask; }
}
