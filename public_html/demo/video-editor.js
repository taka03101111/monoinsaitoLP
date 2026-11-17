/* Timeline editor. Times in the inspector are absolute; stored cue times are step-relative. */
window.createVideoEditor = function ({ getResult, commit, toast, isSample, syncPreview, updatePreview }) {
  const $ = selector => document.querySelector(selector);
  const inspector = $("#videoInspector");
  const canvas = $("#timelineCanvas");
  const viewport = $("#timelineScroll");
  const preview = $("#sourceMedia");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const round = n => Math.round(n * 10) / 10;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), n));
  const fmt = n => { const t = Math.round(Math.max(0, n) * 10); return `${Math.floor(t / 600)}:${((t % 600) / 10).toFixed(1).padStart(4, "0")}`; };
  const parseTime = value => {
    const text = value.trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/：/g, ":").replace(/．/g, ".");
    if (/^\d+(?:\.\d)?$/.test(text)) return Number(text);
    const match = /^(\d+):([0-5]?\d(?:\.\d)?)$/.exec(text);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  let selected = 0, clock = 0, dirty = false, media = null, abort = null, drag = null, frame = 0;
  let mode = true;
  let previewData = null;
  let followSuspendedUntil = 0;
  const pendingTimes = new Set();
  const duration = () => media && Number.isFinite(media.duration) && media.duration > 0 ? media.duration : media ? 180 : Math.min(180, Math.max(18, ...(getResult()?.steps || []).map(step => (step.atSec || 0) + Math.max(6, ...(step.subtitles || []).map(sub => sub.endRel ?? sub.atRel + 6)))));
  const stepEnd = (data, i) => Math.min(duration(), data.steps[i + 1]?.atSec ?? duration());
  const currentStep = data => Math.max(0, data.steps.findLastIndex(step => step.atSec <= clock));
  function cueRange(data, i, j, marker = false) {
    const step = data.steps[i], cues = marker ? step.markers || [] : step.subtitles || [], cue = cues[j];
    const start = step.atSec + cue.atRel;
    const next = marker ? Infinity : Math.min(Infinity, ...cues.filter((_, k) => k !== j).map(c => step.atSec + c.atRel).filter(t => t > start));
    return { start, end: Math.min(stepEnd(data, i), next, step.atSec + (cue.endRel ?? cue.atRel + 6)) };
  }
  function markDirty() {
    dirty = true;
    $("#editorSaveState").textContent = isSample() ? "サンプルの変更は保存できません" : "未保存の変更があります";
    $("#editorSaveState").classList.add("unsaved");
  }
  function saved() {
    dirty = false;
    $("#editorSaveState").textContent = isSample() ? "表示サンプル・保存対象外" : "保存済み";
    $("#editorSaveState").classList.remove("unsaved");
  }
  function apply(data, rebuild = true) {
    data.steps.forEach((step, i) => { step.no = i + 1; });
    commit(data);
    markDirty();
    selected = clamp(selected, 0, data.steps.length - 1);
    if (rebuild) renderInspector();
    renderTimeline();
    update();
  }
  function seek(time) {
    clock = clamp(time, 0, duration());
    if (media && Number.isFinite(media.duration)) media.currentTime = clock;
    update();
    followPlayhead(true);
  }
  function choose(index, jump = false) {
    if (!flushPendingTimes()) return;
    const data = getResult();
    if (!data) return;
    selected = clamp(index, 0, data.steps.length - 1);
    if (jump) seek(data.steps[selected].atSec);
    renderInspector(); renderTimeline();
  }
  function timeInput(field, value, label, extras = "") {
    return `<label class="editor-time-field"><span>${label}</span><input type="text" inputmode="text" maxlength="9" spellcheck="false" value="${fmt(value)}" placeholder="0:00.0" data-edit="${field}" ${extras} aria-label="${label}（分:秒）"></label>`;
  }
  function renderInspector() {
    const data = getResult(); if (!data) return;
    const step = data.steps[selected]; if (!step) return;
    const end = stepEnd(data, selected);
    inspector.innerHTML = `<div class="inspector-heading"><strong>手順 ${selected + 1}</strong><span>${fmt(step.atSec)} – ${fmt(end)}</span><button type="button" data-action="delete-step" aria-label="手順を削除" ${data.steps.length === 1 ? "disabled" : ""}>削除</button></div>
      <label class="editor-step-select">編集する手順<select id="editorStepSelect">${data.steps.map((s, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${i + 1}. ${esc(s.title)}</option>`).join("")}</select></label>
      <details class="step-timing-box"><summary>手順${selected + 1}の区切りを調整</summary><div class="editor-time-row">${timeInput("step-start", step.atSec, "手順の開始", selected === 0 ? "disabled" : "")}${timeInput("step-end", end, "手順の終了", selected === data.steps.length - 1 ? "disabled" : "")}</div><div class="editor-time-row"><button type="button" data-action="step-now" ${selected === 0 ? "disabled" : ""}>開始を現在位置にする</button><button type="button" data-action="step-end-now" ${selected === data.steps.length - 1 ? "disabled" : ""}>終了を現在位置にする</button></div><p class="inspector-note">分:秒で入力（例：1:20.0＝1分20秒）。手順の終了は次の手順の開始と連動します。最終手順は動画の終わりまでです。</p></details>
      <label class="editor-field">手順名<textarea data-edit="step-title" maxlength="120" rows="2">${esc(step.title)}</textarea></label>
      <div class="inspector-section-title"><strong>字幕（${step.subtitles.length}）</strong><button type="button" data-action="add-subtitle">＋ 字幕を追加</button></div>
      <p class="inspector-note">各字幕の「ここまで表示」で、消える時刻を指定します。動画全体の時刻です。</p><div class="editor-cues">${step.subtitles.map((cue, j) => { const r = cueRange(data, selected, j); return `<div class="editor-cue" data-cue="${j}"><div class="editor-cue-header"><b>手順${selected + 1}・字幕${j + 1}</b><span data-char-count>${cue.text.length} / 120</span><button type="button" data-action="cue-preview" data-index="${j}" aria-label="字幕${j + 1}の開始へ移動">▶</button><button type="button" data-action="delete-cue" data-index="${j}" aria-label="字幕${j + 1}を削除">削除</button></div><textarea data-edit="cue-text" data-index="${j}" aria-label="字幕${j + 1}の文章" maxlength="120" rows="2">${esc(cue.text)}</textarea><div class="editor-time-row cue-timing-row">${timeInput("cue-start", r.start, "ここから表示", `data-index="${j}"`)}${timeInput("cue-end", r.end, "ここまで表示", `data-index="${j}"`)}</div><p class="cue-duration">${fmt(r.start)} 〜 ${fmt(r.end)} ／ ${round(Math.max(0, r.end - r.start))}秒間</p><div class="cue-time-actions"><button type="button" data-action="cue-end-now" data-index="${j}">終了を現在位置にする</button><button type="button" data-action="apply-cue-time" data-index="${j}">表示時間を反映</button></div><p class="cue-time-error" role="alert" hidden></p></div>`; }).join("") || '<p class="inspector-note">字幕がありません。「字幕を追加」から入力できます。</p>'}</div>
      <div class="inspector-section-title"><strong>マーカー（${(step.markers || []).length}）</strong></div><p class="inspector-note">下の「矢印」「注意」で追加。動画上でドラッグして位置を変更できます。</p>
      ${(step.markers || []).map((m, j) => `<div class="editor-cue marker-settings"><div class="editor-cue-header"><b>${m.kind === "arrow" ? "↗ 矢印" : "△ 注意"}</b><button type="button" data-action="delete-marker" data-index="${j}" aria-label="マーカー${j + 1}を削除">削除</button></div><div class="editor-time-row">${timeInput("marker-start", step.atSec + m.atRel, "表示開始", `data-index="${j}"`)}${timeInput("marker-end", step.atSec + m.endRel, "表示終了", `data-index="${j}"`)}</div><input data-edit="marker-text" data-index="${j}" value="${esc(m.text)}" maxlength="60" aria-label="マーカー${j + 1}の説明" placeholder="例：指の挟み込みに注意"><div class="editor-time-row"><label class="editor-time-field">横位置（%）<input data-edit="marker-x" data-index="${j}" type="number" min="5" max="95" step="1" value="${round(m.x)}"></label><label class="editor-time-field">縦位置（%）<input data-edit="marker-y" data-index="${j}" type="number" min="5" max="95" step="1" value="${round(m.y)}"></label></div></div>`).join("")}`;
  }
  function block(start, end, classes, attrs, content) {
    if (end <= start) return "";
    return `<div class="timeline-block ${classes}" data-start="${start}" data-end="${end}" ${attrs}>${content}</div>`;
  }
  function renderRuler() {
    const d = duration(), width = canvas.getBoundingClientRect().width;
    if (!width || !d) return;
    const interval = [.1, .2, .5, 1, 2, 5, 10, 15, 30, 60, 120, 180].find(seconds => seconds * width / d >= 65) || 180;
    const ticks = [];
    for (let n = 0; n * interval <= d; n++) {
      const t = round(n * interval);
      ticks.push(`<span data-tick="${t}">${fmt(t)}</span>`);
    }
    $("#timelineRuler").innerHTML = ticks.join("");
    canvas.querySelectorAll("[data-tick]").forEach(el => { el.style.left = `${Number(el.dataset.tick) / d * 100}%`; });
  }
  function followPlayhead(force = false) {
    if (!mode || drag || !viewport.clientWidth || (!force && (!$("#timelineFollow").checked || performance.now() < followSuspendedUntil))) return;
    const width = viewport.clientWidth, x = clock / duration() * canvas.getBoundingClientRect().width;
    const screenX = x - viewport.scrollLeft;
    if (screenX < 16 || screenX > width - 32) viewport.scrollLeft = Math.max(0, x - width * .35);
  }
  function setZoom(value) {
    if (drag) return;
    if (media) clock = Number(media.currentTime) || 0;
    const width = viewport.clientWidth, oldX = clock / duration() * canvas.getBoundingClientRect().width - viewport.scrollLeft;
    const anchor = oldX >= 0 && oldX <= width ? oldX : width / 2;
    const zoom = clamp(value, 1, 5);
    $("#timelineZoom").value = zoom;
    $("#timelineZoomValue").textContent = `${zoom.toFixed(1)}×`;
    $("#timelineZoom").setAttribute("aria-valuetext", `${zoom}倍`);
    $("#timelineZoomOut").disabled = zoom <= 1;
    $("#timelineZoomIn").disabled = zoom >= 5;
    canvas.style.width = `${zoom * 100}%`;
    viewport.scrollLeft = Math.max(0, clock / duration() * canvas.getBoundingClientRect().width - anchor);
    // Zoom changes only the time scale, never the media time or playback rate.
    followSuspendedUntil = performance.now() + 500;
    renderRuler(); update();
  }
  function renderTimeline() {
    const data = getResult(); if (!data) return;
    previewData = data;
    const d = duration();
    $("#editorSeek").max = d;
    renderRuler();
    $("#stepTrack").innerHTML = data.steps.map((step, i) => block(step.atSec, stepEnd(data, i), `step-block ${i === selected ? "selected" : ""}`, `data-step="${i}"`, `${i ? `<button class="timeline-handle start-handle" data-drag="step" data-step="${i}" aria-label="手順${i + 1}の開始位置をドラッグ" title="手順の区切りを移動"></button>` : ""}<button class="timeline-block-label" data-select-step="${i}" title="${esc(step.title)}">${i + 1}. ${esc(step.title)}</button>`)).join("");
    $("#subtitleTrack").innerHTML = data.steps.flatMap((step, i) => step.subtitles.map((cue, j) => { const r = cueRange(data, i, j); return block(r.start, r.end, "subtitle-block", "", `<button class="timeline-handle start-handle" data-drag="cue-start" data-step="${i}" data-index="${j}" aria-label="手順${i + 1} 字幕${j + 1}の開始位置をドラッグ"></button><button class="timeline-block-label" data-drag="cue-move" data-step="${i}" data-index="${j}" title="${esc(cue.text)}">${esc(cue.text || "字幕を入力")}</button><button class="timeline-handle end-handle" data-drag="cue-end" data-step="${i}" data-index="${j}" aria-label="手順${i + 1} 字幕${j + 1}の終了位置をドラッグ"></button>`); })).join("");
    $("#markerTrack").innerHTML = data.steps.flatMap((step, i) => (step.markers || []).map((m, j) => { const r = cueRange(data, i, j, true); return block(r.start, r.end, "marker-block", "", `<button class="timeline-block-label" data-select-step="${i}" data-seek="${r.start}" title="${esc(m.text)}">${m.kind === "arrow" ? "↗" : "△"} ${esc(m.text)}</button>`); })).join("");
    // Assign individual CSS properties: HTML style attributes are intentionally
    // blocked by the application's Content Security Policy.
    canvas.querySelectorAll(".timeline-block").forEach(el => {
      el.style.left = `${Number(el.dataset.start) / d * 100}%`;
      el.style.width = `${(Number(el.dataset.end) - Number(el.dataset.start)) / d * 100}%`;
    });
    update();
  }
  function renderMarkers(data) {
    let layer = $("#videoMarkerLayer");
    if (!layer) { layer = document.createElement("div"); layer.id = "videoMarkerLayer"; preview.append(layer); }
    const items = [];
    if (media?.tagName === "VIDEO") data.steps.forEach((step, i) => (step.markers || []).forEach((m, j) => { const r = cueRange(data, i, j, true); if (clock >= r.start && clock < r.end) items.push(`<button type="button" class="preview-marker ${m.kind}" data-marker-step="${i}" data-marker-index="${j}" data-x="${m.x}" data-y="${m.y}" aria-label="${esc(m.text || (m.kind === "arrow" ? "矢印" : "注意"))}：ドラッグで位置を変更"><span>${m.kind === "arrow" ? "↗" : "⚠"}</span>${m.text ? `<b>${esc(m.text)}</b>` : ""}</button>`); }));
    const html = items.join("");
    if (layer.dataset.rendered !== html && !drag?.marker) {
      layer.innerHTML = html; layer.dataset.rendered = html;
      layer.querySelectorAll(".preview-marker").forEach(el => { el.style.left = `${Number(el.dataset.x)}%`; el.style.top = `${Number(el.dataset.y)}%`; });
    }
  }
  function update() {
    if (media && !drag?.scrub) clock = Number(media.currentTime) || 0;
    $("#editorClock").textContent = `${fmt(clock)} / ${fmt(duration())}`;
    $("#editorSeek").value = clock;
    $("#timelinePlayhead").style.left = `${clock / duration() * 100}%`;
    $("#editorPlay").textContent = media && !media.paused ? "Ⅱ" : "▶";
    $("#editorPlay").setAttribute("aria-label", media && !media.paused ? "一時停止" : "再生");
    const data = previewData; if (data) renderMarkers(data);
    if (mode) updatePreview?.();
    if (media && !media.paused) followPlayhead();
  }
  function tick() { update(); if (media && !media.paused) frame = requestAnimationFrame(tick); }
  function moveStep(data, index, value) {
    if (!index) return false;
    const lo = data.steps[index - 1].atSec + .1, hi = stepEnd(data, index) - .1;
    if (value < lo || value > hi) { toast(`開始位置は${fmt(lo)}〜${fmt(hi)}の範囲で指定してください。`, true); return false; }
    // Preserve absolute cue timing across the two adjacent steps, splitting
    // a cue at the new boundary instead of silently deleting its text.
    value = round(value);
    const previous = data.steps[index - 1], partitions = {};
    for (const key of ["subtitles", "markers"]) {
      const before = [], after = [];
      for (const i of [index - 1, index]) (data.steps[i][key] || []).forEach((cue, j) => {
        const r = cueRange(data, i, j, key === "markers");
        if (r.start < value && r.end > r.start) before.push({ ...cue, atRel: round(r.start - previous.atSec), endRel: round(Math.min(r.end, value) - previous.atSec) });
        if (r.end > value && r.end > r.start) after.push({ ...cue, atRel: round(Math.max(r.start, value) - value), endRel: round(r.end - value) });
      });
      if (before.length > 20 || after.length > 20) { toast("区切りを移動すると字幕・マーカーが1手順20件を超えます。件数を減らしてから調整してください。", true); return false; }
      partitions[key] = { before, after };
    }
    for (const key of ["subtitles", "markers"]) { previous[key] = partitions[key].before; data.steps[index][key] = partitions[key].after; }
    data.steps[index].atSec = value;
    return true;
  }
  function editCueTime(data, i, j, start, end, marker = false) {
    const step = data.steps[i], limit = stepEnd(data, i), list = marker ? step.markers : step.subtitles;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < step.atSec || end > limit + .051 || end - start < .09) {
      toast(`表示時間は手順内（${fmt(step.atSec)}〜${fmt(limit)}）で、開始より終了を後にしてください。`, true); return false;
    }
    if (!marker && list.some((_, k) => { if (k === j) return false; const r = cueRange(data, i, k); return start < r.end - .01 && end > r.start + .01; })) { toast("同じ手順の字幕と時間が重なっています。開始・終了時刻を調整してください。", true); return false; }
    list[j].atRel = round(start - step.atSec); list[j].endRel = round(end - step.atSec); return true;
  }
  function flushPendingTimes() {
    if (!pendingTimes.size) return true;
    const data = getResult(), step = data.steps[selected], limit = stepEnd(data, selected);
    const ranges = step.subtitles.map((_, j) => cueRange(data, selected, j));
    const fail = (j, message) => {
      const card = inspector.querySelector(`[data-cue="${j}"]`);
      const error = card?.querySelector(".cue-time-error");
      if (error) { error.textContent = message; error.hidden = false; }
      card?.querySelector('[data-edit="cue-end"]')?.focus();
      toast(message, true); return false;
    };
    for (const j of pendingTimes) {
      const card = inspector.querySelector(`[data-cue="${j}"]`);
      if (!card) continue;
      const start = parseTime(card.querySelector('[data-edit="cue-start"]').value);
      const end = parseTime(card.querySelector('[data-edit="cue-end"]').value);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return fail(j, "時刻は「1:20.0」のように分:秒で入力してください。秒数のみでも入力できます。");
      if (start < step.atSec - .001 || end > limit + .051 || end - start < .09) return fail(j, `手順${selected + 1}の範囲 ${fmt(step.atSec)}〜${fmt(limit)} で、開始より後の終了時刻を指定してください。範囲を延ばす場合は先に「手順の終了」を変更します。`);
      ranges[j] = { start: round(start), end: round(end) };
    }
    for (const j of pendingTimes) {
      const a = ranges[j];
      if (ranges.some((b, k) => k !== j && a.start < b.end - .01 && a.end > b.start + .01)) return fail(j, "別の字幕の表示時間と重なっています。前後の字幕も調整してから反映してください。");
    }
    ranges.forEach((r, j) => { step.subtitles[j].atRel = round(r.start - step.atSec); step.subtitles[j].endRel = round(r.end - step.atSec); });
    pendingTimes.clear(); apply(data); return true;
  }
  function addSubtitle() {
    if (!flushPendingTimes()) return;
    const data = getResult(); if (!data) return;
    const step = data.steps[selected];
    if (step.subtitles.length >= 20) return toast("字幕は1手順につき20件までです。", true);
    // Find the first empty interval at or after the playhead, falling back to the step start.
    const ranges = step.subtitles.map((_, j) => cueRange(data, selected, j)).sort((a, b) => a.start - b.start);
    const gaps = []; let cursor = step.atSec;
    ranges.forEach(r => { if (r.start > cursor) gaps.push({ start: cursor, end: r.start }); cursor = Math.max(cursor, r.end); });
    if (cursor < stepEnd(data, selected)) gaps.push({ start: cursor, end: stepEnd(data, selected) });
    const preferred = clamp(clock, step.atSec, stepEnd(data, selected));
    let gap = gaps.find(g => g.end - Math.max(g.start, preferred) >= .2), start;
    if (gap) start = Math.max(gap.start, preferred); else { gap = gaps.find(g => g.end - g.start >= .2); start = gap?.start; }
    if (!gap) return toast("字幕を追加できる空き時間がありません。既存の字幕の表示時間を短くしてください。", true);
    step.subtitles.push({ atRel: round(start - step.atSec), endRel: round(Math.min(gap.end, start + 4) - step.atSec), text: "字幕を入力してください" });
    apply(data); seek(start); inspector.querySelector(`textarea[data-edit="cue-text"][data-index="${step.subtitles.length - 1}"]`)?.focus();
  }
  function addStep() {
    if (!flushPendingTimes()) return;
    const data = getResult(); if (!data) return;
    if (data.steps.length >= 90) return toast("手順は90件までです。", true);
    const i = currentStep(data), step = data.steps[i], cut = round(clock), end = stepEnd(data, i);
    if (cut <= step.atSec + .1 || cut >= end - .1) return toast("手順の途中に再生位置を移動してから追加してください。", true);
    const fresh = { no: i + 2, atSec: cut, title: "新しい手順", note: "", subtitles: [], markers: [], quality: "", safety: "", workPoint: "" };
    for (const key of ["subtitles", "markers"]) {
      const before = [], after = [];
      (step[key] || []).forEach((cue, j) => {
        const r = cueRange(data, i, j, key === "markers");
        if (r.start < cut) before.push({ ...cue, endRel: round(Math.min(r.end, cut) - step.atSec) });
        if (r.end > cut) after.push({ ...cue, atRel: round(Math.max(cut, r.start) - cut), endRel: round(r.end - cut) });
      });
      step[key] = before; fresh[key] = after;
    }
    data.steps.splice(i + 1, 0, fresh); selected = i + 1; apply(data);
  }
  function deleteStep() {
    if (!flushPendingTimes()) return;
    const data = getResult(); if (!data || data.steps.length === 1) return;
    if (!confirm(`手順${selected + 1}を削除しますか？この手順の説明・字幕・マーカーも削除されます。`)) return;
    data.steps.splice(selected, 1);
    if (selected === 0) {
      const first = data.steps[0], offset = first.atSec;
      for (const key of ["subtitles", "markers"]) first[key] = (first[key] || []).map(c => ({...c, atRel: round(c.atRel + offset), ...(Number.isFinite(c.endRel) ? {endRel: round(c.endRel + offset)} : {})}));
      first.atSec = 0;
    }
    selected = Math.min(selected, data.steps.length - 1); apply(data);
  }
  function addMarker(kind) {
    if (!flushPendingTimes()) return;
    if (media?.tagName !== "VIDEO") return toast("マーカーは動画ファイルを開いているときに追加できます。", true);
    const data = getResult(), i = currentStep(data), step = data.steps[i];
    step.markers ||= []; if (step.markers.length >= 20) return toast("マーカーは1手順につき20件までです。", true);
    const start = round(clamp(clock, step.atSec, stepEnd(data, i) - .2));
    step.markers.push({ kind, atRel: round(start - step.atSec), endRel: round(Math.min(stepEnd(data, i), start + 4) - step.atSec), x: 50, y: 50, text: kind === "warning" ? "ここに注意" : "" });
    selected = i; apply(data); seek(start);
  }
  inspector.addEventListener("input", event => {
    const field = event.target.dataset.edit;
    if (field === "cue-start" || field === "cue-end") {
      pendingTimes.add(Number(event.target.dataset.index));
      const card = event.target.closest(".editor-cue");
      card.classList.add("time-pending"); card.querySelector(".cue-time-error").hidden = true;
      $("#editorSaveState").textContent = "字幕の時刻を入力中・表示時間を反映してください";
      $("#editorSaveState").classList.add("unsaved");
      return;
    }
    if (!["step-title", "cue-text", "marker-text"].includes(field)) return;
    const data = getResult(), step = data.steps[selected], index = Number(event.target.dataset.index);
    if (field === "step-title") step.title = event.target.value;
    if (field === "cue-text") { step.subtitles[index].text = event.target.value; event.target.closest(".editor-cue").querySelector("[data-char-count]").textContent = `${event.target.value.length} / 120`; }
    if (field === "marker-text") step.markers[index].text = event.target.value;
    apply(data, false);
  });
  inspector.addEventListener("change", event => {
    if (event.target.id === "editorStepSelect") return choose(Number(event.target.value), true);
    const field = event.target.dataset.edit;
    if (!field || ["step-title", "cue-text", "marker-text", "cue-start", "cue-end"].includes(field)) return;
    const value = field === "marker-x" || field === "marker-y" ? Number(event.target.value) : parseTime(event.target.value);
    if (!flushPendingTimes()) return;
    const data = getResult(), i = selected, j = Number(event.target.dataset.index);
    if (event.target.value.trim() === "" || !Number.isFinite(value)) { renderInspector(); return toast("時刻は「1:20.0」のように分:秒で、位置は数値で入力してください。", true); }
    let valid = true;
    if (field === "step-start") valid = moveStep(data, i, value);
    else if (field === "step-end") valid = i < data.steps.length - 1 && moveStep(data, i + 1, value);
    else if (field === "marker-x" || field === "marker-y") data.steps[i].markers[j][field.slice(-1)] = clamp(value, 5, 95);
    else {
      const marker = field.startsWith("marker"), r = cueRange(data, i, j, marker);
      valid = editCueTime(data, i, j, field.endsWith("start") ? value : r.start, field.endsWith("end") ? value : r.end, marker);
    }
    if (valid) apply(data); else renderInspector();
  });
  inspector.addEventListener("click", event => {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const action = button.dataset.action, j = Number(button.dataset.index);
    if (action === "apply-cue-time") { flushPendingTimes(); return; }
    if (action === "cue-end-now") {
      inspector.querySelector(`[data-edit="cue-end"][data-index="${j}"]`).value = fmt(clock);
      pendingTimes.add(j); flushPendingTimes(); return;
    }
    if (!flushPendingTimes()) return;
    const data = getResult();
    if (action === "add-subtitle") return addSubtitle();
    if (action === "delete-step") return deleteStep();
    if (action === "cue-preview") return seek(data.steps[selected].atSec + data.steps[selected].subtitles[j].atRel);
    if (action === "step-now") { if (moveStep(data, selected, round(clock))) apply(data); return; }
    if (action === "step-end-now") { if (selected < data.steps.length - 1 && moveStep(data, selected + 1, round(clock))) apply(data); return; }
    if (action === "delete-cue") data.steps[selected].subtitles.splice(j, 1);
    if (action === "delete-marker") data.steps[selected].markers.splice(j, 1);
    apply(data);
  });
  canvas.addEventListener("click", event => {
    if (performance.now() < suppressClickUntil) return;
    const button = event.target.closest("[data-select-step]");
    if (button) { choose(Number(button.dataset.selectStep), true); if (button.dataset.seek) seek(Number(button.dataset.seek)); return; }
    const cue = event.target.closest('[data-drag^="cue-"]');
    if (cue) { choose(Number(cue.dataset.step), false); focusCueTime(Number(cue.dataset.index)); return; }
    if (!event.target.closest(".timeline-block")) seek(timeAt(event.clientX));
  });
  const timeAt = x => clamp((x - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width * duration(), 0, duration());
  function focusCueTime(index) {
    const card = inspector.querySelector(`[data-cue="${index}"]`);
    card?.scrollIntoView({ block: "nearest" });
    card?.querySelector('[data-edit="cue-end"]')?.focus({ preventScroll: true });
  }
  let suppressClickUntil = 0;
  canvas.addEventListener("pointerdown", event => {
    if (pendingTimes.size) { flushPendingTimes(); return; }
    const handle = event.target.closest("[data-drag]"); if (!handle || event.button !== 0) return;
    event.preventDefault(); media?.pause();
    const data = getResult(), i = Number(handle.dataset.step), j = Number(handle.dataset.index || 0);
    selected = i; renderInspector();
    drag = { data, i, j, type: handle.dataset.drag, x: event.clientX, r: handle.dataset.drag === "step" ? null : cueRange(data, i, j), block: handle.closest(".timeline-block"), pointer: event.pointerId };
    handle.setPointerCapture(event.pointerId);
  });
  preview.addEventListener("pointerdown", event => {
    if (pendingTimes.size) { flushPendingTimes(); return; }
    const target = event.target.closest(".preview-marker"); if (!target || event.button !== 0 || !mode) return;
    event.preventDefault(); media?.pause();
    drag = { marker: true, data: getResult(), i: Number(target.dataset.markerStep), j: Number(target.dataset.markerIndex), target, pointer: event.pointerId };
    target.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (drag.marker) {
      const bounds = preview.getBoundingClientRect();
      drag.position = { x: round(clamp((event.clientX - bounds.left) / bounds.width * 100, 5, 95)), y: round(clamp((event.clientY - bounds.top) / bounds.height * 100, 5, 95)) };
      drag.target.style.left = `${drag.position.x}%`; drag.target.style.top = `${drag.position.y}%`; return;
    }
    const { data, i, j, r, type } = drag, step = data.steps[i], end = stepEnd(data, i), delta = (event.clientX - drag.x) / canvas.getBoundingClientRect().width * duration();
    if (type === "step") {
      drag.value = round(clamp(step.atSec + delta, data.steps[i - 1].atSec + .1, end - .1));
      drag.block.style.left = `${drag.value / duration() * 100}%`; drag.block.style.width = `${(end - drag.value) / duration() * 100}%`;
    } else {
      const others = step.subtitles.map((_, k) => k === j ? null : cueRange(data, i, k)).filter(Boolean);
      const lo = Math.max(step.atSec, ...others.filter(c => c.end <= r.start + .01).map(c => c.end));
      const hi = Math.min(end, ...others.filter(c => c.start >= r.end - .01).map(c => c.start));
      let start = r.start, stop = r.end;
      if (type === "cue-start") start = round(clamp(r.start + delta, lo, r.end - .1));
      if (type === "cue-end") stop = round(clamp(r.end + delta, r.start + .1, hi));
      if (type === "cue-move") { start = round(clamp(r.start + delta, lo, hi - (r.end - r.start))); stop = round(start + r.end - r.start); }
      drag.range = { start, end: stop }; drag.block.style.left = `${start / duration() * 100}%`; drag.block.style.width = `${(stop - start) / duration() * 100}%`;
    }
  });
  document.addEventListener("pointerup", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const d = drag; drag = null; suppressClickUntil = performance.now() + 100;
    if (d.marker) { if (d.position) { Object.assign(d.data.steps[d.i].markers[d.j], d.position); selected = d.i; apply(d.data); } else update(); return; }
    if (d.type === "step" && d.value !== undefined) { if (moveStep(d.data, d.i, d.value)) apply(d.data); }
    else if (d.range) { if (editCueTime(d.data, d.i, d.j, d.range.start, d.range.end)) apply(d.data); }
    else { renderInspector(); seek(d.r?.start ?? d.data.steps[d.i].atSec); }
    renderTimeline();
    if (d.type?.startsWith("cue")) focusCueTime(d.j);
  });
  document.addEventListener("pointercancel", () => { drag = null; renderTimeline(); });
  $("#editorSeek").addEventListener("input", e => seek(Number(e.target.value)));
  $("#editorPlay").addEventListener("click", () => {
    if (!media) return toast("実際の動画・音声をアップロードすると再生できます。");
    if (media.paused) media.play().catch(() => toast("素材を読み込めません。動画の再生状態を確認してください。", true)); else media.pause();
  });
  $("#editorBack").addEventListener("click", () => seek(clock - 5));
  $("#editorForward").addEventListener("click", () => seek(clock + 5));
  $("#addEditorStep").addEventListener("click", addStep);
  $("#addEditorSubtitle").addEventListener("click", addSubtitle);
  $("#addArrowMarker").addEventListener("click", () => addMarker("arrow"));
  $("#addWarningMarker").addEventListener("click", () => addMarker("warning"));
  $("#timelineZoom").addEventListener("input", event => setZoom(Number(event.target.value)));
  $("#timelineZoomOut").addEventListener("click", () => setZoom(Number($("#timelineZoom").value) - .5));
  $("#timelineZoomIn").addEventListener("click", () => setZoom(Number($("#timelineZoom").value) + .5));
  $("#timelineFit").addEventListener("click", () => setZoom(1));
  $("#timelineFollow").addEventListener("change", () => { if ($("#timelineFollow").checked) { followSuspendedUntil = 0; followPlayhead(true); } });
  // Give manual scrolling time to settle before playback follows again.
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) viewport.addEventListener(type, () => { followSuspendedUntil = performance.now() + 2500; }, { passive: true });
  new ResizeObserver(() => { if (mode) { renderRuler(); followPlayhead(); } }).observe(viewport);
  function setMode(next) {
    if (!flushPendingTimes()) return;
    mode = next;
    $("#resultSection").classList.toggle("video-editing", mode);
    $("#videoEditMode").setAttribute("aria-pressed", String(mode)); $("#documentEditMode").setAttribute("aria-pressed", String(!mode));
    if (mode) { renderInspector(); renderTimeline(); }
    else requestAnimationFrame(() => document.querySelectorAll(".result-document textarea").forEach(el => { el.style.height = "auto"; el.style.height = `${Math.max(30, el.scrollHeight)}px`; }));
  }
  $("#videoEditMode").addEventListener("click", () => { setMode(true); syncPreview(); });
  $("#documentEditMode").addEventListener("click", () => setMode(false));
  function load() {
    pendingTimes.clear();
    abort?.abort(); abort = new AbortController(); cancelAnimationFrame(frame); drag = null;
    media = preview.querySelector("video, audio"); selected = 0; clock = 0;
    const data = getResult();
    if (data) {
      data.steps.sort((a, b) => (a.atSec || 0) - (b.atSec || 0));
      data.steps.forEach((step, i) => {
        step.atSec = i === 0 ? 0 : round(clamp(step.atSec, data.steps[i - 1].atSec + .1, duration() - (data.steps.length - i) * .1));
        step.no = i + 1;
      });
      commit(data);
    }
    if (media) {
      const options = { signal: abort.signal };
      media.addEventListener("loadedmetadata", () => { renderInspector(); renderTimeline(); }, options);
      media.addEventListener("durationchange", () => { renderInspector(); renderTimeline(); }, options);
      media.addEventListener("timeupdate", update, options); media.addEventListener("seeked", () => { update(); followPlayhead(); }, options);
      media.addEventListener("play", () => { cancelAnimationFrame(frame); tick(); }, options);
      media.addEventListener("pause", () => { cancelAnimationFrame(frame); update(); }, options);
      media.addEventListener("ended", update, options);
    }
    $("#addArrowMarker").disabled = $("#addWarningMarker").disabled = media?.tagName !== "VIDEO";
    saved(); setMode(true); setZoom(1);
  }
  return { load, saved, setMode, flushPendingTimes, isDirty: () => dirty || pendingTimes.size > 0, documentChanged() { previewData = getResult(); markDirty(); } };
};
