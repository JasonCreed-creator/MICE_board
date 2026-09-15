// scripts/render-check.js — 실렌더 게이트 (Playwright 대체)
// Chrome/Edge 헤드리스를 DevTools 프로토콜로 직접 구동한다. 외부 패키지 없음 (Node 22 내장 WebSocket 사용).
//
// 하는 일
//   1. preview/dashboard-preview.html 을 열고 콘솔 오류·예외를 수집 (window.confirm / alert 호출은 즉시 오류로 잡는다)
//   2. 탭 A~E 를 순회하며 DOM 검증(핵심 지표·차트·경고 목록·산점도 원 개수·성과표) + 전체 페이지 스크린샷 저장
//      → preview/screenshots/A.png … E.png (1920 라이트) · A-1280.png … (1280 라이트) · A-dark.png … (1920 다크)
//   3. 수치 대조(3.1 §5-5): 2026-09 실적 매출·예정 매출 / 2027-02 0 / P-2026-004 공수당 매출 "—"
//   4. 필터 게이트(3.1 M-3): 유형 필터 ① 적용 후 히트맵 팀원2|2026-11 이 여전히 과부하, E 과부하 1건, 배지 표시 → 초기화
//   5. mock 모드 쓰기 3경로 — 표준 마일스톤 생성·완료 처리는 실제 버튼 클릭 → 2단계 확인(취소/확인) 경로(3.1 m-2), 배정 저장은 actions
//   5b. 4턴 쓰기 게이트 3-4~3-12 — 프로젝트 추가/수정/삭제(연쇄) · 마일스톤 추가/수정/삭제 · 정산 입력 · 팀원 추가/삭제/삭제 거부 ·
//       공수 주간 입력 · 최근 변경 목록 · 새로고침 (전부 실제 버튼 클릭 + input/change 이벤트 경로, 삭제는 2단계 확인 경유)
//       → 스크린샷 form-project.png(프로젝트 폼) · effort-editor.png(공수 입력) 추가
//   5c. 5턴 쓰기 게이트 3-13~3-18 — 블럭 추가(카탈로그 → 세부 항목 + 첫 주석 · 재실행 건너뜀) · 담당 지정 → 배정 자동 행(B "자동" 배지 · 히트맵 · overlaps 배지) ·
//       주석 남기기/해결 · 세부 항목 삭제(주석 연쇄 · 자동 행 갱신) · E 핵심 항목 미배정/미해결 목록 · 마일스톤 삭제 거부(세부 항목 있음) · 파트 필터
//       → 스크린샷 items-open.png(세부 항목 펼침) · block-picker.png(블럭 추가 창) 추가
//   6. 결과를 preview/screenshots/render-report.json 에 기록하고, 오류가 있으면 종료 코드 1
//
// 실행: node scripts/render-check.js   (node 가 PATH 에 없으면 전체 경로로)
// 브라우저 경로를 바꾸려면 환경변수 CHROME_PATH 지정

'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW = path.join(ROOT, 'preview', 'dashboard-preview.html');
const OUT_DIR = path.join(ROOT, 'preview', 'screenshots');
const PORT = 9333;
const TABS = ['A', 'B', 'C', 'D', 'E'];
const TYPE1 = '① 리멤버 MICE 솔루션';

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function fileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- DevTools 프로토콜 최소 클라이언트 ----------
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pending = new Map();
    const listeners = [];
    ws.onopen = () => resolve(client);
    ws.onerror = () => reject(new Error('DevTools WebSocket 연결 실패'));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    };
    const client = {
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { try { ws.close(); } catch (_) { /* 무시 */ } },
    };
  });
}

async function waitForTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) { /* 아직 준비 안 됨 */ }
    await sleep(200);
  }
  throw new Error('브라우저 디버그 포트가 열리지 않았습니다');
}

// 페이지 안에서 식을 평가하고 JSON 값으로 돌려받는다
async function evalJson(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => { try { const v = await (${expression}); return JSON.stringify(v === undefined ? null : v); } catch (e) { return JSON.stringify({ __error: String(e && e.stack || e) }); } })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const v = JSON.parse(r.result.value);
  if (v && v.__error) throw new Error('페이지 평가 오류: ' + v.__error);
  return v;
}

// 셀렉터로 찾은 첫 요소를 클릭한다(실제 사용자 경로). 없으면 false
async function clickSel(cdp, selector) {
  return evalJson(cdp, `(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return false; n.click(); return true; })()`);
}

// 입력칸·선택칸에 값을 넣고 사용자 타이핑과 같은 input/change 이벤트를 보낸다. 없으면 false. select 는 넣은 값이 목록에 있어야 한다
async function setInput(cdp, selector, value) {
  return evalJson(cdp, `(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return false;
    n.value = ${JSON.stringify(String(value))};
    n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true }));
    return n.value === ${JSON.stringify(String(value))}; })()`);
}

// 4턴 쓰기 게이트가 자주 보는 개수 묶음
const COUNTS = `(() => { const d = window.TeamBoard.state.data; return {
  projects: d.projects.length, milestones: d.milestones.length, settlements: d.settlements.length,
  members: d.members.length, effortLogs: d.effortLogs.length, history: (d.history || []).length,
  items: (d.items || []).length, notes: (d.notes || []).length, assignments: d.assignments.length,
  formOpen: !!document.querySelector('#edit-form .tb-form'),
}; })()`;

// 5턴: 세부 항목 하나를 (프로젝트·마일스톤·블럭)으로 찾는다
function findItemExpr(pid, ms, block) {
  return `(window.TeamBoard.state.data.items.find(it => it.projectId === ${JSON.stringify(pid)} && it.milestone === ${JSON.stringify(ms)} && it.block === ${JSON.stringify(block)}) || null)`;
}
// 5턴: 프로젝트의 배정 자동 행(비고 = 자동(세부항목))
function autoRowsExpr(pid) {
  return `window.TeamBoard.state.data.assignments.filter(a => a.projectId === ${JSON.stringify(pid)} && a.note === window.TeamBoard.schema.AUTO_ASSIGN_NOTE).map(a => ({ id: a.id, member: a.member, role: a.role, plannedMd: a.plannedMd, start: a.start, end: a.end }))`;
}

async function screenshot(cdp, file, width) {
  const metrics = await cdp.send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const height = Math.min(Math.ceil(size.height), 6000);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: false });
  return { file: path.relative(ROOT, file), width, height };
}

// ---------- 탭별 DOM 검증 (테스트 훅: data-tab / #screen-X / data-kpi / data-chart / data-warning / data-item / data-cell) ----------
const DOM_CHECKS = {
  A: `(() => {
    const s = document.querySelector('#screen-A');
    return {
      visible: !!s && s.offsetHeight > 0,
      kpiCount: document.querySelectorAll('[data-kpi]').length,
      timeline: !!document.querySelector('[data-chart="timeline"]'),
      cards: document.querySelectorAll('#screen-A .tb-proj-card').length,
    };
  })()`,
  B: `(() => {
    const s = document.querySelector('#screen-B');
    const over = [...document.querySelectorAll('#screen-B [data-cell][data-level="over"]')].map(e => e.getAttribute('data-cell'));
    return {
      visible: !!s && s.offsetHeight > 0,
      heatmap: !!document.querySelector('[data-chart="heatmap"]'),
      cells: document.querySelectorAll('#screen-B [data-cell]').length,
      overCells: over,
      saveButton: !!document.querySelector('[data-action="save-assignments"]'),
      onlyAssignedToggle: (document.getElementById('heat-only-assigned') || {}).checked === true,
    };
  })()`,
  C: `(() => {
    const s = document.querySelector('#screen-C');
    return {
      visible: !!s && s.offsetHeight > 0,
      burn: !!document.querySelector('[data-chart="burn"]'),
      stack: !!document.querySelector('[data-chart="stack"]'),
      weekly: !!document.querySelector('[data-chart="weekly"]'),
    };
  })()`,
  D: `(() => {
    const s = document.querySelector('#screen-D');
    const row004 = document.querySelector('#screen-D tr[data-project="P-2026-004"]');
    const tds = row004 ? [...row004.querySelectorAll('td')].map(td => td.textContent.replace(/\\s+/g, ' ').trim()) : [];
    const heads = [...document.querySelectorAll('#screen-D table thead th')].map(th => th.textContent.trim());
    return {
      visible: !!s && s.offsetHeight > 0,
      scatter: !!document.querySelector('[data-chart="scatter"]'),
      scatterCircles: document.querySelectorAll('#screen-D [data-chart="scatter"] circle').length,
      scatterNote: (document.querySelector('#screen-D [data-scatter-note]') || {}).textContent || '',
      inputOutput: !!document.querySelector('[data-chart="inputOutput"]'),
      series: [...document.querySelectorAll('#screen-D [data-chart="inputOutput"] path[data-series]')].map(p => p.getAttribute('data-series')),
      tableRows: document.querySelectorAll('#screen-D table tbody tr').length,
      mutedRows: document.querySelectorAll('#screen-D table tbody tr.is-muted').length,
      headers: heads,
      row004: tds,
    };
  })()`,
  E: `(() => {
    const s = document.querySelector('#screen-E');
    const items = (k) => [...document.querySelectorAll('[data-warning="' + k + '"] [data-item]')].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
    return {
      visible: !!s && s.offsetHeight > 0,
      upcoming: items('upcoming'), delayed: items('delayed'), missingLog: items('missingLog'),
      unassigned: items('unassigned'), overload: items('overload'), burnOver: items('burnOver'),
      keyUnassigned: items('keyUnassigned'), openNotes: items('openNotes'),
      completeButtons: document.querySelectorAll('[data-action="complete-milestone"]').length,
    };
  })()`,
};

async function main() {
  if (!fs.existsSync(PREVIEW)) throw new Error('preview/dashboard-preview.html 이 없습니다. 먼저 node scripts/build.js 를 실행하세요');
  const browser = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) throw new Error('Chrome/Edge 실행 파일을 찾지 못했습니다 (CHROME_PATH 환경변수로 지정)');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamboard-chrome-'));
  const proc = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1920,1080', '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });

  const report = { browser, startedAt: new Date().toISOString(), consoleErrors: [], mockWrites: [], tabs: {}, numbers: {}, filterGate: {}, screenshots: [], writePaths: {}, failures: [] };
  const fail = (msg) => { report.failures.push(msg); console.error('  ✗ ' + msg); };
  const ok = (msg) => console.log('  ✓ ' + msg);

  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    // 브라우저 대화상자(confirm·alert)는 금지 — 호출되면 예외로 잡아 콘솔 오류로 집계한다 (3.1 m-2)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "window.confirm = window.alert = window.prompt = function () { throw new Error('브라우저 대화상자(confirm/alert/prompt)는 사용 금지입니다'); };",
    });
    cdp.on((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type));
        const text = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (msg.params.type === 'error') report.consoleErrors.push('console.error: ' + text);
        if (/^\[mock write\]/.test(text)) report.mockWrites.push(text.slice(0, 200));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        report.consoleErrors.push('exception: ' + (d.exception && d.exception.description || d.text));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        report.consoleErrors.push('log: ' + msg.params.entry.text);
      }
    });

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    // 헤드리스 브라우저는 OS 테마(다크)를 그대로 따르므로 라이트를 명시적으로 강제한다
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    const loaded = new Promise((r) => cdp.on((m) => m.method === 'Page.loadEventFired' && r()));
    await cdp.send('Page.navigate', { url: fileUrl(PREVIEW) + '#A' });
    await loaded;

    // 앱 준비 대기
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      ready = await evalJson(cdp, `!!(window.TeamBoard && window.TeamBoard.state && document.querySelector('#screen-A'))`);
      if (!ready) await sleep(250);
    }
    if (!ready) fail('window.TeamBoard 가 준비되지 않았습니다 (앱 초기화 실패)');

    // ---- 1. 탭 순회: DOM 검증 + 1920 라이트 스크린샷 ----
    console.log('\n[1] 탭 A~E 실렌더 (1920 라이트)');
    for (const t of TABS) {
      await evalJson(cdp, `(window.TeamBoard.goTab('${t}'), true)`);
      await sleep(300);
      const dom = await evalJson(cdp, DOM_CHECKS[t]);
      report.tabs[t] = dom;
      if (!dom.visible) fail(`탭 ${t}: #screen-${t} 가 보이지 않음`);
      if (t === 'A' && dom.kpiCount < 4) fail('탭 A: 핵심 지표 카드 4개 미만');
      if (t === 'A' && !dom.timeline) fail('탭 A: 타임라인 차트 없음');
      if (t === 'B' && !dom.heatmap) fail('탭 B: 히트맵 없음');
      if (t === 'B' && !dom.overCells.some((c) => /팀원2\|2026-11/.test(c))) fail('탭 B: 팀원2 2026-11 과부하 셀 없음');
      if (t === 'B' && !dom.onlyAssignedToggle) fail('탭 B: "배정된 팀원만 보기" 스위치가 없거나 꺼져 있음');
      if (t === 'C' && !(dom.burn && dom.stack && dom.weekly)) fail('탭 C: 차트(소진·스택·주간) 누락');
      if (t === 'D') {
        if (!(dom.scatter && dom.inputOutput)) fail('탭 D: 산점도 또는 투입-성과 차트 누락');
        if (dom.scatterCircles !== 1) fail(`탭 D: 산점도 원 개수 ${dom.scatterCircles} (정산 완료 1건이어야 함) — M-2`);
        if (!/정산 전 프로젝트 \d+건/.test(dom.scatterNote)) fail('탭 D: 산점도 아래 "정산 전 프로젝트 N건" 각주 없음 — M-2');
        if (!(dom.headers.length === 9 && dom.headers[2] === '계약금액' && dom.headers[3] === '정산 매출' && /실마진/.test(dom.headers[4]))) fail('탭 D: 성과표 열 구성이 지시와 다름 — M-1: ' + dom.headers.join(' | '));
        if (dom.row004[6] !== '—') fail(`탭 D: P-2026-004 공수당 매출이 "—" 가 아님 (${dom.row004[6]}) — M-1`);
        if (dom.mutedRows !== 4) fail(`탭 D: 정산 전 행(흐림) ${dom.mutedRows}개 (4개여야 함)`);
        if (!(dom.series.includes('actualRevenue') && dom.series.includes('plannedRevenue') && dom.series.includes('actualMargin'))) fail('탭 D: 월별 차트 선 3개(실적·예정·실마진) 누락');
      }
      if (t === 'E') {
        if (!dom.overload.some((x) => /팀원2/.test(x))) fail('탭 E: 과부하 경고에 팀원2 없음');
        if (dom.unassigned.length < 1) fail('탭 E: 미배정 경고 없음');
        if (dom.delayed.length < 1) fail('탭 E: 지연 경고 없음');
        if (!dom.missingLog.some((x) => /팀원5/.test(x) && /2026-08-31/.test(x))) fail('탭 E: 미기록 경고에 팀원5 · 기준 주차 2026-08-31 없음 — m-1');
        // 5턴: 샘플 기준 핵심 항목 미배정 1건(P-2026-003 연사·패널 섭외) · 미해결 질문·요청 2건(N-000001 요청 · N-000003 질문)
        if (!(dom.keyUnassigned.length === 1 && /연사·패널 섭외/.test(dom.keyUnassigned[0]) && /가상 브랜드 런칭 쇼케이스/.test(dom.keyUnassigned[0]))) fail('탭 E: 핵심 항목 미배정이 1건(연사·패널 섭외)이 아님: ' + JSON.stringify(dom.keyUnassigned));
        if (!(dom.openNotes.length === 2 && /섭외비 예산/.test(dom.openNotes[0]) && /수용 인원/.test(dom.openNotes[1]))) fail('탭 E: 미해결 질문·요청이 최신순 2건(질문 → 요청)이 아님: ' + JSON.stringify(dom.openNotes));
      }
      report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, `${t}.png`), 1920));
      ok(`탭 ${t} 렌더 · ${JSON.stringify(dom).slice(0, 160)}`);
    }

    // ---- 1b. 수치 대조 (3.1 §5-5) ----
    console.log('\n[1b] 수치 대조');
    const nums = await evalJson(cdp, `(() => {
      const TB = window.TeamBoard; const out = TB.metrics.teamOutputByMonth(TB.state.view);
      const kpi = (k) => (document.querySelector('[data-kpi="' + k + '"] .k-value') || {}).textContent || '';
      return { sep: out['2026-09'] || null, feb: out['2027-02'] || null, eventsThisMonth: kpi('eventsThisMonth'), teamUtil: kpi('teamPlannedUtil') };
    })()`);
    report.numbers = nums;
    if (!(nums.sep && nums.sep.actualRevenue === 68000000 && nums.sep.plannedRevenue === 92000000 && nums.sep.actualMargin === 20400000)) fail('2026-09 실적 6,800만 · 예정 9,200만 · 실마진 2,040만 불일치: ' + JSON.stringify(nums.sep));
    else ok('2026-09 실적 매출 6,800만 원 · 예정 매출 9,200만 원 · 실마진 2,040만 원');
    if (nums.feb && (nums.feb.actualRevenue !== 0 || nums.feb.plannedRevenue !== 0)) fail('2027-02 에 견적 금액이 잡힘: ' + JSON.stringify(nums.feb));
    else ok('2027-02 실적·예정 모두 0(견적 제외)');
    if (!/^2/.test(nums.eventsThisMonth)) fail('핵심 지표 이달 행사가 2건이 아님: ' + nums.eventsThisMonth);
    else ok('핵심 지표 이달 행사 2건(견적·드롭 제외)');

    // ---- 1c. 필터 게이트 (3.1 M-3) ----
    console.log('\n[1c] 필터 게이트 — 유형 ① 적용');
    await evalJson(cdp, `(() => { const s = document.getElementById('f-type'); s.value = ${JSON.stringify(TYPE1)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
    await sleep(300);
    const fg = await evalJson(cdp, `(() => {
      const b = document.getElementById('filter-badge');
      const cell = document.querySelector('#screen-B [data-cell="팀원2|2026-11"]');
      const kpi = (document.querySelector('[data-kpi="teamPlannedUtil"] .k-value') || {}).textContent || '';
      return {
        badgeHidden: b ? b.hidden : null, badgeText: b ? b.textContent : '',
        cellLevel: cell ? cell.getAttribute('data-level') : null, cellText: cell ? cell.textContent.replace(/\\s+/g, ' ').trim() : '',
        overload: [...document.querapplyAll ? [] : document.querySelectorAll('[data-warning="overload"] [data-item]')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()),
        missing: [...document.querySelectorAll('[data-warning="missingLog"] [data-item]')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()),
        teamUtil: kpi,
        cardsA: document.querySelectorAll('#screen-A .tb-proj-card').length,
        rowsD: document.querySelectorAll('#screen-D table tbody tr').length,
      };
    })()`);
    report.filterGate.applied = fg;
    if (fg.badgeHidden !== false || !/필터 적용 중 · 프로젝트 2 \/ 5/.test(fg.badgeText)) fail('필터 배지 미표시 또는 문구 불일치: ' + JSON.stringify({ hidden: fg.badgeHidden, text: fg.badgeText }));
    else ok('배지 "' + fg.badgeText + '"');
    if (fg.cellLevel !== 'over' || !/110%/.test(fg.cellText)) fail('필터 적용 후 팀원2|2026-11 셀이 과부하(110%) 가 아님: ' + fg.cellLevel + ' / ' + fg.cellText);
    else ok('히트맵 팀원2|2026-11 여전히 over · 110%');
    if (!(fg.overload.length === 1 && /팀원2/.test(fg.overload[0]))) fail('필터 적용 후 E 과부하 경고가 1건(팀원2)이 아님: ' + JSON.stringify(fg.overload));
    else ok('E 과부하 1건(팀원2) 유지');
    if (!fg.missing.some((x) => /팀원5/.test(x))) fail('필터 적용 후 E 미기록(팀원5) 사라짐');
    if (!/^33%/.test(fg.teamUtil)) fail('필터 적용 후 팀 계획 가동률이 33% 에서 바뀜: ' + fg.teamUtil);
    else ok('팀 계획 가동률 33% 유지');
    if (!(fg.cardsA === 2 && fg.rowsD === 2)) fail(`프로젝트 단위 화면은 필터가 적용되어야 함 — A 카드 ${fg.cardsA}, D 행 ${fg.rowsD} (각 2 기대)`);
    else ok('A 카드 2 · D 행 2 (프로젝트 단위 지표는 필터 적용)');
    await clickSel(cdp, '[data-action="reset-filters"]');
    await sleep(300);
    const fr = await evalJson(cdp, `(() => { const b = document.getElementById('filter-badge'); return { badgeHidden: b ? b.hidden : null, cardsA: document.querySelectorAll('#screen-A .tb-proj-card').length }; })()`);
    report.filterGate.reset = fr;
    if (!(fr.badgeHidden === true && fr.cardsA === 5)) fail('필터 초기화 후 배지 숨김·카드 5 복원 실패: ' + JSON.stringify(fr));
    else ok('필터 초기화 → 배지 숨김 · 카드 5');

    // ---- 1d. 타임라인 날짜 툴팁 (2026-09-14 기획자님 요청) ----
    console.log('\n[1d] 타임라인 날짜 툴팁');
    await evalJson(cdp, '(() => { window.TeamBoard.goTab("A"); return true; })()');
    const tipRes = await evalJson(cdp, '(() => { const rows = document.querySelectorAll("#screen-A svg g.hit[data-tip]"); if (!rows.length) return { rows: 0 }; const first = rows[0]; first.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 300, clientY: 300 })); const tip = document.querySelector(".tb-tip"); const shown = !!tip && !tip.hidden && getComputedStyle(tip).display !== "none"; const text = tip ? tip.textContent : ""; first.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); return { rows: rows.length, shown: shown, text: text, hiddenAfter: !!tip && tip.hidden }; })()');
    report.timelineTip = tipRes;
    if (!(tipRes.rows > 0)) fail('타임라인 막대에 data-tip 없음');
    else if (!(tipRes.shown && /착수 \d{4}-\d{2}-\d{2}/.test(tipRes.text) && /행사 \d{4}-\d{2}-\d{2}/.test(tipRes.text) && /정산 \d{4}-\d{2}-\d{2}/.test(tipRes.text))) fail('타임라인 툴팁이 뜨지 않거나 날짜 3개(착수·행사·정산)가 없음: ' + JSON.stringify(tipRes));
    else if (!tipRes.hiddenAfter) fail('타임라인 툴팁이 마우스가 벗어난 뒤에도 남아 있음');
    else ok('타임라인 툴팁: 막대 ' + tipRes.rows + '개 · "' + tipRes.text + '" · 벗어나면 숨김');

    // ---- 2. 1280 라이트 · 1920 다크 ----
    console.log('\n[2] 추가 폭·다크 스크린샷');
    for (const t of TABS) {
      await evalJson(cdp, `(window.TeamBoard.goTab('${t}'), true)`);
      await sleep(200);
      report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, `${t}-1280.png`), 1280));
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    for (const t of TABS) {
      await evalJson(cdp, `(window.TeamBoard.goTab('${t}'), true)`);
      await sleep(200);
      report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, `${t}-dark.png`), 1920));
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    ok(`스크린샷 ${report.screenshots.length}장 저장`);

    // ---- 3. 쓰기 3경로 (mock) ----
    console.log('\n[3] 쓰기 3경로 (mock 모드) — 버튼 클릭 → 2단계 확인 경로');
    const before = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const w = window.TeamBoard.metrics.warnings(d, d.meta.today); return {
      milestones: d.milestones.length, assignments: d.assignments.length,
      quote: (d.projects.find(p => p.status === '견적') || {}).id,
      contract: (d.projects.find(p => p.status === '계약') || {}),
      delayed: w.delayed[0] || null, unassigned: w.unassigned.length, delayedCount: w.delayed.length,
    }; })()`);

    // 3-1 표준 마일스톤 생성 (견적 프로젝트: 아직 마일스톤 없음) — A 상세 패널 버튼 → 취소 → 다시 → 확인
    await evalJson(cdp, `(window.TeamBoard.state.selectedProject = ${JSON.stringify(before.quote)}, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
    await sleep(200);
    const s1 = { projectId: before.quote, milestonesBefore: before.milestones };
    s1.buttonShown = await evalJson(cdp, `!!document.querySelector('#screen-A [data-action="create-milestones"]')`);
    await clickSel(cdp, '#screen-A [data-action="create-milestones"]');
    await sleep(200);
    s1.afterFirstClick = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"]'), milestones: window.TeamBoard.state.data.milestones.length })`);
    await clickSel(cdp, '#screen-A [data-action="confirm-no"]');
    await sleep(200);
    s1.afterCancel = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"]'), buttonBack: !!document.querySelector('#screen-A [data-action="create-milestones"]'), milestones: window.TeamBoard.state.data.milestones.length })`);
    await clickSel(cdp, '#screen-A [data-action="create-milestones"]');
    await sleep(150);
    await clickSel(cdp, '#screen-A [data-action="confirm-yes"]');
    await sleep(500);
    s1.afterConfirm = await evalJson(cdp, `({ milestones: window.TeamBoard.state.data.milestones.length, buttonHidden: !document.querySelector('#screen-A [data-action="create-milestones"]'), completeNote: !!document.querySelector('#screen-A [data-milestones-complete]') })`);
    const r1b = await evalJson(cdp, `window.TeamBoard.actions.createStandardMilestones(${JSON.stringify(before.quote)})`);
    s1.rerun = r1b && { created: r1b.created.length, skipped: r1b.skipped.length };
    report.writePaths.createStandardMilestones = s1;
    if (!(s1.buttonShown && s1.afterFirstClick.confirmShown && s1.afterFirstClick.milestones === before.milestones)) fail('표준 마일스톤 생성: 1회 클릭에 확인 단계 없이 실행되었거나 버튼이 없음 — m-2');
    else ok('표준 마일스톤 생성: 1회 클릭 → 확인 단계 표시 · 아직 미실행');
    if (!(!s1.afterCancel.confirmShown && s1.afterCancel.buttonBack && s1.afterCancel.milestones === before.milestones)) fail('표준 마일스톤 생성: [취소] 후 원래 버튼으로 돌아오지 않음 — m-2');
    else ok('표준 마일스톤 생성: [취소] → 원래 버튼 복귀 · 미실행');
    if (!(s1.afterConfirm.milestones === before.milestones + 9)) fail(`표준 마일스톤 생성: [확인] 후 9건 생성되지 않음 (${before.milestones} → ${s1.afterConfirm.milestones})`);
    else ok(`표준 마일스톤 생성: [확인] → 9건 생성 (${before.milestones} → ${s1.afterConfirm.milestones})`);
    if (!(s1.afterConfirm.buttonHidden && s1.afterConfirm.completeNote)) fail('표준 마일스톤 생성: 전부 등록된 뒤 버튼이 숨겨지지 않음 — m-7');
    else ok('표준 마일스톤 생성: 전부 등록 → 버튼 숨김 · 안내 문구 표시 (m-7)');
    if (!(s1.rerun && s1.rerun.created === 0 && s1.rerun.skipped === 9)) fail('표준 마일스톤 생성: 재실행 시 중복 방지(skipped 9) 실패');
    else ok('표준 마일스톤 재실행: 0건 생성 · 9건 건너뜀');

    // 3-2 마일스톤 완료 처리 (E 지연 목록 버튼) — 취소 → 다시 → 확인
    if (before.delayed) {
      await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
      await sleep(200);
      const s2 = { target: before.delayed, delayedBefore: before.delayedCount };
      await clickSel(cdp, '[data-warning="delayed"] [data-action="complete-milestone"]');
      await sleep(200);
      s2.afterFirstClick = await evalJson(cdp, `({ confirmShown: !!document.querySelector('[data-warning="delayed"] [data-action="confirm-yes"]'), delayed: document.querySelectorAll('[data-warning="delayed"] [data-item]').length })`);
      await clickSel(cdp, '[data-warning="delayed"] [data-action="confirm-no"]');
      await sleep(200);
      s2.afterCancel = await evalJson(cdp, `({ confirmShown: !!document.querySelector('[data-warning="delayed"] [data-action="confirm-yes"]'), delayed: document.querySelectorAll('[data-warning="delayed"] [data-item]').length })`);
      await clickSel(cdp, '[data-warning="delayed"] [data-action="complete-milestone"]');
      await sleep(150);
      await clickSel(cdp, '[data-warning="delayed"] [data-action="confirm-yes"]');
      await sleep(500);
      s2.afterConfirm = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const m = d.milestones.find(x => x.projectId === ${JSON.stringify(before.delayed.projectId)} && x.name === ${JSON.stringify(before.delayed.name)}); return { delayed: document.querySelectorAll('[data-warning="delayed"] [data-item]').length, done: m ? m.done : null }; })()`);
      report.writePaths.completeMilestone = s2;
      if (!(s2.afterFirstClick.confirmShown && s2.afterFirstClick.delayed === before.delayedCount)) fail('완료 처리: 1회 클릭에 확인 단계 없이 실행됨 — m-2');
      else ok('완료 처리: 1회 클릭 → 확인 단계 표시 · 아직 미실행');
      if (!(!s2.afterCancel.confirmShown && s2.afterCancel.delayed === before.delayedCount)) fail('완료 처리: [취소] 후 상태가 복귀하지 않음 — m-2');
      else ok('완료 처리: [취소] → 원래 버튼 복귀 · 미실행');
      if (!(s2.afterConfirm.done && s2.afterConfirm.delayed === before.delayedCount - 1)) fail('완료 처리: [확인] 후 완료일 기록·지연 목록 감소 실패: ' + JSON.stringify(s2.afterConfirm));
      else ok(`완료 처리: [확인] → "${before.delayed.name}" 완료일 ${s2.afterConfirm.done} · 지연 ${before.delayedCount} → ${s2.afterConfirm.delayed}`);
    } else fail('마일스톤 완료 처리: 지연 항목이 없어 검증 불가');

    // 3-3 배정 저장 (미배정 '계약' 프로젝트에 팀원 1명 추가) — B 화면 사용자 경로: 프로젝트 선택 → 팀원 칩 클릭 → 계획 공수 입력 → 저장
    if (before.contract && before.contract.id) {
      const pid = before.contract.id;
      await evalJson(cdp, `(window.TeamBoard.goTab('B'), true)`);
      await evalJson(cdp, `(() => { const s = document.getElementById('assign-project'); s.value = ${JSON.stringify(pid)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
      await sleep(200);
      const s3 = { projectId: pid };
      s3.rowsBefore = await evalJson(cdp, `window.TeamBoard.state.editRows.length`);
      s3.chipShown = await evalJson(cdp, `!!document.querySelector('#screen-B [data-action="quick-add-member"][data-member="팀원3"]:not([disabled])')`);
      await clickSel(cdp, '#screen-B [data-action="quick-add-member"][data-member="팀원3"]');
      await sleep(200);
      s3.afterChip = await evalJson(cdp, `(() => { const rows = window.TeamBoard.state.editRows; const last = rows[rows.length - 1] || {};
        return { rows: rows.length, member: last.member, role: last.role, start: last.start, end: last.end, chipOn: !!document.querySelector('#screen-B [data-action="quick-add-member"][data-member="팀원3"].is-on') }; })()`);
      // 마지막 행의 계획 공수 입력칸에 4 를 입력(사용자 타이핑과 같은 input 이벤트)
      await evalJson(cdp, `(() => { const rows = window.TeamBoard.state.editRows; const i = rows.length - 1;
        const inp = document.querySelector('#screen-B [data-row="' + i + '"][data-field="plannedMd"]'); if (!inp) return false;
        inp.value = '4'; inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await clickSel(cdp, '#screen-B [data-action="save-assignments"]');
      await sleep(500);
      await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
      await sleep(300);
      const e3 = await evalJson(cdp, DOM_CHECKS.E);
      const total = await evalJson(cdp, `window.TeamBoard.state.data.assignments.length`);
      const ids = await evalJson(cdp, `window.TeamBoard.state.data.assignments.filter(a => a.projectId === ${JSON.stringify(pid)}).map(a => a.id)`);
      const saved3 = await evalJson(cdp, `window.TeamBoard.state.data.assignments.filter(a => a.projectId === ${JSON.stringify(pid)} && a.member === '팀원3')[0] || null`);
      Object.assign(s3, { assignmentsBefore: before.assignments, assignmentsAfter: total, ids, saved3, unassignedBefore: before.unassigned, unassignedAfterDom: e3.unassigned.length });
      report.writePaths.saveAssignments = s3;
      const idsOk = ids.length === s3.rowsBefore + 1 && ids.every((x) => /^A-\d{4}$/.test(x)) && new Set(ids).size === ids.length;
      if (!(s3.chipShown && s3.afterChip.rows === s3.rowsBefore + 1 && s3.afterChip.member === '팀원3' && s3.afterChip.role === '현장 운영' && s3.afterChip.start && s3.afterChip.end && s3.afterChip.chipOn)) fail('빠른 배정 칩: 클릭 후 행 추가·기본값(역할·기간)·✓ 표시 실패: ' + JSON.stringify(s3.afterChip));
      else ok(`빠른 배정 칩: 팀원3 클릭 → 행 추가(역할 ${s3.afterChip.role} · ${s3.afterChip.start}~${s3.afterChip.end}) · 칩 ✓`);
      if (!(saved3 && Number(saved3.plannedMd) === 4 && total === before.assignments + 1 && idsOk && e3.unassigned.length === before.unassigned - 1)) fail('배정 저장: 행 추가·ID 발급·미배정 경고 해제 중 실패: ' + JSON.stringify({ saved3, total, ids, unassigned: e3.unassigned.length }));
      else ok(`배정 저장: ${pid} ${ids.length}행 저장 · 배정 ${before.assignments} → ${total} · 미배정 ${before.unassigned} → ${e3.unassigned.length}`);
    } else fail('배정 저장: 계약 상태 프로젝트가 없어 검증 불가');

    if (report.mockWrites.length < 3) fail(`[mock write] 로그가 3건 미만 (${report.mockWrites.length}건)`);
    else ok(`[mock write] 로그 ${report.mockWrites.length}건`);

    // ======================================================================
    // 4턴 쓰기 게이트 확장 (3-4 ~ 3-11) — 편집 폼 · 삭제 2단계 확인 · 공수 주간 입력 · 최근 변경
    // ======================================================================

    // ---- 3-4 프로젝트 추가 (A 툴바 [새 프로젝트] → 폼 → 저장 · 표준 마일스톤 옵션 기본 켬) ----
    console.log('\n[3-4] 프로젝트 추가');
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    const b4 = await evalJson(cdp, COUNTS);
    // 새 ID 기대값 = P-YYYY-NNN(행사 시작일 연도 · 그 연도 최대 번호 + 1). 샘플에 P-2027-001 이 있으면 P-2027-002 가 맞다
    const expectedId = await evalJson(cdp, `(() => { let max = 0; window.TeamBoard.state.data.projects.forEach(p => { const m = /^P-2027-(\\d+)$/.exec(p.id || ''); if (m) max = Math.max(max, Number(m[1])); }); return 'P-2027-' + String(max + 1).padStart(3, '0'); })()`);
    const s4 = { before: b4, expectedId };
    await clickSel(cdp, '#screen-A [data-action="open-form"][data-table="projects"][data-mode="new"]');
    await sleep(200);
    s4.form = await evalJson(cdp, `(() => { const f = document.querySelector('#screen-A #edit-form .tb-form'); const opt = document.querySelector('#edit-form [data-form-option="createStandardMilestones"]');
      return { shown: !!f, table: f ? f.getAttribute('data-form-table') : null, mode: f ? f.getAttribute('data-form-mode') : null,
        fields: document.querySelectorAll('#edit-form [data-form-field]').length, optionChecked: opt ? opt.checked : null,
        idHidden: !document.querySelector('#edit-form [data-form-field="id"]') && !document.querySelector('#edit-form [data-form-readonly="id"]') }; })()`);
    if (!(s4.form.shown && s4.form.table === 'projects' && s4.form.mode === 'new' && s4.form.fields >= 12 && s4.form.optionChecked === true && s4.form.idHidden)) fail('프로젝트 추가: 폼이 열리지 않았거나 필드·옵션 구성이 다름: ' + JSON.stringify(s4.form));
    else ok(`프로젝트 추가: 폼 표시 · 필드 ${s4.form.fields}개 · 표준 마일스톤 옵션 기본 켬 · 자동 필드(ID) 숨김`);
    // 빈 폼 저장 → 선검증 오류가 카드 안에 표시되고 아무것도 저장되지 않아야 한다
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(200);
    s4.emptySave = await evalJson(cdp, `(() => { const e = document.querySelector('#edit-form .tb-form-error'); return { errorShown: !!e, items: e ? e.querySelectorAll('li').length : 0, text: e ? e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) : '', projects: window.TeamBoard.state.data.projects.length }; })()`);
    if (!(s4.emptySave.errorShown && s4.emptySave.items >= 1 && /행사명/.test(s4.emptySave.text) && s4.emptySave.projects === b4.projects)) fail('프로젝트 추가: 빈 폼 저장 시 선검증 오류가 카드 안에 표시되지 않음: ' + JSON.stringify(s4.emptySave));
    else ok(`프로젝트 추가: 빈 폼 저장 → 카드 안 오류 ${s4.emptySave.items}건(행사명 필수) · 미저장`);
    await setInput(cdp, '#edit-form [data-form-field="name"]', '게이트 신규 프로젝트');
    await setInput(cdp, '#edit-form [data-form-field="eventStart"]', '2027-03-10');
    await setInput(cdp, '#edit-form [data-form-field="eventEnd"]', '2027-03-10');
    report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, 'form-project.png'), 1920));
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(500);
    const a4 = await evalJson(cdp, COUNTS);
    s4.after = a4;
    s4.saved = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const p = d.projects.find(x => x.name === '게이트 신규 프로젝트') || null;
      return { id: p ? p.id : null, status: p ? p.status : null, type: p ? p.type : null, createdAt: p ? p.createdAt : null,
        settlement: p ? !!d.settlements.find(s => s.projectId === p.id) : false,
        milestones: p ? d.milestones.filter(m => m.projectId === p.id).length : 0,
        history0: (d.history || [])[0] || null, selected: window.TeamBoard.state.selectedProject,
        card: p ? !!document.querySelector('#screen-A .tb-proj-card[data-project="' + p.id + '"]') : false }; })()`);
    report.writePaths.saveRowProjectNew = s4;
    if (!(a4.projects === b4.projects + 1 && a4.settlements === b4.settlements + 1 && a4.milestones === b4.milestones + 9 && !a4.formOpen)) fail(`프로젝트 추가: 저장 후 개수 불일치 (프로젝트 ${b4.projects}→${a4.projects} · 정산 ${b4.settlements}→${a4.settlements} · 마일스톤 ${b4.milestones}→${a4.milestones} · 폼 닫힘 ${!a4.formOpen})`);
    else ok(`프로젝트 추가: 프로젝트 +1 · 정산 +1 · 마일스톤 +9 · 폼 닫힘`);
    if (!(s4.saved.id === expectedId && s4.saved.createdAt && s4.saved.settlement && s4.saved.milestones === 9 && s4.saved.card && s4.saved.selected === expectedId)) fail('프로젝트 추가: 새 ID·등록일·정산 행·카드 표시 불일치: ' + JSON.stringify(s4.saved));
    else ok(`프로젝트 추가: 새 ID ${s4.saved.id} · 등록일 ${s4.saved.createdAt} · 카드 표시 · 상세 선택`);
    if (!(s4.saved.history0 && s4.saved.history0.action === '추가' && s4.saved.history0.sheet === '프로젝트' && s4.saved.history0.key === expectedId && a4.history === b4.history + 1)) fail('프로젝트 추가: 변경이력 앞에 "추가" 1건이 끼워지지 않음: ' + JSON.stringify(s4.saved.history0));
    else ok(`프로젝트 추가: 변경이력 앞 "추가" · ${s4.saved.history0.user} · ${s4.saved.history0.at}`);
    const newId = s4.saved.id || expectedId;

    // ---- 3-5 프로젝트 수정 (상세 패널 [프로젝트 수정] → 계약금액 12,345,678 → 저장) ----
    console.log('\n[3-5] 프로젝트 수정');
    await evalJson(cdp, `(window.TeamBoard.state.selectedProject = ${JSON.stringify(newId)}, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const s5 = { projectId: newId };
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="projects"][data-mode="edit"][data-key="${newId}"]`);
    await sleep(200);
    s5.form = await evalJson(cdp, `(() => { const f = document.querySelector('#edit-form .tb-form'); const ro = document.querySelector('#edit-form [data-form-readonly="id"]');
      const name = document.querySelector('#edit-form [data-form-field="name"]');
      return { shown: !!f, mode: f ? f.getAttribute('data-form-mode') : null, idReadonly: ro ? ro.textContent.trim() : null, name: name ? name.value : null,
        deleteButton: !!document.querySelector('#edit-form [data-action="form-delete"]') }; })()`);
    if (!(s5.form.shown && s5.form.mode === 'edit' && s5.form.idReadonly === newId && s5.form.name === '게이트 신규 프로젝트' && s5.form.deleteButton)) fail('프로젝트 수정: 수정 폼(읽기 전용 ID · 값 채움 · 삭제 버튼) 불일치: ' + JSON.stringify(s5.form));
    else ok('프로젝트 수정: 수정 폼 표시 · ID 읽기 전용 · 기존 값 채움 · 삭제 버튼');
    await setInput(cdp, '#edit-form [data-form-field="contractAmount"]', '12345678');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(500);
    s5.after = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const p = d.projects.find(x => x.id === ${JSON.stringify(newId)}) || {};
      const card = document.querySelector('#screen-A .tb-proj-card[data-project="' + p.id + '"] .p-amount');
      return { contractAmount: p.contractAmount, projects: d.projects.length, history0: (d.history || [])[0] || null, cardAmount: card ? card.textContent.trim() : null, formOpen: !!document.querySelector('#edit-form .tb-form') }; })()`);
    report.writePaths.saveRowProjectEdit = s5;
    if (!(s5.after.contractAmount === 12345678 && s5.after.projects === a4.projects && !s5.after.formOpen)) fail('프로젝트 수정: 계약금액이 상태에 반영되지 않음: ' + JSON.stringify(s5.after));
    else ok('프로젝트 수정: 계약금액 12,345,678 반영 · 행 수 유지 · 폼 닫힘');
    if (!(s5.after.history0 && s5.after.history0.action === '수정' && /계약금액\(원\)/.test(s5.after.history0.summary || ''))) fail('프로젝트 수정: 변경이력 "수정" 요약에 "계약금액(원)" 없음: ' + JSON.stringify(s5.after.history0));
    else ok(`프로젝트 수정: 변경이력 "수정" · ${String(s5.after.history0.summary).split('\n')[0]}`);
    if (!/1,235만/.test(s5.after.cardAmount || '')) fail('프로젝트 수정: A 카드 금액이 "계약 1,235만 원" 으로 바뀌지 않음: ' + s5.after.cardAmount);
    else ok(`프로젝트 수정: A 카드 금액 "${s5.after.cardAmount}"`);

    // ---- 3-6 마일스톤 추가 / 수정 / 삭제(2단계 확인) ----
    console.log('\n[3-6] 마일스톤 추가 · 수정 · 삭제');
    const s6 = { projectId: newId, milestonesBefore: a4.milestones };
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="milestones"][data-mode="new"][data-project="${newId}"]`);
    await sleep(200);
    s6.form = await evalJson(cdp, `(() => { const pid = document.querySelector('#edit-form [data-form-field="projectId"]'); return { shown: !!document.querySelector('#edit-form .tb-form[data-form-table="milestones"]'), projectId: pid ? pid.value : null, disabled: pid ? pid.disabled : null }; })()`);
    if (!(s6.form.shown && s6.form.projectId === newId && s6.form.disabled === true)) fail('마일스톤 추가: 폼의 프로젝트ID 가 미리 채워져 잠기지 않음: ' + JSON.stringify(s6.form));
    else ok('마일스톤 추가: 폼 표시 · 프로젝트ID 미리 채움(잠금)');
    await setInput(cdp, '#edit-form [data-form-field="name"]', '게이트 마일스톤');
    await setInput(cdp, '#edit-form [data-form-field="due"]', '2027-03-01');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(400);
    const mKey = `${newId}|게이트 마일스톤`;
    s6.afterAdd = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const m = d.milestones.find(x => x.projectId === ${JSON.stringify(newId)} && x.name === '게이트 마일스톤') || null;
      return { milestones: d.milestones.length, row: m, listed: !!document.querySelector('#screen-A [data-action="open-form"][data-table="milestones"][data-mode="edit"][data-key=${JSON.stringify(mKey)}]') }; })()`);
    if (!(s6.afterAdd.milestones === a4.milestones + 1 && s6.afterAdd.row && s6.afterAdd.row.due === '2027-03-01' && s6.afterAdd.listed)) fail('마일스톤 추가: +1 · 예정일 · 상세 목록 표시 실패: ' + JSON.stringify(s6.afterAdd));
    else ok(`마일스톤 추가: ${a4.milestones} → ${s6.afterAdd.milestones} · 예정일 2027-03-01 · 상세 목록에 표시`);
    // 수정
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="milestones"][data-mode="edit"][data-key="${mKey}"]`);
    await sleep(200);
    await setInput(cdp, '#edit-form [data-form-field="due"]', '2027-03-02');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(400);
    s6.afterEdit = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const m = d.milestones.find(x => x.projectId === ${JSON.stringify(newId)} && x.name === '게이트 마일스톤') || null; return { milestones: d.milestones.length, due: m ? m.due : null, history0: (d.history || [])[0] || null }; })()`);
    if (!(s6.afterEdit.due === '2027-03-02' && s6.afterEdit.milestones === s6.afterAdd.milestones && s6.afterEdit.history0 && s6.afterEdit.history0.action === '수정' && /예정일/.test(s6.afterEdit.history0.summary || ''))) fail('마일스톤 수정: 예정일 반영·이력 실패: ' + JSON.stringify(s6.afterEdit));
    else ok('마일스톤 수정: 예정일 2027-03-02 반영 · 변경이력 "수정" (예정일)');
    // 삭제 — 1차 클릭(미실행) → 취소 → 재클릭 → 확인
    const delSel = `#screen-A [data-action="delete-row"][data-table="milestones"][data-key="${mKey}"]`;
    await clickSel(cdp, delSel);
    await sleep(200);
    s6.afterFirstClick = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key=${JSON.stringify(mKey)}]'), milestones: window.TeamBoard.state.data.milestones.length })`);
    await clickSel(cdp, '#screen-A [data-action="confirm-no"]');
    await sleep(200);
    s6.afterCancel = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"]'), buttonBack: !!document.querySelector(${JSON.stringify(delSel)}), milestones: window.TeamBoard.state.data.milestones.length })`);
    await clickSel(cdp, delSel);
    await sleep(150);
    await clickSel(cdp, `#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key="${mKey}"]`);
    await sleep(400);
    s6.afterConfirm = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; return { milestones: d.milestones.length, gone: !d.milestones.some(x => x.projectId === ${JSON.stringify(newId)} && x.name === '게이트 마일스톤'), history0: (d.history || [])[0] || null }; })()`);
    report.writePaths.milestoneRow = s6;
    if (!(s6.afterFirstClick.confirmShown && s6.afterFirstClick.milestones === s6.afterAdd.milestones)) fail('마일스톤 삭제: 1회 클릭에 확인 단계 없이 실행되었거나 확인 단계가 없음');
    else ok('마일스톤 삭제: 1회 클릭 → 확인 단계 표시 · 아직 미실행');
    if (!(!s6.afterCancel.confirmShown && s6.afterCancel.buttonBack && s6.afterCancel.milestones === s6.afterAdd.milestones)) fail('마일스톤 삭제: [취소] 후 원래 버튼으로 돌아오지 않음');
    else ok('마일스톤 삭제: [취소] → 원래 버튼 복귀 · 미실행');
    if (!(s6.afterConfirm.gone && s6.afterConfirm.milestones === a4.milestones && s6.afterConfirm.history0 && s6.afterConfirm.history0.action === '삭제')) fail('마일스톤 삭제: [확인] 후 −1 되지 않음: ' + JSON.stringify(s6.afterConfirm));
    else ok(`마일스톤 삭제: [확인] → ${s6.afterAdd.milestones} → ${s6.afterConfirm.milestones} · 변경이력 "삭제"`);

    // ---- 3-7 정산 입력 (완료 프로젝트에 매출 5,000만 · 직접비 3,000만 → 실마진 2,000만 · D 성과표 반영) ----
    console.log('\n[3-7] 정산 입력');
    const donePid = await evalJson(cdp, `(window.TeamBoard.state.data.projects.find(p => p.status === '완료') || {}).id || null`);
    const s7 = { projectId: donePid };
    if (donePid) {
      await evalJson(cdp, `(window.TeamBoard.state.selectedProject = ${JSON.stringify(donePid)}, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
      await sleep(150);
      await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="settlements"][data-key="${donePid}"]`);
      await sleep(200);
      s7.form = await evalJson(cdp, `(() => { const pid = document.querySelector('#edit-form [data-form-field="projectId"]'); return { shown: !!document.querySelector('#edit-form .tb-form[data-form-table="settlements"]'), projectId: pid ? pid.value : null, disabled: pid ? pid.disabled : null, noDelete: !document.querySelector('#edit-form [data-action="form-delete"]') }; })()`);
      if (!(s7.form.shown && s7.form.projectId === donePid && s7.form.disabled && s7.form.noDelete)) fail('정산 입력: 폼(프로젝트ID 잠금 · 삭제 버튼 없음) 불일치: ' + JSON.stringify(s7.form));
      else ok('정산 입력: 폼 표시 · 프로젝트ID 잠금 · 삭제 버튼 없음');
      await setInput(cdp, '#edit-form [data-form-field="revenue"]', '50000000');
      await setInput(cdp, '#edit-form [data-form-field="directCost"]', '30000000');
      await clickSel(cdp, '#edit-form [data-action="form-save"]');
      await sleep(500);
      await evalJson(cdp, `(window.TeamBoard.goTab('D'), true)`);
      await sleep(200);
      s7.after = await evalJson(cdp, `(() => { const TB = window.TeamBoard; const d = TB.state.data; const o = TB.metrics.projectOutput(d, ${JSON.stringify(donePid)});
        const s = d.settlements.find(x => x.projectId === ${JSON.stringify(donePid)}) || null;
        const row = document.querySelector('#screen-D tr[data-project=${JSON.stringify(donePid)}]');
        const tds = row ? [...row.querySelectorAll('td')].map(td => td.textContent.replace(/\\s+/g, ' ').trim()) : [];
        return { settlements: d.settlements.length, revenue: s && s.revenue, directCost: s && s.directCost, margin: o.margin, marginRate: o.marginRate, tds, formOpen: !!document.querySelector('#edit-form .tb-form') }; })()`);
      report.writePaths.saveRowSettlement = s7;
      if (!(s7.after.revenue === 50000000 && s7.after.directCost === 30000000 && s7.after.margin === 20000000 && s7.after.settlements === a4.settlements && !s7.after.formOpen)) fail('정산 입력: 매출·직접비·실마진 2,000만 불일치: ' + JSON.stringify(s7.after));
      else ok('정산 입력: 매출 5,000만 · 직접비 3,000만 → Metrics.projectOutput 실마진 20,000,000');
      if (!(/5,000만 원/.test(s7.after.tds[3] || '') && /2,000만 원/.test(s7.after.tds[4] || ''))) fail('정산 입력: D 성과표 셀(정산 매출 5,000만 · 실마진 2,000만) 미반영: ' + JSON.stringify(s7.after.tds));
      else ok(`정산 입력: D 성과표 "정산 매출 ${s7.after.tds[3]}" · "실마진 ${s7.after.tds[4].split(' ')[0]}"`);
    } else fail('정산 입력: 완료 상태 프로젝트가 없어 검증 불가');

    // ---- 3-8 팀원 추가 → 참조 없는 팀원 삭제 성공 / 참조 있는 팀원(팀원1) 삭제 거부 ----
    console.log('\n[3-8] 팀원 추가 · 삭제 · 삭제 거부');
    await evalJson(cdp, `(window.TeamBoard.goTab('B'), true)`);
    await sleep(150);
    const s8 = { membersBefore: a4.members };
    await clickSel(cdp, '#member-admin [data-action="open-form"][data-table="members"][data-mode="new"]');
    await sleep(200);
    s8.form = await evalJson(cdp, `(() => { const f = document.querySelector('#member-admin #edit-form .tb-form[data-form-table="members"]'); const role = document.querySelector('#edit-form [data-form-field="role"]'); return { shown: !!f, roleOptions: role ? role.options.length : 0 }; })()`);
    if (!(s8.form.shown && s8.form.roleOptions >= 6)) fail('팀원 추가: 팀원 관리 카드 안에 폼이 열리지 않음: ' + JSON.stringify(s8.form));
    else ok('팀원 추가: 팀원 관리 카드 안 폼 표시 · 주역할 목록');
    await setInput(cdp, '#edit-form [data-form-field="name"]', '게이트 팀원');
    await setInput(cdp, '#edit-form [data-form-field="role"]', '현장 운영');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(400);
    s8.afterAdd = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const m = d.members.find(x => x.name === '게이트 팀원') || null;
      return { members: d.members.length, row: m, listed: !!document.querySelector('#member-admin tr[data-member-row="게이트 팀원"]'),
        deleteButton: !!document.querySelector('#member-admin [data-action="delete-row"][data-table="members"][data-key="게이트 팀원"]'),
        pmOption: !!document.querySelector('#f-pm option[value="게이트 팀원"]') }; })()`);
    if (!(s8.afterAdd.members === a4.members + 1 && s8.afterAdd.row && s8.afterAdd.row.role === '현장 운영' && s8.afterAdd.row.status === '재직' && s8.afterAdd.listed && s8.afterAdd.deleteButton)) fail('팀원 추가: +1 · 주역할 · 표 행 · 삭제 버튼 실패: ' + JSON.stringify(s8.afterAdd));
    else ok(`팀원 추가: ${a4.members} → ${s8.afterAdd.members} · 주역할 현장 운영 · 상태 재직 · 표에 표시`);
    // 참조 있는 팀원1 — 삭제 버튼 대신 불가 사유, actions 로 직접 불러도 실행되지 않아야 한다
    s8.blocked = await evalJson(cdp, `(() => { const b = document.querySelector('#member-admin [data-delete-blocked="팀원1"]'); return { button: !!document.querySelector('#member-admin [data-action="delete-row"][data-key="팀원1"]'), reason: b ? b.textContent.trim() : null }; })()`);
    const tryDel = await evalJson(cdp, `window.TeamBoard.actions.deleteRow('members', '팀원1')`);
    s8.blockedAttempt = { result: tryDel, members: await evalJson(cdp, `window.TeamBoard.state.data.members.length`), member1: await evalJson(cdp, `!!window.TeamBoard.state.data.members.find(m => m.name === '팀원1')`) };
    if (!(!s8.blocked.button && s8.blocked.reason && /참조/.test(s8.blocked.reason) && /퇴사/.test(s8.blocked.reason))) fail('팀원 삭제 거부: 팀원1 삭제 버튼 자리에 불가 사유 문장이 없음: ' + JSON.stringify(s8.blocked));
    else ok(`팀원 삭제 거부: 팀원1 → "${s8.blocked.reason.slice(0, 60)}…"`);
    if (!(tryDel === null && s8.blockedAttempt.member1 && s8.blockedAttempt.members === s8.afterAdd.members)) fail('팀원 삭제 거부: actions.deleteRow 가 참조 있는 팀원을 지움: ' + JSON.stringify(s8.blockedAttempt));
    else ok('팀원 삭제 거부: 직접 호출해도 실행되지 않음(팀원 수 유지)');
    // 참조 없는 새 팀원 삭제 — 확인 경유
    const delM = '#member-admin [data-action="delete-row"][data-table="members"][data-key="게이트 팀원"]';
    await clickSel(cdp, delM);
    await sleep(200);
    s8.afterFirstClick = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#member-admin [data-action="confirm-yes"][data-key="게이트 팀원"]'), members: window.TeamBoard.state.data.members.length })`);
    await clickSel(cdp, '#member-admin [data-action="confirm-yes"][data-key="게이트 팀원"]');
    await sleep(400);
    s8.afterDelete = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; return { members: d.members.length, gone: !d.members.some(m => m.name === '게이트 팀원'), history0: (d.history || [])[0] || null }; })()`);
    report.writePaths.memberRow = s8;
    if (!(s8.afterFirstClick.confirmShown && s8.afterFirstClick.members === s8.afterAdd.members)) fail('팀원 삭제: 1회 클릭에 확인 단계 없이 실행됨');
    else ok('팀원 삭제: 1회 클릭 → 확인 단계 표시 · 아직 미실행');
    if (!(s8.afterDelete.gone && s8.afterDelete.members === a4.members && s8.afterDelete.history0 && s8.afterDelete.history0.action === '삭제' && s8.afterDelete.history0.sheet === '팀원')) fail('팀원 삭제: [확인] 후 −1 되지 않음: ' + JSON.stringify(s8.afterDelete));
    else ok(`팀원 삭제: [확인] → ${s8.afterAdd.members} → ${s8.afterDelete.members} · 변경이력 "삭제"(팀원)`);

    // ---- 3-9 공수 주간 입력 (C: 팀원5 · 기준 주차 2026-08-31 → 행 추가 → 저장 → E 미기록 경고에서 팀원5 제거) ----
    console.log('\n[3-9] 공수 주간 입력');
    await evalJson(cdp, `(window.TeamBoard.goTab('C'), true)`);
    await sleep(150);
    const baseWeek = await evalJson(cdp, `window.TeamBoard.metrics.baseWeek(window.TeamBoard.state.data, window.TeamBoard.state.data.meta.today)`);
    const firstPid = await evalJson(cdp, `window.TeamBoard.state.data.projects[0].id`);
    const s9 = { member: '팀원5', week: baseWeek, projectId: firstPid, effortLogsBefore: a4.effortLogs };
    s9.editor = await evalJson(cdp, `(() => { const w = document.getElementById('effort-week'); return { card: !!document.querySelector('#effort-editor'), memberSelect: !!document.getElementById('effort-member'), weekOptions: w ? [...w.options].map(o => o.value).filter(Boolean) : [], weekLabels: w ? [...w.options].map(o => o.textContent) : [], cellHooks: document.querySelectorAll('#screen-C [data-chart="weekly"] [data-action="effort-open"]').length }; })()`);
    if (!(s9.editor.card && s9.editor.memberSelect && s9.editor.weekOptions.length === 8 && s9.editor.weekOptions.includes(baseWeek) && s9.editor.weekLabels.some(l => /\(기준\)/.test(l)) && s9.editor.cellHooks >= 40)) fail('공수 입력: 카드·팀원 선택·주차 8개(기준 표시)·매트릭스 셀 훅 구성 불일치: ' + JSON.stringify(s9.editor));
    else ok(`공수 입력: 카드 표시 · 주차 ${s9.editor.weekOptions.length}개(기준 ${baseWeek}) · 매트릭스 셀 훅 ${s9.editor.cellHooks}개`);
    if (baseWeek !== '2026-08-31') fail('공수 입력: 기준 주차가 2026-08-31 이 아님: ' + baseWeek);
    await setInput(cdp, '#effort-member', '팀원5');
    await setInput(cdp, '#effort-week', baseWeek);
    await sleep(200);
    s9.loaded = await evalJson(cdp, `(() => { const e = window.TeamBoard.state.effort; return { member: e && e.member, week: e && e.week, rows: e ? e.rows.length : null, expected: e ? (e.expected || []).length : null, addButton: !!document.querySelector('#effort-editor [data-action="effort-add-row"]') }; })()`);
    if (!(s9.loaded.member === '팀원5' && s9.loaded.week === baseWeek && s9.loaded.rows === 0 && s9.loaded.addButton)) fail('공수 입력: 팀원5·기준 주차 선택 후 빈 표가 열리지 않음: ' + JSON.stringify(s9.loaded));
    else ok('공수 입력: 팀원5 · 기준 주차 선택 → 빈 표(기록 0행) · [행 추가] 표시');
    await clickSel(cdp, '#effort-editor [data-action="effort-add-row"]');
    await sleep(150);
    await setInput(cdp, '#effort-editor [data-row="0"][data-field="projectId"]', firstPid);
    await setInput(cdp, '#effort-editor [data-row="0"][data-field="md"]', '2');
    s9.rowState = await evalJson(cdp, `(() => { const r = (window.TeamBoard.state.effort.rows || [])[0] || null; return { rows: window.TeamBoard.state.effort.rows.length, row: r, total: (document.getElementById('effort-total') || {}).textContent || '' }; })()`);
    report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, 'effort-editor.png'), 1920));
    await clickSel(cdp, '#effort-editor [data-action="effort-save"]');
    await sleep(500);
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(250);
    const e9 = await evalJson(cdp, DOM_CHECKS.E);
    s9.after = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const l = d.effortLogs.find(x => x.member === '팀원5' && x.week === ${JSON.stringify(baseWeek)}) || null;
      return { effortLogs: d.effortLogs.length, log: l, history0: (d.history || [])[0] || null }; })()`);
    s9.after.missingLog = e9.missingLog;
    report.writePaths.saveEffortWeek = s9;
    if (!(s9.rowState.rows === 1 && s9.rowState.row && s9.rowState.row.projectId === firstPid && String(s9.rowState.row.md) === '2')) fail('공수 입력: 행 추가·입력 역기록 실패: ' + JSON.stringify(s9.rowState));
    else ok(`공수 입력: 행 추가 → ${firstPid} · 2 M/D 입력(역기록) · ${s9.rowState.total}`);
    if (!(s9.after.effortLogs === a4.effortLogs + 1 && s9.after.log && Number(s9.after.log.md) === 2 && s9.after.log.projectId === firstPid && s9.after.log.loggedAt)) fail('공수 입력: 저장 후 effortLogs +1 · 행 내용 불일치: ' + JSON.stringify({ n: s9.after.effortLogs, log: s9.after.log }));
    else ok(`공수 입력: 저장 → 공수기록 ${a4.effortLogs} → ${s9.after.effortLogs} · 기록일시 ${s9.after.log.loggedAt}`);
    if (e9.missingLog.some((x) => /팀원5/.test(x))) fail('공수 입력: 저장 후에도 E 미기록 경고에 팀원5 가 남음: ' + JSON.stringify(e9.missingLog));
    else ok(`공수 입력: E 미기록 경고에서 팀원5 사라짐 (남은 미기록 ${e9.missingLog.length}건)`);
    if (!(s9.after.history0 && s9.after.history0.action === '저장' && s9.after.history0.sheet === '공수기록')) fail('공수 입력: 변경이력 "저장"(공수기록) 없음: ' + JSON.stringify(s9.after.history0));
    else ok('공수 입력: 변경이력 "저장"(공수기록)');

    // ---- 3-10 프로젝트 삭제 (3-4 에서 만든 프로젝트 · 공수 0 → 연쇄: 마일스톤 9 · 정산 1) ----
    console.log('\n[3-10] 프로젝트 삭제(연쇄)');
    await evalJson(cdp, `(window.TeamBoard.state.selectedProject = ${JSON.stringify(newId)}, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const s10 = { projectId: newId, before: await evalJson(cdp, COUNTS) };
    const delP = `#screen-A [data-action="delete-row"][data-table="projects"][data-key="${newId}"]`;
    s10.buttonShown = await evalJson(cdp, `!!document.querySelector(${JSON.stringify(delP)})`);
    await clickSel(cdp, delP);
    await sleep(200);
    s10.afterFirstClick = await evalJson(cdp, `(() => { const c = document.querySelector('#screen-A .tb-confirm'); return { confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key=${JSON.stringify(newId)}]'), text: c ? c.textContent.replace(/\\s+/g, ' ').trim() : '', projects: window.TeamBoard.state.data.projects.length }; })()`);
    await clickSel(cdp, `#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key="${newId}"]`);
    await sleep(500);
    s10.after = await evalJson(cdp, COUNTS);
    s10.detail = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const id = ${JSON.stringify(newId)}; return {
      gone: !d.projects.some(p => p.id === id), milestonesLeft: d.milestones.filter(m => m.projectId === id).length, settlementsLeft: d.settlements.filter(s => s.projectId === id).length,
      card: !!document.querySelector('#screen-A .tb-proj-card[data-project="' + id + '"]'), selected: window.TeamBoard.state.selectedProject, history0: (d.history || [])[0] || null }; })()`);
    report.writePaths.deleteRowProject = s10;
    if (!(s10.buttonShown && s10.afterFirstClick.confirmShown && /마일스톤 9/.test(s10.afterFirstClick.text) && /정산 1/.test(s10.afterFirstClick.text) && s10.afterFirstClick.projects === s10.before.projects)) fail('프로젝트 삭제: 확인 단계·연쇄 건수 문구(마일스톤 9 · 정산 1) 불일치: ' + JSON.stringify(s10.afterFirstClick));
    else ok(`프로젝트 삭제: 1회 클릭 → 확인 문구 "${s10.afterFirstClick.text.slice(0, 60)}"`);
    if (!(s10.detail.gone && s10.after.projects === s10.before.projects - 1 && s10.after.milestones === s10.before.milestones - 9 && s10.after.settlements === s10.before.settlements - 1 && s10.detail.milestonesLeft === 0 && s10.detail.settlementsLeft === 0 && !s10.detail.card && s10.detail.selected !== newId)) fail('프로젝트 삭제: 연쇄 삭제·카드 제거 실패: ' + JSON.stringify({ before: s10.before, after: s10.after, detail: s10.detail }));
    else ok(`프로젝트 삭제: 프로젝트 ${s10.before.projects} → ${s10.after.projects} · 마일스톤 ${s10.before.milestones} → ${s10.after.milestones} · 정산 ${s10.before.settlements} → ${s10.after.settlements} · 카드 제거`);
    if (!(s10.detail.history0 && s10.detail.history0.action === '삭제' && s10.detail.history0.sheet === '프로젝트')) fail('프로젝트 삭제: 변경이력 "삭제"(프로젝트) 없음');
    else ok('프로젝트 삭제: 변경이력 "삭제"(프로젝트)');
    if (!(s10.after.projects === b4.projects && s10.after.milestones === b4.milestones && s10.after.settlements === b4.settlements)) fail('프로젝트 삭제: 3-4 이전 개수로 돌아오지 않음: ' + JSON.stringify({ b4, after: s10.after }));
    else ok('프로젝트 삭제: 프로젝트·마일스톤·정산 개수가 3-4 이전으로 복귀');

    // ---- 3-11 최근 변경 목록 ----
    console.log('\n[3-11] 최근 변경 목록');
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(200);
    const s11 = await evalJson(cdp, `(() => { const h = window.TeamBoard.state.data.history || []; const rows = document.querySelectorAll('#history-list tbody tr').length;
      const firstLines = h.map(x => String(x.summary || '').split('\\n')[0]);
      return { length: h.length, rows, actions: h.map(x => x.action), sheets: h.map(x => x.sheet), users: [...new Set(h.map(x => x.user))],
        firstLines: firstLines.slice(0, 6), allLabeled: firstLines.every(l => /:/.test(l)), emptyBox: !!document.querySelector('#history-list .tb-empty') }; })()`);
    report.writePaths.history = s11;
    if (!(s11.length >= 8)) fail(`최근 변경: 이력 ${s11.length}건 (8건 이상이어야 함)`);
    else ok(`최근 변경: 이력 ${s11.length}건 · 동작 ${[...new Set(s11.actions)].join('/')} · 사용자 ${s11.users.join(',')}`);
    if (!s11.allLabeled) fail('최근 변경: 요약 첫 줄에 라벨(":")이 없는 항목 있음: ' + JSON.stringify(s11.firstLines));
    else ok('최근 변경: 모든 요약 첫 줄에 라벨 포함');
    if (!(s11.rows === Math.min(30, s11.length) && !s11.emptyBox)) fail(`최근 변경: E 탭 #history-list 행 수 ${s11.rows} ≠ min(30, ${s11.length})`);
    else ok(`최근 변경: E 탭 #history-list ${s11.rows}행 = min(30, ${s11.length})`);

    // ---- 3-12 새로고침(getBootstrap 재호출) — mock 은 서버 쪽 이력도 함께 유지되어야 한다 ----
    const s12 = { tabBefore: await evalJson(cdp, `window.TeamBoard.state.tab`) };
    await clickSel(cdp, '[data-action="refresh-data"]');
    await sleep(500);
    s12.after = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; return { tab: window.TeamBoard.state.tab, history: (d.history || []).length, projects: d.projects.length, effortLogs: d.effortLogs.length }; })()`);
    report.writePaths.refreshData = s12;
    if (!(s12.after.tab === s12.tabBefore && s12.after.history === s11.length && s12.after.projects === b4.projects && s12.after.effortLogs === a4.effortLogs + 1)) fail('새로고침: 탭 유지·서버(mock) 이력·데이터 개수 불일치: ' + JSON.stringify(s12));
    else ok(`새로고침: 탭 ${s12.after.tab} 유지 · 이력 ${s12.after.history}건 · 데이터 개수 유지`);

    // ======================================================================
    // 5턴 쓰기 게이트 (3-13 ~ 3-19) — 업무 블럭(세부 항목) · 배정 자동 행 · 주석 · E 카드 · 마일스톤 삭제 거부 · 파트 필터
    // ======================================================================
    const P3 = 'P-2026-003';
    const K13 = `${P3}|답사`;
    const ROLLUP = `(() => ({ total: (document.querySelector('#screen-A [data-rollup-total]') || {}).textContent || '', mm: (document.querySelector('#screen-A [data-rollup-mm]') || {}).textContent || '', chips: document.querySelectorAll('#screen-A [data-part-filter] [data-action="part-filter"]').length }))()`;

    // ---- 3-13 블럭 추가 (A 상세 → 마일스톤 "답사" 펼침 → [블럭 추가] → 파트 운영 PM → 블럭 2개 체크 → 추가 · 재실행 건너뜀) ----
    console.log('\n[3-13] 블럭 추가 (카탈로그 → 세부 항목 · 첫 주석 · 합계 카드)');
    await evalJson(cdp, `(window.TeamBoard.state.selectedProject = ${JSON.stringify(P3)}, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const s13 = { projectId: P3, milestone: '답사', before: await evalJson(cdp, COUNTS) };
    s13.rollupBefore = await evalJson(cdp, ROLLUP);
    s13.toggleText = await evalJson(cdp, `(() => { const b = document.querySelector('#screen-A [data-action="toggle-items"][data-key=${JSON.stringify(K13)}]'); return b ? b.textContent.trim() : null; })()`);
    await clickSel(cdp, `#screen-A [data-action="toggle-items"][data-key="${K13}"]`);
    await sleep(200);
    s13.opened = await evalJson(cdp, `(() => ({ open: !!document.querySelector('#screen-A [data-items=${JSON.stringify(K13)}]'), rows: document.querySelectorAll('#screen-A [data-items=${JSON.stringify(K13)}] [data-item-row]').length,
      pickerButton: !!document.querySelector('#screen-A [data-action="block-picker"][data-key=${JSON.stringify(K13)}]'), itemsOpen: !!window.TeamBoard.state.itemsOpen[${JSON.stringify(K13)}] }))()`);
    if (!(/^2\.0 M\/D/.test(s13.rollupBefore.total) && /^0\.10 M\/M/.test(s13.rollupBefore.mm) && s13.rollupBefore.chips === 7)) fail('합계 카드: P-2026-003 초기 "2.0 M/D · 0.10 M/M" · 파트 칩 7개(전체+6) 불일치: ' + JSON.stringify(s13.rollupBefore));
    else ok(`합계 카드: ${s13.rollupBefore.total} = ${s13.rollupBefore.mm} · 파트 필터 칩 ${s13.rollupBefore.chips}개`);
    if (!(s13.toggleText && /블럭 0/.test(s13.toggleText) && s13.opened.open && s13.opened.rows === 0 && s13.opened.pickerButton && s13.opened.itemsOpen)) fail('마일스톤 펼침: "블럭 0" 토글 → 빈 세부 항목 묶음 · [블럭 추가] 버튼 표시 실패: ' + JSON.stringify({ toggle: s13.toggleText, opened: s13.opened }));
    else ok(`마일스톤 펼침: "${s13.toggleText}" → 세부 항목 0행 · [블럭 추가] 표시`);
    await clickSel(cdp, `#screen-A [data-action="block-picker"][data-key="${K13}"]`);
    await sleep(200);
    await setInput(cdp, '#block-part', '운영 PM');
    await sleep(200);
    s13.picker = await evalJson(cdp, `(() => ({ shown: !!document.querySelector('#screen-A .tb-block-picker'), part: (document.getElementById('block-part') || {}).value,
      chips: [...document.querySelectorAll('#screen-A [data-action="block-toggle"]')].map(c => c.getAttribute('data-block')),
      venueText: (document.querySelector('#screen-A [data-action="block-toggle"][data-block="베뉴 서칭·계약"]') || {}).textContent || '',
      addDisabled: (document.querySelector('#screen-A [data-action="block-add"]') || {}).disabled }))()`);
    if (!(s13.picker.shown && s13.picker.part === '운영 PM' && s13.picker.chips.length === 8 && s13.picker.chips.includes('베뉴 서칭·계약') && s13.picker.chips.includes('협력사 발주·관리') && /기본 2\.0 M\/D/.test(s13.picker.venueText) && s13.picker.addDisabled === true)) fail('블럭 추가 창: 파트 운영 PM 카탈로그 8개 · "기본 2.0 M/D" · [추가] 비활성 불일치: ' + JSON.stringify(s13.picker));
    else ok(`블럭 추가 창: 파트 ${s13.picker.part} · 카탈로그 칩 ${s13.picker.chips.length}개 · "${s13.picker.venueText.trim()}"`);
    await clickSel(cdp, '#screen-A [data-action="block-toggle"][data-block="베뉴 서칭·계약"]');
    await clickSel(cdp, '#screen-A [data-action="block-toggle"][data-block="협력사 발주·관리"]');
    await sleep(100);
    s13.checked = await evalJson(cdp, `(() => { const bp = window.TeamBoard.state.blockPicker; return { checked: bp ? Object.keys(bp.checked).filter(k => bp.checked[k]) : [], on: document.querySelectorAll('#screen-A [data-action="block-toggle"].is-on').length,
      count: (document.getElementById('block-add-count') || {}).textContent, addDisabled: (document.querySelector('#screen-A [data-action="block-add"]') || {}).disabled, formOpen: !!document.querySelector('#edit-form .tb-form') }; })()`);
    report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, 'block-picker.png'), 1920));
    if (!(s13.checked.checked.length === 2 && s13.checked.on === 2 && s13.checked.count === '2' && s13.checked.addDisabled === false)) fail('블럭 체크 칩: 2개 체크 → is-on 2 · 건수 2 · [추가] 활성 실패: ' + JSON.stringify(s13.checked));
    else ok('블럭 체크 칩: 2개 체크(재렌더 없이 자리에서) → [추가 2건] 활성');
    await clickSel(cdp, '#screen-A [data-action="block-add"]');
    await sleep(500);
    s13.after = await evalJson(cdp, COUNTS);
    s13.detail = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const its = d.items.filter(it => it.projectId === ${JSON.stringify(P3)} && it.milestone === '답사');
      const notes = its.map(it => d.notes.filter(n => n.itemId === it.id).map(n => ({ id: n.id, type: n.type, part: n.part, author: n.author, at: n.at, content: n.content, resolved: n.resolved })));
      return { items: its.map(it => ({ id: it.id, part: it.part, block: it.block, owner: it.owner, impact: it.impact, difficulty: it.difficulty, plannedMd: it.plannedMd, due: it.due, status: it.status })), notes,
        pickerClosed: !document.querySelector('#screen-A .tb-block-picker'), stillOpen: !!document.querySelector('#screen-A [data-items=${JSON.stringify(K13)}]'),
        rows: document.querySelectorAll('#screen-A [data-items=${JSON.stringify(K13)}] [data-item-row]').length, toggle: (document.querySelector('#screen-A [data-action="toggle-items"][data-key=${JSON.stringify(K13)}]') || {}).textContent || '',
        badges: [...document.querySelectorAll('#screen-A [data-items=${JSON.stringify(K13)}] [data-item-row] .tb-note-badge')].map(b => b.textContent.trim()),
        history0: (d.history || [])[0] || null, auto: ${autoRowsExpr(P3)}, rollup: ${ROLLUP} }; })()`);
    report.screenshots.push(await screenshot(cdp, path.join(OUT_DIR, 'items-open.png'), 1920));
    const venue13 = s13.detail.items.find((x) => x.block === '베뉴 서칭·계약') || null;
    const vendor13 = s13.detail.items.find((x) => x.block === '협력사 발주·관리') || null;
    if (!(s13.after.items === s13.before.items + 2 && s13.after.notes === s13.before.notes + 2 && s13.after.assignments === s13.before.assignments && s13.after.history === s13.before.history + 1)) fail(`블럭 추가: 세부 항목 +2 · 주석 +2 · 배정 변동 없음(담당 없음) · 이력 +1 불일치 (items ${s13.before.items}→${s13.after.items} · notes ${s13.before.notes}→${s13.after.notes} · assignments ${s13.before.assignments}→${s13.after.assignments})`);
    else ok(`블럭 추가: 세부 항목 ${s13.before.items} → ${s13.after.items} · 주석 ${s13.before.notes} → ${s13.after.notes} · 배정 ${s13.after.assignments}(변동 없음)`);
    if (!(venue13 && vendor13 && /^W-\d{6}$/.test(venue13.id) && /^W-\d{6}$/.test(vendor13.id) && venue13.owner === '' && vendor13.owner === '' &&
      venue13.impact === '상' && venue13.difficulty === '중' && venue13.plannedMd === 2 && vendor13.impact === '중' && vendor13.difficulty === '중' && vendor13.plannedMd === 2 &&
      venue13.due === '' && venue13.status === '예정' && venue13.part === '운영 PM')) fail('블럭 추가: 카탈로그 기본값(임팩트·난이도·M/D) · 세부ID · 담당 빈 값 불일치: ' + JSON.stringify(s13.detail.items));
    else ok(`블럭 추가: ${venue13.id} 베뉴 서칭·계약(상/중 2.0) · ${vendor13.id} 협력사 발주·관리(중/중 2.0) · 담당 없음 · 예정일 비움`);
    const notes13 = s13.detail.notes;
    if (!(notes13.length === 2 && notes13.every((l) => l.length === 1 && l[0].type === '요청' && l[0].part === '운영 PM' && l[0].author && l[0].at && l[0].resolved === '') && /수용 인원/.test(notes13[0][0].content + notes13[1][0].content) && /발주 범위/.test(notes13[0][0].content + notes13[1][0].content))) fail('블럭 추가: 첫 주석(유형 요청 · "판단에 필요한 내용") 2건 불일치: ' + JSON.stringify(notes13));
    else ok(`블럭 추가: 첫 주석 2건(요청) — "${notes13[0][0].content}" · "${notes13[1][0].content}"`);
    if (!(s13.detail.pickerClosed && s13.detail.stillOpen && s13.detail.rows === 2 && /블럭 2/.test(s13.detail.toggle) && s13.detail.badges.every((b) => /주석 1 · 미해결 1/.test(b)) && s13.detail.auto.length === 0)) fail('블럭 추가: 창 닫힘 · 펼침 유지 · 행 2 · 토글 "블럭 2" · 주석 배지 · 자동 행 0 불일치: ' + JSON.stringify({ pickerClosed: s13.detail.pickerClosed, stillOpen: s13.detail.stillOpen, rows: s13.detail.rows, toggle: s13.detail.toggle, badges: s13.detail.badges, auto: s13.detail.auto }));
    else ok(`블럭 추가: 창 닫힘 · 펼침 유지 · 세부 항목 행 2 · "${s13.detail.toggle}" · 배지 "${s13.detail.badges[0]}"`);
    if (!(/^6\.0 M\/D/.test(s13.detail.rollup.total) && /^0\.30 M\/M/.test(s13.detail.rollup.mm))) fail('합계 카드: 블럭 추가 후 "6.0 M/D · 0.30 M/M" 으로 갱신되지 않음: ' + JSON.stringify(s13.detail.rollup));
    else ok(`합계 카드: ${s13.rollupBefore.total} → ${s13.detail.rollup.total} = ${s13.detail.rollup.mm}`);
    if (!(s13.detail.history0 && s13.detail.history0.sheet === '세부항목' && s13.detail.history0.action === '추가' && /블럭 추가: 2건/.test(s13.detail.history0.summary || ''))) fail('블럭 추가: 변경이력 "세부항목 / 추가 / 블럭 추가: 2건" 없음: ' + JSON.stringify(s13.detail.history0));
    else ok('블럭 추가: 변경이력 "세부항목 / 추가" · ' + String(s13.detail.history0.summary).split('\n')[0]);
    const r13 = await evalJson(cdp, `window.TeamBoard.actions.addItems(${JSON.stringify(P3)}, '답사', '운영 PM', ['베뉴 서칭·계약', '협력사 발주·관리'])`);
    s13.rerun = r13 && { created: (r13.items || []).length, skipped: (r13.skipped || []).length, items: await evalJson(cdp, `window.TeamBoard.state.data.items.length`) };
    report.writePaths.addItems = s13;
    if (!(s13.rerun && s13.rerun.created === 0 && s13.rerun.skipped === 2 && s13.rerun.items === s13.after.items)) fail('블럭 추가 재실행: 중복 방지(생성 0 · 건너뜀 2) 실패: ' + JSON.stringify(s13.rerun));
    else ok('블럭 추가 재실행: 0건 생성 · 2건 건너뜀(같은 블럭 중복 금지)');

    // ---- 3-14 세부 항목 수정 — 담당 지정 → 배정 자동 행 · B "자동" 배지 · 히트맵 · 수동 행 겹침 배지 ----
    console.log('\n[3-14] 세부 항목 수정 — 담당 지정 → 배정 자동 행(B "자동" 배지 · 히트맵 · 겹침 배지)');
    const venueId = venue13 ? venue13.id : null;
    const vendorId = vendor13 ? vendor13.id : null;
    const s14 = { venueId, vendorId };
    const util3 = `(window.TeamBoard.metrics.plannedUtilization(window.TeamBoard.state.data, '2026-09').find(r => r.member === '팀원3') || {}).plannedMd`;
    s14.utilBefore = await evalJson(cdp, util3);
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="items"][data-mode="edit"][data-key="${venueId}"]`);
    await sleep(200);
    s14.form = await evalJson(cdp, `(() => { const f = document.querySelector('#edit-form .tb-form[data-form-table="items"]'); const pid = document.querySelector('#edit-form [data-form-field="projectId"]'); const ms = document.querySelector('#edit-form [data-form-field="milestone"]'); const own = document.querySelector('#edit-form [data-form-field="owner"]');
      const opts = own ? [...own.options].filter(o => o.value).map(o => ({ v: o.value, t: o.textContent, muted: o.classList.contains('is-muted') })) : [];
      return { shown: !!f, mode: f ? f.getAttribute('data-form-mode') : null, pid: pid ? pid.value : null, pidLocked: pid ? pid.disabled : null, ms: ms ? ms.value : null, msLocked: ms ? ms.disabled : null,
        ownerOrder: opts.map(o => o.v), ownerLabels: opts.map(o => o.t), noGrade: !/등급/.test((document.getElementById('edit-form') || {}).textContent || '') }; })()`);
    const mid14 = s14.form.ownerOrder.slice(1, -1).slice().sort().join(',');
    if (!(s14.form.shown && s14.form.mode === 'edit' && s14.form.pid === P3 && s14.form.pidLocked && s14.form.ms === '답사' && s14.form.msLocked && s14.form.ownerOrder[0] === '팀원1' && s14.form.ownerOrder[s14.form.ownerOrder.length - 1] === '팀원5' && mid14 === '팀원2,팀원3,팀원4' && s14.form.ownerLabels.every((l) => /가동률 \d+%/.test(l)) && s14.form.noGrade)) fail('세부 항목 폼: 프로젝트·마일스톤 잠금 · 담당 순서(파트 주역할 → 기배정자 → 가동률순) · "가동률 n%" 라벨 · 등급 없음 불일치: ' + JSON.stringify(s14.form));
    else ok(`세부 항목 폼: 프로젝트·마일스톤 잠금 · 담당 순서 ${s14.form.ownerOrder.join(' → ')} · "${s14.form.ownerLabels[0]}"`);
    await setInput(cdp, '#edit-form [data-form-field="owner"]', '팀원3');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(500);
    s14.afterA = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const it = d.items.find(x => x.id === ${JSON.stringify(venueId)}) || {}; return { owner: it.owner, auto: ${autoRowsExpr(P3)}, formOpen: !!document.querySelector('#edit-form .tb-form'),
      stillOpen: !!document.querySelector('#screen-A [data-items=${JSON.stringify(K13)}]'), overlaps: window.TeamBoard.state.overlaps[${JSON.stringify(P3)}] || null,
      history: (d.history || []).slice(0, 2).map(h => h.sheet + ' / ' + h.action + ' / ' + String(h.summary).split('\\n')[0]), utilAfter: ${util3}, ownerCell: (document.querySelector('#screen-A [data-item-row=${JSON.stringify(venueId)}] .i-owner') || {}).textContent || '' }; })()`);
    const a14 = s14.afterA.auto[0] || null;
    if (!(s14.afterA.owner === '팀원3' && s14.afterA.auto.length === 1 && a14.member === '팀원3' && a14.role === '운영 PM' && a14.plannedMd === 2 && /^A-\d{4}$/.test(a14.id) && a14.start === '2026-09-14' && a14.end === '2026-09-28' && !s14.afterA.formOpen && s14.afterA.stillOpen && Array.isArray(s14.afterA.overlaps) && s14.afterA.overlaps.length === 0 && s14.afterA.ownerCell === '팀원3')) fail('담당 지정: 자동 행(팀원3/운영 PM · 2 M/D · 2026-09-14~09-28 · A-ID) 생성 실패: ' + JSON.stringify(s14.afterA));
    else ok(`담당 지정: ${venueId} → 팀원3 · 배정 자동 행 ${a14.id} 팀원3/운영 PM ${a14.plannedMd} M/D · ${a14.start}~${a14.end}`);
    if (!(/^배정 \/ 저장 \/ 세부항목 동기화: 1행/.test(s14.afterA.history[0]) && /^세부항목 \/ 수정/.test(s14.afterA.history[1]))) fail('담당 지정: 변경이력(세부항목 수정 → 배정 저장 "세부항목 동기화: 1행") 순서 불일치: ' + JSON.stringify(s14.afterA.history));
    else ok('담당 지정: 변경이력 "' + s14.afterA.history[1] + '" → "' + s14.afterA.history[0] + '"');
    if (!(typeof s14.utilBefore === 'number' && typeof s14.afterA.utilAfter === 'number' && Math.abs(s14.afterA.utilAfter - s14.utilBefore - 2) < 0.01)) fail(`담당 지정: 팀원3 2026-09 계획 공수가 +2 되지 않음 (${s14.utilBefore} → ${s14.afterA.utilAfter})`);
    else ok(`담당 지정: 히트맵 산식 팀원3 2026-09 계획 ${s14.utilBefore} → ${s14.afterA.utilAfter} (+2)`);
    // B 편집기 — 자동 행 잠금 · "자동" 배지 · 행 제거 버튼 없음
    await evalJson(cdp, `(window.TeamBoard.goTab('B'), true)`);
    await evalJson(cdp, `(() => { const s = document.getElementById('assign-project'); s.value = ${JSON.stringify(P3)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
    await sleep(200);
    s14.editor = await evalJson(cdp, `(() => { const tr = document.querySelector('#screen-B tr.is-auto'); const cell = document.querySelector('#screen-B [data-cell="팀원3|2026-09"]');
      return { autoRows: document.querySelectorAll('#screen-B tr.is-auto').length, badge: tr ? (tr.querySelector('.tb-auto-badge') || {}).textContent : null,
        disabledInputs: tr ? [...tr.querySelectorAll('input,select')].every(n => n.disabled) : false, noRemove: tr ? !tr.querySelector('[data-action="remove-row"]') : false,
        note: tr ? ((tr.querySelector('.tb-auto-note') || {}).textContent || '') : null, editRows: window.TeamBoard.state.editRows.length,
        cellText: cell ? cell.textContent.replace(/\\s+/g, ' ').trim() : null, overlapBadges: document.querySelectorAll('#screen-B .tb-overlap').length }; })()`);
    if (!(s14.editor.autoRows === 1 && s14.editor.badge === '자동' && s14.editor.disabledInputs && s14.editor.noRemove && /세부 항목에서/.test(s14.editor.note) && s14.editor.editRows === 5 && s14.editor.overlapBadges === 0)) fail('B 편집기: 자동 행 1(회색 · "자동" 배지 · 입력 잠금 · 제거 버튼 없음 · 안내 문구) 불일치: ' + JSON.stringify(s14.editor));
    else ok(`B 편집기: 자동 행 1 · "자동" 배지 · 입력 잠금 · "${s14.editor.note}" · 히트맵 팀원3|2026-09 "${s14.editor.cellText}"`);
    // 자동 행을 그대로 포함해 저장 → 서버(mock) 재동기화 → 같은 행·같은 ID 유지
    const asgBefore14 = await evalJson(cdp, `window.TeamBoard.state.data.assignments.length`);
    await clickSel(cdp, '#screen-B [data-action="save-assignments"]');
    await sleep(500);
    s14.resave = { assignmentsBefore: asgBefore14, assignmentsAfter: await evalJson(cdp, `window.TeamBoard.state.data.assignments.length`), auto: await evalJson(cdp, autoRowsExpr(P3)) };
    if (!(s14.resave.assignmentsAfter === asgBefore14 && s14.resave.auto.length === 1 && s14.resave.auto[0].id === a14.id && s14.resave.auto[0].plannedMd === 2)) fail('B 저장(자동 행 포함): 재동기화 후 자동 행 ID·M/D 유지 실패: ' + JSON.stringify(s14.resave));
    else ok(`B 저장(자동 행 포함): 배정 ${asgBefore14} 유지 · 자동 행 ${a14.id} 그대로`);
    // 둘째 항목도 팀원3 → 자동 행 4 M/D
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="items"][data-mode="edit"][data-key="${vendorId}"]`);
    await sleep(200);
    await setInput(cdp, '#edit-form [data-form-field="owner"]', '팀원3');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(500);
    s14.afterB = await evalJson(cdp, `({ auto: ${autoRowsExpr(P3)}, overlaps: window.TeamBoard.state.overlaps[${JSON.stringify(P3)}] || null, utilAfter: ${util3}, rollup: ${ROLLUP} })`);
    if (!(s14.afterB.auto.length === 1 && s14.afterB.auto[0].id === a14.id && s14.afterB.auto[0].plannedMd === 4 && Math.abs(s14.afterB.utilAfter - s14.utilBefore - 4) < 0.01 && /^6\.0 M\/D/.test(s14.afterB.rollup.total))) fail('담당 지정(둘째): 자동 행 M/D 4 · 같은 ID · 히트맵 +4 불일치: ' + JSON.stringify(s14.afterB));
    else ok(`담당 지정(둘째): ${vendorId} → 팀원3 · 자동 행 ${a14.id} 계획 M/D 2 → ${s14.afterB.auto[0].plannedMd} · 히트맵 +4`);
    // 둘째 항목을 팀원1(수동 행 있음)로 → 팀원1 자동 행은 만들지 않고 overlaps 배지 · 팀원3 자동 행은 2 로
    await clickSel(cdp, `#screen-A [data-action="open-form"][data-table="items"][data-mode="edit"][data-key="${vendorId}"]`);
    await sleep(200);
    await setInput(cdp, '#edit-form [data-form-field="owner"]', '팀원1');
    await clickSel(cdp, '#edit-form [data-action="form-save"]');
    await sleep(500);
    s14.afterC = await evalJson(cdp, `({ auto: ${autoRowsExpr(P3)}, overlaps: window.TeamBoard.state.overlaps[${JSON.stringify(P3)}] || null, utilAfter: ${util3} })`);
    await evalJson(cdp, `(window.TeamBoard.goTab('B'), true)`);
    await sleep(200);
    s14.overlapUi = await evalJson(cdp, `(() => { const b = document.querySelector('#screen-B .tb-overlap'); const tr = b ? b.closest('tr') : null; const mem = tr ? (tr.querySelector('[data-field="member"]') || {}).value : null;
      return { badges: document.querySelectorAll('#screen-B .tb-overlap').length, text: b ? b.textContent.trim() : '', member: mem, autoRows: document.querySelectorAll('#screen-B tr.is-auto').length, project: (document.getElementById('assign-project') || {}).value }; })()`);
    report.writePaths.itemOwnerAssign = s14;
    const ov14 = (s14.afterC.overlaps || [])[0] || null;
    if (!(s14.afterC.auto.length === 1 && s14.afterC.auto[0].member === '팀원3' && s14.afterC.auto[0].plannedMd === 2 && ov14 && ov14.member === '팀원1' && ov14.role === '운영 PM' && ov14.itemsMd === 2 && ov14.manualMd === 24 && Math.abs(s14.afterC.utilAfter - s14.utilBefore - 2) < 0.01)) fail('담당 변경(팀원1 · 수동 행 있음): 자동 행 미생성 · overlaps(세부 2 · 수동 24) · 팀원3 자동 행 2 불일치: ' + JSON.stringify(s14.afterC));
    else ok(`담당 변경(팀원1): 자동 행은 팀원3 ${s14.afterC.auto[0].plannedMd} M/D 만 · overlaps 팀원1/운영 PM 세부 ${ov14.itemsMd} · 수동 ${ov14.manualMd}`);
    if (!(s14.overlapUi.project === P3 && s14.overlapUi.badges === 1 && s14.overlapUi.member === '팀원1' && /세부 합계 2\.0 M\/D · 수동 24\.0 M\/D/.test(s14.overlapUi.text) && /수동 행을 지우면 자동으로 바뀜/.test(s14.overlapUi.text) && s14.overlapUi.autoRows === 1)) fail('B 편집기: 팀원1 수동 행 옆 겹침 배지 불일치: ' + JSON.stringify(s14.overlapUi));
    else ok(`B 편집기: 팀원1 수동 행 옆 "${s14.overlapUi.text}"`);

    // ---- 3-15 주석 — 스레드 열기 → 남기기(질문) → 배지 +1 → E 반영 → 해결 → 미해결 −1 · 남의 주석 본문 수정 거부 · 남의 주석 해결은 허용 ----
    console.log('\n[3-15] 주석 — 남기기 · 해결 · E 미해결 목록 · 작성자 규칙');
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const s15 = { itemId: venueId };
    await clickSel(cdp, `#screen-A [data-action="toggle-notes"][data-key="${venueId}"]`);
    await sleep(200);
    const THREAD = `(() => { const t = document.querySelector('#screen-A .tb-notes[data-notes=${JSON.stringify(venueId)}]'); const badge = document.querySelector('#screen-A [data-item-row=${JSON.stringify(venueId)}] .tb-note-badge');
      return { thread: !!t, notes: t ? t.querySelectorAll('.tb-note').length : 0, resolved: t ? t.querySelectorAll('.tb-note.is-resolved').length : 0, badge: badge ? badge.textContent.trim() : '',
        contents: t ? [...t.querySelectorAll('.tb-note .n-content')].map(n => n.textContent.trim()) : [], input: !!document.querySelector('#screen-A [data-note-input=${JSON.stringify(venueId)}]'),
        editButtons: t ? t.querySelectorAll('[data-action="open-form"][data-table="notes"]').length : 0 }; })()`;
    s15.opened = await evalJson(cdp, THREAD);
    if (!(s15.opened.thread && s15.opened.notes === 1 && /주석 1 · 미해결 1/.test(s15.opened.badge) && /수용 인원/.test(s15.opened.contents[0] || '') && s15.opened.input)) fail('주석 스레드: 첫 주석 1건 · 배지 "주석 1 · 미해결 1" · 입력 줄 표시 실패: ' + JSON.stringify(s15.opened));
    else ok(`주석 스레드: 열림 · ${s15.opened.notes}건 · 배지 "${s15.opened.badge}" · 입력 줄 표시`);
    const n15 = await evalJson(cdp, `window.TeamBoard.state.data.notes.length`);
    await setInput(cdp, `#screen-A [data-note-input="${venueId}"] [data-field="type"]`, '질문');
    await setInput(cdp, `#screen-A [data-note-input="${venueId}"] [data-field="content"]`, '게이트 질문');
    await clickSel(cdp, `#screen-A [data-action="note-add"][data-key="${venueId}"]`);
    await sleep(500);
    s15.afterAdd = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const n = d.notes.find(x => x.content === '게이트 질문') || null; const ui = ${THREAD};
      return { notes: d.notes.length, note: n && { id: n.id, type: n.type, author: n.author, authorName: n.authorName, at: n.at, itemId: n.itemId, part: n.part, milestone: n.milestone, resolved: n.resolved }, user: d.meta.user, ui, history0: (d.history || [])[0] || null }; })()`);
    const newNote = s15.afterAdd.note;
    if (!(s15.afterAdd.notes === n15 + 1 && newNote && /^N-\d{6}$/.test(newNote.id) && newNote.type === '질문' && newNote.author === s15.afterAdd.user && newNote.at && newNote.itemId === venueId && newNote.part === '운영 PM' && newNote.milestone === '답사' && newNote.resolved === '')) fail('주석 남기기: 주석 +1 · 작성자(접속 사용자)·일시 서버 채움 · 항목·파트 상속 불일치: ' + JSON.stringify(s15.afterAdd));
    else ok(`주석 남기기: ${newNote.id} 질문 "게이트 질문" · 작성자 ${newNote.author} · ${newNote.at}`);
    if (!(s15.afterAdd.ui.notes === 2 && /주석 2 · 미해결 2/.test(s15.afterAdd.ui.badge) && s15.afterAdd.ui.editButtons >= 1 && s15.afterAdd.history0 && s15.afterAdd.history0.sheet === '주석' && s15.afterAdd.history0.action === '추가')) fail('주석 남기기: 스레드 2건 · 배지 "주석 2 · 미해결 2" · 본인 주석 [수정] · 변경이력(주석/추가) 불일치: ' + JSON.stringify({ ui: s15.afterAdd.ui, history0: s15.afterAdd.history0 }));
    else ok(`주석 남기기: 배지 "${s15.afterAdd.ui.badge}" · 본인 주석 [수정] ${s15.afterAdd.ui.editButtons}개 · 변경이력 "주석 / 추가"`);
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(200);
    const e15a = await evalJson(cdp, DOM_CHECKS.E);
    if (!(e15a.openNotes.some((x) => /게이트 질문/.test(x)) && e15a.openNotes.length === 5)) fail('E 미해결 질문·요청: "게이트 질문" 포함 5건이 아님: ' + JSON.stringify(e15a.openNotes));
    else ok(`E 미해결 질문·요청: ${e15a.openNotes.length}건 · "게이트 질문" 포함`);
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    await clickSel(cdp, `#screen-A [data-action="note-resolve"][data-id="${newNote.id}"]`);
    await sleep(500);
    s15.afterResolve = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; const n = d.notes.find(x => x.id === ${JSON.stringify(newNote.id)}) || {}; const ui = ${THREAD};
      return { resolved: n.resolved, ui, history0: (d.history || [])[0] || null }; })()`);
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(200);
    const e15b = await evalJson(cdp, DOM_CHECKS.E);
    if (!(s15.afterResolve.resolved === '예' && s15.afterResolve.ui.resolved === 1 && /주석 2 · 미해결 1/.test(s15.afterResolve.ui.badge) && s15.afterResolve.history0 && s15.afterResolve.history0.action === '수정' && /해결/.test(s15.afterResolve.history0.summary || ''))) fail('주석 해결: 해결 "예" · 흐림 1 · 배지 "주석 2 · 미해결 1" · 변경이력(수정 · 해결) 불일치: ' + JSON.stringify(s15.afterResolve));
    else ok(`주석 해결: ${newNote.id} 해결 예 · 배지 "${s15.afterResolve.ui.badge}"`);
    if (!(e15b.openNotes.length === 4 && !e15b.openNotes.some((x) => /게이트 질문/.test(x)))) fail('E 미해결 질문·요청: 해결 후 "게이트 질문" 이 남아 있거나 4건이 아님: ' + JSON.stringify(e15b.openNotes));
    else ok(`E 미해결 질문·요청: ${e15a.openNotes.length} → ${e15b.openNotes.length}건 · "게이트 질문" 제외`);
    // 작성자 규칙 — 남의 주석(N-000001 · mock@example.com) 본문 수정은 거부, 해결 표시는 허용
    const otherEdit = await evalJson(cdp, `(() => { const n = window.TeamBoard.state.data.notes.find(x => x.id === 'N-000001'); const row = Object.assign({}, n, { content: '남의 주석 고치기' }); return window.TeamBoard.actions.saveNote(row, Object.assign({}, n)); })()`);
    const otherAfter = await evalJson(cdp, `(window.TeamBoard.state.data.notes.find(x => x.id === 'N-000001') || {}).content`);
    const otherResolve = await evalJson(cdp, `(() => { const n = window.TeamBoard.state.data.notes.find(x => x.id === 'N-000003'); const row = Object.assign({}, n, { resolved: '예' }); return window.TeamBoard.actions.saveNote(row, Object.assign({}, n)); })()`);
    const otherResolved = await evalJson(cdp, `(window.TeamBoard.state.data.notes.find(x => x.id === 'N-000003') || {}).resolved`);
    s15.authorRule = { otherEdit, otherAfter, otherResolve: !!otherResolve, otherResolved };
    report.writePaths.notes = s15;
    if (!(otherEdit === null && /수용 인원/.test(otherAfter || '') && otherResolve && otherResolved === '예')) fail('주석 작성자 규칙: 남의 주석 본문 수정 거부 · 해결 표시 허용 불일치: ' + JSON.stringify(s15.authorRule));
    else ok('주석 작성자 규칙: 남의 주석 본문 수정 거부(N-000001 유지) · 해결 표시는 허용(N-000003 → 예)');

    // ---- 3-16 세부 항목 삭제 — 2단계 확인(취소 → 확인) → 주석 연쇄 −2 · 배정 자동 행 갱신(팀원3 자동 행 제거) ----
    console.log('\n[3-16] 세부 항목 삭제 — 주석 연쇄 · 배정 자동 행 갱신');
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const s16 = { itemId: venueId, before: await evalJson(cdp, COUNTS) };
    const delI = `#screen-A [data-action="delete-row"][data-table="items"][data-key="${venueId}"]`;
    s16.buttonShown = await evalJson(cdp, `!!document.querySelector(${JSON.stringify(delI)})`);
    await clickSel(cdp, delI);
    await sleep(200);
    s16.afterFirstClick = await evalJson(cdp, `(() => { const c = document.querySelector('#screen-A [data-items=${JSON.stringify(K13)}] .tb-confirm'); return { confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key=${JSON.stringify(venueId)}]'), text: c ? c.textContent.replace(/\\s+/g, ' ').trim() : '', items: window.TeamBoard.state.data.items.length }; })()`);
    await clickSel(cdp, '#screen-A [data-action="confirm-no"]');
    await sleep(200);
    s16.afterCancel = await evalJson(cdp, `({ confirmShown: !!document.querySelector('#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key=${JSON.stringify(venueId)}]'), buttonBack: !!document.querySelector(${JSON.stringify(delI)}), items: window.TeamBoard.state.data.items.length })`);
    await clickSel(cdp, delI);
    await sleep(150);
    await clickSel(cdp, `#screen-A [data-action="confirm-yes"][data-confirm-action="delete-row"][data-key="${venueId}"]`);
    await sleep(500);
    s16.after = await evalJson(cdp, COUNTS);
    s16.detail = await evalJson(cdp, `(() => { const d = window.TeamBoard.state.data; return { gone: !d.items.some(x => x.id === ${JSON.stringify(venueId)}), notesLeft: d.notes.filter(n => n.itemId === ${JSON.stringify(venueId)}).length,
      rowGone: !document.querySelector('#screen-A [data-item-row=${JSON.stringify(venueId)}]'), stillOpen: !!document.querySelector('#screen-A [data-items=${JSON.stringify(K13)}]'), rows: document.querySelectorAll('#screen-A [data-items=${JSON.stringify(K13)}] [data-item-row]').length,
      auto: ${autoRowsExpr(P3)}, overlaps: window.TeamBoard.state.overlaps[${JSON.stringify(P3)}] || null, rollup: ${ROLLUP},
      history: (d.history || []).slice(0, 2).map(h => h.sheet + ' / ' + h.action + ' / ' + String(h.summary).split('\\n')[0]) }; })()`);
    report.writePaths.deleteRowItem = s16;
    if (!(s16.buttonShown && s16.afterFirstClick.confirmShown && /주석 2/.test(s16.afterFirstClick.text) && s16.afterFirstClick.items === s16.before.items)) fail('세부 항목 삭제: 1회 클릭 → 확인 단계("주석 2 도 함께 삭제") 불일치: ' + JSON.stringify(s16.afterFirstClick));
    else ok(`세부 항목 삭제: 1회 클릭 → "${s16.afterFirstClick.text.slice(0, 50)}" · 아직 미실행`);
    if (!(!s16.afterCancel.confirmShown && s16.afterCancel.buttonBack && s16.afterCancel.items === s16.before.items)) fail('세부 항목 삭제: [취소] 후 원래 버튼으로 돌아오지 않음: ' + JSON.stringify(s16.afterCancel));
    else ok('세부 항목 삭제: [취소] → 원래 버튼 복귀 · 미실행');
    if (!(s16.detail.gone && s16.after.items === s16.before.items - 1 && s16.after.notes === s16.before.notes - 2 && s16.detail.notesLeft === 0 && s16.detail.rowGone && s16.detail.stillOpen && s16.detail.rows === 1)) fail('세부 항목 삭제: [확인] → 항목 −1 · 주석 −2 · 행 제거 · 펼침 유지 실패: ' + JSON.stringify({ before: s16.before, after: s16.after, detail: s16.detail }));
    else ok(`세부 항목 삭제: [확인] → 세부 항목 ${s16.before.items} → ${s16.after.items} · 주석 ${s16.before.notes} → ${s16.after.notes}(연쇄) · 남은 행 ${s16.detail.rows}`);
    if (!(s16.detail.auto.length === 0 && s16.after.assignments === s16.before.assignments - 1 && /^4\.0 M\/D/.test(s16.detail.rollup.total) && /^배정 \/ 저장 \/ 세부항목 동기화: 0행/.test(s16.detail.history[0]) && /^세부항목 \/ 삭제/.test(s16.detail.history[1]))) fail('세부 항목 삭제: 팀원3 자동 행 제거(배정 −1) · 합계 4.0 M/D · 변경이력(세부항목 삭제 → 배정 동기화 0행) 불일치: ' + JSON.stringify({ auto: s16.detail.auto, assignments: [s16.before.assignments, s16.after.assignments], rollup: s16.detail.rollup, history: s16.detail.history }));
    else ok(`세부 항목 삭제: 팀원3 자동 행 제거(배정 ${s16.before.assignments} → ${s16.after.assignments}) · 합계 ${s16.detail.rollup.total} · 이력 "${s16.detail.history[0]}"`);

    // ---- 3-17 E — 핵심 항목 미배정(P-2026-003 연사·패널 섭외 1건) → 클릭 → A 이동 · 마일스톤 펼침 ----
    console.log('\n[3-17] E 핵심 항목 미배정 → A 이동 · 펼침');
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(200);
    const e17 = await evalJson(cdp, DOM_CHECKS.E);
    const s17 = { keyUnassigned: e17.keyUnassigned, openNotes: e17.openNotes };
    if (!(e17.keyUnassigned.length === 1 && /연사·패널 섭외/.test(e17.keyUnassigned[0]) && /가상 브랜드 런칭 쇼케이스/.test(e17.keyUnassigned[0]) && /운영계획서 확정/.test(e17.keyUnassigned[0]))) fail('E 핵심 항목 미배정: P-2026-003 연사·패널 섭외 1건이 아님: ' + JSON.stringify(e17.keyUnassigned));
    else ok(`E 핵심 항목 미배정: 1건 — "${e17.keyUnassigned[0].slice(0, 70)}"`);
    await clickSel(cdp, '[data-warning="keyUnassigned"] [data-action="goto-item"]');
    await sleep(250);
    const K17 = `${P3}|운영계획서 확정`;
    s17.after = await evalJson(cdp, `({ tab: window.TeamBoard.state.tab, selected: window.TeamBoard.state.selectedProject, open: !!window.TeamBoard.state.itemsOpen[${JSON.stringify(K17)}], dom: !!document.querySelector('#screen-A [data-items=${JSON.stringify(K17)}]'), row: !!document.querySelector('#screen-A [data-item-row="W-000005"]'), keyHighlight: !!document.querySelector('#screen-A [data-item-row="W-000005"].is-key-unassigned') })`);
    report.writePaths.keyUnassigned = s17;
    if (!(s17.after.tab === 'A' && s17.after.selected === P3 && s17.after.open && s17.after.dom && s17.after.row && s17.after.keyHighlight)) fail('E 핵심 항목 미배정 클릭: A 이동 · P-2026-003 선택 · "운영계획서 확정" 펼침 · W-000005 행 강조 실패: ' + JSON.stringify(s17.after));
    else ok('E 핵심 항목 미배정 클릭: A 이동 · P-2026-003 선택 · "운영계획서 확정" 펼침 · W-000005 행 강조');

    // ---- 3-18 마일스톤 삭제 거부 — 세부 항목이 있는 "운영계획서 확정": [삭제] 자리에 불가 사유 · 직접 호출도 실행 안 됨 ----
    console.log('\n[3-18] 마일스톤 삭제 거부(세부 항목 있음)');
    const s18 = { key: K17, milestonesBefore: await evalJson(cdp, `window.TeamBoard.state.data.milestones.length`) };
    s18.blocked = await evalJson(cdp, `(() => { const b = document.querySelector('#screen-A [data-delete-blocked=${JSON.stringify(K17)}]'); return { button: !!document.querySelector('#screen-A [data-action="delete-row"][data-table="milestones"][data-key=${JSON.stringify(K17)}]'), reason: b ? b.textContent.trim() : null }; })()`);
    const tryDel18 = await evalJson(cdp, `window.TeamBoard.actions.deleteRow('milestones', ${JSON.stringify(K17)})`);
    s18.attempt = { result: tryDel18, milestones: await evalJson(cdp, `window.TeamBoard.state.data.milestones.length`), still: await evalJson(cdp, `window.TeamBoard.state.data.milestones.some(m => m.projectId === ${JSON.stringify(P3)} && m.name === '운영계획서 확정')`) };
    report.writePaths.milestoneDeleteBlocked = s18;
    if (!(!s18.blocked.button && s18.blocked.reason && /세부 항목 1건/.test(s18.blocked.reason) && /먼저 지우세요/.test(s18.blocked.reason))) fail('마일스톤 삭제 거부: [삭제] 자리에 "세부 항목 1건 … 먼저 지우세요" 문장이 없음: ' + JSON.stringify(s18.blocked));
    else ok(`마일스톤 삭제 거부: "${s18.blocked.reason}"`);
    if (!(tryDel18 === null && s18.attempt.still && s18.attempt.milestones === s18.milestonesBefore)) fail('마일스톤 삭제 거부: actions.deleteRow 가 세부 항목 있는 마일스톤을 지움: ' + JSON.stringify(s18.attempt));
    else ok('마일스톤 삭제 거부: 직접 호출해도 실행되지 않음(마일스톤 수 유지)');

    // ---- 3-19 파트 필터 — 세부 항목 표 · E 미해결 목록 · localStorage 'tb.part' ----
    console.log('\n[3-19] 파트 필터');
    const K19 = 'P-2026-002|랜딩페이지 컨펌';
    await evalJson(cdp, `(window.TeamBoard.state.selectedProject = 'P-2026-002', window.TeamBoard.state.itemsOpen[${JSON.stringify(K19)}] = true, window.TeamBoard.render(), window.TeamBoard.goTab('A'), true)`);
    await sleep(150);
    const ROWS19 = `(() => ({ rows: [...document.querySelectorAll('#screen-A [data-items=${JSON.stringify(K19)}] [data-item-row]')].map(r => r.getAttribute('data-item-part')), part: window.TeamBoard.state.part, stored: (() => { try { return window.localStorage.getItem('tb.part'); } catch (e) { return 'n/a'; } })(), onChip: (document.querySelector('#screen-A [data-action="part-filter"].is-on') || {}).textContent || '' }))()`;
    const s19 = { before: await evalJson(cdp, ROWS19) };
    await clickSel(cdp, '#screen-A [data-action="part-filter"][data-part="디자인·제작"]');
    await sleep(200);
    s19.filtered = await evalJson(cdp, ROWS19);
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);
    await sleep(150);
    s19.e = await evalJson(cdp, `(() => { const s = document.querySelector('[data-warning="openNotes"]'); return { title: s ? s.querySelector('h3').textContent : '', items: [...document.querySelectorAll('[data-warning="openNotes"] [data-item]')].length }; })()`);
    await evalJson(cdp, `(window.TeamBoard.goTab('A'), true)`);
    await clickSel(cdp, '#screen-A [data-action="part-filter"][data-part=""]');
    await sleep(200);
    s19.reset = await evalJson(cdp, ROWS19);
    report.writePaths.partFilter = s19;
    if (!(s19.before.rows.length === 2 && s19.before.part === '' && s19.before.onChip === '전체' && s19.filtered.rows.length === 1 && s19.filtered.rows[0] === '디자인·제작' && s19.filtered.part === '디자인·제작' && s19.filtered.stored === '디자인·제작' && s19.filtered.onChip === '디자인·제작')) fail('파트 필터: 디자인·제작 선택 시 세부 항목 2 → 1(디자인·제작) · localStorage 저장 실패: ' + JSON.stringify(s19));
    else ok(`파트 필터: 랜딩페이지 컨펌 ${s19.before.rows.length}행 → 디자인·제작 ${s19.filtered.rows.length}행 · localStorage tb.part = "${s19.filtered.stored}"`);
    if (!(/디자인·제작/.test(s19.e.title) && s19.e.items === 0)) fail('파트 필터: E 미해결 질문·요청 제목에 파트 표시 · 디자인·제작 미해결 0건 불일치: ' + JSON.stringify(s19.e));
    else ok(`파트 필터: E "${s19.e.title}" ${s19.e.items}건`);
    if (!(s19.reset.rows.length === 2 && s19.reset.part === '' && s19.reset.stored === '')) fail('파트 필터: "전체" 복귀 실패: ' + JSON.stringify(s19.reset));
    else ok('파트 필터: "전체" → 2행 복귀 · localStorage 비움');
    await evalJson(cdp, `(window.TeamBoard.goTab('E'), true)`);

    if (report.mockWrites.length < 10) fail(`[mock write] 로그가 10건 미만 (${report.mockWrites.length}건)`);
    else ok(`[mock write] 로그 ${report.mockWrites.length}건 (4턴 게이트 포함)`);
    const mwAdd = report.mockWrites.filter((m) => /addItems/.test(m)).length;
    if (mwAdd < 2) fail(`[mock write] addItems 로그가 2건 미만 (${mwAdd}건 — 버튼 경로 + 재실행)`);
    else ok(`[mock write] addItems 로그 ${mwAdd}건 · 전체 ${report.mockWrites.length}건`);
    const dialogHits = report.consoleErrors.filter((e) => /대화상자/.test(e)).length;
    if (dialogHits) fail(`브라우저 대화상자(confirm/alert/prompt) 호출 ${dialogHits}건`);
    else ok('브라우저 대화상자 호출 0건');

    // ---- 4. 해시 초기 진입 (#C 로 새로 열기) ----
    const loaded2 = new Promise((r) => cdp.on((m) => m.method === 'Page.loadEventFired' && r()));
    await cdp.send('Page.navigate', { url: fileUrl(PREVIEW) + '?r=2#C' });
    await loaded2;
    await sleep(600);
    const hashC = await evalJson(cdp, `(() => { const s = document.querySelector('#screen-C'); return !!s && s.offsetHeight > 0; })()`);
    if (!hashC) fail('해시 #C 초기 진입 시 화면 C 가 선택되지 않음');
    else ok('해시 #C 초기 진입 정상');
  } finally {
    if (cdp) cdp.close();
    proc.kill();
    await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) { /* 무시 */ }
  }

  report.consoleErrorCount = report.consoleErrors.length;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'render-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n콘솔 오류 ${report.consoleErrorCount}건 · 실패 ${report.failures.length}건 · 보고서 preview/screenshots/render-report.json`);
  if (report.consoleErrors.length) report.consoleErrors.forEach((e) => console.error('  콘솔: ' + e));
  process.exit(report.failures.length || report.consoleErrors.length ? 1 : 0);
}

main().catch((e) => { console.error('실렌더 게이트 실행 오류: ' + (e && e.stack || e)); process.exit(2); });
