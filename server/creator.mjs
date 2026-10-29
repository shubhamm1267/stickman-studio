export function creatorPack(plan, inputCredits) {
  const credits = [
      ...new Map(inputCredits.map((c) => [c.id || c.page, c])).values(),
    ],
    chapters = [];
  let at = 0;
  for (const scene of plan.scenes) {
    chapters.push(
      `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(Math.floor(at % 60)).padStart(2, "0")} ${scene.summary.slice(0, 70)}`,
    );
    at += scene.duration;
  }
  const step = Math.max(1, Math.ceil(chapters.length / 15)),
    markers = chapters.filter((_, i) => i % step === 0),
    hashtags = plan.seo.hashtags.filter(
      (s) => plan.format === "shorts" || s.toLowerCase() !== "#shorts",
    );
  let tail =
    "\n\n" +
    hashtags.join(" ") +
    "\n\n" +
    markers.join("\n") +
    "\n\nAudio sources and licenses:\n" +
    credits
      .slice(0, 12)
      .map((c) => `${c.name} — ${c.author}: ${c.page} (${c.license||"see source"})`)
      .join("\n");
  if (credits.length > 12)
    tail += "\nAdditional audio sources are listed in the project sound credits.";
  tail = tail.slice(0, 4200);
  const description = plan.seo.description.slice(0, 5000 - tail.length) + tail;
  return {
    ...plan.seo,
    description,
    hashtags,
    chapters,
    credits,
    uploadChecklist: [
      "Review full video and thumbnail",
      "Choose audience setting accurately",
      "Review title and description against actual story",
      "Check sound credits and chapter eligibility",
    ],
  };
}
