using BlazorCircuitTelemetry.Shared;
using Microsoft.AspNetCore.Components.Server.Circuits;

namespace BlazorCircuitTelemetry.Telemetry;

public sealed class TelemetryCircuitHandler(BlazorTelemetryPublisher publisher) : CircuitHandler
{
    public override Task OnCircuitOpenedAsync(Circuit circuit, CancellationToken cancellationToken) => Publish(circuit, "Opened", "Circuit created");
    public override Task OnConnectionUpAsync(Circuit circuit, CancellationToken cancellationToken) => Publish(circuit, "ConnectionUp", "SignalR connection is up; circuit remains active");
    public override Task OnConnectionDownAsync(Circuit circuit, CancellationToken cancellationToken) => Publish(circuit, "ConnectionDown", "SignalR connection is down; circuit may reconnect");
    public override Task OnCircuitClosedAsync(Circuit circuit, CancellationToken cancellationToken) => Publish(circuit, "Closed", "Circuit disposed");
    private Task Publish(Circuit circuit, string name, string summary)
    {
        publisher.Publish(new TelemetryEntry { Sequence = 0, Timestamp = DateTimeOffset.UtcNow, Category = TelemetryCategory.Circuit, Name = name, Summary = summary, CircuitId = circuit.Id, Confidence = TelemetryConfidence.Framework });
        return Task.CompletedTask;
    }
}
