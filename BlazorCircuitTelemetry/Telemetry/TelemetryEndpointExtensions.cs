using System.Text.Json;
using BlazorCircuitTelemetry.Shared;

namespace BlazorCircuitTelemetry.Telemetry;

public static class TelemetryEndpointExtensions
{
    public static void MapBlazorTelemetry(this WebApplication app)
    {
        var options = app.Configuration.GetSection(BlazorTelemetryOptions.SectionName).Get<BlazorTelemetryOptions>() ?? new();
        if (!app.Environment.IsDevelopment() || !options.Enabled) return;
        app.MapGet("/_telemetry/events", async (HttpContext context, BlazorTelemetryPublisher publisher) =>
        {
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.Connection = "keep-alive";
            context.Response.ContentType = "text/event-stream";
            using var subscription = publisher.Subscribe();
            publisher.Publish(new TelemetryEntry { Sequence = 0, Timestamp = DateTimeOffset.UtcNow, Category = TelemetryCategory.Server, Name = "SseConnected", Summary = "Telemetry terminal subscribed", Confidence = TelemetryConfidence.Instrumented });
            await foreach (var item in subscription.Reader.ReadAllAsync(context.RequestAborted))
            {
                await context.Response.WriteAsync($"data: {JsonSerializer.Serialize(item)}\n\n", context.RequestAborted);
                await context.Response.Body.FlushAsync(context.RequestAborted);
            }
        });
    }
}
