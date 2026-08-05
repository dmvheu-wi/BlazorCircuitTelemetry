using BlazorCircuitTelemetry.Components;
using BlazorCircuitTelemetry.Telemetry;
using Microsoft.AspNetCore.Components.Server.Circuits;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();
builder.Services.Configure<BlazorTelemetryOptions>(builder.Configuration.GetSection(BlazorTelemetryOptions.SectionName));
builder.Services.AddSingleton<BlazorTelemetryPublisher>();
builder.Services.AddScoped<ApplicationTelemetry>();
builder.Services.AddScoped<CircuitHandler, TelemetryCircuitHandler>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
}
else
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(BlazorCircuitTelemetry.Client._Imports).Assembly);
app.MapBlazorTelemetry();

app.Run();
