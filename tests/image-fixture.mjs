import {deflateSync} from 'node:zlib';
export function testPng(width=16,height=16){
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return (n^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const head=Buffer.from(name),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);head.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([head,data])),result.length-4);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const pixels=Buffer.alloc((width*4+1)*height,255);for(let y=0;y<height;y++)pixels[y*(width*4+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
