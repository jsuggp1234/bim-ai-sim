// 시공 단계 확대 장면 ("작업 상세"): 지금 재생 중인 시공 단계(공법의 how 한 줄)를 작업 유형으로 분류하고,
// 그 작업을 가까이서 본 장면(장비·작업자·자재·치수·계기)을 단계 진행률 q(0..1)와 시간 T(초)로 그린다.
// 오른쪽 정보: 작업 유형 · 투입 장비 · 작업조 · 이 단계 기간 · 관리 항목 · 안전 (표준 작업 기준 참고값).
import { WP_BY_ID } from '../sim/methods.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const n0 = (v) => Math.round(v), n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- 작업 유형 (분류 순서가 중요: 구체적인 것 먼저) ----------
export const ARCH = {
  spt: { n: '표준관입시험 (SPT)', eq: ['시추기 (회전 수세식)', '63.5kg 해머·로드'], crew: 3, qc: ['30cm 관입 타격 횟수 N 기록', '1.5m 간격 시험·시료 채취', '지하수위 측정 (24h 후)'], safe: '해머 낙하 구역 접근 금지' },
  cpt: { n: '콘관입시험 (CPTu)', eq: ['CPT 관입 차량 (반력 20t)', '전자식 콘·데이터 기록기'], crew: 2, qc: ['관입 속도 2cm/s 일정', '선단저항 qc·간극수압 u2 연속 기록', '소산 시험으로 압밀 계수'], safe: '반력 앵커 고정 확인' },
  geo: { n: '물리탐사', eq: ['전극·케이블 (전기비저항)', '지오폰·타격원 (탄성파)'], crew: 4, qc: ['측선 간격·전극 간격 기록', '노이즈(차량·전선) 시간대 회피', '시추 결과와 대비 보정'], safe: '도로 측선은 교통 통제' },
  lab: { n: '시료·실내 시험', eq: ['압축 시험기', '함수비·입도 시험 장비'], crew: 2, qc: ['시료 밀봉·운반 중 교란 방지', '일축압축강도·전단강도 기록', '시험 성적서 서명'], safe: '시편 파괴 시 보호 덮개' },
  bore: { n: '시추·천공', eq: ['시추기·오거 천공기', '케이싱·코어 배럴'], crew: 3, qc: ['천공 위치·수직도 측량', '지층 변화 심도 기록', '공벽 붕괴 시 케이싱'], safe: '회전부 끼임 방지 덮개' },
  drain: { n: '연직 배수재 타입', eq: ['PBD 타입기 (맨드릴)', '샌드매트 장비'], crew: 4, qc: ['타입 간격 1.2m · 심도 기록', '배수재 절단·꼬임 없음', '샌드매트 두께 0.5m 이상'], safe: '연약 지반 장비 전도 (매트 깔기)' },
  surcharge: { n: '선행 재하 · 압밀 계측', eq: ['덤프·불도저 (성토)', '침하판·간극수압계'], crew: 4, qc: ['단계 성토 (높이 1m씩)', '침하·간극수압 주 2회 계측', '목표 압밀도 90% 확인 후 제거'], safe: '성토 사면 활동 감시' },
  compact: { n: '모래다짐말뚝 (SCP)', eq: ['진동 케이싱 · 모래 호퍼', '크롤러 베이스'], crew: 4, qc: ['모래 투입량 = 설계 치환율', '케이싱 인발·재관입 횟수 기록', '표준관입시험으로 다짐 확인'], safe: '진동 해머 소음·진동 계측' },
  mix: { n: '심층 혼합 (교반·분사)', eq: ['교반기 (DCM·SCW 3축)', '시멘트 사일로·플랜트'], crew: 5, qc: ['슬러리 비중·주입량 자동 기록', '회전수·인발 속도 일정', '코어로 일축압축강도 확인'], safe: '슬러리 비산 · 고압 호스 고정' },
  loadtest: { n: '말뚝 재하 시험', eq: ['유압 잭·반력 보 (또는 양방향 셀)', '변위계·하중계'], crew: 4, qc: ['설계 하중의 200% 단계 재하', '하중-침하 곡선 기록', '잔류 침하량 판정'], safe: '재하 중 반력 장치 접근 금지' },
  pile: { n: '기성 말뚝 시공', eq: ['항타기 (리더·해머)', '용접기 (이음)'], crew: 5, qc: ['말뚝 위치·수직도 1/100', '최종 관입량·리바운드 측정', '이음 용접부 검사'], safe: '항타 소음·진동 (인접 건물 계측)' },
  bored: { n: '현장타설 말뚝 · 벽체 굴착', eq: ['RCD·하이드로밀 굴착기', '안정액 플랜트 · 데샌더'], crew: 6, qc: ['안정액 비중 1.03~1.10 · 점성', '굴착 수직도 1/300', '공저 슬라임 제거'], safe: '굴착 구멍 덮개·추락 방지' },
  cage: { n: '철근망 인양·삽입', eq: ['크롤러 크레인 2대 (주·보조)', '철근망 인양 지그'], crew: 6, qc: ['철근망 길이·피복 스페이서', '이음 커플러 체결', '삽입 중 공벽 접촉 방지'], safe: '2점 인양 · 신호수 배치' },
  tremie: { n: '트레미 수중 타설', eq: ['트레미관 · 호퍼', '레미콘·펌프'], crew: 6, qc: ['트레미관 콘크리트 속 2m 이상 묻힘', '타설 높이·물량 대조', '상부 열화부 여유 타설'], safe: '관 인발 중 낙하물 주의' },
  lagging: { n: '토류판 끼우기', eq: ['백호 (소형)', '토류판 (목재 80mm)'], crew: 4, qc: ['굴착 즉시 1단씩 끼움', '배면 공극 되메움', '누수·토사 유출 확인'], safe: '굴착면 하부 단독 작업 금지' },
  anchor: { n: '어스앵커·네일', eq: ['앵커 천공기 (크롤러)', '그라우트 펌프 · 유압 잭'], crew: 4, qc: ['천공 각도·길이 기록', '그라우트 양생 후 긴장', '확인 시험 설계하중 ×1.2'], safe: '긴장 중 잭 후방 출입 금지' },
  strut: { n: '버팀보·띠장 설치', eq: ['크롤러 크레인', '유압 잭 (선행하중)'], crew: 6, qc: ['띠장 밀착 · 쐐기 고정', '선행하중 설계 축력의 50%', '변형률계로 축력 계측'], safe: '인양 중 버팀보 아래 출입 금지' },
  slope: { n: '사면 굴착·보호', eq: ['백호', '숏크리트 펌프·노즐'], crew: 4, qc: ['경사 1:1~1:1.5 유지', '숏크리트 두께 핀으로 확인', '배수로·우수 차단'], safe: '사면 상단 하중 금지' },
  grout: { n: '약액 주입 (차수)', eq: ['그라우트 펌프·믹서', '주입관 (이중관)'], crew: 4, qc: ['주입압 · 주입량 자동 기록', '겔 타임 시험', '투수 시험으로 차수 확인'], safe: '약액 취급 보호구 · 지하수 수질 감시' },
  dewater: { n: '지하수 배수', eq: ['수중 펌프·깊은 우물', '침사조·유량계'], crew: 2, qc: ['수위 저하량 · 양수량 기록', '주변 지표 침하 계측', '방류 수질 (부유물)'], safe: '전기 누전 차단기' },
  blast: { n: '제어 발파', eq: ['크롤러 드릴', '방호 매트 · 발파 진동계'], crew: 5, qc: ['지발당 장약량 제한', '진동 PPV 허용치 이하 (계측)', '불발 확인 후 해제'], safe: '경계 구역 대피 · 경적' },
  split: { n: '무진동 암 파쇄', eq: ['유압 할암기', '브레이커 백호'], crew: 4, qc: ['천공 간격·심도', '균열 유도 순서', '파쇄 소음 측정'], safe: '파편 비산 방지망' },
  clam: { n: '깊은 구간 양중 (클램셸)', eq: ['크롤러 + 클램셸 버킷', '덤프트럭'], crew: 4, qc: ['양중 경로 아래 작업 금지', '버킷 하강 속도', '토사 낙하 방지'], safe: '선회 반경 출입 통제' },
  haul: { n: '토사 반출', eq: ['덤프트럭 15t', '세륜기 · 살수기'], crew: 3, qc: ['적재함 덮개 · 과적 금지', '세륜 후 반출 · 도로 청소', '반출량 대장 기록'], safe: '게이트 신호수 · 보행자 통제' },
  dig: { n: '굴착 (터파기)', eq: ['백호 0.7㎥', '덤프트럭'], crew: 4, qc: ['단계별 굴착 깊이 (지보 아래 0.5m)', '굴착면 지하수·지층 확인', '흙막이 계측 일일 확인'], safe: '굴착기 선회 반경 출입 금지' },
  steel: { n: '철골 세우기·접합', eq: ['타워크레인', '임팩트 렌치 · 용접기'], crew: 6, qc: ['기둥 수직도 1/1000', '고력볼트 1차 조임 → 마킹 → 본조임', '용접부 초음파 검사'], safe: '안전대 부착 설비 · 낙하물 방지' },
  precast: { n: 'PC·모듈 설치', eq: ['타워·크롤러 크레인', '레벨 조정 심·그라우트 펌프'], crew: 6, qc: ['반입 순서·부재 번호 대조', '설치 레벨·수직 오차 ±5mm', '접합부 무수축 그라우트 충전'], safe: '임시 지지대 고정 전 해체 금지' },
  curtain: { n: '외장 (커튼월·패널) 설치', eq: ['타워크레인 · 모노레일', '유닛 인양 지그'], crew: 5, qc: ['앵커 위치 먹매김 · 레벨', '유닛 간 이음 기밀', '살수 시험 (수밀)'], safe: '고소 작업 · 낙하물 방지망' },
  glass: { n: '창호·유리 끼우기', eq: ['진공 흡착기', '실링 건'], crew: 3, qc: ['프레임 수평·수직', '세팅 블록 위치', '유리 사양 (Low-E 면 방향)'], safe: '유리 파손 대비 보호구' },
  seal: { n: '실링·기밀 처리', eq: ['실링 건 · 마스킹 테이프', '백업재'], crew: 2, qc: ['피착면 청소·프라이머', '실링 폭·깊이 2:1', '기밀 테이프 겹침 50mm'], safe: '용제 환기' },
  insul: { n: '단열 시공', eq: ['단열재 · 앵커', '뿜칠 장비 (우레탄)'], crew: 4, qc: ['단열재 이음부 틈 없이', '열교 부위 보강', '두께 확인 (침 검사)'], safe: '우레탄 뿜칠 중 화기 엄금' },
  waterproof: { n: '방수 시공', eq: ['토치 · 롤러', '시트 · 도막재'], crew: 4, qc: ['바탕 함수율 · 프라이머', '시트 겹침 100mm 이상', '담수 시험 48시간'], safe: '토치 화재 감시자 · 소화기' },
  pv: { n: '태양광 설치', eq: ['가대·모듈', '인버터 · 접속반'], crew: 4, qc: ['방수층 관통 최소화', '모듈 경사·방위', '절연 저항·개방 전압 측정'], safe: '직류 감전 · 지붕 끝 추락' },
  rebar: { n: '철근 배근·결속', eq: ['철근 절단·절곡기', '결속기·스페이서'], crew: 8, qc: ['철근 지름·간격·개수 대조', '피복 두께 (슬래브 20 · 보 40mm)', '이음 위치·길이'], safe: '철근 끝 보호캡' },
  form: { n: '거푸집 조립', eq: ['거푸집 패널 · 동바리', '타워크레인'], crew: 8, qc: ['동바리 간격·수직', '거푸집 치수·레벨', '수평 연결재 (3.5m 초과 시 2m마다)'], safe: '작업 발판 · 안전 난간' },
  cure: { n: '양생·탈형', eq: ['양생 덮개 · 살수', '온도 센서 · 열풍기'], crew: 2, qc: ['습윤 양생 5일 이상', '탈형: 측면 5MPa 이상', '수화열 내외부 온도 차 관리'], safe: '열풍기 일산화탄소 환기' },
  mixdesign: { n: '콘크리트 배합·품질', eq: ['레미콘 공장 배치 플랜트', '현장 시험 (슬럼프·공기량)'], crew: 2, qc: ['슬럼프 150±25mm', '공기량 4.5±1.5%', '공시체 채취 (120㎥마다)'], safe: '레미콘 후진 유도' },
  pour: { n: '콘크리트 타설', eq: ['펌프카 · 레미콘', '진동기'], crew: 8, qc: ['슬럼프·공기량 받아들이기 검사', '진동기 삽입 간격 0.5m', '이어치기 시간 (25℃ 초과 2h)'], safe: '펌프 붐 아래 출입 금지' },
  lift: { n: '양중 (크레인)', eq: ['타워크레인 · 줄걸이', '신호수 무전'], crew: 4, qc: ['정격 하중·작업 반경 확인', '줄걸이 각도 60° 이하', '순간풍속 20m/s 초과 운전 중지'], safe: '인양물 아래 출입 금지' },
  hoist: { n: '수직 운송 (호이스트)', eq: ['랙 피니언 호이스트', '층별 출입 데크·게이트'], crew: 2, qc: ['정격 인원·하중 표시', '마스트 벽 고정 간격', '과부하·낙하 방지 장치 점검'], safe: '출입문 연동 장치' },
  plant: { n: '설비 장비 반입·설치', eq: ['지게차·롤러 (스케이트)', '체인 블록 · 방진 패드'], crew: 6, qc: ['반입 경로·개구부 크기', '기초 레벨 · 앵커', '방진 장치·배관 연결 하중'], safe: '중량물 전도 방지' },
  duct: { n: '덕트 설치', eq: ['덕트 · 행거', '고소 작업대'], crew: 4, qc: ['행거 간격 (각형 2.4m 이하)', '이음부 기밀 · 보온', '풍량 측정 (TAB)'], safe: '고소 작업대 안전 난간' },
  pipe: { n: '배관 설치·시험', eq: ['배관 · 프레스·용접기', '수압 시험 펌프'], crew: 4, qc: ['구배·지지 간격', '수압 시험 사용압 ×1.5 · 60분', '보온·명판'], safe: '용접 불티 · 화재 감시' },
  sprinkler: { n: '소화 설비', eq: ['스프링클러 배관·헤드', '수압 시험 펌프'], crew: 4, qc: ['헤드 간격·살수 장애', '수압 시험 1.4MPa · 2시간', '알람 밸브 작동 시험'], safe: '배관 고소 작업' },
  detect: { n: '감지·연동 설비', eq: ['감지기·수신기', '연기·열 시험기'], crew: 3, qc: ['감지기 위치 (공조 취출구 1.5m 이격)', '회로·주소 시험', '연동 (제연·셔터·엘리베이터)'], safe: '오동작 방지 사전 공지' },
  cable: { n: '전기 간선·배선', eq: ['케이블 드럼 · 포설 롤러', '절연 저항계 (메거)'], crew: 6, qc: ['케이블 굽힘 반경', '절연 저항 1MΩ 이상', '단자 체결 토크·명판'], safe: '활선 작업 금지 · 잠금 표지' },
  ict: { n: '통신·제어', eq: ['광·UTP 케이블', '측정기 (OTDR)'], crew: 3, qc: ['광 손실 측정', '라벨링·배선도', '센서·관제 연동 시험'], safe: '랙 고정 · 정전기' },
  elev: { n: '승강기 설치', eq: ['가이드 레일 · 권상기', '레이저 수직 측정기'], crew: 4, qc: ['레일 수직도 측정', '로프 장력 균일', '안전 장치·완충기 시험'], safe: '승강로 개구부 추락 방지' },
  wall: { n: '칸막이 시공', eq: ['스터드·러너 · 석고보드', '스크류 건'], crew: 4, qc: ['스터드 간격 450mm', '보드 이음 엇갈림', '차음재 충전·틈새 실링'], safe: '분진 · 절단 보호구' },
  plaster: { n: '미장·퍼티', eq: ['흙손 · 퍼티 나이프', '샌딩기'], crew: 3, qc: ['바름 두께·평활도', '건조 시간', '균열·들뜸 확인'], safe: '분진 마스크' },
  ceiling: { n: '천장 설치', eq: ['행어볼트 · 캐링 채널', '고소 작업대'], crew: 4, qc: ['행어 간격 900mm', '천장 레벨 레이저 확인', '설비 점검구 위치'], safe: '작업대 이동 시 하강' },
  floor: { n: '바닥 시공', eq: ['완충재 · 모르타르 펌프', '레벨기 · 연마기'], crew: 5, qc: ['평탄도 (3m 직선자 3mm)', '양생 중 보행 금지', '바닥 충격음 성능'], safe: '연마 분진 · 미끄럼' },
  paint: { n: '도장·도배', eq: ['롤러 · 에어리스 스프레이', '마스킹 테이프'], crew: 4, qc: ['하도-중도-상도 도막 두께', '재도장 간격 (건조)', '실내 공기질 (VOC)'], safe: '환기 · 방독 마스크' },
  landscape: { n: '조경·외부 포장', eq: ['굴착기 · 크레인 (수목)', '진동 롤러'], crew: 6, qc: ['식재 깊이·지주목', '포장 기층 다짐', '배수 구배'], safe: '수목 인양 줄걸이' },
  temp: { n: '가설 시설', eq: ['가설 울타리·방음벽', '살수기 · 세륜기'], crew: 6, qc: ['울타리 높이 3m · 기초 고정', '비산 먼지 억제 (살수)', '소음 측정·전광판'], safe: '풍하중 대비 지지대' },
  commission: { n: '시운전·인수인계', eq: ['중앙 관제 · BEMS', '측정기 (풍량·수량·전력)'], crew: 6, qc: ['설비별 단독 → 연동 운전', '시험 성적·하자 목록', '운영자 교육 기록'], safe: '시험 중 구역 통제' },
  inspect: { n: '검사·계측', eq: ['측정기·시험기', '체크리스트 (태블릿)'], crew: 2, qc: ['측정값과 기준 대조', '부적합 즉시 시정 지시', '사진·기록 보관'], safe: '측정 위치 추락 방지' },
  plan: { n: '공정 계획·관리', eq: ['공정 관리 소프트웨어', '4D BIM'], crew: 3, qc: ['주공정 여유 0 활동 관리', '계획 대비 실적 (PPC)', '선행 제약 조건 제거'], safe: '야간·동시 작업 간섭 사전 조정' },
  drone: { n: '드론·스캔 측량', eq: ['드론 (RTK) · 지상 스캐너', '점군 처리 소프트웨어'], crew: 2, qc: ['기준점 (GCP) 배치', '중첩률 70% 이상', 'BIM 편차 ±10mm 대조'], safe: '비행 허가 · 크레인 간섭' },
  sensor: { n: '센서·IoT 모니터링', eq: ['무선 센서 · 게이트웨이', '대시보드'], crew: 2, qc: ['센서 보정·식별 번호', '데이터 누락 경보', '관리 기준 초과 알림'], safe: '배터리·배선 고정' },
  data: { n: 'BIM·AI 분석', eq: ['BIM 모델 · 서버', 'AI 분석 도구'], crew: 3, qc: ['입력 데이터 출처·정확도', '모델 검증 (실측 대조)', '결과를 시공 계획에 반영'], safe: '—' },
  generic: { n: '현장 작업', eq: ['소형 공구 · 자재'], crew: 4, qc: ['작업 전 TBM (위험 공유)', '시공 기준 대조', '작업 후 정리·검측'], safe: '보호구 착용' },
};
const RULES = [
  ['spt', /표준관입|SPT/], ['cpt', /콘관입|CPT/], ['geo', /탐사|전기비저항|탄성파/], ['loadtest', /재하 시험|재하시험/],
  ['lab', /실내 시험|일축압축|코어 채취|코어로|시료|강도 확인/],
  ['drain', /PBD|배수재|샌드매트/], ['surcharge', /선행 재하|성토|진공 펌프|압밀|재하토/], ['compact', /케이싱 관입|모래 투입|복합 지반/],
  ['mix', /교반|시멘트 슬러리|시멘트 밀크|개량체|고결체|초고압 분사/],
  ['blast', /발파|장약|뇌관|방호 매트/], ['split', /할암|브레이커|파쇄/], ['clam', /클램쉘|클램셸/], ['haul', /덤프|반출 \(|세륜/],
  ['lagging', /토류판/], ['tremie', /트레미/], ['cage', /철근망|케이지/], ['bored', /RCD|하이드로밀|안정액|가이드월|대구경 천공|케이싱 설치/],
  ['curtain', /유닛|커튼월|멀리언|모노레일|외장|금속 패널|PC 패널|외피|외부 작업대|외단열 \+ 마감|비계 없이/],
  ['anchor', /앵커|강연선|긴장|네일|인장재/], ['strut', /버팀|띠장|프리로딩|중간 말뚝/], ['slope', /경사로|사면|숏크리트/],
  ['grout', /그라우팅|주입|약액|물유리|투수 시험/], ['dewater', /우물|양수|집수정|펌핑|지하수위를/],
  ['pile', /항타|말뚝|PHC|강관|해머|강널|두부|소구경 천공/],
  ['dig', /굴착|터파기|백호/],
  ['cure', /양생|수화열|보온|열풍기|가열|적산|탈형|해체 시점|동절기|온도 센서/],
  ['glass', /유리|창호|Low-E|로이|간봉|프레임|틸트|진공층|태양광 셀|이중창|PVC|결로/],
  ['seal', /실링|코킹|기밀 테이프|지수판|지수재|이음부 테이프/],
  ['pv', /태양광|PV(?![CD])|인버터|가대|ESS|계통 연계|발전량/],
  ['waterproof', /방수|시트|도막|우레탄 2|아스팔트 시트|토치|프라이머|방근|벤토나이트|결정성|HDPE|보호재|배수판|자착식|UV 보호|재도장/],
  ['fireproof', /내화/],
  ['insul', /단열|미네랄울|뿜칠|진공 패널|열교|메시 \+ 베이스|보호층/],
  ['floor', /완충재|기포|방통|마루|건식 난방|받침대|OA|에폭시|연마|레벨링|카펫|비닐 시트|석재|걸레받이|평탄도|표면 강화제|바닥/],
  ['plant', /냉동기|보일러|축열조|냉각탑|히트펌프|열교환기|항온항습|실외기|발전기|UPS|변압기|저수조|부스터|초순수|장비 반입|외조기|MAU|기계실 냉/],
  ['duct', /덕트|공조기|AHU|VAV|취출구|FFU|환기|배기|차압|프리쿨링|외기|천장 카세트/],
  ['sprinkler', /스프링클러|헤드|알람 밸브|소화 펌프|소화약제|소화 약제|미세 물입자|포 소화|일제살수|배관은 비워|감지기 교차 동작 시 급수/],
  ['detect', /감지|수신기|제연|배연|피난|가스 누설|Door Fan|기밀 시험|연동 → TAB/],
  ['pipe', /배관|급수|배수|입상관|스풀|오비탈|냉매|헤더|PE관|감압|통기|코일|분배기|욕실|위생|빗물 저류|수압|수조|절수|물 사용량|매립/],
  ['cable', /케이블|트레이|간선|버스덕트|분전반|전열|조명|배선|LED|DC 배전|차단기|전력량계|절체|22\.9|변전소|플러그인|수요 관리|수전/],
  ['ict', /통신|UTP|광 백본|CCTV·출입|방송|주차 관제|서버|관제실|BAS|BEMS로|무선 센서|BIM에 장비|IoT 데이터/],
  ['elev', /승강|엘리베이터|레일|권상기|로프|기계실 생략|카리프트|행선층|램프|도크|스카이 로비|분속|배차|대기 시간/],
  ['steel', /철골|기둥 세우|볼트|용접|UT|초음파|수직도|대블록|아웃리거|트러스/],
  ['precast', /PC |PC·|HCS|모듈|프리캐스트|접합부|토핑|적층|반입|공장 제작|공장 양생|JIT|야드|SPMT|운송|공장에서/],
  ['lift', /크레인|인양|양중|마스트|텔레스코핑|클라이밍|지브|링거|크롤러|선회/],
  ['hoist', /호이스트|리프트|출입 데크|운행|점프|출퇴근|계단 이동/],
  ['rebar', /철근|배근|결속|커플러|철망|이음|SD600|스크랩|가공장|절곡|과밀/],
  ['form', /거푸집|폼|갱폼|ACS|슬립|골강판|동바리|지주 없이|합판|작업 발판|안전 난간|자동상승|사이클|전용|데크/],
  ['mixdesign', /배합|레미콘 표준|실리카퓸|감수제|저열|플라이애시|고로슬래그|고강도|고유동|탄소|시멘트|다짐 없이/],
  ['pour', /타설|콘크리트|펌프|압송|CPB|레미콘|버킷|매트|피복/],
  ['wall', /스터드|러너|석고보드|흡음재|블록|쌓기|ALC|벽 패널|샌드위치 패널 벽|칸막이|화장실 모듈|청정도 등급별 구획/],
  ['plaster', /미장|줄눈|퍼티|샌딩|바름|건조/],
  ['ceiling', /천장|행어|캐링|M-bar|T-bar|텍스|그리드|FFU·조명/],
  ['paint', /도장|페인트|롤러|스프레이|에어리스|하도|상도|VOC|벽지|초배|정배|마스킹|보양|몰딩|베이크아웃|도막 두께/],
  ['landscape', /조경|식재|교목|관목|포장|보도블록|투수|빗물 정원|저류 침투|녹지|옹벽|측구|토양|수목|우수관|방류/],
  ['commission', /시운전|단독 운전|시나리오|인수인계|교육|임시 사용승인|램프업|수율|사용승인 신청|조기 운영|입주 동선|하자|잔여 공사|훅업/],
  ['drone', /드론|비행|정사영상|토공량|스캔|SLAM|편차|진척률/],
  ['sensor', /센서|성숙도|RFID|태그|생체|근접 경보|가스 감지|CCTV 영상|안전모|결함 자동|대시보드|계측 연동|실측 비교|위치 자동/],
  ['plan', /공정|네트워크|주공정|진도|생산 속도|택트|버퍼|계획|PPC|4D|최적안|일정|선후행|충돌 예측|작업량 구역|박자|적층 최소|시공 순서|제약/],
  ['temp', /가설|울타리|방음벽|분진|살수|게이트|사무실|전광판/],
  ['inspect', /검사|시험|확인|측정|계측|점검|인증|TAB|풍량|성능/],
  ['data', /AI|머신러닝|모델|BIM|데이터|디지털|알고리즘|시뮬레이션|간섭|코디네이션/],
];
ARCH.fireproof = { n: '내화 피복', eq: ['뿜칠기 · 내화 도료', '두께 측정 핀'], crew: 3, qc: ['피복 두께 (내화 시간별)', '부착 강도', '분진 차단 막'], safe: '분진 · 고소 작업' };
const WP_DEF = {
  survey: 'bore', improve: 'mix', prep: 'temp', wall: 'bored', support: 'strut', water: 'grout', excav: 'dig', found: 'pile', bwp: 'waterproof', base: 'pour',
  frame: 'form', form: 'form', rebar: 'rebar', conc: 'mixdesign', pour: 'pour', steel: 'steel', lift: 'lift', hoist: 'hoist',
  skin: 'curtain', glaz: 'glass', insul: 'insul', roof: 'waterproof', mep: 'pipe', hvac: 'duct', plumb: 'pipe', fire: 'sprinkler', elec: 'cable', ict: 'ict', elev: 'elev',
  part: 'wall', floor: 'floor', ceil: 'ceiling', paint: 'paint', land: 'landscape', comm: 'commission', plan: 'plan', qa: 'sensor',
};
const FRAME_OPT = { steel: 'steel', hybrid: 'steel', src: 'steel', truss: 'steel', stick: 'steel', pc: 'precast', modular: 'precast', module: 'precast' };
// 규칙으로 갈리지 않는 단계 문장 (공종/공법|문장 → 유형)
const FIX = new Map([
  ['water/anchor|유지관리 없는 수동 저항', 'anchor'],
  ['support/anchor|벽체를 관통해 경사 천공', 'anchor'],
  ['water/drain|부력이 줄어 기초 두께 절감', 'dewater'],
  ['water/drain|기초 아래 드레인 매트·유공관', 'dewater'],
  ['bwp/cryst|샌 물을 모아서 배수', 'dewater'],
  ['ceil/mbar|행어볼트·캐링 채널', 'ceiling'],
  ['ceil/module|리프트로 들어 올려 고정', 'ceiling'],
  ['ceil/cleang|FFU·조명 얹기', 'ceiling'],
  ['mep/conv|현장 측정·절단·용접', 'pipe'],
  ['plumb/upw|PVDF·스테인리스 EP 배관 오비탈 용접', 'pipe'],
  ['plumb/booster|주철·PVC 배수 입상관', 'pipe'],
  ['hvac/radiant|슬래브·천장 복사 패널 (냉온수)', 'pipe'],
  ['rebar/mesh|슬래브 하부근을 공장 용접 철망으로', 'rebar'],
  ['rebar/mesh|철근 트러스 일체형 데크', 'rebar'],
  ['pour/multi|매트 기초를 이음 없이 한 번에 (콜드조인트 없음)', 'pour'],
  ['frame/hybrid|데크플레이트 + 슬래브 타설', 'pour'],
  ['pour/highp|배관 마모·막힘 관리', 'pour'],
  ['pour/cpb|정치식 펌프 + 수직 배관', 'pour'],
  ['conc/scc|과밀 배근부·SRC 피복', 'pour'],
  ['conc/scc|다짐 없이 철근 사이 충전', 'pour'],
  ['water/jsp|벽체 이음부·하부 근입부 보강', 'mix'],
  ['paint/airless|분진·비산 관리', 'paint'],
  ['ceil/exposed|흑색 도장 / 흡음 뿜칠', 'paint'],
  ['hoist/lift|저층·소규모 전용', 'hoist'],
  ['hoist/jump|외부 호이스트 조기 해체 → 외장 마감', 'hoist'],
  ['hoist/fast|고속 인버터 호이스트 2~4기', 'hoist'],
  ['hoist/rack|건물 외부 마스트 + 2단 케이지', 'hoist'],
  ['insul/vip|얇은 벽으로 전용 면적 확보', 'insul'],
  ['skin/wet|외단열 + 마감(석재·도장)', 'insul'],
  ['qa/iot|거푸집 해체·인장 시점 최적화', 'sensor'],
  ['qa/wear|밀폐 공간 가스 감지', 'sensor'],
  ['qa/wear|중장비·크레인 근접 경보', 'sensor'],
  ['skin/wet|갱폼 해체 후 외부 작업', 'plaster'],
  ['land/pre|준공 직전 공정 집중 완화', 'landscape'],
  ['land/std|보도블록·아스팔트 포장', 'landscape'],
  ['land/ind|중차량 콘크리트 포장', 'landscape'],
  ['part/block|습식 공정으로 후속 공정 대기', 'wall'],
  ['part/alc|경량 기포 콘크리트 접착 쌓기', 'wall'],
  ['part/alc|단열·내화 성능', 'wall'],
  ['part/module|현장 공정 30~50% 단축', 'precast'],
  ['plumb/pod|공장에서 완성한 욕실 유닛 반입', 'precast'],
  ['plumb/zone|피난층 중간 수조로 수압 구역 분할', 'plant'],
  ['hvac/crac|냉각수 이중화 (N+1)', 'plant'],
  ['hvac/geo|신재생 에너지 의무 비율 충족', 'plant'],
  ['hvac/district|지역난방 열교환기 (기계실)', 'plant'],
  ['roof/metal|천창·배연창 일체', 'curtain'],
  ['insul/sandwich|별도 단열 공정 없음', 'curtain'],
  ['survey/ai|국토 지반정보·인근 시추 수천 공 수집', 'data'],
  ['survey/ai|불확실성 지도 → 추가 시추 위치 재추천', 'data'],
  ['survey/spt|지층 단면도·설계 정수 산정', 'lab'],
  ['elec/bus|공장 제작 버스덕트를 샤프트에 수직 설치', 'cable'],
  ['wall/sheet|공사 후 인발 재사용', 'pile'],
  ['wall/hpile|되메우기 후 H형강 인발', 'pile'],
  ['hvac/vrf|전열 교환 환기 유닛 별도', 'duct'],
  ['prep/modular|가설 전력 수전 + 태양광 보조', 'temp'],
  ['floor/epoxy|정전기 방지·내화학', 'floor'],
  ['hvac/geo|지중 열교환 보어홀 (깊이 150m, 다수)', 'bore'],
  ['frame/rcframe|가변형 평면 (리모델링 쉬움)', 'form'],
  ['form/acs|크레인 없이 3~4일 사이클', 'form'],
  ['comm/perf|수율·가동률 램프업', 'commission'],
  ['comm/std|소방·승강기·전기 사용 전 검사', 'inspect'],
  ['steel/robot|레일 주행 용접 로봇으로 기둥 이음', 'steel'],
  ['support/sps|해체 공정이 없어 지하 공기 단축', 'steel'],
  ['excav/mix|진동 기준 구역별 적용', 'blast'],
  ['plan/ai|크레인 반경·동시 굴착·트럭 피크·공종 적층 충돌 탐지', 'plan'],
  ['plan/ai|착공 순서·시차·크레인 높이를 탐색 알고리즘으로 최적화', 'plan'],
  ['plan/bim4d|크레인·동선·가설 간섭 시각 검토', 'plan'],
  ['lift/crawler|지반 보강 (매트)', 'lift'],
  ['lift/crawler|장스팬 트러스·탑류 일괄 인양', 'lift'],
  ['frame/truss|지붕 철골 트러스 지상 조립 → 일괄 인양', 'steel'],
  ['bwp/tank|수밀 배합 + 균열 제어 철근', 'mixdesign'],
  ['conc/high|기둥 단면 축소 (전용면적 증가)', 'mixdesign'],
  ['conc/lowc|초기 강도가 늦어 거푸집 존치 기간 관리', 'cure'],
  ['qa/scan|오차 구간 즉시 재시공 지시', 'drone'],
]);
// 공종 · 공법 · 단계 문장 → 작업 유형
export function classify(wpId, optId, text) {
  const t = String(text || '');
  const fx = FIX.get(`${wpId}/${optId}|${t}`); if (fx) return fx;
  for (const [k, re] of RULES) if (re.test(t)) return k;
  if (wpId === 'frame' && FRAME_OPT[optId]) return FRAME_OPT[optId];
  if (wpId === 'roof' && optId === 'pv') return 'pv';
  if (wpId === 'roof' && optId === 'green') return 'landscape';
  if (wpId === 'roof' && optId === 'metal') return 'curtain';
  return WP_DEF[wpId] || 'generic';
}

// ---------- 오른쪽 정보 ----------
export function workInfo({ wpId, optId, text, k, n, days }) {
  const a = classify(wpId, optId, text), A = ARCH[a] || ARCH.generic, wp = WP_BY_ID[wpId];
  const d = days > 0 ? (days < 1.5 ? '약 1일' : `약 ${n0(days)}일`) : '—';
  return { a, html: `<div class="sw-h"><span class="sw-n">STEP ${String(k + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span><span class="sw-k">${esc(A.n)}</span></div>
    <p class="sw-t">${esc(text)}</p>
    <dl class="sw-dl"><div><dt>투입 장비</dt><dd>${A.eq.map(esc).join(' · ')}</dd></div><div><dt>작업조</dt><dd>약 ${A.crew}명</dd></div><div><dt>이 단계</dt><dd>${d}${wp ? ` <em>(${esc(wp.code)} 기간을 단계 수로 나눈 값)</em>` : ''}</dd></div></dl>
    <div class="sw-qc"><b>관리 항목</b><ul>${A.qc.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <p class="sw-sf"><b>안전</b> ${esc(A.safe)}</p>` };
}

// ---------- 그림 펜 (px, 440×240) ----------
const VWW = 440, VHH = 240, GY = 196;
function pen() {
  const o = [];
  const f = (v) => (Math.round(v * 10) / 10);
  const P = (s) => o.push(s);
  const g = {
    o, P,
    r: (x, y, w, h, c, rx = 0) => P(`<rect class="${c}" x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}"${rx ? ` rx="${rx}"` : ''}/>`),
    l: (x1, y1, x2, y2, c) => P(`<line class="${c}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`),
    c: (x, y, r, c) => P(`<circle class="${c}" cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(0.3, r))}"/>`),
    e: (x, y, rx, ry, c) => P(`<ellipse class="${c}" cx="${f(x)}" cy="${f(y)}" rx="${f(Math.max(0.3, rx))}" ry="${f(Math.max(0.3, ry))}"/>`),
    pg: (pts, c) => P(`<polygon class="${c}" points="${pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}"/>`),
    pl: (pts, c) => P(`<polyline class="${c}" points="${pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}"/>`),
    d: (d, c) => P(`<path class="${c}" d="${d}"/>`),
    t: (x, y, s, c = 'wv-t', a = 'start') => P(`<text class="${c}" x="${f(x)}" y="${f(y)}" text-anchor="${a}">${esc(s)}</text>`),
  };
  // 작업자: 발 (x, y). pose: stand·walk·bend·kneel·reach·hold·swing·sit. 손 위치를 돌려준다
  g.man = (x, y, o2 = {}) => {
    const d = o2.dir || 1, t = o2.t || 0, pose = o2.pose || 'stand', s = o2.s || 1, vest = o2.vest || 'wv-mv';
    const L = 15 * s, B = 14 * s, R = 4.2 * s;
    let hx = x, hy = y - L, sx = x, sy = hy - B, fl = [x - 3 * s, y], fr = [x + 3 * s, y];
    let ha = [x + d * 2 * s, hy + 1], hb = [x - d * 2 * s, hy + 1];
    if (pose === 'walk') { const w = Math.sin(t * 6) * 5 * s; fl = [x - w, y]; fr = [x + w, y]; ha = [x + w * 0.8, hy + 2]; hb = [x - w * 0.8, hy + 2]; }
    if (pose === 'bend') { sx = x + d * 10 * s; sy = hy - 9 * s; ha = [sx + d * 6 * s, y - 5 * s]; hb = [sx + d * 3 * s, y - 4 * s]; fl = [x - 5 * s, y]; fr = [x + 3 * s, y]; }
    if (pose === 'kneel') { hy = y - 9 * s; hx = x; sx = x + d * 2 * s; sy = hy - B; fl = [x - d * 9 * s, y]; fr = [x + d * 5 * s, y]; ha = [sx + d * 10 * s, sy + 9 * s]; hb = [sx + d * 7 * s, sy + 11 * s]; }
    if (pose === 'reach') { ha = [sx + d * 4 * s, sy - 13 * s]; hb = [sx - d * 1 * s, sy - 12 * s]; }
    if (pose === 'hold') { ha = [sx + d * 12 * s, sy + 5 * s]; hb = [sx + d * 10 * s, sy + 8 * s]; }
    if (pose === 'swing') { const a = -1.2 + Math.abs(Math.sin(t * 5)) * 1.9; ha = [sx + d * Math.cos(a) * 13 * s, sy - Math.sin(a) * 13 * s]; hb = [sx + d * 8 * s, sy + 6 * s]; }
    if (pose === 'sit') { hy = y - 10 * s; sy = hy - B; fl = [x + d * 8 * s, y]; fr = [x + d * 10 * s, y]; ha = [sx + d * 10 * s, sy + 6 * s]; hb = [sx + d * 9 * s, sy + 8 * s]; }
    const hdx = sx + (sx - hx) * 0.35, hdy = sy - R - 1.5 * s;
    P(`<g class="wv-m"><polyline class="wv-ml" points="${f(fl[0])},${f(fl[1])} ${f(pose === 'kneel' ? hx - d * 6 * s : (fl[0] + hx) / 2)},${f(pose === 'kneel' ? y - 1 : (y + hy) / 2)} ${f(hx)},${f(hy)}"/><polyline class="wv-ml" points="${f(fr[0])},${f(fr[1])} ${f((fr[0] + hx) / 2 + (pose === 'kneel' ? d * 4 * s : 0))},${f(pose === 'kneel' ? hy + 1 : (y + hy) / 2)} ${f(hx)},${f(hy)}"/>`
      + `<line class="${vest}" x1="${f(hx)}" y1="${f(hy)}" x2="${f(sx)}" y2="${f(sy)}"/>`
      + `<polyline class="wv-ma" points="${f(sx)},${f(sy + 1)} ${f((sx + ha[0]) / 2)},${f((sy + ha[1]) / 2 + 2)} ${f(ha[0])},${f(ha[1])}"/><polyline class="wv-ma" points="${f(sx)},${f(sy + 1)} ${f((sx + hb[0]) / 2)},${f((sy + hb[1]) / 2 + 2)} ${f(hb[0])},${f(hb[1])}"/>`
      + `<circle class="wv-mh" cx="${f(hdx)}" cy="${f(hdy)}" r="${f(R)}"/><path class="${o2.hat || 'wv-hat'}" d="M${f(hdx - R * 1.3)} ${f(hdy - R * 0.2)}A${f(R * 1.15)} ${f(R * 1.2)} 0 0 1 ${f(hdx + R * 1.3)} ${f(hdy - R * 0.2)}Z"/></g>`);
    return { ha, hb, sh: [sx, sy], head: [hdx, hdy] };
  };
  // 지시선 + 이름표
  g.co = (x, y, tx, ty, s, a = 'start') => { g.l(x, y, tx, ty + 3, 'wv-ld'); g.c(x, y, 1.8, 'wv-dot'); g.t(tx + (a === 'start' ? 3 : a === 'end' ? -3 : 0), ty, s, 'wv-cl', a); };
  // 치수선
  g.dim = (x1, y1, x2, y2, s, off = 0) => { g.l(x1, y1, x2, y2, 'wv-dim'); g.l(x1 - (y2 - y1 ? 3 : 0), y1 - (y2 - y1 ? 0 : 3), x1 + (y2 - y1 ? 3 : 0), y1 + (y2 - y1 ? 0 : 3), 'wv-dim'); g.l(x2 - (y2 - y1 ? 3 : 0), y2 - (y2 - y1 ? 0 : 3), x2 + (y2 - y1 ? 3 : 0), y2 + (y2 - y1 ? 0 : 3), 'wv-dim'); g.t((x1 + x2) / 2 + (y2 - y1 ? 5 + off : 0), (y1 + y2) / 2 + (y2 - y1 ? 3 : -4 + off), s, 'wv-dt', y2 - y1 ? 'start' : 'middle'); };
  // 계기 (값 / 기준)
  g.gauge = (x, y, w, nm, v, lim, u, bad) => { g.r(x, y, w, 30, 'wv-gb', 3); g.t(x + 6, y + 11, nm, 'wv-gt'); g.t(x + w - 6, y + 11, `${v}${u}${lim != null ? ` / ${lim}${u}` : ''}`, bad ? 'wv-gvb' : 'wv-gv', 'end'); const k = clamp(v / Math.max(lim || v || 1, 1e-6) * (lim ? 0.8 : 1), 0, 1); g.r(x + 6, y + 18, w - 12, 4, 'wv-gbar'); g.r(x + 6, y + 18, (w - 12) * k, 4, bad ? 'wv-gfb' : 'wv-gf'); if (lim) g.l(x + 6 + (w - 12) * 0.8, y + 15, x + 6 + (w - 12) * 0.8, y + 25, 'wv-glim'); };
  // 땅 (지층)
  g.ground = (y = GY, layers = [['wv-s1', 18], ['wv-s2', 30], ['wv-s3', 99]]) => { let yy = y; layers.forEach(([c, h]) => { g.r(0, yy, VWW, Math.min(h, VHH - yy), c); yy += h; }); g.l(0, y, VWW, y, 'wv-gl'); };
  g.slab = (x, y, w, th = 8, c = 'wv-c') => g.r(x, y, w, th, c);
  // 장비 부품
  g.tracks = (x, y, w) => { g.r(x - w / 2, y - 8, w, 8, 'wv-trk', 4); for (let i = 0; i < 4; i++) g.c(x - w / 2 + 5 + i * (w - 10) / 3, y - 4, 2.6, 'wv-whl'); };
  g.excav = (x, y, d, a, b, load = false) => { // a: 붐 각, b: 버킷 각
    g.tracks(x, y, 46); g.r(x - 18, y - 24, 34, 15, 'wv-eq', 2); g.r(x - d * 2 - 7, y - 36, 14, 13, 'wv-eq', 2); g.r(x - d * 2 - 5, y - 34, 9, 7, 'wv-gls');
    const bx = x + d * 10, by = y - 22, ex = bx + d * Math.cos(a) * 34, ey = by - Math.sin(a) * 34, kx = ex + d * Math.cos(b) * 26, ky = ey + Math.sin(b) * 26;
    g.l(bx, by, ex, ey, 'wv-arm'); g.l(ex, ey, kx, ky, 'wv-arm2'); g.pg([[kx, ky], [kx + d * 10, ky + 2], [kx + d * 6, ky + 11], [kx - d * 2, ky + 8]], 'wv-eq');
    if (load) g.pg([[kx + d * 1, ky + 1], [kx + d * 9, ky + 2], [kx + d * 5, ky - 4]], 'wv-soil');
    return [kx + d * 4, ky + 6];
  };
  g.truck = (x, y, d = 1, load = 0, c = 'wv-trkb') => { g.r(x - 30, y - 24, 40, 14, c, 1); if (load) g.pg([[x - 29, y - 24], [x - 10, y - 24 - 8 * load], [x + 9, y - 24]], 'wv-soil'); g.r(d > 0 ? x + 12 : x - 46, y - 26, 16, 16, 'wv-eq', 2); g.r(d > 0 ? x + 18 : x - 44, y - 24, 8, 6, 'wv-gls'); [-22, -6, 18 * d + (d > 0 ? 0 : -16)].forEach(k => g.c(x + k, y - 5, 5, 'wv-whl')); };
  g.hook = (x, y0, y1) => { g.l(x, y0, x, y1, 'wv-rope'); g.r(x - 4, y1, 8, 6, 'wv-eqd'); g.d(`M${x} ${y1 + 6}q4 4 0 8`, 'wv-rope'); };
  g.vib = (x, y, T, r0 = 6, n = 3, cls = 'wv-vib') => { for (let i = 0; i < n; i++) { const k = ((T * 1.2 + i / n) % 1); g.P(`<circle class="${cls}" cx="${x}" cy="${y}" r="${(r0 + k * 30).toFixed(1)}" opacity="${(1 - k).toFixed(2)}"/>`); } };
  g.spark = (x, y, T) => { for (let i = 0; i < 7; i++) { const a = i * 0.9 + T * 13, L = 4 + ((T * 31 + i * 7) % 5); g.l(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.7 + 2, 'wv-spk'); } g.c(x, y, 2.4, 'wv-glow'); };
  g.drops = (x, y, w, h, T, n = 8, cls = 'wv-drop') => { for (let i = 0; i < n; i++) { const k = ((T * 1.6 + i * 0.37) % 1); g.c(x + (i * 37 % 100) / 100 * w, y + k * h, 1.4, cls); } };
  g.bldg = (x, y, w, h, fl = 3.2) => { g.r(x, y - h, w, h, 'wv-bk'); for (let e = fl * 9; e < h; e += fl * 9) g.l(x, y - e, x + w, y - e, 'wv-bkl'); };
  return g;
}

// ---------- 장면 ----------
const S = {};
// 지반조사: 시추 (공통 시추기)
function rig(g, x, q, T, depthPx, label) {
  g.r(x - 26, GY - 16, 52, 16, 'wv-eq', 2); g.tracks(x, GY, 54);
  g.l(x - 4, GY - 16, x - 4, GY - 128, 'wv-mast'); g.l(x + 4, GY - 16, x + 4, GY - 128, 'wv-mast');
  for (let y = GY - 20; y > GY - 128; y -= 12) g.l(x - 4, y, x + 4, y - 12, 'wv-mastl');
  const hy = lerp(GY - 118, GY - 30, (q * 4) % 1);
  g.r(x - 9, hy, 18, 12, 'wv-eqd', 2); g.l(x, hy + 12, x, GY + depthPx, 'wv-rod');
  if (label) g.co(x + 10, hy + 6, x + 48, hy - 6, label);
}
S.bore = (g, q, T, o) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 18], ['wv-s4', 99]]);
  const dp = 8 + q * 36; rig(g, 150, q, T, dp, '회전 헤드');
  for (let i = 0; i < 3; i++) g.c(150 + Math.sin(T * 8 + i) * 2, GY + dp - 2 - i * 4, 1.4, 'wv-drop');
  g.r(146, GY, 8, dp, 'wv-hole'); g.l(150, GY, 150, GY + dp, 'wv-rod');
  const m = g.man(206, GY, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 182, GY - 22, 'wv-tool');
  // 코어 상자 (시료)
  g.r(250, GY - 14, 92, 14, 'wv-wood'); for (let i = 0; i < 5; i++) { const on = q * 6 > i; g.r(254 + i * 17, GY - 11, 14, 8, on ? (i < 2 ? 'wv-s1' : i < 4 ? 'wv-s2' : 'wv-s4') : 'wv-hole'); }
  g.co(296, GY - 14, 300, GY - 40, '코어 상자 (심도별 시료)');
  g.t(14, 20, `심도 ${n1(q * 30)}m`, 'wv-big'); g.t(14, 34, '지층 변화 심도 기록', 'wv-tm');
  g.dim(118, GY, 118, GY + dp, `${n1(q * 30)}m`, -46);
};
S.spt = (g, q, T) => {
  g.ground(GY, [['wv-s1', 12], ['wv-s2', 20], ['wv-s4', 99]]);
  const x = 130, ph = (T * 0.9) % 1, up = ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4, hy = GY - 60 - up * 28;
  g.r(x - 26, GY - 16, 52, 16, 'wv-eq', 2); g.l(x, GY - 16, x, GY - 150, 'wv-mast'); g.l(x - 14, GY - 16, x, GY - 120, 'wv-mastl');
  g.l(x + 2, GY - 150, x + 2, hy, 'wv-rope'); g.r(x - 8, hy, 16, 22, 'wv-hammer', 2); g.r(x - 5, GY - 36, 10, 6, 'wv-eqd');
  g.l(x, GY - 30, x, GY + 34, 'wv-rod'); if (ph > 0.97 || ph < 0.03) g.vib(x, GY - 32, T, 3, 2, 'wv-vib');
  g.dim(x + 26, GY - 60 - 28, x + 26, GY - 60, '76cm', 0); g.co(x - 8, hy + 8, x - 76, hy - 2, '해머 63.5kg', 'end');
  // N값 그래프
  const gx = 250, gy = 34, gw = 170, gh = 150; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 14, 'N값 (30cm 관입 타격 수)', 'wv-gt');
  const N = [4, 6, 9, 14, 22, 31, 45, 50]; const pts = [];
  N.forEach((v, i) => { if (i / N.length > q + 0.05) return; pts.push([gx + 12 + v / 50 * (gw - 30), gy + 26 + i * (gh - 36) / N.length]); });
  if (pts.length > 1) g.pl(pts, 'wv-graph'); pts.forEach(p => g.c(p[0], p[1], 2.4, 'wv-gdot'));
  const cur = N[Math.min(N.length - 1, Math.floor(q * N.length))]; g.t(gx + gw - 8, gy + gh - 8, `N = ${Math.min(cur, Math.floor(cur * ((T * 0.9) % 1 + 0.01) + 1))}`, 'wv-big', 'end');
};
S.cpt = (g, q, T) => {
  g.ground(GY, [['wv-s1', 10], ['wv-sclay', 60], ['wv-s2', 99]]);
  g.r(60, GY - 46, 120, 34, 'wv-trkb', 3); g.r(150, GY - 52, 32, 40, 'wv-eq', 3); g.r(156, GY - 48, 12, 10, 'wv-gls'); [76, 104, 160].forEach(x => g.c(x, GY - 8, 7, 'wv-whl'));
  const dp = 10 + q * 34; g.l(110, GY - 46, 110, GY + dp, 'wv-rod'); g.pg([[106, GY + dp], [114, GY + dp], [110, GY + dp + 6]], 'wv-accf');
  g.co(110, GY + dp + 3, 136, GY + dp + 6, '콘 10cm² · 2cm/s');
  const gx = 240, gy = 22, gw = 180, gh = 168; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 14, '선단저항 qc · 간극수압 u2', 'wv-gt');
  const a = [], b = []; for (let i = 0; i <= 40 * q; i++) { const z = i / 40; const clay = z > 0.15 && z < 0.7; a.push([gx + 14 + (clay ? 14 + 6 * Math.sin(i * 1.3) : 70 + 30 * z + 12 * Math.sin(i)) , gy + 24 + z * (gh - 34)]); b.push([gx + 14 + (clay ? 60 + 40 * z : 20) + 4 * Math.sin(i * 0.7), gy + 24 + z * (gh - 34)]); }
  if (a.length > 1) { g.pl(a, 'wv-graph'); g.pl(b, 'wv-graph2'); }
  g.t(gx + gw - 8, gy + gh - 22, 'qc', 'wv-gt', 'end'); g.t(gx + gw - 8, gy + gh - 8, '연약 점토: qc↓ u2↑', 'wv-gv', 'end');
  void T;
};
S.geo = (g, q, T) => {
  g.ground(GY - 40, [['wv-s1', 14], ['wv-s2', 26], ['wv-s4', 99]]);
  const y0 = GY - 40; const n = 12;
  for (let i = 0; i < n; i++) { const x = 30 + i * 34; if (i / n > q * 1.3) break; g.l(x, y0 - 10, x, y0 + 6, 'wv-rod'); g.c(x, y0 - 10, 2, 'wv-accf'); }
  g.l(30, y0 - 10, 30 + 34 * Math.min(n - 1, Math.floor(q * 1.3 * n)), y0 - 10, 'wv-cab');
  // 비저항 단면 (진행 따라 채움)
  for (let i = 0; i < 24 * q; i++) for (let j = 0; j < 6; j++) { const v = Math.sin(i * 0.5 + j) + (j > 3 ? 1 : 0) - (i > 8 && i < 13 && j > 1 && j < 4 ? 2 : 0); g.r(30 + i * 16, y0 + 8 + j * 12, 16, 12, v < -0.6 ? 'wv-r1' : v < 0.3 ? 'wv-r2' : v < 1 ? 'wv-r3' : 'wv-r4'); }
  if (q > 0.5) g.co(30 + 10.5 * 16, y0 + 38, 250, y0 + 98, '저비저항 이상대 (연약·공동 의심)');
  const m = g.man(380, y0, { dir: -1, pose: 'hold', t: T }); g.r(m.ha[0] - 14, m.ha[1] - 6, 14, 10, 'wv-eqd');
  for (let k = 0; k < 3; k++) { const r = ((T * 0.8 + k / 3) % 1) * 60; g.P(`<path class="wv-wave" d="M${200 - r} ${y0} A ${r} ${r * 0.6} 0 0 0 ${200 + r} ${y0}" opacity="${(1 - r / 60).toFixed(2)}"/>`); }
  g.t(14, 20, '전극 간격 5m · 측선 400m', 'wv-big');
};
S.lab = (g, q, T) => {
  g.r(0, GY, VWW, VHH - GY, 'wv-flr');
  const x = 150; g.r(x - 50, GY - 150, 10, 150, 'wv-st'); g.r(x + 40, GY - 150, 10, 150, 'wv-st'); g.r(x - 50, GY - 160, 100, 14, 'wv-st');
  const press = q < 0.75 ? q / 0.75 : 1; const top = lerp(GY - 140, GY - 100, press);
  g.r(x - 30, GY - 146, 60, top - (GY - 146), 'wv-eqd'); g.r(x - 22, top, 44, 6, 'wv-st');
  const broke = q > 0.78; g.r(x - 14, top + 6, 28, GY - 40 - (top + 6), broke ? 'wv-cbk' : 'wv-c');
  if (broke) { g.pl([[x - 8, top + 10], [x + 2, top + 30], [x - 4, top + 48], [x + 6, GY - 44]], 'wv-crack'); }
  g.r(x - 40, GY - 40, 80, 40, 'wv-eq', 2);
  const load = broke ? 412 : n0(press * 420); g.gauge(240, 40, 180, '하중 (kN)', load, 450, '', false);
  const fc = n1(load * 1000 / (Math.PI * 50 * 50) * 1); g.gauge(240, 80, 180, '압축 강도 (MPa)', +fc, null, '', false);
  g.t(240, 140, broke ? '파괴 → 강도 기록' : '재하 중 (일정 속도)', 'wv-big');
  g.man(330, GY, { dir: -1, pose: 'hold', t: T });
};
S.drain = (g, q, T) => {
  g.ground(GY - 20, [['wv-sand', 16], ['wv-sclay', 99]]);
  const y0 = GY - 20, xs = [50, 90, 130, 170, 210, 250, 290]; const on = Math.floor(q * xs.length);
  xs.forEach((x, i) => { if (i < on) { g.l(x, y0, x, VHH, 'wv-pbd'); for (let k = 0; k < 3; k++) { const yy = VHH - (((T * 0.6 + k / 3 + i * 0.1) % 1) * (VHH - y0)); g.c(x + 3, yy, 1.4, 'wv-drop'); } } });
  const x = xs[Math.min(xs.length - 1, on)], dp = ((q * xs.length) % 1);
  g.r(x - 24, y0 - 14, 48, 14, 'wv-eq', 2); g.tracks(x, y0, 52); g.l(x, y0 - 14, x, y0 - 150, 'wv-mast'); g.l(x, y0 - 120 + dp * 100, x, y0 + dp * (VHH - y0), 'wv-rod2');
  g.co(x + 2, y0 + 20, x + 40, y0 + 34, '맨드릴 속 배수재 (PBD)');
  g.dim(xs[0], y0 - 22, xs[1], y0 - 22, '1.2m');
  g.t(14, 20, `타입 ${on}/${xs.length} · 배수 거리 단축`, 'wv-big'); g.co(380, y0 - 8, 300, y0 - 30, '샌드매트 0.5m', 'end');
};
S.surcharge = (g, q, T) => {
  g.ground(GY - 20, [['wv-sand', 12], ['wv-sclay', 99]]);
  const y0 = GY - 20, h = 60 * ss(0, 0.6, q), set = 16 * ss(0.2, 1, q);
  g.pg([[30, y0 + set * 0.3], [90, y0 - h + set], [300, y0 - h + set], [360, y0 + set * 0.3]], 'wv-soil');
  g.l(200, y0 - h + set, 200, y0 + set, 'wv-rod'); g.r(190, y0 + set - 2, 20, 4, 'wv-accf'); g.co(210, y0 + set, 248, y0 + 26, '침하판');
  if (q < 0.6) g.truck(lerp(420, 300, (T * 0.2) % 1), y0 - h + set + 2, -1, 1);
  const gx = 250, gy = 18, gw = 176, gh = 80; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 13, '침하량 – 시간 (압밀도)', 'wv-gt');
  const pts = []; for (let i = 0; i <= 40 * q; i++) { const t2 = i / 40; pts.push([gx + 10 + t2 * (gw - 20), gy + 22 + (gh - 30) * (1 - Math.exp(-3 * t2))]); } if (pts.length > 1) g.pl(pts, 'wv-graph');
  g.t(gx + gw - 8, gy + gh - 6, `U = ${n0(100 * (1 - Math.exp(-3 * q)))}%`, 'wv-gv', 'end');
  g.t(14, 20, `성토 ${n1(h / 12)}m · 침하 ${n0(set * 30)}mm`, 'wv-big');
};
S.compact = (g, q, T) => {
  g.ground(GY - 20, [['wv-s1', 10], ['wv-sclay', 99]]);
  const y0 = GY - 20; [70, 120, 170].forEach((x, i) => { if (i < Math.floor(q * 3)) { for (let y = y0 + 6; y < VHH; y += 9) g.e(x, y, 7 + Math.sin(y) * 1.5, 5, 'wv-sand'); } });
  const x = 70 + 50 * Math.min(2, Math.floor(q * 3)), p = (q * 3) % 1, dp = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2 * 0.6;
  g.r(x - 26, y0 - 14, 52, 14, 'wv-eq', 2); g.tracks(x, y0, 56); g.l(x, y0 - 14, x, y0 - 160, 'wv-mast'); g.r(x - 9, y0 - 70 + dp * 40, 18, 22, 'wv-hammer', 2);
  g.r(x - 4, y0 - 48 + dp * 40, 8, (VHH - y0) * dp + 48, 'wv-st'); g.vib(x, y0 - 58 + dp * 40, T, 4, 2);
  g.pg([[x + 14, y0 - 150], [x + 34, y0 - 150], [x + 26, y0 - 128], [x + 22, y0 - 128]], 'wv-sand'); g.co(x + 30, y0 - 140, x + 80, y0 - 118, '모래 호퍼');
  g.t(14, 20, '케이싱 관입 → 모래 투입 → 인발·재관입 다짐', 'wv-big'); g.co(220, y0 + 20, 270, y0 + 6, '치환율 30~70%');
};
S.mix = (g, q, T, o) => {
  g.ground(GY - 10, [['wv-s1', 10], ['wv-sclay', 99]]);
  const y0 = GY - 10, cols = [80, 140, 200]; const on = Math.floor(q * 3);
  cols.forEach((x, i) => { if (i < on) g.r(x - 18, y0 + 4, 36, VHH - y0, 'wv-mixc'); });
  const x = cols[Math.min(2, on)], p = (q * 3) % 1, dp = p * (VHH - y0 - 6);
  g.r(x - 30, y0 - 18, 60, 18, 'wv-eq', 2); g.tracks(x, y0, 62); g.l(x, y0 - 18, x, y0 - 170, 'wv-mast');
  g.r(x - 3, y0 - 80, 6, dp + 80, 'wv-st'); g.r(x - 18, y0 + 4, 36, dp, 'wv-mixc2');
  for (let k = 0; k < 4; k++) { const a = T * 9 + k * 1.57; g.l(x, y0 + dp - 4, x + Math.cos(a) * 16, y0 + dp - 4 + Math.sin(a) * 3, 'wv-blade'); }
  g.l(x + 40, y0 - 4, 330, y0 - 4, 'wv-hose'); g.l(x, y0 - 60, x + 40, y0 - 4, 'wv-hose');
  g.r(330, y0 - 70, 30, 66, 'wv-silo', 3); g.co(345, y0 - 50, 300, y0 - 90, '시멘트 사일로 · 플랜트', 'end');
  g.gauge(240, 16, 186, '주입량 (kg/m)', n0(lerp(0, 220, ss(0, 0.2, p))), 200, '', false);
  g.t(14, 20, `개량체 ${on}/3 · 회전 ${n0(20 + 10 * Math.sin(T))}rpm`, 'wv-big');
  void o;
};
S.loadtest = (g, q, T) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 99]]);
  g.r(170, GY, 16, VHH - GY, 'wv-c'); g.r(110, GY - 64, 136, 18, 'wv-st'); [116, 236].forEach(x => g.r(x - 6, GY - 46, 12, 46, 'wv-st'));
  const p = ss(0, 0.9, q); g.r(166, GY - 46, 24, 28, 'wv-eq', 2); g.r(172, GY - 18, 12, 18 - p * 2, 'wv-st');
  g.co(190, GY - 32, 230, GY - 92, '유압 잭 · 하중계'); g.r(196, GY - 6, 10, 6, 'wv-accf'); g.co(206, GY - 4, 260, GY + 20, '변위계 (다이얼)');
  const gx = 270, gy = 20, gw = 156, gh = 120; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 13, '하중 – 침하 곡선', 'wv-gt');
  const pts = []; for (let i = 0; i <= 30 * q; i++) { const t2 = i / 30; pts.push([gx + 12 + t2 * (gw - 24), gy + 24 + (gh - 34) * (0.15 * t2 + 0.85 * Math.pow(t2, 3))]); } if (pts.length > 1) g.pl(pts, 'wv-graph');
  g.t(14, 20, `재하 ${n0(p * 200)}% (설계 하중 대비)`, 'wv-big'); void T;
};
S.pile = (g, q, T, o) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 22], ['wv-s4', 99]]);
  const head = /두부/.test(o.text);
  if (head) {
    [90, 170, 250].forEach((x, i) => { g.r(x - 10, GY - 30 + (i < q * 3 ? 26 : 0), 20, 200, 'wv-c'); if (i < q * 3) for (let k = -2; k <= 2; k++) g.l(x + k * 3.5, GY - 4, x + k * 3.5, GY - 26, 'wv-rbs'); });
    const x = 90 + 80 * Math.min(2, Math.floor(q * 3)); const m = g.man(x + 30, GY, { dir: -1, pose: 'bend', t: T }); g.l(m.ha[0], m.ha[1], x + 10, GY - 26 + Math.sin(T * 30) * 2, 'wv-tool'); g.vib(x + 8, GY - 26, T, 3, 2);
    g.t(14, 20, '말뚝 머리 컷오프 레벨까지 정리 · 철근 노출', 'wv-big'); g.co(x, GY - 12, x - 40, GY - 50, '컷오프 레벨', 'end'); return;
  }
  const x = 160, p = ss(0, 1, q), dp = 20 + p * 30, ph = (T * 1.4) % 1, hm = ph < 0.7 ? ph / 0.7 : 1 - (ph - 0.7) / 0.3;
  g.r(x - 34, GY - 20, 68, 20, 'wv-eq', 2); g.tracks(x, GY, 72); g.r(x - 6, GY - 190, 12, 172, 'wv-mast2');
  const top = GY - 120 + p * 30 - 30; g.r(x - 7, top, 14, GY + dp - top, 'wv-c'); for (let y = top + 40; y < GY + dp; y += 50) g.l(x - 7, y, x + 7, y, 'wv-joint');
  const hy = top - 30 - hm * 20; g.r(x - 10, hy, 20, 30, 'wv-hammer', 2); if (ph > 0.95 || ph < 0.05) { g.vib(x, top, T, 4, 3, 'wv-vib'); }
  g.co(x + 10, hy + 14, x + 52, hy + 4, o.text.includes('SDA') ? 'SDA 오거 + 경타' : '해머'); g.co(x + 7, top + 30, x + 52, top + 40, 'PHC Ø500');
  g.gauge(260, 20, 166, '최종 관입량 (mm/타)', n1(lerp(12, 3, p)), 5, '', p < 0.7);
  g.gauge(260, 58, 166, '소음 (인접 수음점, dB)', n0(lerp(82, 76, p)), 65, '', true);
  g.man(240, GY, { dir: -1, pose: 'hold', t: T });
};
S.bored = (g, q, T, o) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 24], ['wv-s4', 99]]);
  const panel = /하이드로밀|안정액|가이드월|패널/.test(o.text) || o.wpId === 'wall';
  const x = 170, w = panel ? 40 : 30, dp = 10 + q * 34;
  g.r(x - w / 2 - 6, GY - 6, w + 12, 10, 'wv-c'); g.r(x - w / 2, GY, w, dp, 'wv-slurry');
  g.r(x - 50, GY - 22, 100, 22, 'wv-eq', 2); g.tracks(x - 20, GY, 70); g.l(x - 20, GY - 22, x + 4, GY - 170, 'wv-mast'); g.l(x + 4, GY - 170, x, GY - 150, 'wv-rope');
  g.l(x, GY - 150, x, GY + dp - 20, 'wv-rope'); g.r(x - w / 2 + 3, GY + dp - 22, w - 6, 22, 'wv-cutter', 2); for (let k = 0; k < 2; k++) g.c(x - 6 + k * 12, GY + dp - 4, 6, 'wv-wheel'); g.l(x - 6 + Math.cos(T * 8) * 5, GY + dp - 4 + Math.sin(T * 8) * 5, x - 6, GY + dp - 4, 'wv-st');
  g.l(x + w / 2, GY - 2, 300, GY - 2, 'wv-hose'); g.r(300, GY - 40, 60, 38, 'wv-silo', 3); g.co(330, GY - 30, 430, GY - 70, '안정액 플랜트 · 데샌더', 'end');
  g.gauge(240, 16, 186, '안정액 비중', +(1.04 + 0.03 * Math.sin(T * 0.5)).toFixed(2), 1.1, '', false);
  g.t(14, 20, panel ? `패널 굴착 ${n1(q * 30)}m · 폭 2.8m` : `RCD 굴착 ${n1(q * 40)}m`, 'wv-big');
  g.co(x - w / 2, GY + 10, 14, GY + 30, '벤토나이트 안정액 (공벽 유지)');
};
S.cage = (g, q, T) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 99]]);
  const x = 170; g.r(x - 18, GY, 36, VHH - GY, 'wv-slurry'); g.r(x - 24, GY - 6, 48, 8, 'wv-c');
  const y = lerp(GY - 150, GY - 30, ss(0.1, 1, q));
  g.hook(x, 6, y - 8); g.r(x - 12, y, 24, 160, 'wv-cagebg'); for (let yy = y; yy < y + 160; yy += 10) g.l(x - 12, yy, x + 12, yy, 'wv-rbs'); [-12, -4, 4, 12].forEach(k => g.l(x + k, y, x + k, y + 160, 'wv-rb'));
  g.l(x - 12, y, x - 30, 6, 'wv-rope'); g.l(x + 12, y, x + 30, 6, 'wv-rope');
  g.man(240, GY, { dir: -1, pose: 'reach', t: T }); g.man(100, GY, { dir: 1, pose: 'hold', t: T });
  g.co(x + 12, y + 40, 280, y + 30, '철근망 (스페이서 · 피복 75mm)'); g.t(14, 20, '2점 인양 → 수직 세우기 → 삽입', 'wv-big');
};
S.tremie = (g, q, T) => {
  g.ground(GY - 40, [['wv-s1', 14], ['wv-s2', 99]]);
  const y0 = GY - 40, x = 180, bot = VHH - 6, lvl = lerp(bot, y0 + 8, ss(0, 1, q));
  g.r(x - 30, y0, 60, VHH - y0, 'wv-slurry'); g.r(x - 30, lvl, 60, bot - lvl, 'wv-conc'); g.r(x - 26, y0, 52, VHH - y0, 'wv-cagebg');
  const pipeBot = Math.min(bot - 4, lvl + 30); g.r(x - 5, y0 - 70, 10, pipeBot - y0 + 70, 'wv-st'); g.pg([[x - 22, y0 - 96], [x + 22, y0 - 96], [x + 6, y0 - 70], [x - 6, y0 - 70]], 'wv-eq');
  g.dim(x + 40, lvl, x + 40, pipeBot, '묻힘 2m 이상', 6);
  g.truck(330, y0, -1, 0, 'wv-mixer'); g.l(300, y0 - 22, x + 20, y0 - 92, 'wv-hose');
  g.t(14, 20, `수중 타설 ${n0(q * 100)}% · 안정액 회수`, 'wv-big'); g.co(x + 30, y0 + 20, 270, y0 + 40, '밀려 올라오는 안정액'); void T;
};
S.lagging = (g, q, T) => {
  g.r(0, 0, 120, VHH, 'wv-s1'); g.r(120, 0, VWW - 120, VHH, 'wv-pit');
  const dug = lerp(40, 200, q);
  g.r(120, dug, VWW - 120, VHH - dug, 'wv-s2');
  [120, 280].forEach(x => g.r(x - 8, 0, 8, VHH, 'wv-st'));
  for (let y = 10; y < dug - 10; y += 14) { g.r(112, y, 8, 12, 'wv-wood'); }
  const ny = Math.floor((dug - 10) / 14) * 14 + 10; const m = g.man(170, dug, { dir: -1, pose: 'hold', t: T }); g.r(m.ha[0] - 32, m.ha[1] - 4, 30, 10, 'wv-wood');
  g.co(116, ny - 10, 140, ny + 34, '토류판 80mm'); g.co(120, 52, 150, 62, 'H형강 1.8m 간격');
  g.excav(340, dug, -1, 0.9 + 0.2 * Math.sin(T), 1.2, true); g.t(260, 20, `굴착 GL−${n1(q * 8)}m`, 'wv-big');
};
S.anchor = (g, q, T, o) => {
  g.r(0, 0, 140, VHH, 'wv-s2'); g.r(140, 0, VWW - 140, VHH, 'wv-pit'); g.r(132, 0, 10, VHH, 'wv-c'); g.r(140, 150, VWW - 140, 90, 'wv-s2');
  const ang = 0.35, L = 150 * ss(0, 0.55, q), x0 = 136, y0 = 80;
  const ex = x0 - Math.cos(ang) * L, ey = y0 + Math.sin(ang) * L; g.l(x0, y0, ex, ey, 'wv-tendon');
  if (q > 0.35) { const gl = lerp(0, 60, ss(0.35, 0.65, q)); g.l(x0 - Math.cos(ang) * (150 - gl), y0 + Math.sin(ang) * (150 - gl), x0 - Math.cos(ang) * 150, y0 + Math.sin(ang) * 150, 'wv-grout'); g.co(x0 - Math.cos(ang) * 125, y0 + Math.sin(ang) * 125, 30, 200, '정착장 (그라우트)'); }
  g.r(150, 140, 120, 10, 'wv-c'); g.r(170, 120, 70, 20, 'wv-eq', 2); g.l(170, 120, x0 + 10, y0 + 4, 'wv-mast');
  if (q > 0.7) { g.r(140, y0 - 12, 40, 24, 'wv-jack', 3); g.l(180, y0, 200, y0, 'wv-hose'); g.gauge(250, 20, 176, '긴장력 (kN, 확인 시험)', n0(lerp(0, 600, ss(0.7, 1, q))), 600, '', false); g.co(160, y0 - 12, 210, y0 - 40, '유압 잭 · 정착구'); }
  g.man(260, 140, { dir: -1, pose: 'hold', t: T });
  g.t(14, 20, o.text.includes('네일') ? '네일 천공 → 철근 삽입 → 그라우팅' : `앵커 ${n0(150 * ss(0, 0.55, q) / 10)}m 천공 · 각도 20°`, 'wv-big');
};
S.strut = (g, q, T) => {
  g.r(0, 0, 40, VHH, 'wv-s2'); g.r(VWW - 40, 0, 40, VHH, 'wv-s2'); g.r(40, 0, VWW - 80, VHH, 'wv-pit'); g.r(36, 0, 10, VHH, 'wv-c'); g.r(VWW - 46, 0, 10, VHH, 'wv-c'); g.r(46, 200, VWW - 92, 40, 'wv-s2');
  g.r(46, 60, 14, 22, 'wv-st'); g.r(VWW - 60, 60, 14, 22, 'wv-st');
  const y = lerp(10, 64, ss(0, 0.55, q)); g.hook(VWW / 2, 0, y - 10); g.r(60, y, VWW - 120, 14, 'wv-hbeam'); g.l(60, y + 7, VWW - 60, y + 7, 'wv-hweb');
  if (q > 0.55) { g.r(VWW / 2 + 40, y - 4, 30, 22, 'wv-jack', 3); g.gauge(110, 120, 220, '선행하중 (설계 축력 대비)', n0(lerp(0, 50, ss(0.6, 1, q))), 50, '%', false); }
  g.r(VWW / 2 - 2, y + 14, 4, 200 - y - 14, 'wv-st'); g.co(VWW / 2, 150, VWW / 2 + 30, 170, '중간 말뚝');
  g.man(100, 200, { dir: 1, pose: 'reach', t: T }); g.man(340, 200, { dir: -1, pose: 'hold', t: T });
  g.co(53, 70, 80, 110, '띠장'); g.t(14, 20, '띠장 → 버팀보 인양·거치 → 잭 선행하중', 'wv-big');
};
S.slope = (g, q, T) => {
  g.pg([[0, 40], [140, 40], [300, 200], [VWW, 200], [VWW, VHH], [0, VHH]], 'wv-s2'); g.r(0, 0, VWW, 40, 'wv-sky0');
  const cov = ss(0, 1, q); g.pl([[140, 40], [140 + 160 * cov, 40 + 160 * cov]], 'wv-shot');
  const nx = 140 + 160 * cov, ny = 40 + 160 * cov; const m = g.man(nx + 50, Math.min(200, ny + 30), { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], nx + 6, ny - 4, 'wv-hose');
  g.drops(nx - 4, ny - 10, 14, 14, T, 8, 'wv-cdrop'); g.co(220, 120, 260, 90, '숏크리트 + 와이어메시'); g.dim(140, 210, 300, 210, '1 : 1.0', 0);
  g.t(14, 20, '사면 보호 · 배수로', 'wv-big');
};
S.grout = (g, q, T) => {
  g.ground(GY - 60, [['wv-s1', 14], ['wv-s2', 99]]);
  const y0 = GY - 60; [80, 130, 180, 230].forEach((x, i) => { g.l(x, y0 - 6, x, VHH - 10, 'wv-rod'); const r = 26 * ss(i / 4, i / 4 + 0.35, q); if (r > 1) for (let y = y0 + 30; y < VHH - 10; y += 24) g.c(x, y, r * (0.7 + 0.3 * Math.sin(y)), 'wv-groutb'); });
  g.r(300, y0 - 40, 70, 36, 'wv-eq', 3); g.l(300, y0 - 20, 80, y0 - 6, 'wv-hose'); g.co(335, y0 - 30, 330, y0 - 60, '그라우트 펌프');
  g.gauge(240, 14, 186, '주입압 (MPa)', +(0.4 + 0.15 * Math.sin(T)).toFixed(2), 1.0, '', false);
  g.t(14, 20, '이중관 주입 · 겔 타임 관리', 'wv-big'); g.co(130, y0 + 60, 200, y0 + 80, '차수 고결체');
};
S.dewater = (g, q, T) => {
  g.ground(GY - 90, [['wv-s1', 12], ['wv-sand', 99]]);
  const y0 = GY - 90, x = 140, dd = 50 * ss(0, 1, q), wl = y0 + 30;
  const pts = []; for (let X = 0; X <= VWW; X += 8) pts.push([X, wl + dd * Math.exp(-Math.abs(X - x) / 90)]); g.pl(pts, 'wv-wtab'); g.pg([...pts, [VWW, VHH], [0, VHH]], 'wv-wat');
  g.r(x - 6, y0 - 10, 12, VHH - y0, 'wv-well'); g.r(x - 5, VHH - 40, 10, 22, 'wv-eqd'); g.l(x, VHH - 40, x, y0 - 10, 'wv-pipe');
  g.l(x, y0 - 10, 300, y0 - 10, 'wv-pipe'); g.r(300, y0 - 34, 70, 30, 'wv-tank', 3); g.drops(310, y0 - 34, 50, 26, T, 10);
  g.co(335, y0 - 20, 340, y0 - 50, '침사조 · 유량계'); g.co(x + 6, VHH - 30, 200, VHH - 20, '수중 펌프');
  g.t(14, 20, `수위 저하 ${n1(dd / 10)}m`, 'wv-big'); g.t(14, 34, '주변 지표 침하 계측 병행', 'wv-tm');
};
S.dig = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-pit'); const lv = lerp(110, 200, q);
  g.r(0, lv, VWW, VHH - lv, 'wv-s2'); g.r(0, 0, 18, VHH, 'wv-c'); g.l(18, 60, 300, 60, 'wv-strutl');
  const sw = Math.sin(T * 1.2), k = g.excav(150, lv, 1, 0.7 + 0.35 * sw, 1.3 - 0.4 * sw, sw > 0);
  g.pg([[k[0] - 6, lv], [k[0] + 14, lv], [k[0] + 4, lv - 6]], 'wv-soil');
  g.truck(360, 60, -1, 0.5 + 0.5 * ((T * 0.1) % 1)); g.r(290, 60, 150, 6, 'wv-c');
  g.co(30, lv, 60, lv + 20, `굴착면 GL−${n1(lerp(4, 9, q))}m`); g.dim(330, 66, 330, lv, '지보 아래 0.5m까지', 0);
  g.t(14, 20, '단계별 굴착 (2~3m) → 지보 → 다음 단', 'wv-big');
  g.man(260, lv, { dir: -1, pose: 'stand', t: T, vest: 'wv-mvs' }); g.t(244, lv - 44, '유도자', 'wv-cl');
};
S.clam = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-pit'); g.r(0, 200, VWW, 40, 'wv-s2'); g.r(0, 60, 120, 8, 'wv-c'); g.r(300, 60, 140, 8, 'wv-c');
  const ph = (T * 0.25) % 1, y = 60 + Math.sin(ph * Math.PI) * 130; g.r(70, 30, 40, 30, 'wv-eq', 2); g.l(90, 30, 210, 6, 'wv-mast'); g.hook(210, 6, y - 6);
  const open = ph < 0.45 || ph > 0.9 ? 1 : 0.2; g.pg([[200 - 10 * open, y], [220 + 10 * open, y], [214, y + 18], [206, y + 18]], 'wv-eq');
  g.truck(380, 60, -1, ph > 0.9 ? 1 : 0.4); g.t(14, 20, '클램셸 수직 양중 (깊은 구간)', 'wv-big'); g.co(210, 120, 260, 140, '양중 경로 아래 출입 금지'); void q;
};
S.haul = (g, q, T) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 99]]);
  g.r(100, GY - 4, 120, 6, 'wv-wash'); [110, 150, 190].forEach(x => g.l(x, GY - 2, x - 8, GY - 20, 'wv-spray')); g.drops(100, GY - 30, 120, 26, T, 14);
  const x = lerp(-40, 480, (T * 0.07) % 1); g.truck(x, GY, 1, 1); g.r(x - 30, GY - 34, 40, 4, 'wv-tarp');
  g.r(300, GY - 70, 6, 70, 'wv-st'); g.man(340, GY, { dir: -1, pose: 'swing', t: T, vest: 'wv-mvs' }); g.co(340, GY - 50, 380, GY - 80, '신호수');
  g.co(160, GY, 180, GY + 24, '세륜기 (바퀴·하부 세척)'); g.t(14, 20, `반출 ${n0(q * 64)}대 / 일`, 'wv-big'); g.t(14, 34, '적재함 덮개 · 과적 금지 · 도로 청소', 'wv-tm');
};
S.blast = (g, q, T) => {
  g.r(0, 0, VWW, 80, 'wv-pit'); g.r(0, 80, VWW, VHH - 80, 'wv-rock');
  const holes = [80, 120, 160, 200, 240]; holes.forEach((x, i) => { if (q > 0.1 + i * 0.05) { g.r(x - 3, 80, 6, 60, 'wv-hole'); if (q > 0.4) g.r(x - 3, 110, 6, 30, 'wv-charge'); } });
  if (q > 0.5) g.r(60, 70, 200, 10, 'wv-mat');
  const fl = q > 0.7 && q < 0.78; if (fl) { g.c(160, 110, 60, 'wv-flash'); }
  if (q > 0.7) g.vib(160, 110, T, 10, 3, 'wv-vib');
  if (q < 0.4) { g.r(300, 50, 60, 30, 'wv-eq', 2); g.tracks(330, 80, 64); g.l(320, 50, 300, -10, 'wv-mast'); }
  const gx = 280, gy = 110, gw = 150, gh = 70; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 13, '진동 PPV (인접 건물)', 'wv-gt');
  const pts = []; for (let i = 0; i < 60; i++) { const t2 = i / 60, a = q > 0.7 ? Math.exp(-(t2 - 0.3) * (t2 - 0.3) * 60) * Math.sin(i * 1.7) * 22 : Math.sin(i * 2.1) * 1.5; pts.push([gx + 8 + t2 * (gw - 16), gy + 42 + a]); } g.pl(pts, 'wv-graph');
  g.t(gx + gw - 8, gy + gh - 6, q > 0.7 ? '0.21cm/s / 허용 0.3' : '대기', 'wv-gv', 'end');
  g.t(14, 20, q < 0.4 ? '천공 · 장약 (지발 뇌관)' : q < 0.7 ? '방호 매트 · 경계 대피' : '발파 → 진동 계측', 'wv-big');
};
S.split = (g, q, T) => {
  g.r(0, 0, VWW, 80, 'wv-pit'); g.r(0, 80, VWW, VHH - 80, 'wv-rock');
  const x = 180; g.r(x - 4, 80, 8, 70, 'wv-hole'); g.r(x - 3, 70, 6, 60 + q * 10, 'wv-st'); g.r(x - 18, 50, 36, 22, 'wv-eq', 3);
  const c = ss(0.2, 1, q); [[-1, 0.4], [1, 0.3], [-1, 1.2], [1, 1.1]].forEach(([d, a]) => g.pl([[x, 110], [x + d * 40 * c, 110 + a * 30 * c], [x + d * 80 * c, 120 + a * 40 * c]], 'wv-crack'));
  g.man(250, 80, { dir: -1, pose: 'hold', t: T }); g.l(230, 60, 198, 60, 'wv-hose');
  g.excav(360, 80, -1, 0.5, 1.6); g.vib(310, 92, T, 3, 2); g.co(306, 94, 290, 140, '브레이커 2차 파쇄', 'end');
  g.t(14, 20, '쐐기 할암 (무진동) → 균열 유도', 'wv-big');
};
// 골조
function slabScene(g, y = 150) { g.r(0, y, VWW, 12, 'wv-c'); g.r(0, y + 12, VWW, VHH - y - 12, 'wv-room'); for (let x = 30; x < VWW; x += 70) g.r(x - 5, y + 12, 10, VHH - y - 12, 'wv-c'); }
S.rebar = (g, q, T, o) => {
  const t = o.text;
  if (/가공장|절단|절곡|자동 절단/.test(t)) {
    g.r(0, GY, VWW, 44, 'wv-flr'); g.r(110, GY - 40, 120, 40, 'wv-eq', 3); g.c(170, GY - 46, 12, 'wv-st'); const a = Math.min(1, ((T * 0.5) % 1) * 1.6) * 1.57; g.l(60, GY - 46, 170, GY - 46, 'wv-rb'); g.l(170, GY - 46, 170 + Math.cos(-a) * 50, GY - 46 + Math.sin(-a) * 50, 'wv-rb');
    for (let i = 0; i < 6; i++) g.pl([[260 + i * 4, GY - 4 - i * 3], [300 + i * 4, GY - 4 - i * 3], [300 + i * 4, GY - 30 - i * 3]], 'wv-rbs');
    g.man(90, GY, { dir: 1, pose: 'hold', t: T }); g.co(170, GY - 46, 220, GY - 90, /BIM|자동/.test(t) ? 'BIM 데이터 자동 절곡' : '절곡기 (90°·135° 갈고리)'); g.t(14, 20, `가공 ${n0(q * 100)}% · 부재 태그`, 'wv-big'); return;
  }
  if (/커플러|이음|SD600/.test(t)) {
    g.r(0, 0, VWW, VHH, 'wv-room'); g.r(150, 0, 60, VHH, 'wv-colbg'); [160, 175, 190, 200].forEach(x => { g.l(x, 0, x, 110, 'wv-rb'); g.l(x, 130, x, VHH, 'wv-rb'); g.r(x - 5, 106, 10, 28, 'wv-coup'); });
    const m = g.man(260, 200, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 205, 120, 'wv-tool'); g.c(205, 120, 5 + Math.sin(T * 10), 'wv-dot');
    g.co(200, 118, 300, 60, '나사 커플러 · 토크 확인'); g.t(14, 20, '겹침 이음 대신 기계식 이음', 'wv-big'); g.t(14, 34, 'SD600 · 철근량 15~20%↓', 'wv-tm'); return;
  }
  slabScene(g, 150);
  const n = Math.floor(lerp(4, 20, q)); for (let i = 0; i < n; i++) g.l(20 + i * 21, 142, 20 + i * 21, 148, 'wv-rbx');
  g.l(10, 145, 10 + Math.min(1, q * 1.4) * 420, 145, 'wv-rb'); g.l(10, 139, 10 + Math.min(1, q * 1.2) * 420, 139, 'wv-rb');
  for (let x = 30; x < 20 + n * 21; x += 42) g.r(x - 3, 146, 6, 4, 'wv-spacer');
  const wx = 20 + n * 21; const m = g.man(wx, 150, { dir: 1, pose: 'bend', t: T }); g.l(m.ha[0], m.ha[1], m.ha[0] + 4, 140 + Math.sin(T * 12) * 2, 'wv-tool');
  g.man(wx - 90, 150, { dir: 1, pose: /메시|철망/.test(t) ? 'hold' : 'bend', t: T + 1 });
  g.co(60, 148, 90, 196, '스페이서 (피복 20mm)'); g.co(160, 139, 200, 110, '상부근 D13@200'); g.co(240, 145, 300, 186, '하부근');
  g.t(14, 20, `배근 ${n0(q * 100)}% · 결속`, 'wv-big'); g.t(14, 34, '검측: 지름·간격·피복·이음 길이', 'wv-tm');
};
S.form = (g, q, T, o) => {
  const t = o.text;
  if (/ACS|자동상승|유압 잭|거폼|코어 벽/.test(t)) {
    g.r(150, 60, 140, VHH - 60, 'wv-c'); g.r(150, 60, 140, VHH - 60, 'wv-hatch');
    const up = ss(0.2, 0.9, q) * 40; [[118, 1], [292, -1]].forEach(([x]) => { g.r(x, 20 - up, 30, 130, 'wv-acs'); for (let k = 0; k < 4; k++) g.r(x - 6, 30 - up + k * 32, 42, 4, 'wv-st'); g.r(x + 10, 150 - up, 10, 40, 'wv-jack'); });
    g.man(128, 54 - up, { dir: 1, pose: 'stand', t: T, s: 0.8 }); g.co(300, 100 - up, 360, 80, '유압 잭 상승 (크레인 불필요)'); g.t(14, 20, `ACS 1개 층 상승 ${n0(up / 40 * 100)}%`, 'wv-big'); return;
  }
  if (/갱폼|대형 거푸집|인양/.test(t)) {
    g.r(80, 40, 220, VHH - 40, 'wv-room'); for (let y = 40; y < VHH; y += 60) g.r(80, y, 220, 8, 'wv-c');
    const y = lerp(80, 20, ss(0.1, 0.8, q)); g.r(300, y, 18, 110, 'wv-gang'); for (let k = 0; k < 3; k++) g.r(318, y + 12 + k * 34, 26, 4, 'wv-st'); g.l(344, y + 10, 344, y + 110, 'wv-rail'); g.hook(310, 0, y - 6);
    g.man(330, y + 46, { dir: -1, pose: 'stand', t: T, s: 0.8 }); g.co(318, y + 60, 380, y + 120, '작업 발판 · 안전 난간 일체'); g.t(14, 20, '갱폼 한 층 인양', 'wv-big'); return;
  }
  if (/데크|골강판/.test(t)) {
    g.r(0, 130, VWW, 14, 'wv-hbeam'); g.r(0, 144, VWW, VHH - 144, 'wv-room'); for (let x = 40; x < VWW; x += 120) g.r(x - 6, 144, 12, VHH - 144, 'wv-st');
    const L = 420 * ss(0, 0.9, q); const pts = []; for (let x = 10; x < 10 + L; x += 10) pts.push([x, 130 - ((x / 10) % 2) * 6]); if (pts.length > 1) g.pl(pts, 'wv-deck');
    g.man(20 + L, 130, { dir: 1, pose: 'bend', t: T }); g.co(200, 126, 240, 90, '골강판 (지주 없이 철근·타설)'); g.t(14, 20, `데크 깔기 ${n0(q * 100)}%`, 'wv-big'); return;
  }
  // 재래식·알루미늄: 동바리 + 거푸집 패널
  g.r(0, 200, VWW, 40, 'wv-c'); const al = /알루미늄/.test(t) || o.optId === 'alform';
  const nP = Math.floor(lerp(2, 12, ss(0, 0.6, q)));
  for (let i = 0; i < nP; i++) { const x = 20 + i * 36; g.l(x, 200, x, 112, 'wv-prop'); g.l(x - 6, 200, x + 6, 200, 'wv-prop'); }
  if (q > 0.3) g.l(20, 160, 20 + (nP - 1) * 36, 160, 'wv-propl');
  const nk = Math.floor(lerp(0, 12, ss(0.3, 1, q))); for (let i = 0; i < nk; i++) g.r(10 + i * 36, 100, 34, 10, al ? 'wv-alu' : 'wv-ply');
  g.r(10, 40, 10, 60, al ? 'wv-alu' : 'wv-ply'); g.r(10, 30, 10, 10, 'wv-st');
  const m = g.man(30 + nk * 36, 200, { dir: 1, pose: 'reach', t: T }); void m;
  g.dim(56, 112, 56, 200, '층고', 0); g.co(92, 160, 140, 182, '수평 연결재 (2m 이내)'); g.co(200, 104, 240, 70, al ? '알루미늄 패널 (300회 전용)' : '합판 12mm + 각재');
  g.t(14, 20, `거푸집 ${n0(q * 100)}%`, 'wv-big');
};
S.pour = (g, q, T, o) => {
  const t = o.text;
  if (/버킷/.test(t)) { slabScene(g, 160); const y = 40 + Math.abs(Math.sin(T * 0.4)) * 80; g.hook(200, 0, y - 6); g.pg([[184, y], [216, y], [206, y + 26], [194, y + 26]], 'wv-eq'); if (y > 110) g.drops(196, y + 26, 8, 30, T, 6, 'wv-cdrop'); g.t(14, 20, '크레인 버킷 왕복 타설', 'wv-big'); return; }
  slabScene(g, 160); const lvl = ss(0, 1, q);
  g.r(10, 150, 420 * lvl, 10, 'wv-conc'); for (let x = 20; x < 420; x += 21) g.l(x, 152, x, 156, 'wv-rbx');
  const nx = 10 + 420 * lvl; g.pl([[nx, 150], [nx + 6, 70], [nx + 70, 30], [VWW, 20]], 'wv-boom'); g.r(nx - 3, 120, 6, 30, 'wv-hose'); g.drops(nx - 4, 140, 8, 12, T, 5, 'wv-cdrop');
  const m = g.man(nx - 30, 150, { dir: 1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], nx - 12, 156 + Math.sin(T * 30), 'wv-vibr'); g.vib(nx - 12, 156, T, 2, 2);
  g.man(nx + 26, 150, { dir: -1, pose: 'bend', t: T + 1 }); g.man(nx - 80, 150, { dir: 1, pose: 'bend', t: T + 2 });
  g.co(nx - 12, 158, nx - 70, 196, '진동기 0.5m 간격', 'middle'); g.co(nx + 6, 70, nx + 50, 90, '붐 · 호스');
  g.gauge(260, 14, 166, '타설량 (㎥)', n0(lvl * 420), 420, '', false);
  g.t(14, 20, `타설 ${n0(lvl * 100)}%`, 'wv-big'); g.t(14, 34, '슬럼프 150±25mm · 이어치기 2h 이내', 'wv-tm');
};
S.cure = (g, q, T, o) => {
  slabScene(g, 150); g.r(0, 138, VWW, 12, 'wv-conc');
  const cov = ss(0, 0.4, q); g.r(0, 132, 440 * cov, 6, /보온|동절기|가열|열풍/.test(o.text) ? 'wv-blanket' : 'wv-wetc');
  if (/보온|동절기|가열|열풍/.test(o.text)) { g.r(40, 60, 360, 72, 'wv-tent'); [100, 300].forEach(x => { g.r(x - 12, 112, 24, 20, 'wv-eq', 3); g.c(x, 106, 6 + Math.sin(T * 6), 'wv-glow'); }); g.co(100, 112, 140, 80, '열풍기 (5℃ 이상 유지)'); }
  else g.drops(20, 100, 400, 32, T, 16);
  const gx = 250, gy = 14, gw = 176, gh = 92; g.r(gx, gy, gw, gh, 'wv-panel', 3); g.t(gx + 8, gy + 13, '온도 (내부·표면) / 강도', 'wv-gt');
  const a = [], b = [], c2 = []; for (let i = 0; i <= 40 * q; i++) { const t2 = i / 40; a.push([gx + 10 + t2 * (gw - 20), gy + gh - 10 - (gh - 30) * (0.3 + 0.6 * t2 * Math.exp(-2.5 * t2) * 4.5 * 0.5)]); b.push([gx + 10 + t2 * (gw - 20), gy + gh - 10 - (gh - 30) * (0.3 + 0.25 * t2 * Math.exp(-2 * t2) * 3)]); c2.push([gx + 10 + t2 * (gw - 20), gy + gh - 10 - (gh - 30) * (t2 / (t2 + 0.15))]); }
  if (a.length > 1) { g.pl(a, 'wv-graph2'); g.pl(b, 'wv-graph3'); g.pl(c2, 'wv-graph'); }
  g.t(gx + gw - 8, gy + gh - 4, `강도 ${n0(q * 30)}MPa`, 'wv-gv', 'end');
  g.c(200, 144, 3, 'wv-accf'); g.co(200, 144, 160, 196, '무선 온도 센서', 'middle');
  g.t(14, 20, q < 0.85 ? `양생 ${n0(q * 7)}일차` : '탈형 (측면 5MPa 이상 확인)', 'wv-big');
};
S.mixdesign = (g, q, T, o) => {
  g.r(0, GY, VWW, 44, 'wv-flr');
  const M = /고로슬래그|탄소/.test(o.text) ? [['시멘트', 220, 'wv-mc'], ['고로슬래그', 160, 'wv-mslag'], ['물', 165, 'wv-mw'], ['모래', 780, 'wv-msand'], ['자갈', 950, 'wv-mgrav']] : /실리카퓸|고강도/.test(o.text) ? [['시멘트', 520, 'wv-mc'], ['실리카퓸', 50, 'wv-mslag'], ['물', 150, 'wv-mw'], ['모래', 680, 'wv-msand'], ['자갈', 900, 'wv-mgrav']] : /저열|플라이애시/.test(o.text) ? [['저열 시멘트', 300, 'wv-mc'], ['플라이애시', 80, 'wv-mslag'], ['물', 165, 'wv-mw'], ['모래', 800, 'wv-msand'], ['자갈', 960, 'wv-mgrav']] : [['시멘트', 340, 'wv-mc'], ['물', 175, 'wv-mw'], ['모래', 800, 'wv-msand'], ['자갈', 960, 'wv-mgrav']];
  const tot = M.reduce((s, m) => s + m[1], 0); let x = 20; g.t(20, 30, '배합 (kg/㎥)', 'wv-gt');
  M.forEach(([nm, v, c]) => { const w = 400 * v / tot * ss(0, 0.6, q); g.r(x, 38, w, 26, c); if (w > 36) { g.t(x + 4, 52, nm, 'wv-gt'); g.t(x + 4, 62, `${v}`, 'wv-gv'); } x += w; });
  // 슬럼프 시험
  const sx = 120, cone = q < 0.65; if (cone) g.pg([[sx - 14, GY - 60], [sx + 14, GY - 60], [sx + 30, GY], [sx - 30, GY]], 'wv-st'); else { const sl = /고유동|다짐 없이/.test(o.text) ? 1 : 0.4; g.e(sx, GY - 6, 40 + 60 * sl, 8, 'wv-conc'); g.pg([[sx - 30, GY - 6], [sx + 30, GY - 6], [sx + 12, GY - 60 + 15 + 30 * (1 - sl)], [sx - 12, GY - 60 + 15 + 30 * (1 - sl)]], 'wv-conc'); }
  g.dim(sx + 60, GY - 60, sx + 60, GY - 45, cone ? '' : /고유동|다짐 없이/.test(o.text) ? '플로 650mm' : '슬럼프 150mm', 0);
  g.man(220, GY, { dir: -1, pose: 'hold', t: T });
  g.r(280, GY - 50, 10, 50, 'wv-c'); g.r(296, GY - 50, 10, 50, 'wv-c'); g.r(312, GY - 50, 10, 50, 'wv-c'); g.co(300, GY - 50, 340, GY - 90, '공시체 (7·28일 강도)');
  g.t(14, 20, cone ? '받아들이기 검사' : '슬럼프·공기량 확인', 'wv-big');
};
S.steel = (g, q, T, o) => {
  const t = o.text; g.r(0, 0, VWW, VHH, 'wv-sky0');
  [100, 300].forEach(x => g.r(x - 8, 60, 16, VHH - 60, 'wv-hcol'));
  g.r(0, VHH - 20, VWW, 20, 'wv-c');
  if (/용접|로봇/.test(t)) { const x = 300, y = 110; g.r(x - 10, y - 2, 20, 4, 'wv-weld'); if (/로봇/.test(t)) { g.r(x + 12, y - 30, 30, 50, 'wv-eq', 3); g.l(x + 12, y - 10, x + 6, y, 'wv-arm2'); g.co(x + 42, y - 20, x + 60, y - 50, '레일 주행 용접 로봇'); } else { const m = g.man(x + 40, 150, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], x + 8, y, 'wv-tool'); g.r(m.head[0] - 6, m.head[1] - 3, 9, 7, 'wv-eqd'); }
    g.spark(x + 6, y, T); g.t(14, 20, `기둥 이음 용접 ${n0(q * 100)}%`, 'wv-big'); g.co(x - 10, y, 200, y + 30, '완전 용입 · 예열', 'end'); if (q > 0.6) g.gauge(20, 180, 200, '초음파 검사 (결함)', 0, null, '건', false); return; }
  if (/UT|초음파/.test(t)) { g.r(292, 108, 16, 4, 'wv-weld'); const m = g.man(340, 150, { dir: -1, pose: 'hold', t: T }); g.r(305, 104 + Math.sin(T * 3) * 6, 8, 8, 'wv-eqd'); g.l(m.ha[0], m.ha[1], 310, 108, 'wv-cab'); g.r(380, 90, 50, 36, 'wv-panel', 3); const pts = []; for (let i = 0; i < 40; i++) pts.push([384 + i, 118 - (i === 12 ? 18 : i === 30 ? 10 : Math.random() * 3)]); g.pl(pts, 'wv-graph'); g.t(14, 20, '용접부 초음파 탐상 (전수)', 'wv-big'); return; }
  if (/수직도|토털스테이션/.test(t)) { g.r(380, 170, 20, 30, 'wv-eqd'); g.l(390, 170, 390, 140, 'wv-st'); g.r(382, 128, 16, 12, 'wv-eq', 2); g.l(390, 134, 108, 70 + Math.sin(T) * 2, 'wv-laser'); g.t(14, 20, '수직도 1/1000 자동 계측', 'wv-big'); g.co(108, 70, 150, 40, '반사 타깃'); return; }
  if (/내화|뿜칠|도료/.test(t)) { const c = ss(0, 1, q); g.r(92, 60 + (1 - c) * 160, 16, c * 160, 'wv-fp'); const m = g.man(150, 200, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 112, 60 + (1 - c) * 160, 'wv-hose'); g.drops(108, 50 + (1 - c) * 160, 20, 20, T, 8, 'wv-fpd'); g.t(14, 20, '내화 피복 (두께 핀 측정)', 'wv-big'); return; }
  // 세우기·볼트
  const y = lerp(10, 60, ss(0, 0.5, q)); g.hook(200, 0, y - 6); g.r(108, y, 184, 14, 'wv-hbeam');
  const bolt = /볼트/.test(t) || q > 0.5; if (bolt) { [118, 282].forEach(x => { for (let k = 0; k < 3; k++) g.c(x, y + 3 + k * 4, 1.8, q > 0.75 ? 'wv-boltok' : 'wv-bolt'); }); const m = g.man(268, 60, { dir: -1, pose: 'hold', t: T, s: 0.9 }); g.l(m.ha[0], m.ha[1], 282, y + 7, 'wv-tool'); g.l(268, 30, 300, 20, 'wv-lanyard'); }
  g.co(200, y + 14, 230, y + 60, q > 0.75 ? '본조임 완료 (마킹 확인)' : '가볼트 → 정렬 → 본조임'); g.t(14, 20, '철골 보 거치 · 고력볼트 접합', 'wv-big');
};
S.fireproof = (g, q, T, o) => S.steel(g, q, T, { ...o, text: '내화 ' + o.text });
S.precast = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-sky0'); g.r(0, 200, VWW, 40, 'wv-c'); [80, 360].forEach(x => g.r(x - 10, 110, 20, 90, 'wv-pc'));
  const mod = /모듈|적층|유닛/.test(o.text); const y = lerp(0, mod ? 80 : 96, ss(0, 0.6, q));
  g.hook(220, 0, y - 6); if (mod) { g.r(100, y, 240, 110, 'wv-mod'); for (let x = 120; x < 340; x += 50) g.r(x, y + 20, 30, 40, 'wv-gls'); g.l(100, y, 220, y - 6, 'wv-rope'); g.l(340, y, 220, y - 6, 'wv-rope'); }
  else { g.r(80, y, 280, 14, 'wv-pc'); for (let x = 90; x < 350; x += 28) g.c(x, y + 7, 4, 'wv-hcs'); }
  if (q > 0.6) { g.man(60, 200, { dir: 1, pose: 'reach', t: T }); g.man(380, 200, { dir: -1, pose: 'reach', t: T }); g.co(360, mod ? y + 110 : y + 14, 400, 150, '레벨 조정 심 · 그라우트'); }
  g.t(14, 20, mod ? '모듈 적층 · 연결' : 'PC 부재 거치 · 접합', 'wv-big'); g.t(14, 34, '설치 오차 ±5mm', 'wv-tm');
};
S.lift = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-sky0'); g.r(0, 220, VWW, 20, 'wv-c');
  const tele = /텔레스코핑|클라이밍|마스트/.test(o.text);
  g.r(110, 40, 16, 180, 'wv-mastt'); for (let y = 40; y < 220; y += 16) g.l(110, y, 126, y + 16, 'wv-mastl');
  if (tele) { const up = ss(0.1, 0.9, q) * 16; g.r(104, 70 - up, 28, 30, 'wv-acs'); g.r(110, 70 - up + 30, 16, 16, 'wv-st'); g.co(132, 80, 180, 110, '텔레스코핑 케이지 · 마스트 1단 삽입'); }
  const sl = Math.sin(T * 0.2); g.r(40, 30, 340, 8, 'wv-jib'); g.r(40, 38, 40, 14, 'wv-cwt'); g.r(126, 38, 20, 16, 'wv-gls');
  const tx = lerp(170, 340, 0.5 + 0.5 * sl), hy = lerp(200, 80, ss(0, 0.6, q)); g.r(tx - 6, 38, 12, 6, 'wv-eqd'); g.hook(tx, 44, hy - 6); g.r(tx - 30, hy, 60, 18, 'wv-st');
  g.l(tx - 30, hy, tx, hy - 6, 'wv-rope'); g.l(tx + 30, hy, tx, hy - 6, 'wv-rope'); g.co(tx + 30, hy + 4, tx + 30, hy + 40, '줄걸이 60° 이하');
  g.man(400, 220, { dir: -1, pose: 'swing', t: T, vest: 'wv-mvs' }); g.t(370, 170, '신호수', 'wv-cl');
  g.gauge(240, 196 - 160, 186, '정격 하중 대비', n0(lerp(40, 82, q)), 100, '%', false); g.t(14, 20, '인양 → 선회 → 설치 위치', 'wv-big');
};
S.hoist = (g, q, T) => {
  g.r(0, 0, 200, VHH, 'wv-room'); for (let y = 30; y < VHH; y += 60) g.r(0, y, 200, 8, 'wv-c');
  g.r(230, 0, 14, VHH, 'wv-mastt'); for (let y = 0; y < VHH; y += 14) g.l(230, y, 244, y + 14, 'wv-mastl');
  const cyc = (T * 0.15) % 2, cy = lerp(180, 20, cyc < 1 ? ss(0, 1, cyc) : ss(0, 1, 2 - cyc)); g.r(244, cy, 50, 42, 'wv-cage'); g.man(262, cy + 40, { dir: -1, s: 0.75, t: T }); g.man(280, cy + 40, { dir: -1, s: 0.75, t: T + 1 });
  for (let y = 30; y < VHH; y += 60) { g.r(200, y, 30, 6, 'wv-st'); g.r(204, y - 30, 4, 30, 'wv-gate'); }
  g.co(294, cy + 20, 330, cy - 6, '정원 30명 · 분속 60m'); g.t(14, 20, '층별 출입 데크 · 문 연동', 'wv-big'); void q;
};
S.curtain = (g, q, T, o) => {
  g.r(0, 0, 260, VHH, 'wv-room'); for (let y = 20; y < VHH; y += 80) { g.r(0, y, 270, 10, 'wv-c'); g.r(262, y + 2, 10, 6, 'wv-st'); }
  const n = Math.floor(q * 3); for (let i = 0; i < n; i++) { const yy = 20 + (2 - i) * 80; g.r(272, yy, 18, 80, 'wv-unit'); g.l(281, yy, 281, yy + 80, 'wv-mull'); }
  const y = lerp(-80, 20 + (2 - Math.min(2, n)) * 80, ss(0, 0.8, (q * 3) % 1)); g.r(300, y, 18, 80, 'wv-unit'); g.hook(309, 0, y - 6);
  g.man(230, 20 + (2 - Math.min(2, n)) * 80 + 80, { dir: 1, pose: 'reach', t: T }); g.co(262, 25, 330, 40, '층별 앵커 브래킷');
  g.t(14, 20, /PC 패널|금속|패널/.test(o.text) ? '외장 패널 걸기 · 접합 실링' : '유닛 커튼월 걸기 (비계 없음)', 'wv-big'); g.t(14, 34, `${n}/3 유닛 · 살수 시험 예정`, 'wv-tm');
};
S.glass = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 200, VWW, 40, 'wv-c'); g.r(80, 40, 16, 160, 'wv-frame'); g.r(300, 40, 16, 160, 'wv-frame'); g.r(80, 40, 236, 12, 'wv-frame'); g.r(80, 188, 236, 12, 'wv-frame');
  const x = lerp(320, 96, ss(0, 0.7, q)); g.r(x, 52, 204, 136, 'wv-glass'); g.l(x + 10, 60, x + 60, 110, 'wv-glint');
  const m = g.man(x + 220 < 400 ? x + 230 : 380, 200, { dir: -1, pose: 'hold', t: T }); g.r(x + 180, 110, 26, 14, 'wv-eqd'); g.l(m.ha[0], m.ha[1], x + 200, 117, 'wv-tool');
  g.r(120, 186, 14, 4, 'wv-accf'); g.r(260, 186, 14, 4, 'wv-accf'); g.co(127, 186, 120, 220, '세팅 블록');
  // 유리 단면
  const L = /삼중/.test(o.text) ? ['5', '12', '5', '12', '5'] : /진공/.test(o.text) ? ['5', '0.2', '5'] : ['6', '12', '6'];
  const gx = 340, gy = 60; g.r(gx, gy, 90, 100, 'wv-panel', 3); g.t(gx + 6, gy + 12, '유리 단면 (mm)', 'wv-gt'); let xx = gx + 14; L.forEach((v, i) => { const w = Math.max(3, +v * 1.6); g.r(xx, gy + 20, w, 60, i % 2 ? 'wv-gap' : 'wv-glass'); xx += w; }); g.t(gx + 6, gy + 94, L.join('+'), 'wv-gv');
  g.t(14, 20, `유리 끼우기 · 진공 흡착기`, 'wv-big');
};
S.seal = (g, q, T) => {
  g.r(0, 0, 200, VHH, 'wv-glass'); g.r(214, 0, VWW - 214, VHH, 'wv-c'); g.r(200, 0, 14, VHH, 'wv-gap');
  const y = lerp(10, 230, q); g.r(202, 0, 10, y, 'wv-sealant'); const m = g.man(280, Math.min(240, y + 60), { dir: -1, pose: 'hold', t: T }); g.r(214, y - 8, 30, 10, 'wv-eqd'); g.l(m.ha[0], m.ha[1], 240, y - 3, 'wv-tool');
  g.c(207, y + 20, 4, 'wv-backer'); g.co(207, y + 20, 230, y + 60, '백업재 → 실링 (폭:깊이 2:1)'); g.t(14, 20, '마스킹 → 프라이머 → 실링', 'wv-big');
};
S.insul = (g, q, T, o) => {
  g.r(0, 0, 140, VHH, 'wv-c'); const spray = /뿜칠|우레탄/.test(o.text);
  const h = lerp(0, VHH, ss(0, 1, q));
  if (spray) { g.r(140, VHH - h, 40, h, 'wv-foam'); const m = g.man(260, VHH, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 190, VHH - h, 'wv-hose'); g.drops(170, VHH - h - 10, 20, 14, T, 8, 'wv-fpd'); g.t(14, 20, '우레탄 폼 뿜칠 (화기 엄금)', 'wv-big'); return; }
  for (let y = VHH - 60; y > VHH - h - 60; y -= 60) g.r(140, Math.max(y, VHH - h), 46, Math.min(60, y + 60 - Math.max(y, VHH - h)) - 2, 'wv-ins');
  for (let y = VHH - 30; y > VHH - h; y -= 60) { g.l(130, y, 196, y, 'wv-anchor'); g.c(196, y, 3, 'wv-anchor2'); }
  if (/메시|베이스/.test(o.text)) g.r(186, VHH - h, 6, h, 'wv-mesh');
  g.man(260, VHH, { dir: -1, pose: 'reach', t: T });
  g.dim(140, 30, 186, 30, /진공/.test(o.text) ? '30mm (VIP)' : '200mm', 0); g.co(196, VHH - 30, 240, VHH - 60, '단열 앵커 (열교 차단형)');
  g.t(14, 20, `단열재 붙이기 ${n0(q * 100)}%`, 'wv-big');
};
S.waterproof = (g, q, T, o) => {
  const t = o.text; g.r(0, 170, VWW, 70, 'wv-c'); const L = 440 * ss(0, 1, q);
  if (/우레탄|도막|UV|재도장/.test(t) && !/시트/.test(t)) { g.r(0, 164, L, 6, 'wv-ure'); const m = g.man(L + 10, 170, { dir: -1, pose: 'bend', t: T }); g.l(m.ha[0], m.ha[1], L, 160, 'wv-tool'); g.r(L - 6, 160, 14, 6, 'wv-eqd'); g.dim(380, 150, 380, 164, '3mm', 0); g.t(14, 20, `우레탄 도막 ${n0(q * 100)}%`, 'wv-big'); return; }
  if (/벤토나이트/.test(t)) { g.r(0, 0, 60, 170, 'wv-c'); g.r(60, 170 - L * 0.38, 10, L * 0.38, 'wv-bento'); g.man(140, 170, { dir: -1, pose: 'reach', t: T }); g.t(14, 20, '벤토나이트 매트 고정', 'wv-big'); return; }
  g.r(0, 164, L, 6, 'wv-wp'); for (let x = 100; x < L; x += 100) g.r(x - 10, 162, 10, 8, 'wv-lap');
  g.c(L + 6, 162, 8, 'wv-roll'); const m = g.man(L + 40, 170, { dir: -1, pose: 'bend', t: T }); g.l(m.ha[0], m.ha[1], L + 10, 160, 'wv-tool'); g.e(L + 10, 162, 6 + Math.sin(T * 9) * 1.5, 3, 'wv-flame');
  g.co(95, 164, 120, 200, '겹침 100mm 이상'); g.man(L + 120, 170, { dir: -1, pose: 'stand', t: T, vest: 'wv-mvs' }); g.t(L + 96, 116, '화재 감시', 'wv-cl');
  g.t(14, 20, /토치/.test(t) ? `개량 아스팔트 시트 토치 ${n0(q * 100)}%` : `방수층 ${n0(q * 100)}%`, 'wv-big'); g.t(14, 34, '완료 후 담수 시험 48h', 'wv-tm');
};
S.pv = (g, q, T) => {
  g.r(0, 200, VWW, 40, 'wv-c'); g.r(0, 196, VWW, 4, 'wv-wp'); const n = Math.floor(q * 5);
  for (let i = 0; i < 5; i++) { const x = 30 + i * 80; g.r(x + 10, 170, 6, 26, 'wv-st'); g.r(x + 56, 160, 6, 36, 'wv-st'); if (i < n) g.pg([[x, 176], [x + 70, 150], [x + 70, 156], [x, 182]], 'wv-pvm'); }
  g.man(30 + n * 80 + 40, 200, { dir: -1, pose: 'reach', t: T }); g.r(380, 120, 40, 50, 'wv-eqd'); g.co(400, 120, 360, 90, '인버터 · 접속반', 'end');
  g.t(14, 20, `모듈 ${n}/5 · 관통부 최소화 가대`, 'wv-big'); g.gauge(14, 40, 200, '발전 (kW)', n0(q * 120), 120, '', false);
};
S.plant = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 200, VWW, 40, 'wv-c'); g.r(260, 190, 120, 10, 'wv-c');
  const x = lerp(-40, 270, ss(0, 0.7, q)); g.r(x, 120, 110, 70, 'wv-equip', 4); for (let k = 0; k < 3; k++) g.c(x + 20 + k * 35, 192, 5, 'wv-roller');
  g.r(x + 10, 130, 30, 20, 'wv-panel'); g.c(x + 80, 150, 16, 'wv-fan');
  if (q > 0.7) { g.l(x + 55, 120, x + 55, 40, 'wv-pipe'); g.l(x + 90, 120, x + 90, 60, 'wv-pipe2'); g.l(x + 55, 40, VWW, 40, 'wv-pipe'); }
  const m = g.man(x - 20, 200, { dir: 1, pose: 'hold', t: T }); void m;
  const nm = (o.text.match(/냉동기|보일러|변압기|발전기|UPS|냉각탑|히트펌프|열교환기|저수조|부스터 펌프|항온항습기|외조기|축열조/) || ['설비 장비'])[0];
  g.co(x + 55, 120, x + 55, 96, nm, 'middle'); g.co(320, 196, 330, 226, '방진 패드 · 앵커');
  g.t(14, 20, q < 0.7 ? '반입 (롤러 스케이트)' : '기초 고정 · 배관 연결', 'wv-big');
};
S.duct = (g, q, T, o) => {
  g.r(0, 0, VWW, 18, 'wv-c'); g.r(0, 18, VWW, VHH - 18, 'wv-room'); g.r(0, 220, VWW, 20, 'wv-c');
  const n = Math.floor(q * 6); for (let i = 0; i < 6; i++) { const x = 10 + i * 70; g.l(x + 10, 18, x + 10, 70, 'wv-hanger'); g.l(x + 60, 18, x + 60, 70, 'wv-hanger'); if (i < n) g.r(x, 50, 68, 26, 'wv-ductf'); }
  if (/FFU/.test(o.text)) { for (let i = 0; i < n; i++) g.r(10 + i * 70, 80, 60, 10, 'wv-ffu'); }
  for (let i = 0; i < n; i++) if (i % 2) { g.r(40 + i * 70, 76, 12, 20, 'wv-ductf'); const k = (T * 1.5 + i * 0.3) % 1; g.l(46 + i * 70, 100 + k * 20, 46 + i * 70, 108 + k * 20, 'wv-air'); }
  g.r(30 + n * 70, 150, 60, 70, 'wv-lift'); g.l(30 + n * 70, 150, 30 + n * 70 + 60, 150, 'wv-rail'); g.man(55 + n * 70, 150, { dir: 1, pose: 'reach', t: T });
  g.co(20, 30, 60, 120, '행거 2.4m 이하'); g.t(14, 210 - 180 + 4, '', 'wv-tm');
  g.t(14, 140, /VAV|취출/.test(o.text) ? 'VAV · 취출구 → 풍량 측정' : '덕트 행거 → 덕트 → 기밀·보온', 'wv-big');
};
S.pipe = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 0, VWW, 14, 'wv-c'); g.r(0, 226, VWW, 14, 'wv-c');
  const t = o.text, riser = /입상/.test(t);
  if (riser) { g.r(180, 0, 70, VHH, 'wv-shaft'); const h = lerp(VHH, 0, ss(0, 0.8, q)); g.r(198, h, 10, VHH - h, 'wv-pipeF'); g.r(222, h + 20, 10, VHH - h, 'wv-pipeW'); for (let y = VHH - 30; y > h; y -= 50) g.r(194, y, 42, 4, 'wv-st'); g.man(280, 226, { dir: -1, pose: 'reach', t: T }); g.t(14, 20, `입상관 ${n0(q * 100)}%`, 'wv-big'); }
  else { const L = 400 * ss(0, 0.7, q); g.r(20, 60, L, 10, /배수|오수/.test(t) ? 'wv-pipeD' : /냉매/.test(t) ? 'wv-pipeR' : 'wv-pipeW'); for (let x = 40; x < 20 + L; x += 60) { g.l(x, 14, x, 60, 'wv-hanger'); g.r(x - 4, 58, 8, 14, 'wv-joint2'); } const m = g.man(30 + L, 226, { dir: 1, pose: 'reach', t: T }); if (/용접|오비탈/.test(t)) g.spark(20 + L, 65, T); void m; g.t(14, 20, /오비탈/.test(t) ? '오비탈 용접 (클린 배관)' : `배관 ${n0(q * 100)}%`, 'wv-big'); g.co(80, 70, 100, 110, /배수/.test(t) ? '구배 1/50~1/100' : '지지 간격 2m'); }
  if (q > 0.7) g.gauge(240, 150, 186, '수압 시험 (MPa)', +(lerp(0, 1.5, ss(0.7, 0.85, q))).toFixed(2), 1.5, '', false);
};
S.sprinkler = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 0, VWW, 14, 'wv-c'); g.r(0, 226, VWW, 14, 'wv-c');
  const L = 420 * ss(0, 0.6, q); g.r(10, 40, L, 6, 'wv-pipeF'); for (let x = 50; x < 10 + L; x += 80) { g.l(x, 46, x, 70, 'wv-pipeF2'); g.r(x - 4, 70, 8, 6, 'wv-head'); if (q > 0.75) g.drops(x - 20, 76, 40, 60, T, 10, /미세|미분무/.test(o.text) ? 'wv-mist' : 'wv-drop'); }
  if (/감지|가스|청정 소화/.test(o.text)) { g.r(330, 120, 50, 90, 'wv-tank', 6); g.co(355, 120, 300, 100, '소화약제 용기', 'end'); }
  g.man(20 + L, 226, { dir: 1, pose: 'reach', t: T });
  g.gauge(14, 140, 200, '수압 시험 (MPa · 2h)', +(lerp(0, 1.4, ss(0.6, 0.8, q))).toFixed(1), 1.4, '', false);
  g.t(14, 30 + 98, '', 'wv-tm'); g.t(240, 120, `헤드 간격 3.2m 이하`, 'wv-big');
};
S.detect = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 0, VWW, 14, 'wv-c'); g.r(0, 226, VWW, 14, 'wv-c');
  [80, 200, 320].forEach((x, i) => { g.r(x - 10, 14, 20, 6, 'wv-det'); g.c(x, 22, 3, q > 0.3 + i * 0.2 ? 'wv-ledon' : 'wv-ledoff'); });
  const x = 80 + Math.min(2, Math.floor(q * 3)) * 120; const m = g.man(x + 20, 226, { dir: -1, pose: 'reach', t: T }); g.l(m.ha[0], m.ha[1], x, 40, 'wv-pole'); g.r(x - 8, 24, 16, 16, 'wv-eqd');
  for (let k = 0; k < 4; k++) g.c(x + Math.sin(T * 2 + k) * 6, 30 + k * 6, 4 + k, 'wv-smoke');
  g.r(370, 80, 56, 80, 'wv-panel', 3); for (let k = 0; k < 6; k++) g.c(386 + (k % 2) * 22, 96 + Math.floor(k / 2) * 18, 4, k < q * 6 ? 'wv-ledon' : 'wv-ledoff'); g.co(398, 80, 380, 60, '수신기 연동', 'end');
  g.t(14, 120, '감지기 동작 시험 → 제연·셔터 연동', 'wv-big');
};
S.cable = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 0, VWW, 14, 'wv-c'); g.r(0, 226, VWW, 14, 'wv-c');
  if (/버스덕트/.test(o.text)) { g.r(200, 0, 80, VHH, 'wv-shaft'); const h = lerp(VHH, 0, ss(0, 0.9, q)); g.r(220, h, 20, VHH - h, 'wv-bus'); for (let y = VHH - 40; y > h; y -= 60) g.r(240, y, 14, 20, 'wv-eqd'); g.t(14, 20, '버스덕트 수직 설치 · 플러그인 분기', 'wv-big'); return; }
  g.r(10, 50, 420, 6, 'wv-tray'); for (let x = 30; x < 430; x += 60) g.l(x, 14, x, 50, 'wv-hanger');
  const L = 420 * ss(0, 0.8, q); for (let k = 0; k < 3; k++) g.l(10, 46 - k * 3, 10 + L, 46 - k * 3, 'wv-cab');
  g.c(40, 190, 30, 'wv-drum'); g.c(40, 190, 8, 'wv-st'); g.l(40, 160, 10, 50, 'wv-cab');
  g.man(10 + L, 226, { dir: 1, pose: 'reach', t: T });
  if (q > 0.8) g.gauge(150, 76, 186, '절연 저항 (MΩ, 500V)', 120, 1, '', false); else g.t(14, 130, '케이블 포설 (굽힘 반경 관리)', 'wv-big');
  g.r(380, 140, 44, 80, 'wv-panel', 3); g.co(402, 140, 380, 110, '분전반', 'end');
};
S.ict = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 226, VWW, 14, 'wv-c');
  g.r(60, 60, 70, 166, 'wv-rack', 3); for (let k = 0; k < 10; k++) { g.r(66, 70 + k * 15, 58, 10, 'wv-eqd'); for (let j = 0; j < 6; j++) g.c(72 + j * 9, 75 + k * 15, 1.6, (T * 3 + j + k) % 3 < 1.5 ? 'wv-ledon' : 'wv-ledoff'); }
  const n = Math.floor(q * 6); for (let i = 0; i < n; i++) g.pl([[124, 80 + i * 20], [180, 80 + i * 20], [200, 40]], 'wv-fiber');
  g.r(300, 50, 120, 80, 'wv-screen', 3); const pts = []; for (let i = 0; i < 30; i++) pts.push([306 + i * 3.8, 110 - 20 * Math.abs(Math.sin(i * 0.4 + T))]); g.pl(pts, 'wv-graph');
  for (let k = 0; k < 3; k++) { const r = ((T + k / 3) % 1) * 30; g.P(`<path class="wv-wave" d="M${240 - r} 40 A ${r} ${r} 0 0 1 ${240 + r} 40" opacity="${(1 - r / 30).toFixed(2)}"/>`); }
  g.man(170, 226, { dir: -1, pose: 'hold', t: T }); g.t(14, 20, '광·UTP 배선 → 라벨 → OTDR 측정', 'wv-big');
};
S.elev = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(150, 0, 140, VHH, 'wv-shaft'); [160, 270].forEach(x => g.r(x, lerp(VHH, 0, ss(0, 0.6, q)), 8, VHH, 'wv-st'));
  g.l(220, 0, 220, VHH, 'wv-laser'); const cy = lerp(200, 60, ss(0.6, 1, q)); g.r(176, cy, 88, 60, 'wv-car', 3); g.l(220, 0, 220, cy, 'wv-rope');
  g.man(240, cy + 60, { dir: -1, s: 0.8, pose: 'hold', t: T }); g.co(164, 120, 290, 120, '가이드 레일 (수직도 측정)'); g.co(220, 30, 300, 20, '레이저 기준선');
  g.t(14, 20, q < 0.6 ? '레일·도어 설치' : '로프 걸기 → 시운전', 'wv-big');
};
S.wall = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 0, VWW, 12, 'wv-c'); g.r(0, 228, VWW, 12, 'wv-c');
  if (/블록|쌓기|ALC/.test(o.text)) { const rows = Math.floor(q * 10); for (let r = 0; r < rows; r++) for (let x = (r % 2) * 20; x < 300; x += 40) g.r(40 + x, 216 - r * 20, 38, 18, /ALC/.test(o.text) ? 'wv-alc' : 'wv-block'); const m = g.man(370, 228, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 340, 216 - rows * 20 + 10, 'wv-tool'); g.t(14, 30, `${rows}단 · 줄눈 10mm`, 'wv-big'); return; }
  const n = Math.floor(lerp(2, 10, ss(0, 0.4, q))); for (let i = 0; i < n; i++) g.r(30 + i * 40, 12, 6, 216, 'wv-stud'); g.r(30, 12, 366, 6, 'wv-st'); g.r(30, 222, 366, 6, 'wv-st');
  if (q > 0.3) g.r(36, 18, Math.min(360, (q - 0.3) * 600), 204, 'wv-insw');
  const b = Math.floor(lerp(0, 4, ss(0.5, 1, q))); for (let i = 0; i < b; i++) g.r(30 + i * 92, 12, 90, 216, 'wv-gyp');
  const m = g.man(40 + b * 92 + 40, 228, { dir: -1, pose: 'hold', t: T }); g.r(m.ha[0] - 10, m.ha[1] - 4, 10, 8, 'wv-eqd');
  g.dim(30, 240 - 14, 70, 240 - 14, '450', 0); g.t(14, 30, q < 0.3 ? '러너 · 스터드' : q < 0.5 ? '흡음재 충전' : '석고보드 2겹 (이음 엇갈림)', 'wv-big');
};
S.plaster = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-block'); const h = lerp(0, VHH, q); g.r(0, VHH - h, VWW, h, 'wv-plaster');
  const m = g.man(220, VHH, { dir: 1, pose: 'reach', t: T }); g.r(m.ha[0] - 4, VHH - h - 6 + Math.sin(T * 4) * 6, 30, 6, 'wv-st');
  g.t(14, 20, '바름 → 평활 → 건조', 'wv-big'); g.dim(380, VHH - h, 380, VHH, '두께 18mm', -60);
};
S.ceiling = (g, q, T, o) => {
  g.r(0, 0, VWW, 16, 'wv-c'); g.r(0, 16, VWW, VHH - 16, 'wv-room'); g.r(0, 226, VWW, 14, 'wv-c');
  const n = Math.floor(lerp(1, 8, ss(0, 0.4, q))); for (let i = 0; i < n; i++) g.l(30 + i * 54, 16, 30 + i * 54, 80, 'wv-hanger');
  if (q > 0.3) g.l(20, 80, 20 + Math.min(1, (q - 0.3) * 2.5) * 400, 80, 'wv-chan');
  const b = Math.floor(lerp(0, 7, ss(0.55, 1, q))); for (let i = 0; i < b; i++) g.r(20 + i * 58, 82, 56, 6, /T-bar|텍스/.test(o.text) ? 'wv-tile' : 'wv-gyp');
  const lx = 40 + b * 58; g.r(lx, 150, 70, 76, 'wv-lift'); g.man(lx + 30, 150, { dir: 1, pose: 'reach', t: T }); g.dim(400, 88, 400, 226, '천장고 2.7m', -70);
  g.co(84, 50, 130, 40, '행어볼트 900mm'); g.t(14, 120, q < 0.3 ? '행어볼트 · 캐링 채널' : q < 0.55 ? '천장틀 (레이저 레벨)' : '천장판 붙이기', 'wv-big');
};
S.floor = (g, q, T, o) => {
  const t = o.text; g.r(0, 0, VWW, 150, 'wv-room'); g.r(0, 190, VWW, 50, 'wv-c');
  if (/받침대|OA/.test(t)) { const n = Math.floor(q * 8); for (let i = 0; i < 8; i++) { g.r(30 + i * 50, 160, 4, 30, 'wv-st'); if (i < n) g.r(10 + i * 50, 154, 48, 6, 'wv-oa'); } g.man(40 + n * 50, 154, { dir: 1, pose: 'kneel', t: T }); g.t(14, 20, 'OA 받침대 + 패널 (배선 공간)', 'wv-big'); return; }
  if (/에폭시|연마|강화제/.test(t)) { const L = 440 * q; g.r(0, 184, L, 6, /에폭시/.test(t) ? 'wv-epoxy' : 'wv-polish'); const m = g.man(L + 30, 184, { dir: -1, pose: 'hold', t: T }); g.c(L + 2, 180, 10, 'wv-eq'); g.l(m.ha[0], m.ha[1], L + 2, 172, 'wv-tool'); g.t(14, 20, /에폭시/.test(t) ? '연마 → 프라이머 → 에폭시' : '다단계 연마·광택', 'wv-big'); g.t(14, 34, '평탄도 3m 직선자 3mm', 'wv-tm'); return; }
  if (/타일|석재|카펫|비닐|마루|걸레받이/.test(t)) { const n = Math.floor(q * 10); for (let i = 0; i < n; i++) g.r(10 + i * 42, 182, 40, 8, /석재/.test(t) ? 'wv-stone' : /카펫/.test(t) ? 'wv-carpet' : /마루/.test(t) ? 'wv-wood' : 'wv-tile2'); g.man(20 + n * 42, 182, { dir: 1, pose: 'kneel', t: T }); g.t(14, 20, '마감재 붙이기 · 줄눈', 'wv-big'); return; }
  // 습식 온돌: 완충재 → 기포 → 코일 → 방통
  const L = (k) => 440 * ss(k, k + 0.25, q);
  g.r(0, 184, L(0), 6, 'wv-cush'); g.r(0, 174, L(0.2), 10, 'wv-foamc'); for (let x = 10; x < L(0.45); x += 18) g.c(x, 170, 3, 'wv-coil'); g.r(0, 160, L(0.7), 10, 'wv-mort');
  g.man(Math.max(20, L(0.7) + 20), 160, { dir: -1, pose: 'hold', t: T });
  g.co(60, 187, 80, 216, '완충재 30'); g.co(140, 178, 160, 226, '기포 40'); g.co(220, 170, 250, 120, '난방 코일'); g.co(320, 164, 340, 110, '방통 40');
  g.t(14, 20, q < 0.25 ? '완충재 깔기' : q < 0.45 ? '기포 콘크리트' : q < 0.7 ? '난방 코일' : '방통 모르타르 (양생 21일)', 'wv-big');
};
S.paint = (g, q, T, o) => {
  const t = o.text; g.r(0, 0, VWW, VHH, 'wv-gypw'); g.r(0, 226, VWW, 14, 'wv-c');
  if (/벽지|초배|정배/.test(t)) { const n = Math.floor(q * 6); for (let i = 0; i < n; i++) g.r(10 + i * 70, 10, 68, 216, 'wv-paper'); g.man(30 + n * 70, 226, { dir: 1, pose: 'reach', t: T }); g.t(14, 20, '초배 → 정배', 'wv-big'); return; }
  const coats = [['wv-putty', '퍼티'], ['wv-p1', '하도'], ['wv-p2', '상도 1'], ['wv-p3', '상도 2']];
  coats.forEach(([c], i) => { const h = 216 * ss(i / 4, (i + 1) / 4, q); g.r(40 + i * 6, 226 - h, 360 - i * 12, h, c); });
  if (/로봇/.test(t)) { const y = 226 - 216 * ((q * 4) % 1); g.r(300, 170, 50, 56, 'wv-eq', 4); g.l(320, 170, 320, y, 'wv-arm2'); g.r(310, y - 4, 20, 8, 'wv-roll2'); g.co(350, 190, 390, 170, '도장 로봇 (도막 두께 기록)'); }
  else if (/스프레이|에어리스/.test(t)) { const m = g.man(330, 226, { dir: -1, pose: 'hold', t: T }); g.l(m.ha[0], m.ha[1], 290, 120, 'wv-tool'); g.drops(250, 100, 40, 40, T, 12, 'wv-mist'); }
  else { const m = g.man(330, 226, { dir: -1, pose: 'reach', t: T }); const ry = 60 + Math.sin(T * 2.5) * 50; g.l(m.ha[0], m.ha[1], 300, ry, 'wv-tool'); g.r(290, ry - 12, 8, 24, 'wv-roll2'); }
  const i = Math.min(3, Math.floor(q * 4)); g.t(14, 20, `${coats[i][1]} · 도막 30~40㎛/회`, 'wv-big'); g.t(14, 34, '재도장 간격 (건조) 준수', 'wv-tm');
};
S.landscape = (g, q, T, o) => {
  const t = o.text; g.ground(GY, [['wv-soilg', 20], ['wv-s2', 99]]);
  if (/포장|보도블록|투수/.test(t)) { const n = Math.floor(q * 14); for (let i = 0; i < n; i++) g.r(10 + i * 30, GY - 8, 28, 8, /투수/.test(t) ? 'wv-perm' : 'wv-pave'); g.man(20 + n * 30, GY - 8, { dir: 1, pose: 'kneel', t: T }); g.r(300, GY - 30, 60, 22, 'wv-eq', 3); g.t(14, 20, '기층 다짐 → 블록 포장', 'wv-big'); return; }
  const y = lerp(40, GY - 70, ss(0, 0.6, q)); g.hook(200, 0, y - 6); g.e(200, y + 60, 18, 12, 'wv-rootball'); g.l(200, y + 48, 200, y - 6 + 10, 'wv-trunk2'); g.e(200, y + 6, 46, 40, 'wv-canopy');
  if (q > 0.6) { g.e(200, GY, 34, 8, 'wv-hole'); g.l(160, GY, 196, GY - 50, 'wv-wood2'); g.l(240, GY, 204, GY - 50, 'wv-wood2'); g.co(240, GY - 20, 300, GY - 50, '지주목 · 물집'); }
  g.man(130, GY, { dir: 1, pose: 'reach', t: T }); g.t(14, 20, '교목 식재 (뿌리분 깊이 확인)', 'wv-big');
};
S.temp = (g, q, T, o) => {
  g.ground(GY, [['wv-s1', 14], ['wv-s2', 99]]); const snd = /방음/.test(o.text) || o.optId === 'sound';
  const n = Math.floor(q * 8), H = snd ? 110 : 50; for (let i = 0; i < n; i++) { g.r(20 + i * 50, GY - H, 48, H, snd ? 'wv-sound' : 'wv-fence'); g.r(18 + i * 50, GY - H, 4, H, 'wv-st'); }
  g.man(40 + n * 50, GY, { dir: 1, pose: 'reach', t: T });
  if (/분진|살수/.test(o.text) || q > 0.5) { g.r(380, GY - 60, 10, 60, 'wv-st'); g.drops(330, GY - 80, 90, 60, T, 14, 'wv-mist'); g.co(385, GY - 60, 350, GY - 100, '미스트 분사', 'end'); }
  if (/전광판|소음/.test(o.text)) { g.r(300, 40, 100, 40, 'wv-board', 2); g.t(350, 66, `${n0(62 + 3 * Math.sin(T))}dB`, 'wv-boardt', 'middle'); }
  g.dim(14, GY - H, 14, GY, snd ? '10m' : '3m', 0); g.t(30, 20, snd ? '고차단 방음벽 설치' : '가설 울타리 설치', 'wv-big');
};
S.commission = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 226, VWW, 14, 'wv-c');
  g.r(40, 50, 360, 110, 'wv-screen', 4); const sys = ['공조', '위생', '소방', '전기', '승강기', '통신']; sys.forEach((s, i) => { const ok = q * 6 > i + 0.5; g.r(54 + i * 56, 66, 48, 30, ok ? 'wv-okbox' : 'wv-pendbox', 3); g.t(78 + i * 56, 85, s, 'wv-gt', 'middle'); });
  const pts = []; for (let i = 0; i < 60; i++) pts.push([54 + i * 5.6, 140 - 22 * (0.5 + 0.5 * Math.sin(i * 0.3 + T))]); g.pl(pts, 'wv-graph');
  g.r(150, 170, 140, 12, 'wv-desk'); g.man(190, 226, { dir: 1, pose: 'sit', t: T }); g.man(260, 226, { dir: -1, pose: 'stand', t: T });
  g.t(14, 30, `연동 시험 ${n0(q * 100)}% · 운영자 교육`, 'wv-big');
};
S.inspect = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 200, VWW, 40, 'wv-c');
  const m = g.man(160, 200, { dir: 1, pose: 'hold', t: T }); g.r(m.ha[0] - 2, m.ha[1] - 14, 18, 22, 'wv-tablet', 2);
  const items = ['치수', '레벨', '강도', '기록']; items.forEach((s, i) => { g.r(260, 40 + i * 32, 160, 26, 'wv-panel', 3); g.t(270, 57 + i * 32, s, 'wv-gt'); g.t(410, 57 + i * 32, q * 4 > i + 0.5 ? '적합 ✓' : '…', q * 4 > i + 0.5 ? 'wv-gv' : 'wv-tm', 'end'); });
  g.r(60, 150, 20, 50, 'wv-eqd'); g.l(70, 150, 70, 120, 'wv-st'); g.r(62, 112, 16, 10, 'wv-eq', 2); g.l(78, 117, 240, 117 + Math.sin(T) * 4, 'wv-laser');
  g.t(14, 20, (o.text || '').slice(0, 26), 'wv-big');
};
S.plan = (g, q, T, o) => {
  g.r(10, 10, 420, 220, 'wv-screen', 4); const rows = 8;
  for (let i = 0; i < rows; i++) { const s = 30 + i * 36, w = 70 + (i % 3) * 30, crit = i % 2 === 0; g.t(16, 38 + i * 24, `A${i + 1}`, 'wv-gt'); g.r(s, 28 + i * 24, w, 12, crit ? 'wv-crit' : 'wv-bar', 2); const prog = clamp((q * 1.3 - i * 0.08), 0, 1); g.r(s, 28 + i * 24, w * prog, 12, 'wv-done', 2); if (i) g.l(30 + (i - 1) * 36 + 70 + ((i - 1) % 3) * 30, 34 + (i - 1) * 24, s, 34 + i * 24, 'wv-link'); }
  const tx = 30 + q * 380; g.l(tx, 20, tx, 220, 'wv-today'); g.t(tx + 3, 222, '오늘', 'wv-cl');
  if (/택트|LOB|생산 속도|버퍼/.test(o.text)) { for (let k = 0; k < 4; k++) g.l(40 + k * 60, 220, 180 + k * 60, 30, 'wv-lob'); }
  g.t(260, 220 - 4, '주공정 (여유 0)', 'wv-crt'); void T;
};
S.drone = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-sky0'); g.ground(GY, [['wv-s1', 14], ['wv-s2', 99]]); g.bldg(120, GY, 160, 120);
  const x = lerp(40, 400, (T * 0.06) % 1), y = 40 + Math.sin(T * 2) * 3; g.l(x - 14, y, x + 14, y, 'wv-st'); g.e(x - 14, y - 2, 8, 2, 'wv-prop2'); g.e(x + 14, y - 2, 8, 2, 'wv-prop2'); g.r(x - 5, y - 2, 10, 6, 'wv-eqd');
  g.pg([[x, y + 4], [x - 50, GY], [x + 50, GY]], 'wv-scan');
  for (let i = 0; i < 80 * q; i++) { const px2 = 120 + (i * 37 % 160), py = GY - (i * 53 % 120); g.c(px2, py, 1.2, (i % 7) ? 'wv-pt' : 'wv-ptbad'); }
  g.t(14, 20, '정사영상 · 점군 → BIM 편차', 'wv-big'); g.gauge(300, 200 - 160, 126, '편차 > ±10mm', n0(q * 6), null, '곳', false);
};
S.sensor = (g, q, T) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 180, 260, 14, 'wv-c'); g.r(0, 194, 260, 46, 'wv-room');
  [40, 120, 200].forEach((x, i) => { g.r(x - 6, 172, 12, 8, 'wv-sens'); for (let k = 0; k < 2; k++) { const r = ((T + i * 0.3 + k / 2) % 1) * 30; g.P(`<path class="wv-wave" d="M${x - r} 170 A ${r} ${r} 0 0 1 ${x + r} 170" opacity="${(1 - r / 30).toFixed(2)}"/>`); } });
  g.r(280, 40, 150, 140, 'wv-screen', 4); g.t(290, 58, '실시간 대시보드', 'wv-gt'); const pts = []; for (let i = 0; i < 40; i++) pts.push([290 + i * 3.3, 150 - 60 * (1 - Math.exp(-i / 12)) - 3 * Math.sin(i + T * 3)]); g.pl(pts, 'wv-graph');
  g.t(420, 170, q > 0.7 ? '이상 없음' : '수집 중', 'wv-gv', 'end'); g.man(240, 180, { dir: 1, pose: 'hold', t: T }); g.t(14, 20, '센서 → 게이트웨이 → 경보', 'wv-big');
};
S.data = (g, q, T) => {
  g.r(30, 20, 260, 170, 'wv-screen', 4); const n = Math.floor(q * 60);
  for (let i = 0; i < n; i++) { const a = i % 10, b = Math.floor(i / 10); g.pg([[80 + a * 16 - b * 6, 150 - b * 14], [96 + a * 16 - b * 6, 150 - b * 14], [102 + a * 16 - b * 6, 144 - b * 14], [86 + a * 16 - b * 6, 144 - b * 14]], b % 2 ? 'wv-vox' : 'wv-vox2'); }
  g.r(130, 190, 60, 10, 'wv-desk'); g.man(320, 220, { dir: -1, pose: 'sit', t: T }); g.r(300, 200, 120, 8, 'wv-desk');
  const pts = []; for (let i = 0; i < 30; i++) pts.push([310 + i * 3.6, 120 - 40 * (1 - Math.exp(-i * q / 6))]); g.r(300, 40, 130, 100, 'wv-panel', 3); g.pl(pts, 'wv-graph'); g.t(310, 56, '오차 ↓ (학습)', 'wv-gt');
  g.t(14, 16, 'BIM·데이터 → 모델 → 시공 반영', 'wv-big');
};
S.generic = (g, q, T, o) => {
  g.r(0, 0, VWW, VHH, 'wv-room'); g.r(0, 200, VWW, 40, 'wv-c'); g.man(160, 200, { dir: 1, pose: 'swing', t: T }); g.man(240, 200, { dir: -1, pose: 'hold', t: T + 1 });
  g.r(300, 170, 60, 30, 'wv-box'); g.r(40, 60, 360, 10, 'wv-gb', 3); g.r(40, 60, 360 * q, 10, 'wv-gf', 3); g.t(14, 30, (o.text || '').slice(0, 28), 'wv-big');
};

// q: 단계 안 진행률, T: 초. 반환: SVG 문자열
export function workFig(a, q, T, o = {}) {
  const g = pen(); const f = S[a] || S.generic;
  try { f(g, clamp(q, 0, 1), T, { text: '', ...o }); } catch (e) { g.o.length = 0; S.generic(g, q, T, { text: o.text || '' }); }
  return `<svg class="wv" viewBox="0 0 ${VWW} ${VHH}" role="img" aria-label="${esc((ARCH[a] || ARCH.generic).n)} 작업 장면">${g.o.join('')}</svg>`;
}
export const WORK_TYPES = Object.keys(S);
