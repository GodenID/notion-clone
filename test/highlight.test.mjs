import assert from "node:assert/strict";
import { CODE_LANGUAGES, highlightCode, highlightLine, normalizeLanguage } from "../src/app/highlight.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name} — ${error.message}`);
  }
}

test("language aliases normalize", () => {
  assert.equal(normalizeLanguage("JS"), "javascript");
  assert.equal(normalizeLanguage("py"), "python");
  assert.equal(normalizeLanguage("shell"), "bash");
  assert.equal(normalizeLanguage(""), "plain");
  assert.equal(normalizeLanguage("Brainfuck"), "brainfuck");
});

test("keywords get the keyword class", () => {
  const html = highlightLine("const answer = 42;", "javascript");
  assert.match(html, /<span class="tok-keyword">const<\/span>/);
  assert.match(html, /<span class="tok-number">42<\/span>/);
});

test("strings and comments are recognized", () => {
  const html = highlightLine('// note\nconst s = "hi";', "javascript");
  assert.match(html, /tok-comment/);
  assert.match(html, /<span class="tok-string">&quot;hi&quot;<\/span>/);
});

test("html tags and attributes are highlighted", () => {
  const html = highlightLine('<a href="x">y</a>', "html");
  assert.match(html, /tok-tag/);
  assert.match(html, /tok-attr/);
});

test("json keys, strings, numbers", () => {
  const html = highlightLine('{"a": "b", "n": 12, "ok": true}', "json");
  assert.match(html, /tok-attr/);
  assert.match(html, /tok-string/);
  assert.match(html, /tok-number/);
  assert.match(html, /tok-keyword/);
});

test("css selectors and declarations", () => {
  const html = highlightLine(".a { color: red; }", "css");
  assert.match(html, /tok-tag/);
  assert.match(html, /tok-attr/);
});

test("bash keywords and strings", () => {
  const html = highlightLine('echo "hi" # done', "bash");
  assert.match(html, /tok-keyword/);
  assert.match(html, /tok-comment/);
});

test("output is escaped", () => {
  const html = highlightLine("<script>alert('x')</script>", "plain");
  assert.ok(!html.includes("<script>"), "raw tag leaked into output");
  assert.match(html, /&lt;/);
  assert.match(html, /&gt;/);
});

test("multiline code keeps line structure", () => {
  const html = highlightCode("a = 1\nb = 2", "python");
  assert.equal(html.split("\n").length, 2);
});

test("empty and odd input never throws", () => {
  assert.doesNotThrow(() => highlightCode("", "javascript"));
  assert.doesNotThrow(() => highlightCode("}{)(", "unknown-language"));
  assert.doesNotThrow(() => highlightLine(null, null));
});

test("language catalog is available", () => {
  assert.ok(CODE_LANGUAGES.includes("javascript"));
  assert.ok(CODE_LANGUAGES.includes("rust"));
  assert.ok(CODE_LANGUAGES.length >= 12);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;