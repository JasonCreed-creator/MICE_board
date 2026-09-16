#!/usr/bin/env node
/*!
 * static-check.js — 정적 검사 게이트 (의존성 없음 · Node 내장 모듈만)
 *
 * 지금까지 사람이 눈으로 하던 검수(SPEC §9 "정적 검사")를 코드로 옮긴 것이다.
 * 실패가 1건이라도 있으면 무엇이 어느 파일 몇 줄에서 걸렸는지 한국어로 출력하고 종료 코드 1.
 *
 *   1. 금지 필드      단가 · 급여 · 원가율 · 인건비 (결정 D3 · 계약 §1 "금지 필드")
 *   2. 브라우저 대화상자  alert( · confirm( · prompt(  (2단계 인라인 확인만 쓴다 · D6a)
 *   3. 외부 주소      http:// · https://  (외부 라이브러리·웹폰트 금지 · 오프라인·CSP 무관)
 *   4. 화면 라벨 약어  R&R · WBS  (라벨 한국어 원칙)
 *   5. 빌드 산출물 동기 (경고) src/* 와 apps-script/index.html · Code.gs · preview/*.html 의 인라인 내용 대조
 *   6. 자격증명·실계정  실제 스크립트 ID · 토큰 · 회사 계정 이메일이 저장소에 들어갔는지 (저장소 공개 상태 대비)
 *
 * 검사 대상은 **산출물·데이터·문서 경로**다(아래 SCAN). 세션 메모인 `PROGRESS.md`·`CLAUDE.md` 는 보지 않는다
 * — 그 두 파일의 시트 주소·프로젝트 ID 정리는 사람이 판단할 일이라 게이트로 막지 않는다(보고서로 알린다).
 *
 * 실행  node scripts/static-check.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function at() {
  var parts = [ROOT];
  for (var i = 0; i < arguments.length; i++) { parts.push(arguments[i]); }
  return path.join.apply(path, parts);
}
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

/* ── 검사 대상 ────────────────────────────────────────────────── */

/** 화면·데이터 경로 = 팀이 실제로 보는 것(여기에는 금지어가 한 글자도 없어야 한다) */
var SCREEN_DIRS = ['src', 'apps-script', 'mock', 'preview', 'data'];
/** 문서 경로 = 규칙을 적는 곳(금지어를 "금지한다" 고 쓸 수 있다 — 부정 맥락만 허용) */
var DOC_DIRS = ['docs', 'guide'];
/** 그 밖에 훑는 곳(자격증명 검사용) */
var EXTRA_DIRS = ['scripts', 'tests', '.github'];
var EXTRA_FILES = ['package.json', '.clasp.json.example', '.claspignore', '.gitignore'];

/** 빌드 산출물(외부 주소가 절대 없어야 하는 파일) */
var BUILD_OUTPUTS = [at('apps-script', 'index.html'), at('preview', 'dashboard-preview.html'), at('apps-script', 'Code.gs')];

var TEXT_EXT = ['.js', '.gs', '.html', '.css', '.json', '.md', '.tsv', '.csv', '.yml', '.yaml', '.txt'];
var SKIP_DIR = ['node_modules', '.git', 'screenshots'];

function isText(file) { return TEXT_EXT.indexOf(path.extname(file).toLowerCase()) >= 0; }

/** 디렉터리 하나를 훑어 텍스트 파일 경로 배열을 만든다 */
function walk(dir, out) {
  var abs = path.isAbsolute(dir) ? dir : at(dir);
  if (!fs.existsSync(abs)) { return out; }
  var st = fs.statSync(abs);
  if (st.isFile()) { if (isText(abs)) { out.push(abs); } return out; }
  fs.readdirSync(abs).forEach(function (name) {
    if (SKIP_DIR.indexOf(name) >= 0) { return; }
    var p = path.join(abs, name);
    var s = fs.statSync(p);
    if (s.isDirectory()) { walk(p, out); }
    else if (isText(p)) { out.push(p); }
  });
  return out;
}

function read(file) { return fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); }
function lines(text) { return text.split(/\r?\n/); }

/* ── 결과 모으기 ──────────────────────────────────────────────── */

var failures = [];   // { check, file, line, text, why }
var warnings = [];   // { check, message }
var counts = {};     // 검사별 훑은 파일 수

function fail(check, file, lineNo, text, why) {
  failures.push({ check: check, file: rel(file), line: lineNo, text: String(text).trim().slice(0, 160), why: why });
}
function warn(check, message) { warnings.push({ check: check, message: message }); }

/* ── 1. 금지 필드 ─────────────────────────────────────────────── */

var FORBIDDEN_WORDS = ['단가', '급여', '원가율', '인건비'];
/** 문서에서 금지어를 "쓰지 않는다" 는 뜻으로 적을 때 쓰는 말 — 같은 줄 또는 바로 위 줄에 있으면 통과 */
var NEGATION = ['금지', '없음', '없이', '않', '제외', '미포함', '범위 밖', '0건', 'D3', '두지', '배제', '넣지', '뺀다', '아니'];

function hasNegation(s) {
  for (var i = 0; i < NEGATION.length; i++) { if (s.indexOf(NEGATION[i]) >= 0) { return true; } }
  return false;
}

function checkForbiddenWords() {
  var screen = [];
  SCREEN_DIRS.forEach(function (d) { walk(d, screen); });
  counts['금지 필드(화면·데이터)'] = screen.length;
  screen.forEach(function (file) {
    lines(read(file)).forEach(function (text, i) {
      FORBIDDEN_WORDS.forEach(function (w) {
        if (text.indexOf(w) >= 0) {
          fail('1 금지 필드', file, i + 1, text, '화면·데이터 경로에는 "' + w + '" 를 둘 수 없습니다(결정 D3).');
        }
      });
    });
  });

  var docs = [];
  DOC_DIRS.forEach(function (d) { walk(d, docs); });
  counts['금지 필드(문서)'] = docs.length;
  docs.forEach(function (file) {
    var ls = lines(read(file));
    var prev = '';
    ls.forEach(function (text, i) {
      FORBIDDEN_WORDS.forEach(function (w) {
        if (text.indexOf(w) < 0) { return; }
        if (hasNegation(text) || hasNegation(prev)) { return; }   // "…는 두지 않는다" 같은 규칙 문장은 허용
        fail('1 금지 필드', file, i + 1, text,
          '문서에서 "' + w + '" 는 금지·제외를 설명할 때만 쓸 수 있습니다(같은 줄 또는 바로 위 줄에 금지·없음·제외 등이 있어야 합니다).');
      });
      if (text.trim() !== '') { prev = text; }
    });
  });
}

/* ── 2. 브라우저 대화상자 ─────────────────────────────────────── */

var DIALOG_BROWSER = /(?:^|[^.\w$])(alert|confirm|prompt)\s*\(/;
var DIALOG_WINDOW = /\bwindow\s*\.\s*(alert|confirm|prompt)\s*\(/;

function checkDialogs() {
  var browserFiles = [];
  ['src', 'preview'].forEach(function (d) { walk(d, browserFiles); });
  browserFiles.push(at('apps-script', 'index.html'));
  browserFiles = browserFiles.filter(function (f) { return fs.existsSync(f); });
  counts['브라우저 대화상자'] = browserFiles.length + 1;

  browserFiles.forEach(function (file) {
    lines(read(file)).forEach(function (text, i) {
      if (DIALOG_BROWSER.test(text) || DIALOG_WINDOW.test(text)) {
        fail('2 브라우저 대화상자', file, i + 1, text, '대화상자 대신 2단계 인라인 확인을 씁니다(D6a).');
      }
    });
  });

  /* Code.gs 는 시트 메뉴 안내에 SpreadsheetApp.getUi().alert 을 쓴다(서버 UI · 허용).
     브라우저 대화상자(window.alert 등)만 막는다. */
  var code = at('apps-script', 'Code.gs');
  if (fs.existsSync(code)) {
    lines(read(code)).forEach(function (text, i) {
      if (DIALOG_WINDOW.test(text)) {
        fail('2 브라우저 대화상자', code, i + 1, text, 'Apps Script 서버 코드에서 브라우저 대화상자를 부를 수 없습니다.');
      }
    });
  }
}

/* ── 3. 외부 주소 ─────────────────────────────────────────────── */

function checkExternalUrls() {
  var files = BUILD_OUTPUTS.concat(walk('src', []));
  files = files.filter(function (f) { return fs.existsSync(f); });
  counts['외부 주소'] = files.length;
  files.forEach(function (file) {
    lines(read(file)).forEach(function (text, i) {
      var m = text.match(/https?:\/\/[^\s"'`)<>]*/);
      if (m) {
        fail('3 외부 주소', file, i + 1, text, '외부 라이브러리·웹폰트·외부 링크 금지: ' + m[0]);
      }
    });
  });
}

/* ── 4. 화면 라벨 약어 ────────────────────────────────────────── */

var LABEL_ABBR = [/R&R/, /\bWBS\b/];

function checkLabelAbbreviations() {
  var files = [];
  SCREEN_DIRS.forEach(function (d) { walk(d, files); });
  counts['화면 라벨 약어'] = files.length;
  files.forEach(function (file) {
    lines(read(file)).forEach(function (text, i) {
      LABEL_ABBR.forEach(function (re) {
        if (re.test(text)) {
          fail('4 화면 라벨 약어', file, i + 1, text, '화면·데이터에는 업계 약어를 쓰지 않습니다(업무 블럭·세부 항목으로 부릅니다).');
        }
      });
    });
  });
}

/* ── 5. 빌드 산출물 동기 (경고) ───────────────────────────────── */

/* build.js 와 같은 이스케이프 — 값이 그대로 들어갔는지 대조하기 위한 것 */
function safeScript(code) { return code.split('</script').join('<\\/script'); }
function safeStyle(css) { return css.split('</style').join('<\\/style'); }
function safeJson(text) { return text.split('</').join('<\\/').split('<!--').join('\\u003c!--'); }

function checkBuildSync() {
  var srcFiles = {
    'src/styles.css': safeStyle,
    'src/schema.js': safeScript,
    'src/metrics.js': safeScript,
    'src/app.js': safeScript
  };
  var gas = at('apps-script', 'index.html');
  var preview = at('preview', 'dashboard-preview.html');
  var stale = [];

  [gas, preview].forEach(function (out) {
    if (!fs.existsSync(out)) { stale.push(rel(out) + ' 가 없습니다'); return; }
    var text = read(out);
    Object.keys(srcFiles).forEach(function (s) {
      var file = at(s);
      if (!fs.existsSync(file)) { return; }
      var body = srcFiles[s](read(file)).replace(/\s+$/, '');
      if (text.indexOf(body) < 0) { stale.push(rel(out) + ' 안의 ' + s + ' 내용이 최신이 아닙니다'); }
    });
  });

  /* mock 데이터 블록: 시트 연결본에는 없어야 하고 미리보기본에는 있어야 한다 */
  if (fs.existsSync(gas) && read(gas).indexOf('id="mock-data"') >= 0) {
    stale.push('apps-script/index.html 에 샘플 데이터 블록이 들어 있습니다(시트 연결본에는 없어야 합니다)');
  }
  var mock = at('mock', 'sample-data.json');
  if (fs.existsSync(preview) && fs.existsSync(mock)) {
    var pv = read(preview);
    if (pv.indexOf('id="mock-data"') < 0) { stale.push('preview/dashboard-preview.html 에 샘플 데이터 블록이 없습니다'); }
    else if (pv.indexOf(safeJson(read(mock)).replace(/\s+$/, '')) < 0) { stale.push('preview/dashboard-preview.html 의 샘플 데이터가 mock/sample-data.json 과 다릅니다'); }
  }

  /* Code.gs 마커 블록 = src/schema.js 원문 */
  var code = at('apps-script', 'Code.gs');
  var schema = at('src', 'schema.js');
  if (fs.existsSync(code) && fs.existsSync(schema)) {
    var text2 = read(code);
    var b = text2.indexOf('/* __SCHEMA_BEGIN__');
    var e = text2.indexOf('/* __SCHEMA_END__');
    if (b < 0 || e < 0 || e < b) { stale.push('apps-script/Code.gs 에 __SCHEMA_BEGIN__/__SCHEMA_END__ 마커가 없습니다'); }
    else {
      var block = text2.slice(text2.indexOf('\n', b) + 1, text2.lastIndexOf('\n', e) + 1).replace(/\s+$/, '');
      if (block !== read(schema).replace(/\s+$/, '')) { stale.push('apps-script/Code.gs 의 편집 계약 블록이 src/schema.js 와 다릅니다'); }
    }
  }

  counts['빌드 산출물 동기'] = 3;
  if (stale.length) {
    warn('5 빌드 산출물 동기', stale.join(' · ') + ' → `node scripts/build.js` 를 돌린 뒤 다시 커밋하세요. ' +
      '(재현성의 최종 판정은 CI 게이트의 `node scripts/build.js` + `git diff --exit-code` 입니다)');
  }
}

/* ── 6. 자격증명·실계정 ───────────────────────────────────────── */

/** 가상 데이터·예시에만 쓰는 도메인 */
var SAFE_MAIL = /@(example\.(com|org|net)|company\.com|test)$/i;
var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Apps Script 프로젝트·배포 ID 는 40자 이상의 긴 토큰이다 — 저장소에 적지 않는다(Secret·로컬 .clasp.json) */
var LONG_ID = /\b[A-Za-z0-9_-]{40,}\b/;
var SECRET_HINT = [/ya29\.[A-Za-z0-9_-]{10,}/, /\bAIza[A-Za-z0-9_-]{20,}/, /"refresh_token"\s*:\s*"[^"]{10,}/];

function checkSecrets() {
  var files = [];
  SCREEN_DIRS.concat(DOC_DIRS, EXTRA_DIRS).forEach(function (d) { walk(d, files); });
  EXTRA_FILES.forEach(function (f) { walk(f, files); });
  counts['자격증명·실계정'] = files.length;

  files.forEach(function (file) {
    var r = rel(file);
    lines(read(file)).forEach(function (text, i) {
      /* 실제 계정 이메일 */
      var mails = text.match(EMAIL_RE) || [];
      mails.forEach(function (m) {
        if (!SAFE_MAIL.test(m)) {
          fail('6 자격증명·실계정', file, i + 1, text, '실제 계정으로 보이는 이메일(' + m + ')은 저장소에 두지 않습니다. 예시는 example.com 을 씁니다.');
        }
      });
      /* 토큰 */
      SECRET_HINT.forEach(function (re) {
        if (re.test(text)) { fail('6 자격증명·실계정', file, i + 1, '(값은 옮기지 않습니다)', '토큰·자격증명으로 보이는 값이 있습니다. GitHub Secret 으로 옮기세요.'); }
      });
      /* 긴 ID — 스크립트·배포 ID. 자리표시자·해시 주석은 제외 */
      if (LONG_ID.test(text) && /(scriptId|deploymentId|spreadsheets\/d\/|script\.google\.com\/macros)/.test(text)) {
        if (text.indexOf('<') >= 0 || text.indexOf('${{') >= 0 || text.indexOf('여기에') >= 0) { return; }
        fail('6 자격증명·실계정', file, i + 1, '(값은 옮기지 않습니다)', r + ' 에 실제 스크립트·배포 ID 로 보이는 값이 있습니다. `.clasp.json`(커밋하지 않음) 또는 GitHub Secret 으로 옮기세요.');
      }
    });
  });
}

/* ── 실행 ─────────────────────────────────────────────────────── */

function main() {
  console.log('정적 검사 시작 — ' + ROOT);
  checkForbiddenWords();
  checkDialogs();
  checkExternalUrls();
  checkLabelAbbreviations();
  checkBuildSync();
  checkSecrets();

  console.log('');
  Object.keys(counts).forEach(function (k) {
    console.log('  ' + k + ' — 파일 ' + counts[k] + '개 검사');
  });

  if (warnings.length) {
    console.log('');
    warnings.forEach(function (w) { console.log('  [경고] ' + w.check + ' — ' + w.message); });
  }

  if (failures.length) {
    console.log('');
    console.error('정적 검사 실패 — ' + failures.length + '건');
    failures.forEach(function (f) {
      console.error('');
      console.error('  [' + f.check + '] ' + f.file + ':' + f.line);
      console.error('    ' + f.text);
      console.error('    → ' + f.why);
    });
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('정적 검사 통과 — 금지 필드 0 · 브라우저 대화상자 0 · 외부 주소 0 · 화면 라벨 약어 0 · 자격증명 노출 0' +
    (warnings.length ? ' (경고 ' + warnings.length + '건)' : ''));
}

try {
  main();
} catch (e) {
  console.error('정적 검사를 끝내지 못했습니다 — ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
}
