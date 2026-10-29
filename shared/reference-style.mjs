export const REFERENCE_STYLES = Object.freeze({
  'silent-slapstick': {artStyle:'pencil', label:'Silent slapstick', guide:'Selective colour, expressive close-ups, readable anticipation and contact. Use a simple muted stage and clear physical cause and effect.'},
  'coloured-cartoon': {artStyle:'toon', label:'Coloured cartoon', guide:'Coloured original cartoon characters and environments, clear silhouettes, expressive brows, eyes and mouth poses. Tell the entire gag visually.'},
  'elastic-meme': {artStyle:'classic', label:'Elastic meme cartoon', guide:'Original ink-outline cartoon with a muted grey-green background, mostly monochrome characters, oversized eyes and readable exaggerated faces. Use sparse sets, reaction close-ups, anticipation, short snappy actions, recovery holds, speed accents and restrained head squash/stretch. For a new story budget setup, escalation and visual payoff. Keep limbs attached and support contacts grounded. Animals and invented characters need their own recognizable anatomy and articulated parts. Preserve any specific colours requested in the story. Do not copy reference footage, watermarks, captions or exact character drawings.'},
});

export function studioStyleOptions(options) {
  const referenceStyle=options.referenceStyle || (options.productionMode==='dialogue-toon'||options.artStyle==='toon'?'coloured-cartoon':'silent-slapstick');
  const style=REFERENCE_STYLES[referenceStyle];
  if(!style)throw Error('Unknown reference style');
  return {...options,referenceStyle,artStyle:style.artStyle,productionMode:'silent-sfx',voice:false,directionMode:'dynamic'};
}

export function referenceStyleInstructions(style) {
  const profile=REFERENCE_STYLES[style];
  return profile?`REFERENCE STYLE: ${profile.label}. ${profile.guide} No spoken dialogue or TTS. Freesound provides CC0 effects and optional brief nonverbal reactions only.`:'';
}
