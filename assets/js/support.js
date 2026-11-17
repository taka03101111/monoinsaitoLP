(() => {
  'use strict';
  const kind=document.body.dataset.page;
  const form=document.querySelector(`#${kind}-form`);
  if(!form)return;
  form.hidden=false;
  const contact=kind==='contact';
  const status=document.getElementById('form-status');
  const labels={type:'ご用件',company:'会社名',employees:'従業員数',locations:'拠点数',industry:'業種',name:'お名前',department:'部署・役職',email:'メールアドレス',phone:'電話番号',message:'ご相談内容'};
  const types={trial:'無料トライアル',demo:'デモを依頼',pricing:'料金を相談',other:'その他'};
  let sending=false;
  function message(text){status.textContent=text;status.hidden=false;status.tabIndex=-1;status.focus();status.scrollIntoView({block:'center',behavior:'auto'});}
  function panel(review){
    document.getElementById('entry-panel').hidden=review;
    if(contact)document.getElementById('review-panel').hidden=!review;
    document.querySelectorAll('.stepper li').forEach((li,i)=>{li.classList.toggle('active',i===Number(review));li.classList.toggle('complete',i<Number(review));if(i===Number(review))li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    const target=document.getElementById(review?'review-panel':'entry-panel');target.tabIndex=-1;target.focus();target.scrollIntoView({block:'start',behavior:'auto'});
  }
  function setType(){
    const trial=form.elements.type.value==='trial';
    document.getElementById('locations-field').hidden=!trial;
    form.elements.locations.disabled=!trial;
    document.getElementById('industry').closest('.field').classList.toggle('full',!trial);
    document.getElementById('trial-info').hidden=!trial;
  }
  if(contact){
    const type=new URLSearchParams(location.search).get('type');
    if(Object.hasOwn(types,type))form.elements.type.value=type;
    form.querySelectorAll('[name=type]').forEach(input=>input.addEventListener('change',setType));setType();
    document.getElementById('back-to-entry').addEventListener('click',()=>{if(!sending)panel(false);});
    document.getElementById('show-completion').addEventListener('click',send);
  }
  form.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>input.setCustomValidity('')));
  form.addEventListener('submit',event=>{
    event.preventDefault();if(sending)return;
    for(const input of form.querySelectorAll('input[required]:not([type=checkbox]):not([type=radio])'))input.setCustomValidity(input.value.trim()?'':'内容を入力してください。');
    if(contact){const phone=form.elements.phone;const digits=phone.value.replace(/\D/g,'');phone.setCustomValidity(/^[\d\s()+\-ー−]+$/.test(phone.value)&&digits.length>=8&&digits.length<=15?'':'電話番号を確認してください。');}
    if(!form.reportValidity())return;
    status.hidden=true;
    if(!contact){send();return;}
    const table=document.getElementById('review-table');table.replaceChildren();
    const values=new FormData(form);
    for(const [key,label] of Object.entries(labels)){
      if(key==='locations'&&form.elements.type.value!=='trial')continue;
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;
      dd.textContent=(key==='type'?types[values.get(key)]:String(values.get(key)||'').trim())||'—';row.append(dt,dd);table.append(row);
    }
    panel(true);
  });
  function send(){
    message('画面確認版のため送信していません。入力内容はこの画面内のみで使用されます。本番サイトの公開後にお問い合わせ・資料請求をご利用ください。');
  }
})();
