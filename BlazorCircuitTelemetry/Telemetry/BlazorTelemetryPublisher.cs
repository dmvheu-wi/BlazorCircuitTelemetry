using System.Collections.Concurrent;
using System.Threading.Channels;
using BlazorCircuitTelemetry.Shared;

namespace BlazorCircuitTelemetry.Telemetry;

public sealed class BlazorTelemetryPublisher
{
    private readonly ConcurrentDictionary<Guid, Channel<TelemetryEntry>> _subscribers = new();
    private long _sequence;
    private long _droppedEvents;

    public long DroppedEvents => Interlocked.Read(ref _droppedEvents);

    public void Publish(TelemetryEntry entry)
    {
        var stamped = entry with { Sequence = Interlocked.Increment(ref _sequence) };
        foreach (var subscriber in _subscribers.Values)
        {
            if (!subscriber.Writer.TryWrite(stamped))
            {
                Interlocked.Increment(ref _droppedEvents);
            }
        }
    }

    public TelemetrySubscription Subscribe()
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<TelemetryEntry>(new BoundedChannelOptions(1000)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false
        });
        _subscribers[id] = channel;
        return new TelemetrySubscription(channel.Reader, () =>
        {
            if (_subscribers.TryRemove(id, out var removed))
            {
                removed.Writer.TryComplete();
            }
        });
    }
}

public sealed class TelemetrySubscription(ChannelReader<TelemetryEntry> reader, Action dispose) : IDisposable
{
    public ChannelReader<TelemetryEntry> Reader { get; } = reader;
    public void Dispose() => dispose();
}
