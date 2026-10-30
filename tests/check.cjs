const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawnSync}=require('child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.build','tests');fs.mkdirSync(out,{recursive:true});for(const name of fs.readdirSync(out))if(name.endsWith('.epub'))fs.unlinkSync(path.join(out,name));
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const body='<p>Author: Test Author<br>Category: Logic<br>Word Count: 1000</p><p>This original test passage contains enough text to exercise extraction without including any published essay. A numbered note<sup><a href="#_ftn1">[1]</a></sup> appears twice [1]. Mathematics stays intact: x<sup>2</sup>, S<sub>0</sub>, and H<sub>2</sub>O. This intentionally long sentence tests the content length guard and checks that the EPUB retains every character of the original synthetic prose.</p><figure><img src="https://i0.wp.com/1000wordphilosophy.com/test.png" alt="Synthetic test image"></figure><h3>Notes</h3><p><a name="_ftn1" href="#_ftnref1">[1]</a> A note with an italic <em>book title</em>.</p><p>A second paragraph in the same note.</p><h3>References</h3><p>Author. A book.</p><h3>Related Essays</h3><p>Remove this recommendation.</p><h3>Appendix</h3><p>Keep this appendix.</p><h3>About the Author</h3><p>Remove this biography.</p>';
const posts=[1,2,3].map(n=>({id:n,slug:'sample-'+n,date:'2026-10-0'+(4-n)+'T00:00:00',modified:'2026-10-01T00:00:00',link:'https://1000wordphilosophy.com/2026/10/0'+(4-n)+'/sample-'+n+'/',title:{rendered:'Synthetic essay '+n},content:{rendered:body,protected:false}}));
const directory={id:100,link:'https://1000wordphilosophy.com/all-essays/',title:{rendered:'All Essays'},content:{rendered:'<h2 id="logic">Logic</h2><ul>'+posts.map(p=>'<li><a href="'+p.link+'">'+p.title.rendered+'</a> by Test Author</li>').join('')+'</ul>'}};
const blank=()=>({format:'philosophy-pocket-library',version:1,articles:{}});
function policy(){return {source:'https://1000wordphilosophy.com/robots.txt',checkedAt:new Date().toISOString(),text:'User-agent: *\nDisallow: /wp-admin/\n'};}
const server=http.createServer((req,res)=>{
 const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
 if(name==='site-policy.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(policy()));return;}
 if(name.includes('..')){res.writeHead(403);res.end();return;}
 const file=path.join(root,'web',name);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
});
async function mocks(page,requests){await page.route('https://**/*',async route=>{
 const url=new URL(route.request().url());requests.push(url.href);
 if(url.hostname==='i0.wp.com'){await route.fulfill({status:200,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from(png,'base64')});return;}
 const match=url.pathname.match(/\/posts\/(\d+)$/);
 let data;if(url.pathname.endsWith('/pages'))data=[directory];else if(match)data=posts.find(p=>p.id===Number(match[1]));else if(url.pathname.endsWith('/posts'))data=posts.map(({content,...p})=>p);else throw new Error('Unexpected request '+url);
 await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
});}
async function fakeFolder(page,ledger){await page.addInitScript(value=>{
 window.testStore=new Map();if(value)window.testStore.set('philosophy-library.txt',new Blob([JSON.stringify(value)]));
 window.showDirectoryPicker=async()=>({name:'Philosophy',kind:'directory',async *entries(){for(const name of window.testStore.keys())yield[name,{kind:'file'}];},async getFileHandle(name,options){if(!window.testStore.has(name)&&!(options&&options.create))throw new DOMException('Missing','NotFoundError');return {async getFile(){return window.testStore.get(name)||new Blob([]);},async createWritable(){let data;return {async write(value){data=value;},async close(){window.testStore.set(name,new Blob([data]));},async abort(){}};}};}});
 },ledger);}
async function clickDownload(page){await page.locator('#download').click();await page.waitForFunction(()=>!PocketApp.state.busy&&/Done\.|already downloaded|Ready to save|Could not finish|No new articles/.test(document.getElementById('status').textContent),{timeout:60000});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}}),requests=[];await mocks(page,requests);const ledger=blank();ledger.articles['sample-1']={url:posts[0].link,file:'synced-on-another-device.epub'};await fakeFolder(page,ledger);await page.goto(url);
  assert.equal(await page.locator('button').count(),2);await page.locator('#chooseFolder').click();await clickDownload(page);
  assert.equal(await page.locator('#status').textContent(),'Done.');assert(!requests.some(u=>u.includes('/posts/1?')),'A synced record must skip the article before content is fetched');
  const names=await page.evaluate(()=>Array.from(testStore.keys()));assert.equal(names.filter(n=>n.endsWith('.epub')&&n!=='All Essays.epub').length,2);assert(names.includes('philosophy-library.backup.txt'));
  let result=await page.evaluate(async()=>{const a=Philosophy.extract('<h1 class="entry-title">Test</h1><div class="entry-content">'+JSON.parse((await browserNative('fetch',{url:'https://1000wordphilosophy.com/wp-json/wp/v2/posts/2',fresh:false})).text).content.rendered+'</div>','https://1000wordphilosophy.com/2026/10/02/sample-2/');return {stats:a.stats,raw:Philosophy.serialize(a.root)};});
  assert.equal(result.stats.notes,1);assert.equal(result.stats.references,2);assert.equal(result.stats.subscripts,2);assert(result.raw.includes('<sup>2</sup>'));assert(result.raw.includes('second paragraph'));assert(result.raw.includes('Keep this appendix'));assert(!result.raw.includes('Remove this recommendation'));assert(!result.raw.includes('Remove this biography'));
  const before=requests.length;await clickDownload(page);assert(!requests.slice(before).some(u=>/\/posts\/\d+/.test(u)),'Repeated run must fetch no essay content');
  await page.evaluate(()=>{window.testStore=new Map();});await page.locator('#chooseFolder').click();await clickDownload(page);assert.equal((await page.evaluate(()=>Array.from(testStore.keys()))).filter(n=>n.endsWith('.epub')&&n!=='All Essays.epub').length,3,'An empty directory downloads the full discovered collection');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  const files=await page.evaluate(async()=>{const out=[];for(const [name,blob] of testStore)out.push({name,data:Array.from(new Uint8Array(await blob.arrayBuffer()))});return out;});for(const f of files)fs.writeFileSync(path.join(out,f.name),Buffer.from(f.data));
  await page.evaluate(()=>{window.testStore=new Map([['philosophy-library.txt',new Blob(['broken'])]]);});await page.locator('#chooseFolder').click();const beforeBad=requests.length;await clickDownload(page);assert.equal(requests.length,beforeBad,'Corrupt history must stop before any scraping');
  const zipPage=await browser.newPage({viewport:{width:520,height:700}}),zipRequests=[];await zipPage.addInitScript(()=>{window.showDirectoryPicker=undefined;});await mocks(zipPage,zipRequests);await zipPage.goto(url);
  const imported=path.join(out,'imported');fs.mkdirSync(imported,{recursive:true});fs.writeFileSync(path.join(imported,'philosophy-library.txt'),JSON.stringify(ledger));
  const chooserPromise=zipPage.waitForEvent('filechooser');await zipPage.locator('#chooseFolder').click();const chooser=await chooserPromise;await chooser.setFiles(imported);await zipPage.waitForFunction(()=>PocketApp.state.folder);await clickDownload(zipPage);assert.equal(await zipPage.locator('#download').textContent(),'Save ZIP');
  const downloadPromise=zipPage.waitForEvent('download');await zipPage.locator('#download').click();const download=await downloadPromise;await download.saveAs(path.join(out,'portable-library.zip'));await zipPage.screenshot({path:path.join(out,'browser-zip.png'),fullPage:true});
  assert(!zipRequests.some(u=>u.includes('/posts/1?')),'ZIP import must also respect synced records');
  // Metadata pagination does not read content and handles more than one page.
  await page.evaluate(value=>window.testDirectory=value,directory);
  const paginated=await page.evaluate(async()=>{let calls=0;const data=await PhilosophyAPI.catalog(async url=>{if(url.includes('/pages?'))return {text:JSON.stringify([window.testDirectory])};calls++;const n=new URL(url).searchParams.get('page');return {text:JSON.stringify(Array.from({length:n==='1'?100:1},(_,i)=>({id:(n==='1'?i:100)+1,link:'https://1000wordphilosophy.com/2026/01/01/p-'+n+'-'+i+'/',date:'2026-01-01',title:{rendered:'Test'}})))};});return {calls,count:data.length};});assert.deepEqual(paginated,{calls:2,count:104});
  // Reproduce a broken image, a stale directory alias, and an explicit unavailable notice.
  const regression=await browser.newPage(),regPosts=JSON.parse(JSON.stringify(posts));
  regPosts[0].content.rendered=body.replace('<img src=', '<img data-orig-file="https://i0.wp.com/oversized-original.jpg" data-large-file="https://i0.wp.com/small.png" src=');
  regPosts[1].content.rendered=body.replace('test.png','broken.png');
  regPosts[2].content.rendered='<p>This essay is currently unavailable. Check back later for an updated discussion of this topic.</p>';
  const regDirectory=JSON.parse(JSON.stringify(directory));regDirectory.content.rendered=regDirectory.content.rendered.replace('/sample-2/','/old-sample-2/');
  await regression.addInitScript(({items,index,png})=>{
    window.testPosts=items;window.testRequests=[];window.testStore=new Map();
    window.testNative=async(action,args)=>{
      if(action==='settings'||action==='chooseFolder')return action==='settings'?{folder:{label:'Test',baseURI:'file:///test/'}}:{label:'Test',baseURI:'file:///test/'};
      if(action==='keepAwake')return true;
      if(action==='library')return {files:Array.from(testStore.keys()),ledger:testStore.has('philosophy-library.txt')?await testStore.get('philosophy-library.txt').text():''};
      if(action==='write'){const data=args.base64?Uint8Array.from(atob(args.base64),c=>c.charCodeAt(0)):args.text;testStore.set(args.name,new Blob([data]));return {saved:true};}
      if(action==='fetch'){
        testRequests.push(args.url);const url=new URL(args.url);
        if(url.pathname==='/robots.txt')return {status:200,text:'User-agent: *'};
        if(url.hostname==='i0.wp.com')return url.pathname.includes('broken')?{status:404}:{status:200,base64:png};
        let data;if(url.pathname.endsWith('/pages'))data=[index];else if(url.pathname.endsWith('/posts'))data=testPosts.map(({content,...p})=>p);else data=testPosts.find(p=>p.id===Number(url.pathname.split('/').pop()));
        return {status:200,text:JSON.stringify(data)};
      }throw new Error('Unexpected action '+action);
    };
  },{items:regPosts,index:regDirectory,png});
  await regression.goto(url);await clickDownload(regression);
  let reg=await regression.evaluate(async()=>({ledger:JSON.parse(await testStore.get('philosophy-library.txt').text()),files:Array.from(testStore.keys()),requests:testRequests.slice()}));
  assert.equal(Object.keys(reg.ledger.articles).length,2);assert.equal(reg.ledger.articles['sample-2'].warnings.length,1,'Image failure must still save the essay');assert(reg.ledger.unavailable['sample-3']);
  assert(reg.files.includes('Synthetic essay 1.epub'));assert(reg.files.includes('Synthetic essay 2.epub'));assert(!reg.requests.some(u=>u.includes('oversized-original')),'Prefer the reading-sized image');assert(reg.requests.some(u=>u.includes('/small.png?fit=1600%2C1600')));
  assert(reg.files.includes('All Essays.epub'));assert(!reg.requests.some(u=>u.includes('old-sample-2')),'Resolve directory aliases using metadata');
  const regBefore=reg.requests.length;await clickDownload(regression);assert(!(await regression.evaluate(n=>testRequests.slice(n),regBefore)).some(u=>/\/posts\/\d+/.test(u)),'Do not refetch saved or unchanged unavailable essays');
  await regression.evaluate(newBody=>{testPosts[2].modified='2026-10-02T00:00:00';testPosts[2].content.rendered=newBody;},body);await clickDownload(regression);
  reg=await regression.evaluate(async()=>JSON.parse(await testStore.get('philosophy-library.txt').text()));assert(reg.articles['sample-3']);assert(!reg.unavailable['sample-3'],'A restored essay must be downloaded when modified');
  const compatibility=await regression.evaluate(()=>{
    const item={id:'sample-2',url:'https://1000wordphilosophy.com/2026/10/02/sample-2/',date:'2026-10-02',title:'Synthetic essay 2',aliases:['old-sample-2']};
    const history=Philosophy.readLedger('');history.articles['old-sample-2']={file:'legacy.epub'};
    return {alias:Philosophy.isSaved(history,item,[]),legacy:Philosophy.isSaved(Philosophy.readLedger(''),item,['2026-10-02 - sample-2.epub']),filename:Philosophy.filename({title:'A: B? / C',url:item.url}),record:Philosophy.libraryFilename(history,item,[])};
  });assert.deepEqual(compatibility,{alias:true,legacy:true,filename:'A — B C.epub',record:'legacy.epub'});
  const sizes=await regression.evaluate(async()=>{
    async function test(width,height,type){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#333';context.fillRect(0,0,width,height);const raw=atob(canvas.toDataURL(type).split(',')[1]);const result=await Philosophy.readingImage(Uint8Array.from(raw,c=>c.charCodeAt(0)));return {width:result.width,height:result.height,type:result.type};}
    return [await test(3200,2000,'image/jpeg'),await test(1200,3000,'image/png'),await test(320,240,'image/png'),await test(2400,1200,'image/webp')];
  });assert.deepEqual(sizes,[{width:1600,height:1000,type:'image/jpeg'},{width:640,height:1600,type:'image/png'},{width:320,height:240,type:'image/png'},{width:1600,height:800,type:'image/png'}]);
  const checked=spawnSync('python3',[path.join(root,'tests/validate_epub.py'),out],{stdio:'inherit'});assert.equal(checked.status,0);
  console.log('PASS: two-button UI; three-essay conversion with images; linked notes; math and appendix; synced-history skips before fetch; empty-folder restart; repeat run; corrupt-history stop; ZIP export and import; API pagination; All Essays aliases; title-only and legacy filenames; image failure recovery; unavailable/restored essays; category/date master indexes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
