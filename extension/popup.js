(() => {
  "use strict";
  const KEYS = ["enabled", "restoreOpus", "showHidden", "includeArchive"];
  const DEFAULTS = { enabled: true, restoreOpus: true, showHidden: true, includeArchive: false };
  const inputs = Object.fromEntries(KEYS.map(key => [key, document.getElementById(key)]));
  const site = document.getElementById("site");
  const status = document.getElementById("status");
  const apply = document.getElementById("apply");
  const refresh = document.getElementById("refresh");
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
    if (page.diagnostics?.flightChunksChanged > 0 || page.diagnostics?.catalogRequests > 0) {
      if (page.diagnostics.liveOpusInPage === false) {
        setStatus(`已加入历史候选；Arena 本页原始目录没有 Opus，生成可能失败。`);
      } else {
        setStatus(`已处理模型数据；历史候选 ${page.diagnostics.archivedCandidates} 条。`);
      }
    } else {
      setStatus("本页尚未处理模型数据。请先刷新 Arena。", true);
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

  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    try {
      await chrome.tabs.reload(tabId);
      setStatus("页面已刷新，请重新打开模型选择器");
    } catch (error) {
      setStatus(error.message || "刷新失败", true);
    } finally {
      refresh.disabled = false;
    }
  });

  initialize().catch(error => {
    site.textContent = "当前页面不受支持";
    setStatus(error.message || "无法连接页面", true);
    for (const input of Object.values(inputs)) input.disabled = true;
    refresh.disabled = true;
  });
})();
