/*!
 * metrics.js — 팀 프로젝트 보드 산식 레이어
 * 기준 문서: docs/SPEC-v1.md §4 · docs/DATA-CONTRACT.md §4
 *
 * 규칙
 *  - 순수 함수만 둔다. DOM·전역 상태·현재 시각을 읽지 않는다("오늘"은 항상 인자로 받는다).
 *  - 달력일 계산은 UTC 정오(Date.UTC(y, m, d, 12)) 기준 — 시간대·서머타임 영향 제거.
 *  - Node(module.exports)와 브라우저(window.Metrics) 양쪽에서 로드된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (root) { root.Metrics = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 86400000;

  /* 설정 기본값 — 계약 §2.2 */
  var DEFAULTS = {
    capacityMdPerMonth: 20,
    margin: { external: 0.25, markup: 0.10, target: 0.35 },
    thresholds: { utilWarn: 0.85, utilOver: 1.0, missingLogWeeks: 1 },
    timelineOffsets: { kickoffDays: -90, settlementDays: 30 }
  };

  /* 프로젝트가 아닌 공통코드(G-내부 · G-영업 · G-휴가) 판별 */
  function isCommonCode(code) { return typeof code === 'string' && code.indexOf('G-') === 0; }

  function num(v, dflt) {
    if (v === null || v === undefined || v === '') { return dflt; }
    var n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------------------------ *
   * 1. 날짜 유틸
   * ------------------------------------------------------------------ */

  /** 'YYYY-MM-DD' → Date(UTC 정오) · 잘못된 값은 null */
  function parseDate(v) {
    if (v instanceof Date) {
      if (isNaN(v.getTime())) { return null; }
      return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
    }
    if (typeof v !== 'string') { return null; }
    var s = v.trim();
    if (!s) { return null; }
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (!m) { return null; }
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) { return null; }
    var dt = new Date(Date.UTC(y, mo - 1, d, 12));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) { return null; }
    return dt;
  }

  /** Date 또는 날짜 문자열 → 'YYYY-MM-DD' (실패 시 '') */
  function toDateStr(v) {
    var d = (v instanceof Date) ? parseDate(v) : parseDate(v);
    if (!d) { return ''; }
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /** 날짜 문자열에 n일 더하기 → 'YYYY-MM-DD' */
  function addDays(dateStr, n) {
    var d = parseDate(dateStr);
    if (!d) { return ''; }
    return toDateStr(new Date(d.getTime() + num(n, 0) * DAY_MS));
  }

  /** 두 날짜 사이 일수(b - a). 실패 시 null */
  function daysBetween(a, b) {
    var da = parseDate(a), db = parseDate(b);
    if (!da || !db) { return null; }
    return Math.round((db.getTime() - da.getTime()) / DAY_MS);
  }

  /** 그 날짜가 속한 주의 월요일 → 'YYYY-MM-DD' */
  function mondayOf(dateStr) {
    var d = parseDate(dateStr);
    if (!d) { return ''; }
    var dow = d.getUTCDay();               // 0=일 … 6=토
    var diff = (dow === 0) ? -6 : (1 - dow);
    return toDateStr(new Date(d.getTime() + diff * DAY_MS));
  }

  /** 'YYYY-MM-DD' → 'YYYY-MM' */
  function monthKey(dateStr) {
    var d = parseDate(dateStr);
    if (!d) { return ''; }
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1);
  }

  /** 'YYYY-MM' 에 n개월 더하기 */
  function monthAdd(key, n) {
    if (typeof key !== 'string') { return ''; }
    var m = /^(\d{4})-(\d{1,2})$/.exec(key.trim());
    if (!m) { return ''; }
    var total = Number(m[1]) * 12 + (Number(m[2]) - 1) + num(n, 0);
    var y = Math.floor(total / 12);
    var mo = total - y * 12;
    return y + '-' + pad2(mo + 1);
  }

  /** 시작 월부터 count개월 목록 ['YYYY-MM', …] */
  function monthsBetween(fromMonthKey, count) {
    var out = [];
    var c = Math.max(0, Math.floor(num(count, 0)));
    for (var i = 0; i < c; i++) {
      var k = monthAdd(fromMonthKey, i);
      if (!k) { return []; }
      out.push(k);
    }
    return out;
  }

  /** 두 월 키 사이의 개월 수(b - a) */
  function monthDiff(a, b) {
    var ma = /^(\d{4})-(\d{1,2})$/.exec(String(a || ''));
    var mb = /^(\d{4})-(\d{1,2})$/.exec(String(b || ''));
    if (!ma || !mb) { return null; }
    return (Number(mb[1]) * 12 + Number(mb[2])) - (Number(ma[1]) * 12 + Number(ma[2]));
  }

  /** 그 달의 마지막 날 'YYYY-MM-DD' */
  function monthEndOf(dateStr) {
    var d = parseDate(dateStr);
    if (!d) { return ''; }
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return toDateStr(last);
  }

  /* ------------------------------------------------------------------ *
   * 2. 설정 병합
   * ------------------------------------------------------------------ */

  function settingsOf(data) {
    var s = (data && data.settings) || {};
    var margin = s.margin || {};
    var th = s.thresholds || {};
    var off = s.timelineOffsets || {};
    return {
      statuses: s.statuses || [],
      types: s.types || [],
      roles: s.roles || [],
      commonCodes: s.commonCodes || [],
      capacityMdPerMonth: num(s.capacityMdPerMonth, DEFAULTS.capacityMdPerMonth),
      margin: {
        external: num(margin.external, DEFAULTS.margin.external),
        markup: num(margin.markup, DEFAULTS.margin.markup),
        target: num(margin.target, DEFAULTS.margin.target)
      },
      thresholds: {
        utilWarn: num(th.utilWarn, DEFAULTS.thresholds.utilWarn),
        utilOver: num(th.utilOver, DEFAULTS.thresholds.utilOver),
        missingLogWeeks: num(th.missingLogWeeks, DEFAULTS.thresholds.missingLogWeeks)
      },
      timelineOffsets: {
        kickoffDays: num(off.kickoffDays, DEFAULTS.timelineOffsets.kickoffDays),
        settlementDays: num(off.settlementDays, DEFAULTS.timelineOffsets.settlementDays)
      },
      milestoneTemplate: s.milestoneTemplate || []
    };
  }

  /** 착수일 — 비어 있으면 행사 시작일 + kickoffDays */
  function effectiveKickoff(project, settings) {
    if (!project) { return ''; }
    if (project.kickoff) { return toDateStr(project.kickoff); }
    var st = settingsOf({ settings: settings });
    return addDays(project.eventStart, st.timelineOffsets.kickoffDays);
  }

  /** 정산 예정일 — 비어 있으면 행사 종료일 + settlementDays */
  function effectiveSettlementDue(project, settings) {
    if (!project) { return ''; }
    if (project.settlementDue) { return toDateStr(project.settlementDue); }
    var st = settingsOf({ settings: settings });
    return addDays(project.eventEnd, st.timelineOffsets.settlementDays);
  }

  /* ------------------------------------------------------------------ *
   * 3. 배정 월 배분 — 계약 §4.2
   * ------------------------------------------------------------------ */

  /**
   * 배정 1행의 계획 M/D 를 달력일 수 비례로 월별 배분한다.
   * 기간은 시작·종료 양끝 포함. 시작 > 종료 또는 날짜 누락이면 {}.
   */
  function allocateByMonth(assignment) {
    var out = {};
    if (!assignment) { return out; }
    var s = parseDate(assignment.start);
    var e = parseDate(assignment.end);
    if (!s || !e || s.getTime() > e.getTime()) { return out; }
    var md = num(assignment.plannedMd, null);
    if (md === null) { return out; }
    var totalDays = Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1;
    if (totalDays <= 0) { return out; }

    var cursor = toDateStr(s);
    var endStr = toDateStr(e);
    var guard = 0;
    while (cursor && cursor <= endStr && guard < 1200) {
      guard++;
      var mEnd = monthEndOf(cursor);
      var segEnd = (mEnd && mEnd < endStr) ? mEnd : endStr;
      var n = daysBetween(cursor, segEnd) + 1;
      var key = monthKey(cursor);
      out[key] = (out[key] || 0) + md * n / totalDays;
      cursor = addDays(segEnd, 1);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 4. 가동률 — 계약 §4.3
   * ------------------------------------------------------------------ */

  /** 가동률 단계: over(적) / warn(황) / ok(녹) */
  function utilLevel(ratio, settings) {
    if (ratio === null || ratio === undefined || !isFinite(ratio)) { return 'ok'; }
    var st = settingsOf({ settings: settings });
    if (ratio > st.thresholds.utilOver) { return 'over'; }
    if (ratio >= st.thresholds.utilWarn) { return 'warn'; }
    return 'ok';
  }

  function droppedProjectIds(data) {
    var set = {};
    ((data && data.projects) || []).forEach(function (p) {
      if (p && p.status === '드롭') { set[p.id] = true; }
    });
    return set;
  }

  function capacityOf(member, st) {
    var c = num(member && member.capacityMd, null);
    return (c === null) ? st.capacityMdPerMonth : c;
  }

  /**
   * 계획 가동률(월) — 팀원별 [{member, plannedMd, capacityMd, ratio, level}]
   * 대상 배정: 프로젝트 상태가 '드롭' 이 아닌 모든 배정(배정 상태 무관).
   * 반환 순서는 data.members 순서. 가용 0 이면 ratio = null, level = 'ok'.
   */
  function plannedUtilization(data, month) {
    var st = settingsOf(data);
    var dropped = droppedProjectIds(data);
    var byMember = {};
    ((data && data.assignments) || []).forEach(function (a) {
      if (!a || dropped[a.projectId]) { return; }
      var alloc = allocateByMonth(a);
      var v = alloc[month];
      if (v) { byMember[a.member] = (byMember[a.member] || 0) + v; }
    });
    return ((data && data.members) || []).map(function (m) {
      var cap = capacityOf(m, st);
      var planned = byMember[m.name] || 0;
      var ratio = (cap > 0) ? planned / cap : null;
      return {
        member: m.name,
        plannedMd: planned,
        capacityMd: cap,
        ratio: ratio,
        level: utilLevel(ratio, data && data.settings)
      };
    });
  }

  /** 해당 월 주차의 공수기록만 추린다(주차 → 월 귀속 = 월요일의 월) */
  function logsOfMonth(data, month) {
    return ((data && data.effortLogs) || []).filter(function (l) {
      return l && monthKey(mondayOf(l.week)) === month;
    });
  }

  /**
   * 실가동률(월) — G-휴가 제외, G-내부·G-영업 포함
   */
  function actualUtilization(data, month) {
    var st = settingsOf(data);
    var byMember = {};
    logsOfMonth(data, month).forEach(function (l) {
      if (l.projectId === 'G-휴가') { return; }
      byMember[l.member] = (byMember[l.member] || 0) + num(l.md, 0);
    });
    return ((data && data.members) || []).map(function (m) {
      var cap = capacityOf(m, st);
      var actual = byMember[m.name] || 0;
      var ratio = (cap > 0) ? actual / cap : null;
      return {
        member: m.name,
        plannedMd: actual,          // 구조 호환(계획 자리 = 실투입)
        actualMd: actual,
        capacityMd: cap,
        ratio: ratio,
        level: utilLevel(ratio, data && data.settings)
      };
    });
  }

  /**
   * 프로젝트 비중(팀원, 월) = 프로젝트 코드 M/D ÷ 전체 기록 M/D(G-* 포함)
   * 기록이 전혀 없으면 null.
   */
  function projectShare(data, member, month) {
    var total = 0, project = 0;
    logsOfMonth(data, month).forEach(function (l) {
      if (l.member !== member) { return; }
      var v = num(l.md, 0);
      total += v;
      if (!isCommonCode(l.projectId)) { project += v; }
    });
    if (total <= 0) { return null; }
    return project / total;
  }

  /** 팀원·월별 코드 단위 투입 내역 {코드: md} — 화면 C 스택용(G-휴가 제외) */
  function memberMonthBreakdown(data, member, month) {
    var out = {};
    logsOfMonth(data, month).forEach(function (l) {
      if (l.member !== member || l.projectId === 'G-휴가') { return; }
      out[l.projectId] = (out[l.projectId] || 0) + num(l.md, 0);
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 5. 프로젝트 지표 — 계약 §4.4
   * ------------------------------------------------------------------ */

  function projectActualMd(data, projectId) {
    var sum = 0;
    ((data && data.effortLogs) || []).forEach(function (l) {
      if (l && l.projectId === projectId) { sum += num(l.md, 0); }
    });
    return sum;
  }

  function projectPlannedMd(data, projectId) {
    var sum = 0;
    ((data && data.assignments) || []).forEach(function (a) {
      if (a && a.projectId === projectId) { sum += num(a.plannedMd, 0); }
    });
    return sum;
  }

  /** 소진율 = 실투입 ÷ 계획. 계획 0 이면 ratio = null */
  function burnRate(data, projectId) {
    var planned = projectPlannedMd(data, projectId);
    var actual = projectActualMd(data, projectId);
    return {
      plannedMd: planned,
      actualMd: actual,
      ratio: (planned > 0) ? actual / planned : null
    };
  }

  /** 실마진율 단계: low(25% 미만·적) / mid(25~35%·황) / good(35% 이상·녹) */
  function marginLevelOf(rate, settings) {
    if (rate === null || rate === undefined || !isFinite(rate)) { return null; }
    var st = settingsOf({ settings: settings });
    if (rate < st.margin.external) { return 'low'; }
    if (rate < st.margin.target) { return 'mid'; }
    return 'good';
  }

  function findProject(data, projectId) {
    var list = (data && data.projects) || [];
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === projectId) { return list[i]; } }
    return null;
  }

  function findSettlement(data, projectId) {
    var list = (data && data.settlements) || [];
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].projectId === projectId) { return list[i]; } }
    return null;
  }

  /** 실적 확정 여부 — 상태 완료·정산완료 이거나 정산 탭 매출이 입력됨. 견적·드롭은 항상 false (3.1 M-1) */
  function isRealized(project, settlement) {
    var status = project && project.status;
    if (status === '견적' || status === '드롭') { return false; }
    if (status === '완료' || status === '정산완료') { return true; }
    return num(settlement && settlement.revenue, null) !== null;
  }

  /**
   * 프로젝트 Output 묶음 — 계약 §4.4 (3.1 M-1: 실적/예정 2층)
   *  realized 가 아니면 revenue·margin·marginRate·revenuePerMd·marginPerMd 는 null.
   *  contractAmount 는 항상 값. showUpRate·guaranteeRate 는 정산 탭 입력값 기준(realized 와 무관).
   */
  function projectOutput(data, projectId) {
    var p = findProject(data, projectId) || {};
    var s = findSettlement(data, projectId);
    var contractAmount = num(p.contractAmount, 0);
    var realized = isRealized(p, s);
    var revenue = null;
    if (realized) {
      revenue = num(s && s.revenue, null);
      if (revenue === null) { revenue = contractAmount; }
    }
    var directCost = num(s && s.directCost, null);
    var margin = (realized && directCost !== null && revenue !== null) ? (revenue - directCost) : null;
    var marginRate = (margin === null || !revenue) ? null : margin / revenue;
    var actualMd = projectActualMd(data, projectId);
    var preReg = num(s && s.preReg, null);
    var attended = num(s && s.attended, null);
    var guarantee = num(p.guarantee, null);
    return {
      projectId: projectId,
      realized: realized,
      contractAmount: contractAmount,
      revenue: revenue,
      directCost: directCost,
      margin: margin,
      marginRate: marginRate,
      marginLevel: marginLevelOf(marginRate, data && data.settings),
      actualMd: actualMd,
      revenuePerMd: (realized && revenue !== null && actualMd > 0) ? revenue / actualMd : null,
      marginPerMd: (realized && margin !== null && actualMd > 0) ? margin / actualMd : null,
      showUpRate: (preReg === null || attended === null || preReg === 0) ? null : attended / preReg,
      guaranteeRate: (guarantee === null || guarantee === 0 || attended === null) ? null : attended / guarantee
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. 팀 월별 Input · Output — 계약 §4.5
   * ------------------------------------------------------------------ */

  /** 팀 Input(월) = 프로젝트 코드 공수기록 합(G-* 전부 제외) */
  function teamInputByMonth(data) {
    var out = {};
    ((data && data.effortLogs) || []).forEach(function (l) {
      if (!l || isCommonCode(l.projectId)) { return; }
      var k = monthKey(mondayOf(l.week));
      if (!k) { return; }
      out[k] = (out[k] || 0) + num(l.md, 0);
    });
    return out;
  }

  /**
   * 팀 Output(월) — 계약 §4.5 (3.1 M-1: 실적/예정 2층). 귀속 월 = 행사 종료월.
   *  actualRevenue·actualMargin = realized 프로젝트(margin null 은 합에서 제외)
   *  plannedRevenue = realized 가 아닌 프로젝트 중 상태 계약·준비·진행의 계약금액
   *  견적·드롭은 두 층 모두 제외
   */
  function teamOutputByMonth(data) {
    var out = {};
    var plannedSet = { '계약': true, '준비': true, '진행': true };
    ((data && data.projects) || []).forEach(function (p) {
      if (!p || p.status === '드롭' || p.status === '견적') { return; }
      var k = monthKey(p.eventEnd);
      if (!k) { return; }
      var o = projectOutput(data, p.id);
      if (!out[k]) { out[k] = { actualRevenue: 0, actualMargin: 0, plannedRevenue: 0 }; }
      if (o.realized) {
        out[k].actualRevenue += (o.revenue || 0);
        if (o.margin !== null) { out[k].actualMargin += o.margin; }
      } else if (plannedSet[p.status]) {
        out[k].plannedRevenue += o.contractAmount;
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 7. 마일스톤 — 계약 §4.6 · §4.8
   * ------------------------------------------------------------------ */

  function milestoneStatus(m, today) {
    if (!m) { return '예정'; }
    if (m.done) { return '완료'; }
    var due = toDateStr(m.due);
    var t = toDateStr(today);
    if (due && t && due < t) { return '지연'; }
    return '예정';
  }

  /**
   * 표준 마일스톤 생성 — 계약 §4.8
   * @param {object} project    대상 프로젝트
   * @param {Array}  template   settings.milestoneTemplate
   * @param {Array}  assignments 배정 목록(전체를 넘겨도 프로젝트로 걸러 쓴다)
   * @param {Array}  existing   기존 마일스톤 목록(전체 가능)
   * @returns {{created: Array, skipped: Array}}
   */
  function standardMilestones(project, template, assignments, existing) {
    var created = [], skipped = [];
    if (!project || !project.id) { return { created: created, skipped: skipped }; }
    var tpl = template || [];
    var mine = (assignments || []).filter(function (a) {
      return a && (a.projectId === undefined || a.projectId === project.id);
    });
    var have = {};
    (existing || []).forEach(function (m) {
      if (m && (m.projectId === undefined || m.projectId === project.id)) { have[m.name] = true; }
    });
    var isHost = typeof project.type === 'string' && project.type.indexOf('③') === 0;

    tpl.forEach(function (t) {
      if (!t || !t.name) { return; }
      if (t.skipForHost && isHost) { return; }
      if (have[t.name]) { skipped.push(t.name); return; }
      var offset = num(t.offsetDays, 0);
      var base = (offset <= 0) ? project.eventStart : project.eventEnd;
      var due = addDays(base, offset);
      if (!due) { return; }
      var owner = '';
      for (var i = 0; i < mine.length; i++) {
        if (mine[i].role === t.role) { owner = mine[i].member; break; }
      }
      if (!owner && t.role === '운영 PM') { owner = project.pm || ''; }
      created.push({ projectId: project.id, name: t.name, due: due, done: '', owner: owner });
      have[t.name] = true;
    });
    return { created: created, skipped: skipped };
  }

  /* ------------------------------------------------------------------ *
   * 8. 경고 5종 — 계약 §4.7
   * ------------------------------------------------------------------ */

  /** 미기록 판정의 기준 주차 R = 오늘이 속한 주의 월요일 − 7일(지난주). SPEC §4 원문 — 3.1 m-1: 팀 최신 주차와의 max 규칙 삭제 */
  function baseWeek(data, today) {
    return addDays(mondayOf(today), -7);
  }

  function warnings(data, today) {
    var st = settingsOf(data);
    var t = toDateStr(today);
    var result = { overload: [], unassigned: [], delayed: [], missingLog: [], burnOver: [] };
    var projects = (data && data.projects) || [];
    var members = (data && data.members) || [];

    /* 8.1 과부하 — 당월 포함 6개월 중 계획 가동률 level === 'over' */
    var months = monthsBetween(monthKey(t), 6);
    var alive = {};
    // 과부하 대상 = 보드가 관리하는 팀원(퇴사 · 지원 제외). '지원' = 타 팀·외부 지원 인력, 배정은 되지만 가동률·경고 대상 아님
    members.forEach(function (m) { if (m && m.status !== '퇴사' && m.status !== '지원') { alive[m.name] = true; } });
    months.forEach(function (mk) {
      plannedUtilization(data, mk).forEach(function (row) {
        if (row.level !== 'over' || !alive[row.member]) { return; }
        result.overload.push({
          member: row.member, month: mk, ratio: row.ratio,
          plannedMd: row.plannedMd, capacityMd: row.capacityMd
        });
      });
    });

    /* 8.2 미배정 — 상태 계약·준비·진행 인데 배정이 없거나 전부 담당 PM 본인 */
    var needAssign = { '계약': true, '준비': true, '진행': true };
    projects.forEach(function (p) {
      if (!p || !needAssign[p.status]) { return; }
      var rows = ((data && data.assignments) || []).filter(function (a) { return a && a.projectId === p.id; });
      var onlyPm = rows.length > 0 && rows.every(function (a) { return a.member === p.pm; });
      if (rows.length === 0 || onlyPm) {
        result.unassigned.push({
          projectId: p.id, name: p.name, status: p.status, pm: p.pm, assignmentCount: rows.length
        });
      }
    });

    /* 8.3 지연 마일스톤 — 드롭 프로젝트 제외 */
    var dropped = droppedProjectIds(data);
    ((data && data.milestones) || []).forEach(function (m) {
      if (!m || dropped[m.projectId]) { return; }
      if (milestoneStatus(m, t) !== '지연') { return; }
      result.delayed.push({
        projectId: m.projectId, name: m.name, due: toDateStr(m.due),
        owner: m.owner || '', daysLate: daysBetween(m.due, t)
      });
    });

    /* 8.4 미기록 — 재직 팀원 기준 */
    var R = baseWeek(data, t);
    var lastByMember = {};
    ((data && data.effortLogs) || []).forEach(function (l) {
      var w = mondayOf(l && l.week);
      if (!w) { return; }
      if (!lastByMember[l.member] || w > lastByMember[l.member]) { lastByMember[l.member] = w; }
    });
    members.forEach(function (m) {
      if (!m || m.status !== '재직') { return; }
      var last = lastByMember[m.name] || '';
      if (!last) {
        result.missingLog.push({ member: m.name, week: R, lastWeek: '' });
        return;
      }
      var lag = daysBetween(last, R);
      if (lag === null) { return; }
      var weeks = lag / 7;
      if (weeks >= st.thresholds.missingLogWeeks) {
        result.missingLog.push({ member: m.name, week: R, lastWeek: last });
      }
    });

    /* 8.5 소진 초과 — 소진율 > 100% */
    projects.forEach(function (p) {
      if (!p || p.status === '드롭') { return; }
      var b = burnRate(data, p.id);
      if (b.ratio === null || b.ratio <= 1) { return; }
      var end = toDateStr(p.eventEnd);
      var severity = (end && t && t <= end) ? 'over' : 'past';
      result.burnOver.push({ projectId: p.id, name: p.name, ratio: b.ratio, severity: severity });
    });

    return result;
  }

  /* ------------------------------------------------------------------ *
   * 9. 핵심 지표 4 — SPEC §5 화면 A
   * ------------------------------------------------------------------ */

  /**
   * activeProjects   진행 건수 = 상태 계약·준비·진행
   * eventsThisMonth  이달 행사 = 행사 기간이 이번 달과 겹치는 프로젝트(견적·드롭 제외 — 3.1 m-3)
   * teamPlannedUtil  팀 계획 가동률 = 이번 달 계획 M/D 합 ÷ 재직 팀원 가용 합
   * delayedMilestones 지연 마일스톤 건수
   */
  function kpis(data, today) {
    var t = toDateStr(today);
    var mk = monthKey(t);
    var projects = (data && data.projects) || [];
    var activeSet = { '계약': true, '준비': true, '진행': true };
    var active = 0, events = 0;
    projects.forEach(function (p) {
      if (!p) { return; }
      if (activeSet[p.status]) { active++; }
      if (p.status === '드롭' || p.status === '견적') { return; }   // 3.1 m-3: 이달 행사는 견적·드롭 제외
      var s = monthKey(p.eventStart), e = monthKey(p.eventEnd) || s;
      if (s && e && s <= mk && mk <= e) { events++; }
    });

    var rows = plannedUtilization(data, mk);
    var aliveNames = {};
    ((data && data.members) || []).forEach(function (m) { if (m && m.status === '재직') { aliveNames[m.name] = true; } });
    var planned = 0, capacity = 0;
    rows.forEach(function (r) {
      if (!aliveNames[r.member]) { return; }
      planned += r.plannedMd;
      capacity += r.capacityMd;
    });

    return {
      activeProjects: active,
      eventsThisMonth: events,
      teamPlannedUtil: (capacity > 0) ? planned / capacity : null,
      teamPlannedMd: planned,
      teamCapacityMd: capacity,
      delayedMilestones: warnings(data, t).delayed.length
    };
  }

  /* ------------------------------------------------------------------ */

  return {
    /* 날짜 */
    parseDate: parseDate,
    toDateStr: toDateStr,
    addDays: addDays,
    daysBetween: daysBetween,
    mondayOf: mondayOf,
    monthKey: monthKey,
    monthAdd: monthAdd,
    monthDiff: monthDiff,
    monthEndOf: monthEndOf,
    monthsBetween: monthsBetween,
    /* 설정·프로젝트 파생 */
    settingsOf: settingsOf,
    effectiveKickoff: effectiveKickoff,
    effectiveSettlementDue: effectiveSettlementDue,
    isCommonCode: isCommonCode,
    findProject: findProject,
    findSettlement: findSettlement,
    /* 투입 */
    allocateByMonth: allocateByMonth,
    utilLevel: utilLevel,
    plannedUtilization: plannedUtilization,
    actualUtilization: actualUtilization,
    projectShare: projectShare,
    memberMonthBreakdown: memberMonthBreakdown,
    projectPlannedMd: projectPlannedMd,
    projectActualMd: projectActualMd,
    burnRate: burnRate,
    /* 성과 */
    marginLevelOf: marginLevelOf,
    isRealized: isRealized,
    projectOutput: projectOutput,
    teamInputByMonth: teamInputByMonth,
    teamOutputByMonth: teamOutputByMonth,
    /* 마일스톤·경고·핵심 지표 */
    milestoneStatus: milestoneStatus,
    standardMilestones: standardMilestones,
    baseWeek: baseWeek,
    warnings: warnings,
    kpis: kpis
  };
});
