// Parses every Power Fx formula in the Granted app with Microsoft's own Power Fx engine, so a
// syntax error (an unbalanced bracket, a reserved word used as a name) fails the build here
// instead of showing up in Power Apps Studio. Run: node tools/app/check-formulas.js
using System.Globalization;
using System.Text.Json;
using Microsoft.PowerFx;

var items = JsonSerializer.Deserialize<List<string[]>>(File.ReadAllText(args[0]));
var opts = new ParserOptions { AllowsSideEffects = true, Culture = CultureInfo.GetCultureInfo("en-US") };
var engine = new Engine(new PowerFxConfig());
int bad = 0;
foreach (var it in items)
{
    var r = engine.Parse(it[2], opts);
    if (r.Errors.Count() == 0) continue;
    bad++;
    Console.WriteLine($"{it[0]}.{it[1]}: {string.Join(" | ", r.Errors.Select(e => e.Message + " (at " + e.Span.Min + ")"))}");
}
Console.WriteLine($"{items.Count} formulas checked, {bad} with errors");
return bad == 0 ? 0 : 1;
