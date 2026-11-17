(() => {
  const id = window.MONO_SITE?.gaMeasurementId;
  // No data is sent while the client has not configured a measurement ID.
  if (!/^G-[A-Z0-9]+$/.test(id || '')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  gtag('js',new Date());
  // Only explicit campaign parameters are allowed in analytics URLs; no receipt / signed PDF tokens.
  const safe = new URL(location.origin+location.pathname);
  const query = new URLSearchParams(location.search);
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','type'].forEach(k=>{if(query.has(k))safe.searchParams.set(k,query.get(k).slice(0,160));});
  gtag('config',id,{page_location:safe.href,page_referrer:document.referrer.split('?')[0]});
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.append(script);
  document.addEventListener('mono:form-receipt',event=>{
    const {receipt,kind}=event.detail;
    const key='mono-lead-'+receipt;
    try {if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{return;}
    gtag('event','generate_lead',{form_name:kind});
  });
})();
