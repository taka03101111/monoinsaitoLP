'use strict';
// この段階ではLPの制作プレビューです。送信は行いません。
// 本番では previewMode を false にし、検証・CSRF対策を備えたAPIを設定してください。
window.MONO_CONFIG=Object.freeze({
  previewMode:true,
  contactEndpoint:null,
  downloadEndpoint:null,
  csrfEndpoint:null,
  termsUrl:null,
  privacyUrl:'https://e-autec.com/privacy/'
});
