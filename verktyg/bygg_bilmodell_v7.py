"""Bundle the supplied original v7 archive for the existing compatibility route."""
from pathlib import Path, PurePosixPath
import base64
import mimetypes
import re
import zipfile

ROOT=Path(__file__).resolve().parents[1]


def build():
    with zipfile.ZipFile(ROOT/'kallkod/bilmodell_v7_original.zip') as z:
        names=z.namelist()
        main=next(n for n in names if PurePosixPath(n).name=='index.html')
        prefix=main[:-len('index.html')]
        def asset(name):
            return z.read(prefix+name.removeprefix('./'))
        def data(name):
            mime=mimetypes.guess_type(name)[0] or 'application/octet-stream'
            return 'data:'+mime+';base64,'+base64.b64encode(asset(name)).decode()
        def css(name):
            text=asset(name).decode('utf-8')
            parent=PurePosixPath(name).parent
            def sub(m):
                target=m.group(1).strip('"\' ')
                if target.startswith(('data:','http:','https:','#')):
                    return m.group(0)
                # Normalize local ../ references without extracting any archive paths.
                parts=[]
                for part in (parent/target).parts:
                    if part=='..':
                        if parts:parts.pop()
                    elif part!='.':parts.append(part)
                return 'url('+data('/'.join(parts))+')'
            return re.sub(r'url\(([^)]+)\)',sub,text)
        html=z.read(main).decode('utf-8')
        html=re.sub(r'<link\b[^>]*href=["\']([^"\']+\.css)["\'][^>]*>',lambda m:'<style>'+css(m.group(1))+'</style>',html)
        html=re.sub(r'<script\b[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>',lambda m:'<script>'+asset(m.group(1)).decode('utf-8').replace('</script','<\\/script')+'</script>',html)
        # Inline only supplied local image assets; OSM tiles remain online background.
        html=re.sub(r'(<img\b[^>]*src=["\'])([^"\']+)(["\'])',lambda m:m.group(0) if m.group(2).startswith(('data:','http:','https:')) else m.group(1)+data(m.group(2))+m.group(3),html)
        out=ROOT/'app/Bilmodell_v7.html'
        out.write_text(html,encoding='utf-8')
        print('Original Bilmodell v7 paketerad:',out.name)


if __name__=='__main__':
    build()
