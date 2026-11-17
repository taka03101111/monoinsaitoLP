(() => {
  const kind=document.body.dataset.page;
  const status=document.getElementById('receipt-status');
  async function load(){
    try{
      const response=await fetch((window.MONO_SITE?.formEndpoint||'/api/forms.php')+'?action=receipt&kind='+kind,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.received)throw new Error(data.error||'受付情報を確認できません。フォームからお申し込みください。');
      status.hidden=true;document.getElementById('confirmed-receipt').hidden=false;
      document.getElementById('receipt-number').textContent=data.receipt;
      document.getElementById('mail-status').textContent=data.mailPending?'受付は完了しています。確認メールは送信準備中です。':'確認メールの送信を受け付けました。届かない場合は迷惑メールフォルダもご確認ください。';
      if(kind==='download')document.getElementById('download-pdf').href=data.downloadUrl;
      document.dispatchEvent(new CustomEvent('mono:form-receipt',{detail:{receipt:data.receipt,kind}}));
    }catch(error){status.textContent=error.message||'受付状況を確認できませんでした。';}
  }
  load();
})();
