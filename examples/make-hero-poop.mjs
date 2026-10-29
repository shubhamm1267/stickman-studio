// Compatibility entry point; the superhero sample is now SFX-only.
import './make-v7.mjs';
import fs from 'node:fs';
fs.copyFileSync(new URL('hero-silent.json',import.meta.url),new URL('hero-poop.json',import.meta.url));
