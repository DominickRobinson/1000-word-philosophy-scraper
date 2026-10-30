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
            public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){if(!r.getUrl().toString().startsWith("file:///android_asset/"))return new WebResourceResponse("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));return null;}
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
        new AlertDialog.Builder(this).setTitle("Save your EPUBs").setItems(new String[]{"Choose a device folder (Supernote)","Choose with Android file picker"},(dialog,which)->{
            if(which==0){if(checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE,Manifest.permission.WRITE_EXTERNAL_STORAGE},42);else browse(Environment.getExternalStorageDirectory());}
            else{try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(intent,41);}catch(ActivityNotFoundException e){reply(pickerId,null,"No Android folder picker is installed. Choose a device folder instead.");}}
        }).setNegativeButton("Cancel",(d,w)->reply(pickerId,null,null)).setOnCancelListener(d->reply(pickerId,null,null)).show();
    }
    public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==42){if(checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED)browse(Environment.getExternalStorageDirectory());else reply(pickerId,null,"Folder permission was not granted. Try the Android file picker.");}}
    void browse(File directory){
        File[] dirs=directory.listFiles(f->f.isDirectory()&&!f.getName().startsWith("."));if(dirs==null)dirs=new File[0];Arrays.sort(dirs,Comparator.comparing(File::getName));final File[] children=dirs;ArrayList<String> names=new ArrayList<>();boolean hasParent=!directory.equals(Environment.getExternalStorageDirectory());if(hasParent)names.add("↑ Parent folder");for(File f:children)names.add(f.getName()+"/");
        new AlertDialog.Builder(this).setTitle(directory.getAbsolutePath()).setItems(names.toArray(new String[0]),(d,which)->{if(hasParent&&which==0)browse(directory.getParentFile());else browse(children[which-(hasParent?1:0)]);}).setPositiveButton("Use this folder",(d,w)->{folder=directory.getAbsolutePath();saveFolder();}).setNeutralButton("New folder",(d,w)->{EditText input=new EditText(this);input.setSingleLine(true);input.setText("Philosophy");new AlertDialog.Builder(this).setTitle("New folder").setView(input).setPositiveButton("Create",(d2,w2)->{String name=input.getText().toString().trim();if(name.isEmpty()||name.contains("/")||name.equals("..")){reply(pickerId,null,"Invalid folder name");return;}File child=new File(directory,name);if(child.mkdir()||child.isDirectory())browse(child);else reply(pickerId,null,"Could not create folder");}).setNegativeButton("Cancel",(d2,w2)->browse(directory)).show();}).setNegativeButton("Cancel",(d,w)->reply(pickerId,null,null)).setOnCancelListener(d->reply(pickerId,null,null)).show();
    }
    void saveFolder(){try{getPreferences(0).edit().putString("folder",folder).apply();reply(pickerId,folderInfo(),null);}catch(Exception e){reply(pickerId,null,e.getMessage());}}
    protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==41){if(result==RESULT_OK&&data!=null&&data.getData()!=null){try{Uri uri=data.getData();getContentResolver().takePersistableUriPermission(uri,data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION));folder=uri.toString();saveFolder();}catch(Exception e){reply(pickerId,null,e.getMessage());}}else reply(pickerId,null,null);}}
    Map<String,Uri> documents()throws Exception{
        Map<String,Uri> result=new HashMap<>();Uri tree=Uri.parse(folder),children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));
        try(Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){if(c==null)throw new IOException("Could not read the chosen folder");while(c.moveToNext())result.put(c.getString(1),DocumentsContract.buildDocumentUriUsingTree(tree,c.getString(0)));}return result;
    }
    byte[] readAll(InputStream stream)throws Exception{if(stream==null)throw new IOException("Could not open file");try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>20000000)throw new IOException("File exceeds 20 MB limit");}return out.toByteArray();}}
    JSONObject library()throws Exception{
        if(folder==null)throw new IOException("Choose a folder first");JSONArray names=new JSONArray();String ledger="";
        if(folder.startsWith("content:")){Map<String,Uri> docs=documents();for(String name:docs.keySet())names.put(name);Uri record=docs.get("philosophy-library.txt");if(record==null)record=docs.get("philosophy-library.backup.txt");if(record!=null)ledger=new String(readAll(getContentResolver().openInputStream(record)),StandardCharsets.UTF_8);}
        else{File root=new File(folder);String[] files=root.list();if(files==null)throw new IOException("Folder is unavailable. Choose it again.");for(String name:files)names.put(name);File file=new File(root,"philosophy-library.txt");if(!file.exists())file=new File(root,"philosophy-library.backup.txt");if(file.exists())ledger=new String(readAll(new FileInputStream(file)),StandardCharsets.UTF_8);}
        return new JSONObject().put("files",names).put("ledger",ledger);
    }
    void write(JSONObject args)throws Exception{
        if(folder==null)throw new IOException("Choose a folder first");String name=args.getString("name");if(name.contains("/")||name.contains("\\")||name.startsWith(".")||!(name.endsWith(".epub")||name.equals("philosophy-library.txt")))throw new IOException("Invalid output file");
        byte[] data=args.has("base64")?android.util.Base64.decode(args.getString("base64"),android.util.Base64.DEFAULT):args.getString("text").getBytes(StandardCharsets.UTF_8);
        boolean replace=args.optBoolean("replace");
        if(folder.startsWith("content:")){
            Map<String,Uri> docs=documents();if(docs.containsKey(name)&&!replace)return;
            Uri tree=Uri.parse(folder),parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));
            if(name.equals("philosophy-library.txt")&&docs.containsKey(name)){byte[] old=readAll(getContentResolver().openInputStream(docs.get(name)));Uri backup=docs.get("philosophy-library.backup.txt");if(backup==null)backup=DocumentsContract.createDocument(getContentResolver(),parent,"text/plain","philosophy-library.backup.txt");try(OutputStream out=getContentResolver().openOutputStream(backup,"wt")){if(out==null)throw new IOException("Cannot write backup");out.write(old);}}
            // Stage a complete file before replacing the destination. The old ledger is backed up first.
            Uri temporary=DocumentsContract.createDocument(getContentResolver(),parent,name.endsWith(".epub")?"application/epub+zip":"text/plain",name+".partial");if(temporary==null)throw new IOException("Cannot create output file");
            try{try(OutputStream out=getContentResolver().openOutputStream(temporary,"wt")){if(out==null)throw new IOException("Cannot write output file");out.write(data);out.flush();}if(docs.containsKey(name))DocumentsContract.deleteDocument(getContentResolver(),docs.get(name));if(DocumentsContract.renameDocument(getContentResolver(),temporary,name)==null)throw new IOException("The file provider could not finish saving. The .partial file contains the completed data.");}catch(Exception e){throw e;}
        }else{
            File destination=new File(folder,name);if(destination.exists()&&!replace)return;
            if(name.equals("philosophy-library.txt")&&destination.exists())atomicWrite(new File(folder,"philosophy-library.backup.txt"),readAll(new FileInputStream(destination)));
            atomicWrite(destination,data);
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
