namespace BlazorCircuitTelemetry.Telemetry;

public sealed class BlazorTelemetryOptions
{
    public const string SectionName = "BlazorTelemetry";
    public bool Enabled { get; init; } = true;
}
