"""Check editorial invariants; prose warnings require contextual review, not scores."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/troubleshooting'
p = argparse.ArgumentParser()
p.add_argument('--baseline', default='89d72e1ea3b4730d8acf4e2ac5ea344473b448b8')
p.add_argument('--out', default='.qa/editorial-v2/editorial-audit.json')
args = p.parse_args()

def original(path):
    return subprocess.check_output(['git', 'show', f'{args.baseline}:{path.relative_to(ROOT).as_posix()}'], cwd=ROOT).decode('utf-8')

def code(text):
    blocks = re.findall(r'^```[^\n]*\n(.*?)^```', text, re.M | re.S)
    return ['\n'.join(line.rstrip() for line in b.splitlines() if line.strip() and not line.lstrip().startswith('//')) for b in blocks]

def numeric_rows(text):
    return [line for line in text.splitlines() if line.startswith('|') and re.search(r'\d', line) and not '![' in line]

def images(text):
    return re.findall(r'!\[[^\]]*\]\(([^)]+)\)', text)

def issue_rows(text):
    return [line for line in text.splitlines() if re.match(r'\| [A-Z]\d{2} \|', line)]

report = {'baseline': args.baseline, 'errors': [], 'articles': [], 'figures': []}
for path in sorted((BASE/'posts').glob('*.md')):
    before, after = original(path), path.read_text(encoding='utf-8')
    numeric_before, numeric_after = numeric_rows(before), numeric_rows(after)
    # Exact table rows preserve the measured values and their labels together.
    missing_rows = sorted(set(numeric_before) - set(numeric_after))
    changed_code = code(before) != code(after)
    changed_images = sorted(images(before)) != sorted(images(after))
    if missing_rows or changed_code or changed_images:
        report['errors'].append({'file': path.name, 'missingNumericRows': missing_rows,
                                 'codeChanged': changed_code, 'imagesChanged': changed_images})
    warnings = [{'line': n, 'reason': '장문 검토', 'text': line} for n, line in enumerate(after.splitlines(), 1)
                if len(line) > 230 and not line.startswith(('|', '[', '!', '-'))]
    report['articles'].append({'file': path.name, 'beforeCharacters': len(before), 'afterCharacters': len(after),
                               'codeBlocks': len(code(after)), 'imageReferences': len(images(after)),
                               'numericTableRows': len(numeric_after), 'warnings': warnings})
idx = BASE/'issue-index.md'
if issue_rows(original(idx)) != issue_rows(idx.read_text(encoding='utf-8')):
    report['errors'].append('이슈 행 변경')
report['issueCount'] = len(issue_rows(idx.read_text(encoding='utf-8')))
expected_titles = {
    'coordinates': '링·리본의 부모 좌표계', 'particle-flow': '효과별 이동 기준',
    'layers': '화면 마스크와 깊이 차폐', 'render-target': 'DPR 중복 적용과 렌더 타깃 크기',
    'cold-warm': '첫 진입의 GPU·영상 준비', 'frame-evidence': '실험별 최대 프레임 간격',
    'recovery': 'WebGL·미디어 오류의 복구 경로',
}
figures = json.loads((BASE/'editorial/figure-text.json').read_text(encoding='utf-8'))['figures']
for fig in figures:
    path = ROOT/fig['file']
    titles = [label['text'] for label in fig['labels'] if label['role'] == 'title']
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if titles != [expected_titles[path.stem]] or digest != fig['sha256']:
        report['errors'].append({'figure': path.name, 'titles': titles, 'hashMatches': digest == fig['sha256']})
    report['figures'].append({'file': path.name, 'title': titles, 'labels': len(fig['labels']), 'sha256': digest})
if len(figures) != 7 or report['issueCount'] != 66:
    report['errors'].append('그림·이슈 개수 불일치')
out = ROOT/args.out
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'articles': len(report['articles']), 'figures': len(figures), 'issues': report['issueCount'],
                  'errors': report['errors'], 'warnings': sum(len(a['warnings']) for a in report['articles'])}, ensure_ascii=False))
raise SystemExit(bool(report['errors']))
