/* GitHub Pages adapter: source API -> local folder, with a portable ZIP fallback. */
(function(){'use strict';
  if(window.testNative)return;
  const allowed=new Set(['1000wordphilosophy.com','www.1000wordphilosophy.com','i0.wp.com','i1.wp.com','i2.wp.com','1000wordphilosophy.files.wordpress.com']);
  let directory=null,imports=new Map(),writes=new Map(),label=null,mode=null,wake=null,lastRequest=0,chain=Promise.resolve();
  const cache=new Map();
  function safeName(name){if(typeof name!=='string'||name.includes('/')||name.includes('\\')||name.startsWith('.')||!(name.endsWith('.epub')||name==='philosophy-library.txt'||name==='philosophy-library.backup.txt'))throw new Error('Invalid output filename.');return name;}
  function decode(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  function encode(bytes){let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(raw);}
  async function read(name){
    if(mode==='direct'){
      try{return await (await directory.getFileHandle(name)).getFile();}catch(e){if(e.name==='NotFoundError')return null;throw e;}
    }return writes.get(name)||imports.get(name)||null;
  }
  async function library(){
    if(!mode)throw new Error('Choose a folder first.');
    let files=[];
    if(mode==='direct'){for await(const [name,handle] of directory.entries())if(handle.kind==='file')files.push(name);}
    else files=Array.from(new Set(Array.from(imports.keys()).concat(Array.from(writes.keys()))));
    const record=await read('philosophy-library.txt')||await read('philosophy-library.backup.txt');
    return {files:files,ledger:record?await record.text():''};
  }
  async function writeFile(name,data,replace){
    safeName(name);if(!replace&&await read(name))return {skipped:true};
    if(mode==='direct'){
      const file=await directory.getFileHandle(name,{create:true}),stream=await file.createWritable();
      try{await stream.write(data);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
    }else{writes.set(name,new Blob([data],{type:name.endsWith('.epub')?'application/epub+zip':'text/plain;charset=utf-8'}));}
    return {saved:true};
  }
  async function choose(){
    if(typeof window.showDirectoryPicker==='function'){
      try{const chosen=await window.showDirectoryPicker({id:'philosophy-library',mode:'readwrite'});directory=chosen;mode='direct';label=chosen.name;imports.clear();writes.clear();return {label:label};}
      catch(e){if(e.name==='AbortError')return null;throw e;}
    }
    // Browsers without writable folder access import a local snapshot; nothing is uploaded.
    const choice=await new Promise(resolve=>{
      const input=document.createElement('input');input.type='file';input.multiple=true;input.setAttribute('webkitdirectory','');input.hidden=true;document.body.appendChild(input);
      let finished=false;
      function done(files){if(finished)return;finished=true;input.remove();resolve(files);}
      input.onchange=()=>done(Array.from(input.files||[]));input.oncancel=()=>done([]);input.click();
    });
    if(!choice.length&&mode)return null;
    imports=new Map();writes=new Map();directory=null;mode='zip';
    choice.forEach(file=>{const parts=(file.webkitRelativePath||file.name).split('/');if(parts.length<=2)imports.set(file.name,file);});
    label=choice.length?(choice[0].webkitRelativePath.split('/')[0]||'Imported library')+' — ZIP export':'New library — ZIP export';
    return {label:label};
  }
  async function fetchSource(args){
    const url=new URL(args.url);
    if(url.protocol!=='https:'||url.username||url.password||!allowed.has(url.hostname))throw new Error('Unsupported source URL.');
    if(url.hostname==='1000wordphilosophy.com'&&url.pathname==='/robots.txt'){
      // GitHub Pages cannot proxy arbitrary URLs. CI refreshes this site-policy snapshot daily.
      const r=await fetch('site-policy.json',{cache:'no-store'});if(!r.ok)throw new Error('The website-policy snapshot is unavailable.');const policy=await r.json();
      if(policy.source!=='https://1000wordphilosophy.com/robots.txt'||typeof policy.text!=='string'||!Number.isFinite(Date.parse(policy.checkedAt))||Date.now()-Date.parse(policy.checkedAt)>8*86400000)throw new Error('The web build needs a fresh website-policy check. Please retry after the next Pages deployment.');
      return {status:200,text:policy.text,url:policy.source};
    }
    if(!args.fresh&&cache.has(args.url))return cache.get(args.url);
    const delay=1000-(Date.now()-lastRequest);if(delay>0)await new Promise(r=>setTimeout(r,delay));lastRequest=Date.now();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),50000);
    try{
      // WordPress/CDN caches can retain responses fetched without an Origin header.
      // Separate browser-origin variants and bypass that shared cache for fresh API reads.
      const requestURL=new URL(args.url);
      if(requestURL.hostname==='1000wordphilosophy.com'&&requestURL.pathname.startsWith('/wp-json/')){
        requestURL.searchParams.set('_scraper_origin',location.origin);
        if(args.fresh)requestURL.searchParams.set('_scraper_refresh',Date.now().toString());
      }
      const response=await fetch(requestURL.href,{credentials:'omit',mode:'cors',redirect:'error',signal:controller.signal,cache:args.fresh?'no-store':'default'});
      if(!response.ok)return {status:response.status};
      const data=new Uint8Array(await response.arrayBuffer());if(data.length>20000000)throw new Error('The source file exceeds 20 MB.');
      const result={status:response.status,url:response.url,text:args.binary?'':new TextDecoder().decode(data),base64:args.binary?encode(data):''};
      if(!args.fresh){cache.set(args.url,result);while(cache.size>6)cache.delete(cache.keys().next().value);}return result;
    }catch(e){if(e.name==='TypeError')throw new Error('The source website could not be reached by this browser. Check your connection and try again.');throw e;}finally{clearTimeout(timeout);}
  }
  async function exportZip(){
    if(!writes.size)return {exported:false};
    const files=[];for(const [name,file] of writes)files.push({name:name,blob:file});
    const data=await window.Philosophy.zipBlob(files),url=URL.createObjectURL(data);
    const a=document.createElement('a');a.href=url;a.download='1000-word-philosophy-library.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {exported:true};
  }
  window.browserNative=async function(action,args){args=args||{};
    if(action==='settings')return {folder:label?{label:label}:null};
    if(action==='chooseFolder')return choose();
    if(action==='library')return library();
    if(action==='fetch'){const job=chain.then(()=>fetchSource(args));chain=job.catch(()=>{});return job;}
    if(action==='write'){
      if(!mode)throw new Error('Choose a folder first.');safeName(args.name);
      if(args.name==='philosophy-library.txt'){const old=await read(args.name);if(old)await writeFile('philosophy-library.backup.txt',await old.arrayBuffer(),true);}
      return writeFile(args.name,args.base64?decode(args.base64):args.text,!!args.replace);
    }
    if(action==='keepAwake'){
      if(args.on&&navigator.wakeLock){try{wake=await navigator.wakeLock.request('screen');}catch(_){}}
      else if(wake){await wake.release().catch(()=>{});wake=null;}return true;
    }
    if(action==='finishRun')return {exportPending:mode==='zip'&&writes.size>0};
    if(action==='export')return exportZip();
    throw new Error('Unsupported browser action.');
  };
})();
