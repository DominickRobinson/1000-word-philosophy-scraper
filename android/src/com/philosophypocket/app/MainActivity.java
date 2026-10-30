package com.philosophypocket.app;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private String folder;
    private int pickerId;
    private long lastRequest;
    private final Set<String> hosts=new HashSet<>(Arrays.asList("1000wordphilosophy.com","www.1000wordphilosophy.com","i0.wp.com","i1.wp.com","i2.wp.com","1000wordphilosophy.files.wordpress.com"));
    public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().setStatusBarColor(0xffffffff);getWindow().setNavigationBarColor(0xffffffff);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        folder=getPreferences(0).getString("folder",null);
        web=new WebView(this);web.setBackgroundColor(0xffffffff);web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(),"Android");
        web.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !r.getUrl().toString().startsWith("file:///android_asset/");}
            public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                String resource=r.getUrl().toString();
                // Local image decoding/resizing needs data URLs; network access uses the native fetch bridge.
                if(resource.startsWith("file:///android_asset/")||resource.startsWith("data:image/png;base64,")||resource.startsWith("data:image/jpeg;base64,")||resource.startsWith("data:image/gif;base64,")||resource.startsWith("data:image/webp;base64,"))return null;
                return new WebResourceResponse("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));
            }
        });
        setContentView(web);web.loadUrl("file:///android_asset/index.html");
    }
    void reply(int id,Object result,String error){
        final String js="window.nativeResult("+id+","+(result==null?"null":result.toString())+","+(error==null?"null":JSONObject.quote(error))+");";
        runOnUiThread(()->web.evaluateJavascript(js,null));
    }
    JSONObject folderInfo()throws Exception{return folder==null?null:new JSONObject().put("label",folder.startsWith("content:")?Uri.decode(DocumentsContract.getTreeDocumentId(Uri.parse(folder))):folder);}
    class Bridge{
        @JavascriptInterface public void postMessage(String raw){
            try{JSONObject message=new JSONObject(raw);final int id=message.getInt("id");final String action=message.getString("action");final JSONObject args=message.optJSONObject("args");
                if(action.equals("chooseFolder")){pickerId=id;runOnUiThread(()->chooseFolder());return;}
                if(action.equals("settings")){reply(id,new JSONObject().put("folder",folderInfo()==null?JSONObject.NULL:folderInfo()),null);return;}
                if(action.equals("keepAwake")){runOnUiThread(()->{if(args.optBoolean("on"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});reply(id,Boolean.TRUE,null);return;}
                if(action.equals("openURL")){URL url=new URL(args.getString("url"));if(!allowed(url))throw new IOException("Unsupported link");runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url.toString())));reply(id,Boolean.TRUE,null);}catch(Exception e){reply(id,null,"No browser is installed. RSS: https://1000wordphilosophy.com/feed/");}});return;}
                worker.execute(()->{try{
                    if(action.equals("fetch"))reply(id,fetch(args),null);
                    else if(action.equals("library"))reply(id,library(),null);
                    else if(action.equals("write")){write(args);reply(id,new JSONObject().put("saved",true),null);}
                    else throw new IOException("Unknown operation");
                }catch(Exception e){reply(id,null,e.getMessage()==null?e.toString():e.getMessage());}});
            }catch(Exception ignored){}
        }
    }
    void chooseFolder(){
        new AlertDialog.Builder(this,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("Save your EPUBs").setItems(new String[]{"Choose a device folder (Supernote)","Choose with Android file picker"},(dialog,which)->{
            if(which==0){if(checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE,Manifest.permission.WRITE_EXTERNAL_STORAGE},42);else browse(Environment.getExternalStorageDirectory());}
            else{try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(intent,41);}catch(ActivityNotFoundException e){reply(pickerId,null,"No Android folder picker is installed. Choose a device folder instead.");}}
        }).setNegativeButton("Cancel",(d,w)->reply(pickerId,null,null)).setOnCancelListener(d->reply(pickerId,null,null)).show();
    }
    public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==42){if(checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED)browse(Environment.getExternalStorageDirectory());else reply(pickerId,null,"Folder permission was not granted. Try the Android file picker.");}}
    void browse(File directory){
        File[] dirs=directory.listFiles(f->f.isDirectory()&&!f.getName().startsWith("."));if(dirs==null)dirs=new File[0];Arrays.sort(dirs,Comparator.comparing(File::getName));final File[] children=dirs;ArrayList<String> names=new ArrayList<>();boolean hasParent=!directory.equals(Environment.getExternalStorageDirectory());if(hasParent)names.add("↑ Parent folder");for(File f:children)names.add(f.getName()+"/");
        // Own the layout and colors: some e-ink firmware hides stock dialog action buttons.
        final Dialog dialog=new Dialog(this,android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setBackgroundColor(0xffffffff);layout.setPadding(20,20,20,20);
        TextView path=new TextView(this);path.setText(directory.getAbsolutePath());path.setTextColor(0xff000000);path.setTextSize(18);path.setMaxLines(3);layout.addView(path);
        ListView list=new ListView(this);list.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_list_item_1,names){
            public View getView(int position,View convert,ViewGroup parent){TextView row=(TextView)super.getView(position,convert,parent);row.setTextColor(0xff000000);row.setBackgroundColor(0xffffffff);return row;}
        });layout.addView(list,new LinearLayout.LayoutParams(-1,0,1));
        list.setOnItemClickListener((parent,view,which,id)->{dialog.dismiss();if(hasParent&&which==0)browse(directory.getParentFile());else browse(children[which-(hasParent?1:0)]);});
        Button select=pickerButton("Select folder");layout.addView(select);select.setOnClickListener(v->{dialog.dismiss();folder=directory.getAbsolutePath();saveFolder();});
        Button create=pickerButton("New folder");layout.addView(create);create.setOnClickListener(v->{
            dialog.dismiss();EditText input=new EditText(this);input.setSingleLine(true);input.setText("Philosophy");
            new AlertDialog.Builder(this,android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("New folder").setView(input).setPositiveButton("Create",(d,w)->{
                String name=input.getText().toString().trim();if(name.isEmpty()||name.contains("/")||name.equals("..")){reply(pickerId,null,"Invalid folder name");return;}
                File child=new File(directory,name);if(child.mkdir()||child.isDirectory())browse(child);else reply(pickerId,null,"Could not create folder");
            }).setNegativeButton("Cancel",(d,w)->browse(directory)).setOnCancelListener(d->browse(directory)).show();
        });
        Button cancel=pickerButton("Cancel");layout.addView(cancel);cancel.setOnClickListener(v->{dialog.dismiss();reply(pickerId,null,null);});
        dialog.setContentView(layout);dialog.setOnCancelListener(d->reply(pickerId,null,null));dialog.show();dialog.getWindow().setLayout(-1,-1);
    }
    Button pickerButton(String title){Button button=new Button(this);button.setText(title);button.setTextSize(18);button.setTextColor(0xff000000);button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffeeeeee));button.setAllCaps(false);button.setMinHeight((int)(56*getResources().getDisplayMetrics().density));return button;}

    void saveFolder(){try{getPreferences(0).edit().putString("folder",folder).apply();reply(pickerId,folderInfo(),null);}catch(Exception e){reply(pickerId,null,e.getMessage());}}
    protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==41){if(result==RESULT_OK&&data!=null&&data.getData()!=null){try{Uri uri=data.getData();getContentResolver().takePersistableUriPermission(uri,data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION));folder=uri.toString();saveFolder();}catch(Exception e){reply(pickerId,null,e.getMessage());}}else reply(pickerId,null,null);}}
    Uri rootUri(){Uri tree=Uri.parse(folder);return DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));}
    Map<String,Uri> documents(Uri parent)throws Exception{
        Map<String,Uri> result=new HashMap<>();Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(Uri.parse(folder),DocumentsContract.getDocumentId(parent));
        try(Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){if(c==null)throw new IOException("Could not read the chosen folder");while(c.moveToNext())result.put(c.getString(1),DocumentsContract.buildDocumentUriUsingTree(Uri.parse(folder),c.getString(0)));}return result;
    }
    Uri parentUri(String sub,boolean create)throws Exception{
        Uri root=rootUri();if(sub.isEmpty())return root;Uri child=documents(root).get(sub);
        if(child==null&&create)child=DocumentsContract.createDocument(getContentResolver(),root,DocumentsContract.Document.MIME_TYPE_DIR,sub);
        if(child==null&&create)throw new IOException("Cannot create "+sub);return child;
    }
    String outputFolder(String name){return name.equals("All Papers.epub")?"":name.endsWith(".txt")?"app-data":"papers";}
    void validateName(String name)throws IOException{if(name.contains("/")||name.contains("\\")||name.startsWith(".")||!(name.endsWith(".epub")||name.equals("philosophy-library.txt")||name.equals("philosophy-library.backup.txt")))throw new IOException("Invalid output file");}
    Set<String> names(String sub)throws Exception{
        if(folder.startsWith("content:")){Uri parent=parentUri(sub,false);return parent==null?new HashSet<>():new HashSet<>(documents(parent).keySet());}
        File dir=sub.isEmpty()?new File(folder):new File(folder,sub);String[] files=dir.list();if(files==null&&sub.isEmpty())throw new IOException("Folder is unavailable. Choose it again.");return files==null?new HashSet<>():new HashSet<>(Arrays.asList(files));
    }
    byte[] readFile(String sub,String name)throws Exception{
        if(folder.startsWith("content:")){Uri parent=parentUri(sub,false);if(parent==null)return null;Uri file=documents(parent).get(name);return file==null?null:readAll(getContentResolver().openInputStream(file));}
        File file=new File(sub.isEmpty()?new File(folder):new File(folder,sub),name);return file.isFile()?readAll(new FileInputStream(file)):null;
    }
    void removeFile(String sub,String name)throws Exception{
        if(folder.startsWith("content:")){Uri parent=parentUri(sub,false);if(parent!=null){Uri file=documents(parent).get(name);if(file!=null&&!DocumentsContract.deleteDocument(getContentResolver(),file))throw new IOException("Could not remove old file");}}
        else java.nio.file.Files.deleteIfExists(new File(sub.isEmpty()?new File(folder):new File(folder,sub),name).toPath());
    }
    byte[] readAll(InputStream stream)throws Exception{if(stream==null)throw new IOException("Could not open file");try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>20000000)throw new IOException("File exceeds 20 MB limit");}return out.toByteArray();}}
    JSONObject library()throws Exception{
        if(folder==null)throw new IOException("Choose a folder first");
        byte[] record=readFile("app-data","philosophy-library.txt");if(record==null)record=readFile("","philosophy-library.txt");
        if(record==null)record=readFile("app-data","philosophy-library.backup.txt");if(record==null)record=readFile("","philosophy-library.backup.txt");
        String ledger=record==null?"":new String(record,StandardCharsets.UTF_8);
        Set<String> legacy=new HashSet<>();
        if(!ledger.isEmpty()){
            JSONObject history=new JSONObject(ledger);if(!history.optString("format").equals("philosophy-pocket-library")||history.optInt("version")!=1)throw new IOException("Unrecognized download history");
            JSONObject articles=history.getJSONObject("articles");Iterator<String> keys=articles.keys();while(keys.hasNext()){String file=articles.getJSONObject(keys.next()).optString("file");if(!file.isEmpty())legacy.add(file);}
        }
        legacy.add("philosophy-library.txt");legacy.add("philosophy-library.backup.txt");Set<String> rootNames=names("");
        for(String name:legacy){validateName(name);String target=outputFolder(name);if(!rootNames.contains(name)||names(target).contains(name))continue;byte[] old=readFile("",name);if(old!=null){writeFile(target,name,old,false);removeFile("",name);}}
        Set<String> all=names("");all.addAll(names("papers"));return new JSONObject().put("files",new JSONArray(all)).put("ledger",ledger);
    }
    void write(JSONObject args)throws Exception{
        if(folder==null)throw new IOException("Choose a folder first");String name=args.getString("name");validateName(name);String sub=outputFolder(name);
        byte[] data=args.has("base64")?android.util.Base64.decode(args.getString("base64"),android.util.Base64.DEFAULT):args.getString("text").getBytes(StandardCharsets.UTF_8);
        if(name.equals("philosophy-library.txt")){byte[] old=readFile(sub,name);if(old!=null)writeFile(sub,"philosophy-library.backup.txt",old,true);}
        writeFile(sub,name,data,args.optBoolean("replace"));
        if(name.equals("All Papers.epub"))removeFile("","All Essays.epub");
    }
    void writeFile(String sub,String name,byte[] data,boolean replace)throws Exception{
        if(folder.startsWith("content:")){
            Uri parent=parentUri(sub,true);Map<String,Uri> docs=documents(parent);if(docs.containsKey(name)&&!replace)return;
            Uri temporary=DocumentsContract.createDocument(getContentResolver(),parent,name.endsWith(".epub")?"application/epub+zip":"text/plain",name+".partial");if(temporary==null)throw new IOException("Cannot create output file");
            try(OutputStream out=getContentResolver().openOutputStream(temporary,"wt")){if(out==null)throw new IOException("Cannot write output file");out.write(data);out.flush();}
            if(docs.containsKey(name))DocumentsContract.deleteDocument(getContentResolver(),docs.get(name));
            if(DocumentsContract.renameDocument(getContentResolver(),temporary,name)==null)throw new IOException("The file provider could not finish saving. The .partial file contains the completed data.");
        }else{
            File parent=sub.isEmpty()?new File(folder):new File(folder,sub);if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("Cannot create "+sub);
            File destination=new File(parent,name);if(destination.exists()&&!replace)return;atomicWrite(destination,data);
        }
    }
    void atomicWrite(File target,byte[] bytes)throws Exception{File tmp=new File(target.getParentFile(),target.getName()+".partial");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(bytes);out.getFD().sync();}java.nio.file.Files.move(tmp.toPath(),target.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
    boolean allowed(URL url){return url.getProtocol().equals("https")&&hosts.contains(url.getHost())&&url.getUserInfo()==null;}
    JSONObject fetch(JSONObject args)throws Exception{
        String raw=args.getString("url");URL url=new URL(raw);if(!allowed(url))throw new IOException("Only the philosophy website and its image hosts can be downloaded");
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));StringBuilder hash=new StringBuilder();for(byte b:digest)hash.append(String.format("%02x",b));File cached=new File(getCacheDir(),hash+".json");
        if(!args.optBoolean("fresh")&&cached.exists())return new JSONObject(new String(readAll(new FileInputStream(cached)),StandardCharsets.UTF_8));
        long delay=1000-(System.currentTimeMillis()-lastRequest);if(delay>0)Thread.sleep(delay);lastRequest=System.currentTimeMillis();
        for(int redirects=0;redirects<6;redirects++){
            if(!allowed(url))throw new IOException("Redirect to an unsupported host");HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(25000);c.setReadTimeout(50000);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","PhilosophyPocket/1.0 (personal EPUB library; rate-limited)");
            try{int status=c.getResponseCode();if(status>=300&&status<400){url=new URL(url,c.getHeaderField("Location"));continue;}if(status!=200)return new JSONObject().put("status",status);
                byte[] data=readAll(c.getInputStream());JSONObject result=new JSONObject().put("status",status).put("url",url.toString()).put("text",new String(data,StandardCharsets.UTF_8)).put("base64",android.util.Base64.encodeToString(data,android.util.Base64.NO_WRAP));atomicWrite(cached,result.toString().getBytes(StandardCharsets.UTF_8));return result;
            }finally{c.disconnect();}
        }throw new IOException("Too many redirects");
    }
    public void onBackPressed(){new AlertDialog.Builder(this).setTitle("Close scraper?").setMessage("Keep the app open until downloads finish. Completed EPUBs and download history are already saved.").setPositiveButton("Close",(d,w)->finish()).setNegativeButton("Keep open",null).show();}
    protected void onDestroy(){worker.shutdownNow();super.onDestroy();}
}
