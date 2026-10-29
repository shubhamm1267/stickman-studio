import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const plan = JSON.parse(readFileSync(resolve(project, "examples/motion-ir-lantern.json"), "utf8"));
const baseCharacter = plan.characters[0];

plan.title = "Hand-authored prop exchange fixture";
plan.story = "Asha picks up a small parcel, carries it to Bala, transfers it hand to hand, and places it down. Both characters react.";
plan.sourceIdea = plan.story;
plan.characters = [
  { ...baseCharacter, id: "asha", name: "Asha", outfit: "#8db5a8" },
  { ...baseCharacter, id: "bala", name: "Bala", outfit: "#bd91a8", hairStyle: "curly" },
];
plan.propDesigns = [{
  id: "parcel",
  name: "Hand-drawn exchange parcel",
  type: "drawing",
  color: "#d79a52",
  interactionAnchors: [{ id: "handle", position: [0, -42] }],
  nodes: [
    {
      kind: "group",
      position: [0, 0],
      pivot: [0, 0],
      children: [
        { kind: "path", d: "M-42 -27 L42 -27 L42 29 L-42 29 Z", fill: "#d79a52", stroke: "#293329", width: 3 },
        { kind: "path", d: "M-42 -12 L42 -12 M0 -27 L0 29", fill: "none", stroke: "#8b512c", width: 5 },
        { kind: "path", d: "M-17 -27 C-17 -55 17 -55 17 -27", fill: "none", stroke: "#8b512c", width: 5 },
      ],
    },
  ],
}];

const scene = {
  ...plan.scenes[0],
  id: "propExchange",
  summary: "Two characters pick up, carry, transfer, and place a custom parcel, then react.",
  duration: 4,
  background: "room",
  backgroundNodes: [],
  motions: [],
  cast: [
    {
      rigVersion: 2,
      characterId: "asha",
      emotion: "curious",
      x: 200,
      y: 780,
      scale: 0.8,
      facing: 1,
      initialPose: { rightHand: [110, -250], wristAngle: 12 },
    },
    {
      rigVersion: 2,
      characterId: "bala",
      emotion: "curious",
      x: 372,
      y: 780,
      scale: 0.7,
      facing: -1,
      initialPose: { leftHand: [-120, -285.7142857142857], leftWristAngle: 12 },
    },
  ],
  props: [{
    designId: "parcel",
    open: 0,
    angle: 0,
    x: 288,
    y: 580,
    scale: 0.55,
    attachmentEvents: [
      { at: 0.5, attachment: { actorId: "asha", bone: "rightHand", offset: [0, 0], propAnchorId: "handle" } },
      { at: 1.6, attachment: { actorId: "bala", bone: "leftHand", offset: [0, 0], propAnchorId: "handle" } },
      { at: 2.7, attachment: null, position: [385, 748], angle: 0 },
    ],
  }],
  beats: [
    { actorId: "asha", kind: "react", start: 2.85, duration: 0.6, emotion: "shock", amount: 1, intent: "Asha reacts visibly after placing the parcel." },
    { actorId: "bala", kind: "react", start: 3.1, duration: 0.6, emotion: "laugh", amount: 1, intent: "Bala smiles and laughs at the successful exchange." },
  ],
  shots: [{ start: 0, end: 4, focus: [300, 555], zoom: 1.05, detail: "full", actorIds: ["asha", "bala"] }],
  sounds: [],
  dialogue: [],
};
delete scene.motionIR;
plan.scenes = [scene];
plan.coverage = [
  { storyEvent: "Asha and Bala visibly react after the parcel exchange.", sceneId: scene.id, beatIndices: [0, 1] },
];
plan.blockedReasons = [];

writeFileSync(resolve(project, "examples/prop-exchange.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log("Wrote examples/prop-exchange.json (hand-authored data; no provider generation).");