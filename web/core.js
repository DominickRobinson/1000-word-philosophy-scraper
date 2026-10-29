/* Philosophy Pocket: local, dependency-free extraction and EPUB 3 packaging. */
(function (global) {
  'use strict';
  const SITE = 'https://1000wordphilosophy.com';
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const EPUB = 'http://www.idpf.org/2007/ops';
  const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function normalize(url, base) {
    const u = new URL(url, base || SITE);
    if (u.hostname.replace(/^www\./, '') === '1000wordphilosophy.com') {
      u.protocol = 'https:'; u.hostname = '1000wordphilosophy.com'; u.search = '';
    }
    u.hash = '';
    return u.href;
  }
  function key(url) { return new URL(normalize(url)).pathname.split('/').filter(Boolean).pop() || 'home'; }
  function dateOf(url) { const m = url.match(/\/(\d{4}\/\d{2}\/\d{2})\//); return m ? m[1].replace(/\//g, '-') : ''; }
  function filename(article) { return (article.date ? article.date + ' - ' : '') + key(article.url).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,140) + '.epub'; }
  function parse(source) { return new DOMParser().parseFromString(source, 'text/html'); }
  function content(doc) { const el = doc.querySelector('.entry-content'); if (!el) throw new Error('Article content was not found. The website may have changed.'); return el; }
  function discover(indexHTML, sitemapXML, feedXML) {
    const doc = parse(indexHTML), root = content(doc), entries = new Map();
    root.querySelectorAll('li a[href]').forEach(a => {
      const url = normalize(a.getAttribute('href'));
      if (new URL(url).hostname !== '1000wordphilosophy.com') return;
      const li = a.closest('li');
      if (!dateOf(url) && !/\bby\s/i.test(text(li))) return;
      if (/\/(category|tag)\//.test(url)) return;
      const k = key(url);
      // WordPress sometimes splits one essay title across consecutive links to the same URL.
      let title = text(a), next = a.nextSibling;
      while (next) {
        if (next.nodeType === 3 && !next.nodeValue.trim()) { next = next.nextSibling; continue; }
        if (next.nodeType === 1 && next.tagName === 'A' && normalize(next.getAttribute('href')) === url) { title += ' ' + text(next); next = next.nextSibling; }
        else break;
      }
      if (!title) return;
      if (!entries.has(k)) entries.set(k, {id:k, url:url, title:title, date:dateOf(url)});
      else if (title.length > entries.get(k).title.length) entries.get(k).title = title;
    });
    // The sitemap provides canonical dates for legacy aliases; the essay index determines scope.
    if (sitemapXML) {
      const xml = new DOMParser().parseFromString(sitemapXML, 'application/xml');
      Array.from(xml.getElementsByTagNameNS('*','loc')).forEach(el => {
        const url = normalize(text(el)), entry = entries.get(key(url));
        if (entry && dateOf(url)) { entry.url = url; entry.date = dateOf(url); }
      });
    }
    if (feedXML) {
      const xml = new DOMParser().parseFromString(feedXML, 'application/xml');
      xml.querySelectorAll('item').forEach(item => {
        const link = item.querySelector('link'), title = item.querySelector('title');
        if (!link || !title) return;
        const url = normalize(text(link));
        if (!dateOf(url)) return;
        const k = key(url);
        entries.set(k, {id:k,url:url,title:text(title),date:dateOf(url)});
      });
    }
    const result = Array.from(entries.values()).sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
    if (result.length < 3) throw new Error('The essay list appears incomplete; nothing has been scraped.');
    return result;
  }
  const JUNK = 'script,style,iframe,video,audio,form,input,button,noscript,object,embed,canvas,.addtoany_share_save_container,#jp-relatedposts,.sharedaddy,.gsp_post_data,.aioseo-author-bio-compact,.wp-block-jetpack-subscriptions,.jetpack-subscribe-modal,.jetpack-video-wrapper';
  function cleanBase(root, url) {
    root.querySelectorAll(JUNK).forEach(el => el.remove());
    root.querySelectorAll('div,section').forEach(el => {
      if (/Discover more from|Subscribe to get the latest posts/.test(text(el)) && el.querySelector('form,h2,h3')) el.remove();
    });
    // Flatten layout-only wrappers to make section boundaries consistent across WordPress eras.
    Array.from(root.querySelectorAll('div')).reverse().forEach(el => el.replaceWith(...Array.from(el.childNodes)));
    root.querySelectorAll('span[style]').forEach(el => {
      if (/vertical-align\s*:\s*super/i.test(el.getAttribute('style'))) { const sup=root.ownerDocument.createElement('sup'); sup.append(...Array.from(el.childNodes)); el.replaceWith(sup); }
      else if (/vertical-align\s*:\s*sub/i.test(el.getAttribute('style'))) { const sub=root.ownerDocument.createElement('sub'); sub.append(...Array.from(el.childNodes)); el.replaceWith(sub); }
    });
    root.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      try { const u = new URL(href,url); if (!['http:','https:','mailto:'].includes(u.protocol)) a.removeAttribute('href'); else a.setAttribute('href',u.href); } catch (_) { a.removeAttribute('href'); }
    });
    root.querySelectorAll('img').forEach(img => {
      const src=img.getAttribute('data-orig-file') || img.getAttribute('data-src') || img.getAttribute('src');
      if (src) { try { img.setAttribute('src',new URL(src,url).href); } catch (_) {img.remove();} } else img.remove();
    });
  }
  const SKIP = /^(related essays?|related articles?|pdf( download)?|download( this essay)?|about the authors?|translations?|audio|video|acknowledg(e)?ments?|share this|follow 1000|discover more|subscribe)\b/i;
  const KEEP = /^(notes?|endnotes?|footnotes?|references?|bibliography|works cited|further reading|for further reading|appendi(x|ces)|additional reading)\b/i;
  function extract(source, url) {
    const doc=parse(source), root=content(doc).cloneNode(true);
    const canonical=doc.querySelector('link[rel="canonical"]');
    const canonicalURL=canonical ? normalize(canonical.getAttribute('href'),url) : normalize(url);
    const titleEl=doc.querySelector('h1.entry-title') || doc.querySelector('h1');
    if (!titleEl) throw new Error('Article title is missing.');
    const title=text(titleEl), warnings=[];
    cleanBase(root,canonicalURL);
    let author='', skipping=false;
    Array.from(root.children).forEach(el => {
      const value=text(el);
      if (/^Author(s)?\s*:/i.test(value)) {
        author=value.replace(/^Authors?\s*:\s*/i,'').split(/\s+(?:Categor(?:y|ies)|Word Count)\s*:/i)[0].trim(); el.remove(); return;
      }
      if (/^h[1-6]$/.test(el.tagName.toLowerCase())) {
        if (SKIP.test(value)) skipping=true;
        else if (KEEP.test(value) || /^\d+[.\s]/.test(value)) skipping=false;
      }
      if (skipping || /^(Follow 1000-Word|If you found this useful|Download this essay|This essay is also available (as|in)|Listen to this essay|Loading Comments)/i.test(value)) el.remove();
    });
    if (text(root).length < 300) throw new Error('The extracted article is unexpectedly short.');
    const stats=repairNotes(root,warnings,canonicalURL);
    // Named anchors are not portable XHTML IDs; normalize and deduplicate all remaining IDs.
    const ids=new Set();
    root.querySelectorAll('[id],[name]').forEach(el => {
      let id=el.getAttribute('id') || el.getAttribute('name');
      id=id.replace(/[^A-Za-z0-9_.:-]/g,'-'); if (!/^[A-Za-z]/.test(id)) id='a-'+id;
      let unique=id, n=2; while(ids.has(unique)) unique=id+'-'+n++;
      ids.add(unique);el.setAttribute('id',unique);el.removeAttribute('name');
    });
    const headings=[];
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h,i) => {
      if (!text(h)) {h.remove();return;}
      if (!h.id) h.id='section-'+(i+1);
      headings.push({title:text(h),id:h.id});
    });
    // Preserve real targets, but turn broken source fragments back into ordinary web links.
    root.querySelectorAll('a[href]').forEach(a => {
      const href=a.getAttribute('href');
      if (href[0]==='#') {
        if (!Array.from(root.querySelectorAll('[id]')).some(x => x.id===href.slice(1))) { warnings.push('Unresolved fragment: '+href); a.setAttribute('href',canonicalURL+href); }
      } else {
        const u=new URL(href,canonicalURL);
        if (u.hash && (normalize(href)===canonicalURL || key(href)===key(canonicalURL))) {
          const target=Array.from(root.querySelectorAll('[id]')).find(x => x.id===decodeURIComponent(u.hash.slice(1)));
          if (target) a.setAttribute('href','#'+target.id);
        }
      }
    });
    return {title:title,author:author,url:canonicalURL,date:dateOf(canonicalURL),root:root,headings:headings,warnings:warnings,stats:stats};
  }
  function repairNotes(root,warnings,url) {
    const doc=root.ownerDocument, notes=new Map(), refs=new Map();
    let inNotes=false, current=null;
    Array.from(root.children).forEach(el => {
      const value=text(el);
      if (/^H[1-6]$/.test(el.tagName)) { inNotes=/^(notes?|endnotes?|footnotes?)\s*:?$/i.test(value);current=null;return; }
      if (!inNotes) return;
      const candidates=el.tagName==='OL' || el.tagName==='UL' ? Array.from(el.children) : [el];
      candidates.forEach((block,i) => {
        const m=text(block).match(/^\s*(?:\[(\d+)\]|(\d+)[.)]\s)/);
        const n=m ? (m[1]||m[2]) : (el.tagName==='OL' ? String(i+Number(el.getAttribute('start')||1)) : null);
        if (n) {
          if (notes.has(n)) { warnings.push('Duplicate note number '+n);current=null;return; }
          const wrap=doc.createElement('aside');wrap.id='note-'+n;wrap.setAttribute('epub:type','footnote');wrap.setAttribute('role','doc-footnote');
          if (block.tagName==='LI') {block.id='note-'+n;block.setAttribute('epub:type','footnote');block.setAttribute('role','doc-footnote');current=block;}
          else {block.replaceWith(wrap);wrap.appendChild(block);current=wrap;}
          notes.set(n,current);refs.set(n,[]);
          // Remove old backlinks (some source articles reused _ftn1 for every note).
          const first=current.querySelector('a');
          if (first && /^\[?\d+\]?$/.test(text(first))) first.removeAttribute('href');
        } else if (current && block.parentNode===root) current.appendChild(block);
      });
    });
    const isNote=el => !!el.closest('[epub\\:type="footnote"]');
    function link(el,n) {
      if (!notes.has(n) || isNote(el)) return false;
      let a=el.tagName==='A' ? el : (el.closest('a') || el.querySelector('a'));
      if (!a) {a=doc.createElement('a');el.replaceWith(a);a.appendChild(el);}
      const list=refs.get(n), id='ref-'+n+'-'+(list.length+1);
      a.id=id;a.removeAttribute('name');a.setAttribute('href','#note-'+n);a.setAttribute('epub:type','noteref');a.setAttribute('role','doc-noteref');list.push(id);
      return true;
    }
    root.querySelectorAll('a,sup').forEach(el => {
      if (!root.contains(el) || isNote(el) || el.closest('a[epub\\:type="noteref"]')) return;
      const m=text(el).match(/^\s*\[?(\d+)\]?\s*$/);
      if (!m) return;
      const href=el.getAttribute('href')||'';
      // Bare numeric superscripts may be exponents. Only bracketed markers or explicit footnote links qualify.
      if (/\[\d+\]/.test(text(el)) || /#(?:_?ftn|_?edn|fn|note)/i.test(href)) link(el,m[1]);
    });
    // Older essays contain plain [1] text rather than links or superscripts.
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let node;
    while((node=walker.nextNode())) nodes.push(node);
    nodes.forEach(t => {
      const p=t.parentElement;
      if (!p || isNote(p) || p.closest('a,script,style')) return;
      const value=t.nodeValue, re=/\[(\d+)\]/g;let m,last=0,frag=doc.createDocumentFragment(),changed=false;
      while((m=re.exec(value))) {
        if (!notes.has(m[1])) continue;
        frag.appendChild(doc.createTextNode(value.slice(last,m.index)));
        const sup=doc.createElement('sup'),a=doc.createElement('a'),list=refs.get(m[1]),id='ref-'+m[1]+'-'+(list.length+1);
        a.id=id;a.setAttribute('href','#note-'+m[1]);a.setAttribute('epub:type','noteref');a.setAttribute('role','doc-noteref');a.textContent=m[0];sup.appendChild(a);frag.appendChild(sup);list.push(id);last=re.lastIndex;changed=true;
      }
      if(changed){frag.appendChild(doc.createTextNode(value.slice(last)));t.replaceWith(frag);}
    });
    notes.forEach((el,n) => {
      const list=refs.get(n);
      if(!list.length) warnings.push('Note '+n+' has no identifiable in-text marker.');
      const p=doc.createElement('p');p.setAttribute('class','backlinks');
      list.forEach((id,i) => {const a=doc.createElement('a');a.setAttribute('href','#'+id);a.setAttribute('role','doc-backlink');a.textContent=list.length===1?'↩ Return to text':'↩ Return '+(i+1);p.appendChild(a);p.appendChild(doc.createTextNode(' '));});
      if(list.length) el.appendChild(p);
    });
    return {notes:notes.size,references:Array.from(refs.values()).reduce((n,a)=>n+a.length,0),subscripts:root.querySelectorAll('sub').length,superscripts:root.querySelectorAll('sup').length};
  }
  const ALLOWED=new Set('p div span a h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code em strong i b u s del ins small sup sub br hr figure figcaption img table caption thead tbody tfoot tr th td dl dt dd aside section cite q abbr'.split(' '));
  const ATTRS=new Set('id href src alt title colspan rowspan start value type scope'.split(' '));
  function serialize(root) {
    function visit(node) {
      if(node.nodeType===3)return escape(node.nodeValue);
      if(node.nodeType!==1)return '';
      let tag=node.tagName.toLowerCase();const inner=Array.from(node.childNodes).map(visit).join('');
      if(!ALLOWED.has(tag))return inner;
      let attrs='';
      Array.from(node.attributes).forEach(a=>{
        if(ATTRS.has(a.name) || a.name==='epub:type' || a.name==='role' || (a.name==='class' && ['backlinks','indent'].includes(a.value))) attrs+=' '+a.name+'="'+escape(a.value)+'"';
      });
      if(/padding-left\s*:/i.test(node.getAttribute('style')||'') && !node.hasAttribute('class'))attrs+=' class="indent"';
      if(tag==='img'&&!node.hasAttribute('alt'))attrs+=' alt=""';
      return '<'+tag+attrs+(['img','br','hr'].includes(tag)?' />':'>'+inner+'</'+tag+'>');
    }
    return Array.from(root.childNodes).map(visit).join('');
  }
  const CSS='body{font-family:serif;color:#000;background:#fff;line-height:1.5;margin:5%;}h1{font-size:1.8em;line-height:1.2;}h2,h3,h4{line-height:1.3;page-break-after:avoid;}p{margin:0.8em 0;}a{color:inherit;text-decoration:underline;}sup,sub{font-size:0.75em;line-height:0;position:relative;vertical-align:baseline;}sup{top:-0.5em;}sub{bottom:-0.25em;}img{max-width:100%;height:auto;}figure{margin:1em 0;}figcaption,.source,.byline,.backlinks{font-size:0.85em;}aside{margin:1.2em 0;}blockquote,.indent{margin-left:1.5em;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid;padding:0.3em;}nav li{margin:0.55em 0;}';
  const xhtml=(title,body)=>'<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="'+XHTML+'" xmlns:epub="'+EPUB+'" lang="en" xml:lang="en"><head><meta charset="utf-8"/><title>'+escape(title)+'</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>'+body+'</body></html>';
  function utf8(s){return new TextEncoder().encode(s);}
  const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(data){let c=0xffffffff;for(let i=0;i<data.length;i++)c=crcTable[(c^data[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;parts.forEach(p=>{out.set(p,pos);pos+=p.length;});return out;}
  function zip(files){
    const local=[],central=[];let offset=0;
    files.forEach(file=>{
      const name=utf8(file.name),data=typeof file.data==='string'?utf8(file.data):file.data,crc=crc32(data);
      const h=new Uint8Array(30),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      const c=new Uint8Array(46),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
      local.push(h,name,data);central.push(c,name);offset+=h.length+name.length+data.length;
    });
    const cd=concat(central),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,cd.length,true);v.setUint32(16,offset,true);
    return concat(local.concat([cd,end]));
  }
  async function zipBlob(files){
    // Keep image Blobs as references instead of duplicating a whole library in one ArrayBuffer.
    const local=[],central=[];let offset=0;
    for(const file of files){
      const name=utf8(file.name),size=file.blob.size;
      const crc=crc32(new Uint8Array(await file.blob.arrayBuffer()));
      if(size>0xffffffff||offset+size>0xffffffff)throw new Error('This ZIP exceeds the 4 GB limit. Save a smaller batch.');
      const h=new Uint8Array(30),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);
      const c=new Uint8Array(46),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,size,true);w.setUint32(24,size,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
      local.push(h,name,file.blob);central.push(c,name);offset+=h.length+name.length+size;
    }
    const cd=concat(central),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,cd.length,true);v.setUint32(16,offset,true);
    return new Blob(local.concat([cd,end]),{type:'application/zip'});
  }
  function packageBook(title,chapters,assets,author,identifier){
    const modified=new Date().toISOString().replace(/\.\d+Z$/,'Z');
    const toc=chapters.map(c=>'<li><a href="'+escape(c.file)+'">'+escape(c.title)+'</a>'+(c.headings&&c.headings.length?'<ol>'+c.headings.map(h=>'<li><a href="'+escape(c.file+'#'+h.id)+'">'+escape(h.title)+'</a></li>').join('')+'</ol>':'')+'</li>').join('');
    const nav=xhtml('Contents','<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>'+toc+'</ol></nav>');
    const manifest=chapters.map((c,i)=>'<item id="chapter'+i+'" href="'+escape(c.file)+'" media-type="application/xhtml+xml"/>').join('')+assets.map((a,i)=>'<item id="asset'+i+'" href="'+escape(a.name)+'" media-type="'+escape(a.type)+'"/>').join('');
    const uid='urn:philosophy-pocket:'+identifier;
    const opf='<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">'+escape(uid)+'</dc:identifier><dc:title>'+escape(title)+'</dc:title><dc:language>en</dc:language><dc:creator>'+escape(author||'1000-Word Philosophy contributors')+'</dc:creator><dc:source>'+SITE+'</dc:source><meta property="dcterms:modified">'+modified+'</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>'+manifest+'</manifest><spine toc="ncx"><itemref idref="nav"/>'+chapters.map((c,i)=>'<itemref idref="chapter'+i+'"/>').join('')+'</spine></package>';
    let order=1;const navPoints=chapters.map((c,i)=>'<navPoint id="nav'+i+'" playOrder="'+order+++'"><navLabel><text>'+escape(c.title)+'</text></navLabel><content src="'+escape(c.file)+'"/>'+((c.headings||[]).map((h,j)=>'<navPoint id="nav'+i+'-'+j+'" playOrder="'+order+++'"><navLabel><text>'+escape(h.title)+'</text></navLabel><content src="'+escape(c.file+'#'+h.id)+'"/></navPoint>').join(''))+'</navPoint>').join('');
    const ncx='<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="'+escape(uid)+'"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>'+escape(title)+'</text></docTitle><navMap>'+navPoints+'</navMap></ncx>';
    return zip([{name:'mimetype',data:'application/epub+zip'},{name:'META-INF/container.xml',data:'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},{name:'EPUB/package.opf',data:opf},{name:'EPUB/nav.xhtml',data:nav},{name:'EPUB/toc.ncx',data:ncx},{name:'EPUB/style.css',data:CSS}].concat(chapters.map(c=>({name:'EPUB/'+c.file,data:xhtml(c.title,c.body)}))).concat(assets.map(a=>({name:'EPUB/'+a.name,data:a.data}))));
  }
  async function articleBook(article,fetchImage){
    const assets=[],images=Array.from(article.root.querySelectorAll('img'));
    for(let i=0;i<images.length;i++){
      const img=images[i];
      if(!fetchImage){img.remove();continue;}
      try{
        const res=await fetchImage(img.getAttribute('src'));
        let b=res.data;let ext,type;
        if(b[0]===0x89&&b[1]===0x50){ext='png';type='image/png';}
        else if(b[0]===0xff&&b[1]===0xd8){ext='jpg';type='image/jpeg';}
        else if(b[0]===0x47&&b[1]===0x49){ext='gif';type='image/gif';}
        else if(b[0]===0x52&&b[1]===0x49&&b[8]===0x57&&b[9]===0x45){
          // EPUB's core image types do not include WebP. Convert it locally, without a server.
          let binary='';for(let k=0;k<b.length;k+=16384)binary+=String.fromCharCode.apply(null,b.subarray(k,k+16384));
          b=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{try{const canvas=document.createElement('canvas');const scale=Math.min(1,2400/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const s=atob(canvas.toDataURL('image/png').split(',')[1]),out=new Uint8Array(s.length);for(let k=0;k<s.length;k++)out[k]=s.charCodeAt(k);resolve(out);}catch(e){reject(e);}};image.onerror=()=>reject(new Error('Could not decode WebP image'));image.src='data:image/webp;base64,'+btoa(binary);});
          ext='png';type='image/png';
        } else throw new Error('Unsupported image format');
        const name='images/image-'+i+'.'+ext;assets.push({name:name,type:type,data:b});img.setAttribute('src',name);
      }catch(e){const p=article.root.ownerDocument.createElement('p');p.textContent='[Image: '+(img.getAttribute('alt')||'see original essay')+']';img.replaceWith(p);article.warnings.push('Image omitted: '+e.message);}
    }
    const body='<h1>'+escape(article.title)+'</h1>'+(article.author?'<p class="byline">By '+escape(article.author)+'</p>':'')+serialize(article.root)+'<p class="source">Original essay: <a href="'+escape(article.url)+'">1000-Word Philosophy</a>.</p>';
    return packageBook(article.title,[{file:'essay.xhtml',title:article.title,headings:article.headings,body:body}],assets,article.author,key(article.url));
  }
  function directoryBook(source){
    const doc=parse(source),root=content(doc).cloneNode(true);cleanBase(root,SITE+'/all-essays/');
    Array.from(root.children).forEach(el=>{if(/^(Follow 1000|If you found|Discover more|Subscribe)/i.test(text(el)))el.remove();});
    root.querySelectorAll('img').forEach(el=>el.remove());
    const headings=[];root.querySelectorAll('h2,h3,h4').forEach((h,i)=>{h.id='topic-'+i;headings.push({title:text(h),id:h.id});});
    const body='<h1>All Essays</h1><p>A topic guide to 1000-Word Philosophy. Essay links open the original website.</p>'+serialize(root)+'<p class="source">Source: <a href="'+SITE+'/all-essays/">All Essays</a>. Retrieved '+new Date().toISOString().slice(0,10)+'.</p>';
    return packageBook('1000-Word Philosophy — All Essays',[{file:'directory.xhtml',title:'Essay directory',headings:headings,body:body}],[],'1000-Word Philosophy','essay-directory');
  }
  function readLedger(raw){
    if(!raw)return{format:'philosophy-pocket-library',version:1,articles:{}};
    let value;try{value=JSON.parse(raw);}catch(_){throw new Error('philosophy-library.txt is not valid. Restore it from your sync backup before scraping.');}
    if(value.format!=='philosophy-pocket-library'||value.version!==1||!value.articles||typeof value.articles!=='object'||Array.isArray(value.articles))throw new Error('Unrecognized download history. It has been left untouched.');
    return value;
  }
  function isSaved(ledger,article,files){return !!ledger.articles[article.id||key(article.url)] || (files||[]).includes(filename(article));}
  global.Philosophy={SITE: SITE,normalize:normalize,key:key,filename:filename,discover:discover,extract:extract,articleBook:articleBook,directoryBook:directoryBook,readLedger:readLedger,isSaved:isSaved,serialize:serialize,zip:zip,zipBlob:zipBlob};
})(window);
