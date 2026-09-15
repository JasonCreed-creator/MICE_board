// =====================================================================
// 마이스 비즈 팀 보드 — Code.gs (Apps Script, 시트 바인딩)
// 빌드: 2026-09-11 · 구성 = [1] 공용 상수·헬퍼·시트 초기화·메뉴·자동 채움  +  [2] 대시보드 API(doGet·getBootstrap·쓰기 3경로)
// 설계 정본 docs/SPEC-v1.md · 데이터 계약 docs/DATA-CONTRACT.md · 설치 방법 guide/설치-운영-가이드.md
// 이 파일 전체를 Apps Script 편집기의 Code.gs 에 붙여 넣는다. 대시보드 화면은 index.html(빌드 산출물).
// =====================================================================

// ===== 팀 프로젝트 보드 — 공용 상수 · 헬퍼 · 시트 초기 설정 =====
// 파일 위치: apps-script/parts/01-core-setup.gs · 버전 2026-09-11
// 병합: 메인이 이 파일 뒤에 apps-script/parts/02-api.gs 를 이어 붙여 apps-script/Code.gs 를 만든다.
//       두 파트는 같은 전역 스코프이므로 이름이 겹치면 안 된다(계약 docs/DATA-CONTRACT.md §8).
//
// 이 파일이 하는 일
//   1) 탭 7개의 이름(SHEETS)·헤더(HEADERS)와 기본 설정값(DEFAULT_SETTINGS)을 코드에 고정한다.
//   2) 시트를 읽고 쓰는 공용 헬퍼 13개를 정의한다(계약 §8). 02 파트(API)가 이 헬퍼만 쓴다.
//   3) setupSheets() 로 빈 스프레드시트에 탭 7개를 한 번에 만든다(여러 번 실행해도 안전).
//   4) 시트 상단 [팀 보드] 메뉴(onOpen)와 자동 입력(onEdit)을 붙인다.
//
// 운영 원칙 — 목록·기준값은 시트 `설정` 탭에서, 코드는 이 파일에서
//   상태·유형·역할·공통코드·표준 마일스톤 템플릿·기준값(월 가용 M/D · 마진 · 가동률 임계치 ·
//   타임라인 오프셋)은 모두 `설정` 탭이 원본이다. 팀원이 `설정` 탭을 고치면 대시보드가 그대로 따라간다.
//   아래 DEFAULT_SETTINGS 는 `설정` 탭이 없거나 값이 비었을 때만 쓰는 예비값이고,
//   `설정` 탭을 처음 만들 때 넣어 주는 초기값이기도 하다.
//
// 탭 11개 — 프로젝트 · 배정 · 공수기록 · 팀원 · 마일스톤 · 세부항목 · 주석 · 정산 · 설정 · 업무블럭 · 변경이력
//   프로젝트   행사 1건 = 1행. 프로젝트ID는 스크립트가 자동으로 붙인다
//   배정       누가 어느 프로젝트에 며칠(M/D) 들어가는지의 계획. 5턴부터 비고가 "자동(세부항목)" 인 행은 세부항목 합계로 스크립트가 만든다
//   공수기록   주 1회(월요일) 지난주 실제 투입 M/D 기록
//   팀원       이름 · 주역할 · 월 가용 M/D · 상태 · 색상 · 이메일(6턴 추가 — 회사 업무 계정, 로그인 계정과 맞추는 용도. 선택 입력)
//   마일스톤   프로젝트별 일정 체크포인트(상태 열은 수식이 자동 계산)
//   세부항목   마일스톤 아래 파트별 업무 블럭(담당 · 임팩트 · 난이도 · 계획 M/D). 5턴 추가 — 없으면 첫 쓰기 때 자동 생성
//   주석       세부 항목·마일스톤에 다는 파트별 주석(판단 근거 · 요청 · 질문 · 결정). 5턴 추가 — 없으면 첫 쓰기 때 자동 생성
//   정산       매출 · 직접비 집행 · 참가 인원(실마진·실마진율·쇼업률 등은 수식이 자동 계산)
//   설정       위 "운영 원칙"의 목록·기준값 원본
//   업무블럭   파트별 업무 블럭 카탈로그(시트에서만 편집). 5턴 추가 — 없으면 대시보드는 코드의 기본 카탈로그(Schema.DEFAULT_BLOCKS)를 쓴다
//   변경이력   대시보드에서 한 모든 쓰기의 기록(일시 · 사용자 · 탭 · 키 · 동작 · 변경 내용 · 이전 행 백업). 4턴 추가 — 없으면 첫 쓰기 때 자동 생성
//
// 주의
//   - 사람의 투입은 M/D 로만 적는다. 이를 금액으로 환산하는 열은 어느 탭에도 두지 않는다(결정 D3).
//   - 대시보드로 나가는 값에는 Date 객체를 두지 않는다 → toDateStr_ · toDateTimeStr_ 를 거친다.
//   - 샘플 데이터 묶음 SAMPLE_DATA 는 길이가 길어 이 파일 맨 아래에 있다.

// ==================== 1. 상수 ====================

// 시트·스크립트 시간대. appsscript.json 의 timeZone 과 같아야 한다.
const TZ = 'Asia/Seoul';

// 탭 이름 (계약 §3)
const SHEETS = {
  PROJECTS: '프로젝트',
  ASSIGNMENTS: '배정',
  LOGS: '공수기록',
  MEMBERS: '팀원',
  MILESTONES: '마일스톤',
  SETTLEMENTS: '정산',
  SETTINGS: '설정',
  HISTORY: '변경이력',
  ITEMS: '세부항목',      // 5턴 · 계약 §3.10
  NOTES: '주석',          // 5턴 · 계약 §3.11
  BLOCKS: '업무블럭'      // 5턴 · 계약 §3.12 (카탈로그 · 시트에서만 편집)
};

// 각 탭 1행 헤더 (계약 §3.1~§3.7 문자열·순서와 완전히 같아야 한다)
// 열을 늘릴 일이 생기면 반드시 "맨 오른쪽"에만 추가한다 — 기존 열 번호가 밀리면 대시보드가 깨진다.
const HEADERS = {
  '프로젝트': ['프로젝트ID', '행사명', '발주처', '유형', '상태', '담당PM', '행사 시작일', '행사 종료일',
    '착수일', '정산 예정일', '베뉴', '게런티(명)', '예상 참가(명)', '계약금액(원)', '비고', '등록일'],
  '배정': ['배정ID', '프로젝트ID', '팀원', '역할', '계획 M/D', '배정 시작', '배정 종료', '상태', '비고'],
  '공수기록': ['주차', '팀원', '프로젝트ID', '실투입 M/D', '메모', '기록일시'],
  // 6턴 D17 · 이메일(F)은 선택 입력 — 로그인 계정 ↔ 팀원 자동 매칭용 회사 업무 계정. 개인 휴대폰·개인 메일은 넣지 않는다
  '팀원': ['이름', '주역할', '월 가용 M/D', '상태', '색상', '이메일'],
  '마일스톤': ['프로젝트ID', '마일스톤', '예정일', '완료일', '담당', '상태', '행사명(자동)'],
  '정산': ['프로젝트ID', '매출(원)', '직접비 집행(원)', '실마진(원)', '실마진율', '사전 등록(명)',
    '현장 참석(명)', '쇼업률', '게런티 달성률', '정산 상태'],
  // 설정 탭은 열 단위 목록(A~I) + 빈 칸(J) + 기준값 표(K~L) = 12열. J열 헤더는 일부러 비운다.
  '설정': ['상태 목록', '유형 목록', '역할 목록', '공통코드', '공수기록 코드(자동)',
    '마일스톤', 'D-오프셋(일)', '기본 담당역할', '주최형 제외', '', '기준값 항목', '값'],
  // 변경이력(계약 §3.9 · Schema.HISTORY 와 같은 문구): 대시보드 쓰기 전부 기록. G열은 삭제·수정 전 행의 JSON 백업
  '변경이력': ['일시', '사용자', '탭', '키', '동작', '변경 내용', '이전 행(백업)'],
  // 5턴 · 계약 §3.10~3.12 (Schema.TABLES.items · notes · blocks 의 열 순서와 같다)
  // 세부항목 M열 "행사명(자동)" 은 마일스톤 G열처럼 1행 배열 수식이 만든다 — 대시보드는 읽지 않는다
  '세부항목': ['세부ID', '프로젝트ID', '마일스톤', '파트', '블럭', '담당', '임팩트', '난이도', '계획 M/D', '예정일', '상태', '비고', '행사명(자동)'],
  '주석': ['주석ID', '프로젝트ID', '마일스톤', '세부ID', '파트', '작성자', '작성자 이름', '일시', '유형', '내용', '해결'],
  '업무블럭': ['파트', '블럭', '기본 마일스톤', '기본 M/D', '기본 임팩트', '기본 난이도', '판단에 필요한 내용', '주최형 제외']
};

// `설정` 탭이 없거나 값이 비었을 때 쓰는 예비값 (계약 §2.2)
// 표준 마일스톤 템플릿 9종은 순서가 곧 생성 순서다.
const DEFAULT_SETTINGS = {
  statuses: ['견적', '계약', '준비', '진행', '완료', '정산완료', '드롭'],
  types: ['① 리멤버 MICE 솔루션', '② 일반 행사(게런티 없음)', '③ DMS·주최형', '④ 커스터마이즈'],
  roles: ['영업', '모객', '운영 PM', '현장 운영', '디자인·제작', '정산·리포트'],
  commonCodes: ['G-내부', 'G-영업', 'G-휴가'],
  capacityMdPerMonth: 20,
  margin: { external: 0.25, markup: 0.1, target: 0.35 },
  thresholds: { utilWarn: 0.85, utilOver: 1, missingLogWeeks: 1 },
  timelineOffsets: { kickoffDays: -90, settlementDays: 30 },
  milestoneTemplate: [
    { name: '계약 체결', offsetDays: -90, role: '영업', skipForHost: true },
    { name: '발주처 기초자료 수령', offsetDays: -50, role: '운영 PM', skipForHost: true },
    { name: '답사', offsetDays: -45, role: '운영 PM', skipForHost: false },
    { name: '랜딩페이지 컨펌', offsetDays: -35, role: '모객', skipForHost: false },
    { name: '운영계획서 확정', offsetDays: -14, role: '운영 PM', skipForHost: false },
    { name: '행사 7일 전 점검', offsetDays: -7, role: '운영 PM', skipForHost: false },
    { name: '행사 당일', offsetDays: 0, role: '현장 운영', skipForHost: false },
    { name: '정산보고 제출', offsetDays: 5, role: '정산·리포트', skipForHost: false },
    { name: '정산 승인', offsetDays: 30, role: '정산·리포트', skipForHost: false }
  ]
};

// [자동] 수식 열의 행별 수식 (계약 §3.5 · §3.6). r = 시트 행번호.
// setupSheets(초기 300행) 와 대시보드 신규 행 추가(fillStatusFormulaIfEmptyApi_ · fillSettlementFormulasApi_) 가 같은 문자열을 쓴다.
const ROW_FORMULAS = {
  // 마일스톤 F열 상태: 완료일이 있으면 완료 · 예정일이 지났으면 지연 · 그 밖에는 예정
  milestoneStatus: function (r) {
    return '=IF(A' + r + '="","",IF(D' + r + '<>"","완료",IF(C' + r + '<TODAY(),"지연","예정")))';
  },
  // 정산 D 실마진(원) · E 실마진율 · H 쇼업률 · I 게런티 달성률
  settlement: [
    { col: 4, make: function (r) { return '=IF(OR(B' + r + '="",C' + r + '=""),"",B' + r + '-C' + r + ')'; } },
    { col: 5, make: function (r) { return '=IF(OR(B' + r + '="",C' + r + '="",B' + r + '=0),"",(B' + r + '-C' + r + ')/B' + r + ')'; } },
    { col: 8, make: function (r) { return '=IF(OR(F' + r + '="",G' + r + '="",F' + r + '=0),"",G' + r + '/F' + r + ')'; } },
    { col: 9, make: function (r) { return '=IFERROR(IF(G' + r + '="","",G' + r + '/INDEX(프로젝트!L:L,MATCH(A' + r + ',프로젝트!A:A,0))),"")'; } }
  ]
};

// ==================== 2. 공용 헬퍼 13개 (계약 §8) ====================
// 이름 끝의 밑줄(_)은 "대시보드에서 직접 부를 수 없는 내부 함수"라는 Apps Script 표시다.

// 탭 1개를 가져온다. 없으면 무엇을 해야 하는지 알려 주는 한국어 오류를 던진다.
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error('"' + name + '" 탭이 없습니다. 시트 메뉴 [팀 보드 → 초기 설정 실행]을 먼저 실행하세요.');
  }
  return sheet;
}

// 날짜 → 'YYYY-MM-DD' 문자열. 값이 없거나 날짜로 못 읽으면 빈 문자열.
function toDateStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  // 숫자는 날짜로 보지 않는다(날짜 셀은 Apps Script 가 Date 로 넘겨준다).
  if (typeof v === 'number' || typeof v === 'boolean') return '';
  const s = String(v).trim();
  if (s === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;          // 이미 원하는 형식
  const d = new Date(s);                                 // '2026/09/03' 같은 입력 구제
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

// 일시 → 'YYYY-MM-DD HH:mm' 문자열. 날짜만 있으면 00:00 을 붙인다.
function toDateTimeStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  }
  if (typeof v === 'number' || typeof v === 'boolean') return '';
  const s = String(v).trim();
  if (s === '') return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');
}

// 숫자 → number, 빈 값·변환 실패 → null (계약 §1)
// 시트에 '1,200' 처럼 쉼표가 섞여 들어온 값과 '85%' 같은 값도 구제한다.
function toNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v instanceof Date) return null;
  let s = String(v).trim();
  if (s === '') return null;
  s = s.replace(/,/g, '').replace(/\s/g, '').replace(/^₩/, '');
  let isPercent = false;
  if (/%$/.test(s)) { isPercent = true; s = s.slice(0, -1); }
  if (s === '' || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return isPercent ? n / 100 : n;
}

// 오늘 날짜 'YYYY-MM-DD' (시트 시간대 기준)
function todayStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

// 현재 시각 ISO 8601 (예: 2026-09-11T09:00:00+09:00)
function nowIso_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// 'YYYY-MM-DD' → 그날 정오 Date. 정오로 두는 이유는 시간대·서머타임 때문에 날짜가 하루 밀리는 것을 막기 위해서다.
// 형식이 다르거나 실제로 없는 날짜(2026-02-31)면 null.
function parseDate_(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

// 'YYYY-MM-DD' 에 n 일을 더한 'YYYY-MM-DD'. 못 읽으면 빈 문자열.
function addDays_(dateStr, n) {
  const base = parseDate_(dateStr);
  const days = toNum_(n);
  if (!base || days === null) return '';
  const moved = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Math.round(days), 12, 0, 0, 0);
  return Utilities.formatDate(moved, TZ, 'yyyy-MM-dd');
}

// 탭 하나의 데이터 행을 읽는다 → [{ row: 시트 행번호, values: [...] }]
// 2행부터 마지막 행까지, 첫 열(ID·주차·이름)이 빈 행은 건너뛴다. values 길이는 HEADERS 의 열 개수와 같다
// (시트가 그보다 좁으면 있는 만큼 — 없는 칸은 읽는 쪽이 빈 값으로 본다).
function readRows_(sheetName) {
  const sheet = getSheet_(sheetName);
  const headers = HEADERS[sheetName];
  let width = (headers && headers.length) ? headers.length : sheet.getLastColumn();
  // 시트가 헤더보다 좁으면(열을 지웠거나, 6턴 이메일 열을 아직 안 만든 팀원 탭) 있는 만큼만 읽는다.
  // 모자란 칸은 …FromRowApi_ 가 빈 값으로 본다 — 범위 밖 읽기로 초기 로드가 통째로 실패하지 않게.
  width = Math.max(1, Math.min(width, sheet.getMaxColumns()));
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || width < 1) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const first = values[i][0];
    if (first === null || first === undefined || String(first).trim() === '') continue;
    out.push({ row: i + 2, values: values[i] });
  }
  return out;
}

// `설정` 탭 → settings 객체 (계약 §2.2·§3.7)
// A~D 목록 · F~I 마일스톤 템플릿 · K~L 기준값을 읽는다. 탭이 없거나 값이 비면 DEFAULT_SETTINGS 를 쓴다.
function readSettings_() {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));   // 기본값 복사본에 덮어쓰는 방식
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return out;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  const width = Math.max(1, Math.min(HEADERS[SHEETS.SETTINGS].length, sheet.getLastColumn()));
  const block = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  const txt = function (row, idx) {
    const v = (idx < row.length) ? row[idx] : '';
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return toDateStr_(v);
    return String(v).trim();
  };
  const raw = function (row, idx) { return (idx < row.length) ? row[idx] : ''; };

  // A~D: 목록 4종 (빈 칸은 빼고 위에서부터 읽는다)
  [['statuses', 0], ['types', 1], ['roles', 2], ['commonCodes', 3]].forEach(function (pair) {
    const list = [];
    for (let i = 0; i < block.length; i++) {
      const s = txt(block[i], pair[1]);
      if (s !== '') list.push(s);
    }
    if (list.length > 0) out[pair[0]] = list;
  });

  // F~I: 표준 마일스톤 템플릿 (I열에 '예' 가 있으면 주최형 프로젝트에서는 만들지 않는다)
  const template = [];
  for (let i = 0; i < block.length; i++) {
    const name = txt(block[i], 5);
    if (name === '') continue;
    template.push({
      name: name,
      offsetDays: toNum_(raw(block[i], 6)),
      role: txt(block[i], 7),
      skipForHost: txt(block[i], 8) === '예'
    });
  }
  if (template.length > 0) out.milestoneTemplate = template;

  // K~L: 기준값 9종 (계약 §3.7 매핑)
  const KEY_MAP = {
    '월 가용 M/D': ['capacityMdPerMonth'],
    '마진 외부노출': ['margin', 'external'],
    '마진 비노출 마크업': ['margin', 'markup'],
    '마진 목표': ['margin', 'target'],
    '가동률 주의': ['thresholds', 'utilWarn'],
    '가동률 과부하': ['thresholds', 'utilOver'],
    '미기록 허용 주': ['thresholds', 'missingLogWeeks'],
    '착수일 오프셋': ['timelineOffsets', 'kickoffDays'],
    '정산일 오프셋': ['timelineOffsets', 'settlementDays']
  };
  for (let i = 0; i < block.length; i++) {
    const key = txt(block[i], 10);
    if (key === '' || !KEY_MAP.hasOwnProperty(key)) continue;
    const num = toNum_(raw(block[i], 11));
    if (num === null) continue;
    const path = KEY_MAP[key];
    if (path.length === 1) out[path[0]] = num;
    else out[path[0]][path[1]] = num;
  }

  return out;
}

// 다음 프로젝트ID 'P-YYYY-NNN' — 그 해 번호 중 가장 큰 값 + 1 (계약 §3.8)
function nextProjectId_(sheet, year) {
  let y = toNum_(year);
  y = (y !== null && y >= 1900 && y <= 9999) ? Math.floor(y) : Number(todayStr_().slice(0, 4));
  const prefix = 'P-' + y + '-';
  let max = 0;
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      const s = String(values[i][0] === null || values[i][0] === undefined ? '' : values[i][0]).trim();
      if (s.indexOf(prefix) !== 0) continue;
      const n = Number(s.slice(prefix.length));
      if (isFinite(n) && n > max) max = Math.floor(n);
    }
  }
  const next = String(max + 1);
  return prefix + (next.length >= 3 ? next : ('000' + next).slice(-3));
}

// 다음 배정ID 'A-NNNN' — 탭 전체 번호 중 가장 큰 값 + 1 (계약 §3.8)
// usedIds: 한 번 저장에서 여러 개를 연달아 발급할 때 겹치지 않게 하는 Set(이미 쓴 ID 모음)
function nextAssignmentId_(sheet, usedIds) {
  const used = (usedIds && typeof usedIds.has === 'function') ? usedIds : new Set();
  let max = 0;
  const pick = function (value) {
    const m = /^A-(\d+)$/.exec(String(value === null || value === undefined ? '' : value).trim());
    if (!m) return;
    const n = Number(m[1]);
    if (isFinite(n) && n > max) max = Math.floor(n);
  };
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) pick(values[i][0]);
  }
  used.forEach(function (id) { pick(id); });

  let n = max + 1;
  const format = function (k) {
    const s = String(k);
    return 'A-' + (s.length >= 4 ? s : ('0000' + s).slice(-4));
  };
  let id = format(n);
  while (used.has(id)) { n++; id = format(n); }
  return id;
}

// 쓰기 작업을 잠금 안에서 실행한다(두 사람이 동시에 저장할 때 값이 섞이지 않게).
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    lock.waitLock(10000);      // 최대 10초 대기. 실패하면 예외가 난다
    acquired = true;
  } catch (e) {
    acquired = false;
  }
  if (!acquired) throw new Error('다른 사용자가 저장 중입니다. 잠시 후 다시 시도하세요.');
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* 이미 풀렸으면 무시 */ }
  }
}

// ==================== 2b. 변경이력 탭 헬퍼 (4턴 · 결정 D7·D12) ====================
// 대시보드에서 한 모든 쓰기(추가·수정·삭제·저장)를 `변경이력` 탭에 한 줄씩 남긴다.
// 이력 쓰기가 실패해도 본 작업(시트 저장)은 되돌리지 않는다 — logHistory_ 안에서 삼키고 console.warn 만 남긴다.

// 지금 대시보드를 쓰는 사람의 이메일. 못 읽으면(권한·익명) 빈 문자열.
function userEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    return (email === null || email === undefined) ? '' : String(email).trim();
  } catch (e) {
    return '';
  }
}

// 변경이력 탭의 열 너비·줄바꿈 (setupSheets 와 ensureHistorySheet_ 가 함께 쓴다)
function styleHistorySheet_(sheet) {
  const widths = [150, 200, 90, 220, 70, 420, 320];
  for (let i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  sheet.getRange(2, 6, rows, 2).setWrap(true);                 // F 변경 내용 · G 이전 행(백업) 은 여러 줄
  sheet.getRange(2, 1, rows, 7).setVerticalAlignment('top');
}

// `변경이력` 탭을 돌려준다. 없으면 만들고 헤더를 쓴다(4턴 이전에 만든 시트 대응 — 첫 쓰기 때 자동 생성).
function ensureHistorySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = HEADERS[SHEETS.HISTORY];
  let sheet = ss.getSheetByName(SHEETS.HISTORY);
  if (sheet) {
    if (sheet.getLastRow() < 1) sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sheet;
  }
  sheet = ss.insertSheet(SHEETS.HISTORY);                       // 맨 뒤(8번째 탭)에 붙는다
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#F3EDE2');
  sheet.setFrozenRows(1);
  styleHistorySheet_(sheet);
  return sheet;
}

// 이력 한 줄 추가: [일시 'YYYY-MM-DD HH:mm:ss', 사용자, 탭, 키, 동작(추가/수정/삭제/저장/되돌림), 변경 내용, 이전 행 JSON]
// backupObj 가 null 이면 G열은 빈 칸. 셀 글자 수 한도(5만 자)를 넘는 백업은 잘라서 넣는다.
// 반환(6턴) = 방금 쓴 이력 항목 { at, user, sheet, key, action, summary, row, backup } — 대시보드 응답에 실어
//   화면이 "최근 변경" 목록 맨 앞에 그대로 끼워 넣고 [되돌리기] 까지 바로 쓸 수 있게 한다. 기록에 실패하면 null.
function logHistory_(sheetLabel, keyLabel, action, summary, backupObj) {
  try {
    const sheet = ensureHistorySheet_();
    const at = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
    const txt = function (v) { return (v === null || v === undefined) ? '' : String(v); };
    let backup = '';
    if (backupObj !== null && backupObj !== undefined) {
      try { backup = JSON.stringify(backupObj); } catch (e) { backup = String(backupObj); }
      if (backup.length > 49000) backup = backup.slice(0, 48900) + ' …(길어서 잘림)';
    }
    const user = userEmail_();
    sheet.appendRow([at, user, txt(sheetLabel), txt(keyLabel), txt(action), txt(summary), backup]);
    return {
      at: at, user: user, sheet: txt(sheetLabel), key: txt(keyLabel), action: txt(action), summary: txt(summary),
      row: sheet.getLastRow(),                 // 되돌리기가 이 행을 다시 읽어 대조한다
      backup: parseBackupApi_(backup)          // 잘려서 못 읽으면 null → 화면은 "되돌릴 수 없음" 으로 본다
    };
  } catch (e) {
    console.warn('변경이력 기록 실패(본 작업은 저장됨): ' + (e && e.message ? e.message : e));
    return null;
  }
}

// 변경이력 G열(이전 행 백업) 문자열 → 값. 빈 칸은 null.
// 읽을 수 없으면(길어서 잘린 백업 등) 통째로 보내지 않고 표시 문구만 돌려준다 —
// Schema.restoreCheck 가 그 문구를 JSON 으로 못 읽어 "백업 내용을 읽을 수 없습니다" 로 막는다(서버·화면 판정이 같아진다).
const BACKUP_UNREADABLE_Api_ = '(백업을 읽을 수 없음)';
function parseBackupApi_(raw) {
  const s = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (s === '') return null;
  try { return JSON.parse(s); } catch (e) { return BACKUP_UNREADABLE_Api_; }
}

// ==================== 3. 초기 설정: 탭 11개 만들기 ====================
// 여러 번 실행해도 안전하다 — 이미 있는 탭은 통째로 건너뛴다(열·수식·데이터를 건드리지 않음).
// 4턴 이전 시트(탭 8개)에서 다시 실행하면 5턴 탭 3개(세부항목 · 주석 · 업무블럭)만 새로 생긴다.
// seedSample 을 비워 두면 샘플 5건이 함께 들어간다. 빈 시트로 시작하려면 setupSheetsEmpty() 를 쓴다.
function setupSheets(seedSample) {
  const seed = (seedSample === false) ? false : true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const skipped = [];
  const made = {};                 // 탭 이름 → 새로 만든 Sheet (이미 있던 탭은 null)

  const HEADER_BG = '#F3EDE2';     // 웜 페이퍼 톤 머리글 배경
  const DATE_FMT = 'yyyy-mm-dd';
  const TIME_FMT = 'yyyy-mm-dd hh:mm';

  // --- 이 함수 안에서만 쓰는 도우미들 (전역 이름을 늘리지 않으려고 안에 둔다) ---
  const newTab = function (name) {
    const found = ss.getSheetByName(name);
    if (found) { skipped.push(name); made[name] = null; return null; }
    const sheet = ss.insertSheet(name);
    const headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground(HEADER_BG);
    sheet.setFrozenRows(1);
    created.push(name);
    made[name] = sheet;
    return sheet;
  };
  const widths = function (sheet, list) {
    for (let i = 0; i < list.length; i++) sheet.setColumnWidth(i + 1, list[i]);
  };
  const fmt = function (sheet, a1, pattern) { sheet.getRange(a1).setNumberFormat(pattern); };
  // 고정 목록 드롭다운 — 목록에 없는 값은 입력을 막는다(대시보드 집계가 어긋나지 않게)
  const listRule = function (items) {
    return SpreadsheetApp.newDataValidation()
      .requireValueInList(items, true)
      .setAllowInvalid(false)
      .setHelpText('다음 중에서 골라 주세요: ' + items.join(' / '))
      .build();
  };
  // 다른 탭의 범위를 참조하는 드롭다운 — 복사·붙여넣기를 막지 않도록 "경고 표시"로 둔다
  const rangeRule = function (sheetName, a1, help) {
    const src = ss.getSheetByName(sheetName);
    if (!src) return null;
    return SpreadsheetApp.newDataValidation()
      .requireValueInRange(src.getRange(a1), true)
      .setAllowInvalid(true)
      .setHelpText(help)
      .build();
  };
  const applyRule = function (sheet, a1, rule) { if (rule) sheet.getRange(a1).setDataValidation(rule); };
  // [자동] 수식 열: 2~300행에 행별 수식을 넣는다
  const rowFormulas = function (sheet, col, firstRow, lastRow, make) {
    const rows = [];
    for (let r = firstRow; r <= lastRow; r++) rows.push([make(r)]);
    sheet.getRange(firstRow, col, rows.length, 1).setFormulas(rows);
  };
  // 샘플 값 변환
  const dateCell = function (v) { const d = parseDate_(v); return d ? d : ''; };
  const dtCell = function (v) {
    if (typeof v !== 'string') return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());   // 초는 있어도 없어도 된다(주석 일시)
    if (!m) return dateCell(v);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0, 0);
  };
  const numCell = function (v) { return (v === null || v === undefined || v === '') ? '' : v; };
  const txtCell = function (v) { return (v === null || v === undefined) ? '' : v; };
  const writeBlock = function (sheet, startCol, rows) {
    if (!sheet || !rows || rows.length === 0) return;
    sheet.getRange(2, startCol, rows.length, rows[0].length).setValues(rows);
  };

  // ---------- 3-1. 설정 (다른 탭 드롭다운이 이 탭을 참조하므로 가장 먼저 만든다) ----------
  const cfg = newTab(SHEETS.SETTINGS);
  if (cfg) {
    widths(cfg, [140, 210, 130, 110, 170, 180, 120, 130, 100, 30, 160, 90]);
    const one = function (col, list) {
      if (!list || list.length === 0) return;
      cfg.getRange(2, col, list.length, 1).setValues(list.map(function (v) { return [v]; }));
    };
    one(1, DEFAULT_SETTINGS.statuses);
    one(2, DEFAULT_SETTINGS.types);
    one(3, DEFAULT_SETTINGS.roles);
    one(4, DEFAULT_SETTINGS.commonCodes);
    // E열(공통코드 + 프로젝트ID 합본) 수식은 `프로젝트` 탭이 만들어진 뒤에 넣는다(3-9 참조).
    // F~I: 표준 마일스톤 템플릿 9줄
    const tpl = DEFAULT_SETTINGS.milestoneTemplate.map(function (t) {
      return [t.name, t.offsetDays, t.role, t.skipForHost ? '예' : ''];
    });
    cfg.getRange(2, 6, tpl.length, 4).setValues(tpl);
    // K~L: 기준값 9줄 (여기 숫자를 고치면 대시보드 경고선·기준선이 바뀐다)
    const base = [
      ['월 가용 M/D', DEFAULT_SETTINGS.capacityMdPerMonth],
      ['마진 외부노출', DEFAULT_SETTINGS.margin.external],
      ['마진 비노출 마크업', DEFAULT_SETTINGS.margin.markup],
      ['마진 목표', DEFAULT_SETTINGS.margin.target],
      ['가동률 주의', DEFAULT_SETTINGS.thresholds.utilWarn],
      ['가동률 과부하', DEFAULT_SETTINGS.thresholds.utilOver],
      ['미기록 허용 주', DEFAULT_SETTINGS.thresholds.missingLogWeeks],
      ['착수일 오프셋', DEFAULT_SETTINGS.timelineOffsets.kickoffDays],
      ['정산일 오프셋', DEFAULT_SETTINGS.timelineOffsets.settlementDays]
    ];
    cfg.getRange(2, 11, base.length, 2).setValues(base);
    fmt(cfg, 'G2:G20', '0');          // D-오프셋(일)
    fmt(cfg, 'L2:L2', '0.0');         // 월 가용 M/D
    fmt(cfg, 'L3:L7', '0%');          // 마진 3층 · 가동률 임계치
    fmt(cfg, 'L8:L10', '0');          // 미기록 허용 주 · 타임라인 오프셋
  }

  // ---------- 3-2. 팀원 ----------
  const mem = newTab(SHEETS.MEMBERS);
  if (mem) {
    widths(mem, [110, 130, 120, 90, 100, 200]);                              // 6턴 D17 · F 이메일
    fmt(mem, 'C2:C200', '0.0');
    fmt(mem, 'F2:F200', '@');                                                // 이메일은 글자 그대로(자동 서식 방지)
    applyRule(mem, 'B2:B200', rangeRule(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록에서 고르세요.'));
    applyRule(mem, 'D2:D200', listRule(['재직', '휴직', '퇴사', '지원']));   // 지원 = 타 팀·외부 지원 인력(배정 가능, 가동률·경고 제외)
  }
  ensureMemberEmailColumn_(ss);      // 6턴 D17 · 4~5턴에 만든 기존 팀원 탭이면 F1 헤더만 채운다(데이터 보존)

  // ---------- 3-3. 프로젝트 ----------
  const prj = newTab(SHEETS.PROJECTS);
  if (prj) {
    widths(prj, [110, 240, 150, 190, 90, 100, 110, 110, 110, 110, 170, 100, 120, 130, 200, 110]);
    fmt(prj, 'G2:J500', DATE_FMT);
    fmt(prj, 'P2:P500', DATE_FMT);
    fmt(prj, 'L2:N500', '#,##0');
    applyRule(prj, 'D2:D500', rangeRule(SHEETS.SETTINGS, 'B2:B50', '설정 탭 유형 목록에서 고르세요.'));
    applyRule(prj, 'E2:E500', rangeRule(SHEETS.SETTINGS, 'A2:A50', '설정 탭 상태 목록에서 고르세요.'));
    applyRule(prj, 'F2:F500', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  }

  // ---------- 3-4. 배정 ----------
  const asg = newTab(SHEETS.ASSIGNMENTS);
  if (asg) {
    widths(asg, [100, 110, 90, 120, 100, 110, 110, 90, 200]);
    fmt(asg, 'E2:E1000', '0.0');
    fmt(asg, 'F2:G1000', DATE_FMT);
    applyRule(asg, 'B2:B1000', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
    applyRule(asg, 'C2:C1000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
    applyRule(asg, 'D2:D1000', rangeRule(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록에서 고르세요.'));
    applyRule(asg, 'H2:H1000', listRule(['예정', '진행', '종료']));
  }

  // ---------- 3-5. 공수기록 ----------
  const log = newTab(SHEETS.LOGS);
  if (log) {
    widths(log, [110, 90, 120, 110, 260, 140]);
    fmt(log, 'A2:A2000', DATE_FMT);
    fmt(log, 'D2:D2000', '0.0');
    fmt(log, 'F2:F2000', TIME_FMT);
    applyRule(log, 'B2:B2000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
    applyRule(log, 'C2:C2000', rangeRule(SHEETS.SETTINGS, 'E2:E600', '프로젝트ID 또는 공통코드(G-내부 · G-영업 · G-휴가)를 고르세요.'));
    // 주 5.0 을 넘으면 빨간 표시로 알려 주되 입력은 막지 않는다(현장 주간처럼 실제로 넘는 주가 있다).
    log.getRange('D2:D2000').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberLessThanOrEqualTo(5)
        .setAllowInvalid(true)
        .setHelpText('한 주 실투입 M/D 는 보통 5.0 이하입니다. 5.0 을 넘겼다면 맞는 값인지 한 번만 확인해 주세요.')
        .build()
    );
  }

  // ---------- 3-6. 마일스톤 ----------
  const mil = newTab(SHEETS.MILESTONES);
  if (mil) {
    widths(mil, [110, 200, 110, 110, 100, 90, 220]);
    fmt(mil, 'C2:D2000', DATE_FMT);
    applyRule(mil, 'A2:A2000', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
    applyRule(mil, 'E2:E2000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
    // F열 [자동] 상태: 완료일이 있으면 완료 · 예정일이 지났으면 지연 · 그 밖에는 예정 (수식 문자열은 ROW_FORMULAS 한 곳에서 관리)
    rowFormulas(mil, 6, 2, 300, ROW_FORMULAS.milestoneStatus);
    // G열 [자동] 행사명: 프로젝트 탭에서 찾아 보여 준다(1행 배열 수식 하나)
    ensureMilestoneNameColumn_(mil);
  }

  // ---------- 3-7. 정산 ----------
  const stl = newTab(SHEETS.SETTLEMENTS);
  if (stl) {
    widths(stl, [110, 140, 150, 140, 100, 120, 120, 100, 130, 110]);
    fmt(stl, 'B2:D500', '#,##0');
    fmt(stl, 'E2:E500', '0.0%');
    fmt(stl, 'F2:G500', '#,##0');
    fmt(stl, 'H2:I500', '0.0%');
    applyRule(stl, 'A2:A500', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
    applyRule(stl, 'J2:J500', listRule(['미착수', '진행', '완료']));
    // D·E·H·I 는 [자동] 수식 열이다. 직접 입력하지 말고 B·C·F·G 만 채우면 된다. (수식 문자열은 ROW_FORMULAS 한 곳에서 관리)
    ROW_FORMULAS.settlement.forEach(function (f) { rowFormulas(stl, f.col, 2, 300, f.make); });
  }

  // ---------- 3-7b. 변경이력 (4턴 · 대시보드 쓰기 기록) ----------
  // 샘플을 넣지 않고, clearSampleData 도 이 탭은 비우지 않는다. 탭이 없으면 첫 쓰기 때 ensureHistorySheet_ 가 만든다.
  const his = newTab(SHEETS.HISTORY);
  if (his) styleHistorySheet_(his);

  // ---------- 3-7c. 세부항목 · 3-7d. 주석 · 3-7e. 업무블럭 (5턴 · 계약 §3.10~3.12) ----------
  // 서식·드롭다운·세부항목 M열 수식·기본 카탈로그는 init…Api_ 헬퍼가 넣는다
  // (메뉴 [드롭다운 목록 새로고침]의 업무블럭 탭 생성 · 첫 쓰기 때 자동 생성과 같은 코드를 쓴다).
  const itm = newTab(SHEETS.ITEMS);
  if (itm) initItemsSheetApi_(itm);
  const nts = newTab(SHEETS.NOTES);
  if (nts) initNotesSheetApi_(nts);
  const blk = newTab(SHEETS.BLOCKS);
  if (blk) initBlocksSheetApi_(blk);       // 기본 카탈로그 33행은 샘플이 아니라 초기값이라 seed 와 무관하게 채운다

  // ---------- 3-8. 샘플 데이터 (새로 만든 탭에만 넣는다) ----------
  let seeded = 0;
  if (seed) {
    if (made[SHEETS.MEMBERS]) {
      writeBlock(made[SHEETS.MEMBERS], 1, SAMPLE_DATA.members.map(function (m) {
        return [txtCell(m.name), txtCell(m.role), numCell(m.capacityMd), txtCell(m.status), txtCell(m.color), txtCell(m.email)];
      }));
      seeded++;
    }
    if (made[SHEETS.PROJECTS]) {
      writeBlock(made[SHEETS.PROJECTS], 1, SAMPLE_DATA.projects.map(function (p) {
        return [
          txtCell(p.id), txtCell(p.name), txtCell(p.client), txtCell(p.type), txtCell(p.status), txtCell(p.pm),
          dateCell(p.eventStart), dateCell(p.eventEnd), dateCell(p.kickoff), dateCell(p.settlementDue),
          txtCell(p.venue), numCell(p.guarantee), numCell(p.expectedAttendees), numCell(p.contractAmount),
          txtCell(p.note), dateCell(p.createdAt)
        ];
      }));
      seeded++;
    }
    if (made[SHEETS.ASSIGNMENTS]) {
      writeBlock(made[SHEETS.ASSIGNMENTS], 1, SAMPLE_DATA.assignments.map(function (a) {
        return [
          txtCell(a.id), txtCell(a.projectId), txtCell(a.member), txtCell(a.role), numCell(a.plannedMd),
          dateCell(a.start), dateCell(a.end), txtCell(a.status), txtCell(a.note)
        ];
      }));
      seeded++;
    }
    if (made[SHEETS.LOGS]) {
      writeBlock(made[SHEETS.LOGS], 1, SAMPLE_DATA.effortLogs.map(function (l) {
        return [
          dateCell(l.week), txtCell(l.member), txtCell(l.projectId), numCell(l.md),
          txtCell(l.memo), dtCell(l.loggedAt)
        ];
      }));
      seeded++;
    }
    if (made[SHEETS.MILESTONES]) {
      // A~E 만 쓴다 — F열은 [자동] 수식이므로 덮어쓰지 않는다.
      writeBlock(made[SHEETS.MILESTONES], 1, SAMPLE_DATA.milestones.map(function (m) {
        return [txtCell(m.projectId), txtCell(m.name), dateCell(m.due), dateCell(m.done), txtCell(m.owner)];
      }));
      seeded++;
    }
    if (made[SHEETS.SETTLEMENTS]) {
      // D·E·H·I 는 [자동] 수식이므로 A~C · F~G · J 만 나눠 쓴다.
      const s = made[SHEETS.SETTLEMENTS];
      writeBlock(s, 1, SAMPLE_DATA.settlements.map(function (t) {
        return [txtCell(t.projectId), numCell(t.revenue), numCell(t.directCost)];
      }));
      writeBlock(s, 6, SAMPLE_DATA.settlements.map(function (t) {
        return [numCell(t.preReg), numCell(t.attended)];
      }));
      writeBlock(s, 10, SAMPLE_DATA.settlements.map(function (t) { return [txtCell(t.status)]; }));
      seeded++;
    }
    if (made[SHEETS.ITEMS] && Array.isArray(SAMPLE_DATA.items)) {
      // A~L 만 쓴다 — M열 행사명은 [자동] 배열 수식
      writeBlock(made[SHEETS.ITEMS], 1, SAMPLE_DATA.items.map(function (it) {
        return [
          txtCell(it.id), txtCell(it.projectId), txtCell(it.milestone), txtCell(it.part), txtCell(it.block), txtCell(it.owner),
          txtCell(it.impact), txtCell(it.difficulty), numCell(it.plannedMd), dateCell(it.due), txtCell(it.status), txtCell(it.note)
        ];
      }));
      seeded++;
    }
    if (made[SHEETS.NOTES] && Array.isArray(SAMPLE_DATA.notes)) {
      writeBlock(made[SHEETS.NOTES], 1, SAMPLE_DATA.notes.map(function (n) {
        return [
          txtCell(n.id), txtCell(n.projectId), txtCell(n.milestone), txtCell(n.itemId), txtCell(n.part), txtCell(n.author),
          txtCell(n.authorName), dtCell(n.at), txtCell(n.type), txtCell(n.content), txtCell(n.resolved)
        ];
      }));
      seeded++;
    }
  }

  // ---------- 3-9. 설정 E열 수식 · 탭 순서 정리 · 빈 기본 시트 삭제 ----------
  // 설정!E 는 공통코드(G-*) + 프로젝트ID 합본이다. `공수기록` 탭 프로젝트ID 드롭다운 전용이고 대시보드는 읽지 않는다.
  // `프로젝트` 탭이 생긴 뒤에 넣어야 참조가 바로 잡히므로 여기서 넣는다.
  if (cfg && ss.getSheetByName(SHEETS.PROJECTS)) {
    cfg.getRange('E2').setFormula('={D2:D20;프로젝트!A2:A500}');
  }


  // 탭 순서: 입력 탭(프로젝트~정산) → 목록·카탈로그(설정 · 업무블럭) → 변경이력
  const order = [SHEETS.PROJECTS, SHEETS.ASSIGNMENTS, SHEETS.LOGS, SHEETS.MEMBERS,
    SHEETS.MILESTONES, SHEETS.ITEMS, SHEETS.NOTES, SHEETS.SETTLEMENTS, SHEETS.SETTINGS, SHEETS.BLOCKS, SHEETS.HISTORY];
  order.forEach(function (name, i) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(i + 1);
  });
  // 스프레드시트를 새로 만들면 따라오는 빈 시트('시트1' · 'Sheet1')를 치운다. 내용이 있으면 건드리지 않는다.
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (order.indexOf(name) >= 0) return;
    if (!/^(시트|Sheet)\s*\d*$/.test(name)) return;
    if (sheet.getLastRow() > 0 || sheet.getLastColumn() > 0) return;
    if (ss.getSheets().length <= 1) return;
    try { ss.deleteSheet(sheet); } catch (e) { /* 지울 수 없으면 그대로 둔다 */ }
  });
  const firstTab = ss.getSheetByName(SHEETS.PROJECTS);
  if (firstTab) ss.setActiveSheet(firstTab);
  SpreadsheetApp.flush();

  // ---------- 3-10. 결과 알림 ----------
  const summary = '탭 ' + created.length + '개 생성 · ' + skipped.length + '개 건너뜀';
  const detail = summary +
    (created.length > 0 ? '\n\n새로 만든 탭: ' + created.join(' · ') : '') +
    (skipped.length > 0 ? '\n이미 있어 그대로 둔 탭: ' + skipped.join(' · ') : '') +
    (seed
      ? (seeded > 0 ? '\n\n새로 만든 탭에 연습용 샘플 데이터를 넣었습니다. 실제 데이터를 넣기 전에 지우고 쓰세요.' : '')
      : '\n\n샘플 데이터 없이 빈 시트로 만들었습니다.');
  try { ss.toast(summary, '팀 보드 초기 설정', 8); } catch (e) { /* 토스트를 못 쓰는 환경이면 넘어간다 */ }
  try {
    SpreadsheetApp.getUi().alert('팀 보드 초기 설정', detail, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* 스크립트 편집기에서 실행하면 팝업을 띄울 수 없다 — 실행 기록으로 대신한다 */ }

  return { created: created, skipped: skipped, seeded: seeded };
}

// 샘플 없이 빈 시트로 초기 설정 (메뉴 [팀 보드 → 초기 설정 실행(빈 시트)])
function setupSheetsEmpty() {
  return setupSheets(false);
}

// ==================== 4. 시트 메뉴 · 자동 입력 ====================

// 시트를 열 때 상단에 [팀 보드] 메뉴를 붙인다.
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('팀 보드')
      .addItem('초기 설정 실행(샘플 포함)', 'setupSheets')
      .addItem('초기 설정 실행(빈 시트)', 'setupSheetsEmpty')
      .addItem('샘플 데이터 지우기(실제 입력 시작)', 'clearSampleData')
      .addSeparator()
      .addItem('프로젝트 ID 채우기', 'fillProjectIds')
      .addItem('선택 프로젝트 표준 마일스톤 생성', 'createMilestonesForSelection')
      .addItem('드롭다운 목록 새로고침', 'refreshValidations')
      .addSeparator()
      .addItem('대시보드 주소 보기', 'showDashboardUrl')
      .addToUi();
  } catch (e) { /* 메뉴를 못 붙이는 환경(권한 없는 열람자 등)에서는 조용히 넘어간다 */ }
}

// 메뉴 [팀 보드 → 드롭다운 목록 새로고침]
// 탭의 드롭다운(데이터 확인)을 계약 §3 기준으로 다시 건다. 팀원 상태에 '지원' 이 추가되는 등 목록이 바뀌었거나
// 행이 늘어 드롭다운이 없는 행이 생겼을 때 실행한다. 데이터 · 서식 · 수식은 건드리지 않는다.
function refreshValidations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const listRule = function (items) {
    return SpreadsheetApp.newDataValidation().requireValueInList(items, true).setAllowInvalid(false)
      .setHelpText('다음 중에서 골라 주세요: ' + items.join(' / ')).build();
  };
  const rangeRule = function (sheetName, a1, help) {
    const src = ss.getSheetByName(sheetName);
    if (!src) return null;
    return SpreadsheetApp.newDataValidation().requireValueInRange(src.getRange(a1), true).setAllowInvalid(true).setHelpText(help).build();
  };
  const apply = function (sheetName, a1, rule) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || !rule) return 0;
    sheet.getRange(a1).setDataValidation(rule);
    return 1;
  };
  let n = 0;
  n += apply(SHEETS.MEMBERS, 'B2:B200', rangeRule(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록에서 고르세요.'));
  n += apply(SHEETS.MEMBERS, 'D2:D200', listRule(['재직', '휴직', '퇴사', '지원']));
  n += apply(SHEETS.PROJECTS, 'D2:D500', rangeRule(SHEETS.SETTINGS, 'B2:B50', '설정 탭 유형 목록에서 고르세요.'));
  n += apply(SHEETS.PROJECTS, 'E2:E500', rangeRule(SHEETS.SETTINGS, 'A2:A50', '설정 탭 상태 목록에서 고르세요.'));
  n += apply(SHEETS.PROJECTS, 'F2:F500', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  n += apply(SHEETS.ASSIGNMENTS, 'B2:B1000', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
  n += apply(SHEETS.ASSIGNMENTS, 'C2:C1000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  n += apply(SHEETS.ASSIGNMENTS, 'D2:D1000', rangeRule(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록에서 고르세요.'));
  n += apply(SHEETS.ASSIGNMENTS, 'H2:H1000', listRule(['예정', '진행', '종료']));
  n += apply(SHEETS.LOGS, 'B2:B2000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  n += apply(SHEETS.LOGS, 'C2:C2000', rangeRule(SHEETS.SETTINGS, 'E2:E600', '프로젝트ID 또는 공통코드(G-내부 · G-영업 · G-휴가)를 고르세요.'));
  n += apply(SHEETS.MILESTONES, 'A2:A2000', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
  n += apply(SHEETS.MILESTONES, 'E2:E2000', rangeRule(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  n += apply(SHEETS.SETTLEMENTS, 'A2:A500', rangeRule(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
  n += apply(SHEETS.SETTLEMENTS, 'J2:J500', listRule(['미착수', '진행', '완료']));
  // 5턴 — 업무블럭 탭이 없으면 여기서 만든다(기본 카탈로그 포함). 세부항목 · 주석 탭은 있을 때만 드롭다운을 다시 건다(없으면 첫 쓰기 때 자동 생성)
  const blocksMade = ensureBlocksSheetApi_();
  const itemsSheet = ss.getSheetByName(SHEETS.ITEMS);
  const notesSheet = ss.getSheetByName(SHEETS.NOTES);
  if (itemsSheet) n += itemsRulesApi_(itemsSheet);
  if (notesSheet) n += notesRulesApi_(notesSheet);
  if (!blocksMade) n += blocksRulesApi_(ss.getSheetByName(SHEETS.BLOCKS));
  const nameCol = ensureMilestoneNameColumn_();                          // 마일스톤 탭 G열(행사명 자동) 이 없으면 만든다
  const itemNameCol = ensureNameColumnApi_(itemsSheet, 13, 2);           // 세부항목 탭 M열(행사명 자동) 이 없으면 만든다
  const emailCol = ensureMemberEmailColumn_(ss);                         // 6턴 D17 · 팀원 탭 F열(이메일) 헤더가 없으면 넣는다(데이터 보존)
  const message = '드롭다운 ' + n + '곳을 다시 걸었습니다.' +
    (blocksMade ? ' 업무블럭 탭을 만들고 기본 카탈로그 ' + Schema.DEFAULT_BLOCKS.length + '행을 넣었습니다(시트에서 다듬어 쓰세요).' : '') +
    (nameCol ? ' 마일스톤 탭 G열(행사명 자동)을 추가했습니다.' : '') +
    (itemNameCol ? ' 세부항목 탭 M열(행사명 자동)을 추가했습니다.' : '') +
    (emailCol ? ' 팀원 탭 F열(이메일)을 추가했습니다 — 회사 업무 계정을 적어 두면 대시보드가 로그인한 사람을 알아봅니다(선택).' : '') +
    ' 팀원 탭 상태에서 "지원"(타 팀·외부 지원 인력)을 고를 수 있습니다.';
  try { ss.toast(message, '팀 보드', 6); } catch (e) { /* 무시 */ }
  try { SpreadsheetApp.getUi().alert('드롭다운 목록 새로고침', message, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* 편집기에서 실행 */ }
  return n;
}

// "행사명(자동)" 열: 마일스톤 G열(프로젝트ID = A) · 세부항목 M열(프로젝트ID = B). 1행에 배열 수식 하나로 둔다
// (행을 지워도 사라지지 않고, 새 행도 자동으로 채워진다). 대시보드는 이 열을 읽지 않는다(계약 §3.5 · §3.10).
// 이미 배열 수식이 있으면 건드리지 않는다. col · pidCol 은 1 기준 열 번호(pidCol 기본 1 = A). 반환 = 새로 넣었는지
const HEADER_BG_Api_ = '#F3EDE2';   // 웜 페이퍼 톤 머리글 배경(setupSheets 의 HEADER_BG 와 같은 값 — 잠금 밖 헬퍼에서도 쓰려고 전역에 둔다)
function colLetterApi_(n) {
  let s = '';
  let k = Math.max(1, Math.floor(Number(n) || 1));
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
  return s;
}
function nameColumnFormulaApi_(pidCol) {
  const L = colLetterApi_(pidCol || 1);
  const ref = L + '1:' + L;
  return '=ARRAYFORMULA(IF(ROW(' + ref + ')=1,"행사명(자동)",IF(' + ref + '="","",IFERROR(VLOOKUP(' + ref + ',프로젝트!A:B,2,FALSE),""))))';
}
const MILESTONE_NAME_FORMULA = nameColumnFormulaApi_(1);
function ensureNameColumnApi_(sheet, col, pidCol) {
  if (!sheet) return false;
  const cell = sheet.getRange(1, col);
  if (/ARRAYFORMULA/i.test(cell.getFormula())) return false;
  if (sheet.getMaxColumns() < col) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
  cell.setFormula(nameColumnFormulaApi_(pidCol)).setFontWeight('bold').setBackground(HEADER_BG_Api_);
  try { sheet.setColumnWidth(col, 220); } catch (e) { /* 무시 */ }
  return true;
}
// 마일스톤 탭 G열 — 4턴 이름 유지(가이드·계약 §3.5 가 이 이름을 쓴다)
function ensureMilestoneNameColumn_(sheetOpt) {
  const sheet = sheetOpt || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MILESTONES);
  return ensureNameColumnApi_(sheet, 7, 1);
}

// 6턴 D17 — `팀원` 탭 F열(이메일) 헤더 보장. 4~5턴에 만든 시트를 그대로 쓰려는 마이그레이션용이다.
// F1 이 비어 있을 때만 헤더 한 칸을 쓴다. 이미 무언가 적혀 있으면(사람이 다른 이름을 붙였어도) 건드리지 않는다.
// 데이터(F2 아래)는 어떤 경우에도 지우거나 덮어쓰지 않는다. 반환 = 헤더를 새로 넣었는지
function ensureMemberEmailColumn_(ss) {
  const book = ss || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEETS.MEMBERS);
  if (!sheet) return false;                                   // 탭이 없으면 setupSheets 가 만들 때 6열로 만들어진다
  const headers = HEADERS[SHEETS.MEMBERS];
  const col = headers.length;                                 // 6 = F
  if (sheet.getMaxColumns() < col) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
  const cell = sheet.getRange(1, col);
  if (String(cell.getValue() === null || cell.getValue() === undefined ? '' : cell.getValue()).trim() !== '') return false;
  cell.setValue(headers[col - 1]).setFontWeight('bold').setBackground(HEADER_BG_Api_);
  try { sheet.setColumnWidth(col, 200); } catch (e) { /* 너비를 못 바꾸면 그대로 둔다 */ }
  try { sheet.getRange(2, col, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@'); } catch (e) { /* 무시 */ }
  return true;
}

// ==================== 4b. 5턴 탭 3개 — 서식 · 드롭다운 · 생성 헬퍼 ====================
// setupSheets(새 탭) · refreshValidations(기존 탭) · 첫 쓰기(ensure…) 가 같은 코드를 쓴다.
// 드롭다운 목록은 Schema.FIXED_ENUMS(임팩트·난이도·상태·유형·해결) 가 단일 원천이다.

function listRuleApi_(items) {
  return SpreadsheetApp.newDataValidation().requireValueInList(items, true).setAllowInvalid(false)
    .setHelpText('다음 중에서 골라 주세요: ' + items.join(' / ')).build();
}
function rangeRuleApi_(sheetName, a1, help) {
  const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!src) return null;
  return SpreadsheetApp.newDataValidation().requireValueInRange(src.getRange(a1), true).setAllowInvalid(true).setHelpText(help).build();
}
function applyRuleApi_(sheet, a1, rule) {
  if (!sheet || !rule) return 0;
  sheet.getRange(a1).setDataValidation(rule);
  return 1;
}

// 세부항목 탭 드롭다운: B 프로젝트ID · D 파트 · F 담당 · G/H 임팩트·난이도 · K 상태 → 건 수
function itemsRulesApi_(sheet) {
  if (!sheet) return 0;
  let n = 0;
  n += applyRuleApi_(sheet, 'B2:B2000', rangeRuleApi_(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
  n += applyRuleApi_(sheet, 'D2:D2000', rangeRuleApi_(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록(파트)에서 고르세요.'));
  n += applyRuleApi_(sheet, 'F2:F2000', rangeRuleApi_(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요.'));
  n += applyRuleApi_(sheet, 'G2:H2000', listRuleApi_(Schema.FIXED_ENUMS.level));
  n += applyRuleApi_(sheet, 'K2:K2000', listRuleApi_(Schema.FIXED_ENUMS.itemStatus));
  return n;
}

// 주석 탭 드롭다운: B 프로젝트ID · E 파트 · G 작성자 이름 · I 유형 · K 해결 → 건 수
function notesRulesApi_(sheet) {
  if (!sheet) return 0;
  let n = 0;
  n += applyRuleApi_(sheet, 'B2:B2000', rangeRuleApi_(SHEETS.PROJECTS, 'A2:A500', '프로젝트 탭의 프로젝트ID 에서 고르세요.'));
  n += applyRuleApi_(sheet, 'E2:E2000', rangeRuleApi_(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록(파트)에서 고르세요.'));
  n += applyRuleApi_(sheet, 'G2:G2000', rangeRuleApi_(SHEETS.MEMBERS, 'A2:A100', '팀원 탭 이름에서 고르세요(비워도 됩니다).'));
  n += applyRuleApi_(sheet, 'I2:I2000', listRuleApi_(Schema.FIXED_ENUMS.noteType));
  n += applyRuleApi_(sheet, 'K2:K2000', listRuleApi_(Schema.FIXED_ENUMS.resolved));
  return n;
}

// 업무블럭 탭 드롭다운: A 파트 · E/F 기본 임팩트·난이도 · H 주최형 제외 → 건 수
function blocksRulesApi_(sheet) {
  if (!sheet) return 0;
  let n = 0;
  n += applyRuleApi_(sheet, 'A2:A200', rangeRuleApi_(SHEETS.SETTINGS, 'C2:C50', '설정 탭 역할 목록(파트)에서 고르세요.'));
  n += applyRuleApi_(sheet, 'E2:F200', listRuleApi_(Schema.FIXED_ENUMS.level));
  n += applyRuleApi_(sheet, 'H2:H200', listRuleApi_(['예']));
  return n;
}

// 새로 만든 세부항목 탭: 열 너비 · 서식(I 계획 M/D · J 예정일) · 드롭다운 · M열 행사명 배열 수식
function initItemsSheetApi_(sheet) {
  const widths = [100, 110, 170, 110, 210, 90, 70, 70, 90, 110, 70, 220, 220];
  for (let i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  sheet.getRange('I2:I2000').setNumberFormat('0.0');
  sheet.getRange('J2:J2000').setNumberFormat('yyyy-mm-dd');
  itemsRulesApi_(sheet);
  ensureNameColumnApi_(sheet, 13, 2);   // M열 — 프로젝트ID 는 B열
}

// 새로 만든 주석 탭: 열 너비 · 서식(H 일시 초까지) · 내용 줄바꿈 · 드롭다운
function initNotesSheetApi_(sheet) {
  const widths = [100, 110, 170, 100, 110, 200, 110, 150, 90, 420, 60];
  for (let i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  sheet.getRange('H2:H2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('J2:J2000').setWrap(true);
  notesRulesApi_(sheet);
}

// 새로 만든 업무블럭 탭: 열 너비 · 서식 · 드롭다운 · 기본 카탈로그(Schema.DEFAULT_BLOCKS) 시드(비어 있을 때만)
function initBlocksSheetApi_(sheet) {
  const widths = [110, 220, 170, 90, 90, 90, 380, 90];
  for (let i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  sheet.getRange('D2:D200').setNumberFormat('0.0');
  sheet.getRange('G2:G200').setWrap(true);
  blocksRulesApi_(sheet);
  if (sheet.getLastRow() < 2) {
    const rows = Schema.DEFAULT_BLOCKS.map(function (b) {
      return [b.part, b.block, b.milestone, b.md, b.impact, b.difficulty, b.judge, b.skipForHost ? '예' : ''];
    });
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// 탭이 없으면 헤더를 쓰고 init 헬퍼로 서식·드롭다운(·기본 카탈로그)을 넣는다 → 새로 만들었는지. 있으면 아무것도 하지 않는다
function ensureSheetApi_(name, init) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(name)) return false;
  const sheet = ss.insertSheet(name);
  const headers = HEADERS[name];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(HEADER_BG_Api_);
  sheet.setFrozenRows(1);
  init(sheet);
  return true;
}
function ensureBlocksSheetApi_() { return ensureSheetApi_(SHEETS.BLOCKS, initBlocksSheetApi_); }   // 메뉴 [드롭다운 목록 새로고침] · 없으면 getBootstrap 은 기본 카탈로그를 쓴다
function ensureItemsSheetApi_() { return ensureSheetApi_(SHEETS.ITEMS, initItemsSheetApi_); }      // 첫 쓰기(saveRow · addItems) 때 자동 생성
function ensureNotesSheetApi_() { return ensureSheetApi_(SHEETS.NOTES, initNotesSheetApi_); }      // 첫 쓰기 때 자동 생성

// 메뉴 [팀 보드 → 대시보드 주소 보기]
function showDashboardUrl() {
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  const message = url
    ? (url + '\n\n이 주소를 복사해 팀에 공유하세요. 구글 계정으로 로그인한 팀원만 열 수 있습니다.')
    : '아직 웹 앱으로 배포되지 않았습니다. 가이드 4단계를 따라 배포하세요.';
  if (ui) ui.alert('대시보드 주소', message, ui.ButtonSet.OK);
  return url;
}

// 손으로 값을 넣을 때 비어 있는 칸을 대신 채운다.
//   프로젝트 탭 — 행사명(B)을 적었는데 프로젝트ID(A)가 비어 있으면 ID와 등록일(P)을 넣는다.
//   공수기록 탭 — A~D 중 무엇이든 고치면 기록일시(F)에 지금 시각을 넣는다.
function onEdit(e) {
  if (!e || !e.range) return;                       // 편집기에서 그냥 실행하면 아무 일도 하지 않는다
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();

  const firstRow = Math.max(2, range.getRow());
  const lastRow = range.getRow() + range.getNumRows() - 1;
  if (lastRow < firstRow) return;
  if (lastRow - firstRow > 200) return;             // 대량 붙여넣기는 [프로젝트 ID 채우기] 메뉴로 처리한다
  const firstCol = range.getColumn();
  const lastCol = firstCol + range.getNumColumns() - 1;
  const cell = function (row, col) {
    const v = sheet.getRange(row, col).getValue();
    return (v === null || v === undefined) ? '' : String(v).trim();
  };

  if (name === SHEETS.PROJECTS) {
    if (firstCol > 2 || lastCol < 2) return;        // 행사명(B) 이 편집 범위에 없으면 할 일 없음
    const todayCell = parseDate_(todayStr_());
    for (let r = firstRow; r <= lastRow; r++) {
      if (cell(r, 2) === '') continue;              // 행사명이 비었으면 아직 새 행이 아니다
      if (cell(r, 1) !== '') continue;              // 이미 ID 가 있으면 그대로 둔다
      const startCell = sheet.getRange(r, 7).getValue();   // G 행사 시작일
      const startStr = toDateStr_(startCell);
      const year = startStr ? Number(startStr.slice(0, 4)) : Number(todayStr_().slice(0, 4));
      sheet.getRange(r, 1).setValue(nextProjectId_(sheet, year));
      if (cell(r, 16) === '') sheet.getRange(r, 16).setValue(todayCell);
      SpreadsheetApp.flush();                       // 다음 행 번호가 이 값을 보고 이어지도록
    }
    return;
  }

  if (name === SHEETS.LOGS) {
    if (firstCol > 4) return;                       // A~D 밖(메모·기록일시)만 고쳤으면 할 일 없음
    const now = new Date();
    for (let r = firstRow; r <= lastRow; r++) {
      if (cell(r, 1) === '' && cell(r, 2) === '' && cell(r, 3) === '' && cell(r, 4) === '') continue;
      sheet.getRange(r, 6).setValue(now);
    }
  }
}

// 메뉴 [팀 보드 → 프로젝트 ID 채우기]
// 행사명은 적었는데 ID 가 비어 있는 행을 한 번에 채운다(붙여넣기로 여러 행을 넣었을 때 쓴다).
function fillProjectIds() {
  const sheet = getSheet_(SHEETS.PROJECTS);
  const width = HEADERS[SHEETS.PROJECTS].length;
  const lastRow = sheet.getLastRow();
  let filled = 0;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    const todayCell = parseDate_(todayStr_());
    const asText = function (v) { return (v === null || v === undefined) ? '' : String(v).trim(); };
    for (let i = 0; i < values.length; i++) {
      const row = i + 2;
      if (asText(values[i][0]) !== '') continue;    // 이미 ID 있음
      if (asText(values[i][1]) === '') continue;    // 행사명 없는 빈 행
      const startStr = toDateStr_(values[i][6]);
      const year = startStr ? Number(startStr.slice(0, 4)) : Number(todayStr_().slice(0, 4));
      sheet.getRange(row, 1).setValue(nextProjectId_(sheet, year));
      if (asText(values[i][15]) === '') sheet.getRange(row, 16).setValue(todayCell);
      SpreadsheetApp.flush();                       // 다음 행이 방금 만든 번호 다음으로 이어지도록
      filled++;
    }
  }

  const message = filled > 0
    ? '프로젝트 ID ' + filled + '개를 채웠습니다.'
    : '채울 행이 없습니다. 행사명(B열)을 적었는데 프로젝트ID(A열)가 비어 있는 행만 채웁니다.';
  try { SpreadsheetApp.getActiveSpreadsheet().toast(message, '프로젝트 ID 채우기', 6); } catch (e) { /* 무시 */ }
  return filled;
}

// 메뉴 [팀 보드 → 선택 프로젝트 표준 마일스톤 생성]
// 프로젝트 탭에서 행을 고른 뒤 실행하면, 그 프로젝트의 표준 마일스톤 9종을 행사일 기준으로 만든다.
// 실제 생성은 02 파트의 createStandardMilestones(projectId) 가 한다.
function createMilestonesForSelection() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  const say = function (title, text) {
    if (ui) ui.alert(title, text, ui.ButtonSet.OK);
    return text;
  };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEETS.PROJECTS) {
    return say('표준 마일스톤 생성', '먼저 "프로젝트" 탭으로 이동해 마일스톤을 만들 프로젝트 행을 고른 뒤 다시 실행하세요.');
  }

  const range = ss.getActiveRange();
  if (!range) {
    return say('표준 마일스톤 생성', '프로젝트 행을 고른 뒤 다시 실행하세요.');
  }

  const firstRow = Math.max(2, range.getRow());
  const lastRow = range.getRow() + range.getNumRows() - 1;
  const ids = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const v = sheet.getRange(r, 1).getValue();
    const id = (v === null || v === undefined) ? '' : String(v).trim();
    if (id !== '' && ids.indexOf(id) < 0) ids.push(id);
  }
  if (ids.length === 0) {
    return say('표준 마일스톤 생성',
      '선택한 행에 프로젝트ID 가 없습니다. 메뉴 [팀 보드 → 프로젝트 ID 채우기]를 먼저 실행하세요.');
  }

  let createdCount = 0;
  let skippedCount = 0;
  const failures = [];
  ids.forEach(function (id) {
    try {
      const result = createStandardMilestones(id);
      createdCount += (result && result.created) ? result.created.length : 0;
      skippedCount += (result && result.skipped) ? result.skipped.length : 0;
    } catch (err) {
      failures.push(id + ' — ' + (err && err.message ? err.message : err));
    }
  });

  const text = '대상 프로젝트 ' + ids.length + '개\n' +
    '새로 만든 마일스톤 ' + createdCount + '개 · 이미 있어 건너뜀 ' + skippedCount + '개' +
    (failures.length > 0 ? '\n\n처리하지 못한 프로젝트\n' + failures.join('\n') : '') +
    '\n\n"마일스톤" 탭에서 확인하세요.';
  return say('표준 마일스톤 생성', text);
}

// 메뉴 [팀 보드 → 샘플 데이터 지우기(실제 입력 시작)]
// 연습용 샘플을 한 번에 지우고 실제 데이터를 넣기 시작할 때 쓴다. 헤더·드롭다운·서식·[자동] 수식 열은 그대로 두고 입력 칸만 비운다.
//   프로젝트 · 배정 · 공수기록 · 팀원 · 주석: 2행부터 전체 입력 칸
//   마일스톤: A~E (F열 상태 수식 유지) · 세부항목: A~L (M열 행사명 수식 유지) · 정산: A~C · F~G · J (D·E·H·I 수식 유지)
//   설정 · 업무블럭(카탈로그) 탭은 건드리지 않는다
function clearSampleData() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (ui) {
    const answer = ui.alert('샘플 데이터 지우기',
      '프로젝트 · 배정 · 공수기록 · 팀원 · 마일스톤 · 세부항목 · 주석 · 정산 탭의 입력 내용을 모두 지웁니다.\n' +
      '설정 · 업무블럭 탭과 각 탭의 헤더 · 드롭다운 · 수식 열은 그대로 남습니다.\n\n' +
      '실제 데이터를 이미 넣었다면 그것도 함께 지워집니다. 계속할까요?',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) { return { ok: false, cleared: [] }; }
  }

  const cleared = [];
  withLock_(function () {
    const clearCols = function (name, ranges) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
      if (!sheet) return;
      const lastRow = Math.max(sheet.getLastRow(), 2);
      ranges.forEach(function (r) {            // r = [시작열, 열 개수]
        sheet.getRange(2, r[0], lastRow - 1, r[1]).clearContent();
      });
      cleared.push(name);
    };
    clearCols(SHEETS.PROJECTS, [[1, HEADERS[SHEETS.PROJECTS].length]]);
    clearCols(SHEETS.ASSIGNMENTS, [[1, HEADERS[SHEETS.ASSIGNMENTS].length]]);
    clearCols(SHEETS.LOGS, [[1, HEADERS[SHEETS.LOGS].length]]);
    clearCols(SHEETS.MILESTONES, [[1, 5]]);                 // A~E, F열 수식 유지
    clearCols(SHEETS.SETTLEMENTS, [[1, 3], [6, 2], [10, 1]]); // A~C · F~G · J, D·E·H·I 수식 유지
    clearCols(SHEETS.ITEMS, [[1, 12]]);                     // 5턴 · A~L, M열 행사명 수식 유지 (탭이 없으면 건너뜀)
    clearCols(SHEETS.NOTES, [[1, HEADERS[SHEETS.NOTES].length]]);   // 5턴 · 업무블럭 탭은 카탈로그라 건드리지 않는다

    // 팀원 탭은 샘플 이름(팀원1 · 팀원2 …)인 행만 지운다 — 이미 입력한 실제 팀원은 그대로 남는다
    const memSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEMBERS);
    if (memSheet && memSheet.getLastRow() >= 2) {
      const names = memSheet.getRange(2, 1, memSheet.getLastRow() - 1, 1).getValues();
      for (let i = names.length - 1; i >= 0; i--) {
        const n = String(names[i][0] === null || names[i][0] === undefined ? '' : names[i][0]).trim();
        if (/^팀원\d+$/.test(n)) memSheet.deleteRow(i + 2);
      }
      cleared.push(SHEETS.MEMBERS);
    }
    SpreadsheetApp.flush();
  });

  const message = '샘플을 지웠습니다(' + cleared.length + '개 탭). "팀원" 탭에서 샘플 이름(팀원1~5)만 지웠고 실제 팀원은 남겼습니다. ' +
    '팀원 명단을 마저 채운 뒤 "프로젝트" 탭에 행사명부터 입력하세요. 행사명을 적으면 프로젝트ID 와 등록일이 자동으로 채워집니다.';
  try { SpreadsheetApp.getActiveSpreadsheet().toast('샘플 데이터를 지웠습니다', '팀 보드', 6); } catch (e) { /* 무시 */ }
  if (ui) ui.alert('샘플 데이터 지우기', message, ui.ButtonSet.OK);
  return { ok: true, cleared: cleared };
}

// ==================== 5. 샘플 데이터 ====================
// 초기 설정에서 seedSample 이 참일 때 새로 만든 탭에 넣는 연습용 가상 데이터다.
// 실제 팀·행사 정보가 아니며, mock/sample-data.json 과 같은 내용이다(대시보드 mock 모드와 숫자가 일치).
const SAMPLE_DATA = {
  members: [
    {"name":"팀원1","role":"운영 PM","capacityMd":20,"status":"재직","color":"#EB6F2A","email":"team1@example.com"},
    {"name":"팀원2","role":"모객","capacityMd":20,"status":"재직","color":"#476580","email":"team2@example.com"},
    {"name":"팀원3","role":"현장 운영","capacityMd":20,"status":"재직","color":"#4A463F","email":""},
    {"name":"팀원4","role":"디자인·제작","capacityMd":20,"status":"재직","color":"#8C867A","email":"team4@example.com"},
    {"name":"팀원5","role":"정산·리포트","capacityMd":20,"status":"재직","color":"#B8431A","email":""}
  ],
  projects: [
    {"id":"P-2026-001","name":"가상 테크 컨퍼런스 2026","client":"가상 에이 주식회사","type":"① 리멤버 MICE 솔루션","status":"완료","pm":"팀원1","eventStart":"2026-09-03","eventEnd":"2026-09-04","kickoff":"","settlementDue":"2026-10-05","venue":"가상 컨벤션센터 A홀","guarantee":300,"expectedAttendees":350,"contractAmount":68000000,"note":"행사 종료 · 정산 마감","createdAt":"2026-05-28"},
    {"id":"P-2026-002","name":"가상 파트너 서밋","client":"가상 비 주식회사","type":"① 리멤버 MICE 솔루션","status":"진행","pm":"팀원1","eventStart":"2026-09-24","eventEnd":"2026-09-25","kickoff":"2026-06-22","settlementDue":"","venue":"가상 호텔 연회장","guarantee":250,"expectedAttendees":280,"contractAmount":92000000,"note":"행사 2주 전 · 랜딩페이지 컨펌 지연","createdAt":"2026-06-18"},
    {"id":"P-2026-003","name":"가상 브랜드 런칭 쇼케이스","client":"가상 씨 코리아","type":"④ 커스터마이즈","status":"준비","pm":"팀원1","eventStart":"2026-11-12","eventEnd":"2026-11-13","kickoff":"2026-08-14","settlementDue":"2026-12-14","venue":"가상 복합문화공간","guarantee":180,"expectedAttendees":220,"contractAmount":145000000,"note":"무대·영상 제작 포함","createdAt":"2026-08-10"},
    {"id":"P-2026-004","name":"가상 인재 채용 박람회","client":"리멤버(자체)","type":"③ DMS·주최형","status":"계약","pm":"팀원1","eventStart":"2026-12-03","eventEnd":"2026-12-04","kickoff":"","settlementDue":"","venue":"가상 전시장 2관","guarantee":null,"expectedAttendees":500,"contractAmount":52000000,"note":"자체 주최 · 담당자 배정 필요","createdAt":"2026-09-07"},
    {"id":"P-2027-001","name":"가상 신년 비즈니스 포럼","client":"가상 디 그룹","type":"② 일반 행사(게런티 없음)","status":"견적","pm":"팀원1","eventStart":"2027-02-05","eventEnd":"2027-02-05","kickoff":"","settlementDue":"2027-03-07","venue":"가상 비즈니스센터 홀","guarantee":null,"expectedAttendees":150,"contractAmount":21000000,"note":"견적 검토 중 · 표준 마일스톤 생성 전","createdAt":"2026-09-01"}
  ],
  assignments: [
    {"id":"A-0001","projectId":"P-2026-001","member":"팀원1","role":"운영 PM","plannedMd":12,"start":"2026-06-15","end":"2026-09-10","status":"종료","note":"전체 총괄"},
    {"id":"A-0002","projectId":"P-2026-001","member":"팀원2","role":"모객","plannedMd":8,"start":"2026-07-06","end":"2026-09-02","status":"종료","note":"사전 등록 운영"},
    {"id":"A-0003","projectId":"P-2026-001","member":"팀원3","role":"현장 운영","plannedMd":7,"start":"2026-08-17","end":"2026-09-05","status":"종료","note":"현장 세팅·운영"},
    {"id":"A-0004","projectId":"P-2026-001","member":"팀원5","role":"정산·리포트","plannedMd":3,"start":"2026-09-07","end":"2026-09-30","status":"종료","note":"정산·성과 보고"},
    {"id":"A-0005","projectId":"P-2026-002","member":"팀원1","role":"운영 PM","plannedMd":20,"start":"2026-07-01","end":"2026-10-09","status":"진행","note":"전체 총괄"},
    {"id":"A-0006","projectId":"P-2026-002","member":"팀원2","role":"모객","plannedMd":9,"start":"2026-08-03","end":"2026-09-23","status":"진행","note":"참가자 모집"},
    {"id":"A-0007","projectId":"P-2026-002","member":"팀원3","role":"현장 운영","plannedMd":8,"start":"2026-09-15","end":"2026-10-20","status":"진행","note":"현장 준비·철수"},
    {"id":"A-0008","projectId":"P-2026-002","member":"팀원4","role":"디자인·제작","plannedMd":6,"start":"2026-08-10","end":"2026-09-18","status":"종료","note":"그래픽·인쇄물"},
    {"id":"A-0009","projectId":"P-2026-003","member":"팀원1","role":"운영 PM","plannedMd":24,"start":"2026-08-17","end":"2026-11-20","status":"진행","note":"전체 총괄"},
    {"id":"A-0010","projectId":"P-2026-003","member":"팀원2","role":"모객","plannedMd":14,"start":"2026-11-01","end":"2026-11-30","status":"예정","note":"초청·등록 운영"},
    {"id":"A-0011","projectId":"P-2026-003","member":"팀원3","role":"현장 운영","plannedMd":6,"start":"2026-11-02","end":"2026-11-16","status":"예정","note":"현장 세팅·운영"},
    {"id":"A-0012","projectId":"P-2026-003","member":"팀원4","role":"디자인·제작","plannedMd":9,"start":"2026-10-12","end":"2026-11-13","status":"예정","note":"무대·영상 제작"},
    {"id":"A-0013","projectId":"P-2026-004","member":"팀원1","role":"운영 PM","plannedMd":14,"start":"2026-09-14","end":"2026-12-11","status":"예정","note":"담당자 추가 배정 필요"},
    {"id":"A-0014","projectId":"P-2027-001","member":"팀원1","role":"운영 PM","plannedMd":4,"start":"2026-11-16","end":"2027-02-06","status":"예정","note":"수주 예상 가배정"},
    {"id":"A-0015","projectId":"P-2027-001","member":"팀원2","role":"모객","plannedMd":8,"start":"2026-11-01","end":"2026-11-30","status":"예정","note":"수주 예상 가배정"}
  ],
  effortLogs: [
    {"week":"2026-07-20","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"운영계획 초안","loggedAt":"2026-07-27 09:12"},
    {"week":"2026-07-20","member":"팀원1","projectId":"P-2026-002","md":2,"memo":"발주처 회의","loggedAt":"2026-07-27 09:12"},
    {"week":"2026-07-20","member":"팀원1","projectId":"G-내부","md":1,"memo":"주간 회의","loggedAt":"2026-07-27 09:12"},
    {"week":"2026-07-20","member":"팀원2","projectId":"P-2026-001","md":2,"memo":"사전 등록 페이지 준비","loggedAt":"2026-07-27 09:24"},
    {"week":"2026-07-20","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-07-27 09:24"},
    {"week":"2026-07-20","member":"팀원2","projectId":"G-영업","md":1,"memo":"신규 제안 지원","loggedAt":"2026-07-27 09:24"},
    {"week":"2026-07-20","member":"팀원3","projectId":"P-2026-001","md":0.5,"memo":"현장 배치 검토","loggedAt":"2026-07-27 09:36"},
    {"week":"2026-07-20","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-07-27 09:36"},
    {"week":"2026-07-20","member":"팀원3","projectId":"G-영업","md":1.5,"memo":"제안 현장 확인","loggedAt":"2026-07-27 09:36"},
    {"week":"2026-07-20","member":"팀원4","projectId":"P-2026-003","md":1,"memo":"디자인 콘셉트 초안","loggedAt":"2026-07-27 09:48"},
    {"week":"2026-07-20","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-07-27 09:48"},
    {"week":"2026-07-20","member":"팀원4","projectId":"G-영업","md":1.5,"memo":"제안서 디자인","loggedAt":"2026-07-27 09:48"},
    {"week":"2026-07-20","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"정산 양식 준비","loggedAt":"2026-07-27 09:58"},
    {"week":"2026-07-20","member":"팀원5","projectId":"G-내부","md":1,"memo":"주간 회의·내부 보고","loggedAt":"2026-07-27 09:58"},
    {"week":"2026-07-20","member":"팀원5","projectId":"G-영업","md":0.5,"memo":"제안 금액 검토","loggedAt":"2026-07-27 09:58"},
    {"week":"2026-07-27","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"협력사 조율","loggedAt":"2026-08-03 09:12"},
    {"week":"2026-07-27","member":"팀원1","projectId":"P-2026-002","md":2,"memo":"운영 범위 정리","loggedAt":"2026-08-03 09:12"},
    {"week":"2026-07-27","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-03 09:12"},
    {"week":"2026-07-27","member":"팀원2","projectId":"P-2026-001","md":2,"memo":"사전 등록 안내","loggedAt":"2026-08-03 09:24"},
    {"week":"2026-07-27","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-03 09:24"},
    {"week":"2026-07-27","member":"팀원2","projectId":"G-영업","md":1,"memo":"신규 제안 지원","loggedAt":"2026-08-03 09:24"},
    {"week":"2026-07-27","member":"팀원3","projectId":"P-2026-001","md":0.5,"memo":"장비 목록 정리","loggedAt":"2026-08-03 09:36"},
    {"week":"2026-07-27","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-03 09:36"},
    {"week":"2026-07-27","member":"팀원3","projectId":"G-영업","md":1.5,"memo":"제안 현장 확인","loggedAt":"2026-08-03 09:36"},
    {"week":"2026-07-27","member":"팀원4","projectId":"P-2026-003","md":1,"memo":"키 비주얼 시안","loggedAt":"2026-08-03 09:48"},
    {"week":"2026-07-27","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-03 09:48"},
    {"week":"2026-07-27","member":"팀원4","projectId":"G-영업","md":1,"memo":"제안서 디자인","loggedAt":"2026-08-03 09:48"},
    {"week":"2026-07-27","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"지출 내역 정리","loggedAt":"2026-08-03 09:58"},
    {"week":"2026-07-27","member":"팀원5","projectId":"G-내부","md":1,"memo":"주간 회의·내부 보고","loggedAt":"2026-08-03 09:58"},
    {"week":"2026-08-03","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"운영계획서 작성","loggedAt":"2026-08-10 09:12"},
    {"week":"2026-08-03","member":"팀원1","projectId":"P-2026-002","md":2,"memo":"기초자료 검토","loggedAt":"2026-08-10 09:12"},
    {"week":"2026-08-03","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-10 09:12"},
    {"week":"2026-08-03","member":"팀원2","projectId":"P-2026-001","md":1.5,"memo":"등록 현황 점검","loggedAt":"2026-08-10 09:24"},
    {"week":"2026-08-03","member":"팀원2","projectId":"P-2026-002","md":1,"memo":"모객 계획 수립","loggedAt":"2026-08-10 09:24"},
    {"week":"2026-08-03","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-10 09:24"},
    {"week":"2026-08-03","member":"팀원3","projectId":"P-2026-001","md":0.5,"memo":"동선 설계","loggedAt":"2026-08-10 09:36"},
    {"week":"2026-08-03","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-10 09:36"},
    {"week":"2026-08-03","member":"팀원3","projectId":"G-영업","md":1,"memo":"제안 현장 확인","loggedAt":"2026-08-10 09:36"},
    {"week":"2026-08-03","member":"팀원4","projectId":"P-2026-003","md":1.5,"memo":"무대 시안","loggedAt":"2026-08-10 09:48"},
    {"week":"2026-08-03","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-10 09:48"},
    {"week":"2026-08-03","member":"팀원4","projectId":"G-영업","md":1,"memo":"제안서 디자인","loggedAt":"2026-08-10 09:48"},
    {"week":"2026-08-03","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"정산 자료 정리","loggedAt":"2026-08-10 09:58"},
    {"week":"2026-08-03","member":"팀원5","projectId":"G-내부","md":1,"memo":"주간 회의·내부 보고","loggedAt":"2026-08-10 09:58"},
    {"week":"2026-08-03","member":"팀원5","projectId":"G-휴가","md":1,"memo":"연차","loggedAt":"2026-08-10 09:58"},
    {"week":"2026-08-10","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"협력사 조율","loggedAt":"2026-08-17 09:12"},
    {"week":"2026-08-10","member":"팀원1","projectId":"P-2026-002","md":2,"memo":"답사 준비","loggedAt":"2026-08-17 09:12"},
    {"week":"2026-08-10","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-17 09:12"},
    {"week":"2026-08-10","member":"팀원2","projectId":"P-2026-001","md":1.5,"memo":"등록 안내 발송","loggedAt":"2026-08-17 09:24"},
    {"week":"2026-08-10","member":"팀원2","projectId":"P-2026-002","md":1.5,"memo":"랜딩페이지 초안","loggedAt":"2026-08-17 09:24"},
    {"week":"2026-08-10","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-17 09:24"},
    {"week":"2026-08-10","member":"팀원3","projectId":"P-2026-001","md":1,"memo":"현장 준비","loggedAt":"2026-08-17 09:36"},
    {"week":"2026-08-10","member":"팀원3","projectId":"P-2026-002","md":0.5,"memo":"답사 동행","loggedAt":"2026-08-17 09:36"},
    {"week":"2026-08-10","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-17 09:36"},
    {"week":"2026-08-10","member":"팀원4","projectId":"P-2026-002","md":1.5,"memo":"행사 그래픽 작업","loggedAt":"2026-08-17 09:48"},
    {"week":"2026-08-10","member":"팀원4","projectId":"P-2026-003","md":1,"memo":"제작 사양 정리","loggedAt":"2026-08-17 09:48"},
    {"week":"2026-08-10","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-17 09:48"},
    {"week":"2026-08-10","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"정산 자료 정리","loggedAt":"2026-08-17 09:58"},
    {"week":"2026-08-10","member":"팀원5","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-17 09:58"},
    {"week":"2026-08-17","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"운영계획서 확정","loggedAt":"2026-08-24 09:12"},
    {"week":"2026-08-17","member":"팀원1","projectId":"P-2026-002","md":1.5,"memo":"운영 범위 조율","loggedAt":"2026-08-24 09:12"},
    {"week":"2026-08-17","member":"팀원1","projectId":"P-2026-003","md":1,"memo":"착수 회의","loggedAt":"2026-08-24 09:12"},
    {"week":"2026-08-17","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-24 09:12"},
    {"week":"2026-08-17","member":"팀원2","projectId":"P-2026-001","md":1,"memo":"등록 마감 관리","loggedAt":"2026-08-24 09:24"},
    {"week":"2026-08-17","member":"팀원2","projectId":"P-2026-002","md":1.5,"memo":"랜딩페이지 수정","loggedAt":"2026-08-24 09:24"},
    {"week":"2026-08-17","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-24 09:24"},
    {"week":"2026-08-17","member":"팀원2","projectId":"G-휴가","md":1,"memo":"연차","loggedAt":"2026-08-24 09:24"},
    {"week":"2026-08-17","member":"팀원3","projectId":"P-2026-001","md":1.5,"memo":"현장 준비","loggedAt":"2026-08-24 09:36"},
    {"week":"2026-08-17","member":"팀원3","projectId":"P-2026-002","md":0.5,"memo":"장비 확인","loggedAt":"2026-08-24 09:36"},
    {"week":"2026-08-17","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-24 09:36"},
    {"week":"2026-08-17","member":"팀원4","projectId":"P-2026-002","md":2,"memo":"행사 그래픽 작업","loggedAt":"2026-08-24 09:48"},
    {"week":"2026-08-17","member":"팀원4","projectId":"P-2026-003","md":1,"memo":"디자인 보완","loggedAt":"2026-08-24 09:48"},
    {"week":"2026-08-17","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-24 09:48"},
    {"week":"2026-08-17","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"지출 승인 처리","loggedAt":"2026-08-24 09:58"},
    {"week":"2026-08-17","member":"팀원5","projectId":"G-내부","md":1,"memo":"주간 회의·내부 보고","loggedAt":"2026-08-24 09:58"},
    {"week":"2026-08-24","member":"팀원1","projectId":"P-2026-001","md":2,"memo":"행사 준비 점검","loggedAt":"2026-08-31 09:12"},
    {"week":"2026-08-24","member":"팀원1","projectId":"P-2026-002","md":1,"memo":"일정 조율","loggedAt":"2026-08-31 09:12"},
    {"week":"2026-08-24","member":"팀원1","projectId":"P-2026-003","md":1,"memo":"일정 수립","loggedAt":"2026-08-31 09:12"},
    {"week":"2026-08-24","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-31 09:12"},
    {"week":"2026-08-24","member":"팀원2","projectId":"P-2026-001","md":0.5,"memo":"참가자 안내","loggedAt":"2026-08-31 09:24"},
    {"week":"2026-08-24","member":"팀원2","projectId":"P-2026-002","md":2,"memo":"모객 실행","loggedAt":"2026-08-31 09:24"},
    {"week":"2026-08-24","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-31 09:24"},
    {"week":"2026-08-24","member":"팀원3","projectId":"P-2026-001","md":2,"memo":"현장 세팅 준비","loggedAt":"2026-08-31 09:36"},
    {"week":"2026-08-24","member":"팀원3","projectId":"P-2026-002","md":1,"memo":"장비 발주","loggedAt":"2026-08-31 09:36"},
    {"week":"2026-08-24","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-31 09:36"},
    {"week":"2026-08-24","member":"팀원4","projectId":"P-2026-002","md":2,"memo":"인쇄물 제작","loggedAt":"2026-08-31 09:48"},
    {"week":"2026-08-24","member":"팀원4","projectId":"P-2026-003","md":1,"memo":"디자인 검토","loggedAt":"2026-08-31 09:48"},
    {"week":"2026-08-24","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-31 09:48"},
    {"week":"2026-08-24","member":"팀원5","projectId":"P-2026-001","md":0.5,"memo":"정산 준비","loggedAt":"2026-08-31 09:58"},
    {"week":"2026-08-24","member":"팀원5","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-08-31 09:58"},
    {"week":"2026-08-24","member":"팀원5","projectId":"G-영업","md":0.5,"memo":"제안 금액 검토","loggedAt":"2026-08-31 09:58"},
    {"week":"2026-08-31","member":"팀원1","projectId":"P-2026-001","md":1.5,"memo":"행사 현장 총괄","loggedAt":"2026-09-07 09:12"},
    {"week":"2026-08-31","member":"팀원1","projectId":"P-2026-002","md":1.5,"memo":"운영계획 작성","loggedAt":"2026-09-07 09:12"},
    {"week":"2026-08-31","member":"팀원1","projectId":"P-2026-003","md":1,"memo":"협력사 조율","loggedAt":"2026-09-07 09:12"},
    {"week":"2026-08-31","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-07 09:12"},
    {"week":"2026-08-31","member":"팀원2","projectId":"P-2026-001","md":0.5,"memo":"현장 등록 운영","loggedAt":"2026-09-07 09:24"},
    {"week":"2026-08-31","member":"팀원2","projectId":"P-2026-002","md":2.5,"memo":"모객 실행","loggedAt":"2026-09-07 09:24"},
    {"week":"2026-08-31","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-07 09:24"},
    {"week":"2026-08-31","member":"팀원3","projectId":"P-2026-001","md":2,"memo":"현장 운영","loggedAt":"2026-09-07 09:36"},
    {"week":"2026-08-31","member":"팀원3","projectId":"P-2026-002","md":1.5,"memo":"장비 점검","loggedAt":"2026-09-07 09:36"},
    {"week":"2026-08-31","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-07 09:36"},
    {"week":"2026-08-31","member":"팀원4","projectId":"P-2026-002","md":1.5,"memo":"인쇄물 마감","loggedAt":"2026-09-07 09:48"},
    {"week":"2026-08-31","member":"팀원4","projectId":"P-2026-003","md":1.5,"memo":"제작 도면 작업","loggedAt":"2026-09-07 09:48"},
    {"week":"2026-08-31","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-07 09:48"},
    {"week":"2026-09-07","member":"팀원1","projectId":"P-2026-002","md":2.5,"memo":"행사 준비 점검","loggedAt":"2026-09-10 09:12"},
    {"week":"2026-09-07","member":"팀원1","projectId":"P-2026-003","md":1,"memo":"협력사 조율","loggedAt":"2026-09-10 09:12"},
    {"week":"2026-09-07","member":"팀원1","projectId":"P-2026-004","md":0.5,"memo":"착수 준비","loggedAt":"2026-09-10 09:12"},
    {"week":"2026-09-07","member":"팀원1","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-10 09:12"},
    {"week":"2026-09-07","member":"팀원2","projectId":"P-2026-002","md":3,"memo":"모객 마감","loggedAt":"2026-09-10 09:24"},
    {"week":"2026-09-07","member":"팀원2","projectId":"P-2026-003","md":0.5,"memo":"모객 계획","loggedAt":"2026-09-10 09:24"},
    {"week":"2026-09-07","member":"팀원2","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-10 09:24"},
    {"week":"2026-09-07","member":"팀원3","projectId":"P-2026-002","md":2,"memo":"현장 준비","loggedAt":"2026-09-10 09:36"},
    {"week":"2026-09-07","member":"팀원3","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-10 09:36"},
    {"week":"2026-09-07","member":"팀원3","projectId":"G-휴가","md":1,"memo":"연차","loggedAt":"2026-09-10 09:36"},
    {"week":"2026-09-07","member":"팀원4","projectId":"P-2026-002","md":1,"memo":"현장 안내물 마감","loggedAt":"2026-09-10 09:48"},
    {"week":"2026-09-07","member":"팀원4","projectId":"P-2026-003","md":2,"memo":"무대 제작 도면","loggedAt":"2026-09-10 09:48"},
    {"week":"2026-09-07","member":"팀원4","projectId":"G-내부","md":0.5,"memo":"주간 회의","loggedAt":"2026-09-10 09:48"}
  ],
  milestones: [
    {"projectId":"P-2026-001","name":"계약 체결","due":"2026-06-05","done":"2026-06-05","owner":""},
    {"projectId":"P-2026-001","name":"발주처 기초자료 수령","due":"2026-07-15","done":"2026-07-16","owner":"팀원1"},
    {"projectId":"P-2026-001","name":"답사","due":"2026-07-20","done":"2026-07-20","owner":"팀원1"},
    {"projectId":"P-2026-001","name":"랜딩페이지 컨펌","due":"2026-07-30","done":"2026-07-31","owner":"팀원2"},
    {"projectId":"P-2026-001","name":"운영계획서 확정","due":"2026-08-20","done":"2026-08-21","owner":"팀원1"},
    {"projectId":"P-2026-001","name":"행사 7일 전 점검","due":"2026-08-27","done":"2026-08-27","owner":"팀원1"},
    {"projectId":"P-2026-001","name":"행사 당일","due":"2026-09-03","done":"2026-09-03","owner":"팀원3"},
    {"projectId":"P-2026-001","name":"정산보고 제출","due":"2026-09-09","done":"2026-09-09","owner":"팀원5"},
    {"projectId":"P-2026-001","name":"정산 승인","due":"2026-10-04","done":"","owner":"팀원5"},
    {"projectId":"P-2026-002","name":"계약 체결","due":"2026-06-26","done":"2026-06-26","owner":""},
    {"projectId":"P-2026-002","name":"발주처 기초자료 수령","due":"2026-08-05","done":"2026-08-06","owner":"팀원1"},
    {"projectId":"P-2026-002","name":"답사","due":"2026-08-10","done":"2026-08-11","owner":"팀원1"},
    {"projectId":"P-2026-002","name":"랜딩페이지 컨펌","due":"2026-08-20","done":"","owner":"팀원2"},
    {"projectId":"P-2026-002","name":"운영계획서 확정","due":"2026-09-10","done":"","owner":"팀원1"},
    {"projectId":"P-2026-002","name":"행사 7일 전 점검","due":"2026-09-17","done":"","owner":"팀원1"},
    {"projectId":"P-2026-002","name":"행사 당일","due":"2026-09-24","done":"","owner":"팀원3"},
    {"projectId":"P-2026-002","name":"정산보고 제출","due":"2026-09-30","done":"","owner":""},
    {"projectId":"P-2026-002","name":"정산 승인","due":"2026-10-25","done":"","owner":""},
    {"projectId":"P-2026-003","name":"계약 체결","due":"2026-08-14","done":"2026-08-14","owner":""},
    {"projectId":"P-2026-003","name":"발주처 기초자료 수령","due":"2026-09-23","done":"","owner":"팀원1"},
    {"projectId":"P-2026-003","name":"답사","due":"2026-09-28","done":"","owner":"팀원1"},
    {"projectId":"P-2026-003","name":"랜딩페이지 컨펌","due":"2026-10-08","done":"","owner":"팀원2"},
    {"projectId":"P-2026-003","name":"운영계획서 확정","due":"2026-10-29","done":"","owner":"팀원1"},
    {"projectId":"P-2026-003","name":"행사 7일 전 점검","due":"2026-11-05","done":"","owner":"팀원1"},
    {"projectId":"P-2026-003","name":"행사 당일","due":"2026-11-12","done":"","owner":"팀원3"},
    {"projectId":"P-2026-003","name":"정산보고 제출","due":"2026-11-18","done":"","owner":""},
    {"projectId":"P-2026-003","name":"정산 승인","due":"2026-12-13","done":"","owner":""},
    {"projectId":"P-2026-004","name":"답사","due":"2026-10-19","done":"","owner":"팀원1"},
    {"projectId":"P-2026-004","name":"랜딩페이지 컨펌","due":"2026-10-29","done":"","owner":""},
    {"projectId":"P-2026-004","name":"운영계획서 확정","due":"2026-11-19","done":"","owner":"팀원1"},
    {"projectId":"P-2026-004","name":"행사 7일 전 점검","due":"2026-11-26","done":"","owner":"팀원1"},
    {"projectId":"P-2026-004","name":"행사 당일","due":"2026-12-03","done":"","owner":""},
    {"projectId":"P-2026-004","name":"정산보고 제출","due":"2026-12-09","done":"","owner":""},
    {"projectId":"P-2026-004","name":"정산 승인","due":"2027-01-03","done":"","owner":""}
  ],
  settlements: [
    {"projectId":"P-2026-001","revenue":68000000,"directCost":47600000,"preReg":420,"attended":290,"status":"완료"},
    {"projectId":"P-2026-002","revenue":null,"directCost":null,"preReg":null,"attended":null,"status":"미착수"},
    {"projectId":"P-2026-003","revenue":null,"directCost":null,"preReg":null,"attended":null,"status":"미착수"},
    {"projectId":"P-2026-004","revenue":null,"directCost":null,"preReg":null,"attended":null,"status":"미착수"},
    {"projectId":"P-2027-001","revenue":null,"directCost":null,"preReg":null,"attended":null,"status":"미착수"}
  ],
  // 5턴 · mock/sample-data.json 의 items 6 · notes 4 와 같은 내용. 배정 샘플에는 자동 행이 없다(첫 동기화 때 생기고, 수동 행과 겹치는 (담당·파트)는 overlaps 로만 알린다)
  items: [
    {"id":"W-000001","projectId":"P-2026-002","milestone":"답사","part":"운영 PM","block":"베뉴 서칭·계약","owner":"팀원1","impact":"상","difficulty":"중","plannedMd":2,"due":"","status":"완료","note":""},
    {"id":"W-000002","projectId":"P-2026-002","milestone":"운영계획서 확정","part":"운영 PM","block":"아젠다·프로그램 설정","owner":"팀원1","impact":"상","difficulty":"상","plannedMd":2,"due":"","status":"진행","note":""},
    {"id":"W-000003","projectId":"P-2026-002","milestone":"랜딩페이지 컨펌","part":"디자인·제작","block":"키비주얼","owner":"팀원4","impact":"상","difficulty":"중","plannedMd":2,"due":"","status":"진행","note":""},
    {"id":"W-000004","projectId":"P-2026-002","milestone":"행사 당일","part":"현장 운영","block":"등록 파트","owner":"","impact":"중","difficulty":"하","plannedMd":2,"due":"","status":"예정","note":""},
    {"id":"W-000005","projectId":"P-2026-003","milestone":"운영계획서 확정","part":"운영 PM","block":"연사·패널 섭외","owner":"","impact":"상","difficulty":"상","plannedMd":2,"due":"","status":"예정","note":""},
    {"id":"W-000006","projectId":"P-2026-002","milestone":"랜딩페이지 컨펌","part":"모객","block":"초청 메시지·랜딩페이지","owner":"팀원2","impact":"상","difficulty":"중","plannedMd":2,"due":"","status":"진행","note":""}
  ],
  notes: [
    {"id":"N-000001","projectId":"P-2026-002","milestone":"답사","itemId":"W-000001","part":"운영 PM","author":"mock@example.com","authorName":"팀원1","at":"2026-09-01 10:00:00","type":"요청","content":"수용 인원·전기·반입 시간·주차","resolved":""},
    {"id":"N-000002","projectId":"P-2026-002","milestone":"답사","itemId":"W-000001","part":"운영 PM","author":"mock@example.com","authorName":"팀원1","at":"2026-09-03 15:30:00","type":"판단 근거","content":"후보 2곳 견적 비교 완료, 반입 시간 조건이 좋은 곳으로","resolved":"예"},
    {"id":"N-000003","projectId":"P-2026-003","milestone":"운영계획서 확정","itemId":"W-000005","part":"운영 PM","author":"mock@example.com","authorName":"","at":"2026-09-08 09:10:00","type":"질문","content":"섭외비 예산 범위가 정해졌나요?","resolved":""},
    {"id":"N-000004","projectId":"P-2026-002","milestone":"랜딩페이지 컨펌","itemId":"","part":"디자인·제작","author":"mock@example.com","authorName":"팀원4","at":"2026-09-09 18:00:00","type":"결정","content":"키비주얼 B안으로 확정","resolved":"예"}
  ]
};


// ===== 대시보드 API (doGet · getBootstrap · 쓰기 3경로) =====
// 파일 위치: apps-script/parts/02-api.gs — 메인이 01-core-setup.gs 뒤에 이어 붙여 apps-script/Code.gs 로 병합한다.
//
// 이 파트가 정의하는 것
//   공개 함수 9개: doGet · getBootstrap · saveAssignments · completeMilestone · createStandardMilestones
//                 · saveRow · deleteRow · saveEffortWeek (4턴 — 대시보드 편집, 브리프 docs/code-brief-T4.md §3)
//                 · addItems (5턴 — 업무 블럭 추가, 브리프 docs/code-brief-T5.md §3. saveRow·deleteRow 는 items·notes 표로 확장)
//   전용 헬퍼: 이름 끝이 `Api_` 인 함수·상수만 (01 파트와 이름이 겹치지 않도록)
// 이 파트가 "사용만" 하는 것 (01 파트가 정의, 계약 docs/DATA-CONTRACT.md §8 — 여기서 재정의하지 않는다)
//   TZ · SHEETS · HEADERS · DEFAULT_SETTINGS · ROW_FORMULAS
//   getSheet_ · toDateStr_ · toDateTimeStr_ · toNum_ · todayStr_ · nowIso_ · parseDate_ · addDays_
//   readRows_ · readSettings_ · nextProjectId_ · nextAssignmentId_ · withLock_ · logHistory_ · userEmail_
//   Schema (아래 편집 계약 블록 — src/schema.js 원문, 전역)
// 원칙
//   1) 클라이언트로 나가는 값에 Date 객체 금지(계약 §1). 모든 반환은 finalizeApi_() 를 거쳐
//      assertNoDateApi_(재귀 검사) → JSON.parse(JSON.stringify()) 순으로 정리한다.
//   2) 시트에 쓰는 날짜는 parseDate_() 로 Date 로 바꿔 넣어 셀이 날짜형을 유지하게 한다.
//   3) 오류는 전부 한국어 메시지의 Error 로 던진다 → 프런트 withFailureHandler 가 화면에 표시.
//   4) 쓰기 경로는 모두 withLock_() 안에서 실행한다(동시 저장 충돌 방지). 잠금 안에서 다른 공개 쓰기 함수를 부르지 않는다(중첩 금지).
//   5) 모든 대시보드 쓰기는 logHistory_() 로 `변경이력` 탭에 남긴다(결정 D7).

// ---------- 편집 계약 (src/schema.js 원문 · 빌드 산출물 · 전역 Schema) ----------
// 표 정의·검증·삭제 규칙·이력 요약을 브라우저·Node 테스트·Apps Script 가 같은 파일로 쓴다.
// 두 마커 줄 사이는 `node scripts/build.js` 가 채운다. 고칠 것이 있으면 src/schema.js 를 고치고 다시 빌드한다.
/* __SCHEMA_BEGIN__ — 아래 블록은 scripts/build.js 가 src/schema.js 로 채운다. 직접 고치지 말 것 */
/*!
 * schema.js — 팀 프로젝트 보드 편집 계약 (표 정의 · 검증 · 삭제 규칙 · 이력 요약)
 * 기준 문서: docs/DATA-CONTRACT.md §9 · docs/SPEC-v1.md v1.2 §5.2
 *
 * 같은 파일이 세 곳에서 실행된다.
 *  - 브라우저: window.Schema (index.html 에 인라인)
 *  - Node 테스트: require('../src/schema.js')
 *  - Apps Script: scripts/build.js 가 apps-script/Code.gs 의 __SCHEMA_BEGIN__/__SCHEMA_END__ 블록에 원문을 채운다 → 전역 Schema
 *
 * 규칙
 *  - 순수 함수만 둔다. DOM·시트·현재 시각을 읽지 않는다("오늘"이 필요하면 ctx 로 받는다).
 *  - 검증 메시지는 한국어, 필드 라벨은 시트 헤더와 같은 문구를 쓴다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (root) { root.Schema = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var HEX_RE = /^#[0-9A-Fa-f]{6}$/;
  var PROJECT_ID_RE = /^P-\d{4}-\d{3,}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;   // 6턴 D17 — 형식만 본다(도메인 제한 없음)

  /* 고정 열거값 — 계약 §2.2 (설정 탭에 두지 않는다) */
  var FIXED_ENUMS = {
    assignmentStatus: ['예정', '진행', '종료'],
    memberStatus: ['재직', '휴직', '퇴사', '지원'],
    settlementStatus: ['미착수', '진행', '완료'],
    level: ['상', '중', '하'],                       // 5턴: 임팩트·난이도
    itemStatus: ['예정', '진행', '완료'],            // 5턴: 세부 항목 상태
    noteType: ['판단 근거', '요청', '질문', '결정'],  // 5턴: 주석 유형
    resolved: ['예']                                  // 5턴: 주석 해결(빈 값 = 미해결)
  };

  /* 5턴: 세부 항목 합계로 만든 배정 행의 표식(배정 탭 비고 열). 이 값이 있는 행만 동기화가 덮어쓴다 */
  var AUTO_ASSIGN_NOTE = '자동(세부항목)';

  /* 변경이력 탭 — 계약 §3.9 (6턴 D19: 되돌림 추가) */
  var HISTORY = {
    sheet: '변경이력',
    headers: ['일시', '사용자', '탭', '키', '동작', '변경 내용', '이전 행(백업)'],
    actions: ['추가', '수정', '삭제', '저장', '되돌림']
  };

  /* 필드 정의 도우미 */
  function f(key, col, label, type, opts) {
    var o = opts || {};
    return {
      key: key, col: col, label: label, type: type,
      required: !!o.required,
      enumFrom: o.enumFrom || '',      // settings 의 목록 이름(types·statuses·roles)
      enumFixed: o.enumFixed || '',    // FIXED_ENUMS 의 키
      nullable: !!o.nullable,          // 숫자: 빈 값 → null
      emptyAs: (o.emptyAs === undefined) ? undefined : o.emptyAs,   // 빈 값 대체값
      auto: !!o.auto,                  // 스크립트가 채움(폼에서 읽기 전용)
      immutable: !!o.immutable,        // 수정 모드에서 바꿀 수 없음
      integer: !!o.integer,
      step: o.step || 0,               // 0.5 단위 등
      min: (o.min === undefined) ? 0 : o.min,
      monday: !!o.monday               // 날짜가 월요일이어야 함
    };
  }

  /* 표 정의 — 열 순서는 계약 §3 과 완전히 같다 */
  var TABLES = {
    projects: {
      sheet: '프로젝트', label: '프로젝트', key: ['id'], width: 16, formulaCols: [],
      fields: [
        f('id', 0, '프로젝트ID', 'id', { auto: true, immutable: true }),
        f('name', 1, '행사명', 'text', { required: true }),
        f('client', 2, '발주처', 'text'),
        f('type', 3, '유형', 'enum', { required: true, enumFrom: 'types' }),
        f('status', 4, '상태', 'enum', { required: true, enumFrom: 'statuses' }),
        f('pm', 5, '담당PM', 'member'),
        f('eventStart', 6, '행사 시작일', 'date', { required: true }),
        f('eventEnd', 7, '행사 종료일', 'date', { required: true }),
        f('kickoff', 8, '착수일', 'date'),
        f('settlementDue', 9, '정산 예정일', 'date'),
        f('venue', 10, '베뉴', 'text'),
        f('guarantee', 11, '게런티(명)', 'number', { nullable: true, integer: true }),
        f('expectedAttendees', 12, '예상 참가(명)', 'number', { nullable: true, integer: true }),
        f('contractAmount', 13, '계약금액(원)', 'number', { emptyAs: 0, integer: true }),
        f('note', 14, '비고', 'textarea'),
        f('createdAt', 15, '등록일', 'date', { auto: true })
      ]
    },
    assignments: {
      sheet: '배정', label: '배정', key: ['id'], width: 9, formulaCols: [],
      fields: [
        f('id', 0, '배정ID', 'id', { auto: true, immutable: true }),
        f('projectId', 1, '프로젝트ID', 'project', { required: true }),
        f('member', 2, '팀원', 'member', { required: true }),
        f('role', 3, '역할', 'enum', { required: true, enumFrom: 'roles' }),
        f('plannedMd', 4, '계획 M/D', 'number', { emptyAs: 0, step: 0.5 }),
        f('start', 5, '배정 시작', 'date', { required: true }),
        f('end', 6, '배정 종료', 'date', { required: true }),
        f('status', 7, '상태', 'enum', { enumFixed: 'assignmentStatus', emptyAs: '예정' }),
        f('note', 8, '비고', 'text')
      ]
    },
    effortLogs: {
      sheet: '공수기록', label: '공수기록', key: ['week', 'member', 'projectId'], width: 6, formulaCols: [],
      fields: [
        f('week', 0, '주차', 'date', { required: true, monday: true }),
        f('member', 1, '팀원', 'member', { required: true }),
        f('projectId', 2, '프로젝트ID', 'projectCode', { required: true }),
        f('md', 3, '실투입 M/D', 'number', { emptyAs: 0, step: 0.5 }),
        f('memo', 4, '메모', 'text'),
        f('loggedAt', 5, '기록일시', 'datetime', { auto: true })
      ]
    },
    members: {
      sheet: '팀원', label: '팀원', key: ['name'], width: 6, formulaCols: [],
      fields: [
        f('name', 0, '이름', 'text', { required: true, immutable: true }),
        f('role', 1, '주역할', 'enum', { required: true, enumFrom: 'roles' }),
        f('capacityMd', 2, '월 가용 M/D', 'number', { step: 0.5 }),   // 빈 값 → settings.capacityMdPerMonth (normalize 에서)
        f('status', 3, '상태', 'enum', { enumFixed: 'memberStatus', emptyAs: '재직' }),
        f('color', 4, '색상', 'color'),
        /* 6턴 D17 — 회사 업무 계정. 비면 화면에서 이름을 고른다. 개인 연락처(휴대폰·개인 메일)는 넣지 않는다 */
        f('email', 5, '이메일', 'text')
      ]
    },
    milestones: {
      sheet: '마일스톤', label: '마일스톤', key: ['projectId', 'name'], width: 6, formulaCols: [5],
      fields: [
        f('projectId', 0, '프로젝트ID', 'project', { required: true }),
        f('name', 1, '마일스톤', 'text', { required: true }),
        f('due', 2, '예정일', 'date', { required: true }),
        f('done', 3, '완료일', 'date'),
        f('owner', 4, '담당', 'member')
      ]
    },
    settlements: {
      sheet: '정산', label: '정산', key: ['projectId'], width: 10, formulaCols: [3, 4, 7, 8],
      fields: [
        f('projectId', 0, '프로젝트ID', 'project', { required: true, immutable: true }),
        f('revenue', 1, '매출(원)', 'number', { nullable: true, integer: true }),
        f('directCost', 2, '직접비 집행(원)', 'number', { nullable: true, integer: true }),
        f('preReg', 5, '사전 등록(명)', 'number', { nullable: true, integer: true }),
        f('attended', 6, '현장 참석(명)', 'number', { nullable: true, integer: true }),
        f('status', 9, '정산 상태', 'enum', { enumFixed: 'settlementStatus', emptyAs: '미착수' })
      ]
    },
    /* 5턴 — 마일스톤 아래 파트별 업무 블럭(계약 §3.10) */
    items: {
      sheet: '세부항목', label: '세부 항목', key: ['id'], width: 13, formulaCols: [12],
      fields: [
        f('id', 0, '세부ID', 'id', { auto: true, immutable: true }),
        f('projectId', 1, '프로젝트ID', 'project', { required: true, immutable: true }),
        f('milestone', 2, '마일스톤', 'text', { required: true }),
        f('part', 3, '파트', 'enum', { required: true, enumFrom: 'roles' }),
        f('block', 4, '블럭', 'text', { required: true }),
        f('owner', 5, '담당', 'member'),
        f('impact', 6, '임팩트', 'enum', { enumFixed: 'level', emptyAs: '중' }),
        f('difficulty', 7, '난이도', 'enum', { enumFixed: 'level', emptyAs: '중' }),
        f('plannedMd', 8, '계획 M/D', 'number', { emptyAs: 0, step: 0.5 }),
        f('due', 9, '예정일', 'date'),
        f('status', 10, '상태', 'enum', { enumFixed: 'itemStatus', emptyAs: '예정' }),
        f('note', 11, '비고', 'text')
      ]
    },
    /* 5턴 — 파트별 주석(계약 §3.11). 작성자·일시는 서버가 채운다 */
    notes: {
      sheet: '주석', label: '주석', key: ['id'], width: 11, formulaCols: [],
      fields: [
        f('id', 0, '주석ID', 'id', { auto: true, immutable: true }),
        f('projectId', 1, '프로젝트ID', 'project', { required: true, immutable: true }),
        f('milestone', 2, '마일스톤', 'text', { required: true }),
        f('itemId', 3, '세부ID', 'text'),
        f('part', 4, '파트', 'enum', { required: true, enumFrom: 'roles' }),
        f('author', 5, '작성자', 'text', { auto: true }),
        f('authorName', 6, '작성자 이름', 'member'),
        f('at', 7, '일시', 'datetime', { auto: true }),
        f('type', 8, '유형', 'enum', { required: true, enumFixed: 'noteType', emptyAs: '요청' }),
        f('content', 9, '내용', 'textarea', { required: true }),
        f('resolved', 10, '해결', 'enum', { enumFixed: 'resolved' })
      ]
    },
    /* 5턴 — 업무 블럭 카탈로그(계약 §3.12). 시트에서만 편집, 대시보드는 읽기만 */
    blocks: {
      sheet: '업무블럭', label: '업무 블럭', key: ['part', 'block'], width: 8, formulaCols: [],
      fields: [
        f('part', 0, '파트', 'enum', { required: true, enumFrom: 'roles' }),
        f('block', 1, '블럭', 'text', { required: true }),
        f('milestone', 2, '기본 마일스톤', 'text'),
        f('md', 3, '기본 M/D', 'number', { emptyAs: 0, step: 0.5 }),
        f('impact', 4, '기본 임팩트', 'enum', { enumFixed: 'level', emptyAs: '중' }),
        f('difficulty', 5, '기본 난이도', 'enum', { enumFixed: 'level', emptyAs: '중' }),
        f('judge', 6, '판단에 필요한 내용', 'text'),
        f('skipForHost', 7, '주최형 제외', 'text')
      ]
    }
  };

  /* 5턴 — 기본 업무 블럭 카탈로그(지시문 §2.4). 업무블럭 탭이 없을 때 서버·mock 이 그대로 쓴다 */
  function b(part, block, milestone, md, impact, difficulty, judge, skipForHost) {
    return { part: part, block: block, milestone: milestone, md: md, impact: impact, difficulty: difficulty, judge: judge, skipForHost: !!skipForHost };
  }
  var DEFAULT_BLOCKS = [
    b('영업', '견적·제안서 작성', '계약 체결', 3, '상', '중', '범위·제외 항목·부가세 기준을 제안서에 명시했는가', true),
    b('영업', '계약 체결', '계약 체결', 1, '상', '하', '계약금·잔금 조건, 인보이스 대체 여부', true),
    b('영업', '고객 요구사항 정리', '발주처 기초자료 수령', 1, '중', '하', '타깃·게런티·모객 제외 조건', true),
    b('영업', '재계약·추가 제안 협의', '정산 승인', 1, '중', '중', '다음 행사 시기·규모', true),
    b('모객', '타깃 명단 확보', '발주처 기초자료 수령', 2, '상', '중', '타깃 조건(직무·지역·직급)과 사전 모수 자료'),
    b('모객', '초청 메시지·랜딩페이지', '랜딩페이지 컨펌', 2, '상', '중', '고객사 컨펌 마감일·톤앤매너'),
    b('모객', '등록 관리·리마인드', '행사 7일 전 점검', 2, '중', '하', '리마인드 횟수·채널'),
    b('모객', '참석 확정 콜', '행사 7일 전 점검', 3, '상', '중', '게런티 대비 확정 인원'),
    b('모객', '현장 등록 데스크', '행사 당일', 1, '중', '하', '명찰·체크인 방식'),
    b('운영 PM', '고객사 커뮤니케이션', '운영계획서 확정', 3, '상', '중', '주간 보고 주기·창구 1명'),
    b('운영 PM', '아젠다·프로그램 설정', '운영계획서 확정', 2, '상', '상', '세션 수·시간표·연사 확정 여부'),
    b('운영 PM', '베뉴 서칭·계약', '답사', 2, '상', '중', '수용 인원·전기·반입 시간·주차'),
    b('운영 PM', '연사·패널 섭외', '운영계획서 확정', 2, '상', '상', '섭외비·이동·자료 마감'),
    b('운영 PM', '운영계획서 작성', '운영계획서 확정', 2, '중', '중', '큐시트·역할표·비상 연락망'),
    b('운영 PM', '협력사 발주·관리', '행사 7일 전 점검', 2, '중', '중', '발주 범위·납기·현장 책임자'),
    b('운영 PM', '예산·정산 관리', '정산보고 제출', 2, '상', '중', '직접비 항목·증빙'),
    b('운영 PM', '리허설·큐시트', '행사 7일 전 점검', 1, '중', '하', '리허설 일시·참석자'),
    b('현장 운영', '등록 파트', '행사 당일', 2, '중', '하', '등록 인력 수·피크 시간'),
    b('현장 운영', '연사 파트', '행사 당일', 1, '상', '중', '연사 도착·대기실·발표 자료'),
    b('현장 운영', '무대·기술 파트', '행사 당일', 2, '상', '상', '음향·영상·조명 담당과 큐시트'),
    b('현장 운영', '케이터링·동선', '행사 당일', 1, '중', '하', '식음료 시간·동선·인원'),
    b('현장 운영', '현장 스태프 관리', '행사 당일', 1, '중', '중', '스태프 수·교육·복장'),
    b('현장 운영', '철수·정리', '행사 당일', 0.5, '하', '하', '반출 시간·파손 점검'),
    b('디자인·제작', '행사 기획 디자인(콘셉트부터)', '랜딩페이지 컨펌', 3, '상', '상', '콘셉트 시안 수·컨펌 단계'),
    b('디자인·제작', '키비주얼', '랜딩페이지 컨펌', 2, '상', '중', '고객사 브랜드 가이드'),
    b('디자인·제작', '인쇄·제작물 발주', '행사 7일 전 점검', 1, '중', '하', '수량·규격·납기'),
    b('디자인·제작', '영상 제작', '행사 7일 전 점검', 3, '상', '상', '분량·자막·납품 형식'),
    b('디자인·제작', '현장 그래픽·사이니지', '행사 7일 전 점검', 1, '중', '하', '설치 위치·사이즈'),
    b('디자인·제작', '웹·랜딩 디자인', '랜딩페이지 컨펌', 1, '중', '중', '등록 폼 항목'),
    b('정산·리포트', '정산서 작성', '정산보고 제출', 1, '상', '중', '매출·직접비 확정 여부'),
    b('정산·리포트', '결과 보고서', '정산보고 제출', 1, '중', '중', '참가·쇼업 수치·사진'),
    b('정산·리포트', '참가자 데이터 정리', '정산보고 제출', 1, '중', '하', '개인정보 처리 기준'),
    b('정산·리포트', '만족도 조사', '정산보고 제출', 1, '하', '하', '문항·발송 시점'),
    /* 6턴 D22 — 팀이 설정 탭에 추가한 역할 2종. 실제 프로젝트에서 쓰이고 있어 기본 카탈로그에 넣는다 */
    b('운영총괄', '착수 브리핑', '발주처 기초자료 수령', 0.5, '상', '중', '팀에 공유할 목표·제약·예산 범위'),
    b('운영총괄', '발주처 의사결정 관리', '운영계획서 확정', 1, '상', '상', '결정권자가 누구이고 승인 절차가 어떻게 되는가'),
    b('운영총괄', '리스크·이슈 판단', '행사 7일 전 점검', 1, '상', '상', '지금 가장 큰 불확실성과 대비책'),
    b('운영총괄', '행사 당일 총괄 판단', '행사 당일', 1, '상', '상', '현장에서 즉시 결정해야 할 항목'),
    b('운영총괄', '집행 승인', '정산보고 제출', 1, '상', '중', '직접비 집행 한도와 승인 기준'),
    b('운영총괄', '사후 리뷰', '정산 승인', 0.5, '중', '하', '다음 행사에 남길 개선점'),
    b('운영 Sub', '운영 문서 작성 지원', '운영계획서 확정', 1, '중', '중', '어느 문서를 누가 쓰고 언제 합치는가'),
    b('운영 Sub', '협력사 커뮤니케이션', '발주처 기초자료 수령', 1, '중', '중', '협력사별 창구와 회신 기한'),
    b('운영 Sub', '제작물·물품 발주 관리', '행사 7일 전 점검', 1, '중', '중', '발주 마감일과 입고 확인 방법'),
    b('운영 Sub', '현장 준비 지원', '행사 당일', 1, '중', '하', '반입·설치 순서와 담당'),
    b('운영 Sub', '정산 자료 취합', '정산보고 제출', 1, '중', '하', '증빙 수집 대상과 기한')
  ];

  /* ------------------------------------------------------------------ *
   * 6턴 D22 — 카탈로그가 비어 있는 파트에 붙이는 공통 블럭.
   * 팀이 설정 탭에 새 역할을 추가해도 "고를 블럭이 하나도 없는" 상태가 생기지 않게 한다.
   * ------------------------------------------------------------------ */
  var GENERIC_BLOCKS = [
    b('', '업무 범위 정리', '발주처 기초자료 수령', 0.5, '중', '하', '이 파트가 맡을 범위와 내놓을 결과물'),
    b('', '담당자 배정·일정 합의', '운영계획서 확정', 0.5, '중', '하', '누가 언제까지 맡는가'),
    b('', '진행 상황 점검', '행사 7일 전 점검', 0.5, '중', '하', '남은 일과 막힌 일'),
    b('', '행사 당일 대응', '행사 당일', 1, '중', '중', '당일 이 파트가 볼 자리와 연락 방법'),
    b('', '결과 정리·인수인계', '정산보고 제출', 0.5, '중', '하', '다음 사람이 이어받을 때 필요한 것')
  ];

  /* ------------------------------------------------------------------ *
   * 기본 도우미
   * ------------------------------------------------------------------ */

  function table(name) {
    var t = TABLES[name];
    if (!t) { throw new Error('알 수 없는 표입니다: ' + name); }
    return t;
  }

  function field(name, key) {
    var fs = table(name).fields;
    for (var i = 0; i < fs.length; i++) { if (fs[i].key === key) { return fs[i]; } }
    return null;
  }

  function lower(v) { return str(v).toLowerCase(); }

  function str(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v).trim();
  }

  function isDateStr(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) { return false; }
    var y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }

  function isMonday(s) {
    if (!isDateStr(s)) { return false; }
    var t = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
    return t.getUTCDay() === 1;
  }

  function listOf(ctx, name) {
    var s = ctx && ctx.settings;
    var l = s && s[name];
    return Array.isArray(l) ? l.map(str) : [];
  }

  function memberNames(ctx) {
    var d = ctx && ctx.data;
    var list = (d && Array.isArray(d.members)) ? d.members : [];
    return list.map(function (m) { return str(m && m.name); }).filter(function (n) { return n !== ''; });
  }

  function projectIds(ctx) {
    var d = ctx && ctx.data;
    var list = (d && Array.isArray(d.projects)) ? d.projects : [];
    return list.map(function (p) { return str(p && p.id); }).filter(function (n) { return n !== ''; });
  }

  function commonCodes(ctx) {
    var l = listOf(ctx, 'commonCodes');
    return l.length ? l : ['G-내부', 'G-영업', 'G-휴가'];
  }

  function has(list, v) { return list.indexOf(v) >= 0; }

  function sameKey(name, a, b) {
    var keys = table(name).key;
    for (var i = 0; i < keys.length; i++) {
      if (str(a && a[keys[i]]) !== str(b && b[keys[i]])) { return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 새 행 · 정규화
   * ------------------------------------------------------------------ */

  function emptyRow(name, ctx) {
    var t = table(name);
    var row = {};
    t.fields.forEach(function (fd) {
      if (fd.type === 'number') {
        row[fd.key] = (fd.emptyAs !== undefined) ? fd.emptyAs : (fd.nullable ? null : 0);
      } else if (fd.type === 'enum' && fd.emptyAs !== undefined) {
        row[fd.key] = fd.emptyAs;
      } else {
        row[fd.key] = '';
      }
    });
    if (name === 'projects') {
      var statuses = listOf(ctx, 'statuses');
      var types = listOf(ctx, 'types');
      row.status = statuses.length ? statuses[0] : '견적';
      row.type = types.length ? types[0] : '';
    }
    if (name === 'members') {
      var cap = ctx && ctx.settings && Number(ctx.settings.capacityMdPerMonth);
      row.capacityMd = (isFinite(cap) && cap > 0) ? cap : 20;
      var roles = listOf(ctx, 'roles');
      row.role = roles.length ? roles[0] : '';
    }
    return row;
  }

  /** 폼 문자열 → 계약 타입. 검증하지 않는다(형식 오류는 그대로 두고 validateRow 가 잡는다). */
  function normalizeRow(name, row, ctx) {
    var t = table(name);
    var out = {};
    t.fields.forEach(function (fd) {
      var v = row ? row[fd.key] : undefined;
      if (fd.type === 'number') {
        var s = str(v);
        if (s === '') {
          if (fd.emptyAs !== undefined) { out[fd.key] = fd.emptyAs; }
          else if (fd.nullable) { out[fd.key] = null; }
          else if (name === 'members' && fd.key === 'capacityMd') {
            var cap = ctx && ctx.settings && Number(ctx.settings.capacityMdPerMonth);
            out[fd.key] = (isFinite(cap) && cap > 0) ? cap : 20;
          } else { out[fd.key] = 0; }
        } else {
          var n = Number(s.replace(/,/g, ''));
          out[fd.key] = isFinite(n) ? n : s;   // 숫자가 아니면 원문 유지 → 검증에서 오류
        }
      } else if (fd.type === 'enum' && fd.emptyAs !== undefined) {
        out[fd.key] = str(v) === '' ? fd.emptyAs : str(v);
      } else {
        out[fd.key] = str(v);
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 검증
   * ------------------------------------------------------------------ */

  function validateField(name, fd, v, ctx, errors) {
    function err(msg) { errors.push({ field: fd.key, label: fd.label, message: msg }); }
    var s = (v === null || v === undefined) ? '' : String(v).trim();

    if (fd.required && s === '' && !fd.auto) { err(fd.label + ' 은(는) 필수입니다.'); return; }
    if (s === '' || v === null) { return; }

    switch (fd.type) {
      case 'text': case 'textarea': case 'id': case 'datetime':
        break;
      case 'date':
        if (!isDateStr(s)) { err(fd.label + ' 은(는) YYYY-MM-DD 형식의 실제 날짜여야 합니다: "' + s + '"'); return; }
        if (fd.monday && !isMonday(s)) { err(fd.label + ' 은(는) 그 주 월요일 날짜여야 합니다: ' + s); }
        break;
      case 'number':
        var n = (typeof v === 'number') ? v : Number(s.replace(/,/g, ''));
        if (!isFinite(n)) { err(fd.label + ' 은(는) 숫자여야 합니다: "' + s + '"'); return; }
        if (n < fd.min) { err(fd.label + ' 은(는) ' + fd.min + ' 이상이어야 합니다.'); }
        if (fd.integer && n !== Math.floor(n)) { err(fd.label + ' 은(는) 정수여야 합니다.'); }
        if (fd.step && Math.abs(n / fd.step - Math.round(n / fd.step)) > 1e-9) { err(fd.label + ' 은(는) ' + fd.step + ' 단위로 입력합니다.'); }
        break;
      case 'enum':
        var list = fd.enumFixed ? FIXED_ENUMS[fd.enumFixed] : listOf(ctx, fd.enumFrom);
        if (list.length && !has(list, s)) { err(fd.label + ' 값 "' + s + '" 이(가) 목록에 없습니다. (' + list.join(' / ') + ')'); }
        break;
      case 'member':
        if (!has(memberNames(ctx), s)) { err(fd.label + ' "' + s + '" 이(가) 팀원 탭에 없습니다.'); }
        break;
      case 'project':
        if (!has(projectIds(ctx), s)) { err(fd.label + ' "' + s + '" 이(가) 프로젝트 탭에 없습니다.'); }
        break;
      case 'projectCode':
        if (!has(projectIds(ctx), s) && !has(commonCodes(ctx), s)) {
          err(fd.label + ' "' + s + '" 이(가) 프로젝트 탭에도 공통코드(' + commonCodes(ctx).join(' / ') + ')에도 없습니다.');
        }
        break;
      case 'color':
        if (!HEX_RE.test(s)) { err(fd.label + ' 은(는) #RRGGBB 형식이어야 합니다: "' + s + '"'); }
        break;
      default:
        break;
    }
  }

  function dataList(ctx, name) {
    var d = ctx && ctx.data;
    var l = d && d[name];
    return Array.isArray(l) ? l : [];
  }

  /** 행 검증 → { ok, errors, values }. ctx = { settings, data, mode:'new'|'edit', expected } */
  function validateRow(name, row, ctx) {
    var t = table(name);
    var c = ctx || {};
    var mode = c.mode === 'edit' ? 'edit' : 'new';
    var values = normalizeRow(name, row, c);
    var errors = [];

    t.fields.forEach(function (fd) {
      if (fd.auto && fd.key !== 'id') { return; }              // 등록일·기록일시는 서버가 채움
      if (fd.type === 'id') {
        if (mode === 'edit' && str(values.id) === '') { errors.push({ field: 'id', label: fd.label, message: fd.label + ' 이(가) 비어 있습니다.' }); }
        return;
      }
      validateField(name, fd, values[fd.key], c, errors);
    });

    /* 수정 모드: 바꿀 수 없는 필드 */
    if (mode === 'edit' && c.expected) {
      t.fields.forEach(function (fd) {
        if (fd.immutable && str(values[fd.key]) !== str(c.expected[fd.key])) {
          errors.push({ field: fd.key, label: fd.label, message: fd.label + ' 은(는) 대시보드에서 바꿀 수 없습니다. 시트에서 직접 수정하세요.' });
        }
      });
    }

    /* 표별 규칙 */
    if (name === 'projects') {
      if (isDateStr(values.eventStart) && isDateStr(values.eventEnd) && values.eventStart > values.eventEnd) {
        errors.push({ field: 'eventEnd', label: '행사 종료일', message: '행사 종료일은 시작일보다 앞설 수 없습니다.' });
      }
      if (mode === 'edit' && !PROJECT_ID_RE.test(str(values.id))) {
        errors.push({ field: 'id', label: '프로젝트ID', message: '프로젝트ID 형식이 아닙니다: "' + str(values.id) + '"' });
      }
    }
    if (name === 'assignments') {
      if (isDateStr(values.start) && isDateStr(values.end) && values.start > values.end) {
        errors.push({ field: 'end', label: '배정 종료', message: '배정 종료는 시작보다 앞설 수 없습니다.' });
      }
    }
    /* 6턴 D17 — 이메일은 선택 입력이지만 넣었다면 형식은 지킨다 */
    if (name === 'members' && str(values.email) !== '' && !EMAIL_RE.test(str(values.email))) {
      errors.push({ field: 'email', label: '이메일', message: '이메일 형식이 아닙니다: "' + str(values.email) + '" (예: hong@company.com)' });
    }
    /* milestones: 완료일이 예정일보다 앞서는 것은 허용(추가 규칙 없음) */

    /* 5턴: 세부 항목·주석 — 마일스톤은 그 프로젝트에 있어야 하고, 주석의 세부ID 는 실제 항목이어야 한다 */
    if (name === 'items' || name === 'notes') {
      var msName = str(values.milestone), pidV = str(values.projectId);
      if (msName !== '' && pidV !== '') {
        var msOk = dataList(c, 'milestones').some(function (m) { return str(m.projectId) === pidV && str(m.name) === msName; });
        if (!msOk) { errors.push({ field: 'milestone', label: '마일스톤', message: '프로젝트 ' + pidV + ' 에 마일스톤 "' + msName + '" 이(가) 없습니다.' }); }
      }
    }
    if (name === 'notes' && str(values.itemId) !== '') {
      var itemOk = dataList(c, 'items').some(function (it) { return str(it.id) === str(values.itemId); });
      if (!itemOk) { errors.push({ field: 'itemId', label: '세부ID', message: '세부 항목 "' + values.itemId + '" 이(가) 없습니다.' }); }
    }

    /* 유일키(같은 행 자신은 제외) */
    var dup = findDuplicate(name, values, c);
    if (dup) { errors.push(dup); }

    return { ok: errors.length === 0, errors: errors, values: values };
  }

  function findDuplicate(name, values, c) {
    var list;
    if (name === 'members') {
      list = dataList(c, 'members').filter(function (m) { return str(m.name) === str(values.name); });
      if (c.mode === 'edit' && c.expected) { list = list.filter(function (m) { return !sameKey('members', m, c.expected); }); }
      if (list.length) { return { field: 'name', label: '이름', message: '같은 이름의 팀원이 이미 있습니다: ' + values.name }; }
      /* 6턴 D17 — 이메일은 팀원 사이에서 유일해야 자동 매칭이 흔들리지 않는다 */
      var mail = lower(values.email);
      if (mail !== '') {
        var mlist = dataList(c, 'members').filter(function (m) { return lower(m.email) === mail; });
        if (c.mode === 'edit' && c.expected) { mlist = mlist.filter(function (m) { return !sameKey('members', m, c.expected); }); }
        if (mlist.length) { return { field: 'email', label: '이메일', message: '같은 이메일이 이미 있습니다: ' + str(mlist[0].name) }; }
      }
    }
    if (name === 'milestones') {
      list = dataList(c, 'milestones').filter(function (m) { return sameKey('milestones', m, values); });
      if (c.mode === 'edit' && c.expected) { list = list.filter(function (m) { return !sameKey('milestones', m, c.expected); }); }
      if (list.length) { return { field: 'name', label: '마일스톤', message: '프로젝트 ' + values.projectId + ' 에 같은 이름의 마일스톤이 이미 있습니다: ' + values.name }; }
    }
    if (name === 'effortLogs') {
      list = dataList(c, 'effortLogs').filter(function (m) { return sameKey('effortLogs', m, values); });
      if (c.mode === 'edit' && c.expected) { list = list.filter(function (m) { return !sameKey('effortLogs', m, c.expected); }); }
      if (list.length) { return { field: 'projectId', label: '프로젝트ID', message: values.week + ' 주차 ' + values.member + ' 의 ' + values.projectId + ' 기록이 이미 있습니다.' }; }
    }
    if (name === 'items') {
      list = dataList(c, 'items').filter(function (it) {
        return str(it.projectId) === str(values.projectId) && str(it.milestone) === str(values.milestone) && str(it.block) === str(values.block);
      });
      if (c.mode === 'edit' && c.expected) { list = list.filter(function (it) { return !sameKey('items', it, c.expected); }); }
      if (list.length) { return { field: 'block', label: '블럭', message: '마일스톤 "' + values.milestone + '" 에 같은 블럭이 이미 있습니다: ' + values.block }; }
    }
    if (name === 'projects' && c.mode !== 'edit' && str(values.id) !== '') {
      list = dataList(c, 'projects').filter(function (p) { return str(p.id) === str(values.id); });
      if (list.length) { return { field: 'id', label: '프로젝트ID', message: '같은 프로젝트ID 가 이미 있습니다: ' + values.id }; }
    }
    return null;
  }

  /**
   * 주간 공수 묶음 검증 — 같은 팀원·주차의 행 전체를 한 번에 저장할 때.
   * rows: [{ projectId, md, memo }] → { ok, errors, warnings, values:[정규화 행(week·member 포함)] }
   */
  function validateEffortWeek(member, week, rows, ctx) {
    var c = ctx || {};
    var errors = [];
    var warnings = [];
    var m = str(member), w = str(week);
    if (m === '') { errors.push({ field: 'member', label: '팀원', message: '팀원을 고르세요.' }); }
    else if (!has(memberNames(c), m)) { errors.push({ field: 'member', label: '팀원', message: '팀원 "' + m + '" 이(가) 팀원 탭에 없습니다.' }); }
    if (!isDateStr(w)) { errors.push({ field: 'week', label: '주차', message: '주차는 YYYY-MM-DD 형식의 날짜여야 합니다.' }); }
    else if (!isMonday(w)) { errors.push({ field: 'week', label: '주차', message: '주차는 그 주 월요일 날짜여야 합니다: ' + w }); }
    if (!Array.isArray(rows)) { errors.push({ field: 'rows', label: '기록', message: '기록 행 목록이 배열이 아닙니다.' }); rows = []; }

    var seen = {};
    var total = 0;
    var values = rows.map(function (r, i) {
      var row = normalizeRow('effortLogs', { week: w, member: m, projectId: r && r.projectId, md: r && r.md, memo: r && r.memo }, c);
      var errs = [];
      ['projectId', 'md', 'memo'].forEach(function (k) { validateField('effortLogs', field('effortLogs', k), row[k], c, errs); });
      errs.forEach(function (e) { e.message = (i + 1) + '번째 행: ' + e.message; e.row = i; errors.push(e); });
      var code = str(row.projectId);
      if (code !== '') {
        if (seen[code]) { errors.push({ field: 'projectId', label: '프로젝트ID', row: i, message: (i + 1) + '번째 행: ' + code + ' 이(가) 같은 주차에 두 번 있습니다. 한 행으로 합치세요.' }); }
        seen[code] = true;
      }
      if (typeof row.md === 'number' && isFinite(row.md)) { total += row.md; }
      return row;
    });
    if (total > 5) { warnings.push('이번 주 합계 ' + total + ' M/D 가 주 5.0 을 넘습니다. 맞는지 확인하세요.'); }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, values: values, total: total };
  }

  /* ------------------------------------------------------------------ *
   * 삭제 규칙 (D8)
   * ------------------------------------------------------------------ */

  function countWhere(list, pred) { var n = 0; (list || []).forEach(function (x) { if (pred(x)) { n++; } }); return n; }

  /** → { ok, reason, cascade:{assignments,milestones,settlements,effortLogs} } */
  function deleteCheck(name, row, data) {
    var d = data || {};
    var cascade = { assignments: 0, milestones: 0, settlements: 0, effortLogs: 0, items: 0, notes: 0 };
    if (name === 'projects') {
      var pid = str(row && row.id);
      cascade.assignments = countWhere(d.assignments, function (a) { return str(a.projectId) === pid; });
      cascade.milestones = countWhere(d.milestones, function (m) { return str(m.projectId) === pid; });
      cascade.settlements = countWhere(d.settlements, function (s) { return str(s.projectId) === pid; });
      cascade.effortLogs = countWhere(d.effortLogs, function (l) { return str(l.projectId) === pid; });
      cascade.items = countWhere(d.items, function (it) { return str(it.projectId) === pid; });
      cascade.notes = countWhere(d.notes, function (n) { return str(n.projectId) === pid; });
      var revenueEntered = countWhere(d.settlements, function (s) { return str(s.projectId) === pid && s.revenue !== null && s.revenue !== undefined && str(s.revenue) !== ''; });
      if (cascade.effortLogs > 0) {
        return { ok: false, cascade: cascade, reason: '공수기록 ' + cascade.effortLogs + '건이 이 프로젝트를 참조해 삭제할 수 없습니다. 상태를 "드롭" 으로 바꾸세요.' };
      }
      if (revenueEntered > 0) {
        return { ok: false, cascade: cascade, reason: '정산 매출이 입력된 프로젝트는 삭제할 수 없습니다. 상태를 "드롭" 으로 바꾸거나 정산 값을 먼저 비우세요.' };
      }
      return { ok: true, cascade: cascade, reason: '' };
    }
    if (name === 'members') {
      var nm = str(row && row.name);
      var refs = {
        pm: countWhere(d.projects, function (p) { return str(p.pm) === nm; }),
        assignments: countWhere(d.assignments, function (a) { return str(a.member) === nm; }),
        effortLogs: countWhere(d.effortLogs, function (l) { return str(l.member) === nm; }),
        owner: countWhere(d.milestones, function (m) { return str(m.owner) === nm; }),
        items: countWhere(d.items, function (it) { return str(it.owner) === nm; }),
        notesAuthor: countWhere(d.notes, function (n) { return str(n.authorName) === nm; })
      };
      var parts = [];
      if (refs.pm) { parts.push('담당PM ' + refs.pm + '건'); }
      if (refs.assignments) { parts.push('배정 ' + refs.assignments + '건'); }
      if (refs.effortLogs) { parts.push('공수기록 ' + refs.effortLogs + '건'); }
      if (refs.owner) { parts.push('마일스톤 담당 ' + refs.owner + '건'); }
      if (refs.items) { parts.push('세부 항목 담당 ' + refs.items + '건'); }
      if (refs.notesAuthor) { parts.push('주석 작성자 이름 ' + refs.notesAuthor + '건'); }
      if (parts.length) {
        return { ok: false, cascade: cascade, reason: nm + ' 을(를) ' + parts.join(' · ') + ' 이(가) 참조해 삭제할 수 없습니다. 상태를 "퇴사" 로 바꾸세요.' };
      }
      return { ok: true, cascade: cascade, reason: '' };
    }
    if (name === 'milestones') {
      var mpid = str(row && row.projectId), mname = str(row && row.name);
      cascade.items = countWhere(d.items, function (it) { return str(it.projectId) === mpid && str(it.milestone) === mname; });
      cascade.notes = countWhere(d.notes, function (n) { return str(n.projectId) === mpid && str(n.milestone) === mname; });
      if (cascade.items > 0) {
        return { ok: false, cascade: cascade, reason: '세부 항목 ' + cascade.items + '건이 있어 삭제할 수 없습니다. 항목을 먼저 지우세요.' };
      }
      return { ok: true, cascade: cascade, reason: '' };
    }
    if (name === 'items') {
      var iid = str(row && row.id);
      cascade.notes = countWhere(d.notes, function (n) { return str(n.itemId) === iid; });
      return { ok: true, cascade: cascade, reason: '' };
    }
    if (name === 'notes') {
      return { ok: false, cascade: cascade, reason: '주석은 대시보드에서 지우지 않습니다. 해결로 표시하거나 시트에서 지우세요.' };
    }
    if (name === 'blocks') {
      return { ok: false, cascade: cascade, reason: '업무 블럭 카탈로그는 시트의 업무블럭 탭에서 고칩니다.' };
    }
    if (name === 'assignments' || name === 'effortLogs') {
      return { ok: true, cascade: cascade, reason: '' };
    }
    if (name === 'settlements') {
      return { ok: false, cascade: cascade, reason: '정산 행은 지우지 않습니다. 값을 비워서 저장하세요.' };
    }
    return { ok: false, cascade: cascade, reason: '알 수 없는 표입니다: ' + name };
  }

  /* ------------------------------------------------------------------ *
   * 키 · 변경 요약 · 셀 값
   * ------------------------------------------------------------------ */

  function keyOf(name, row) {
    var out = {};
    table(name).key.forEach(function (k) { out[k] = str(row && row[k]); });
    return out;
  }

  function keyLabel(name, row) {
    var k = keyOf(name, row);
    if (name === 'effortLogs') { return k.week + ' · ' + k.member + ' · ' + k.projectId; }
    if (name === 'milestones') { return k.projectId + ' · ' + k.name; }
    if (name === 'items') { return str(row && row.projectId) + ' · ' + str(row && row.milestone) + ' · ' + str(row && row.block) + (k.id ? ' (' + k.id + ')' : ''); }
    if (name === 'notes') { return k.id + (row && row.itemId ? ' · ' + str(row.itemId) : ''); }
    return table(name).key.map(function (x) { return k[x]; }).join(' · ');
  }

  function findRow(name, list, key) {
    var k = key || {};
    for (var i = 0; i < (list || []).length; i++) {
      if (sameKey(name, list[i], k)) { return i; }
    }
    return -1;
  }

  function display(v) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'number') { return String(v); }
    return String(v);
  }

  /** 바뀐 필드 목록(auto 필드 제외) */
  function diff(name, before, after) {
    var out = [];
    table(name).fields.forEach(function (fd) {
      if (fd.auto) { return; }
      var b = display(before ? before[fd.key] : ''), a = display(after ? after[fd.key] : '');
      if (b !== a) { out.push({ field: fd.key, label: fd.label, before: b, after: a }); }
    });
    return out;
  }

  /** 이력 "변경 내용" 문자열 */
  function summarize(name, action, before, after, extra) {
    var lines = [];
    if (action === '추가' || action === '저장') {
      table(name).fields.forEach(function (fd) {
        if (fd.auto) { return; }
        var v = display(after ? after[fd.key] : '');
        if (v !== '') { lines.push(fd.label + ': ' + v); }
      });
    } else if (action === '수정') {
      diff(name, before, after).forEach(function (d) { lines.push(d.label + ': ' + (d.before || '(빈 값)') + ' → ' + (d.after || '(빈 값)')); });
      if (!lines.length) { lines.push('변경 없음'); }
    } else if (action === '삭제') {
      lines.push(table(name).label + ' 행 삭제: ' + keyLabel(name, before));
    }
    if (extra) { lines.push(extra); }
    return lines.join('\n');
  }

  /** 열 순서대로 셀 값. 수식 열은 null(서버는 그 칸을 쓰지 않는다). 날짜는 문자열 그대로(서버가 Date 로 바꿔 쓴다) */
  function toValues(name, row) {
    var t = table(name);
    var out = [];
    for (var i = 0; i < t.width; i++) { out.push(has(t.formulaCols, i) ? null : ''); }
    t.fields.forEach(function (fd) {
      var v = row ? row[fd.key] : '';
      if (v === null || v === undefined) { v = ''; }
      out[fd.col] = v;
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 5턴 — 세부 항목 롤업 · 배정 동기화 · 주석 집계 (서버·mock·테스트 공용)
   * ------------------------------------------------------------------ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function utcOf(dateStr) {
    return new Date(Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10))));
  }
  function isoOf(t) { return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()); }
  /** 'YYYY-MM-DD' + n일. 형식이 아니면 '' */
  function addDaysStr(dateStr, n) {
    if (!isDateStr(dateStr)) { return ''; }
    var t = utcOf(dateStr);
    t.setUTCDate(t.getUTCDate() + Number(n || 0));
    return isoOf(t);
  }
  function numOr(v, d) { var n = Number(v); return (v === null || v === undefined || v === '' || !isFinite(n)) ? d : n; }
  function round1(n) { return Math.round(n * 10) / 10; }

  /** 임팩트 상 또는 난이도 상 = 핵심 항목 */
  function isKeyItem(item) { return str(item && item.impact) === '상' || str(item && item.difficulty) === '상'; }

  /** 항목의 날짜 = 예정일 || 그 마일스톤 예정일 || '' */
  function itemDate(item, milestones) {
    if (isDateStr(str(item && item.due))) { return str(item.due); }
    var list = Array.isArray(milestones) ? milestones : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (str(m.projectId) === str(item.projectId) && str(m.name) === str(item.milestone)) {
        return isDateStr(str(m.due)) ? str(m.due) : '';
      }
    }
    return '';
  }

  /**
   * 프로젝트 하나의 세부 항목 합계.
   * → { count, totalMd, mm, capacityMd, byPart:{}, byMember:{}, byMilestone:{}, unassignedMd, keyUnassigned:[항목] }
   */
  function itemRollup(data, projectId, settings) {
    var cap = numOr(settings && settings.capacityMdPerMonth, 20);
    if (!(cap > 0)) { cap = 20; }
    var pid = str(projectId);
    var items = dataList({ data: data }, 'items').filter(function (it) { return str(it.projectId) === pid; });
    var out = { count: items.length, totalMd: 0, mm: 0, capacityMd: cap, byPart: {}, byMember: {}, byMilestone: {}, unassignedMd: 0, keyUnassigned: [] };
    items.forEach(function (it) {
      var md = numOr(it.plannedMd, 0);
      out.totalMd += md;
      var part = str(it.part) || '(파트 없음)';
      out.byPart[part] = round1((out.byPart[part] || 0) + md);
      var ms = str(it.milestone) || '(마일스톤 없음)';
      out.byMilestone[ms] = round1((out.byMilestone[ms] || 0) + md);
      var owner = str(it.owner);
      if (owner) { out.byMember[owner] = round1((out.byMember[owner] || 0) + md); }
      else {
        out.unassignedMd += md;
        if (isKeyItem(it)) { out.keyUnassigned.push(it); }
      }
    });
    out.totalMd = round1(out.totalMd);
    out.unassignedMd = round1(out.unassignedMd);
    out.mm = Math.round((out.totalMd / cap) * 100) / 100;
    return out;
  }

  /**
   * 결정 D13(A안): 세부 항목 → 배정 자동 행. 서버(Code.gs)와 mock 이 같은 결과를 내야 한다.
   * project: 프로젝트 행 · items: 전체 세부 항목 · milestones: 전체 · assignments: 전체 배정 · settings
   * → { projectId, auto:[배정 행], manual:[그 프로젝트의 수동 행], overlaps:[{member, role, itemsMd, manualMd}], changed }
   *   같은 (담당, 파트)에 수동 행이 이미 있으면 자동 행을 만들지 않고 overlaps 로만 알린다(이중 집계 방지). 수동 행을 지우면 다음 동기화 때 자동 행이 생긴다
   *   auto 행: { id(기존 자동 행 id 재사용 또는 ''), projectId, member, role(파트), plannedMd, start, end, status:'예정', note:AUTO_ASSIGN_NOTE }
   */
  function assignmentsFromItems(project, items, milestones, assignments, settings) {
    var pid = str(project && project.id);
    var offs = (settings && settings.timelineOffsets) || {};
    var kickoffDays = numOr(offs.kickoffDays, -90);
    var settlementDays = numOr(offs.settlementDays, 30);
    var effStart = isDateStr(str(project.kickoff)) ? str(project.kickoff) : addDaysStr(str(project.eventStart), kickoffDays);
    var effEnd = isDateStr(str(project.settlementDue)) ? str(project.settlementDue) : addDaysStr(str(project.eventEnd), settlementDays);
    var eventEnd = isDateStr(str(project.eventEnd)) ? str(project.eventEnd) : effEnd;

    var groups = {};
    var order = [];
    (items || []).forEach(function (it) {
      if (str(it.projectId) !== pid) { return; }
      var owner = str(it.owner);
      if (!owner) { return; }
      var key = owner + '|' + str(it.part);
      if (!groups[key]) { groups[key] = { member: owner, role: str(it.part), md: 0, dates: [] }; order.push(key); }
      groups[key].md += numOr(it.plannedMd, 0);
      var d = itemDate(it, milestones);
      if (d) { groups[key].dates.push(d); }
    });

    var mine = (assignments || []).filter(function (a) { return str(a.projectId) === pid; });
    var existingAuto = mine.filter(function (a) { return str(a.note) === AUTO_ASSIGN_NOTE; });
    var manual = mine.filter(function (a) { return str(a.note) !== AUTO_ASSIGN_NOTE; });

    var auto = order.map(function (key) {
      var g = groups[key];
      var start, end;
      if (g.dates.length) {
        var min = g.dates.slice().sort()[0];
        var max = g.dates.slice().sort()[g.dates.length - 1];
        start = addDaysStr(min, -14);
        end = max;
        if (effStart && start < effStart) { start = effStart; }
        if (effEnd && end > effEnd) { end = effEnd; }
        if (start > end) { start = end; }
      } else {
        start = effStart || eventEnd;
        end = eventEnd || effEnd;
        if (start && end && start > end) { start = end; }
      }
      var prev = existingAuto.filter(function (a) { return str(a.member) === g.member && str(a.role) === g.role; })[0];
      return {
        id: prev ? str(prev.id) : '', projectId: pid, member: g.member, role: g.role,
        plannedMd: round1(g.md), start: start, end: end, status: '예정', note: AUTO_ASSIGN_NOTE
      };
    });

    var overlaps = [];
    auto = auto.filter(function (a) {
      var manualMd = 0, hit = false;
      manual.forEach(function (m) {
        if (str(m.member) === a.member && str(m.role) === a.role) { hit = true; manualMd += numOr(m.plannedMd, 0); }
      });
      if (hit) { overlaps.push({ member: a.member, role: a.role, itemsMd: a.plannedMd, manualMd: round1(manualMd) }); }
      return !hit;
    });

    var sig = function (a) { return [str(a.member), str(a.role), String(numOr(a.plannedMd, 0)), str(a.start), str(a.end)].join('|'); };
    var before = existingAuto.map(sig).sort().join(';');
    var after = auto.map(sig).sort().join(';');
    return { projectId: pid, auto: auto, manual: manual, overlaps: overlaps, changed: before !== after };
  }

  /** 주석 집계: itemId 가 있으면 그 항목, 없으면 (projectId, milestone) 전체 → { total, open } */
  function noteCounts(notes, target) {
    var list = Array.isArray(notes) ? notes : [];
    var t = target || {};
    var picked = list.filter(function (n) {
      if (t.itemId) { return str(n.itemId) === str(t.itemId); }
      return str(n.projectId) === str(t.projectId) && (!t.milestone || str(n.milestone) === str(t.milestone));
    });
    var open = picked.filter(function (n) { return str(n.resolved) !== '예'; }).length;
    return { total: picked.length, open: open };
  }

  /* ------------------------------------------------------------------ *
   * 6턴 — 본인 매칭 · 저장 가드 · 되돌리기 · 일괄 처리 · 카탈로그 파생 · 주간 행
   * (전부 순수 함수. 서버·화면·mock·테스트가 같은 판정을 쓴다)
   * ------------------------------------------------------------------ */

  /** D17 — 로그인 이메일로 팀원 이름 찾기. 못 찾으면 '' (화면이 이름 선택으로 넘어간다) */
  function matchMember(email, members) {
    var mail = lower(email);
    if (mail === '') { return ''; }
    var list = Array.isArray(members) ? members : [];
    for (var i = 0; i < list.length; i++) {
      if (lower(list[i].email) === mail && str(list[i].status) !== '퇴사') { return str(list[i].name); }
    }
    return '';
  }

  /**
   * D20 — 배정 묶음 저장으로 무엇이 사라지는지 미리 센다.
   * before·after = 그 프로젝트의 배정 행 배열 → { removed, removedRows, added, changed, warn }
   */
  function assignmentSaveGuard(before, after) {
    var b0 = Array.isArray(before) ? before : [];
    var a0 = Array.isArray(after) ? after : [];
    var afterIds = {};
    a0.forEach(function (r) { var id = str(r && r.id); if (id !== '') { afterIds[id] = r; } });
    var removedRows = b0.filter(function (r) { var id = str(r && r.id); return id !== '' && !afterIds[id]; });
    var added = a0.filter(function (r) { return str(r && r.id) === ''; }).length;
    var changed = 0;
    b0.forEach(function (r) {
      var id = str(r && r.id);
      var m = id !== '' && afterIds[id];
      if (m && diff('assignments', r, m).length) { changed++; }
    });
    return {
      removed: removedRows.length,
      removedRows: removedRows,
      added: added,
      changed: changed,
      warn: removedRows.length > 0
    };
  }

  /** 되돌리기가 손댈 수 있는 탭(시트 이름 → 표 이름) */
  var RESTORE_TABLES = {
    '프로젝트': 'projects', '배정': 'assignments', '공수기록': 'effortLogs', '팀원': 'members',
    '마일스톤': 'milestones', '정산': 'settlements', '세부항목': 'items', '주석': 'notes'
  };

  /* 연쇄 삭제 백업의 봉투 키 — 표 행에는 이 키만으로 이루어진 경우가 없다 */
  var CASCADE_KEYS = { project: 1, projects: 1, assignments: 1, milestones: 1, settlements: 1, effortLogs: 1, items: 1, notes: 1, item: 1, milestone: 1 };

  function isCascadeBackup(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { return false; }
    var keys = Object.keys(row);
    if (!keys.length) { return false; }
    for (var i = 0; i < keys.length; i++) { if (!CASCADE_KEYS[keys[i]]) { return false; } }
    return true;
  }

  function parseBackup(raw) {
    if (raw === null || raw === undefined) { return { ok: true, rows: [] }; }
    if (Array.isArray(raw)) { return { ok: true, rows: raw }; }
    if (typeof raw === 'object') { return { ok: true, rows: [raw] }; }
    var s = str(raw);
    if (s === '') { return { ok: true, rows: [] }; }
    try {
      var v = JSON.parse(s);
      if (Array.isArray(v)) { return { ok: true, rows: v }; }
      if (v && typeof v === 'object') { return { ok: true, rows: [v] }; }
      return { ok: false, rows: [] };
    } catch (e) { return { ok: false, rows: [] }; }
  }

  /**
   * D19 — 변경이력 한 줄을 되돌릴 수 있는지 판정한다.
   * entry = { sheet, key, action, backup }  ·  data = 현재 데이터 묶음
   * → { ok, reason, table, rows, mode }
   *   mode 'replace' = 그 키의 행 묶음을 백업으로 교체(배정 저장)
   *        'row'     = 단일 행 되돌리기(수정·삭제)
   *        'delete'  = 추가의 되돌리기(그 행을 지운다)
   */
  function restoreCheck(entry, data) {
    var e = entry || {};
    var sheet = str(e.sheet), action = str(e.action), key = str(e.key);
    var name = RESTORE_TABLES[sheet];
    var no = function (reason) { return { ok: false, reason: reason, table: name || '', rows: [], mode: '' }; };
    if (!name) { return no(sheet === HISTORY.sheet ? '변경이력 자체는 되돌릴 수 없습니다.' : '"' + (sheet || '(빈 탭)') + '" 탭은 되돌리기를 지원하지 않습니다. 시트에서 직접 고치세요.'); }
    if (action === '되돌림') { /* 되돌리기의 되돌리기는 허용 */ }
    var parsed = parseBackup(e.backup);
    if (!parsed.ok) { return no('백업 내용을 읽을 수 없어 되돌릴 수 없습니다. 시트에서 직접 고치세요.'); }
    var rows = parsed.rows;

    if (name === 'projects' && action === '삭제') {
      return no('프로젝트 삭제는 배정·마일스톤·정산이 함께 지워져 되돌릴 수 없습니다. 새 프로젝트로 다시 등록하세요.');
    }

    /* 연쇄 삭제의 백업은 표 행이 아니라 여러 탭을 담은 묶음이다 — 그대로 되돌리면 엉뚱한 행이 생긴다 */
    if (rows.some(isCascadeBackup)) {
      return no('이 기록은 되돌리기로 복원할 수 없습니다(여러 탭이 함께 바뀐 기록). 시트의 [변경이력] 탭에서 "이전 행(백업)" 을 보고 직접 되돌리세요.');
    }
    if (rows.length === 0) {
      if (action === '추가') { return { ok: true, reason: '', table: name, rows: [], mode: 'delete' }; }
      return no('되돌릴 이전 내용이 없습니다.');
    }
    if (action === '저장') { return { ok: true, reason: '', table: name, rows: rows, mode: 'replace' }; }
    if (action === '추가') { return { ok: true, reason: '', table: name, rows: rows, mode: 'delete' }; }
    /* 수정·삭제·되돌림 — 단일 행이면 row, 여러 행이면 묶음 교체 */
    return { ok: true, reason: '', table: name, rows: rows, mode: rows.length > 1 ? 'replace' : 'row' };
  }

  /** 되돌리기 한 줄 요약(버튼 옆 안내) */
  function restoreLabel(entry) {
    var e = entry || {};
    var c = restoreCheck(e, null);
    if (!c.ok) { return c.reason; }
    if (c.mode === 'delete') { return '이 추가를 취소하고 행을 지웁니다.'; }
    if (c.mode === 'replace') { return str(e.sheet) + ' ' + str(e.key) + ' 을(를) 저장 전 ' + c.rows.length + '행으로 되돌립니다.'; }
    return str(e.sheet) + ' ' + str(e.key) + ' 을(를) 이전 내용으로 되돌립니다.';
  }

  /**
   * D21 — 마일스톤 일괄 처리 검증.
   * action 'complete' → payload { done }  ·  'shift' → payload { days } 또는 { due }
   * rows = 대상 마일스톤 행(현재 값) → { ok, errors, warnings, values:[바뀐 행] }
   */
  function validateBulkMilestone(action, rows, payload, ctx) {
    var c = ctx || {};
    var p = payload || {};
    var errors = [];
    var warnings = [];
    var list = Array.isArray(rows) ? rows : [];
    var act = str(action);
    if (act !== 'complete' && act !== 'shift') {
      errors.push({ field: 'action', label: '동작', message: '완료 처리 또는 예정일 조정만 할 수 있습니다.' });
    }
    if (list.length === 0) {
      errors.push({ field: 'rows', label: '대상', message: '처리할 마일스톤을 하나 이상 고르세요.' });
    }
    var done = str(p.done);
    var due = str(p.due);
    var days = (p.days === null || p.days === undefined || p.days === '') ? null : Number(p.days);
    if (act === 'complete') {
      if (done !== '' && !isDateStr(done)) { errors.push({ field: 'done', label: '완료일', message: '완료일은 YYYY-MM-DD 형식의 날짜여야 합니다.' }); }
      if (done === '') { errors.push({ field: 'done', label: '완료일', message: '완료일을 고르세요.' }); }
    }
    if (act === 'shift') {
      var hasDue = due !== '';
      var hasDays = days !== null && isFinite(days) && Math.round(days) === days;
      if (hasDue && !isDateStr(due)) { errors.push({ field: 'due', label: '예정일', message: '예정일은 YYYY-MM-DD 형식의 날짜여야 합니다.' }); }
      if (!hasDue && !hasDays) { errors.push({ field: 'days', label: '조정', message: '며칠 미룰지(정수) 또는 새 예정일을 넣으세요.' }); }
      if (!hasDue && hasDays && days === 0) { errors.push({ field: 'days', label: '조정', message: '0일은 바뀌는 것이 없습니다.' }); }
    }

    var values = list.map(function (r) {
      var row = normalizeRow('milestones', r, c);
      if (act === 'complete') {
        row.done = done;
        if (isDateStr(row.due) && isDateStr(done) && addDaysStr(done, 365) < row.due) {
          warnings.push(str(row.name) + ': 완료일이 예정일보다 1년 이상 빠릅니다. 날짜를 확인하세요.');
        }
      } else if (act === 'shift') {
        if (due !== '' && isDateStr(due)) { row.due = due; }
        else if (days !== null && isFinite(days) && isDateStr(row.due)) { row.due = addDaysStr(row.due, Math.round(days)); }
      }
      return row;
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings, values: values };
  }

  /**
   * D22 — 카탈로그에 없는 파트를 공통 블럭으로 채운다.
   * → { list, derivedParts } · list 는 원본 순서 유지 + 파생분을 뒤에 붙인다
   */
  function blocksWithFallback(blocks, settings) {
    var src = (Array.isArray(blocks) ? blocks : []).filter(function (x) { return str(x && x.part) !== '' && str(x && x.block) !== ''; });
    var base = src.length ? src : DEFAULT_BLOCKS;
    var have = {};
    base.forEach(function (x) { have[str(x.part)] = true; });
    var roles = (settings && Array.isArray(settings.roles)) ? settings.roles : [];
    var out = base.slice();
    var derivedParts = [];
    roles.forEach(function (role) {
      var part = str(role);
      if (part === '' || have[part]) { return; }
      derivedParts.push(part);
      GENERIC_BLOCKS.forEach(function (g) {
        out.push({
          part: part, block: g.block, milestone: g.milestone, md: g.md,
          impact: g.impact, difficulty: g.difficulty, judge: g.judge, skipForHost: g.skipForHost
        });
      });
    });
    return { list: out, derivedParts: derivedParts, usedDefault: src.length === 0 };
  }

  /**
   * D18 — "내 주간 공수" 한 화면에 채울 행을 만든다.
   * ① 그 주(월~일)와 겹치는 내 배정 프로젝트 ② 공통코드 3종 ③ 이미 기록된 행(값 채움)
   * → [{ projectId, label, md, memo, source:'배정'|'공통'|'기록', logged:bool }]
   */
  function weekEffortRows(member, week, data) {
    var d = data || {};
    var m = str(member), w = str(week);
    var rows = [];
    var index = {};
    var weekEnd = isDateStr(w) ? addDaysStr(w, 6) : '';

    function push(code, label, source) {
      var key = str(code);
      if (key === '' || index[key]) { return; }
      index[key] = { projectId: key, label: str(label) || key, md: null, memo: '', source: source, logged: false };
      rows.push(index[key]);
    }

    var projects = Array.isArray(d.projects) ? d.projects : [];
    function projectLabel(pid) {
      for (var i = 0; i < projects.length; i++) { if (str(projects[i].id) === str(pid)) { return str(projects[i].name) || str(pid); } }
      return str(pid);
    }

    (Array.isArray(d.assignments) ? d.assignments : []).forEach(function (a) {
      if (str(a.member) !== m) { return; }
      if (w !== '' && isDateStr(str(a.start)) && isDateStr(str(a.end))) {
        if (str(a.end) < w || str(a.start) > weekEnd) { return; }     // 그 주와 안 겹치면 뺀다
      }
      push(a.projectId, projectLabel(a.projectId), '배정');
    });

    var codes = (d.settings && Array.isArray(d.settings.commonCodes)) ? d.settings.commonCodes : [];
    codes.forEach(function (code) { push(code, code, '공통'); });

    (Array.isArray(d.effortLogs) ? d.effortLogs : []).forEach(function (l) {
      if (str(l.member) !== m || str(l.week) !== w) { return; }
      var code = str(l.projectId);
      if (!index[code]) { push(code, projectLabel(code), '기록'); }
      index[code].md = (l.md === null || l.md === undefined || l.md === '') ? null : Number(l.md);
      index[code].memo = str(l.memo);
      index[code].logged = true;
    });

    return rows;
  }

  return {
    TABLES: TABLES,
    AUTO_ASSIGN_NOTE: AUTO_ASSIGN_NOTE,
    DEFAULT_BLOCKS: DEFAULT_BLOCKS,
    GENERIC_BLOCKS: GENERIC_BLOCKS,
    RESTORE_TABLES: RESTORE_TABLES,
    matchMember: matchMember,
    assignmentSaveGuard: assignmentSaveGuard,
    restoreCheck: restoreCheck,
    restoreLabel: restoreLabel,
    validateBulkMilestone: validateBulkMilestone,
    blocksWithFallback: blocksWithFallback,
    weekEffortRows: weekEffortRows,
    addDaysStr: addDaysStr,
    isKeyItem: isKeyItem,
    itemDate: itemDate,
    itemRollup: itemRollup,
    assignmentsFromItems: assignmentsFromItems,
    noteCounts: noteCounts,
    FIXED_ENUMS: FIXED_ENUMS,
    HISTORY: HISTORY,
    field: field,
    isDateStr: isDateStr,
    isMonday: isMonday,
    emptyRow: emptyRow,
    normalizeRow: normalizeRow,
    validateRow: validateRow,
    validateEffortWeek: validateEffortWeek,
    deleteCheck: deleteCheck,
    keyOf: keyOf,
    keyLabel: keyLabel,
    findRow: findRow,
    diff: diff,
    summarize: summarize,
    toValues: toValues
  };
});
/* __SCHEMA_END__ */

// ---------- 고정값 (계약 §2.2 고정 열거값 · §3 열 개수 · §3.8 ID 형식) ----------
const ENUMS_Api_ = {
  assignmentStatus: ['예정', '진행', '종료'],
  memberStatus: ['재직', '휴직', '퇴사', '지원'],
  settlementStatus: ['미착수', '진행', '완료']
};

// 대시보드 폼(saveRow)으로 편집할 수 있는 표 (결정 D6 · 5턴 items·notes 추가). 배정은 saveAssignments · 설정·업무블럭은 시트 전용
const EDITABLE_TABLES_Api_ = ['projects', 'members', 'effortLogs', 'milestones', 'settlements', 'items', 'notes'];

// 변경이력에서 대시보드로 보내는 최근 건수
const HISTORY_LIMIT_Api_ = 30;

// HEADERS 가 예상과 다른 형태일 때를 대비한 열 개수 예비값 (계약 §3.1~3.7)
const COL_COUNT_Api_ = {
  '프로젝트': 16, '배정': 9, '공수기록': 6, '팀원': 6, '마일스톤': 7, '정산': 10, '설정': 12,
  '세부항목': 13, '주석': 11, '업무블럭': 8
};

// 열 인덱스(0 기준) — 계약 §3 열 순서 그대로. [자동] 수식 열은 인덱스를 두지 않는다(읽지 않음).
const COL_Api_ = {
  project: {
    id: 0, name: 1, client: 2, type: 3, status: 4, pm: 5, eventStart: 6, eventEnd: 7,
    kickoff: 8, settlementDue: 9, venue: 10, guarantee: 11, expectedAttendees: 12,
    contractAmount: 13, note: 14, createdAt: 15
  },
  assignment: { id: 0, projectId: 1, member: 2, role: 3, plannedMd: 4, start: 5, end: 6, status: 7, note: 8 },
  log: { week: 0, member: 1, projectId: 2, md: 3, memo: 4, loggedAt: 5 },
  member: { name: 0, role: 1, capacityMd: 2, status: 3, color: 4, email: 5 /* 6턴 D17 */ },
  milestone: { projectId: 0, name: 1, due: 2, done: 3, owner: 4, status: 5 /* F열 [자동] — 읽지 않고, 생성 시 비어 있을 때만 수식을 넣는다 */ },
  settlement: { projectId: 0, revenue: 1, directCost: 2, preReg: 5, attended: 6, status: 9 /* D·E·H·I [자동] 읽지 않음 */ },
  // 5턴 (Schema.TABLES.items · notes · blocks 의 col 과 같다)
  item: { id: 0, projectId: 1, milestone: 2, part: 3, block: 4, owner: 5, impact: 6, difficulty: 7, plannedMd: 8, due: 9, status: 10, note: 11 /* M(12) 행사명 [자동] 읽지 않음 */ },
  note: { id: 0, projectId: 1, milestone: 2, itemId: 3, part: 4, author: 5, authorName: 6, at: 7, type: 8, content: 9, resolved: 10 },
  block: { part: 0, block: 1, milestone: 2, md: 3, impact: 4, difficulty: 5, judge: 6, skipForHost: 7 }
};

const ASSIGNMENT_ID_RE_Api_ = /^A-\d{4,}$/;
const DATE_RE_Api_ = /^\d{4}-\d{2}-\d{2}$/;

// ---------- 웹앱 진입 ----------
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('마이스 비즈 팀 보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- 초기 로드: 탭 7개 → 계약 §2 JSON ----------
function getBootstrap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 데이터 탭 6개가 없으면 getSheet_ 의 한국어 오류("… 탭이 없습니다. [팀 보드 → 초기 설정 실행] …")가 그대로 프런트로 간다.
  // 설정 탭은 readSettings_ 가 기본값으로 폴백하므로 여기서 검사하지 않는다.
  [SHEETS.MEMBERS, SHEETS.PROJECTS, SHEETS.ASSIGNMENTS, SHEETS.LOGS, SHEETS.MILESTONES, SHEETS.SETTLEMENTS]
    .forEach(function (name) { getSheet_(name); });

  const all = readAllApi_();
  const email = userEmail_();                  // 4턴 meta.user · 6턴 meta.userMember 가 함께 쓴다

  const data = {
    meta: {
      generatedAt: nowIso_(),
      mode: 'gas',
      sheetUrl: ss.getUrl(),
      today: todayStr_(),
      user: email,                             // 4턴 · 계약 §2.1 — 이력 표시용. 못 읽으면 ''
      // 6턴 D18 · 로그인 계정 ↔ 팀원 이름. 팀원 탭 이메일 열에서 찾는다(퇴사 제외). 못 찾으면 '' → 화면이 이름 선택으로 넘어간다
      userMember: Schema.matchMember(email, all.members),
      blocksSource: all.blocksSource,          // 5턴 · 'sheet'(업무블럭 탭) | 'default'(코드의 기본 카탈로그) · 6턴 파생이 섞이면 '+derived'
      derivedParts: all.derivedParts           // 6턴 D22 · 공통 블럭으로 채운 파트 이름 배열(없으면 [])
    },
    settings: all.settings,
    members: all.members,
    projects: all.projects,
    assignments: all.assignments,
    effortLogs: all.effortLogs,
    milestones: all.milestones,
    settlements: all.settlements,
    items: all.items,                          // 5턴 · 계약 §2.10 — 세부항목 탭이 없으면 []
    notes: all.notes,                          // 5턴 · 계약 §2.11 — 주석 탭이 없으면 []
    blocks: all.blocks,                        // 5턴 · 계약 §2.12 — 업무블럭 탭 또는 Schema.DEFAULT_BLOCKS
    history: readHistoryApi_(HISTORY_LIMIT_Api_)   // 4턴 · 계약 §2.9 — 최근 30건, 최신 먼저. 탭이 없으면 []
  };

  return finalizeApi_(data, 'getBootstrap');
}

// ---------- 쓰기 1: 배정 저장 (화면 B) ----------
// 계약 §5: 해당 projectId 행만 교체, 다른 프로젝트 행은 순서·값 보존, 빈 id 는 §3.8 규칙으로 발급.
function saveAssignments(projectId, rows) {
  const pid = strApi_(projectId);
  if (!pid) throw new Error('프로젝트 ID가 비어 있습니다.');
  if (!Array.isArray(rows)) throw new Error('배정 행 목록은 배열이어야 합니다.');

  let result = null;
  withLock_(function () {
    const settings = settingsApi_();
    if (!findProjectApi_(pid)) {
      throw new Error('프로젝트 "' + pid + '" 을(를) 프로젝트 탭에서 찾을 수 없습니다.');
    }
    const memberNames = readRows_(SHEETS.MEMBERS)
      .map(function (r) { return strApi_(r.values[COL_Api_.member.name]); })
      .filter(function (n) { return n !== ''; });
    const roles = Array.isArray(settings.roles) ? settings.roles.map(strApi_) : [];

    // 1) 입력 검증 (실패 시 한국어 Error — 시트는 아직 건드리지 않음)
    const cleanRows = rows.map(function (row, i) { return validateAssignmentRowApi_(row, i, memberNames, roles); });

    // 2) 배정 탭 쓰기 — 이 프로젝트 행 전부(자동 행 포함)를 rows 로 교체, 다른 프로젝트 행은 원시값 보존
    //    (5턴: 쓰기 본체는 writeProjectAssignmentsApi_ — 세부항목 동기화와 같은 코드)
    const w = writeProjectAssignmentsApi_(pid, false, cleanRows);
    const saved = w.saved;

    // 3) 이력 — 저장 행을 나열, 백업은 교체 전 그 프로젝트 행들
    const summary = saved.length > 0
      ? saved.map(function (a) { return a.member + ' ' + a.role + ' ' + a.plannedMd + ' ' + a.start + '~' + a.end; }).join('\n')
      : '(배정 없음 — 이 프로젝트의 배정 행을 모두 제거)';
    const hist = logHistory_(SHEETS.ASSIGNMENTS, pid, '저장', summary, w.replaced);

    result = { ok: true, projectId: pid, assignments: saved, history: hist };
  });
  return finalizeApi_(result, 'saveAssignments');
}

// 배정 탭 "프로젝트 행 교체 · 원시값 보존" 쓰기 본체 (saveAssignments · syncAssignmentsFromItemsApi_ 공용 · 잠금 안에서 부른다)
//   keepManualRows=false → 그 프로젝트 행 전부를 newRows 로 바꾼다(배정 편집기)
//   keepManualRows=true  → 비고가 자동(세부항목)인 행만 빼고 수동 행은 자리 그대로 두며, newRows 를 맨 뒤에 붙인다(세부항목 동기화)
//   다른 프로젝트 행은 원시 값 그대로(날짜 셀은 Date 유지). readRows_ 는 A열이 빈 행을 건너뛰므로 원시 블록을 직접 읽는다.
//   newRows[].id 는 있으면 유지, 비어 있거나 겹치면 새로 발급(nextAssignmentId_ 는 시트를 지우기 전에 부르므로 교체되는 행 번호까지 포함한 최대값 + 1).
// 반환 { replaced:[빠진 행 JSON — 이력 백업용], saved:[쓴 행 JSON] }
function writeProjectAssignmentsApi_(pid, keepManualRows, newRows) {
  const c = COL_Api_.assignment;
  const sheet = getSheet_(SHEETS.ASSIGNMENTS);
  const width = colCountApi_(SHEETS.ASSIGNMENTS);
  const block = readBlockApi_(sheet, width);
  const preserved = [];
  const replaced = [];
  const usedIds = new Set();
  block.forEach(function (vals) {
    if (isBlankRowApi_(vals)) return;                                   // 완전히 빈 행은 정리
    if (strApi_(vals[c.projectId]) === pid) {
      const json = assignmentFromRowApi_(vals);
      const keep = keepManualRows && json.note !== Schema.AUTO_ASSIGN_NOTE;
      if (!keep) { replaced.push(json); return; }                       // 교체 대상
    }
    preserved.push(vals);
    const id = strApi_(vals[c.id]);
    if (id) usedIds.add(id);
  });

  const saved = (newRows || []).map(function (r) {
    let id = strApi_(r.id);
    if (!id || usedIds.has(id)) id = nextAssignmentId_(sheet, usedIds);
    usedIds.add(id);
    return {
      id: id, projectId: pid, member: strApi_(r.member), role: strApi_(r.role), plannedMd: numOrApi_(r.plannedMd, 0),
      start: strApi_(r.start), end: strApi_(r.end), status: strApi_(r.status) || '예정', note: strApi_(r.note)
    };
  });
  const newValues = saved.map(function (a) {
    return [
      a.id, a.projectId, a.member, a.role, a.plannedMd,
      parseDate_(a.start) || a.start, parseDate_(a.end) || a.end,
      a.status, a.note
    ];
  });

  // 2행부터 기존 블록을 비우고 보존 행 + 새 행을 한 번에 기록 (서식·드롭다운은 clearContent 로 유지)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  const out = preserved.concat(newValues);
  if (out.length > 0) {
    ensureRowsApi_(sheet, 1 + out.length);
    sheet.getRange(2, 1, out.length, width).setValues(out);
  }
  SpreadsheetApp.flush();
  return { replaced: replaced, saved: saved };
}

// ---------- 쓰기 2: 마일스톤 완료 처리 (화면 E) ----------
function completeMilestone(projectId, name, date) {
  const pid = strApi_(projectId);
  const mname = strApi_(name);
  if (!pid) throw new Error('프로젝트 ID가 비어 있습니다.');
  if (!mname) throw new Error('마일스톤 이름이 비어 있습니다.');
  const done = strApi_(date) || todayStr_();
  if (!isDateStrApi_(done)) throw new Error('완료일은 YYYY-MM-DD 형식이어야 합니다: "' + done + '"');

  let result = null;
  withLock_(function () {
    const sheet = getSheet_(SHEETS.MILESTONES);
    const hit = readRows_(SHEETS.MILESTONES).filter(function (r) {
      return strApi_(r.values[COL_Api_.milestone.projectId]) === pid &&
             strApi_(r.values[COL_Api_.milestone.name]) === mname;
    })[0];
    if (!hit) {
      throw new Error('프로젝트 "' + pid + '" 의 마일스톤 "' + mname + '" 을(를) 마일스톤 탭에서 찾을 수 없습니다.');
    }
    const before = milestoneFromRowApi_(hit.values);
    sheet.getRange(hit.row, COL_Api_.milestone.done + 1).setValue(parseDate_(done) || done);
    SpreadsheetApp.flush();
    const hist = logHistory_(SHEETS.MILESTONES, pid + ' · ' + mname, '수정',
      '완료일: ' + (before.done || '(빈 값)') + ' → ' + done, before);
    result = { ok: true, projectId: pid, name: mname, done: done, history: hist };
  });
  return finalizeApi_(result, 'completeMilestone');
}

// ---------- 쓰기 3: 표준 마일스톤 생성 (화면 A 상세 · 시트 메뉴) ----------
// 계약 §4.8 알고리즘과 프런트 mock 결과가 같아야 한다.
//   1 템플릿 순서대로. skipForHost && type 이 "③" 으로 시작 → 건너뜀(skipped 에 넣지 않음)
//   2 due = (offsetDays <= 0 ? eventStart : eventEnd) + offsetDays
//   3 owner = 프로젝트 배정 중 role 일치 첫 팀원 → 없고 role === '운영 PM' 이면 pm → 그 외 ''
//   4 기존 마일스톤(projectId + name)과 겹치면 skipped 에 이름만
function createStandardMilestones(projectId) {
  const pid = strApi_(projectId);
  if (!pid) throw new Error('프로젝트 ID가 비어 있습니다.');

  let result = null;
  withLock_(function () {
    result = createStandardMilestonesApi_(pid, null);
  });
  return finalizeApi_(result, 'createStandardMilestones');
}

// 표준 마일스톤 생성의 잠금 안쪽 로직. createStandardMilestones(공개) 와 saveRow(프로젝트 신규 + 옵션) 두 곳에서 쓴다 — 잠금 중첩 금지.
// settingsOpt 를 주면 설정 탭을 다시 읽지 않는다. 반환은 finalizeApi_ 를 거치지 않은 순수 객체.
function createStandardMilestonesApi_(pid, settingsOpt) {
  const settings = settingsOpt || settingsApi_();
  const template = checkMilestoneTemplateApi_(settings);

  const p = findProjectApi_(pid);
  if (!p) throw new Error('프로젝트 "' + pid + '" 을(를) 프로젝트 탭에서 찾을 수 없습니다.');
  if (!p.eventStart) throw new Error('프로젝트 "' + pid + '" 의 행사 시작일이 비어 있어 표준 마일스톤을 만들 수 없습니다.');
  const eventStart = p.eventStart;
  const eventEnd = p.eventEnd || eventStart;   // 종료일이 비어 있으면 1일 행사로 간주
  const isHost = p.type.indexOf('③') === 0;

  const assigns = readRows_(SHEETS.ASSIGNMENTS)
    .map(function (r) { return r.values; })
    .filter(function (v) { return strApi_(v[COL_Api_.assignment.projectId]) === pid; })
    .map(function (v) { return { member: strApi_(v[COL_Api_.assignment.member]), role: strApi_(v[COL_Api_.assignment.role]) }; });

  const existing = new Set();
  readRows_(SHEETS.MILESTONES).forEach(function (r) {
    if (strApi_(r.values[COL_Api_.milestone.projectId]) === pid) existing.add(strApi_(r.values[COL_Api_.milestone.name]));
  });

  const created = [];
  const skipped = [];
  template.forEach(function (t) {
    const name = strApi_(t.name);
    if (!name) return;                                  // 이름 없는 템플릿 행은 무시
    if (t.skipForHost === true && isHost) return;       // 주최형 제외 항목 (skipped 에 넣지 않음)
    if (existing.has(name)) { skipped.push(name); return; }
    const offset = numApi_(t.offsetDays);
    if (offset === null) throw new Error('설정 탭 마일스톤 "' + name + '" 의 D-오프셋(일)이 숫자가 아닙니다.');
    const role = strApi_(t.role);
    const due = addDays_(offset <= 0 ? eventStart : eventEnd, offset);
    let owner = '';
    const firstMatch = assigns.filter(function (a) { return a.role === role; })[0];
    if (firstMatch) owner = firstMatch.member;
    else if (role === '운영 PM') owner = p.pm;
    existing.add(name);                                 // 템플릿 안에 같은 이름이 둘 있어도 한 번만 생성
    created.push({ projectId: pid, name: name, due: due, done: '', owner: owner });
  });

  if (created.length > 0) {
    const sheet = getSheet_(SHEETS.MILESTONES);
    // A~E 기준 마지막 내용 행 다음에 추가. (F열 상태 수식이 미리 채워져 있으면 getLastRow() 가 그 아래를 가리키므로 쓰지 않는다)
    const startRow = lastContentRowApi_(sheet, COL_Api_.milestone.status) + 1;
    ensureRowsApi_(sheet, startRow + created.length - 1);
    const values = created.map(function (m) {
      return [m.projectId, m.name, parseDate_(m.due) || m.due, '', m.owner];
    });
    sheet.getRange(startRow, 1, values.length, values[0].length).setValues(values);
    SpreadsheetApp.flush();
    fillStatusFormulaIfEmptyApi_(sheet, startRow, values.length);
    SpreadsheetApp.flush();
  }

  const hist = logHistory_(SHEETS.MILESTONES, pid, '추가',
    '표준 마일스톤 ' + created.length + '건 생성(건너뜀 ' + skipped.length + ')', null);

  return { ok: true, projectId: pid, created: created, skipped: skipped, history: hist };
}

// ---------- 쓰기 4: 행 단위 추가·수정 (4턴 · 화면 A·B·C·D 폼 · 브리프 §3 / 5턴 items·notes 확장 · 브리프 T5 §3) ----------
// table    projects · members · effortLogs · milestones · settlements · items · notes (배정은 saveAssignments 전용, 설정·업무블럭은 시트 전용)
// row      폼 값 — 문자열이어도 된다(Schema.normalizeRow 가 계약 타입으로 바꾼다). auto 필드(ID·등록일·기록일시·주석 작성자·일시)는 서버가 채운다
// expected 편집 시작 시점의 행 JSON(신규는 null). 복합키 표(공수기록·마일스톤)는 expected 의 키로 행을 찾으므로 이름·주차 변경도 수정으로 처리된다
// options  { createStandardMilestones: true } — projects 신규만 · { firstNote: '…' } — items 신규만(첫 주석, 유형 요청, 파트 = 항목 파트)
// 순서: 잠금 → 시트 읽기 → 행 찾기 → 검증 → 충돌 검사(D9) → 시트 쓰기 → 이력 → flush. 검증 전에는 시트를 건드리지 않는다.
// 5턴 규칙: items 는 저장 뒤 syncAssignmentsFromItemsApi_ 로 배정 자동 행을 맞추고 응답에 그 프로젝트 배정 전체를 싣는다(D13).
//          notes 수정은 작성자 본인만 — 다른 사람은 해결 표시만(D16). milestones 이름 변경은 세부항목·주석의 마일스톤 열을 함께 바꾼다.
// 반환: { ok, table, created, row:<저장된 행 JSON>, unchanged?, settlement?(projects 신규), milestones?:{created,skipped}(옵션),
//         firstNote?(items 신규 + 옵션), assignments?·overlaps?(items), renamed?:{items,notes}(milestones 이름 변경) }
function saveRow(table, row, expected, options) {
  const t = strApi_(table);
  if (t === 'assignments') throw new Error('배정은 배정 편집기(배정 보드)에서 저장합니다.');
  if (t === 'blocks') throw new Error('업무 블럭 카탈로그는 시트의 업무블럭 탭에서 고칩니다.');
  if (EDITABLE_TABLES_Api_.indexOf(t) < 0 || !Schema.TABLES[t]) throw new Error('대시보드에서 편집할 수 없는 표입니다: ' + (t || '(비어 있음)'));
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('저장할 행 값이 올바르지 않습니다.');
  const exp = (expected && typeof expected === 'object' && !Array.isArray(expected)) ? expected : null;
  const opts = (options && typeof options === 'object') ? options : {};
  const def = Schema.TABLES[t];

  let result = null;
  withLock_(function () {
    if (t === 'items' || t === 'notes') { ensureItemsSheetApi_(); ensureNotesSheetApi_(); }   // 4턴 이전 시트 대응 — 첫 쓰기 때 탭 생성
    const data = readAllApi_();
    const sheet = getSheet_(def.sheet);
    const list = readTableApi_(t, data.settings);

    // 1) 대상 행·모드 — 정산은 프로젝트ID 행이 있으면 수정, 없으면 추가(항상 upsert)
    let mode = exp ? 'edit' : 'new';
    let hit = null;
    if (t === 'settlements') {
      hit = findHitApi_(t, list, Schema.keyOf(t, exp || row));
      mode = hit ? 'edit' : 'new';
    } else if (mode === 'edit') {
      hit = findHitApi_(t, list, Schema.keyOf(t, exp));
      if (!hit) throw new Error(def.label + ' "' + Schema.keyLabel(t, exp) + '" 을(를) 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.');
    }

    // 2) 검증 — 필수·형식·열거값·참조(팀원·프로젝트)·날짜 순서·0.5 단위·유일키·바꿀 수 없는 필드
    const ctx = { settings: data.settings, data: data, mode: mode, expected: (mode === 'edit') ? exp : null };
    const checked = Schema.validateRow(t, row, ctx);
    if (!checked.ok) { const e = checked.errors[0]; throw new Error(e.label + ': ' + e.message); }
    const values = checked.values;
    if (mode === 'new' && t === 'projects' && opts.createStandardMilestones) checkMilestoneTemplateApi_(data.settings);

    // 3) 충돌 검사(D9) — 편집 시작 시점 스냅샷과 지금 시트 행이 한 필드라도 다르면 거부
    if (mode === 'edit' && exp && hasConflictApi_(t, hit.json, exp)) {
      throw new Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
    }
    // 3-b) 주석 수정 권한(D16) — 작성자 본인이 아니면 해결 표시만 바꿀 수 있다
    if (mode === 'edit' && t === 'notes') checkNoteEditApi_(hit.json, values);

    // 4-a) 수정 — 바뀐 필드만 setValue (수식 열·auto 열은 쓰지 않는다)
    if (mode === 'edit') {
      const current = hit.json;
      const changes = Schema.diff(t, current, values);
      if (changes.length === 0) {
        result = { ok: true, table: t, created: false, row: current, unchanged: true };
        if (t === 'items') attachSyncApi_(result, current.projectId);   // 변경 없음 → 시트는 안 쓰고 현재 배정 행만 실어 보낸다
        return;
      }
      changes.forEach(function (d) {
        const fd = Schema.field(t, d.field);
        if (!fd || fd.auto || def.formulaCols.indexOf(fd.col) >= 0) return;
        sheet.getRange(hit.row, fd.col + 1).setValue(cellValueApi_(fd, values[fd.key]));
      });
      if (t === 'effortLogs') {   // 기록일시 = 지금 (계약 §1 'YYYY-MM-DD HH:mm')
        sheet.getRange(hit.row, COL_Api_.log.loggedAt + 1).setValue(cellValueApi_(Schema.field(t, 'loggedAt'), nowStrApi_(false)));
      }
      SpreadsheetApp.flush();
      const saved = readRowJsonApi_(sheet, t, hit.row, data.settings);
      result = { ok: true, table: t, created: false, row: saved };
      let extraEdit = '';
      if (t === 'milestones' && current.name !== saved.name) {          // 5턴 · 세부항목 C열 · 주석 C열의 같은 (프로젝트ID, 옛 이름) 연쇄 갱신
        const rn = renameMilestoneRefsApi_(saved.projectId, current.name, saved.name);
        result.renamed = rn;
        if (rn.items + rn.notes > 0) extraEdit = '마일스톤 이름 변경에 따라 세부항목 ' + rn.items + '건 · 주석 ' + rn.notes + '건의 마일스톤 열을 함께 바꿈';
      }
      result.history = logHistory_(def.sheet, Schema.keyLabel(t, saved), '수정', Schema.summarize(t, '수정', current, saved, extraEdit), current);
      if (t === 'items') attachSyncApi_(result, saved.projectId);
      // 6턴 A3 — 마일스톤 예정일이 바뀌면 그 프로젝트의 자동 배정 기간(세부항목 합계 행)이 낡는다 → 이어서 재동기화
      if (t === 'milestones' && current.due !== saved.due &&
          data.projects.some(function (p) { return p.id === saved.projectId; })) {
        attachSyncApi_(result, saved.projectId);
      }
      return;
    }

    // 4-b) 신규 — auto 필드를 채우고 마지막 내용 행 다음에 한 줄 추가(수식 열은 비워 두고 그 행에 수식을 채운다)
    if (t === 'projects') {
      values.id = nextProjectId_(sheet, Number(String(values.eventStart).slice(0, 4)));
      values.createdAt = todayStr_();
    }
    if (t === 'effortLogs') values.loggedAt = nowStrApi_(false);
    if (t === 'items') values.id = nextSeqIdApi_(sheet, 'W', 6, null);         // 세부ID W-000001 (계약 §3.8)
    if (t === 'notes') fillNoteAutoApi_(sheet, values, null);                   // 주석ID · 작성자(접속 이메일) · 일시 — 클라이언트 값 무시
    const newRow = writeNewRowApi_(sheet, t, values);
    const savedNew = readRowJsonApi_(sheet, t, newRow, data.settings);
    result = { ok: true, table: t, created: true, row: savedNew };

    let extra = '';
    if (t === 'projects') {                         // 정산 탭에 ID 행 자동 추가(없을 때만, 수식 포함)
      const stl = ensureSettlementRowApi_(savedNew.id);
      result.settlement = stl.row;
      if (stl.created) extra = '정산 탭에 ' + savedNew.id + ' 행 추가';
    }
    if (t === 'items' && strApi_(opts.firstNote) !== '') {   // 5턴 · 첫 주석(유형 요청 · 파트 = 항목 파트 · 세부ID = 새 항목)
      data.items.push(savedNew);                              // 주석 검증(세부ID 존재)이 새 항목을 보게
      const note = createNoteApi_({
        projectId: savedNew.projectId, milestone: savedNew.milestone, itemId: savedNew.id, part: savedNew.part,
        authorName: '', type: '요청', content: strApi_(opts.firstNote), resolved: ''
      }, data, null);
      result.firstNote = note;
      extra = '첫 주석 ' + note.id + ' 추가(요청)';
    }
    result.history = logHistory_(def.sheet, Schema.keyLabel(t, savedNew), '추가', Schema.summarize(t, '추가', null, savedNew, extra), null);

    if (t === 'projects' && opts.createStandardMilestones) {
      const ms = createStandardMilestonesApi_(savedNew.id, data.settings);
      result.milestones = { created: ms.created, skipped: ms.skipped };
      if (ms.history) result.historyExtra = (result.historyExtra || []).concat([ms.history]);
    }
    if (t === 'items') attachSyncApi_(result, savedNew.projectId);
  });
  return finalizeApi_(result, 'saveRow');
}

// ---------- 쓰기 5: 행 삭제 (4턴 · 결정 D8 · 브리프 §3 / 5턴 items 연쇄 · 브리프 T5 §3) ----------
// key = Schema.keyOf 결과({ id } · { name } · { projectId, name }). 단일 키 표는 문자열도 받는다.
// projects: Schema.deleteCheck 통과 시 배정·마일스톤·정산·세부항목·주석 행을 함께 삭제(연쇄), 백업 = { project, assignments, milestones, settlement, items, notes }
// items: 그 세부ID 의 주석을 함께 삭제(백업 = { item, notes }) → 배정 자동 행 동기화 → 응답에 그 프로젝트 배정 전체
// members · milestones: 그 행만(마일스톤은 세부 항목이 있으면 Schema.deleteCheck 가 막는다).
// settlements(값 비우기) · assignments(배정 편집기) · effortLogs(공수 입력) · notes(시트에서만) · blocks(시트에서만) 는 이 함수로 지우지 않는다.
function deleteRow(table, key) {
  const t = strApi_(table);
  if (!Schema.TABLES[t]) throw new Error('알 수 없는 표입니다: ' + (t || '(비어 있음)'));
  if (t === 'settlements') throw new Error('정산 행은 지우지 않습니다. 값을 비워서 저장하세요.');
  if (t === 'assignments') throw new Error('배정은 배정 편집기(배정 보드)에서 행을 제거한 뒤 저장하세요.');
  if (t === 'effortLogs') throw new Error('공수기록은 공수 입력에서 행을 제거한 뒤 저장하세요.');
  if (t === 'notes' || t === 'blocks') throw new Error(Schema.deleteCheck(t, null, {}).reason);   // 5턴 · 시트에서만 지운다
  const def = Schema.TABLES[t];
  let keyObj = key;
  if (typeof key === 'string' && def.key.length === 1) { keyObj = {}; keyObj[def.key[0]] = key; }
  if (!keyObj || typeof keyObj !== 'object' || Array.isArray(keyObj)) throw new Error('삭제할 행의 키가 비어 있습니다.');

  let result = null;
  withLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = readAllApi_();
    const sheet = getSheet_(def.sheet);
    const hit = findHitApi_(t, readTableApi_(t, data.settings), Schema.keyOf(t, keyObj));
    if (!hit) throw new Error(def.label + ' "' + Schema.keyLabel(t, keyObj) + '" 을(를) 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.');
    const current = hit.json;

    const check = Schema.deleteCheck(t, current, data);
    if (!check.ok) throw new Error(check.reason);

    const removed = { assignments: 0, milestones: 0, settlements: 0, items: 0, notes: 0 };
    let backup = current;
    let extra = '';
    // 탭이 없을 수도 있는 5턴 탭(세부항목·주석)은 있을 때만 읽고 지운다
    const pickOpt = function (sheetName, col, value) {
      return readRowsOptApi_(sheetName).filter(function (r) { return strApi_(r.values[col]) === value; });
    };
    const deleteOpt = function (sheetName, rows) {
      const sh = ss.getSheetByName(sheetName);
      return sh ? deleteRowsApi_(sh, rows) : 0;
    };
    if (t === 'projects') {
      const pid = current.id;
      const pick = function (sheetName, col) {
        return readRows_(sheetName).filter(function (r) { return strApi_(r.values[col]) === pid; });
      };
      const asg = pick(SHEETS.ASSIGNMENTS, COL_Api_.assignment.projectId);
      const mil = pick(SHEETS.MILESTONES, COL_Api_.milestone.projectId);
      const stl = pick(SHEETS.SETTLEMENTS, COL_Api_.settlement.projectId);
      const itm = pickOpt(SHEETS.ITEMS, COL_Api_.item.projectId, pid);
      const nts = pickOpt(SHEETS.NOTES, COL_Api_.note.projectId, pid);
      backup = {
        project: current,
        assignments: asg.map(function (r) { return assignmentFromRowApi_(r.values); }),
        milestones: mil.map(function (r) { return milestoneFromRowApi_(r.values); }),
        settlement: stl.length > 0 ? settlementFromRowApi_(stl[0].values) : null,
        items: itm.map(function (r) { return itemFromRowApi_(r.values); }),
        notes: nts.map(function (r) { return noteFromRowApi_(r.values); })
      };
      // 탭마다 큰 행번호부터 지운다(행이 밀려 번호가 어긋나지 않게)
      removed.assignments = deleteRowsApi_(getSheet_(SHEETS.ASSIGNMENTS), asg.map(function (r) { return r.row; }));
      removed.milestones = deleteRowsApi_(getSheet_(SHEETS.MILESTONES), mil.map(function (r) { return r.row; }));
      removed.settlements = deleteRowsApi_(getSheet_(SHEETS.SETTLEMENTS), stl.map(function (r) { return r.row; }));
      removed.items = deleteOpt(SHEETS.ITEMS, itm.map(function (r) { return r.row; }));
      removed.notes = deleteOpt(SHEETS.NOTES, nts.map(function (r) { return r.row; }));
      extra = '함께 삭제: 배정 ' + removed.assignments + ' · 마일스톤 ' + removed.milestones + ' · 정산 ' + removed.settlements +
        ' · 세부항목 ' + removed.items + ' · 주석 ' + removed.notes;
    }
    if (t === 'items') {                              // 5턴 · 그 세부ID 의 주석 연쇄 삭제
      const nts = pickOpt(SHEETS.NOTES, COL_Api_.note.itemId, current.id);
      backup = { item: current, notes: nts.map(function (r) { return noteFromRowApi_(r.values); }) };
      removed.notes = deleteOpt(SHEETS.NOTES, nts.map(function (r) { return r.row; }));
      if (removed.notes > 0) extra = '함께 삭제: 주석 ' + removed.notes;
    }
    if (t === 'milestones') {                         // 5턴 · 마일스톤 단위 주석(세부ID 없음) 연쇄 삭제 — 세부 항목이 있으면 Schema.deleteCheck 가 이미 막았다
      const mnotes = readRowsOptApi_(SHEETS.NOTES).filter(function (r) {
        return strApi_(r.values[COL_Api_.note.projectId]) === strApi_(current.projectId) &&
               strApi_(r.values[COL_Api_.note.milestone]) === strApi_(current.name) &&
               strApi_(r.values[COL_Api_.note.itemId]) === '';
      });
      if (mnotes.length > 0) {
        backup = { milestone: current, notes: mnotes.map(function (r) { return noteFromRowApi_(r.values); }) };
        removed.notes = deleteRowsApi_(getSheet_(SHEETS.NOTES), mnotes.map(function (r) { return r.row; }));
        extra = '함께 삭제: 마일스톤 주석 ' + removed.notes;
      }
    }
    deleteRowsApi_(sheet, [hit.row]);
    SpreadsheetApp.flush();

    const hist = logHistory_(def.sheet, Schema.keyLabel(t, current), '삭제', Schema.summarize(t, '삭제', current, null, extra), backup);
    result = { ok: true, table: t, key: Schema.keyOf(t, current), removed: removed, history: hist };
    if (t === 'items') attachSyncApi_(result, current.projectId);   // 배정 자동 행 갱신 + 그 프로젝트 배정 전체
  });
  return finalizeApi_(result, 'deleteRow');
}

// ---------- 쓰기 6: 주간 공수 묶음 저장 (4턴 · 화면 C 공수 입력 · 브리프 §3) ----------
// rows = [{ projectId, md, memo }] — 그 팀원·주차의 행 전체를 이 목록으로 바꾼다(빈 배열이면 모두 제거).
// expected = 편집 시작 시점의 그 팀원·주차 행 배열(null 이면 충돌 검사 생략). 개수와 (projectId, md, memo) 를 순서 무관 비교.
// 쓰기: 현재 행을 큰 번호부터 삭제 → 새 행을 마지막 내용 행 다음에 추가. 기록일시 = 지금.
function saveEffortWeek(member, week, rows, expected) {
  const m = strApi_(member);
  const w = strApi_(week);
  if (!Array.isArray(rows)) throw new Error('기록 행 목록은 배열이어야 합니다.');

  let result = null;
  withLock_(function () {
    const data = readAllApi_();
    const ctx = { settings: data.settings, data: data, mode: 'new', expected: null };
    const checked = Schema.validateEffortWeek(m, w, rows, ctx);
    if (!checked.ok) { const e = checked.errors[0]; throw new Error(e.label + ': ' + e.message); }

    const sheet = getSheet_(SHEETS.LOGS);
    const currentRows = readRows_(SHEETS.LOGS).filter(function (r) {
      return dateApi_(r.values[COL_Api_.log.week]) === w && strApi_(r.values[COL_Api_.log.member]) === m;
    });
    const before = currentRows.map(function (r) { return logFromRowApi_(r.values); });
    if (Array.isArray(expected) && !sameEffortRowsApi_(before, expected)) {
      throw new Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
    }

    deleteRowsApi_(sheet, currentRows.map(function (r) { return r.row; }));
    SpreadsheetApp.flush();

    let saved = [];
    if (checked.values.length > 0) {
      const now = nowStrApi_(false);
      const start = nextFreeRowApi_(sheet, 'effortLogs');
      ensureRowsApi_(sheet, start + checked.values.length - 1);
      const cells = checked.values.map(function (x) {
        return [
          parseDate_(x.week) || x.week, x.member, x.projectId,
          (typeof x.md === 'number') ? x.md : numOrApi_(x.md, 0), x.memo,
          dateTimeCellApi_(now) || now
        ];
      });
      sheet.getRange(start, 1, cells.length, cells[0].length).setValues(cells);
      SpreadsheetApp.flush();
      saved = sheet.getRange(start, 1, cells.length, colCountApi_(SHEETS.LOGS)).getValues()
        .map(function (v) { return logFromRowApi_(v); });
    }

    const summary = saved.length > 0
      ? saved.map(function (x) { return x.projectId + ' ' + x.md; }).join(' · ')
      : '(기록 없음 — 이 주차 행을 모두 제거)';
    const hist = logHistory_(SHEETS.LOGS, w + ' · ' + m, '저장', summary, before);

    result = { ok: true, member: m, week: w, effortLogs: saved, warnings: checked.warnings || [], history: hist };
  });
  return finalizeApi_(result, 'saveEffortWeek');
}

// ---------- 쓰기 7: 카탈로그 블럭 여러 개를 한 마일스톤에 한 번에 추가 (5턴 · 화면 A 상세 [블럭 추가] · 브리프 T5 §3) ----------
// blockNames 순서대로 (프로젝트·마일스톤·파트·블럭) 행을 만든다. 기본 M/D·임팩트·난이도는 카탈로그(업무블럭 탭 또는 기본값)에서,
// 담당·예정일은 비움(예정일은 마일스톤 예정일을 따른다), 상태 예정. 카탈로그 "판단에 필요한 내용"이 있으면 첫 주석(유형 요청)을 함께 만든다.
// 이미 있는 (프로젝트·마일스톤·블럭)은 skipped. 카탈로그에 없는 블럭은 Error(시트를 쓰기 전에 전부 검사한다).
// 잠금 1회 안에서: 검사 → 행 추가(Schema.validateRow 로 각 행 검증) → 첫 주석 → 배정 동기화 → 이력 1줄.
// 반환: { ok, projectId, milestone, part, items:[생성 행], notes:[첫 주석], skipped:[블럭 이름], assignments:[그 프로젝트 배정 전체], overlaps }
function addItems(projectId, milestone, part, blockNames) {
  const pid = strApi_(projectId);
  const ms = strApi_(milestone);
  const pt = strApi_(part);
  if (!pid) throw new Error('프로젝트 ID가 비어 있습니다.');
  if (!ms) throw new Error('마일스톤 이름이 비어 있습니다.');
  if (!pt) throw new Error('파트가 비어 있습니다.');
  if (!Array.isArray(blockNames)) throw new Error('블럭 이름 목록은 배열이어야 합니다.');
  const names = [];
  blockNames.forEach(function (b) { const s = strApi_(b); if (s !== '' && names.indexOf(s) < 0) names.push(s); });
  if (names.length === 0) throw new Error('추가할 블럭을 하나 이상 고르세요.');

  let result = null;
  withLock_(function () {
    ensureItemsSheetApi_();
    ensureNotesSheetApi_();
    const data = readAllApi_();
    if (!data.projects.some(function (p) { return p.id === pid; })) {
      throw new Error('프로젝트 "' + pid + '" 을(를) 프로젝트 탭에서 찾을 수 없습니다.');
    }
    if (!data.milestones.some(function (m) { return m.projectId === pid && m.name === ms; })) {
      throw new Error('프로젝트 "' + pid + '" 의 마일스톤 "' + ms + '" 을(를) 마일스톤 탭에서 찾을 수 없습니다.');
    }
    if (data.settings.roles.indexOf(pt) < 0) throw new Error('파트 "' + pt + '" 이(가) 설정 탭 역할 목록에 없습니다.');
    const sheet = getSheet_(SHEETS.ITEMS);
    const ctx = { settings: data.settings, data: data, mode: 'new', expected: null };

    // 1) 카탈로그 대조 + 이미 있는 블럭 분리 (시트를 쓰기 전에 전부 검사)
    const source = String(data.blocksSource || '').indexOf('sheet') === 0 ? '업무블럭 탭' : '기본 카탈로그';
    const picked = [];
    const skipped = [];
    names.forEach(function (name) {
      const cat = data.blocks.filter(function (b) { return b.part === pt && b.block === name; })[0];
      if (!cat) throw new Error('파트 "' + pt + '" 의 업무 블럭 "' + name + '" 이(가) ' + source + '에 없습니다.');
      const exists = data.items.some(function (it) { return it.projectId === pid && it.milestone === ms && it.block === name; });
      if (exists) { skipped.push(name); return; }
      picked.push(cat);
    });

    // 2) 행 검증 → 추가 → 첫 주석 (다음 블럭의 중복 검사·주석의 세부ID 검증이 방금 쓴 행을 보도록 data 에 바로 넣는다)
    const usedItemIds = new Set();
    const usedNoteIds = new Set();
    const items = [];
    const notes = [];
    picked.forEach(function (cat) {
      const row = {
        projectId: pid, milestone: ms, part: pt, block: cat.block, owner: '',
        impact: cat.impact || '중', difficulty: cat.difficulty || '중', plannedMd: numOrApi_(cat.md, 0),
        due: '', status: '예정', note: ''
      };
      const checked = Schema.validateRow('items', row, ctx);
      if (!checked.ok) { const e = checked.errors[0]; throw new Error(cat.block + ' — ' + e.label + ': ' + e.message); }
      const values = checked.values;
      values.id = nextSeqIdApi_(sheet, 'W', 6, usedItemIds);
      usedItemIds.add(values.id);
      const r = writeNewRowApi_(sheet, 'items', values);
      const saved = readRowJsonApi_(sheet, 'items', r, data.settings);
      items.push(saved);
      data.items.push(saved);
      const judge = strApi_(cat.judge);
      if (judge !== '') {
        const note = createNoteApi_({
          projectId: pid, milestone: ms, itemId: saved.id, part: pt,
          authorName: '', type: '요청', content: judge, resolved: ''
        }, data, usedNoteIds);
        notes.push(note);
        data.notes.push(note);
      }
    });

    // 3) 배정 동기화(변경 없으면 시트·이력을 건드리지 않는다) + 이력 1줄
    const sync = syncAssignmentsFromItemsApi_(pid);
    let addHistory = null;
    if (items.length > 0) {
      const summary = '블럭 ' + items.length + '건 추가: ' +
        items.map(function (it) { return it.block + ' ' + it.plannedMd + ' M/D'; }).join(' · ') +
        (notes.length > 0 ? '\n첫 주석 ' + notes.length + '건(요청)' : '') +
        (skipped.length > 0 ? '\n이미 있어 건너뜀: ' + skipped.join(' · ') : '');
      addHistory = logHistory_(SHEETS.ITEMS, pid + ' · ' + ms + ' · ' + pt, '추가', summary, null);
    }
    result = {
      ok: true, projectId: pid, milestone: ms, part: pt,
      items: items, notes: notes, skipped: skipped,
      assignments: sync.assignments, overlaps: sync.overlaps,
      history: addHistory
    };
    if (sync.history) result.historyExtra = [sync.history];
  });
  return finalizeApi_(result, 'addItems');
}

// ---------- 쓰기 8: 변경이력 되돌리기 (6턴 · 결정 D19 · 브리프 T6 §4) ----------
// 화면 "최근 변경" 한 줄을 그 줄이 생기기 직전 상태로 되돌린다. 되돌리기도 이력에 `되돌림` 으로 남아 다시 되돌릴 수 있다.
// payload = { index, row, expected }
//   index    getBootstrap 이 내려준 history 배열의 인덱스(0 = 가장 최근)
//   row      그 항목의 시트 행 번호. 다시 읽은 항목의 행과 다르면 "목록이 바뀌었습니다" 로 거부한다(그 사이 다른 사람이 저장)
//   expected 화면이 보고 있던 이력 항목(일시·탭·키·동작). 하나라도 다르면 같은 이유로 거부(선택 · 빈 값은 건너뛴다)
// 절차: 잠금 → 이력 행 다시 읽기 → Schema.restoreCheck → 모드별 복원 → 변경이력에 `되돌림` 1건(백업 = 복원 직전 상태)
//   replace  그 키의 행 묶음을 백업 배열로 통째 교체 — 배정 저장(프로젝트 단위) · 주간 공수 저장(팀원·주차 단위).
//            그 밖의 탭(마일스톤 일괄 처리 등)은 백업 배열의 행마다 키로 찾아 되돌린다
//   row      단일 행 되돌리기(수정). 그 키의 행이 없으면 다시 만든다(삭제 되돌리기)
//   delete   추가의 되돌리기 — 그 행을 지운다(세부항목이면 딸린 주석도 함께)
// 수식 열(마일스톤 F · 정산 D·E·H·I · 세부항목 M)은 쓰지 않는다 — Schema.toValues 가 그 칸에 null 을 준다.
// 되돌린 탭이 `배정`·`세부항목` 이면 그 프로젝트의 자동 배정을 다시 맞춘다(D13 · syncAssignmentsFromItemsApi_).
// 복원 값은 그때 시트에 있던 값을 그대로 되돌린다(재검증하지 않는다 — 참조가 사라진 행도 일단 살려 두고 사람이 고치게 한다).
// 반환: { ok, table, sheet, mode, key, restored, removed, rows, removedKeys,
//         projectId?·assignments?·overlaps?(배정·세부항목) · member?·week?·effortLogs?(공수기록) · history, historyExtra? }
const HISTORY_STALE_MSG_Api_ = '목록이 바뀌었습니다. 새로고침 후 다시 시도하세요.';

function restoreHistory(payload, rowOpt, expectedOpt) {
  const req = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? payload
    : { index: payload, row: rowOpt, expected: expectedOpt };
  const index = numApi_(req.index);
  const rowNum = numApi_(req.row);
  if (index === null || index < 0 || Math.floor(index) !== index) throw new Error('되돌릴 기록을 고르세요.');
  if (rowNum === null || rowNum < 2) throw new Error(HISTORY_STALE_MSG_Api_);

  let result = null;
  withLock_(function () {
    result = restoreHistoryApi_(index, rowNum, req.expected);
  });
  return finalizeApi_(result, 'restoreHistory');
}

// 되돌리기의 잠금 안쪽 로직(잠금 중첩 금지 — 바깥에서 withLock_ 으로 감싸 부른다)
function restoreHistoryApi_(index, rowNum, expected) {
  const entry = readHistoryApi_(HISTORY_LIMIT_Api_)[index];
  if (!entry || entry.row !== rowNum) throw new Error(HISTORY_STALE_MSG_Api_);
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const differs = ['at', 'sheet', 'key', 'action'].some(function (k) {
      const want = strApi_(expected[k]);
      return want !== '' && want !== strApi_(entry[k]);
    });
    if (differs) throw new Error(HISTORY_STALE_MSG_Api_);
  }

  if (entry.sheet === SHEETS.ITEMS || entry.sheet === SHEETS.NOTES) { ensureItemsSheetApi_(); ensureNotesSheetApi_(); }
  const data = readAllApi_();
  const check = Schema.restoreCheck(entry, data);
  if (!check.ok) throw new Error(check.reason);

  const table = check.table;
  const def = Schema.TABLES[table];
  const sheet = getSheet_(def.sheet);
  const rows = check.rows;
  const out = {
    ok: true, table: table, sheet: def.sheet, mode: check.mode, key: entry.key,
    restored: 0, removed: 0, rows: [], removedKeys: []
  };
  const lines = [];
  let backup = null;                       // `되돌림` 이력의 백업 = 복원 직전 상태(이 되돌리기를 다시 되돌릴 수 있게)
  let syncPid = '';                        // 복원 뒤 자동 배정을 다시 맞출 프로젝트

  // 백업 행 하나를 키로 찾아 되돌린다(없으면 새 행으로 추가). 표를 통틀어 같은 규칙을 쓴다.
  const list = readTableApi_(table, data.settings);
  const restoreOne = function (rowJson) {
    const values = Schema.normalizeRow(table, rowJson, { settings: data.settings });
    const key = Schema.keyOf(table, values);
    const blank = def.key.some(function (k) { return strApi_(key[k]) === ''; });
    if (blank) {
      throw new Error('이 기록은 되돌리기로 복원할 수 없습니다(여러 탭이 함께 바뀐 기록). ' +
        '시트의 [변경이력] 탭에서 G열 "이전 행(백업)" 을 보고 직접 되돌리세요.');
    }
    const hit = findHitApi_(table, list, key);
    if (hit) {
      const before = hit.json;
      writeRowCellsApi_(sheet, table, hit.row, values);
      SpreadsheetApp.flush();
      const saved = readRowJsonApi_(sheet, table, hit.row, data.settings);
      hit.json = saved;
      return { before: before, after: saved, created: false };
    }
    const r = writeNewRowApi_(sheet, table, values);
    const saved = readRowJsonApi_(sheet, table, r, data.settings);
    list.push({ row: r, json: saved });
    return { before: null, after: saved, created: true };
  };

  // `배정` 은 언제나 프로젝트 단위로, `공수기록` 의 주간 저장(키가 '주차 · 팀원' 두 칸)은 그 주 단위로 통째 교체한다.
  // Schema.restoreCheck 는 백업 행 수만 보고 mode 를 정하므로(1행이면 'row'), 묶음으로 쓰는 탭은 여기서 한 번 더 바로잡는다 —
  // 그러지 않으면 "되돌리기의 되돌리기" 가 행 하나만 고치고 나머지를 남겨 둔다.
  const groupKeyParts = strApi_(entry.key).split(' · ').length;
  const groupMode = check.mode !== 'delete' && rows.length > 0 &&
    (table === 'assignments' || (table === 'effortLogs' && groupKeyParts === 2));

  out.mode = groupMode ? 'replace' : check.mode;

  if (groupMode && table === 'assignments') {
    // 배정 저장 되돌리기 — 그 프로젝트 행 전체를 백업 배열로 바꾼다(저장으로 사라진 행이 그대로 살아난다)
    const pid = strApi_(rows[0] && rows[0].projectId) || strApi_(entry.key);
    if (pid === '') throw new Error('되돌릴 배정의 프로젝트를 알 수 없습니다. 시트에서 직접 고치세요.');
    rows.forEach(function (r) {
      if (strApi_(r && r.projectId) !== pid) {
        throw new Error('백업에 여러 프로젝트의 배정이 섞여 있어 되돌릴 수 없습니다. 시트에서 직접 고치세요.');
      }
    });
    if (!findProjectApi_(pid)) throw new Error('프로젝트 "' + pid + '" 이(가) 이미 지워져 배정을 되돌릴 수 없습니다.');
    backup = data.assignments.filter(function (a) { return a.projectId === pid; });
    const w = writeProjectAssignmentsApi_(pid, false, rows);
    out.projectId = pid;
    out.restored = w.saved.length;
    out.rows = w.saved;
    lines.push('배정 ' + pid + ': ' + backup.length + '행 → ' + w.saved.length + '행');
    w.saved.forEach(function (a) { lines.push(a.member + ' ' + a.role + ' ' + a.plannedMd + ' ' + a.start + '~' + a.end); });
    syncPid = pid;

  } else if (groupMode && table === 'effortLogs') {
    // 주간 공수 저장 되돌리기 — 그 팀원·주차 행 전체를 백업 배열로 바꾼다
    const week = strApi_(rows[0] && rows[0].week);
    const member = strApi_(rows[0] && rows[0].member);
    if (week === '' || member === '') throw new Error('되돌릴 공수기록의 주차·팀원을 알 수 없습니다. 시트에서 직접 고치세요.');
    rows.forEach(function (r) {
      if (strApi_(r && r.week) !== week || strApi_(r && r.member) !== member) {
        throw new Error('백업에 여러 주차·팀원의 기록이 섞여 있어 되돌릴 수 없습니다. 시트에서 직접 고치세요.');
      }
    });
    const cur = readRows_(SHEETS.LOGS).filter(function (r) {
      return dateApi_(r.values[COL_Api_.log.week]) === week && strApi_(r.values[COL_Api_.log.member]) === member;
    });
    backup = cur.map(function (r) { return logFromRowApi_(r.values); });
    deleteRowsApi_(sheet, cur.map(function (r) { return r.row; }));
    SpreadsheetApp.flush();
    const saved = [];
    rows.forEach(function (r) {
      const values = Schema.normalizeRow('effortLogs', r, { settings: data.settings });
      const at = writeNewRowApi_(sheet, 'effortLogs', values);
      saved.push(readRowJsonApi_(sheet, 'effortLogs', at, data.settings));
    });
    out.member = member;
    out.week = week;
    out.effortLogs = saved;
    out.rows = saved;
    out.restored = saved.length;
    lines.push('공수기록 ' + week + ' · ' + member + ': ' + backup.length + '행 → ' + saved.length + '행');

  } else if (check.mode === 'delete') {
    // 추가의 되돌리기 — 그 행을 지운다. 백업이 비어 있으면 이력 키(D열)로 행을 찾는다
    if (table === 'projects') {
      throw new Error('프로젝트 추가는 되돌리기로 지울 수 없습니다. 프로젝트 상세에서 [삭제] 를 쓰세요(배정·마일스톤·정산이 함께 정리됩니다).');
    }
    const key = rows.length > 0 ? Schema.keyOf(table, rows[0]) : restoreKeyFromLabelApi_(table, entry.key);
    if (!key) {
      throw new Error('이 기록은 되돌릴 행을 하나로 특정할 수 없습니다(여러 행을 한 번에 추가한 기록). 행을 직접 지우거나 시트에서 고치세요.');
    }
    const hit = findHitApi_(table, list, key);
    if (!hit) throw new Error(def.label + ' "' + Schema.keyLabel(table, key) + '" 을(를) 찾을 수 없습니다. 이미 지워졌습니다.');
    const current = hit.json;
    let notesRemoved = [];
    if (table === 'items') {                       // 세부항목을 지우면 그 세부ID 의 주석도 함께(삭제 규칙과 같게)
      const nts = readRowsOptApi_(SHEETS.NOTES).filter(function (r) {
        return strApi_(r.values[COL_Api_.note.itemId]) === strApi_(current.id);
      });
      notesRemoved = nts.map(function (r) { return noteFromRowApi_(r.values); });
      const notesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.NOTES);
      if (notesSheet) deleteRowsApi_(notesSheet, nts.map(function (r) { return r.row; }));
    }
    deleteRowsApi_(sheet, [hit.row]);
    SpreadsheetApp.flush();
    backup = notesRemoved.length > 0 ? { item: current, notes: notesRemoved } : current;
    out.removed = 1;
    out.removedKeys = [Schema.keyOf(table, current)];
    lines.push('추가 취소: ' + def.label + ' ' + Schema.keyLabel(table, current) + ' 행 삭제' +
      (notesRemoved.length > 0 ? ' · 딸린 주석 ' + notesRemoved.length + '건 함께 삭제' : ''));
    if (table === 'items') syncPid = strApi_(current.projectId);

  } else {
    // row(단일 행) · replace(마일스톤 일괄 처리 등) — 백업 행마다 키로 찾아 되돌린다
    const before = [];
    rows.forEach(function (r) {
      const res = restoreOne(r);
      before.push(res.before);
      out.rows.push(res.after);
      out.restored++;
      if (res.created) {
        lines.push(def.label + ' ' + Schema.keyLabel(table, res.after) + ': 지워진 행을 다시 만듦');
      } else {
        const changes = Schema.diff(table, res.before, res.after);
        lines.push(def.label + ' ' + Schema.keyLabel(table, res.after) + ': ' +
          (changes.length === 0
            ? '바뀐 값 없음'
            : changes.map(function (d) { return d.label + ' ' + (d.before || '(빈 값)') + ' → ' + (d.after || '(빈 값)'); }).join(' · ')));
      }
      if (table === 'items' && syncPid === '') syncPid = strApi_(res.after.projectId);
    });
    const kept = before.filter(function (b) { return b !== null; });
    // 되돌리기로 새로 만든 행은 백업에 남길 이전 내용이 없다 → 그만큼 "다시 되돌리기" 가 안 된다(행을 지우면 된다)
    backup = kept.length === 0 ? null : (rows.length === 1 && kept.length === 1 ? kept[0] : kept);
  }

  const histSummary = ['되돌린 기록: ' + entry.at + ' · ' + entry.sheet + ' · ' + entry.action + ' · ' + (entry.key || '(키 없음)')]
    .concat(lines).join('\n');
  out.history = logHistory_(def.sheet, entry.key, '되돌림', histSummary, backup);

  if (syncPid !== '') {                            // D13 — 배정·세부항목을 되돌렸으면 자동 배정 행을 다시 맞춘다
    const s = syncAssignmentsFromItemsApi_(syncPid);
    out.projectId = syncPid;
    out.assignments = s.assignments;
    out.overlaps = s.overlaps;
    if (s.history) out.historyExtra = [s.history];
  }
  return out;
}

// 이력 D열(키) 문자열 → 표 키 객체. 백업이 비어 있는 `추가` 기록에서 지울 행을 찾는 마지막 수단이다.
// Schema.keyLabel(§9.6) 의 역함수 — 한 행으로 좁혀지지 않으면(여러 행을 한 번에 추가한 기록 등) null.
function restoreKeyFromLabelApi_(table, label) {
  const def = Schema.TABLES[table];
  const s = strApi_(label);
  if (s === '') return null;
  const key = {};
  if (table === 'items') {                          // '프로젝트ID · 마일스톤 · 블럭 (W-000001)'
    const m = /\(([^()]+)\)\s*$/.exec(s);
    if (!m) return null;
    key.id = strApi_(m[1]);
  } else if (table === 'notes') {                   // 'N-000001 · W-000001'
    key.id = strApi_(s.split(' · ')[0]);
  } else if (def.key.length === 1) {                // 프로젝트ID · 이름 · 정산 프로젝트ID
    key[def.key[0]] = s;
  } else if (table === 'milestones') {              // '프로젝트ID · 마일스톤'(이름 안에 ' · ' 가 있을 수 있어 첫 칸만 자른다)
    const parts = s.split(' · ');
    if (parts.length < 2) return null;
    key.projectId = strApi_(parts[0]);
    key.name = strApi_(parts.slice(1).join(' · '));
  } else {                                          // 공수기록 '주차 · 팀원 · 프로젝트ID'
    const parts = s.split(' · ');
    if (parts.length < def.key.length) return null;
    def.key.forEach(function (k, i) { key[k] = strApi_(parts[i]); });
  }
  const blank = def.key.some(function (k) { return strApi_(key[k]) === ''; });
  return blank ? null : key;
}

// ---------- 쓰기 9: 마일스톤 일괄 처리 (6턴 · 결정 D21 · 브리프 T6 §4) ----------
// 지연 목록에서 여러 건을 골라 한 번에 완료 처리하거나 예정일을 미룬다.
// payload = { action, keys, payload, expected }
//   action   'complete' 완료 처리 | 'shift' 예정일 조정
//   keys     [{ projectId, name }] — 화면에서 고른 마일스톤(중복은 한 번만 처리)
//   payload  complete → { done: 'YYYY-MM-DD' }(비우면 오늘) · shift → { days: 정수 } 또는 { due: 'YYYY-MM-DD' }
//   expected 화면이 보고 있던 마일스톤 행 배열(선택). 키로 짝지어 한 필드라도 다르면 충돌로 거부(D9)
// 절차: 잠금 → 대상 행 수집(없는 키는 오류) → Schema.validateBulkMilestone → 바뀐 필드만 부분 쓰기
//       (상태 F열은 수식이라 쓰지 않는다) → 변경이력 묶음 1건(탭 마일스톤 · 키 `일괄 N건` · 동작 저장 · 백업 = 이전 행 배열)
//       → 관련 프로젝트 자동 배정 재동기화(예정일이 바뀌면 자동 행 기간도 바뀐다 — D13)
// 반환: { ok, action, count, changed, unchanged?, milestones:[저장된 행], warnings:[],
//         syncs:[{ projectId, assignments, overlaps, changed }], history, historyExtra }
function bulkMilestone(payload, keysOpt, payloadOpt, expectedOpt) {
  const req = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? payload
    : { action: payload, keys: keysOpt, payload: payloadOpt, expected: expectedOpt };
  const action = strApi_(req.action);
  if (action !== 'complete' && action !== 'shift') throw new Error('동작: 완료 처리 또는 예정일 조정만 할 수 있습니다.');
  if (!Array.isArray(req.keys) || req.keys.length === 0) throw new Error('대상: 처리할 마일스톤을 하나 이상 고르세요.');

  let result = null;
  withLock_(function () {
    result = bulkMilestoneApi_(action, req.keys, req.payload, req.expected);
  });
  return finalizeApi_(result, 'bulkMilestone');
}

// 일괄 처리의 잠금 안쪽 로직(잠금 중첩 금지 — 바깥에서 withLock_ 으로 감싸 부른다)
function bulkMilestoneApi_(action, keys, payload, expected) {
  const data = readAllApi_();
  const sheet = getSheet_(SHEETS.MILESTONES);
  const def = Schema.TABLES.milestones;
  const list = readTableApi_('milestones', data.settings);

  // 1) 대상 행 수집 — 없는 키가 하나라도 있으면 시트를 건드리기 전에 멈춘다
  const hits = [];
  const seen = {};
  keys.forEach(function (k) {
    const key = { projectId: strApi_(k && k.projectId), name: strApi_(k && k.name) };
    const label = key.projectId + ' · ' + key.name;
    if (key.projectId === '' || key.name === '') throw new Error('대상: 프로젝트와 마일스톤 이름이 모두 있어야 합니다.');
    if (seen[label]) return;
    seen[label] = true;
    const hit = findHitApi_('milestones', list, key);
    if (!hit) throw new Error('마일스톤 "' + label + '" 을(를) 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
    hits.push(hit);
  });

  // 2) 충돌 검사(D9) — 화면이 보고 있던 행과 지금 시트 행이 다르면 거부
  if (Array.isArray(expected) && expected.length > 0) {
    const want = {};
    expected.forEach(function (e) { want[strApi_(e && e.projectId) + ' · ' + strApi_(e && e.name)] = e; });
    hits.forEach(function (h) {
      const e = want[strApi_(h.json.projectId) + ' · ' + strApi_(h.json.name)];
      if (e && hasConflictApi_('milestones', h.json, e)) {
        throw new Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
      }
    });
  }

  // 3) 검증 — 완료일·조정 값 판정은 Schema 가 한다(화면 미리보기와 결과가 같아야 한다). 완료일을 비우면 오늘
  const p = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
  const done = (action === 'complete') ? (strApi_(p.done) || todayStr_()) : '';
  const due = strApi_(p.due);
  const days = (p.days === null || p.days === undefined || p.days === '') ? null : numApi_(p.days);
  const values = { done: done, due: due, days: days };
  const ctx = { settings: data.settings, data: data, mode: 'edit', expected: null, today: todayStr_() };
  const checked = Schema.validateBulkMilestone(action, hits.map(function (h) { return h.json; }), values, ctx);
  if (!checked.ok) { const e = checked.errors[0]; throw new Error(e.label + ': ' + e.message); }

  // 4) 행 단위 부분 쓰기 — 바뀐 필드만. 상태(F)는 수식 열이라 절대 쓰지 않는다
  const before = hits.map(function (h) { return h.json; });
  let changedRows = 0;
  hits.forEach(function (h, i) {
    const value = checked.values[i];
    const changes = Schema.diff('milestones', h.json, value);
    if (changes.length === 0) return;
    changes.forEach(function (d) {
      const fd = Schema.field('milestones', d.field);
      if (!fd || fd.auto || def.formulaCols.indexOf(fd.col) >= 0) return;
      sheet.getRange(h.row, fd.col + 1).setValue(cellValueApi_(fd, value[fd.key]));
    });
    changedRows++;
  });
  SpreadsheetApp.flush();
  const after = hits.map(function (h) { return readRowJsonApi_(sheet, 'milestones', h.row, data.settings); });

  const label = (action === 'complete') ? '완료 처리' : '예정일 조정';
  const detail = (action === 'complete')
    ? '완료일 ' + done
    : (due !== '' ? '예정일 ' + due : (days > 0 ? '+' + days + '일' : days + '일'));
  const out = {
    ok: true, action: action, count: hits.length, changed: changedRows,
    milestones: after, warnings: checked.warnings || [], syncs: [], history: null, historyExtra: []
  };
  if (changedRows === 0) {            // 바뀐 값이 없으면 시트도 이력도 건드리지 않는다
    out.unchanged = true;
    return out;
  }

  // 5) 변경이력 묶음 1건 — 백업은 이전 행 배열(그대로 되돌리기가 가능하다)
  const lines = after.map(function (m, i) {
    const changes = Schema.diff('milestones', before[i], m);
    return before[i].projectId + ' · ' + before[i].name + ': ' +
      (changes.length === 0
        ? '바뀐 값 없음'
        : changes.map(function (d) { return d.label + ' ' + (d.before || '(빈 값)') + ' → ' + (d.after || '(빈 값)'); }).join(' · '));
  });
  const summary = ['마일스톤 일괄 ' + label + ' ' + hits.length + '건(' + detail + ')']
    .concat(lines)
    .concat(checked.warnings && checked.warnings.length ? ['확인 필요: ' + checked.warnings.join(' / ')] : [])
    .join('\n');
  out.history = logHistory_(SHEETS.MILESTONES, '일괄 ' + hits.length + '건', '저장', summary, before);

  // 6) 자동 배정 재동기화 — 예정일이 바뀌면 자동 행 기간이 바뀌고, 완료 처리도 같은 기준으로 한 번 맞춘다
  const pids = [];
  after.forEach(function (m) {
    const pid = strApi_(m.projectId);
    if (pid !== '' && pids.indexOf(pid) < 0 && data.projects.some(function (x) { return x.id === pid; })) pids.push(pid);
  });
  pids.forEach(function (pid) {
    const s = syncAssignmentsFromItemsApi_(pid);
    out.syncs.push({ projectId: pid, assignments: s.assignments, overlaps: s.overlaps, changed: s.changed });
    if (s.history) out.historyExtra.push(s.history);
  });
  return out;
}

// ---------- 세부 항목 → 배정 자동 행 동기화 (5턴 · 결정 D13 · 브리프 T5 §3) ----------
// 잠금 안에서 부른다(saveRow('items') · addItems · deleteRow('items') — 잠금 중첩 금지). 산식은 Schema.assignmentsFromItems 하나라 mock 과 결과가 같다.
//   1 그 프로젝트 세부항목 중 담당이 있는 것을 (담당, 파트)로 묶어 계획 M/D 합산 → 자동 행(비고 = 자동(세부항목))
//   2 기존 자동 행과 (담당·파트·M/D·시작·종료)가 같으면 시트·이력을 건드리지 않고 현재 배정 행만 돌려준다
//   3 다르면 그 프로젝트의 자동 행만 지우고 다시 만든다(같은 (담당, 파트)의 ID 는 유지). 수동 행은 그대로.
//     같은 (담당, 파트)에 수동 행이 있으면 자동 행을 만들지 않고 overlaps 로만 알린다(이중 집계 방지)
// 반환 { assignments:[그 프로젝트 배정 행 전체(자동+수동)], overlaps:[{ member, role, itemsMd, manualMd }], changed }
function syncAssignmentsFromItemsApi_(pid) {
  const data = readAllApi_();
  const project = data.projects.filter(function (p) { return p.id === pid; })[0];
  if (!project) throw new Error('프로젝트 "' + pid + '" 을(를) 프로젝트 탭에서 찾을 수 없습니다.');
  const r = Schema.assignmentsFromItems(project, data.items, data.milestones, data.assignments, data.settings);
  const mine = function (list) { return list.filter(function (a) { return a.projectId === pid; }); };
  if (!r.changed) return { assignments: mine(data.assignments), overlaps: r.overlaps, changed: false, history: null };

  const prevAuto = mine(data.assignments).filter(function (a) { return a.note === Schema.AUTO_ASSIGN_NOTE; });
  const w = writeProjectAssignmentsApi_(pid, true, r.auto);
  const lines = w.saved.map(function (a) { return a.member + ' ' + a.role + ' ' + a.plannedMd + ' ' + a.start + '~' + a.end; });
  const overlapLines = r.overlaps.map(function (o) {
    return o.member + ' ' + o.role + ': 세부 합계 ' + o.itemsMd + ' · 수동 ' + o.manualMd + ' (수동 행 유지)';
  });
  const hist = logHistory_(SHEETS.ASSIGNMENTS, pid, '저장',
    '세부항목 동기화: 자동 ' + w.saved.length + '행(겹침 ' + r.overlaps.length + ')' +
      (lines.length > 0 ? '\n' + lines.join('\n') : '') +
      (overlapLines.length > 0 ? '\n' + overlapLines.join('\n') : ''),
    prevAuto);
  const after = readRows_(SHEETS.ASSIGNMENTS).map(function (x) { return assignmentFromRowApi_(x.values); });
  return { assignments: mine(after), overlaps: r.overlaps, changed: true, history: hist };
}

// 응답 객체에 그 프로젝트 배정 전체(assignments)와 overlaps 를 붙인다 (items 쓰기 3경로 공용)
// 동기화가 실제로 시트를 고쳤으면 그때 남긴 이력 항목을 historyExtra 에 덧붙인다(화면이 "최근 변경" 에 함께 끼워 넣는다)
function attachSyncApi_(result, pid) {
  const s = syncAssignmentsFromItemsApi_(pid);
  result.assignments = s.assignments;
  result.overlaps = s.overlaps;
  if (s.history) result.historyExtra = (result.historyExtra || []).concat([s.history]);
  return result;
}

// 주석 수정 권한(D16): 현재 이메일이 작성자와 다르면 `해결` 외의 필드가 바뀌었을 때 거부
function checkNoteEditApi_(current, values) {
  if (userEmail_() === strApi_(current && current.author)) return;
  const others = Schema.diff('notes', current, values).filter(function (d) { return d.field !== 'resolved'; });
  if (others.length > 0) throw new Error('주석은 작성자 본인만 수정할 수 있습니다. 해결 표시만 바꿀 수 있습니다.');
}

// 주석 자동 필드: 주석ID N-000001 · 작성자(접속 이메일) · 일시(지금, 'YYYY-MM-DD HH:mm:ss'). 클라이언트가 보낸 값은 무시한다
function fillNoteAutoApi_(sheet, values, usedIds) {
  values.id = nextSeqIdApi_(sheet, 'N', 6, usedIds);
  if (usedIds && typeof usedIds.add === 'function') usedIds.add(values.id);
  values.author = userEmail_();
  values.at = nowStrApi_(true);
}

// 주석 한 줄 생성(검증 → 자동 필드 → 쓰기) → 저장된 행 JSON. saveRow('items', …, { firstNote }) · addItems 가 잠금 안에서 부른다
function createNoteApi_(row, data, usedIds) {
  const sheet = getSheet_(SHEETS.NOTES);
  const checked = Schema.validateRow('notes', row, { settings: data.settings, data: data, mode: 'new', expected: null });
  if (!checked.ok) { const e = checked.errors[0]; throw new Error('주석 — ' + e.label + ': ' + e.message); }
  const values = checked.values;
  fillNoteAutoApi_(sheet, values, usedIds);
  const r = writeNewRowApi_(sheet, 'notes', values);
  return readRowJsonApi_(sheet, 'notes', r, data.settings);
}

// 마일스톤 이름 변경 연쇄: 세부항목 C열 · 주석 C열의 같은 (프로젝트ID, 옛 이름)을 새 이름으로 → { items:n, notes:n }. 탭이 없으면 0
function renameMilestoneRefsApi_(pid, oldName, newName) {
  const out = { items: 0, notes: 0 };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[SHEETS.ITEMS, COL_Api_.item, 'items'], [SHEETS.NOTES, COL_Api_.note, 'notes']].forEach(function (x) {
    const sheet = ss.getSheetByName(x[0]);
    if (!sheet) return;
    readRows_(x[0]).forEach(function (r) {
      if (strApi_(r.values[x[1].projectId]) !== pid || strApi_(r.values[x[1].milestone]) !== oldName) return;
      sheet.getRange(r.row, x[1].milestone + 1).setValue(newName);
      out[x[2]]++;
    });
  });
  if (out.items + out.notes > 0) SpreadsheetApp.flush();
  return out;
}

// 다음 순번 ID 'prefix-NNNNNN' — A열의 같은 접두사 번호 최대값 + 1, width 자리 0 채움 (세부ID W-000001 · 주석ID N-000001 · 계약 §3.8)
// usedIds: 한 번 저장에서 여러 개를 연달아 발급할 때 겹치지 않게 하는 Set(있으면 그 안의 번호도 최대값 계산에 넣는다. 발급한 ID 는 호출자가 add)
function nextSeqIdApi_(sheet, prefix, width, usedIds) {
  const used = (usedIds && typeof usedIds.has === 'function') ? usedIds : new Set();
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let max = 0;
  const pick = function (value) {
    const m = re.exec(strApi_(value));
    if (!m) return;
    const n = Number(m[1]);
    if (isFinite(n) && n > max) max = Math.floor(n);
  };
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) pick(values[i][0]);
  }
  used.forEach(function (id) { pick(id); });
  const zeros = new Array(width + 1).join('0');
  const format = function (k) { const s = String(k); return prefix + '-' + (s.length >= width ? s : (zeros + s).slice(-width)); };
  let n = max + 1;
  let id = format(n);
  while (used.has(id)) { n++; id = format(n); }
  return id;
}

// ==================== 전용 헬퍼 (이름 끝 Api_) ====================

// ---------- 반환 정리: Date 잔존 검사 → JSON 직렬화 1회 ----------
// 검사를 직렬화보다 먼저 하는 이유: 직렬화 뒤에는 Date 가 ISO 문자열이 되어 검사가 무의미해지고,
// 그 문자열은 'YYYY-MM-DD' 가 아니라(시간대 차이로 날짜가 밀릴 수 있음) 조용히 잘못된 값이 되기 때문.
function finalizeApi_(obj, label) {
  assertNoDateApi_(obj, label || 'root');
  return JSON.parse(JSON.stringify(obj));
}

// 개발용 재귀 검사 — Date 객체를 발견하면 경로를 담아 throw
function assertNoDateApi_(v, path) {
  if (v === null || typeof v !== 'object') return;
  if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
    throw new Error('내부 오류: 날짜가 문자열로 변환되지 않은 값이 있습니다 (' + path + '). 관리자에게 알려주세요.');
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) assertNoDateApi_(v[i], path + '[' + i + ']');
    return;
  }
  Object.keys(v).forEach(function (k) { assertNoDateApi_(v[k], path + '.' + k); });
}

// ---------- 값 변환 (모든 getValues 결과는 이 세 함수 중 하나를 거친다) ----------
// 문자열: null/undefined → '' · Date 가 문자열 열에 들어온 경우 → 'YYYY-MM-DD' · 그 외 String 후 앞뒤 공백 제거
function strApi_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toDateStr_(v);
  return String(v).trim();
}

// 숫자: '' / null / 변환 실패 → null (계약 §1). 숫자 열에 날짜가 들어온 경우도 null
function numApi_(v) {
  if (v === null || v === undefined || v === '' || v instanceof Date) return null;
  const n = toNum_(v);
  return (typeof n === 'number' && isFinite(n)) ? n : null;
}

// 숫자(기본값 있음): null 이면 fallback
function numOrApi_(v, fallback) {
  const n = numApi_(v);
  return n === null ? fallback : n;
}

// 날짜 문자열: 빈 값 → '' · 그 외 toDateStr_ (Date → 'YYYY-MM-DD')
function dateApi_(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = toDateStr_(v);
  return (s === null || s === undefined) ? '' : s;
}

// 일시 문자열: 빈 값 → '' · 그 외 toDateTimeStr_ (Date → 'YYYY-MM-DD HH:mm')
function dateTimeApi_(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = toDateTimeStr_(v);
  return (s === null || s === undefined) ? '' : s;
}

// 열거값(기본값 있음): 빈 값 → fallback
function enumOrApi_(v, fallback) {
  const s = strApi_(v);
  return s === '' ? fallback : s;
}

// 'YYYY-MM-DD' 형식 + 실제 존재하는 날짜인지 (2026-02-31 같은 값 거부)
function isDateStrApi_(s) {
  if (typeof s !== 'string' || !DATE_RE_Api_.test(s)) return false;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ---------- 행 → JSON (계약 §2.3 ~ §2.8) ----------
function memberFromRowApi_(v, settings) {
  const c = COL_Api_.member;
  const defaultCapacity = numOrApi_(settings && settings.capacityMdPerMonth, numOrApi_(DEFAULT_SETTINGS.capacityMdPerMonth, 20));
  return {
    name: strApi_(v[c.name]),
    role: strApi_(v[c.role]),
    capacityMd: numOrApi_(v[c.capacityMd], defaultCapacity),
    status: enumOrApi_(v[c.status], '재직'),
    color: strApi_(v[c.color]),
    email: strApi_(v[c.email])          // 6턴 D17 · 비어 있어도 된다(화면이 이름 선택으로 넘어간다)
  };
}

function projectFromRowApi_(v) {
  const c = COL_Api_.project;
  return {
    id: strApi_(v[c.id]),
    name: strApi_(v[c.name]),
    client: strApi_(v[c.client]),
    type: strApi_(v[c.type]),
    status: strApi_(v[c.status]),
    pm: strApi_(v[c.pm]),
    eventStart: dateApi_(v[c.eventStart]),
    eventEnd: dateApi_(v[c.eventEnd]),
    kickoff: dateApi_(v[c.kickoff]),
    settlementDue: dateApi_(v[c.settlementDue]),
    venue: strApi_(v[c.venue]),
    guarantee: numApi_(v[c.guarantee]),
    expectedAttendees: numApi_(v[c.expectedAttendees]),
    contractAmount: numOrApi_(v[c.contractAmount], 0),
    note: strApi_(v[c.note]),
    createdAt: dateApi_(v[c.createdAt])
  };
}

function assignmentFromRowApi_(v) {
  const c = COL_Api_.assignment;
  return {
    id: strApi_(v[c.id]),
    projectId: strApi_(v[c.projectId]),
    member: strApi_(v[c.member]),
    role: strApi_(v[c.role]),
    plannedMd: numOrApi_(v[c.plannedMd], 0),
    start: dateApi_(v[c.start]),
    end: dateApi_(v[c.end]),
    status: enumOrApi_(v[c.status], '예정'),
    note: strApi_(v[c.note])
  };
}

function logFromRowApi_(v) {
  const c = COL_Api_.log;
  return {
    week: dateApi_(v[c.week]),
    member: strApi_(v[c.member]),
    projectId: strApi_(v[c.projectId]),
    md: numOrApi_(v[c.md], 0),
    memo: strApi_(v[c.memo]),
    loggedAt: dateTimeApi_(v[c.loggedAt])
  };
}

function milestoneFromRowApi_(v) {
  const c = COL_Api_.milestone;
  return {
    projectId: strApi_(v[c.projectId]),
    name: strApi_(v[c.name]),
    due: dateApi_(v[c.due]),
    done: dateApi_(v[c.done]),
    owner: strApi_(v[c.owner])
  };
}

function settlementFromRowApi_(v) {
  const c = COL_Api_.settlement;
  return {
    projectId: strApi_(v[c.projectId]),
    revenue: numApi_(v[c.revenue]),
    directCost: numApi_(v[c.directCost]),
    preReg: numApi_(v[c.preReg]),
    attended: numApi_(v[c.attended]),
    status: enumOrApi_(v[c.status], '미착수')
  };
}

// 5턴 · 계약 §2.10 세부항목 (M열 행사명은 읽지 않는다)
function itemFromRowApi_(v) {
  const c = COL_Api_.item;
  return {
    id: strApi_(v[c.id]),
    projectId: strApi_(v[c.projectId]),
    milestone: strApi_(v[c.milestone]),
    part: strApi_(v[c.part]),
    block: strApi_(v[c.block]),
    owner: strApi_(v[c.owner]),
    impact: enumOrApi_(v[c.impact], '중'),
    difficulty: enumOrApi_(v[c.difficulty], '중'),
    plannedMd: numOrApi_(v[c.plannedMd], 0),
    due: dateApi_(v[c.due]),
    status: enumOrApi_(v[c.status], '예정'),
    note: strApi_(v[c.note])
  };
}

// 5턴 · 계약 §2.11 주석 (일시는 초까지 'YYYY-MM-DD HH:mm:ss' · 해결은 '예' 또는 '')
function noteFromRowApi_(v) {
  const c = COL_Api_.note;
  return {
    id: strApi_(v[c.id]),
    projectId: strApi_(v[c.projectId]),
    milestone: strApi_(v[c.milestone]),
    itemId: strApi_(v[c.itemId]),
    part: strApi_(v[c.part]),
    author: strApi_(v[c.author]),
    authorName: strApi_(v[c.authorName]),
    at: stampApi_(v[c.at]),
    type: enumOrApi_(v[c.type], '요청'),
    content: strApi_(v[c.content]),
    resolved: strApi_(v[c.resolved]) === '예' ? '예' : ''
  };
}

// 5턴 · 계약 §2.12 업무블럭 카탈로그 (주최형 제외 '예' → true — Schema.DEFAULT_BLOCKS 와 같은 형태)
function blockFromRowApi_(v) {
  const c = COL_Api_.block;
  return {
    part: strApi_(v[c.part]),
    block: strApi_(v[c.block]),
    milestone: strApi_(v[c.milestone]),
    md: numOrApi_(v[c.md], 0),
    impact: enumOrApi_(v[c.impact], '중'),
    difficulty: enumOrApi_(v[c.difficulty], '중'),
    judge: strApi_(v[c.judge]),
    skipForHost: strApi_(v[c.skipForHost]) === '예'
  };
}

// ---------- 설정: readSettings_ 결과에 빠진 키를 DEFAULT_SETTINGS 로 보강 + 템플릿 정규화 ----------
// (readSettings_ 가 이미 폴백을 하지만, JSON 직렬화가 undefined 필드를 지우므로 계약 §2.2 키가 전부 있도록 한 번 더 보장)
function settingsApi_() {
  const base = DEFAULT_SETTINGS || {};
  const raw = readSettings_() || {};
  const out = {};
  ['statuses', 'types', 'roles', 'commonCodes'].forEach(function (k) {
    out[k] = Array.isArray(raw[k]) ? raw[k].map(strApi_) : (Array.isArray(base[k]) ? base[k].slice() : []);
  });
  out.capacityMdPerMonth = numOrApi_(raw.capacityMdPerMonth, numOrApi_(base.capacityMdPerMonth, 20));
  ['margin', 'thresholds', 'timelineOffsets'].forEach(function (k) {
    const merged = {};
    const b = (base[k] && typeof base[k] === 'object') ? base[k] : {};
    const r = (raw[k] && typeof raw[k] === 'object') ? raw[k] : {};
    Object.keys(b).forEach(function (kk) { merged[kk] = numOrApi_(b[kk], null); });
    Object.keys(r).forEach(function (kk) { const n = numApi_(r[kk]); if (n !== null) merged[kk] = n; });
    out[k] = merged;
  });
  const tpl = Array.isArray(raw.milestoneTemplate) && raw.milestoneTemplate.length > 0
    ? raw.milestoneTemplate : (Array.isArray(base.milestoneTemplate) ? base.milestoneTemplate : []);
  out.milestoneTemplate = tpl.map(function (t) {
    const skipRaw = t && t.skipForHost;
    const skip = skipRaw === true || strApi_(skipRaw) === '예' || strApi_(skipRaw).toLowerCase() === 'true';
    return {
      name: strApi_(t && t.name),
      offsetDays: numApi_(t && t.offsetDays),
      role: strApi_(t && t.role),
      skipForHost: skip
    };
  });
  return out;
}

// ---------- 탭 6개(+5턴 3개) → 계약 §2 데이터 부분 (getBootstrap · 쓰기 검증 ctx · 배정 동기화가 공유) ----------
// 세부항목·주석 탭이 없으면 [] · 업무블럭 탭이 없으면 Schema.DEFAULT_BLOCKS 복사본(blocksSource 'default'). 기존 6탭은 getSheet_ 오류 그대로
function readAllApi_() {
  const settings = settingsApi_();
  const blocks = readBlocksApi_(settings);
  return {
    settings: settings,
    members: readRows_(SHEETS.MEMBERS).map(function (r) { return memberFromRowApi_(r.values, settings); }),
    projects: readRows_(SHEETS.PROJECTS).map(function (r) { return projectFromRowApi_(r.values); }),
    assignments: readRows_(SHEETS.ASSIGNMENTS).map(function (r) { return assignmentFromRowApi_(r.values); }),
    effortLogs: readRows_(SHEETS.LOGS).map(function (r) { return logFromRowApi_(r.values); }),
    milestones: readRows_(SHEETS.MILESTONES).map(function (r) { return milestoneFromRowApi_(r.values); }),
    settlements: readRows_(SHEETS.SETTLEMENTS).map(function (r) { return settlementFromRowApi_(r.values); }),
    items: readRowsOptApi_(SHEETS.ITEMS).map(function (r) { return itemFromRowApi_(r.values); }),
    notes: readRowsOptApi_(SHEETS.NOTES).map(function (r) { return noteFromRowApi_(r.values); }),
    blocks: blocks.list,
    blocksSource: blocks.source,
    derivedParts: blocks.derivedParts     // 6턴 D22 · 공통 블럭으로 채운 파트 이름(없으면 [])
  };
}

// 탭이 없어도 오류 없이 [] (5턴 탭 전용 — 4턴 이전 시트 대응)
function readRowsOptApi_(sheetName) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName) ? readRows_(sheetName) : [];
}

// 업무블럭 카탈로그 → { source, list, derivedParts }.
//   source 'sheet'(업무블럭 탭) | 'default'(코드 기본 카탈로그) 에 파생이 섞이면 'sheet+derived' | 'default+derived' (6턴 D22)
//   탭이 있어도 쓸 수 있는 행이 하나도 없으면 기본 카탈로그를 쓴다(Schema.blocksWithFallback 판정 usedDefault).
//   설정 탭 역할 목록에 있는데 블럭이 0개인 파트에는 공통 블럭 5종(Schema.GENERIC_BLOCKS)을 파트만 바꿔 붙인다 —
//   팀이 역할을 새로 만들어도 "고를 블럭이 하나도 없는" 파트가 생기지 않게 한다.
function readBlocksApi_(settings) {
  const sheetHas = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BLOCKS);
  const raw = sheetHas ? readRows_(SHEETS.BLOCKS).map(function (r) { return blockFromRowApi_(r.values); }) : [];
  const r = Schema.blocksWithFallback(sheetHas ? raw : JSON.parse(JSON.stringify(Schema.DEFAULT_BLOCKS)), settings);
  const base = (sheetHas && !r.usedDefault) ? 'sheet' : 'default';
  return {
    source: base + (r.derivedParts.length > 0 ? '+derived' : ''),
    // usedDefault 면 목록 안에 Schema.DEFAULT_BLOCKS 원본 객체가 그대로 들어 있다 → 복사본을 돌려준다
    list: r.usedDefault ? JSON.parse(JSON.stringify(r.list)) : r.list,
    derivedParts: r.derivedParts
  };
}

// ---------- 변경이력 최근 n건 → [{ at, user, sheet, key, action, summary, row, backup }] 최신 먼저. 탭이 없으면 [] ----------
// 6턴 D19 — 되돌리기 때문에 G열(이전 행 백업)과 시트 행 번호를 함께 내보낸다.
//   row    = 시트 행 번호. 화면이 [되돌리기] 를 누를 때 index 와 함께 보내 "목록이 그 사이 바뀌지 않았는지" 대조한다
//   backup = G열 JSON 을 푼 값(빈 칸이면 null). Schema.restoreCheck 가 이 값으로 되돌리기 가능 여부를 판정한다
function readHistoryApi_(limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.HISTORY);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const n = Math.max(1, Math.min(numOrApi_(limit, HISTORY_LIMIT_Api_), lastRow - 1));
  const width = Math.max(1, Math.min(HEADERS[SHEETS.HISTORY].length, sheet.getMaxColumns()));
  const firstRow = lastRow - n + 1;
  const values = sheet.getRange(firstRow, 1, n, width).getValues();
  const out = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (strApi_(v[0]) === '' && strApi_(v[4]) === '') continue;
    out.push({
      at: stampApi_(v[0]), user: strApi_(v[1]), sheet: strApi_(v[2]),
      key: strApi_(v[3]), action: strApi_(v[4]), summary: strApi_(v[5]),
      row: firstRow + i, backup: parseBackupApi_(v[6])
    });
  }
  return out;
}

// ==================== 편집 계약(Schema) 연동 헬퍼 (4턴) ====================

// 지금 시각 문자열. withSeconds=false → 'YYYY-MM-DD HH:mm'(계약 §1 기록일시) · true → 'YYYY-MM-DD HH:mm:ss'(변경이력 일시)
function nowStrApi_(withSeconds) {
  return Utilities.formatDate(new Date(), TZ, withSeconds ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm');
}

// 이력 일시 셀 → 문자열. Date 로 저장돼 있으면 초까지 포맷, 문자열이면 그대로
function stampApi_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return strApi_(v);
}

// 'YYYY-MM-DD HH:mm[:ss]' → 그 시각의 Date(스크립트 시간대). 형식이 다르면 null
function dateTimeCellApi_(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// 계약 값 → 셀 값. 날짜는 Date(셀이 날짜형을 유지) · 숫자는 number · null/undefined 는 '' · 그 밖에는 문자열
function cellValueApi_(fd, v) {
  if (v === null || v === undefined) return '';
  const type = fd ? fd.type : '';
  if (type === 'date') { const s = strApi_(v); return s === '' ? '' : (parseDate_(s) || s); }
  if (type === 'datetime') { const s = strApi_(v); return s === '' ? '' : (dateTimeCellApi_(s) || s); }
  if (type === 'number') {
    if (typeof v === 'number') return isFinite(v) ? v : '';
    const n = numApi_(v);
    return n === null ? '' : n;
  }
  return (typeof v === 'string') ? v : String(v);
}

// 표 이름 → 행 변환기(values, settings) → JSON
function rowMapperApi_(table) {
  switch (table) {
    case 'projects': return function (v) { return projectFromRowApi_(v); };
    case 'members': return function (v, settings) { return memberFromRowApi_(v, settings); };
    case 'assignments': return function (v) { return assignmentFromRowApi_(v); };
    case 'effortLogs': return function (v) { return logFromRowApi_(v); };
    case 'milestones': return function (v) { return milestoneFromRowApi_(v); };
    case 'settlements': return function (v) { return settlementFromRowApi_(v); };
    case 'items': return function (v) { return itemFromRowApi_(v); };
    case 'notes': return function (v) { return noteFromRowApi_(v); };
    case 'blocks': return function (v) { return blockFromRowApi_(v); };
    default: throw new Error('알 수 없는 표입니다: ' + table);
  }
}

// 표 하나를 [{ row: 시트 행번호, json }] 로 읽는다 (readRows_ 와 같은 규칙 — A열 빈 행 제외)
function readTableApi_(table, settings) {
  const def = Schema.TABLES[table];
  const map = rowMapperApi_(table);
  return readRows_(def.sheet).map(function (r) { return { row: r.row, json: map(r.values, settings) }; });
}

// 시트 행 하나를 다시 읽어 JSON 으로 (저장 뒤 "실제로 시트에 들어간 값"을 돌려주기 위해)
function readRowJsonApi_(sheet, table, rowNum, settings) {
  const def = Schema.TABLES[table];
  const v = sheet.getRange(rowNum, 1, 1, def.width).getValues()[0];
  return rowMapperApi_(table)(v, settings);
}

// readTableApi_ 결과에서 키가 같은 행 (없으면 null)
function findHitApi_(table, list, key) {
  const i = Schema.findRow(table, list.map(function (x) { return x.json; }), key);
  return i >= 0 ? list[i] : null;
}

// 충돌 검사(D9): auto 가 아닌 필드마다 문자열 비교. 하나라도 다르면 true
function hasConflictApi_(table, current, expected) {
  const cmp = function (v) { return (v === null || v === undefined) ? '' : String(v).trim(); };
  const fields = Schema.TABLES[table].fields;
  for (let i = 0; i < fields.length; i++) {
    const fd = fields[i];
    if (fd.auto) continue;
    if (cmp(current ? current[fd.key] : '') !== cmp(expected ? expected[fd.key] : '')) return true;
  }
  return false;
}

// 열 인덱스 → 필드 정의 (수식 열은 null)
function colFieldsApi_(table) {
  const def = Schema.TABLES[table];
  const out = [];
  for (let i = 0; i < def.width; i++) out.push(null);
  def.fields.forEach(function (fd) { out[fd.col] = fd; });
  return out;
}

// 수식 열을 빼고 내용이 있는 마지막 행 + 1 (헤더만 있으면 2). 미리 채워 둔 [자동] 수식 결과('')는 내용으로 치지 않는다
function nextFreeRowApi_(sheet, table) {
  const def = Schema.TABLES[table];
  const block = readBlockApi_(sheet, def.width);
  for (let i = block.length - 1; i >= 0; i--) {
    for (let c = 0; c < def.width; c++) {
      if (def.formulaCols.indexOf(c) >= 0) continue;
      if (strApi_(block[i][c]) !== '') return i + 3;
    }
  }
  return 2;
}

// 행 한 줄의 값 열을 통째로 쓴다. 수식 열은 건너뛰고(미리 채워 둔 수식 보존) 연속 구간별로 setValues 한다.
// 신규 행 추가(writeNewRowApi_)와 되돌리기 복원(restoreWriteRowApi_)이 같은 규칙을 쓴다.
function writeRowCellsApi_(sheet, table, rowNum, values) {
  const def = Schema.TABLES[table];
  const cells = Schema.toValues(table, values);
  const byCol = colFieldsApi_(table);
  let start = -1;
  const flushSegment = function (end) {          // [start, end) 구간을 한 번에 쓴다
    if (start < 0) return;
    const seg = [];
    for (let c = start; c < end; c++) seg.push(cellValueApi_(byCol[c], cells[c]));
    sheet.getRange(rowNum, start + 1, 1, seg.length).setValues([seg]);
    start = -1;
  };
  for (let c = 0; c < def.width; c++) {
    if (def.formulaCols.indexOf(c) >= 0) { flushSegment(c); continue; }
    if (start < 0) start = c;
  }
  flushSegment(def.width);
}

// 새 행 한 줄 쓰기 → 쓴 행번호. 값 열을 쓴 뒤, 수식 열이 비어 있으면 그 행에 수식을 채운다
function writeNewRowApi_(sheet, table, values) {
  const r = nextFreeRowApi_(sheet, table);
  ensureRowsApi_(sheet, r);
  writeRowCellsApi_(sheet, table, r, values);
  SpreadsheetApp.flush();
  if (table === 'milestones') fillStatusFormulaIfEmptyApi_(sheet, r, 1);
  if (table === 'settlements') fillSettlementFormulasApi_(sheet, r);
  SpreadsheetApp.flush();
  return r;
}

// 정산 탭에 프로젝트ID 행이 없으면 추가(수식 포함) → { created, row:<정산 행 JSON> }
function ensureSettlementRowApi_(pid) {
  const sheet = getSheet_(SHEETS.SETTLEMENTS);
  const found = readRows_(SHEETS.SETTLEMENTS).filter(function (r) {
    return strApi_(r.values[COL_Api_.settlement.projectId]) === pid;
  })[0];
  if (found) return { created: false, row: settlementFromRowApi_(found.values) };
  const r = writeNewRowApi_(sheet, 'settlements',
    { projectId: pid, revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' });
  return { created: true, row: readRowJsonApi_(sheet, 'settlements', r, null) };
}

// 표준 마일스톤 템플릿 검사 → 템플릿 배열. 비었거나 오프셋이 숫자가 아니면 Error (시트를 쓰기 전에 부른다)
function checkMilestoneTemplateApi_(settings) {
  const template = (settings && Array.isArray(settings.milestoneTemplate)) ? settings.milestoneTemplate : [];
  if (template.length === 0) throw new Error('설정 탭에 표준 마일스톤 템플릿(F~I열)이 없습니다.');
  template.forEach(function (t) {
    const name = strApi_(t && t.name);
    if (!name) return;
    if (numApi_(t.offsetDays) === null) throw new Error('설정 탭 마일스톤 "' + name + '" 의 D-오프셋(일)이 숫자가 아닙니다.');
  });
  return template;
}

// 주간 공수 행 묶음 비교(순서 무관): 개수 + (projectId, md, memo) 가 모두 같으면 true
function sameEffortRowsApi_(a, b) {
  const la = Array.isArray(a) ? a : [];
  const lb = Array.isArray(b) ? b : [];
  if (la.length !== lb.length) return false;
  const sig = function (x) {
    return strApi_(x && x.projectId) + '' + String(numOrApi_(x && x.md, 0)) + '' + strApi_(x && x.memo);
  };
  const sa = la.map(sig).sort();
  const sb = lb.map(sig).sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

// 시트 행 여러 개 삭제 — 큰 번호부터(행이 밀려 번호가 어긋나지 않게). 반환 = 지운 개수
// 고정 행 밖에 행이 하나도 남지 않으면 시트가 삭제를 거부하므로 그 경우 빈 행을 먼저 하나 붙인다
function deleteRowsApi_(sheet, rows) {
  const uniq = [];
  (rows || []).forEach(function (r) { const n = Number(r); if (isFinite(n) && n >= 2 && uniq.indexOf(n) < 0) uniq.push(n); });
  uniq.sort(function (x, y) { return y - x; });
  uniq.forEach(function (r) {
    if (sheet.getMaxRows() <= sheet.getFrozenRows() + 1) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    sheet.deleteRow(r);
  });
  return uniq.length;
}

// ---------- 프로젝트 1건 조회 (없으면 null) ----------
function findProjectApi_(pid) {
  const rows = readRows_(SHEETS.PROJECTS);
  for (let i = 0; i < rows.length; i++) {
    if (strApi_(rows[i].values[COL_Api_.project.id]) === pid) return projectFromRowApi_(rows[i].values);
  }
  return null;
}

// ---------- 배정 행 1건 검증 → 정규화된 행 ----------
function validateAssignmentRowApi_(row, i, memberNames, roles) {
  const at = (i + 1) + '번째 배정 행: ';
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(at + '형식이 올바르지 않습니다.');

  const member = strApi_(row.member);
  if (!member) throw new Error(at + '팀원이 비어 있습니다.');
  if (memberNames.indexOf(member) < 0) throw new Error(at + '팀원 "' + member + '" 이(가) 팀원 탭에 없습니다.');

  const role = strApi_(row.role);
  if (!role) throw new Error(at + '역할이 비어 있습니다.');
  if (roles.indexOf(role) < 0) throw new Error(at + '역할 "' + role + '" 이(가) 설정 탭 역할 목록에 없습니다.');

  const rawMd = row.plannedMd;
  const plannedMd = (rawMd === '' || rawMd === null || rawMd === undefined) ? NaN : Number(rawMd);
  if (!isFinite(plannedMd) || plannedMd < 0) throw new Error(at + '계획 M/D 는 0 이상의 숫자여야 합니다.');

  const start = strApi_(row.start);
  const end = strApi_(row.end);
  if (!isDateStrApi_(start)) throw new Error(at + '배정 시작일은 YYYY-MM-DD 형식이어야 합니다.');
  if (!isDateStrApi_(end)) throw new Error(at + '배정 종료일은 YYYY-MM-DD 형식이어야 합니다.');
  if (start > end) throw new Error(at + '배정 시작일(' + start + ')이 종료일(' + end + ')보다 늦습니다.');

  const status = strApi_(row.status) || '예정';
  if (ENUMS_Api_.assignmentStatus.indexOf(status) < 0) throw new Error(at + '상태는 예정·진행·종료 중 하나여야 합니다.');

  let id = strApi_(row.id);
  if (id && !ASSIGNMENT_ID_RE_Api_.test(id)) id = '';   // 형식이 어긋난 id 는 버리고 새로 발급

  return { id: id, member: member, role: role, plannedMd: plannedMd, start: start, end: end, status: status, note: strApi_(row.note) };
}

// ---------- 시트 블록 유틸 ----------
// 탭 열 개수: HEADERS[탭이름] 우선, 없으면 예비 상수
function colCountApi_(sheetName) {
  const h = (typeof HEADERS === 'object' && HEADERS) ? HEADERS[sheetName] : null;
  if (Array.isArray(h) && h.length > 0) return h.length;
  return COL_COUNT_Api_[sheetName];
}

// 2행~마지막 행 원시 값(getValues 그대로). 데이터가 없으면 [] — 0행 범위를 만들지 않는다
function readBlockApi_(sheet, width) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

// 모든 셀이 빈 행인지
function isBlankRowApi_(vals) {
  for (let i = 0; i < vals.length; i++) if (strApi_(vals[i]) !== '') return false;
  return true;
}

// 1~width 열 기준으로 내용이 있는 마지막 행 번호(헤더만 있으면 1)
function lastContentRowApi_(sheet, width) {
  const block = readBlockApi_(sheet, width);
  for (let i = block.length - 1; i >= 0; i--) if (!isBlankRowApi_(block[i])) return i + 2;
  return 1;
}

// 시트 행 수가 모자라면 늘린다 (범위 밖 쓰기 오류 방지)
function ensureRowsApi_(sheet, lastRowNeeded) {
  const max = sheet.getMaxRows();
  if (lastRowNeeded > max) sheet.insertRowsAfter(max, lastRowNeeded - max);
}

// 마일스톤 F열(상태) 이 값도 수식도 없을 때만 행별 수식을 넣는다.
// 01 파트가 ARRAYFORMULA 로 채웠으면(값이 자동으로 생김) 건드리지 않는다 — 배열 수식 범위 안에 수식을 쓰면 배열 수식이 깨진다.
function fillStatusFormulaIfEmptyApi_(sheet, startRow, count) {
  const col = COL_Api_.milestone.status + 1;   // F
  const headFormula = sheet.getRange(1, col, 2, 1).getFormulas();
  if (/ARRAYFORMULA/i.test(headFormula[0][0]) || /ARRAYFORMULA/i.test(headFormula[1][0])) return;
  const range = sheet.getRange(startRow, col, count, 1);
  const values = range.getValues();
  const formulas = range.getFormulas();
  for (let i = 0; i < count; i++) {
    if (formulas[i][0] !== '' || strApi_(values[i][0]) !== '') continue;
    const r = startRow + i;
    sheet.getRange(r, col).setFormula(ROW_FORMULAS.milestoneStatus(r));
  }
}

// 정산 D·E·H·I 열([자동]) 에 값도 수식도 없을 때만 행별 수식을 넣는다 — setupSheets 와 같은 문자열(ROW_FORMULAS.settlement).
// 초기 설정이 300행까지 미리 채워 둔 수식은 건드리지 않고, 그 아래에 새 행이 붙을 때만 채워진다.
function fillSettlementFormulasApi_(sheet, row) {
  ROW_FORMULAS.settlement.forEach(function (f) {
    const head = sheet.getRange(1, f.col, 2, 1).getFormulas();
    if (/ARRAYFORMULA/i.test(head[0][0]) || /ARRAYFORMULA/i.test(head[1][0])) return;
    const cell = sheet.getRange(row, f.col);
    if (cell.getFormula() !== '' || strApi_(cell.getValue()) !== '') return;
    cell.setFormula(f.make(row));
  });
}
