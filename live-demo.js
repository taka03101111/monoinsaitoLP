"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const frame = $("#liveDemoFrame"), workspace = $("#liveDemoWorkspace"), intro = $("#liveDemoIntro");
  let started = false, ready = false, opening = null, timeout, latestState = null;
  const origin = window.location.origin;
  const send = type => frame.contentWindow?.postMessage({ type }, origin);
  const moveToWorkspace = () => workspace.scrollIntoView({ behavior: "auto", block: "start" });
  function updateResumeAction() {
    intro.classList.add("has-active-demo");
    $("#demoResumeBadge").hidden = false;
    $("#demoResumeBadge").textContent = latestState?.processing ? "AI解析を続けています" : "前回開いたデモに戻れます";
    $("#demoActionLabel").textContent = latestState?.processing ? "解析の進み具合を確認する" : "作成・編集の続きを開く";
    $("#demoActionHint").textContent = "このページを開いている間、入力・編集内容は保持されます。";
  }
  function showError() {
    $("#liveDemoLoading").hidden = true;
    $("#liveDemoError").hidden = false;
    $("#liveDemoState").textContent = "接続を確認してください";
  }
  function load(entry) {
    ready = false;
    $("#liveDemoError").hidden = true;
    $("#liveDemoLoading").hidden = false;
    frame.hidden = true;
    $("#liveDemoState").textContent = "起動しています…";
    clearTimeout(timeout);
    if (!["http:", "https:"].includes(location.protocol)) { showError(); return; }
    frame.src = `/demo/?embed=1&entry=${entry}`;
    started = true;
    timeout = setTimeout(() => { if (!ready) showError(); }, 20000);
  }
  function open(entry, button) {
    opening = button;
    intro.hidden = true;
    workspace.hidden = false;
    document.body.classList.add("live-demo-active");
    $("#openLiveDemo").setAttribute("aria-expanded", "true");
    moveToWorkspace();
    // Keep the very same iframe mounted: reopening must not discard a draft,
    // reset an upload, or start a second AI request.
    if (!started) load(entry);
    else if (ready) { send("mono:resume"); frame.focus(); }
  }
  $("#openLiveDemo").addEventListener("click", event => open("new", event.currentTarget));
  $("#openLiveSample").addEventListener("click", event => open("sample", event.currentTarget));
  $("#closeLiveDemo").addEventListener("click", () => {
    send("mono:pause-preview");
    workspace.hidden = true;
    document.body.classList.remove("live-demo-active");
    intro.hidden = false;
    $("#openLiveDemo").setAttribute("aria-expanded", "false");
    updateResumeAction();
    $("#openLiveSample").hidden = true;
    $(".live-demo-small").textContent = latestState?.processing ? "解析を続けています。ページを閉じずにお待ちください。" : "入力・編集内容はデモ画面に保持されています。";
    (opening?.hidden ? $("#openLiveDemo") : opening || $("#openLiveDemo")).focus({ preventScroll: true });
    intro.scrollIntoView({ behavior: "auto", block: "center" });
  });
  $("#retryLiveDemo").addEventListener("click", () => load("library"));
  window.addEventListener("message", event => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || !["mono:ready", "mono:state"].includes(message.type)) return;
    if (message.type === "mono:ready") {
      ready = true; clearTimeout(timeout);
      frame.hidden = false;
      $("#liveDemoLoading").hidden = $("#liveDemoError").hidden = true;
      if (!workspace.hidden) frame.focus();
    }
    latestState = message;
    if (workspace.hidden && started) updateResumeAction();
    $("#demoNextAction").hidden = !message.resultReady;
    $("#liveDemoState").textContent = message.processing ? "AI解析中" : message.dirty ? "編集中・未保存" : "操作できます";
    if (workspace.hidden && message.processing) $(".live-demo-small").textContent = "解析を続けています。ページを閉じずにお待ちください。";
    else if (workspace.hidden) $(".live-demo-small").textContent = "デモの続きを開けます。編集後は「変更を保存」を押してください。";
  });
  window.addEventListener("beforeunload", event => {
    if (latestState?.dirty || latestState?.processing) { event.preventDefault(); event.returnValue = ""; }
  });
})();
