const fs=require('fs');
const path=require('path');
const out=path.resolve(__dirname,'../../outputs/rayban-telegram');
fs.mkdirSync(out,{recursive:true});
// Escape script closing sequences so embedded message schemas cannot end the HTML script.
const script=fs.readFileSync(path.join(__dirname,'dist/app.js'),'utf8').replace(/<\/script/gi,'<\\/script');
const html=fs.readFileSync(path.join(__dirname,'template.html'),'utf8').replace('/*APP_SCRIPT*/',()=>script);
fs.writeFileSync(path.join(out,'index.html'),html);
const source=path.join(out,'source');fs.mkdirSync(source,{recursive:true});
for(const file of ['app.js','template.html','webpack.config.cjs','package-deliverable.cjs','package.json','package-lock.json'])fs.copyFileSync(path.join(__dirname,file),path.join(source,file));
let licenses='Third-party notices. Build dependencies are included for completeness.\n\n';
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(!entry.isDirectory())continue;
 const folder=path.join(dir,entry.name);if(entry.name.startsWith('@')){collect(folder);continue;}
 const manifest=path.join(folder,'package.json');if(!fs.existsSync(manifest))continue;
 const p=JSON.parse(fs.readFileSync(manifest,'utf8'));licenses+='\n=== '+p.name+' '+p.version+' — '+JSON.stringify(p.license||'See package')+' ===\n';
 for(const file of fs.readdirSync(folder)){if(/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(file)&&fs.statSync(path.join(folder,file)).isFile())licenses+=fs.readFileSync(path.join(folder,file),'utf8')+'\n';}
 if(fs.existsSync(path.join(folder,'node_modules')))collect(path.join(folder,'node_modules'));
}}
collect(path.join(__dirname,'node_modules'));fs.writeFileSync(path.join(out,'THIRD-PARTY-NOTICES.txt'),licenses);
console.log('Created outputs/rayban-telegram/index.html and corresponding source.');
