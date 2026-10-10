import {TelegramClient, Api} from 'telegram';
import {StringSession} from 'telegram/sessions';
import {Logger} from 'telegram/extensions/Logger';
import {installKeyboard} from './keyboard';
import {installAudio} from './audio';

const $ = id => document.getElementById(id);
const storageKey = 'tg-glasses-session-v1';
let client, credentials, dialogs=[], activeDialog=null, messages=[], demo=false,voiceUI=null;
let screen='setup', authPending=null, importing=null, refreshing=false, sending=false, generation=0;
let draft='', filterValue='',transferHash='';
const drafts=new Map();
const demoDialogs=[{id:'1',title:'Пример: Анна',unreadCount:1,message:{message:'Это пример переписки, не настоящий чат.'}},
 {id:'2',title:'Пример: Семья',unreadCount:0,message:{message:'Здесь появятся твои чаты после входа.'}}];
const demoMessages=[{id:1,out:false,message:'Привет! Это демонстрация интерфейса.',date:Math.floor(Date.now()/1000)-90},
 {id:2,out:true,message:'Нажми на поле ответа: в очках должна открыться системная диктовка.',date:Math.floor(Date.now()/1000)-60}];

function status(text='',error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function show(name){if((screen==='voiceView'&&name!=='voiceView')||(screen==='conversation'&&name!=='conversation'))voiceUI?.leave();
 screen=name;for(const id of ['setup','auth','chats','conversation','settings','importView','voiceView'])$(id).hidden=id!==name;
 $('brand').hidden=name==='conversation';$('footnote').hidden=['conversation','chats'].includes(name);}
function errorText(e){const code=String(e?.errorMessage||e?.message||'Ошибка соединения');
 if(/FLOOD_WAIT/.test(code))return 'Telegram просит подождать '+(code.match(/\d+/)?.[0]||'несколько')+' секунд. Не запрашивай код повторно.';
 if(/API_ID_INVALID|API_HASH_INVALID/.test(code))return 'Проверь API ID и API Hash на my.telegram.org.';
 if(/PHONE_CODE_INVALID/.test(code))return 'Неверный код. Введи последний код, полученный от Telegram.';
 if(/PHONE_CODE_EXPIRED/.test(code))return 'Код истёк. Отмени вход и начни заново.';
 if(/PASSWORD_HASH_INVALID/.test(code))return 'Неверный пароль двухэтапной проверки.';
 if(/PHONE_NUMBER_INVALID/.test(code))return 'Проверь телефон: нужен международный формат с + и кодом страны.';
 if(/AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED/.test(code))return 'Сессия больше не действует. Выполни вход заново.';
 if(/CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_ADMIN_REQUIRED/.test(code))return 'В этот чат нельзя отправить сообщение с твоего аккаунта.';
 if(/timeout|TIMEOUT|network|WebSocket|connect/i.test(code))return 'Не удалось соединиться с Telegram. Проверь интернет и попробуй ещё раз.';
 return 'Ошибка Telegram: '+code.slice(0,180);}
function rememberSession(wanted){$('saveSession').checked=wanted;
 if(!wanted){localStorage.removeItem(storageKey);return;}
 try{localStorage.setItem(storageKey,JSON.stringify({...credentials,session:client.session.save(),transferHash}));}
 catch{status('Не удалось сохранить вход. Он останется только до закрытия страницы.',true);$('saveSession').checked=false;}}
function normalizeSession(session){const hosts={1:'pluto',2:'venus',3:'aurora',4:'vesta',5:'flora'};
 if(session.dcId&&hosts[session.dcId])session.setDC(session.dcId,hosts[session.dcId]+'.web.telegram.org',443);return session;}
async function createClient(config){if(client)await client.disconnect().catch(()=>{});
 const session=normalizeSession(new StringSession(config.session||''));
 client=new TelegramClient(session,Number(config.apiId),config.apiHash,{useWSS:true,connectionRetries:3,requestRetries:2,
   retryDelay:1000,timeout:12,floodSleepThreshold:0,deviceModel:'Display Web App',systemVersion:'Web',appVersion:'0.1.0',
   baseLogger:new Logger('none')});
 client.onError=()=>{if(screen==='chats'||screen==='conversation')status('Связь с Telegram прервалась. Попробуй «Обновить».',true);};
 return client;}
function ask(title,hint,label,type='text'){
 if(authPending)throw new Error('Previous auth step pending');
 show('auth');$('authTitle').textContent=title;$('authHint').textContent=hint;$('authLabel').textContent=label;
 $('authInput').type=type;$('authInput').inputMode=type==='password'?'text':'numeric';$('authInput').value='';
 $('authInput').focus();$('authSubmit').disabled=false;
 return new Promise((resolve,reject)=>{authPending={resolve,reject};});}
$('authForm').addEventListener('submit',e=>{e.preventDefault();const value=$('authInput').value.trim();if(!value||!authPending)return;
 const pending=authPending;authPending=null;$('authInput').value='';$('authSubmit').disabled=true;status('Проверяю…');pending.resolve(value);});
$('authCancel').onclick=async()=>{generation++;if(authPending){authPending.reject(new Error('AUTH_CANCELLED'));authPending=null;}
 if(client)await client.disconnect().catch(()=>{});show('setup');$('login').disabled=false;status('Вход отменён.');};
$('setupForm').addEventListener('submit',async e=>{e.preventDefault();if($('login').disabled)return;
 const apiId=$('apiId').value.trim(),apiHash=$('apiHash').value.trim(),phone=$('phone').value.replace(/[\s()-]/g,'');
 if(!/^\d+$/.test(apiId)||!Number.isSafeInteger(Number(apiId))||Number(apiId)<=0||!/^[a-f0-9]{32}$/i.test(apiHash))return status('Нужны числовой API ID и API Hash из 32 символов.',true);
 if(!/^\+\d{7,15}$/.test(phone))return status('Введи телефон с + и кодом страны.',true);
 const run=++generation;credentials={apiId:Number(apiId),apiHash};transferHash='';demo=false;$('login').disabled=true;status('Подключаюсь к Telegram…');
 try{await createClient(credentials);await client.start({phoneNumber:async()=>phone,
   phoneCode:async isApp=>ask('Код входа',isApp?'Открой официальный Telegram на телефоне. Код придёт в служебный чат Telegram.':'Введи код, полученный от Telegram.','Код от Telegram'),
   password:async()=>ask('Двухэтапная проверка','Введи свой облачный пароль Telegram.','Пароль Telegram','password'),
   onError:async err=>{if(run!==generation||/AUTH_CANCELLED/.test(String(err)))return true;
     status(errorText(err),true);return !/PHONE_CODE_INVALID|PASSWORD_HASH_INVALID/.test(String(err));}});
   if(run!==generation)return;
   if(!await client.checkAuthorization())throw new Error('Вход не завершён. Попробуй ещё раз.');
   rememberSession($('remember').checked);$('apiHash').value='';await enterChats();
 }catch(err){if(run===generation){status(errorText(err),true);show('setup');}}
 finally{if(run===generation)$('login').disabled=false;}
});

function summary(message){if(!message)return 'Нет сообщений';if(message.message)return message.message;
 const audio=message.media?.document?.attributes?.find(a=>a.className==='DocumentAttributeAudio');if(audio)return audio.voice?'[Голосовое сообщение]':'[Аудио]';
 const kind=message.media?.className||'';return /Photo/.test(kind)?'[Фото]':/Document/.test(kind)?'[Файл или голосовое сообщение]':'[Служебное сообщение]';}
function renderDialogs(){const term=filterValue.toLocaleLowerCase('ru');const list=$('chatList');list.replaceChildren();
 const filtered=dialogs.filter(d=>String(d.title||'Без названия').toLocaleLowerCase('ru').includes(term));
 for(const d of filtered){const b=document.createElement('button');b.className='chat';
   const strong=document.createElement('strong');strong.textContent=d.title||'Без названия';
   if(d.unreadCount){const badge=document.createElement('span');badge.className='badge';badge.textContent='• '+d.unreadCount;strong.append(badge);}
   const preview=document.createElement('span');preview.className='preview';preview.textContent=summary(d.message);
   b.append(strong,preview);b.onclick=()=>openChat(d);list.append(b);}
 if(!filtered.length){const p=document.createElement('p');p.textContent=term?'Нет совпадений среди загруженных чатов.':'Пока нет доступных чатов.';list.append(p);}}
async function enterChats(){show('chats');status(demo?'Демонстрация: сообщения не отправляются в Telegram.':'Загружаю чаты…');await refreshDialogs();}
async function refreshDialogs(){if(refreshing)return;refreshing=true;$('refresh').disabled=true;
 try{dialogs=demo?demoDialogs:await client.getDialogs({limit:60});renderDialogs();
 status(demo?'Демонстрация. Для своих переписок выполни вход.':'Загружено чатов: '+dialogs.length+'.');
 }catch(err){status(errorText(err),true);}finally{refreshing=false;$('refresh').disabled=false;}}
$('refresh').onclick=refreshDialogs;
for(const event of ['input','change','blur','compositionend'])$('filter').addEventListener(event,()=>{filterValue=$('filter').value;renderDialogs();});
$('demo').onclick=()=>{demo=true;credentials=null;$('filter').value='';filterValue='';enterChats();};
function renderMessages(preserve=false){const thread=$('thread'),oldHeight=thread.scrollHeight,oldTop=thread.scrollTop;
 voiceUI?.beginRender();
 const atBottom=oldHeight-oldTop-thread.clientHeight<70;thread.replaceChildren();
 for(const m of messages){const article=document.createElement('article');article.className='message'+(m.out?' own':'');
   const meta=document.createElement('div');meta.className='meta';
   const name=m.out?'Ты':activeDialog?.isGroup||activeDialog?.isChannel?'Участник':'Собеседник';
   const when=m.date?new Date(m.date*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}):'';
   meta.textContent=name+(when?' · '+when:'');const p=document.createElement('p');p.textContent=summary(m);article.append(meta,p);voiceUI?.decorate(m,article);thread.append(article);}
 if(!messages.length){const p=document.createElement('p');p.textContent='Сообщений пока нет.';thread.append(p);}
 if(!preserve||atBottom)thread.scrollTop=thread.scrollHeight;else thread.scrollTop=oldTop;
}
async function openChat(dialog){if(screen==='conversation')return;activeDialog=dialog;const token=++generation;
 show('conversation');$('chatTitle').textContent=dialog.title||'Чат';$('thread').replaceChildren();
 draft=drafts.get(String(dialog.id))||'';$('reply').value=draft;messages=[];status('Загружаю сообщения…');$('send').disabled=true;
 try{const result=demo?demoMessages.map(m=>({...m})):Array.from(await client.getMessages(dialog.inputEntity,{limit:30})).reverse();
   if(token!==generation)return;messages=result;renderMessages();status(demo?'Пример переписки.':'');
 }catch(err){if(token===generation)status(errorText(err),true);}finally{if(token===generation)$('send').disabled=false;}}
function back(){if(sending||voiceUI?.isBusy())return status('Подожди завершения отправки.');generation++;activeDialog=null;show('chats');status(demo?'Демонстрация.':'');$('filter').value=filterValue;renderDialogs();}
$('back').onclick=back;
for(const event of ['input','change','blur','compositionend'])$('reply').addEventListener(event,()=>{const value=$('reply').value;
 draft=value;if(activeDialog)drafts.set(String(activeDialog.id),value);});
$('send').onclick=async()=>{if(sending||!activeDialog)return;
 sending=true;$('send').disabled=true;
 // Read the field after the dictation composer has committed the value; keep a draft until success.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const text=($('reply').value||draft).trim();if(!text){sending=false;$('send').disabled=false;return status('Сначала продиктуй ответ в поле выше.',true);}
 const dialog=activeDialog;status('Отправляю…');
 try{if(demo){messages.push({id:Date.now(),out:true,message:text,date:Math.floor(Date.now()/1000)});}
 else{const sent=await client.sendMessage(dialog.inputEntity,{message:text});messages.push(sent);}
   renderMessages();if($('reply').value.trim()===text){$('reply').value='';draft='';drafts.delete(String(dialog.id));}
   status(demo?'Добавлено только в пример.':'Отправлено.');
 }catch(err){status(errorText(err)+' Текст ответа сохранён.',true);}finally{sending=false;$('send').disabled=false;}};
$('loadOlder').onclick=async()=>{if(!activeDialog||!messages.length)return;const dialog=activeDialog,token=generation,button=$('loadOlder');button.disabled=true;
 const scroll=$('thread').scrollTop,height=$('thread').scrollHeight;
 try{if(demo)return status('В примере показаны все сообщения.');
   const older=Array.from(await client.getMessages(dialog.inputEntity,{limit:30,offsetId:messages[0].id})).reverse();
   if(token!==generation)return;if(!older.length)return status('Больше сообщений нет.');
   messages=[...older,...messages];renderMessages(true);$('thread').scrollTop=scroll+$('thread').scrollHeight-height;
 }catch(err){status(errorText(err),true);}finally{button.disabled=false;}};
let polling=false;
setInterval(async()=>{if(document.hidden||screen!=='conversation'||demo||sending||polling||!activeDialog)return;
 const token=generation,dialog=activeDialog;polling=true;
 try{const latest=Array.from(await client.getMessages(dialog.inputEntity,{limit:30})).reverse();if(token!==generation)return;
   const cutoff=latest[0]?.id||Infinity;
   const merged=[...messages.filter(m=>m.id<cutoff),...latest];
   if(JSON.stringify(messages.map(m=>[m.id,m.message]))!==JSON.stringify(merged.map(m=>[m.id,m.message]))){messages=merged;renderMessages(true);}
 }catch{if(token===generation)status('Нет обновлений: проверь соединение. Ответ можно повторить вручную.',true);}finally{polling=false;}
},12000);

$('settingsButton').onclick=()=>{if(demo){demo=false;dialogs=[];show('setup');status('Войди, чтобы открыть свои чаты.');return;}
 $('transferPassword').value='';$('transferLink').value='';$('transferResult').hidden=true;show('settings');status('');};
$('settingsBack').onclick=()=>{show('chats');status('');};
$('saveSession').onchange=()=>rememberSession($('saveSession').checked);
function bytes64(bytes){let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function from64(s){if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>20000)throw new Error('Некорректная ссылка переноса');
 return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function tokenHash(token){return bytes64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));}
async function keyFor(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
$('makeTransfer').onclick=async()=>{const password=$('transferPassword').value;if(password.length<8)return status('Задай пароль минимум из 8 символов.',true);
 if(!/^https?:$/.test(location.protocol))return status('Сначала опубликуй приложение на GitHub Pages и войди по его HTTPS-ссылке на телефоне.',true);
 if(!client||!credentials)return;const b=$('makeTransfer');b.disabled=true;status('Защищаю ссылку…');
 try{const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
   const payload={...credentials,session:client.session.save(),created:Date.now(),v:1};
   const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFor(password,salt),new TextEncoder().encode(JSON.stringify(payload)));
   const token=[bytes64(salt),bytes64(iv),bytes64(new Uint8Array(encrypted))].join('.');
   const base=new URL(location.href);base.search='?v=7';base.hash='import='+token;
   $('transferLink').value=base.href;$('transferResult').hidden=false;$('transferPassword').value='';status('Ссылка готова. Добавь её в Meta AI → Web Apps.');
 }catch{status('Не удалось создать ссылку. Открой приложение через HTTPS в обычном браузере.',true);}finally{b.disabled=false;}};
$('copyTransfer').onclick=async()=>{try{await navigator.clipboard.writeText($('transferLink').value);status('Скопировано. Пароль помни отдельно.');}
 catch{$('transferLink').focus();$('transferLink').select();status('Выделил ссылку. Скопируй её через меню браузера.');}};
$('importForm').addEventListener('submit',async e=>{e.preventDefault();if(!importing)return;const b=$('importSubmit');b.disabled=true;status('Открываю защищённый вход…');
 try{const parts=importing.split('.');if(parts.length!==3)throw new Error('TRANSFER');
   const [salt,iv,data]=parts.map(from64);const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv},await keyFor($('importPassword').value,salt),data);
   const config=JSON.parse(new TextDecoder().decode(decrypted));
   if(config.v!==1||!Number.isSafeInteger(config.apiId)||!/^[a-f\d]{32}$/i.test(config.apiHash)||typeof config.session!=='string')throw new Error('TRANSFER');
   if(!Number.isFinite(config.created)||Date.now()-config.created>86400000)throw new Error('EXPIRED_TRANSFER');
   credentials={apiId:config.apiId,apiHash:config.apiHash};demo=false;status('Подключаюсь к Telegram…');
   await createClient(config);await client.connect();if(!await client.checkAuthorization())throw new Error('SESSION_REVOKED');
   transferHash=await tokenHash(importing);rememberSession($('importRemember').checked);importing=null;$('importPassword').value='';await enterChats();
 }catch(err){status(/OperationError|TRANSFER/.test(String(err))?'Пароль не подошёл или ссылка повреждена. Создай новую ссылку на телефоне.':errorText(err),true);}
 finally{b.disabled=false;}});
$('importCancel').onclick=()=>{importing=null;$('importPassword').value='';show('setup');status('Перенос отменён.');};
$('logout').onclick=async()=>{if(!confirm('Завершить эту сессию Telegram? Перенесённый в очки вход тоже перестанет работать.'))return;
 try{if(client)await client.invoke(new Api.auth.LogOut());localStorage.removeItem(storageKey);if(client)await client.disconnect();
   credentials=null;client=null;dialogs=[];messages=[];drafts.clear();$('transferLink').value='';show('setup');status('Сессия завершена.');
 }catch(err){status(errorText(err)+' Для завершения используй Telegram → Настройки → Устройства.',true);}};
document.addEventListener('keydown',e=>{if(e.isComposing||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 if(e.key==='Escape'){if(screen==='conversation'){e.preventDefault();back();}else if(screen==='voiceView'){e.preventDefault();$('voiceBack').click();}else if(screen==='settings'){e.preventDefault();$('settingsBack').click();}return;}
 if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;
 if(document.activeElement===$('thread'))return;
 const visible=Array.from(document.querySelectorAll('button,input,textarea,a,[tabindex="0"]')).filter(el=>el.getClientRects().length&&!el.disabled);
 const index=visible.indexOf(document.activeElement),direction=['ArrowDown','ArrowRight'].includes(e.key)?1:-1;
 const next=visible[Math.max(0,Math.min(visible.length-1,index+direction))];if(next){e.preventDefault();next.focus();next.scrollIntoView({block:'nearest'});}
});
window.addEventListener('error',()=>status('Ошибка приложения. Закрой и открой страницу. Если повторится, сообщи, на каком шаге.',true));
window.addEventListener('unhandledrejection',()=>status('Не удалось завершить действие. Проверь интернет и повтори.',true));
async function init(){show('setup');if(!window.crypto?.subtle)return status('Нужен современный браузер и HTTPS. Опубликуй приложение через GitHub Pages.',true);
 let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{localStorage.removeItem(storageKey);}
 if(location.hash.startsWith('#import=')){importing=location.hash.slice(8);history.replaceState(null,'',location.pathname+location.search);
   if(!saved?.session||saved.transferHash!==await tokenHash(importing)){show('importView');return;}importing=null;}
 if(saved?.session){credentials={apiId:saved.apiId,apiHash:saved.apiHash};status('Восстанавливаю вход…');$('login').disabled=true;
   try{await createClient(saved);await client.connect();if(!await client.checkAuthorization())throw new Error('SESSION_REVOKED');
     transferHash=saved.transferHash||'';$('saveSession').checked=true;await enterChats();
   }catch(err){show('setup');status(errorText(err)+' Можно войти заново.',true);}
   finally{$('login').disabled=false;}}
}
installKeyboard();
voiceUI=installAudio({context:()=>({client,dialog:activeDialog,screen,demo,busy:sending}),status,show,
 append:message=>{messages.push(message);renderMessages();}});
init();
