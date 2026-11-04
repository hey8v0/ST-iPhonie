// 南极结界 · the tools in the hand: a hoe, an axe and a pick drawn along their handle at any angle from the hand (pixel
// lines, so a swing turns smoothly), and the watering can held out; play.js swings and tips them.
const WOOD = [[188, 132, 74], [146, 98, 52], [104, 66, 34]];
const METAL = [[236, 240, 246], [184, 190, 202], [124, 130, 144], [86, 90, 104]];
const CAN = [[132, 196, 230], [84, 152, 206], [52, 108, 168], [34, 72, 120]];

/**
 * A tool held at the hand: [[dx, dy, [r, g, b]], …] from the hand. angle in degrees: 0 the head straight up, 90 to the
 * right, 180 down; length: the handle (shorter while the tool turns toward or away from the eye). side: which way the
 * head of a hoe or an axe points across the handle (1 to the right of the handle's line, -1 to the left).
 */
export function toolPixels(id, angle, length = 11, side = 1) {
  const out = new Map(), a = angle * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), px = -uy * side, py = ux * side;
  const put = (x, y, c) => out.set(Math.round(x) + ',' + Math.round(y), c);
  // the handle, a pixel thick, lighter toward the hand's end of it
  for (let t = 0; t <= length; t += .5) put(ux * t, uy * t, t < length * .5 ? WOOD[0] : WOOD[1]);
  const ex = ux * length, ey = uy * length, at = (along, across, c) => put(ex + ux * along + px * across, ey + uy * along + py * across, c);
  if (id === 'hoe') { // a flat blade across the end, its edge darker
    for (let k = 0; k <= 3; k++) { at(0, k, k === 3 ? METAL[2] : METAL[1]); at(-1, k, k === 3 ? METAL[3] : METAL[2]); }
    at(0, 0, METAL[0]); at(.5, 1, METAL[0]);
  } else if (id === 'axe') { // a wedge out to one side, the cutting edge bright
    for (let k = 0; k <= 2; k++) for (let j = -1; j <= 1; j++) at(j, k, k === 2 ? METAL[0] : j < 0 ? METAL[2] : METAL[1]);
    at(-2, 2, METAL[1]); at(2, 2, METAL[1]); at(1.5, 3, METAL[0]); at(-1.5, 3, METAL[0]);
  } else if (id === 'pick') { // a bar across both ways, its tips bent back toward the hand
    for (let k = -3; k <= 3; k++) at(Math.abs(k) === 3 ? -1 : 0, k, Math.abs(k) >= 2 ? METAL[2] : METAL[1]);
    at(.5, 0, METAL[0]); at(-1, 0, WOOD[2]); at(-1.5, -3.5, METAL[3]); at(-1.5, 3.5, METAL[3]);
  }
  return [...out].map(([key, c]) => { const [x, y] = key.split(',').map(Number); return [x, y, c]; });
}

/** The watering can held out at the hand, its spout toward dir (-1 left, 1 right, 0 toward the eye); tip: 0 upright,
 *  1 tipped to pour. Also where the water leaves the spout. */
export function canPixels(dir, tip = 0) {
  const out = [], put = (x, y, c) => out.push([x, y, c]), sx = dir || 1;
  const drop = Math.round(tip * 2);
  if (!dir) { // seen from the front: the round body, the spout toward us in its middle
    for (let y = 0; y < 5; y++) for (let x = -3; x <= 3; x++) { if ((y === 0 || y === 4) && Math.abs(x) === 3) continue; put(x, y, x < -1 ? CAN[0] : x < 2 ? CAN[1] : CAN[2]); }
    put(0, -1, CAN[3]); put(-1, -1, CAN[2]); put(1, -1, CAN[2]); // the handle's top
    put(0, 2 + drop, CAN[3]); put(0, 3 + drop, CAN[0]);
    return {px: out, spout: [0, 4 + drop]};
  }
  // from the side: the body, the handle behind, the spout reaching forward and up (down a little when tipped)
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) { if ((y === 0 || y === 4) && (x === 0 || x === 5)) continue; put(sx * (x - 3), y + (x < 3 ? 0 : drop >> 1), y === 0 ? CAN[0] : x < 2 ? CAN[2] : CAN[1]); }
  for (const [x, y] of [[-3, -1], [-2, -2], [-1, -2], [0, -1]]) put(-sx * x - sx * 3, y, CAN[3]); // the handle, behind
  for (let k = 0; k < 4; k++) put(sx * (3 + k), 2 - k + drop * (k >= 2 ? 1 : 0), k === 3 ? CAN[0] : CAN[2]);
  return {px: out, spout: [sx * 7, -1 + drop * 2]};
}
