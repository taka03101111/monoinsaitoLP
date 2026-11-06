/* Carry only explicit campaign attribution to local inquiry pages. No tracking request. */
(() => {
  'use strict';
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const incoming = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem('mono_campaign') || '{}'); } catch { /* Storage can be unavailable. */ }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  if (keys.some(key => incoming.has(key))) {
    saved = {};
    keys.forEach(key => { const value = incoming.get(key); if (value) saved[key] = value.slice(0, 160); });
    try { sessionStorage.setItem('mono_campaign', JSON.stringify(saved)); } catch { /* Links still work in this page. */ }
  }
  const values = Object.fromEntries(keys.filter(key => typeof saved[key] === 'string' && saved[key]).map(key => [key, saved[key].slice(0, 160)]));
  for (const link of document.querySelectorAll('a[href]')) {
    const url = new URL(link.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !/(?:contact|download|index)\.html$/.test(url.pathname)) continue;
    Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
    link.setAttribute('href', url.pathname + url.search + url.hash);
  }
  for (const form of document.querySelectorAll('#contact-form, #download-form')) {
    Object.entries(values).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = key; input.value = value; form.append(input);
    });
  }
  const note = document.getElementById('exhibitionNote');
  if (note) note.hidden = values.utm_source !== 'fiw2026';
})();
