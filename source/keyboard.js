// Local on-screen input. It never submits a form or sends a message.
export function installKeyboard(){
 const panel=document.getElementById('keyboard'),preview=document.getElementById('keyboardPreview'),grid=document.getElementById('keyboardKeys');
 const main=document.querySelector('main'),proxies=new Map();let target=null,original='',value='',position=0,layout='ru',upper=false;
 const layouts={ru:'йцукенгшщзхъфывапролджэячсмитьбюё',en:'qwertyuiopasdfghjklzxcvbnm',num:'1234567890+-().',symbols:'!@#$%^&*()_+-=[]{};:,.?/\\|~`<>"\''};
 function echo(){const masked=target?.type==='password'&&!document.getElementById('keyboardReveal').checked;
   const shown=masked?'•'.repeat(value.length):value;preview.textContent=shown.slice(0,position)+'│'+shown.slice(position);
   document.getElementById('keyboardCursor').textContent='Позиция: '+position+' / '+value.length;
 }
 function sync(){for(const [field,button] of proxies){const label=document.querySelector('label[for="'+field.id+'"]')?.textContent||'Текст';
   const shown=field.type==='password'?'•'.repeat(field.value.length):field.value;
   const text=shown||'Ввести текст…';if(button.textContent!==text)button.textContent=text;
   button.setAttribute('aria-label',label+': '+(field.value?'изменить':'ввести'));if(button.disabled!==field.disabled)button.disabled=field.disabled;
 }}
 function insert(text){value=value.slice(0,position)+text+value.slice(position);position+=text.length;echo();}
 function render(){grid.replaceChildren();for(const char of layouts[layout]){const b=document.createElement('button');b.type='button';b.className='key';
   b.textContent=upper?char.toLocaleUpperCase('ru'):char;b.onclick=()=>insert(b.textContent);grid.append(b);}
   for(const b of panel.querySelectorAll('[data-layout]'))b.setAttribute('aria-pressed',String(b.dataset.layout===layout));
   document.getElementById('keyboardCase').setAttribute('aria-pressed',String(upper));}
 function close(commit=true,native=false){if(!target)return;const field=target;field.value=commit?value:original;
   field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
   panel.hidden=true;main.inert=false;target=null;preview.textContent='';value='';original='';document.getElementById('keyboardReveal').checked=false;
   const button=proxies.get(field);sync();
   if(native){field.hidden=false;field.readOnly=false;button.hidden=true;field.addEventListener('blur',()=>{field.readOnly=true;field.hidden=true;button.hidden=false;sync();},{once:true});field.focus();}
   else button?.focus();}
 function open(field){target=field;original=field.value;value=original;position=value.length;
   const label=field.id?document.querySelector('label[for="'+field.id+'"]'):null;
   document.getElementById('keyboardTitle').textContent=label?.textContent||'Ввод текста';
   layout=['apiId','phone'].includes(field.id)||(field.id==='authInput'&&field.type!=='password')?'num':
     ['apiHash','transferPassword','importPassword','authInput'].includes(field.id)?'en':'ru';
   upper=false;document.getElementById('keyboardReveal').checked=false;
   document.getElementById('keyboardRevealLabel').hidden=field.type!=='password';
   panel.hidden=false;main.inert=true;render();echo();grid.querySelector('button')?.focus();}
 for(const field of main.querySelectorAll('input:not([type="checkbox"]),textarea:not([readonly])')){
   field.readOnly=true;field.hidden=true;
   const button=document.createElement('button');button.type='button';button.className='text-entry';button.setAttribute('aria-haspopup','dialog');
   button.onclick=()=>open(field);field.after(button);proxies.set(field,button);
   const label=document.querySelector('label[for="'+field.id+'"]');if(label)label.onclick=e=>{if(!field.hidden)return;e.preventDefault();open(field);};
   field.addEventListener('input',sync);field.addEventListener('change',sync);
 }
 sync();
 new MutationObserver(sync).observe(main,{subtree:true,attributes:true,attributeFilter:['hidden','type','disabled']});
 panel.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{layout=b.dataset.layout;render();});
 document.getElementById('keyboardCase').onclick=()=>{upper=!upper;render();};
 document.getElementById('keyboardDelete').onclick=()=>{if(position>0){value=value.slice(0,position-1)+value.slice(position);position--;}echo();};
 document.getElementById('keyboardSpace').onclick=()=>insert(' ');
 document.getElementById('keyboardLeft').onclick=()=>{position=Math.max(0,position-1);echo();};
 document.getElementById('keyboardRight').onclick=()=>{position=Math.min(value.length,position+1);echo();};
 document.getElementById('keyboardReveal').onchange=echo;
 document.getElementById('keyboardDone').onclick=()=>close(true);
 document.getElementById('keyboardCancel').onclick=()=>close(false);
 document.getElementById('keyboardNative').onclick=()=>close(true,true);
 document.addEventListener('paste',e=>{if(panel.hidden)return;const text=e.clipboardData?.getData('text');if(text){e.preventDefault();insert(text);}},true);
 document.addEventListener('keydown',e=>{if(panel.hidden||e.isComposing)return;
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(false);return;}
   if(e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();document.getElementById('keyboardDelete').click();return;}
   if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key!==' '){e.preventDefault();e.stopImmediatePropagation();insert(e.key);return;}
   const buttons=Array.from(panel.querySelectorAll('button,input')).filter(el=>el.getClientRects().length&&!el.disabled);
   if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();const i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();return;}
   if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();e.stopImmediatePropagation();
   const i=buttons.indexOf(document.activeElement),inGrid=document.activeElement?.classList.contains('key');
   const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
   const step=e.key==='ArrowUp'?-1*(inGrid?columns:1):e.key==='ArrowDown'?(inGrid?columns:1):e.key==='ArrowLeft'?-1:1;
   const next=buttons[Math.max(0,Math.min(buttons.length-1,i+step))];next?.focus();next?.scrollIntoView({block:'nearest'});
 },true);
 return {close:()=>close(true)};
}
