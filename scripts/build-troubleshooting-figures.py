"""Author explanatory diagrams. Requires Pillow; no source screenshot is edited."""
from pathlib import Path
import argparse
import hashlib
import json
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--font', default='C:/Windows/Fonts/malgun.ttf')
parser.add_argument('--bold-font', default='C:/Windows/Fonts/malgunbd.ttf')
args = parser.parse_args()
OUT = ROOT / 'docs/troubleshooting/images'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1440, 880
INK, MUTED, TEAL, RED = '#16272e', '#53666c', '#187b75', '#a85149'
BG, FILL, LINE = '#fafbf9', '#edf3f1', '#c1d1cc'
figures, labels, pending = [], [], []


def font(size=28, bold=False):
    return ImageFont.truetype(args.bold_font if bold else args.font, size)


def canvas(title, subtitle):
    labels.clear()
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    text(d, (58, 35), title, 43, INK, True, role='title')
    text(d, (60, 100), subtitle, 23, MUTED, role='subtitle')
    d.line((60, 145, W - 60, 145), fill=LINE, width=2)
    return im, d


def text(d, xy, value, size=28, color=INK, bold=False, spacing=12, role='label', bounds=None):
    face = font(size, bold)
    bbox = d.multiline_textbbox(xy, value, font=face, spacing=spacing)
    area = bounds or (20, 0, W-20, H-10)
    if bbox[0] < area[0] or bbox[1] < area[1] or bbox[2] > area[2] or bbox[3] > area[3]:
        raise ValueError(f'Text outside bounds: {value!r}: {bbox} / {area}')
    labels.append({'role': role, 'text': value, 'size': size, 'bbox': list(bbox)})
    d.multiline_text(xy, value, font=face, fill=color, spacing=spacing)


def box(d, rect, title, desc='', accent=TEAL):
    x, y, x2, y2 = rect
    d.rounded_rectangle(rect, radius=14, fill=FILL, outline=LINE, width=2)
    d.line((x+20, y+20, x+20, y2-20), fill=accent, width=4)
    text(d, (x+40, y+22), title, 28, accent, True, role='box-title', bounds=(x+35,y+15,x2-15,y+70))
    if desc:
        text(d, (x+40, y+72), desc, 23, bounds=(x+35,y+65,x2-15,y2-8))


def arrow(d, a, b, color=TEAL):
    d.line((a, b), fill=color, width=4)
    x, y = b
    if abs(b[0]-a[0]) > abs(b[1]-a[1]):
        sign = 1 if b[0] > a[0] else -1
        d.polygon([(x, y), (x-sign*13, y-8), (x-sign*13, y+8)], fill=color)
    else:
        sign = 1 if b[1] > a[1] else -1
        d.polygon([(x, y), (x-8, y-sign*13), (x+8, y-sign*13)], fill=color)


def save(im, name, foot='설명용 개념도 · Aether Studio 구현 기록'):
    d=ImageDraw.Draw(im)
    d.line((60, 807, W-60, 807), fill=LINE, width=2)
    text(d, (60, 824), foot, 19, MUTED, role='caption')
    path = OUT / (name + '.png')
    encoded = BytesIO()
    im.save(encoded, format='PNG', optimize=True)
    data = encoded.getvalue()
    pending.append((path, data))
    figures.append({'file': path.relative_to(ROOT).as_posix(), 'width': W, 'height': H,
                    'sha256': hashlib.sha256(data).hexdigest(), 'labels': list(labels)})


im,d=canvas('링·리본의 부모 좌표계', '리본을 emblem의 자식으로 옮겨 링과 같은 변환 적용')
text(d,(70,182),'이전 · 서로 다른 부모',30,RED,True)
text(d,(765,182),'수정 · 하나의 부모',30,TEAL,True)
box(d,(70,245,660,368),'world','공간 전체의 변환',RED)
box(d,(70,440,340,590),'링 그룹','회전 A',RED)
box(d,(385,440,660,590),'리본','회전 B',RED)
arrow(d,(205,368),(205,440),RED);arrow(d,(522,368),(522,440),RED)
text(d,(86,640),'각각 회전하는 링과 리본\n회전 후 벌어지는 연결점',26)
box(d,(765,245,1365,368),'emblem · 링의 부모 그룹','링과 리본의 공통 이동·회전')
box(d,(765,440,1035,590),'링','로컬 좌표')
box(d,(1080,440,1365,590),'리본','로컬 좌표')
arrow(d,(900,368),(900,440));arrow(d,(1222,368),(1222,440))
text(d,(782,640),'worldPosition = parentMatrix × localPosition\n부모 안의 로컬 좌표로 지정한 연결점',24)
save(im,'coordinates')

im,d=canvas('효과별 이동 기준', '스크롤로 정하는 위치와 시간에 따라 재생하는 효과')
box(d,(65,195,685,338),'스크롤 진행도 p','본 컬럼 · 체인 · 수렴 입자의 기본 위치')
box(d,(755,195,1375,338),'누적 시간 t','영상 · 조명 · 전진하는 섬광')
arrow(d,(375,338),(375,406));arrow(d,(1065,338),(1065,406))
box(d,(65,406,685,555),'진행률에 따른 위치','p가 변한 만큼 이동\n스크롤 정지 후 같은 위치에 정착')
box(d,(755,406,1375,555),'프레임 간격 dt에 따른 재생','스크롤 정지 중에도 재생\n모션 정지·탭 숨김에서는 일시정지')
box(d,(170,640,1270,768),'기본 위치에 더하는 포인터 변위','base(p) + displacement(pointer) → 입력 해제 후 변위만 0으로 복귀')
save(im,'particle-flow')

im,d=canvas('화면 마스크와 깊이 차폐', '화면에서 자르는 영역과 3D 공간에서 가리는 면')
box(d,(385,180,1055,307),'하나의 전환 경계 함수','스크롤 위치와 화면 좌표로 보이는 쪽을 계산')
for x,title,desc in [(60,'평면 소개 / 모니터','동일한 경계로 전환'),(515,'링 / 리본','다음 층 안에서만 노출'),(970,'입자 / 포레스트','경계 밖의 중복 노출 차단')]:
    box(d,(x,392,x+405,546),title,desc)
    arrow(d,(720,307),(x+202,392))
text(d,(85,600),'월드 공간의 차폐',29,TEAL,True)
d.rectangle((80,672,625,700),fill='#253b44')
text(d,(92,718),'리액터 챔버의 바닥 = 아래층의 천장',24)
text(d,(785,600),'별도 그룹의 영상빛',29,TEAL,True)
arrow(d,(955,650),(955,745))
text(d,(1010,662),'구조가 가려져도\n천장의 산란광은 유지',23)
save(im,'layers')

im,d=canvas('DPR 중복 적용과 렌더 타깃 크기', 'CSS 픽셀 → 물리 픽셀 변환에서 생긴 크기 불일치')
box(d,(65,190,685,333),'화면 크기 예시','CSS 800 × 500, DPR 2')
box(d,(755,190,1375,333),'물리 픽셀 예시','렌더 타깃 1600 × 1000')
arrow(d,(685,260),(755,260))
box(d,(65,413,685,577),'중복 적용','이미 물리 크기인데 DPR 2를 또 곱함\n→ 3200 × 2000 기준으로 어긋남',RED)
box(d,(755,413,1375,577),'타깃의 물리 viewport','렌더 타깃에 지정한 물리 크기 사용\n→ 1600 × 1000 기준으로 일치')
text(d,(80,651),'캡처 전 저장',28,TEAL,True)
text(d,(80,703),'타깃 · viewport · scissor · XR · clear 상태',23)
arrow(d,(640,707),(770,707))
text(d,(800,651),'finally에서 복원',28,TEAL,True)
text(d,(800,703),'성공과 실패 모두 같은 복원 경로',23)
save(im,'render-target','설명용 개념도 · 800 × 500과 DPR 2는 단위 설명을 위한 예시')

im,d=canvas('첫 진입의 GPU·영상 준비', '아직 사용하지 않은 경로와 이미 준비된 경로의 측정')
preparation_labels=[('셰이더 준비','compile / link'),('GPU 자원 준비','텍스처 · 버퍼 · RT'),('영상 첫 프레임','디코딩 · 업로드')]
for i,(title,desc) in enumerate(preparation_labels):
    x=65+i*455
    box(d,(x,212,x+400,393),title,desc)
    if i<2: arrow(d,(x+400,302),(x+455,302))
text(d,(83,444),'컴파일 이후에 남는 업로드·첫 렌더 비용',32,INK,True)
box(d,(65,527,685,738),'사전 준비','실제 그리기 경로도 작게 실행\n스크롤 구간 밖의 준비 비용은 별도 기록')
box(d,(755,527,1375,738),'첫 진입·재진입 비교','새 페이지의 첫 하강\n같은 페이지에서 다시 올라오는 경로')
save(im,'cold-warm')

im,d=canvas('실험별 최대 프레임 간격', 'PR #10의 전체 하강과 PR #15의 첫 모니터 진입')
panels=[(193,'PR #10 · 전체 최초 하강의 최장 RAF 간격',2799.9,66.6,'셰이더·GPU 자원 준비 전후 · 최댓값 발생 위치: 리액터 → 모니터',3000),
        (482,'PR #15 · 7초 첫 모니터 진입의 최장 RAF 간격',99.9,16.8,'별도 실험 · 기존 2회 중 최장 / 최종 독립 3회 모두 16.8ms',110)]
for y,title,before,after,note,scale in panels:
    text(d,(70,y),title,28,INK,True)
    text(d,(70,y+47),note,22,MUTED)
    for label,value,dy,color in [('변경 전',before,110,RED),('변경 후',after,173,TEAL)]:
        text(d,(80,y+dy),label,23,color)
        length=max(8,int(value/scale*975))
        d.rounded_rectangle((220,y+dy,220+length,y+dy+35),radius=5,fill=color)
        text(d,(238+length,y+dy),f'{value:.1f} ms',23,color,True)
save(im,'frame-evidence','실측 기록 재시각화 · 패널별 가로축 범위 차이 · RAF 콜백 사이의 간격')

im,d=canvas('WebGL·미디어 오류의 복구 경로', '본문 탐색을 유지하며 장면과 영상의 실패를 각각 처리')
box(d,(65,197,1375,343),'사이트 DOM','제목 · 본문 · Work / Contact · 상세 화면 · 키보드 초점')
arrow(d,(380,343),(380,413));arrow(d,(1065,343),(1065,413))
box(d,(65,413,685,592),'선택적 WebGL 장면','모듈 오류 → 오류 경계\n컨텍스트 손실 → 예약 취소 / 재준비')
box(d,(755,413,1375,592),'선택적 영상·조명','다운로드·디코딩·재생 실패\n→ 절차적 대체 표현 / 무한 재시도 방지')
arrow(d,(380,592),(380,658));arrow(d,(1065,592),(1065,658))
box(d,(170,658,1270,778),'복귀 검사 항목','스크롤 · 시점 · 위상 · 미디어 위치 · canvas와 이벤트 리스너의 중복 여부')
save(im,'recovery')
metadata = ROOT / 'docs/troubleshooting/editorial/figure-text.json'
metadata.parent.mkdir(parents=True, exist_ok=True)
for path, data in pending:
    path.write_bytes(data)
metadata.write_text(json.dumps({'figures': figures}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Created 7 explanatory PNG figures.')
