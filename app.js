'use strict';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('open', open); });
navigation.addEventListener('click', e => { if(e.target.closest('a')) { navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && navigation.classList.contains('open')) { navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus(); } });
let heroIndex = 0, heroTimer = null;
const heroTexts = ['作業前の安全を確認する','固定ボルトを対角順に緩める','治具の落下・挟まれに注意する'];
const pauseButton = document.querySelector('#hero-pause');
function setHeroPlaying(playing) {
 clearInterval(heroTimer); heroTimer = null;
 document.querySelector('.hero-visual').classList.toggle('animation-paused',!playing);
 pauseButton.innerHTML = playing ? 'Ⅱ <span>アニメーション停止</span>' : '▶ <span>アニメーション再生</span>';
 pauseButton.setAttribute('aria-label',playing?'トップのアニメーションを停止':'トップのアニメーションを再生');
 if(playing) heroTimer = setInterval(() => {heroIndex=(heroIndex+1)%3; document.querySelector('#hero-step-number').textContent=`手順 0${heroIndex+1}`; document.querySelector('#hero-caption').textContent=heroTexts[heroIndex];document.querySelectorAll('.step-chips span').forEach((el,i)=>el.classList.toggle('active',i===heroIndex));},4000);
}
pauseButton.addEventListener('click',()=>setHeroPlaying(!heroTimer));
setHeroPlaying(!reducedMotion.matches);
const screens = [
 `<div class="demo-content-inner"><div class="demo-upload"><span class="upload-symbol">↑</span><strong>まずは、作業動画を一本。</strong><p>スマホで撮った動画に、<br>作業の概要や標準書を添えて。</p><div class="sample-file"><span>▣ 段取り替え_サンプル.mp4</span><b>✓</b></div></div></div>`,
 `<div class="demo-content-inner demo-analysis"><div class="demo-picture"><img src="assets/images/manual-player.webp" alt="サンプルの段取り替え動画"></div><div><p class="analysis-title">✦ 作業の切れ目を手順に</p><div class="analysis-step"><b>01</b><span>安全を確認する</span></div><div class="analysis-step"><b>02</b><span>固定ボルトを緩める</span></div><div class="analysis-step"><b>03</b><span>治具を取り外す</span></div><p class="analysis-note">手順・字幕・急所の下書きイメージ。<br>実際のAI解析は行っていません。</p></div></div>`,
 `<div class="demo-content-inner demo-edit-screen"><img src="assets/images/manual-edit.webp" alt="monoインサイトの実際の編集画面"><div><span class="tag">字幕の編集を体験</span><h4>伝わる言葉に、仕上げる。</h4><label for="demo-caption">手順 02 の字幕</label><input id="demo-caption" value="固定ボルトを緩める" maxlength="50"><p>文字を打ち直せます。<br>このサンプルは保存されません。</p><span class="tag">⚠ 急所：対角順に緩める</span></div></div>`,
 `<div class="demo-content-inner share-layout"><div class="share-preview"><div class="share-symbol">↗</div><h4>現場へ、すぐ届ける。</h4><p>QRコードでマニュアルを配布。<br>必要な場所で、何度でも確認。</p></div><div class="completion-list"><strong>受講状況のイメージ</strong><p><span>作業者 A</span><b>✓ 視聴完了</b></p><p><span>作業者 B</span><b>✓ 視聴完了</b></p><p><span>作業者 C</span><span>受講中</span></p><p>サンプルデータ</p></div></div>`
];
let currentStep = 0, demoTimer = null;
const stage = document.querySelector('#demo-content');
const play = document.querySelector('#demo-play');
function showStep(index) {currentStep=index; stage.innerHTML=screens[index];document.querySelectorAll('.demo-step').forEach((el,i)=>{el.classList.toggle('active',i===index);el.setAttribute('aria-pressed',String(i===index));});document.querySelector('#demo-counter').textContent=`0${index+1} / 04`;document.querySelector('#demo-progress').style.width=`${(index+1)*25}%`;}
function setDemoPlaying(playing) {clearInterval(demoTimer);demoTimer=null; play.innerHTML=playing?'Ⅱ <span>停止</span>':'▶ <span>自動再生</span>';play.setAttribute('aria-label',playing?'操作デモの自動再生を停止':'操作デモを自動再生');if(playing)demoTimer=setInterval(()=>showStep((currentStep+1)%4),5000);}
document.querySelectorAll('.demo-step').forEach(el=>el.addEventListener('click',()=>{setDemoPlaying(false);showStep(Number(el.dataset.step));}));
play.addEventListener('click',()=>setDemoPlaying(!demoTimer));
stage.addEventListener('focusin',()=>setDemoPlaying(false));
showStep(0);
const caption = document.querySelector('#caption-example');
caption.addEventListener('input',()=>{document.querySelector('#caption-hint').textContent=caption.value.trim()?'✓ サンプルの字幕を変更しました（保存されません）':'字幕を入力してください';});
const warning = document.querySelector('#add-warning');
warning.addEventListener('click',()=>{const active=warning.getAttribute('aria-pressed')!=='true';warning.setAttribute('aria-pressed',String(active));document.querySelector('#warning-marker').hidden=!active;warning.textContent=active?'− 注意マークを外す':'＋ 注意マークを置く';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){setHeroPlaying(false);setDemoPlaying(false);}});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){setHeroPlaying(false);setDemoPlaying(false);}});
