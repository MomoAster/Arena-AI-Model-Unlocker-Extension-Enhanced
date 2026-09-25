(() => {
  "use strict";
  const KEYS = ["enabled", "restoreOpus", "showHidden", "includeArchive"];
  const DEFAULTS = { enabled: true, restoreOpus: true, showHidden: true, includeArchive: false };
  const inputs = Object.fromEntries(KEYS.map(key => [key, document.getElementById(key)]));
  const site = document.getElementById("site");
  const status = document.getElementById("status");
  const apply = document.getElementById("apply");
  let tabId;

  function supported(hostname) {
    return ["arena.ai", "canaryarena.ai"].some(domain =>
      hostname === domain || hostname.endsWith("." + domain));
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function getValues() {
    return Object.fromEntries(KEYS.map(key => [key, inputs[key].checked]));
  }

  async function runInPage(func, args = []) {
    const results = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
    if (!results.length || !results[0].result) throw new Error("无法读取 Arena 页面");
    return results[0].result;
  }

  async function initialize() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error("请先打开 Arena 页面");
    const url = new URL(tab.url);
    if (url.protocol !== "https:" || !supported(url.hostname)) throw new Error("请先打开 arena.ai 或 canaryarena.ai");
    tabId = tab.id;
    site.textContent = url.hostname;
    const page = await runInPage(() => ({
      settings: localStorage.getItem("arena-model-unlocker-enhanced:v1"),
      diagnostics: window.__arenaModelUnlockerEnhanced || null
    }));
    let saved;
    try { saved = JSON.parse(page.settings); } catch (_) { saved = null; }
    for (const key of KEYS) inputs[key].checked = typeof saved?.[key] === "boolean" ? saved[key] : DEFAULTS[key];
    if (page.diagnostics) {
      setStatus(`已加载 ${page.diagnostics.archivedCandidates} 条历史候选记录`);
    } else {
      setStatus("插件将在刷新页面后运行");
    }
    for (const input of Object.values(inputs)) input.addEventListener("change", () => { apply.disabled = false; });
  }

  apply.addEventListener("click", async () => {
    apply.disabled = true;
    setStatus("正在保存…");
    try {
      const values = getValues();
      await runInPage(next => {
        localStorage.setItem("arena-model-unlocker-enhanced:v1", JSON.stringify(next));
        return true;
      }, [values]);
      await chrome.tabs.reload(tabId);
      setStatus("已保存并刷新页面");
    } catch (error) {
      apply.disabled = false;
      setStatus(error.message || "保存失败", true);
    }
  });

  initialize().catch(error => {
    site.textContent = "当前页面不受支持";
    setStatus(error.message || "无法连接页面", true);
    for (const input of Object.values(inputs)) input.disabled = true;
  });
})();