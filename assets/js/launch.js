(() => {
  const config = window.MONO_SITE;
  if (config?.loginEnabled && Date.now() >= Date.parse(config.loginNotBefore)) {
    document.querySelectorAll('.saas-login').forEach(link => { link.href = config.loginUrl; link.hidden = false; });
  }
  const cycle = document.querySelector('.gear-cycle');
  if (cycle) {
    const stages = [...cycle.querySelectorAll('.gear-stage')];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const highlight = () => {
      if (!visible) return;
      const r = cycle.getBoundingClientRect();
      const progress = Math.max(0, Math.min(.999, (innerHeight-r.top)/(innerHeight+r.height)));
      stages.forEach((stage,i) => stage.classList.toggle('is-current', i === Math.floor(progress*5)));
    };
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; cycle.classList.toggle('in-view',visible && !document.hidden); highlight(); }).observe(cycle);
    addEventListener('scroll',highlight,{passive:true});
    document.addEventListener('visibilitychange',()=>cycle.classList.toggle('in-view',visible && !document.hidden));
    reduced.addEventListener('change',highlight);
  }
  if (config?.demoMode === 'sample') {
    document.getElementById('demoActionLabel').textContent = 'サンプルで編集を体験する';
    document.getElementById('demoActionHint').textContent = '字幕・表示時間・手順を編集し、PDFに保存できます。';
    document.getElementById('openLiveSample').hidden = true;
    document.querySelector('.live-demo-copy>h3').innerHTML = '動画マニュアルの<br>編集を、体験。';
    document.querySelector('.live-demo-copy>p').textContent = '現在はサンプルで編集機能をお試しいただけます。自分の動画のAI解析は準備中です。';
    document.querySelector('.live-demo-tags').innerHTML = '<span>字幕・手順を編集</span><span>PDF保存</span><span>サンプルは何度でも</span>';
    document.querySelector('.live-demo-bottom>span').textContent = 'サンプル編集 / AI解析は準備中';
    document.querySelector('.demo-link').innerHTML = '<span class="play-small">▶</span> サンプルでデモを試す';
    document.getElementById('demoDataPolicy').textContent = 'データの取り扱い：サンプル体験では動画をアップロードしません。AI解析機能は準備中です。';
    document.getElementById('demoUsePolicy').textContent = 'サンプルは何度でも編集・PDF保存できます。AI解析は公開後、90秒以内の素材・1回までの提供を予定しています。';
  }
})();
