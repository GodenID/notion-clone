import assert from "node:assert/strict";
import {
  cellValue,
  displayValue,
  evaluateFormula,
  makeDefaultProperty,
  makeRow,
  PROPERTY_TYPES,
  sortRows,
  STATUS_GROUPS,
} from "../src/app/database.js";

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

const resolve = (values) => (name) => {
  const key = String(name).toLowerCase();
  return values[key] ?? "";
};

test("formula arithmetic respects precedence", () => {
  assert.equal(evaluateFormula("2 + 3 * 4", null, resolve({})), 14);
  assert.equal(evaluateFormula("(2 + 3) * 4", null, resolve({})), 20);
  assert.equal(evaluateFormula("-5 + 2", null, resolve({})), -3);
});

test("formula prop() resolves by property name", () => {
  const values = { price: 120, qty: 3 };
  assert.equal(evaluateFormula('prop("price") * prop("qty")', null, resolve(values)), 360);
});

test("formula functions cover the common set", () => {
  assert.equal(evaluateFormula('lower("ABC")', null, resolve({})), "abc");
  assert.equal(evaluateFormula('concat("a", "b")', null, resolve({})), "ab");
  assert.equal(evaluateFormula("round(3.14159, 2)", null, resolve({})), 3.14);
  assert.equal(evaluateFormula("min(4, 2, 9)", null, resolve({})), 2);
  assert.equal(evaluateFormula('if(prop("done") == "Yes", "shipped", "pending")', null, resolve({ done: "Yes" })), "shipped");
  assert.equal(evaluateFormula("empty(\"\")", null, resolve({})), 1);
});

test("formula survives garbage input", () => {
  assert.doesNotThrow(() => evaluateFormula("prop(", null, resolve({})));
  assert.doesNotThrow(() => evaluateFormula("1 +", null, resolve({})));
  const garbage = evaluateFormula("nonsense(((", null, resolve({}));
  assert.ok(garbage === 0 || garbage === "" || garbage === null, `got ${JSON.stringify(garbage)}`);
});

test("property catalog exposes the modern types", () => {
  for (const key of [
    "status",
    "formula",
    "rollup",
    "relation",
    "people",
    "files",
    "url",
    "uniqueId",
    "createdTime",
    "updatedTime",
    "multiselect",
  ]) {
    assert.ok(PROPERTY_TYPES[key], `missing ${key}`);
  }
});

test("rows get a short id and timestamps", () => {
  const properties = [makeDefaultProperty("title", { name: "Name" })];
  const row = makeRow(properties);
  assert.match(row.shortId, /^nc-/);
  assert.ok(row.createdAt > 0);
  assert.ok(row.updatedAt > 0);
  assert.equal(row.cells[properties[0].id], "");
});

test("display value formats computed cells", () => {
  const block = {
    properties: [
      { id: "t", name: "Name", type: "title" },
      { id: "n", name: "Score", type: "number" },
      { id: "f", name: "Double", type: "formula", formula: 'prop("Score") * 2' },
    ],
  };
  const row = makeRow(block.properties, { cells: { t: "Row", n: 21 } });
  const formula = block.properties.find((item) => item.id === "f");
  assert.equal(cellValue(block, row, formula, {}), 42);
  assert.equal(displayValue(block, row, formula, {}), "42");
});

test("checkbox and unique id render", () => {
  const block = {
    properties: [
      { id: "c", name: "Done", type: "checkbox" },
      { id: "u", name: "ID", type: "uniqueId" },
    ],
  };
  const row = makeRow(block.properties);
  assert.equal(displayValue(block, row, block.properties[0], {}), "");
  row.cells.c = true;
  assert.equal(displayValue(block, row, block.properties[0], {}), "✓");
  assert.equal(displayValue(block, row, block.properties[1], {}), row.shortId);
});

test("status groups carry colors", () => {
  assert.ok(STATUS_GROUPS.length >= 4);
  assert.ok(STATUS_GROUPS.every((group) => /^#[0-9a-f]{6}$/i.test(group.color)));
});

test("sorting places empty cells last", () => {
  const properties = [{ id: "t", name: "Name", type: "title" }];
  const block = { properties };
  const rows = [
    makeRow(properties, { cells: { t: "b" } }),
    makeRow(properties, { cells: { t: "" } }),
    makeRow(properties, { cells: { t: "a" } }),
  ];
  const sorted = sortRows(rows, properties[0], "asc").map((row) => row.cells.t);
  assert.deepEqual(sorted, ["a", "b", ""]);
});

test("numeric sorting is natural, not lexicographic", () => {
  const properties = [{ id: "n", name: "N", type: "number" }];
  const rows = [
    makeRow(properties, { cells: { n: 10 } }),
    makeRow(properties, { cells: { n: 9 } }),
  ];
  const sorted = sortRows(rows, properties[0], "asc").map((row) => row.cells.n);
  assert.deepEqual(sorted, [9, 10]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;