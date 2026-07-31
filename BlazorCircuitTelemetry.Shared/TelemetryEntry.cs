using System.Text.Json;

namespace BlazorCircuitTelemetry.Shared;

public enum TelemetryCategory { RawFrame, SignalR, Circuit, Server, Annotation }
public enum TelemetryDirection { None, Incoming, Outgoing }
public enum TelemetryConfidence { Observed, Framework, Instrumented, Inferred }

public sealed record TelemetryEntry
{
    public required long Sequence { get; init; }
    public required DateTimeOffset Timestamp { get; init; }
    public required TelemetryCategory Category { get; init; }
    public required string Name { get; init; }
    public required string Summary { get; init; }
    public TelemetryDirection Direction { get; init; } = TelemetryDirection.None;
    public string? Source { get; init; }
    public string? CircuitId { get; init; }
    public string? CorrelationId { get; init; }
    public int? ByteLength { get; init; }
    public string? PayloadType { get; init; }
    public string? Preview { get; init; }
    public TelemetryConfidence Confidence { get; init; } = TelemetryConfidence.Instrumented;
    public IReadOnlyDictionary<string, JsonElement>? Metadata { get; init; }
}
