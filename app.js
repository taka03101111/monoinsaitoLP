'use strict';
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) {
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.focus();
  }
});

// Inputs stay in memory across steps. This preview does not call AI.
const demoState = { caption: 'これから段取り替えの手順を説明します。' };
const stage = document.querySelector('#demo-content');
function productImage(src, title) {
  return `<div class="product-shot demo-shot"><img src="${src}" alt="${title}"></div>`;
}
const screens = [
  `${productImage('assets/images/manual-upload.webp', '新規マニュアルの登録画面')}<div class="demo-input-panel"><button type="button" class="demo-next" data-next="1">手順・字幕のサンプルを見る <span aria-hidden="true">→</span></button></div>`,
  `${productImage('assets/images/manual-detail-current.png', '手順と字幕が付いたマニュアルの画面')}<div class="demo-input-panel"><h3>手順・字幕の表示サンプル</h3><button type="button" class="demo-next" data-next="2">編集の操作へ <span aria-hidden="true">→</span></button></div>`,
  `${productImage('assets/images/manual-editor-current.png', 'マニュアルの編集画面')}<div class="demo-input-panel"><label for="demo-caption">字幕を編集する</label><input id="demo-caption" maxlength="100" type="text"><button type="button" class="demo-next" data-next="3">配布・閲覧の画面へ <span aria-hidden="true">→</span></button></div>`,
  `${productImage('assets/images/manual-library.webp', '教育マニュアルの一覧画面')}<div class="demo-input-panel"><h3>必要な手順を、現場から確認。</h3><p>QRコードから閲覧し、視聴・完了状況を個人ごとに管理できます。</p><button type="button" class="demo-next" data-next="0">最初のステップに戻る <span aria-hidden="true">↶</span></button></div>`
];
function showStep(index, focus = false) {
  stage.innerHTML = screens[index];
  document.querySelectorAll('.demo-step').forEach((button, i) => {
    button.classList.toggle('active', i === index);
    button.setAttribute('aria-pressed', String(i === index));
  });
  document.querySelector('#demo-counter').textContent = `0${index + 1} / 04`;
  const caption = stage.querySelector('#demo-caption');
  if (caption) caption.value = demoState.caption;
  if (focus) { stage.setAttribute('tabindex', '-1'); stage.focus({ preventScroll: true }); }
}
document.querySelectorAll('.demo-step').forEach(button => button.addEventListener('click', () => showStep(Number(button.dataset.step))));
stage.addEventListener('input', event => {
  if (event.target.id === 'demo-caption') demoState.caption = event.target.value;
});
stage.addEventListener('click', event => {
  const next = event.target.closest('[data-next]');
  if (next) showStep(Number(next.dataset.next), true);
});
showStep(0);

