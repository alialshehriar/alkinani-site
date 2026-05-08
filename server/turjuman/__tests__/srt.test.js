import { test } from "node:test";
import assert from "node:assert/strict";
import { cuesToSrt, formatTimestamp, splitLongLine } from "../srt.js";

test("formatTimestamp rounds to milliseconds", () => {
  assert.equal(formatTimestamp(0), "00:00:00,000");
  assert.equal(formatTimestamp(61.234), "00:01:01,234");
  assert.equal(formatTimestamp(3661.5), "01:01:01,500");
});

test("cuesToSrt produces standard SRT", () => {
  const cues = [
    { start: 0, end: 1.5, text: "hello" },
    { start: 1.6, end: 3.2, text: "world" },
  ];
  const srt = cuesToSrt(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nhello\n\n2\n/);
});

test("splitLongLine breaks at 42 latin chars", () => {
  const s = "this is a fairly long subtitle line that exceeds forty-two characters by some amount";
  const lines = splitLongLine(s, 42);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.length <= 42, `line too long: ${l.length}`);
});

test("splitLongLine breaks at 22 arabic chars", () => {
  const s = "هذي جملة طويلة جداً يجب كسرها بطريقة صحيحة";
  const lines = splitLongLine(s, 22);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.length <= 22, `line too long: ${l.length}`);
});

test("cuesToSrt enforces max 2 lines per cue", () => {
  const veryLong = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
  const srt = cuesToSrt([{ start: 0, end: 5, text: veryLong }]);
  // SRT block: index, timestamp, line1, line2..., blank
  const blockLines = srt.split("\n");
  // index=0, timestamp=1, content=2..n, blank at end
  const contentEnd = blockLines.findIndex((l, i) => i >= 2 && l === "");
  const contentLines = blockLines.slice(2, contentEnd);
  assert.ok(contentLines.length <= 2, `cue exceeds 2 lines: ${contentLines.length}`);
});
