"""Package Markdown + local images into an offline HTML book and Velog drafts.

python -m pip install --target .qa/troubleshooting/deps markdown-it-py==3.0.0
python scripts/build-troubleshooting.py --asset-ref <committed source SHA>
"""
from pathlib import Path
import argparse
import base64
import hashlib
import html
import json
import mimetypes
import re
import shutil
import sys
import zipfile
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/troubleshooting'
p = argparse.ArgumentParser()
p.add_argument('--deps', default='.qa/troubleshooting/deps')
p.add_argument('--out', default='.qa/troubleshooting/release')
p.add_argument('--asset-ref', required=True)
p.add_argument('--source-ref', default='cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d')
args = p.parse_args()
sys.path.insert(0, str(ROOT / args.deps))
from markdown_it import MarkdownIt

OUT = (ROOT / args.out).resolve()
OUT.mkdir(parents=True, exist_ok=True)
for folder in ('images', 'portable/posts', 'velog'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)
md = MarkdownIt('commonmark', {'html': True}).enable(['table', 'strikethrough'])
repo_url = 'https://github.com/okorion/aether-studio'
raw_url = 'https://raw.githubusercontent.com/okorion/aether-studio'
images = {}
generated_files = set()
files = [SOURCE / 'index.md', *sorted((SOURCE / 'posts').glob('*.md')),
         SOURCE / 'issue-index.md', SOURCE / 'runbook.md', SOURCE / 'sources.md']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_text(path, content):
    # Path.write_text gained newline= in Python 3.10. Keep LF output on 3.9 too.
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(content)
    generated_files.add(path)


def local_path(src, url):
    url = urlsplit(url)
    if url.scheme or url.netloc or not url.path:
        return None
    path = (src.parent / unquote(url.path)).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f'Invalid local link: {src}: {url.geturl()}')
    return path


def online(src, url, image=False):
    path = local_path(src, url)
    if path is None:
        return url
    ref = args.asset_ref if path.is_relative_to(SOURCE) else args.source_ref
    relative = path.relative_to(ROOT).as_posix()
    suffix = '#' + quote(urlsplit(url).fragment) if urlsplit(url).fragment else ''
    return f'{raw_url if image else repo_url + "/blob"}/{ref}/{quote(relative)}{suffix}'


def image_asset(src, url):
    path = local_path(src, url)
    if path is None:
        raise ValueError(f'Images must be local, owned assets: {url}')
    key = path.relative_to(ROOT).as_posix()
    if key not in images:
        data = path.read_bytes()
        digest = sha(data)
        filename = re.sub(r'[^a-zA-Z0-9_-]', '-', path.stem) + '-' + digest[:8] + path.suffix
        dest = OUT / 'images' / filename
        dest.write_bytes(data)
        generated_files.add(dest)
        mime = mimetypes.guess_type(path.name)[0]
        if mime not in ('image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'):
            raise ValueError(mime)
        images[key] = {'file': 'images/' + filename, 'sha256': digest,
                       'bytes': len(data), 'source': key,
                       'kind': 'diagram' if path.is_relative_to(SOURCE / 'images') else 'capture',
                       'dataUri': f'data:{mime};base64,' + base64.b64encode(data).decode('ascii')}
    return images[key]


def render(src, number):
    tokens = md.parse(src.read_text(encoding='utf-8'))
    heading = 0
    for token in tokens:
        if token.type == 'heading_open':
            heading += 1
            token.attrSet('id', f'article-{number}-heading-{heading}')
        children = list(token.children or [])
        while children:
            child = children.pop()
            if child.type == 'image':
                child.attrSet('src', image_asset(src, child.attrGet('src'))['dataUri'])
                child.attrSet('loading', 'lazy')
            elif child.type == 'link_open':
                child.attrSet('href', online(src, child.attrGet('href')))
            children.extend(child.children or [])
    return md.renderer.render(tokens, md.options, {})


def rewrite_markdown(src, portable):
    original = src.read_text(encoding='utf-8')
    # Keep fenced code exactly as authored; only link destinations change.
    segments = re.split(r'(^```[^\n]*\n.*?^```\s*$)', original, flags=re.M | re.S)
    pattern = re.compile(r'(!?\[[^\]\n]*\])\(([^\s)]+)\)')
    def repl(match):
        label, url = match.groups()
        if label.startswith('!'):
            asset = image_asset(src, url)
            target = '../../' + asset['file'] if portable and src.parent.name == 'posts' else '../' + asset['file'] if portable else online(src, url, True)
        else:
            target = online(src, url)
        return label + '(' + target + ')'
    return ''.join(segment if segment.startswith('```') else pattern.sub(repl, segment) for segment in segments)


css = '''
:root {color-scheme:light;--ink:#18262d;--muted:#53666c;--line:#dce5e1;--accent:#19776f}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fafbf9;color:var(--ink);font:17px/1.85 "Malgun Gothic","Apple SD Gothic Neo",sans-serif}
header,main,footer{max-width:880px;margin:auto;padding:40px 36px}header{padding-top:64px;border-bottom:1px solid var(--line)}header>p{color:var(--muted);font-size:14px;margin:0}
header h1{font-size:36px;line-height:1.35;margin:12px 0 20px;word-break:keep-all}nav ol{padding-left:23px}nav a{color:var(--ink)}article{padding:32px 0 64px;border-bottom:1px solid var(--line);scroll-margin-top:20px}article h1{font-size:32px;line-height:1.45;word-break:keep-all;margin:20px 0 28px}h2{font-size:25px;line-height:1.5;margin:52px 0 20px;word-break:keep-all}h3{font-size:20px;margin:34px 0 14px}p{margin:18px 0}a{color:var(--accent);text-underline-offset:4px;overflow-wrap:anywhere}img{max-width:100%;height:auto;display:block;margin:28px auto 14px;border:1px solid var(--line)}em{font-size:14px;color:var(--muted);font-style:normal}pre{padding:24px;background:#eef2ef;border:1px solid var(--line);overflow-x:auto;font-size:14px;line-height:1.7;border-radius:4px}code{font-family:Consolas,"SFMono-Regular",monospace}p code,li code,td code{font-size:.9em;background:#eef2ef;padding:2px 4px;border-radius:3px}table{display:block;width:100%;overflow-x:auto;border-collapse:collapse;font-size:14px;line-height:1.65;margin:26px 0}th,td{border:1px solid var(--line);padding:12px 14px;text-align:left;min-width:95px}th{background:#edf3f1}blockquote{margin:24px 0;padding-left:20px;border-left:3px solid var(--line);color:var(--muted)}li{margin:7px 0}footer{font-size:14px;color:var(--muted)}.back{font-size:13px;display:block;margin-top:32px}@media(max-width:650px){header,main,footer{padding:26px 20px}header h1{font-size:29px}article h1{font-size:26px}h2{font-size:22px}body{font-size:16px}pre{padding:16px;font-size:12px}}@media print{body{background:white;font-size:10.5pt}header,main,footer{max-width:none;padding:0}nav{display:none}article{break-before:page;border:0;padding:12px 0}h1,h2,h3{break-after:avoid}pre,img,tr{break-inside:avoid}img{max-height:210mm;object-fit:contain}.back{display:none}a{color:inherit}pre{white-space:pre-wrap;overflow:visible}}
'''

chapters = []
manifest_sources = []
for n, src in enumerate(files, 1):
    original = src.read_text(encoding='utf-8')
    title = re.search(r'^# (.+)$', original, re.M).group(1)
    chapters.append((n, title, render(src, n)))
    relative = src.relative_to(SOURCE)
    write_text(OUT / 'portable' / relative, rewrite_markdown(src, True))
    if src.parent.name == 'posts':
        write_text(OUT / 'velog' / src.name, rewrite_markdown(src, False))
    manifest_sources.append({'file': src.relative_to(ROOT).as_posix(), 'sha256': sha(src.read_bytes())})
toc=''.join(f'<li><a href="#article-{n}">{html.escape(title)}</a></li>' for n,title,_ in chapters)
body=''.join(f'<article id="article-{n}">{content}<a class="back" href="#contents">목차로 돌아가기</a></article>' for n,_,content in chapters)
document=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Aether Studio · 3D 인터랙션 트러블슈팅 기록</title><style>{css}</style></head><body><header id="contents"><p>구현 기준 2026-09-22 · 이미지 내장 보관본</p><h1>3D 인터랙션 홈페이지에서<br>화면과 동작이 어긋났을 때</h1><p>실제 증상, 수정 근거, 전후 화면과 남은 문제를 모은 Aether Studio 기록</p><nav aria-label="문서 목차"><ol>{toc}</ol></nav></header><main>{body}</main><footer>이미지는 모두 이 HTML 안에 포함되어 있습니다. 외부 링크를 여는 경우에만 인터넷 연결이 필요합니다.</footer></body></html>'''
write_text(OUT / 'Aether-3D-Troubleshooting.html', document)
guide='''# Aether Studio 트러블슈팅 보관 묶음

- `Aether-3D-Troubleshooting.html`: 이미지가 파일 내부에 포함된 전체 문서. 이 파일만 옮겨도 인터넷 없이 열립니다.
- `velog/`: 게시용 Markdown 6편. 본문은 보관본과 같고 이미지·근거 링크만 공개 저장소의 고정 커밋 URL로 바꿨습니다. 각 파일을 Velog 에디터에 복사해 미리보기를 확인한 뒤 직접 게시하면 됩니다. 실제 게시를 자동으로 수행하지 않았습니다.
- `portable/`: 로컬 이미지 경로를 사용하는 Markdown 원본과 전체 이슈 색인·재사용 체크리스트.
- `images/`: 실제 캡처 원본과 설명용 PNG 도식. SHA-256은 manifest.json에 있습니다. Velog 이미지 업로드를 선호하면 해당 파일을 업로드하고 주소만 교체할 수 있습니다.
- `manifest.json`: 기준 커밋, 문서·이미지의 경로·해시·종류.

기존 프로젝트의 캡처는 당시 화면입니다. 새로 촬영했다고 표시하지 않았으며, 도식은 실제 화면과 구분했습니다. 외부 링크는 고정 커밋에 연결되어 장기적으로 같은 근거를 가리킵니다.
'''
write_text(OUT / 'README.md', guide)
manifest={'implementationRef':args.source_ref,'articleAssetRef':args.asset_ref,'sources':manifest_sources,
          'images':[{k:v for k,v in value.items() if k!='dataUri'} for value in images.values()]}
manifest['files']=[{'file':path.relative_to(OUT).as_posix(),'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size} for path in sorted(generated_files)]
write_text(OUT/'manifest.json', json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
zip_path=OUT.parent/'Aether-3D-Troubleshooting.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for path in sorted(generated_files):
        z.write(path,path.relative_to(OUT))
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    for item in manifest['files']:
        assert sha(z.read(item['file'])) == item['sha256']
print(json.dumps({'chapters':len(chapters),'images':len(images),'htmlBytes':len(document.encode('utf-8')),'zipBytes':zip_path.stat().st_size,'output':str(OUT)},ensure_ascii=False))
