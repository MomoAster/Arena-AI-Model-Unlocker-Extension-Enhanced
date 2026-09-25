const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/main.js");
require("../extension/archive.js");
const archive = globalThis.__arenaModelUnlockerArchive;
const opus = archive.find(model => model.publicName === "claude-opus-4-6");
const defaults = core.normalizeSettings(null);

test("historical snapshot contains the expected Opus record", () => {
  assert.ok(opus);
  assert.equal(opus.id, "019c2fac-13de-7550-a751-f5f593c77c72");
  assert.ok(core.selectedArchive(archive, defaults).length >= 18);
  assert.ok(core.selectedArchive(archive, defaults).every(model => /opus/i.test(model.publicName)));
});

test("invalid saved settings fall back to safe defaults", () => {
  const settings = core.readSettings({ getItem: () => "not-json" });
  assert.deepEqual(settings, defaults);
  assert.equal(core.normalizeSettings({ enabled: false, showHidden: "false" }).showHidden, true);
});

test("Opus is inserted into a React Flight model array without corrupting JSON", () => {
  const payload = JSON.stringify({ initialModels: [{ id: "existing", publicName: "Max" }], flags: { "disable-opus": "disable-opus" } });
  const changed = core.rewriteFlightPayload(payload, defaults, [opus]);
  const parsed = JSON.parse(changed);
  assert.equal(parsed.initialModels[0].id, opus.id);
  assert.equal(parsed.initialModels[1].id, "existing");
  assert.equal(parsed.flags["disable-opus"], "control");
  assert.equal(core.rewriteFlightPayload(changed, defaults, [opus]), changed);
});

test("escaped Flight payload stays escaped and can be decoded", () => {
  const nested = JSON.stringify({ initialModels: [{ id: "existing" }] });
  const escaped = JSON.stringify(nested).slice(1, -1);
  const changed = core.rewriteFlightPayload(escaped, defaults, [opus]);
  const decoded = JSON.parse('"' + changed + '"');
  const parsed = JSON.parse(decoded);
  assert.equal(parsed.initialModels[0].id, opus.id);
});

test("hidden flag is only changed when requested", () => {
  const source = '{"models":[{"userSelectable":false}]}';
  assert.equal(core.rewriteFlightPayload(source, defaults, []), '{"models":[{"userSelectable":true}]}');
  assert.equal(core.rewriteFlightPayload(source, { ...defaults, showHidden: false }, []), source);
  assert.equal(core.rewriteFlightPayload(source, { ...defaults, enabled: false }, []), source);
});

test("catalog adds historical Opus to compatible arenas without duplicates", () => {
  const catalog = [
    { arena: "text", models: [{ id: "current", userSelectable: false }] },
    { arena: "code", models: [] },
    { arena: "text-to-image", models: [] }
  ];
  core.mergeCatalog(catalog, defaults, [opus]);
  assert.deepEqual(catalog.map(section => section.models.length), [2, 1, 0]);
  assert.equal(catalog[0].models[0].userSelectable, true);
  core.mergeCatalog(catalog, defaults, [opus]);
  assert.deepEqual(catalog.map(section => section.models.length), [2, 1, 0]);
});

test("queue hook patches chunks published after installation", () => {
  const windowLike = {
    localStorage: { getItem: () => null },
    location: { href: "https://arena.ai/text/direct", origin: "https://arena.ai" },
    fetch: () => Promise.resolve(new Response("ok"))
  };
  core.install(windowLike, [opus]);
  windowLike.__next_f = [];
  const item = [1, '{"initialModels":[],"disable-opus":"disable-opus"}'];
  windowLike.__next_f.push(item);
  assert.equal(JSON.parse(item[1]).initialModels[0].id, opus.id);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.flightChunksChanged, 1);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.liveOpusInPage, false);
});

test("existing bootstrap chunks are patched and counted when the hook attaches", () => {
  const entry = [1, '{"initialModels":[]}'];
  const windowLike = {
    __next_f: [entry],
    localStorage: { getItem: () => null },
    location: { href: "https://arena.ai/text/direct", origin: "https://arena.ai" }
  };
  core.install(windowLike, [opus]);
  assert.equal(JSON.parse(entry[1]).initialModels[0].id, opus.id);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.flightChunksChanged, 1);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.liveOpusInPage, false);
});

test("fetch hook augments only the same-origin model catalog", async () => {
  const catalog = [{ arena: "text", models: [{ id: "current", userSelectable: true }] }];
  const original = new Response(JSON.stringify(catalog), {
    headers: { "content-type": "application/json", "content-length": "100" }
  });
  const windowLike = {
    localStorage: { getItem: () => null },
    location: { href: "https://arena.ai/text/direct", origin: "https://arena.ai" },
    fetch: async () => original
  };
  core.install(windowLike, [opus]);
  const rewritten = await windowLike.fetch("/nextjs-api/model-catalog");
  const models = (await rewritten.json())[0].models;
  assert.equal(models.length, 2);
  assert.equal(models[1].id, opus.id);
  assert.equal(rewritten.headers.has("content-length"), false);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.catalogRequests, 1);
  assert.equal(windowLike.__arenaModelUnlockerEnhanced.liveOpusInPage, false);

  const untouched = await windowLike.fetch("https://example.com/nextjs-api/model-catalog");
  assert.equal(untouched, original);
});

test("failed historical generation records status without retaining prompt text", async () => {
  const original = new Response('{"error":"not available"}', { status: 400 });
  const windowLike = {
    localStorage: { getItem: () => null },
    location: { href: "https://arena.ai/text/direct", origin: "https://arena.ai" },
    fetch: async () => original
  };
  const diagnostics = core.install(windowLike, [opus]);
  const response = await windowLike.fetch("/nextjs-api/stream/create-evaluation", {
    method: "POST",
    body: JSON.stringify({ modelAId: opus.id, userMessage: { content: "private test prompt" } })
  });
  assert.equal(response, original);
  assert.deepEqual(diagnostics.lastHistoricalRequest, { model: opus.publicName, status: 400 });
  assert.equal(JSON.stringify(diagnostics).includes("private test prompt"), false);
});
