# Point 14 — procedural, licensed, and optional image-provider resolution

`server/asset-providers.mjs` defines `supports`, `generate`, `validate`, `provenance`, and `estimatedCost`. Provider adapters are explicit; `discoverAssetProviders` checks compatibility and `generateWithAssetProvider` validates real output before returning it. The included deterministic procedural vector provider costs USD 0 locally. No image-generation adapter is registered. Gemini remains a storyboard/text integration; its credential does not authorize image generation. Image-provider testing is OFFLINE and this point makes no paid API requests.

Eight actual geometry examples cover a metallic domed UFO with beam, nonhuman alien, branded soda can, beer bottle, spacecraft, multi-headed figure, caped hero, and four-legged animal. Each includes structured semantics, shape language, outline, colors, proportions, material, distinguishing features, optional text/logo, view/facing, pivots, occlusion layers, and motion affordances. Each procedural result contains validated multi-node geometry plus bounds, vector alpha, rendered contact shadow, contact point, attachment anchors, animation/occlusion layers, side/back policy, provenance, cost, and fallback behavior. The asset factory adds equivalent structured briefs and construction metadata to canonical requests; licensed imports continue to use Point 13 rights/digest/alpha/geometry checks.

Limits: renderer-native 2D geometry only (no general 3D or photorealism); printed text/logo is metadata unless a renderer draws a specific mark; unseen side/back details are not invented; unsupported output fails closed instead of becoming a label or random oval.

```bash
npm run test:point14
npm run smoke:point14-assets
npm run test:point13
npm run test:point12
npm test
npm run build
npm run smoke:render
```
