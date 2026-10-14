(() => {
  'use strict';
  const form = document.getElementById('contact-form');
  if (!form) return;
  const email = 'info@e-autec.com';
  const requestSelect = document.getElementById('request-type');
  const requestedType = new URLSearchParams(window.location.search).get('type');
  if (Array.from(requestSelect.options).some(option => option.value === requestedType)) {
    requestSelect.value = requestedType;
  }
  form.hidden = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = document.getElementById('name');
    const message = document.getElementById('message');
    for (const field of [name, message]) {
      field.setCustomValidity(field.value.trim() ? '' : '内容を入力してください。');
    }
    if (!form.reportValidity()) return;
    const request = requestSelect.options[requestSelect.selectedIndex].text;
    const company = document.getElementById('company').value.trim();
    const body = [
      '株式会社オーテック monoインサイト ご担当者様',
      '',
      `ご相談内容：${request}`,
      `会社名：${company || '（未入力）'}`,
      `お名前：${name.value.trim()}`,
      '',
      message.value.trim(),
    ].join('\r\n');
    const subject = `【monoインサイト】${request}`;
    document.getElementById('email-status').textContent =
      'メールアプリで内容をご確認のうえ、送信してください。まだ送信は完了していません。アプリが開かない場合は info@e-autec.com 宛てに直接お送りください。';
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  for (const id of ['name', 'message']) {
    document.getElementById(id).addEventListener('input', event => event.target.setCustomValidity(''));
  }
  const copyButton = document.getElementById('copy-email');
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(email);
      status.textContent = 'メールアドレスをコピーしました。';
    } catch {
      status.textContent = 'コピーできませんでした。メールアドレスを選択してコピーしてください：info@e-autec.com';
    }
  });
})();
