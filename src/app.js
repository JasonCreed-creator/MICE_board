/*!
 * app.js — 마이스 비즈 팀 보드 대시보드
 * 기준 문서: docs/SPEC-v1.md §5·§6.2 · docs/DATA-CONTRACT.md §5·§6
 *
 * 구조
 *   DataProvider(mock | gas) → 상태(state) → 공통 필터 → 화면 A~E 렌더 → SVG 차트
 *   화면 코드는 provider 만 호출한다(모드 분기 0줄). 산식은 전부 Metrics(src/metrics.js).
 */
(function () {
  'use strict';

  var M = window.Metrics;
  var S = window.Schema;          // 4턴: 편집 계약(src/schema.js) — 폼 자동 생성 · 검증 · 삭제 규칙 · 이력 요약

  /* ================================================================
   * 0. 공통 유틸
   * ================================================================ */

  function esc(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clip(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function comma(n) {
    var neg = n < 0;
    var s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }

  /** 금액 → "1억 2,000만 원" / "3,000만 원" / "8,000 원" */
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) { return '—'; }
    var neg = n < 0, v = Math.abs(Math.round(n));
    var out;
    if (v >= 100000000) {
      var eok = Math.floor(v / 100000000);
      var man = Math.round((v % 100000000) / 10000);
      out = comma(eok) + '억' + (man > 0 ? ' ' + comma(man) + '만' : '') + ' 원';
    } else if (v >= 10000) {
      out = comma(v / 10000) + '만 원';
    } else {
      out = comma(v) + ' 원';
    }
    return (neg ? '-' : '') + out;
  }
  /** 차트 축용 짧은 금액 */
  function fmtMoneyAxis(n) {
    if (n === null || n === undefined || !isFinite(n)) { return ''; }
    var neg = n < 0, v = Math.abs(n);
    var out;
    if (v >= 100000000) { out = (v / 100000000).toFixed(v >= 1000000000 ? 0 : 1) + '억'; }
    else if (v >= 10000) { out = comma(v / 10000) + '만'; }
    else { out = comma(v); }
    return (neg ? '-' : '') + out;
  }
  function fmtPct(r, digits) {
    if (r === null || r === undefined || !isFinite(r)) { return '—'; }
    var d = (digits === undefined) ? 1 : digits;
    return (r * 100).toFixed(d) + '%';
  }
  function fmtMd(n) {
    if (n === null || n === undefined || !isFinite(n)) { return '—'; }
    return n.toFixed(1);
  }
  function fmtMonth(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(key || '');
    return m ? (Number(m[2]) + '월') : (key || '');
  }
  function fmtMonthFull(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(key || '');
    return m ? (m[1] + '년 ' + Number(m[2]) + '월') : (key || '');
  }
  function fmtDate(s) { return s ? String(s) : '—'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** 브라우저 현재 시각 'YYYY-MM-DD HH:mm:ss' — 변경이력 표시용(서버 응답에 이력이 없을 때만 쓴다) */
  function nowStamp() {
    var d = new Date();
    return M.toDateStr(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  /** 행 → 폼 값(null·undefined 는 빈 문자열) */
  function rowToValues(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (k) { out[k] = (row[k] === null || row[k] === undefined) ? '' : row[k]; });
    return out;
  }
  /** "a|b" 형태의 키 문자열 → 키 객체(표의 키 필드 순서) */
  function parseKey(table, keyStr) {
    var keys = S.TABLES[table].key;
    var parts = String(keyStr === null || keyStr === undefined ? '' : keyStr).split('|');
    var out = {};
    keys.forEach(function (k, i) {
      out[k] = (i === keys.length - 1) ? parts.slice(i).join('|') : (parts[i] || '');
    });
    return out;
  }
  function keyStrOf(table, row) {
    return S.TABLES[table].key.map(function (k) { return (row && row[k] !== null && row[k] !== undefined) ? String(row[k]) : ''; }).join('|');
  }

  /* ================================================================
   * 1. DataProvider — 계약 §5 · §6 · §9(4턴 편집 3종)
   * ================================================================ */

  function nextAssignmentId(list, used) {
    var max = 0;
    list.forEach(function (a) {
      var m = /^A-(\d+)$/.exec(String((a && a.id) || ''));
      if (m) { max = Math.max(max, Number(m[1])); }
    });
    Object.keys(used || {}).forEach(function (k) {
      var m = /^A-(\d+)$/.exec(k);
      if (m) { max = Math.max(max, Number(m[1])); }
    });
    var next = max + 1;
    return 'A-' + ('0000' + next).slice(-4);
  }

  /** 저장 전 검증 — 서버(Code.gs)와 같은 규칙 */
  function validateRows(data, rows) {
    var roles = {}; (data.settings.roles || []).forEach(function (r) { roles[r] = true; });
    var members = {}; (data.members || []).forEach(function (m) { members[m.name] = true; });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], no = (i + 1) + '행: ';
      if (!r.member || !members[r.member]) { return no + '팀원을 목록에서 선택하세요.'; }
      if (!r.role || !roles[r.role]) { return no + '역할을 목록에서 선택하세요.'; }
      var md = Number(r.plannedMd);
      if (!isFinite(md) || md < 0) { return no + '계획 공수는 0 이상 숫자여야 합니다.'; }
      if (!r.start || !r.end) { return no + '배정 시작일과 종료일을 입력하세요.'; }
      if (String(r.start) > String(r.end)) { return no + '배정 시작일이 종료일보다 늦습니다.'; }
    }
    return '';
  }

  /** 신규 프로젝트 ID — P-YYYY-NNN (행사 시작일 연도 · 그 연도 최대 번호 + 1). 서버 nextProjectId_ 와 같은 규칙 */
  function nextProjectId(list, eventStart) {
    var year = String(eventStart || '').slice(0, 4);
    if (!/^\d{4}$/.test(year)) { year = String(new Date().getFullYear()); }
    var max = 0;
    (list || []).forEach(function (p) {
      var m = new RegExp('^P-' + year + '-(\\d+)$').exec(String((p && p.id) || ''));
      if (m) { max = Math.max(max, Number(m[1])); }
    });
    return 'P-' + year + '-' + ('000' + (max + 1)).slice(-3);
  }

  var CONFLICT_MSG = '다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.';

  /** 연쇄 삭제 건수 → "함께 삭제: 배정 n · 마일스톤 n …"(0건 항목은 생략). mock 이력·화면 토스트 공용 */
  function cascadeText(c) {
    var r = c || {};
    var parts = [];
    if (r.assignments) { parts.push('배정 ' + r.assignments); }
    if (r.milestones) { parts.push('마일스톤 ' + r.milestones); }
    if (r.settlements) { parts.push('정산 ' + r.settlements); }
    if (r.items) { parts.push('세부 항목 ' + r.items); }
    if (r.notes) { parts.push('주석 ' + r.notes); }
    return parts.length ? '함께 삭제: ' + parts.join(' · ') : '';
  }

  function firstErrorMessage(errors) {
    var e = errors && errors[0];
    if (!e) { return '입력값을 확인하세요.'; }
    return e.label + ': ' + e.message;
  }

  /** 공수 주간 묶음이 같은지(충돌 검사용) — 순서 무관 */
  function sameLogs(a, b) {
    var ka = (a || []).map(function (r) { return r.projectId + '|' + Number(r.md || 0) + '|' + (r.memo || ''); }).sort();
    var kb = (b || []).map(function (r) { return r.projectId + '|' + Number(r.md || 0) + '|' + (r.memo || ''); }).sort();
    return ka.join('\n') === kb.join('\n');
  }

  function makeMockProvider(raw) {
    var data = raw;
    if (!Array.isArray(data.history)) { data.history = []; }
    function today() { return (data.meta && data.meta.today) || M.toDateStr(new Date()); }
    /** 변경이력 앞에 끼워 넣기(최대 30) — 서버 logHistory_ 와 같은 열 구성. 응답에도 실어 화면이 그대로 쓴다 */
    function logHistory(sheet, key, action, summary) {
      var entry = {
        at: today() + ' 09:00:00',
        user: (data.meta && data.meta.user) || '미리보기 사용자',
        sheet: sheet, key: key, action: action, summary: summary
      };
      data.history.unshift(entry);
      if (data.history.length > 30) { data.history.length = 30; }
      return clone(entry);
    }
    function ctxOf(mode, expected) {
      return { settings: data.settings, data: data, mode: mode, expected: expected };
    }
    function logsOfWeek(member, week) {
      return (data.effortLogs || []).filter(function (l) { return l.member === member && M.mondayOf(l.week) === week; });
    }

    /* ---- 5턴: 세부 항목 · 주석 · 업무 블럭 — 서버 Code.gs 와 같은 규칙(브리프 §3) ---- */
    function user() { return (data.meta && data.meta.user) || '미리보기 사용자'; }
    function s(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
    /** 탭 전체 최대 번호 + 1 — 세부ID W-000001 · 주석ID N-000001 */
    function nextId(prefix, list, width) {
      var max = 0;
      var re = new RegExp('^' + prefix + '(\\d+)$');
      (list || []).forEach(function (r) {
        var m = re.exec(String((r && r.id) || ''));
        if (m) { max = Math.max(max, Number(m[1])); }
      });
      var n = String(max + 1);
      while (n.length < width) { n = '0' + n; }
      return prefix + n;
    }
    function catalog() {
      return (Array.isArray(data.blocks) && data.blocks.length) ? data.blocks : S.DEFAULT_BLOCKS;
    }
    /** 세부 항목의 첫 주석(유형 요청 · 파트 = 블럭 파트 · 작성자 = 접속 사용자) */
    function makeNote(item, content) {
      var n = S.normalizeRow('notes', {
        projectId: item.projectId, milestone: item.milestone, itemId: item.id, part: item.part,
        author: user(), authorName: '', at: today() + ' 09:00:00', type: '요청', content: content, resolved: ''
      }, ctxOf('new', null));
      if (!Array.isArray(data.notes)) { data.notes = []; }
      n.id = nextId('N-', data.notes, 6);
      return n;
    }
    /** 마일스톤 이름이 바뀌면 세부항목·주석의 마일스톤 열을 따라 바꾼다 → { items, notes } */
    function renameCascade(projectId, oldName, newName) {
      var out = { items: 0, notes: 0 };
      (data.items || []).forEach(function (it) { if (it.projectId === projectId && s(it.milestone) === s(oldName)) { it.milestone = newName; out.items++; } });
      (data.notes || []).forEach(function (n) { if (n.projectId === projectId && s(n.milestone) === s(oldName)) { n.milestone = newName; out.notes++; } });
      return out;
    }
    /**
     * 결정 D13 — 세부 항목 합계 → 배정 자동 행 동기화(서버 syncAssignmentsFromItemsApi_ 와 같은 결과).
     * 자동 행(비고 = 자동(세부항목))만 지우고 다시 만든다. 수동 행은 그대로. 같은 (담당, 파트) 수동 행이 있으면 overlaps 로만 알린다.
     * → { assignments:[그 프로젝트 행 전체], overlaps, history|null }
     */
    function syncAssignments(projectId) {
      var p = M.findProject(data, projectId);
      if (!p) { return { assignments: [], overlaps: [], history: null }; }
      if (!Array.isArray(data.items)) { data.items = []; }
      var r = S.assignmentsFromItems(p, data.items, data.milestones, data.assignments, data.settings);
      var hist = null;
      if (r.changed) {
        var used = {};
        data.assignments.forEach(function (a) { used[a.id] = true; });
        var auto = r.auto.map(function (a) {
          var row = clone(a);
          if (!row.id) { row.id = nextAssignmentId(data.assignments, used); }
          used[row.id] = true;
          return row;
        });
        data.assignments = data.assignments.filter(function (a) {
          return !(a.projectId === projectId && s(a.note) === S.AUTO_ASSIGN_NOTE);
        }).concat(auto);
        hist = logHistory('배정', projectId, '저장', '세부항목 동기화: ' + auto.length + '행' +
          (auto.length ? '\n자동 행: ' + auto.map(function (a) { return a.member + '(' + a.role + ' ' + a.plannedMd + ')'; }).join(', ') : '') +
          (r.overlaps.length ? '\n수동 행과 겹침: ' + r.overlaps.map(function (o) { return o.member + '/' + o.role + ' 세부 ' + o.itemsMd + ' · 수동 ' + o.manualMd; }).join(', ') : ''));
      }
      return {
        assignments: clone(data.assignments.filter(function (a) { return a.projectId === projectId; })),
        overlaps: clone(r.overlaps),
        history: hist
      };
    }
    /** 응답에 그 프로젝트 배정 행 전체 · overlaps · 동기화 이력을 싣는다 */
    function attachSync(out, projectId) {
      var sy = syncAssignments(projectId);
      out.assignments = sy.assignments;
      out.overlaps = sy.overlaps;
      if (sy.history) { out.historyExtra = [sy.history]; }
      return out;
    }
    return {
      mode: 'mock',
      getBootstrap: function () {
        console.info('[mock write] getBootstrap');
        return Promise.resolve(clone(data));
      },
      saveAssignments: function (projectId, rows) {
        console.info('[mock write] saveAssignments', { projectId: projectId, rows: rows });
        var msg = validateRows(data, rows);
        if (msg) { return Promise.reject(new Error(msg)); }
        var used = {};
        var kept = data.assignments.filter(function (a) { return a.projectId !== projectId; });
        var saved = rows.map(function (r) {
          var id = r.id || nextAssignmentId(data.assignments, used);
          used[id] = true;
          return {
            id: id, projectId: projectId, member: r.member, role: r.role,
            plannedMd: Number(r.plannedMd), start: r.start, end: r.end,
            status: r.status || '예정', note: r.note || ''
          };
        });
        data.assignments = kept.concat(saved);
        var hist = logHistory('배정', projectId, '저장', '배정 행 교체: ' + saved.length + '행' +
          (saved.length ? '\n팀원: ' + saved.map(function (a) { return a.member + '(' + a.role + ' ' + a.plannedMd + ')'; }).join(', ') : ''));
        // 5턴: 저장 뒤 세부 항목 합계로 자동 행을 다시 맞춘다(수동 행을 지우면 자동 행이 생긴다) → 응답은 프로젝트 행 전체
        return Promise.resolve(attachSync({ ok: true, projectId: projectId, history: hist }, projectId));
      },
      completeMilestone: function (projectId, name, date) {
        console.info('[mock write] completeMilestone', { projectId: projectId, name: name, date: date });
        var hit = null;
        data.milestones.forEach(function (m) {
          if (m.projectId === projectId && m.name === name) { hit = m; }
        });
        if (!hit) { return Promise.reject(new Error('해당 마일스톤을 찾을 수 없습니다.')); }
        var before = clone(hit);
        hit.done = date || today();
        var hist = logHistory('마일스톤', S.keyLabel('milestones', hit), '수정', S.summarize('milestones', '수정', before, hit));
        return Promise.resolve({ ok: true, projectId: projectId, name: name, done: hit.done, history: hist });
      },
      createStandardMilestones: function (projectId) {
        console.info('[mock write] createStandardMilestones', { projectId: projectId });
        var p = M.findProject(data, projectId);
        if (!p) { return Promise.reject(new Error('프로젝트를 찾을 수 없습니다.')); }
        if (!p.eventStart || !p.eventEnd) { return Promise.reject(new Error('행사 시작일과 종료일을 먼저 입력하세요.')); }
        var mine = data.assignments.filter(function (a) { return a.projectId === projectId; });
        var have = data.milestones.filter(function (m) { return m.projectId === projectId; });
        var res = M.standardMilestones(p, data.settings.milestoneTemplate, mine, have);
        res.created.forEach(function (m) { data.milestones.push(clone(m)); });
        var hist = logHistory('마일스톤', projectId, '추가', '표준 마일스톤 생성: ' + res.created.length + '건 · 건너뜀 ' + res.skipped.length + '건' +
          (res.created.length ? '\n생성: ' + res.created.map(function (m) { return m.name; }).join(', ') : ''));
        return Promise.resolve({ ok: true, projectId: projectId, created: clone(res.created), skipped: res.skipped, history: hist });
      },

      /* ---- 4턴 편집 3종 — 서버 Code.gs 와 같은 검증·충돌 검사·이력 규칙(계약 §9) ---- */
      saveRow: function (table, row, expected, options) {
        console.info('[mock write] saveRow', { table: table, row: row, expected: expected, options: options });
        if (!S.TABLES[table]) { return Promise.reject(new Error('알 수 없는 표입니다: ' + table)); }
        var t = S.TABLES[table];
        var list = data[table];
        if (!Array.isArray(list)) { list = data[table] = []; }
        var mode = expected ? 'edit' : 'new';
        // 정산은 프로젝트당 1행 — 행이 이미 있으면 수정으로 취급(빈 값으로 연 폼의 저장 = upsert)
        if (table === 'settlements' && mode === 'new') {
          var sIdx = S.findRow(table, list, S.keyOf(table, row));
          if (sIdx >= 0) { expected = clone(list[sIdx]); mode = 'edit'; }
        }
        var v = S.validateRow(table, row, ctxOf(mode, expected));
        if (!v.ok) { return Promise.reject(new Error(firstErrorMessage(v.errors))); }
        var values = v.values;
        var hist, extra, firstNote = null;

        if (mode === 'edit') {
          var idx = S.findRow(table, list, S.keyOf(table, expected));
          if (idx < 0) { return Promise.reject(new Error(t.label + ' 행을 찾을 수 없습니다: ' + S.keyLabel(table, expected) + '. 화면을 새로고침하세요.')); }
          var current = list[idx];
          if (S.diff(table, expected, current).length) { return Promise.reject(new Error(CONFLICT_MSG)); }
          t.fields.forEach(function (fd) { if (fd.auto) { values[fd.key] = current[fd.key]; } });
          if (table === 'effortLogs') { values.loggedAt = today() + ' 09:00'; }
          // 5턴: 주석 수정은 작성자 본인만. 다른 사람 주석은 "해결" 표시만 바꿀 수 있다
          if (table === 'notes' && s(current.author) !== s(user())) {
            var others = S.diff('notes', current, values).filter(function (d) { return d.field !== 'resolved'; });
            if (others.length) { return Promise.reject(new Error('주석은 작성자 본인만 수정할 수 있습니다. 해결 표시만 바꿀 수 있습니다.')); }
          }
          list[idx] = values;
          var renamed = null;
          if (table === 'milestones' && s(current.name) !== s(values.name)) {
            renamed = renameCascade(values.projectId, current.name, values.name);
            if (renamed.items || renamed.notes) { extra = '마일스톤 이름 변경 연쇄: 세부 항목 ' + renamed.items + ' · 주석 ' + renamed.notes; }
          }
          hist = logHistory(t.sheet, S.keyLabel(table, values), '수정', S.summarize(table, '수정', current, values, extra));
          var edited = { ok: true, table: table, created: false, row: clone(values), history: hist };
          if (renamed) { edited.renamed = renamed; }
          if (table === 'items') { attachSync(edited, values.projectId); }
          return Promise.resolve(edited);
        }

        var milestonesRes = null;
        if (table === 'projects') {
          values.id = nextProjectId(list, values.eventStart);
          values.createdAt = today();
          list.push(values);
          data.settlements.push({ projectId: values.id, revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' });
          extra = '정산 행 자동 추가';
          if (options && options.createStandardMilestones) {
            var ms = M.standardMilestones(values, data.settings.milestoneTemplate, [], data.milestones);
            ms.created.forEach(function (m) { data.milestones.push(clone(m)); });
            milestonesRes = { created: clone(ms.created), skipped: ms.skipped };
            extra += ' · 표준 마일스톤 ' + ms.created.length + '건 생성';
          }
        } else if (table === 'items') {
          // 5턴: 세부ID 자동 발급 · options.firstNote 가 있으면 첫 주석(요청) 생성 · 배정 동기화
          values.id = nextId('W-', list, 6);
          list.push(values);
          if (options && s(options.firstNote)) {
            firstNote = makeNote(values, s(options.firstNote));
            data.notes.push(firstNote);
            extra = '첫 주석(요청) 생성: ' + firstNote.id;
          }
        } else if (table === 'notes') {
          // 5턴: 작성자·일시는 서버가 채운다
          values.id = nextId('N-', list, 6);
          values.author = user();
          values.at = today() + ' 09:00:00';
          list.push(values);
        } else {
          if (table === 'effortLogs') { values.loggedAt = today() + ' 09:00'; }
          list.push(values);
        }
        hist = logHistory(t.sheet, S.keyLabel(table, values), '추가', S.summarize(table, '추가', null, values, extra));
        var out = { ok: true, table: table, created: true, row: clone(values), history: hist };
        if (milestonesRes) { out.milestones = milestonesRes; }
        if (firstNote) { out.firstNote = clone(firstNote); }
        if (table === 'items') { attachSync(out, values.projectId); }
        return Promise.resolve(out);
      },
      deleteRow: function (table, key) {
        console.info('[mock write] deleteRow', { table: table, key: key });
        if (!S.TABLES[table]) { return Promise.reject(new Error('알 수 없는 표입니다: ' + table)); }
        var t = S.TABLES[table];
        var list = data[table] || [];
        var idx = S.findRow(table, list, key);
        if (idx < 0) { return Promise.reject(new Error('삭제할 ' + t.label + ' 행을 찾을 수 없습니다. 화면을 새로고침하세요.')); }
        var row = list[idx];
        var chk = S.deleteCheck(table, row, data);
        if (!chk.ok) { return Promise.reject(new Error(chk.reason)); }
        var removed = { assignments: 0, milestones: 0, settlements: 0, items: 0, notes: 0 };
        if (table === 'projects') {
          ['assignments', 'milestones', 'settlements', 'items', 'notes'].forEach(function (k) {
            if (!Array.isArray(data[k])) { data[k] = []; }
            var before = data[k].length;
            data[k] = data[k].filter(function (r) { return r.projectId !== row.id; });
            removed[k] = before - data[k].length;
          });
        }
        if (table === 'items') {
          // 5턴: 그 세부ID 의 주석 연쇄 삭제
          if (!Array.isArray(data.notes)) { data.notes = []; }
          var nBefore = data.notes.length;
          data.notes = data.notes.filter(function (n) { return s(n.itemId) !== s(row.id); });
          removed.notes = nBefore - data.notes.length;
        }
        if (table === 'milestones') {
          // 5턴: 마일스톤 단위 주석(세부ID 없음) 연쇄 삭제 — 세부 항목이 있으면 deleteCheck 가 이미 막았다
          if (!Array.isArray(data.notes)) { data.notes = []; }
          var mBefore = data.notes.length;
          data.notes = data.notes.filter(function (n) { return !(s(n.projectId) === s(row.projectId) && s(n.milestone) === s(row.name) && s(n.itemId) === ''); });
          removed.notes = mBefore - data.notes.length;
        }
        list.splice(idx, 1);
        var extra = cascadeText(removed);
        var hist = logHistory(t.sheet, S.keyLabel(table, row), '삭제', S.summarize(table, '삭제', row, null, extra));
        var delOut = { ok: true, table: table, key: S.keyOf(table, row), removed: removed, history: hist };
        if (table === 'items') { attachSync(delOut, row.projectId); }
        return Promise.resolve(delOut);
      },
      /* ---- 5턴: 카탈로그 블럭 여러 개를 한 번에 세부 항목으로 — 기본값·첫 주석은 카탈로그에서(브리프 §3 addItems) ---- */
      addItems: function (projectId, milestone, part, blockNames) {
        console.info('[mock write] addItems', { projectId: projectId, milestone: milestone, part: part, blockNames: blockNames });
        var p = M.findProject(data, projectId);
        if (!p) { return Promise.reject(new Error('프로젝트를 찾을 수 없습니다: ' + projectId)); }
        var msOk = (data.milestones || []).some(function (m) { return m.projectId === projectId && s(m.name) === s(milestone); });
        if (!msOk) { return Promise.reject(new Error('프로젝트 ' + projectId + ' 에 마일스톤 "' + milestone + '" 이(가) 없습니다.')); }
        if (!Array.isArray(data.items)) { data.items = []; }
        if (!Array.isArray(data.notes)) { data.notes = []; }
        var names = Array.isArray(blockNames) ? blockNames : [];
        if (!names.length) { return Promise.reject(new Error('추가할 블럭을 하나 이상 고르세요.')); }
        var isHost = /주최/.test(String(p.type || ''));
        var created = [], notes = [], skipped = [];
        for (var i = 0; i < names.length; i++) {
          var name = s(names[i]);
          var cat = null;
          catalog().forEach(function (b) { if (s(b.part) === s(part) && s(b.block) === name) { cat = b; } });
          if (!cat) { return Promise.reject(new Error('파트 "' + part + '" 카탈로그에 블럭 "' + name + '" 이(가) 없습니다. 시트의 [업무블럭] 탭을 확인하세요.')); }
          if (isHost && cat.skipForHost) { skipped.push(name); continue; }
          var exists = data.items.some(function (it) { return it.projectId === projectId && s(it.milestone) === s(milestone) && s(it.block) === name; });
          if (exists) { skipped.push(name); continue; }
          var v = S.validateRow('items', {
            projectId: projectId, milestone: milestone, part: part, block: name, owner: '',
            impact: cat.impact, difficulty: cat.difficulty, plannedMd: cat.md, due: '', status: '예정', note: ''
          }, ctxOf('new', null));
          if (!v.ok) { return Promise.reject(new Error(firstErrorMessage(v.errors))); }
          var row = v.values;
          row.id = nextId('W-', data.items, 6);
          data.items.push(row);
          created.push(clone(row));
          if (s(cat.judge)) {
            var n = makeNote(row, s(cat.judge));
            data.notes.push(n);
            notes.push(clone(n));
          }
        }
        var hist = logHistory('세부항목', projectId + ' · ' + milestone, '추가',
          '블럭 추가: ' + created.length + '건 · 건너뜀 ' + skipped.length + '건' +
          (created.length ? '\n블럭: ' + created.map(function (it) { return it.part + ' / ' + it.block + ' (' + it.plannedMd + ')'; }).join(', ') : '') +
          (notes.length ? '\n첫 주석 ' + notes.length + '건 생성' : '') +
          (skipped.length ? '\n건너뜀: ' + skipped.join(', ') : ''));
        return Promise.resolve(attachSync({ ok: true, projectId: projectId, milestone: milestone, items: created, notes: notes, skipped: skipped, history: hist }, projectId));
      },
      saveEffortWeek: function (member, week, rows, expected) {
        console.info('[mock write] saveEffortWeek', { member: member, week: week, rows: rows, expected: expected });
        var v = S.validateEffortWeek(member, week, rows, ctxOf('new', null));
        if (!v.ok) { return Promise.reject(new Error(firstErrorMessage(v.errors))); }
        var current = logsOfWeek(member, week);
        if (expected && !sameLogs(expected, current)) { return Promise.reject(new Error(CONFLICT_MSG)); }
        var stamp = today() + ' 09:00';
        var saved = v.values.map(function (r) {
          return { week: week, member: member, projectId: r.projectId, md: r.md, memo: r.memo || '', loggedAt: stamp };
        });
        data.effortLogs = data.effortLogs.filter(function (l) { return !(l.member === member && M.mondayOf(l.week) === week); }).concat(saved);
        var lines = ['실투입 M/D 합계: ' + v.total + ' (' + saved.length + '행)'].concat(saved.map(function (r) {
          return '프로젝트ID ' + r.projectId + ': ' + r.md + (r.memo ? ' · ' + r.memo : '');
        }));
        var hist = logHistory('공수기록', week + ' · ' + member, '저장', lines.join('\n'));
        return Promise.resolve({ ok: true, member: member, week: week, effortLogs: clone(saved), history: hist });
      }
    };
  }

  function makeGasProvider() {
    function call(fnName, args) {
      return new Promise(function (resolve, reject) {
        try {
          var runner = window.google.script.run
            .withSuccessHandler(function (res) { resolve(res); })
            .withFailureHandler(function (e) {
              reject(new Error((e && e.message) ? e.message : '서버 요청에 실패했습니다. 잠시 후 다시 시도하세요.'));
            });
          runner[fnName].apply(runner, args || []);
        } catch (e) {
          reject(new Error('서버 함수를 호출할 수 없습니다: ' + (e && e.message ? e.message : fnName)));
        }
      });
    }
    return {
      mode: 'gas',
      getBootstrap: function () { return call('getBootstrap', []); },
      saveAssignments: function (projectId, rows) { return call('saveAssignments', [projectId, rows]); },
      completeMilestone: function (projectId, name, date) { return call('completeMilestone', [projectId, name, date]); },
      createStandardMilestones: function (projectId) { return call('createStandardMilestones', [projectId]); },
      saveRow: function (table, row, expected, options) { return call('saveRow', [table, row, expected || null, options || {}]); },
      deleteRow: function (table, key) { return call('deleteRow', [table, key]); },
      saveEffortWeek: function (member, week, rows, expected) { return call('saveEffortWeek', [member, week, rows, expected || null]); },
      /* 5턴: 카탈로그 블럭 일괄 추가(브리프 §3) */
      addItems: function (projectId, milestone, part, blockNames) { return call('addItems', [projectId, milestone, part, blockNames || []]); }
    };
  }

  /** 계약 §6 — 모드 판별은 이 한 줄만 */
  function pickProvider() {
    var isGas = !!(window.google && window.google.script && window.google.script.run);
    if (isGas) { return makeGasProvider(); }
    var node = document.getElementById('mock-data');
    if (!node) { throw new Error('표시할 데이터가 없습니다. 미리보기 파일이면 mock 데이터 블록이 빠진 것입니다.'); }
    return makeMockProvider(JSON.parse(node.textContent || node.innerText || '{}'));
  }

  /* ================================================================
   * 2. 상태
   * ================================================================ */

  var state = {
    data: null,
    view: null,
    today: '',
    tab: 'A',
    filters: { type: '', pm: '', status: '', from: '', to: '' },
    selectedProject: '',      // 화면 A 상세 · D 버블
    selectedCell: null,       // 화면 B 히트맵 {member, month}
    editProject: '',          // 화면 B 배정 편집 대상
    editRows: [],
    burnProject: '',          // 화면 C 막대 선택
    saving: false,
    pendingConfirm: null,     // 3.1 m-2: 2단계 확인을 기다리는 버튼 키(action|project|name)
    heatOnlyAssigned: true,   // B 히트맵 "배정된 팀원만 보기" (기본 켜짐)
    form: null,               // 4턴: 편집 폼(한 번에 하나) { table, mode:'new'|'edit', values, expected, error, options, locked, anchor }
    effort: null,             // 4턴: 공수 주간 입력 { member, week, rows:[{projectId,md,memo}], expected, error }
    itemsOpen: {},            // 5턴: A 상세 — 펼친 마일스톤 { '<projectId>|<milestone>': true }
    notesOpen: {},            // 5턴: 펼친 주석 스레드 { '<itemId>' | 'ms:<projectId>|<milestone>': true }
    part: '',                 // 5턴: 파트 필터(빈 값 = 전체) — localStorage 'tb.part'
    blockPicker: null,        // 5턴: 블럭 추가 창 { projectId, milestone, part, checked:{block:true} }
    overlaps: {}              // 5턴: 서버 응답의 overlaps 보관 { projectId: [{member, role, itemsMd, manualMd}] }
  };
  var provider = null;

  /* ================================================================
   * 3. 필터 · 파생 데이터
   * ================================================================ */

  function filteredData() {
    var d = state.data, f = state.filters;
    var projects = (d.projects || []).filter(function (p) {
      if (f.type && p.type !== f.type) { return false; }
      if (f.pm && p.pm !== f.pm) { return false; }
      if (f.status && p.status !== f.status) { return false; }
      return true;
    });
    var ids = {};
    projects.forEach(function (p) { ids[p.id] = true; });
    return {
      meta: d.meta, settings: d.settings, members: d.members,
      projects: projects,
      assignments: (d.assignments || []).filter(function (a) { return ids[a.projectId]; }),
      // 공통코드(G-*) 기록은 가동률 계산에 필요하므로 항상 남긴다
      effortLogs: (d.effortLogs || []).filter(function (l) { return M.isCommonCode(l.projectId) || ids[l.projectId]; }),
      milestones: (d.milestones || []).filter(function (m) { return ids[m.projectId]; }),
      settlements: (d.settlements || []).filter(function (s) { return ids[s.projectId]; }),
      // 5턴: 세부 항목·주석은 프로젝트 필터를 따르고, 업무 블럭 카탈로그는 항상 전체
      items: (d.items || []).filter(function (it) { return ids[it.projectId]; }),
      notes: (d.notes || []).filter(function (n) { return ids[n.projectId]; }),
      blocks: d.blocks || []
    };
  }

  /* ---- 5턴: 세부 항목 · 주석 도우미 ---- */
  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
  function itemsKey(projectId, milestone) { return String(projectId || '') + '|' + String(milestone || ''); }
  function rolesList() { return ((state.data && state.data.settings && state.data.settings.roles) || []).slice(); }
  function isHostProject(p) { return /주최/.test(String((p && p.type) || '')); }
  function noteAuthorLabel(n) {
    if (str(n && n.authorName)) { return str(n.authorName); }
    var a = str(n && n.author);
    return a ? a.split('@')[0] : '—';
  }
  function isMyNote(n) {
    var me = str(state.data && state.data.meta && state.data.meta.user);
    return !!me && str(n && n.author) === me;
  }
  /** 프로젝트의 overlaps — 서버 응답이 있으면 그것, 없으면 같은 산식으로 계산(초기 로드) */
  function overlapsFor(projectId) {
    if (state.overlaps && Array.isArray(state.overlaps[projectId])) { return state.overlaps[projectId]; }
    var p = M.findProject(state.data, projectId);
    if (!p) { return []; }
    try {
      return S.assignmentsFromItems(p, state.data.items || [], state.data.milestones || [], state.data.assignments || [], state.data.settings).overlaps || [];
    } catch (e) { return []; }
  }
  /**
   * 세부 항목 담당 select 의 팀원 순서(브리프 §4) — 파트가 주역할인 팀원 → 같은 프로젝트 기배정자 → 이번 달 계획 가동률 낮은 순.
   * 이름 옆에 "가동률 62%", 100% 초과는 흐리게(is-muted). 등급·경고 없음(D15)
   */
  function memberPickList(part, projectId) {
    var month = M.monthKey(state.today);
    var util = {};
    M.plannedUtilization(state.data, month).forEach(function (r) { util[r.member] = r; });
    var assigned = {};
    (state.data.assignments || []).forEach(function (a) { if (a.projectId === projectId && a.member) { assigned[a.member] = true; } });
    var list = (state.data.members || []).filter(function (m) { return m.status !== '퇴사'; });
    function rank(m) { return (str(m.role) === str(part) && part) ? 0 : (assigned[m.name] ? 1 : 2); }
    function ratio(m) { var u = util[m.name]; return (u && u.ratio !== null && isFinite(u.ratio)) ? u.ratio : 0; }
    var indexed = list.map(function (m, i) { return { m: m, i: i }; });
    indexed.sort(function (a, b) {
      var d = rank(a.m) - rank(b.m);
      if (d) { return d; }
      d = ratio(a.m) - ratio(b.m);
      if (d) { return d; }
      return a.i - b.i;
    });
    return indexed.map(function (x) {
      var m = x.m, r = ratio(m);
      var tags = [m.role || ''];
      if (assigned[m.name]) { tags.push('기배정'); }
      if (m.status === '지원') { tags.push('지원'); }
      tags.push('가동률 ' + fmtPct(r, 0));
      return { value: m.name, label: m.name + ' · ' + tags.filter(Boolean).join(' · '), cls: r > 1 ? 'is-muted' : '' };
    });
  }
  function levelChip(v) {
    var l = str(v) || '중';
    return '<span class="tb-chip-level is-' + esc(l) + '" data-level="' + esc(l) + '">' + esc(l) + '</span>';
  }
  function partChip(v) { return '<span class="tb-chip-part">' + esc(str(v) || '—') + '</span>'; }

  /** 유형·담당·상태 필터 중 하나라도 걸려 있는지 — 3.1 M-3 배지용(기간 필터는 프로젝트 집합을 바꾸지 않으므로 제외) */
  function filterActive() {
    var f = state.filters;
    return !!(f.type || f.pm || f.status);
  }

  /** 기간 필터가 가리키는 월 목록 */
  function periodMonths() {
    var from = state.filters.from || M.monthKey(state.today);
    var to = state.filters.to || M.monthAdd(from, 5);
    var n = M.monthDiff(from, to);
    if (n === null || n < 0) { n = 0; }
    n = Math.min(n, 23);
    return M.monthsBetween(from, n + 1);
  }

  /** 히트맵 6개월(SPEC 고정: 당월부터) */
  function heatMonths() { return M.monthsBetween(M.monthKey(state.today), 6); }

  /** 보드가 가동률을 관리하는 팀원 — 퇴사 · 지원(타 팀·외부 지원 인력) 제외. 히트맵·투입 구성·주간 기록에 쓴다 */
  function activeMembers(view) {
    return (view.members || []).filter(function (m) { return m.status !== '퇴사' && m.status !== '지원'; });
  }

  function projectName(id) {
    var p = M.findProject(state.data, id);
    if (p) { return p.name; }
    return id;
  }

  function codeLabel(code) {
    if (code === 'G-내부') { return '내부 업무'; }
    if (code === 'G-영업') { return '영업 활동'; }
    if (code === 'G-휴가') { return '휴가'; }
    return projectName(code);
  }

  /* ================================================================
   * 4. SVG 차트 헬퍼
   * ================================================================ */

  function svgOpen(w, h, chart) {
    return '<svg data-chart="' + esc(chart) + '" viewBox="0 0 ' + w + ' ' + h +
      '" width="100%" height="' + h + '" preserveAspectRatio="xMinYMin meet" role="img">';
  }
  function rect(x, y, w, h, cls, extra) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) +
      '" height="' + Math.max(0, h).toFixed(1) + '"' + (cls ? ' class="' + cls + '"' : '') + (extra || '') + '/>';
  }
  function line(x1, y1, x2, y2, cls) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
      '" y2="' + y2.toFixed(1) + '" class="' + cls + '"/>';
  }
  function text(x, y, s, cls, anchor) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' +
      (cls ? ' class="' + cls + '"' : '') + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }
  function seriesClass(i) { return 'f-s' + ((i % 5) + 1); }

  function emptyBox(msg) { return '<div class="tb-empty">' + esc(msg) + '</div>'; }

  /* ================================================================
   * 5. 공통 화면 요소
   * ================================================================ */

  function renderTopMeta() {
    var meta = state.data.meta || {};
    var modeLabel = (meta.mode === 'gas') ? '시트 연결' : '샘플 데이터';
    var gen = meta.generatedAt ? String(meta.generatedAt).replace('T', ' ').slice(0, 16) : '—';
    el('meta-line').innerHTML =
      '기준일 <strong class="num">' + esc(state.today) + '</strong> · 데이터 갱신 <span class="num">' + esc(gen) +
      '</span> · ' + esc(modeLabel) + (meta.user ? ' · ' + esc(meta.user) : '');
    var link = el('sheet-link');
    // 4턴: 새로고침 버튼 — 뼈대(index.template.html)는 그대로 두고 시트 열기 링크 앞에 끼워 넣는다
    if (!el('refresh-data') && link && link.parentNode) {
      var rb = document.createElement('button');
      rb.type = 'button';
      rb.id = 'refresh-data';
      rb.className = 'tb-sheet-link tb-refresh';
      rb.setAttribute('data-action', 'refresh-data');
      rb.title = '시트(또는 샘플 데이터)를 다시 읽어 옵니다. 필터·화면·선택은 유지됩니다.';
      rb.textContent = '새로고침';
      link.parentNode.insertBefore(rb, link);
    }
    if (meta.sheetUrl) {
      link.setAttribute('href', meta.sheetUrl);
      link.removeAttribute('aria-disabled');
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      link.title = '구글 스프레드시트를 새 탭에서 엽니다';
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.title = '시트 주소가 없습니다(샘플 데이터 미리보기)';
    }
  }

  function renderKpis(view) {
    var k = M.kpis(view, state.today);                 // 프로젝트 단위 지표 — 필터 적용
    var kAll = M.kpis(state.data, state.today);        // 팀 계획 가동률 — 필터 무관, 전체 기준 (3.1 M-3)
    var utilLevel = M.utilLevel(kAll.teamPlannedUtil, state.data.settings);
    var cards = [
      {
        key: 'activeProjects', label: '진행 중 프로젝트', value: k.activeProjects, unit: '건',
        sub: '상태 계약 · 준비 · 진행', cls: ''
      },
      {
        key: 'eventsThisMonth', label: '이달 행사', value: k.eventsThisMonth, unit: '건',
        sub: fmtMonthFull(M.monthKey(state.today)) + ' 기준', cls: ''
      },
      {
        key: 'teamPlannedUtil', label: '팀 계획 가동률', value: fmtPct(kAll.teamPlannedUtil, 0), unit: '',
        sub: '계획 ' + fmtMd(kAll.teamPlannedMd) + ' / 가용 ' + fmtMd(kAll.teamCapacityMd) +
          ' <span title="M/D(1인 1일 공수)">M/D(1인 1일 공수)</span>' + (filterActive() ? ' · 전체 기준(필터 무관)' : ''),
        cls: utilLevel === 'over' ? 'is-over' : (utilLevel === 'warn' ? 'is-warn' : ''), rawSub: true
      },
      {
        key: 'delayedMilestones', label: '지연 마일스톤', value: k.delayedMilestones, unit: '건',
        sub: k.delayedMilestones > 0 ? '이번 주 화면에서 확인' : '지연 없음',
        cls: k.delayedMilestones > 0 ? 'is-over' : ''
      }
    ];
    el('kpi-strip').innerHTML = cards.map(function (c) {
      return '<div class="tb-kpi ' + c.cls + '" data-kpi="' + c.key + '">' +
        '<div class="k-label">' + esc(c.label) + '</div>' +
        '<div class="k-value">' + esc(c.value) + (c.unit ? '<span class="k-unit">' + esc(c.unit) + '</span>' : '') + '</div>' +
        '<div class="k-sub">' + (c.rawSub ? c.sub : esc(c.sub)) + '</div>' +
        '</div>';
    }).join('');
  }

  function buildFilters() {
    var s = state.data.settings || {};
    function opts(list, sel) {
      return ['<option value="">전체</option>'].concat((list || []).map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>';
      })).join('');
    }
    var memberNames = (state.data.members || []).map(function (m) { return m.name; });
    el('filters').innerHTML =
      '<label class="tb-field"><span>유형</span><select id="f-type">' + opts(s.types, state.filters.type) + '</select></label>' +
      '<label class="tb-field"><span>담당 책임자</span><select id="f-pm">' + opts(memberNames, state.filters.pm) + '</select></label>' +
      '<label class="tb-field"><span>상태</span><select id="f-status">' + opts(s.statuses, state.filters.status) + '</select></label>' +
      '<label class="tb-field"><span>기간 시작월</span><input type="month" id="f-from" value="' + esc(state.filters.from) + '"></label>' +
      '<label class="tb-field"><span>기간 종료월</span><input type="month" id="f-to" value="' + esc(state.filters.to) + '"></label>' +
      '<button type="button" class="tb-filter-reset" data-action="reset-filters">필터 초기화</button>' +
      '<span id="filter-badge" class="tb-filter-badge" hidden></span>';

    ['f-type', 'f-pm', 'f-status', 'f-from', 'f-to'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        state.filters.type = el('f-type').value;
        state.filters.pm = el('f-pm').value;
        state.filters.status = el('f-status').value;
        state.filters.from = el('f-from').value;
        state.filters.to = el('f-to').value;
        render();
      });
    });
  }

  /** 3.1 M-3: 필터가 걸리면 "필터 적용 중 · 프로젝트 N / M" 배지를 보인다 */
  function renderFilterBadge(view) {
    var badge = el('filter-badge');
    if (!badge) { return; }
    if (filterActive()) {
      badge.hidden = false;
      badge.textContent = '필터 적용 중 · 프로젝트 ' + view.projects.length + ' / ' + (state.data.projects || []).length;
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function resetFilters() {
    state.filters = {
      type: '', pm: '', status: '',
      from: M.monthAdd(M.monthKey(state.today), -2),
      to: M.monthAdd(M.monthKey(state.today), 5)
    };
    buildFilters();
    render();
  }

  /* ================================================================
   * 6. 화면 A — 포트폴리오
   * ================================================================ */

  function statusBadge(status) {
    var map = {
      '견적': 'badge-neutral', '계약': 'badge-info', '준비': 'badge-info',
      '진행': 'badge-active', '완료': 'badge-done', '정산완료': 'badge-done', '드롭': 'badge-late'
    };
    return '<span class="badge ' + (map[status] || 'badge-neutral') + '">' + esc(status || '—') + '</span>';
  }

  function typeShort(t) {
    if (!t) { return '—'; }
    return String(t).slice(0, 1);
  }

  function renderScreenA(view) {
    var host = el('screen-A');
    var statuses = (view.settings.statuses || []).filter(function (s) {
      if (s !== '드롭') { return true; }
      return view.projects.some(function (p) { return p.status === '드롭'; });
    });

    var columns = statuses.map(function (st) {
      var list = view.projects.filter(function (p) { return p.status === st; });
      var cards = list.map(function (p) {
        var o = M.projectOutput(view, p.id);
        return '<div class="tb-proj-card' + (state.selectedProject === p.id ? ' is-selected' : '') +
          '" data-project="' + esc(p.id) + '" tabindex="0" role="button">' +
          '<div class="p-name">' + esc(clip(p.name, 24)) + '</div>' +
          '<div class="p-meta">' + esc(typeShort(p.type)) + ' · ' + esc(p.pm || '담당 미정') + ' · ' + esc(p.eventStart || '') + '</div>' +
          '<div class="p-amount">' + esc(o.realized ? fmtMoney(o.revenue) : '계약 ' + fmtMoney(o.contractAmount)) + '</div>' +
          '</div>';
      }).join('');
      return '<div class="tb-column">' +
        '<div class="tb-column-head"><span>' + esc(st) + '</span><span class="num">' + list.length + '</span></div>' +
        (cards || '<div class="tb-empty" style="padding:12px;font-size:12px">없음</div>') +
        '</div>';
    }).join('');

    var body =
      '<div class="tb-toolbar tb-screen-toolbar">' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="open-form" data-table="projects" data-mode="new"' + (state.saving ? ' disabled' : '') + '>새 프로젝트</button>' +
      '<span class="cap">프로젝트 수정·삭제, 마일스톤·정산 입력은 오른쪽 상세 패널에서 합니다.</span>' +
      '</div>' +
      (state.form && state.form.anchor === 'A' ? '<div id="edit-form">' + formCard() + '</div>' : '') +
      '<div class="tb-grid-2">' +
      '<div>' +
      '<div class="tb-card"><h3>상태별 프로젝트</h3>' +
      '<div class="tb-card-desc">카드를 누르면 오른쪽에 상세가 열립니다.</div>' +
      (view.projects.length ? '<div class="tb-columns">' + columns + '</div>' : emptyBox('조건에 맞는 프로젝트가 없습니다. 필터를 넓혀 보세요.')) +
      '</div>' +
      '<div class="tb-card"><h3>타임라인</h3>' +
      '<div class="tb-card-desc">착수 → 행사 → 정산 구간. 세로 점선이 기준일입니다.</div>' +
      timelineChart(view) +
      '<div class="legend" style="margin-top:8px">' +
      '<span><i class="swatch" style="background:var(--s4)"></i>착수 준비</span>' +
      '<span><i class="swatch" style="background:var(--orange)"></i>행사</span>' +
      '<span><i class="swatch" style="background:var(--steel)"></i>정산</span>' +
      '</div></div>' +
      '</div>' +
      '<div class="tb-detail">' + detailPanel(view) + '</div>' +
      '</div>';
    host.innerHTML = body;
  }

  function timelineChart(view) {
    var months = periodMonths();
    if (!months.length) { return emptyBox('기간 필터를 확인하세요.'); }
    var start = months[0] + '-01';
    var end = M.monthEndOf(months[months.length - 1] + '-01');
    var totalDays = M.daysBetween(start, end) + 1;

    var rows = view.projects.filter(function (p) {
      var a = M.effectiveKickoff(p, view.settings) || p.eventStart;
      var b = M.effectiveSettlementDue(p, view.settings) || p.eventEnd;
      return a && b && !(b < start || a > end);
    }).sort(function (x, y) { return String(x.eventStart).localeCompare(String(y.eventStart)); });

    if (!rows.length) { return emptyBox('선택한 기간에 걸치는 프로젝트가 없습니다.'); }

    var W = 1000, L = 190, R = 20, TOP = 34, RH = 26;
    var cw = W - L - R;
    var H = TOP + rows.length * RH + 16;
    function x(dateStr) {
      var d = M.daysBetween(start, dateStr);
      if (d === null) { return L; }
      var v = L + (d / totalDays) * cw;
      return Math.max(L, Math.min(L + cw, v));
    }

    var out = [svgOpen(W, H, 'timeline')];
    months.forEach(function (mk) {
      var mx = x(mk + '-01');
      out.push(line(mx, TOP - 12, mx, H - 8, 'grid'));
      out.push(text(mx + 4, TOP - 18, fmtMonth(mk), 'axis'));
    });
    rows.forEach(function (p, i) {
      var y = TOP + i * RH;
      var ko = M.effectiveKickoff(p, view.settings) || p.eventStart;
      var sd = M.effectiveSettlementDue(p, view.settings) || p.eventEnd;
      var x0 = x(ko), x1 = x(p.eventStart), x2 = x(p.eventEnd), x3 = x(sd);
      var sel = (state.selectedProject === p.id);
      var tip = p.name + ' · 착수 ' + ko + (p.kickoff ? '' : '(추정)') +
        ' · 행사 ' + p.eventStart + (p.eventEnd && p.eventEnd !== p.eventStart ? '~' + p.eventEnd : '') +
        ' · 정산 ' + sd + (p.settlementDue ? '' : '(추정)');
      out.push('<g class="hit" data-project="' + esc(p.id) + '" data-tip="' + esc(tip) + '">');
      out.push(rect(0, y, W, RH - 4, sel ? 'f-track' : '', ' opacity="' + (sel ? 0.9 : 0) + '"'));
      out.push(text(6, y + 13, clip(p.name, 15), sel ? 'strong' : ''));
      out.push(rect(x0, y + 5, Math.max(2, x1 - x0), 10, 'f-gray', ' rx="3" opacity="0.55"'));
      out.push(rect(x1, y + 2, Math.max(3, x2 - x1), 16, 'f-orange', ' rx="3"'));
      out.push(rect(x2, y + 5, Math.max(2, x3 - x2), 10, 'f-steel', ' rx="3" opacity="0.8"'));
      out.push('</g>');
    });
    if (state.today >= start && state.today <= end) {
      var tx = x(state.today);
      out.push(line(tx, TOP - 14, tx, H - 8, 'today-line'));
      out.push(text(tx + 4, H - 1, '기준일', 'axis'));
    }
    out.push('</svg>');
    return '<div class="tb-scroll">' + out.join('') + '</div>';
  }

  function detailPanel(view) {
    var p = state.selectedProject ? M.findProject(view, state.selectedProject) : null;
    if (!p) {
      return '<div class="tb-card">' + emptyBox('왼쪽에서 프로젝트 카드를 선택하면 배정 · 마일스톤 · 정산 요약이 보입니다.') + '</div>';
    }
    var o = M.projectOutput(view, p.id);
    var b = M.burnRate(view, p.id);
    var assigns = view.assignments.filter(function (a) { return a.projectId === p.id; });
    var miles = view.milestones.filter(function (m) { return m.projectId === p.id; })
      .sort(function (a, c) { return String(a.due).localeCompare(String(c.due)); });

    var mileRows = miles.map(function (m) {
      var st = M.milestoneStatus(m, state.today);
      var cls = st === '완료' ? 'badge-done' : (st === '지연' ? 'badge-late' : 'badge-neutral');
      var mk = keyStrOf('milestones', m);
      // 5턴: 마일스톤 아래 업무 블럭(세부 항목) 펼침
      var ik = itemsKey(p.id, m.name);
      var msItems = (state.data.items || []).filter(function (it) { return it.projectId === p.id && str(it.milestone) === str(m.name); });
      var nc = S.noteCounts(state.data.notes, { projectId: p.id, milestone: m.name });
      var open = !!state.itemsOpen[ik];
      // 삭제 불가 사유(세부 항목이 있음)는 버튼 자리가 아니라 행 아래 한 줄로 — 이름 칸이 눌리지 않게
      var del = deleteButton('milestones', m, '삭제', 'btn btn-ghost btn-sm');
      var delBlocked = del.indexOf('data-delete-blocked') >= 0;
      var li = '<li><span class="grow">' + esc(m.name) + '<br><span class="cap num">' + esc(m.due) +
        (m.owner ? ' · ' + esc(m.owner) : '') + '</span><br>' +
        '<button type="button" class="tb-link tb-items-toggle" data-action="toggle-items" data-key="' + esc(ik) + '" aria-expanded="' + (open ? 'true' : 'false') +
        '" title="이 마일스톤의 업무 블럭(세부 항목)을 펼치거나 접습니다">' + (open ? '▾' : '▸') + ' 블럭 ' + msItems.length +
        (nc.open ? ' · 미해결 ' + nc.open : '') + '</button></span>' +
        '<span class="badge ' + cls + '">' + esc(st) + '</span>' +
        '<span class="tb-row-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="milestones" data-mode="edit" data-key="' + esc(mk) + '"' + (state.saving ? ' disabled' : '') + '>수정</button>' +
        (delBlocked ? '' : del) +
        '</span>' +
        (delBlocked ? '<span class="tb-blocked-line">' + del + '</span>' : '') +
        '</li>';
      if (open) { li += '<li class="tb-items-row" data-items="' + esc(ik) + '">' + itemsBlock(p, m, msItems) + '</li>'; }
      return li;
    }).join('');

    var assignRows = assigns.map(function (a) {
      return '<li><span class="grow">' + esc(a.member) + ' <span class="cap">' + esc(a.role) + '</span><br>' +
        '<span class="cap num">' + esc(a.start) + ' ~ ' + esc(a.end) + '</span></span>' +
        '<span class="num">' + esc(fmtMd(Number(a.plannedMd))) + '</span></li>';
    }).join('');

    // 3.1 m-7: 템플릿 항목이 전부 이미 있으면 "표준 마일스톤 생성" 버튼을 숨긴다
    var canCreate = M.standardMilestones(p, (view.settings && view.settings.milestoneTemplate) || [], assigns, miles).created.length > 0;

    return '<div class="tb-card">' +
      '<h4>' + esc(p.name) + '</h4>' +
      '<div class="cap">' + esc(p.client || '발주처 미기재') + ' · ' + esc(p.type || '') + ' · <span class="num">' + esc(p.id) + '</span></div>' +
      '<div style="margin-top:8px">' + statusBadge(p.status) + '</div>' +
      '<div class="tb-toolbar" style="margin-top:8px">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="open-form" data-table="projects" data-mode="edit" data-key="' + esc(p.id) + '"' + (state.saving ? ' disabled' : '') + '>프로젝트 수정</button>' +
      deleteButton('projects', p, '프로젝트 삭제', 'btn btn-ghost btn-sm') +
      '</div>' +
      rollupCard(p) +
      '<div class="d-section"><h5>기본</h5><dl class="tb-kv">' +
      '<dt>담당 책임자</dt><dd>' + esc(p.pm || '—') + '</dd>' +
      '<dt>행사</dt><dd>' + esc(p.eventStart) + ' ~ ' + esc(p.eventEnd) + '</dd>' +
      '<dt>장소</dt><dd>' + esc(p.venue || '—') + '</dd>' +
      '<dt>착수(예정)</dt><dd>' + esc(M.effectiveKickoff(p, view.settings) || '—') + '</dd>' +
      '<dt>정산(예정)</dt><dd>' + esc(M.effectiveSettlementDue(p, view.settings) || '—') + '</dd>' +
      '</dl></div>' +
      '<div class="d-section"><h5>배정 (' + assigns.length + ')</h5>' +
      (assignRows ? '<ul class="tb-list">' + assignRows + '</ul>' : '<div class="cap">배정된 팀원이 없습니다.</div>') +
      '<div class="cap num" style="margin-top:6px">계획 ' + fmtMd(b.plannedMd) + ' · 실투입 ' + fmtMd(b.actualMd) +
      ' · 소진율 ' + fmtPct(b.ratio, 0) + '</div></div>' +
      '<div class="d-section"><h5>마일스톤 (' + miles.length + ')</h5>' +
      (mileRows ? '<ul class="tb-list">' + mileRows + '</ul>' : '<div class="cap">마일스톤이 없습니다.</div>') +
      (canCreate
        ? '<div class="tb-toolbar">' + confirmable('create-milestones', p.id, '', '표준 마일스톤 생성', 'btn btn-secondary btn-sm') +
          '<span class="save-state" id="ms-state"></span></div>'
        : '<div class="cap" style="margin-top:6px" data-milestones-complete>표준 마일스톤이 모두 등록되어 있습니다.</div>') +
      '<div class="tb-toolbar" style="margin-top:6px">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="milestones" data-mode="new" data-project="' + esc(p.id) + '"' + (state.saving ? ' disabled' : '') + '>마일스톤 추가</button>' +
      '</div>' +
      '</div>' +
      '<div class="d-section"><div class="tb-toolbar" style="margin:0 0 6px"><h5 style="margin:0" class="grow">정산 요약</h5>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="settlements" data-mode="edit" data-key="' + esc(p.id) + '"' + (state.saving ? ' disabled' : '') + '>정산 입력</button>' +
      '</div><dl class="tb-kv">' +
      '<dt>계약금액</dt><dd>' + esc(fmtMoney(o.contractAmount)) + '</dd>' +
      '<dt>정산 매출</dt><dd>' + esc(o.realized ? fmtMoney(o.revenue) : '정산 전') + '</dd>' +
      '<dt>직접비</dt><dd>' + esc(o.directCost === null ? '미입력' : fmtMoney(o.directCost)) + '</dd>' +
      '<dt>실마진(직접비 차감)</dt><dd>' + esc(o.margin === null ? '—' : fmtMoney(o.margin)) + (o.marginRate === null ? '' : ' (' + fmtPct(o.marginRate) + ')') + '</dd>' +
      '<dt>쇼업률(참석 ÷ 사전 등록)</dt><dd>' + fmtPct(o.showUpRate) + '</dd>' +
      '<dt>게런티 달성률</dt><dd>' + fmtPct(o.guaranteeRate) + '</dd>' +
      '</dl></div>' +
      '</div>';
  }

  /* ---- 5턴: A 상세 — 계획 공수 합계 카드 · 파트 필터 칩 · 세부 항목 · 주석 스레드 · 블럭 추가 창 ---- */

  /** 계획 공수 합계 카드(D12: M/D 저장 · M/M 환산 표시) + 파트 필터 칩 */
  function rollupCard(p) {
    var r = S.itemRollup(state.data, p.id, state.data.settings);
    var roles = rolesList();
    function kv(obj) {
      var ks = Object.keys(obj);
      return ks.length
        ? ks.map(function (k) { return '<span>' + esc(k) + ' <strong class="num">' + fmtMd(obj[k]) + '</strong></span>'; }).join('')
        : '<span class="cap">—</span>';
    }
    var chips = [''].concat(roles).map(function (name) {
      return '<button type="button" class="tb-chip' + (state.part === name ? ' is-on' : '') + '" data-action="part-filter" data-part="' + esc(name) +
        '" title="' + esc(name ? name + ' 파트의 세부 항목·미해결 질문만 봅니다' : '모든 파트를 봅니다') + '">' + esc(name || '전체') + '</button>';
    }).join('');
    return '<div class="d-section tb-rollup" data-rollup="' + esc(p.id) + '">' +
      '<h5>계획 공수 합계 <span class="cap">(세부 항목 ' + r.count + '건)</span></h5>' +
      '<div class="r-total"><span class="num" data-rollup-total>' + fmtMd(r.totalMd) + ' M/D</span> ' +
      '<span class="cap">= <span class="num" data-rollup-mm>' + r.mm.toFixed(2) + ' M/M</span> (월 가용 ' + fmtMd(r.capacityMd) + ' M/D 기준)</span></div>' +
      '<div class="r-row"><span class="cap">파트별</span>' + kv(r.byPart) + '</div>' +
      '<div class="r-row"><span class="cap">담당별</span>' + kv(r.byMember) +
      (r.unassignedMd ? '<span class="badge badge-warn" data-rollup-unassigned>담당 없음 ' + fmtMd(r.unassignedMd) + '</span>' : '') + '</div>' +
      '<div class="r-row"><span class="cap">파트 필터</span><span class="tb-chips tb-part-chips" data-part-filter>' + chips + '</span></div>' +
      '</div>';
  }

  function noteBadge(key, nc) {
    return '<button type="button" class="badge ' + (nc.open ? 'badge-warn' : 'badge-neutral') + ' tb-note-badge" data-action="toggle-notes" data-key="' + esc(key) +
      '" title="주석 스레드를 펼치거나 접습니다">주석 ' + nc.total + ' · 미해결 ' + nc.open + '</button>';
  }

  /** 주석 스레드 + 입력 줄. key = 세부ID 또는 'ms:<projectId>|<milestone>' */
  function notesThread(key, list, ctx) {
    var dis = state.saving ? ' disabled' : '';
    var sorted = (list || []).slice().sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
    var rows = sorted.map(function (n) {
      var resolved = str(n.resolved) === '예';
      return '<div class="tb-note' + (resolved ? ' is-resolved' : '') + '" data-note="' + esc(n.id) + '">' +
        '<div class="n-head">' + partChip(n.part) + '<span class="badge badge-info">' + esc(n.type) + '</span>' +
        '<span class="cap">' + esc(noteAuthorLabel(n)) + ' · <span class="num">' + esc(String(n.at || '').slice(0, 16)) + '</span></span>' +
        '<label class="tb-check n-resolve"><input type="checkbox" data-action="note-resolve" data-id="' + esc(n.id) + '"' + (resolved ? ' checked' : '') + dis + '> 해결</label>' +
        (isMyNote(n)
          ? '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="notes" data-mode="edit" data-key="' + esc(n.id) + '"' + dis + '>수정</button>'
          : '') +
        '</div><div class="n-content">' + esc(n.content) + '</div></div>';
    }).join('');
    var roles = rolesList();
    var partSel = ctx.itemId ? '' : '<select data-field="part" title="파트">' + optionList(roles, state.part || roles[0] || '', false) + '</select>';
    return '<div class="tb-notes" data-notes="' + esc(key) + '">' +
      (rows || '<div class="cap">아직 주석이 없습니다.</div>') +
      '<div class="tb-note-input" data-note-input="' + esc(key) + '" data-note-project="' + esc(ctx.projectId) + '" data-note-milestone="' + esc(ctx.milestone) +
      '" data-note-item="' + esc(ctx.itemId) + '" data-note-part="' + esc(ctx.part) + '">' +
      '<select data-field="type" title="유형">' + optionList(S.FIXED_ENUMS.noteType, '요청', false) + '</select>' + partSel +
      '<select data-field="authorName" title="작성자 이름(선택)">' + optionList(memberOptions(''), '', true, '이름(선택)') + '</select>' +
      '<input type="text" data-field="content" placeholder="내용 — 판단 근거 · 요청 · 질문 · 결정" maxlength="500"' + dis + '>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="note-add" data-key="' + esc(key) + '"' + dis + '>남기기</button>' +
      '</div></div>';
  }

  /** 세부 항목 한 줄(상세 패널 폭에 맞춰 2줄 구성: 파트·블럭·담당·M/D / 임팩트·난이도·예정일·상태·주석·수정·삭제) */
  function itemRow(p, m, it) {
    var dis = state.saving ? ' disabled' : '';
    var key = str(it.id);
    var owner = str(it.owner);
    var due = str(it.due);
    var nc = S.noteCounts(state.data.notes, { itemId: key });
    var stCls = it.status === '완료' ? 'badge-done' : (it.status === '진행' ? 'badge-active' : 'badge-neutral');
    var itemNotes = (state.data.notes || []).filter(function (n) { return str(n.itemId) === key; });
    return '<div class="tb-item' + (S.isKeyItem(it) && !owner ? ' is-key-unassigned' : '') + '" data-item-row="' + esc(key) + '" data-item-part="' + esc(it.part) + '">' +
      '<div class="i-line">' + partChip(it.part) + '<strong class="i-block">' + esc(it.block) + '</strong>' +
      (owner ? '<span class="cap i-owner">' + esc(owner) + '</span>' : '<span class="badge badge-warn i-owner">담당 없음</span>') +
      '<span class="num i-md">' + fmtMd(Number(it.plannedMd)) + ' M/D</span></div>' +
      '<div class="i-line"><span class="cap">임팩트</span>' + levelChip(it.impact) + '<span class="cap">난이도</span>' + levelChip(it.difficulty) +
      '<span class="cap num' + (due ? '' : ' is-dim') + '" title="' + (due ? '예정일' : '예정일이 비어 마일스톤 예정일을 따릅니다') + '">' + esc(due || m.due || '—') + '</span>' +
      '<span class="badge ' + stCls + '">' + esc(it.status || '예정') + '</span>' +
      noteBadge(key, nc) +
      '<span class="tb-row-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="items" data-mode="edit" data-key="' + esc(key) + '"' + dis + '>수정</button>' +
      deleteButton('items', it, '삭제', 'btn btn-ghost btn-sm') +
      '</span></div>' +
      (state.notesOpen[key] ? notesThread(key, itemNotes, { projectId: p.id, milestone: m.name, itemId: key, part: it.part }) : '') +
      '</div>';
  }

  /** 카탈로그에서 블럭 고르기(체크 칩). 이미 있는 블럭은 ✓ 비활성, 주최형 프로젝트는 skipForHost 블럭 제외 */
  function blockPickerCard(p, m, msItems) {
    var bp = state.blockPicker;
    var roles = rolesList();
    var part = bp.part || roles[0] || '';
    var host = isHostProject(p);
    var have = {};
    msItems.forEach(function (it) { have[str(it.block)] = true; });
    var cat = (state.data.blocks || []).filter(function (b) { return str(b.part) === part && !(host && b.skipForHost); });
    var n = Object.keys(bp.checked || {}).filter(function (k) { return bp.checked[k]; }).length;
    var chips = cat.map(function (b) {
      var has = !!have[str(b.block)];
      var on = !!bp.checked[str(b.block)];
      return '<button type="button" class="tb-block-chip' + (has ? ' is-has' : (on ? ' is-on' : '')) + '" data-action="block-toggle" data-block="' + esc(b.block) + '"' +
        ((has || state.saving) ? ' disabled' : '') + ' title="' + esc(has ? '이미 이 마일스톤에 있는 블럭입니다' : '판단에 필요한 내용: ' + (b.judge || '—')) + '">' +
        (has ? '✓ ' : (on ? '☑ ' : '☐ ')) + esc(b.block) + ' <span class="chip-role">기본 ' + fmtMd(Number(b.md)) + ' M/D · 임팩트 ' + esc(b.impact || '중') + ' · 난이도 ' + esc(b.difficulty || '중') + '</span></button>';
    }).join('');
    return '<div class="tb-block-picker" data-block-picker="' + esc(itemsKey(p.id, m.name)) + '">' +
      '<div class="tb-toolbar" style="margin:0"><label class="tb-field"><span>파트</span><select id="block-part"' + (state.saving ? ' disabled' : '') + '>' + optionList(roles, part, false) + '</select></label>' +
      '<span class="cap">' + (host ? '주최형 프로젝트라 발주처가 필요한 블럭은 제외합니다. ' : '') + '체크한 블럭이 기본 M/D·임팩트·난이도로 추가되고, "판단에 필요한 내용"이 첫 주석(요청)으로 남습니다.</span></div>' +
      '<div class="tb-chips">' + (chips || '<span class="cap">이 파트의 카탈로그 블럭이 없습니다. 시트의 [업무블럭] 탭에서 추가하세요.</span>') + '</div>' +
      '<div class="tb-toolbar">' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="block-add"' + ((n && !state.saving) ? '' : ' disabled') + '>추가 <span class="num" id="block-add-count">' + n + '</span>건</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="block-cancel"' + (state.saving ? ' disabled' : '') + '>취소</button>' +
      '</div></div>';
  }

  /** 펼친 마일스톤의 세부 항목 묶음 — 마일스톤 주석 줄 · 항목들 · [블럭 추가]/[직접 추가] · 블럭 추가 창 */
  function itemsBlock(p, m, msItems) {
    var dis = state.saving ? ' disabled' : '';
    var ik = itemsKey(p.id, m.name);
    var shown = state.part ? msItems.filter(function (it) { return str(it.part) === state.part; }) : msItems;
    var msNotes = (state.data.notes || []).filter(function (n) { return n.projectId === p.id && str(n.milestone) === str(m.name) && !str(n.itemId); });
    var msKey = 'ms:' + ik;
    var msCounts = { total: msNotes.length, open: msNotes.filter(function (n) { return str(n.resolved) !== '예'; }).length };
    var sub = 0;
    msItems.forEach(function (it) { var v = Number(it.plannedMd); if (isFinite(v)) { sub += v; } });
    var out = '<div class="tb-items" data-items-block="' + esc(ik) + '">';
    out += '<div class="tb-item tb-item-ms"><div class="i-line"><span class="cap">마일스톤 주석</span>' + noteBadge(msKey, msCounts) + '</div>' +
      (state.notesOpen[msKey] ? notesThread(msKey, msNotes, { projectId: p.id, milestone: m.name, itemId: '', part: '' }) : '') + '</div>';
    out += shown.map(function (it) { return itemRow(p, m, it); }).join('');
    if (!shown.length) {
      out += '<div class="cap" style="padding:6px 0">' + esc(msItems.length
        ? '파트 "' + state.part + '" 항목이 없습니다. 파트 필터를 "전체"로 바꾸면 ' + msItems.length + '건이 보입니다.'
        : '세부 항목이 없습니다. [블럭 추가]로 카탈로그에서 골라 넣으세요.') + '</div>';
    }
    out += '<div class="tb-toolbar" style="margin-top:6px">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="block-picker" data-key="' + esc(ik) + '" data-milestone="' + esc(m.name) + '"' + dis + '>블럭 추가</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="items" data-mode="new" data-project="' + esc(p.id) + '" data-milestone="' + esc(m.name) + '"' + dis + '>직접 추가</button>' +
      '<span class="cap num">소계 ' + fmtMd(sub) + ' M/D</span></div>';
    var bp = state.blockPicker;
    if (bp && bp.projectId === p.id && str(bp.milestone) === str(m.name)) { out += blockPickerCard(p, m, msItems); }
    out += '</div>';
    return out;
  }

  /* ================================================================
   * 7. 화면 B — 배정 보드
   * ================================================================ */

  function renderScreenB(view) {
    var host = el('screen-B');
    var months = heatMonths();
    var all = state.data;                 // 3.1 M-3: 히트맵·셀 배정 목록은 필터와 무관하게 전체 기준
    var coreMembers = activeMembers(all);
    // "배정된 팀원만 보기": 앞으로 6개월 안에 계획 공수가 있는 팀원만 남긴다(명단이 길 때 보기 편하게)
    var plannedAny = {};
    months.forEach(function (mk) {
      M.plannedUtilization(all, mk).forEach(function (r) { if (r.plannedMd > 0) { plannedAny[r.member] = true; } });
    });
    var members = state.heatOnlyAssigned
      ? coreMembers.filter(function (m) { return plannedAny[m.name]; })
      : coreMembers;

    // 필터로 편집 대상이 사라졌으면 첫 프로젝트로 되돌린다
    var inView = view.projects.some(function (p) { return p.id === state.editProject; });
    if (!inView) {
      if (view.projects.length) { loadEditRows(view.projects[0].id); }
      else { state.editProject = ''; state.editRows = []; }
    }

    var heat = members.length
      ? heatmapChart(all, members, months)
      : emptyBox(coreMembers.length
        ? '앞으로 6개월 안에 배정된 팀원이 없습니다. "배정된 팀원만 보기"를 끄면 전체 팀원이 보입니다.'
        : '팀원 명단이 비어 있습니다. 시트의 [팀원] 탭을 먼저 채우세요.');

    var cellPanel = '';
    if (state.selectedCell) {
      var c = state.selectedCell;
      var rows = all.assignments.filter(function (a) {
        return a.member === c.member && (M.allocateByMonth(a)[c.month] || 0) > 0;
      });
      var list = rows.map(function (a) {
        var alloc = M.allocateByMonth(a)[c.month] || 0;
        return '<li><span class="grow"><button type="button" class="tb-link" data-goto="A" data-project="' + esc(a.projectId) + '">' +
          esc(projectName(a.projectId)) + '</button> <span class="cap">' + esc(a.role) + '</span><br>' +
          '<span class="cap num">' + esc(a.start) + ' ~ ' + esc(a.end) + ' · 전체 계획 ' + fmtMd(Number(a.plannedMd)) + '</span></span>' +
          '<span class="num">' + fmtMd(alloc) + '</span></li>';
      }).join('');
      cellPanel = '<div class="tb-card"><h3>' + esc(c.member) + ' · ' + esc(fmtMonthFull(c.month)) + ' 배정</h3>' +
        (list ? '<ul class="tb-list">' + list + '</ul>' : '<div class="cap">이 달에 배정된 프로젝트가 없습니다.</div>') + '</div>';
    }

    host.innerHTML =
      '<div class="tb-card"><h3>가동률 히트맵</h3>' +
      '<label class="tb-check"><input type="checkbox" id="heat-only-assigned"' + (state.heatOnlyAssigned ? ' checked' : '') +
      '> 배정된 팀원만 보기 <span class="cap">(' + members.length + ' / ' + coreMembers.length + '명 · 상태 "지원"·"퇴사"는 제외)</span></label>' +
      '<div class="tb-card-desc">기준일이 속한 달부터 6개월. 칸의 숫자는 계획 공수 / 월 가용 공수입니다. 칸을 누르면 아래에 배정 목록이 열립니다. 가동률은 필터와 무관하게 전체 프로젝트 기준입니다.</div>' +
      heat +
      '<div class="legend" style="margin-top:10px">' +
      '<span><i class="swatch" style="background:var(--positive-bg)"></i>여유</span>' +
      '<span><i class="swatch" style="background:var(--amber-bg)"></i>주의(85% 이상)</span>' +
      '<span><i class="swatch" style="background:var(--negative-bg)"></i>과부하(100% 초과)</span>' +
      '</div></div>' +
      cellPanel +
      memberAdminCard() +
      assignEditor(view);
  }

  function heatmapChart(view, members, months) {
    var W = 1000, L = 110, TOP = 28, CW = Math.max(96, (W - L - 10) / months.length), RH = 46;
    var H = TOP + members.length * RH + 8;
    var byMonth = {};
    months.forEach(function (mk) {
      var map = {};
      M.plannedUtilization(view, mk).forEach(function (r) { map[r.member] = r; });
      byMonth[mk] = map;
    });
    var out = [svgOpen(W, H, 'heatmap')];
    months.forEach(function (mk, j) {
      out.push(text(L + j * CW + CW / 2, TOP - 10, fmtMonthFull(mk), 'axis', 'middle'));
    });
    members.forEach(function (m, i) {
      var y = TOP + i * RH;
      out.push(text(6, y + 26, clip(m.name, 8), 'strong'));
      months.forEach(function (mk, j) {
        var r = byMonth[mk][m.name];
        if (!r) { return; }
        var x0 = L + j * CW;
        var sel = state.selectedCell && state.selectedCell.member === m.name && state.selectedCell.month === mk;
        out.push('<g class="hit" data-cell="' + esc(m.name + '|' + mk) + '" data-level="' + r.level + '">');
        out.push(rect(x0 + 3, y + 3, CW - 8, RH - 10, 'cell', ' rx="8"' + (sel ? ' stroke-width="2.5"' : '')));
        out.push(text(x0 + CW / 2, y + 22, fmtMd(r.plannedMd) + ' / ' + fmtMd(r.capacityMd), 'cell-md', 'middle'));
        out.push(text(x0 + CW / 2, y + 35, fmtPct(r.ratio, 0), 'axis', 'middle'));
        out.push('</g>');
      });
    });
    out.push('</svg>');
    return '<div class="tb-scroll">' + out.join('') + '</div>';
  }

  function assignEditor(view) {
    var s = state.data.settings || {};
    var projOpts = (view.projects || []).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === state.editProject ? ' selected' : '') + '>' +
        esc(p.name) + ' (' + esc(p.status) + ')</option>';
    }).join('');
    if (!projOpts) {
      return '<div class="tb-card"><h3>배정 편집</h3>' + emptyBox('편집할 프로젝트가 없습니다. 필터를 넓혀 보세요.') + '</div>';
    }

    function sel(list, value, field, i, dis) {
      return '<select data-row="' + i + '" data-field="' + field + '"' + (dis || '') + '>' +
        '<option value="">선택</option>' +
        (list || []).map(function (v) {
          return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(v) + '</option>';
        }).join('') + '</select>';
    }
    // 5턴: 세부 항목 합계와 같은 (담당, 파트)의 수동 행 — 자동 행이 생기지 않았음을 배지로 알린다
    var ovMap = {};
    overlapsFor(state.editProject).forEach(function (o) { ovMap[o.member + '|' + o.role] = o; });

    // 칩에는 지원 인력도 포함(배정은 가능). 팀원을 앞에, 지원 인력을 뒤에
    var activeList = (state.data.members || []).filter(function (m) { return m.status !== '퇴사'; })
      .sort(function (a, b) { return (a.status === '지원' ? 1 : 0) - (b.status === '지원' ? 1 : 0); });
    var memberNames = activeList.map(function (m) { return m.name; });

    // 팀원 빠른 배정 칩 — 이름을 누르면 행이 추가된다(역할 = 주역할, 기간 = 착수일~행사 종료일). 이미 행이 있는 팀원은 ✓ 표시
    var assignedNow = {};
    state.editRows.forEach(function (r) { if (r.member) { assignedNow[r.member] = true; } });
    var chips = activeList.map(function (m) {
      var on = !!assignedNow[m.name];
      return '<button type="button" class="tb-chip' + (on ? ' is-on' : '') + '" data-action="quick-add-member" data-member="' + esc(m.name) + '"' +
        ((on || state.saving) ? ' disabled' : '') +
        ' title="' + esc(on ? '이미 배정 행이 있습니다. 표에서 수정하세요.' : '누르면 ' + m.name + ' 행이 아래 표에 추가됩니다') + '">' +
        (on ? '✓ ' : '+ ') + esc(m.name) + ' <span class="chip-role">' + esc(m.role || '') + (m.status === '지원' ? ' · 지원' : '') + '</span></button>';
    }).join('');
    var quick = '<div class="tb-quick"><div class="cap">팀원 빠른 배정 — 이름을 누르면 아래 표에 행이 추가됩니다(역할은 주역할, 기간은 착수(예정)일 ~ 행사 종료일로 미리 채움). 계획 공수를 적고 저장하세요. 역할·기간은 표에서 바꿀 수 있습니다.</div>' +
      '<div class="tb-chips">' + (chips || '<span class="cap">재직 팀원이 없습니다.</span>') + '</div></div>';

    var rows = state.editRows.map(function (r, i) {
      // 5턴: 자동 행(비고 = 자동(세부항목))은 잠금 — 세부 항목에서 바꾼다. 저장 시 그대로 포함해 보낸다(서버가 재동기화)
      var auto = str(r.note) === S.AUTO_ASSIGN_NOTE;
      var dis = auto ? ' disabled' : '';
      var ov = ovMap[r.member + '|' + r.role];
      return '<tr class="tb-edit-row' + (auto ? ' is-auto' : '') + '"' + (auto ? ' data-auto-row="' + i + '"' : '') + '>' +
        '<td>' + (auto ? '<span class="badge badge-neutral tb-auto-badge" title="세부 항목 합계로 만든 행입니다">자동</span> ' : '') + sel(memberNames, r.member, 'member', i, dis) + '</td>' +
        '<td>' + sel(s.roles, r.role, 'role', i, dis) + '</td>' +
        '<td><input type="number" step="0.5" min="0" data-row="' + i + '" data-field="plannedMd" value="' + esc(r.plannedMd) + '"' + dis + '></td>' +
        '<td><input type="date" data-row="' + i + '" data-field="start" value="' + esc(r.start) + '"' + dis + '></td>' +
        '<td><input type="date" data-row="' + i + '" data-field="end" value="' + esc(r.end) + '"' + dis + '></td>' +
        '<td>' + sel(['예정', '진행', '종료'], r.status || '예정', 'status', i, dis) + '</td>' +
        '<td><input type="text" data-row="' + i + '" data-field="note" value="' + esc(r.note) + '"' + dis + '>' +
        (ov ? '<span class="tb-overlap" data-overlap="' + esc(r.member + '|' + r.role) + '">세부 합계 ' + fmtMd(Number(ov.itemsMd)) + ' M/D · 수동 ' + fmtMd(Number(ov.manualMd)) + ' M/D — 수동 행을 지우면 자동으로 바뀜</span>' : '') +
        '</td>' +
        '<td>' + (auto
          ? '<span class="cap tb-auto-note">세부 항목에서 바꿉니다</span>'
          : '<button type="button" class="btn btn-ghost btn-sm" data-action="remove-row" data-index="' + i + '">삭제</button>') + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="tb-card"><h3>배정 편집</h3>' +
      '<div class="tb-card-desc">저장을 누르면 시트의 [배정] 탭에서 이 프로젝트의 행이 통째로 교체됩니다. 다른 프로젝트 행은 그대로 남습니다. 회색 "자동" 행은 세부 항목(업무 블럭)의 계획 M/D 합계로 만들어지며 여기서는 고칠 수 없습니다 — A 화면 상세에서 세부 항목을 바꾸세요.</div>' +
      '<div class="tb-toolbar"><label class="tb-field"><span>프로젝트</span>' +
      '<select id="assign-project">' + projOpts + '</select></label></div>' +
      quick +
      '<div class="tb-scroll" style="margin-top:10px">' +
      '<table class="tb-table"><thead><tr>' +
      '<th style="min-width:120px">팀원</th><th style="min-width:120px">역할</th><th style="min-width:90px">계획 공수</th>' +
      '<th style="min-width:140px">시작</th><th style="min-width:140px">종료</th><th style="min-width:90px">상태</th>' +
      '<th style="min-width:140px">비고</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8" class="cap">배정 행이 없습니다. [행 추가]를 눌러 시작하세요.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="tb-toolbar">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="add-row"' + (state.saving ? ' disabled' : '') + '>행 추가</button>' +
      '<button type="button" class="btn btn-primary" data-action="save-assignments"' + (state.saving ? ' disabled' : '') + '>' +
      (state.saving ? '저장 중…' : '저장') + '</button>' +
      '<span class="save-state" id="save-state">' + (state.saving ? '저장 중…' : '') + '</span>' +
      '</div></div>';
  }

  function loadEditRows(projectId) {
    state.editProject = projectId;
    state.editRows = (state.data.assignments || [])
      .filter(function (a) { return a.projectId === projectId; })
      .map(function (a) {
        return {
          id: a.id || '', member: a.member || '', role: a.role || '',
          plannedMd: (a.plannedMd === null || a.plannedMd === undefined) ? '' : a.plannedMd,
          start: a.start || '', end: a.end || '', status: a.status || '예정', note: a.note || ''
        };
      });
  }

  /* ================================================================
   * 8. 화면 C — 공수 관리(계획 대 실투입)
   * ================================================================ */

  function renderScreenC(view) {
    var host = el('screen-C');
    var month = M.monthKey(state.today);
    host.innerHTML =
      effortEditor() +
      '<div class="tb-card"><h3>프로젝트별 계획 대 실투입</h3>' +
      '<div class="tb-card-desc">막대를 누르면 아래에 그 프로젝트의 주차별 투입 추이가 열립니다.</div>' +
      burnChart(view) + '</div>' +
      burnDetail(view) +
      '<div class="tb-card"><h3>팀원별 이달 투입 구성</h3>' +
      '<div class="tb-card-desc">' + esc(fmtMonthFull(month)) + ' 공수기록 기준. 휴가는 제외했습니다. 막대 길이는 이달 최다 투입 팀원을 100% 로 한 상대값입니다. 필터와 무관하게 전체 기준입니다.</div>' +
      stackChart(state.data, month) + '</div>' +
      '<div class="tb-card"><h3>주간 기록 현황</h3>' +
      '<div class="tb-card-desc">최근 8주. 빈 칸은 그 주에 기록이 없다는 뜻입니다. "기준" 표시 열이 미기록 판정 기준 주차(지난주)입니다. 칸을 누르면 위 공수 입력 카드가 그 팀원·주차로 열립니다. 필터와 무관하게 전체 기준입니다.</div>' +
      weeklyChart(state.data) + '</div>';
  }

  function burnChart(view) {
    var rows = view.projects.map(function (p) {
      var b = M.burnRate(view, p.id);
      return { p: p, b: b };
    }).filter(function (r) { return r.b.plannedMd > 0 || r.b.actualMd > 0; })
      .sort(function (a, b) { return b.b.plannedMd - a.b.plannedMd; });
    if (!rows.length) { return emptyBox('계획 또는 실투입 기록이 있는 프로젝트가 없습니다.'); }

    var W = 1000, L = 180, R = 120, TOP = 26, RH = 44;
    var cw = W - L - R;
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.b.plannedMd, r.b.actualMd); }));
    max = Math.max(max, 1);
    var H = TOP + rows.length * RH + 10;
    var out = [svgOpen(W, H, 'burn')];
    out.push(text(L, TOP - 12, '계획(위) · 실투입(아래) 공수', 'axis'));
    rows.forEach(function (r, i) {
      var y = TOP + i * RH;
      var wp = (r.b.plannedMd / max) * cw;
      var wa = (r.b.actualMd / max) * cw;
      var sel = state.burnProject === r.p.id;
      out.push('<g class="hit" data-burn="' + esc(r.p.id) + '">');
      out.push(text(6, y + 16, clip(r.p.name, 14), sel ? 'strong' : ''));
      out.push(rect(L, y + 2, cw, 14, 'f-track', ' rx="7"'));
      out.push(rect(L, y + 2, wp, 14, 'f-gray', ' rx="7"'));
      out.push(rect(L, y + 20, cw, 14, 'f-track', ' rx="7"'));
      out.push(rect(L, y + 20, wa, 14, 'f-orange', ' rx="7"'));
      out.push(text(W - R + 8, y + 14, fmtMd(r.b.plannedMd) + ' / ' + fmtMd(r.b.actualMd), 'axis'));
      out.push(text(W - R + 8, y + 30, '소진 ' + fmtPct(r.b.ratio, 0), (r.b.ratio !== null && r.b.ratio > 1) ? 'strong' : 'axis'));
      out.push('</g>');
    });
    out.push('</svg>');
    return '<div class="tb-scroll">' + out.join('') + '</div>';
  }

  function burnDetail(view) {
    if (!state.burnProject) { return ''; }
    var pid = state.burnProject;
    var logs = (view.effortLogs || []).filter(function (l) { return l.projectId === pid; });
    var byWeek = {};
    logs.forEach(function (l) {
      var w = M.mondayOf(l.week);
      byWeek[w] = (byWeek[w] || 0) + Number(l.md || 0);
    });
    var weeks = Object.keys(byWeek).sort();
    var title = '<h3>' + esc(projectName(pid)) + ' · 주차별 투입 추이</h3>';
    if (!weeks.length) {
      return '<div class="tb-card">' + title + emptyBox('이 프로젝트에는 아직 공수기록이 없습니다.') + '</div>';
    }
    var W = 1000, L = 40, B = 34, TOP = 16, H = 190;
    var cw = (W - L - 20) / weeks.length;
    var max = Math.max.apply(null, weeks.map(function (w) { return byWeek[w]; }));
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="xMinYMin meet">'];
    out.push(line(L, H - B, W - 10, H - B, 'axis-line'));
    weeks.forEach(function (w, i) {
      var h = (byWeek[w] / max) * (H - B - TOP - 14);
      var x0 = L + i * cw + cw * 0.2;
      out.push(rect(x0, H - B - h, cw * 0.6, h, 'f-orange', ' rx="3"'));
      out.push(text(x0 + cw * 0.3, H - B - h - 4, fmtMd(byWeek[w]), 'axis', 'middle'));
      out.push(text(x0 + cw * 0.3, H - B + 14, w.slice(5), 'axis', 'middle'));
    });
    out.push(text(4, TOP + 4, '공수', 'axis'));
    out.push('</svg>');
    return '<div class="tb-card">' + title + '<div class="tb-scroll">' + out.join('') + '</div></div>';
  }

  function stackChart(view, month) {
    var members = activeMembers(view);
    if (!members.length) { return emptyBox('팀원 명단이 비어 있습니다.'); }
    var data = members.map(function (m) {
      var bd = M.memberMonthBreakdown(view, m.name, month);
      var keys = Object.keys(bd);
      var total = keys.reduce(function (s, k) { return s + bd[k]; }, 0);
      return { name: m.name, bd: bd, keys: keys, total: total };
    });
    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.total; })));
    if (max <= 1 && data.every(function (d) { return d.total === 0; })) {
      return emptyBox(fmtMonthFull(month) + ' 공수기록이 아직 없습니다.');
    }

    var codes = {};
    data.forEach(function (d) { d.keys.forEach(function (k) { codes[k] = true; }); });
    var codeList = Object.keys(codes);
    var colorOf = {};
    codeList.forEach(function (c, i) { colorOf[c] = seriesClass(i); });

    var W = 1000, L = 110, R = 90, TOP = 14, RH = 30;
    var cw = W - L - R;
    var H = TOP + data.length * RH + 10;
    var out = [svgOpen(W, H, 'stack')];
    data.forEach(function (d, i) {
      var y = TOP + i * RH;
      out.push(text(6, y + 16, clip(d.name, 8), 'strong'));
      out.push(rect(L, y + 4, cw, 16, 'f-track', ' rx="8"'));
      var x0 = L;
      d.keys.forEach(function (k) {
        var w = (d.bd[k] / max) * cw;
        out.push('<g><title>' + esc(codeLabel(k) + ' ' + fmtMd(d.bd[k])) + '</title>' +
          rect(x0, y + 4, w, 16, colorOf[k], '') + '</g>');
        x0 += w;
      });
      out.push(text(W - R + 8, y + 16, fmtMd(d.total) + ' 공수', 'axis'));
    });
    out.push('</svg>');
    var legend = codeList.map(function (c, i) {
      return '<span><i class="swatch" style="background:var(--s' + ((i % 5) + 1) + ')"></i>' + esc(clip(codeLabel(c), 16)) + '</span>';
    }).join('');
    return '<div class="tb-scroll">' + out.join('') + '</div><div class="legend" style="margin-top:8px">' + legend + '</div>';
  }

  function weeklyChart(view) {
    var members = activeMembers(view);
    if (!members.length) { return emptyBox('팀원 명단이 비어 있습니다.'); }
    var R = M.baseWeek(view, state.today);            // 미기록 판정 기준 주차(지난주 월요일)
    var cur = M.mondayOf(state.today);                 // 이번 주 월요일까지 8주를 보인다
    var weeks = [];
    for (var i = 7; i >= 0; i--) { weeks.push(M.addDays(cur, -7 * i)); }

    var got = {};
    (view.effortLogs || []).forEach(function (l) {
      var w = M.mondayOf(l.week);
      var key = l.member + '|' + w;
      got[key] = (got[key] || 0) + Number(l.md || 0);
    });

    var W = 1000, L = 110, TOP = 30, CW = (W - L - 10) / weeks.length, RH = 30;
    var H = TOP + members.length * RH + 8;
    var out = [svgOpen(W, H, 'weekly')];
    weeks.forEach(function (w, j) {
      out.push(text(L + j * CW + CW / 2, TOP - 10, w.slice(5) + (w === R ? ' 기준' : ''), w === R ? 'strong' : 'axis', 'middle'));
    });
    members.forEach(function (m, i) {
      var y = TOP + i * RH;
      out.push(text(6, y + 18, clip(m.name, 8), 'strong'));
      weeks.forEach(function (w, j) {
        var v = got[m.name + '|' + w];
        var x0 = L + j * CW;
        var isOpen = state.effort && state.effort.member === m.name && state.effort.week === w;
        out.push('<g class="hit" data-action="effort-open" data-member="' + esc(m.name) + '" data-week="' + esc(w) + '">' +
          '<title>' + esc(m.name + ' · ' + w + ' 주차 — 누르면 공수 입력이 열립니다') + '</title>');
        out.push(rect(x0 + 3, y + 4, CW - 8, RH - 12, v ? 'rec' : 'miss', ' rx="5"' + (isOpen ? ' stroke-width="2.5"' : '')));
        out.push(text(x0 + CW / 2, y + 18, v ? fmtMd(v) : '없음', 'axis', 'middle'));
        out.push('</g>');
      });
    });
    out.push('</svg>');
    return '<div class="tb-scroll">' + out.join('') + '</div>';
  }

  /* ================================================================
   * 9. 화면 D — 투입 대비 성과
   * ================================================================ */

  function renderScreenD(view) {
    var host = el('screen-D');
    host.innerHTML =
      '<div class="tb-card"><h3>투입 대비 실마진</h3>' +
      '<div class="tb-card-desc">가로축은 실투입 공수, 세로축은 실마진(직접비 차감), 원 크기는 정산 매출입니다. 정산이 끝난 프로젝트만 표시하며, 원을 누르면 프로젝트 상세로 이동합니다.</div>' +
      scatterChart(view) + '</div>' +
      '<div class="tb-card"><h3>프로젝트 성과표</h3>' +
      '<div class="tb-card-desc">마진 기준선 — 외부 노출 25% · 목표 35%. 정산 매출·실마진·공수당 매출은 정산이 끝난(완료 또는 정산 매출 입력) 프로젝트에만 표시하고, 정산 전 행은 흐리게 보입니다.</div>' +
      outputTable(view) + '</div>' +
      '<div class="tb-card"><h3>팀 월별 투입 대비 성과</h3>' +
      '<div class="tb-card-desc">막대는 팀 전체 투입 공수, 선은 그 달에 행사가 끝나는 프로젝트의 실적 매출(실선) · 예정 매출(점선) · 실마진(직접비 차감)입니다.</div>' +
      inputOutputChart(view) + '</div>';
  }

  function typeIndex(view, type) {
    var list = view.settings.types || [];
    var i = list.indexOf(type);
    return i < 0 ? 4 : i;
  }

  function scatterChart(view) {
    // 3.1 M-2: 정산이 끝난(realized) 프로젝트만 그린다. 직접비가 없어 실마진을 못 구하는 건도 원 대신 각주로만 안내
    var all = view.projects.map(function (p) {
      var o = M.projectOutput(view, p.id);
      return { p: p, o: o };
    });
    var pts = all.filter(function (r) { return r.o.realized && r.o.margin !== null; });
    var pending = all.filter(function (r) { return !r.o.realized; });
    var noCost = all.filter(function (r) { return r.o.realized && r.o.margin === null; });
    var notes = [];
    if (pending.length) {
      notes.push('정산 전 프로젝트 ' + pending.length + '건(' + pending.map(function (r) { return r.p.name; }).join(', ') + ')은 표시하지 않습니다.');
    }
    if (noCost.length) {
      notes.push('직접비 미입력 ' + noCost.length + '건(' + noCost.map(function (r) { return r.p.name; }).join(', ') + ')은 실마진을 구할 수 없어 표시하지 않습니다.');
    }
    var noteHtml = notes.length ? '<div class="cap" style="margin-top:8px" data-scatter-note>' + esc(notes.join(' ')) + '</div>' : '';
    if (!pts.length) { return emptyBox('정산이 끝난 프로젝트가 생기면 여기에 표시됩니다.') + noteHtml; }

    var W = 1000, H = 340, L = 70, B = 44, T = 36, R = 20;
    var maxX = Math.max(1, Math.max.apply(null, pts.map(function (r) { return r.o.actualMd; })));
    var vals = pts.map(function (r) { return r.o.margin === null ? 0 : r.o.margin; });
    var maxY = Math.max.apply(null, vals);
    var minY = Math.min.apply(null, vals);
    if (maxY === minY) { maxY = minY + 1; }
    if (minY > 0) { minY = 0; }
    var maxRev = Math.max(1, Math.max.apply(null, pts.map(function (r) { return r.o.revenue; })));

    function x(v) { return L + (v / (maxX * 1.15)) * (W - L - R); }
    function y(v) { return H - B - ((v - minY) / (maxY - minY)) * (H - B - T); }
    function rad(rev) { return 6 + Math.sqrt(rev / maxRev) * 22; }

    var out = [svgOpen(W, H, 'scatter')];
    for (var g = 0; g <= 4; g++) {
      var yv = minY + (maxY - minY) * g / 4;
      out.push(line(L, y(yv), W - R, y(yv), 'grid'));
      out.push(text(L - 8, y(yv) + 4, fmtMoneyAxis(yv), 'axis', 'end'));
    }
    out.push(line(L, H - B, W - R, H - B, 'axis-line'));
    out.push(text(W - R, H - 8, '실투입 공수', 'axis', 'end'));
    out.push(text(L - 8, 14, '실마진', 'axis', 'end'));
    for (var t = 0; t <= 4; t++) {
      var xv = maxX * 1.15 * t / 4;
      out.push(text(x(xv), H - B + 16, fmtMd(xv), 'axis', 'middle'));
    }
    pts.forEach(function (r) {
      var cx = x(r.o.actualMd), cy = y(r.o.margin === null ? 0 : r.o.margin);
      out.push('<g class="hit" data-project="' + esc(r.p.id) + '" data-goto="A">' +
        '<title>' + esc(r.p.name + ' · 매출 ' + fmtMoney(r.o.revenue) + ' · 실마진율 ' + fmtPct(r.o.marginRate)) + '</title>' +
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad(r.o.revenue).toFixed(1) +
        '" class="' + seriesClass(typeIndex(view, r.p.type)) + '" opacity="0.72"/>' +
        text(cx, (cy - rad(r.o.revenue) - 4 < 12 ? cy + rad(r.o.revenue) + 14 : cy - rad(r.o.revenue) - 4), clip(r.p.name, 12), 'axis', 'middle') + '</g>');
    });
    out.push('</svg>');
    var legend = (view.settings.types || []).map(function (t, i) {
      return '<span><i class="swatch" style="background:var(--s' + ((i % 5) + 1) + ')"></i>' + esc(t) + '</span>';
    }).join('');
    return '<div class="tb-scroll">' + out.join('') + '</div><div class="legend" style="margin-top:8px">' + legend + '</div>' + noteHtml;
  }

  function marginBar(rate, level) {
    if (rate === null) { return '<span class="cap">—</span>'; }
    var w = Math.max(0, Math.min(1, rate)) * 100;
    var fill = level === 'low' ? 'var(--negative)' : (level === 'mid' ? 'var(--amber)' : 'var(--positive)');
    return '<span style="display:inline-block;position:relative;width:90px;height:10px;background:var(--surface-warm);border-radius:5px;vertical-align:middle">' +
      '<span style="position:absolute;left:0;top:0;height:10px;width:' + w.toFixed(0) + '%;background:' + fill + ';border-radius:5px"></span>' +
      '<span style="position:absolute;left:25%;top:-2px;width:1px;height:14px;background:var(--steel)"></span>' +
      '<span style="position:absolute;left:35%;top:-2px;width:1px;height:14px;background:var(--steel)"></span>' +
      '</span> <span class="num">' + fmtPct(rate) + '</span>';
  }

  function outputTable(view) {
    if (!view.projects.length) { return emptyBox('조건에 맞는 프로젝트가 없습니다.'); }
    // 3.1 M-1: 계약금액은 항상, 정산 매출·실마진·공수당 매출은 정산이 끝난(realized) 행에만. 정산 전 행은 흐리게
    var rows = view.projects.map(function (p) {
      var o = M.projectOutput(view, p.id);
      var marginCell = (o.margin === null)
        ? '<span class="cap">—</span>'
        : '<span class="num">' + esc(fmtMoney(o.margin)) + '</span><br>' + marginBar(o.marginRate, o.marginLevel);
      return '<tr class="is-clickable' + (o.realized ? '' : ' is-muted') + '" data-project="' + esc(p.id) +
        '" data-goto="A" data-realized="' + (o.realized ? '1' : '0') + '">' +
        '<td>' + esc(clip(p.name, 22)) + '<br><span class="cap">' + esc(p.type || '') + '</span></td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td class="n">' + esc(fmtMoney(o.contractAmount)) + '</td>' +
        '<td class="n">' + esc(o.realized ? fmtMoney(o.revenue) : '—') + '</td>' +
        '<td>' + marginCell + '</td>' +
        '<td class="n">' + esc(fmtMd(o.actualMd)) + '</td>' +
        '<td class="n">' + esc(o.revenuePerMd === null ? '—' : fmtMoney(o.revenuePerMd)) + '</td>' +
        '<td class="n">' + fmtPct(o.showUpRate) + '</td>' +
        '<td class="n">' + fmtPct(o.guaranteeRate) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="tb-scroll"><table class="tb-table"><thead><tr>' +
      '<th>프로젝트</th><th>상태</th><th class="n">계약금액</th><th class="n">정산 매출</th><th>실마진(직접비 차감)</th>' +
      '<th class="n">실투입 공수</th><th class="n">공수당 매출</th><th class="n">쇼업률</th><th class="n">게런티 달성률</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function inputOutputChart(view) {
    var months = periodMonths();
    if (!months.length) { return emptyBox('기간 필터를 확인하세요.'); }
    var input = M.teamInputByMonth(view);
    var output = M.teamOutputByMonth(view);           // 3.1 M-1: { actualRevenue, actualMargin, plannedRevenue }
    function outVal(m, key) { return (output[m] && output[m][key]) || 0; }
    var maxMd = Math.max(1, Math.max.apply(null, months.map(function (m) { return input[m] || 0; })));
    var maxMoney = Math.max(1, Math.max.apply(null, months.map(function (m) {
      return Math.max(outVal(m, 'actualRevenue'), outVal(m, 'plannedRevenue'), outVal(m, 'actualMargin'));
    })));

    var W = 1000, H = 320, L = 70, R = 84, T = 20, B = 44;
    var cw = (W - L - R) / months.length;
    function yMd(v) { return H - B - (v / (maxMd * 1.15)) * (H - B - T); }
    function yMoney(v) { return H - B - (v / (maxMoney * 1.15)) * (H - B - T); }

    var out = [svgOpen(W, H, 'inputOutput')];
    for (var g = 0; g <= 4; g++) {
      var v = maxMd * 1.15 * g / 4;
      out.push(line(L, yMd(v), W - R, yMd(v), 'grid'));
      out.push(text(L - 8, yMd(v) + 4, fmtMd(v), 'axis', 'end'));
      out.push(text(W - R + 8, yMoney(maxMoney * 1.15 * g / 4) + 4, fmtMoneyAxis(maxMoney * 1.15 * g / 4), 'axis'));
    }
    out.push(line(L, H - B, W - R, H - B, 'axis-line'));
    out.push(text(L - 8, T - 6, '투입 공수', 'axis', 'end'));
    out.push(text(W - R + 8, T - 6, '금액', 'axis'));

    months.forEach(function (m, i) {
      var md = input[m] || 0;
      var x0 = L + i * cw + cw * 0.25;
      var h = (H - B) - yMd(md);
      out.push(rect(x0, yMd(md), cw * 0.5, h, 'f-s5', ' rx="3" opacity="0.9"'));
      out.push(text(L + i * cw + cw / 2, H - B + 16, fmtMonth(m), 'axis', 'middle'));
    });

    function pathOf(key) {
      return months.map(function (m, i) {
        return (i === 0 ? 'M' : 'L') + (L + i * cw + cw / 2).toFixed(1) + ' ' + yMoney(outVal(m, key)).toFixed(1);
      }).join(' ');
    }
    // 선 3개 — 실적 매출(실선·잉크) · 예정 매출(점선·보조색) · 실마진(실선·액센트)
    out.push('<path d="' + pathOf('plannedRevenue') + '" class="st-dash" data-series="plannedRevenue"/>');
    out.push('<path d="' + pathOf('actualRevenue') + '" class="st-ink" data-series="actualRevenue"/>');
    out.push('<path d="' + pathOf('actualMargin') + '" class="st-orange" data-series="actualMargin"/>');
    months.forEach(function (m, i) {
      var cx = L + i * cw + cw / 2;
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + yMoney(outVal(m, 'plannedRevenue')).toFixed(1) + '" r="3" class="f-muted"/>');
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + yMoney(outVal(m, 'actualRevenue')).toFixed(1) + '" r="3.5" class="f-ink"/>');
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + yMoney(outVal(m, 'actualMargin')).toFixed(1) + '" r="3.5" class="f-orange"/>');
    });
    out.push('</svg>');
    return '<div class="tb-scroll">' + out.join('') + '</div>' +
      '<div class="legend" style="margin-top:8px">' +
      '<span><i class="swatch" style="background:var(--s5)"></i>투입 공수(막대)</span>' +
      '<span><i class="swatch" style="background:var(--ink)"></i>실적 매출(실선)</span>' +
      '<span><i class="swatch" style="background:transparent;border:1px dashed var(--ink-sub)"></i>예정 매출(점선)</span>' +
      '<span><i class="swatch" style="background:var(--orange)"></i>실마진(직접비 차감)</span>' +
      '</div>' +
      '<div class="cap" style="margin-top:4px">예정 = 계약~진행 단계 계약금액(행사 종료월 기준) · 실적 = 완료 또는 정산 매출이 입력된 프로젝트 · 견적·드롭은 제외</div>';
  }

  /* ================================================================
   * 10. 화면 E — 이번 주
   * ================================================================ */

  /* 3.1 m-2 — 완료 처리·표준 마일스톤 생성 버튼의 2단계 인라인 확인(브라우저 대화상자 미사용) */
  function confirmKey(action, project, name) { return action + '|' + (project || '') + '|' + (name || ''); }
  function confirmable(action, project, name, label, cls) {
    var key = confirmKey(action, project, name);
    if (state.pendingConfirm === key) {
      return '<span class="tb-confirm" data-confirm="' + esc(key) + '">정말 처리할까요? ' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="confirm-yes" data-confirm-action="' + esc(action) +
        '" data-project="' + esc(project) + '" data-name="' + esc(name || '') + '"' + (state.saving ? ' disabled' : '') + '>확인</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="confirm-no">취소</button></span>';
    }
    return '<button type="button" class="' + cls + '" data-action="' + action + '" data-project="' + esc(project) + '"' +
      (name ? ' data-name="' + esc(name) + '"' : '') + (state.saving ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  function warnSection(key, title, badge, items, emptyMsg) {
    return '<section class="tb-card" data-warning="' + key + '">' +
      '<div class="tb-warn-head"><h3>' + esc(title) + '</h3>' +
      '<span class="badge ' + badge + '">' + items.length + '건</span></div>' +
      (items.length ? '<ul class="tb-warn-list">' + items.join('') + '</ul>' : '<div class="cap">' + esc(emptyMsg) + '</div>') +
      '</section>';
  }

  function renderScreenE(view) {
    var host = el('screen-E');
    var w = M.warnings(view, state.today);            // 프로젝트 단위 경고(2주 내·지연·미배정·계획 공수 초과) — 필터 적용
    var wAll = M.warnings(state.data, state.today);   // 사람 단위 경고(과부하·미기록) — 필터 무관, 전체 기준 (3.1 M-3)
    var limit = M.addDays(state.today, 14);

    var upcoming = (view.milestones || []).filter(function (m) {
      var st = M.milestoneStatus(m, state.today);
      return st === '예정' && m.due >= state.today && m.due <= limit;
    }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); })
      .map(function (m) {
        return '<li data-item><span class="grow"><strong>' + esc(m.name) + '</strong>' +
          '<span class="w-sub"> · ' + esc(projectName(m.projectId)) + '</span><br>' +
          '<span class="w-sub num">' + esc(m.due) + (m.owner ? ' · ' + esc(m.owner) : '') + '</span></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-goto="A" data-project="' + esc(m.projectId) + '">보기</button>' +
          confirmable('complete-milestone', m.projectId, m.name, '완료 처리', 'btn btn-secondary btn-sm') + '</li>';
      });

    var delayed = w.delayed.sort(function (a, b) { return b.daysLate - a.daysLate; }).map(function (d) {
      return '<li data-item><span class="grow"><strong>' + esc(d.name) + '</strong>' +
        '<span class="w-sub"> · ' + esc(projectName(d.projectId)) + '</span><br>' +
        '<span class="w-sub num">예정 ' + esc(d.due) + ' · ' + d.daysLate + '일 지연' + (d.owner ? ' · ' + esc(d.owner) : '') + '</span></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-goto="A" data-project="' + esc(d.projectId) + '">보기</button>' +
        confirmable('complete-milestone', d.projectId, d.name, '완료 처리', 'btn btn-secondary btn-sm') + '</li>';
    });

    var missing = wAll.missingLog.map(function (m) {
      return '<li data-item><span class="grow"><strong>' + esc(m.member) + '</strong><br>' +
        '<span class="w-sub num">기준 주차 ' + esc(m.week) + ' · 마지막 기록 ' + esc(m.lastWeek || '없음') + '</span></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="effort-open" data-member="' + esc(m.member) + '" data-week="' + esc(m.week) + '">기록 입력</button></li>';
    });

    var unassigned = w.unassigned.map(function (u) {
      return '<li data-item><span class="grow"><strong>' + esc(u.name) + '</strong>' +
        '<span class="w-sub"> · ' + esc(u.status) + '</span><br>' +
        '<span class="w-sub">배정 ' + u.assignmentCount + '행 · 담당 ' + esc(u.pm || '미정') + '</span></span>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-goto="B" data-project="' + esc(u.projectId) + '">배정하기</button></li>';
    });

    var overload = wAll.overload.map(function (o) {
      return '<li data-item><span class="grow"><strong>' + esc(o.member) + '</strong>' +
        '<span class="w-sub"> · ' + esc(fmtMonthFull(o.month)) + '</span><br>' +
        '<span class="w-sub num">계획 ' + fmtMd(o.plannedMd) + ' / 가용 ' + fmtMd(o.capacityMd) + ' · ' + fmtPct(o.ratio, 0) + '</span></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-goto="B" data-cell="' + esc(o.member + '|' + o.month) + '">히트맵 보기</button></li>';
    });

    var burn = w.burnOver.map(function (b) {
      return '<li data-item><span class="grow"><strong>' + esc(b.name) + '</strong><br>' +
        '<span class="w-sub num">소진율 ' + fmtPct(b.ratio, 0) + ' · ' + (b.severity === 'over' ? '행사 전' : '행사 종료 후') + '</span></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-goto="C" data-burn="' + esc(b.projectId) + '">투입 보기</button></li>';
    });

    // 5턴: 핵심 항목(임팩트 상 또는 난이도 상) 인데 담당이 빈 세부 항목 — 프로젝트 필터 적용
    var milestoneMap = {};
    (state.data.milestones || []).forEach(function (m) { milestoneMap[itemsKey(m.projectId, m.name)] = m; });
    var keyUnassigned = (view.items || []).filter(function (it) { return S.isKeyItem(it) && !str(it.owner); })
      .map(function (it) { return { it: it, date: S.itemDate(it, state.data.milestones) || '9999-12-31' }; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .map(function (x) {
        var it = x.it;
        var ik = itemsKey(it.projectId, it.milestone);
        return '<li data-item><span class="grow"><strong>' + esc(it.block) + '</strong>' +
          '<span class="w-sub"> · ' + esc(projectName(it.projectId)) + '</span><br>' +
          '<span class="w-sub">' + esc(it.milestone) + ' · ' + partChip(it.part) + ' · 임팩트 ' + levelChip(it.impact) + ' 난이도 ' + levelChip(it.difficulty) +
          ' · <span class="num">' + fmtMd(Number(it.plannedMd)) + ' M/D</span>' + (x.date !== '9999-12-31' ? ' · <span class="num">' + esc(x.date) + '</span>' : '') + '</span></span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="goto-item" data-project="' + esc(it.projectId) + '" data-key="' + esc(ik) + '" data-item-id="' + esc(it.id) + '">담당 정하기</button></li>';
      });

    // 5턴: 미해결 질문·요청 — 파트 필터 적용 · 최신 20건
    var itemMap = {};
    (state.data.items || []).forEach(function (it) { itemMap[str(it.id)] = it; });
    var openNotes = (view.notes || []).filter(function (n) {
      return (n.type === '질문' || n.type === '요청') && str(n.resolved) !== '예' && (!state.part || str(n.part) === state.part);
    }).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }).slice(0, 20)
      .map(function (n) {
        var it = itemMap[str(n.itemId)] || null;
        var ik = itemsKey(n.projectId, n.milestone);
        return '<li data-item><span class="grow"><span class="badge badge-info">' + esc(n.type) + '</span> <strong>' + esc(clip(n.content, 60)) + '</strong>' +
          '<span class="w-sub"> · ' + esc(projectName(n.projectId)) + '</span><br>' +
          '<span class="w-sub">' + esc(n.milestone) + (it ? ' · ' + esc(it.block) : ' · 마일스톤 전체') + ' · ' + partChip(n.part) +
          ' · ' + esc(noteAuthorLabel(n)) + ' · <span class="num">' + esc(String(n.at || '').slice(0, 16)) + '</span></span></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="goto-item" data-project="' + esc(n.projectId) + '" data-key="' + esc(ik) + '" data-item-id="' + esc(n.itemId || '') + '" data-notes="' + esc(n.itemId ? n.itemId : 'ms:' + ik) + '">보기</button></li>';
      });

    host.innerHTML =
      '<div class="tb-warn-grid">' +
      warnSection('upcoming', '2주 내 마일스톤', 'badge-active', upcoming, '앞으로 2주 안에 예정된 마일스톤이 없습니다.') +
      warnSection('delayed', '지연 마일스톤', 'badge-late', delayed, '지연된 마일스톤이 없습니다.') +
      warnSection('missingLog', '주간 기록 미제출', 'badge-warn', missing, '모든 팀원이 기준 주차까지 기록했습니다.') +
      warnSection('unassigned', '미배정 프로젝트', 'badge-warn', unassigned, '배정이 비어 있는 프로젝트가 없습니다.') +
      warnSection('overload', '과부하 팀원', 'badge-late', overload, '앞으로 6개월 안에 과부하 예정인 팀원이 없습니다.') +
      warnSection('burnOver', '계획 공수 초과', 'badge-late', burn, '계획 공수를 넘긴 프로젝트가 없습니다.') +
      warnSection('keyUnassigned', '핵심 항목 미배정', 'badge-late', keyUnassigned, '임팩트 상 또는 난이도 상인데 담당이 빈 세부 항목이 없습니다.') +
      warnSection('openNotes', '미해결 질문·요청' + (state.part ? ' · ' + state.part : ''), 'badge-warn', openNotes,
        state.part ? state.part + ' 파트에 온 미해결 질문·요청이 없습니다. (파트 필터는 A 화면 상세에서 바꿉니다)' : '미해결 질문·요청이 없습니다.') +
      '</div>' +
      historyCard();
  }

  /* ================================================================
   * 10b. 4턴 — 편집 폼 · 삭제 버튼 · 팀원 관리 · 공수 입력 · 최근 변경
   * ================================================================ */

  function formTitle(f) {
    var t = S.TABLES[f.table];
    if (f.table === 'settlements') { return '정산 입력'; }
    return t.label + (f.mode === 'edit' ? ' 수정' : ' 추가');
  }

  function optionList(list, value, allowEmpty, emptyLabel) {
    var out = [];
    var seen = false;
    if (allowEmpty) { out.push('<option value=""' + (value === '' ? ' selected' : '') + '>' + esc(emptyLabel || '선택') + '</option>'); }
    (list || []).forEach(function (o) {
      var v = (typeof o === 'string') ? o : o.value;
      var label = (typeof o === 'string') ? o : o.label;
      var cls = (typeof o === 'string') ? '' : (o.cls || '');
      if (v === value) { seen = true; }
      out.push('<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + (cls ? ' class="' + esc(cls) + '"' : '') + '>' + esc(label) + '</option>');
    });
    // 현재 값이 목록에 없으면(예: 퇴사 팀원·삭제된 항목) 그대로 보여 조용히 바뀌지 않게 한다
    if (!seen && value !== '' && value !== null && value !== undefined) {
      out.push('<option value="' + esc(value) + '" selected>' + esc(value) + ' (목록에 없음)</option>');
    }
    return out.join('');
  }

  function memberOptions(current) {
    return (state.data.members || []).filter(function (m) { return m.status !== '퇴사' || m.name === current; })
      .map(function (m) { return { value: m.name, label: m.name + (m.role ? ' · ' + m.role : '') + (m.status === '지원' ? ' · 지원' : '') }; });
  }
  function projectOptions() {
    return (state.data.projects || []).map(function (p) { return { value: p.id, label: p.id + ' · ' + p.name }; });
  }
  function projectCodeOptions() {
    var codes = (state.data.settings && state.data.settings.commonCodes) || ['G-내부', 'G-영업', 'G-휴가'];
    return codes.map(function (c) { return { value: c, label: c + ' · ' + codeLabel(c) }; }).concat(projectOptions());
  }

  /** 필드 정의 → 입력 요소 HTML (값은 state.form.values 에서) */
  function formControl(fd, value, disabled, f) {
    var attrs = ' data-form-field="' + esc(fd.key) + '"' + (disabled ? ' disabled' : '') + ' id="ff-' + esc(fd.key) + '"';
    var v = (value === null || value === undefined) ? '' : String(value);
    switch (fd.type) {
      case 'textarea':
        return '<textarea rows="2"' + attrs + '>' + esc(v) + '</textarea>';
      case 'number':
        return '<input type="number" step="' + (fd.step || 1) + '" min="' + (fd.min || 0) + '"' + attrs + ' value="' + esc(v) + '">';
      case 'date':
        return '<input type="date"' + attrs + ' value="' + esc(v) + '">';
      case 'enum': {
        var list = fd.enumFixed ? (S.FIXED_ENUMS[fd.enumFixed] || []) : ((state.data.settings || {})[fd.enumFrom] || []);
        return '<select' + attrs + '>' + optionList(list, v, !fd.required, '선택') + '</select>';
      }
      case 'member':
        // 5턴: 세부 항목 담당은 파트·기배정·가동률 순으로 정렬한 목록(memberPickList)
        if (f && f.table === 'items' && fd.key === 'owner') {
          return '<select' + attrs + '>' + optionList(memberPickList(f.values.part, f.values.projectId), v, true, '없음(파트 합계로만 표시)') + '</select>';
        }
        return '<select' + attrs + '>' + optionList(memberOptions(v), v, true, fd.required ? '선택' : '없음') + '</select>';
      case 'project':
        return '<select' + attrs + '>' + optionList(projectOptions(), v, !fd.required || v === '', '선택') + '</select>';
      case 'projectCode':
        return '<select' + attrs + '>' + optionList(projectCodeOptions(), v, true, '선택') + '</select>';
      case 'color':
        return '<span class="tb-color-field"><i class="tb-color-chip" style="background:' + (/^#[0-9A-Fa-f]{6}$/.test(v) ? esc(v) : 'transparent') + '"></i>' +
          '<input type="text" placeholder="#RRGGBB" maxlength="7"' + attrs + ' value="' + esc(v) + '"></span>';
      default:
        return '<input type="text"' + attrs + ' value="' + esc(v) + '">';
    }
  }

  /** 공통 폼 카드 — Schema.TABLES[table].fields 로 자동 생성. 값은 state.form.values 가 원본(입력 중 재렌더 없음) */
  function formCard() {
    var f = state.form;
    if (!f) { return ''; }
    var t = S.TABLES[f.table];
    var fields = t.fields.map(function (fd) {
      var v = f.values[fd.key];
      if (fd.auto) {
        if (f.mode !== 'edit') { return ''; }
        return '<label class="tb-field"><span>' + esc(fd.label) + '</span>' +
          '<span class="tb-readonly num" data-form-readonly="' + esc(fd.key) + '">' + esc((v === null || v === undefined || v === '') ? '—' : v) + '</span></label>';
      }
      var disabled = state.saving || (fd.immutable && f.mode === 'edit') || !!(f.locked && f.locked[fd.key]);
      var wide = fd.type === 'textarea';
      return '<label class="tb-field' + (wide ? ' span-2' : '') + '">' +
        '<span>' + esc(fd.label) + (fd.required ? ' <em class="req" title="필수">*</em>' : '') +
        (fd.immutable && f.mode === 'edit' ? ' <span class="cap">(대시보드에서 바꿀 수 없음)</span>' : '') +
        (fd.step ? ' <span class="cap">(' + fd.step + ' 단위)</span>' : '') + '</span>' +
        formControl(fd, v, disabled, f) + '</label>';
    }).join('');

    var options = '';
    if (f.table === 'projects' && f.mode === 'new') {
      options = '<label class="tb-check"><input type="checkbox" data-form-option="createStandardMilestones"' +
        (f.options && f.options.createStandardMilestones ? ' checked' : '') + (state.saving ? ' disabled' : '') +
        '> 표준 마일스톤도 함께 생성 <span class="cap">(설정 탭 템플릿 9종 · 행사일 기준 자동 계산)</span></label>';
    }
    var error = (f.error && f.error.length)
      ? '<div class="tb-form-error" role="alert"><strong>저장하지 못했습니다</strong><ul>' +
        f.error.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var del = '';
    if (f.mode === 'edit' && f.table !== 'settlements' && f.expected) {
      del = '<span class="grow"></span>' + deleteButton(f.table, f.expected, '삭제', 'btn btn-ghost btn-sm', 'form-delete');
    }
    var hint = f.table === 'settlements'
      ? '매출·직접비를 입력하면 실마진(직접비 차감)이 계산됩니다. 정산 행은 지우지 않고 값을 비워 저장합니다.'
      : (f.mode === 'edit' ? '저장하면 시트의 [' + t.sheet + '] 탭에서 이 행의 바뀐 칸만 갱신됩니다.' : '저장하면 시트의 [' + t.sheet + '] 탭 끝에 한 줄이 추가됩니다.');

    return '<div class="tb-card tb-form" data-form-table="' + esc(f.table) + '" data-form-mode="' + esc(f.mode) + '">' +
      '<h3>' + esc(formTitle(f)) + '</h3>' +
      '<div class="tb-card-desc">' + esc(hint) + ' 별표(*)는 필수입니다.</div>' +
      '<div class="tb-form-grid">' + fields + '</div>' +
      (options ? '<div class="tb-form-options">' + options + '</div>' : '') +
      error +
      '<div class="tb-form-actions">' +
      '<button type="button" class="btn btn-primary" data-action="form-save"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? '저장 중…' : '저장') + '</button>' +
      '<button type="button" class="btn btn-secondary" data-action="form-cancel"' + (state.saving ? ' disabled' : '') + '>취소</button>' +
      '<span class="save-state" id="form-state">' + (state.saving ? '저장 중…' : '') + '</span>' +
      del +
      '</div></div>';
  }

  /**
   * 삭제 버튼 — 2단계 인라인 확인(confirmable 패턴). 삭제 불가면 버튼 대신 사유 문장.
   * action 기본 'delete-row'(목록·상세 패널) · 폼 안에서는 'form-delete'
   */
  function deleteButton(table, row, label, cls, action) {
    var act = action || 'delete-row';
    var keyStr = keyStrOf(table, row);
    var chk = S.deleteCheck(table, row, state.data);
    if (!chk.ok) {
      return '<span class="cap tb-delete-blocked" data-delete-blocked="' + esc(keyStr) + '" title="' + esc(chk.reason) + '">' + esc(chk.reason) + '</span>';
    }
    var key = confirmKey(act, table, keyStr);
    var ct = cascadeText(chk.cascade || {});
    var cascade = ct ? ' ' + ct.replace('함께 삭제: ', '') + ' 도 함께 삭제됩니다.' : '';
    if (state.pendingConfirm === key) {
      return '<span class="tb-confirm" data-confirm="' + esc(key) + '">정말 삭제할까요?' + esc(cascade) + ' ' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="confirm-yes" data-confirm-action="' + esc(act) +
        '" data-table="' + esc(table) + '" data-key="' + esc(keyStr) + '"' + (state.saving ? ' disabled' : '') + '>확인</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="confirm-no">취소</button></span>';
    }
    return '<button type="button" class="' + cls + '" data-action="' + esc(act) + '" data-table="' + esc(table) + '" data-key="' + esc(keyStr) + '"' +
      (state.saving ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  /** B — 팀원 관리 카드 */
  function memberAdminCard() {
    var members = state.data.members || [];
    var rows = members.map(function (m) {
      var chip = /^#[0-9A-Fa-f]{6}$/.test(String(m.color || ''))
        ? '<i class="tb-color-chip" style="background:' + esc(m.color) + '"></i><span class="num cap">' + esc(m.color) + '</span>'
        : '<span class="cap">자동</span>';
      var st = m.status || '재직';
      var stCls = st === '재직' ? 'badge-done' : (st === '퇴사' ? 'badge-late' : (st === '휴직' ? 'badge-warn' : 'badge-info'));
      return '<tr data-member-row="' + esc(m.name) + '">' +
        '<td><strong>' + esc(m.name) + '</strong></td>' +
        '<td>' + esc(m.role || '—') + '</td>' +
        '<td class="n">' + esc(fmtMd(Number(m.capacityMd))) + '</td>' +
        '<td><span class="badge ' + stCls + '">' + esc(st) + '</span></td>' +
        '<td>' + chip + '</td>' +
        '<td><span class="tb-row-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="open-form" data-table="members" data-mode="edit" data-key="' + esc(m.name) + '"' + (state.saving ? ' disabled' : '') + '>수정</button>' +
        deleteButton('members', m, '삭제', 'btn btn-ghost btn-sm') +
        '</span></td></tr>';
    }).join('');
    return '<div class="tb-card" id="member-admin"><h3>팀원 관리</h3>' +
      '<div class="tb-card-desc">시트의 [팀원] 탭을 여기서 고칩니다. 이름은 다른 탭이 참조하는 키라서 대시보드에서 바꿀 수 없고, 배정·공수기록·담당으로 참조되는 팀원은 삭제 대신 상태를 "퇴사" 로 바꿉니다.</div>' +
      '<div class="tb-toolbar" style="margin:0 0 10px">' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="open-form" data-table="members" data-mode="new"' + (state.saving ? ' disabled' : '') + '>팀원 추가</button>' +
      '<span class="cap">전체 ' + members.length + '명</span></div>' +
      (state.form && state.form.anchor === 'B' ? '<div id="edit-form">' + formCard() + '</div>' : '') +
      '<div class="tb-scroll"><table class="tb-table"><thead><tr>' +
      '<th>이름</th><th>주역할</th><th class="n">월 가용 공수</th><th>상태</th><th>색상</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="cap">팀원이 없습니다. [팀원 추가]로 시작하세요.</td></tr>') + '</tbody></table></div>' +
      '</div>';
  }

  /** C — 공수 주간 입력 편집기 */
  function effortWeeks() {
    var cur = M.mondayOf(state.today);
    var base = M.baseWeek(state.data, state.today);
    var out = [];
    for (var i = 0; i < 8; i++) {
      var w = M.addDays(cur, -7 * i);
      var label = Number(w.slice(5, 7)) + '/' + Number(w.slice(8, 10)) + ' 주차';
      if (w === cur) { label += '(이번 주)'; }
      if (w === base) { label += '(기준)'; }
      out.push({ value: w, label: label });
    }
    return out;
  }

  function loadEffort(member, week) {
    var m = member || '', w = week || '';
    if (!m || !w) { state.effort = { member: m, week: w, rows: [], expected: null, error: null }; return; }
    var logs = (state.data.effortLogs || []).filter(function (l) { return l.member === m && M.mondayOf(l.week) === w; });
    state.effort = {
      member: m, week: w,
      rows: logs.map(function (l) { return { projectId: l.projectId || '', md: (l.md === null || l.md === undefined) ? '' : l.md, memo: l.memo || '' }; }),
      expected: clone(logs),
      error: null
    };
  }

  function effortEditor() {
    var e = state.effort || { member: '', week: '', rows: [], expected: null, error: null };
    var members = (state.data.members || []).filter(function (m) { return m.status === '재직' || m.status === '휴직' || m.name === e.member; });
    var memberOpts = optionList(members.map(function (m) { return { value: m.name, label: m.name + (m.role ? ' · ' + m.role : '') }; }), e.member, true, '팀원 선택');
    var weekOpts = optionList(effortWeeks(), e.week, true, '주차 선택');
    var ready = !!(e.member && e.week);
    var body;
    if (!ready) {
      body = '<div class="tb-empty" style="margin-top:10px">팀원과 주차를 고르면 그 주의 기록이 표에 나옵니다. 주간 기록 현황의 칸을 눌러도 열립니다.</div>';
    } else {
      var codes = projectCodeOptions();
      var rows = e.rows.map(function (r, i) {
        return '<tr class="tb-edit-row">' +
          '<td><select data-row="' + i + '" data-field="projectId"' + (state.saving ? ' disabled' : '') + '>' + optionList(codes, r.projectId || '', true, '선택') + '</select></td>' +
          '<td><input type="number" step="0.5" min="0" data-row="' + i + '" data-field="md" value="' + esc(r.md) + '"' + (state.saving ? ' disabled' : '') + '></td>' +
          '<td><input type="text" data-row="' + i + '" data-field="memo" value="' + esc(r.memo) + '"' + (state.saving ? ' disabled' : '') + '></td>' +
          '<td><button type="button" class="btn btn-ghost btn-sm" data-action="effort-remove-row" data-index="' + i + '"' + (state.saving ? ' disabled' : '') + '>제거</button></td>' +
          '</tr>';
      }).join('');
      var check = S.validateEffortWeek(e.member, e.week, e.rows, { settings: state.data.settings, data: state.data });
      var warn = (check.warnings || []).map(function (w) { return '<div class="tb-form-warn">' + esc(w) + '</div>'; }).join('');
      var error = (e.error && e.error.length)
        ? '<div class="tb-form-error" role="alert"><strong>저장하지 못했습니다</strong><ul>' + e.error.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>' : '';
      body =
        '<div class="tb-scroll" style="margin-top:10px"><table class="tb-table"><thead><tr>' +
        '<th style="min-width:260px">프로젝트 코드</th><th style="min-width:110px">실투입 공수(0.5 단위)</th><th style="min-width:200px">메모</th><th></th>' +
        '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="4" class="cap">이 주에는 기록이 없습니다. [행 추가]를 눌러 시작하세요.</td></tr>') +
        '</tbody></table></div>' +
        '<div class="tb-toolbar"><span class="cap num" id="effort-total">합계 ' + fmtMd(check.total || 0) + ' 공수 · ' + e.rows.length + '행</span></div>' +
        warn + error +
        '<div class="tb-toolbar">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="effort-add-row"' + (state.saving ? ' disabled' : '') + '>행 추가</button>' +
        '<button type="button" class="btn btn-primary" data-action="effort-save"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? '저장 중…' : '저장') + '</button>' +
        '<span class="save-state" id="effort-state">' + (state.saving ? '저장 중…' : '') + '</span>' +
        '</div>';
    }
    return '<div class="tb-card" id="effort-editor"><h3>공수 입력</h3>' +
      '<div class="tb-card-desc">팀원과 주차를 고르고 그 주에 어디에 며칠을 썼는지 적습니다. 저장하면 시트의 [공수기록] 탭에서 그 팀원·주차의 행이 통째로 교체됩니다. 휴가·내부 업무는 공통코드(G-)로 적습니다.</div>' +
      '<div class="tb-toolbar" style="margin:0">' +
      '<label class="tb-field"><span>팀원</span><select id="effort-member"' + (state.saving ? ' disabled' : '') + '>' + memberOpts + '</select></label>' +
      '<label class="tb-field"><span>주차(월요일)</span><select id="effort-week"' + (state.saving ? ' disabled' : '') + '>' + weekOpts + '</select></label>' +
      '</div>' + body + '</div>';
  }

  /** E — 최근 변경 목록 */
  function historyCard() {
    var list = (state.data.history || []).slice(0, 30);
    var rows = list.map(function (h) {
      var first = String(h.summary || '').split('\n')[0];
      return '<tr class="tb-history-row">' +
        '<td class="num nowrap">' + esc(h.at || '') + '</td>' +
        '<td>' + esc(h.user || '—') + '</td>' +
        '<td>' + esc(h.sheet || '') + '</td>' +
        '<td class="num">' + esc(h.key || '') + '</td>' +
        '<td>' + esc(h.action || '') + '</td>' +
        '<td class="summary" title="' + esc(h.summary || '') + '">' + esc(clip(first, 80)) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="tb-card tb-history" id="history-list"><h3>최근 변경</h3>' +
      '<div class="tb-card-desc">대시보드에서 저장·삭제한 내역(최근 30건, 최신 먼저). 전체 내역과 이전 행 백업은 시트의 [변경이력] 탭에 있습니다.</div>' +
      (rows
        ? '<div class="tb-scroll"><table class="tb-table"><thead><tr><th>일시</th><th>사용자</th><th>탭</th><th>키</th><th>동작</th><th>요약</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="tb-empty">아직 변경 기록이 없습니다.</div>') +
      '</div>';
  }

  /* ================================================================
   * 11. 렌더 · 탭
   * ================================================================ */

  var TABS = [
    { id: 'A', label: '포트폴리오' },
    { id: 'B', label: '배정 보드' },
    { id: 'C', label: '공수 관리' },
    { id: 'D', label: '투입 대비 성과' },
    { id: 'E', label: '이번 주' }
  ];

  function buildTabs() {
    el('tabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" class="tb-tab" role="tab" data-tab="' + t.id + '" aria-selected="false">' +
        esc(t.id + '. ' + t.label) + '</button>';
    }).join('');
  }

  function syncTabs() {
    TABS.forEach(function (t) {
      var btn = document.querySelector('.tb-tab[data-tab="' + t.id + '"]');
      var scr = el('screen-' + t.id);
      var on = (t.id === state.tab);
      if (btn) { btn.setAttribute('aria-selected', on ? 'true' : 'false'); }
      if (scr) { scr.hidden = !on; }
    });
  }

  function goTab(id) {
    if (!id || !/^[A-E]$/.test(id)) { return; }
    state.tab = id;
    if (window.location.hash !== '#' + id) {
      try { window.location.hash = id; } catch (e) { /* 파일 경로에서 실패해도 무시 */ }
    }
    syncTabs();
  }

  function render() {
    var view = filteredData();
    state.view = view;
    renderTopMeta();
    renderFilterBadge(view);
    renderKpis(view);
    renderScreenA(view);
    renderScreenB(view);
    renderScreenC(view);
    renderScreenD(view);
    renderScreenE(view);
    syncTabs();
  }

  /* ================================================================
   * 12. 토스트 · 쓰기 3경로
   * ================================================================ */

  function toast(msg, kind) {
    var wrap = el('toasts');
    var node = document.createElement('div');
    node.className = 'tb-toast' + (kind ? ' is-' + kind : '');
    node.textContent = msg;
    wrap.appendChild(node);
    setTimeout(function () { if (node.parentNode) { node.parentNode.removeChild(node); } }, 5200);
  }

  function setSaving(on) {
    state.saving = on;
    var btns = document.querySelectorAll('[data-action="save-assignments"],[data-action="add-row"],' +
      '[data-action="complete-milestone"],[data-action="create-milestones"],[data-action="confirm-yes"],' +
      '[data-action="form-save"],[data-action="form-cancel"],[data-action="form-delete"],[data-action="delete-row"],' +
      '[data-action="open-form"],[data-action="effort-save"],[data-action="effort-add-row"],[data-action="effort-remove-row"],[data-action="refresh-data"],' +
      '[data-action="block-add"],[data-action="block-picker"],[data-action="note-add"],[data-action="note-resolve"]');
    for (var i = 0; i < btns.length; i++) { btns[i].disabled = on; }
    ['save-state', 'ms-state', 'form-state', 'effort-state'].forEach(function (id) {
      var s = el(id);
      if (s) { s.textContent = on ? '저장 중…' : ''; }
    });
  }

  /* ---- 4턴: 변경이력(화면 쪽) — 서버 응답에 history 가 있으면 그것을, 없으면 로컬에서 만든 항목을 앞에 끼운다 ---- */
  function makeHistory(sheet, key, action, summary) {
    return { at: nowStamp(), user: (state.data.meta && state.data.meta.user) || '', sheet: sheet, key: key, action: action, summary: summary };
  }
  function pushHistory(entry) {
    if (!entry) { return; }
    if (!Array.isArray(state.data.history)) { state.data.history = []; }
    state.data.history.unshift(entry);
    if (state.data.history.length > 30) { state.data.history.length = 30; }
  }
  function errMsg(e) { return (e && e.message) ? e.message : '알 수 없는 오류'; }

  /** 저장 응답을 state.data 에 반영(브리프 §4) */
  function applySaveResponse(f, res) {
    var table = f.table;
    var row = (res && res.row) || null;
    if (!row) { throw new Error('서버 응답에 저장된 행이 없습니다.'); }
    var list = state.data[table];
    var created = !!(res && res.created);
    var before = null;
    // 편집 시작 키(복합키 수정 허용) → 저장된 행 키 순으로 찾아 교체, 없으면 추가(정산 upsert 포함)
    var idx = f.expected ? S.findRow(table, list, S.keyOf(table, f.expected)) : -1;
    if (idx < 0) { idx = S.findRow(table, list, S.keyOf(table, row)); }
    if (idx >= 0) { before = list[idx]; list[idx] = row; created = false; } else { list.push(row); }
    if (table === 'projects') {
      if (created) {
        if (!M.findSettlement(state.data, row.id)) {
          state.data.settlements.push({ projectId: row.id, revenue: null, directCost: null, preReg: null, attended: null, status: '미착수' });
        }
        var ms = res.milestones;
        var createdMs = (ms && Array.isArray(ms.created)) ? ms.created : null;
        if (!createdMs && f.options && f.options.createStandardMilestones) {
          createdMs = M.standardMilestones(row, (state.data.settings || {}).milestoneTemplate, [], state.data.milestones).created;
        }
        (createdMs || []).forEach(function (m) {
          var dup = state.data.milestones.some(function (x) { return x.projectId === m.projectId && x.name === m.name; });
          if (!dup) { state.data.milestones.push(m); }
        });
      }
      state.selectedProject = row.id;
      if (!state.editProject) { loadEditRows(row.id); }
    }
    if (table === 'members') { buildFilters(); }
    // 5턴: 세부 항목 → 첫 주석 · 배정 자동 행(그 프로젝트 행 전체 교체) · overlaps · 펼침 유지
    if (table === 'items') {
      if (res && res.firstNote && res.firstNote.id && !state.data.notes.some(function (n) { return n.id === res.firstNote.id; })) {
        state.data.notes.push(res.firstNote);
      }
      applyAssignmentsResponse(row.projectId, res);
      state.itemsOpen[itemsKey(row.projectId, row.milestone)] = true;
    }
    if (table === 'notes') {
      var nk = str(row.itemId) ? str(row.itemId) : 'ms:' + itemsKey(row.projectId, row.milestone);
      state.itemsOpen[itemsKey(row.projectId, row.milestone)] = true;
      state.notesOpen[nk] = true;
    }
    // 5턴: 마일스톤 이름이 바뀌면 로컬 세부 항목·주석의 마일스톤 열도 따라 바꾼다(서버는 renamed 로 알린다)
    if (table === 'milestones' && before && str(before.name) !== str(row.name)) {
      renameMilestoneLocal(row.projectId, before.name, row.name);
    }
    pushHistory((res && res.history) || makeHistory(S.TABLES[table].sheet, S.keyLabel(table, row), created ? '추가' : '수정', S.summarize(table, created ? '추가' : '수정', before, row)));
    pushExtraHistory(res);
  }

  /** 5턴: 응답의 assignments(그 프로젝트 행 전체)·overlaps 를 상태에 반영. 다른 프로젝트 행은 보존 */
  function applyAssignmentsResponse(projectId, res) {
    if (!projectId || !res) { return; }
    if (Array.isArray(res.assignments)) {
      state.data.assignments = (state.data.assignments || []).filter(function (a) { return a.projectId !== projectId; }).concat(res.assignments);
      if (state.editProject === projectId) { loadEditRows(projectId); }
    }
    if (Array.isArray(res.overlaps)) { state.overlaps[projectId] = res.overlaps; }
  }
  function pushExtraHistory(res) {
    ((res && res.historyExtra) || []).forEach(function (h) { pushHistory(h); });
  }
  function renameMilestoneLocal(projectId, oldName, newName) {
    (state.data.items || []).forEach(function (it) { if (it.projectId === projectId && str(it.milestone) === str(oldName)) { it.milestone = newName; } });
    (state.data.notes || []).forEach(function (n) { if (n.projectId === projectId && str(n.milestone) === str(oldName)) { n.milestone = newName; } });
    var oldKey = itemsKey(projectId, oldName), newKey = itemsKey(projectId, newName);
    if (state.itemsOpen[oldKey]) { delete state.itemsOpen[oldKey]; state.itemsOpen[newKey] = true; }
    if (state.notesOpen['ms:' + oldKey]) { delete state.notesOpen['ms:' + oldKey]; state.notesOpen['ms:' + newKey] = true; }
    if (state.blockPicker && state.blockPicker.projectId === projectId && str(state.blockPicker.milestone) === str(oldName)) { state.blockPicker.milestone = newName; }
  }

  var actions = {
    saveAssignments: function (projectId, rows) {
      if (!projectId) { toast('먼저 프로젝트를 선택하세요.', 'error'); return Promise.resolve(null); }
      var msg = validateRows(state.data, rows);
      if (msg) { toast(msg, 'error'); return Promise.resolve(null); }
      setSaving(true);
      return provider.saveAssignments(projectId, rows).then(function (res) {
        var kept = state.data.assignments.filter(function (a) { return a.projectId !== projectId; });
        var saved = (res && res.assignments) || [];
        state.data.assignments = kept.concat(saved);
        if (res && Array.isArray(res.overlaps)) { state.overlaps[projectId] = res.overlaps; }   // 5턴: 서버 재동기화 결과
        loadEditRows(projectId);
        pushHistory((res && res.history) || makeHistory('배정', projectId, '저장', '배정 행 교체: ' + saved.length + '행'));
        pushExtraHistory(res);
        setSaving(false);
        render();
        toast('배정 ' + (((res && res.assignments) || []).length) + '행을 저장했습니다.', 'ok');
        return res;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('저장하지 못했습니다 — ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
        return null;
      });
    },
    completeMilestone: function (projectId, name, date) {
      setSaving(true);
      return provider.completeMilestone(projectId, name, date || state.today).then(function (res) {
        var done = (res && res.done) || date || state.today;
        state.data.milestones.forEach(function (m) {
          if (m.projectId === projectId && m.name === name) { m.done = done; }
        });
        pushHistory((res && res.history) || makeHistory('마일스톤', projectId + ' · ' + name, '수정', '완료일: (빈 값) → ' + done));
        setSaving(false);
        render();
        toast('"' + name + '" 을(를) 완료 처리했습니다.', 'ok');
        return res;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('완료 처리하지 못했습니다 — ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
        return null;
      });
    },
    createStandardMilestones: function (projectId) {
      setSaving(true);
      return provider.createStandardMilestones(projectId).then(function (res) {
        var created = (res && res.created) || [];
        created.forEach(function (m) {
          var dup = state.data.milestones.some(function (x) { return x.projectId === m.projectId && x.name === m.name; });
          if (!dup) { state.data.milestones.push(m); }
        });
        pushHistory((res && res.history) || makeHistory('마일스톤', projectId, '추가', '표준 마일스톤 생성: ' + created.length + '건'));
        setSaving(false);
        render();
        toast('표준 마일스톤 ' + created.length + '건 생성 · ' + (((res && res.skipped) || []).length) + '건 건너뜀', 'ok');
        return res;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('마일스톤을 만들지 못했습니다 — ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
        return null;
      });
    },

    /* ---- 4턴: 편집 폼 · 삭제 · 공수 주간 입력 · 새로고침 ---- */

    /** 폼 열기 — table · mode('new'|'edit') · keyStr(수정 시 "a|b") · opts.projectId(마일스톤 추가 시 미리 채움) */
    openForm: function (table, mode, keyStr, opts) {
      if (!S.TABLES[table]) { toast('알 수 없는 표입니다: ' + table, 'error'); return false; }
      var o = opts || {};
      var ctx = { settings: state.data.settings, data: state.data };
      var m = (mode === 'edit') ? 'edit' : 'new';
      var values, expected = null, locked = {};
      if (m === 'edit') {
        var key = parseKey(table, keyStr);
        var idx = S.findRow(table, state.data[table] || [], key);
        if (idx >= 0) {
          expected = clone(state.data[table][idx]);
          values = rowToValues(expected);
        } else if (table === 'settlements') {
          // 정산 행이 아직 없는 프로젝트 — 빈 값으로 열고 저장 시 새 행(upsert)
          m = 'new';
          values = rowToValues(S.emptyRow(table, ctx));
          values.projectId = key.projectId || '';
        } else {
          toast(S.TABLES[table].label + ' 행을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.', 'error');
          return false;
        }
      } else {
        values = rowToValues(S.emptyRow(table, ctx));
        if (table === 'milestones' && o.projectId) { values.projectId = o.projectId; locked.projectId = true; }
        if (table === 'settlements' && o.projectId) { values.projectId = o.projectId; }
        // 5턴: 세부 항목·주석은 프로젝트·마일스톤을 미리 채워 잠근다
        if ((table === 'items' || table === 'notes') && o.projectId) { values.projectId = o.projectId; locked.projectId = true; }
        if ((table === 'items' || table === 'notes') && o.milestone) { values.milestone = o.milestone; locked.milestone = true; }
        if (table === 'items') { values.part = o.part || state.part || (rolesList()[0] || ''); }
      }
      if (table === 'settlements') { locked.projectId = true; }
      if (m === 'edit' && (table === 'items' || table === 'notes')) {
        locked.projectId = true; locked.milestone = true;
        if (table === 'notes') { locked.itemId = true; }
      }
      state.form = {
        table: table, mode: m, values: values, expected: expected, error: null,
        options: (table === 'projects' && m === 'new') ? { createStandardMilestones: true } : {},
        locked: locked,
        anchor: (table === 'members') ? 'B' : 'A'
      };
      state.pendingConfirm = null;
      goTab(state.form.anchor);
      render();
      try {
        var node = el('edit-form');
        if (node && node.scrollIntoView) { node.scrollIntoView({ block: 'start' }); }
      } catch (e) { /* 무시 */ }
      return true;
    },
    closeForm: function () {
      state.form = null;
      state.pendingConfirm = null;
      render();
    },
    saveForm: function () {
      var f = state.form;
      if (!f) { return Promise.resolve(null); }
      var ctx = { settings: state.data.settings, data: state.data, mode: f.mode, expected: f.expected };
      var v = S.validateRow(f.table, f.values, ctx);
      if (!v.ok) {
        f.error = v.errors.map(function (e) { return e.label + ': ' + e.message; });
        render();
        toast(f.error[0], 'error');
        return Promise.resolve(null);
      }
      f.error = null;
      setSaving(true);
      return provider.saveRow(f.table, v.values, f.expected, f.options || {}).then(function (res) {
        applySaveResponse(f, res);
        state.form = null;
        state.pendingConfirm = null;
        setSaving(false);
        render();
        toast('저장했습니다', 'ok');
        return res;
      })['catch'](function (e) {
        if (state.form === f) { f.error = [errMsg(e)]; }
        setSaving(false);
        render();
        toast('저장하지 못했습니다 — ' + errMsg(e), 'error');
        return null;
      });
    },
    /** 행 삭제(2단계 확인은 이벤트 쪽에서 거친다). 삭제 불가 사유가 있으면 실행하지 않는다 */
    deleteRow: function (table, keyStr) {
      if (!S.TABLES[table]) { toast('알 수 없는 표입니다: ' + table, 'error'); return Promise.resolve(null); }
      var key = parseKey(table, keyStr);
      var list = state.data[table] || [];
      var idx = S.findRow(table, list, key);
      if (idx < 0) { toast(S.TABLES[table].label + ' 행을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.', 'error'); return Promise.resolve(null); }
      var row = list[idx];
      var chk = S.deleteCheck(table, row, state.data);
      if (!chk.ok) { toast(chk.reason, 'error'); return Promise.resolve(null); }
      setSaving(true);
      return provider.deleteRow(table, S.keyOf(table, row)).then(function (res) {
        var at = S.findRow(table, state.data[table], key);
        if (at >= 0) { state.data[table].splice(at, 1); }
        if (table === 'projects') {
          ['assignments', 'milestones', 'settlements', 'items', 'notes'].forEach(function (k) {
            state.data[k] = (state.data[k] || []).filter(function (r) { return r.projectId !== row.id; });
          });
          delete state.overlaps[row.id];
          if (state.blockPicker && state.blockPicker.projectId === row.id) { state.blockPicker = null; }
          var first = state.data.projects[0] ? state.data.projects[0].id : '';
          if (state.selectedProject === row.id) { state.selectedProject = first; }
          if (state.editProject === row.id) { if (first) { loadEditRows(first); } else { state.editProject = ''; state.editRows = []; } }
          if (state.burnProject === row.id) { state.burnProject = ''; }
        }
        if (table === 'items') {
          // 5턴: 주석 연쇄 삭제 · 배정 자동 행 재동기화(응답의 프로젝트 행 전체)
          state.data.notes = (state.data.notes || []).filter(function (n) { return str(n.itemId) !== str(row.id); });
          delete state.notesOpen[str(row.id)];
          applyAssignmentsResponse(row.projectId, res);
        }
        if (table === 'milestones') {
          // 5턴: 마일스톤 단위 주석 연쇄 제거(서버·mock 과 동일) · 펼침 상태 정리
          state.data.notes = (state.data.notes || []).filter(function (n) { return !(str(n.projectId) === str(row.projectId) && str(n.milestone) === str(row.name) && str(n.itemId) === ''); });
          delete state.itemsOpen[str(row.projectId) + '|' + str(row.name)];
        }
        if (table === 'members') { buildFilters(); }
        if (state.form && state.form.table === table && state.form.expected && keyStrOf(table, state.form.expected) === keyStrOf(table, row)) { state.form = null; }
        var rm = (res && res.removed) || {};
        var extra = cascadeText(rm);
        pushHistory((res && res.history) || makeHistory(S.TABLES[table].sheet, S.keyLabel(table, row), '삭제', S.summarize(table, '삭제', row, null, extra)));
        pushExtraHistory(res);
        state.pendingConfirm = null;
        setSaving(false);
        render();
        toast(S.TABLES[table].label + ' 행을 삭제했습니다' + (extra ? ' (' + extra + ')' : ''), 'ok');
        return res;
      })['catch'](function (e) {
        state.pendingConfirm = null;
        setSaving(false);
        render();
        toast('삭제하지 못했습니다 — ' + errMsg(e), 'error');
        return null;
      });
    },
    /** 공수 주간 입력 저장 — 그 팀원·주차 행 전체 교체 */
    saveEffortWeek: function () {
      var e = state.effort;
      if (!e || !e.member || !e.week) { toast('팀원과 주차를 먼저 고르세요.', 'error'); return Promise.resolve(null); }
      var ctx = { settings: state.data.settings, data: state.data };
      var v = S.validateEffortWeek(e.member, e.week, e.rows, ctx);
      if (!v.ok) {
        e.error = v.errors.map(function (x) { return x.label + ': ' + x.message; });
        render();
        toast(e.error[0], 'error');
        return Promise.resolve(null);
      }
      e.error = null;
      var rows = v.values.map(function (r) { return { projectId: r.projectId, md: r.md, memo: r.memo }; });
      setSaving(true);
      return provider.saveEffortWeek(e.member, e.week, rows, e.expected).then(function (res) {
        var saved = (res && res.effortLogs) || [];
        state.data.effortLogs = (state.data.effortLogs || []).filter(function (l) {
          return !(l.member === e.member && M.mondayOf(l.week) === e.week);
        }).concat(saved);
        pushHistory((res && res.history) || makeHistory('공수기록', e.week + ' · ' + e.member, '저장',
          '실투입 M/D 합계: ' + v.total + ' (' + saved.length + '행)'));
        loadEffort(e.member, e.week);
        setSaving(false);
        render();
        toast(e.member + ' · ' + e.week + ' 주차 공수 ' + saved.length + '행을 저장했습니다.', 'ok');
        return res;
      })['catch'](function (err) {
        if (state.effort) { state.effort.error = [errMsg(err)]; }
        setSaving(false);
        render();
        toast('저장하지 못했습니다 — ' + errMsg(err), 'error');
        return null;
      });
    },
    /* ---- 5턴: 블럭 추가 · 주석 ---- */

    /** 카탈로그 블럭 여러 개를 한 번에 세부 항목으로(첫 주석 자동) → 응답의 items·notes 추가, 배정 자동 행 반영 */
    addItems: function (projectId, milestone, part, blockNames) {
      var names = (blockNames || []).filter(function (b) { return str(b) !== ''; });
      if (!projectId || !milestone) { toast('프로젝트와 마일스톤을 먼저 고르세요.', 'error'); return Promise.resolve(null); }
      if (!names.length) { toast('추가할 블럭을 하나 이상 체크하세요.', 'error'); return Promise.resolve(null); }
      setSaving(true);
      return provider.addItems(projectId, milestone, part, names).then(function (res) {
        var created = (res && res.items) || [];
        created.forEach(function (it) {
          if (!state.data.items.some(function (x) { return x.id === it.id; })) { state.data.items.push(it); }
        });
        ((res && res.notes) || []).forEach(function (n) {
          if (!state.data.notes.some(function (x) { return x.id === n.id; })) { state.data.notes.push(n); }
        });
        applyAssignmentsResponse(projectId, res);
        var skipped = (res && res.skipped) || [];
        pushHistory((res && res.history) || makeHistory('세부항목', projectId + ' · ' + milestone, '추가', '블럭 추가: ' + created.length + '건 · 건너뜀 ' + skipped.length + '건'));
        pushExtraHistory(res);
        state.blockPicker = null;
        state.itemsOpen[itemsKey(projectId, milestone)] = true;
        state.pendingConfirm = null;
        setSaving(false);
        render();
        toast('블럭 ' + created.length + '건을 추가했습니다' + (skipped.length ? ' · 이미 있어 건너뜀 ' + skipped.length + '건' : '') +
          (((res && res.notes) || []).length ? ' · 첫 주석 ' + res.notes.length + '건' : ''), created.length ? 'ok' : '');
        return res;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('블럭을 추가하지 못했습니다 — ' + errMsg(e), 'error');
        return null;
      });
    },
    /** 주석 저장(신규: 작성자·일시는 서버가 채움 / 수정: 본인만, 해결 표시는 누구나). expected 가 없으면 신규 */
    saveNote: function (row, expected) {
      var mode = expected ? 'edit' : 'new';
      var ctx = { settings: state.data.settings, data: state.data, mode: mode, expected: expected || null };
      var v = S.validateRow('notes', row, ctx);
      if (!v.ok) { toast(firstErrorMessage(v.errors), 'error'); return Promise.resolve(null); }
      setSaving(true);
      return provider.saveRow('notes', v.values, expected || null, {}).then(function (res) {
        applySaveResponse({ table: 'notes', mode: mode, expected: expected || null, options: {} }, res);
        state.pendingConfirm = null;
        setSaving(false);
        render();
        toast(mode === 'edit' ? '주석을 갱신했습니다' : '주석을 남겼습니다', 'ok');
        return res;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('주석을 저장하지 못했습니다 — ' + errMsg(e), 'error');
        return null;
      });
    },
    /** 파트 필터 — localStorage 'tb.part' 에 기억(사람마다 자기 파트) */
    setPart: function (part) {
      var p = str(part);
      if (p && rolesList().indexOf(p) < 0) { p = ''; }
      state.part = p;
      try { window.localStorage.setItem('tb.part', p); } catch (e) { /* 저장 불가 환경이면 무시 */ }
      render();
      return p;
    },

    /** 새로고침 — getBootstrap 재호출. 필터·탭·선택은 유지, 열린 폼은 닫는다(스냅샷이 오래됐을 수 있음) */
    refreshData: function () {
      setSaving(true);
      return provider.getBootstrap().then(function (data) {
        if (!data || !data.meta) { throw new Error('데이터 형식이 올바르지 않습니다.'); }
        adoptData(data);
        var ids = {};
        state.data.projects.forEach(function (p) { ids[p.id] = true; });
        if (!ids[state.selectedProject]) { state.selectedProject = state.data.projects[0] ? state.data.projects[0].id : ''; }
        if (ids[state.editProject]) { loadEditRows(state.editProject); }
        else if (state.data.projects.length) { loadEditRows(state.data.projects[0].id); }
        else { state.editProject = ''; state.editRows = []; }
        if (!ids[state.burnProject]) { state.burnProject = ''; }
        if (state.effort && state.effort.member && state.effort.week) { loadEffort(state.effort.member, state.effort.week); }
        state.form = null;
        state.pendingConfirm = null;
        state.blockPicker = null;
        buildFilters();
        setSaving(false);
        render();
        toast('데이터를 새로 불러왔습니다.', 'ok');
        return data;
      })['catch'](function (e) {
        setSaving(false);
        render();
        toast('새로고침하지 못했습니다 — ' + errMsg(e), 'error');
        return null;
      });
    }
  };

  /** 부트스트랩 JSON 을 상태로 받아들이며 누락 키를 보정한다(로드·새로고침 공용) */
  function adoptData(data) {
    state.data = data;
    ['members', 'projects', 'assignments', 'effortLogs', 'milestones', 'settlements', 'history', 'items', 'notes', 'blocks'].forEach(function (k) {
      if (!Array.isArray(state.data[k])) { state.data[k] = []; }
    });
    // 5턴: 업무블럭 탭이 없거나 비면 코드의 기본 카탈로그
    if (!state.data.blocks.length) { state.data.blocks = clone(S.DEFAULT_BLOCKS); }
    if (!state.data.settings) { state.data.settings = {}; }
    if (!state.data.meta) { state.data.meta = {}; }
    if (typeof state.data.meta.user !== 'string') { state.data.meta.user = ''; }
    state.today = state.data.meta.today || M.toDateStr(new Date());
    state.overlaps = {};
    if (state.part && rolesList().indexOf(state.part) < 0) { state.part = ''; }
  }

  /* ================================================================
   * 13. 이벤트
   * ================================================================ */

  function bindEvents() {
    // 마우스를 올리면 뜨는 작은 설명(타임라인 막대의 날짜 등). data-tip 속성이 있는 요소면 어디든 동작한다.
    var tipEl = null;
    function tipBox() {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tb-tip';
        tipEl.setAttribute('role', 'tooltip');
        tipEl.hidden = true;
        document.body.appendChild(tipEl);
      }
      return tipEl;
    }
    function moveTip(ev) {
      var t = tipBox();
      var x = ev.clientX + 14, y = ev.clientY + 18;
      var w = t.offsetWidth, h = t.offsetHeight;
      if (x + w > window.innerWidth - 8) { x = Math.max(8, ev.clientX - w - 12); }
      if (y + h > window.innerHeight - 8) { y = Math.max(8, ev.clientY - h - 12); }
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    }
    function tipTarget(node) {
      return (node && node.closest) ? node.closest('[data-tip]') : null;
    }
    document.addEventListener('mouseover', function (ev) {
      var host = tipTarget(ev.target);
      var t = tipBox();
      if (!host) { if (!t.hidden) { t.hidden = true; } return; }
      t.textContent = host.getAttribute('data-tip') || '';
      t.hidden = !t.textContent;
      if (!t.hidden) { moveTip(ev); }
    });
    document.addEventListener('mousemove', function (ev) {
      if (tipEl && !tipEl.hidden) { moveTip(ev); }
    });
    document.addEventListener('mouseout', function (ev) {
      if (!tipEl || tipEl.hidden) { return; }
      var host = tipTarget(ev.target);
      if (host && !(ev.relatedTarget && host.contains(ev.relatedTarget))) { tipEl.hidden = true; }
    });

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      var node = (t && t.closest) ? t : (t && t.parentNode);
      if (!node || !node.closest) { return; }

      var tabBtn = node.closest('[data-tab]');
      if (tabBtn) { goTab(tabBtn.getAttribute('data-tab')); return; }

      var actionEl = node.closest('[data-action]');
      if (actionEl) {
        var act = actionEl.getAttribute('data-action');
        if (act === 'reset-filters') { resetFilters(); return; }
        if (act === 'add-row') {
          state.editRows.push({ id: '', member: '', role: '', plannedMd: '', start: '', end: '', status: '예정', note: '' });
          render(); return;
        }
        if (act === 'remove-row') {
          state.editRows.splice(Number(actionEl.getAttribute('data-index')), 1);
          render(); return;
        }
        if (act === 'quick-add-member') {
          // 팀원 빠른 배정: 역할 = 주역할, 기간 = 착수(예정)일 ~ 행사 종료일, 계획 공수는 비워 두고 사용자가 채운다
          var qName = actionEl.getAttribute('data-member');
          var qMem = null;
          (state.data.members || []).forEach(function (m) { if (m.name === qName) { qMem = m; } });
          var qProj = M.findProject(state.data, state.editProject);
          if (!qMem || !qProj) { toast('먼저 프로젝트를 선택하세요.', 'error'); return; }
          state.editRows.push({
            id: '', member: qMem.name, role: qMem.role || '', plannedMd: '',
            start: M.effectiveKickoff(qProj, state.data.settings) || qProj.eventStart || '',
            end: qProj.eventEnd || '', status: '예정', note: ''
          });
          render();
          return;
        }
        if (act === 'save-assignments') {
          actions.saveAssignments(state.editProject, state.editRows.map(function (r) { return r; }));
          return;
        }
        // 3.1 m-2: 완료 처리·표준 마일스톤 생성은 2단계 인라인 확인을 거친다(브라우저 대화상자 미사용)
        if (act === 'complete-milestone' || act === 'create-milestones') {
          state.pendingConfirm = confirmKey(act, actionEl.getAttribute('data-project'), actionEl.getAttribute('data-name'));
          render();
          return;
        }
        if (act === 'confirm-no') { state.pendingConfirm = null; render(); return; }
        if (act === 'confirm-yes') {
          var cAct = actionEl.getAttribute('data-confirm-action');
          var cPid = actionEl.getAttribute('data-project');
          var cName = actionEl.getAttribute('data-name');
          state.pendingConfirm = null;
          if (cAct === 'complete-milestone') { actions.completeMilestone(cPid, cName, state.today); }
          else if (cAct === 'create-milestones') { actions.createStandardMilestones(cPid); }
          else if (cAct === 'delete-row' || cAct === 'form-delete') { actions.deleteRow(actionEl.getAttribute('data-table'), actionEl.getAttribute('data-key')); }
          return;
        }

        /* ---- 4턴: 편집 폼 · 삭제 · 공수 입력 · 새로고침 ---- */
        if (act === 'refresh-data') { actions.refreshData(); return; }
        if (act === 'open-form') {
          actions.openForm(actionEl.getAttribute('data-table'), actionEl.getAttribute('data-mode') || 'new',
            actionEl.getAttribute('data-key'), {
              projectId: actionEl.getAttribute('data-project') || '',
              milestone: actionEl.getAttribute('data-milestone') || '',
              part: actionEl.getAttribute('data-part') || ''
            });
          return;
        }

        /* ---- 5턴: 세부 항목 펼침 · 파트 필터 · 블럭 추가 창 · 주석 ---- */
        if (act === 'toggle-items') {
          var tk = actionEl.getAttribute('data-key');
          if (state.itemsOpen[tk]) { delete state.itemsOpen[tk]; if (state.blockPicker && itemsKey(state.blockPicker.projectId, state.blockPicker.milestone) === tk) { state.blockPicker = null; } }
          else { state.itemsOpen[tk] = true; }
          render(); return;
        }
        if (act === 'toggle-notes') {
          var nk = actionEl.getAttribute('data-key');
          if (state.notesOpen[nk]) { delete state.notesOpen[nk]; } else { state.notesOpen[nk] = true; }
          render(); return;
        }
        if (act === 'part-filter') { actions.setPart(actionEl.getAttribute('data-part') || ''); return; }
        if (act === 'block-picker') {
          var bk = parseKey('milestones', actionEl.getAttribute('data-key'));
          state.blockPicker = { projectId: bk.projectId, milestone: bk.name, part: state.part || (rolesList()[0] || ''), checked: {} };
          state.itemsOpen[actionEl.getAttribute('data-key')] = true;
          render(); return;
        }
        if (act === 'block-cancel') { state.blockPicker = null; render(); return; }
        if (act === 'block-toggle') {
          // 칩 체크는 재렌더 없이 자리에서 바꾼다(입력 중 화면이 흔들리지 않게)
          var bp = state.blockPicker;
          if (!bp || actionEl.disabled) { return; }
          var bName = actionEl.getAttribute('data-block');
          var onNow = !bp.checked[bName];
          if (onNow) { bp.checked[bName] = true; } else { delete bp.checked[bName]; }
          actionEl.classList.toggle('is-on', onNow);
          if (actionEl.firstChild && actionEl.firstChild.nodeType === 3) { actionEl.firstChild.nodeValue = (onNow ? '☑ ' : '☐ ') + bName + ' '; }
          var cnt = Object.keys(bp.checked).filter(function (k) { return bp.checked[k]; }).length;
          var cntEl = el('block-add-count');
          if (cntEl) { cntEl.textContent = String(cnt); }
          var addBtn = document.querySelector('[data-action="block-add"]');
          if (addBtn) { addBtn.disabled = !cnt || state.saving; }
          return;
        }
        if (act === 'block-add') {
          var bpa = state.blockPicker;
          if (!bpa) { return; }
          actions.addItems(bpa.projectId, bpa.milestone, bpa.part, Object.keys(bpa.checked).filter(function (k) { return bpa.checked[k]; }));
          return;
        }
        if (act === 'note-add') {
          var box = actionEl.closest('.tb-note-input');
          if (!box) { return; }
          var fieldVal = function (name) { var n = box.querySelector('[data-field="' + name + '"]'); return n ? n.value : ''; };
          var nRow = rowToValues(S.emptyRow('notes', { settings: state.data.settings, data: state.data }));
          nRow.projectId = box.getAttribute('data-note-project') || '';
          nRow.milestone = box.getAttribute('data-note-milestone') || '';
          nRow.itemId = box.getAttribute('data-note-item') || '';
          nRow.part = box.getAttribute('data-note-part') || fieldVal('part') || '';
          nRow.type = fieldVal('type') || '요청';
          nRow.authorName = fieldVal('authorName') || '';
          nRow.content = fieldVal('content') || '';
          if (!str(nRow.content)) { toast('주석 내용을 적으세요.', 'error'); return; }
          actions.saveNote(nRow, null);
          return;
        }
        if (act === 'note-resolve') {
          var nId = actionEl.getAttribute('data-id');
          var nCur = null;
          (state.data.notes || []).forEach(function (n) { if (n.id === nId) { nCur = n; } });
          if (!nCur) { toast('주석을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.', 'error'); return; }
          var nNext = clone(nCur);
          nNext.resolved = actionEl.checked ? '예' : '';
          actions.saveNote(nNext, clone(nCur));
          return;
        }
        if (act === 'goto-item') {
          var gPid = actionEl.getAttribute('data-project');
          var gKey = actionEl.getAttribute('data-key');
          var gItem = actionEl.getAttribute('data-item-id');
          var gNotes = actionEl.getAttribute('data-notes');
          state.selectedProject = gPid;
          if (gKey) { state.itemsOpen[gKey] = true; }
          if (gNotes) { state.notesOpen[gNotes] = true; }
          else if (gItem) { state.notesOpen[gItem] = true; }
          goTab('A');
          render();
          try {
            var target = gItem ? document.querySelector('#screen-A [data-item-row="' + gItem + '"]') : document.querySelector('#screen-A [data-items="' + gKey + '"]');
            if (target && target.scrollIntoView) { target.scrollIntoView({ block: 'center' }); }
          } catch (e) { /* 무시 */ }
          return;
        }
        if (act === 'form-cancel') { actions.closeForm(); return; }
        if (act === 'form-save') { actions.saveForm(); return; }
        if (act === 'delete-row' || act === 'form-delete') {
          // 1차 클릭 → 2단계 확인(브라우저 대화상자 미사용). 불가 사유가 있으면 토스트만
          var dTable = actionEl.getAttribute('data-table'), dKey = actionEl.getAttribute('data-key');
          var dIdx = S.TABLES[dTable] ? S.findRow(dTable, state.data[dTable] || [], parseKey(dTable, dKey)) : -1;
          if (dIdx < 0) { toast('행을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.', 'error'); return; }
          var dChk = S.deleteCheck(dTable, state.data[dTable][dIdx], state.data);
          if (!dChk.ok) { toast(dChk.reason, 'error'); render(); return; }
          state.pendingConfirm = confirmKey(act, dTable, dKey);
          render();
          return;
        }
        if (act === 'effort-open') {
          loadEffort(actionEl.getAttribute('data-member'), actionEl.getAttribute('data-week'));
          goTab('C');
          render();
          try { window.scrollTo(0, 0); } catch (e) { /* 무시 */ }
          return;
        }
        if (act === 'effort-add-row') {
          if (!state.effort || !state.effort.member || !state.effort.week) { toast('팀원과 주차를 먼저 고르세요.', 'error'); return; }
          state.effort.rows.push({ projectId: '', md: '', memo: '' });
          render(); return;
        }
        if (act === 'effort-remove-row') {
          if (state.effort) { state.effort.rows.splice(Number(actionEl.getAttribute('data-index')), 1); }
          render(); return;
        }
        if (act === 'effort-save') { actions.saveEffortWeek(); return; }
      }

      var cellEl = node.closest('[data-cell]');
      if (cellEl) {
        var parts = String(cellEl.getAttribute('data-cell')).split('|');
        state.selectedCell = { member: parts[0], month: parts[1] };
        var gotoB = cellEl.getAttribute('data-goto');
        if (gotoB) { goTab(gotoB); }
        render(); return;
      }

      var burnEl = node.closest('[data-burn]');
      if (burnEl) {
        state.burnProject = burnEl.getAttribute('data-burn');
        var gotoC = burnEl.getAttribute('data-goto');
        if (gotoC) { goTab(gotoC); }
        render(); return;
      }

      var projEl = node.closest('[data-project]');
      if (projEl) {
        var pid = projEl.getAttribute('data-project');
        state.selectedProject = pid;
        var goto2 = projEl.getAttribute('data-goto');
        if (goto2) {
          if (goto2 === 'B') { loadEditRows(pid); }
          goTab(goto2);
        }
        render(); return;
      }

      var gotoEl = node.closest('[data-goto]');
      if (gotoEl) { goTab(gotoEl.getAttribute('data-goto')); return; }
    });

    /** 표 행 입력(배정 편집 · 공수 입력) → 상태에 역기록. 재렌더 없음 */
    function syncRowInput(t) {
      var row = t.getAttribute('data-row');
      var field = t.getAttribute('data-field');
      if (row === null || row === undefined || !field) { return false; }
      var inEffort = t.closest && t.closest('#effort-editor');
      var list = inEffort ? (state.effort ? state.effort.rows : []) : state.editRows;
      var r = list[Number(row)];
      if (r) { r[field] = t.value; }
      if (inEffort && field === 'md') {
        // 합계만 자리에서 갱신(재렌더 없음)
        var total = 0;
        list.forEach(function (x) { var n = Number(x.md); if (isFinite(n)) { total += n; } });
        var tt = el('effort-total');
        if (tt) { tt.textContent = '합계 ' + fmtMd(total) + ' 공수 · ' + list.length + '행'; }
      }
      return true;
    }
    /** 편집 폼 입력 → state.form.values / options 에 역기록. 재렌더 없음 */
    function syncFormInput(t) {
      var key = t.getAttribute('data-form-field');
      if (key && state.form) {
        state.form.values[key] = t.value;
        if (key === 'color') {
          var chip = t.parentNode && t.parentNode.querySelector && t.parentNode.querySelector('.tb-color-chip');
          if (chip) { chip.style.background = /^#[0-9A-Fa-f]{6}$/.test(t.value) ? t.value : 'transparent'; }
        }
        return true;
      }
      var opt = t.getAttribute('data-form-option');
      if (opt && state.form) {
        if (!state.form.options) { state.form.options = {}; }
        state.form.options[opt] = !!t.checked;
        return true;
      }
      return false;
    }

    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) { return; }
      if (t.id === 'assign-project') { loadEditRows(t.value); render(); return; }
      if (t.id === 'heat-only-assigned') { state.heatOnlyAssigned = !!t.checked; render(); return; }
      if (t.id === 'block-part') {
        // 5턴: 블럭 추가 창의 파트를 바꾸면 그 파트 카탈로그로 칩을 다시 그린다(체크는 초기화)
        if (state.blockPicker) { state.blockPicker.part = t.value; state.blockPicker.checked = {}; render(); }
        return;
      }
      if (t.id === 'effort-member' || t.id === 'effort-week') {
        var em = el('effort-member'), ew = el('effort-week');
        loadEffort(em ? em.value : '', ew ? ew.value : '');
        render();
        return;
      }
      if (syncFormInput(t)) { return; }
      syncRowInput(t);
    });
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) { return; }
      if (syncFormInput(t)) { return; }
      syncRowInput(t);
    });

    window.addEventListener('hashchange', function () {
      var id = String(window.location.hash || '').replace('#', '').toUpperCase();
      if (/^[A-E]$/.test(id) && id !== state.tab) { goTab(id); }
    });
  }

  /* ================================================================
   * 14. 초기화
   * ================================================================ */

  function fatal(message, detail) {
    var host = el('app') || document.body;
    host.innerHTML = '<div class="tb-fatal"><h2>화면을 불러오지 못했습니다</h2>' +
      '<p>' + esc(message) + '</p>' +
      (detail ? '<p class="cap">' + esc(detail) + '</p>' : '') +
      '<p>시트가 연결된 화면이라면 [팀 보드 → 초기 설정 실행]을 먼저 실행했는지 확인하세요.</p></div>';
  }

  function boot() {
    try {
      if (!M) { throw new Error('산식 모듈(metrics)이 로드되지 않았습니다.'); }
      if (!S) { throw new Error('편집 계약 모듈(schema)이 로드되지 않았습니다.'); }
      buildTabs();
      provider = pickProvider();
      var initial = String(window.location.hash || '').replace('#', '').toUpperCase();
      if (/^[A-E]$/.test(initial)) { state.tab = initial; }

      provider.getBootstrap().then(function (data) {
        if (!data || !data.meta) { throw new Error('데이터 형식이 올바르지 않습니다.'); }
        // 5턴: 파트 필터는 사람마다 기억(localStorage) — 목록에 없는 값이면 전체
        try { state.part = String(window.localStorage.getItem('tb.part') || ''); } catch (e) { state.part = ''; }
        adoptData(data);
        state.filters.from = M.monthAdd(M.monthKey(state.today), -2);
        state.filters.to = M.monthAdd(M.monthKey(state.today), 5);
        if (state.data.projects.length) {
          state.selectedProject = state.data.projects[0].id;
          loadEditRows(state.data.projects[0].id);
        }
        buildFilters();
        bindEvents();
        render();
        el('app').removeAttribute('hidden');
        el('loading').hidden = true;

        window.TeamBoard = {
          state: state,
          provider: provider,
          metrics: M,
          schema: S,
          goTab: goTab,
          render: render,
          actions: actions
        };
      })['catch'](function (e) {
        fatal('데이터를 불러오지 못했습니다.', e && e.message ? e.message : String(e));
      });
    } catch (e) {
      fatal('초기화 중 오류가 발생했습니다.', e && e.message ? e.message : String(e));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
