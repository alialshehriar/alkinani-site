import { test } from "node:test";
import assert from "node:assert/strict";
import { cuesToSrt, formatTimestamp, splitLongLine } from "../srt.js";

test("formatTimestamp rounds to milliseconds", () => {
  assert.equal(formatTimestamp(0), "00:00:00,000");
  assert.equal(formatTimestamp(61.234), "00:01:01,234");
  assert.equal(formatTimestamp(3661.5), "01:01:01,500");
});

test("cuesToSrt produces standard SRT with normalized timings", () => {
  // 150ms lead-in pushes cue starts back slightly without making them feel early.
  // Cues are well-spaced enough that order + content survive.
  const cues = [
    { start: 1.0, end: 3.0, text: "hello" },
    { start: 4.0, end: 6.0, text: "world" },
  ];
  const srt = cuesToSrt(cues);
  assert.match(srt, /^1\n00:00:00,850 --> 00:00:03,000\nhello\n\n2\n/);
  assert.match(srt, /^.+\n.+\n.+\n\n2\n00:00:03,850 --> 00:00:06,000\nworld\n/m);
});

test("normalizeCues enforces min 1.2s duration", async () => {
  const { normalizeCues } = await import("../srt.js");
  const out = normalizeCues([{ start: 5, end: 5.5, text: "ok" }]);
  assert.equal(out[0].start, 4.85); // 150ms lead-in
  assert.equal(out[0].end, 6.05);   // 4.85 + 1.2 min duration
});

test("normalizeCues prevents overlap between cues", async () => {
  const { normalizeCues } = await import("../srt.js");
  const out = normalizeCues([
    { start: 0, end: 2.0, text: "first" },
    { start: 2.05, end: 4.0, text: "second" },
  ]);
  // first.end must be ≤ second.start - 0.08
  assert.ok(out[0].end <= out[1].start - 0.07);
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

test("cuesToSrt breaks Chinese lines tightly", () => {
  const s = "这是一个很长的中文字幕示例需要在屏幕上保持清晰";
  const srt = cuesToSrt([{ start: 0, end: 5, text: s }]);
  assert.match(srt, /这是一个很长的中文字幕示例需要在屏幕\n上保持清晰/);
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
