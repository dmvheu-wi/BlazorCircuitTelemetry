using System.Text.Json;
using System.Diagnostics;
using BlazorCircuitTelemetry.Shared;

namespace BlazorCircuitTelemetry.Telemetry;

public sealed class ApplicationTelemetry(BlazorTelemetryPublisher publisher)
{
    public TelemetryOperation Begin(string name, object? metadata = null)
    {
        var id = Guid.NewGuid().ToString("N");
        Publish("OperationStarted", name, id, metadata);
        return new TelemetryOperation(this, name, id);
    }

    public void Annotate(string summary, object? metadata = null, string? correlationId = null) =>
        Publish("Annotation", summary, correlationId, metadata);

    internal void Complete(string name, string id, TimeSpan duration, Exception? error = null) =>
        Publish(error is null ? "OperationCompleted" : "OperationFailed", name, id,
            new { DurationMs = Math.Round(duration.TotalMilliseconds), Error = error?.Message });

    private void Publish(string name, string summary, string? correlationId, object? metadata) => publisher.Publish(new TelemetryEntry
    {
        Sequence = 0, Timestamp = DateTimeOffset.UtcNow, Category = TelemetryCategory.Annotation,
        Name = name, Summary = summary, CorrelationId = correlationId, Confidence = TelemetryConfidence.Instrumented,
        Metadata = metadata is null ? null : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(metadata))
    });
}

public sealed class TelemetryOperation(ApplicationTelemetry telemetry, string name, string id) : IDisposable
{
    private readonly Stopwatch _timer = Stopwatch.StartNew();
    private Exception? _error;
    public void Fail(Exception error) => _error = error;
    public void Dispose() { _timer.Stop(); telemetry.Complete(name, id, _timer.Elapsed, _error); }
}
