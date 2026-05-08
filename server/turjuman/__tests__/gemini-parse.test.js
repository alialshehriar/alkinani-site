import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCues } from "../gemini.js";

test("parseCues accepts valid JSON array", () => {
  const cues = parseCues('[{"start":0.0,"end":1.5,"text":"hi"},{"start":1.6,"end":3.0,"text":"there"}]');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "hi");
});

test("parseCues strips markdown fence", () => {
  const cues = parseCues('```json\n[{"start":0,"end":1,"text":"x"}]\n```');
  assert.equal(cues[0].text, "x");
});

test("parseCues rejects malformed entries", () => {
  const cues = parseCues('[{"start":0,"end":1,"text":"ok"},{"text":"missing times"}]');
  assert.equal(cues.length, 1);
});

test("parseCues throws on no array", () => {
  assert.throws(() => parseCues('{"not":"array"}'), /gemini_not_array/);
});

test("parseCues throws when all entries invalid", () => {
  assert.throws(() => parseCues('[{"text":"only"}]'), /gemini_no_cues/);
});
