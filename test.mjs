// MULLER headless tests — node test.mjs, exit 0 = green.
import * as G from './pigment.mjs';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function maxAbsDiff(a, b) { return Math.max(...a.map((v, i) => Math.abs(v - b[i]))); }

// 1. REQUIRED: blue+yellow -> green, proven by band math (not by asserting a
//    color name). Pure blue peaks in violet/blue bands (0,1); pure yellow
//    peaks in yellow/orange/red (5,6,7); the mix must peak in the CENTRAL
//    cyan/green bands (2,3) — a band no pure component peaks in.
{
  const blue = G.mixKM([{ id: 'ultramarine', parts: 1 }]).R;
  const yellow = G.mixKM([{ id: 'leadtinyellow', parts: 1 }]).R;
  const mix = G.mixKM([{ id: 'ultramarine', parts: 1 }, { id: 'leadtinyellow', parts: 1 }]).R;
  const peakOf = (r) => r.indexOf(Math.max(...r));
  const mixPeak = peakOf(mix);
  check('blue peaks in violet/blue band', [0, 1].includes(peakOf(blue)), peakOf(blue));
  check('yellow peaks in yellow/orange/red band', [5, 6, 7].includes(peakOf(yellow)), peakOf(yellow));
  check('blue+yellow mix peaks in cyan/green band (real subtractive result)', [2, 3].includes(mixPeak), { mix, mixPeak });
}

// 2. REQUIRED: complements -> neutral dark, not a grey-RGB average. K/S
//    additive mixing followed by the (convex) KM reflectance curve means the
//    true mix must be darker, band-by-band, than a naive linear average of
//    the two pure reflectances would be — proof the model is not doing
//    RGB-style linear blending under the hood.
{
  const red = G.mixKM([{ id: 'vermilion', parts: 1 }]).R;
  const cyan = G.mixKM([{ id: 'azurite', parts: 1 }]).R;
  const mix = G.mixKM([{ id: 'vermilion', parts: 1 }, { id: 'azurite', parts: 1 }]).R;
  const linAvg = red.map((v, i) => (v + cyan[i]) / 2);
  const allDarker = mix.every((v, i) => v <= linAvg[i] + 1e-9);
  const strictlyDarkerSomewhere = mix.some((v, i) => v < linAvg[i] - 1e-6);
  check('complements mix darker than linear average every band', allDarker, { mix, linAvg });
  check('complements mix strictly darker somewhere (not coincidentally equal)', strictlyDarkerSomewhere);
}

// 3. REQUIRED: grind coarseness shifts azurite's band correctly (coarser =
//    more blue absorbed, more green kept — the real azurite fact).
{
  const fine = G.mixKM([{ id: 'azurite', parts: 1, grind: 0 }]).R;
  const coarse = G.mixKM([{ id: 'azurite', parts: 1, grind: 1 }]).R;
  check('coarser azurite reflects LESS blue (band 1)', coarse[1] < fine[1], { fine, coarse });
  check('coarser azurite reflects MORE green (band 3)', coarse[3] > fine[3], { fine, coarse });
}

// 4. REQUIRED: incompatible pair flagged always, regardless of argument order.
check('orpiment+verdigris flagged', G.isIncompatible('orpiment', 'verdigris'));
check('verdigris+orpiment flagged (order-independent)', G.isIncompatible('verdigris', 'orpiment'));
check('orpiment+leadwhite flagged', G.isIncompatible('orpiment', 'leadwhite'));
check('ultramarine+vermilion NOT flagged (compatible pair)', !G.isIncompatible('ultramarine', 'vermilion'));
{
  const found = G.findIncompatibilities(['orpiment', 'ultramarine', 'verdigris']);
  check('findIncompatibilities finds the one bad pair in a larger set', found.length === 1 && found[0].a === 'orpiment' && found[0].b === 'verdigris', found);
}

// 5. REQUIRED: illuminant shift changes perceived match — a genuine
//    metamerism pair, found by search (not hand-tuned): two DIFFERENT
//    recipes whose tristimulus is close enough to PASS as a match under
//    daylight, but far enough apart to FAIL under candlelight.
{
  const R1 = G.mixKM([{ id: 'leadwhite', parts: 3 }, { id: 'vermilion', parts: 2 }]).R;
  const R2 = G.mixKM([{ id: 'malachite', parts: 2 }, { id: 'ultramarine', parts: 1 }]).R;
  const dDay = G.deltaE(G.tristimulus(R1, 'daylight'), G.tristimulus(R2, 'daylight'));
  const dCan = G.deltaE(G.tristimulus(R1, 'candlelight'), G.tristimulus(R2, 'candlelight'));
  check('metamer pair matches under daylight', G.isMatch(dDay), dDay);
  check('metamer pair fails to match under candlelight', !G.isMatch(dCan), dCan);
  check('candlelight distance meaningfully larger than daylight distance', dCan > dDay + 1.0, { dDay, dCan });
}

// 6. Bone black deadens: adding more black to a mix shrinks its band-to-band
//    spread (desaturates), it does not just darken a hue proportionally.
{
  const little = G.mixKM([{ id: 'vermilion', parts: 3 }, { id: 'boneblack', parts: 1 }]).R;
  const lots = G.mixKM([{ id: 'vermilion', parts: 3 }, { id: 'boneblack', parts: 6 }]).R;
  const spread = (r) => Math.max(...r) - Math.min(...r);
  check('more bone black shrinks the spectral spread (deadens)', spread(lots) < spread(little), { little: spread(little), lots: spread(lots) });
}

// 7. Glaze order matters: A-then-B must differ from B-then-A on the same base.
{
  const base = G.mixKM([{ id: 'leadwhite', parts: 2 }, { id: 'boneblack', parts: 1 }]).R;
  const AB = G.applyGlazeSequence(base, [{ id: 'indigo', parts: 1 }, { id: 'madderlake', parts: 1 }]);
  const BA = G.applyGlazeSequence(base, [{ id: 'madderlake', parts: 1 }, { id: 'indigo', parts: 1 }]);
  check('glazing A-then-B differs from B-then-A', maxAbsDiff(AB, BA) > 0.02, { AB, BA });
}

// 8. Glaze reduces to identity-ish at zero-effective-thickness edge case
//    doesn't apply here (parts>0 always), instead: a heavier glaze pulls the
//    result further toward the glaze's own masstone color than a light one.
{
  const base = G.mixKM([{ id: 'leadwhite', parts: 3 }]).R;
  const light = G.applyGlaze(base, 'madderlake', 1);
  const heavy = G.applyGlaze(base, 'madderlake', 4);
  const ownR = G.kmReflectance(...(() => { const p = G.pigmentById('madderlake'); return [p.K, p.S]; })());
  const distToOwn = (r) => Math.sqrt(r.reduce((s, v, i) => s + (v - ownR[i]) ** 2, 0));
  check('heavier glaze pulls closer to the glaze pigment\'s own masstone', distToOwn(heavy) < distToOwn(light), { distToOwn: [distToOwn(light), distToOwn(heavy)] });
}

// 9. REQUIRED: every commission reachable (solver) — independent search,
//    not a replay of the authored recipe.
{
  let allSolved = true;
  const failures = [];
  for (const c of G.COMMISSIONS) {
    const found = G.solverVerify(c);
    if (!found) { allSolved = false; failures.push(c.id); }
  }
  check('every one of the 15 commissions is solver-reachable', allSolved, failures);
}

// 10. Solver-found recipes independently pass scoreRecipe (no shortcut trust).
{
  let allIndependentlyPass = true;
  for (const c of G.COMMISSIONS) {
    const found = G.solverVerify(c);
    if (!found) { allIndependentlyPass = false; continue; }
    const R = found.glaze ? G.applyGlazeSequence(G.mixKM(found.mix).R, found.glaze) : G.mixKM(found.mix).R;
    const s = G.scoreRecipe(c, R);
    if (!s.pass) allIndependentlyPass = false;
  }
  check('every solver-found recipe independently re-verified as a pass', allIndependentlyPass);
}

// 11. Restoration commissions genuinely ban anachronistic pigments.
check('leadtinyellow banned for the 1280 panel (invented ~1300)', G.isPigmentBanned(G.COMMISSIONS.find(c => c.id === 'c11'), 'leadtinyellow'));
check('leadtinyellow banned for the 1290 robe', G.isPigmentBanned(G.COMMISSIONS.find(c => c.id === 'c12'), 'leadtinyellow'));
check('ultramarine banned for the 1150 capital (arrives ~1200)', G.isPigmentBanned(G.COMMISSIONS.find(c => c.id === 'c13'), 'ultramarine'));
check('rawumber NOT banned anywhere (ancient earth pigment)', !G.isPigmentBanned(G.COMMISSIONS.find(c => c.id === 'c11'), 'rawumber'));
check('every 1520 commission (c15) allows the full palette', G.allowedPalette(G.COMMISSIONS.find(c => c.id === 'c15')).length === G.PIGMENTS.length);

// 12. REQUIRED: scorer monotonic (non-increasing) in band distance.
{
  const des = [0, 0.5, 1, 2, 3, 4, 6, 8, 11];
  const scores = des.map(d => G.scoreForDeltaE(d));
  let monotonic = true;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[i - 1]) monotonic = false;
  check('scoreForDeltaE non-increasing across increasing distance', monotonic, scores);
  check('scoreForDeltaE(0) is the max (100)', G.scoreForDeltaE(0) === 100);
  check('scoreForDeltaE never negative', scores.every(s => s >= 0), scores);
}

// 13. REQUIRED: determinism of mixKM, applyGlaze, and the PRNG.
{
  const a = G.mixKM([{ id: 'azurite', parts: 2, grind: 0.4 }, { id: 'leadtinyellow', parts: 1 }]);
  const b = G.mixKM([{ id: 'azurite', parts: 2, grind: 0.4 }, { id: 'leadtinyellow', parts: 1 }]);
  check('mixKM deterministic for identical input', deepEq(a, b));
}
{
  const base = G.mixKM([{ id: 'leadwhite', parts: 3 }]).R;
  const a = G.applyGlaze(base, 'indigo', 2, 0);
  const b = G.applyGlaze(base, 'indigo', 2, 0);
  check('applyGlaze deterministic for identical input', deepEq(a, b));
}
{
  const seq = (seed) => { const r = G.mulberry32(seed); return [r(), r(), r()]; };
  check('mulberry32 deterministic per seed', deepEq(seq(42), seq(42)));
  check('mulberry32 differs across seeds', !deepEq(seq(1), seq(2)));
}

// 14. REQUIRED: bounds over >=100 seeds — every seeded practice swatch is
//     valid (in-range reflectance, no incompatible pigments) and reachable.
{
  let allValid = true, allSolved = true, allDeterministic = true;
  const failures = [];
  for (let seed = 0; seed < 100; seed++) {
    const sw = G.randomSwatch(seed);
    const sw2 = G.randomSwatch(seed);
    if (!deepEq(sw, sw2)) allDeterministic = false;
    if (!sw.R.every(v => v >= 0 && v <= 1)) allValid = false;
    const ids = sw.recipeUsed.map(r => r.id);
    if (G.findIncompatibilities(ids).length > 0) allValid = false;
    const found = G.solveSwatch(sw);
    if (!found) { allSolved = false; failures.push(seed); }
  }
  check('randomSwatch deterministic across all 100 seeds', allDeterministic);
  check('randomSwatch produces valid reflectance + no incompatible pairs, 100 seeds', allValid);
  check('every one of 100 seeded practice swatches is solver-reachable', allSolved, failures.slice(0, 5));
}

// 15. kmReflectanceBand sanity: 0 absorption -> full reflectance; increasing
//     absorption is strictly monotonic decreasing.
{
  check('kmReflectanceBand(0) is 1 (no absorption, full reflectance)', G.kmReflectanceBand(0) === 1);
  const ks = [0, 0.5, 1, 2, 5, 10];
  const rs = ks.map(k => G.kmReflectanceBand(k));
  let monotonic = true;
  for (let i = 1; i < rs.length; i++) if (rs[i] >= rs[i - 1]) monotonic = false;
  check('kmReflectanceBand strictly decreasing in K/S', monotonic, rs);
  check('kmReflectanceBand stays within [0,1]', rs.every(r => r >= 0 && r <= 1), rs);
}

// 16. mixKM rejects degenerate input (defensive, since UI could pass bad state).
{
  let threw = false;
  try { G.mixKM([]); } catch (e) { threw = true; }
  check('mixKM throws on empty selection', threw);
}

// 17. Commission data integrity.
check('exactly 15 commissions', G.COMMISSIONS.length === 15, G.COMMISSIONS.length);
check('commission ids unique', new Set(G.COMMISSIONS.map(c => c.id)).size === 15);
check('5 flat, 5 glaze, 5 restore tiers', ['flat', 'glaze', 'restore'].every(t => G.COMMISSIONS.filter(c => c.tier === t).length === 5));
check('every commission has a valid illuminant', G.COMMISSIONS.every(c => G.ILLUMINANTS[c.illuminant] !== undefined));

// 18. Pigment data integrity.
check('exactly 12 pigments', G.PIGMENTS.length === 12, G.PIGMENTS.length);
check('pigment ids unique', new Set(G.PIGMENTS.map(p => p.id)).size === 12);
check('every pigment has 8-band K and S arrays', G.PIGMENTS.every(p => p.K.length === G.BAND_COUNT && p.S.length === G.BAND_COUNT));
check('every pigment K,S strictly positive (no divide-by-zero risk)', G.PIGMENTS.every(p => p.K.every(k => k > 0) && p.S.every(s => s > 0)));

// 19. applyGrind is a no-op for pigments without grind sensitivity.
{
  const p = G.pigmentById('vermilion');
  const a = G.applyGrind(p, 0);
  const b = G.applyGrind(p, 1);
  check('applyGrind is identical at grind 0 vs grind 1 for a non-sensitive pigment', deepEq(a, b));
}

// 20. applyGrind clamps within bounds outside [0,1].
{
  const p = G.pigmentById('azurite');
  const below = G.applyGrind(p, -5);
  const at0 = G.applyGrind(p, 0);
  const above = G.applyGrind(p, 5);
  const at1 = G.applyGrind(p, 1);
  check('applyGrind clamps below 0 to grind=0 behavior', deepEq(below, at0));
  check('applyGrind clamps above 1 to grind=1 behavior', deepEq(above, at1));
}

// 21. isMatch boundary is consistent with MATCH_TOLERANCE_DE.
check('isMatch true exactly at tolerance', G.isMatch(G.MATCH_TOLERANCE_DE));
check('isMatch false just over tolerance', !G.isMatch(G.MATCH_TOLERANCE_DE + 0.001));

// 22. tristimulus + deltaE: identical spectra under any illuminant have zero distance.
{
  const R = G.mixKM([{ id: 'rawumber', parts: 1 }]).R;
  const dDay = G.deltaE(G.tristimulus(R, 'daylight'), G.tristimulus(R, 'daylight'));
  const dCan = G.deltaE(G.tristimulus(R, 'candlelight'), G.tristimulus(R, 'candlelight'));
  check('identical spectrum has zero deltaE under daylight', dDay === 0);
  check('identical spectrum has zero deltaE under candlelight', dCan === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
