#!/usr/bin/env python3
"""Build native wrappers; release signing credentials come only from the environment."""
import json,os,pathlib,plistlib,secrets,shutil,subprocess,sys,zipfile
ROOT=pathlib.Path(__file__).resolve().parent
BUILD=pathlib.Path(os.environ.get('POCKET_BUILD',str(ROOT/'.build')))
OUT=pathlib.Path(os.environ.get('POCKET_OUTPUT',str(ROOT/'dist')))
VERSION=os.environ.get('APP_VERSION',json.loads((ROOT/'package.json').read_text())['version']).removeprefix('v')
BUILD.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
def run(*args):subprocess.run([str(a) for a in args],check=True)
def mac():
    app=OUT/'1000 Word Philosophy Scraper.app';contents=app/'Contents'
    (contents/'MacOS').mkdir(parents=True,exist_ok=True);(contents/'Resources').mkdir(exist_ok=True)
    shutil.copytree(ROOT/'web',contents/'Resources'/'web',dirs_exist_ok=True)
    info={'CFBundleExecutable':'PhilosophyPocket','CFBundleIdentifier':'com.philosophypocket.app','CFBundleName':'1000 Word Philosophy Scraper','CFBundleDisplayName':'1000 Word Philosophy Scraper','CFBundlePackageType':'APPL','CFBundleShortVersionString':VERSION,'CFBundleVersion':'2','LSMinimumSystemVersion':'12.0','NSHighResolutionCapable':True,'NSPrincipalClass':'NSApplication'}
    (contents/'Info.plist').write_bytes(plistlib.dumps(info));sdk=subprocess.check_output(['xcrun','--show-sdk-path'],text=True).strip();binaries=[]
    for arch in ['arm64','x86_64']:
        binary=BUILD/('PhilosophyPocket-'+arch)
        run('xcrun','swiftc','-swift-version','5','-O','-sdk',sdk,'-target',arch+'-apple-macos12.0','-module-cache-path',BUILD/'swift-cache',ROOT/'macos'/'App.swift','-o',binary);binaries.append(binary)
    run('lipo','-create',*binaries,'-output',contents/'MacOS'/'PhilosophyPocket')
    run('codesign','--force','--deep','--sign','-',app);run('codesign','--verify','--deep','--strict',app)
    run('ditto','-c','-k','--keepParent',app,OUT/'1000-Word-Philosophy-Mac.zip');print('Built',app)
def android():
    sdk=pathlib.Path(os.environ.get('ANDROID_HOME',str(pathlib.Path.home()/'Library/Android/sdk')))
    tools=sdk/'build-tools'/'35.0.0';jar=sdk/'platforms'/'android-35'/'android.jar'
    folder=BUILD/'android';classes=folder/'classes';dex=folder/'dex';classes.mkdir(parents=True,exist_ok=True);dex.mkdir(exist_ok=True)
    unsigned=folder/'unsigned.apk';aligned=folder/'aligned.apk'
    manifest=(ROOT/'android/AndroidManifest.xml').read_text().replace('android:versionCode="1"','android:versionCode="2"').replace('android:versionName="1.0"','android:versionName="'+VERSION+'"')
    manifest_path=folder/'AndroidManifest.xml';manifest_path.write_text(manifest)
    run(tools/'aapt','package','-f','-M',manifest_path,'-S',ROOT/'android/res','-A',ROOT/'web','-I',jar,'-F',unsigned)
    run('javac','-source','8','-target','8','-classpath',jar,'-d',classes,*sorted((ROOT/'android/src').rglob('*.java')))
    run(tools/'d8','--lib',jar,'--min-api','26','--output',dex,*sorted(classes.rglob('*.class')))
    with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED) as z:
        for file in dex.glob('*.dex'):z.write(file,file.name)
    run(tools/'zipalign','-f','4',unsigned,aligned)
    if os.environ.get('ANDROID_KEYSTORE_PATH'):
        keystore=pathlib.Path(os.environ['ANDROID_KEYSTORE_PATH'])
        if not keystore.is_file() or not os.environ.get('ANDROID_KEYSTORE_PASSWORD'):raise RuntimeError('Release signing key or password is missing')
    else:
        if os.environ.get('RELEASE_BUILD')=='1':raise RuntimeError('A release requires the configured signing key')
        keystore=BUILD/'development-signing.p12';passwordfile=BUILD/'development-signing-password.txt'
        if not passwordfile.exists():passwordfile.write_text(secrets.token_urlsafe(32));passwordfile.chmod(0o600)
        os.environ['ANDROID_KEYSTORE_PASSWORD']=passwordfile.read_text()
        if not keystore.exists():
            run('keytool','-genkeypair','-keystore',keystore,'-storepass:env','ANDROID_KEYSTORE_PASSWORD','-alias','pocket','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Philosophy Scraper Development Build','-storetype','PKCS12')
    apk=OUT/'1000-Word-Philosophy-Android.apk'
    run(tools/'apksigner','sign','--ks',keystore,'--ks-pass','env:ANDROID_KEYSTORE_PASSWORD','--out',apk,aligned)
    run(tools/'apksigner','verify','--verbose',apk);print('Built',apk)
if __name__=='__main__':
    target=sys.argv[1] if len(sys.argv)>1 else 'all'
    if target in ('all','mac'):mac()
    if target in ('all','android'):android()
