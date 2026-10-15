(() => {
  'use strict';
  const isContact = document.body.dataset.page === 'contact';
  const form = document.querySelector(isContact ? '#contact-form' : '#download-form');
  if (!form) return;
  form.hidden = false;
  const labels = {type:'ご用件',company:'会社名',employees:'従業員数',locations:'拠点数',industry:'業種',name:'お名前',department:'部署・役職',email:'メールアドレス',phone:'電話番号',message:'ご相談内容'};
  const typeNames = {trial:'無料トライアル',demo:'デモを依頼',pricing:'料金を相談',other:'その他'};
  const panels = ['entry-panel','review-panel','result-panel'];
  let activeType = 'trial';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function switchPanel(index) {
    panels.forEach((id,i)=>{const panel=document.getElementById(id);if(panel)panel.hidden=i!==index;});
    document.querySelectorAll('.stepper li').forEach((item,i)=>{item.classList.toggle('active',i===index);item.classList.toggle('complete',i<index);if(i===index)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
    const target=document.getElementById(panels[index]);target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({behavior:motion.matches?'instant':'smooth',block:'start'});
    document.getElementById('sample-fill').hidden=index!==0;
  }
  function updateType() {
    activeType=form.querySelector('input[name="type"]:checked').value;
    const trial=activeType==='trial';
    document.getElementById('locations-field').hidden=!trial;
    document.getElementById('locations').disabled=!trial;
    document.getElementById('industry').closest('.field').classList.toggle('full',!trial);
    document.getElementById('trial-info').hidden=!trial;
    document.getElementById('trial-setup').hidden=!trial;
  }
  if(isContact){
    const queryType=new URLSearchParams(location.search).get('type');
    if(Object.hasOwn(typeNames,queryType))form.querySelector(`input[value="${queryType}"]`).checked=true;
    form.querySelectorAll('input[name="type"]').forEach(input=>input.addEventListener('change',updateType));
    updateType();
    document.getElementById('back-to-entry').addEventListener('click',()=>switchPanel(0));
    document.getElementById('show-completion').addEventListener('click',()=>switchPanel(2));
    document.getElementById('restart-form').addEventListener('click',()=>switchPanel(0));
  }
  form.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>input.setCustomValidity('')));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    for(const input of form.querySelectorAll('input[required]:not([type="checkbox"]):not([type="radio"])'))input.setCustomValidity(input.value.trim()?'':'内容を入力してください。');
    if(isContact){const phone=document.getElementById('phone');const digits=phone.value.replace(/\D/g,'');phone.setCustomValidity(/^[\d\s()+\-ー−]+$/.test(phone.value)&&digits.length>=8&&digits.length<=15?'':'電話番号を半角数字・ハイフンで入力してください。');}
    if(!form.reportValidity())return;
    if(isContact){
      const table=document.getElementById('review-table');table.replaceChildren();
      const values=new FormData(form);
      for(const [key,label] of Object.entries(labels)){
        if(key==='locations'&&activeType!=='trial')continue;
        const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
        dt.textContent=label;let value=String(values.get(key)||'').trim();if(key==='type')value=typeNames[value];
        dd.textContent=value||'—';row.append(dt,dd);table.append(row);
      }
      switchPanel(1);
    }else switchPanel(2);
  });
  document.getElementById('sample-fill').addEventListener('click',()=>{
    const samples={company:'サンプル製造株式会社',employees:'31〜300名',name:'山田 太郎',email:'sample@example.com',department:'製造部 / 課長',locations:'2',industry:'自動車部品製造',phone:'052-000-0000',message:'段取り替え作業を動画マニュアルにしたいと考えています。実際の操作画面を見ながら相談したいです。'};
    for(const [id,value] of Object.entries(samples)){const input=document.getElementById(id);if(input){input.value=value;input.setCustomValidity('');}}
    // Consent remains an explicit visitor action, including in the sample flow.
    document.getElementById('company').focus({preventScroll:true});document.getElementById('entry-panel').scrollIntoView({behavior:motion.matches?'instant':'smooth',block:'start'});
  });
})();
