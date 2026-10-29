import test from "node:test";
import assert from "node:assert/strict";
import { creatorPack } from "../server/creator.mjs";
test("creator description fits YouTube limit, credits deduplicate, landscape excludes Shorts hashtag", () => {
  let p = {
    format: "landscape",
    seo: {
      description: "story ".repeat(1500),
      hashtags: ["#Comedy", "#Shorts"],
      titles: ["A relevant title"],
      tags: ["comedy"],
    },
    scenes: Array.from({ length: 80 }, () => ({
      duration: 15,
      summary: "An important story event ".repeat(8),
    })),
  };
  let credit = {
    id: 1,
    name: "Sound",
    author: "Artist",
    page: "https://freesound.org/",
  };
  let out = creatorPack(p, [credit, credit]);
  assert.ok(out.description.length <= 5000);
  assert.equal(out.credits.length, 1);
  assert.ok(!out.hashtags.includes("#Shorts"));
  assert.equal(out.chapters.length, 80);
});
