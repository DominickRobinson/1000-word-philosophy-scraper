(function(){'use strict';
  const P=window.Philosophy,$=id=>document.getElementById(id);
  function native(action,args){
    const adapter=window.testNative||window.browserNative;
    return adapter?adapter(action,args||{}):Promise.reject(new Error('The browser file adapter did not load. Reload the page.'));
  }
  const state={folder:null,articles:[],ledger:P.readLedger(''),files:[],busy:false,stop:false,exportPending:false,errors:[],blocked:[]};
  function showError(message){state.errors.push(message);$('log').textContent=state.errors.join('\n');$('errorCount').textContent='Download details ('+state.errors.length+')';$('errors').hidden=false;}
  function progress(done,total,status,detail){$('status').textContent=status;$('count').textContent=total?done+' / '+total:'';$('detail').textContent=detail||'';const percent=total?Math.round(done/total*100):0;$('progressFill').style.width=percent+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(percent));}
  function render(){
    $('folderName').textContent=state.folder?state.folder.label:'No folder selected';$('chooseFolder').disabled=state.busy;$('download').disabled=!state.folder||state.stop;
    $('download').textContent=state.busy?(state.stop?'Stopping…':'Stop after this article'):(state.exportPending?'Save ZIP':'Download new articles');
  }
  async function loadLibrary(){if(!state.folder)return;const info=await native('library');state.files=info.files;state.ledger=P.readLedger(info.ledger);}
  function saved(a){return P.isSaved(state.ledger,a,state.files);}
  async function get(url,fresh,binary){
    let last;for(let attempt=0;attempt<3;attempt++){
      try{const r=await native('fetch',{url:url,fresh:!!fresh,binary:!!binary});if(r.status!==200)throw new Error('HTTP '+r.status+' for '+url);return r;}
      catch(e){last=e;if(/HTTP 4\d\d/.test(e.message)&&!/HTTP 429/.test(e.message))break;if(attempt<2)await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
    }throw last;
  }
  async function robots(){
    const r=await get(P.SITE+'/robots.txt',true,false);let active=false;state.blocked=[];
    r.text.split(/\r?\n/).forEach(line=>{line=line.replace(/#.*/,'').trim();const pair=line.split(':');if(pair[0].toLowerCase()==='user-agent')active=pair.slice(1).join(':').trim()==='*';if(active&&pair[0].toLowerCase()==='disallow'){const value=pair.slice(1).join(':').trim();if(value)state.blocked.push(value);}});
    ['/wp-json/wp/v2/posts','/wp-json/wp/v2/pages'].forEach(checkAllowed);
  }
  function checkAllowed(path){if(state.blocked.some(rule=>{const re=new RegExp('^'+rule.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*'));return re.test(path);}))throw new Error('This request is disallowed by the website.');}
  function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(s);}
  function bytes(base64){const s=atob(base64),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
  async function remember(article,name){
    const current=await native('library'),ledger=P.readLedger(current.ledger);
    const id=article.id||P.key(article.url);
    ledger.articles[id]={url:article.url,title:article.title,file:name,savedAt:new Date().toISOString()};
    if(article.warnings&&article.warnings.length)ledger.articles[id].warnings=article.warnings;
    if(ledger.unavailable)delete ledger.unavailable[id];ledger.updatedAt=new Date().toISOString();
    await native('write',{name:'philosophy-library.txt',text:JSON.stringify(ledger,null,2)+'\n',replace:true});state.ledger=ledger;state.files=current.files;if(!state.files.includes(name))state.files.push(name);
  }
  async function rememberUnavailable(item,reason){
    const current=await native('library'),ledger=P.readLedger(current.ledger);
    ledger.unavailable=ledger.unavailable||{};ledger.unavailable[item.id]={url:item.url,title:item.title,modified:item.modified,reason:reason,checkedAt:new Date().toISOString()};ledger.updatedAt=new Date().toISOString();
    await native('write',{name:'philosophy-library.txt',text:JSON.stringify(ledger,null,2)+'\n',replace:true});state.ledger=ledger;
  }
  async function run(){
    if(state.busy){state.stop=true;render();return;}if(!state.folder)return;
    if(state.exportPending){try{await native('export');state.exportPending=false;progress(1,1,'ZIP exported.','Extract it into your library folder, including philosophy-library.txt.');render();}catch(e){showError(e.message);}return;}
    state.busy=true;state.stop=false;state.errors=[];$('errors').hidden=true;render();let complete=0,total=0,downloaded=0,skipped=0,failed=0,unavailable=0,directorySource=null;
    try{
      await loadLibrary();await native('keepAwake',{on:true});progress(0,0,'Checking for new articles…');await robots();
      if(state.stop)return;
      state.articles=await window.PhilosophyAPI.catalog(get,source=>{directorySource=source;});await loadLibrary();unavailable=state.articles.filter(a=>!saved(a)&&P.isUnavailable(state.ledger,a)).length;const queue=state.articles.filter(a=>!saved(a)&&!P.isUnavailable(state.ledger,a));total=queue.length;
      if(!total){progress(1,1,unavailable?'No new articles.':'All articles are already downloaded.',unavailable?unavailable+' unavailable on the website.':'');return;}
      for(const item of queue){
        if(state.stop)break;await loadLibrary();
        if(saved(item)){skipped++;complete++;progress(complete,total,'Already saved — skipped.',item.title);continue;}
        progress(complete,total,'Downloading…',item.title);
        try{
          checkAllowed(item.postId?'/wp-json/wp/v2/posts/'+item.postId:'/wp-json/wp/v2/pages');
          const source=await window.PhilosophyAPI.article(get,item),article=P.extract(source.text,source.url||item.url);
          if(P.isSaved(state.ledger,article,state.files)){await remember(item,P.libraryFilename(state.ledger,article,state.files));skipped++;}
          else{
            const data=await P.articleBook(article,async url=>{const r=await get(url,false,true);return{data:bytes(r.base64)};});
            // Image failures are warnings: keep the readable essay and its saved record.
            const name=P.filename(article);await native('write',{name:name,base64:b64(data),replace:false});await remember(article,name);if(item.id!==P.key(article.url))await remember(item,name);downloaded++;
            article.warnings.forEach(w=>showError(article.title+': '+w));
          }
        }catch(e){
          if(e.code==='ARTICLE_UNAVAILABLE'){await rememberUnavailable(item,e.message);unavailable++;}
          else failed++;
          showError(item.title+' — '+e.message);
        }
        complete++;progress(complete,total,'Downloading…',item.title);
      }
      progress(complete,total,state.stop?'Stopped.':failed?'Finished with '+failed+' failed.':'Done.',downloaded+' downloaded'+(skipped?' · '+skipped+' already saved':'')+(unavailable?' · '+unavailable+' unavailable on the website':'')+(failed?' · Tap Download to retry.':''));
    }catch(e){progress(complete,total,'Could not finish.',e.message);showError(e.message);}
    finally{
      if(directorySource&&state.articles.length){try{
        await loadLibrary();const options={ledger:state.ledger,files:state.files};
        await native('write',{name:'All Essays.epub',base64:b64(P.directoryBook(directorySource,state.articles,options)),replace:true});
      }catch(e){showError('Could not save the master index: '+e.message);}}
      if(window.browserNative){const finished=await native('finishRun');state.exportPending=!!finished.exportPending;if(state.exportPending){$('status').textContent='Ready to save.';$('detail').textContent='Save the ZIP, then extract it into your library folder.';}}if(state.stop)progress(complete,total,'Stopped.',downloaded+' downloaded');await native('keepAwake',{on:false}).catch(()=>{});state.busy=false;state.stop=false;render();}
  }
  $('chooseFolder').onclick=async()=>{try{const folder=await native('chooseFolder');if(folder){state.folder=folder;state.exportPending=false;state.ledger=P.readLedger('');state.files=[];await loadLibrary();const n=Object.keys(state.ledger.articles).length;progress(0,0,n?'Ready.':'Ready to download the full collection.',n?n+' saved article records in this folder.':'');render();}}catch(e){showError(e.message);progress(0,0,'Could not read this folder.',e.message);render();}};
  $('download').onclick=run;
  native('settings').then(async result=>{state.folder=result.folder;if(state.folder){await loadLibrary();progress(0,0,'Ready.');}render();}).catch(e=>{showError(e.message);render();});
  window.PocketApp={state:state,run:run,native:native,render:render};render();
})();
