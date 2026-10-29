/* Public WordPress REST API. Only metadata is fetched before checking the TXT ledger. */
(function(global){'use strict';
  const SITE='https://1000wordphilosophy.com';
  const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function json(response){try{return JSON.parse(response.text);}catch(_){throw new Error('The website returned an invalid API response.');}}
  async function catalog(get){
    const articles=[];
    for(let page=1;page<=100;page++){
      const items=json(await get(SITE+'/wp-json/wp/v2/posts?per_page=100&page='+page+'&orderby=date&order=desc&_fields=id,date,link,title,slug',true,false));
      if(!Array.isArray(items))throw new Error('The essay list could not be read.');
      items.forEach(item=>{
        if(!item.id||!item.link||!item.title)throw new Error('An essay is missing required metadata.');
        const url=global.Philosophy.normalize(item.link);
        if(new URL(url).hostname!=='1000wordphilosophy.com')throw new Error('Unexpected essay host.');
        articles.push({id:global.Philosophy.key(url),postId:Number(item.id),url:url,date:String(item.date).slice(0,10),title:new DOMParser().parseFromString(item.title.rendered,'text/html').body.textContent.trim()});
      });
      if(items.length<100)break;
      if(page===100)throw new Error('The essay list exceeded the pagination limit.');
    }
    if(!articles.length)throw new Error('The website returned no essays. Nothing was downloaded.');
    const unique=new Map();articles.forEach(a=>unique.set(a.id,a));return Array.from(unique.values());
  }
  async function article(get,item){
    const post=json(await get(SITE+'/wp-json/wp/v2/posts/'+item.postId+'?_fields=id,link,title,content',false,false));
    if(!post.content||post.content.protected||!post.title||!post.link)throw new Error('This essay is unavailable through the public API.');
    const url=global.Philosophy.normalize(post.link);
    if(new URL(url).hostname!=='1000wordphilosophy.com')throw new Error('Unexpected essay host.');
    return {url:url,text:'<!doctype html><html><head><meta charset="utf-8"><link rel="canonical" href="'+escape(url)+'"></head><body><h1 class="entry-title">'+post.title.rendered+'</h1><div class="entry-content">'+post.content.rendered+'</div></body></html>'};
  }
  global.PhilosophyAPI={catalog:catalog,article:article};
})(window);
