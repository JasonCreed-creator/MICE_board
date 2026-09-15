#!/usr/bin/env node
/*!
 * build.js — 단일 파일 빌드 (의존성 없음 · Node 내장 모듈만)
 *
 * 입력  src/index.template.html · src/styles.css · src/schema.js · src/metrics.js · src/app.js · mock/sample-data.json
 * 출력  apps-script/index.html          시트 연결본 — 샘플 데이터 블록 없음
 *       preview/dashboard-preview.html  미리보기본 — 샘플 데이터 인라인(더블클릭 확인용)
 *       apps-script/Code.gs             (부분) __SCHEMA_BEGIN__/__SCHEMA_END__ 마커 사이를 src/schema.js 로 채운다 — 나머지는 손으로 유지
 *
 * 실행  node scripts/build.js
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

/* ── 자리표시자 — 템플릿과 한 글자도 다르면 안 된다 ─────────────── */
var TOKEN = {
  STYLES: '<style>/*__STYLES__*/</style>',
  MOCK: '<!--__MOCK_DATA__-->',
  SCHEMA: '<script>/*__SCHEMA__*/</script>',
  METRICS: '<script>/*__METRICS__*/</script>',
  APP: '<script>/*__APP__*/</script>'
};

/* ── 도우미 ───────────────────────────────────────────────────── */

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}

/**
 * 자리표시자 1개를 정확히 1번 바꾼다.
 * String.replace 의 `$&`·`$1` 특수 패턴을 피하려고 split/join 을 쓴다.
 */
function fill(html, token, value, label) {
  var first = html.indexOf(token);
  if (first < 0) {
    throw new Error('템플릿에 ' + label + ' 자리표시자가 없습니다: ' + token);
  }
  if (html.indexOf(token, first + token.length) >= 0) {
    throw new Error('템플릿에 ' + label + ' 자리표시자가 2개 이상 있습니다: ' + token);
  }
  return html.split(token).join(value);
}

/** script 태그 안에 넣을 자바스크립트 — 태그가 일찍 닫히지 않게 막는다 */
function safeScript(code, label) {
  var out = code.split('</script').join('<\\/script');
  if (out !== code) {
    console.warn('  [알림] ' + label + ' 안의 "</script" 를 이스케이프했습니다.');
  }
  return out;
}

/** style 태그 안에 넣을 CSS */
function safeStyle(css) {
  return css.split('</style').join('<\\/style');
}

/**
 * script 태그 안에 넣을 JSON.
 * - 태그 닫기 기호(슬래시 앞)는 `<\/` 로 — JSON 에서 `\/` 는 `/` 와 같은 글자다.
 * - 주석 여는 기호는 앞의 `<` 를 `<` 로 — JSON 은 `\!` 이스케이프를 허용하지 않으므로
 *   계약 문서의 표기(`<\!--`) 대신 유니코드 이스케이프를 쓴다(결과는 같고 JSON.parse 가 성공한다).
 * 둘 다 바꾼 뒤에도 JSON.parse 결과는 원본과 같다.
 */
function safeJson(text) {
  return text.split('</').join('<\\/').split('<!--').join('\\u003c!--');
}

function writeOut(file, html) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  return Buffer.byteLength(html, 'utf8');
}

/** 외부 주소가 섞여 들어갔는지 확인 */
function checkExternal(file, html) {
  var hits = html.match(/https?:\/\//g);
  if (hits && hits.length) {
    console.warn('  [경고] ' + rel(file) + ' 에 외부 주소 참조가 ' + hits.length +
      '건 있습니다. 외부 라이브러리·웹폰트 금지 규칙을 확인하세요.');
    return hits.length;
  }
  return 0;
}

/**
 * Code.gs 의 두 마커 줄 사이를 schema.js 원문으로 바꾼다. 마커가 없으면 경고만 하고 넘어간다.
 * 마커 줄 자체는 보존한다(다음 빌드가 다시 찾을 수 있게). 내용이 같으면 파일을 다시 쓰지 않는다.
 */
var SCHEMA_BEGIN = '/* __SCHEMA_BEGIN__';
var SCHEMA_END = '/* __SCHEMA_END__';
function spliceSchema(codeFile, schemaText) {
  if (!fs.existsSync(codeFile)) {
    console.warn('  [경고] ' + rel(codeFile) + ' 가 없어 편집 계약 블록을 채우지 않았습니다.');
    return null;
  }
  var code = read(codeFile);
  var b = code.indexOf(SCHEMA_BEGIN);
  var e = code.indexOf(SCHEMA_END);
  if (b < 0 || e < 0 || e < b) {
    console.warn('  [경고] ' + rel(codeFile) + ' 에 __SCHEMA_BEGIN__/__SCHEMA_END__ 마커가 없어 편집 계약 블록을 채우지 않았습니다.');
    return null;
  }
  var beginLineEnd = code.indexOf('\n', b);
  if (beginLineEnd < 0 || beginLineEnd > e) { throw new Error(rel(codeFile) + ': __SCHEMA_BEGIN__ 마커는 한 줄이어야 합니다.'); }
  var endLineStart = code.lastIndexOf('\n', e) + 1;   // __SCHEMA_END__ 마커 줄의 시작
  var body = '\n' + schemaText.replace(/\s+$/, '') + '\n';
  var next = code.slice(0, beginLineEnd) + body + code.slice(endLineStart);
  if (next === code) {
    return { file: codeFile, bytes: Buffer.byteLength(code, 'utf8'), note: '편집 계약 블록 변경 없음' };
  }
  var bytes = writeOut(codeFile, next);
  return { file: codeFile, bytes: bytes, note: '편집 계약 블록(src/schema.js) 갱신' };
}

/* ── 빌드 ─────────────────────────────────────────────────────── */

function build() {
  var tplFile = at('src', 'index.template.html');
  var cssFile = at('src', 'styles.css');
  var schemaFile = at('src', 'schema.js');
  var metricsFile = at('src', 'metrics.js');
  var appFile = at('src', 'app.js');
  var mockFile = at('mock', 'sample-data.json');

  [tplFile, cssFile, schemaFile, metricsFile, appFile].forEach(function (f) {
    if (!fs.existsSync(f)) {
      throw new Error('입력 파일이 없습니다: ' + rel(f));
    }
  });

  var tpl = read(tplFile);
  var css = safeStyle(read(cssFile));
  var schema = safeScript(read(schemaFile), 'schema.js');
  var metrics = safeScript(read(metricsFile), 'metrics.js');
  var app = safeScript(read(appFile), 'app.js');

  // 공통 부분 — 스타일·산식·화면
  var common = tpl;
  common = fill(common, TOKEN.STYLES, '<style>\n' + css + '\n</style>', '스타일');
  common = fill(common, TOKEN.SCHEMA, '<script>\n' + schema + '\n</script>', '편집 계약');
  common = fill(common, TOKEN.METRICS, '<script>\n' + metrics + '\n</script>', '산식');
  common = fill(common, TOKEN.APP, '<script>\n' + app + '\n</script>', '화면');

  console.log('빌드 시작 — ' + rel(ROOT));

  var results = [];
  var warned = 0;

  // (a) 시트 연결본 — 샘플 데이터 블록을 넣지 않는다
  var gasFile = at('apps-script', 'index.html');
  var gasHtml = fill(common, TOKEN.MOCK, '', '샘플 데이터');
  var gasBytes = writeOut(gasFile, gasHtml);
  warned += checkExternal(gasFile, gasHtml);
  results.push({ file: gasFile, bytes: gasBytes, note: '시트 연결본(샘플 데이터 없음)' });

  // (b) 미리보기본 — 샘플 데이터 인라인
  var previewFile = at('preview', 'dashboard-preview.html');
  if (!fs.existsSync(mockFile)) {
    console.warn('  [경고] ' + rel(mockFile) + ' 가 없어 미리보기 파일을 만들지 않았습니다.');
  } else {
    var rawJson = read(mockFile);
    try {
      JSON.parse(rawJson);
    } catch (e) {
      throw new Error(rel(mockFile) + ' 을(를) 읽을 수 없습니다(형식 오류): ' + e.message);
    }
    var block = '<script id="mock-data" type="application/json">\n' + safeJson(rawJson) + '\n</script>';
    var previewHtml = fill(common, TOKEN.MOCK, block, '샘플 데이터');
    var previewBytes = writeOut(previewFile, previewHtml);
    warned += checkExternal(previewFile, previewHtml);
    results.push({ file: previewFile, bytes: previewBytes, note: '미리보기본(샘플 데이터 포함)' });
  }

  // (c) Code.gs 마커 블록 — src/schema.js 원문으로 채운다(Apps Script 도 같은 검증 규칙을 쓰기 위해)
  var codeFile = at('apps-script', 'Code.gs');
  var schemaNote = spliceSchema(codeFile, read(schemaFile));
  if (schemaNote) { results.push(schemaNote); }

  console.log('');
  results.forEach(function (r) {
    console.log('  ' + rel(r.file) + '  ' + r.bytes.toLocaleString('ko-KR') + ' 바이트  — ' + r.note);
  });
  console.log('');
  console.log(warned === 0
    ? '빌드 완료 — 외부 주소 참조 0건.'
    : '빌드 완료 — 외부 주소 참조 ' + warned + '건(위 경고 확인).');
}

try {
  build();
} catch (e) {
  console.error('빌드 실패 — ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
}
