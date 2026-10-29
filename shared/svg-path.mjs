const COMMANDS = new Set(["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "S", "s", "Q", "q", "T", "t", "A", "a", "Z", "z"]);
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const COORD_MIN = -1500;
const COORD_MAX = 2000;
const PARAMS_PER_GROUP = Object.freeze({
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7,
});

/**
 * Accept only bounded SVG path data made of the renderer's geometry commands.
 * This is deliberately a small grammar, not an SVG/XML parser.
 */
export function validateSvgPathData(source, { maxCommands = 256 } = {}) {
  if (typeof source !== "string" || source.length === 0 || source.length > 8000)
    return { valid: false, reason: "path data must contain 1–8000 characters" };

  const tokens = [];
  let index = 0;
  let commaPending = false;
  let previousWasNumber = false;
  while (index < source.length) {
    const whitespaceStart = index;
    while (/\s/.test(source[index] || "")) index++;
    const hadWhitespace = index > whitespaceStart;
    if (source[index] === ",") {
      if (!previousWasNumber || commaPending)
        return { valid: false, reason: "misplaced comma in path data" };
      commaPending = true;
      previousWasNumber = false;
      index++;
      while (/\s/.test(source[index] || "")) index++;
    }
    if (index >= source.length) {
      if (commaPending) return { valid: false, reason: "trailing comma in path data" };
      break;
    }

    const char = source[index];
    if (/[a-zA-Z]/.test(char)) {
      if (commaPending || !COMMANDS.has(char))
        return { valid: false, reason: `unsupported path command ${char}` };
      tokens.push({ type: "command", value: char });
      index++;
      previousWasNumber = false;
      continue;
    }

    NUMBER.lastIndex = index;
    const match = NUMBER.exec(source);
    if (!match) return { valid: false, reason: "invalid token in path data" };
    if (!hadWhitespace && previousWasNumber && !/[+-]/.test(match[0][0]) && match[0][0] !== ".")
      return { valid: false, reason: "ambiguous number separator in path data" };
    const value = Number(match[0]);
    if (!Number.isFinite(value))
      return { valid: false, reason: "path coordinates must be finite" };
    tokens.push({ type: "number", value });
    index = NUMBER.lastIndex;
    commaPending = false;
    previousWasNumber = true;
  }

  let tokenIndex = 0;
  let commandCount = 0;
  let hasMove = false;
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex];
    if (token.type !== "command")
      return { valid: false, reason: "path data must start each segment with a command" };
    const command = token.value;
    const upper = command.toUpperCase();
    if (commandCount === 0 && upper !== "M")
      return { valid: false, reason: "path data must begin with a move command" };
    tokenIndex++;
    if (upper === "Z") {
      commandCount++;
      if (commandCount > maxCommands)
        return { valid: false, reason: `path exceeds ${maxCommands} commands` };
      continue;
    }
    const start = tokenIndex;
    while (tokenIndex < tokens.length && tokens[tokenIndex].type === "number")
      tokenIndex++;
    const values = tokens.slice(start, tokenIndex).map((part) => part.value);
    const groupSize = PARAMS_PER_GROUP[upper];
    if (!values.length || values.length % groupSize !== 0 || (upper === "M" && values.length < 2))
      return { valid: false, reason: `invalid parameter count for ${command}` };
    const groups = values.length / groupSize;
    commandCount += groups;
    if (upper === "M") hasMove = true;
    if (commandCount > maxCommands)
      return { valid: false, reason: `path exceeds ${maxCommands} commands` };

    for (let offset = 0; offset < values.length; offset += groupSize) {
      const group = values.slice(offset, offset + groupSize);
      if (upper === "A") {
        if (group[0] < 0 || group[0] > 1500 || group[1] < 0 || group[1] > 1500)
          return { valid: false, reason: "arc radii must be in the range 0–1500" };
        if (group[2] < -360 || group[2] > 360 || ![0, 1].includes(group[3]) || ![0, 1].includes(group[4]))
          return { valid: false, reason: "arc rotation and flags are out of range" };
        if (!inCoordinateBounds(group[5]) || !inCoordinateBounds(group[6]))
          return { valid: false, reason: "path coordinates are out of range" };
      } else {
        for (let item = 0; item < group.length; item++) {
          if ((upper === "H" || upper === "V") || upper === "M" || upper === "L" || upper === "C" || upper === "S" || upper === "Q" || upper === "T") {
            if (!inCoordinateBounds(group[item]))
              return { valid: false, reason: "path coordinates are out of range" };
          }
        }
      }
    }
  }
  if (!hasMove) return { valid: false, reason: "path data must include a move command" };
  return { valid: true };
}

function inCoordinateBounds(value) {
  return value >= COORD_MIN && value <= COORD_MAX;
}