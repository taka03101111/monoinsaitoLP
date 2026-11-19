'use strict';
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
const header = document.querySelector('.header');
// Keep anchor destinations below the header when its font metrics change.
const updateHeaderHeight = () => {
  document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
};
updateHeaderHeight();
if ('ResizeObserver' in window) {
  new ResizeObserver(updateHeaderHeight).observe(header);
} else {
  window.addEventListener('resize', updateHeaderHeight);
}
const closeNavigation = () => {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
};
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) {
    closeNavigation();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeNavigation();
    menu.focus();
  }
});
window.matchMedia('(max-width:1200px)').addEventListener('change', event => {
  if (!event.matches) closeNavigation();
});

