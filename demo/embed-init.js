// Apply before first paint. Normal /demo/ keeps the standalone layout.
if (window.self !== window.top && new URLSearchParams(location.search).get("embed") === "1") {
  document.documentElement.classList.add("embedded-demo");
}
