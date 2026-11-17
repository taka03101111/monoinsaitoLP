(() => {
  const status=document.getElementById('receipt-status');
  if(status)status.textContent='GitHub Pagesの画面確認版です。受付・メール送信は行っていません。';
  const receipt=document.getElementById('confirmed-receipt');
  if(receipt)receipt.hidden=true;
})();
