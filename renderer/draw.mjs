import {samplePart} from "../shared/part-motion.mjs";
import {propConstruction} from '../shared/prop-construction.mjs';
import{neckOf,armRoot,wristDirection,SEGMENT_BONES,segmentAnchor}from"../shared/rig.mjs";
import { clamp, lerp, ease, ik, add } from "../shared/math.mjs";
import { validateSvgPathData } from "../shared/svg-path.mjs";
import { createGeometryComponent } from "../shared/geometry-library.mjs";
const I = "#293329",
  SKIN = "#f6f1da";
const n = (v) => Math.round(v * 100) / 100,
  xy = (p) => p.map(n).join(" ");
export const path = (d, f = "none", w = 2, c = I) =>
  `<path d="${d}" fill="${f}" stroke="${w ? c : "none"}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const ellipse = (p, r, f = SKIN, w = 2, c = I) =>
  `<ellipse cx="${n(p[0])}" cy="${n(p[1])}" rx="${n(r[0])}" ry="${n(r[1])}" fill="${f}" stroke="${w ? c : "none"}" stroke-width="${w}"/>`;
export const group = (p, a, sc, d) =>
  `<g transform="translate(${xy(p)}) rotate(${n(a)}) scale(${n(sc)})">${d}</g>`;
export const line = (a, b, w = 3, c = I) =>
  path(`M${xy(a)} L${xy(b)}`, "none", w, c);
const gradientId = (prefix, key) =>
  `visual-${String(prefix || "spec").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 72)}-${String(key).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
const gradientMarkup = (value, id) =>
  `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(value.start[0])}" y1="${n(value.start[1])}" x2="${n(value.end[0])}" y2="${n(value.end[1])}">${value.stops.map((stop) => `<stop offset="${n(stop.offset * 100)}%" stop-color="${stop.color}" stop-opacity="${n(stop.opacity)}"/>`).join("")}</linearGradient></defs>`;
const styledShape = (tag, shape, fill, width, stroke) =>
  `<${tag} ${shape} fill="${fill}" stroke="${width ? stroke : "none"}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pt = (value) => `${n(value[0])} ${n(value[1])}`;

export function nodes(spec, t = 0, style = {}, options = {}) {
  return spec
    .map((v, index) => {
      if (v.kind === "group") {
        const sampled = samplePart(v,t,options.sceneId);
        const anchor=v.bone&&options.pose?componentAnchor({attachment:v.bone},options.pose):{position:[0,0],rotation:0};
        const position = sampled.position.map((x,i)=>x+anchor.position[i]);
        const pivot = v.pivot || [0, 0];
        const scale = sampled.scale.map((v,i)=>v*(anchor.scale?.[i]??1));
        const transform = `translate(${xy(position)}) translate(${xy(pivot)}) rotate(${n(sampled.rotation + anchor.rotation)}) scale(${xy(scale)}) translate(${xy(pivot.map((x) => -x))})`;
        return `<g data-scene-group="true" transform="${transform}" opacity="${n(sampled.opacity)}">${nodes(v.children, t, style, { ...options, key: `${options.key || "root"}-${index}` })}</g>`;
      }
      const paletteFill = v.paletteIndex === undefined ? undefined : style.palette?.[v.paletteIndex];
      const width = v.width ?? style.outlineThickness ?? 1.5;
      const stroke = v.stroke ?? style.stroke ?? I;
      const shapeFill = v.fill ?? paletteFill ?? style.fill ?? "none";
      const fill = v.gradient ? `url(#${gradientId(options.idPrefix, `${options.key || "root"}-${index}`)})` : shapeFill;
      let draw;
      switch (v.kind) {
        case "path":
          if (!validateSvgPathData(v.d).valid) throw new TypeError("Refusing to render invalid SVG path data.");
          draw = path(v.d, fill, width, stroke);
          break;
        case "ellipse":
          draw = ellipse(v.center, v.radius, fill, width, stroke);
          break;
        case "roundedRect": {
          const [x, y, w, h] = v.rect;
          draw = styledShape("rect", `x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(v.cornerRadius ?? 0)}"`, fill, width, stroke);
          break;
        }
        case "rasterImage": {
          const [x, y, w, h] = v.rect;
          draw = `<image data-user-raster="verified-alpha" href="${v.dataUri}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"/>`;
          break;
        }
        case "polygon":
          draw = styledShape("polygon", `points="${v.points.map(pt).join(" ")}"`, fill, width, stroke);
          break;
        case "curve": {
          const d = v.curveType === "cubic"
            ? `M${pt(v.from)} C${pt(v.control1)} ${pt(v.control2)} ${pt(v.to)}`
            : `M${pt(v.from)} Q${pt(v.control1)} ${pt(v.to)}`;
          draw = path(d, "none", width, stroke);
          break;
        }
        case "line":
          draw = line(v.from, v.to, width, stroke);
          break;
        default:
          throw new TypeError(`Unsupported visual node kind: ${v.kind}`);
      }
      if (v.gradient)
        draw = gradientMarkup(v.gradient, gradientId(options.idPrefix, `${options.key || "root"}-${index}`)) + draw;
      return v.motion === "flutter"
        ? `<g transform="scale(1 ${0.65 + 0.3 * Math.sin(t * 85)})">${draw}</g>`
        : draw;
    })
    .join("");
}
function visualTransform(position, rotation, scale) {
  return `translate(${xy(position)}) rotate(${n(rotation)}) scale(${xy(scale)})`;
}
function xmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function visualSourceMetadata(source) {
  if (!source) return "";
  const attributes = {
    "data-visual-source-kind": source.kind,
    "data-rights-status": source.rightsStatus,
    "data-visual-source-ref": source.sourceRef,
    "data-visual-asset-id": source.assetId,
    "data-visual-asset-sha256": source.sha256,
    "data-visual-media-type": source.mediaType,
    "data-visual-generator": source.generator,
    "data-visual-provider": source.provider,
    "data-visual-verification-method": source.verification?.method,
    "data-visual-verification-ref": source.verification?.evidenceRef,
    "data-visual-verified-at": source.verification?.verifiedAt,
  };
  const rendered = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${xmlAttribute(value)}"`)
    .join(" ");
  return rendered ? ` ${rendered}` : "";
}
const COMPONENT_LAYERS = ["behind", "overlay", "foreground"];
const countVisualNodes = (items) => items.reduce(
  (total, node) => total + 1 + (node.children ? countVisualNodes(node.children) : 0),
  0,
);
function assertVisualSpecBudget(spec) {
  const staticCount = [
    "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
  ].reduce((sum, key) => sum + countVisualNodes(spec[key] || []), 0);
  const generatedCount = (spec.proceduralComponents || []).reduce(
    (sum, component) => sum + countVisualNodes(createGeometryComponent(component.componentId, component.options)),
    0,
  );
  if (staticCount + generatedCount > 100)
    throw new TypeError("Rendered visual spec exceeds the 100 geometry node limit.");
}
function componentAnchor(component, pose) {
  if(pose && SEGMENT_BONES.includes(component.attachment))return segmentAnchor(component.attachment,pose);
  if (component.attachment === "root" || !pose) return { position: [0, 0], rotation: 0 };
  if (component.attachment === "head")
    return { position: pose.head || [0, 0], rotation: pose.headAngle || 0 };
  if (component.attachment === "torso") {
    const neck = neckOf(pose);
    return { position: lerp(neck, pose.hip || neck, 0.55), rotation: 0 };
  }
  if (component.attachment === "leftHand" || component.attachment === "rightHand") {
    const left = component.attachment === "leftHand";
    const handPoint = left ? pose.leftHand : pose.rightHand;
    const shoulder = armRoot(pose,left);
    const side = left ? pose.leftElbowSide ?? (handPoint[1]<pose.head[1]+85||pose.flex?-1:1) : pose.rightElbowSide ?? (handPoint[1]<pose.head[1]+85||pose.flex?1:-1);
    const arm = ik(shoulder, handPoint, 98, 102, side);
    const wrist = left ? pose.leftWristAngle || 0 : pose.wristAngle || 0;
    const type = left ? pose.leftType : pose.rightType;
    const rotation = pose.rigVersion === 2
      ? wristDirection(arm.elbow, arm.hand, wrist, type)
      : wrist;
    return { position: arm.hand, rotation };
  }
  const left = component.attachment === "leftFoot";
  const foot = left ? pose.leftFoot : pose.rightFoot;
  const leg = ik(pose.hip || [0, 0], foot || [0, 0], 86, 86, pose[left?"leftKneeSide":"rightKneeSide"] ?? (left ? 1 : -1));
  const rotation = (Math.atan2(leg.hand[1] - leg.elbow[1], leg.hand[0] - leg.elbow[0]) * 180) / Math.PI - 90;
  return { position: leg.hand, rotation };
}
function proceduralLayer(spec, base, pose, layer) {
  if (!spec || !COMPONENT_LAYERS.includes(layer)) return "";
  const components = (spec.proceduralComponents || [])
    .filter((component) => component.layer === layer)
    .map((component) => ({
      component,
      geometry: createGeometryComponent(component.componentId, component.options),
    }))
    .sort((a, b) => a.component.zIndex - b.component.zIndex || a.component.id.localeCompare(b.component.id));
  if (!components.length) return "";
  const count = (items) => items.reduce(
    (total, node) => total + 1 + (node.children ? count(node.children) : 0),
    0,
  );
  const staticCount = [
    "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
  ].reduce((sum, key) => sum + count(spec[key] || []), 0);
  const generatedCount = components.reduce((sum, item) => sum + count(item.geometry), 0);
  if (staticCount + generatedCount > 100)
    throw new TypeError("Rendered visual spec exceeds the 100 geometry node limit.");
  const basePosition = base?.position || [0, 0];
  const baseRotation = base?.rotation || 0;
  const baseScale = base?.scale || [1, 1];
  const outer = spec.globalTransform
    ? visualTransform(spec.globalTransform.position, spec.globalTransform.rotation, spec.globalTransform.scale)
    : visualTransform(basePosition, baseRotation, baseScale);
  const local = spec.localTransform;
  const localGroup = (content) => local
    ? `<g transform="${visualTransform(local.position, local.rotation, local.scale)}">${content}</g>`
    : content;
  const style = {
    fill: spec.paint?.fill ?? "none",
    stroke: spec.paint?.stroke ?? I,
    outlineThickness: spec.paint?.outlineThickness ?? 1.5,
    palette: spec.palette || [],
  };
  const content = components.map(({ component, geometry }) => {
    const anchor = componentAnchor(component, pose);
    const position = [anchor.position[0] + component.offset[0], anchor.position[1] + component.offset[1]];
    const angle = anchor.rotation + component.rotation;
    const drawing = nodes(geometry, 0, style, {
      idPrefix: base?.id || "spec",
      key: `component-${component.id}`,
    });
    return `<g data-visual-component-id="${component.id}" data-visual-component-kind="${component.componentId}/v${component.version}" data-visual-attachment="${component.attachment}" data-visual-layer="${component.layer}" data-visual-z-index="${component.zIndex}" transform="translate(${xy(position)}) rotate(${n(angle)}) scale(${xy(component.scale)})">${drawing}</g>`;
  }).join("");
  return `<g data-visual-procedural-layer="${layer}" transform="${outer}">${localGroup(content)}</g>`;
}
export function visualSpec(spec, t = 0, base = null, options = {}) {
  if (!spec) return "";
  assertVisualSpecBudget(spec);
  const layer = options.componentLayer || "overlay";
  const pose = options.pose || base?.pose || null;
  const includeLegacy = options.includeLegacy !== false;
  const dimensions = {
    width: spec.normalizedDimensions?.width ?? 100,
    height: spec.normalizedDimensions?.height ?? 100,
  };
  const style = {
    fill: spec.paint?.fill ?? "none",
    stroke: spec.paint?.stroke ?? I,
    outlineThickness: spec.paint?.outlineThickness ?? 1.5,
    palette: spec.palette || [],
  };
  const components = includeLegacy ? [
    ["geometry", spec.geometryRecipe],
    ["face", spec.facialComponents],
    ["apparel", spec.apparel],
    ["accessories", spec.accessories],
    ["decorative-marks", spec.decorativeMarks],
  ] : [];
  const content = components
    .filter(([, items]) => items?.length)
    .map(([name, items]) => `<g data-visual-component="${name}">${nodes(items, t, style, { idPrefix: base?.id || "spec", key: name, sceneId:base?.sceneId, pose })}</g>`)
    .join("");
  const anchors = (spec.motionAnchors || [])
    .map((anchor) => `<g data-motion-anchor-id="${anchor.id}" transform="translate(${xy(anchor.position)})"/>`)
    .join("");
  const basePosition = base?.position || [0, 0];
  const baseRotation = base?.rotation || 0;
  const baseScale = base?.scale || [1, 1];
  const local = spec.localTransform;
  const global = spec.globalTransform;
  const outerTransform = global
    ? visualTransform(global.position, global.rotation, global.scale)
    : visualTransform(basePosition, baseRotation, baseScale);
  const localTransform = local
    ? `<g transform="${visualTransform(local.position, local.rotation, local.scale)}"><g transform="scale(${n(dimensions.width / 100)} ${n(dimensions.height / 100)})">${content}${anchors}</g></g>`
    : `<g transform="scale(${n(dimensions.width / 100)} ${n(dimensions.height / 100)})">${content}${anchors}</g>`;
  const inner = global
    ? `<g transform="scale(${n(dimensions.width / 100)} ${n(dimensions.height / 100)})">${content}${anchors}</g>`
    : localTransform;
  const legacy = includeLegacy
    ? `<g data-visual-spec="true" data-silhouette-family="${spec.silhouetteFamily}" data-material="${spec.material}" data-visual-z-index="${spec.zIndex}" transform="${outerTransform}">${inner}</g>`
    : "";
  const procedural = proceduralLayer(spec, base, pose, layer);
  const sourceAttributes = includeLegacy ? visualSourceMetadata(spec.assetSource) : "";
  return sourceAttributes
    ? `<g${sourceAttributes}>${legacy}${procedural}</g>`
    : legacy + procedural;
}
export function hand(p,type='fist',angle=0,scale=1,color=I,side=1){
 const shapes={
 fist:"M-7 0 L-9 -9 Q-18 -12 -13 -20 Q-10 -25 -5 -19 L-5 -27 Q0 -32 4 -26 Q9 -31 13 -24 Q21 -27 23 -18 L21 -6 L13 0Z",
 grip:"M-8 0 L-13 -10 Q-21 -21 -12 -25 Q-7 -27 -5 -20 L-3 -16 L-1 -30 Q3 -35 7 -29 L10 -15 Q13 -27 18 -24 Q23 -22 19 -13 L15 -2 L8 0Z",
 point:"M-7 0 L-11 -11 Q-18 -17 -11 -23 L-7 -21 L-8 -43 Q-6 -49 -2 -45 L3 -23 Q10 -30 14 -23 Q22 -25 24 -17 L20 -5 L11 0Z",
 open:"M-7 0 Q-13 -6 -14 -13 L-24 -27 Q-25 -34 -20 -31 L-9 -21 L-14 -43 Q-14 -50 -9 -46 L0 -26 L-1 -50 Q1 -55 5 -49 L9 -27 L13 -45 Q17 -50 20 -43 L18 -20 L26 -32 Q31 -35 31 -28 L22 -9 Q18 -2 10 0Z"
 };
 const crease=type==='fist'?"M-5 -21 L-3 -11 M4 -23 L6 -13 M13 -22 L14 -12 M-11 -10 Q1 -6 14 -9":type==='grip'?"M-6 -15 Q3 -9 13 -13 M1 -27 L4 -16 M12 -20 L12 -10":"M-5 -11 Q5 -17 16 -10 M0 -24 L6 -17";
 return `<g data-articulated-hand="${type}" transform="translate(${xy(p)}) rotate(${n(angle)}) scale(${n(.65*scale*side)} ${n(.65*scale)})">${path(shapes[type]||shapes.fist,color,1.8,"#252c28")+path(crease,"none",1.1,color===I?"#b2b7a3":"#816b58")}</g>`;
}
function shoe(p, sc = 0.61, color = SKIN) {
  return group(
    p,
    0,
    sc,
    path(
      "M-20 -6 Q-25 -26 -12 -29 Q2 -32 7 -16 C21 -17 32 -12 31 -3 Q32 4 19 5 L-16 5 Q-28 4 -20 -6Z",
      color,
      2.6,
    ) + path("M-20 0 Q1 5 29 0 M-2 -17 L4 -10", "none", 1.2),
  );
}
function eye(p, r, op, g, id) {
  if (op < 0.08)
    return path(
      `M${p[0] - r[0]} ${p[1]} Q${p[0]} ${p[1] + 9} ${p[0] + r[0]} ${p[1] - 1}`,
    );
  let y = p[1] - r[1] + 2 * r[1] * (1 - op);
  return (
    `<defs><clipPath id="${id}"><ellipse cx="${p[0]}" cy="${p[1]}" rx="${r[0]}" ry="${r[1]}"/></clipPath></defs>` +
    ellipse(p, r, "#faf7e6", 0) +
    `<g clip-path="url(#${id})">` +
    ellipse(add(p, g), [3.6, 5], I, 0) +
    (op < 0.99
      ? path(
          `M${p[0] - r[0] - 3} ${p[1] - r[1] - 3} L${p[0] + r[0] + 3} ${p[1] - r[1] - 3} L${p[0] + r[0] + 3} ${y} Q${p[0]} ${y + 6} ${p[0] - r[0] - 3} ${y - 3}Z`,
          "#eee8ce",
          0,
        ) +
        path(
          `M${p[0] - r[0] - 3} ${y - 3} Q${p[0]} ${y + 5} ${p[0] + r[0] + 3} ${y}`,
        )
      : "") +
    "</g>" +
    ellipse(p, r, "none", 2)
  );
}
function eyeOpen(s, side, fallback) {
  return s[side === "left" ? "eyeOpenLeft" : "eyeOpenRight"] ?? s.eyeOpen ?? fallback;
}
function controlledBrows(s, ink) {
  if (s.browHeight === undefined && s.browTilt === undefined) return null;
  const height = s.browHeight || [0, 0], tilt = s.browTilt || [0, 0];
  const brow = (x, h, a) => `<g transform="translate(${x} ${-77-h}) rotate(${a})">${path("M-19 0 Q0 -9 19 0","none",2.6,ink)}</g>`;
  return `<g data-dynamic-brows="true">${brow(-27,height[0],tilt[0])}${brow(27,height[1],tilt[1])}</g>`;
}
function controlledMouth(s, emotion, ink, y = 42, depth = 38) {
  if (s.mouthWidth === undefined && s.mouthCurve === undefined && s.mouthAperture === undefined && s.mouthOpen === undefined) return null;
  const width = 29 * (s.mouthWidth ?? 1);
  const smile = ["laugh","smug","confident"].includes(emotion) ? .55 : ["defeat","cry"].includes(emotion) ? -.55 : 0;
  const curve = s.mouthCurve ?? smile;
  const namedAperture = emotion === "jawdrop" ? 1 : emotion === "shock" ? .8 : emotion === "laugh" ? .35 : 0;
  const aperture = Math.max(0, Math.min(1, s.speaking ? (s.talk ?? 0) : (s.mouthAperture ?? s.mouthOpen ?? namedAperture)));
  if (aperture < .025)
    return `<g data-dynamic-mouth="true">${path(`M${-width} ${y} Q0 ${y+curve*24} ${width} ${y}`,"none",2.2,ink)}</g>`;
  const lower = y + 4 + aperture * depth;
  return `<g data-dynamic-mouth="true">${path(`M${-width} ${y} Q0 ${y-curve*8} ${width} ${y} Q0 ${lower+curve*7} ${-width} ${y}Z`,"#542e2a",2,ink)}${aperture>.18?path(`M${-width*.78} ${y+2} Q0 ${y+5+aperture*3} ${width*.78} ${y+2} L${width*.7} ${y+8+aperture*4} Q0 ${y+11+aperture*5} ${-width*.7} ${y+8+aperture*4}Z`,"#fff7df",.8,ink):""}</g>`;
}
const seniorFace = a => a.kind==='grandma'||(['man','woman'].includes(a.kind)&&a.ageYears>=65);
function ageLines(a,ink){
  return seniorFace(a)?`<g data-age-cues="senior">${path('M-28 -76 Q-3 -84 24 -77 M-44 12 L-34 18 M-46 22 L-36 27 M37 16 L47 10 M37 27 L48 22 M-34 48 L-29 58 M32 47 L36 57','none',1.5,ink)}</g>`:'';
}
function face(a, s, t) {
  if(a.referenceStyle === "elastic-meme") return elasticFace(a,s,t);
  if(a.artStyle === "toon") return toonFace(a,s,t);
  if(a.artStyle === "pencil") return pencilFace(a,s,t);
  let q = s.face,
    old = seniorFace(a),
    female = ["grandma", "woman"].includes(a.kind),
    jaw = q === "jawdrop" && !s.coveredMouth ? 52 : q === "shock" ? 15 : 0,
    puff = q === "extreme" ? 14 : q === "strain" ? 7 : 0,
    skin = s.red > 0.6 ? "#ebc7a7" : s.red > 0.1 ? "#efd7b7" : a.skin,
    d = "";
  if (female && !["bald","bob","curly","sidepart"].includes(a.hairStyle))
    d +=
      ellipse([48, -57], [old ? 25 : 19, old ? 27 : 38], a.hair, 2) +
      path("M38 -76 Q67 -73 62 -50", "none", 1.2);
  d += path(
    `M-43 -63 C-27 -83 19 -89 43 -64 C57 -50 50 -28 55 -8 C${79 + puff} 2 ${76 + puff} 26 58 33 C64 ${57 + jaw} 26 ${77 + jaw} -8 ${73 + jaw} C-43 ${72 + jaw} ${-58 - puff} 54 ${-52 - puff} 30 C-65 14 -59 -16 -56 -33 Q-56 -54 -43 -63Z`,
    skin,
    2.6,
  );
  if (a.hairStyle && a.hairStyle !== "tuft") {
    const styles = {
      bald: "M-34 -74 Q-20 -85 -13 -78 M26 -78 L34 -69",
      sidepart: "M-53 -53 Q-60 -101 -8 -91 Q44 -100 46 -56 L29 -73 Q-4 -59 -35 -72Z",
      curly: "M-54 -60 C-81 -81 -53 -99 -40 -90 C-46 -116 -12 -111 -8 -99 C5 -121 33 -111 30 -97 C59 -107 68 -77 46 -59 Q2 -80 -54 -60Z",
      bob: "M-53 -36 Q-76 -108 -6 -103 Q69 -99 53 -26 L37 -65 Q-6 -50 -43 -68Z",
      ponytail: "M-53 -59 Q-54 -100 4 -97 Q56 -98 48 -59 Q77 -89 89 -49 L68 -29 Q64 -70 46 -61 L32 -72 Q-9 -57 -53 -59Z"
    };
    d += path(styles[a.hairStyle], a.hairStyle === "bald" ? "none" : a.hair, 2);
  } else d += female
    ? path(
        "M-47 -59 C-28 -81 20 -85 43 -62 L36 -72 Q1 -98 -39 -73Z",
        a.hair,
        1.9,
      )
    : path(
        "M-40 -67 Q-46 -87 -23 -77 Q-23 -98 -5 -81 Q5 -99 20 -80 Q35 -95 35 -72",
      );
  d +=
    ellipse([-55, -1], [10, 15], a.skin, 2) +
    path("M-59 -8 Q-48 -15 -49 4", "none", 1.3);
  let lid = ["strain", "extreme", "kiss", "laugh", "cry"].includes(q)
    ? 0.04
    : ["smug", "calm", "defeat"].includes(q)
      ? 0.5
      : 1;
  lid=Math.min(lid,blinkOpenness(a.id,t));
  let wide = ["shock", "jawdrop", "idea"].includes(q),
    g = s.gaze || (q === "defeat" ? [0, 9] : [7, 4]);
  d +=
    eye([-24, -29], [wide ? 25 : 21, wide ? 34 : 28], eyeOpen(s,"left",lid), g, a.id + "e1") +
    eye([18, -33], [wide ? 28 : 24, wide ? 39 : 32], eyeOpen(s,"right",lid), g, a.id + "e2");
  if (old || a.accessory === "glasses")
    d +=
      ellipse([-24, -29], [25, 23], "none", 1.7) +
      ellipse([18, -33], [28, 25], "none", 1.7) +
      path("M-1 -30 Q4 -37 7 -32");
  const brows=controlledBrows(s,I);
  d += brows ?? (["strain", "extreme", "annoyed"].includes(q)
    ? path("M-46 -65 Q-26 -67 -9 -50 M3 -53 Q20 -73 39 -72", "none", 2.6)
    : q === "defeat"
      ? path("M-47 -56 Q-30 -79 -10 -64 M6 -66 Q24 -73 41 -54", "none", 2.2)
      : path("M-47 -67 Q-28 -81 -10 -67 M4 -72 Q24 -85 42 -68", "none", 2.2));
  d +=
    path(
      "M-5 -7 C-20 2 -12 23 6 19 C20 27 49 21 46 7 Q44 -8 25 -6 Q14 -19 2 -8Z",
      a.skin,
      2.1,
    ) +
    ellipse([1, 16], [3.5, 2], I, 0) +
    ellipse([38, 16], [3.5, 2], I, 0);
  let shape = ["confident", "smug", "laugh"].includes(q)
    ? "M-27 33 Q3 51 41 27 C34 68 -8 78 -27 33Z"
    : q === "shock"
      ? "M-3 38 Q9 29 21 38 C35 71 -13 82 -3 38Z"
      : q === "jawdrop"
        ? "M-29 34 Q8 23 46 31 L50 97 Q13 127 -31 99Z"
        : (q === "talk" || s.speaking)
          ? `M-24 34 Q8 24 37 34 L35 ${53 + s.talk * 32} Q8 ${69 + s.talk * 35} -24 ${53 + s.talk * 32}Z`
          : "";
  const customMouth=controlledMouth(s,q,I,45);
  if (s.coveredMouth) {}
  else if(customMouth)d+=customMouth;
  else if (shape)
    d +=
      `<defs><clipPath id="${a.id}mouth"><path d="${shape}"/></clipPath></defs>` +
      path(shape, "#46362d", 2.1) +
      `<g clip-path="url(#${a.id}mouth)">` +
      path("M-36 27 L54 23 L48 42 Q8 49 -32 43Z", "#fff7df", 1) +
      ellipse([10, q === "jawdrop" ? 102 : 66], [20, 9], "#be8273", 1) +
      "</g>";
  else if (["strain", "extreme", "annoyed"].includes(q))
    d +=
      path("M-28 37 Q7 23 43 34 L42 57 Q8 67 -27 56Z", "#fff7df", 2) +
      path(
        "M-27 45 L42 44 M-13 34 L-12 60 M2 30 L3 63 M19 29 L20 62 M33 32 L34 59",
        "none",
        0.9,
      );
  else if (q === "kiss")
    d += path("M-7 39 Q17 34 24 41 Q41 33 44 43 Q43 54 23 49 Q8 59 -7 51");
  else
    d +=
      q === "defeat" || q === "cry"
        ? path("M-26 54 Q8 26 42 51", "none", 2.2)
        : path("M-23 44 Q7 55 35 40");
  if (["strain", "extreme", "defeat", "cry"].includes(q))
    d += path("M-40 -6 C-52 9 -45 19 -39 12 Q-35 5 -40 -6Z", "#a5c2b6", 1);
  if (old)
    d += path("M-42 17 L-34 22 M-42 25 L-35 27 M47 35 L52 40", "none", 0.9);
  if (a.accessory === "moustache")
    d += path(
      "M-18 26 Q-6 16 5 23 Q19 12 37 24 Q29 39 6 30 Q-8 39 -18 26Z",
      "#655f4d",
      1.2,
    );
  const proportions = a.faceShape === "long" ? [0.88,1.1] : a.faceShape === "square" ? [1.12,.92] : [1,1];
  return `<g transform="scale(${s.facing * a.headWidth * proportions[0]} ${a.headHeight * proportions[1]})">${d}</g>`;
}
function muscle(a, b, m, skin) {
  let dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.max(1, Math.hypot(dx, dy)),
    nx = -dy / len,
    ny = dx / len,
    w = 3 + 30 * m,
    pt = (u, v) => [lerp(a[0], b[0], u) + nx * v, lerp(a[1], b[1], u) + ny * v];
  return (
    path(
      `M${xy(pt(0, 2))} C${xy(pt(0.22, w * 0.6))} ${xy(pt(0.47, w * 1.7))} ${xy(pt(0.72, w * 0.75))} Q${xy(pt(0.91, w * 0.5))} ${xy(pt(1, 2))} L${xy(pt(1, -2))} C${xy(pt(0.68, -w * 0.75))} ${xy(pt(0.2, -w * 0.95))} ${xy(pt(0, -2))}Z`,
      skin,
      2.5,
    ) +
    path(
      `M${xy(pt(0.36, w * 0.6))} Q${xy(pt(0.48, w))} ${xy(pt(0.64, w * 0.65))}`,
      "none",
      1.1,
    )
  );
}
export function actor(a, s, t, detail = "full", handsOnly = false) {
  const elastic=a.referenceStyle==="elastic-meme";
  let neck = neckOf(s),
    shoulder = add(neck, [0, 24]),
    L = ik(armRoot(s,true), s.leftHand, 98, 102, s.leftElbowSide ?? (s.leftHand[1]<s.head[1]+85 || s.flex ? -1 : 1)),
    R = ik(armRoot(s,false), s.rightHand, 98, 102, s.rightElbowSide ?? (s.rightHand[1]<s.head[1]+85 || s.flex ? 1 : -1));
  const hero=a.costume==="superhero",cape=a.capeColor||"#c94b43",boots=a.bootColor||"#bf4940";
  let arms = "",
    drawArm = (root, k, h) => {
      let d = path(`M${xy(root)} L${xy(k)} L${xy(h)}`, "none", elastic?5.2:3.4);
      if (s.muscle > 0.05)
        d +=
          muscle(root, k, s.muscle, hero?a.outfit:a.skin) +
          muscle(k, h, s.muscle * 0.36, hero?a.outfit:a.skin);
      return d;
    };
  arms +=
    (s.shoulderWidth>8?line(armRoot(s,true),armRoot(s,false),3.4):"")+
    drawArm(armRoot(s,true), L.elbow, L.hand) +
    drawArm(armRoot(s,false), R.elbow, R.hand);
  let hands =
    (!handsOnly || !s.overlayHands || s.overlayHands.includes("leftHand") ? hand(L.hand,s.leftType,s.rigVersion===2?wristDirection(L.elbow,L.hand,s.leftWristAngle||0,s.leftType):s.leftWristAngle||0,s.handScale||1,a.artStyle==="pencil"?I:a.skin,-1) : "") +
    (!handsOnly || !s.overlayHands || s.overlayHands.includes("rightHand") ? hand(R.hand,s.rightType,s.rigVersion===2?wristDirection(R.elbow,R.hand,s.wristAngle||0,s.rightType):s.wristAngle||0,s.handScale||1,a.artStyle==="pencil"?I:a.skin,1) : "");
  const foregroundArm=(bone,root,k)=>s.overlayForearms?.includes(bone)?`<g data-foreground-arm="${bone}">${drawArm(root,k.elbow,k.hand)}</g>`:"";
  const reachArms=foregroundArm("leftHand",armRoot(s,true),L)+foregroundArm("rightHand",armRoot(s,false),R);
  if (handsOnly) return group(s.position, s.bodyAngle || 0, s.scale, reachArms+hands);
  if (detail === "hands") return group(s.position, 0, s.scale, arms + hands);
  let kl = ik(s.hip, s.leftFoot, 86, 86, s.leftKneeSide ?? 1),
    kr = ik(s.hip, s.rightFoot, 86, 86, s.rightKneeSide ?? -1),
    d =

      path(
        `M${xy(s.hip)} L${xy(kl.elbow)} L${xy(kl.hand)} M${xy(s.hip)} L${xy(kr.elbow)} L${xy(kr.hand)}`,
        "none",
        3.4,
      ) +
      (hero ? muscle(s.hip,kl.elbow,.40,a.outfit)+muscle(kl.elbow,kl.hand,.28,boots)+muscle(s.hip,kr.elbow,.40,a.outfit)+muscle(kr.elbow,kr.hand,.28,boots):"") +
      shoe(kl.hand,.61,hero?boots:SKIN) +
      shoe(kr.hand,.61,hero?boots:SKIN) +
      arms;
  if(hero){
    const sway=Math.sin(t*7)*12;
    const cloth=path(`M${neck[0]-41} ${neck[1]+4} Q${neck[0]-77} ${neck[1]+112} ${s.hip[0]-92+sway} ${s.hip[1]+111} L${s.hip[0]-22+sway} ${s.hip[1]+93} L${s.hip[0]+33+sway} ${s.hip[1]+114} L${s.hip[0]+91+sway} ${s.hip[1]+88} Q${neck[0]+78} ${neck[1]+94} ${neck[0]+41} ${neck[1]+4}Z`,cape,2.7)+path(`M${neck[0]-27} ${neck[1]+30} Q${s.hip[0]-54+sway} ${s.hip[1]+30} ${s.hip[0]-42+sway} ${s.hip[1]+81} M${neck[0]+24} ${neck[1]+32} L${s.hip[0]+39+sway} ${s.hip[1]+82}`,"none",1.3,"#943d3b");
    d=`<g data-superhero-cape="true">${cloth}</g>`+d;
    d+=path(`M${neck[0]-49} ${neck[1]+7} Q${neck[0]-70} ${neck[1]+35} ${neck[0]-50} ${neck[1]+74} L${s.hip[0]-28} ${s.hip[1]+4} Q${s.hip[0]} ${s.hip[1]+17} ${s.hip[0]+28} ${s.hip[1]+4} L${neck[0]+50} ${neck[1]+74} Q${neck[0]+70} ${neck[1]+35} ${neck[0]+49} ${neck[1]+7} Q${neck[0]} ${neck[1]+24} ${neck[0]-49} ${neck[1]+7}Z`,a.outfit,2.6);
    const chest=lerp(neck,s.hip,.34);
    d+=group(chest,0,1,path("M-37 -17 L37 -17 L46 -1 L0 34 L-46 -1Z","#e1bc45",2,"#b2453c")+path("M25 -8 Q3 -20 -17 -6 Q-31 7 2 8 Q28 7 9 20 L-9 21 M24 -8 L17 -3 M-9 21 L-24 15","none",7,"#bc413a"));
    d+=path(`M${s.hip[0]-31} ${s.hip[1]-3} L${s.hip[0]+31} ${s.hip[1]-3} L${s.hip[0]+31} ${s.hip[1]+10} L${s.hip[0]-31} ${s.hip[1]+10}Z`,"#dec04d",1.5)+ellipse([s.hip[0],s.hip[1]+3],[9,8],"#d7a43b",1.5);
  } else if (["woman", "grandma"].includes(a.kind) && (!a.wardrobe || a.wardrobe === "default"))
    d += path(
      `M${xy(neck)} Q${neck[0] - 28} ${neck[1] + 42} ${s.hip[0] - ({slim:34,average:42,broad:53,round:65}[a.build]||42)} ${s.hip[1] + 30} Q${s.hip[0]} ${s.hip[1] + 39} ${s.hip[0] + ({slim:34,average:40,broad:53,round:65}[a.build]||40)} ${s.hip[1] + 28} Q${neck[0] + 26} ${neck[1] + 36} ${xy(neck)}Z`,
      a.outfit,
      2.4,
    );
  else {
    let w = (a.wardrobe && a.wardrobe !== "default" ? ({slim:22,average:32,broad:47,round:65}[a.build]||25) : elastic?18:5) + 23 * s.muscle;
    d += path(
      `M${xy(neck)} C${neck[0] - w} ${neck[1] + 20} ${s.hip[0] - w} ${s.hip[1] - 20} ${xy(s.hip)} C${s.hip[0] + w} ${s.hip[1] - 20} ${neck[0] + w} ${neck[1] + 20} ${xy(neck)}Z`,
      a.wardrobe && a.wardrobe !== "default" ? a.outfit : a.skin,
      2.4,
    );
    if (a.wardrobe === "suit")
      d +=
        path(
          `M${neck[0] - 21} ${neck[1] + 9} L${neck[0]} ${neck[1] + 50} L${neck[0] + 21} ${neck[1] + 9} M${neck[0]} ${neck[1] + 50} L${s.hip[0]} ${s.hip[1]}`,
          "none",
          1.8,
        ) +
        path(
          `M${neck[0] - 4} ${neck[1] + 14} L${neck[0] + 4} ${neck[1] + 14} L${neck[0] + 8} ${neck[1] + 66} L${neck[0]} ${neck[1] + 76} L${neck[0] - 8} ${neck[1] + 66}Z`,
          "#b27c6c",
          1,
        );
  }
  if(a.shirtLabel)d+=label(a.shirtLabel,[s.hip[0],s.hip[1]-60],14,"#fff8df");
  return group(
    s.position,
    s.bodyAngle || 0,
    s.scale,
    d +
      (s.rigVersion===2?path(`M${xy(add(s.head,[0,65]))} Q${s.head[0]} ${neck[1]} ${xy(neck)}`,"none",4):"")+
      wrapBody(s) +
      group(s.head, s.headAngle, 1, `<g transform="scale(${(s.headScale||[1,1]).join(" ")})">${face(a, s, t) + wrapHead(s)}</g>`) +
      `<g data-hand-foreground="true">${hands}</g>`,
  );
}
export function prop(design, p) {
  let d = "",
    c = design.color,
    open = p.open || 0;
  if(design.type === "cap"){
    d=path("M-57 0 Q-62 -65 -5 -69 Q53 -72 58 0Z",c,2.5)+path("M-57 0 L62 0 Q101 -3 104 9 Q72 22 14 12 L-57 9Z",c,2.5)+path("M-8 -65 Q11 -41 8 -3","none",1.3,"#f1b1a0")+ellipse([-5,-69],[6,4],c,1.5)+label(design.label||"",[0,-21],Math.min(18,90/Math.max(1,(design.label||"").length)*1.6),"#fff8de");
  }
  if(design.type === "can"){
    d=path("M-23 -39 Q0 -47 23 -39 L23 38 Q0 48 -23 38Z",c,2.4)+path("M-17 -30 L-17 30","none",3,"#a9cceb")+ellipse([0,-40],[23,7],"#dce1da",1.7)+ellipse([0,39],[23,6],"#a3b8bb",1.7)+ellipse([0,-40],[8,3],"#78898c",1)+path("M-4 -43 L7 -40 L2 -37Z","#d5dcce",1)+ellipse([0,-5],[17,17],"#fffbed",0)+path("M-16 -9 Q-2 -25 16 -10 Q0 -1 -16 -9Z","#e94742",0)+path("M-16 1 Q0 9 16 -1 Q1 20 -16 1Z","#237bc1",0)+label(design.label||"",[0,27],Math.min(12,38/Math.max(1,(design.label||"").length)*1.6),"#ffffff");
  }
  if(design.type === "bottle")d=path("M-8 -62 L8 -62 L9 -40 Q25 -31 24 -17 L24 37 Q0 48 -24 37 L-24 -17 Q-25 -31 -9 -40Z",c,2.3)+path("M-11 -67 L11 -67 L11 -59 L-11 -59Z","#b73535",1.6)+path("M-23 -8 L23 -8 L23 22 L-23 22Z","#fff5d4",1)+label(design.label||"",[0,12],11,"#245d7b");
  if (design.type === "banana" || design.type === "peel") {
    d = visualSpec(propConstruction(design.type));
  }
  if (design.type === "dustbin") {
    d = path("M-65 -157 L65 -157 L51 0 Q0 13 -51 0Z", c,2.8) + path("M-52 -142 L-41 -4 M52 -142 L41 -4", "none",2,"#27756e") + group([-66,-158],-open*100,1,path("M0 -4 Q65 -24 132 -4 L132 8 L0 8Z","#2d6b62",2.5)+path("M52 -15 L52 -26 L80 -26 L80 -15","none",4));
    d += label(design.label || "USE ME",[0,-84],18,"#fffce9");
  }
  if (design.type === "sign") d = path("M-88 -28 L88 -28 L88 28 L-88 28Z",c,2.5) + label(design.label || "",[0,7],21,"#fffce9");
  if (design.type === "rubberDuck") {
    d = `<g transform="scale(1 ${1-(p.squash||0)})">` + path("M-32 -4 Q-39 -28 -16 -29 Q-24 -57 2 -60 Q29 -61 25 -35 L45 -27 L26 -20 Q43 16 -1 19 Q-43 17 -46 -5Z",c,2.5) + path("M23 -38 L49 -29 L24 -23Z","#f08d38",2) + ellipse([7,-43],[3,4],I,0) + path("M-24 -7 Q-8 -23 8 -8 Q-4 8 -24 -7", "#edb631",1.5) + "</g>";
  }
  if(design.type === "headphones") d = path("M-67 -8 L-67 -39 C-68 -117 65 -118 67 -40 L67 -8","none",12,"#343b3b")+path("M-67 -8 L-67 -39 C-68 -117 65 -118 67 -40 L67 -8","none",7,c)+path("M-77 -25 Q-59 -35 -53 -19 L-51 20 Q-61 36 -77 24Z",c,2)+path("M57 -27 Q76 -36 82 -18 L79 23 Q63 35 54 19Z",c,2)+path("M-69 -16 L-67 19 M65 -17 L64 20","none",4,"#373e3c");
  if(design.type === "gasMask") d=path("M-59 -10 L-25 -3 M25 -3 L62 -13","none",6,"#4c6460")+path("M-29 -24 Q0 -35 28 -24 L36 18 Q0 54 -34 19Z",c,2.4)+ellipse([0,17],[21,23],"#465b51",2)+ellipse([0,17],[12,15],"#94ac91",1.4)+ellipse([-42,8],[16,23],c,2)+ellipse([42,8],[16,23],c,2)+path("M-47 -5 L-47 20 M-40 -8 L-40 23 M40 -8 L40 23 M47 -5 L47 20 M-8 11 L8 11 M-8 19 L8 19","none",1.2,"#344c43");
  if(design.type === "newspaper") {
    d=path("M-88 -105 L83 -101 L91 90 L-79 96Z",c,1.8)+path("M0 -71 L6 80 M-75 -57 L-10 -57 M14 -57 L72 -57 M-74 -43 L-10 -43 M15 -43 L74 -43 M-72 -29 L-10 -29 M16 -29 L74 -29 M-70 33 L-8 33 M-69 45 L-8 45 M-68 57 L-8 57 M-67 69 L-8 69 M18 50 L75 50 M19 62 L76 62 M20 74 L77 74","none",1.2,"#939780")+path("M15 -15 L75 -15 L77 34 L17 34Z","#bec6ad",1)+label(design.label||"NEWS",[-2,-78],22,"#596353");
  }
  if (design.type === "chair")
    d =
      path("M-49 7 L-53 106 M49 7 L53 106", "none", 5, "#8c9381") +
      path("M-56 -108 Q0 -121 56 -108 L52 -14 L-52 -14Z", c, 2) +
      path("M-57 -10 L57 -10 L61 8 L-61 8Z", c, 2) +
      path("M-45 -88 L45 -88 M-44 -66 L44 -66", "none", 1, "#bcc4ac");
  if (design.type === "toilet")
    d =
      ellipse([0, 94], [48, 7], "#d7d8c4", 0) +
      path("M-45 -68 L37 -68 L37 1 L-45 1Z", "#f2f1e1", 2) +
      ellipse([24, -49], [7, 3], c, 1) +
      path(
        "M-48 4 C-58 52 -22 60 -16 66 L-23 87 L29 87 L21 62 C43 48 64 25 53 6Z",
        "#e6e9d9",
        2,
      ) +
      ellipse([3, 5], [54, 19], "#faf7e6", 2) +
      ellipse([3, 6], [39, 10], "#aebfb5", 1.5);
  if (design.type === "paperRoll") {
    let length = 38 + Math.min(4, p.paper || 0) * 26;
    d =
      path(
        `M-20 -4 L18 -4 L18 ${length} Q-2 ${length + 5} -20 ${length}Z`,
        "#faf8e8",
        1.4,
      ) +
      path(`M-19 ${length - 13} L17 ${length - 13}`, "none", 0.7, "#babdaa") +
      ellipse(
        [0, 0],
        [
          10 + 16 * Math.max(0, (design.stock ?? 1) - (p.paper || 0) * 0.12),
          15 + 16 * Math.max(0, (design.stock ?? 1) - (p.paper || 0) * 0.12),
        ],
        "#faf8e8",
        1.8,
      ) +
      ellipse([17, 0], [10, 28], "#dfdfc9", 1.6) +
      ellipse([17, 0], [4.2, 13], "#b6a382", 1.2) +
      group([17, 0], p.spin || 0, 1, line([0, -12], [0, 12], 1, "#d3cfb7"));
  }
  if (design.type === "door") {
    let shrink = 1 - 0.9 * open;
    d =
      path(
        "M-70 -217 L70 -217 L70 235 M-70 -217 L-70 235",
        "none",
        6,
        "#9b9e85",
      ) +
      `<g transform="translate(-65 0) scale(${shrink} 1)">` +
      path("M0 -210 L130 -210 L130 230 L0 230Z", c, 2) +
      path(
        "M14 -189 L115 -189 L115 -45 L14 -45Z M14 32 L115 32 L115 199 L14 199Z",
        "none",
        1,
        "#a8ae96",
      ) +
      ellipse([93, 0], [7, 7], "#dfd9b7", 2) +
      "</g>";
  }
  if (design.type === "drawing") d = nodes(design.nodes, p.time || 0, {}, {sceneId:p.sceneId});
  if (design.type === "jar") {
    d =
      ellipse([0, 33], [34, 5], "#d3d6bf", 0) +
      path(
        "M-25 -31 Q-28 -20 -29 -13 L-29 23 Q-29 31 -20 32 L20 32 Q29 31 29 23 L29 -13 Q28 -21 25 -31Z",
        "#d6e3c7",
        2.1,
      );
    for (let [x, y, a] of [
      [-9, 10, -20],
      [10, 7, 22],
      [0, -8, 75],
    ])
      d += group(
        [x, y],
        a,
        1,
        ellipse([0, 0], [7, 18], "#92a37a", 1.4) +
          path("M-2 -10 L-2 6 M3 -4 L3 9", "none", 1, "#d0d7a7"),
      );
    d +=
      path(
        "M-21 -20 L-21 21 Q-19 26 -14 26 M21 -15 L21 17",
        "none",
        2,
        "#faf8e5",
      ) +
      ellipse([0, -31], [25, 4], "#c1d2b1", 1.6) +
      group(
        [open * 7.6, -35 - open * 59],
        -open * 12,
        1,
        open < 0.05
          ? path("M-31 -6 Q0 -13 31 -6 L31 4 Q0 10 -31 4Z", "#c78f78", 1.8) +
              path(
                "M-25 -3 L-25 4 M-16 -5 L-16 5 M-7 -6 L-7 5 M3 -6 L3 5 M13 -6 L13 5 M23 -4 L23 4",
                "none",
                0.8,
              )
          : ellipse([0, 0], [31, 8], "#d7aa8c", 1.9) +
              path(
                "M-30 0 L-30 7 Q0 17 30 7 L30 0 Q0 10 -30 0Z",
                "#c78f78",
                1.6,
              ),
      );
  }
  if (design.type === "cup")
    d =
      ellipse([0, 18], [23, 3], "#d4d6bd", 0) +
      path("M12 -8 C39 -15 39 13 14 11", "none", 2.1) +
      path("M-17 -12 L17 -12 L14 11 Q12 19 0 19 Q-13 19 -14 11Z", c, 1.9) +
      ellipse([0, -12], [17, 4], "#715c40", 1.6) +
      path(
        "M-7 -19 C-17 -28 3 -30 -6 -40 M5 -21 C-5 -28 16 -34 7 -43",
        "none",
        1.2,
        "#aeb5a0",
      );
  if (design.type === "table")
    d =
      path("M-64 7 L-64 188 M64 7 L64 188", "none", 5, "#9d9f84") +
      path("M-75 -5 L74 -5 L80 7 L-81 7Z", "#d3b58c", 2) +
      path("M-71 8 L70 8 L70 20 L-71 20Z", "#b69b79", 1.6);
  if (design.type === "bench")
    d =
      path(
        "M-60 -40 L65 -40 L65 -26 L-60 -26Z M-60 -61 L65 -61 L65 -46 L-60 -46Z",
        c,
        1.7,
      ) +
      path(
        "M-57 -25 L-57 55 M57 -25 L57 55 M-65 -5 L70 -5 L77 10 L-70 10Z",
        c,
        2,
      );
  if (design.type === "phone")
    d =
      path(
        "M-24 -44 Q-24 -50 -18 -50 L18 -50 Q24 -50 24 -44 L24 44 Q24 50 18 50 L-18 50 Q-24 50 -24 44Z",
        c,
        2.1,
      ) +
      path("M-19 -36 L19 -36 L19 34 L-19 34Z", "#b7d0c5", 1) +
      ellipse([0, -42], [6, 2], I, 0) +
      ellipse([0, 41], [3, 3], I, 0);
  if (design.type === "dumbbell")
    d =
      line([-55, 0], [55, 0], 7, "#9aab9a") +
      ellipse([-53, 0], [12, 35], c, 2) +
      ellipse([53, 0], [12, 35], c, 2);
  if (design.type === "balloon")
    d =
      (design.tether === false ? "" : path("M0 30 Q-30 70 0 105 Q18 132 2 152", "none", 1.2)) +
      ellipse([0, 0], [30, 39], c, 2) +
      path("M-4 37 L4 37 L0 44Z", c, 1.2);
  if (design.type === "car")
    d =
      path("M-70 0 L-50 -30 L30 -30 L50 -8 L80 0 L80 28 L-70 28Z", c, 2) +
      path(
        "M-43 -25 L-3 -25 L-3 -6 L-55 -6Z M3 -25 L27 -25 L45 -6 L3 -6Z",
        "#c6ddd5",
        1,
      ) +
      ellipse([-43, 28], [16, 16], I, 1) +
      ellipse([50, 28], [16, 16], I, 1);
  const hasDrawingGeometry = design.type !== "drawing"
    || (design.nodes?.length || 0) > 0
    || Boolean(design.visualSpec && [
      "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
    ].some((key) => (design.visualSpec[key] || []).length > 0
      || (design.visualSpec.proceduralComponents || []).length > 0));
  if (design.label && hasDrawingGeometry && !["dustbin","sign","newspaper","cap","can","bottle"].includes(design.type))
    d += label(design.label,[0,-110],17);
  let ribbon = "";
  if (p.paperEnd && p.paper > 0.02) {
    let a = [p.position[0] - 10 * p.scale, p.position[1] + 15 * p.scale],
      b = p.paperEnd,
      mid = [
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2 + 35 + Math.sin((p.time || 0) * 12) * 3,
      ];
    let curve = `M${xy(a)} Q${xy(mid)} ${xy(b)}`;
    ribbon =
      path(curve, "none", 12, "#9fa58f") + path(curve, "none", 9, "#faf8e8");
  }
  return group(p.position, p.angle || 0, p.scale, d) + ribbon;
}
export function background(kind, custom = [], mode, surfaceId = null, time = 0, sceneId) {
  const floor = path("M-1200 788 Q270 785 1700 788", "none", 1.2, "#b5baa2");
  let d = surfaceId
    ? `<g data-scene-entity-category="surface" data-scene-entity-id="${surfaceId}">${floor}</g>`
    : floor;
  if (kind === "hospital" || kind === "toiletEntrance") {
    d += path("M-200 210 L850 210 L850 788 L-200 788Z",kind === "hospital" ? "#d8e9e6" : "#e0e7ed",2) + path("M330 365 L495 365 L495 788 L330 788Z","#7da5a6",3) + path("M344 383 L480 383 L480 600 L344 600Z","#b9dadb",2) + label(kind === "hospital" ? "HOSPITAL" : "TOILET",[275,285],35,"#286b70");
    if (kind === "hospital") d += path("M15 248 L15 290 M-6 269 L36 269", "none",13,"#dc605a");
  }
  if (kind === "custom") return d + nodes(custom,time,{}, {sceneId});
  if (kind === "office") {
    d += path("M-200 790 L900 790", "none", 2, "#aeb89d");
    for (const x of [-110, 420])
      d += group(
        [x, 360],
        0,
        1,
        path("M0 -170 L150 -170 L150 120 L0 120Z", "#e6ead4", 1.8, "#a6b399") +
          path("M75 -170 L75 120 M0 -35 L150 -35", "none", 1.2, "#b0bba4"),
      );
    d += group(
      [275, 295],
      0,
      1,
      ellipse([0, 0], [39, 39], "#f7f3df", 1.8, "#a0aa92") +
        line([0, 0], [0, -23], 2, "#9ca58e") +
        line([0, 0], [19, 12], 2, "#9ca58e"),
    );
  }
  if (kind === "bathroom") {
    for (let x = -400; x < 1000; x += 90)
      d += path(`M${x} 240 L${x} 788`, "none", 0.8, "#d4d9c2");
    for (let y = 240; y < 800; y += 90)
      d += path(`M-500 ${y} L1100 ${y}`, "none", 0.8, "#d4d9c2");
    d +=
      path("M25 304 L112 304 L112 405 L25 405Z", "#d8e2d5", 2, "#a6b39d") +
      path("M33 314 L52 314 M32 323 L74 323", "none", 1, "#f6f5e1") +
      path("M360 330 L502 330 L502 788 L360 788Z", "#dedfca", 2, "#b7bda5");
  }
  if (["kitchen", "room"].includes(kind)) {
    d += group(
      [10, 580],
      0,
      1,
      path("M0 -98 L102 -98 L102 52 L0 52Z", "#e2e4cc", 1.3, "#b2bba4") +
        path(
          "M0 -65 L102 -65 M50 -65 L50 48 M41 -10 L41 3 M60 -10 L60 3",
          "none",
          1.1,
          "#a2ac94",
        ) +
        path(
          "M-5 -109 L106 -109 L111 -98 L-10 -98Z",
          "#c8cdb6",
          1.3,
          "#a4ad94",
        ),
    );
    d += group(
      [448, 392],
      0,
      1,
      path("M0 -80 L82 -80 L82 64 L0 64Z", "#e8e8d0", 1.3, "#b6bda7") +
        path("M41 -80 L41 64 M0 -10 L82 -10", "none", 1.2, "#b6bda7"),
    );
  }
  if (["park", "street"].includes(kind))
    for (const x of [-160, 20, 500, 780])
      d += group(
        [x, 650],
        0,
        1,
        path(
          "M0 -95 C-70 -110 -62 -170 -20 -174 C-15 -210 40 -208 48 -174 C100 -168 90 -112 35 -95Z",
          "#c5d2ad",
          1.5,
          "#85967e",
        ) + path("M15 -108 L15 135", "none", 4, "#a6a888"),
      );
  if (kind === "street")
    for (const x of [-100, 500, 1000])
      d += group(
        [x, 460],
        0,
        1,
        path("M0 -130 L160 -130 L160 290 L0 290Z", "#dfd9bd", 1.6, "#aab09a") +
          path("M10 -40 L150 -40 L160 -15 L0 -15Z", "#bc9981", 1.5) +
          path(
            "M20 0 L65 0 L65 150 L20 150Z M85 0 L140 0 L140 220 L85 220Z",
            "#cbd7c5",
            1.3,
          ),
      );
  if (kind === "gym") {
    d += path("M-100 745 L650 745", "none", 3, "#c1c8ad");
    for (const x of [-30, 480])
      d += group(
        [x, 650],
        0,
        1,
        path(
          "M-35 0 L35 0 L35 12 L-35 12Z M-28 12 L-28 130 M28 12 L28 130",
          "#b3bea9",
          2,
        ) +
          line([0, 0], [0, -170], 5, "#8d9d91") +
          line([-53, -165], [53, -165], 5) +
          ellipse([-53, -165], [12, 30], "#93a18b", 2) +
          ellipse([53, -165], [12, 30], "#93a18b", 2),
      );
  }
  if(mode==="dialogue-toon"){
    const set=path("M-1500 100 L1800 100 L1800 788 L-1500 788Z",kind==="street"?"#eed4aa":"#f6dfaf",0)+path("M-1500 788 L1800 788 L1800 1500 L-1500 1500Z","#b67e68",0);
    let texture="";for(let row=0;row<10;row++)for(let col=0;col<15;col++){const x=col*240-1400+(row%2)*100,y=180+row*58;texture+=path(`M${x} ${y} L${x+66} ${y} L${x+66} ${y+15} L${x} ${y+15}Z`,"#c99971",0);}
    d=set+`<g opacity=".18">${texture}</g>`+d;
  }
  return d + nodes(custom,time,{}, {sceneId});
}

function wrapBody(s) {
  let d = "",
    count = Math.floor((s.wrap || 0) * 11);
  for (let i = 0; i < Math.min(count, 8); i++) {
    let y = s.hip[1] + 8 - i * 21;
    d += path(
      `M-33 ${y - 7} Q0 ${y + 2} 33 ${y - 5} L34 ${y + 9} Q0 ${y + 16} -34 ${y + 7}Z`,
      "#f9f6e7",
      1.4,
    );
  }
  if (count > 7) {
    for (const [foot, side] of [
      [s.leftFoot, 1],
      [s.rightFoot, -1],
    ]) {
      let leg = ik(s.hip, foot, 86, 86, side);
      for (let i = 0; i < 3; i++) {
        let a = lerp(leg.elbow, leg.hand, 0.3 + i * 0.25);
        d += group(
          a,
          (Math.atan2(leg.hand[1] - leg.elbow[1], leg.hand[0] - leg.elbow[0]) *
            180) /
            Math.PI -
            90,
          1,
          path("M-12 -5 L12 -5 L12 5 L-12 5Z", "#f9f6e7", 1.2),
        );
      }
    }
  }
  return d;
}
function wrapHead(s) {
  let d = "",
    v = s.wrap || 0;
  if (v > 0.72)
    d += path("M-54 -70 Q5 -91 49 -68 L51 -48 Q0 -63 -55 -50Z", "#f9f6e7", 1.5);
  if (v > 0.88)
    d += path("M-53 33 Q0 44 56 29 L55 45 Q0 60 -53 49Z", "#f9f6e7", 1.5);
  if (v > 0.96)
    d += path("M-45 62 Q0 75 46 58 L41 75 Q0 88 -36 77Z", "#f9f6e7", 1.4);
  return d;
}
export function effect(e, t) {
  if(e.kind==='wind'){
    let d='';for(let i=0;i<7;i++){const phase=(e.phase+i*.137)%1,x=e.origin[0]+e.direction*(100-phase*145),y=e.origin[1]+(i<4?-1:1)*(65+(i%4)*17);d+=line([x,y],[x-e.direction*(32+(i%3)*15),y-2],2.1,'#547d8a');}
    return `<g data-flight-wind="true" opacity=".8">${d}</g>`;
  }
  if(e.kind==='fall'){
    let d='';for(const x of[-17,16,0])d+=line([e.origin[0]+x,e.origin[1]-28],[e.origin[0]+x-3,e.origin[1]-62-Math.abs(x)],1.8,'#947650');
    return `<g data-fall-streaks="true" opacity="${.35+.3*e.phase}">${d}</g>`;
  }
  if(e.kind==='landing'){
    let d='';for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*(18+e.phase*37),y=Math.sin(a)*(9+e.phase*20);d+=ellipse([e.origin[0]+x,e.origin[1]+y],[3*(1-e.phase)+1,2],'#b89048',0);}
    return `<g data-landing-particles="true" opacity="${1-e.phase}">${d}</g>`;
  }

  if (e.kind === "paperBurst") {
    let d = "",
      u = e.phase;
    for (let i = 0; i < 18; i++) {
      let a = i * 2.399,
        x = Math.cos(a) * (25 + 125 * u),
        y = Math.sin(a) * (30 + 110 * u) + 90 * u * u;
      d += group(
        [e.origin[0] + x, e.origin[1] + y],
        i * 31 + u * 300,
        1,
        path("M-8 -4 L8 -5 L7 6 L-7 5Z", "#faf8e8", 1, "#a9af99"),
      );
    }
    return `<g opacity="${1 - u}">${d}</g>`;
  }
  if(e.kind === "impact"){
    const u=e.phase, d=path("M0 -32 L10 -12 L33 -18 L22 2 L38 17 L14 19 L2 39 L-9 19 L-32 24 L-22 2 L-38 -12 L-13 -14Z","#ffdf57",2.2,"#bd5c36");
    let rays="";for(let i=0;i<7;i++){let a=i*Math.PI*2/7;rays+=line([Math.cos(a)*(40+u*20),Math.sin(a)*(40+u*20)],[Math.cos(a)*(55+u*48),Math.sin(a)*(55+u*48)],3,"#6c5540");}
    return `<g data-impact-accent="true" opacity="${Math.max(0,1-u)}">${group(e.origin,u*38,.65+u*.55,d+rays)}</g>`;
  }
  if (e.kind !== "stink") return "";
  let u = e.phase,
    p = lerp(e.origin, e.end, ease(u)),
    scale = (0.4 + ease(Math.min(1, u * 3)) * 1.3) * Math.max(0.8, e.amount),
    fade = Math.min(1, u * 9, (1 - u) * 4),
    d = "";
  for (const [x, y, r] of [
    [-25, 6, 24],
    [0, -7, 34],
    [30, 6, 27],
    [8, 22, 23],
  ])
    d += ellipse([x, y], [r, r * 0.85], "#adc274", 1.4, "#7e985a");
  d += path("M-17 4 Q-9 -13 3 -4 M8 15 Q21 -1 33 7", "none", 1, "#91a473");
  return (
    `<g opacity="${Math.max(0, fade) * 0.82}">` +
    group(p, Math.sin(t * 8) * 3, scale, d) +
    "</g>"
  );
}

// Text is restricted to physical labels by schema; escape again at the SVG boundary.
export function label(text, p, size=18, color=I) {
  let safe = String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
  return `<text data-scene-label="true" x="${p[0]}" y="${p[1]}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="${size}" fill="${color}">${safe}</text>`;
}
export function animal(a,s,t) {
  const cat=a.kind==="cat", lion=a.kind==="lion", dog=a.kind==="dog",
    sc=s.scale*(lion?1.4:cat?.85:1), skin=a.skin, f=s.facing,
    c=s.cower||0, bob=Math.abs(s.gait||0)*4,
    head=[66,-110+c*25-bob], face=s.face, startled=["shock","jawdrop"].includes(face),
    roar=s.roar||0;
  let d="";
  // Far legs are drawn behind the torso; paired feet remain on the ground in stance.
  const leg=(x,phase,far=false)=>{
    const q=((s.gaitPhase||0)/(2*Math.PI)+phase/(2*Math.PI))%1;
    const swing=s.gait ? (q<.62 ? 1-2*q/.62 : -1+2*ease((q-.62)/.38)) : 0, lift=s.gait && q>=.62 ? Math.sin(Math.PI*(q-.62)/.38)*23 : 0;
    return path(`M${x} ${-64+c*15} Q${x+swing*15} -32 ${x+swing*28} ${-lift}`,"none",cat?12:17,far?"#a28966":skin)+ellipse([x+swing*28+3,-lift],[cat?14:19,8],far?"#a28966":skin,1.8);
  };
  d+=leg(-51,Math.PI,true)+leg(43,0,true);
  d+=path(`M-82 -85 Q-40 ${-119+c*20} 37 -93 Q75 -69 48 ${-40+c*12} Q-4 ${-25+c*8} -70 -45Z`,skin,2.7);
  d+=path(`M-78 -77 Q-128 ${cat?-160:-108} -134 ${cat?-97:-63}`,"none",cat?11:14,skin);
  if(lion)d+=ellipse([-134,-63],[12,18],a.hair,2);
  if(a.pattern==="spots") for(const [x,y] of [[-50,-77],[-21,-68],[12,-82]]) d+=ellipse([x,y],[9,7],a.hair,0);
  if(cat) d+=path("M-56 -92 L-51 -69 M-35 -99 L-30 -78 M-14 -96 L-10 -77","none",4,a.hair);
  d+=leg(-65,0)+leg(30,Math.PI);
  if(s.press && s.pawTarget) {
    const target=[(s.pawTarget[0]-s.position[0])/(sc*f),(s.pawTarget[1]-s.position[1])/sc];
    d+=path(`M42 -72 Q70 -70 ${42+(target[0]-42)*s.press} ${-8+(target[1]+8)*s.press}`,"none",15,skin)+ellipse([42+(target[0]-42)*s.press,-8+(target[1]+8)*s.press],[18,9],skin,2);
  }
  let h="";
  if(lion) h+=path("M-55 -39 Q-76 -69 -48 -84 Q-42 -109 -16 -95 Q10 -117 31 -91 Q64 -91 60 -57 Q91 -37 63 -14 Q79 19 48 25 Q34 53 7 31 Q-22 53 -40 25 Q-76 17 -55 -12 Q-81 -26 -55 -39Z",a.hair,3);
  h+=cat?path("M-43 -26 L-44 -78 L-13 -49 Q8 -55 25 -43 L52 -75 L48 -14 Q55 29 7 34 Q-43 36 -43 -26Z",skin,2.4):ellipse([0,-14],[dog?46:43,46],skin,2.5);
  if(cat)h+=path("M-36 -61 L-20 -44 M35 -48 L44 -61","none",8,"#e8a49a");
  if(dog)h+=path("M-33 -49 Q-75 -69 -65 4 Q-45 29 -31 -20Z",a.hair,2.3)+path("M25 -51 Q61 -75 61 -6 Q42 22 34 -21Z",a.hair,2.3);
  const animalEye=face==="calm"?.4:1;
  h+=eye([-17,-22],[13,startled?23:17],eyeOpen(s,"left",animalEye),s.gaze||[0,2],a.id+"animalL")+eye([16,-25],[14,startled?24:18],eyeOpen(s,"right",animalEye),s.gaze||[0,2],a.id+"animalR");
  h+=ellipse([1,6],[26,18],"#f8e5ba",1.5)+path("M-7 0 L8 0 Q2 13 -7 0Z",I,1);
  h+=roar>.1?path(`M-21 20 Q0 5 23 20 L19 ${32+roar*39} Q0 ${45+roar*39} -20 ${32+roar*39}Z`,"#573a35",2)+path("M-15 19 L-9 34 L-3 19 M5 18 L12 33 L17 18","#fff8df",1):path(startled?"M-7 24 Q0 12 9 25 Q6 39 -5 35Z":"M-23 21 Q-10 33 0 19 Q12 34 24 20","none",2);
  if(cat)h+=path("M-15 9 L-48 1 M-16 17 L-51 21 M18 9 L52 0 M19 17 L55 22","none",1.3);
  if(face==="annoyed")h+=path("M-31 -48 L-7 -38 M5 -40 L31 -51","none",3);
  d+=group(head,s.headAngle||0,1,h);
  return group(s.position,s.bodyAngle||0,sc,`<g transform="scale(${f} ${1-.32*c})">${d}</g>`);
}


export function groundShadow(a,s) {
 if(s.shadow===false)return "";
 const animalRig=["dog","cat","lion"].includes(a.kind),height=Math.max(0,s.groundY-s.position[1]);
 return `<g data-ground-shadow="true">${ellipse([s.position[0],s.groundY+5],[(animalRig?95:60)*s.scale/(1+height/350),5*s.scale],"#dddcc4",0)}</g>`;
}

export function pencilFace(a,s,t) {
 const q=s.face,wide=["shock","jawdrop","idea"].includes(q),puff=q==="extreme"?22:q==="strain"?10:0,drop=q==="jawdrop"&&!s.coveredMouth?42:0,
 skin=s.red>.1?"#ead3aa":a.skin,female=["woman","grandma"].includes(a.kind),old=seniorFace(a),ink="#242a22";
 let d="";
 if(female && !["bob","bald"].includes(a.hairStyle))d+=ellipse([44,-65],[24,28],a.hair,2);
 d+=path(female?`M-48 -48 C-51 -95 42 -99 49 -50 L51 -9 Q64 24 43 48 Q24 ${76+drop} 0 ${79+drop} Q-29 ${76+drop} -45 48 Q-62 23 -50 -8Z`:`M-52 -48 C-55 -95 42 -105 51 -52 L54 -12 C${82+puff} -5 ${83+puff} 34 51 40 Q52 ${83+drop} 1 ${84+drop} Q-47 ${85+drop} -49 42 C${-84-puff} 38 ${-86-puff} 4 -55 -6Z`,skin,2.5,ink);
 d+=ellipse([-55,-13],[13,18],skin,2,ink)+ellipse([55,-14],[12,17],skin,2,ink);
 if(s.blush)d+=`<g opacity="${s.blush*.65}">${ellipse([-58,25],[19,12],"#d7896e",0)+ellipse([58,25],[19,12],"#d7896e",0)}</g>`;
 const hair=a.hairStyle|| (female?"bob":"tuft");
 if(hair==="sidepart")d+=path("M-51 -51 Q-52 -96 5 -93 Q46 -96 50 -54 L28 -72 Q-5 -56 -41 -68Z",a.hair,1.8,ink);
 else if(hair==="curly")d+=path("M-52 -58 C-73 -87 -49 -108 -32 -94 C-31 -123 0 -113 3 -97 C25 -116 53 -98 48 -72 L49 -57 Q1 -87 -52 -58Z",a.hair,2,ink);
 else if(hair==="bob")d+=path("M-55 -30 Q-76 -109 1 -103 Q70 -100 57 -27 L43 -61 Q5 -51 -43 -66Z",a.hair,2,ink);
 else if(hair==="ponytail")d+=path("M-51 -51 Q-58 -101 3 -101 Q58 -99 51 -50 Q76 -93 93 -44 Q99 -11 76 6 Q83 -35 51 -50 L33 -70 Q-3 -58 -51 -51Z",a.hair,2,ink);
 else if(hair!=="bald")d+=path("M-33 -79 Q-28 -104 -9 -87 Q1 -115 18 -88 Q33 -107 36 -79","none",2,ink);
 let op=["strain","extreme","laugh","cry"].includes(q)?.04:["smug","calm","defeat","annoyed"].includes(q)?.46:1;
 op=Math.min(op,blinkOpenness(a.id,t));
 const g=s.gaze||[5,2];
 d+=eye([-23,-35],[25,wide?36:31],eyeOpen(s,"left",op),g,a.id+"pL")+eye([23,-38],[27,wide?38:33],eyeOpen(s,"right",op),g,a.id+"pR");
 if(a.kind==="grandma"||a.accessory==="glasses")d+=ellipse([-23,-35],[28,27],"none",1.8)+ellipse([23,-38],[30,28],"none",1.8)+line([3,-35],[6,-36],2);
 const brows=controlledBrows(s,ink);
 d+=brows??path(["annoyed","strain","extreme"].includes(q)?"M-49 -72 L-6 -57 M7 -60 L47 -78":wide?"M-47 -81 Q-25 -105 -7 -82 M8 -85 Q27 -111 48 -86":"M-47 -74 Q-27 -90 -8 -76 M8 -79 Q28 -96 47 -81","none",2.5,ink);
 d+=female?path("M2 -9 Q-4 4 -1 10 Q8 17 16 8","none",1.8,ink):path("M-10 -5 Q-26 -1 -18 15 Q-9 23 2 16 Q16 27 30 14 Q37 1 25 -5 Q13 -13 3 -5Z",skin,2.1,ink)+ellipse([-9,13],[3,2],ink,0)+ellipse([23,12],[3,2],ink,0);
 let mouth=q==="jawdrop"?"M-39 26 Q0 10 39 25 L38 100 Q3 131 -39 100Z":q==="shock"?"M-10 30 Q4 15 18 29 Q28 72 3 75 Q-19 69 -10 30Z":["laugh","smug","confident"].includes(q)?"M-42 28 Q3 49 45 23 Q31 82 -9 78 Q-39 70 -42 28Z":(q==="talk"||s.speaking)?`M-31 28 Q5 18 34 28 L32 ${45+s.talk*30} Q0 ${75+s.talk*26} -32 ${45+s.talk*30}Z`:"";
 const customMouth=controlledMouth(s,q,ink,38);
 d+=`<g data-mouth-performance="true" >`;
 if(s.coveredMouth) {}
 else if(customMouth)d+=customMouth;
 else if(mouth){d+=`<defs><clipPath id="${a.id}pM"><path d="${mouth}"/></clipPath></defs>`+path(mouth,"#542e2a",2.1,ink)+`<g clip-path="url(#${a.id}pM)">`+path("M-47 23 L50 18 L44 40 Q0 51 -44 39Z","#fffbea",1)+ellipse([5,q==="jawdrop"?105:72],[27,13],"#ca7771",1)+"</g>";}
 else if(["strain","extreme","annoyed"].includes(q))d+=path(`M-38 32 Q0 ${26-puff*.6} 39 29 L36 54 Q0 ${64+puff*.2} -35 56Z`,"#fffbea",2,ink)+path("M-36 42 L37 41 M-20 31 L-18 57 M-1 28 L0 60 M18 29 L18 58","none",1,ink);
 else d+=path(q==="defeat"||q==="cry"?"M-34 53 Q3 28 36 49":"M-34 36 Q3 60 37 30","none",2,ink);
 d+="</g>";
 if(a.accessory==="moustache")d+=path("M-24 22 Q-11 11 0 20 Q15 10 29 21 Q17 36 1 27 Q-12 40 -24 22Z",a.hair,1);
 if(["strain","extreme","cry"].includes(q))d+=path("M-54 -39 Q-71 -17 -57 -10 Q-47 -8 -54 -39Z","#81bfc5",1);
 d+=ageLines(a,ink);
 const fx=a.faceShape==="long"?.9:a.faceShape==="square"?1.12:1,fy=a.faceShape==="long"?1.08:1;
 return `<g data-pencil-face="true" transform="scale(${s.facing*a.headWidth*fx} ${a.headHeight*fy})">${d}</g>`;
}

// Original coloured dialogue-cast face. Shares rig geometry, not reference artwork.
export function toonFace(a,s,t){
 const ink="#302a2c",q=s.face,skin=a.skin,female=["woman","grandma"].includes(a.kind),wide=["shock","jawdrop","idea"].includes(q),angry=["annoyed","strain","extreme"].includes(q);
 const fx=a.faceShape==="long"?.86:a.faceShape==="square"?1.1:1,fy=a.faceShape==="long"?1.12:1;
 let d=path(female&&a.faceShape!=="square"?"M-49 -54 C-38 -99 43 -102 52 -48 Q64 6 47 48 Q25 82 0 80 Q-30 78 -47 48 Q-61 6 -49 -54Z":a.faceShape==="square"?"M-53 -54 Q-54 -91 0 -91 Q54 -91 54 -54 L56 39 Q55 73 26 80 L-27 80 Q-57 69 -55 37Z":"M-52 -54 C-41 -107 47 -105 57 -49 Q73 9 52 55 Q35 89 -9 81 Q-63 76 -60 21Z",skin,2.8,ink);
 d+=ellipse([-57,2],[12,18],skin,2,ink)+path("M-61 -4 Q-48 -12 -51 8","none",1.4,ink);
 const hair={tuft:"M-48 -62 Q-37 -100 -22 -85 L-13 -107 L0 -88 L14 -106 L25 -86 L42 -94 L50 -62 Q8 -75 -48 -62Z",curly:"M-52 -46 Q-79 -61 -58 -82 Q-65 -104 -38 -99 Q-30 -124 -5 -107 Q13 -126 30 -105 Q60 -110 57 -84 Q80 -65 52 -45 L35 -73 Q-7 -58 -52 -46Z",sidepart:"M-54 -49 Q-64 -105 5 -101 Q62 -100 57 -48 L36 -75 Q4 -58 -43 -70Z",bob:"M-56 -13 Q-80 -105 0 -107 Q78 -109 61 -5 L42 -59 Q5 -56 -41 -72Z",ponytail:"M-54 -50 Q-60 -103 0 -104 Q64 -100 54 -48 Q78 -101 98 -42 L76 -20 Q70 -68 51 -49 L28 -73 Q-8 -56 -54 -50Z",bald:"M-29 -82 Q-17 -98 -5 -85 M21 -84 L31 -75"};
 d+=path(hair[a.hairStyle||(["woman","grandma"].includes(a.kind)?"bob":"tuft")],a.hairStyle==="bald"?"none":a.hair,2,ink);
 let op=["laugh","strain","extreme","cry"].includes(q)?.03:["calm","smug","defeat"].includes(q)?.6:1;
 op=Math.min(op,blinkOpenness(a.id,t));
 d+=eye([-23,-26],[21,wide?32:27],eyeOpen(s,"left",op),s.gaze||[5,2],a.id+"tL")+eye([22,-28],[23,wide?34:29],eyeOpen(s,"right",op),s.gaze||[5,2],a.id+"tR");
 const brows=controlledBrows(s,ink);
 d+=brows??path(angry?"M-46 -61 L-5 -49 M8 -51 L46 -66":wide?"M-46 -74 Q-26 -96 -7 -73 M9 -76 Q31 -100 50 -76":"M-44 -63 Q-24 -81 -7 -65 M10 -67 Q32 -86 49 -67","none",2.7,ink);
 d+=path("M5 -5 Q21 -7 21 5 Q13 17 1 8","none",2,ink);
 if(a.accessory==="glasses"||a.kind==="grandma")d+=path("M-50 -48 L-1 -48 L-1 -10 L-48 -10Z M6 -50 L53 -50 L53 -11 L6 -11Z M-1 -37 L6 -37","none",2,ink);
 const speaking=s.speaking||q==="talk",opening=speaking?(s.talk||0):q==="jawdrop"?1:q==="shock"?.8:q==="laugh"?.7:0;
 const customMouth=controlledMouth(s,q,ink,39);
 if(customMouth)d+=customMouth;
 else if(opening>.05)d+=path(`M-25 31 Q5 17 33 29 Q35 ${42+opening*40} 3 ${48+opening*40} Q-28 ${48+opening*30} -25 31Z`,"#582e34",2,ink)+path("M-20 30 Q5 23 29 29 L24 40 Q1 45 -19 39Z","#fff9e4",.8,ink)+ellipse([4,48+opening*28],[15,6],"#ce7c7d",0);
 else d+=path(angry||q==="defeat"?"M-24 43 Q2 21 31 39":q==="kiss"?"M-6 33 Q5 22 13 34 Q8 45 -4 40":"M-25 31 Q4 53 33 27","none",2.1,ink);
 if(a.accessory==="moustache")d+=path("M-29 22 Q-12 8 0 20 Q17 7 34 21 Q20 39 0 29 Q-16 42 -29 22Z",a.hair,1.2,ink);
 if(s.sweat>0){for(let i=0;i<3;i++){const y=-52+((t*34+i*29)%85);d+=`<g opacity="${s.sweat*.85}">${path(`M${48+i*8} ${y} q-13 22 0 24 q12 -4 0 -24Z`,"#73becd",1,"#3e819a")}</g>`;}}
 d+=ageLines(a,ink);
 return `<g data-toon-face="true" transform="scale(${s.facing*a.headWidth*fx} ${a.headHeight*fy})">${d}</g>`;
}


// Original asymmetric ink character: independently shaped cheeks, jaw and eyes.
// Absolute-time sampling keeps random seeks and parallel export identical.
// Hash the full identity: equally long names must not blink in lockstep.
export function blinkOpenness(id, time) {
 let seed=2166136261;
 for(const char of String(id))seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
 const period=3.2+(seed%1700)/1000,phase=(seed%1009)/1009*period;
 const age=((time+phase)%period+period)%period;
 if(age>=.18)return 1;
 return age<.065?lerp(1,.025,ease(age/.065)):lerp(.025,1,ease((age-.065)/.115));
}

export function elasticFace(a,s,t){
 const ink='#20251f',skin=a.skin,q=s.face;
 const wide=['shock','jawdrop','idea'].includes(q),angry=['annoyed','strain','extreme'].includes(q),female=['woman','grandma'].includes(a.kind);
 const jaw=q==='jawdrop'?35:q==='shock'?12:0,cheek=angry?12:0;
 let d=path(`M-52 -57 C-40 -103 41 -100 54 -58 Q68 -32 53 -5 Q${79+cheek} 13 53 37 L48 ${67+jaw} Q8 ${91+jaw} -40 ${72+jaw} Q-60 54 -52 27 Q-79 11 -56 -10 Q-66 -37 -52 -57Z`,skin,3,ink);
 d+=ellipse([-57,1],[14,19],skin,2.5,ink)+path('M-62 -3 Q-48 -11 -51 10','none',1.7,ink);
 const hair=a.hairStyle||(female?'bob':'tuft');
 if(hair==='sidepart')d+=path('M-55 -55 Q-61 -103 3 -99 Q52 -102 55 -54 L32 -74 Q-4 -57 -43 -71Z',a.hair,2.6,ink);
 else if(hair==='curly')d+=path('M-55 -58 C-80 -80 -54 -111 -36 -97 C-37 -123 -5 -117 0 -99 C24 -122 57 -104 52 -76 L54 -58 Q1 -83 -55 -58Z',a.hair,2.6,ink);
 else if(hair==='bob')d+=path('M-57 -26 Q-80 -109 0 -105 Q78 -104 61 -17 L45 -64 Q5 -53 -43 -73Z',a.hair,2.6,ink);
 else if(hair!=='bald')d+=path('M-36 -79 Q-44 -109 -15 -88 Q0 -120 15 -88 Q39 -109 43 -74','none',3,ink);
 if(a.hairStyle==='ponytail')d+=path('M51 -62 Q103 -111 94 -22 L69 -3 Q83 -53 51 -62Z',a.hair,2.6,ink);
 const op=angry?.2:['smug','calm','defeat'].includes(q)?.48:1;
 const blink=wide?op:Math.min(op,blinkOpenness(a.id,t));
 d+=eye([-23,-35],[26,wide?43:34],eyeOpen(s,'left',blink),s.gaze||[5,2],a.id+'eL')+eye([25,-39],[29,wide?45:36],eyeOpen(s,'right',blink),s.gaze||[5,2],a.id+'eR');
 if(female)d+=path('M-49 -56 L-57 -66 M49 -62 L59 -72','none',2.5,ink);
 d+=controlledBrows(s,ink)??path(angry?'M-51 -79 L-3 -62 M7 -65 L53 -87':wide?'M-50 -86 Q-25 -120 -4 -91 M9 -93 Q32 -122 54 -93':'M-48 -80 Q-27 -96 -7 -82 M9 -85 Q30 -102 52 -88','none',3,ink);
 d+=path(female?'M-2 -9 Q-11 13 9 13 Q24 9 12 0':'M-9 -9 Q-34 -6 -24 14 Q-8 28 6 14 Q31 26 37 8 Q40 -10 16 -12Z',skin,2.5,ink);
 const named=q==='jawdrop'?1:q==='shock'?.8:q==='laugh'?.65:0;
 const aperture=Math.max(0,Math.min(1,s.mouthAperture??s.mouthOpen??named));
 if(!s.coveredMouth){
  if(angry&&s.mouthAperture===undefined&&s.mouthOpen===undefined&&s.mouthCurve===undefined){
   d+=`<g data-elastic-teeth="true">${path('M-36 31 Q0 22 38 29 L35 54 Q0 63 -34 55Z','#fff8df',2.4,ink)+path('M-34 42 L36 41 M-18 29 L-17 56 M1 26 L1 59 M20 28 L19 56','none',1.1,ink)}</g>`;
  }else if(['jawdrop','shock'].includes(q)&&aperture>.025&&(s.mouthCurve===undefined||s.mouthCurve===0)){
   const center=48+jaw*.6,rx=(q==='jawdrop'?23:17)*(s.mouthWidth??1),ry=8+aperture*35;
   d+=ellipse([4,center],[rx,ry],'#542e2a',2.5,ink)+ellipse([6,center+ry*.65],[rx*.55,ry*.18],'#c98170',0);
  }else d+=controlledMouth({...s,mouthWidth:s.mouthWidth??(wide?1.3:1.15),mouthAperture:aperture},q,ink,36+jaw*.25,100);
 }
 if(q==='jawdrop')d+=path(`M-42 ${77+jaw} Q0 ${90+jaw} 39 ${76+jaw}`,'none',1.6,ink);
 if(angry)d+=path('M-49 20 L-35 26 M43 19 L54 24','none',2,ink);
 if(s.blush)d+=`<g opacity="${s.blush*.6}">${ellipse([-44,26],[15,8],'#c98170',0)+ellipse([45,24],[15,8],'#c98170',0)}</g>`;
 if(s.sweat>0){
  const amount=clamp(s.sweat);
  d+=`<g data-elastic-sweat="true" opacity="${n(amount*.85)}">`;
  for(let i=0;i<3;i++){
   const x=63+i*9,y=-55+((t*42+i*27)%90+90)%90;
   d+=path(`M${x} ${n(y)} q-10 17 0 20 q10 -3 0 -20Z`,'#83b9bf',1.3,'#477c80');
  }
  d+='</g>';
 }
 if(a.accessory==='glasses')d+=ellipse([-23,-35],[29,30],'none',2,ink)+ellipse([25,-39],[31,32],'none',2,ink);
 if(a.accessory==='moustache')d+=path('M-24 24 Q-7 10 3 22 Q18 9 33 23 Q14 39 3 28 Q-9 42 -24 24Z',a.hair,1.5,ink);
 d+=ageLines(a,ink);
 const fx=a.faceShape==='long'?.88:a.faceShape==='square'?1.12:1,fy=a.faceShape==='long'?1.1:1;
 return `<g data-elastic-face="true" transform="scale(${s.facing*a.headWidth*fx} ${a.headHeight*fy})">${d}</g>`;
}
