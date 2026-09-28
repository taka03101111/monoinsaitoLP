'use strict';
(()=>{
  const cfg=window.MONO_CONFIG||{previewMode:true};
  const contactForm=document.getElementById('contact-form');
  const downloadForm=document.getElementById('download-form');
  const purposes={trial:'無料トライアル',demo:'デモを依頼',pricing:'料金を相談',other:'その他'};
  const labels={type:'ご用途',company:'会社名',employees:'従業員数',locations:'拠点数',industry:'業種',name:'お名前',department:'部署・役職',email:'メールアドレス',phone:'電話番号',message:'ご相談内容・試したい工程'};
  if(!cfg.previewMode){document.querySelectorAll('.preview-notice,.form-footnote').forEach(n=>n.hidden=true);}
  if(cfg.termsUrl){const label=document.querySelector('[data-terms-label]');if(label){const a=document.createElement('a');a.href=cfg.termsUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='利用規約';label.replaceWith(a);}}
  if(cfg.privacyUrl){document.querySelectorAll('a[href="https://e-autec.com/privacy/"]').forEach(a=>a.href=cfg.privacyUrl);}
  function error(container,message){const box=container.querySelector('.form-error');box.textContent=message;box.hidden=false;}
  function validate(form){
    form.querySelectorAll('input[type=text],input[type=email],input[type=tel],textarea').forEach(el=>el.value=el.value.trim());
    form.querySelector('.form-error').hidden=true;
    form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    const invalid=[...form.elements].find(el=>el.willValidate&&!el.checkValidity());
    if(invalid){invalid.setAttribute('aria-invalid','true');const message=invalid.name==='consent'?'同意の項目をご確認ください。':`${labels[invalid.name]||'入力内容'}を正しく入力してください。`;error(form,message);invalid.focus();return false;}return true;
  }
  function focusSection(el){el.focus({preventScroll:true});el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  async function sendToApi(endpoint,data){
    if(!endpoint||!cfg.csrfEndpoint)throw new Error('現在フォームからの受付準備中です。お電話またはメールでお問い合わせください。');
    const target=new URL(endpoint,location.href),csrfTarget=new URL(cfg.csrfEndpoint,location.href);
    if(target.origin!==location.origin||csrfTarget.origin!==location.origin)throw new Error('現在フォームをご利用いただけません。');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const tokenResponse=await fetch(csrfTarget,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!tokenResponse.ok)throw new Error('通信に失敗しました。入力内容を保ったまま、もう一度お試しください。');
      const token=await tokenResponse.json();if(typeof token.csrf_token!=='string'||!token.csrf_token)throw new Error('フォームを読み込めませんでした。もう一度お試しください。');
      const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token.csrf_token},credentials:'same-origin',body:JSON.stringify(data),signal:controller.signal});
      if(!response.ok)throw new Error('送信できませんでした。入力内容を保ったまま、もう一度お試しください。');
      const result=await response.json();if(result.success!==true)throw new Error('送信できませんでした。時間をおいて再度お試しください。');return result;
    }catch(e){if(e.name==='AbortError')throw new Error('通信に時間がかかっています。入力内容を保ったまま、もう一度お試しください。');if(e instanceof TypeError)throw new Error('通信できませんでした。接続をご確認のうえ、もう一度お試しください。');throw e;}finally{clearTimeout(timeout);}
  }
  if(contactForm){
    const validType=new URLSearchParams(location.search).get('type');
    if(Object.hasOwn(purposes,validType||''))contactForm.querySelector(`input[value="${validType}"]`).checked=true;
    const locations=contactForm.elements.locations;locations.min='1';locations.max='99999';locations.step='1';
    const updatePurpose=()=>{const trial=contactForm.elements.type.value==='trial';document.getElementById('trial-info').hidden=!trial;document.getElementById('locations-field').hidden=!trial;locations.disabled=!trial;};
    contactForm.querySelectorAll('input[name=type]').forEach(el=>el.addEventListener('change',updatePurpose));updatePurpose();
    const confirm=document.getElementById('contact-confirm');const success=document.getElementById('contact-success');const sendButton=document.getElementById('send-contact');
    let data=null;let pending=false;
    const progress=step=>document.querySelectorAll('.form-progress li').forEach((el,i)=>{el.classList.toggle('current',i===step);el.classList.toggle('complete',i<step);if(i===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    contactForm.addEventListener('submit',e=>{e.preventDefault();if(!validate(contactForm))return;data=Object.fromEntries(new FormData(contactForm));const list=document.getElementById('confirmation-list');list.replaceChildren();for(const key of Object.keys(labels)){if(key==='locations'&&data.type!=='trial')continue;const dt=document.createElement('dt');dt.textContent=labels[key];const dd=document.createElement('dd');dd.textContent=key==='type'?purposes[data[key]]:data[key]||'未入力';list.append(dt,dd);}contactForm.hidden=true;confirm.hidden=false;progress(1);focusSection(confirm);});
    document.getElementById('edit-contact').addEventListener('click',()=>{if(pending)return;confirm.hidden=true;contactForm.hidden=false;progress(0);contactForm.elements.company.focus();});
    sendButton.addEventListener('click',async()=>{if(pending||!data)return;pending=true;sendButton.disabled=true;confirm.querySelector('.form-error').hidden=true;try{if(!cfg.previewMode){await sendToApi(cfg.contactEndpoint,data);success.querySelector('h2').textContent='お問い合わせを受け付けました。';document.getElementById('success-message').textContent='内容を確認のうえ、担当者よりご連絡いたします。';}confirm.hidden=true;success.hidden=false;document.getElementById('trial-next').hidden=data.type!=='trial';progress(2);contactForm.reset();data=null;focusSection(success);}catch(e){error(confirm,e.message);}finally{pending=false;sendButton.disabled=false;}});
  }
  if(downloadForm){
    let pending=false;
    downloadForm.addEventListener('submit',async e=>{e.preventDefault();if(pending||!validate(downloadForm))return;pending=true;const button=downloadForm.querySelector('button[type=submit]');button.disabled=true;try{if(!cfg.previewMode){await sendToApi(cfg.downloadEndpoint,Object.fromEntries(new FormData(downloadForm)));document.querySelector('#download-success>p').textContent='下のボタンから、ご紹介資料をダウンロードしてください。';}downloadForm.hidden=true;const success=document.getElementById('download-success');success.hidden=false;downloadForm.reset();focusSection(success);}catch(e){error(downloadForm,e.message);}finally{pending=false;button.disabled=false;}});
  }
})();
