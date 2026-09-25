(() => {
  "use strict";

  const KEY = "arena-model-unlocker-enhanced:v1";
  const DEFAULTS = Object.freeze({ enabled: true, restoreOpus: true, showHidden: true, includeArchive: false });

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Object.entries(DEFAULTS).map(([name, fallback]) =>
      [name, typeof input[name] === "boolean" ? input[name] : fallback]));
  }

  function readSettings(storage) {
    try { return normalizeSettings(JSON.parse(storage.getItem(KEY) || "null")); }
    catch (_) { return normalizeSettings(null); }
  }

  function selectedArchive(archive, settings) {
    if (!settings.enabled) return [];
    return archive.filter(model => settings.includeArchive ||
      (settings.restoreOpus && /opus/i.test(model.publicName || model.name || "")));
  }

  function makeSelectable(text) {
    return text.replace(/(\\"userSelectable\\"\s*:\s*)false/g, "$1true")
      .replace(/("userSelectable"\s*:\s*)false/g, "$1true");
  }

  function rewriteFlightPayload(source, settings, archive) {
    if (!settings.enabled || typeof source !== "string") return source;
    let text = source;
    if (settings.restoreOpus) {
      text = text.replace(/(\\"disable-opus\\"\s*:\s*)\\"disable-opus\\"/g, "$1\\\"control\\\"")
        .replace(/("disable-opus"\s*:\s*)"disable-opus"/g, '$1"control"');
    }
    if (settings.showHidden) text = makeSelectable(text);

    const candidates = selectedArchive(archive, settings);
    if (!candidates.length || !text.includes("initialModels")) return text;
    const knownIds = new Set(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []);
    const missing = candidates.filter(model => !knownIds.has(model.id));
    if (!missing.length) return text;

    for (const [marker, escaped] of [['"initialModels":[', false], ['\\"initialModels\\":[', true]]) {
      const start = text.indexOf(marker);
      if (start < 0) continue;
      const at = start + marker.length;
      const json = missing.map(model => JSON.stringify(model)).join(",");
      const content = escaped ? json.replace(/"/g, '\\"') : json;
      return text.slice(0, at) + content + (text[at] === "]" ? "" : ",") + text.slice(at);
    }
    return text;
  }

  function supportsArena(model, arena) {
    const input = model.capabilities?.inputCapabilities || {};
    const output = model.capabilities?.outputCapabilities || {};
    switch (arena) {
      case "text": return input.text === true && output.text === true;
      case "document": return input.file === true && output.text === true;
      case "code": return input.text === true && output.web === true;
      case "search": return output.search === true;
      case "text-to-image": return output.image === true;
      case "text-to-video": return output.video === true;
      default: return false;
    }
  }

  function mergeCatalog(catalog, settings, archive) {
    if (!settings.enabled || !Array.isArray(catalog)) return catalog;
    const extras = selectedArchive(archive, settings);
    for (const section of catalog) {
      if (!section || !Array.isArray(section.models)) continue;
      if (settings.showHidden) {
        for (const model of section.models) {
          if (model?.userSelectable === false) model.userSelectable = true;
        }
      }
      const present = new Set(section.models.map(model => model?.id));
      for (const model of extras) {
        if (!present.has(model.id) && supportsArena(model, section.arena)) {
          section.models.push({ ...model, rank: model.rankByModality?.chat ?? 9999 });
          present.add(model.id);
        }
      }
    }
    return catalog;
  }

  function rewriteQueueEntry(entry, settings, archive) {
    if (!Array.isArray(entry)) return entry;
    for (let index = 1; index < entry.length; index += 1) {
      if (typeof entry[index] === "string") entry[index] = rewriteFlightPayload(entry[index], settings, archive);
    }
    return entry;
  }

  function responseWithBody(original, body, contentType) {
    const headers = new Headers(original.headers);
    for (const name of ["content-length", "content-encoding", "etag"]) headers.delete(name);
    if (contentType) headers.set("content-type", contentType);
    const replacement = new Response(body, { status: original.status, statusText: original.statusText, headers });
    for (const name of ["url", "redirected", "type"]) {
      try { Object.defineProperty(replacement, name, { value: original[name] }); } catch (_) { /* Native field. */ }
    }
    return replacement;
  }

  function install(win, archive) {
    const settings = readSettings(win.localStorage);
    const records = Array.isArray(archive) ? archive : [];
    const patchedQueues = new WeakSet();
    const candidates = selectedArchive(records, settings);
    const candidateNames = new Map(candidates.map(model => [model.id, model.publicName]));
    const diagnostics = { version: "1.2.0", archivedCandidates: candidates.length, catalogRequests: 0, flightChunksChanged: 0, liveOpusInPage: null, lastHistoricalRequest: null };
    win.__arenaModelUnlockerEnhanced = diagnostics;

    function observeLiveModels(entry) {
      const payload = Array.isArray(entry) ? entry[1] : undefined;
      if (typeof payload !== "string" || !payload.includes("initialModels")) return;
      const normalized = payload.replace(/\\"/g, '"');
      if (!normalized.includes('"initialModels":[')) return;
      diagnostics.liveOpusInPage = /"(?:publicName|name)"\s*:\s*"[^"\r\n]*opus/i.test(normalized);
    }

    function patchQueue(queue) {
      if (!Array.isArray(queue) || patchedQueues.has(queue)) return;
      patchedQueues.add(queue);
      for (const entry of queue) {
        const before = Array.isArray(entry) ? entry[1] : undefined;
        observeLiveModels(entry);
        rewriteQueueEntry(entry, settings, records);
        if (entry?.[1] !== before) diagnostics.flightChunksChanged += 1;
      }
      const originalPush = queue.push;
      queue.push = function (...entries) {
        for (const entry of entries) {
          const before = Array.isArray(entry) ? entry[1] : undefined;
          observeLiveModels(entry);
          rewriteQueueEntry(entry, settings, records);
          if (entry?.[1] !== before) diagnostics.flightChunksChanged += 1;
        }
        return Reflect.apply(originalPush, this, entries);
      };
    }

    try {
      const descriptor = Object.getOwnPropertyDescriptor(win, "__next_f");
      if (!descriptor || descriptor.configurable) {
        let queue = win.__next_f;
        Object.defineProperty(win, "__next_f", {
          configurable: true, enumerable: true,
          get() { return queue; },
          set(next) { queue = next; patchQueue(next); }
        });
        patchQueue(queue);
      } else patchQueue(win.__next_f);
    } catch (_) { /* Catalog interception may still work. */ }

    if (typeof win.fetch !== "function") return diagnostics;
    const originalFetch = win.fetch;
    win.fetch = function (...args) {
      return Reflect.apply(originalFetch, this, args).then(async response => {
        if (!settings.enabled || !response) return response;
        const input = args[0];
        const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
        if (!rawUrl) return response;
        let url;
        try {
          url = new URL(rawUrl, win.location.href);
          if (url.origin !== win.location.origin) return response;
        } catch (_) { return response; }

        if (url.pathname === "/nextjs-api/stream/create-evaluation" ||
            url.pathname.startsWith("/nextjs-api/stream/post-to-evaluation/")) {
          try {
            // Inspect model IDs only; never retain the prompt or other request fields.
            const request = JSON.parse(args[1]?.body || "null");
            const model = candidateNames.get(request?.modelAId) || candidateNames.get(request?.modelBId);
            if (model) diagnostics.lastHistoricalRequest = { model, status: response.status };
          } catch (_) { /* Other request shape. */ }
        }
        if (!response.ok || response.status === 204 || response.status === 205) return response;

        try {
          const length = Number(response.headers.get("content-length"));
          if (Number.isFinite(length) && length > 4_000_000) return response;
          if (url.pathname === "/nextjs-api/model-catalog") {
            const catalog = await response.clone().json();
            if (!Array.isArray(catalog)) return response;
            diagnostics.liveOpusInPage = catalog.some(section => Array.isArray(section?.models) &&
              section.models.some(model => /opus/i.test(model?.publicName || model?.name || "")));
            const original = JSON.stringify(catalog);
            mergeCatalog(catalog, settings, records);
            const changed = JSON.stringify(catalog);
            diagnostics.catalogRequests += 1;
            return changed === original ? response : responseWithBody(response, changed, "application/json; charset=utf-8");
          }

          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("text/x-component") && !url.searchParams.has("_rsc")) return response;
          const original = await response.clone().text();
          const changed = rewriteFlightPayload(original, settings, records);
          return changed === original ? response : responseWithBody(response, changed);
        } catch (_) { return response; }
      });
    };
    return diagnostics;
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { normalizeSettings, readSettings, selectedArchive, rewriteFlightPayload, mergeCatalog, supportsArena, rewriteQueueEntry, install };
  } else {
    const archive = globalThis.__arenaModelUnlockerArchive;
    try { delete globalThis.__arenaModelUnlockerArchive; } catch (_) { /* Continue. */ }
    try { install(window, archive); } catch (_) { /* Never stop Arena from loading. */ }
  }
})();
