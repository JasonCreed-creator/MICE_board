/*!
 * tests/metrics.test.js — 산식 계약 검산 (docs/DATA-CONTRACT.md §4)
 *
 * 원칙
 *  - 픽스처는 이 파일 안에서 최소 크기로 직접 만든다(mock/sample-data.json 에 의존하지 않는다).
 *  - 기대값은 전부 손으로 계산하고, 계산 과정을 주석으로 남긴다.
 *  - 소수 비교는 near() 로 1e-9 오차를 허용한다.
 *
 * 실행: node --test tests/metrics.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/metrics.js');

/* ------------------------------------------------------------------ *
 * 공통 픽스처
 * ------------------------------------------------------------------ */

/** 계약 §2.2 표준 마일스톤 템플릿 9종 — 순서 고정 */
const TEMPLATE = [
  { name: '계약 체결', offsetDays: -90, role: '영업', skipForHost: true },
  { name: '발주처 기초자료 수령', offsetDays: -50, role: '운영 PM', skipForHost: true },
  { name: '답사', offsetDays: -45, role: '운영 PM', skipForHost: false },
  { name: '랜딩페이지 컨펌', offsetDays: -35, role: '모객', skipForHost: false },
  { name: '운영계획서 확정', offsetDays: -14, role: '운영 PM', skipForHost: false },
  { name: '행사 7일 전 점검', offsetDays: -7, role: '운영 PM', skipForHost: false },
  { name: '행사 당일', offsetDays: 0, role: '현장 운영', skipForHost: false },
  { name: '정산보고 제출', offsetDays: 5, role: '정산·리포트', skipForHost: false },
  { name: '정산 승인', offsetDays: 30, role: '정산·리포트', skipForHost: false }
];

/** 계약 §2.2 기본 설정 */
function baseSettings() {
  return {
    statuses: ['견적', '계약', '준비', '진행', '완료', '정산완료', '드롭'],
    types: ['① 리멤버 MICE 솔루션', '② 일반 행사(게런티 없음)', '③ DMS·주최형', '④ 커스터마이즈'],
    roles: ['영업', '모객', '운영 PM', '현장 운영', '디자인·제작', '정산·리포트'],
    commonCodes: ['G-내부', 'G-영업', 'G-휴가'],
    capacityMdPerMonth: 20,
    margin: { external: 0.25, markup: 0.1, target: 0.35 },
    thresholds: { utilWarn: 0.85, utilOver: 1.0, missingLogWeeks: 1 },
    timelineOffsets: { kickoffDays: -90, settlementDays: 30 },
    milestoneTemplate: TEMPLATE.map(function (t) { return Object.assign({}, t); })
  };
}

/**
 * 계약 §2 구조의 최소 data 객체.
 * overrides 로 넘긴 최상위 키는 통째로 교체된다(settings·meta 만 얕은 병합).
 */
function makeData(overrides) {
  const o = overrides || {};
  return {
    meta: Object.assign(
      { generatedAt: '2026-09-10T09:00:00+09:00', mode: 'mock', sheetUrl: '', today: '2026-09-10' },
      o.meta || {}
    ),
    settings: Object.assign(baseSettings(), o.settings || {}),
    members: o.members || [],
    projects: o.projects || [],
    assignments: o.assignments || [],
    effortLogs: o.effortLogs || [],
    milestones: o.milestones || [],
    settlements: o.settlements || []
  };
}

/** 소수 비교 — 1e-9 오차 허용 */
function near(actual, expected, label) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) < 1e-9,
    (label || '값') + ' 기대 ' + expected + ' · 실제 ' + actual
  );
}

/** 팀원 1행 만들기 */
function member(name, opts) {
  return Object.assign({ name: name, role: '운영 PM', capacityMd: 20, status: '재직', color: '' }, opts || {});
}

/** 프로젝트 1행 만들기 */
function project(id, opts) {
  return Object.assign({
    id: id,
    name: id + ' 가상 행사',
    client: '가상 발주처',
    type: '① 리멤버 MICE 솔루션',
    status: '진행',
    pm: '팀원1',
    eventStart: '2026-11-12',
    eventEnd: '2026-11-13',
    kickoff: '',
    settlementDue: '',
    venue: '가상 베뉴',
    guarantee: null,
    expectedAttendees: null,
    contractAmount: 0,
    note: '',
    createdAt: ''
  }, opts || {});
}

/* ================================================================== *
 * §4.1 날짜 유틸
 * ================================================================== */

test('§4.1 날짜 유틸 — mondayOf · monthKey · addDays', function () {
  // 2026-09-07 은 월요일. 그 주 화~일요일은 모두 같은 월요일로 정규화된다.
  assert.equal(M.mondayOf('2026-09-07'), '2026-09-07', '월요일 자기 자신');
  assert.equal(M.mondayOf('2026-09-13'), '2026-09-07', '일요일 → 그 주 월요일');
  assert.equal(M.mondayOf('2026-09-05'), '2026-08-31', '토요일 → 전 주 월요일(8/31)');
  assert.equal(M.mondayOf(''), '', '빈 값 → 빈 문자열');

  assert.equal(M.monthKey('2026-08-31'), '2026-08');
  assert.equal(M.monthKey('2026-09-01'), '2026-09');
  assert.equal(M.monthKey('bad'), '');

  // 2026-11-12 − 90일 = 2026-08-14 (11/12→11/1 11일, →10/31 12일, →10/1 42일,
  //                                  →9/30 43일, →9/1 72일, →8/31 73일, →8/14 90일)
  assert.equal(M.addDays('2026-11-12', -90), '2026-08-14');
  // 2026-11-13 + 30일 = 2026-12-13 (11/13→11/30 17일, 나머지 13일 → 12/13)
  assert.equal(M.addDays('2026-11-13', 30), '2026-12-13');
  assert.equal(M.addDays('2026-02-28', 1), '2026-03-01', '2026년은 평년');
});

/* ================================================================== *
 * §4.2 배정 월 배분 allocateByMonth
 * ================================================================== */

test('§4.2 월 일할 배분 — 두 달에 걸친 배정', function () {
  // 2026-09-15 ~ 2026-10-20 : 9월 16일(15~30) + 10월 20일(1~20) = 36일
  // plannedMd 9 → 9월 9×16/36 = 4 · 10월 9×20/36 = 5
  const alloc = M.allocateByMonth({ plannedMd: 9, start: '2026-09-15', end: '2026-10-20' });
  assert.deepEqual(Object.keys(alloc).sort(), ['2026-09', '2026-10']);
  near(alloc['2026-09'], 9 * 16 / 36, '9월 배분');
  near(alloc['2026-10'], 9 * 20 / 36, '10월 배분');
  near(alloc['2026-09'] + alloc['2026-10'], 9, '배분 합 = plannedMd');
});

test('§4.2 월 일할 배분 — 같은 달이면 전량 그 달', function () {
  const alloc = M.allocateByMonth({ plannedMd: 6, start: '2026-09-05', end: '2026-09-20' });
  assert.deepEqual(Object.keys(alloc), ['2026-09']);
  near(alloc['2026-09'], 6, '같은 달 전량');
});

test('§4.2 월 일할 배분 — 세 달 이상 / 하루짜리 배정', function () {
  // 2026-10-30 ~ 2026-12-02 : 10월 2일 + 11월 30일 + 12월 2일 = 34일, plannedMd 34 → 2/30/2
  const alloc = M.allocateByMonth({ plannedMd: 34, start: '2026-10-30', end: '2026-12-02' });
  near(alloc['2026-10'], 2, '10월');
  near(alloc['2026-11'], 30, '11월');
  near(alloc['2026-12'], 2, '12월');

  // 양끝 포함이므로 시작 = 종료면 1일짜리(전량)
  const one = M.allocateByMonth({ plannedMd: 1.5, start: '2026-09-24', end: '2026-09-24' });
  near(one['2026-09'], 1.5, '하루 배정');
});

test('§4.2 월 일할 배분 — start > end 또는 날짜 누락이면 {}', function () {
  assert.deepEqual(M.allocateByMonth({ plannedMd: 9, start: '2026-10-20', end: '2026-09-15' }), {}, 'start > end');
  assert.deepEqual(M.allocateByMonth({ plannedMd: 9, start: '', end: '2026-10-20' }), {}, 'start 누락');
  assert.deepEqual(M.allocateByMonth({ plannedMd: 9, start: '2026-09-15', end: '' }), {}, 'end 누락');
  assert.deepEqual(M.allocateByMonth(null), {}, 'null');
});

/* ================================================================== *
 * §4.3 가동률 — 계획
 * ================================================================== */

test('§4.3 계획 가동률 — 22 M/D ÷ 가용 20 = 1.1 → over', function () {
  // 11월 한 달 안에 들어가는 배정 2건(14 + 8 = 22 M/D), 가용 20 → 1.1
  const data = makeData({
    members: [member('팀원2', { role: '모객' })],
    projects: [project('P-1', { status: '준비' }), project('P-2', { status: '견적' })],
    assignments: [
      { id: 'A-1', projectId: 'P-1', member: '팀원2', role: '모객', plannedMd: 14, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' },
      { id: 'A-2', projectId: 'P-2', member: '팀원2', role: '모객', plannedMd: 8, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
    ]
  });
  const rows = M.plannedUtilization(data, '2026-11');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].member, '팀원2');
  near(rows[0].plannedMd, 22, '계획 M/D 합');
  near(rows[0].capacityMd, 20, '가용');
  near(rows[0].ratio, 1.1, '계획 가동률');
  assert.equal(rows[0].level, 'over', 'ratio > 1.0 → over');
});

test('§4.3 계획 가동률 단계 경계 — 17 → 0.85 warn · 16 → 0.8 ok · 20 → 1.0 warn', function () {
  function ratioLevel(md) {
    const data = makeData({
      members: [member('팀원1')],
      projects: [project('P-1', { status: '진행' })],
      assignments: [
        { id: 'A-1', projectId: 'P-1', member: '팀원1', role: '운영 PM', plannedMd: md, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
      ]
    });
    return M.plannedUtilization(data, '2026-11')[0];
  }
  // 17/20 = 0.85 → utilWarn(0.85) 이상이므로 warn
  near(ratioLevel(17).ratio, 0.85, '17 M/D');
  assert.equal(ratioLevel(17).level, 'warn');
  // 16/20 = 0.8 → ok
  near(ratioLevel(16).ratio, 0.8, '16 M/D');
  assert.equal(ratioLevel(16).level, 'ok');
  // 20/20 = 1.0 → utilOver 초과가 아니므로 warn (경계는 초과일 때만 over)
  near(ratioLevel(20).ratio, 1, '20 M/D');
  assert.equal(ratioLevel(20).level, 'warn');
});

test('§4.3 계획 가동률 — 드롭 프로젝트 배정은 제외', function () {
  const data = makeData({
    members: [member('팀원1')],
    projects: [project('P-살아있음', { status: '진행' }), project('P-드롭', { status: '드롭' })],
    assignments: [
      { id: 'A-1', projectId: 'P-살아있음', member: '팀원1', role: '운영 PM', plannedMd: 10, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' },
      { id: 'A-2', projectId: 'P-드롭', member: '팀원1', role: '운영 PM', plannedMd: 30, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
    ]
  });
  const row = M.plannedUtilization(data, '2026-11')[0];
  near(row.plannedMd, 10, '드롭 30 M/D 는 빠진다');
  near(row.ratio, 0.5);
  assert.equal(row.level, 'ok');
});

test('§4.3 계획 가동률 — 가용 0 이면 ratio null · level ok', function () {
  const data = makeData({
    members: [member('팀원1', { capacityMd: 0 })],
    projects: [project('P-1', { status: '진행' })],
    assignments: [
      { id: 'A-1', projectId: 'P-1', member: '팀원1', role: '운영 PM', plannedMd: 5, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
    ]
  });
  const row = M.plannedUtilization(data, '2026-11')[0];
  assert.equal(row.ratio, null, '가용 0 → ratio null');
  assert.equal(row.level, 'ok');
  near(row.plannedMd, 5, '계획 M/D 자체는 합산된다');
});

/* ================================================================== *
 * §4.3 가동률 — 실적
 * ================================================================== */

test('§4.3 실가동률 — 주차의 소속 월은 월요일의 월(8/31 주차는 8월 · 9/7 주차는 9월)', function () {
  const data = makeData({
    members: [member('팀원1')],
    projects: [project('P-1', { status: '진행' })],
    effortLogs: [
      { week: '2026-08-03', member: '팀원1', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-08-10', member: '팀원1', projectId: 'P-1', md: 1.5, memo: '', loggedAt: '' },
      { week: '2026-08-31', member: '팀원1', projectId: 'P-1', md: 3, memo: '', loggedAt: '' },   // 8월 귀속
      { week: '2026-09-07', member: '팀원1', projectId: 'P-1', md: 4, memo: '', loggedAt: '' },   // 9월 귀속
      { week: '2026-09-05', member: '팀원1', projectId: 'P-1', md: 0.5, memo: '토요일 입력', loggedAt: '' } // → 8/31 주차 = 8월
    ]
  });
  // 8월 = 2 + 1.5 + 3 + 0.5 = 7 → 7/20 = 0.35
  const aug = M.actualUtilization(data, '2026-08')[0];
  near(aug.actualMd, 7, '8월 실투입');
  near(aug.ratio, 0.35, '8월 실가동률');
  assert.equal(aug.level, 'ok');
  // 9월 = 4 → 0.2
  const sep = M.actualUtilization(data, '2026-09')[0];
  near(sep.actualMd, 4, '9월 실투입');
  near(sep.ratio, 0.2, '9월 실가동률');
});

test('§4.3 실가동률 — G-휴가 제외 · G-내부/G-영업 포함', function () {
  const data = makeData({
    members: [member('팀원1')],
    effortLogs: [
      { week: '2026-09-07', member: '팀원1', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원1', projectId: 'G-내부', md: 1, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원1', projectId: 'G-영업', md: 1.5, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원1', projectId: 'G-휴가', md: 5, memo: '', loggedAt: '' }
    ]
  });
  // 2 + 1 + 1.5 = 4.5 (휴가 5 제외) → 4.5/20 = 0.225
  const row = M.actualUtilization(data, '2026-09')[0];
  near(row.actualMd, 4.5, 'G-휴가 제외 실투입');
  near(row.ratio, 0.225);
});

/* ================================================================== *
 * §4.4 프로젝트 지표
 * ================================================================== */

test('§4.4 소진율 — 계획 10 · 실투입 5 → 0.5', function () {
  const data = makeData({
    projects: [project('P-1')],
    assignments: [
      { id: 'A-1', projectId: 'P-1', member: '팀원1', role: '운영 PM', plannedMd: 6, start: '2026-08-01', end: '2026-08-31', status: '종료', note: '' },
      { id: 'A-2', projectId: 'P-1', member: '팀원2', role: '모객', plannedMd: 4, start: '2026-08-01', end: '2026-08-31', status: '종료', note: '' }
    ],
    effortLogs: [
      { week: '2026-08-03', member: '팀원1', projectId: 'P-1', md: 3, memo: '', loggedAt: '' },
      { week: '2026-08-10', member: '팀원2', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-08-10', member: '팀원2', projectId: 'G-내부', md: 9, memo: '다른 코드', loggedAt: '' }
    ]
  });
  const b = M.burnRate(data, 'P-1');
  near(b.plannedMd, 10, '계획 합');
  near(b.actualMd, 5, '실투입 합');
  near(b.ratio, 0.5, '소진율');
});

test('§4.4 소진율 — 계획 0 이면 ratio null', function () {
  const data = makeData({
    projects: [project('P-1')],
    effortLogs: [{ week: '2026-08-03', member: '팀원1', projectId: 'P-1', md: 3, memo: '', loggedAt: '' }]
  });
  const b = M.burnRate(data, 'P-1');
  near(b.plannedMd, 0);
  near(b.actualMd, 3);
  assert.equal(b.ratio, null, '계획 0 → null');
});

test('§4.4 projectOutput — 매출·실마진·M/D당 매출·쇼업률·게런티 달성률', function () {
  const data = makeData({
    projects: [project('P-1', { guarantee: 300, contractAmount: 60000000 })],
    effortLogs: [
      { week: '2026-08-31', member: '팀원1', projectId: 'P-1', md: 20, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원2', projectId: 'P-1', md: 14, memo: '', loggedAt: '' }
    ],
    settlements: [
      { projectId: 'P-1', revenue: 68000000, directCost: 47600000, preReg: 420, attended: 290, status: '완료' }
    ]
  });
  const o = M.projectOutput(data, 'P-1');
  near(o.revenue, 68000000, '정산 매출 우선');
  near(o.margin, 20400000, '68,000,000 − 47,600,000');
  near(o.marginRate, 0.3, '20,400,000 ÷ 68,000,000 = 0.30');
  assert.equal(o.marginLevel, 'mid', '0.25 ≤ 0.30 < 0.35 → mid');
  near(o.actualMd, 34, '실투입 20 + 14');
  near(o.revenuePerMd, 68000000 / 34, 'M/D당 매출');
  near(o.marginPerMd, 20400000 / 34, 'M/D당 실마진');
  near(o.showUpRate, 290 / 420, '쇼업률');
  near(o.guaranteeRate, 290 / 300, '게런티 달성률');
});

test('§4.4 projectOutput — 완료 건은 정산 매출이 비어 있어도 realized · contractAmount 로 폴백 (3.1 M-1)', function () {
  const data = makeData({
    projects: [project('P-1', { status: '완료', contractAmount: 92000000 })],
    settlements: [{ projectId: 'P-1', revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' }]
  });
  const o = M.projectOutput(data, 'P-1');
  assert.equal(o.realized, true, '상태 완료 → realized');
  near(o.contractAmount, 92000000, 'contractAmount 는 항상 값');
  near(o.revenue, 92000000, 'contractAmount 폴백');
});

test('§4.4 projectOutput — 정산 전(진행 · 정산 매출 없음) 건은 realized=false · 금액 지표 전부 null (3.1 M-1)', function () {
  const data = makeData({
    projects: [project('P-1', { status: '진행', contractAmount: 52000000 })],
    effortLogs: [{ week: '2026-09-07', member: '팀원1', projectId: 'P-1', md: 0.5, memo: '', loggedAt: '' }],
    settlements: [{ projectId: 'P-1', revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' }]
  });
  const o = M.projectOutput(data, 'P-1');
  assert.equal(o.realized, false, '정산 전 → realized false');
  near(o.contractAmount, 52000000, '계약금액은 그대로');
  assert.equal(o.revenue, null, '정산 전 매출 null');
  assert.equal(o.margin, null);
  assert.equal(o.marginRate, null);
  assert.equal(o.revenuePerMd, null, '5,200만 ÷ 0.5 = 1억 400만 같은 값이 나오면 안 된다');
  assert.equal(o.marginPerMd, null);
  near(o.actualMd, 0.5, '실투입은 그대로');
});

test('§4.4 projectOutput — 견적·드롭은 정산 매출이 있어도 realized=false (3.1 M-1)', function () {
  ['견적', '드롭'].forEach(function (st) {
    const data = makeData({
      projects: [project('P-1', { status: st, contractAmount: 21000000 })],
      settlements: [{ projectId: 'P-1', revenue: 21000000, directCost: 10000000, preReg: null, attended: null, status: '완료' }]
    });
    const o = M.projectOutput(data, 'P-1');
    assert.equal(o.realized, false, st + ' 은 항상 false');
    assert.equal(o.revenue, null, st + ' 매출 null');
    assert.equal(o.margin, null, st + ' 실마진 null');
  });
});

test('§4.4 projectOutput — 진행 건에 정산 매출이 입력되면 realized=true (3.1 M-1)', function () {
  const data = makeData({
    projects: [project('P-1', { status: '진행', contractAmount: 92000000 })],
    settlements: [{ projectId: 'P-1', revenue: 90000000, directCost: 60000000, preReg: null, attended: null, status: '진행' }]
  });
  const o = M.projectOutput(data, 'P-1');
  assert.equal(o.realized, true, '정산 매출 입력 → realized');
  near(o.revenue, 90000000, '정산 매출 우선(계약금액 아님)');
  near(o.margin, 30000000, '90,000,000 − 60,000,000');
});

test('§4.4 projectOutput — directCost null → 실마진·실마진율 null', function () {
  const data = makeData({
    projects: [project('P-1', { contractAmount: 92000000 })],
    settlements: [{ projectId: 'P-1', revenue: 92000000, directCost: null, preReg: null, attended: null, status: '미착수' }]
  });
  const o = M.projectOutput(data, 'P-1');
  assert.equal(o.margin, null, '직접비 없으면 실마진 null');
  assert.equal(o.marginRate, null, '실마진 null 이면 실마진율도 null');
  assert.equal(o.marginLevel, null);
  assert.equal(o.marginPerMd, null);
});

test('§4.4 projectOutput — 실투입 0 → M/D당 매출 null · preReg 0 → 쇼업률 null · 게런티 null → 달성률 null', function () {
  const data = makeData({
    projects: [project('P-1', { contractAmount: 50000000, guarantee: null })],
    settlements: [{ projectId: 'P-1', revenue: 50000000, directCost: 30000000, preReg: 0, attended: 100, status: '진행' }]
  });
  const o = M.projectOutput(data, 'P-1');
  near(o.actualMd, 0, '공수기록 없음');
  assert.equal(o.revenuePerMd, null, '실투입 0 → null');
  assert.equal(o.showUpRate, null, 'preReg 0 → null');
  assert.equal(o.guaranteeRate, null, '게런티 null → null');
});

test('§4.4 실마진율 단계 — external(0.25)·target(0.35) 경계', function () {
  assert.equal(M.marginLevelOf(0.2499, baseSettings()), 'low');
  assert.equal(M.marginLevelOf(0.25, baseSettings()), 'mid', '0.25 는 mid');
  assert.equal(M.marginLevelOf(0.3499, baseSettings()), 'mid');
  assert.equal(M.marginLevelOf(0.35, baseSettings()), 'good', '0.35 는 good');
  assert.equal(M.marginLevelOf(null, baseSettings()), null);
});

/* ================================================================== *
 * §4.5 팀 월별 Input · Output
 * ================================================================== */

test('§4.5 teamInputByMonth — G-* 는 전부 제외', function () {
  const data = makeData({
    effortLogs: [
      { week: '2026-08-31', member: '팀원1', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-08-31', member: '팀원2', projectId: 'G-내부', md: 1, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원1', projectId: 'P-1', md: 3, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원2', projectId: 'P-2', md: 1.5, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원3', projectId: 'G-영업', md: 2, memo: '', loggedAt: '' },
      { week: '2026-09-07', member: '팀원3', projectId: 'G-휴가', md: 5, memo: '', loggedAt: '' }
    ]
  });
  // 8월: P-1 2 (G-내부 1 제외) · 9월: 3 + 1.5 = 4.5 (G-영업·G-휴가 제외)
  const input = M.teamInputByMonth(data);
  assert.deepEqual(Object.keys(input).sort(), ['2026-08', '2026-09']);
  near(input['2026-08'], 2, '8월 Input');
  near(input['2026-09'], 4.5, '9월 Input');
});

test('§4.5 teamOutputByMonth — 실적/예정 2층 · 행사 종료월 귀속 · 견적·드롭 제외 (3.1 M-1)', function () {
  const data = makeData({
    projects: [
      project('P-완료', { status: '완료', eventStart: '2026-09-03', eventEnd: '2026-09-04', contractAmount: 68000000 }),
      project('P-진행', { status: '진행', eventStart: '2026-09-24', eventEnd: '2026-09-25', contractAmount: 92000000 }),
      project('P-드롭', { status: '드롭', eventStart: '2026-09-10', eventEnd: '2026-09-11', contractAmount: 30000000 }),
      project('P-11월', { status: '준비', eventStart: '2026-11-12', eventEnd: '2026-11-13', contractAmount: 145000000 }),
      project('P-견적', { status: '견적', eventStart: '2027-02-05', eventEnd: '2027-02-05', contractAmount: 21000000 })
    ],
    settlements: [
      { projectId: 'P-완료', revenue: 68000000, directCost: 47600000, preReg: 420, attended: 290, status: '완료' },
      { projectId: 'P-진행', revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' },
      { projectId: 'P-드롭', revenue: 30000000, directCost: 10000000, preReg: null, attended: null, status: '완료' }
    ]
  });
  const out = M.teamOutputByMonth(data);
  assert.deepEqual(Object.keys(out).sort(), ['2026-09', '2026-11'], '드롭·견적 프로젝트는 키조차 만들지 않는다');
  // 9월 실적 = P-완료 68,000,000 / 실마진 20,400,000 · 예정 = P-진행 계약금액 92,000,000 (실적에 섞이지 않음)
  near(out['2026-09'].actualRevenue, 68000000, '9월 실적 매출');
  near(out['2026-09'].actualMargin, 20400000, '9월 실마진');
  near(out['2026-09'].plannedRevenue, 92000000, '9월 예정 매출 = 진행 건 계약금액');
  // 11월: 준비 건은 예정으로만
  near(out['2026-11'].actualRevenue, 0, '11월 실적 없음');
  near(out['2026-11'].actualMargin, 0, '11월 실마진 없음');
  near(out['2026-11'].plannedRevenue, 145000000, '11월 예정 매출');
  assert.equal(out['2027-02'], undefined, '견적은 예정 층에도 넣지 않는다');
});

test('§4.5 teamOutputByMonth — 정산 매출이 입력된 진행 건은 실적으로 가고 예정에서 빠진다 (3.1 M-1)', function () {
  const data = makeData({
    projects: [project('P-진행', { status: '진행', eventStart: '2026-09-24', eventEnd: '2026-09-25', contractAmount: 92000000 })],
    settlements: [{ projectId: 'P-진행', revenue: 90000000, directCost: 60000000, preReg: null, attended: null, status: '진행' }]
  });
  const out = M.teamOutputByMonth(data);
  near(out['2026-09'].actualRevenue, 90000000, '정산 매출이 실적으로');
  near(out['2026-09'].actualMargin, 30000000, '실마진');
  near(out['2026-09'].plannedRevenue, 0, '예정에는 넣지 않는다');
});

/* ================================================================== *
 * §4.6 마일스톤 상태
 * ================================================================== */

test('§4.6 milestoneStatus — 완료 · 지연 · 예정', function () {
  const today = '2026-09-10';
  assert.equal(M.milestoneStatus({ due: '2026-08-20', done: '2026-08-21' }, today), '완료', '완료일 있으면 지났어도 완료');
  assert.equal(M.milestoneStatus({ due: '2026-08-20', done: '' }, today), '지연', 'due < today');
  assert.equal(M.milestoneStatus({ due: '2026-09-10', done: '' }, today), '예정', 'due == today 는 아직 지연 아님');
  assert.equal(M.milestoneStatus({ due: '2026-09-11', done: '' }, today), '예정', 'due > today');
});

/* ================================================================== *
 * §4.7 경고 5종
 * ================================================================== */

test('§4.7 overload — 당월 포함 6개월 안은 양성 · 7개월 뒤는 제외', function () {
  // today 2026-09-10 → 대상 월 2026-09 ~ 2027-02 (6개월)
  const data = makeData({
    members: [member('팀원2', { role: '모객' }), member('팀원3', { role: '현장 운영' })],
    projects: [project('P-1', { status: '준비' })],
    assignments: [
      // 2026-11 : 22 M/D → 1.1 (양성)
      { id: 'A-1', projectId: 'P-1', member: '팀원2', role: '모객', plannedMd: 22, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' },
      // 2027-03 : 30 M/D → 1.5 지만 7개월 뒤라 대상 밖
      { id: 'A-2', projectId: 'P-1', member: '팀원3', role: '현장 운영', plannedMd: 30, start: '2027-03-01', end: '2027-03-31', status: '예정', note: '' }
    ]
  });
  const w = M.warnings(data, '2026-09-10');
  assert.equal(w.overload.length, 1, '양성 1건만');
  assert.equal(w.overload[0].member, '팀원2');
  assert.equal(w.overload[0].month, '2026-11');
  near(w.overload[0].ratio, 1.1, '과부하 비율');
  near(w.overload[0].plannedMd, 22);
  near(w.overload[0].capacityMd, 20);
  assert.ok(!w.overload.some(function (r) { return r.month === '2027-03'; }), '2027-03 은 대상 밖');
});

test('§4.7 unassigned — 계약 상태에 PM 1행만이면 양성 · PM 외 1명 추가하면 음성 · 견적은 대상 아님', function () {
  function build(extra) {
    return makeData({
      members: [member('팀원1'), member('팀원2', { role: '모객' })],
      projects: [
        project('P-계약', { status: '계약', pm: '팀원1' }),
        project('P-견적', { status: '견적', pm: '팀원1' })
      ],
      assignments: [
        { id: 'A-1', projectId: 'P-계약', member: '팀원1', role: '운영 PM', plannedMd: 14, start: '2026-09-14', end: '2026-12-11', status: '예정', note: '' }
      ].concat(extra || [])
    });
  }
  // PM 본인 1행만 → 양성
  const pos = M.warnings(build(), '2026-09-10').unassigned;
  assert.equal(pos.length, 1, '견적 프로젝트는 배정이 0건이어도 대상 아님');
  assert.equal(pos[0].projectId, 'P-계약');
  assert.equal(pos[0].status, '계약');
  assert.equal(pos[0].pm, '팀원1');
  assert.equal(pos[0].assignmentCount, 1);

  // PM 외 팀원2 추가 → 음성
  const neg = M.warnings(build([
    { id: 'A-2', projectId: 'P-계약', member: '팀원2', role: '모객', plannedMd: 5, start: '2026-10-01', end: '2026-12-04', status: '예정', note: '' }
  ]), '2026-09-10').unassigned;
  assert.equal(neg.length, 0, 'PM 외 담당자가 붙으면 경고 해제');
});

test('§4.7 delayed — 지연 마일스톤 양성 · 완료/미래는 음성 · 드롭 프로젝트는 제외', function () {
  const data = makeData({
    projects: [project('P-진행', { status: '진행' }), project('P-드롭', { status: '드롭' })],
    milestones: [
      { projectId: 'P-진행', name: '랜딩페이지 컨펌', due: '2026-08-20', done: '', owner: '팀원2' },   // 양성
      { projectId: 'P-진행', name: '답사', due: '2026-08-10', done: '2026-08-11', owner: '팀원1' },     // 완료
      { projectId: 'P-진행', name: '운영계획서 확정', due: '2026-09-10', done: '', owner: '팀원1' },    // 오늘 = 예정
      { projectId: 'P-드롭', name: '계약 체결', due: '2026-07-01', done: '', owner: '' }                // 드롭 제외
    ]
  });
  const delayed = M.warnings(data, '2026-09-10').delayed;
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].projectId, 'P-진행');
  assert.equal(delayed[0].name, '랜딩페이지 컨펌');
  assert.equal(delayed[0].due, '2026-08-20');
  assert.equal(delayed[0].owner, '팀원2');
  // 2026-08-20 → 2026-09-10 = 8월 11일 + 9월 10일 = 21일
  assert.equal(delayed[0].daysLate, 21, '지연 일수');
});

test('§4.7 missingLog — 기준 주차 R = 이번 주 월요일 − 7일 고정 (SPEC 원문 · 3.1 m-1)', function () {
  // today 2026-09-10 → mondayOf = 2026-09-07 → R = 2026-08-31. 팀 최신 주차(09-07)와 무관
  const data = makeData({
    members: [
      member('팀원1'),                              // 최신 2026-09-07 → 음성
      member('팀원3', { role: '현장 운영' }),        // 최신 2026-08-31 = R → 음성
      member('팀원5', { role: '정산·리포트' }),      // 최신 2026-08-24 → 1주 뒤처짐 → 양성
      member('팀원9', { role: '영업' }),             // 기록 없음 → 양성
      member('팀원휴', { role: '모객', status: '휴직' }) // 휴직 → 제외
    ],
    effortLogs: [
      { week: '2026-09-07', member: '팀원1', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-08-31', member: '팀원3', projectId: 'P-1', md: 2, memo: '', loggedAt: '' },
      { week: '2026-08-24', member: '팀원5', projectId: 'P-1', md: 1, memo: '', loggedAt: '' }
    ]
  });
  assert.equal(M.baseWeek(data, '2026-09-10'), '2026-08-31', '기준 주차 R = 지난주 월요일');
  const rows = M.warnings(data, '2026-09-10').missingLog;
  assert.equal(rows.length, 2, '팀원5 · 팀원9 두 건');
  assert.deepEqual(rows[0], { member: '팀원5', week: '2026-08-31', lastWeek: '2026-08-24' });
  assert.deepEqual(rows[1], { member: '팀원9', week: '2026-08-31', lastWeek: '' }, '기록이 전혀 없으면 lastWeek 빈 문자열');
  assert.ok(!rows.some(function (r) { return r.member === '팀원휴'; }), '휴직 팀원은 제외');
  assert.ok(!rows.some(function (r) { return r.member === '팀원1' || r.member === '팀원3'; }), 'R 이상의 기록이 있으면 음성');
});

test('§4.7 missingLog — 팀 전체가 밀려도 R 은 그대로 지난주 월요일 · 기록이 없어도 같다 (3.1 m-1)', function () {
  // 팀 최신 주차 2026-08-17 이어도 R = 2026-08-31 (팀 최신 주차와의 max 규칙 없음)
  const data = makeData({
    members: [member('팀원1')],
    effortLogs: [{ week: '2026-08-17', member: '팀원1', projectId: 'P-1', md: 2, memo: '', loggedAt: '' }]
  });
  assert.equal(M.baseWeek(data, '2026-09-10'), '2026-08-31', 'R');
  const rows = M.warnings(data, '2026-09-10').missingLog;
  assert.deepEqual(rows, [{ member: '팀원1', week: '2026-08-31', lastWeek: '2026-08-17' }], '2주 뒤처짐 → 양성');
  assert.equal(M.baseWeek(makeData({}), '2026-09-10'), '2026-08-31', '기록이 전혀 없어도 R 은 같다');
  assert.equal(M.baseWeek(makeData({}), '2026-09-14'), '2026-09-07', '월요일 당일이면 지난주 월요일');
  assert.equal(M.baseWeek(makeData({}), '2026-09-13'), '2026-08-31', '일요일은 그 주(월요일 09-07)의 지난주');
});

test('§4.7 burnOver — 소진율 1.05 · 행사 전이면 over · 행사 후면 past · 0.9 는 경고 없음', function () {
  function build(eventEnd, plannedMd, actualMd) {
    return makeData({
      projects: [project('P-1', { status: '진행', eventStart: '2026-09-01', eventEnd: eventEnd })],
      assignments: [
        { id: 'A-1', projectId: 'P-1', member: '팀원1', role: '운영 PM', plannedMd: plannedMd, start: '2026-08-01', end: '2026-08-31', status: '진행', note: '' }
      ],
      effortLogs: [
        { week: '2026-08-31', member: '팀원1', projectId: 'P-1', md: actualMd, memo: '', loggedAt: '' }
      ]
    });
  }
  // 21 ÷ 20 = 1.05, 행사 종료일이 오늘(2026-09-10) 이후 → over
  const over = M.warnings(build('2026-09-25', 20, 21), '2026-09-10').burnOver;
  assert.equal(over.length, 1);
  near(over[0].ratio, 1.05, '소진율');
  assert.equal(over[0].severity, 'over', 'today ≤ eventEnd');

  // 같은 소진율이지만 행사 종료일이 지났으면 past
  const past = M.warnings(build('2026-09-04', 20, 21), '2026-09-10').burnOver;
  assert.equal(past.length, 1);
  assert.equal(past[0].severity, 'past', 'today > eventEnd');

  // 18 ÷ 20 = 0.9 → 경고 없음
  const none = M.warnings(build('2026-09-25', 20, 18), '2026-09-10').burnOver;
  assert.equal(none.length, 0, '소진율 1.0 이하는 경고 아님');
});

/* ================================================================== *
 * §4.8 표준 마일스톤 생성
 * ================================================================== */

test('§4.8 standardMilestones — ① 유형이면 9개 생성 · 오프셋 기준일 확인', function () {
  const p = project('P-T-001', { type: '① 리멤버 MICE 솔루션', pm: '팀원1', eventStart: '2026-11-12', eventEnd: '2026-11-13' });
  const res = M.standardMilestones(p, TEMPLATE, [], []);
  assert.equal(res.created.length, 9, '9종 전부 생성');
  assert.deepEqual(res.skipped, []);
  assert.deepEqual(res.created.map(function (m) { return m.name; }), TEMPLATE.map(function (t) { return t.name; }), '순서 고정');

  const due = {};
  res.created.forEach(function (m) { due[m.name] = m.due; });
  // offsetDays <= 0 → 행사 시작일(2026-11-12) 기준
  assert.equal(due['계약 체결'], '2026-08-14', '시작일 − 90');
  assert.equal(due['발주처 기초자료 수령'], '2026-09-23', '시작일 − 50');
  assert.equal(due['답사'], '2026-09-28', '시작일 − 45');
  assert.equal(due['랜딩페이지 컨펌'], '2026-10-08', '시작일 − 35');
  assert.equal(due['운영계획서 확정'], '2026-10-29', '시작일 − 14');
  assert.equal(due['행사 7일 전 점검'], '2026-11-05', '시작일 − 7');
  assert.equal(due['행사 당일'], '2026-11-12', '오프셋 0 은 시작일 기준');
  // offsetDays > 0 → 행사 종료일(2026-11-13) 기준
  assert.equal(due['정산보고 제출'], '2026-11-18', '종료일 + 5');
  assert.equal(due['정산 승인'], '2026-12-13', '종료일 + 30');

  // 새로 만든 행은 완료일이 비어 있고 프로젝트ID 가 채워진다
  res.created.forEach(function (m) {
    assert.equal(m.done, '');
    assert.equal(m.projectId, 'P-T-001');
  });
});

test('§4.8 standardMilestones — owner 는 역할 일치 배정 → 운영 PM 폴백 → 빈 문자열', function () {
  const p = project('P-T-001', { type: '① 리멤버 MICE 솔루션', pm: '팀원1', eventStart: '2026-11-12', eventEnd: '2026-11-13' });
  const assignments = [
    { id: 'A-1', projectId: 'P-T-001', member: '팀원2', role: '모객', plannedMd: 14, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' },
    { id: 'A-2', projectId: 'P-T-001', member: '팀원3', role: '현장 운영', plannedMd: 6, start: '2026-11-02', end: '2026-11-16', status: '예정', note: '' },
    { id: 'A-9', projectId: 'P-다른프로젝트', member: '팀원4', role: '영업', plannedMd: 3, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
  ];
  const owner = {};
  M.standardMilestones(p, TEMPLATE, assignments, []).created.forEach(function (m) { owner[m.name] = m.owner; });

  assert.equal(owner['랜딩페이지 컨펌'], '팀원2', '역할(모객) 일치 배정');
  assert.equal(owner['행사 당일'], '팀원3', '역할(현장 운영) 일치 배정');
  assert.equal(owner['답사'], '팀원1', '운영 PM 배정이 없으면 담당PM 폴백');
  assert.equal(owner['운영계획서 확정'], '팀원1', '운영 PM 폴백');
  assert.equal(owner['계약 체결'], '', '영업 배정 없음 → 빈 문자열(다른 프로젝트 배정은 무시)');
  assert.equal(owner['정산보고 제출'], '', '정산·리포트 배정 없음 → 빈 문자열');
});

test('§4.8 standardMilestones — ③ 주최형은 skipForHost 2종을 빼고 7개', function () {
  const p = project('P-T-004', { type: '③ DMS·주최형', pm: '팀원1', eventStart: '2026-12-03', eventEnd: '2026-12-04' });
  const res = M.standardMilestones(p, TEMPLATE, [], []);
  assert.equal(res.created.length, 7, '9 − 2');
  const names = res.created.map(function (m) { return m.name; });
  assert.ok(names.indexOf('계약 체결') === -1, '계약 체결 제외');
  assert.ok(names.indexOf('발주처 기초자료 수령') === -1, '발주처 기초자료 수령 제외');
  assert.deepEqual(res.skipped, [], 'skipForHost 는 skipped 가 아니라 아예 생성 대상에서 빠진다');
  // 2026-12-03 − 45 = 2026-10-19 (12/3→12/1 2일, →11/1 32일, →10/19 45일)
  assert.equal(res.created[0].name, '답사');
  assert.equal(res.created[0].due, '2026-10-19');
});

test('§4.8 standardMilestones — existing 에 있는 이름은 skipped', function () {
  const p = project('P-T-001', { type: '① 리멤버 MICE 솔루션', pm: '팀원1', eventStart: '2026-11-12', eventEnd: '2026-11-13' });
  const existing = [
    { projectId: 'P-T-001', name: '답사', due: '2026-09-28', done: '', owner: '팀원1' },
    { projectId: 'P-T-001', name: '행사 당일', due: '2026-11-12', done: '', owner: '팀원3' },
    { projectId: 'P-다른프로젝트', name: '계약 체결', due: '2026-01-01', done: '', owner: '' }
  ];
  const res = M.standardMilestones(p, TEMPLATE, [], existing);
  assert.deepEqual(res.skipped, ['답사', '행사 당일'], '다른 프로젝트의 같은 이름은 영향 없음');
  assert.equal(res.created.length, 7, '9 − 2');
  assert.ok(res.created.some(function (m) { return m.name === '계약 체결'; }), '다른 프로젝트 마일스톤은 중복 판정에 쓰지 않는다');
});

/* ================================================================== *
 * 핵심 지표 4 (SPEC §5 화면 A)
 * ================================================================== */

test('kpis — 진행 건수 · 이달 행사 · 팀 계획 가동률 · 지연 마일스톤', function () {
  const data = makeData({
    members: [member('팀원1'), member('팀원2', { role: '모객' })],
    projects: [
      project('P-진행', { status: '진행', eventStart: '2026-09-24', eventEnd: '2026-09-25' }),
      project('P-준비', { status: '준비', eventStart: '2026-11-12', eventEnd: '2026-11-13' }),
      project('P-계약', { status: '계약', eventStart: '2026-12-03', eventEnd: '2026-12-04' }),
      project('P-완료', { status: '완료', eventStart: '2026-09-03', eventEnd: '2026-09-04' }),
      project('P-견적', { status: '견적', eventStart: '2027-02-05', eventEnd: '2027-02-05' }),
      project('P-드롭', { status: '드롭', eventStart: '2026-09-01', eventEnd: '2026-09-30' })
    ],
    assignments: [
      { id: 'A-1', projectId: 'P-진행', member: '팀원1', role: '운영 PM', plannedMd: 10, start: '2026-09-01', end: '2026-09-30', status: '진행', note: '' },
      { id: 'A-2', projectId: 'P-드롭', member: '팀원2', role: '모객', plannedMd: 20, start: '2026-09-01', end: '2026-09-30', status: '예정', note: '' }
    ],
    milestones: [
      { projectId: 'P-진행', name: '랜딩페이지 컨펌', due: '2026-08-20', done: '', owner: '팀원2' },  // 지연
      { projectId: 'P-진행', name: '운영계획서 확정', due: '2026-09-10', done: '', owner: '팀원1' },  // 예정
      { projectId: 'P-드롭', name: '계약 체결', due: '2026-07-01', done: '', owner: '' }              // 드롭 제외
    ]
  });
  const k = M.kpis(data, '2026-09-10');
  assert.equal(k.activeProjects, 3, '계약·준비·진행 3건');
  assert.equal(k.eventsThisMonth, 2, '9월에 걸친 P-진행·P-완료 (드롭 제외)');
  assert.equal(k.delayedMilestones, 1, '지연 1건');
  // 팀 계획 M/D = 10 (드롭 배정 20 제외) · 가용 = 20 + 20 = 40 → 0.25
  near(k.teamPlannedMd, 10, '팀 계획 M/D');
  near(k.teamCapacityMd, 40, '재직 팀원 가용 합');
  near(k.teamPlannedUtil, 0.25, '팀 계획 가동률');
});


/* ================================================================== *
 * 3.1 m-3 — 핵심 지표 "이달 행사" 는 견적·드롭 제외
 * ================================================================== */

test('§4 핵심 지표 이달 행사 — 견적·드롭 제외 (3.1 m-3)', function () {
  const data = makeData({
    members: [member('팀원1')],
    projects: [
      project('P-진행', { status: '진행', eventStart: '2026-09-24', eventEnd: '2026-09-25' }),
      project('P-견적', { status: '견적', eventStart: '2026-09-15', eventEnd: '2026-09-16' }),
      project('P-드롭', { status: '드롭', eventStart: '2026-09-01', eventEnd: '2026-09-30' })
    ]
  });
  assert.equal(M.kpis(data, '2026-09-10').eventsThisMonth, 1, '9월에 걸친 3건 중 진행 1건만 센다');
});

/* ================================================================== *
 * 팀원 상태 '지원' — 배정은 되지만 과부하 대상에서 제외 (2026-09-11 실기 추가)
 * ================================================================== */

test('§4.7 overload — 상태 지원(타 팀·외부 지원 인력)은 과부하 경고 대상이 아니다', function () {
  const data = makeData({
    members: [member('팀원1'), member('지원A', { role: '영업', status: '지원' })],
    projects: [project('P-1', { status: '준비', eventStart: '2026-11-12', eventEnd: '2026-11-13' })],
    assignments: [
      { id: 'A-1', projectId: 'P-1', member: '팀원1', role: '운영 PM', plannedMd: 22, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' },
      { id: 'A-2', projectId: 'P-1', member: '지원A', role: '영업', plannedMd: 30, start: '2026-11-01', end: '2026-11-30', status: '예정', note: '' }
    ]
  });
  const over = M.warnings(data, '2026-09-10').overload;
  assert.deepEqual(over.map(function (o) { return o.member; }), ['팀원1'], '지원A 는 150% 여도 경고에 없다');
  assert.equal(M.kpis(data, '2026-11-10').teamCapacityMd, 20, '팀 가용 합도 재직 팀원만');
});
