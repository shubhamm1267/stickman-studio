export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ease = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const lerp = (a, b, u) =>
  Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], u)) : a + (b - a) * u;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export function ik(a, target, L = 98, M = 102, side = 1) {
  let dx = target[0] - a[0],
    dy = target[1] - a[1],
    raw = Math.hypot(dx, dy),
    d = clamp(raw, Math.abs(L - M) + 0.001, L + M - 0.001),
    angle = Math.atan2(dy, dx),
    al = Math.acos(clamp((L * L + d * d - M * M) / (2 * L * d), -1, 1));
  return {
    elbow: [
      a[0] + L * Math.cos(angle + al * side),
      a[1] + L * Math.sin(angle + al * side),
    ],
    hand: [a[0] + Math.cos(angle) * d, a[1] + Math.sin(angle) * d],
    error: Math.abs(raw - d),
  };
}

// Time warps preserve exact endpoints; pose holds are authored in the timeline.
export function motionEase(x, style = "smooth") {
  x = clamp(x);
  if(style==='hold')return x>=1?1:0;
  if(style==='linear')return x;
  if (style === "snappy") return x < .22 ? .06 * ease(x / .22) : x < .68 ? .06 + .88 * ease((x - .22) / .46) : .94 + .06 * ease((x - .68) / .32);
  if (style === "gentle") return x*x*x*(x*(x*6-15)+10);
  return ease(x);
}

export function localToWorld(s, point) {
 const a=(s.bodyAngle||0)*Math.PI/180,x=point[0]*s.scale,y=point[1]*s.scale;
 return [s.position[0]+x*Math.cos(a)-y*Math.sin(a),s.position[1]+x*Math.sin(a)+y*Math.cos(a)];
}
export function worldToLocal(s, point) {
 const a=-(s.bodyAngle||0)*Math.PI/180,x=point[0]-s.position[0],y=point[1]-s.position[1];
 return [(x*Math.cos(a)-y*Math.sin(a))/s.scale,(x*Math.sin(a)+y*Math.cos(a))/s.scale];
}
