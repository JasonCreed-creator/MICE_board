/*!
 * tests/sample-data.test.js — mock/sample-data.json 계약 적합성 검사
 *
 * 검사 범위
 *  - 계약 §2 최상위 구조·필드 형식(날짜·일시·열거값)
 *  - 계약 §7 가상 데이터 규격(팀원 5 · 프로젝트 5 · 주차 8 · 유형 4종 · 상태 5종)
 *  - 계약 §4.7 경고 5종과 §4.4 Output 이 지시문에 적힌 값으로 나오는지
 *  - (5턴) 계약 §2.10~2.12 세부 항목 6 · 주석 4 · 업무 블럭 33 과 §9.11~9.12 롤업·배정 동기화 결과
 *
 * 파일이 없으면 전부 건너뛴다(mock 산출물이 아직 없는 단계에서도 테스트가 깨지지 않게).
 * 실행: node --test tests/sample-data.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../src/metrics.js');
const S = require('../src/schema.js');

const DATA_PATH = path.join(__dirname, '..', 'mock', 'sample-data.json');
const EXISTS = fs.existsSync(DATA_PATH);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const DATETIME_SEC_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const ASSIGNMENT_STATUSES = ['예정', '진행', '종료'];
const MEMBER_STATUSES = ['재직', '휴직', '퇴사'];
const SETTLEMENT_STATUSES = ['미착수', '진행', '완료'];
const ITEM_STATUSES = ['예정', '진행', '완료'];              // 5턴 세부 항목 상태
const LEVELS = ['상', '중', '하'];                            // 5턴 임팩트·난이도
const NOTE_TYPES = ['판단 근거', '요청', '질문', '결정'];      // 5턴 주석 유형(D16)

if (!EXISTS) {
  test.skip('mock/sample-data.json 이 없어 가상 데이터 검사를 건너뜁니다', function () {});
} else {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const memberNames = data.members.map(function (m) { return m.name; });
  const projectIds = data.projects.map(function (p) { return p.id; });

  /** 필수 날짜 필드 검사 · 선택 필드는 빈 문자열 허용 */
  function assertDate(value, label, optional) {
    if (optional && (value === '' || value === null || value === undefined)) { return; }
    assert.match(String(value), DATE_RE, label + ' 는 YYYY-MM-DD 여야 합니다 (실제: ' + value + ')');
  }

  function assertIn(value, list, label) {
    assert.ok(list.indexOf(value) !== -1, label + ' "' + value + '" 가 허용 목록에 없습니다');
  }

  function assertHalfStep(value, label) {
    assert.equal(typeof value, 'number', label + ' 는 숫자여야 합니다');
    assert.equal((value * 2) % 1, 0, label + ' 는 0.5 단위여야 합니다 (실제: ' + value + ')');
  }

  /* ---------------------------------------------------------------- *
   * §2 최상위 구조
   * ---------------------------------------------------------------- */

  test('§2 최상위 키 12개', function () {
    assert.deepEqual(
      Object.keys(data).sort(),
      ['assignments', 'blocks', 'effortLogs', 'history', 'items', 'members', 'meta', 'milestones', 'notes', 'projects', 'settings', 'settlements'],
      '계약 §2 의 12개 키만 있어야 합니다(v1.2: history · v1.3: items · notes · blocks 추가)'
    );
  });

  test('§2.1 meta — 기준일 고정 2026-09-10 · 사용자 "미리보기 사용자" · 업무 블럭 출처 default', function () {
    assert.equal(data.meta.today, '2026-09-10', '산식·실렌더 재현성을 위해 고정');
    assert.match(data.meta.today, DATE_RE);
    assert.equal(data.meta.mode, 'mock');
    assert.equal(data.meta.sheetUrl, '', 'mock 은 시트 링크 없음');
    assert.equal(data.meta.generatedAt, '2026-09-10T09:00:00+09:00');
    assert.equal(data.meta.user, '미리보기 사용자', 'v1.2: mock 의 사용자 표시 이름(변경이력 기록용)');
    assert.equal(data.meta.blocksSource, 'default', 'v1.3: 업무블럭 탭 없이 코드 기본 카탈로그를 쓰는 상태(gas 는 default | sheet)');
  });

  test('§2.9 history — 배열이고 mock 에서는 비어 있음', function () {
    assert.ok(Array.isArray(data.history), 'history 는 배열이어야 합니다');
    assert.equal(data.history.length, 0, 'mock 은 변경이력 없이 시작한다(대시보드 쓰기가 앞에 끼워 넣음)');
  });

  test('§2.2 settings — 목록 4종 + 마일스톤 템플릿 9종', function () {
    const s = data.settings;
    assert.deepEqual(s.statuses, ['견적', '계약', '준비', '진행', '완료', '정산완료', '드롭'], '상태 목록');
    assert.equal(s.types.length, 4, '유형 목록 4종');
    assert.equal(s.roles.length, 6, '역할 목록 6종');
    assert.deepEqual(s.commonCodes, ['G-내부', 'G-영업', 'G-휴가'], '공통코드 3종');

    assert.equal(s.capacityMdPerMonth, 20);
    assert.equal(s.margin.external, 0.25);
    assert.equal(s.margin.target, 0.35);
    assert.equal(s.thresholds.utilWarn, 0.85);
    assert.equal(s.thresholds.utilOver, 1.0);
    assert.equal(s.thresholds.missingLogWeeks, 1);
    assert.equal(s.timelineOffsets.kickoffDays, -90);
    assert.equal(s.timelineOffsets.settlementDays, 30);

    assert.equal(s.milestoneTemplate.length, 9, '표준 마일스톤 9종');
    assert.deepEqual(
      s.milestoneTemplate.map(function (t) { return t.offsetDays; }),
      [-90, -50, -45, -35, -14, -7, 0, 5, 30],
      'D-오프셋 순서 고정'
    );
    s.milestoneTemplate.forEach(function (t, i) {
      assert.equal(typeof t.name, 'string', '템플릿 ' + i + ' name');
      assert.ok(t.name.length > 0, '템플릿 ' + i + ' name 비어 있음');
      assertIn(t.role, s.roles, '템플릿 ' + t.name + ' 의 역할');
      assert.equal(typeof t.skipForHost, 'boolean', '템플릿 ' + t.name + ' 의 skipForHost');
    });
    // 주최형 제외 2종
    assert.deepEqual(
      s.milestoneTemplate.filter(function (t) { return t.skipForHost; }).map(function (t) { return t.name; }),
      ['계약 체결', '발주처 기초자료 수령']
    );
  });

  /* ---------------------------------------------------------------- *
   * §7 행 수·구성
   * ---------------------------------------------------------------- */

  test('§7 행 수 — 팀원 5 · 프로젝트 5 · 정산 5', function () {
    assert.equal(data.members.length, 5, '팀원 5명');
    assert.equal(data.projects.length, 5, '프로젝트 5건');
    assert.equal(data.settlements.length, 5, '정산 5행(프로젝트당 1행)');
    assert.deepEqual(
      data.settlements.map(function (s) { return s.projectId; }).sort(),
      projectIds.slice().sort(),
      '정산 행은 프로젝트와 1:1'
    );
    assert.equal(new Set(memberNames).size, 5, '팀원 이름 중복 없음');
    assert.equal(new Set(projectIds).size, 5, '프로젝트ID 중복 없음');
  });

  test('§7 프로젝트 — 유형 4종 전부 · 상태 견적/계약/준비/진행/완료 각 1', function () {
    const types = data.projects.map(function (p) { return p.type; });
    data.settings.types.forEach(function (t) {
      assert.ok(types.indexOf(t) !== -1, '유형 "' + t + '" 인 프로젝트가 없습니다');
    });

    const statuses = data.projects.map(function (p) { return p.status; });
    ['견적', '계약', '준비', '진행', '완료'].forEach(function (st) {
      const n = statuses.filter(function (x) { return x === st; }).length;
      assert.equal(n, 1, '상태 "' + st + '" 프로젝트는 정확히 1건이어야 합니다 (실제 ' + n + ')');
    });
  });

  test('§7 공수기록 — 주차 8개 전부 월요일', function () {
    const weeks = Array.from(new Set(data.effortLogs.map(function (l) { return l.week; }))).sort();
    assert.equal(weeks.length, 8, '주차 8개');
    weeks.forEach(function (w) {
      assert.equal(M.mondayOf(w), w, '주차 ' + w + ' 는 월요일이어야 합니다');
    });
    assert.equal(weeks[0], '2026-07-20', '첫 주차');
    assert.equal(weeks[7], '2026-09-07', '마지막 주차');
  });

  /* ---------------------------------------------------------------- *
   * §1 형식 — 날짜·일시·숫자
   * ---------------------------------------------------------------- */

  test('§1 날짜 필드는 전부 YYYY-MM-DD (선택 필드는 빈 문자열 허용)', function () {
    data.projects.forEach(function (p) {
      assertDate(p.eventStart, p.id + '.eventStart');
      assertDate(p.eventEnd, p.id + '.eventEnd');
      assertDate(p.kickoff, p.id + '.kickoff', true);
      assertDate(p.settlementDue, p.id + '.settlementDue', true);
      assertDate(p.createdAt, p.id + '.createdAt', true);
      assert.ok(p.eventStart <= p.eventEnd, p.id + ' 행사 시작일 ≤ 종료일');
    });
    data.assignments.forEach(function (a) {
      assertDate(a.start, a.id + '.start');
      assertDate(a.end, a.id + '.end');
      assert.ok(a.start <= a.end, a.id + ' 배정 시작 ≤ 종료');
    });
    data.effortLogs.forEach(function (l, i) {
      assertDate(l.week, 'effortLogs[' + i + '].week');
    });
    data.milestones.forEach(function (m) {
      assertDate(m.due, m.projectId + '/' + m.name + '.due');
      assertDate(m.done, m.projectId + '/' + m.name + '.done', true);
    });
  });

  test('§1 기록일시는 YYYY-MM-DD HH:mm', function () {
    data.effortLogs.forEach(function (l, i) {
      if (l.loggedAt === '') { return; }
      assert.match(String(l.loggedAt), DATETIME_RE, 'effortLogs[' + i + '].loggedAt (실제: ' + l.loggedAt + ')');
    });
  });

  test('§2.5~2.6 M/D 는 0.5 단위', function () {
    data.assignments.forEach(function (a) { assertHalfStep(a.plannedMd, a.id + '.plannedMd'); });
    data.effortLogs.forEach(function (l, i) { assertHalfStep(l.md, 'effortLogs[' + i + '].md'); });
  });

  /* ---------------------------------------------------------------- *
   * §1 열거값 — settings / members 참조 무결성
   * ---------------------------------------------------------------- */

  test('§2.3 members — 역할·상태·가용', function () {
    data.members.forEach(function (m) {
      assertIn(m.role, data.settings.roles, m.name + ' 의 주역할');
      assertIn(m.status, MEMBER_STATUSES, m.name + ' 의 상태');
      assert.equal(typeof m.capacityMd, 'number', m.name + ' 의 월 가용 M/D');
      assert.equal(m.capacityMd, 20, '§7: 전원 가용 20');
    });
    assert.deepEqual(
      data.members.map(function (m) { return m.role; }),
      ['운영 PM', '모객', '현장 운영', '디자인·제작', '정산·리포트'],
      '§7 역할 순서'
    );
  });

  test('§2.4 projects — 유형·상태·담당PM 참조', function () {
    data.projects.forEach(function (p) {
      assert.match(p.id, /^P-\d{4}-\d{3}$/, p.id + ' 형식 P-YYYY-NNN');
      assertIn(p.type, data.settings.types, p.id + ' 의 유형');
      assertIn(p.status, data.settings.statuses, p.id + ' 의 상태');
      assertIn(p.pm, memberNames, p.id + ' 의 담당PM');
      assert.equal(typeof p.contractAmount, 'number', p.id + ' 의 계약금액');
      assert.ok(p.guarantee === null || typeof p.guarantee === 'number', p.id + ' 의 게런티는 숫자 또는 null');
    });
  });

  test('§2.5 assignments — 프로젝트·팀원·역할·상태 참조', function () {
    data.assignments.forEach(function (a) {
      assert.match(a.id, /^A-\d{4}$/, a.id + ' 형식 A-NNNN');
      assertIn(a.projectId, projectIds, a.id + ' 의 프로젝트ID');
      assertIn(a.member, memberNames, a.id + ' 의 팀원');
      assertIn(a.role, data.settings.roles, a.id + ' 의 역할');
      assertIn(a.status, ASSIGNMENT_STATUSES, a.id + ' 의 상태');
    });
  });

  test('§2.6 effortLogs — 팀원 · 프로젝트ID 또는 공통코드', function () {
    const codes = projectIds.concat(data.settings.commonCodes);
    data.effortLogs.forEach(function (l, i) {
      assertIn(l.member, memberNames, 'effortLogs[' + i + '].member');
      assertIn(l.projectId, codes, 'effortLogs[' + i + '].projectId');
    });
  });

  test('§2.7~2.8 milestones · settlements — 참조 무결성', function () {
    const seen = {};
    data.milestones.forEach(function (m) {
      assertIn(m.projectId, projectIds, '마일스톤의 프로젝트ID');
      if (m.owner !== '') { assertIn(m.owner, memberNames, m.projectId + '/' + m.name + ' 의 담당'); }
      const key = m.projectId + '|' + m.name;
      assert.ok(!seen[key], '마일스톤 중복: ' + key);
      seen[key] = true;
    });
    data.settlements.forEach(function (s) {
      assertIn(s.projectId, projectIds, '정산의 프로젝트ID');
      assertIn(s.status, SETTLEMENT_STATUSES, s.projectId + ' 의 정산 상태');
      ['revenue', 'directCost', 'preReg', 'attended'].forEach(function (f) {
        assert.ok(s[f] === null || typeof s[f] === 'number', s.projectId + '.' + f + ' 는 숫자 또는 null');
      });
    });
  });

  /* ---------------------------------------------------------------- *
   * §4.7 경고 5종 — 지시문에 못박힌 값
   * ---------------------------------------------------------------- */

  test('§4.7 경고 — 과부하 · 미배정 · 지연 · 미기록 · 소진 초과', function () {
    const w = M.warnings(data, data.meta.today);

    // 과부하: 팀원2 가 2026-11 에 22 M/D(14 + 8) ÷ 20 = 1.1
    assert.equal(w.overload.length, 1, '과부하 1건');
    assert.equal(w.overload[0].member, '팀원2');
    assert.equal(w.overload[0].month, '2026-11');
    assert.ok(Math.abs(w.overload[0].ratio - 1.1) < 1e-9, '과부하 비율 1.1 (실제 ' + w.overload[0].ratio + ')');

    // 미배정: 계약 상태 프로젝트에 담당PM 1행만
    assert.equal(w.unassigned.length, 1, '미배정 1건');
    assert.equal(w.unassigned[0].status, '계약');

    // 지연 마일스톤
    assert.ok(w.delayed.length >= 1, '지연 마일스톤 1건 이상');
    w.delayed.forEach(function (d) {
      assert.ok(d.due < data.meta.today, '지연 항목의 예정일은 기준일보다 앞서야 합니다: ' + d.name);
    });

    // 미기록(3.1 m-1): 기준 주차 R = 이번 주 월요일(09-07) − 7일 = 2026-08-31.
    // 팀원5 는 2026-08-24 주차가 마지막 기록(08-31 · 09-07 없음) → 1주 뒤처짐 → 양성. 다른 4명은 08-31 기록이 있어 음성
    const missing = w.missingLog.map(function (r) { return r.member; });
    assert.deepEqual(missing, ['팀원5'], '미기록은 팀원5 만');
    const row5 = w.missingLog[0];
    assert.equal(row5.week, '2026-08-31', '기준 주차 R = 지난주 월요일');
    assert.equal(row5.lastWeek, '2026-08-24', '팀원5 최신 기록 주차');

    // 소진 초과: 완료 프로젝트 1건, 행사가 지났으므로 past
    assert.equal(w.burnOver.length, 1, '소진 초과 1건');
    assert.equal(w.burnOver[0].severity, 'past', '행사 종료일이 기준일보다 앞 → past');
    assert.ok(w.burnOver[0].ratio > 1, '소진율 100% 초과');
  });

  /* ---------------------------------------------------------------- *
   * §4.4 Output — 완료 프로젝트
   * ---------------------------------------------------------------- */

  test('§4.4 완료 프로젝트 Output — 실마진율 28~32% · 쇼업률 60~75% · 게런티 달성률 있음', function () {
    const done = data.projects.filter(function (p) { return p.status === '완료'; })[0];
    assert.ok(done, '상태 "완료" 프로젝트가 있어야 합니다');
    const o = M.projectOutput(data, done.id);

    assert.ok(o.marginRate !== null, '실마진율이 산출되어야 합니다');
    assert.ok(o.marginRate >= 0.28 && o.marginRate <= 0.32, '실마진율 28~32% (실제 ' + o.marginRate + ')');
    assert.ok(o.showUpRate !== null, '쇼업률이 산출되어야 합니다');
    assert.ok(o.showUpRate >= 0.6 && o.showUpRate <= 0.75, '쇼업률 60~75% (실제 ' + o.showUpRate + ')');
    assert.ok(o.guaranteeRate !== null, '게런티 달성률이 산출되어야 합니다');
    assert.ok(o.revenue > 0 && o.margin > 0, '매출·실마진 양수');
  });

  test('핵심 지표 — 진행 3건 · 이달 행사 2건 · 지연 1건', function () {
    const k = M.kpis(data, data.meta.today);
    assert.equal(k.activeProjects, 3, '계약·준비·진행');
    assert.equal(k.eventsThisMonth, 2, '2026-09 에 걸친 행사');
    assert.equal(k.delayedMilestones, 1);
    assert.ok(k.teamPlannedUtil !== null && k.teamPlannedUtil > 0, '팀 계획 가동률 산출');
  });

  /* ---------------------------------------------------------------- *
   * §2.10~2.12 (5턴) 세부 항목 · 주석 · 업무 블럭
   * ---------------------------------------------------------------- */

  const itemIds = data.items.map(function (it) { return it.id; });
  const milestoneKeys = data.milestones.map(function (m) { return m.projectId + '|' + m.name; });

  test('§2.10 items — 6건 · W-000001 형식 · 프로젝트·마일스톤 참조 · 파트·임팩트·난이도·상태 열거 · 0.5 단위 · (프로젝트·마일스톤·블럭) 유일', function () {
    assert.equal(data.items.length, 6, '§7: 세부 항목 6건');
    const seen = {};
    data.items.forEach(function (it, i) {
      assert.match(it.id, /^W-\d{6}$/, 'items[' + i + '].id 형식 W-NNNNNN');
      assertIn(it.projectId, projectIds, it.id + ' 의 프로젝트ID');
      assertIn(it.projectId + '|' + it.milestone, milestoneKeys, it.id + ' 의 마일스톤 "' + it.milestone + '" 이 그 프로젝트의 마일스톤 탭에 있어야 합니다');
      assertIn(it.part, data.settings.roles, it.id + ' 의 파트');
      assert.ok(typeof it.block === 'string' && it.block.length > 0, it.id + ' 블럭 이름');
      if (it.owner !== '') { assertIn(it.owner, memberNames, it.id + ' 의 담당'); }
      assertIn(it.impact, LEVELS, it.id + ' 의 임팩트');
      assertIn(it.difficulty, LEVELS, it.id + ' 의 난이도');
      assertHalfStep(it.plannedMd, it.id + '.plannedMd');
      assertDate(it.due, it.id + '.due', true);
      assertIn(it.status, ITEM_STATUSES, it.id + ' 의 상태');
      assert.equal(typeof it.note, 'string');
      const key = it.projectId + '|' + it.milestone + '|' + it.block;
      assert.ok(!seen[key], '세부 항목 중복: ' + key);
      seen[key] = true;
      assert.equal(Object.keys(it).length, S.TABLES.items.fields.length, it.id + ' 필드 수 = 계약 §2.10');
    });
    assert.equal(new Set(itemIds).size, 6, '세부ID 중복 없음');
    // 규격: P-2026-002 에 5건(담당 없는 행사 당일 1건 포함) · P-2026-003 에 핵심 미배정 1건
    assert.equal(data.items.filter(function (it) { return it.projectId === 'P-2026-002'; }).length, 5);
    assert.equal(data.items.filter(function (it) { return it.projectId === 'P-2026-003'; }).length, 1);
    // 블럭 이름·파트는 기본 카탈로그에 있는 것만(화면의 "이미 있는 블럭 ✓" 표시가 맞아떨어지도록)
    data.items.forEach(function (it) {
      assert.ok(data.blocks.some(function (b) { return b.part === it.part && b.block === it.block; }), it.id + ' 의 (파트·블럭)이 카탈로그에 있어야 합니다');
    });
    // 전부 편집 계약 검증을 통과(수정 모드 · 자기 자신 제외)
    data.items.forEach(function (it) {
      const r = S.validateRow('items', it, { settings: data.settings, data: data, mode: 'edit', expected: it });
      assert.equal(r.ok, true, it.id + ': ' + JSON.stringify(r.errors));
    });
  });

  test('§2.11 notes — 4건 · N-000001 형식 · 세부ID 가 있으면 items 에 존재 · 유형 4종 · 해결 "예" 또는 빈 값 · 일시 초 단위 · 작성자 이메일', function () {
    assert.equal(data.notes.length, 4, '§7: 주석 4건');
    data.notes.forEach(function (n, i) {
      assert.match(n.id, /^N-\d{6}$/, 'notes[' + i + '].id 형식 N-NNNNNN');
      assertIn(n.projectId, projectIds, n.id + ' 의 프로젝트ID');
      assertIn(n.projectId + '|' + n.milestone, milestoneKeys, n.id + ' 의 마일스톤');
      if (n.itemId !== '') {
        assertIn(n.itemId, itemIds, n.id + ' 의 세부ID');
        const it = data.items.filter(function (x) { return x.id === n.itemId; })[0];
        assert.equal(it.projectId + '|' + it.milestone, n.projectId + '|' + n.milestone, n.id + ' 의 프로젝트·마일스톤은 그 세부 항목과 같아야 합니다');
      }
      assertIn(n.part, data.settings.roles, n.id + ' 의 파트');
      assert.ok(typeof n.author === 'string' && n.author.length > 0, n.id + ' 작성자(이메일)');
      if (n.authorName !== '') { assertIn(n.authorName, memberNames, n.id + ' 의 작성자 이름'); }
      assert.match(String(n.at), DATETIME_SEC_RE, n.id + '.at 은 YYYY-MM-DD HH:mm:ss (실제: ' + n.at + ')');
      assertIn(n.type, NOTE_TYPES, n.id + ' 의 유형');
      assert.ok(typeof n.content === 'string' && n.content.length > 0, n.id + ' 내용');
      assert.ok(n.resolved === '예' || n.resolved === '', n.id + ' 의 해결은 "예" 또는 빈 값 (실제: "' + n.resolved + '")');
      assert.equal(Object.keys(n).length, S.TABLES.notes.fields.length, n.id + ' 필드 수 = 계약 §2.11');
      const r = S.validateRow('notes', n, { settings: data.settings, data: data, mode: 'edit', expected: n });
      assert.equal(r.ok, true, n.id + ': ' + JSON.stringify(r.errors));
    });
    assert.equal(new Set(data.notes.map(function (n) { return n.id; })).size, 4, '주석ID 중복 없음');
    // 유형 4종이 전부 한 번씩 · 미해결 2 · 마일스톤 전체 주석(세부ID 없음) 1
    assert.deepEqual(data.notes.map(function (n) { return n.type; }).sort(), NOTE_TYPES.slice().sort(), '유형 4종 전부');
    assert.equal(data.notes.filter(function (n) { return n.resolved !== '예'; }).length, 2, '미해결 2건(E 화면 "미해결 질문·요청" 재현)');
    assert.equal(data.notes.filter(function (n) { return n.itemId === ''; }).length, 1);
    assert.deepEqual(S.noteCounts(data.notes, { itemId: 'W-000001' }), { total: 2, open: 1 }, 'W-000001 배지 "주석 2 · 미해결 1"');
  });

  test('§2.12 blocks — 33건 · 파트 6종 전부 · (파트·블럭) 유일 · M/D ≥ 0 · 기본 마일스톤은 표준 9종 · 영업 4건만 주최형 제외', function () {
    const templateNames = data.settings.milestoneTemplate.map(function (t) { return t.name; });
    assert.equal(data.blocks.length, 33, '§7: 기본 카탈로그 33건');
    const seen = {};
    const parts = new Set();
    data.blocks.forEach(function (b, i) {
      assertIn(b.part, data.settings.roles, 'blocks[' + i + '].part');
      assert.ok(typeof b.block === 'string' && b.block.length > 0, 'blocks[' + i + '] 블럭 이름');
      assertIn(b.milestone, templateNames, b.block + ' 의 기본 마일스톤 "' + b.milestone + '" 은 표준 마일스톤 9종 중 하나여야 합니다');
      assert.equal(typeof b.md, 'number', b.block + ' 기본 M/D');
      assert.ok(b.md >= 0, b.block + ' 기본 M/D ≥ 0');
      assertHalfStep(b.md, b.block + '.md');
      assertIn(b.impact, LEVELS, b.block + ' 기본 임팩트');
      assertIn(b.difficulty, LEVELS, b.block + ' 기본 난이도');
      assert.equal(typeof b.judge, 'string', b.block + ' 판단에 필요한 내용');
      assert.equal(typeof b.skipForHost, 'boolean', b.block + ' 주최형 제외');
      const key = b.part + '|' + b.block;
      assert.ok(!seen[key], '(파트·블럭) 중복: ' + key);
      seen[key] = true;
      parts.add(b.part);
      assert.equal(Object.keys(b).length, S.TABLES.blocks.fields.length, b.block + ' 필드 수 = 계약 §2.12');
    });
    assert.equal(parts.size, 6, '파트 6종 전부');
    assert.deepEqual(
      data.blocks.filter(function (b) { return b.skipForHost; }).map(function (b) { return b.part; }),
      ['영업', '영업', '영업', '영업'],
      '주최형(③) 제외는 영업 4건 전부 · 그 외 없음'
    );
  });

  test('§2.12 blocks — meta.blocksSource 가 default 이면 Schema.DEFAULT_BLOCKS 와 완전히 같다(서버 폴백 = mock)', function () {
    assert.deepEqual(data.blocks, S.DEFAULT_BLOCKS, '업무블럭 탭 없이 쓰는 기본 카탈로그는 코드(src/schema.js)가 단일 원천');
  });

  /* ---------------------------------------------------------------- *
   * §9.11~9.12 (5턴) 롤업 · 배정 동기화 — mock 어댑터·서버가 같은 결과를 내야 하는 값
   * ---------------------------------------------------------------- */

  test('§9.11 itemRollup — P-2026-003 핵심 항목 미배정 1건(W-000005) · P-2026-002 합계 10 M/D = 0.5 M/M · 미배정 2 M/D', function () {
    const r3 = S.itemRollup(data, 'P-2026-003', data.settings);
    assert.equal(r3.count, 1);
    assert.equal(r3.totalMd, 2);
    assert.equal(r3.mm, 0.1);
    assert.deepEqual(r3.keyUnassigned.map(function (it) { return it.id; }), ['W-000005'], 'E 화면 "핵심 항목 미배정" 재현(임팩트·난이도 상, 담당 없음)');
    assert.equal(r3.unassignedMd, 2);

    const r2 = S.itemRollup(data, 'P-2026-002', data.settings);
    assert.equal(r2.count, 5);
    assert.equal(r2.totalMd, 10);
    assert.equal(r2.mm, 0.5, '10 ÷ 월 가용 20');
    assert.equal(r2.capacityMd, 20);
    assert.deepEqual(r2.byPart, { '운영 PM': 4, '디자인·제작': 2, '현장 운영': 2, '모객': 2 });
    assert.deepEqual(r2.byMember, { '팀원1': 4, '팀원4': 2, '팀원2': 2 });
    assert.equal(r2.unassignedMd, 2, 'W-000004(등록 파트) 담당 없음');
    assert.deepEqual(r2.keyUnassigned, [], '등록 파트는 중·하 → 핵심 아님');
    assert.equal(S.itemRollup(data, 'P-2026-001', data.settings).count, 0, '완료 프로젝트에는 항목 없음');
  });

  test('§9.12 assignmentsFromItems — P-2026-002 는 (담당·파트) 3묶음 전부 수동 행과 겹쳐 auto 0 · overlaps 3 · changed 아님 · mock 배정에 자동 행 없음', function () {
    assert.ok(data.assignments.every(function (a) { return a.note !== S.AUTO_ASSIGN_NOTE; }), 'mock 은 자동(세부항목) 행 없이 시작한다');
    const p2 = data.projects.filter(function (p) { return p.id === 'P-2026-002'; })[0];
    const r = S.assignmentsFromItems(p2, data.items, data.milestones, data.assignments, data.settings);
    assert.equal(r.projectId, 'P-2026-002');
    assert.deepEqual(r.auto, [], '수동 행(A-0005 · A-0006 · A-0008)이 있어 자동 행을 만들지 않는다');
    assert.equal(r.overlaps.length, 3);
    assert.deepEqual(
      r.overlaps.map(function (o) { return [o.member, o.role, o.itemsMd, o.manualMd]; }),
      [['팀원1', '운영 PM', 4, 20], ['팀원4', '디자인·제작', 2, 6], ['팀원2', '모객', 2, 9]],
      'B 화면 배지 "세부 합계 n M/D · 수동 m M/D" 재현(항목 순서)'
    );
    assert.equal(r.manual.length, 4, 'P-2026-002 수동 행 4');
    assert.equal(r.changed, false, '기존 자동 행 없음 · 새 자동 행 없음 → 이력 기록 없음');

    const p3 = data.projects.filter(function (p) { return p.id === 'P-2026-003'; })[0];
    const r3 = S.assignmentsFromItems(p3, data.items, data.milestones, data.assignments, data.settings);
    assert.deepEqual(r3.auto, [], '담당 없는 항목뿐이면 자동 행 없음');
    assert.deepEqual(r3.overlaps, []);
    assert.equal(r3.manual.length, 4);
  });
}
