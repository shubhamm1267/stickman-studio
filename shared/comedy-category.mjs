export const COMEDY_CATEGORIES = Object.freeze([
  "family-comedy",
  "slapstick",
  "romantic-comedy",
  "adult-comedy",
]);

export const DEFAULT_COMEDY_SETTINGS = Object.freeze({
  innuendo: "off",
  profanity: "off",
  physicalIntensity: "medium",
});

export function normalizeComedySettings(category, settings = {}) {
  const normalized = {
    innuendo: settings.innuendo ?? "off",
    profanity: settings.profanity ?? "off",
    physicalIntensity: settings.physicalIntensity ?? "medium",
  };
  // A family request cannot inherit adult settings from a previous plan or UI state.
  if (category === "family-comedy") {
    normalized.innuendo = "off";
    normalized.profanity = "off";
  }
  return normalized;
}

export function humorProfileForCategory(category) {
  if (category === "adult-comedy") return "naughty";
  if (category === "romantic-comedy") return "adult-relatable";
  return "clean";
}

export function comedySettingsForCategory(category, settings = {}) {
  return normalizeComedySettings(category, settings);
}

const MINOR_CONTEXT =
  /\b(?:minor|underage|under\s*18|child(?:ren)?|kids?|teen(?:ager)?|school(?:age)?|schoolgirl|schoolboy|kindergarten|high school|middle school)\b|(?:\b(?:bachcha|bachchi|baccha|bacchi|nabalig|school[- ]age)\b|बच्चा|बच्ची|नाबालिग|किशोर|किशोरी|स्कूल)/i;
const NONCONSENSUAL =
  /\b(?:rape|sexual assault|sexual violence|non[- ]consensual|without consent|coerc(?:e|ion)|sexual harassment|stalking|blackmail|drugged|forced (?:sex|kiss|sexual)|force(?:s|d)? (?:someone|him|her|them) (?:to|into) (?:kiss|sex|touch))\b|जबरदस्ती|बिना सहमति|बलात्कार|यौन हिंसा|यौन उत्पीड़न/i;
const GRAPHIC_SEXUAL =
  /\b(?:porn(?:ography|ographic)?|explicit sexual|sex act|sexual act|nudity|nude|genitals?|penis|vagina|penetrat(?:e|ion)|masturbat(?:e|ion)|orgasm|ejaculat(?:e|ion)|oral sex|anal sex|intercourse)\b|अश्लील|जननांग|योनि|लिंग|संभोग/i;

export function assertAdultComedyText(text, label = "story") {
  const value = String(text ?? "");
  if (MINOR_CONTEXT.test(value)) {
    throw Error(
      `Adult Comedy cannot include school-age, minor, or age-ambiguous context in ${label}. Rewrite it around clearly adult characters and settings.`,
    );
  }
  if (NONCONSENSUAL.test(value)) {
    throw Error(
      `Adult Comedy must stay consensual; coercion, exploitation, harassment, or sexual violence is unsupported in ${label}.`,
    );
  }
  if (GRAPHIC_SEXUAL.test(value)) {
    throw Error(
      `Adult Comedy is non-graphic only; explicit sexual acts or anatomy are unsupported in ${label}.`,
    );
  }
}

function assertConsensualRomanceText(text, label = "story") {
  const value = String(text ?? "");
  if (MINOR_CONTEXT.test(value)) {
    throw Error(
      `Romantic Comedy cannot include school-age, minor, or age-ambiguous context in ${label}.`,
    );
  }
  if (NONCONSENSUAL.test(value)) {
    throw Error(
      `Romantic Comedy interactions must be consensual; coercion, exploitation, harassment, or sexual violence is unsupported in ${label}.`,
    );
  }
}

export function assertAdultComedyRequest(options) {
  if (options.category === "romantic-comedy") {
    assertConsensualRomanceText(options.story, "the submitted story");
    return;
  }
  if (options.category !== "adult-comedy") return;
  if (options.adultOptIn !== true) {
    throw Error(
      "Select the explicit 18+ Adult Comedy opt-in before planning. This acknowledgement is not age verification.",
    );
  }
  assertAdultComedyText(options.story, "the submitted story");
}

export function assertAdultCategoryCast(characters, category) {
  const invalid = characters.filter(
    (character) =>
      !["man", "woman", "grandma"].includes(character.kind) ||
      !Number.isInteger(character.ageYears) ||
      character.ageYears < 18,
  );
  if (invalid.length) {
    throw Error(
      `${category === "adult-comedy" ? "18+ Adult Comedy" : "Romantic Comedy"} requires every cast character to be explicitly adult-presenting and ageYears 18 or older: ${invalid.map((c) => c.id).join(", ")}.`,
    );
  }
}

export function assertComedyCategoryPlan(plan) {
  if (plan.category === "adult-comedy") {
    if (plan.adultModeAcknowledged !== true) {
      throw Error(
        "18+ Adult Comedy requires the saved adultModeAcknowledged opt-in. This acknowledgement is not age verification.",
      );
    }
    assertAdultCategoryCast(plan.characters, "adult-comedy");
    assertAdultComedyText(plan.sourceIdea, "the original story");
    assertAdultComedyText(plan.story, "the generated story");
    for (const [index, scene] of (plan.scenes ?? []).entries()) {
      assertAdultComedyText(scene.summary, `scene ${scene.id} summary`);
      for (const [lineIndex, line] of (scene.dialogue ?? []).entries()) {
        assertAdultComedyText(
          line.text,
          `scene ${scene.id} dialogue ${lineIndex + 1}`,
        );
      }
    }
    for (const [key, value] of Object.entries(plan.comedy ?? {})) {
      assertAdultComedyText(value, `comedy ${key}`);
    }
  } else if (plan.category === "romantic-comedy") {
    assertAdultCategoryCast(plan.characters, "romantic-comedy");
    assertConsensualRomanceText(plan.sourceIdea, "the original story");
    assertConsensualRomanceText(plan.story, "the generated story");
    for (const scene of plan.scenes ?? []) {
      assertConsensualRomanceText(scene.summary, `scene ${scene.id} summary`);
      for (const [lineIndex, line] of (scene.dialogue ?? []).entries()) {
        assertConsensualRomanceText(
          line.text,
          `scene ${scene.id} dialogue ${lineIndex + 1}`,
        );
      }
    }
  }
}

export function comedyCategoryInstructions(options = {}) {
  if(options.category==='auto')return 'Choose the comedy tone from the actual story: family-comedy, slapstick, romantic-comedy or non-graphic adult-comedy. Do not add adult content to a neutral story. Respect requested identities and actions; choose timing and intensity from the events. Romance/adult jokes require clearly consenting adults with explicit ageYears >=18. No explicit sexual acts/anatomy or coercion. Set category to the selected real category, never auto.';
  const category = options.category ?? "family-comedy";
  const settings = normalizeComedySettings(category, options.comedySettings);
  const shared = `Selected comedy category: ${category}. Physical-comedy intensity: ${settings.physicalIntensity}.`;
  if (category === "family-comedy") {
    return `${shared} Family-safe tone: innuendo off, profanity off; do not inherit adult-mode material.`;
  }
  if (category === "slapstick") {
    return `${shared} Prefer readable, non-graphic physical gags and clear cause/effect.`;
  }
  if (category === "romantic-comedy") {
    return `${shared} Romance must be consensual. Give every human character explicit integer ageYears >= 18; no school-age or age-ambiguous context. Keep any suggestiveness non-graphic.`;
  }
  return `${shared} Explicitly opted-in 18+ Adult Comedy — NON-GRAPHIC ONLY. Use consensual adult relationship jokes, cheeky banter, double meanings, awkward dates, mild blushes and comic pauses. Every cast character must be an adult-presenting human (man, woman, or grandma) with explicit integer ageYears >= 18. Never include minor/school context, explicit sexual acts or anatomy, coercion, exploitation, harassment, or sexual violence. Follow the validated settings exactly: innuendo=${settings.innuendo}; profanity=${settings.profanity}.`;
}