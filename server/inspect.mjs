import {samplePart} from "../shared/part-motion.mjs";
import {compileSceneGraph} from "../shared/scene-graph.mjs";
import {performanceTrack} from "../shared/motion-ir.mjs";
import { createHash } from "node:crypto";
import { validatePlan, durationOf } from "../shared/schema.mjs";
import { evaluate, svgFrameAtFrame } from "../renderer/engine.mjs";
import { secondsToFrame } from "../shared/frame-clock.mjs";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
export function planHash(input) {
  let p = validatePlan(input);
  delete p.review;
  delete p.storyId;
  // Point 8 replay metadata is derived bookkeeping and must not invalidate
  // existing Point 7 review hashes. User-authored asset/rig fields remain in
  // the semantic hash.
  delete p.schemaVersion;
  delete p.seed;
  delete p.provenance;
  delete p.generatedAssetRefs;
  delete p.replay;
  const stripElementIds = (nodes) => { for (const node of nodes || []) { delete node.id; stripElementIds(node.children); } };
  for(const design of p.propDesigns)stripElementIds(design.nodes);
  for (const s of p.scenes) {
    delete s.sceneSeed;
    delete s.canonicalFrame;
    stripElementIds(s.backgroundNodes);
    for(const c of s.cast)delete c.id;
    for(const placement of s.props){
      delete placement.id;
      if(placement.attachment)delete placement.attachment.id;
      for(const event of placement.attachmentEvents||[]){delete event.id;if(event.attachment)delete event.attachment.id;}
    }
    for(const motion of s.motions)delete motion.id;
    for(const action of s.beats)delete action.id;
    for(const shot of s.shots)delete shot.id;
    for(const cue of s.sounds)delete cue.id;
    for(const line of s.dialogue)delete line.id;
    for (const v of [...s.dialogue,...s.sounds]) { delete v.audioDuration; delete v.mouthCues; }
  }
  return createHash("sha256").update(JSON.stringify(canonical(p))).digest("hex");
}

const RIG_PROFILE = Object.freeze({
  man: "sticklaugh.rig.humanoid-man.v2",
  woman: "sticklaugh.rig.humanoid-woman.v2",
  grandma: "sticklaugh.rig.humanoid-grandma.v2",
  child: "sticklaugh.rig.humanoid-child.v2",
  dog: "sticklaugh.rig.animal-dog.v1",
  cat: "sticklaugh.rig.animal-cat.v1",
  lion: "sticklaugh.rig.animal-lion.v1",
});
const ACTION_AFFORDANCE = Object.freeze({
  pick: "grip",
  place: "grip",
  throw: "throw",
  drink: "drink-from",
  open: "open",
  openDoor: "open",
  pullPaper: "pull",
  tearFree: "tear",
  wrap: "attach",
  sit: "sit-on",
});

function outputHash(svg) {
  return createHash("sha256").update(svg).digest("hex");
}

function startFrameFor(scene, time, fps) {
  return Math.max(
    scene.canonicalFrame.startFrame,
    scene.canonicalFrame.startFrame + secondsToFrame(time, fps, "ceil") - 1,
  );
}

function capabilityFor(character, prop) {
  const animal = ["dog", "cat", "lion"].includes(character.kind);
  const rigCapabilities = character.rigRequirement?.capabilities?.length
    ? character.rigRequirement.capabilities
    : animal
      ? ["sticklaugh.motion.animal-controls.v1", "sticklaugh.motion.animal-face-controls.v1", "sticklaugh.motion.path-following.v1"]
      : ["sticklaugh.motion.humanoid-pose.v1", "sticklaugh.motion.face-controls.v1", "sticklaugh.motion.hand-shapes.v1", "sticklaugh.motion.path-following.v1", "sticklaugh.motion.ground-constraint.v1"];
  return {
    rig: character.rigRequirement?.profile || RIG_PROFILE[character.kind],
    rigCapabilities,
    requiredAppearanceFeatures: character.requiredAppearanceFeatures || [],
    asset: prop
      ? prop.assetCapabilities?.length
        ? prop.assetCapabilities
        : [`sticklaugh.shape.${prop.type}.v1`]
      : [],
    requestedVisualFeatures: prop?.visualAssetRequest?.requiredFeatures || [],
    objectAffordances: prop?.objectAffordances || [],
    contactEventIds: prop?.contactEventIds || [],
    rightsStatus: prop?.rightsStatus || "unknown",
    optionalSourceAsset: prop?.optionalSourceAsset
      ? {
          assetId: prop.optionalSourceAsset.assetId,
          sha256: prop.optionalSourceAsset.sha256,
          mediaType: prop.optionalSourceAsset.mediaType,
        }
      : null,
    visualEvidence: [
      ...(character.visualEvidence || []),
      ...(prop?.visualEvidence || []),
    ],
  };
}

function nounTokens(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function propMentionedIn(text, prop) {
  const eventTokens = new Set(nounTokens(text));
  const identityTokens = nounTokens(prop.id);
  return identityTokens.some((token) =>
    eventTokens.has(token) || eventTokens.has(`${token}s`),
  );
}

/**
 * Maps each declared story event and fidelity requirement to a registered
 * renderer capability, a concrete beat, a canonical frame, and a check against
 * the SVG actually emitted by the renderer. This is deterministic and offline.
 */
export function compileCoverageReport(input) {
  const plan = validatePlan(input);
  const fps = plan.renderFps || 30;
  const events = [];
  const issues = [];
  const pushIssue = (code, sceneId, message, time) =>
    issues.push({ code, sceneId, message, ...(time === undefined ? {} : { time }) });
  const sample = (scene, time, actorId, propId, baselineFrame) => {
    const startFrame = scene.canonicalFrame.startFrame;
    const lastFrame = scene.canonicalFrame.endFrame - 1;
    const frame = Math.max(startFrame, Math.min(lastFrame, startFrame + secondsToFrame(time, fps, "ceil")));
    const previousFrame = Math.max(startFrame, Math.min(frame - 1, baselineFrame ?? frame - 1));
    const svg = svgFrameAtFrame(plan, frame);
    const previous = svgFrameAtFrame(plan, previousFrame);
    const actorVisible = !actorId || svg.includes(`data-actor-id="${actorId}"`);
    const propVisible = !propId || svg.includes(`data-prop-id="${propId}"`);
    const frameChanged = frame !== previousFrame && svg !== previous;
    return {
      frame,
      actorVisible,
      propVisible,
      frameChanged,
      outputSha256: outputHash(svg),
    };
  };

  for (const coverage of plan.coverage) {
    const scene = plan.scenes.find((item) => item.id === coverage.sceneId);
    const indices = coverage.beatIndices || [];
    if (!indices.length) {
      pushIssue("coverage-missing-beat", scene.id, `Story event has no animation primitive: ${coverage.storyEvent}`);
      continue;
    }
    const mentionedProps = scene.props
      .map((placement) => plan.propDesigns.find((item) => item.id === placement.designId))
      .filter((prop) => prop && propMentionedIn(coverage.storyEvent, prop));
    for (const prop of mentionedProps) {
      let matched = null;
      for (const index of indices) {
        const beat = scene.beats[index];
        if (!beat) continue;
        const time = Math.min(scene.duration - 1 / fps, beat.start + beat.duration * 0.6);
        const visible = sample(scene, time, null, prop.id, startFrameFor(scene, beat.start, fps));
        if (visible.propVisible) {
          matched = { beat, time, visible };
          break;
        }
      }
      if (!matched)
        pushIssue("coverage-asset-not-visible", scene.id, `Material story object ${prop.id} is not visible in any mapped timeline moment: ${coverage.storyEvent}`);
      else {
        const actor = plan.characters.find((item) => item.id === matched.beat.actorId);
        events.push({
          source: "story-asset",
          storyEvent: coverage.storyEvent,
          materialNouns: [prop.name],
          materialVerb: matched.beat.kind,
          entityIds: [prop.id],
          assetRigCapability: capabilityFor(actor, prop),
          animationPrimitive: matched.beat.kind,
          timelineMoment: {
            sceneId: scene.id,
            sceneTime: matched.time,
            frame: matched.visible.frame,
            fps,
          },
          visibleOutputCheck: {
            propVisible: matched.visible.propVisible,
            outputSha256: matched.visible.outputSha256,
          },
        });
      }
    }
    for (const index of indices) {
      const beat = scene.beats[index];
      if (!beat) {
        pushIssue("coverage-unknown-beat", scene.id, `Story event points to missing beat ${index}: ${coverage.storyEvent}`);
        continue;
      }
      const character = plan.characters.find((item) => item.id === beat.actorId);
      const prop = beat.targetId
        ? plan.propDesigns.find((item) => item.id === beat.targetId)
        : null;
      const time = Math.min(scene.duration - 1 / fps, beat.start + beat.duration * 0.6);
      const visible = sample(
        scene,
        time,
        beat.actorId,
        prop ? prop.id : null,
        startFrameFor(scene, beat.start, fps),
      );
      const capability = capabilityFor(character, prop);
      if (!visible.actorVisible)
        pushIssue("coverage-actor-not-visible", scene.id, `Renderer output does not contain actor ${beat.actorId} for: ${coverage.storyEvent}`, time);
      const hasPhysicalDrawing = prop && (prop.type !== "drawing" || prop.nodes.length > 0)
        && !/contact marker|invisible/i.test(`${prop.id} ${prop.name}`);
      if (hasPhysicalDrawing && !visible.propVisible)
        pushIssue("coverage-prop-not-visible", scene.id, `Renderer output does not contain prop ${prop.id} for: ${coverage.storyEvent}`, time);
      if (beat.kind!=="idle" && !visible.frameChanged)
        pushIssue("coverage-no-visible-change", scene.id, `No frame-to-frame visual change is measurable for ${beat.kind}: ${coverage.storyEvent}. An establishing state may use idle; a physical action requires changing poses or parts.`, time);
      const affordance = ACTION_AFFORDANCE[beat.kind];
      if (prop?.objectAffordances?.length && affordance && !prop.objectAffordances.includes(affordance))
        pushIssue("coverage-affordance-missing", scene.id, `Prop ${prop.id} does not declare the ${affordance} affordance required by ${beat.kind}.`, time);
      for (const evidence of capability.visualEvidence.filter((item) => item.eventId === beat.id)) {
        if (evidence.frame !== visible.frame || evidence.outputSha256 !== visible.outputSha256)
          pushIssue("coverage-stale-visual-evidence", scene.id, `Stored visual evidence does not match the rendered frame for ${beat.kind}.`, time);
      }
      events.push({
        source: "coverage",
        storyEvent: coverage.storyEvent,
        materialNouns: [
          character?.name,
          prop?.name,
        ].filter(Boolean),
        materialVerb: beat.kind,
        entityIds: [beat.actorId, ...(prop ? [prop.id] : [])],
        assetRigCapability: capability,
        animationPrimitive: beat.kind,
        timelineMoment: {
          sceneId: scene.id,
          sceneTime: time,
          frame: visible.frame,
          fps,
        },
        visibleOutputCheck: {
          actorVisible: visible.actorVisible,
          propVisible: hasPhysicalDrawing ? visible.propVisible : null,
          frameChanged: visible.frameChanged,
          outputSha256: visible.outputSha256,
        },
      });
    }
  }

  for (const [index, requirement] of (plan.requirements || []).entries()) {
    const scene = plan.scenes.find((item) => item.id === requirement.sceneId);
    const character = requirement.characterId
      ? plan.characters.find((item) => item.id === requirement.characterId)
      : scene.cast[0] && plan.characters.find((item) => item.id === scene.cast[0].characterId);
    const prop = requirement.propId
      ? plan.propDesigns.find((item) => item.id === requirement.propId)
      : null;
    const beat = scene.beats.find((item) =>
      (!requirement.action || item.kind === requirement.action)
      && (!requirement.characterId || item.actorId === requirement.characterId)
      && (!requirement.propId || item.targetId === requirement.propId),
    );
    const time = beat
      ? Math.min(scene.duration - 1 / fps, beat.start + beat.duration * 0.6)
      : prop?.type && requirement.worn
        ? 0
        : 0;
    const visible = sample(
      scene,
      time,
      character?.id || null,
      prop?.id || null,
      beat ? startFrameFor(scene, beat.start, fps) : undefined,
    );
    const hasPhysicalDrawing = prop && (prop.type !== "drawing" || prop.nodes.length > 0)
      && !/contact marker|invisible/i.test(`${prop.id} ${prop.name}`);
    if (requirement.action && !beat)
      pushIssue("requirement-missing-primitive", scene.id, `Required verb has no matching animation primitive: ${requirement.description}`);
    if (character && !visible.actorVisible)
      pushIssue("requirement-actor-not-visible", scene.id, `Required character is absent from the actual renderer frame: ${requirement.description}`, time);
    if (hasPhysicalDrawing && !visible.propVisible)
      pushIssue("requirement-asset-not-visible", scene.id, `Required prop is absent from the actual renderer frame: ${requirement.description}`, time);
    if (requirement.action && beat && !visible.frameChanged)
      pushIssue("requirement-no-visible-change", scene.id, `Required action has no measurable visible frame change: ${requirement.description}`, time);
    events.push({
      source: "requirement",
      checkId: `requirement_${index + 1}`,
      storyEvent: requirement.description,
      materialNouns: [character?.name, prop?.name].filter(Boolean),
      materialVerb: requirement.action || (requirement.worn ? "head-attachment" : null),
      entityIds: [character?.id, prop?.id].filter(Boolean),
      assetRigCapability: character ? capabilityFor(character, prop) : null,
      animationPrimitive: beat?.kind || (requirement.worn ? "attachment/head" : null),
      timelineMoment: {
        sceneId: scene.id,
        sceneTime: time,
        frame: visible.frame,
        fps,
      },
      visibleOutputCheck: {
        actorVisible: visible.actorVisible,
        propVisible: hasPhysicalDrawing ? visible.propVisible : null,
        frameChanged: visible.frameChanged,
        outputSha256: visible.outputSha256,
      },
    });
  }

  return {
    schemaVersion: 1,
    fps,
    generatedAssetRefs: plan.generatedAssetRefs.map((asset) => ({
      assetId: asset.assetId,
      sha256: asset.sha256,
      mediaType: asset.mediaType,
      rightsStatus: asset.rightsStatus,
    })),
    events,
    issues,
    ok: issues.length === 0,
  };
}
function movingHookParts(plan,scene,hook){
 const find=(nodes,id)=>{for(const n of nodes||[]){if(n.id===id)return n;const result=find(n.children,id);if(result)return result;}return null;};
 return (hook.partRefs||[]).filter(ref=>{
  const design=[...plan.characters,...plan.propDesigns].find(d=>d.id===ref.entityId),spec=design?.visualSpec;
  const node=find(['geometryRecipe','facialComponents','apparel','accessories','decorativeMarks'].flatMap(k=>spec?.[k]||[]),ref.nodeId);
  if(!node||node.kind!=='group'||!node.children?.length)return false;
  const times=[0,.13,.37,.67,.91].map(f=>hook.start+(hook.end-hook.start)*f);
  const samples=times.map(t=>samplePart(node,t,scene.id));
  return samples.some(s=>JSON.stringify([s.position,s.rotation,s.scale,s.opacity])!==JSON.stringify([samples[0].position,samples[0].rotation,samples[0].scale,samples[0].opacity]));
 });
}
function hookPartVisible(plan,scene,hook,ref){
 const t=hook.start+(hook.end-hook.start)*.5,shot=scene.shots.find(q=>t>=q.start&&t<q.end);if(!shot||shot.detail==='hands')return false;
 const state=evaluate(scene,t,plan.propDesigns),u=Math.max(0,Math.min(1,(t-shot.start)/(shot.end-shot.start))),f=u*u*(3-2*u);
 const land=plan.format==='landscape',square=plan.format==='square',w=land?960:540,height=land||square?540:960;
 const zoom=(shot.zoom+((shot.endZoom??shot.zoom)-shot.zoom)*f)*(land?.73:square?.72:1),focus=shot.focus.map((v,i)=>v+((shot.endFocus||shot.focus)[i]-v)*f);
 const graph=compileSceneGraph({plan,scene,time:t,...state,shot,camera:{focus,zoom}}),entity=graph.entities.find(e=>['prop','character'].includes(e.category)&&e.sourceId===ref.entityId);
 if(!entity?.visible)return false;const b=entity.bounds,x=w/2+(b.x-focus[0])*zoom,y=height*(land?.51:.52)+(b.y-focus[1])*zoom;
 return x+b.width*zoom>0&&x<w&&y+b.height*zoom>0&&y<height;
}
// Deterministic geometry/timeline checks. This is not a learned visual-quality score.
export function inspectPlan(input, { requireCoverage = false } = {}) {
  const p = validatePlan(input),
    issues = [],
    seen = new Set();
  let samples = 0;
  const add = (severity, code, sceneId, message, time) => {
    let key = sceneId + code + message;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      severity,
      code,
      sceneId,
      message,
      ...(time !== undefined ? { time: +time.toFixed(2) } : {}),
    });
  };
  const coverageReport = requireCoverage ? compileCoverageReport(p) : null;
  if (p.provenance?.origin !== "legacy-migration")
    for (const issue of coverageReport?.issues || [])
      add("error", issue.code, issue.sceneId, issue.message, issue.time);
  let hookReport = {
    required: !!p.humorProfile,
    present: !!p.hook,
    timingPassed: false,
    visiblePassed: false,
    meaning: "Timing and framing checks do not prove that a joke is funny.",
  };
  if (p.humorProfile && !p.hook)
    add(
      "error",
      "missing-hook",
      p.scenes[0].id,
      "A visual hook in the first three seconds is required.",
    );
  if (p.hook) {
    let h = p.hook,
      s = p.scenes[0],
      indices = h.beatIndices || [];
    if (!indices.length)
      add(
        requireCoverage ? "error" : "warning",
        "unlinked-hook",
        s.id,
        "Hook must link concrete opening beats.",
      );
    let meaningful = indices
      .map((i) => s.beats[i])
      .filter(
        (b) =>
          b &&
          !["idle", "talk"].includes(b.kind) &&
          b.start < h.end &&
          b.start + b.duration > h.start,
      );
    const movingParts=movingHookParts(p,s,h);
    hookReport.timingPassed = meaningful.length > 0||movingParts.length>0;
    if ((indices.length||h.partRefs?.length) && !meaningful.length&&!movingParts.length)
      add(
        "error",
        "late-hook",
        s.id,
        "The linked hook action is static or happens after the opening deadline.",
      );
    let shown = movingParts.filter(ref=>hookPartVisible(p,s,h,ref)).length;
    for (const b of meaningful) {
      let t = Math.min(h.end - 0.01, b.start + b.duration * 0.55),
        q = s.shots.find((q) => t >= q.start && t < q.end),
        a = evaluate(s, t, p.propDesigns).states[b.actorId];
      let land = p.format === "landscape",
        square = p.format === "square",
        w = land ? 960 : 540,
        height = land || square ? 540 : 960,
        u = Math.max(0, Math.min(1, (t - q.start) / (q.end - q.start))),
        smooth = u * u * (3 - 2 * u),
        z =
          (q.zoom +
            (q.endZoom === undefined ? 0 : (q.endZoom - q.zoom) * smooth)) *
          (land ? 0.73 : square ? 0.72 : 1),
        focus = q.focus.map(
          (v, i) => v + ((q.endFocus || q.focus)[i] - v) * smooth,
        ),
        head = [
          a.position[0] + a.head[0] * a.scale,
          a.position[1] + a.head[1] * a.scale,
        ],
        screen = [
          w / 2 + (head[0] - focus[0]) * z,
          height * (land ? 0.51 : 0.52) + (head[1] - focus[1]) * z,
        ];
      if (
        (!q.actorIds || q.actorIds.includes(b.actorId)) &&
        q.detail !== "hands" &&
        screen[0] > -20 &&
        screen[0] < w + 20 &&
        screen[1] > -20 &&
        screen[1] < height + 20
      )
        shown++;
    }
    hookReport.visiblePassed = shown > 0;
    if ((meaningful.length||movingParts.length) && !shown)
      add(
        "error",
        "hidden-hook",
        s.id,
        "Opening actor/problem is outside the camera or hidden by a hands-only shot.",
      );
  }
  for (const s of p.scenes) {
    for (const c of p.coverage.filter((c) => c.sceneId === s.id))
      if (!c.beatIndices?.length)
        add(
          requireCoverage ? "error" : "warning",
          "unlinked-event",
          s.id,
          "Story event needs concrete beat indices: " + c.storyEvent,
        );
    if (!p.coverage.some((c) => c.sceneId === s.id))
      add(
        "warning",
        "unmapped-scene",
        s.id,
        "Scene has no mapped story event.",
      );
    for (const m of s.motions)
      for (const n of s.motions)
        if (
          m !== n &&
          m.targetId === n.targetId &&
          m.start < n.start &&
          m.start + m.duration > n.start + 0.01
        )
          add(
            "error",
            "overlapping-motion",
            s.id,
            "Two motions control " + m.targetId + " simultaneously.",
            n.start,
          );
    for (const b of s.beats) {
      if (["walk", "run", "place"].includes(b.kind) && !b.to)
        add(
          "error",
          "missing-destination",
          s.id,
          b.kind + " requires a destination: " + b.intent,
          b.start,
        );
      for (const m of s.motions)
        if (
          m.targetId === b.targetId &&
          ["pick", "place", "open", "throw"].includes(b.kind) &&
          Math.max(m.start, b.start) <
            Math.min(m.start + m.duration, b.start + b.duration)
        )
          add(
            "error",
            "ownership-conflict",
            s.id,
            "A moving prop also has a hand ownership action: " + b.targetId,
            b.start,
          );
      const shot = s.shots.find(
        (q) =>
          b.start + b.duration * 0.6 >= q.start &&
          b.start + b.duration * 0.6 < q.end,
      );
      if (shot?.actorIds && !shot.actorIds.includes(b.actorId))
        add(
          [
            "swat",
            "drink",
            "pick",
            "place",
            "open",
            "tap",
            "pullPaper",
            "openDoor",
          ].includes(b.kind)
            ? "error"
            : "warning",
          "hidden-action",
          s.id,
          "Camera excludes the actor doing: " + b.intent,
          b.start,
        );
    }
    let times = new Set();
    for (let t = 0; t < s.duration; t += 0.125) times.add(t);
    for (const b of s.beats) {
      for (const f of [0.42,0.5,0.64, 0.8, 0.999,...(b.kind==="perform"?performanceTrack(s,b).keyframes||[]:[]).map(k=>k.at),...(b.contactAt===undefined?[]:[b.contactAt])]) times.add(Math.min(s.duration,b.start + b.duration * f));
    }
    for (let t of [...times].sort((a, b) => a - b)) {
      samples++;
      const { states, props } = evaluate(s, t, p.propDesigns);
      for (const [id, a] of Object.entries(states)) {
        if (
          [
            ...a.position,
            ...a.head,
            ...a.leftHand,
            ...a.rightHand,
            ...a.gaze,
          ].some((v) => !Number.isFinite(v))
        )
          add("error", "nonfinite-rig", s.id, "Invalid geometry for " + id, t);
        for(const b of s.beats.filter(b=>b.actorId===id && ["perform","punch","scold"].includes(b.kind) && t>=b.start && t<=b.start+b.duration)){
          const error=Math.max(a.reachError.left,a.reachError.right);
          if(error>24)add("error","unreachable-performance",s.id,`${id} performance pose exceeds arm reach (${Math.round(error)}px). Move the hand or body; do not stretch bones.`,t);
        }
        for (const b of s.beats.filter(
          (b) =>
            b.actorId === id &&
            t >= b.start + b.duration * (b.kind === "swat" ? 0.63 : 0.65) &&
            t < b.start + b.duration,
        )) {
          if (
            [
              "drink",
              "pick",
              "place",
              "reach",
              "hold",
              "struggle",
              "tap",
              "open",
              "swat",
              "pullPaper",
              "openDoor",
            ].includes(b.kind)
          ) {
            const hand = b.hand === "left" ? "left" : "right",
              error = ["hold", "struggle", "tap", "open"].includes(b.kind)
                ? Math.max(a.reachError.left, a.reachError.right)
                : a.reachError[hand];
            if (error > 24)
              add(
                "error",
                "unreachable-contact",
                s.id,
                `${id} cannot reach ${b.targetId} (${Math.round(error)}px). Move actor/prop; do not stretch bones.`,
                t,
              );
          }
        }
      }
      for (const [id, q] of Object.entries(props))
        if (q.owner) {
          if(q.owner.local&&q.owner.hand==='head'&&Math.hypot(...q.owner.offset)>180)
            add('error','head-attachment-offset',s.id,`Head attachment ${id} is too far from the head. offset is relative to the HEAD bone, not the actor root: use a crown offset around [0,-70], never [0,-405].`,t);
          if (
            s.motions.some(
              (m) =>
                m.targetId === id && t >= m.start && t < m.start + m.duration,
            )
          )
            add(
              "error",
              "held-motion",
              s.id,
              "Free prop motion conflicts with attachment: " + id,
              t,
            );
          const a = states[q.owner.actorId];
          if (!a)
            add("error", "missing-owner", s.id, "Prop has no owner: " + id, t);
        }
    }
    const lastMotion = Math.max(
      ...s.beats.map((b) => b.start + b.duration),
      ...s.motions.map((m) => m.start + m.duration),
      0,
    );
    if (s.duration - lastMotion > 3)
      add(
        "warning",
        "long-ending-hold",
        s.id,
        "More than three seconds without a new animated action.",
        lastMotion,
      );
  }
  const errors = issues.filter((x) => x.severity === "error");
  return {
    ok: errors.length === 0,
    checks: [
      "schema-and-references",
      "continuous-camera-timeline",
      "story-event-links",
      "sampled-hand-reach",
      "prop-motion-ownership",
      "finite-rig",
      "performance-key-and-contact-samples",
      ...(requireCoverage ? ["asset-rig-primitive-timeline-visible-output-coverage"] : []),
      ...(p.hook ? ["opening-hook-timing-and-framing"] : []),
    ],
    hook: hookReport,
    sampleRate: 8,
    samples,
    duration: durationOf(p),
    issues,
    limitations: [
      "Geometry checks cannot judge whether a joke is funny or guarantee visual quality.",
      "Semantic fidelity requires Gemini review or human review.",
    ],
    planHash: planHash(p),
    coverageReportEnforced: !!requireCoverage && p.provenance?.origin !== "legacy-migration",
    ...(coverageReport ? { coverageReport } : {}),
  };
}
export function assertRenderable(p) {
  const plan = validatePlan(p);
  let report = inspectPlan(plan, {
    requireCoverage: plan.provenance?.origin !== "legacy-migration",
  });
  if (!report.ok)
    throw Error(
      "Animation preflight failed: " +
        report.issues
          .filter((i) => i.severity === "error")
          .map((i) => `${i.sceneId}: ${i.message}`)
          .join("; "),
    );
  return report;
}
