// Decimal seconds are converted as exact base-10 rationals, then quantized
// once to the output frame clock. This avoids cumulative binary-float drift.
function rational(value) {
  if (!Number.isFinite(value)) throw new Error("Time values must be finite.");
  const text = String(value).toLowerCase();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid decimal time: ${text}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] || "";
  const exponent = Number(match[4] || 0) - fraction.length;
  let numerator = sign * BigInt(match[2] + fraction);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function add(a, b) {
  return {
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  };
}

function multiply(a, b) {
  return {
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  };
}

function quantize(value, fps, rounding) {
  if (!Number.isInteger(fps) || fps <= 0)
    throw new Error("FPS must be a positive integer.");
  const scaled = { numerator: value.numerator * BigInt(fps), denominator: value.denominator };
  if (scaled.numerator < 0n) throw new Error("Frame time cannot be negative.");
  const quotient = scaled.numerator / scaled.denominator;
  const remainder = scaled.numerator % scaled.denominator;
  if (rounding === "ceil") return Number(quotient + (remainder ? 1n : 0n));
  if (rounding !== "nearest") throw new Error(`Unsupported frame rounding: ${rounding}`);
  return Number(quotient + (2n * remainder >= scaled.denominator ? 1n : 0n));
}

export function secondsToFrame(seconds, fps, rounding = "nearest") {
  return quantize(rational(seconds), fps, rounding);
}

export function secondsSumToFrame(startSeconds, durationSeconds, fps, rounding = "nearest") {
  return quantize(add(rational(startSeconds), rational(durationSeconds)), fps, rounding);
}

export function secondsAtFractionToFrame(startSeconds, durationSeconds, fraction, fps, rounding = "nearest") {
  return quantize(
    add(rational(startSeconds), multiply(rational(durationSeconds), rational(fraction))),
    fps,
    rounding,
  );
}

export function cumulativeFrameBoundaries(durations, fps) {
  let total = { numerator: 0n, denominator: 1n };
  const boundaries = [0];
  for (const duration of durations) {
    const value = rational(duration);
    if (value.numerator < 0n) throw new Error("Scene duration cannot be negative.");
    total = add(total, value);
    boundaries.push(quantize(total, fps, "nearest"));
  }
  return boundaries;
}