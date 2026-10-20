const memory=new Map();
export function readLocal(key){try{const raw=localStorage.getItem(key);if(raw===null){memory.set(key,[]);return [];}if(raw!==null){const value=JSON.parse(raw);if(Array.isArray(value)){memory.set(key,value);return value;}}}catch{}return memory.get(key)||[];}
export function writeLocal(key,values){memory.set(key,values);try{localStorage.setItem(key,JSON.stringify(values));return true;}catch{return false;}}
export const savedKey='helpu-local-saved';
export const receiptKey='helpu-local-receipts';
export function favorites(){return [...new Set(readLocal(savedKey).filter(x=>typeof x==='string'))];}
export function toggleFavorite(id){const values=favorites(),next=values.includes(id)?values.filter(x=>x!==id):[...values,id];return {values:next,persisted:writeLocal(savedKey,next)};}
export function saveReceipt(r){const rows=readLocal(receiptKey).filter(x=>x.id!==r.id);writeLocal(receiptKey,[r,...rows].slice(0,100));}
