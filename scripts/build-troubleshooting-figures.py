"""Author explanatory diagrams. Requires Pillow; no source screenshot is edited."""
from pathlib import Path
import argparse
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


def font(size=28, bold=False):
    return ImageFont.truetype(args.bold_font if bold else args.font, size)


def canvas(title, subtitle):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((58, 35), title, font=font(43, True), fill=INK)
    d.text((60, 100), subtitle, font=font(23), fill=MUTED)
    d.line((60, 145, W - 60, 145), fill=LINE, width=2)
    return im, d


def text(d, xy, value, size=28, color=INK, bold=False, spacing=12):
    d.multiline_text(xy, value, font=font(size, bold), fill=color, spacing=spacing)


def box(d, rect, title, desc='', accent=TEAL):
    x, y, x2, y2 = rect
    d.rounded_rectangle(rect, radius=14, fill=FILL, outline=LINE, width=2)
    d.line((x+20, y+20, x+20, y2-20), fill=accent, width=4)
    text(d, (x+40, y+22), title, 28, accent, True)
    if desc:
        text(d, (x+40, y+72), desc, 23)


def arrow(d, a, b, color=TEAL):
    d.line((a, b), fill=color, width=4)
    x, y = b
    if abs(b[0]-a[0]) > abs(b[1]-a[1]):
        sign = 1 if b[0] > a[0] else -1
        d.polygon([(x, y), (x-sign*13, y-8), (x-sign*13, y+8)], fill=color)
    else:
        sign = 1 if b[1] > a[1] else -1
        d.polygon([(x, y), (x-8, y-sign*13), (x+8, y-sign*13)], fill=color)


def save(im, name, foot='개념도 · 실제 화면 캡처가 아님 · Aether Studio 구현 기록을 설명하기 위한 도식'):
    d=ImageDraw.Draw(im)
    d.line((60, 807, W-60, 807), fill=LINE, width=2)
    text(d, (60, 824), foot, 19, MUTED)
    im.save(OUT / (name + '.png'), optimize=True)


im,d=canvas('붙어 있는 부품은 변환도 같이 받아야 한다', '좌표를 매번 맞추기 전에, 누가 누구의 부모인지 먼저 확인했다.')
text(d,(70,182),'이전 · 서로 다른 부모',30,RED,True)
text(d,(765,182),'수정 · 하나의 부모',30,TEAL,True)
box(d,(70,245,660,368),'world','공간 전체의 변환',RED)
box(d,(70,440,340,590),'링 그룹','회전 A',RED)
box(d,(385,440,660,590),'리본','회전 B',RED)
arrow(d,(205,368),(205,440),RED);arrow(d,(522,368),(522,440),RED)
text(d,(86,640),'두 부품의 회전이 달라지면\n연결점도 다른 방향으로 움직인다.',26)
box(d,(765,245,1365,368),'emblem · 링의 부모 그룹','링과 리본에 같은 변환을 적용한다.')
box(d,(765,440,1035,590),'링','로컬 좌표')
box(d,(1080,440,1365,590),'리본','로컬 좌표')
arrow(d,(900,368),(900,440));arrow(d,(1222,368),(1222,440))
text(d,(782,640),'worldPosition = parentMatrix × localPosition\n연결점은 로컬 좌표에서 한 번 정의한다.',24)
save(im,'coordinates')

im,d=canvas('모든 파티클이 같은 시계로 움직이지 않는다', '입력에 반응하는 것과, 입력 없이 계속 재생되는 것을 분리한다.')
box(d,(65,195,685,338),'스크롤 진행도 p','본 컬럼 · 체인 · 수렴 입자의 기본 위치')
box(d,(755,195,1375,338),'누적 시간 t','영상 · 조명 · 전진하는 섬광')
arrow(d,(375,338),(375,406));arrow(d,(1065,338),(1065,406))
box(d,(65,406,685,555),'정방향 / 정지 / 역방향','p가 변한 만큼 이동하고, 멈추면 정착한다.')
box(d,(755,406,1375,555),'프레임 간격 dt로 진행','스크롤이 멈춰도 재생한다.\n모션 정지·탭 숨김에서는 멈춘다.')
box(d,(170,640,1270,768),'포인터 변형은 기본 위치 위에 더한다','base(p) + displacement(pointer) → 입력 해제 후 displacement만 0으로 복귀')
save(im,'particle-flow')

im,d=canvas('투명하게 만드는 것과 가리는 것은 다르다', '공통 경계는 장면별 보이는 영역을 정하고, 바닥·천장은 공간을 막는다.')
box(d,(385,180,1055,307),'하나의 전환 경계 함수','스크롤 위치와 화면 좌표로 보이는 쪽을 계산')
for x,title,desc in [(60,'평면 소개 / 모니터','동일한 경계로 전환'),(515,'링 / 리본','다음 층 안에서만 노출'),(970,'입자 / 포레스트','경계 밖의 중복 노출 차단')]:
    box(d,(x,392,x+405,546),title,desc)
    arrow(d,(720,307),(x+202,392))
text(d,(85,600),'월드 공간의 차폐',29,TEAL,True)
d.rectangle((80,672,625,700),fill='#253b44')
text(d,(92,718),'리액터 챔버의 바닥 = 아래층의 천장',24)
text(d,(785,600),'빛은 별도 경로로 전달',29,TEAL,True)
arrow(d,(955,650),(955,745))
text(d,(1010,662),'구조가 가려져도\n천장의 산란광은 유지',23)
save(im,'layers')

im,d=canvas('DPR을 두 번 적용하면 캡처가 어긋난다', 'DPR은 CSS 픽셀과 실제 픽셀의 비율이다. 단위를 먼저 적어 본다.')
box(d,(65,190,685,333),'화면 크기 예시','CSS 800 × 500, DPR 2')
box(d,(755,190,1375,333),'물리 픽셀 예시','렌더 타깃 1600 × 1000')
arrow(d,(685,260),(755,260))
box(d,(65,413,685,577),'중복 적용','이미 물리 크기인데 DPR 2를 또 곱함\n→ 3200 × 2000 기준으로 어긋남',RED)
box(d,(755,413,1375,577),'한 번만 변환','렌더 타깃은 자신의 물리 viewport 사용\n→ 1600 × 1000 기준으로 일치')
text(d,(80,651),'캡처 전 저장',28,TEAL,True)
text(d,(80,703),'타깃 · viewport · scissor · XR · clear 상태',23)
arrow(d,(640,707),(770,707))
text(d,(800,651),'finally에서 복원',28,TEAL,True)
text(d,(800,703),'성공과 실패 모두 같은 복원 경로',23)
save(im,'render-target','개념도 · 해상도는 단위 설명용 예시이며 프로젝트의 고정 설정값이 아님')

im,d=canvas('첫 진입과 두 번째 진입을 따로 측정했다', '같은 길을 다시 지나갈 때는 최초 준비 비용이 이미 지불되어 있을 수 있다.')
labels=[('셰이더 준비','compile / link'),('GPU 자원 준비','텍스처 · 버퍼 · RT'),('영상 첫 프레임','디코딩 · 업로드')]
for i,(title,desc) in enumerate(labels):
    x=65+i*455
    box(d,(x,212,x+400,393),title,desc)
    if i<2: arrow(d,(x+400,302),(x+455,302))
text(d,(83,444),'compileAsync가 모든 준비를 대신하지는 않는다.',32,INK,True)
box(d,(65,527,685,738),'사전 준비','실제 그리기 경로도 작게 실행\n스크롤 구간 밖의 준비 비용은 별도 기록')
box(d,(755,527,1375,738),'재진입 검사','준비된 길만 측정하면 첫 진입을 놓친다.\n새 페이지 첫 하강과 역방향을 분리')
save(im,'cold-warm')

im,d=canvas('같은 문제처럼 보여도 측정 구간은 달랐다', '역사 수치를 합쳐 하나의 누적 개선율로 계산하지 않았다.')
panels=[(193,'PR #10 · 전체 최초 하강의 최장 RAF 간격',2799.9,66.6,'초기 셰이더·GPU 자원 준비 전후 · 같은 리액터 구간끼리의 비교가 아님',3000),
        (482,'PR #15 · 7초 첫 모니터 진입의 최장 RAF 간격',99.9,16.8,'별도 실험 · 기존 2회 중 최장 / 최종 독립 3회 모두 16.8ms',110)]
for y,title,before,after,note,scale in panels:
    text(d,(70,y),title,28,INK,True)
    text(d,(70,y+47),note,22,MUTED)
    for label,value,dy,color in [('변경 전',before,110,RED),('변경 후',after,173,TEAL)]:
        text(d,(80,y+dy),label,23,color)
        length=max(8,int(value/scale*975))
        d.rounded_rectangle((220,y+dy,220+length,y+dy+35),radius=5,fill=color)
        text(d,(238+length,y+dy),f'{value:.1f} ms',23,color,True)
save(im,'frame-evidence','실측 기록 재시각화 · 두 패널의 가로축 범위가 다름 · RAF 간격은 GPU 실행 시간이 아님')

im,d=canvas('3D 실패의 범위를 좁히면 탐색은 남길 수 있다', 'DOM 탐색, 장면 준비, 미디어 재생은 서로 다른 실패 경로를 가진다.')
box(d,(65,197,1375,343),'사이트 DOM','제목 · 본문 · Work / Contact · 상세 화면 · 키보드 초점')
arrow(d,(380,343),(380,413));arrow(d,(1065,343),(1065,413))
box(d,(65,413,685,592),'선택적 WebGL 장면','모듈 오류 → 오류 경계\n컨텍스트 손실 → 예약 취소 / 재준비')
box(d,(755,413,1375,592),'선택적 영상·조명','다운로드·디코딩·재생 실패\n→ 절차적 대체 표현 / 무한 재시도 방지')
arrow(d,(380,592),(380,658));arrow(d,(1065,592),(1065,658))
box(d,(170,658,1270,778),'복귀할 때 확인할 것','스크롤 · 시점 · 위상 · 미디어 위치 · canvas와 이벤트 리스너의 중복 여부')
save(im,'recovery')
print('Created 7 explanatory PNG figures.')
