// Remux browser WebM/Opus into Ogg/Opus without decoding or sending audio elsewhere.
export async function voiceBlob(blob){
 if(/ogg|mp4/i.test(blob.type))return blob;
 if(!/webm/i.test(blob.type))throw new Error('Браузер записал неподдерживаемый формат звука.');
 const data=new Uint8Array(await blob.arrayBuffer()),packets=[],tracks=[];
 function vint(offset,keep=false){const first=data[offset];if(!first)throw new Error('Повреждён WebM');let length=1,mask=128;
   while(!(first&mask)&&length<8){mask>>=1;length++;}
   let value=keep?first:first&(mask-1),unknown=!keep&&value===mask-1;
   for(let i=1;i<length;i++){if(offset+i>=data.length)throw new Error('Обрезан WebM');value=value*256+data[offset+i];unknown=unknown&&data[offset+i]===255;}
   return {value,length,unknown};}
 const masters=new Set([0x18538067,0x1654ae6b,0xae,0x1f43b675,0xa0]);
 function walk(start,end,track=null,depth=0){if(depth>8)throw new Error('Неподдерживаемый WebM');
   for(let p=start;p<end;){const id=vint(p,true);p+=id.length;const size=vint(p);p+=size.length;
     const stop=size.unknown?end:p+size.value;if(stop>end||stop<p)throw new Error('Обрезан WebM');
     if(masters.has(id.value)){const entry=id.value===0xae?{}:track;walk(p,stop,entry,depth+1);if(id.value===0xae)tracks.push(entry);}
     else if(track&&id.value===0xd7){let n=0;for(const x of data.subarray(p,stop))n=n*256+x;track.number=n;}
     else if(track&&id.value===0x86)track.codec=new TextDecoder().decode(data.subarray(p,stop));
     else if(track&&id.value===0x63a2)track.head=data.slice(p,stop);
     else if(id.value===0xa3||id.value===0xa1){const n=vint(p);const flags=data[p+n.length+2];
       if(flags&6)throw new Error('Этот формат записи (WebM lacing) пока не поддерживается.');
       packets.push({track:n.value,bytes:data.slice(p+n.length+3,stop)});}
     p=stop;}}
 walk(0,data.length);const track=tracks.find(t=>t.codec==='A_OPUS');
 const audio=packets.filter(p=>p.track===track?.number).map(p=>p.bytes);
 if(!track?.head||!audio.length)throw new Error('В записи не найден звук Opus.');
 const head=track.head,pages=[];let sequence=0,granule=0;
 const serial=crypto.getRandomValues(new Uint32Array(1))[0];
 function page(packet,flags,samples){const count=Math.floor(packet.length/255)+1;if(count>255)throw new Error('Слишком большой пакет Opus');
   const result=new Uint8Array(27+count+packet.length),view=new DataView(result.buffer);
   result.set([79,103,103,83,0,flags]);view.setUint32(6,samples>>>0,true);view.setUint32(10,Math.floor(samples/4294967296),true);
   view.setUint32(14,serial,true);view.setUint32(18,sequence++,true);result[26]=count;
   for(let i=0;i<count;i++)result[27+i]=Math.min(255,packet.length-i*255);result.set(packet,27+count);
   let crc=0;for(const x of result){crc^=x<<24;for(let bit=0;bit<8;bit++)crc=crc&0x80000000?(crc<<1)^0x04c11db7:crc<<1;}
   view.setUint32(22,crc>>>0,true);pages.push(result);}
 page(head,2,0);const vendor=new TextEncoder().encode('Display Chat'),tags=new Uint8Array(16+vendor.length);
 tags.set(new TextEncoder().encode('OpusTags'));new DataView(tags.buffer).setUint32(8,vendor.length,true);tags.set(vendor,12);page(tags,0,0);
 for(let i=0;i<audio.length;i++){const p=audio[i];if(!p.length)continue;const config=p[0]>>3;
   const per=config>=16?120<<(config&3):config>=12?480<<(config&1):[480,960,1920,2880][config&3];
   const code=p[0]&3,frames=code===0?1:code===3?p[1]&63:2;
   if(!frames||per*frames>5760)throw new Error('Повреждён пакет Opus');granule+=per*frames;page(p,i===audio.length-1?4:0,granule);}
 return new Blob(pages,{type:'audio/ogg'});
}
