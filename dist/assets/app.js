'use strict';
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('#mobile-menu');
function closeMenu(){if(!menuButton||!mobileMenu)return;menuButton.setAttribute('aria-expanded','false');mobileMenu.hidden=true;menuButton.setAttribute('aria-label','Abrir menu');}
menuButton?.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')==='true';menuButton.setAttribute('aria-expanded',String(!open));mobileMenu.hidden=open;menuButton.setAttribute('aria-label',open?'Abrir menu':'Fechar menu');});
mobileMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton?.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
const tabs=[...document.querySelectorAll('.operation-tab')];
function selectTab(index,focus=false){tabs.forEach((tab,i)=>{const selected=i===index;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected;});if(focus)tabs[index].focus();}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(index));tab.addEventListener('keydown',event=>{let next=index;if(['ArrowDown','ArrowRight'].includes(event.key))next=(index+1)%tabs.length;else if(['ArrowUp','ArrowLeft'].includes(event.key))next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectTab(next,true);});});
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const video=document.querySelector('.hero-art video');
const motionButton=document.querySelector('.motion-toggle');
let motionManuallyPaused=false;
let motionInView=true;
let motionUnavailable=false;
function updateVideoPlayback(){if(!video||motionUnavailable)return;if(reduceMotion.matches||document.hidden||motionManuallyPaused||!motionInView){video.pause();}else{video.play().catch(error=>{if(error.name!=='AbortError')motionManuallyPaused=true;updateMotionLabel();});}if(motionButton)motionButton.hidden=reduceMotion.matches;updateMotionLabel();}
function updateMotionLabel(){if(!motionButton||!video)return;motionButton.setAttribute('aria-label',video.paused?'Reproduzir animação':'Pausar animação');motionButton.innerHTML=video.paused?'<span aria-hidden="true">▶</span>':'<span aria-hidden="true">Ⅱ</span>';}
motionButton?.addEventListener('click',()=>{motionManuallyPaused=!video.paused;updateVideoPlayback();});
reduceMotion.addEventListener('change',updateVideoPlayback);
document.addEventListener('visibilitychange',updateVideoPlayback);
if(video){video.addEventListener('play',updateMotionLabel);video.addEventListener('pause',updateMotionLabel);video.addEventListener('error',()=>{motionUnavailable=true;video.hidden=true;motionButton.hidden=true;});if('IntersectionObserver' in window)new IntersectionObserver(entries=>{motionInView=entries[0].isIntersecting;updateVideoPlayback();},{rootMargin:'160px'}).observe(video.parentElement);updateVideoPlayback();}
