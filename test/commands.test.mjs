import assert from "node:assert/strict";
import {
  allShortcuts,
  formatShortcut,
  fuzzyMatch,
  fuzzyRank,
  IS_MAC,
  matchesShortcut,
  parseShortcut,
  SHORTCUT_GROUPS,
} from "../src/app/commands.js";

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

test("fuzzy match finds subsequences", () => {
  assert.ok(fuzzyMatch("prd", "Product roadmap"));
  assert.ok(fuzzyMatch("gth", "Growth experiments"));
  assert.equal(fuzzyMatch("zzz", "Product roadmap"), null);
});

test("fuzzy match prefers consecutive and prefix hits", () => {
  const prefix = fuzzyMatch("pro", "Product roadmap");
  const scattered = fuzzyMatch("pro", "Pile of random orders");
  assert.ok(prefix.score > scattered.score, `${prefix.score} !> ${scattered.score}`);
});

test("fuzzy match is diacritic insensitive", () => {
  assert.ok(fuzzyMatch("roadmap", "Roadmäp"));
  assert.ok(fuzzyMatch("cafe", "Café notes"));
});

test("empty query matches everything", () => {
  const ranked = fuzzyRank("", [{ label: "a" }, { label: "b" }]);
  assert.equal(ranked.length, 2);
});

test("fuzzyRank orders by score and honours keywords", () => {
  const candidates = [
    { label: "Toggle dark mode", keywords: ["theme", "appearance"] },
    { label: "Dark sidebar theme", weight: 2 },
  ];
  const ranked = fuzzyRank("dark", candidates);
  assert.ok(ranked.length >= 1);
  assert.ok(ranked[0].score > 0);
});

test("fuzzyRank respects the limit", () => {
  const candidates = Array.from({ length: 40 }, (unused, i) => ({ label: `item ${i}` }));
  assert.equal(fuzzyRank("item", candidates, 10).length, 10);
});

test("shortcut parsing understands modifiers", () => {
  const parsed = parseShortcut("Mod+Shift+P");
  assert.equal(parsed.mod, true);
  assert.equal(parsed.shift, true);
  assert.equal(parsed.key, "P");
});

test("shortcut formatting always renders something", () => {
  const text = formatShortcut("Mod+Shift+P");
  assert.ok(text.includes("P"));
  assert.ok(text.length >= 2);
  assert.ok(formatShortcut("?").includes("?"));
});

test("shortcut matching respects the modifier contract", () => {
  const event = (init) => ({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  });
  const modEvent = IS_MAC ? event({ metaKey: true }) : event({ ctrlKey: true });

  assert.equal(matchesShortcut(modEvent, "Mod+K"), true, "mod+k should match");
  assert.equal(matchesShortcut(event({ ctrlKey: true, shiftKey: true }), "Mod+K"), false);
  assert.equal(matchesShortcut(event({ ctrlKey: true, key: "?" }), "Mod+/"), true);
  assert.equal(matchesShortcut(event({ ctrlKey: true, metaKey: true }), "Mod+K"), false);
});

test("fuzzyRank returns the wrapped payload, not the candidate", () => {
  const page = { id: "p1", title: "Sibling page", icon: "📘" };
  const ranked = fuzzyRank("sibl", [{ id: "p1", label: "Sibling page", item: page }]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.title, "Sibling page", "hit.item must be the payload");
  assert.deepEqual(ranked[0].positions, [0, 1, 2, 3]);
});

test("fuzzyRank keeps plain candidates intact", () => {
  const ranked = fuzzyRank("dark", [{ id: "cmd", label: "Toggle dark mode" }]);
  assert.equal(ranked[0].item.id, "cmd");
});

test("shortcut sheet is complete and unique per group", () => {
  assert.ok(SHORTCUT_GROUPS.length >= 5);
  for (const group of SHORTCUT_GROUPS) {
    assert.ok(group.items.length > 0, `${group.id} is empty`);
    for (const item of group.items) {
      assert.ok(item.label && item.keys, `missing label/keys in ${group.id}`);
    }
  }
});

test("allShortcuts flattens the sheet", () => {
  const all = allShortcuts();
  const expected = SHORTCUT_GROUPS.reduce((total, group) => total + group.items.length, 0);
  assert.equal(all.length, expected);
  assert.ok(all[0].group);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;