const cfg = window.LIGA_ZIOMKOW_CONFIG;
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const state = {
  session: null,
  user: null,
  profile: null,
  matches: [],
  predictions: [],
  ranking: [],
  groupTypy: 'ALL',
  groupMecze: 'ALL',
  channels: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const flag = (team) => (window.LZ_FLAGS && window.LZ_FLAGS[team]) || '⚽';

function polishDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pl-PL', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London'
  }).format(new Date(iso)).replace(',', '');
}

function isLocked(match) {
  return Date.now() >= new Date(match.kickoff_at).getTime();
}

function isSettled(match) {
  return match.home_score !== null && match.away_score !== null;
}

function resultSign(home, away) {
  if (home > away) return 1;
  if (home < away) return -1;
  return 0;
}

function calcPoints(pred, match) {
  if (!pred || !isSettled(match)) return 0;
  if (Number(pred.home_goals) === Number(match.home_score) && Number(pred.away_goals) === Number(match.away_score)) return 3;
  if (resultSign(Number(pred.home_goals), Number(pred.away_goals)) === resultSign(Number(match.home_score), Number(match.away_score))) return 1;
  return 0;
}

function getOwnPrediction(matchId) {
  if (!state.profile) return null;
  return state.predictions.find(p => p.match_id === matchId && p.player_id === state.profile.id) || null;
}

function getPredictionsForMatch(matchId) {
  return state.predictions.filter(p => p.match_id === matchId);
}

function setMessage(text, ok = false) {
  const el = $('#authMessage');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--ok)' : 'var(--danger)';
}

function showApp(isAuthed) {
  $('#authPanel').classList.toggle('hidden', isAuthed);
  $('#appPanel').classList.toggle('hidden', !isAuthed);
}

async function init() {
  bindEvents();
  renderHeroStats();
  const { data } = await client.auth.getSession();
  state.session = data.session;
  if (state.session) {
    state.user = state.session.user;
    await loadAuthedState();
  } else {
    showApp(false);
  }

  client.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    if (session) await loadAuthedState();
    else {
      unsubscribeRealtime();
      state.profile = null;
      state.matches = [];
      state.predictions = [];
      state.ranking = [];
      showApp(false);
    }
  });
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('Logowanie... ', true);
    const email = $('#emailInput').value.trim();
    const password = $('#passwordInput').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setMessage('Nie udało się zalogować: ' + error.message);
    else setMessage('Zalogowano.', true);
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await client.auth.signOut();
  });

  $('#refreshBtn').addEventListener('click', async () => {
    await loadAllData();
    renderAll();
  });

  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(section => section.classList.remove('active'));
    $('#view-' + view).classList.add('active');
  }));
}

async function loadAuthedState() {
  showApp(true);
  const { data: profile, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .single();

  if (error) {
    $('#currentUserName').textContent = 'Brak profilu';
    $('#currentUserRole').textContent = 'Konto nie jest połączone z graczem.';
    return;
  }
  state.profile = profile;
  $('#currentUserName').textContent = profile.display_name;
  $('#currentUserRole').textContent = profile.is_admin ? 'Admin wyników' : 'Typer';
  $$('.admin-only').forEach(el => el.classList.toggle('hidden', !profile.is_admin));

  await loadAllData();
  renderAll();
  subscribeRealtime();
}

async function loadAllData() {
  const [matchesResult, predictionsResult, rankingResult] = await Promise.all([
    client.from('matches').select('*').order('match_no', { ascending: true }),
    client.from('predictions').select('*, profiles(display_name, short_name)').order('updated_at', { ascending: false }),
    client.from('ranking').select('*')
  ]);

  if (matchesResult.error) console.error(matchesResult.error);
  if (predictionsResult.error) console.error(predictionsResult.error);
  if (rankingResult.error) console.error(rankingResult.error);

  state.matches = matchesResult.data || [];
  state.predictions = predictionsResult.data || [];
  state.ranking = rankingResult.data || [];
}

function subscribeRealtime() {
  unsubscribeRealtime();
  const channel = client.channel('liga-ziomkow-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refreshAfterRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, refreshAfterRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshAfterRealtime)
    .subscribe();
  state.channels.push(channel);
}

function unsubscribeRealtime() {
  state.channels.forEach(ch => client.removeChannel(ch));
  state.channels = [];
}

let refreshTimer = null;
function refreshAfterRealtime() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await loadAllData();
    renderAll();
  }, 250);
}

function renderAll() {
  renderHeroStats();
  renderFilters('groupFiltersTypy', 'groupTypy');
  renderFilters('groupFiltersMecze', 'groupMecze');
  renderRanking();
  renderPredictions();
  renderSchedule();
  renderAdmin();
  renderRecentSettled();
}

function renderHeroStats() {
  const totalMatches = state.matches.length || 72;
  const settled = state.matches.filter(isSettled).length;
  const allPreds = state.predictions.length;
  const groups = Object.keys(window.LZ_GROUPS || {}).length || 12;
  $('#heroStats').innerHTML = [
    ['Grupy', groups], ['Mecze', totalMatches], ['Wyniki', settled], ['Typy', allPreds]
  ].map(([label, value]) => `<div class="hero-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderFilters(containerId, stateKey) {
  const active = state[stateKey];
  const groups = ['ALL', ...Object.keys(window.LZ_GROUPS || {})];
  $('#' + containerId).innerHTML = groups.map(g => `<button class="filter-btn ${active === g ? 'active' : ''}" data-group="${g}" data-key="${stateKey}">${g === 'ALL' ? 'Wszystkie' : 'Grupa ' + g}</button>`).join('');
  $$('#' + containerId + ' .filter-btn').forEach(btn => btn.addEventListener('click', () => {
    state[btn.dataset.key] = btn.dataset.group;
    renderAll();
  }));
}

function filteredMatches(group) {
  if (group === 'ALL') return state.matches;
  return state.matches.filter(m => m.group_code === group);
}

function renderRanking() {
  const rows = [...state.ranking].sort((a, b) =>
    (b.points - a.points) || (b.exact_scores - a.exact_scores) || (b.correct_outcomes - a.correct_outcomes) || a.display_name.localeCompare(b.display_name)
  );
  $('#rankingCards').innerHTML = rows.map((row, index) => `
    <article class="panel player-card" data-place="#${index + 1}">
      <p class="eyebrow">Miejsce ${index + 1}</p>
      <div class="player-name">${escapeHtml(row.display_name)}</div>
      <div class="player-points">${row.points}</div>
      <div class="mini-stats">
        <span>dokładne: ${row.exact_scores}</span>
        <span>rozstrzygnięcia: ${row.correct_outcomes}</span>
        <span>rozliczone: ${row.settled_predictions}</span>
      </div>
    </article>
  `).join('') || emptyPanel('Brak rankingu', 'Dodaj profile graczy i typy w Supabase.');
}

function renderPredictions() {
  const list = filteredMatches(state.groupTypy);
  $('#predictionMatches').innerHTML = list.map(match => predictionCard(match)).join('') || emptyPanel('Brak meczów', 'Najpierw załaduj terminarz do tabeli matches.');
  $$('.save-prediction').forEach(btn => btn.addEventListener('click', savePrediction));
}

function renderSchedule() {
  const list = filteredMatches(state.groupMecze);
  $('#scheduleMatches').innerHTML = list.map(match => scheduleCard(match)).join('') || emptyPanel('Brak meczów', 'Najpierw załaduj terminarz do tabeli matches.');
}

function renderAdmin() {
  if (!state.profile?.is_admin) {
    $('#adminMatches').innerHTML = emptyPanel('Brak dostępu', 'Tylko Marcin/admin może wpisywać oficjalne wyniki.');
    return;
  }
  $('#adminMatches').innerHTML = state.matches.map(match => adminCard(match)).join('') || emptyPanel('Brak meczów', 'Najpierw załaduj terminarz do tabeli matches.');
  $$('.save-result').forEach(btn => btn.addEventListener('click', saveResult));
  $$('.clear-result').forEach(btn => btn.addEventListener('click', clearResult));
}

function renderRecentSettled() {
  const recent = state.matches.filter(isSettled).slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6);
  $('#recentSettled').innerHTML = recent.map(match => scheduleCard(match, true)).join('') || '<p class="muted">Jeszcze nie ma rozliczonych meczów.</p>';
}

function matchHeader(match) {
  const status = isSettled(match) ? '<span class="status-pill settled">rozliczony</span>' : isLocked(match) ? '<span class="status-pill locked">zablokowany</span>' : '<span class="status-pill open">otwarty</span>';
  return `<div class="match-meta"><span><b class="group-badge">${match.group_code}</b> #${match.match_no} · ${polishDate(match.kickoff_at)} UK</span>${status}</div>`;
}

function teamsRow(match) {
  const score = isSettled(match) ? `${match.home_score} : ${match.away_score}` : '— : —';
  return `<div class="teams">
    <div class="team home"><span class="flag">${flag(match.home_team)}</span><span>${escapeHtml(match.home_team)}</span></div>
    <div class="score-box">${score}</div>
    <div class="team away"><span>${escapeHtml(match.away_team)}</span><span class="flag">${flag(match.away_team)}</span></div>
  </div>`;
}

function predictionCard(match) {
  const own = getOwnPrediction(match.id);
  const locked = isLocked(match);
  const disabled = locked ? 'disabled' : '';
  const buttonLabel = own ? 'Zapisz zmianę' : 'Zapisz typ';
  const points = own && isSettled(match) ? calcPoints(own, match) : null;
  return `<article class="panel match-card">
    ${matchHeader(match)}
    ${teamsRow(match)}
    <div class="score-inputs">
      <input ${disabled} inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="pred-home-${match.id}" value="${own?.home_goals ?? ''}" placeholder="0" />
      <div class="prediction-box">:</div>
      <input ${disabled} inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="pred-away-${match.id}" value="${own?.away_goals ?? ''}" placeholder="0" />
    </div>
    <div class="match-actions" style="margin-top:10px">
      <button class="gold save-prediction" data-match="${match.id}" ${disabled}>${buttonLabel}</button>
      ${points !== null ? `<span class="status-pill settled">Twoje punkty: ${points}</span>` : ''}
      ${locked ? '<span class="muted">Typowanie zamknięte.</span>' : '<span class="muted">Możesz zmieniać do startu meczu.</span>'}
    </div>
    ${predictionsGrid(match)}
  </article>`;
}

function scheduleCard(match, compact = false) {
  return `<article class="panel match-card ${compact ? 'compact' : ''}">
    ${matchHeader(match)}
    ${teamsRow(match)}
    ${predictionsGrid(match)}
  </article>`;
}

function adminCard(match) {
  return `<article class="panel match-card">
    ${matchHeader(match)}
    <div class="teams">
      <div class="team home"><span class="flag">${flag(match.home_team)}</span><span>${escapeHtml(match.home_team)}</span></div>
      <div class="score-inputs">
        <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="res-home-${match.id}" value="${match.home_score ?? ''}" placeholder="0" />
        <div class="prediction-box">:</div>
        <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="res-away-${match.id}" value="${match.away_score ?? ''}" placeholder="0" />
      </div>
      <div class="team away"><span>${escapeHtml(match.away_team)}</span><span class="flag">${flag(match.away_team)}</span></div>
    </div>
    <div class="match-actions">
      <button class="gold save-result" data-match="${match.id}">Zapisz wynik</button>
      <button class="ghost clear-result" data-match="${match.id}">Wyczyść wynik</button>
    </div>
  </article>`;
}

function predictionsGrid(match) {
  const preds = getPredictionsForMatch(match.id);
  if (!preds.length) return `<div class="predictions-grid"><div class="pred-chip"><strong>Typy</strong><span class="muted">Brak widocznych typów.</span></div></div>`;
  const byName = new Map(preds.map(p => [p.profiles?.display_name || p.player_id, p]));
  return `<div class="predictions-grid">${window.LZ_PLAYERS.map(name => {
    const pred = byName.get(name);
    const content = pred ? `${pred.home_goals}:${pred.away_goals}${isSettled(match) ? ` · ${calcPoints(pred, match)} pkt` : ''}` : (isLocked(match) ? 'brak typu' : 'ukryty / brak');
    return `<div class="pred-chip"><strong>${name}</strong><span>${content}</span></div>`;
  }).join('')}</div>`;
}

async function savePrediction(event) {
  const matchId = event.currentTarget.dataset.match;
  const match = state.matches.find(m => m.id === matchId);
  if (!match || !state.profile) return;
  if (isLocked(match)) {
    alert('Ten mecz już się rozpoczął. Typ jest zablokowany.');
    return;
  }
  const home = parseInt($(`#pred-home-${matchId}`).value, 10);
  const away = parseInt($(`#pred-away-${matchId}`).value, 10);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    alert('Wpisz poprawny wynik, np. 2 i 1.');
    return;
  }
  const { error } = await client.from('predictions').upsert({
    match_id: matchId,
    player_id: state.profile.id,
    home_goals: home,
    away_goals: away
  }, { onConflict: 'match_id,player_id' });
  if (error) alert('Nie udało się zapisać typu: ' + error.message);
  else await refreshAfterRealtime();
}

async function saveResult(event) {
  const matchId = event.currentTarget.dataset.match;
  const homeRaw = $(`#res-home-${matchId}`).value;
  const awayRaw = $(`#res-away-${matchId}`).value;
  const home = parseInt(homeRaw, 10);
  const away = parseInt(awayRaw, 10);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    alert('Wpisz poprawny oficjalny wynik.');
    return;
  }
  const { error } = await client.from('matches').update({ home_score: home, away_score: away }).eq('id', matchId);
  if (error) alert('Nie udało się zapisać wyniku: ' + error.message);
  else await refreshAfterRealtime();
}

async function clearResult(event) {
  const matchId = event.currentTarget.dataset.match;
  if (!confirm('Wyczyścić oficjalny wynik tego meczu?')) return;
  const { error } = await client.from('matches').update({ home_score: null, away_score: null }).eq('id', matchId);
  if (error) alert('Nie udało się wyczyścić wyniku: ' + error.message);
  else await refreshAfterRealtime();
}

function emptyPanel(title, text) {
  return `<div class="panel" style="padding:18px"><h3>${title}</h3><p class="muted">${text}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init().catch(err => {
  console.error(err);
  setMessage('Błąd startu aplikacji: ' + err.message);
});
