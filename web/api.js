/* All Essays determines directory entries; WordPress metadata resolves their legacy URLs. */
(function(global){'use strict';
  const SITE='https://1000wordphilosophy.com';
  const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const title=s=>new DOMParser().parseFromString(s,'text/html').body.textContent.trim();
  const words=s=>title(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function json(response){try{return JSON.parse(response.text);}catch(_){throw new Error('The website returned an invalid API response.');}}
  function html(post){return '<!doctype html><html><head><meta charset="utf-8"><link rel="canonical" href="'+escape(post.link)+'"></head><body><h1 class="entry-title">'+post.title.rendered+'</h1><div class="entry-content">'+post.content.rendered+'</div></body></html>';}
  function metadata(item){
    if(!item.id||!item.link||!item.title)throw new Error('An essay is missing required metadata.');
    const url=global.Philosophy.normalize(item.link);
    if(new URL(url).hostname!=='1000wordphilosophy.com')throw new Error('Unexpected essay host.');
    return {id:global.Philosophy.key(url),postId:Number(item.id),url:url,date:String(item.date||'').slice(0,10),modified:String(item.modified||''),title:title(item.title.rendered),aliases:[]};
  }
  async function catalog(get,onDirectory){
    const pages=json(await get(SITE+'/wp-json/wp/v2/pages?slug=all-essays&_fields=id,link,title,content',true,false));
    if(!Array.isArray(pages)||pages.length!==1||!pages[0].content||global.Philosophy.normalize(pages[0].link)!==SITE+'/all-essays/')throw new Error('The All Essays directory could not be read.');
    const directory=html(pages[0]),entries=global.Philosophy.discover(directory);
    const posts=[];
    for(let page=1;page<=100;page++){
      const items=json(await get(SITE+'/wp-json/wp/v2/posts?per_page=100&page='+page+'&orderby=date&order=desc&_fields=id,date,modified,link,title,slug',true,false));
      if(!Array.isArray(items))throw new Error('The essay list could not be read.');
      items.forEach(item=>posts.push(metadata(item)));
      if(items.length<100)break;
      if(page===100)throw new Error('The essay list exceeded the pagination limit.');
    }
    const byId=new Map(posts.map(p=>[p.id,p])),articles=new Map();
    entries.forEach(entry=>{
      let post=byId.get(entry.id);
      if(!post){const matches=posts.filter(p=>words(p.title)===words(entry.title));if(matches.length===1)post=matches[0];}
      if(!post&&entry.date){
        // A changed title/slug is safe to resolve only with the same publication date
        // and enough shared title words to identify a single published article.
        const tokens=Array.from(new Set(words(entry.title).split(' ')));
        const matches=posts.filter(p=>p.date===entry.date&&tokens.filter(t=>words(p.title).split(' ').includes(t)).length>=Math.min(3,tokens.length));
        if(matches.length===1)post=matches[0];
      }
      if(post){if(!post.aliases.includes(entry.id))post.aliases.push(entry.id);articles.set(post.id,post);}
      else articles.set(entry.id,Object.assign(entry,{aliases:[],modified:''}));
    });
    // Include newly published essays even before the editors add them to All Essays.
    posts.forEach(p=>{if(!articles.has(p.id))articles.set(p.id,p);});
    if(onDirectory)onDirectory(directory);
    return Array.from(articles.values()).sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
  }
  async function article(get,item){
    let post;
    if(item.postId)post=json(await get(SITE+'/wp-json/wp/v2/posts/'+item.postId+'?_fields=id,link,title,content',true,false));
    else{
      // An index entry can be a WordPress page rather than a post. Do not silently drop it.
      const pages=json(await get(SITE+'/wp-json/wp/v2/pages?slug='+encodeURIComponent(item.id)+'&_fields=id,link,title,content',true,false));
      if(!Array.isArray(pages)||pages.length!==1)throw new Error('This All Essays link no longer resolves to a published article.');
      post=pages[0];
    }
    if(!post.content||post.content.protected||!post.title||!post.link)throw new Error('This essay is unavailable through the public API.');
    const url=global.Philosophy.normalize(post.link);
    if(new URL(url).hostname!=='1000wordphilosophy.com')throw new Error('Unexpected essay host.');
    return {url:url,text:html(post)};
  }
  global.PhilosophyAPI={catalog:catalog,article:article};
})(window);
