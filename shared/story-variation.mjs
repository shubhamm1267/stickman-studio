import {createHash} from 'node:crypto';

// A fresh generation has a stable, request-scoped creative brief. It is not a
// canned story: Gemini still invents the characters, events, props and payoff.
const settings = [
  'a small bakery counter', 'a rainy bus shelter', 'a quiet public library',
  'a rooftop garden', 'a lively barber shop', 'a self-service laundromat',
  'an art classroom', 'an apartment elevator', 'a shoe repair stall',
  'a neighborhood toy shop', 'a bicycle workshop', 'a food truck',
  'an apartment balcony', 'an office printer room', 'a grocery checkout',
  'a tiny indoor gym', 'a park drinking fountain', 'a waiting room',
  'a rehearsal room', 'a street flower stall',
];
const mechanics = [
  'an attempted shortcut causes a surprising physical reversal',
  'one innocent misunderstanding escalates through visible actions',
  'a prop behaves unexpectedly and the character tries to regain control',
  'an overconfident demonstration goes wrong in three clear beats',
  'a tiny inconvenience grows through increasingly absurd solutions',
  'a mistaken handoff has a surprising but harmless payoff',
  'a character tries to hide a small blunder and makes it more obvious',
  'a chain reaction converts a routine task into an unexpected success',
  'two characters misread each other without dialogue',
  'an accidental role reversal lands with a readable face reaction',
  'a character solves the wrong problem with increasingly precise effort',
  'a harmless interruption ruins a moment of proud celebration',
];
const contrasts = [
  'precise versus clumsy', 'patient versus impatient',
  'confident versus surprised', 'tiny versus oversized',
  'careful versus impulsive', 'ordinary versus dramatic',
  'quiet versus chaotic', 'helpful versus accidentally troublesome',
];

export function originalStoryBrief(options = {}) {
  if (options.story?.trim()) return '';
  const generationId = String(options.generationId || 'default-run');
  const hash = createHash('sha256').update(generationId).digest();
  const setting = settings[hash.readUInt16BE(0) % settings.length];
  const mechanic = mechanics[hash.readUInt16BE(2) % mechanics.length];
  const contrast = contrasts[hash.readUInt16BE(4) % contrasts.length];
  return `FRESH ORIGINAL COMEDY BRIEF (generation ${generationId}): Create a new, self-contained visual gag. Creative starting point: ${setting}; comedic structure: ${mechanic}; character contrast: ${contrast}. Invent the actual story, usable objects and payoff yourself. This is an inspiration, not a requirement to add complicated props or extra locations. Avoid repeating demo plots or default props such as banana-peel slips, milk containers, jars and coffee mugs. Prefer one simple, strongly readable main prop, one or two cast members and feasible native actions for short videos. Maintain physical cause and effect, expressive reactions and the selected style. Never display the generation ID or this brief in the film.`;
}