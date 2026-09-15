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
