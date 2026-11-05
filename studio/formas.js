// Geometría de los bloques de Kirka (copiada del visor de Final Break, que la sacó del juego).
import { BLOCK_SHAPES, SEE_THROUGH, HIDDEN } from "./bloques.js";
export const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.8 },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.65 },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.65 },
];

// The four corners of each cube face go bottom-left, top-left, top-right,
// bottom-right on its tile.
export const CUBE_UV = [[0, 0], [0, 1], [1, 1], [1, 0]];

// Whether a block next to this one covers the face between them: full
// blocks do, except see-through ones (glass next to glass still does).
export const hides = (next, id) => !!next && !BLOCK_SHAPES[next] && !HIDDEN.has(next) && (!SEE_THROUGH.has(next) || next === id);

// A box from (x0, y0, z0) to (x1, y1, z1) inside the block, its tiles cut to
// fit. Faces on the block's sides keep `side`, so a neighbor can hide them.
function boxQuads([x0, y0, z0, x1, y1, z1], only = null) {
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  return FACES.flatMap((face, i) => {
    if (only && !only.includes(i)) return [];
    const v = face.v.map((corner) => corner.map((c, k) => (c ? hi[k] : lo[k])));
    // u runs from corner 0 to 3, v from corner 0 to 1, as on a full cube.
    const axis = (a, b) => [0, 1, 2].find((k) => face.v[a][k] !== face.v[b][k]);
    const au = axis(0, 3);
    const av = axis(0, 1);
    const along = (p, k, a, b) => (p[k] - face.v[a][k]) / (face.v[b][k] - face.v[a][k]);
    const uv = v.map((p) => [along(p, au, 0, 3), along(p, av, 0, 1)]);
    const axisN = face.n.findIndex((c) => c !== 0);
    const onSide = face.n[axisN] > 0 ? hi[axisN] === 1 : lo[axisN] === 0;
    return [{ v, n: face.n, shade: face.shade, uv, side: onSide ? face.n : null }];
  });
}

// A flat picture standing in the block, like a ladder or a plant.
const plane = (v, n, shade = 0.8) => ({ v, n, shade, uv: CUBE_UV, side: null });

const SHAPES = {
  slabBottom: boxQuads([0, 0, 0, 1, 0.5, 1]),
  slabTop: boxQuads([0, 0.5, 0, 1, 1, 1]),
  small: boxQuads([0.3125, 0, 0.3125, 0.6875, 0.375, 0.6875]),
  floor: boxQuads([0, 0, 0, 1, 0.1, 1], [2]),
  ladderZ0: [plane([[0, 0, 0.1], [0, 1, 0.1], [1, 1, 0.1], [1, 0, 0.1]], [0, 0, 1])],
  ladderZ1: [plane([[1, 0, 0.9], [1, 1, 0.9], [0, 1, 0.9], [0, 0, 0.9]], [0, 0, -1])],
  ladderX1: [plane([[0.9, 0, 0], [0.9, 1, 0], [0.9, 1, 1], [0.9, 0, 1]], [-1, 0, 0])],
  ladderX0: [plane([[0.1, 0, 1], [0.1, 1, 1], [0.1, 1, 0], [0.1, 0, 0]], [1, 0, 0])],
  cross: [
    plane([[0, 0, 0], [0, 1, 0], [1, 1, 1], [1, 0, 1]], [Math.SQRT1_2, 0, -Math.SQRT1_2], 1),
    plane([[0, 0, 1], [0, 1, 1], [1, 1, 0], [1, 0, 0]], [Math.SQRT1_2, 0, Math.SQRT1_2], 1),
  ],
  cage: [
    plane([[0.25, 0, 1], [0.25, 1, 1], [0.25, 1, 0], [0.25, 0, 0]], [-1, 0, 0]),
    plane([[0.75, 0, 0], [0.75, 1, 0], [0.75, 1, 1], [0.75, 0, 1]], [1, 0, 0]),
    plane([[0, 0, 0.2], [0, 1, 0.2], [1, 1, 0.2], [1, 0, 0.2]], [0, 0, -1], 0.65),
    plane([[1, 0, 0.75], [1, 1, 0.75], [0, 1, 0.75], [0, 0, 0.75]], [0, 0, 1], 0.65),
  ],
};
export const shapeQuads = (shape) => SHAPES[shape];
