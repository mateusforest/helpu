// A same-origin document restores the Strict session cookie after an external login/payment.
const incoming=new URLSearchParams(location.search),destination=new URL('/portal.html',location.origin);
const company=incoming.get('company');if(company&&/^[\w-]{1,100}$/.test(company))destination.searchParams.set('company',company);
const connection=incoming.get('connection');
if(['connected','cancelled','failed'].includes(connection)){destination.searchParams.set('connection',connection);destination.hash='/integrations';}
else destination.hash='/account';
document.querySelector('#return-link').href=destination.href;
location.replace(destination.href);
