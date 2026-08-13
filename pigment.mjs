// MULLER — subtractive pigment core (pure, deterministic, headless-testable)
//
// Real paint does not mix like light on a screen. It mixes by absorption:
// two colorants stacked block more of the spectrum than either alone. This
// core implements Kubelka-Munk mixing (the standard paint-industry model
// for how a pigment's absorption coefficient K and scattering coefficient S
// combine into visible reflectance), across a coarse 8-band spectrum
// (400-700nm in ~37.5nm steps). It is a simplified, illustrative model, not
// a calibrated spectrophotometric one — the K/S numbers below are relative
// units chosen to produce historically-correct QUALITATIVE behavior (which
// pigments absorb where), not measured lab data. Say so plainly; don't
// pretend to more precision than this has.

export const BAND_COUNT = 8;
export const BAND_LABELS = ['violet', 'blue', 'cyan', 'green', 'yellow-green', 'yellow', 'orange', 'red'];

// ---------- deterministic PRNG (mulberry32) ----------

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- pigment spectra ----------
// K = absorption per band (higher = the pigment eats that band).
// S = scattering per band (higher = the pigment bounces that band back).
// firstUse = approximate earliest documented European use (year; negative
// = BCE). Approximate on purpose — used only to gate anachronism in the
// restoration commissions, not presented as art-historical fact.

export const PIGMENTS = [
  { id: 'leadtinyellow', name: 'Lead-tin yellow',
    K: [8, 7, 2, 1, 1, 0.5, 0.5, 0.5], S: [1, 1, 3, 4, 4, 4, 4, 4], firstUse: 1300 },
  { id: 'azurite', name: 'Azurite',
    K: [1, 1, 1, 2, 3, 5, 7, 8], S: [3, 4, 4, 3, 2, 1, 1, 1], firstUse: 800,
    // coarser grind: absorbs MORE blue, absorbs LESS green — a real azurite
    // fact (fine grind pales toward blue, coarse grind deepens toward green).
    grindDeltaK: [3, 3, 1, -2, -2, 0, 0, 0] },
  { id: 'verdigris', name: 'Verdigris',
    K: [4, 3, 1, 0.5, 1, 2, 4, 5], S: [2, 2, 4, 5, 4, 3, 2, 2], firstUse: 800 },
  { id: 'orpiment', name: 'Orpiment',
    K: [9, 8, 3, 1, 0.5, 0.5, 1, 1], S: [1, 1, 3, 4, 5, 5, 4, 3], firstUse: -2000 },
  { id: 'vermilion', name: 'Vermilion',
    K: [7, 7, 6, 4, 2, 1, 0.5, 0.5], S: [1, 1, 1, 2, 3, 4, 5, 5], firstUse: -300 },
  { id: 'ultramarine', name: 'Ultramarine',
    K: [0.5, 0.5, 1, 2, 4, 6, 8, 8], S: [5, 5, 4, 3, 2, 1, 1, 1], firstUse: 1200 },
  { id: 'boneblack', name: 'Bone black',
    K: [6, 6, 6, 6, 6, 6, 6, 6], S: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], firstUse: -3000 },
  { id: 'leadwhite', name: 'Lead white',
    K: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2], S: [9, 9, 9, 9, 9, 9, 9, 9], firstUse: -400 },
  { id: 'malachite', name: 'Malachite',
    K: [3, 2, 1, 0.5, 1, 3, 5, 6], S: [2, 3, 4, 5, 4, 2, 1, 1], firstUse: -2000,
    // coarser grind: deepens (loses overall scatter) rather than shifting hue.
    grindDeltaS: [-1, -1, -1, -1, -1, -1, -1, -1] },
  { id: 'rawumber', name: 'Raw umber',
    K: [5, 4, 3, 2, 2, 2, 2, 2], S: [2, 2, 3, 4, 4, 4, 4, 4], firstUse: -3000 },
  { id: 'madderlake', name: 'Madder lake',
    K: [6, 6, 5, 3, 2, 1, 0.5, 0.3], S: [0.8, 0.8, 1, 1.5, 2, 2.5, 3, 3], firstUse: -1500 },
  { id: 'indigo', name: 'Indigo',
    K: [1, 1, 2, 3, 5, 6, 7, 7], S: [1, 1.2, 1.5, 2, 2.5, 3, 3, 3], firstUse: -2000 },
];

export function pigmentById(id) {
  const p = PIGMENTS.find(p => p.id === id);
  if (!p) throw new Error(`unknown pigment: ${id}`);
  return p;
}

// Historically true, must-never-touch pairs (sulfide/metal reactions that
// blacken or corrupt the paint over time).
export const INCOMPATIBLE_PAIRS = [
  { a: 'orpiment', b: 'verdigris', reason: 'arsenic sulfide corrupts the copper acetate — the green goes muddy-black within years' },
  { a: 'orpiment', b: 'leadwhite', reason: 'sulfide blackens lead white on contact — the ground itself darkens' },
];

export function isIncompatible(idA, idB) {
  return INCOMPATIBLE_PAIRS.some(p => (p.a === idA && p.b === idB) || (p.a === idB && p.b === idA));
}

// Returns every incompatible pair present within a set of pigment ids (order-independent).
export function findIncompatibilities(ids) {
  const found = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const hit = INCOMPATIBLE_PAIRS.find(p =>
        (p.a === ids[i] && p.b === ids[j]) || (p.a === ids[j] && p.b === ids[i]));
      if (hit) found.push({ a: ids[i], b: ids[j], reason: hit.reason });
    }
  }
  return found;
}

// ---------- grind ----------
// grindLevel in [0,1]: 0 = fine, 1 = coarse. Only pigments with grindDeltaK
// or grindDeltaS defined are affected; everyone else passes through unchanged.
export function applyGrind(pigment, grindLevel) {
  const g = Math.max(0, Math.min(1, grindLevel));
  const dK = pigment.grindDeltaK, dS = pigment.grindDeltaS;
  const K = pigment.K.map((k, i) => Math.max(0.05, k + (dK ? dK[i] * g : 0)));
  const S = pigment.S.map((s, i) => Math.max(0.05, s + (dS ? dS[i] * g : 0)));
  return { K, S };
}

// ---------- Kubelka-Munk reflectance ----------
// Standard single-constant KM relation between the K/S ratio at a band and
// the resulting infinite-thickness reflectance R at that band:
//   K/S = (1-R)^2 / (2R)  =>  R = 1 + k - sqrt(k^2 + 2k)   where k = K/S
export function kmReflectanceBand(k) {
  const kk = Math.max(0, k);
  return 1 + kk - Math.sqrt(kk * kk + 2 * kk);
}

export function kmReflectance(K, S) {
  return K.map((k, i) => kmReflectanceBand(k / Math.max(0.01, S[i])));
}

// ---------- subtractive mixing ----------
// selections: [{ id, parts, grind? }]. K and S are additive by relative
// concentration (the actual Kubelka-Munk mixing rule used in real paint
// formulation) — reflectance is only computed AFTER the K/S mix, never by
// averaging reflectances directly. That ordering is what makes blue+yellow
// mix to green instead of grey.
export function mixKM(selections) {
  if (!selections || selections.length === 0) throw new Error('mixKM needs at least one selection');
  const totalParts = selections.reduce((a, s) => a + s.parts, 0);
  if (totalParts <= 0) throw new Error('mixKM needs positive total parts');
  const K = new Array(BAND_COUNT).fill(0);
  const S = new Array(BAND_COUNT).fill(0);
  for (const sel of selections) {
    const pig = pigmentById(sel.id);
    const { K: pk, S: ps } = applyGrind(pig, sel.grind || 0);
    const w = sel.parts / totalParts;
    for (let i = 0; i < BAND_COUNT; i++) { K[i] += pk[i] * w; S[i] += ps[i] * w; }
  }
  return { K, S, R: kmReflectance(K, S) };
}

// ---------- glaze ----------
// A thin translucent layer over a base reflectance. T (band transmittance)
// follows Beer-Lambert attenuation on the glaze pigment's OWN absorption
// (thickness set by how many parts are laid down); the fraction that
// doesn't make the round trip through to the base and back contributes the
// glaze's own masstone color instead. This composite is NOT commutative —
// glazing A-then-B sees a different "base" for B than glazing B-then-A does
// for A — which is the real reason layer order matters in oil glazing.
export function applyGlaze(baseR, pigmentId, parts = 1, grindLevel = 0) {
  const pig = pigmentById(pigmentId);
  const { K, S } = applyGrind(pig, grindLevel);
  const ownR = kmReflectance(K, S);
  const thickness = Math.max(0.01, parts) * 0.18;
  const out = new Array(BAND_COUNT);
  for (let i = 0; i < BAND_COUNT; i++) {
    const T = Math.exp(-K[i] * thickness);
    const T2 = T * T;
    out[i] = Math.max(0, Math.min(1, T2 * baseR[i] + (1 - T2) * ownR[i]));
  }
  return out;
}

// layers: [{ id, parts, grind? }], applied in array order.
export function applyGlazeSequence(baseR, layers) {
  let R = baseR.slice();
  for (const layer of layers) R = applyGlaze(R, layer.id, layer.parts, layer.grind || 0);
  return R;
}

// ---------- illuminants + perceived color ----------
// Real Planckian (blackbody) relative spectral power at the 8 band centers
// (420/460/495/530/570/605/645/680nm), each normalized to 1 at 605nm —
// computed directly from Planck's law, not hand-tuned. Daylight approximates
// a 6500K source (near-flat, slightly blue-leaning); candlelight
// approximates a ~1900K flame (steeply starved of blue, roughly 90x more
// red than violet at that temperature) — the actual physical reason a
// color mixed to match under a window can go wrong at the workbench candle.
export const ILLUMINANTS = {
  daylight: [1.211, 1.219, 1.192, 1.142, 1.070, 1.000, 0.917, 0.846],
  candlelight: [0.025, 0.076, 0.169, 0.329, 0.624, 1.000, 1.578, 2.218],
};

// Coarse eye-response curves (S/M/L-cone-shaped bumps across the 8 bands),
// used only to fold an 8-band spectrum down to a 3-channel perceived color
// for scoring and display — not a colorimetric CIE fit.
export const EYE_RESPONSE = [
  [0.90, 1.00, 0.50, 0.15, 0.05, 0.02, 0.01, 0.01], // short (blue-sensing)
  [0.05, 0.20, 0.60, 0.95, 1.00, 0.70, 0.35, 0.10], // mid (green-sensing)
  [0.02, 0.05, 0.15, 0.35, 0.60, 0.85, 1.00, 0.95], // long (red-sensing)
];

export function tristimulus(R, illuminantName) {
  const illum = ILLUMINANTS[illuminantName];
  if (!illum) throw new Error(`unknown illuminant: ${illuminantName}`);
  return EYE_RESPONSE.map(row => row.reduce((sum, w, i) => sum + w * illum[i] * R[i], 0));
}

export function deltaE(t1, t2) {
  return Math.sqrt(t1.reduce((sum, v, i) => sum + (v - t2[i]) ** 2, 0));
}

// Monotonic non-increasing score from a ΔE distance. Calibrated so a dead-on
// match (dE=0) scores 100 and typical "wrong pigment family" mixes (dE>10)
// score 0; nothing here depends on player skill, only on the geometry.
export function scoreForDeltaE(dE) {
  return Math.max(0, Math.min(100, Math.round(100 - dE * 9)));
}

export const MATCH_TOLERANCE_DE = 3.2;

export function isMatch(dE) { return dE <= MATCH_TOLERANCE_DE; }

// ---------- commissions ----------
// Fixed, hand-authored (not seed-randomized) — each commission's target is
// PRODUCED by a real, allowed recipe, so reachability is true by
// construction; solverVerify (below) independently re-discovers a solution
// by search, which is the actual proof, not a restatement of the recipe.
export const COMMISSIONS = [
  // Tier 1 — flat matches (single mix, daylight)
  { id: 'c01', tier: 'flat', name: "The duchess's sleeve", client: 'a duchess, impatient',
    recipe: { mix: [{ id: 'ultramarine', parts: 2 }, { id: 'leadtinyellow', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c02', tier: 'flat', name: 'A cardinal too red for church', client: 'the sacristan',
    recipe: { mix: [{ id: 'vermilion', parts: 3 }, { id: 'leadwhite', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c03', tier: 'flat', name: "The apothecary's green bottle", client: 'an apothecary',
    recipe: { mix: [{ id: 'azurite', parts: 2 }, { id: 'leadtinyellow', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c04', tier: 'flat', name: 'Shadow under the olive tree', client: 'a landscape painter',
    recipe: { mix: [{ id: 'rawumber', parts: 2 }, { id: 'boneblack', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c05', tier: 'flat', name: "The doge's violet trim", client: "the doge's tailor",
    recipe: { mix: [{ id: 'ultramarine', parts: 1 }, { id: 'vermilion', parts: 1 }] }, illuminant: 'daylight', par: 2 },

  // Tier 2 — glaze builds (base + ordered layers)
  { id: 'c06', tier: 'glaze', name: 'Skin that glows from within', client: 'a portraitist',
    recipe: { mix: [{ id: 'leadwhite', parts: 3 }, { id: 'vermilion', parts: 1 }], glaze: [{ id: 'madderlake', parts: 1 }] },
    illuminant: 'daylight', par: 3 },
  { id: 'c07', tier: 'glaze', name: "The Virgin's mantle, deepened", client: 'the confraternity',
    recipe: { mix: [{ id: 'azurite', parts: 2 }, { id: 'leadwhite', parts: 1 }], glaze: [{ id: 'indigo', parts: 1 }] },
    illuminant: 'daylight', par: 3 },
  { id: 'c08', tier: 'glaze', name: 'A ruby that is not garnet', client: 'a goldsmith',
    recipe: { mix: [{ id: 'leadwhite', parts: 2 }], glaze: [{ id: 'madderlake', parts: 2 }, { id: 'madderlake', parts: 1 }] },
    illuminant: 'daylight', par: 4 },
  { id: 'c09', tier: 'glaze', name: 'Storm cloud, layered wrong on purpose', client: 'a stage-set painter',
    recipe: { mix: [{ id: 'leadwhite', parts: 2 }, { id: 'boneblack', parts: 1 }], glaze: [{ id: 'indigo', parts: 1 }, { id: 'madderlake', parts: 1 }] },
    illuminant: 'daylight', par: 4 },
  { id: 'c10', tier: 'glaze', name: 'The merchant’s velvet, under lamplight', client: 'a cloth merchant',
    recipe: { mix: [{ id: 'leadwhite', parts: 2 }, { id: 'vermilion', parts: 1 }], glaze: [{ id: 'madderlake', parts: 2 }] },
    illuminant: 'candlelight', par: 3 },

  // Tier 3 — restoration matches (period-gated palette, banned modern pigments)
  { id: 'c11', tier: 'restore', name: 'A 1280 processional panel, chipped corner', client: 'the cathedral chapter',
    periodYear: 1280,
    recipe: { mix: [{ id: 'ultramarine', parts: 2 }, { id: 'leadwhite', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c12', tier: 'restore', name: 'A 1290 saint’s robe, water-stained', client: 'a convent sacristan',
    periodYear: 1290,
    recipe: { mix: [{ id: 'malachite', parts: 2 }, { id: 'leadwhite', parts: 1 }] }, illuminant: 'daylight', par: 2 },
  { id: 'c13', tier: 'restore', name: 'A 1150 illuminated capital, faded gold ground', client: 'a monastery librarian',
    periodYear: 1150,
    recipe: { mix: [{ id: 'orpiment', parts: 1 }] }, illuminant: 'daylight', par: 1 },
  { id: 'c14', tier: 'restore', name: 'A candlelit chapel fresco, night inspection', client: 'the night sacristan',
    periodYear: 1400,
    recipe: { mix: [{ id: 'vermilion', parts: 1 }, { id: 'rawumber', parts: 1 }] }, illuminant: 'candlelight', par: 2 },
  { id: 'c15', tier: 'restore', name: 'The master’s last unfinished panel', client: 'the master’s own apprentices',
    periodYear: 1520,
    recipe: { mix: [{ id: 'azurite', parts: 1, grind: 1 }, { id: 'leadtinyellow', parts: 1 }], glaze: [{ id: 'madderlake', parts: 1 }] },
    illuminant: 'daylight', par: 3 },
];

// Which pigments are allowed for a commission (period-gated for restoration tier).
export function allowedPalette(commission) {
  if (commission.tier !== 'restore' || commission.periodYear == null) return PIGMENTS.slice();
  return PIGMENTS.filter(p => p.firstUse <= commission.periodYear);
}

export function isPigmentBanned(commission, pigmentId) {
  return !allowedPalette(commission).some(p => p.id === pigmentId);
}

// Produces the target reflectance + tolerance for a commission from its
// authored recipe (base mix, then any glaze layers in order).
export function commissionTarget(commission) {
  const { mix, glaze } = commission.recipe;
  const base = mixKM(mix.filter(m => m.parts > 0));
  const R = glaze && glaze.length ? applyGlazeSequence(base.R, glaze) : base.R;
  return { R, illuminant: commission.illuminant, tolerance: MATCH_TOLERANCE_DE };
}

export function scoreRecipe(commission, recipeR) {
  const target = commissionTarget(commission);
  const dE = deltaE(tristimulus(recipeR, target.illuminant), tristimulus(target.R, target.illuminant));
  return { dE, pass: isMatch(dE), score: scoreForDeltaE(dE) };
}

// ---------- solver ----------
// Independent bounded search over the allowed palette (period-gated,
// incompatible pairs excluded) that tries to REDISCOVER a within-tolerance
// recipe for a commission's target — proof of reachability that does not
// simply replay the authored recipe. Coarse ratio grid + a node cap keep it
// fast; glaze-tier commissions also search one or two glaze layers from the
// two transparent pigments.
const RATIO_STEPS = [1, 2, 3];
const GLAZE_CANDIDATES = ['madderlake', 'indigo'];

export function solverVerify(commission, nodeCap = 20000) {
  const palette = allowedPalette(commission).map(p => p.id);
  let nodes = 0;

  function tryMix(ids) {
    for (const a of ids) {
      for (const pa of RATIO_STEPS) {
        nodes++;
        if (nodes > nodeCap) return null;
        {
          const r = mixKM([{ id: a, parts: pa }]);
          const s = scoreRecipe(commission, r.R);
          if (s.pass) return { mix: [{ id: a, parts: pa }] };
        }
        for (const b of ids) {
          if (b === a) continue;
          if (findIncompatibilities([a, b]).length) continue;
          for (const pb of RATIO_STEPS) {
            nodes++;
            if (nodes > nodeCap) return null;
            const r = mixKM([{ id: a, parts: pa }, { id: b, parts: pb }]);
            const s = scoreRecipe(commission, r.R);
            if (s.pass) return { mix: [{ id: a, parts: pa }, { id: b, parts: pb }] };
          }
        }
      }
    }
    return null;
  }

  if (commission.tier !== 'glaze') {
    return tryMix(palette);
  }

  // glaze tier: search base mixes then try 1-2 glaze layers
  for (const a of palette) {
    for (const pa of RATIO_STEPS) {
      const baseCandidates = [[{ id: a, parts: pa }]];
      for (const b of palette) {
        if (b === a) continue;
        baseCandidates.push([{ id: a, parts: pa }, { id: b, parts: 2 }]);
      }
      for (const mix of baseCandidates) {
        nodes++;
        if (nodes > nodeCap) return null;
        const base = mixKM(mix);
        for (const g1 of GLAZE_CANDIDATES) {
          for (const p1 of RATIO_STEPS) {
            const r1 = applyGlaze(base.R, g1, p1);
            const s1 = scoreRecipe(commission, r1);
            if (s1.pass) return { mix, glaze: [{ id: g1, parts: p1 }] };
            for (const g2 of GLAZE_CANDIDATES) {
              for (const p2 of RATIO_STEPS) {
                nodes++;
                if (nodes > nodeCap) return null;
                const r2 = applyGlaze(r1, g2, p2);
                const s2 = scoreRecipe(commission, r2);
                if (s2.pass) return { mix, glaze: [{ id: g1, parts: p1 }, { id: g2, parts: p2 }] };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

// ---------- practice swatches (seeded, for free play beyond the 15 commissions) ----------
export function randomSwatch(seed) {
  const rng = mulberry32(seed >>> 0);
  const n = 1 + Math.floor(rng() * 2); // 1 or 2 pigments
  const ids = PIGMENTS.map(p => p.id);
  const chosen = [];
  const used = new Set();
  while (chosen.length < n) {
    const id = ids[Math.floor(rng() * ids.length)];
    if (used.has(id)) continue;
    if (chosen.length && findIncompatibilities([...chosen.map(c => c.id), id]).length) continue;
    used.add(id);
    chosen.push({ id, parts: 1 + Math.floor(rng() * 3) });
  }
  const illuminant = rng() < 0.75 ? 'daylight' : 'candlelight';
  const mixed = mixKM(chosen);
  return { R: mixed.R, illuminant, recipeUsed: chosen };
}

// Solves a practice swatch generated by randomSwatch — proves every seeded
// swatch is independently reachable, not just self-consistent with its own generator.
export function solveSwatch(swatch, nodeCap = 20000) {
  const target = { R: swatch.R, illuminant: swatch.illuminant };
  const ids = PIGMENTS.map(p => p.id);
  let nodes = 0;
  for (const a of ids) {
    for (const pa of RATIO_STEPS) {
      nodes++;
      if (nodes > nodeCap) return null;
      const r1 = mixKM([{ id: a, parts: pa }]);
      const dE1 = deltaE(tristimulus(r1.R, target.illuminant), tristimulus(target.R, target.illuminant));
      if (isMatch(dE1)) return { mix: [{ id: a, parts: pa }] };
      for (const b of ids) {
        if (b === a || findIncompatibilities([a, b]).length) continue;
        for (const pb of RATIO_STEPS) {
          nodes++;
          if (nodes > nodeCap) return null;
          const r2 = mixKM([{ id: a, parts: pa }, { id: b, parts: pb }]);
          const dE2 = deltaE(tristimulus(r2.R, target.illuminant), tristimulus(target.R, target.illuminant));
          if (isMatch(dE2)) return { mix: [{ id: a, parts: pa }, { id: b, parts: pb }] };
        }
      }
    }
  }
  return null;
}
