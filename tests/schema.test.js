/*!
 * tests/schema.test.js — 편집 계약 검산 (docs/DATA-CONTRACT.md §9 · SPEC v1.3 §5.2)
 *
 * 원칙
 *  - 픽스처는 이 파일 안에서 최소 크기로 직접 만든다(mock/sample-data.json 에 의존하지 않는다).
 *  - 테스트 이름은 계약 §9 의 절 번호로 시작한다. §9.9~§9.14 는 5턴(세부 항목·주석·업무 블럭·롤업·배정 동기화).
 *  - schema.js 는 순수 함수만 두므로 DOM·시트·현재 시각 없이 그대로 검사한다.
 *
 * 실행: node --test tests/schema.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/schema.js');

/* ------------------------------------------------------------------ *
 * 공통 픽스처
 * ------------------------------------------------------------------ */

const TYPES = ['① 리멤버 MICE 솔루션', '② 일반 행사(게런티 없음)', '③ DMS·주최형', '④ 커스터마이즈'];
const ROLES = ['영업', '모객', '운영 PM', '현장 운영', '디자인·제작', '정산·리포트'];
/** 6턴 D22 — 실시트 `설정` 역할 8종(팀이 운영총괄·운영 Sub 를 추가했다). 기본 카탈로그가 덮는 파트 목록이기도 하다 */
const ROLES8 = ROLES.concat(['운영총괄', '운영 Sub']);

/** 계약 §2.2 설정 — 목록 4종 + 월 가용 M/D 20 */
function baseSettings() {
  return {
    statuses: ['견적', '계약', '준비', '진행', '완료', '정산완료', '드롭'],
    types: TYPES.slice(),
    roles: ROLES.slice(),
    commonCodes: ['G-내부', 'G-영업', 'G-휴가'],
    capacityMdPerMonth: 20
  };
}

/**
 * 계약 §2 구조의 최소 data — 팀원 2 · 프로젝트 2 · 배정 3 · 공수기록 2 · 마일스톤 4 · 정산 2
 *  - 팀원1: P-2026-001 담당PM · 배정 1 · 공수기록 2 · 마일스톤 담당 1  → 참조가 있어 삭제 불가
 *  - 팀원2: P-2026-002 담당PM · 배정 2                                → 참조가 있어 삭제 불가
 *  - P-2026-001: 공수기록 1건(나머지 1건은 G-내부) → 삭제 불가(드롭 안내)
 *  - P-2026-002: 공수기록 0 · 매출 없음 → 삭제 가능(연쇄 배정 1 · 마일스톤 2 · 정산 1)
 */
function baseData() {
  return {
    members: [
      { name: '팀원1', role: '운영 PM', capacityMd: 20, status: '재직', color: '#3366CC' },
      { name: '팀원2', role: '모객', capacityMd: 20, status: '재직', color: '' }
    ],
    projects: [
      {
        id: 'P-2026-001', name: '가상 행사 A', client: '가상 발주처', type: TYPES[0], status: '진행', pm: '팀원1',
        eventStart: '2026-11-12', eventEnd: '2026-11-13', kickoff: '', settlementDue: '', venue: '',
        guarantee: 300, expectedAttendees: 400, contractAmount: 50000000, note: '', createdAt: '2026-08-01'
      },
      {
        id: 'P-2026-002', name: '가상 행사 B', client: '리멤버(자체)', type: TYPES[2], status: '견적', pm: '팀원2',
        eventStart: '2026-12-03', eventEnd: '2026-12-03', kickoff: '', settlementDue: '', venue: '',
        guarantee: null, expectedAttendees: null, contractAmount: 20000000, note: '', createdAt: '2026-09-01'
      }
    ],
    assignments: [
      { id: 'A-0001', projectId: 'P-2026-001', member: '팀원1', role: '운영 PM', plannedMd: 5, start: '2026-09-01', end: '2026-09-30', status: '진행', note: '' },
      { id: 'A-0002', projectId: 'P-2026-001', member: '팀원2', role: '모객', plannedMd: 3, start: '2026-09-01', end: '2026-09-30', status: '진행', note: '' },
      { id: 'A-0003', projectId: 'P-2026-002', member: '팀원2', role: '모객', plannedMd: 2, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
    ],
    effortLogs: [
      { week: '2026-09-07', member: '팀원1', projectId: 'P-2026-001', md: 2, memo: '', loggedAt: '2026-09-14 09:00' },
      { week: '2026-09-07', member: '팀원1', projectId: 'G-내부', md: 0.5, memo: '주간 회의', loggedAt: '2026-09-14 09:00' }
    ],
    milestones: [
      { projectId: 'P-2026-001', name: '답사', due: '2026-09-28', done: '', owner: '팀원1' },
      { projectId: 'P-2026-001', name: '행사 당일', due: '2026-11-12', done: '', owner: '' },
      { projectId: 'P-2026-002', name: '답사', due: '2026-10-19', done: '', owner: '' },
      { projectId: 'P-2026-002', name: '행사 당일', due: '2026-12-03', done: '', owner: '' }
    ],
    settlements: [
      { projectId: 'P-2026-001', revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' },
      { projectId: 'P-2026-002', revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' }
    ]
  };
}

/**
 * 검증 컨텍스트 — overrides.settings / overrides.data 는 얕은 병합, mode·expected 는 그대로.
 * 기본 mode 는 'new', expected 는 null.
 */
function ctx(overrides) {
  const o = overrides || {};
  return {
    settings: Object.assign(baseSettings(), o.settings || {}),
    data: Object.assign(baseData(), o.data || {}),
    mode: o.mode || 'new',
    expected: o.expected || null
  };
}

/** 정상 프로젝트 폼 값(문자열 — 폼에서 온 그대로) */
function validProject() {
  return {
    id: '', name: '가상 행사 C', client: '가상 발주처', type: TYPES[0], status: '계약', pm: '팀원1',
    eventStart: '2026-11-12', eventEnd: '2026-11-13', kickoff: '', settlementDue: '', venue: '',
    guarantee: '', expectedAttendees: '300', contractAmount: '50,000,000', note: '', createdAt: ''
  };
}

/** 정상 공수기록 폼 값 */
function validLog() {
  return { week: '2026-09-14', member: '팀원1', projectId: 'P-2026-001', md: '2', memo: '', loggedAt: '' };
}

/**
 * 5턴 픽스처 — baseData + 팀원3(현장 운영) · 마일스톤 1 · 세부 항목 6 · 주석 4 · 기본 카탈로그
 *  - P-2026-001: 항목 5 = 팀원1 ×2(운영 PM · 2 + 2.5) · 팀원3 ×1(현장 운영 · 2) · 미배정 ×2(그중 W-000004 는 임팩트·난이도 상 = 핵심)
 *                주석 4 = W-000001 에 2(미해결 1) · 답사 마일스톤 전체 1 · W-000003 에 1
 *  - P-2026-002: 항목 1(W-000006 · 팀원1 · 운영 PM · 2)
 *  - 배정 A-0001(팀원1 · 운영 PM · 비고 없음 = 수동) 이 P-2026-001 의 (팀원1, 운영 PM) 합계와 겹친다
 *  - 착수일·정산 예정일은 비어 있음 → 행사 시작 −90(2026-08-14) · 행사 종료 +30(2026-12-13) 으로 추정
 */
function t5Data() {
  const d = baseData();
  d.members.push({ name: '팀원3', role: '현장 운영', capacityMd: 20, status: '재직', color: '' });
  d.milestones.push({ projectId: 'P-2026-001', name: '운영계획서 확정', due: '2026-10-29', done: '', owner: '팀원1' });
  d.items = [
    { id: 'W-000001', projectId: 'P-2026-001', milestone: '답사', part: '운영 PM', block: '베뉴 서칭·계약', owner: '팀원1', impact: '상', difficulty: '중', plannedMd: 2, due: '', status: '완료', note: '' },
    { id: 'W-000002', projectId: 'P-2026-001', milestone: '운영계획서 확정', part: '운영 PM', block: '아젠다·프로그램 설정', owner: '팀원1', impact: '상', difficulty: '상', plannedMd: 2.5, due: '2026-10-20', status: '진행', note: '' },
    { id: 'W-000003', projectId: 'P-2026-001', milestone: '행사 당일', part: '현장 운영', block: '등록 파트', owner: '팀원3', impact: '중', difficulty: '하', plannedMd: 2, due: '', status: '예정', note: '' },
    { id: 'W-000004', projectId: 'P-2026-001', milestone: '행사 당일', part: '현장 운영', block: '무대·기술 파트', owner: '', impact: '상', difficulty: '상', plannedMd: 1.5, due: '', status: '예정', note: '' },
    { id: 'W-000005', projectId: 'P-2026-001', milestone: '행사 당일', part: '모객', block: '현장 등록 데스크', owner: '', impact: '중', difficulty: '하', plannedMd: 1, due: '', status: '예정', note: '' },
    { id: 'W-000006', projectId: 'P-2026-002', milestone: '답사', part: '운영 PM', block: '베뉴 서칭·계약', owner: '팀원1', impact: '상', difficulty: '중', plannedMd: 2, due: '', status: '예정', note: '' }
  ];
  d.notes = [
    { id: 'N-000001', projectId: 'P-2026-001', milestone: '답사', itemId: 'W-000001', part: '운영 PM', author: 'a@example.com', authorName: '팀원1', at: '2026-09-01 10:00:00', type: '요청', content: '수용 인원·전기·반입 시간·주차', resolved: '' },
    { id: 'N-000002', projectId: 'P-2026-001', milestone: '답사', itemId: 'W-000001', part: '운영 PM', author: 'a@example.com', authorName: '', at: '2026-09-02 10:00:00', type: '결정', content: '후보 1곳으로 확정', resolved: '예' },
    { id: 'N-000003', projectId: 'P-2026-001', milestone: '답사', itemId: '', part: '모객', author: 'b@example.com', authorName: '팀원2', at: '2026-09-03 10:00:00', type: '질문', content: '답사에 모객 동행이 필요한가요?', resolved: '' },
    { id: 'N-000004', projectId: 'P-2026-001', milestone: '행사 당일', itemId: 'W-000003', part: '현장 운영', author: 'c@example.com', authorName: '', at: '2026-09-04 10:00:00', type: '판단 근거', content: '등록 피크는 10시', resolved: '' }
  ];
  d.blocks = S.DEFAULT_BLOCKS.slice();
  return d;
}

/** 정상 세부 항목 폼 값(신규 · 담당 없음 · 임팩트·난이도·상태 빈 값) */
function validItem() {
  return { id: '', projectId: 'P-2026-001', milestone: '행사 당일', part: '디자인·제작', block: '현장 그래픽·사이니지', owner: '', impact: '', difficulty: '', plannedMd: '1', due: '', status: '', note: '' };
}

/** 정상 주석 폼 값(신규 · 유형 빈 값 → 요청 · 작성자·일시는 서버) */
function validNote() {
  return { id: '', projectId: 'P-2026-001', milestone: '답사', itemId: 'W-000001', part: '운영 PM', author: '', authorName: '', at: '', type: '', content: '반입 시간 확인 요청', resolved: '' };
}

/** errors 배열에서 필드 이름만 뽑는다 */
function fieldsOf(result) {
  return result.errors.map(function (e) { return e.field; });
}

/** 특정 필드의 첫 오류 메시지 */
function messageOf(result, field) {
  const hit = result.errors.filter(function (e) { return e.field === field; })[0];
  return hit ? hit.message : '';
}

/* ================================================================== *
 * §9.1 표 정의
 * ================================================================== */

test('§9.1 표 정의 — 9개 표의 탭 이름·열 수·키가 계약 §3 과 같다', function () {
  assert.deepEqual(Object.keys(S.TABLES).sort(), ['assignments', 'blocks', 'effortLogs', 'items', 'members', 'milestones', 'notes', 'projects', 'settlements']);
  const expected = {
    projects: { sheet: '프로젝트', width: 16, key: ['id'] },
    assignments: { sheet: '배정', width: 9, key: ['id'] },
    effortLogs: { sheet: '공수기록', width: 6, key: ['week', 'member', 'projectId'] },
    members: { sheet: '팀원', width: 6, key: ['name'] },       // 6턴 D17 — F 이메일 추가(A:F)
    milestones: { sheet: '마일스톤', width: 6, key: ['projectId', 'name'] },
    settlements: { sheet: '정산', width: 10, key: ['projectId'] },
    items: { sheet: '세부항목', width: 13, key: ['id'] },            // 5턴 §3.10 (A:M · M 행사명 수식)
    notes: { sheet: '주석', width: 11, key: ['id'] },               // 5턴 §3.11 (A:K)
    blocks: { sheet: '업무블럭', width: 8, key: ['part', 'block'] }  // 5턴 §3.12 (A:H · 시트 전용 카탈로그)
  };
  Object.keys(expected).forEach(function (name) {
    const t = S.TABLES[name];
    assert.equal(t.sheet, expected[name].sheet, name + ' 탭 이름');
    assert.equal(t.width, expected[name].width, name + ' 열 수');
    assert.deepEqual(t.key, expected[name].key, name + ' 키');
    assert.ok(Array.isArray(t.fields) && t.fields.length > 0, name + ' fields');
  });
});

test('§9.1 표 정의 — fields[].col 은 0..width-1 범위·중복 없음, 수식 열은 정산 [3,4,7,8] · 마일스톤 [5] · 세부항목 [12]', function () {
  Object.keys(S.TABLES).forEach(function (name) {
    const t = S.TABLES[name];
    const cols = t.fields.map(function (fd) { return fd.col; });
    cols.forEach(function (c) {
      assert.ok(Number.isInteger(c) && c >= 0 && c < t.width, name + ' col ' + c + ' 범위 밖');
    });
    assert.equal(new Set(cols).size, cols.length, name + ' col 중복');
    // 수식 열은 필드가 아니고, 필드 + 수식 열이 모든 열을 덮는다
    t.formulaCols.forEach(function (c) { assert.ok(cols.indexOf(c) === -1, name + ' 수식 열 ' + c + ' 이 필드와 겹침'); });
    assert.equal(cols.length + t.formulaCols.length, t.width, name + ' 필드 + 수식 열 = 열 수');
  });
  assert.deepEqual(S.TABLES.settlements.formulaCols, [3, 4, 7, 8], '정산 D·E·H·I');
  assert.deepEqual(S.TABLES.milestones.formulaCols, [5], '마일스톤 F');
  assert.deepEqual(S.TABLES.projects.formulaCols, []);
  assert.deepEqual(S.TABLES.effortLogs.formulaCols, []);
  assert.deepEqual(S.TABLES.items.formulaCols, [12], '세부항목 M 행사명(자동)');
  assert.deepEqual(S.TABLES.notes.formulaCols, []);
  assert.deepEqual(S.TABLES.blocks.formulaCols, []);
});

test('§9.1 고정 열거값 7종 · 자동 배정 표식 · 변경이력 탭 정의(6턴 동작 "되돌림" 포함)', function () {
  assert.deepEqual(S.FIXED_ENUMS.assignmentStatus, ['예정', '진행', '종료']);
  assert.deepEqual(S.FIXED_ENUMS.memberStatus, ['재직', '휴직', '퇴사', '지원']);
  assert.deepEqual(S.FIXED_ENUMS.settlementStatus, ['미착수', '진행', '완료']);
  assert.deepEqual(S.FIXED_ENUMS.level, ['상', '중', '하'], '5턴 임팩트·난이도');
  assert.deepEqual(S.FIXED_ENUMS.itemStatus, ['예정', '진행', '완료'], '5턴 세부 항목 상태');
  assert.deepEqual(S.FIXED_ENUMS.noteType, ['판단 근거', '요청', '질문', '결정'], '5턴 주석 유형(D16)');
  assert.deepEqual(S.FIXED_ENUMS.resolved, ['예'], '5턴 주석 해결(빈 값 = 미해결)');
  assert.equal(S.AUTO_ASSIGN_NOTE, '자동(세부항목)', 'D13 — 배정 탭 비고에 이 값이 있는 행만 동기화가 덮어쓴다');
  assert.equal(S.HISTORY.sheet, '변경이력');
  assert.deepEqual(S.HISTORY.headers, ['일시', '사용자', '탭', '키', '동작', '변경 내용', '이전 행(백업)'], '계약 §3.9 헤더');
  assert.deepEqual(S.HISTORY.actions, ['추가', '수정', '삭제', '저장', '되돌림'], '6턴 D19 — 되돌리기도 이력에 남는다');
});

test('§9.1 field() — 필드 조회 · 없는 필드는 null · 없는 표는 오류', function () {
  const fd = S.field('projects', 'contractAmount');
  assert.equal(fd.col, 13);
  assert.equal(fd.label, '계약금액(원)');
  assert.equal(fd.emptyAs, 0);
  assert.equal(fd.integer, true);
  assert.equal(S.field('members', 'name').immutable, true, '팀원 이름은 수정 불가(D10)');
  assert.equal(S.field('effortLogs', 'week').monday, true);
  assert.equal(S.field('effortLogs', 'md').step, 0.5);
  assert.equal(S.field('projects', 'nope'), null);
  assert.throws(function () { S.field('nope', 'id'); }, /알 수 없는 표/);
});

test('§9.1 field() — 5턴 표: 세부ID 자동·불변 · 프로젝트ID 불변 · 계획 M/D 0.5 · 임팩트 기본 중 · 주석 작성자·일시 자동 · 유형 기본 요청 · 블럭 카탈로그 키', function () {
  assert.equal(S.field('items', 'id').auto, true);
  assert.equal(S.field('items', 'id').immutable, true);
  assert.equal(S.field('items', 'projectId').immutable, true, '세부 항목은 프로젝트를 옮길 수 없다');
  assert.equal(S.field('items', 'plannedMd').step, 0.5);
  assert.equal(S.field('items', 'plannedMd').emptyAs, 0);
  assert.equal(S.field('items', 'impact').emptyAs, '중');
  assert.equal(S.field('items', 'difficulty').enumFixed, 'level');
  assert.equal(S.field('items', 'status').emptyAs, '예정');
  assert.equal(S.field('items', 'part').enumFrom, 'roles', '파트 = 설정 탭 역할 6종(D14)');
  assert.equal(S.field('items', 'owner').type, 'member');
  assert.equal(S.field('items', 'milestone').label, '마일스톤');
  assert.equal(S.field('notes', 'author').auto, true, '작성자 = 접속 이메일, 서버가 채움');
  assert.equal(S.field('notes', 'at').auto, true);
  assert.equal(S.field('notes', 'at').type, 'datetime');
  assert.equal(S.field('notes', 'authorName').type, 'member');
  assert.equal(S.field('notes', 'type').emptyAs, '요청');
  assert.equal(S.field('notes', 'type').required, true);
  assert.equal(S.field('notes', 'content').required, true);
  assert.equal(S.field('notes', 'resolved').enumFixed, 'resolved');
  assert.equal(S.field('notes', 'projectId').immutable, true);
  assert.equal(S.field('blocks', 'md').step, 0.5);
  assert.equal(S.field('blocks', 'judge').label, '판단에 필요한 내용');
  assert.equal(S.field('blocks', 'skipForHost').label, '주최형 제외');
  assert.equal(S.TABLES.items.label, '세부 항목');
  assert.equal(S.TABLES.blocks.label, '업무 블럭');
});

/* ================================================================== *
 * §9.2 normalizeRow · emptyRow · 날짜 도우미
 * ================================================================== */

test('§9.2 normalizeRow — 숫자: "1,000" → 1000 · 빈 값은 nullable null / emptyAs 0', function () {
  const v = S.normalizeRow('projects', Object.assign(validProject(), { contractAmount: '1,000', guarantee: '', expectedAttendees: '300' }), ctx());
  assert.equal(v.contractAmount, 1000, '쉼표 제거 후 숫자');
  assert.equal(v.guarantee, null, 'nullable 빈 값 → null');
  assert.equal(v.expectedAttendees, 300);
  const v2 = S.normalizeRow('projects', Object.assign(validProject(), { contractAmount: '' }), ctx());
  assert.equal(v2.contractAmount, 0, 'emptyAs 0');
  const v3 = S.normalizeRow('settlements', { projectId: 'P-2026-001', revenue: '68,000,000', directCost: '' }, ctx());
  assert.equal(v3.revenue, 68000000);
  assert.equal(v3.directCost, null);
  assert.equal(v3.preReg, null, '없는 키도 nullable → null');
});

test('§9.2 normalizeRow — 팀원 가용 빈 값 → settings 기본 · enum 빈 값 → emptyAs', function () {
  const m = S.normalizeRow('members', { name: '팀원3', role: '영업', capacityMd: '', status: '', color: '' }, ctx());
  assert.equal(m.capacityMd, 20, 'settings.capacityMdPerMonth');
  assert.equal(m.status, '재직', '팀원 상태 빈 값 → 재직');
  const m18 = S.normalizeRow('members', { name: '팀원3', role: '영업', capacityMd: '' }, ctx({ settings: { capacityMdPerMonth: 18 } }));
  assert.equal(m18.capacityMd, 18, '설정 값이 18 이면 18');
  const s = S.normalizeRow('settlements', { projectId: 'P-2026-001', status: '' }, ctx());
  assert.equal(s.status, '미착수', '정산 상태 빈 값 → 미착수');
  const a = S.normalizeRow('assignments', { projectId: 'P-2026-001', member: '팀원1', role: '모객', status: '' }, ctx());
  assert.equal(a.status, '예정', '배정 상태 빈 값 → 예정');
  assert.equal(a.plannedMd, 0, '계획 M/D 빈 값 → 0');
});

test('§9.2 normalizeRow — 문자열 trim · 숫자가 아니면 원문 유지(검증이 잡는다)', function () {
  const v = S.normalizeRow('projects', Object.assign(validProject(), { name: '  가상 행사  ', guarantee: 'abc', note: null }), ctx());
  assert.equal(v.name, '가상 행사');
  assert.equal(v.guarantee, 'abc', '숫자 변환 실패는 원문 유지');
  assert.equal(v.note, '', 'null 문자열 → ""');
  assert.equal(v.createdAt, '', 'auto 필드도 문자열로');
});

test('§9.2 emptyRow — 프로젝트 상태·유형 첫 값 · 팀원 가용 20 · 정산 숫자 null', function () {
  const p = S.emptyRow('projects', ctx());
  assert.equal(p.status, '견적');
  assert.equal(p.type, TYPES[0]);
  assert.equal(p.contractAmount, 0);
  assert.equal(p.guarantee, null);
  assert.equal(p.name, '');
  const m = S.emptyRow('members', ctx());
  assert.equal(m.capacityMd, 20);
  assert.equal(m.role, '영업', 'roles[0]');
  assert.equal(m.status, '재직');
  const s = S.emptyRow('settlements', ctx());
  assert.equal(s.revenue, null);
  assert.equal(s.status, '미착수');
  const l = S.emptyRow('effortLogs', ctx());
  assert.equal(l.md, 0);
  assert.equal(l.week, '');
});

test('§9.2 isDateStr · isMonday — 실제 달력 날짜만 · 2026-09-07 은 월요일', function () {
  assert.equal(S.isDateStr('2026-09-07'), true);
  assert.equal(S.isDateStr('2026-02-29'), false, '2026년은 평년');
  assert.equal(S.isDateStr('2028-02-29'), true, '2028년은 윤년');
  assert.equal(S.isDateStr('2026-13-01'), false);
  assert.equal(S.isDateStr('2026/09/07'), false);
  assert.equal(S.isDateStr(''), false);
  assert.equal(S.isDateStr(20260907), false, '숫자는 날짜 문자열이 아님');
  assert.equal(S.isMonday('2026-09-07'), true);
  assert.equal(S.isMonday('2026-09-08'), false);
  assert.equal(S.isMonday('bad'), false);
});

/* ================================================================== *
 * §9.3 validateRow — projects
 * ================================================================== */

test('§9.3 projects — 필수 누락(행사명·유형·상태·행사 시작일·종료일)', function () {
  const r = S.validateRow('projects', {}, ctx());
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r), ['name', 'type', 'status', 'eventStart', 'eventEnd'], '필드 순서대로 필수 오류');
  r.errors.forEach(function (e) {
    assert.match(e.message, /필수입니다/);
    assert.ok(e.label.length > 0, '라벨 있음');
  });
});

test('§9.3 projects — 목록 밖 유형 · 담당PM 이 팀원 탭에 없음 · 종료일 < 시작일', function () {
  const r1 = S.validateRow('projects', Object.assign(validProject(), { type: '⑤ 기타' }), ctx());
  assert.deepEqual(fieldsOf(r1), ['type']);
  assert.match(messageOf(r1, 'type'), /목록에 없습니다/);
  assert.match(messageOf(r1, 'type'), /① 리멤버 MICE 솔루션/, '허용 목록을 메시지에 보여준다');

  const r2 = S.validateRow('projects', Object.assign(validProject(), { pm: '없는사람' }), ctx());
  assert.deepEqual(fieldsOf(r2), ['pm']);
  assert.match(messageOf(r2, 'pm'), /팀원 탭에 없습니다/);

  const r3 = S.validateRow('projects', Object.assign(validProject(), { eventStart: '2026-11-13', eventEnd: '2026-11-12' }), ctx());
  assert.deepEqual(fieldsOf(r3), ['eventEnd']);
  assert.match(messageOf(r3, 'eventEnd'), /앞설 수 없습니다/);

  const r4 = S.validateRow('projects', Object.assign(validProject(), { eventStart: '2026-11-31' }), ctx());
  assert.deepEqual(fieldsOf(r4), ['eventStart'], '11월 31일은 없는 날짜');
});

test('§9.3 projects — 게런티 문자열 · 계약금액 음수 · 정수 아님', function () {
  const r1 = S.validateRow('projects', Object.assign(validProject(), { guarantee: 'abc' }), ctx());
  assert.deepEqual(fieldsOf(r1), ['guarantee']);
  assert.match(messageOf(r1, 'guarantee'), /숫자여야 합니다/);

  const r2 = S.validateRow('projects', Object.assign(validProject(), { contractAmount: '-1' }), ctx());
  assert.deepEqual(fieldsOf(r2), ['contractAmount']);
  assert.match(messageOf(r2, 'contractAmount'), /0 이상/);

  const r3 = S.validateRow('projects', Object.assign(validProject(), { expectedAttendees: '10.5' }), ctx());
  assert.deepEqual(fieldsOf(r3), ['expectedAttendees']);
  assert.match(messageOf(r3, 'expectedAttendees'), /정수/);
});

test('§9.3 projects — 정상 행 ok · values 는 계약 타입', function () {
  const r = S.validateRow('projects', validProject(), ctx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
  assert.equal(r.values.contractAmount, 50000000);
  assert.equal(r.values.guarantee, null);
  assert.equal(r.values.expectedAttendees, 300);
  assert.equal(r.values.id, '', '신규는 ID 없이 통과(서버가 부여)');
  assert.equal(r.values.createdAt, '', '등록일은 서버가 채움');
  assert.equal(Object.keys(r.values).length, S.TABLES.projects.fields.length, '모든 필드 키가 있다');
});

test('§9.3 projects — 수정 모드: ID 비어 있으면 오류 · ID 변경(immutable) 오류 · 같은 ID 면 통과', function () {
  const existing = baseData().projects[0];
  const edit = ctx({ mode: 'edit', expected: existing });
  const rowOk = Object.assign({}, existing, { contractAmount: '60,000,000' });
  const r1 = S.validateRow('projects', rowOk, edit);
  assert.equal(r1.ok, true, JSON.stringify(r1.errors));
  assert.equal(r1.values.contractAmount, 60000000);

  const r2 = S.validateRow('projects', Object.assign({}, existing, { id: '' }), edit);
  assert.equal(r2.ok, false);
  assert.ok(fieldsOf(r2).indexOf('id') !== -1, 'ID 비어 있음 오류');

  const r3 = S.validateRow('projects', Object.assign({}, existing, { id: 'P-2026-009' }), edit);
  assert.equal(r3.ok, false);
  assert.match(messageOf(r3, 'id'), /바꿀 수 없습니다/);

  // 신규 모드에서 이미 있는 ID 를 넣으면 유일키 오류
  const r4 = S.validateRow('projects', Object.assign(validProject(), { id: 'P-2026-001' }), ctx());
  assert.deepEqual(fieldsOf(r4), ['id']);
  assert.match(messageOf(r4, 'id'), /이미 있습니다/);
});

/* ================================================================== *
 * §9.3 validateRow — members
 * ================================================================== */

test('§9.3 members — 이름 필수 · 같은 이름 중복', function () {
  const r1 = S.validateRow('members', { name: '', role: '영업' }, ctx());
  assert.deepEqual(fieldsOf(r1), ['name']);
  assert.match(messageOf(r1, 'name'), /필수/);

  const r2 = S.validateRow('members', { name: '팀원1', role: '영업', capacityMd: '20', status: '재직', color: '' }, ctx());
  assert.deepEqual(fieldsOf(r2), ['name']);
  assert.match(messageOf(r2, 'name'), /같은 이름의 팀원이 이미 있습니다/);

  const r3 = S.validateRow('members', { name: ' 팀원1 ', role: '영업' }, ctx());
  assert.equal(r3.ok, false, '앞뒤 공백을 지운 뒤 비교한다');
});

test('§9.3 members — 주역할 목록 · 상태 고정 열거 · 색상 #RRGGBB', function () {
  const r1 = S.validateRow('members', { name: '팀원3', role: '요리사' }, ctx());
  assert.deepEqual(fieldsOf(r1), ['role']);
  assert.match(messageOf(r1, 'role'), /목록에 없습니다/);

  const r2 = S.validateRow('members', { name: '팀원3', role: '영업', status: '알수없음' }, ctx());
  assert.deepEqual(fieldsOf(r2), ['status']);
  assert.match(messageOf(r2, 'status'), /재직 \/ 휴직 \/ 퇴사 \/ 지원/);

  const r3 = S.validateRow('members', { name: '팀원3', role: '영업', color: 'red' }, ctx());
  assert.deepEqual(fieldsOf(r3), ['color']);
  assert.match(messageOf(r3, 'color'), /#RRGGBB/);

  const r4 = S.validateRow('members', { name: '팀원3', role: '영업', color: '#A1b2C3' }, ctx());
  assert.equal(r4.ok, true, '대소문자 섞인 16진수 허용');

  const r5 = S.validateRow('members', { name: '팀원3', role: '영업', capacityMd: '20.3' }, ctx());
  assert.deepEqual(fieldsOf(r5), ['capacityMd'], '가용 M/D 는 0.5 단위');
});

test('§9.3 members — 수정 모드에서 이름 변경은 오류(D10) · 역할만 바꾸면 통과', function () {
  const existing = baseData().members[0];
  const edit = ctx({ mode: 'edit', expected: existing });
  const r1 = S.validateRow('members', Object.assign({}, existing, { name: '팀원1개명' }), edit);
  assert.equal(r1.ok, false);
  assert.deepEqual(fieldsOf(r1), ['name']);
  assert.match(messageOf(r1, 'name'), /대시보드에서 바꿀 수 없습니다/);
  assert.match(messageOf(r1, 'name'), /시트에서 직접/);

  const r2 = S.validateRow('members', Object.assign({}, existing, { role: '영업', status: '휴직' }), edit);
  assert.equal(r2.ok, true, JSON.stringify(r2.errors) + ' — 자기 자신은 중복에서 제외');
  assert.equal(r2.values.role, '영업');
});

test('§9.3 members — 정상 신규 행: 가용 빈 값 → 20 · 상태 빈 값 → 재직 · 이메일 빈 값 허용(6턴 D17)', function () {
  const r = S.validateRow('members', { name: '팀원3', role: '영업', capacityMd: '', status: '', color: '', email: '' }, ctx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.values, { name: '팀원3', role: '영업', capacityMd: 20, status: '재직', color: '', email: '' });

  const r2 = S.validateRow('members', { name: '팀원4', role: '영업' }, ctx());
  assert.equal(r2.ok, true, JSON.stringify(r2.errors));
  assert.equal(r2.values.email, '', '이메일 키가 없어도 빈 문자열로 정규화된다');
});

/* ================================================================== *
 * §9.3 validateRow — effortLogs
 * ================================================================== */

test('§9.3 effortLogs — 주차가 월요일이 아님 · 팀원 없음 · 프로젝트 코드가 프로젝트도 공통코드도 아님', function () {
  const r1 = S.validateRow('effortLogs', Object.assign(validLog(), { week: '2026-09-15' }), ctx());
  assert.deepEqual(fieldsOf(r1), ['week']);
  assert.match(messageOf(r1, 'week'), /월요일/);

  const r2 = S.validateRow('effortLogs', Object.assign(validLog(), { member: '없는사람' }), ctx());
  assert.deepEqual(fieldsOf(r2), ['member']);

  const r3 = S.validateRow('effortLogs', Object.assign(validLog(), { projectId: 'P-2099-999' }), ctx());
  assert.deepEqual(fieldsOf(r3), ['projectId']);
  assert.match(messageOf(r3, 'projectId'), /공통코드/);

  const r4 = S.validateRow('effortLogs', Object.assign(validLog(), { projectId: 'G-내부' }), ctx());
  assert.equal(r4.ok, true, '공통코드 G-내부 는 통과');
  const r5 = S.validateRow('effortLogs', Object.assign(validLog(), { projectId: 'G-휴가' }), ctx());
  assert.equal(r5.ok, true, '공통코드 G-휴가 는 통과');
});

test('§9.3 effortLogs — 실투입 M/D 0.5 단위 · 음수 불가 · 정상 행', function () {
  const r1 = S.validateRow('effortLogs', Object.assign(validLog(), { md: '1.3' }), ctx());
  assert.deepEqual(fieldsOf(r1), ['md']);
  assert.match(messageOf(r1, 'md'), /0\.5 단위/);

  const r2 = S.validateRow('effortLogs', Object.assign(validLog(), { md: '-0.5' }), ctx());
  assert.deepEqual(fieldsOf(r2), ['md']);

  const r3 = S.validateRow('effortLogs', Object.assign(validLog(), { md: '2.5' }), ctx());
  assert.equal(r3.ok, true, JSON.stringify(r3.errors));
  assert.equal(r3.values.md, 2.5);
  assert.equal(r3.values.loggedAt, '', '기록일시는 서버가 채움');
});

test('§9.3 effortLogs — 같은 (주차·팀원·코드) 중복 · 수정 모드에서 자기 자신은 제외', function () {
  const dupRow = { week: '2026-09-07', member: '팀원1', projectId: 'P-2026-001', md: '3', memo: '' };
  const r1 = S.validateRow('effortLogs', dupRow, ctx());
  assert.equal(r1.ok, false);
  assert.deepEqual(fieldsOf(r1), ['projectId']);
  assert.match(messageOf(r1, 'projectId'), /이미 있습니다/);

  const existing = baseData().effortLogs[0];
  const r2 = S.validateRow('effortLogs', dupRow, ctx({ mode: 'edit', expected: existing }));
  assert.equal(r2.ok, true, '자기 자신(같은 키)은 중복이 아니다');

  // 키를 이미 있는 다른 행의 키로 바꾸는 수정은 중복
  const r3 = S.validateRow('effortLogs', Object.assign({}, dupRow, { projectId: 'G-내부' }), ctx({ mode: 'edit', expected: existing }));
  assert.equal(r3.ok, false, '다른 행과 같은 키가 되면 중복');
});

/* ================================================================== *
 * §9.3 validateRow — milestones
 * ================================================================== */

test('§9.3 milestones — 프로젝트 없음 · 이름 필수 · 예정일 형식', function () {
  const r1 = S.validateRow('milestones', { projectId: 'P-2099-999', name: '답사', due: '2026-10-01' }, ctx());
  assert.deepEqual(fieldsOf(r1), ['projectId']);
  assert.match(messageOf(r1, 'projectId'), /프로젝트 탭에 없습니다/);

  const r2 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '', due: '2026-10-01' }, ctx());
  assert.deepEqual(fieldsOf(r2), ['name']);

  const r3 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '새 항목', due: '2026-13-01' }, ctx());
  assert.deepEqual(fieldsOf(r3), ['due']);
  assert.match(messageOf(r3, 'due'), /YYYY-MM-DD/);

  const r4 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '새 항목', due: '' }, ctx());
  assert.deepEqual(fieldsOf(r4), ['due'], '예정일 필수');

  const r5 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '새 항목', due: '2026-10-01', done: '', owner: '팀원2' }, ctx());
  assert.equal(r5.ok, true, JSON.stringify(r5.errors));
});

test('§9.3 milestones — 같은 프로젝트 안 이름 중복 · 수정 모드 자기 제외 · 다른 프로젝트면 허용', function () {
  const r1 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '답사', due: '2026-10-01' }, ctx());
  assert.equal(r1.ok, false);
  assert.deepEqual(fieldsOf(r1), ['name']);
  assert.match(messageOf(r1, 'name'), /같은 이름의 마일스톤이 이미 있습니다/);

  const existing = baseData().milestones[0];
  const r2 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '답사', due: '2026-10-05', owner: '' }, ctx({ mode: 'edit', expected: existing }));
  assert.equal(r2.ok, true, '자기 자신은 제외');

  const r3 = S.validateRow('milestones', { projectId: 'P-2026-001', name: '행사 당일', due: '2026-10-05' }, ctx({ mode: 'edit', expected: existing }));
  assert.equal(r3.ok, false, '이름을 다른 행의 이름으로 바꾸면 중복');

  const r4 = S.validateRow('milestones', { projectId: 'P-2026-002', name: '운영계획서 확정', due: '2026-11-19' }, ctx());
  assert.equal(r4.ok, true, '다른 프로젝트의 같은 이름은 허용');
});

/* ================================================================== *
 * §9.3 validateRow — settlements
 * ================================================================== */

test('§9.3 settlements — 숫자 nullable · 정산 상태 열거 · 프로젝트ID 필수', function () {
  const r1 = S.validateRow('settlements', { projectId: 'P-2026-001', revenue: '', directCost: '', preReg: '', attended: '', status: '' }, ctx());
  assert.equal(r1.ok, true, JSON.stringify(r1.errors));
  assert.equal(r1.values.revenue, null);
  assert.equal(r1.values.attended, null);
  assert.equal(r1.values.status, '미착수');

  const r2 = S.validateRow('settlements', { projectId: 'P-2026-001', status: '보류' }, ctx());
  assert.deepEqual(fieldsOf(r2), ['status']);
  assert.match(messageOf(r2, 'status'), /미착수 \/ 진행 \/ 완료/);

  const r3 = S.validateRow('settlements', { projectId: '', revenue: '1000' }, ctx());
  assert.deepEqual(fieldsOf(r3), ['projectId']);
  assert.match(messageOf(r3, 'projectId'), /필수/);

  const r4 = S.validateRow('settlements', { projectId: 'P-2026-001', revenue: '-5' }, ctx());
  assert.deepEqual(fieldsOf(r4), ['revenue'], '매출 음수 불가');
});

test('§9.3 settlements — 정상 입력 · 수정 모드에서 프로젝트ID 변경 불가', function () {
  const r1 = S.validateRow('settlements', { projectId: 'P-2026-001', revenue: '68,000,000', directCost: '47,600,000', preReg: '420', attended: '290', status: '완료' }, ctx());
  assert.equal(r1.ok, true, JSON.stringify(r1.errors));
  assert.deepEqual(r1.values, { projectId: 'P-2026-001', revenue: 68000000, directCost: 47600000, preReg: 420, attended: 290, status: '완료' });

  const existing = baseData().settlements[0];
  const r2 = S.validateRow('settlements', { projectId: 'P-2026-002', revenue: '1000' }, ctx({ mode: 'edit', expected: existing }));
  assert.equal(r2.ok, false);
  assert.match(messageOf(r2, 'projectId'), /바꿀 수 없습니다/);
});

/* ================================================================== *
 * §9.4 validateEffortWeek
 * ================================================================== */

test('§9.4 validateEffortWeek — 정상 3행: ok · total · values 에 주차·팀원 포함', function () {
  const rows = [
    { projectId: 'P-2026-001', md: '2', memo: '' },
    { projectId: 'G-내부', md: '0.5', memo: '주간 회의' },
    { projectId: 'P-2026-002', md: '1.5', memo: '제안 준비' }
  ];
  const r = S.validateEffortWeek('팀원1', '2026-09-14', rows, ctx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.total, 4);
  assert.equal(r.values.length, 3);
  r.values.forEach(function (v) {
    assert.equal(v.week, '2026-09-14');
    assert.equal(v.member, '팀원1');
    assert.equal(typeof v.md, 'number');
    assert.equal(v.loggedAt, '');
  });
  assert.equal(r.values[1].memo, '주간 회의');
});

test('§9.4 validateEffortWeek — 같은 코드 2회는 오류(행 번호 포함)', function () {
  const rows = [
    { projectId: 'P-2026-001', md: '1' },
    { projectId: 'P-2026-001', md: '2' }
  ];
  const r = S.validateEffortWeek('팀원1', '2026-09-14', rows, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].row, 1, '두 번째 행(0 기반 1)');
  assert.match(r.errors[0].message, /^2번째 행: /);
  assert.match(r.errors[0].message, /두 번 있습니다/);
});

test('§9.4 validateEffortWeek — 합계 > 5 는 warnings 1 (오류 아님)', function () {
  const rows = [
    { projectId: 'P-2026-001', md: '3' },
    { projectId: 'G-내부', md: '2.5' }
  ];
  const r = S.validateEffortWeek('팀원1', '2026-09-14', rows, ctx());
  assert.equal(r.ok, true, '경고만');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /5\.5 M\/D/);
  assert.match(r.warnings[0], /주 5\.0/);
  assert.equal(r.total, 5.5);

  const r5 = S.validateEffortWeek('팀원1', '2026-09-14', [{ projectId: 'P-2026-001', md: '5' }], ctx());
  assert.deepEqual(r5.warnings, [], '정확히 5.0 은 경고 없음');
});

test('§9.4 validateEffortWeek — 월요일 아님 · 팀원 없음 · 행 오류에 번호 · rows 가 배열 아님', function () {
  const r1 = S.validateEffortWeek('팀원1', '2026-09-15', [{ projectId: 'P-2026-001', md: '1' }], ctx());
  assert.equal(r1.ok, false);
  assert.deepEqual(fieldsOf(r1), ['week']);
  assert.match(messageOf(r1, 'week'), /월요일/);

  const r2 = S.validateEffortWeek('', '2026-09-14', [], ctx());
  assert.deepEqual(fieldsOf(r2), ['member']);
  assert.match(messageOf(r2, 'member'), /고르세요/);

  const r3 = S.validateEffortWeek('팀원1', '2026-09-14', [{ projectId: 'P-2026-001', md: '1' }, { projectId: 'P-2099-999', md: '1.3' }], ctx());
  assert.equal(r3.ok, false);
  assert.deepEqual(fieldsOf(r3), ['projectId', 'md']);
  r3.errors.forEach(function (e) {
    assert.equal(e.row, 1);
    assert.match(e.message, /^2번째 행: /);
  });

  const r4 = S.validateEffortWeek('팀원1', '2026-09-14', 'x', ctx());
  assert.equal(r4.ok, false);
  assert.deepEqual(fieldsOf(r4), ['rows']);
  assert.deepEqual(r4.values, []);
  assert.equal(r4.total, 0);
});

/* ================================================================== *
 * §9.5 deleteCheck (D8)
 * ================================================================== */

test('§9.5 deleteCheck 프로젝트 — 공수기록이 있으면 불가(사유에 "드롭")', function () {
  const d = baseData();
  const r = S.deleteCheck('projects', d.projects[0], d);   // P-2026-001: 공수기록 1건(G-내부 행은 프로젝트 참조가 아님)
  assert.equal(r.ok, false);
  assert.match(r.reason, /공수기록 1건/);
  assert.match(r.reason, /드롭/);
  assert.equal(r.cascade.effortLogs, 1);
  assert.equal(r.cascade.assignments, 2);
  assert.equal(r.cascade.milestones, 2);
  assert.equal(r.cascade.settlements, 1);
});

test('§9.5 deleteCheck 프로젝트 — 정산 매출이 입력돼 있으면 불가', function () {
  const d = baseData();
  d.settlements[1].revenue = 15000000;   // P-2026-002 (공수기록 0)
  const r = S.deleteCheck('projects', d.projects[1], d);
  assert.equal(r.ok, false);
  assert.match(r.reason, /정산 매출/);
  assert.match(r.reason, /드롭/);

  d.settlements[1].revenue = 0;
  assert.equal(S.deleteCheck('projects', d.projects[1], d).ok, false, '0 도 입력된 값');
});

test('§9.5 deleteCheck 프로젝트 — 가능하면 연쇄 건수(배정·마일스톤·정산 + 5턴 세부 항목·주석)가 정확', function () {
  const d = baseData();
  const r = S.deleteCheck('projects', d.projects[1], d);   // P-2026-002
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.reason, '');
  assert.deepEqual(r.cascade, { assignments: 1, milestones: 2, settlements: 1, effortLogs: 0, items: 0, notes: 0 }, 'v1.3: items·notes 키 추가(데이터에 없으면 0)');

  const none = S.deleteCheck('projects', { id: 'P-2099-999' }, d);
  assert.equal(none.ok, true);
  assert.deepEqual(none.cascade, { assignments: 0, milestones: 0, settlements: 0, effortLogs: 0, items: 0, notes: 0 });
});

test('§9.5 deleteCheck 팀원 — 담당PM·배정·공수·마일스톤 담당 참조 시 불가(사유에 "퇴사"와 건수)', function () {
  const d = baseData();
  const r1 = S.deleteCheck('members', d.members[0], d);   // 팀원1
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /담당PM 1건/);
  assert.match(r1.reason, /배정 1건/);
  assert.match(r1.reason, /공수기록 2건/);
  assert.match(r1.reason, /마일스톤 담당 1건/);
  assert.match(r1.reason, /퇴사/);
  assert.deepEqual(r1.cascade, { assignments: 0, milestones: 0, settlements: 0, effortLogs: 0, items: 0, notes: 0 }, '팀원은 연쇄 삭제 없음');

  const r2 = S.deleteCheck('members', d.members[1], d);   // 팀원2: 담당PM 1 · 배정 2
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /담당PM 1건 · 배정 2건/);
  assert.doesNotMatch(r2.reason, /공수기록/);
});

test('§9.5 deleteCheck 팀원 — 참조가 없으면 ok', function () {
  const d = baseData();
  d.members.push({ name: '팀원3', role: '영업', capacityMd: 20, status: '재직', color: '' });
  const r = S.deleteCheck('members', d.members[2], d);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.reason, '');
});

test('§9.5 deleteCheck — 정산은 항상 불가 · 마일스톤·배정·공수기록은 ok · 모르는 표는 불가', function () {
  const d = baseData();
  const s = S.deleteCheck('settlements', d.settlements[0], d);
  assert.equal(s.ok, false);
  assert.match(s.reason, /지우지 않습니다/);

  assert.equal(S.deleteCheck('milestones', d.milestones[0], d).ok, true);
  assert.equal(S.deleteCheck('assignments', d.assignments[0], d).ok, true);
  assert.equal(S.deleteCheck('effortLogs', d.effortLogs[0], d).ok, true);

  const u = S.deleteCheck('nope', {}, d);
  assert.equal(u.ok, false);
  assert.match(u.reason, /알 수 없는 표/);
});

/* ================================================================== *
 * §9.6 keyOf · keyLabel · findRow
 * ================================================================== */

test('§9.6 keyOf · keyLabel — 단일키 · 복합키(공수기록 · 마일스톤) · 공백 정리', function () {
  const log = baseData().effortLogs[0];
  assert.deepEqual(S.keyOf('effortLogs', log), { week: '2026-09-07', member: '팀원1', projectId: 'P-2026-001' });
  assert.equal(S.keyLabel('effortLogs', log), '2026-09-07 · 팀원1 · P-2026-001');

  assert.deepEqual(S.keyOf('milestones', { projectId: 'P-2026-001', name: '답사', due: '2026-09-28' }), { projectId: 'P-2026-001', name: '답사' });
  assert.equal(S.keyLabel('milestones', { projectId: 'P-2026-001', name: '답사' }), 'P-2026-001 · 답사');

  assert.deepEqual(S.keyOf('projects', { id: 'P-2026-001', name: '가상' }), { id: 'P-2026-001' });
  assert.equal(S.keyLabel('projects', { id: 'P-2026-001' }), 'P-2026-001');
  assert.deepEqual(S.keyOf('members', { name: ' 팀원1 ' }), { name: '팀원1' }, '앞뒤 공백 제거');
  assert.deepEqual(S.keyOf('settlements', null), { projectId: '' }, '행이 없으면 빈 키');
});

test('§9.6 findRow — 키로 행 인덱스 · 없으면 -1', function () {
  const d = baseData();
  assert.equal(S.findRow('milestones', d.milestones, { projectId: 'P-2026-001', name: '행사 당일' }), 1);
  assert.equal(S.findRow('milestones', d.milestones, { projectId: 'P-2026-002', name: '답사' }), 2, '같은 이름이라도 프로젝트로 구분');
  assert.equal(S.findRow('milestones', d.milestones, { projectId: 'P-2026-001', name: '없음' }), -1);
  assert.equal(S.findRow('effortLogs', d.effortLogs, S.keyOf('effortLogs', d.effortLogs[1])), 1);
  assert.equal(S.findRow('projects', d.projects, { id: 'P-2026-002' }), 1);
  assert.equal(S.findRow('projects', [], { id: 'P-2026-002' }), -1);
  assert.equal(S.findRow('projects', null, { id: 'P-2026-002' }), -1, '목록이 없어도 -1');
});

/* ================================================================== *
 * §9.7 diff · summarize
 * ================================================================== */

test('§9.7 diff — auto 필드 제외 · 바뀐 것만 · null 과 "" 는 같은 값', function () {
  const before = baseData().projects[0];
  const after = Object.assign({}, before, { contractAmount: 60000000, createdAt: '2026-09-13', kickoff: null });
  const d = S.diff('projects', before, after);
  assert.deepEqual(d, [{ field: 'contractAmount', label: '계약금액(원)', before: '50000000', after: '60000000' }]);

  assert.deepEqual(S.diff('projects', before, Object.assign({}, before)), [], '변경 없음');
  const d2 = S.diff('members', { name: '팀원1', role: '운영 PM', capacityMd: 20, status: '재직', color: '' }, { name: '팀원1', role: '영업', capacityMd: 18, status: '재직', color: '' });
  assert.deepEqual(d2.map(function (x) { return x.field; }), ['role', 'capacityMd']);
});

test('§9.7 summarize — 추가는 빈 값 제외 · 수정은 "라벨: 이전 → 새" · 변경 없으면 "변경 없음"', function () {
  const added = S.summarize('members', '추가', null, { name: '팀원3', role: '영업', capacityMd: 20, status: '재직', color: '' });
  assert.equal(added, '이름: 팀원3\n주역할: 영업\n월 가용 M/D: 20\n상태: 재직');

  const before = baseData().projects[0];
  const after = Object.assign({}, before, { venue: '코엑스', contractAmount: 60000000, createdAt: '2026-09-13' });
  assert.equal(S.summarize('projects', '수정', before, after), '베뉴: (빈 값) → 코엑스\n계약금액(원): 50000000 → 60000000');
  assert.equal(S.summarize('projects', '수정', before, Object.assign({}, before)), '변경 없음');

  // 저장(주간 공수)은 추가와 같은 형식 · auto(기록일시) 제외
  const saved = S.summarize('effortLogs', '저장', null, { week: '2026-09-14', member: '팀원1', projectId: 'G-내부', md: 0.5, memo: '', loggedAt: '2026-09-14 09:00' });
  assert.equal(saved, '주차: 2026-09-14\n팀원: 팀원1\n프로젝트ID: G-내부\n실투입 M/D: 0.5');
});

test('§9.7 summarize — 삭제는 키 포함 · extra 를 마지막 줄에 덧붙임', function () {
  const del = S.summarize('milestones', '삭제', { projectId: 'P-2026-001', name: '답사', due: '2026-09-28' }, null);
  assert.equal(del, '마일스톤 행 삭제: P-2026-001 · 답사');

  const delWithExtra = S.summarize('projects', '삭제', { id: 'P-2026-002', name: '가상 행사 B' }, null, '함께 삭제: 배정 1 · 마일스톤 2 · 정산 1');
  assert.equal(delWithExtra, '프로젝트 행 삭제: P-2026-002\n함께 삭제: 배정 1 · 마일스톤 2 · 정산 1');

  const before = baseData().projects[0];
  const edited = S.summarize('projects', '수정', before, Object.assign({}, before, { status: '완료' }), '표준 마일스톤 0건 생성');
  assert.equal(edited, '상태: 진행 → 완료\n표준 마일스톤 0건 생성');
});

/* ================================================================== *
 * §9.8 toValues
 * ================================================================== */

test('§9.8 toValues — 길이 = width · 수식 열 null · null 값은 "" · 날짜 문자열 유지', function () {
  const s = S.toValues('settlements', { projectId: 'P-2026-001', revenue: 68000000, directCost: null, preReg: 420, attended: 290, status: '완료' });
  assert.equal(s.length, 10);
  assert.deepEqual(s, ['P-2026-001', 68000000, '', null, null, 420, 290, null, null, '완료']);

  const m = S.toValues('milestones', { projectId: 'P-2026-001', name: '답사', due: '2026-09-28', done: '', owner: '팀원1' });
  assert.equal(m.length, 6);
  assert.deepEqual(m, ['P-2026-001', '답사', '2026-09-28', '', '팀원1', null]);
  assert.equal(typeof m[2], 'string', '날짜는 문자열 그대로(서버가 Date 로 바꾼다)');
});

test('§9.8 toValues — 프로젝트 16열 · 없는 키는 "" · 수식 열 없는 표는 null 없음', function () {
  const p = S.toValues('projects', baseData().projects[1]);
  assert.equal(p.length, 16);
  assert.equal(p[0], 'P-2026-002');
  assert.equal(p[11], '', '게런티 null → ""');
  assert.equal(p[13], 20000000);
  assert.equal(p[15], '2026-09-01');
  assert.ok(p.every(function (v) { return v !== null; }), '수식 열이 없으니 null 없음');

  const e = S.toValues('effortLogs', { week: '2026-09-14', member: '팀원1' });
  assert.deepEqual(e, ['2026-09-14', '팀원1', '', '', '', ''], '없는 키는 빈 문자열');
  assert.deepEqual(S.toValues('members', null), ['', '', '', '', '', ''], '행이 없어도 길이 유지(6턴 D17 — 팀원 6열)');
  assert.deepEqual(
    S.toValues('members', { name: '팀원1', role: '운영 PM', capacityMd: 20, status: '재직', color: '#3366CC', email: 'hong@company.com' }),
    ['팀원1', '운영 PM', 20, '재직', '#3366CC', 'hong@company.com'],
    '이메일은 F열(마지막)'
  );
});

/* ================================================================== *
 * §9.9 validateRow — items (5턴 · 세부 항목 = 마일스톤 아래 파트별 업무 블럭)
 * ================================================================== */

test('§9.9 items — 필수 누락(프로젝트ID·마일스톤·파트·블럭) · 세부ID 는 신규에서 검사하지 않음 · 빈 값 기본(임팩트·난이도 중 · 상태 예정 · M/D 0)', function () {
  const r = S.validateRow('items', {}, ctx({ data: t5Data() }));
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r), ['projectId', 'milestone', 'part', 'block'], '필드 순서대로 필수 오류');
  r.errors.forEach(function (e) { assert.match(e.message, /필수입니다/); });
  assert.equal(r.values.id, '');
  assert.equal(r.values.impact, '중', '임팩트 빈 값 → 중');
  assert.equal(r.values.difficulty, '중', '난이도 빈 값 → 중');
  assert.equal(r.values.status, '예정', '상태 빈 값 → 예정');
  assert.equal(r.values.plannedMd, 0, '계획 M/D 빈 값 → 0');
});

test('§9.9 items — 파트 목록 밖 · 임팩트·난이도 상/중/하 밖 · 계획 M/D 0.5 단위·음수 · 담당이 팀원 탭에 없음 · 예정일 형식 · 상태 열거', function () {
  const c = ctx({ data: t5Data() });
  const r1 = S.validateRow('items', Object.assign(validItem(), { part: '기획' }), c);
  assert.deepEqual(fieldsOf(r1), ['part']);
  assert.match(messageOf(r1, 'part'), /목록에 없습니다/);
  assert.match(messageOf(r1, 'part'), /영업 \/ 모객 \/ 운영 PM/, '설정 탭 역할 목록을 보여준다');

  const r2 = S.validateRow('items', Object.assign(validItem(), { impact: '최상' }), c);
  assert.deepEqual(fieldsOf(r2), ['impact']);
  assert.match(messageOf(r2, 'impact'), /상 \/ 중 \/ 하/);
  const r2b = S.validateRow('items', Object.assign(validItem(), { difficulty: '높음' }), c);
  assert.deepEqual(fieldsOf(r2b), ['difficulty']);

  const r3 = S.validateRow('items', Object.assign(validItem(), { plannedMd: '1.3' }), c);
  assert.deepEqual(fieldsOf(r3), ['plannedMd']);
  assert.equal(messageOf(r3, 'plannedMd'), '계획 M/D 은(는) 0.5 단위로 입력합니다.');
  const r3b = S.validateRow('items', Object.assign(validItem(), { plannedMd: '-0.5' }), c);
  assert.deepEqual(fieldsOf(r3b), ['plannedMd']);
  assert.match(messageOf(r3b, 'plannedMd'), /0 이상/);

  const r4 = S.validateRow('items', Object.assign(validItem(), { owner: '없는사람' }), c);
  assert.deepEqual(fieldsOf(r4), ['owner']);
  assert.equal(messageOf(r4, 'owner'), '담당 "없는사람" 이(가) 팀원 탭에 없습니다.');

  const r5 = S.validateRow('items', Object.assign(validItem(), { due: '2026-11-31' }), c);
  assert.deepEqual(fieldsOf(r5), ['due']);
  assert.match(messageOf(r5, 'due'), /YYYY-MM-DD/);

  const r6 = S.validateRow('items', Object.assign(validItem(), { status: '보류' }), c);
  assert.deepEqual(fieldsOf(r6), ['status']);
  assert.match(messageOf(r6, 'status'), /예정 \/ 진행 \/ 완료/);
});

test('§9.9 items — 마일스톤은 그 프로젝트의 마일스톤 탭에 있어야 함(다른 프로젝트의 같은 이름은 불가) · 프로젝트가 없으면 참조 오류 + 마일스톤 오류', function () {
  const c = ctx({ data: t5Data() });
  const r1 = S.validateRow('items', Object.assign(validItem(), { milestone: '없는 마일스톤' }), c);
  assert.deepEqual(fieldsOf(r1), ['milestone']);
  assert.equal(messageOf(r1, 'milestone'), '프로젝트 P-2026-001 에 마일스톤 "없는 마일스톤" 이(가) 없습니다.');

  // '운영계획서 확정' 은 P-2026-001 에만 있다
  const r2 = S.validateRow('items', Object.assign(validItem(), { projectId: 'P-2026-002', milestone: '운영계획서 확정' }), c);
  assert.deepEqual(fieldsOf(r2), ['milestone']);
  const r2b = S.validateRow('items', Object.assign(validItem(), { projectId: 'P-2026-002', milestone: '답사', block: '새 블럭' }), c);
  assert.equal(r2b.ok, true, JSON.stringify(r2b.errors));

  const r3 = S.validateRow('items', Object.assign(validItem(), { projectId: 'P-2099-999' }), c);
  assert.deepEqual(fieldsOf(r3), ['projectId', 'milestone']);
  assert.match(messageOf(r3, 'projectId'), /프로젝트 탭에 없습니다/);
});

test('§9.9 items — (프로젝트ID·마일스톤·블럭) 중복 · 수정 모드 자기 제외 · 다른 행의 블럭으로 바꾸면 중복 · 다른 마일스톤의 같은 블럭은 허용', function () {
  const d = t5Data();
  const c = ctx({ data: d });
  const dup = Object.assign(validItem(), { milestone: '답사', part: '운영 PM', block: '베뉴 서칭·계약' });
  const r1 = S.validateRow('items', dup, c);
  assert.equal(r1.ok, false);
  assert.deepEqual(fieldsOf(r1), ['block']);
  assert.equal(messageOf(r1, 'block'), '마일스톤 "답사" 에 같은 블럭이 이미 있습니다: 베뉴 서칭·계약');

  const existing = d.items[0];   // W-000001
  const r2 = S.validateRow('items', Object.assign({}, existing, { plannedMd: '3', owner: '팀원1' }), ctx({ data: d, mode: 'edit', expected: existing }));
  assert.equal(r2.ok, true, JSON.stringify(r2.errors) + ' — 자기 자신은 중복이 아니다');
  assert.equal(r2.values.plannedMd, 3);

  const w3 = d.items[2];   // W-000003 행사 당일 · 등록 파트
  const r3 = S.validateRow('items', Object.assign({}, w3, { block: '무대·기술 파트' }), ctx({ data: d, mode: 'edit', expected: w3 }));
  assert.equal(r3.ok, false, 'W-000004 와 같은 (프로젝트·마일스톤·블럭)');
  assert.deepEqual(fieldsOf(r3), ['block']);

  // 같은 블럭이라도 마일스톤이 다르면 허용(파트가 달라도 키에는 들어가지 않는다)
  const r4 = S.validateRow('items', Object.assign(validItem(), { milestone: '행사 당일', part: '운영 PM', block: '베뉴 서칭·계약' }), c);
  assert.equal(r4.ok, true, JSON.stringify(r4.errors));
  const r5 = S.validateRow('items', Object.assign(validItem(), { milestone: '답사', part: '모객', block: '베뉴 서칭·계약' }), c);
  assert.equal(r5.ok, false, '파트가 달라도 (프로젝트·마일스톤·블럭)이 같으면 중복');
});

test('§9.9 items — 수정 모드: 세부ID 비어 있으면 오류 · 프로젝트ID 변경 불가(immutable) · 정상 신규 values 는 계약 타입 · emptyRow · toValues 13열', function () {
  const d = t5Data();
  const existing = d.items[0];
  const edit = ctx({ data: d, mode: 'edit', expected: existing });
  const r1 = S.validateRow('items', Object.assign({}, existing, { id: '' }), edit);
  assert.ok(fieldsOf(r1).indexOf('id') !== -1, '세부ID 비어 있음');
  assert.match(messageOf(r1, 'id'), /비어 있습니다/);

  // P-2026-002 에도 '답사' 가 있어 마일스톤 오류는 없고, 블럭을 바꿔 중복도 없앤다 → immutable 오류만
  const r2 = S.validateRow('items', Object.assign({}, existing, { projectId: 'P-2026-002', block: '고객사 커뮤니케이션' }), edit);
  assert.deepEqual(fieldsOf(r2), ['projectId']);
  assert.match(messageOf(r2, 'projectId'), /대시보드에서 바꿀 수 없습니다/);

  const r3 = S.validateRow('items', validItem(), ctx({ data: d }));
  assert.equal(r3.ok, true, JSON.stringify(r3.errors));
  assert.deepEqual(r3.values, {
    id: '', projectId: 'P-2026-001', milestone: '행사 당일', part: '디자인·제작', block: '현장 그래픽·사이니지',
    owner: '', impact: '중', difficulty: '중', plannedMd: 1, due: '', status: '예정', note: ''
  });
  assert.equal(Object.keys(r3.values).length, S.TABLES.items.fields.length);

  assert.deepEqual(S.emptyRow('items', ctx()), { id: '', projectId: '', milestone: '', part: '', block: '', owner: '', impact: '중', difficulty: '중', plannedMd: 0, due: '', status: '예정', note: '' });
  const v = S.toValues('items', d.items[0]);
  assert.equal(v.length, 13);
  assert.equal(v[12], null, 'M 행사명(자동) 수식 열은 쓰지 않는다');
  assert.equal(v[0], 'W-000001');
  assert.equal(v[8], 2);
  assert.equal(v[9], '', '예정일 빈 값');
});

/* ================================================================== *
 * §9.9 validateRow — notes (5턴 · 주석)
 * ================================================================== */

test('§9.9 notes — 정상 신규: 유형 빈 값 → 요청 · 작성자·일시는 서버가 채움("") · 해결 빈 값 · 마일스톤 전체 주석(세부ID 없음)도 허용', function () {
  const d = t5Data();
  const r = S.validateRow('notes', validNote(), ctx({ data: d }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.values, {
    id: '', projectId: 'P-2026-001', milestone: '답사', itemId: 'W-000001', part: '운영 PM',
    author: '', authorName: '', at: '', type: '요청', content: '반입 시간 확인 요청', resolved: ''
  });
  assert.equal(Object.keys(r.values).length, S.TABLES.notes.fields.length);
  assert.equal(S.toValues('notes', r.values).length, 11);
  assert.ok(S.toValues('notes', r.values).every(function (x) { return x !== null; }), '주석은 수식 열 없음');

  const e = S.emptyRow('notes', ctx());
  assert.equal(e.type, '요청');
  assert.equal(e.resolved, '');
  assert.equal(e.author, '');

  const r2 = S.validateRow('notes', Object.assign(validNote(), { itemId: '', authorName: '팀원2', type: '결정', resolved: '예' }), ctx({ data: d }));
  assert.equal(r2.ok, true, JSON.stringify(r2.errors));
  assert.equal(r2.values.resolved, '예');
});

test('§9.9 notes — 내용 필수 · 파트 필수 · 유형 4종 밖 · 해결은 "예" 또는 빈 값 · 작성자 이름이 팀원 탭에 없음', function () {
  const c = ctx({ data: t5Data() });
  const r1 = S.validateRow('notes', Object.assign(validNote(), { content: '  ' }), c);
  assert.deepEqual(fieldsOf(r1), ['content']);
  assert.equal(messageOf(r1, 'content'), '내용 은(는) 필수입니다.');

  const r2 = S.validateRow('notes', Object.assign(validNote(), { part: '' }), c);
  assert.deepEqual(fieldsOf(r2), ['part']);

  const r3 = S.validateRow('notes', Object.assign(validNote(), { type: '메모' }), c);
  assert.deepEqual(fieldsOf(r3), ['type']);
  assert.match(messageOf(r3, 'type'), /판단 근거 \/ 요청 \/ 질문 \/ 결정/);

  const r4 = S.validateRow('notes', Object.assign(validNote(), { resolved: '아니오' }), c);
  assert.deepEqual(fieldsOf(r4), ['resolved']);
  assert.match(messageOf(r4, 'resolved'), /\(예\)/);

  const r5 = S.validateRow('notes', Object.assign(validNote(), { authorName: '없는사람' }), c);
  assert.deepEqual(fieldsOf(r5), ['authorName']);
  assert.match(messageOf(r5, 'authorName'), /작성자 이름 "없는사람" 이\(가\) 팀원 탭에 없습니다/);
});

test('§9.9 notes — 세부ID 는 실제 항목이어야 함 · 마일스톤은 그 프로젝트에 있어야 함 · 수정 모드 프로젝트ID 변경 불가 · 내용·해결 수정은 통과', function () {
  const d = t5Data();
  const c = ctx({ data: d });
  const r1 = S.validateRow('notes', Object.assign(validNote(), { itemId: 'W-999999' }), c);
  assert.deepEqual(fieldsOf(r1), ['itemId']);
  assert.equal(messageOf(r1, 'itemId'), '세부 항목 "W-999999" 이(가) 없습니다.');

  const r2 = S.validateRow('notes', Object.assign(validNote(), { milestone: '없는 마일스톤' }), c);
  assert.deepEqual(fieldsOf(r2), ['milestone']);
  assert.match(messageOf(r2, 'milestone'), /마일스톤 "없는 마일스톤" 이\(가\) 없습니다/);

  const existing = d.notes[0];
  const edit = ctx({ data: d, mode: 'edit', expected: existing });
  const r3 = S.validateRow('notes', Object.assign({}, existing, { projectId: 'P-2026-002', itemId: '' }), edit);
  assert.deepEqual(fieldsOf(r3), ['projectId']);
  assert.match(messageOf(r3, 'projectId'), /바꿀 수 없습니다/);

  const r4 = S.validateRow('notes', Object.assign({}, existing, { content: '고친 내용', resolved: '예' }), edit);
  assert.equal(r4.ok, true, JSON.stringify(r4.errors));
  assert.equal(r4.values.author, 'a@example.com', '작성자는 폼 값이 그대로 남는다(서버가 본인 여부를 판정)');
});

/* ================================================================== *
 * §9.10 deleteCheck — 5턴 확장(마일스톤 · 세부 항목 · 주석 · 업무 블럭 · 프로젝트 연쇄)
 * ================================================================== */

test('§9.10 deleteCheck 마일스톤 — 세부 항목이 있으면 불가(건수 + "항목을 먼저 지우세요") · 없으면 ok · 같은 이름이라도 프로젝트로 구분', function () {
  const d = t5Data();
  const r1 = S.deleteCheck('milestones', { projectId: 'P-2026-001', name: '답사' }, d);
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, '세부 항목 1건이 있어 삭제할 수 없습니다. 항목을 먼저 지우세요.');
  assert.equal(r1.cascade.items, 1);
  assert.equal(r1.cascade.notes, 3, '답사의 주석 3건(항목 주석 2 + 마일스톤 전체 주석 1)');

  const r2 = S.deleteCheck('milestones', { projectId: 'P-2026-001', name: '행사 당일' }, d);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /세부 항목 3건/);

  const r3 = S.deleteCheck('milestones', { projectId: 'P-2026-002', name: '행사 당일' }, d);
  assert.equal(r3.ok, true, r3.reason);
  assert.deepEqual(r3.cascade, { assignments: 0, milestones: 0, settlements: 0, effortLogs: 0, items: 0, notes: 0 });

  const r4 = S.deleteCheck('milestones', { projectId: 'P-2026-002', name: '답사' }, d);
  assert.equal(r4.ok, false, 'P-2026-002 답사에는 W-000006');
  assert.match(r4.reason, /세부 항목 1건/);
});

test('§9.10 deleteCheck 세부 항목 — 항상 ok · 그 항목의 주석 건수가 cascade.notes(서버가 연쇄 삭제)', function () {
  const d = t5Data();
  const r1 = S.deleteCheck('items', d.items[0], d);   // W-000001: 주석 2
  assert.equal(r1.ok, true);
  assert.equal(r1.reason, '');
  assert.deepEqual(r1.cascade, { assignments: 0, milestones: 0, settlements: 0, effortLogs: 0, items: 0, notes: 2 });

  const r2 = S.deleteCheck('items', { id: 'W-000004' }, d);
  assert.equal(r2.ok, true);
  assert.equal(r2.cascade.notes, 0);
  assert.equal(S.deleteCheck('items', { id: 'W-000001' }, {}).cascade.notes, 0, '주석 목록이 없어도 0');
});

test('§9.10 deleteCheck — 주석·업무 블럭은 대시보드에서 삭제 불가 · 프로젝트 연쇄에 세부 항목·주석 건수 포함', function () {
  const d = t5Data();
  const n = S.deleteCheck('notes', d.notes[0], d);
  assert.equal(n.ok, false);
  assert.equal(n.reason, '주석은 대시보드에서 지우지 않습니다. 해결로 표시하거나 시트에서 지우세요.');

  const b = S.deleteCheck('blocks', d.blocks[0], d);
  assert.equal(b.ok, false);
  assert.equal(b.reason, '업무 블럭 카탈로그는 시트의 업무블럭 탭에서 고칩니다.');

  const p = S.deleteCheck('projects', d.projects[1], d);   // P-2026-002: 공수기록 0 · 매출 없음
  assert.equal(p.ok, true, p.reason);
  assert.deepEqual(p.cascade, { assignments: 1, milestones: 2, settlements: 1, effortLogs: 0, items: 1, notes: 0 });

  const p1 = S.deleteCheck('projects', d.projects[0], d);  // P-2026-001: 공수기록이 있어 불가지만 cascade 는 채워진다
  assert.equal(p1.ok, false);
  assert.equal(p1.cascade.items, 5);
  assert.equal(p1.cascade.notes, 4);
});

/* ================================================================== *
 * §9.11 itemRollup — 프로젝트 하나의 세부 항목 합계(계획 공수 합계 · M/M 환산 · 파트·담당·마일스톤별 · 핵심 미배정)
 * ================================================================== */

test('§9.11 itemRollup — 합계 9 M/D · M/M = ÷ 월 가용 20 → 0.45 · 파트·담당·마일스톤별 · 미배정 2.5 · 핵심 미배정 = W-000004', function () {
  const d = t5Data();
  const r = S.itemRollup(d, 'P-2026-001', baseSettings());
  assert.equal(r.count, 5);
  assert.equal(r.totalMd, 9, '2 + 2.5 + 2 + 1.5 + 1');
  assert.equal(r.capacityMd, 20);
  assert.equal(r.mm, 0.45, 'D12 — M/M 환산 = ÷ 월 가용 M/D');
  assert.deepEqual(r.byPart, { '운영 PM': 4.5, '현장 운영': 3.5, '모객': 1 });
  assert.deepEqual(r.byMember, { '팀원1': 4.5, '팀원3': 2 }, '담당 없는 항목은 담당별에 없다');
  assert.deepEqual(r.byMilestone, { '답사': 2, '운영계획서 확정': 2.5, '행사 당일': 4.5 });
  assert.equal(r.unassignedMd, 2.5, '담당 없는 항목의 합(파트 합계로만 표시)');
  assert.deepEqual(r.keyUnassigned.map(function (it) { return it.id; }), ['W-000004'], '임팩트 상 또는 난이도 상인데 담당이 빈 항목만(W-000005 는 중·하)');
});

test('§9.11 itemRollup — M/M 환산은 settings 의 월 가용 M/D 를 따르고(18 → 0.5) 없거나 0 이면 20 · 항목 없는 프로젝트·데이터는 0', function () {
  const d = t5Data();
  assert.equal(S.itemRollup(d, 'P-2026-001', { capacityMdPerMonth: 18 }).mm, 0.5);
  assert.equal(S.itemRollup(d, 'P-2026-001', { capacityMdPerMonth: 18 }).capacityMd, 18);
  assert.equal(S.itemRollup(d, 'P-2026-001', null).mm, 0.45, 'settings 없음 → 20');
  assert.equal(S.itemRollup(d, 'P-2026-001', { capacityMdPerMonth: 0 }).capacityMd, 20, '0 은 20 으로');
  assert.equal(S.itemRollup(d, 'P-2026-001', { capacityMdPerMonth: 'abc' }).capacityMd, 20, '숫자가 아니면 20');

  const none = S.itemRollup(d, 'P-2099-999', baseSettings());
  assert.deepEqual(none, { count: 0, totalMd: 0, mm: 0, capacityMd: 20, byPart: {}, byMember: {}, byMilestone: {}, unassignedMd: 0, keyUnassigned: [] });
  assert.equal(S.itemRollup({}, 'P-2026-001', baseSettings()).count, 0, 'items 가 없어도 0');
  assert.equal(S.itemRollup(null, 'P-2026-001', baseSettings()).count, 0, 'data 가 없어도 0');
});

test('§9.11 itemRollup — 계획 M/D 가 빈 값·문자열이면 0 · 파트·마일스톤 빈 값은 "(파트 없음)"·"(마일스톤 없음)" 으로 묶임 · 프로젝트별로 나뉜다', function () {
  const d = t5Data();
  d.items = [
    { id: 'W-1', projectId: 'P-2026-001', milestone: '답사', part: '', block: 'a', owner: '팀원1', impact: '중', difficulty: '중', plannedMd: '', due: '', status: '예정', note: '' },
    { id: 'W-2', projectId: 'P-2026-001', milestone: '답사', part: '모객', block: 'b', owner: '팀원1', impact: '중', difficulty: '중', plannedMd: 'abc', due: '', status: '예정', note: '' },
    { id: 'W-3', projectId: 'P-2026-001', milestone: '', part: '모객', block: 'c', owner: '', impact: '상', difficulty: '중', plannedMd: 0.5, due: '', status: '예정', note: '' },
    { id: 'W-4', projectId: 'P-2026-002', milestone: '답사', part: '모객', block: 'd', owner: '', impact: '하', difficulty: '상', plannedMd: 4, due: '', status: '예정', note: '' }
  ];
  const r = S.itemRollup(d, 'P-2026-001', baseSettings());
  assert.equal(r.count, 3);
  assert.equal(r.totalMd, 0.5);
  assert.deepEqual(r.byPart, { '(파트 없음)': 0, '모객': 0.5 });
  assert.deepEqual(r.byMilestone, { '답사': 0, '(마일스톤 없음)': 0.5 });
  assert.deepEqual(r.byMember, { '팀원1': 0 });
  assert.deepEqual(r.keyUnassigned.map(function (it) { return it.id; }), ['W-3']);
  const r2 = S.itemRollup(d, 'P-2026-002', baseSettings());
  assert.equal(r2.totalMd, 4);
  assert.equal(r2.mm, 0.2);
  assert.deepEqual(r2.keyUnassigned.map(function (it) { return it.id; }), ['W-4'], '난이도 상도 핵심');
});

/* ================================================================== *
 * §9.12 assignmentsFromItems — D13(A안) 세부 항목 → 배정 자동 행. 서버(Code.gs)·mock 이 같은 결과를 내야 한다
 * ================================================================== */

test('§9.12 assignmentsFromItems — 담당 있는 항목만 (담당, 파트) 로 묶어 합산 · 같은 (담당, 파트) 수동 행이 있으면 자동 행 생략 + overlaps', function () {
  const d = t5Data();
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r.projectId, 'P-2026-001');
  assert.equal(r.auto.length, 1, '팀원1·운영 PM 은 수동 A-0001 과 겹쳐 생략');
  assert.deepEqual(r.auto[0], {
    id: '', projectId: 'P-2026-001', member: '팀원3', role: '현장 운영', plannedMd: 2,
    start: '2026-10-29', end: '2026-11-12', status: '예정', note: S.AUTO_ASSIGN_NOTE
  }, '행사 당일 예정일 11-12 − 14일 ~ 11-12 · 비고 = 자동(세부항목)');
  assert.deepEqual(r.overlaps, [{ member: '팀원1', role: '운영 PM', itemsMd: 4.5, manualMd: 5 }], '세부 합계 4.5 vs 수동 5');
  assert.deepEqual(r.manual.map(function (a) { return a.id; }), ['A-0001', 'A-0002'], '이 프로젝트의 수동 행만');
  assert.equal(r.changed, true, '기존 자동 행이 없으므로 변경');
});

test('§9.12 assignmentsFromItems — 수동 행을 지우면 다음 동기화 때 자동 행이 생긴다: 기간 = min(항목 날짜) − 14일 ~ max(항목 날짜)', function () {
  const d = t5Data();
  d.assignments = d.assignments.filter(function (a) { return a.id !== 'A-0001'; });
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r.auto.length, 2);
  assert.deepEqual(r.overlaps, []);
  const a1 = r.auto[0];
  assert.equal(a1.member, '팀원1');
  assert.equal(a1.role, '운영 PM');
  assert.equal(a1.plannedMd, 4.5, '2 + 2.5');
  assert.equal(a1.start, '2026-09-14', '답사 예정일 09-28(항목 예정일 없음 → 마일스톤 예정일) − 14일');
  assert.equal(a1.end, '2026-10-20', '항목 예정일 10-20 이 최대(마일스톤 예정일 10-29 보다 항목 예정일 우선)');
  assert.equal(a1.status, '예정');
  assert.equal(r.auto[1].member, '팀원3');
  assert.equal(r.changed, true);
});

test('§9.12 assignmentsFromItems — 기간을 착수일~정산 예정일 안으로 자른다(비어 있으면 −90/+30 추정 · 설정 오프셋 사용) · 시작 > 종료면 시작 = 종료', function () {
  const d = t5Data();
  d.items = [
    { id: 'W-1', projectId: 'P-2026-001', milestone: '답사', part: '운영 PM', block: 'a', owner: '팀원1', impact: '중', difficulty: '중', plannedMd: 1, due: '2026-08-20', status: '예정', note: '' },
    { id: 'W-2', projectId: 'P-2026-001', milestone: '답사', part: '운영 PM', block: 'b', owner: '팀원1', impact: '중', difficulty: '중', plannedMd: 1, due: '2026-12-20', status: '예정', note: '' }
  ];
  // 착수일 비어 있음 → 행사 시작일 11-12 − 90 = 08-14 · 정산 예정일 비어 있음 → 행사 종료일 11-13 + 30 = 12-13
  const r1 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, [], baseSettings());
  assert.equal(r1.auto[0].start, '2026-08-14', '08-20 − 14 = 08-06 → 착수 추정일로 자름');
  assert.equal(r1.auto[0].end, '2026-12-13', '12-20 → 정산 추정일로 자름');
  assert.equal(r1.auto[0].plannedMd, 2);

  const p = Object.assign({}, d.projects[0], { kickoff: '2026-09-01', settlementDue: '2026-11-30' });
  const r2 = S.assignmentsFromItems(p, d.items, d.milestones, [], baseSettings());
  assert.equal(r2.auto[0].start, '2026-09-01', '착수일이 있으면 그 값');
  assert.equal(r2.auto[0].end, '2026-11-30', '정산 예정일이 있으면 그 값');

  const r3 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, [], { timelineOffsets: { kickoffDays: -30, settlementDays: 10 } });
  assert.equal(r3.auto[0].start, '2026-10-13', '설정 착수 오프셋 −30');
  assert.equal(r3.auto[0].end, '2026-11-23', '설정 정산 오프셋 +10');

  d.items = [d.items[0]];   // 08-20 만 · 착수일 09-01 보다 앞
  const r4 = S.assignmentsFromItems(p, d.items, d.milestones, [], baseSettings());
  assert.equal(r4.auto[0].start, '2026-08-20', '시작(09-01) > 종료(08-20) → 시작 = 종료');
  assert.equal(r4.auto[0].end, '2026-08-20');
});

test('§9.12 assignmentsFromItems — 날짜가 하나도 없으면 착수일~행사 종료일 · 담당 없는 항목·다른 프로젝트 항목은 제외', function () {
  const d = t5Data();
  d.items = [
    { id: 'W-1', projectId: 'P-2026-001', milestone: '없는 마일스톤', part: '모객', block: 'a', owner: '팀원2', impact: '중', difficulty: '중', plannedMd: 1.5, due: '', status: '예정', note: '' },
    { id: 'W-2', projectId: 'P-2026-001', milestone: '답사', part: '모객', block: 'b', owner: '', impact: '상', difficulty: '상', plannedMd: 3, due: '', status: '예정', note: '' },
    { id: 'W-3', projectId: 'P-2026-002', milestone: '답사', part: '모객', block: 'c', owner: '팀원2', impact: '중', difficulty: '중', plannedMd: 2, due: '', status: '예정', note: '' }
  ];
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, [], baseSettings());
  assert.equal(r.auto.length, 1);
  assert.equal(r.auto[0].plannedMd, 1.5, '담당 없는 W-2 · 다른 프로젝트 W-3 제외');
  assert.equal(r.auto[0].start, '2026-08-14', '착수(추정)');
  assert.equal(r.auto[0].end, '2026-11-13', '행사 종료일');
  const r2 = S.assignmentsFromItems(Object.assign({}, d.projects[0], { kickoff: '2026-09-01' }), d.items, d.milestones, [], baseSettings());
  assert.equal(r2.auto[0].start, '2026-09-01');
  assert.equal(r2.auto[0].end, '2026-11-13');
  const r3 = S.assignmentsFromItems(d.projects[0], [], d.milestones, [], baseSettings());
  assert.deepEqual(r3, { projectId: 'P-2026-001', auto: [], manual: [], overlaps: [], changed: false }, '항목도 배정도 없으면 변경 없음');
});

test('§9.12 assignmentsFromItems — 기존 자동 행(비고 "자동(세부항목)")의 ID 를 같은 (담당, 파트)에 재사용 · 같은 결과면 changed=false · 항목이 없어지면 자동 행 삭제 대상', function () {
  const d = t5Data();
  d.assignments = d.assignments.filter(function (a) { return a.id !== 'A-0001'; });
  d.assignments.push({ id: 'A-0010', projectId: 'P-2026-001', member: '팀원3', role: '현장 운영', plannedMd: 2, start: '2026-10-29', end: '2026-11-12', status: '예정', note: S.AUTO_ASSIGN_NOTE });
  d.assignments.push({ id: 'A-0011', projectId: 'P-2026-001', member: '팀원1', role: '운영 PM', plannedMd: 4.5, start: '2026-09-14', end: '2026-10-20', status: '진행', note: S.AUTO_ASSIGN_NOTE });
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r.changed, false, '담당·파트·M/D·기간이 같으면 변경 없음(상태·ID 는 비교하지 않음)');
  assert.deepEqual(r.auto.map(function (a) { return a.id; }), ['A-0011', 'A-0010'], '항목 순서(팀원1 먼저) · 기존 자동 행 ID 재사용');
  assert.deepEqual(r.manual.map(function (a) { return a.id; }), ['A-0002'], '자동 행은 manual 에 없다');

  d.items[2].plannedMd = 3;   // W-000003 팀원3
  const r2 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r2.changed, true, '항목 M/D 가 바뀌면 변경');
  assert.equal(r2.auto[1].plannedMd, 3);
  assert.equal(r2.auto[1].id, 'A-0010');

  const r3 = S.assignmentsFromItems(d.projects[0], [], d.milestones, d.assignments, baseSettings());
  assert.deepEqual(r3.auto, []);
  assert.equal(r3.changed, true, '기존 자동 행 2개가 사라져야 하므로 변경');
});

test('§9.12 assignmentsFromItems — 겹침: 수동 행이 여러 개면 manualMd 는 합계 · 자동 행이 있던 (담당, 파트)에 수동 행이 생기면 자동 행은 사라지고 changed', function () {
  const d = t5Data();
  d.assignments.push({ id: 'A-0012', projectId: 'P-2026-001', member: '팀원1', role: '운영 PM', plannedMd: 1.5, start: '2026-10-01', end: '2026-10-31', status: '예정', note: '추가 수동' });
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.deepEqual(r.overlaps, [{ member: '팀원1', role: '운영 PM', itemsMd: 4.5, manualMd: 6.5 }], '5 + 1.5');

  d.assignments.push({ id: 'A-0010', projectId: 'P-2026-001', member: '팀원3', role: '현장 운영', plannedMd: 2, start: '2026-10-29', end: '2026-11-12', status: '예정', note: S.AUTO_ASSIGN_NOTE });
  d.assignments.push({ id: 'A-0013', projectId: 'P-2026-001', member: '팀원3', role: '현장 운영', plannedMd: 4, start: '2026-11-01', end: '2026-11-15', status: '예정', note: '' });
  const r2 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.deepEqual(r2.auto, [], '두 (담당, 파트) 모두 수동 행과 겹침');
  assert.equal(r2.overlaps.length, 2);
  assert.deepEqual(r2.overlaps[1], { member: '팀원3', role: '현장 운영', itemsMd: 2, manualMd: 4 });
  assert.equal(r2.changed, true, '기존 자동 행 A-0010 이 사라져야 하므로 변경');
  // 같은 사람이라도 파트가 다르면 겹침이 아니다
  d.assignments = d.assignments.filter(function (a) { return a.id !== 'A-0013' && a.id !== 'A-0010'; });
  d.assignments.push({ id: 'A-0014', projectId: 'P-2026-001', member: '팀원3', role: '모객', plannedMd: 1, start: '2026-11-01', end: '2026-11-15', status: '예정', note: '' });
  const r3 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r3.auto.length, 1);
  assert.equal(r3.auto[0].member, '팀원3');
  assert.equal(r3.overlaps.length, 1, '팀원1·운영 PM 만');
});

test('§9.12 assignmentsFromItems — 다른 프로젝트의 자동 행·수동 행은 건드리지 않는다 · 배정·설정이 없어도 동작', function () {
  const d = t5Data();
  d.assignments.push({ id: 'A-0020', projectId: 'P-2026-002', member: '팀원1', role: '운영 PM', plannedMd: 9, start: '2026-10-01', end: '2026-10-31', status: '예정', note: S.AUTO_ASSIGN_NOTE });
  const r = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, d.assignments, baseSettings());
  assert.ok(r.manual.every(function (a) { return a.projectId === 'P-2026-001'; }));
  assert.ok(r.auto.every(function (a) { return a.projectId === 'P-2026-001'; }));
  assert.equal(r.overlaps.length, 1, 'P-2026-002 의 자동 행은 P-2026-001 과 무관');

  const r2 = S.assignmentsFromItems(d.projects[1], d.items, d.milestones, d.assignments, baseSettings());
  assert.equal(r2.auto.length, 1, 'P-2026-002: W-000006 팀원1·운영 PM');
  assert.equal(r2.auto[0].id, 'A-0020', '기존 자동 행 ID 재사용');
  assert.equal(r2.auto[0].plannedMd, 2);
  assert.equal(r2.auto[0].start, '2026-10-05', 'P-2026-002 답사 10-19 − 14');
  assert.equal(r2.auto[0].end, '2026-10-19');
  assert.equal(r2.changed, true, 'M/D 9 → 2');
  assert.deepEqual(r2.manual.map(function (a) { return a.id; }), ['A-0003']);

  const r3 = S.assignmentsFromItems(d.projects[0], d.items, d.milestones, null, null);
  assert.equal(r3.auto.length, 2, '배정·설정이 없으면 전부 자동 행(오프셋 기본 −90/+30)');
  assert.deepEqual(r3.manual, []);
  assert.equal(r3.auto[0].start, '2026-09-14');
});

/* ================================================================== *
 * §9.13 noteCounts · itemDate · addDaysStr · isKeyItem · 키·이력 요약(세부 항목·주석·업무 블럭)
 * ================================================================== */

test('§9.13 noteCounts — 세부ID 기준 · (프로젝트·마일스톤) 기준 · 프로젝트 전체 · 미해결 = 해결이 "예" 가 아닌 것', function () {
  const d = t5Data();
  assert.deepEqual(S.noteCounts(d.notes, { itemId: 'W-000001' }), { total: 2, open: 1 });
  assert.deepEqual(S.noteCounts(d.notes, { projectId: 'P-2026-001', milestone: '답사' }), { total: 3, open: 2 }, '항목 주석 2 + 마일스톤 전체 주석 1');
  assert.deepEqual(S.noteCounts(d.notes, { projectId: 'P-2026-001' }), { total: 4, open: 3 });
  assert.deepEqual(S.noteCounts(d.notes, { itemId: 'W-999999' }), { total: 0, open: 0 });
  assert.deepEqual(S.noteCounts(null, { itemId: 'W-000001' }), { total: 0, open: 0 });
  assert.deepEqual(S.noteCounts(d.notes, { projectId: 'P-2026-002' }), { total: 0, open: 0 });
  assert.deepEqual(S.noteCounts(d.notes, null), { total: 0, open: 0 }, '대상이 없으면 0');
});

test('§9.13 itemDate — 항목 예정일 > 그 프로젝트 마일스톤 예정일 > 빈 값 · 형식이 틀린 예정일은 무시', function () {
  const d = t5Data();
  assert.equal(S.itemDate(d.items[1], d.milestones), '2026-10-20', '항목 예정일 우선');
  assert.equal(S.itemDate(d.items[0], d.milestones), '2026-09-28', '없으면 마일스톤 예정일');
  assert.equal(S.itemDate(Object.assign({}, d.items[0], { due: '2026-13-01' }), d.milestones), '2026-09-28', '틀린 날짜는 무시');
  assert.equal(S.itemDate(Object.assign({}, d.items[0], { milestone: '없음' }), d.milestones), '');
  assert.equal(S.itemDate(Object.assign({}, d.items[0], { projectId: 'P-2026-002' }), d.milestones), '2026-10-19', '같은 이름이라도 프로젝트로 구분');
  assert.equal(S.itemDate(d.items[0], null), '');
});

test('§9.13 addDaysStr · isKeyItem', function () {
  assert.equal(S.addDaysStr('2026-09-28', -14), '2026-09-14');
  assert.equal(S.addDaysStr('2026-12-31', 1), '2027-01-01');
  assert.equal(S.addDaysStr('2026-03-01', -1), '2026-02-28', '평년');
  assert.equal(S.addDaysStr('2028-03-01', -1), '2028-02-29', '윤년');
  assert.equal(S.addDaysStr('2026-11-12', -90), '2026-08-14', '착수 추정');
  assert.equal(S.addDaysStr('2026-09-28'), '2026-09-28', 'n 없음 → 그대로');
  assert.equal(S.addDaysStr('bad', 1), '');
  assert.equal(S.addDaysStr('', 1), '');
  assert.equal(S.isKeyItem({ impact: '상', difficulty: '하' }), true);
  assert.equal(S.isKeyItem({ impact: '하', difficulty: '상' }), true);
  assert.equal(S.isKeyItem({ impact: '중', difficulty: '중' }), false);
  assert.equal(S.isKeyItem({}), false);
  assert.equal(S.isKeyItem(null), false);
});

test('§9.13 keyOf · keyLabel · findRow · summarize · diff — 세부 항목·주석·업무 블럭', function () {
  const d = t5Data();
  assert.deepEqual(S.keyOf('items', d.items[0]), { id: 'W-000001' });
  assert.equal(S.keyLabel('items', d.items[0]), 'P-2026-001 · 답사 · 베뉴 서칭·계약 (W-000001)');
  assert.equal(S.keyLabel('items', { projectId: 'P-2026-001', milestone: '답사', block: '새 블럭' }), 'P-2026-001 · 답사 · 새 블럭', '신규(ID 없음)');
  assert.equal(S.keyLabel('notes', d.notes[0]), 'N-000001 · W-000001');
  assert.equal(S.keyLabel('notes', d.notes[2]), 'N-000003', '마일스톤 전체 주석은 세부ID 없음');
  assert.deepEqual(S.keyOf('blocks', d.blocks[0]), { part: '영업', block: '견적·제안서 작성' });
  assert.equal(S.keyLabel('blocks', d.blocks[0]), '영업 · 견적·제안서 작성');
  assert.equal(S.findRow('items', d.items, { id: 'W-000003' }), 2);
  assert.equal(S.findRow('notes', d.notes, { id: 'N-000004' }), 3);
  assert.equal(S.findRow('blocks', d.blocks, { part: '모객', block: '타깃 명단 확보' }), 4);
  assert.equal(S.findRow('blocks', d.blocks, { part: '영업', block: '타깃 명단 확보' }), -1, '파트+블럭 복합키');

  // 이력 요약: 자동 필드(세부ID·작성자·일시) 제외 · 빈 값 제외
  assert.equal(S.summarize('items', '추가', null, d.items[0]),
    '프로젝트ID: P-2026-001\n마일스톤: 답사\n파트: 운영 PM\n블럭: 베뉴 서칭·계약\n담당: 팀원1\n임팩트: 상\n난이도: 중\n계획 M/D: 2\n상태: 완료');
  assert.equal(S.summarize('notes', '추가', null, d.notes[0]),
    '프로젝트ID: P-2026-001\n마일스톤: 답사\n세부ID: W-000001\n파트: 운영 PM\n작성자 이름: 팀원1\n유형: 요청\n내용: 수용 인원·전기·반입 시간·주차');
  assert.equal(S.summarize('items', '삭제', d.items[0], null, '함께 삭제: 주석 2'),
    '세부 항목 행 삭제: P-2026-001 · 답사 · 베뉴 서칭·계약 (W-000001)\n함께 삭제: 주석 2');
  assert.equal(S.summarize('items', '수정', d.items[0], Object.assign({}, d.items[0], { owner: '', plannedMd: 3 })),
    '담당: 팀원1 → (빈 값)\n계획 M/D: 2 → 3');
  assert.deepEqual(S.diff('notes', d.notes[0], Object.assign({}, d.notes[0], { resolved: '예', at: '2026-09-09 00:00:00' })),
    [{ field: 'resolved', label: '해결', before: '', after: '예' }], '일시(auto)는 diff 에서 제외');
});

/* ================================================================== *
 * §9.14 DEFAULT_BLOCKS — 기본 업무 블럭 카탈로그(업무블럭 탭이 없을 때 서버·mock 이 그대로 쓴다)
 * ================================================================== */

test('§9.14 DEFAULT_BLOCKS — 44건(6턴 D22: 운영총괄 6 · 운영 Sub 5 추가) · 파트 8종(설정 역할 순서) · (파트·블럭) 유일 · 기본 마일스톤은 표준 9종 · M/D 0.5 단위 · 영업 4건만 주최형 제외', function () {
  const B = S.DEFAULT_BLOCKS;
  const MS = ['계약 체결', '발주처 기초자료 수령', '답사', '랜딩페이지 컨펌', '운영계획서 확정', '행사 7일 전 점검', '행사 당일', '정산보고 제출', '정산 승인'];
  assert.equal(B.length, 44);
  const byPart = {};
  const keys = new Set();
  B.forEach(function (b) {
    assert.ok(ROLES8.indexOf(b.part) !== -1, '파트 ' + b.part);
    assert.ok(typeof b.block === 'string' && b.block.length > 0, '블럭 이름');
    assert.ok(MS.indexOf(b.milestone) !== -1, b.block + ' 의 기본 마일스톤 "' + b.milestone + '"');
    assert.ok(typeof b.md === 'number' && b.md > 0 && (b.md * 2) % 1 === 0, b.block + ' 기본 M/D ' + b.md);
    assert.ok(['상', '중', '하'].indexOf(b.impact) !== -1, b.block + ' 임팩트');
    assert.ok(['상', '중', '하'].indexOf(b.difficulty) !== -1, b.block + ' 난이도');
    assert.ok(typeof b.judge === 'string' && b.judge.length > 0, b.block + ' 판단에 필요한 내용(첫 주석 재료)');
    assert.equal(typeof b.skipForHost, 'boolean', b.block + ' 주최형 제외');
    assert.equal(b.skipForHost, b.part === '영업', b.block + ' — 주최형 제외는 영업 4건만');
    keys.add(b.part + '|' + b.block);
    byPart[b.part] = (byPart[b.part] || 0) + 1;
  });
  assert.equal(keys.size, 44, '(파트·블럭) 중복 없음');
  assert.deepEqual(byPart, { '영업': 4, '모객': 5, '운영 PM': 8, '현장 운영': 6, '디자인·제작': 6, '정산·리포트': 4, '운영총괄': 6, '운영 Sub': 5 });
  assert.deepEqual(Object.keys(byPart), ROLES8, '설정 역할 순서대로 묶여 있다(추가 2종은 뒤에)');
  assert.equal(B.reduce(function (s, b) { return s + b.md; }, 0), 64.5, '기본 M/D 합계(카탈로그 전체)');
});

test('§9.14 DEFAULT_BLOCKS — 카탈로그 44건이 blocks 표 검증을 통과(역할 8종 설정) · 파트·블럭 필수 · 대시보드에서 지울 수 없다', function () {
  const c = ctx({ settings: { roles: ROLES8 } });
  S.DEFAULT_BLOCKS.forEach(function (b) {
    const r = S.validateRow('blocks', b, c);
    assert.equal(r.ok, true, b.block + ': ' + JSON.stringify(r.errors));
    assert.equal(r.values.md, b.md);
  });
  const r = S.validateRow('blocks', { part: '영업', block: '' }, c);
  assert.deepEqual(fieldsOf(r), ['block']);
  const r2 = S.validateRow('blocks', { part: '기획', block: 'x', md: '1.3' }, c);
  assert.deepEqual(fieldsOf(r2), ['part', 'md']);
  assert.equal(S.deleteCheck('blocks', S.DEFAULT_BLOCKS[0], {}).ok, false);
  assert.equal(S.toValues('blocks', S.DEFAULT_BLOCKS[0]).length, 8);

  /* 역할 목록이 6종인 시트에서는 운영총괄·운영 Sub 블럭이 파트 오류가 된다 — 카탈로그 파생(§9.21)이 필요한 이유 */
  const r3 = S.validateRow('blocks', S.DEFAULT_BLOCKS[33], ctx());
  assert.deepEqual(fieldsOf(r3), ['part'], '설정 역할에 없는 파트는 목록 오류');
});
