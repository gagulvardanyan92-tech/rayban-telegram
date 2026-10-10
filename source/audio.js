import {Api} from 'telegram';
import {CustomFile} from 'telegram/client/uploads';
import {voiceBlob} from './opus';
export function installAudio({context,status,show,append}){
 const $=id=>document.getElementById(id),player=$('voicePlayer'),preview=$('recordPreview');
 const cache=new Map(),buttons=new Map();let activeId=null,loading=false,stream=null,recorder=null,parts=[],draft=null;
 let busy=false,recording=false,requesting=false,recordingError=false,serial=0,timer=null,started=0,duration=0,previewURL=null,chat=null;
 function messageInfo(message){const doc=message.media?.document;
   const attr=doc?.attributes?.find(a=>a.className==='DocumentAttributeAudio');
   return attr||/^audio\//.test(doc?.mimeType||'')?{doc,attr}:null;}
 function updateButtons(){for(const [id,b] of buttons)b.textContent=id===activeId&&!player.paused?'Пауза':'Слушать';}
 function stopPlayback(){player.pause();player.removeAttribute('src');player.load();activeId=null;updateButtons();$('audioStatus').textContent='';}
 function releaseMic(){for(const track of stream?.getTracks()||[])track.stop();stream=null;}
 function clearDraft(){preview.pause();preview.removeAttribute('src');preview.load();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;draft=null;parts=[];}
 function controls(){ $('startRecord').disabled=recording||requesting||busy||!!draft;
   $('stopRecord').disabled=!recording;$('sendVoice').disabled=!draft||busy;
   $('discardVoice').disabled=busy;$('voiceBack').disabled=busy;
   $('recordPreview').hidden=!draft;$('previewVoice').hidden=!draft;}
 function leave(){serial++;if(recorder&&recorder.state!=='inactive'){recordingError=true;recorder.stop();}releaseMic();
   clearInterval(timer);recording=false;requesting=false;clearDraft();stopPlayback();}
 function decorate(message,article){const info=messageInfo(message);if(!info)return;
   const key=String(message.id),b=document.createElement('button');b.type='button';b.textContent=key===activeId&&!player.paused?'Пауза':'Слушать';
   const hint=document.createElement('p');hint.className='muted';hint.textContent=(info.attr?.voice?'Голосовое':'Аудио')+' · '+(info.attr?.duration||0)+' сек.';
   b.onclick=async()=>{if(loading)return;if(activeId===key&&player.src){if(!player.paused){player.pause();return;}
     try{await player.play();}catch{status('Не удалось воспроизвести этот формат звука.',true);}return;}
     const current=context(),dialog=current.dialog;if(!dialog||current.demo)return;
     if(Number(info.doc.size)>16*1024*1024)return status('Для этой версии аудио должно быть не больше 16 МБ.',true);
     stopPlayback();loading=true;b.disabled=true;status('Загружаю аудио…');
     try{let url=cache.get(key+'@'+dialog.id);
       if(!url){const data=await current.client.downloadMedia(message,{});if(!data||typeof data==='string')throw new Error('Не удалось загрузить аудио');
         url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:info.doc.mimeType||'audio/ogg'}));cache.set(key+'@'+dialog.id,url);
         if(cache.size>6){const oldest=cache.keys().next().value;URL.revokeObjectURL(cache.get(oldest));cache.delete(oldest);}}
       if(context().dialog!==dialog||context().screen!=='conversation')return;
       player.src=url;activeId=key;try{await player.play();status('');}catch(err){status(err.name==='NotAllowedError'?'Аудио загружено. Нажми «Слушать» ещё раз.':'Браузер не смог воспроизвести этот формат звука.',true);}
     }catch(err){status('Не удалось загрузить аудио: '+String(err.message).slice(0,100),true);}
     finally{loading=false;b.disabled=false;updateButtons();}};
   buttons.set(key,b);article.append(hint,b);}
 player.onplay=updateButtons;player.onpause=updateButtons;player.onended=()=>{updateButtons();$('audioStatus').textContent='Прослушано';};
 player.ontimeupdate=()=>{$('audioStatus').textContent='Аудио: '+Math.floor(player.currentTime)+' / '+(Number.isFinite(player.duration)?Math.floor(player.duration):'…')+' сек.';};
 player.onerror=()=>{status('Не удалось проиграть аудио. Этот формат может не поддерживаться браузером очков.',true);updateButtons();};
 $('voiceButton').onclick=()=>{const c=context();if(c.busy)return status('Подожди завершения отправки.');
   if(c.demo)return status('Запись доступна после входа в Telegram.');
   chat=c.dialog;stopPlayback();show('voiceView');$('voiceRecipient').textContent='Кому: '+(chat.title||'Чат');
   $('recordStatus').textContent='Запись начнётся только после нажатия кнопки.';$('micLabel').textContent='';controls();};
 $('startRecord').onclick=async()=>{if(requesting||recording||busy||draft)return;
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('recordStatus').textContent='Браузер очков не предоставляет API записи микрофона. Диктовка текста этого доступа не даёт.';return;}
   const version=++serial;requesting=true;controls();$('recordStatus').textContent='Запрашиваю доступ к микрофону…';
   try{const incoming=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
     if(version!==serial){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;
     $('micLabel').textContent='Источник: '+(stream.getAudioTracks()[0]?.label||'микрофон, выбранный браузером')+'.';
     const formats=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/mp4'];const mime=formats.find(t=>MediaRecorder.isTypeSupported(t));
     if(!mime)throw new Error('Браузер не поддерживает подходящий формат записи.');
     recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});parts=[];recordingError=false;
     recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
     recorder.onerror=()=>{if(version!==serial)return;recordingError=true;releaseMic();recording=false;requesting=false;clearInterval(timer);$('recordStatus').textContent='Ошибка записи. Попробуй снова.';controls();};
     recorder.onstop=async()=>{releaseMic();clearInterval(timer);recording=false;
       if(version!==serial||recordingError){parts=[];controls();return;}
       try{const blob=new Blob(parts,{type:mime});parts=[];if(blob.size<100)throw new Error('Запись пуста.');
         $('recordStatus').textContent='Подготавливаю голосовое…';requesting=true;controls();
         const converted=await voiceBlob(blob);if(version!==serial)return;draft=converted;
         previewURL=URL.createObjectURL(draft);preview.src=previewURL;preview.load();
         $('recordStatus').textContent='Записано '+duration+' сек. Прослушай запись и реши, отправлять ли её.';
       }catch(err){$('recordStatus').textContent=String(err.message);}
       finally{if(version===serial){requesting=false;controls();}}};
     started=Date.now();duration=0;recorder.start(250);recording=true;
     timer=setInterval(()=>{duration=Math.max(1,Math.ceil((Date.now()-started)/1000));$('recordStatus').textContent='Идёт запись: '+duration+' / 120 сек.';if(duration>=120)stopRecording();},250);
   }catch(err){releaseMic();$('recordStatus').textContent=/NotAllowed|Security/.test(err.name)?'Доступ к микрофону не предоставлен. Проверь разрешение сайта. Если очки не поддерживают запись в Web Apps, понадобится отдельное приложение для телефона.':
     /NotFound/.test(err.name)?'Браузер не предоставил ни одного микрофона (NotFoundError). На очках системная диктовка не даёт веб-приложению доступ к записи. Для записи может потребоваться отдельная интеграция с телефоном.':'Не удалось начать запись: '+String(err.message).slice(0,120);}
   finally{if(version===serial){requesting=false;controls();}}};
 function stopRecording(){if(!recording||!recorder)return;duration=Math.max(1,Math.ceil((Date.now()-started)/1000));recording=false;requesting=true;controls();recorder.stop();releaseMic();clearInterval(timer);}
 $('stopRecord').onclick=stopRecording;
 $('previewVoice').onclick=async()=>{if(!draft)return;if(!preview.paused){preview.pause();$('previewVoice').textContent='Прослушать запись';return;}
   try{await preview.play();$('previewVoice').textContent='Пауза';}catch{$('recordStatus').textContent='Этот браузер не смог проиграть запись. Можно отменить её.';}};
 preview.onended=()=>{$('previewVoice').textContent='Прослушать запись';};
 $('discardVoice').onclick=()=>{if(busy)return;leave();$('previewVoice').textContent='Прослушать запись';$('recordStatus').textContent='Запись удалена. Можно записать заново.';controls();};
 $('voiceBack').onclick=()=>{if(busy)return;leave();show('conversation');};
 $('sendVoice').onclick=async()=>{if(!draft||busy||!chat)return;const c=context();if(c.dialog!==chat)return;
   busy=true;preview.pause();controls();$('recordStatus').textContent='Отправляю голосовое…';
   try{const ext=/mp4/.test(draft.type)?'m4a':'ogg';
     // GramJS routes native File objects through its generic media conversion.
     const bytes=Buffer.from(await draft.arrayBuffer());
     const file=new CustomFile('voice.'+ext,bytes.length,'',bytes);
     const sent=await c.client.sendFile(chat.inputEntity,{file,voiceNote:true,workers:1,attributes:[new Api.DocumentAttributeAudio({voice:true,duration})],
       progressCallback:progress=>{$('recordStatus').textContent='Отправляю: '+Math.round(Number(progress)*100)+'%';}});
     append(sent);busy=false;leave();show('conversation');status('Голосовое отправлено.');
   }catch(err){$('recordStatus').textContent='Отправка не подтверждена: '+String(err.errorMessage||err.message).slice(0,100)+'. Запись сохранена. Проверь чат перед повторной отправкой.';}
   finally{busy=false;controls();}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording){stopRecording();}});
 window.addEventListener('pagehide',()=>{leave();for(const url of cache.values())URL.revokeObjectURL(url);cache.clear();});
 return {decorate,beginRender:()=>buttons.clear(),leave,isBusy:()=>busy};
}
