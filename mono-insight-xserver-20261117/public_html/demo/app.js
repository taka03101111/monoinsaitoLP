(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sections = { form: $("#formSection"), processing: $("#processingSection"), result: $("#resultSection"), used: $("#usedSection") };
  const form = $("#demoForm");
  const mediaInput = $("#mediaFile");
  const pdfInput = $("#standardPdf");
  const toast = $("#toast");
  const inputInfo = { location: "", line: "", process: "" };
  let result = null;
  let savedResult = null;
  let savedSource = {};
  let currentView = "home";
  let editorOrigin = "library";
  let draftResult = null;
  let sourceUrl = "";
  let sourceKind = "video";
  let toastTimer;
  let captionTimer;
  let previewCues = [];
  let videoEditor;
  let trialState = { canAnalyze: false, consumed: false, busy: false, message: "利用状況を確認しています…" };
  let serviceReady = false;
  function updateTrialControls() {
    const blocked = !trialState.canAnalyze || currentView === "processing";
    $$("[data-new-manual], #newManualButton, #emptyCreateButton").forEach(button => {
      button.disabled = blocked;
      button.title = trialState.message;
    });
    $("#submitButton").disabled = blocked || !serviceReady;
    $("#trialStatus").textContent = trialState.message;
    $("#trialStatus").classList.toggle("trial-used", trialState.consumed);
  }
  const embedded = document.documentElement.classList.contains("embedded-demo");
  const entry = new URLSearchParams(location.search).get("entry");
  let embedInitialized = false, lastEmbedState = "", formChanged = false;
  function notifyEmbed(type = "mono:state") {
    if (!embedded || !embedInitialized) return;
    const state = {
      type,
      processing: currentView === "processing",
      resultReady: currentView === "result" && Boolean(result),
      dirty: formChanged || Boolean(videoEditor?.isDirty() && savedResult && $("#sampleBanner").hidden)
    };
    const serialized = JSON.stringify(state);
    if (type === "mono:ready" || lastEmbedState !== serialized) {
      window.parent.postMessage(state, window.location.origin);
      lastEmbedState = serialized;
    }
  }

  const iconPaths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    book: '<path d="M12 5v16M12 5C9 2 5 3 2 3v16c4-1 7-1 10 2 3-3 6-3 10-2V3c-3 0-7-1-10 2Z"/>',
    learn: '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v7c4 3 8 3 12 0v-7m4-2v8"/>',
    file: '<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 12h8M8 16h8M8 8h2"/>',
    idea: '<path d="M9 21h6m-6-4h6M8 13a7 7 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z"/>',
    activity: '<path d="M2 12h5l3-9 4 18 3-9h5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m4-13 4 4-4 4"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/>',
    folder: '<path d="M3 5h6l2 3h10v12H3V5Z"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'
  };
  $$('[data-icon]').forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[el.dataset.icon] || ''}</svg>`;
  });
  const pageNames = { home: "ホーム", library: "教育マニュアル", learning: "学習", standards: "作業標準書", kaizen: "カイゼン", availability: "可動率", settings: "接続設定" };

  function closeSidebar() {
    document.body.classList.remove("sidebar-expanded");
    $("#sidebarScrim").hidden = true;
    $("#sidebarToggle").setAttribute("aria-expanded", "false");
    $("#sidebarToggle").setAttribute("aria-label", "メニューを展開");
  }

  function updateModuleSummaries() {
    $("#homeManualCount").textContent = savedResult ? "1" : "0";
    $("#standardCount").textContent = savedResult ? "1" : "0";
    $("#homeSavedSummary").hidden = !savedResult;
    $("#homeSavedTitle").textContent = savedResult?.title || "";
    $("#savedStandardTitle").textContent = savedResult?.title || "";
    const meta = savedSource.input || {};
    $("#savedStandardMeta").textContent = [meta.location, meta.line, meta.process].filter(Boolean).join(" ／ ") || "このPCで生成した作業標準書";
    const query = $("#standardSearch").value.trim().toLowerCase();
    const matches = savedResult && [savedResult.title, meta.location, meta.line, meta.process].filter(Boolean).join(" ").toLowerCase().includes(query);
    $("#savedStandardCard").hidden = !matches;
    $("#standardEmpty").hidden = Boolean(matches);
    $("#standardEmptyText").textContent = savedResult ? "検索条件に一致する作業標準書がありません。" : "まだ作業標準書がありません。動画・音声からマニュアルを作成すると、ここに表示されます。";
    $("#standardEmpty [data-new-manual]").hidden = Boolean(savedResult);
  }

  function updateVideoStep() {
    const video = $("#sourceMedia video");
    const heading = $("#videoStepHeading");
    if (!video || !heading) return;
    const caption = $("#videoCaption");
    if (caption) {
      const cue = previewCues.find(cue => video.currentTime >= cue.start && video.currentTime < cue.end);
      const text = cue?.text || "";
      if (caption.textContent !== text) caption.textContent = text;
      if (caption.hidden !== !cue) caption.hidden = !cue;
    }
    const steps = result?.steps || [];
    let active = -1;
    steps.forEach((step, index) => {
      if (Number.isFinite(step.atSec) && step.atSec <= video.currentTime && (active < 0 || step.atSec >= steps[active].atSec)) active = index;
    });
    if (heading.hidden !== (active < 0)) heading.hidden = active < 0;
    if (active >= 0) {
      const number = $(".video-step-number", heading), title = $(".video-step-title", heading);
      const titleText = $(`#stepList [data-field='title'][data-index='${active}']`)?.value || steps[active].title;
      if (number.textContent !== `手順${active + 1}`) number.textContent = `手順${active + 1}`;
      if (title.textContent !== titleText) title.textContent = titleText;
    }
    $$("#stepList .step-card").forEach(card => {
      const playing = Number(card.dataset.index) === active;
      if (card.classList.contains("is-playing") !== playing) card.classList.toggle("is-playing", playing);
    });
  }

  function syncVideoCaptions() {
    updateVideoStep();
    const video = $("#sourceMedia video");
    if (!video || !result) return;
    const track = video.textTracks[0] || video.addTextTrack("captions", "編集した字幕", "ja");
    // Draw captions in the application so browser caption preferences cannot
    // add the unwanted black background or outline.
    track.mode = "hidden";
    previewCues = [];
    for (const cue of [...(track.cues || [])]) track.removeCue(cue);
    const steps = collectResult()?.steps || [];
    const duration = Number.isFinite(video.duration) ? video.duration : 90;
    const timed = steps.filter(step => Number.isFinite(step.atSec)).sort((a, b) => a.atSec - b.atSec);
    timed.forEach((step, index) => {
      const limit = Math.min(duration, timed[index + 1]?.atSec ?? duration);
      const subtitles = (step.subtitles || []).filter(sub => sub.text.trim()).sort((a, b) => a.atRel - b.atRel);
      subtitles.forEach((sub, subIndex) => {
        const start = step.atSec + Math.max(0, sub.atRel);
        const next = subtitles[subIndex + 1];
        // Leave a small boundary gap so a seek to the next step does not show
        // the previous and next captions on the same decoded video frame.
        const end = Math.min(limit, next ? step.atSec + next.atRel : duration, Number.isFinite(sub.endRel) ? step.atSec + sub.endRel : start + 6);
        if (end > start) {
          track.addCue(new VTTCue(start, end, escapeHtml(sub.text)));
          previewCues.push({ start, end, text: sub.text });
        }
      });
    });
    updateVideoStep();
  }

  function showMediaError() {
    const media = $("#sourceMedia video, #sourceMedia audio");
    if (!media) return;
    let message = $("#mediaError");
    if (!message) {
      message = document.createElement("p"); message.id = "mediaError";
      message.className = "media-error"; message.setAttribute("role", "alert");
      $("#sourceMedia").after(message);
    }
    message.textContent = media.error?.code === 3 || media.error?.code === 4
      ? "この動画をブラウザーで再生できません。H.264形式のMP4へ変換してお試しください。"
      : "動画・音声を読み込めませんでした。ページを再読み込みしてください。";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function showToast(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle("is-error", error);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5200);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    let data = {};
    try { data = await response.json(); } catch { /* response may not contain JSON */ }
    if (!response.ok) throw new Error(data.error || `通信に失敗しました（${response.status}）`);
    return data;
  }

  function showView(view) {
    if (currentView === "result" && view !== "result") {
      if (videoEditor && !videoEditor.flushPendingTimes()) return;
      if ($("#sampleBanner").hidden && savedResult) draftResult = collectResult();
      $("#sourceMedia video, #sourceMedia audio")?.pause();
    }
    currentView = view;
    document.body.classList.toggle("dialog-open", view === "form");
    $$(".app-header, .app-sidebar, #librarySection, .module-section, .app-notice, .skip-link").forEach(el => { el.inert = view === "form"; });
    $$(".module-section").forEach(el => { el.hidden = el.id !== `${view}Section`; });
    $("#librarySection").hidden = !["library", "form"].includes(view);
    $("#connectionPanel").hidden = view !== "settings";
    $("#backToLibrary").hidden = !["result", "settings"].includes(view);
    const page = view === "result" ? editorOrigin : ["form", "processing", "used"].includes(view) ? "library" : view;
    $("#pageBreadcrumb").textContent = pageNames[page] || "教育マニュアル";
    $$(".side-nav").forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    $$("[data-page], [data-new-manual], #settingsNav").forEach(button => { button.disabled = view === "processing"; });
    $("#backToLibrary").textContent = editorOrigin === "standards" && view === "result" ? "‹ 作業標準書一覧に戻る" : "‹ 教育マニュアル一覧に戻る";
    closeSidebar();
    updateModuleSummaries();
    if (view === "form") setTimeout(() => form.elements.title.focus(), 0);
    sections.form.hidden = view !== "form";
    sections.processing.hidden = view !== "processing";
    sections.result.hidden = view !== "result";
    sections.used.hidden = view !== "used";
    if (view === "result") requestAnimationFrame(fitDocumentTextareas);
    const active = view === "form" || view === "used" ? "input" : view;
    $$("[data-nav-step]").forEach((el, index) => {
      const name = el.dataset.navStep;
      const currentIndex = ["input", "processing", "result"].indexOf(active);
      const stepIndex = ["input", "processing", "result"].indexOf(name);
      el.classList.toggle("is-current", name === active);
      el.classList.toggle("is-complete", stepIndex < currentIndex);
    });
    if (view !== "processing") $("#notice").hidden = true;
    updateTrialControls();
    window.scrollTo({ top: 0, behavior: "smooth" });
    notifyEmbed();
  }

  function bytes(size) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileDuration(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const element = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
      element.preload = "metadata";
      element.onloadedmetadata = () => { const seconds = element.duration; URL.revokeObjectURL(url); resolve(Number.isFinite(seconds) ? seconds : null); };
      element.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      element.src = url;
    });
  }

  mediaInput.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    if (!file) { $("#mediaPreview").hidden = true; return; }
    if (file.size > 500 * 1024 * 1024) {
      mediaInput.value = "";
      showToast("ファイルは500MB以下にしてください。", true);
      return;
    }
    $("#mediaFileName").textContent = file.name;
    const preview = $("#mediaPreview");
    preview.innerHTML = `<span><b>${escapeHtml(file.name)}</b>　${bytes(file.size)}　<span class="file-duration">再生時間を確認中…</span></span><button type="button" id="removeMedia">削除</button>`;
    preview.hidden = false;
    const duration = await fileDuration(file);
    const durationLabel = $(".file-duration", preview);
    if (durationLabel) durationLabel.textContent = duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "時間はサーバー側で確認します";
    if (duration && duration > 90) showToast("動画・音声は最長90秒のファイルを選んでください。", true);
  });

  $("#mediaPreview").addEventListener("click", event => {
    if (event.target.closest("#removeMedia")) {
      mediaInput.value = "";
      $("#mediaFileName").textContent = "動画・音声ファイルをここにドロップ";
      $("#mediaPreview").hidden = true;
    }
  });

  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024 || (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf"))) {
      pdfInput.value = "";
      showToast("参考資料は20MB以下のPDFを選んでください。", true);
      return;
    }
    $("#pdfFileName").innerHTML = `<strong>${escapeHtml(file.name)}</strong><small>${bytes(file.size)}</small>`;
  });

  const drop = $("#mediaDrop");
  ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", event => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    const transfer = new DataTransfer();
    transfer.items.add(files[0]);
    mediaInput.files = transfer.files;
    mediaInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  drop.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); mediaInput.click(); }
  });

  function setProcessingStage(stage, message) {
    const names = ["upload", "analyze", "create"];
    const current = names.indexOf(stage);
    $$("[data-stage]").forEach(el => {
      const index = names.indexOf(el.dataset.stage);
      el.classList.toggle("is-active", index === current);
      el.classList.toggle("is-done", index >= 0 && index < current);
    });
    $("#processingMessage").textContent = message;
    const bar = $("#processingTrack");
    if (stage === "upload") bar.style.width = "24%";
    if (stage === "analyze") bar.style.width = "62%";
    if (stage === "create") bar.style.width = "86%";
  }

  function uploadFile(uploadPolicy, file, progressLabel) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadPolicy.url);
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        $("#processingMessage").textContent = `${progressLabel}をアップロードしています… ${pct}%`;
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("ファイルのアップロードに失敗しました。通信環境をご確認ください。"));
      xhr.onerror = () => reject(new Error("アップロードに失敗しました。通信環境をご確認ください。"));
      xhr.onabort = () => reject(new Error("アップロードが中断されました。"));
      const body = new FormData();
      Object.entries(uploadPolicy.fields || {}).forEach(([name, value]) => body.append(name, value));
      body.append("file", file, file.name);
      xhr.send(body);
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!trialState.canAnalyze || currentView === "processing") { showToast(trialState.message, true); return; }
    const media = mediaInput.files?.[0];
    const pdf = pdfInput.files?.[0];
    if (!media) { showToast("動画・音声ファイルを選んでください。", true); mediaInput.focus(); return; }
    if (!$("#consent").checked) { showToast("素材の確認欄にチェックを入れてください。", true); $("#consent").focus(); return; }
    if (pdf && pdf.size > 20 * 1024 * 1024) { showToast("参考資料は20MB以下のPDFを選んでください。", true); return; }
    const duration = await fileDuration(media);
    if (duration && duration > 90) { showToast("動画・音声は最長90秒のファイルを選んでください。", true); return; }
    if (currentView === "processing" || !trialState.canAnalyze) return;
    $("#submitButton").disabled = true;
    showView("processing");
    setProcessingStage("upload", "アップロード先を準備しています…");
    try {
      const fields = new FormData(form);
      const payload = {
        title: fields.get("title"), location: fields.get("location"), line: fields.get("line"), process: fields.get("process"), overview: fields.get("overview"),
        media: { name: media.name, type: media.type, size: media.size },
        standardPdf: pdf ? { name: pdf.name, type: "application/pdf", size: pdf.size } : undefined
      };
      const signed = await api("/api/demo/upload-url", { method: "POST", body: JSON.stringify(payload) });
      setProcessingStage("upload", "動画・音声をアップロードしています…");
      await uploadFile(signed.mediaUpload, media, "素材");
      if (pdf && signed.pdfUpload) await uploadFile(signed.pdfUpload, pdf, "参考資料");
      setProcessingStage("analyze", "映像・音声を解析し、作業の流れを整理しています…");
      const response = await api("/api/demo/process", { method: "POST", body: JSON.stringify({ jobId: signed.jobId }) });
      setProcessingStage("create", "動画マニュアルと作業標準書を仕上げています…");
      await new Promise(resolve => setTimeout(resolve, 450));
      sourceUrl = response.sourceUrl || "";
      sourceKind = response.sourceKind || signed.kind;
      inputInfo.location = String(response.input?.location ?? payload.location ?? "");
      inputInfo.line = String(response.input?.line ?? payload.line ?? "");
      inputInfo.process = String(response.input?.process ?? payload.process ?? "");
      rememberResult(response.result);
      renderResult(response.result);
      editorOrigin = "library";
      selectDocument("manual");
      showView("result");
    } catch (error) {
      try {
        const status = await api("/api/demo/status", { method: "GET", headers: {} });
        configureLocal(status);
      } catch { trialState.canAnalyze = false; trialState.message = "利用状況を確認できません。ページを再読み込みしてください。"; }
      showView(trialState.consumed ? "used" : "form");
      showToast(error.message || "処理に失敗しました。", true);
    } finally {
      updateTrialControls();
    }
  });

  function confidenceText(value) {
    return ({ high: "AI確度の目安：高", medium: "AI確度の目安：中", low: "AI確度の目安：要確認" })[value] || "AIによる下書き";
  }

  function renderTags() {
    const tag = (id, value) => { const el = $(id); el.textContent = value || ""; el.hidden = !value; };
    tag("#locationTag", inputInfo.location);
    tag("#lineTag", inputInfo.line);
    tag("#processTag", inputInfo.process);
    tag("#standardLocation", inputInfo.location);
    tag("#standardLine", inputInfo.line);
    tag("#standardProcess", inputInfo.process);
  }

  function fitDocumentTextareas() {
    $$("#resultSection textarea").forEach(el => {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 30)}px`;
    });
  }

  const typeLabels = {
    value_adding: "付加価値作業", auxiliary: "補助作業", wasteful_long_reach: "ムダ：手伸ばし", wasteful_hand_wait: "ムダ：手待ち", wasteful_empty_walk: "ムダ：空歩行"
  };

  function renderResult(nextResult, preserveMedia = false) {
    result = JSON.parse(JSON.stringify(nextResult));
    result.steps.forEach((step, index) => { if (!Number.isFinite(step.atSec)) step.atSec = index * 6; });
    $("#resultTitle").value = result.title || "作業マニュアル";
    $("#standardTitle").textContent = result.title || "作業マニュアル";
    $("#confidenceLabel").textContent = confidenceText(result.confidence);
    $("#stepCount").textContent = `${result.steps.length} STEPS`;
    renderTags();
    const transcript = String(result.transcript || "").trim();
    $("#transcriptBox").hidden = !transcript;
    $("#transcriptText").textContent = transcript || "音声認識テキストはありません。";
    $("#sourceKindLabel").textContent = sourceKind === "audio" ? "音声" : "動画";
    const source = $("#sourceMedia");
    if (!preserveMedia) {
    $("#mediaError")?.remove();
    source.innerHTML = "";
    if (sourceUrl) {
      const mediaEl = document.createElement(sourceKind === "audio" ? "audio" : "video");
      mediaEl.controls = true;
      mediaEl.preload = "metadata";
      mediaEl.src = sourceUrl;
      mediaEl.addEventListener("error", refreshMediaUrl, { once: true });
      mediaEl.addEventListener("loadedmetadata", () => { $("#mediaError")?.remove(); syncVideoCaptions(); });
      mediaEl.addEventListener("timeupdate", updateVideoStep);
      mediaEl.addEventListener("seeked", updateVideoStep);
      source.append(mediaEl);
      if (sourceKind === "video") {
        const heading = document.createElement("div");
        heading.id = "videoStepHeading";
        heading.className = "video-step-heading";
        heading.hidden = true;
        heading.innerHTML = '<span class="video-step-number"></span><span class="video-step-title"></span>';
        source.append(heading);
        const caption = document.createElement("div");
        caption.id = "videoCaption";
        caption.className = "video-caption";
        caption.hidden = true;
        source.append(caption);
      }
    } else {
      source.innerHTML = '<div class="media-unavailable">素材の再生リンクを取得できませんでした</div>';
    }
    }
    $("#stepList").innerHTML = result.steps.map((step, index) => {
      const time = Number.isFinite(step.atSec) ? `<button class="step-time" type="button" data-jump="${Number(step.atSec)}" aria-label="${Number(step.atSec)}秒へ移動">▶ ${Number(step.atSec).toFixed(1)}s</button>` : "";
      const subs = (step.subtitles || []).map((sub, subIndex) => `<div class="subtitle-row"><span class="subtitle-at">${Number(sub.atRel || 0).toFixed(1)}s</span><input class="subtitle-input" data-field="subtitle" data-index="${index}" data-sub-index="${subIndex}" maxlength="120" value="${escapeHtml(sub.text)}" aria-label="手順${index + 1}の字幕"></div>`).join("");
      const type = step.stepType && typeLabels[step.stepType] ? `<span class="step-type">${typeLabels[step.stepType]}</span>` : "";
      return `<article class="step-card" data-index="${index}"><div class="step-number">${String(index + 1).padStart(2, "0")}<small>STEP</small></div><div class="step-body"><div class="step-title-row"><input class="step-title" data-field="title" data-index="${index}" maxlength="120" value="${escapeHtml(step.title)}" aria-label="手順${index + 1}の見出し">${time}</div><textarea class="step-text" data-field="note" data-index="${index}" maxlength="800" rows="2" aria-label="手順${index + 1}の説明">${escapeHtml(step.note || "")}</textarea>${subs ? `<div class="subtitle-list">${subs}</div>` : ""}${type}</div></article>`;
    }).join("");
    $("#standardStepList").innerHTML = result.steps.map((step, index) => `<article class="standard-card" data-index="${index}"><div class="standard-card-heading"><span class="standard-step-no">${String(index + 1).padStart(2, "0")}</span><span class="standard-step-heading">${escapeHtml(step.title)}</span></div><div class="standard-field"><label>品質の急所</label><textarea data-field="quality" data-index="${index}" maxlength="600" rows="2" aria-label="手順${index + 1}の品質の急所">${escapeHtml(step.quality || "要確認")}</textarea></div><div class="standard-field"><label>安全の急所</label><textarea data-field="safety" data-index="${index}" maxlength="600" rows="2" aria-label="手順${index + 1}の安全の急所">${escapeHtml(step.safety || "要確認")}</textarea></div><div class="standard-field"><label>作業のポイント</label><textarea data-field="workPoint" data-index="${index}" maxlength="600" rows="2" aria-label="手順${index + 1}の作業ポイント">${escapeHtml(step.workPoint || "要確認")}</textarea></div></article>`).join("");
    fitDocumentTextareas();
    if (sourceKind === "video") syncVideoCaptions();
    if (!preserveMedia) videoEditor?.load();
  }

  async function refreshMediaUrl() {
    try {
      const refreshed = await api("/api/demo/media-url", { method: "GET", headers: {} });
      sourceUrl = refreshed.sourceUrl;
      const mediaEl = $("#sourceMedia video, #sourceMedia audio");
      if (mediaEl) { mediaEl.addEventListener("error", showMediaError, { once: true }); mediaEl.src = sourceUrl; mediaEl.load(); }
    } catch { showMediaError(); }
  }

  function collectResult() {
    if (!result) return null;
    const updated = JSON.parse(JSON.stringify(result));
    updated.title = $("#resultTitle").value.trim() || "作業マニュアル";
    $$("#stepList [data-field]").forEach(el => {
      const step = updated.steps[Number(el.dataset.index)];
      if (!step) return;
      if (el.dataset.field === "subtitle") {
        const sub = step.subtitles?.[Number(el.dataset.subIndex)];
        if (sub) sub.text = el.value;
      } else step[el.dataset.field] = el.value;
    });
    $$("#standardStepList [data-field]").forEach(el => {
      const step = updated.steps[Number(el.dataset.index)];
      if (step) step[el.dataset.field] = el.value;
    });
    return updated;
  }

  $("#resultTitle").addEventListener("input", event => {
    $("#standardTitle").textContent = event.target.value || "作業マニュアル";
  });
  $("#stepList").addEventListener("input", event => {
    clearTimeout(captionTimer);
    captionTimer = setTimeout(syncVideoCaptions, 150);
    if (event.target.matches("textarea")) fitDocumentTextareas();
    if (event.target.matches("[data-field='title']")) {
      const index = Number(event.target.closest("[data-index]")?.dataset.index);
      const heading = $(`#standardStepList .standard-card[data-index='${index}'] .standard-step-heading`);
      if (heading) heading.textContent = event.target.value;
    }
  });
  $("#standardStepList").addEventListener("input", fitDocumentTextareas);

  $("#saveButton").addEventListener("click", async () => {
    if (videoEditor && !videoEditor.flushPendingTimes()) return;
    const updated = collectResult();
    if (!updated) return;
    const button = $("#saveButton");
    button.disabled = true;
    try {
      await api("/api/demo/result", { method: "PUT", body: JSON.stringify({ result: updated }) });
      result = updated;
      rememberResult(updated);
      $("#standardTitle").textContent = updated.title;
      $$("#standardStepList .standard-card-heading .standard-step-heading").forEach((el, index) => { el.textContent = updated.steps[index]?.title || ""; });
      showToast("編集内容を保存しました。");
      videoEditor?.saved();
      notifyEmbed();
    } catch (error) { showToast(error.message || "保存に失敗しました。", true); }
    finally { button.disabled = false; }
  });

  $("#printButton").addEventListener("click", () => {
    if (videoEditor && !videoEditor.flushPendingTimes()) return;
    const updated = collectResult();
    if (updated) {
      result = updated;
      $("#standardTitle").textContent = updated.title;
      $$("#standardStepList .standard-card-heading .standard-step-heading").forEach((el, index) => { el.textContent = updated.steps[index]?.title || ""; });
    }
    fitDocumentTextareas();
    window.print();
  });

  $("#stepList").addEventListener("click", event => {
    const button = event.target.closest("[data-jump]");
    if (!button) return;
    const mediaEl = $("#sourceMedia video, #sourceMedia audio");
    if (!mediaEl || sourceKind === "audio") return;
    mediaEl.currentTime = Number(button.dataset.jump);
    mediaEl.play().catch(() => undefined);
  });

  async function resumeProcessing() {
    showView("processing");
    setProcessingStage("analyze", "AIが映像・音声を解析しています…");
    for (let count = 0; count < 96; count++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        const status = await api("/api/demo/status", { method: "GET", headers: {} });
        configureLocal(status);
        if (status.used && status.result) {
          sourceUrl = status.sourceUrl || "";
          sourceKind = status.sourceKind || "video";
          inputInfo.location = String(status.input?.location || "");
          inputInfo.line = String(status.input?.line || "");
          inputInfo.process = String(status.input?.process || "");
          rememberResult(status.result);
          renderResult(status.result);
          showView("result");
          return;
        }
        if (!status.processing) {
          showView(trialState.consumed ? "used" : "form");
          showToast(status.error || "前回の処理が完了しませんでした。素材を選び直してお試しください。", true);
          return;
        }
      } catch { /* retry status after temporary network errors */ }
    }
    showView("form");
    showToast("処理状況を確認できません。ページを再読み込みしてお試しください。", true);
  }

  $("#showResultButton").addEventListener("click", () => { if (result) showView("result"); });

  const publicSampleOnly = new URLSearchParams(location.search).get('sampleOnly') === '1' || !['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  async function init() {
    if (publicSampleOnly) {
      trialState = {canAnalyze:false, consumed:false, busy:false, message:'サンプル編集を体験できます。自分の動画のAI解析は準備中です。'};
      updateTrialControls();
      $('#settingsNav').hidden = true;
      showView(embedded ? 'library' : 'home');
      return;
    }
    try {
      const status = await api("/api/demo/status", { method: "GET", headers: {} });
      configureLocal(status);
      if (status.used && status.result) {
        sourceUrl = status.sourceUrl || "";
        sourceKind = status.sourceKind || "video";
        inputInfo.location = String(status.input?.location || "");
        inputInfo.line = String(status.input?.line || "");
        inputInfo.process = String(status.input?.process || "");
        rememberResult(status.result);
        renderResult(status.result);
        showView(embedded ? "library" : "home");
      } else if (status.processing) {
        await resumeProcessing();
      } else if (status.used || trialState.consumed) {
        showView("used");
      } else {
        showView(embedded ? "library" : "home");
        if (status.error) {
          $("#notice").textContent = status.error;
          $("#notice").hidden = false;
        }
      }
    } catch {
      showView(embedded ? "library" : "home");
      const notice = $("#notice");
      notice.textContent = "サーバーに接続できません。ページを再読み込みしてください。";
      notice.hidden = false;
    }
  }

  function configureLocal(status) {
    if (status.mode !== "local") return;
    document.body.classList.add("local-mode");
    const checks = status.checks || {};
    serviceReady = ["anthropic", "localMedia", "ffmpeg"].every(key => checks[key] === true);
    trialState = status.limits || { canAnalyze: false, consumed: false, busy: false, message: "新しい利用制限を反映するため、ローカルサーバーを再起動してください。" };
    const labels = { anthropic: "Claude APIキー", localMedia: "PC内の音声認識・マスキング", ffmpeg: "動画変換" };
    $("#connectionChecks").innerHTML = Object.entries(labels).map(([key, label]) => `<span class="connection-check ${checks[key] ? "ready" : "pending"}"><i></i>${label}<b>${checks[key] ? "設定あり" : "未設定"}</b></span>`).join("");
    $("#resetButton").hidden = true;
    updateTrialControls();
    $("#connectionHelp").hidden = Object.values(checks).every(Boolean);
  }
  $("#resetButton").addEventListener("click", () => showToast("デモの利用回数はリセットできません。", true));
  $("#sampleButton").addEventListener("click", () => {
    editorOrigin = "library";
    selectDocument("manual");
    sourceUrl = ""; sourceKind = "video";
    Object.assign(inputInfo, { location: "", line: "", process: "" });
    renderResult({ title: "部品の組み付け作業（表示サンプル）", confidence: "medium", transcript: "これはUI確認用の架空の出力例です。実際のAI解析は行っていません。", steps: [
      { title: "部品と工具を準備する", note: "作業台に必要な部品を並べ、使用する工具を確認する。", subtitles: [{atRel:0,text:"部品と工具の準備"}], quality:"部品の型番と数量を作業指示書で照合する。", safety:"作業台の周囲に障害物がないか確認する。", workPoint:"使用順に部品を配置する。" },
      { title: "部品を所定の位置に合わせる", note: "向きを確認し、固定位置に部品を合わせる。", subtitles: [{atRel:0,text:"部品の向きを確認"}], quality:"取り付け方向と接合部の状態を確認する。", safety:"接合部への指の挟み込みに注意する。", workPoint:"固定する前に位置を確認する。" },
      { title: "固定し、仕上がりを確認する", note: "指定の工具で固定した後、取り付け状態を確認する。", subtitles: [{atRel:0,text:"固定状態を確認"}], quality:"締め付け条件は正式な作業標準書を確認する。", safety:"工具を安定させて作業する。", workPoint:"確認後、完了品を所定の場所へ移す。" }
    ] });
    $("#sourceMedia").innerHTML = '<div class="sample-media"><span>OUTPUT PREVIEW</span><strong>組み付け作業</strong><p>画面確認用の架空サンプル<br>AI解析結果ではありません</p></div>';
    $("#saveButton").disabled = true;
    $("#sampleBanner").hidden = false;
    videoEditor?.load();
    showView("result");
  });
  $("#backToInput").addEventListener("click", () => showView("library"));
  function selectDocument(tab) {
    videoEditor?.setMode(tab === "manual");
    const standard = tab === "standard";
    $("#manualDocument").classList.toggle("tab-hidden", standard);
    $("#standardDocument").classList.toggle("tab-hidden", !standard);
    document.querySelectorAll("[data-document-tab]").forEach(el => { const selected = el.dataset.documentTab === tab; el.classList.toggle("selected", selected); el.setAttribute("aria-selected", String(selected)); });
    fitDocumentTextareas();
  }
  $$("[data-document-tab]").forEach(button => button.addEventListener("click", () => selectDocument(button.dataset.documentTab)));
  function rememberResult(value) {
    savedResult = JSON.parse(JSON.stringify(value));
    draftResult = null;
    savedSource = { sourceUrl, sourceKind, input: { ...inputInfo } };
    $("#savedManualTitle").textContent = value.title;
    $("#savedManualCard").hidden = false;
    updateModuleSummaries();
    trialState = { ...trialState, canAnalyze: false, consumed: true, message: "AI解析は利用済みです。保存したマニュアルの閲覧・編集・PDF保存を続けられます。" };
    updateTrialControls();
  }
  async function startNewManual() {
    if (currentView === "processing") return;
    if (publicSampleOnly) { showToast(trialState.message); return; }
    try { configureLocal(await api("/api/demo/status", { method: "GET", headers: {} })); }
    catch { showToast("利用状況を確認できません。ページを再読み込みしてください。", true); return; }
    if (!trialState.canAnalyze || savedResult) { showToast(trialState.message, true); return; }
    $("#sampleBanner").hidden = true; $("#saveButton").disabled = false;
    showView("form");
  }
  $("#newManualButton").addEventListener("click", startNewManual);
  $("#emptyCreateButton").addEventListener("click", startNewManual);
  $$("[data-new-manual]").forEach(button => button.addEventListener("click", startNewManual));
  $("#closeFormButton").addEventListener("click", () => { showView("library"); $("#newManualButton").focus(); });
  $$("[data-page]").forEach(button => button.addEventListener("click", () => { if (currentView !== "processing") showView(button.dataset.page); }));
  $("#settingsNav").addEventListener("click", () => { if (currentView !== "processing") showView("settings"); });
  $("#backToLibrary").addEventListener("click", () => showView(currentView === "result" ? editorOrigin : "library"));
  $("#guideButton").addEventListener("click", () => { $("#quickGuide").hidden = !$("#quickGuide").hidden; });
  function openSavedResult(tab = "manual") {
    if (!savedResult) return;
    editorOrigin = currentView === "standards" ? "standards" : "library";
    sourceUrl = savedSource.sourceUrl; sourceKind = savedSource.sourceKind;
    Object.assign(inputInfo, savedSource.input);
    $("#sampleBanner").hidden = true;
    renderResult(draftResult || savedResult); $("#saveButton").disabled = false; showView("result");
    if (draftResult) videoEditor?.documentChanged();
    selectDocument(tab);
  }
  $("#savedManualCard").addEventListener("click", () => openSavedResult());
  $$("[data-open-result]").forEach(button => button.addEventListener("click", () => openSavedResult(button.dataset.openResult)));
  $("#standardSearch").addEventListener("input", updateModuleSummaries);
  $("#sidebarToggle").addEventListener("click", () => {
    const expanded = document.body.classList.toggle("sidebar-expanded");
    $("#sidebarScrim").hidden = !expanded;
    $("#sidebarToggle").setAttribute("aria-expanded", String(expanded));
    $("#sidebarToggle").setAttribute("aria-label", expanded ? "メニューを閉じる" : "メニューを展開");
  });
  $("#sidebarScrim").addEventListener("click", closeSidebar);
  $("#helpButton").addEventListener("click", () => $("#helpDialog").showModal());
  ["#closeHelpButton", "#helpDoneButton"].forEach(id => $(id).addEventListener("click", () => $("#helpDialog").close()));
  $("#manualSearch").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase(); let count = 0;
    for (const card of [$("#sampleButton"), $("#savedManualCard")]) {
      card.hidden = (card.id === "savedManualCard" && !savedResult) || !card.textContent.toLowerCase().includes(q);
      if (!card.hidden) count++;
    }
    $("#noSearchResults").hidden = count > 0;
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.body.classList.contains("sidebar-expanded")) {
      closeSidebar();
      $("#sidebarToggle").focus();
    }
    if (currentView !== "form") return;
    if (e.key === "Escape") { showView("library"); $("#newManualButton").focus(); }
    if (e.key === "Tab") {
      const nodes = [...sections.form.querySelectorAll('button:not(:disabled), input:not([type="file"]), textarea, [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  videoEditor = window.createVideoEditor({
    getResult: collectResult,
    commit: value => renderResult(value, true),
    toast: showToast,
    isSample: () => !$("#sampleBanner").hidden,
    syncPreview: syncVideoCaptions,
    updatePreview: updateVideoStep
  });
  $("#resultSection").addEventListener("input", event => {
    if (event.target.closest(".result-document")) videoEditor.documentChanged();
  });
  window.addEventListener("beforeunload", event => {
    if (videoEditor.isDirty() && savedResult && $("#sampleBanner").hidden) { event.preventDefault(); event.returnValue = ""; }
  });
  if (embedded) {
    form.addEventListener("input", () => { formChanged = true; notifyEmbed(); });
    form.addEventListener("change", () => { formChanged = true; notifyEmbed(); });
    window.addEventListener("message", event => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "mono:pause-preview") {
        $$("video, audio").forEach(media => media.pause());
        notifyEmbed();
      } else if (event.data?.type === "mono:resume") notifyEmbed("mono:ready");
    });
    // Covers timeline drags and asynchronous saves as well as text input.
    setInterval(() => {
      if (currentView === "processing" || (savedResult && currentView === "result")) formChanged = false;
      notifyEmbed();
    }, 750);
  }
  // Announce the loaded app before status recovery, which may wait for an
  // existing analysis. This keeps the parent from misreporting a load timeout.
  embedInitialized = embedded;
  notifyEmbed("mono:ready");
  init().then(() => {
    if (!embedded) return;
    // Never replace a saved manual or interrupt a running analysis on entry.
    if (currentView !== "processing" && currentView !== "result") {
      if (entry === "sample") $("#sampleButton").click();
      else if (entry === "new" && !savedResult && currentView === "library") startNewManual();
    }
    embedInitialized = true;
    notifyEmbed("mono:ready");
  });
})();
