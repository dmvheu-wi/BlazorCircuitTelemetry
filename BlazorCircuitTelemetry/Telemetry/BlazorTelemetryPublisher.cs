using System.Collections.Concurrent;
using System.Threading.Channels;
using BlazorCircuitTelemetry.Shared;

namespace BlazorCircuitTelemetry.Telemetry;

public sealed class BlazorTelemetryPublisher
{
    private const int ReplayCapacity = 200;
    private readonly ConcurrentDictionary<Guid, Channel<TelemetryEntry>> _subscribers = new();
    private readonly ConcurrentQueue<TelemetryEntry> _recentEntries = new();
    private long _sequence;
    private long _droppedEvents;

    public long DroppedEvents => Interlocked.Read(ref _droppedEvents);

    public void Publish(TelemetryEntry entry)
    {
        var stamped = entry with { Sequence = Interlocked.Increment(ref _sequence) };
        _recentEntries.Enqueue(stamped);
        while (_recentEntries.Count > ReplayCapacity && _recentEntries.TryDequeue(out _)) { }

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
        // The terminal's WebAssembly island becomes interactive after the Server island's
        // circuit opens. Replay a small bounded window so it can still show startup events.
        foreach (var entry in _recentEntries)
        {
            if (!channel.Writer.TryWrite(entry))
            {
                Interlocked.Increment(ref _droppedEvents);
            }
        }

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
