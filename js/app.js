import { Sampler } from './sampler.js';
import { Engine, scheduleOffline, offlineLength } from './engine.js';
import { ParamStore } from './params.js';
import { Mixer } from './mixer.js';
import { PARAMS } from './paper.js';
import {
  Experiment, stimulusIds, EMOTION_COLORS, renderResults, loadSessions, clearSessions, toCSV, download,
} from './experiment.js';

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// ---- theme ------------------------------------------------------------------------------------------
try { const t = localStorage.getItem('emotion-sliders.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* storage blocked */ }
$('#themeBtn').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('emotion-sliders.theme', next); } catch (e) { /* ignore */ }
};

// ---- boot -----------------------------------------------------------------------------------------
let ctx, sampler, engine, store, mixer, exp, scores;

$('#startBtn').onclick = async () => {
  const btn = $('#startBtn');
  btn.disabled = true;
  $('#bootProgress').hidden = false;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await ctx.resume();
    scores = await (await fetch('data/scores.json')).json();
    sampler = new Sampler(ctx);
    await sampler.load('audio/', (p) => {
      $('#bootFill').style.width = `${Math.round(p * 100)}%`;
      $('#bootText').textContent = `Loading sounds… ${Math.round(p * 100)} %`;
    });
    init();
    $('#boot').hidden = true;
    app.hidden = false;
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    $('#bootError').hidden = false;
    $('#bootError').textContent = `Could not start: ${err.message}. If you opened index.html directly, start it with ./start.command instead (browsers block audio files on file:// pages).`;
  }
};

// ---- main ------------------------------------------------------------------------------------------
const state = { mode: 'explore', phase: null, resultsScope: 'mine' };

function init() {
  store = new ParamStore();
  engine = new Engine(ctx, sampler, scores);
  exp = new Experiment(store, scores);
  sampler.setMasterVolume(volGain($('#volume').value));

  // faders <-> engine
  const sync = (id, value) => engine.set(id, value);
  store.onChange(sync);
  for (const p of PARAMS) sync(p.id, store.value(p.id));
  buildHelp();
  mixer = new Mixer($('#mixer'), store, () => engine.score, showHelp);

  buildScorePicker();
  buildProgressTicks();
  wireTransport();
  wireTabs();
  wireExperiment();
  requestAnimationFrame(frame);
  setMode('explore');
  window.emotionSliders = { ctx, sampler, engine, store, exp, scores };   // handy for debugging in the console
}

// The help bar holds one message per fader plus the default one, all stacked in the same grid cell with only one
// visible.  The bar is therefore always as tall as the longest message and never changes size on hover; resizing it
// moved the faders under the pointer, which changed what was hovered, which resized it again (visible as shaking).
const helpEls = new Map();
function buildHelp() {
  const bar = $('#infobar');
  bar.textContent = '';
  helpEls.clear();
  const add = (key, title, text) => {
    const msg = document.createElement('div');
    msg.className = 'help';
    const b = document.createElement('b');
    b.textContent = title;
    const span = document.createElement('span');
    span.textContent = text;
    msg.append(b, span);
    bar.append(msg);
    helpEls.set(key, msg);
  };
  PARAMS.forEach((p, i) => add(p, `${i + 1} · ${p.name}`, p.help));
  add(null, 'Seven faders, seven musical variables', 'Drag a fader — the music changes as you move it. Hover over a fader to read what it does. Double-click a fader to reset it.');
  showHelp(null);
}

/** Show the help for a fader (a PARAMS entry), or the default message for null. */
function showHelp(p) {
  for (const [key, el] of helpEls) el.classList.toggle('on', key === p);
}

const volGain = (v) => 1.6 * Math.pow(Number(v), 2);

// ---- score picker ---------------------------------------------------------------------------------------
function buildScorePicker() {
  const box = $('#scorePicker');
  box.textContent = '';
  for (const id of stimulusIds(scores)) {
    const b = document.createElement('button');
    b.dataset.score = id;
    b.innerHTML = `${id}<small>composed ${scores[id].composedEmotion}</small>`;
    b.onclick = () => selectScore(id);
    box.append(b);
  }
  markScore();
}
function markScore() {
  for (const b of document.querySelectorAll('#scorePicker button')) b.classList.toggle('active', b.dataset.score === engine.scoreId);
  const s = engine.score;
  $('#scoreNote').textContent = `${s.beats} beats · ${s.notesPerSec} notes/s at the original tempo · melody centred on ${Math.round(s.meanMelodyPitch)} (MIDI)`;
}
function selectScore(id) {
  engine.setScore(id);
  markScore();
  buildProgressTicks();
  mixer.refresh();
}

// ---- transport -----------------------------------------------------------------------------------------
function wireTransport() {
  const play = $('#playBtn');
  play.onclick = () => (engine.playing ? engine.pause() : engine.play());
  $('#stopBtn').onclick = () => engine.stop();
  $('#loopChk').onchange = (e) => { engine.loop = e.target.checked; };
  $('#volume').oninput = (e) => sampler.setMasterVolume(volGain(e.target.value));
  engine.onstate = (s) => { play.textContent = engine.playing ? '❚❚ Pause' : '▶ Play'; if (s === 'stop') setProgress(0); };
  $('#resetBtn').onclick = () => store.resetAll('reset');
  $('#wavBtn').onclick = exportWav;
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target.closest('input[type=text], textarea, button, select, [role=slider]')) return;
    e.preventDefault();
    play.click();
  });
}

function buildProgressTicks() {
  const box = $('#progressTicks');
  box.textContent = '';
  const s = engine.score;
  for (const b of s.bars.slice(1, -1)) {
    const i = document.createElement('i');
    i.style.left = `${(b / engine.loopLen) * 100}%`;
    box.append(i);
  }
}
function setProgress(beat) {
  const s = engine.score;
  $('#progressFill').style.width = `${Math.min(100, (beat / engine.loopLen) * 100)}%`;
  let bar = 1;
  s.bars.forEach((b, i) => { if (i < s.bars.length - 1 && beat >= b - 1e-6) bar = i + 1; });
  $('#barLabel').textContent = `bar ${bar} / ${s.bars.length - 1}`;
}
function frame() {
  if (engine.playing) setProgress(engine.beat);
  requestAnimationFrame(frame);
}

// ---- WAV export -----------------------------------------------------------------------------------------
async function exportWav() {
  const btn = $('#wavBtn');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Rendering…';
  try {
    const sr = 44100;
    const v = { ...engine.v };
    const seconds = offlineLength(engine.score, v) + 2.5;      // slow settings (down to x0.1) can run to minutes
    const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const sam = new Sampler(off);
    sam.banks = sampler.banks;                       // decoded buffers are shareable between contexts
    sam.master.gain.value = volGain($('#volume').value);
    scheduleOffline(sam, engine.score, v, 1);
    const buf = await off.startRendering();
    download(`${engine.scoreId}-render.wav`, new Blob([encodeWav(buf, buf.length)], { type: 'audio/wav' }), 'audio/wav');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
function encodeWav(buf, frames) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + frames * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + frames * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, frames * ch * 2, true);
  const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return out.buffer;
}

// ---- modes -----------------------------------------------------------------------------------------------
function wireTabs() {
  $('#tabExplore').onclick = () => {
    // Explore shares the faders with the task, so leaving a session half-way would corrupt it: abandon it instead.
    if (state.mode === 'experiment' && state.expPhase === 'trial' && exp.current) {
      if (!confirm('Leave the experiment? The pieces you have not finished will not be recorded.')) return;
      exp.abort();
      state.expPhase = 'setup';
    }
    setMode('explore');
  };
  $('#tabExperiment').onclick = () => setMode('experiment');
}

function setMode(mode, phase = null) {
  const prev = state.mode;
  state.mode = mode;
  if (mode === 'experiment') {
    if (phase) state.expPhase = phase;
    else if (!state.expPhase) state.expPhase = 'setup';
  }
  state.phase = mode === 'experiment' ? state.expPhase : null;
  if (mode !== prev || phase) engine.stop();
  app.dataset.mode = mode;
  app.dataset.phase = state.phase || '';
  app.dataset.blind = String($('#blindChk').checked);
  $('#tabExplore').classList.toggle('active', mode === 'explore');
  $('#tabExperiment').classList.toggle('active', mode === 'experiment');
  $('#tabExplore').setAttribute('aria-selected', String(mode === 'explore'));
  $('#tabExperiment').setAttribute('aria-selected', String(mode === 'experiment'));

  const inTrial = mode === 'experiment' && state.phase === 'trial';
  $('#screenSetup').hidden = !(mode === 'experiment' && state.phase === 'setup');
  $('#screenResults').hidden = !(mode === 'experiment' && state.phase === 'results');
  $('#stage').hidden = !(mode === 'explore' || inTrial);
  $('#exploreBanner').hidden = mode !== 'explore';
  $('#trialBanner').hidden = !inTrial;
  $('#loopChk').closest('label').hidden = inTrial;
  if (mode === 'explore') { engine.loop = $('#loopChk').checked; markScore(); buildProgressTicks(); mixer.refresh(); }
  if (state.phase === 'setup') renderStored();
}

// ---- experiment ---------------------------------------------------------------------------------------------
function wireExperiment() {
  $('#beginBtn').onclick = () => {
    store.resetAll('trial');
    const next = exp.begin($('#pid').value.trim(), $('#practiceChk').checked);
    setMode('experiment', 'trial');
    enterTrial(next);
  };
  $('#nextBtn').onclick = () => {
    if (performance.now() - trialShownAt < 700) return;
    engine.stop();
    const next = exp.advance();
    if (next) enterTrial(next);
    else showResults(exp.session);
  };
  $('#againBtn').onclick = () => { $('#pid').value = ''; setMode('experiment', 'setup'); };
  $('#backBtn').onclick = () => setMode('explore');
  $('#resMine').onclick = () => { state.resultsScope = 'mine'; drawResults(); };
  $('#resPool').onclick = () => { state.resultsScope = 'pool'; drawResults(); };
  $('#csvBtn').onclick = () => { const s = resultSessions(); download(`emotion-sliders-${s.length > 1 ? 'all' : s[0].participant}.csv`, toCSV(s), 'text/csv'); };
  $('#jsonBtn').onclick = () => { const s = resultSessions(); download(`emotion-sliders-${s.length > 1 ? 'all' : s[0].participant}.json`, JSON.stringify(s, null, 1), 'application/json'); };
  $('#poolBtn').onclick = () => { state.lastSession = null; state.resultsScope = 'pool'; showResults(null); };
  $('#csvAllBtn').onclick = () => download('emotion-sliders-all.csv', toCSV(loadSessions()), 'text/csv');
  $('#clearBtn').onclick = () => { if (confirm('Delete every stored session on this computer? Download them first if you need them.')) { clearSessions(); renderStored(); } };
}

let trialShownAt = 0;
function enterTrial(trial) {
  trialShownAt = performance.now();
  showTrial(trial);
}

/** Put a trial on screen and start it playing. */
function showTrial(trial) {
  engine.setScore(trial.score);
  engine.loop = true;
  buildProgressTicks();
  mixer.refresh();
  const done = Math.max(0, trial.index - 1);
  if (trial.practice) {
    $('#trialCount').textContent = 'Practice';
    $('#trialFill').style.width = '0%';
    $('#trialPrompt').innerHTML = 'Practice piece — try every fader. <span class="muted" style="font-size:16px">Not recorded.</span>';
  } else {
    $('#trialCount').textContent = `Piece ${trial.index} of ${exp.total}`;
    $('#trialFill').style.width = `${(done / exp.total) * 100}%`;
    $('#trialPrompt').innerHTML = `Make this piece sound <b style="color:${EMOTION_COLORS[trial.emotion]}">${trial.emotion}</b>`;
  }
  $('#nextBtn').textContent = trial.index === exp.total ? 'Finish ✓' : 'Next piece →';
  engine.play();
}

function renderStored() {
  const all = loadSessions();
  $('#storedCard').hidden = all.length === 0;
  $('#storedCount').textContent = `(${all.length})`;
  const ul = $('#storedList');
  ul.textContent = '';
  for (const s of all) {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><span class="muted"></span>`;
    li.firstChild.textContent = s.participant;
    li.lastChild.textContent = new Date(s.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ` · ${s.trials.length} pieces`;
    ul.append(li);
  }
}

function resultSessions() {
  if (state.resultsScope === 'pool' || !state.lastSession) return loadSessions();
  return [state.lastSession];
}

function showResults(session) {
  state.lastSession = session;
  if (!session) state.resultsScope = 'pool';
  setMode('experiment', 'results');
  $('#resMine').hidden = !session;
  drawResults();
}

function drawResults() {
  const sessions = resultSessions();
  $('#resMine').classList.toggle('active', state.resultsScope === 'mine' && !!state.lastSession);
  $('#resPool').classList.toggle('active', state.resultsScope === 'pool' || !state.lastSession);
  const pooled = state.resultsScope === 'pool' || !state.lastSession;
  const many = sessions.length > 1;                  // renderResults draws one dot per participant when there are several
  for (const id of ['lgRing', 'lgDot']) $(`#${id}`).hidden = many;
  for (const id of ['lgPart', 'lgMean']) $(`#${id}`).hidden = !many;
  $('#resultsTitle').textContent = pooled ? `Everyone on this computer (${sessions.length})` : `Results for ${sessions[0].participant}`;
  $('#resultsSub').textContent = pooled
    ? 'Each dot is one participant’s mean over the four scores; the large marker is the group mean.'
    : 'How your final fader positions compare with the 17 musicians in the paper.';
  if (!sessions.length) { $('#resultsBody').textContent = 'No finished sessions yet.'; return; }
  renderResults($('#resultsBody'), sessions);
}
