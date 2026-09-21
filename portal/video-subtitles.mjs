const fail=()=>{throw Object.assign(new Error('Legenda SRT inválida. Use tempos crescentes, até 120 entradas, 140 caracteres por entrada e dentro da duração do vídeo.'),{state:'blocked',status:400});};
export function parseVideoSubtitles(raw,duration=30){
 if(raw===undefined||raw===null||raw==='')return [];
 if(typeof raw!=='string'||raw.length>24000||!Number.isFinite(duration)||duration<=0)fail();
 const blocks=raw.replace(/^\uFEFF/,'').replaceAll('\r','').trim().split(/\n\s*\n/);if(blocks.length>120)fail();
 const stamp=s=>{const m=/^(\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(s);if(!m)fail();return +m[1]*3600 + +m[2]*60 + +m[3]+ +m[4]/1000;};let previous=0;
 return blocks.map(block=>{const lines=block.split('\n');if(/^\d+$/.test(lines[0]))lines.shift();const times=lines.shift()?.split(/\s+-->\s+/);if(times?.length!==2)fail();const start=stamp(times[0]),end=stamp(times[1]),text=lines.join('\n').trim();if(start<previous||end<=start||end>duration+.01||!text||text.length>140||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail();previous=end;return {start,end,text};});
}
