import * as G from './pigment.mjs';

const STORAGE_KEY = 'muller_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt storage */ }
  return null;
}
function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ commissionIndex: s.commissionIndex, results: s.results }));
  } catch (e) { /* storage unavailable — session still playable */ }
}

const state = {
  commissionIndex: 0,
  results: [],
  phase: 'title',
  mixSelections: [],   // [{id, parts, grind}]
  glazeLayers: [],      // [{id, parts}]
  viewIlluminant: 'daylight',
  lastVerdict: null,
};

(function restore() {
  const saved = loadState();
  if (saved) { state.commissionIndex = saved.commissionIndex ?? 0; state.results = saved.results ?? []; }
})();

function currentCommission() { return G.COMMISSIONS[state.commissionIndex]; }

function resetBench() {
  const c = currentCommission();
  state.mixSelections = [];
  state.glazeLayers = [];
  state.viewIlluminant = c ? c.illuminant : 'daylight';
}

// ---------------- pure-ish helpers over the core ----------------

function currentBaseR() {
  if (state.mixSelections.length === 0) return null;
  return G.mixKM(state.mixSelections).R;
}
function currentFinalR() {
  const base = currentBaseR();
  if (!base) return null;
  return state.glazeLayers.length ? G.applyGlazeSequence(base, state.glazeLayers) : base;
}
function currentIncompatibilities() {
  const ids = state.mixSelections.map(m => m.id);
  return G.findIncompatibilities(ids);
}

// Cosmetic only — not part of the pure core. Maps an 8-band reflectance,
// viewed under a named illuminant, to a displayable CSS color via the
// core's own tristimulus() so the swatch genuinely shifts between daylight
// and candlelight previews the same way the scoring does.
function toDisplayRGB(R, illuminantName) {
  const t = G.tristimulus(R, illuminantName);
  const white = G.tristimulus(new Array(G.BAND_COUNT).fill(1), illuminantName);
  const norm = t.map((v, i) => Math.max(0, v / white[i]));
  const toByte = (v) => Math.max(0, Math.min(255, Math.round(Math.pow(v, 0.62) * 255)));
  return `rgb(${toByte(norm[2])}, ${toByte(norm[1])}, ${toByte(norm[0])})`;
}

// ---------------- rendering ----------------

const $ = (id) => document.getElementById(id);
const screens = ['title-screen', 'howto-screen', 'bench-screen', 'verdict-screen', 'complete-screen'];

function showScreen(name) {
  state.phase = name;
  for (const id of screens) $(id).classList.toggle('active', id === `${name}-screen`);
  render();
}

function render() {
  if (state.phase === 'bench') renderBench();
  if (state.phase === 'verdict') renderVerdict();
  if (state.phase === 'complete') renderComplete();
}

function partsLabel(sel) {
  return sel.parts > 0 ? `${sel.parts}` : '';
}

function renderBench() {
  const c = currentCommission();
  if (!c) { showScreen('complete'); return; }

  $('commission-name').textContent = c.name;
  $('commission-index').textContent = `${state.commissionIndex + 1} / ${G.COMMISSIONS.length}`;
  $('commission-client').textContent = `for ${c.client}`;
  $('commission-illuminant').textContent = `wanted under ${c.illuminant === 'daylight' ? 'daylight' : 'candlelight'}`;

  const banned = c.tier === 'restore' ? G.PIGMENTS.filter(p => G.isPigmentBanned(c, p.id)) : [];
  const bannedEl = $('banned-note');
  if (banned.length) {
    bannedEl.style.display = 'block';
    bannedEl.textContent = `not yet invented this century: ${banned.map(p => p.name).join(', ')}`;
  } else {
    bannedEl.style.display = 'none';
  }

  const target = G.commissionTarget(c);
  $('swatch-target').style.background = toDisplayRGB(target.R, state.viewIlluminant);
  const finalR = currentFinalR();
  $('swatch-mine').style.background = finalR ? toDisplayRGB(finalR, state.viewIlluminant) : 'transparent';
  $('view-illuminant-label').textContent = state.viewIlluminant === 'daylight' ? 'Daylight' : 'Candlelight';

  const incompat = currentIncompatibilities();
  const warnEl = $('incompat-warning');
  if (incompat.length) {
    warnEl.style.display = 'block';
    warnEl.textContent = `these two must never touch: ${incompat.map(p => `${G.pigmentById(p.a).name} + ${G.pigmentById(p.b).name} — ${p.reason}`).join('; ')}`;
  } else {
    warnEl.style.display = 'none';
  }

  const grid = $('stock-grid');
  grid.innerHTML = '';
  for (const p of G.PIGMENTS) {
    const sel = state.mixSelections.find(m => m.id === p.id);
    const isBanned = G.isPigmentBanned(c, p.id);
    const wouldClash = !isBanned && state.mixSelections.some(m => m.id !== p.id && G.isIncompatible(m.id, p.id));
    const chip = document.createElement('div');
    chip.className = 'pigment-chip'
      + (isBanned ? ' banned' : '')
      + (sel ? ' active' : '')
      + (wouldClash ? ' clash' : '');
    chip.innerHTML = `<span class="pigment-name">${p.name}</span><span class="pigment-parts">${sel ? partsLabel(sel) : ''}</span>`;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `${p.name}${isBanned ? ', not yet invented' : ''}`);
    if (!isBanned) chip.addEventListener('click', () => cyclePigment(p.id));
    grid.appendChild(chip);
  }

  const grindWrap = $('grind-controls');
  grindWrap.innerHTML = '';
  for (const sel of state.mixSelections) {
    const pig = G.pigmentById(sel.id);
    if (!pig.grindDeltaK && !pig.grindDeltaS) continue;
    const row = document.createElement('div');
    row.className = 'grind-row';
    row.innerHTML = `<label>${pig.name} grind: <span class="grind-value">${sel.grind ? (sel.grind >= 1 ? 'coarse' : 'medium') : 'fine'}</span></label>
      <input type="range" min="0" max="1" step="0.5" value="${sel.grind || 0}">`;
    row.querySelector('input').addEventListener('input', (e) => setGrind(sel.id, parseFloat(e.target.value)));
    grindWrap.appendChild(row);
  }

  const glazeSection = $('glaze-section');
  if (c.tier === 'glaze') {
    glazeSection.style.display = 'block';
    const list = $('glaze-list');
    list.innerHTML = '';
    if (state.glazeLayers.length === 0) {
      list.innerHTML = '<span class="muted">no glaze laid down yet</span>';
    } else {
      state.glazeLayers.forEach((layer, i) => {
        const chip = document.createElement('span');
        chip.className = 'glaze-chip';
        chip.textContent = `${i + 1}. ${G.pigmentById(layer.id).name}`;
        chip.addEventListener('click', () => removeGlazeLayer(i));
        list.appendChild(chip);
      });
    }
  } else {
    glazeSection.style.display = 'none';
  }

  const canTest = currentFinalR() !== null && incompat.length === 0;
  $('btn-test-daub').disabled = !canTest;
}

function renderVerdict() {
  const v = state.lastVerdict;
  if (!v) return;
  const c = currentCommission();
  $('verdict-swatch-target').style.background = toDisplayRGB(v.targetR, c.illuminant);
  $('verdict-swatch-mine').style.background = toDisplayRGB(v.mineR, c.illuminant);
  $('verdict-headline').textContent = v.pass ? verdictPassLine(v) : verdictFailLine(v);
  $('verdict-headline').className = v.pass ? 'verdict-pass' : 'verdict-fail';
  $('verdict-detail').textContent = `distance ${v.dE.toFixed(2)} · score ${v.score} · tolerance ${G.MATCH_TOLERANCE_DE}`;
  $('btn-verdict-next').style.display = v.pass ? 'inline-block' : 'none';
  $('btn-verdict-retry').style.display = v.pass ? 'none' : 'inline-block';
}

function verdictPassLine(v) {
  const c = currentCommission();
  const pigCount = state.mixSelections.length + state.glazeLayers.length;
  if (pigCount <= c.par) return 'the master nods — well within the ground';
  return 'close enough — the client will never know';
}
function verdictFailLine() {
  return 'not yet — hold it to the light and try again';
}

function renderComplete() {
  const passed = state.results.filter(r => r.pass).length;
  $('complete-summary').textContent = `${passed} of ${state.results.length} commissions matched. The workshop's ledger is closed for the day.`;
  const best = state.results.filter(r => r.pass).sort((a, b) => a.pigmentCount - b.pigmentCount)[0];
  const shareLine = best
    ? `MULLER · matched "${best.name}" in ${best.pigmentCount} pigment${best.pigmentCount === 1 ? '' : 's'} · ${state.results.some(r => r.tier === 'restore') ? 'nothing anachronistic slipped through' : 'the ground holds true'} · http://muller.defimagic.io`
    : 'MULLER · http://muller.defimagic.io';
  $('share-text').textContent = shareLine;
}

// ---------------- interaction ----------------

function cyclePigment(id) {
  const c = currentCommission();
  if (G.isPigmentBanned(c, id)) return;
  const existing = state.mixSelections.find(m => m.id === id);
  if (!existing) {
    if (state.mixSelections.some(m => G.isIncompatible(m.id, id))) return; // block, banner explains
    state.mixSelections.push({ id, parts: 1, grind: 0 });
  } else if (existing.parts < 3) {
    existing.parts++;
  } else {
    state.mixSelections = state.mixSelections.filter(m => m.id !== id);
  }
  renderBench();
}

function setGrind(id, grind) {
  const existing = state.mixSelections.find(m => m.id === id);
  if (existing) existing.grind = grind;
  renderBench();
}

function addGlazeLayer(id) {
  const c = currentCommission();
  if (c.tier !== 'glaze') return;
  state.glazeLayers.push({ id, parts: 1 });
  renderBench();
}
function removeGlazeLayer(index) {
  state.glazeLayers.splice(index, 1);
  renderBench();
}

function clearBench() {
  state.mixSelections = [];
  state.glazeLayers = [];
  renderBench();
}

function toggleViewIlluminant() {
  state.viewIlluminant = state.viewIlluminant === 'daylight' ? 'candlelight' : 'daylight';
  renderBench();
}

function testDaub() {
  const c = currentCommission();
  const finalR = currentFinalR();
  if (!finalR || currentIncompatibilities().length) return;
  const target = G.commissionTarget(c);
  const s = G.scoreRecipe(c, finalR);
  const pigmentCount = state.mixSelections.length + state.glazeLayers.length;
  state.lastVerdict = { pass: s.pass, dE: s.dE, score: s.score, targetR: target.R, mineR: finalR, pigmentCount };
  if (s.pass) {
    state.results.push({ id: c.id, name: c.name, tier: c.tier, pass: true, score: s.score, pigmentCount });
    saveState(state);
  }
  showScreen('verdict');
}

function nextCommission() {
  state.commissionIndex++;
  saveState(state);
  resetBench();
  if (state.commissionIndex >= G.COMMISSIONS.length) showScreen('complete');
  else showScreen('bench');
}

function retryDaub() {
  showScreen('bench');
}

function restartWorkshop() {
  state.commissionIndex = 0;
  state.results = [];
  saveState(state);
  resetBench();
  showScreen('title');
}

// ---------------- wiring ----------------

$('btn-start').addEventListener('click', () => { resetBench(); showScreen('bench'); });
$('btn-howto').addEventListener('click', () => showScreen('howto'));
$('btn-howto-back').addEventListener('click', () => showScreen('title'));
$('btn-howto-start').addEventListener('click', () => { resetBench(); showScreen('bench'); });
$('btn-clear-mix').addEventListener('click', clearBench);
$('btn-toggle-illuminant').addEventListener('click', toggleViewIlluminant);
$('btn-test-daub').addEventListener('click', testDaub);
$('btn-glaze-madder').addEventListener('click', () => addGlazeLayer('madderlake'));
$('btn-glaze-indigo').addEventListener('click', () => addGlazeLayer('indigo'));
$('btn-verdict-next').addEventListener('click', nextCommission);
$('btn-verdict-retry').addEventListener('click', retryDaub);
$('btn-complete-restart').addEventListener('click', restartWorkshop);
$('btn-copy-share').addEventListener('click', () => {
  const text = $('share-text').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
});

resetBench();
if (state.commissionIndex >= G.COMMISSIONS.length && state.results.length > 0) {
  showScreen('complete');
} else {
  showScreen('title');
}

// ---------------- dev hook (?dev=1): scripted, headless-drivable ----------------

if (new URLSearchParams(location.search).get('dev') === '1') {
  window.__g = {
    state: () => ({
      phase: state.phase,
      commissionIndex: state.commissionIndex,
      commission: currentCommission()?.id,
      mixSelections: state.mixSelections.slice(),
      glazeLayers: state.glazeLayers.slice(),
      viewIlluminant: state.viewIlluminant,
      results: state.results.slice(),
      lastVerdict: state.lastVerdict,
      incompatibilities: currentIncompatibilities(),
    }),
    goTo: (phase) => showScreen(phase),
    tapPigment: (id) => cyclePigment(id),
    setGrind: (id, g) => setGrind(id, g),
    addGlaze: (id) => addGlazeLayer(id),
    removeGlaze: (i) => removeGlazeLayer(i),
    clearBench: () => clearBench(),
    toggleIlluminant: () => toggleViewIlluminant(),
    testDaub: () => testDaub(),
    nextCommission: () => nextCommission(),
    retryDaub: () => retryDaub(),
    restartWorkshop: () => restartWorkshop(),
    buildSolvedRecipe: () => {
      const c = currentCommission();
      const found = G.solverVerify(c);
      if (!found) return false;
      clearBench();
      for (const m of found.mix) {
        for (let i = 0; i < m.parts; i++) cyclePigment(m.id);
        if (m.grind) setGrind(m.id, m.grind);
      }
      if (found.glaze) for (const g of found.glaze) addGlazeLayer(g.id);
      return true;
    },
    resetStorage: () => { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} },
  };
}
