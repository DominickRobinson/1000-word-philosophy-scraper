from pathlib import Path
from xml.etree import ElementTree as ET
import json,posixpath,sys,urllib.parse,zipfile
folder=Path(sys.argv[1]);files=sorted(folder.rglob('*.epub'))
assert len(files)==4,'Expected three synthetic essays plus the master index'
for file in files:
    with zipfile.ZipFile(file) as z:
        assert z.namelist()[0]=='mimetype'
        assert z.getinfo('mimetype').compress_type==zipfile.ZIP_STORED
        assert z.read('mimetype')==b'application/epub+zip'
        docs={name:ET.fromstring(z.read(name)) for name in z.namelist() if name.endswith(('.xhtml','.opf','.xml','.ncx'))}
        for name,doc in docs.items():
            ids=[e.attrib['id'] for e in doc.iter() if 'id' in e.attrib]
            assert len(ids)==len(set(ids)),(name,'duplicate IDs')
            for a in doc.iter():
                link=a.get('href') or a.get('src')
                if not link:continue
                u=urllib.parse.urlsplit(link)
                assert u.scheme not in ('file','content'),(name,link,'non-portable local file URI')
                if u.scheme:continue
                dest=posixpath.normpath(posixpath.join(posixpath.dirname(name),u.path)) if u.path else name
                assert dest in z.namelist(),(name,link,'missing file')
                if u.fragment:assert any(e.get('id')==urllib.parse.unquote(u.fragment) for e in docs[dest].iter()),(name,link,'missing anchor')
        if file.name=='All Papers.epub':
            toc=z.read('EPUB/nav.xhtml').decode()
            assert 'By Category' in toc and 'By Date' in toc
            assert '2026-10-03' in z.read('EPUB/dates.xhtml').decode()
            continue
        assert any(n.endswith('.png') for n in z.namelist()),'Images must be embedded'
        main=docs['EPUB/essay.xhtml']
        assert len([e for e in main.iter() if e.get('role')=='doc-noteref'])==2
        assert len([e for e in main.iter() if e.get('role')=='doc-backlink'])==0
with zipfile.ZipFile(folder/'portable-library.zip') as z:
    ledger=json.loads(z.read('app-data/philosophy-library.txt'))
    assert len(ledger['articles'])==3
    assert len([n for n in z.namelist() if n.endswith('.epub') and n!='All Papers.epub'])==2
    assert 'All Papers.epub' in z.namelist()
print('PASS: EPUB containers, XML, manifest resources, all local targets, images, citations without return buttons, and portable ZIP history.')
