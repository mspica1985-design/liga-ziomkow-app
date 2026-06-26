const cfg = window.LIGA_ZIOMKOW_CONFIG;
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const ROUND_LABELS = {
  group: 'Faza grupowa',
  round_of_32: '1/32 finału',
  round_of_16: '1/16 finału',
  quarterfinal: 'Ćwierćfinał',
  semifinal: 'Półfinał',
  third_place: 'Mecz o 3. miejsce',
  final: 'Finał'
};

const ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'third_place', 'final'];
const GROUP_KEYS = Object.keys(window.LZ_GROUPS || {});

const state = {
  session: null,
  user: null,
  profile: null,
  matches: [],
  predictions: [],
  ranking: [],
  groupTypy: 'ALL',
  groupMecze: 'ALL',
  roundDrabinka: 'ALL',
  channels: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function isKnockout(match) {
  return match.stage && match.stage !== 'group';
}

function flag(team) {
  if (window.LZ_FLAGS && window.LZ_FLAGS[team]) return window.LZ_FLAGS[team];
  if (/^(W|L)\d+$/i.test(String(team || ''))) return '🏆';
  if (/^(1|2|3)[A-L]/i.test(String(team || ''))) return '🎯';
  return '⚽';
}

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

function matchWinnerSide(match) {
  if (match.winner_side === 'home' || match.winner_side === 'away') return match.winner_side;
  if (!isSettled(match)) return null;
  if (Number(match.home_score) > Number(match.away_score)) return 'home';
  if (Number(match.home_score) < Number(match.away_score)) return 'away';
  return null;
}

function predictionWinnerSide(pred, match) {
  if (pred?.winner_pick === 'home' || pred?.winner_pick === 'away') return pred.winner_pick;
  if (!pred) return null;
  if (Number(pred.home_goals) > Number(pred.away_goals)) return 'home';
  if (Number(pred.home_goals) < Number(pred.away_goals)) return 'away';
  return isKnockout(match) ? null : 'draw';
}

function calcPoints(pred, match) {
  if (!pred || !isSettled(match)) return 0;
  const exact = Number(pred.home_goals) === Number(match.home_score) && Number(pred.away_goals) === Number(match.away_score);
  if (exact) return 3;
  if (isKnockout(match)) {
    const actualWinner = matchWinnerSide(match);
    const predictedWinner = predictionWinnerSide(pred, match);
    return actualWinner && predictedWinner === actualWinner ? 1 : 0;
  }
  return resultSign(Number(pred.home_goals), Number(pred.away_goals)) === resultSign(Number(match.home_score), Number(match.away_score)) ? 1 : 0;
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
  renderRoundFilters('roundFiltersDrabinka', 'roundDrabinka');
  renderRanking();
  renderPredictions();
  renderSchedule();
  renderBracket();
  renderAdmin();
  renderRecentSettled();
}

function renderHeroStats() {
  const totalMatches = state.matches.length || 104;
  const settled = state.matches.filter(isSettled).length;
  const allPreds = state.predictions.length;
  const ko = state.matches.filter(isKnockout).length || 32;
  $('#heroStats').innerHTML = [
    ['Mecze', totalMatches], ['Drabinka', ko], ['Wyniki', settled], ['Typy', allPreds]
  ].map(([label, value]) => `<div class="hero-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderFilters(containerId, stateKey) {
  const active = state[stateKey];
  const groups = ['ALL', ...GROUP_KEYS, 'KO'];
  $('#' + containerId).innerHTML = groups.map(g => `<button class="filter-btn ${active === g ? 'active' : ''}" data-group="${g}" data-key="${stateKey}">${filterLabel(g)}</button>`).join('');
  $$('#' + containerId + ' .filter-btn').forEach(btn => btn.addEventListener('click', () => {
    state[btn.dataset.key] = btn.dataset.group;
    renderAll();
  }));
}

function renderRoundFilters(containerId, stateKey) {
  const active = state[stateKey];
  const rounds = ['ALL', ...ROUND_ORDER];
  $('#' + containerId).innerHTML = rounds.map(r => `<button class="filter-btn ${active === r ? 'active' : ''}" data-round="${r}" data-key="${stateKey}">${r === 'ALL' ? 'Cała drabinka' : ROUND_LABELS[r]}</button>`).join('');
  $$('#' + containerId + ' .filter-btn').forEach(btn => btn.addEventListener('click', () => {
    state[btn.dataset.key] = btn.dataset.round;
    renderAll();
  }));
}

function filterLabel(value) {
  if (value === 'ALL') return 'Wszystkie';
  if (value === 'KO') return 'Drabinka';
  return 'Grupa ' + value;
}

function filteredMatches(group) {
  if (group === 'ALL') return state.matches;
  if (group === 'KO') return state.matches.filter(isKnockout);
  return state.matches.filter(m => m.group_code === group);
}

function filteredRounds(round) {
  const ko = state.matches.filter(isKnockout);
  if (round === 'ALL') return ko;
  return ko.filter(m => m.stage === round);
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
        <span>rozstrzygnięcia/awans: ${row.correct_outcomes}</span>
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

function renderBracket() {
  const list = filteredRounds(state.roundDrabinka);
  if (!list.length) {
    $('#bracketMatches').innerHTML = emptyPanel('Brak drabinki', 'Odpal migrację i seed meczów 73–104 w Supabase.');
    return;
  }
  const groups = list.reduce((acc, match) => {
    const key = match.stage;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
  $('#bracketMatches').innerHTML = Object.keys(groups)
    .sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
    .map(stage => `<div class="round-block"><h3>${ROUND_LABELS[stage] || stage}</h3><div class="match-list">${groups[stage].map(match => scheduleCard(match)).join('')}</div></div>`)
    .join('');
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
  const stage = isKnockout(match) ? (ROUND_LABELS[match.stage] || match.stage) : `Grupa ${match.group_code}`;
  return `<div class="match-meta"><span><b class="group-badge">${escapeHtml(isKnockout(match) ? 'KO' : match.group_code)}</b> #${match.match_no} · ${stage} · ${polishDate(match.kickoff_at)} UK</span>${status}</div>`;
}

function teamLabel(match, side) {
  const team = side === 'home' ? match.home_team : match.away_team;
  const seed = side === 'home' ? match.home_seed : match.away_seed;
  if (team && seed && team !== seed) return `${team} <small>${seed}</small>`;
  return escapeHtml(team || seed || 'TBD');
}

function teamsRow(match) {
  const score = isSettled(match) ? scoreLabel(match) : '— : —';
  return `<div class="teams">
    <div class="team home"><span class="flag">${flag(match.home_team || match.home_seed)}</span><span>${teamLabel(match, 'home')}</span></div>
    <div class="score-box">${score}</div>
    <div class="team away"><span>${teamLabel(match, 'away')}</span><span class="flag">${flag(match.away_team || match.away_seed)}</span></div>
  </div>${winnerLine(match)}`;
}

function scoreLabel(match) {
  const base = `${match.home_score} : ${match.away_score}`;
  if (match.home_penalties !== null && match.away_penalties !== null && match.home_penalties !== undefined && match.away_penalties !== undefined) {
    return `${base}<small>k. ${match.home_penalties}:${match.away_penalties}</small>`;
  }
  return base;
}

function winnerLine(match) {
  if (!isKnockout(match)) return '';
  const side = matchWinnerSide(match);
  if (!side) return '<div class="winner-line muted">Awans: do wpisania po meczu</div>';
  const label = side === 'home' ? plainTeam(match, 'home') : plainTeam(match, 'away');
  return `<div class="winner-line">Awans: <strong>${escapeHtml(label)}</strong></div>`;
}

function plainTeam(match, side) {
  const team = side === 'home' ? match.home_team : match.away_team;
  const seed = side === 'home' ? match.home_seed : match.away_seed;
  return team || seed || 'TBD';
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
    ${isKnockout(match) ? winnerPickControl(match, own, disabled) : ''}
    <div class="match-actions" style="margin-top:10px">
      <button class="gold save-prediction" data-match="${match.id}" ${disabled}>${buttonLabel}</button>
      ${points !== null ? `<span class="status-pill settled">Twoje punkty: ${points}</span>` : ''}
      ${locked ? '<span class="muted">Typowanie zamknięte.</span>' : '<span class="muted">Możesz zmieniać do startu meczu.</span>'}
    </div>
    ${predictionsGrid(match)}
  </article>`;
}

function winnerPickControl(match, pred, disabled = '') {
  const home = plainTeam(match, 'home');
  const away = plainTeam(match, 'away');
  return `<label class="winner-picker">Kto awansuje?
    <select id="pred-winner-${match.id}" ${disabled}>
      <option value="">Wybierz drużynę</option>
      <option value="home" ${pred?.winner_pick === 'home' ? 'selected' : ''}>${escapeHtml(home)}</option>
      <option value="away" ${pred?.winner_pick === 'away' ? 'selected' : ''}>${escapeHtml(away)}</option>
    </select>
  </label>`;
}

function scheduleCard(match, compact = false) {
  return `<article class="panel match-card ${compact ? 'compact' : ''}">
    ${matchHeader(match)}
    ${teamsRow(match)}
    ${predictionsGrid(match)}
  </article>`;
}

function adminCard(match) {
  const win = matchWinnerSide(match) || '';
  return `<article class="panel match-card">
    ${matchHeader(match)}
    <div class="teams">
      <div class="team home"><span class="flag">${flag(match.home_team || match.home_seed)}</span><span>${teamLabel(match, 'home')}</span></div>
      <div class="score-inputs">
        <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="res-home-${match.id}" value="${match.home_score ?? ''}" placeholder="0" />
        <div class="prediction-box">:</div>
        <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="res-away-${match.id}" value="${match.away_score ?? ''}" placeholder="0" />
      </div>
      <div class="team away"><span>${teamLabel(match, 'away')}</span><span class="flag">${flag(match.away_team || match.away_seed)}</span></div>
    </div>
    ${isKnockout(match) ? adminKnockoutControls(match, win) : ''}
    <div class="match-actions">
      <button class="gold save-result" data-match="${match.id}">Zapisz wynik</button>
      <button class="ghost clear-result" data-match="${match.id}">Wyczyść wynik</button>
    </div>
  </article>`;
}

function adminKnockoutControls(match, win) {
  return `<div class="admin-extra-grid">
    <label>Awansuje
      <select id="res-winner-${match.id}">
        <option value="">Auto, jeśli nie ma remisu</option>
        <option value="home" ${win === 'home' ? 'selected' : ''}>${escapeHtml(plainTeam(match, 'home'))}</option>
        <option value="away" ${win === 'away' ? 'selected' : ''}>${escapeHtml(plainTeam(match, 'away'))}</option>
      </select>
    </label>
    <label>Karne gospodarze
      <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="pen-home-${match.id}" value="${match.home_penalties ?? ''}" placeholder="opcjonalnie" />
    </label>
    <label>Karne goście
      <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" id="pen-away-${match.id}" value="${match.away_penalties ?? ''}" placeholder="opcjonalnie" />
    </label>
  </div>`;
}

function predictionsGrid(match) {
  const preds = getPredictionsForMatch(match.id);
  if (!preds.length) return `<div class="predictions-grid"><div class="pred-chip"><strong>Typy</strong><span class="muted">Brak widocznych typów.</span></div></div>`;
  const byName = new Map(preds.map(p => [p.profiles?.display_name || p.player_id, p]));
  return `<div class="predictions-grid">${window.LZ_PLAYERS.map(name => {
    const pred = byName.get(name);
    const content = pred ? predictionLabel(pred, match) : (isLocked(match) ? 'brak typu' : 'ukryty / brak');
    return `<div class="pred-chip"><strong>${name}</strong><span>${content}</span></div>`;
  }).join('')}</div>`;
}

function predictionLabel(pred, match) {
  let text = `${pred.home_goals}:${pred.away_goals}`;
  if (isKnockout(match) && pred.winner_pick) {
    text += ` → ${escapeHtml(pred.winner_pick === 'home' ? plainTeam(match, 'home') : plainTeam(match, 'away'))}`;
  }
  if (isSettled(match)) text += ` · ${calcPoints(pred, match)} pkt`;
  return text;
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
  const winnerPick = isKnockout(match) ? $(`#pred-winner-${matchId}`).value : null;
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    alert('Wpisz poprawny wynik, np. 2 i 1.');
    return;
  }
  if (isKnockout(match) && !['home', 'away'].includes(winnerPick)) {
    alert('W fazie pucharowej musisz wybrać, kto awansuje.');
    return;
  }
  const { error } = await client.from('predictions').upsert({
    match_id: matchId,
    player_id: state.profile.id,
    home_goals: home,
    away_goals: away,
    winner_pick: winnerPick
  }, { onConflict: 'match_id,player_id' });
  if (error) alert('Nie udało się zapisać typu: ' + error.message);
  else await refreshAfterRealtime();
}

async function saveResult(event) {
  const matchId = event.currentTarget.dataset.match;
  const match = state.matches.find(m => m.id === matchId);
  const homeRaw = $(`#res-home-${matchId}`).value;
  const awayRaw = $(`#res-away-${matchId}`).value;
  const home = parseInt(homeRaw, 10);
  const away = parseInt(awayRaw, 10);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    alert('Wpisz poprawny oficjalny wynik.');
    return;
  }

  const update = { home_score: home, away_score: away };
  if (isKnockout(match)) {
    let winner = $(`#res-winner-${matchId}`).value;
    if (!winner && home > away) winner = 'home';
    if (!winner && away > home) winner = 'away';
    if (!['home', 'away'].includes(winner)) {
      alert('W fazie pucharowej przy remisie musisz wskazać, kto awansował.');
      return;
    }
    update.winner_side = winner;
    const penHome = parseOptionalInt($(`#pen-home-${matchId}`).value);
    const penAway = parseOptionalInt($(`#pen-away-${matchId}`).value);
    update.home_penalties = penHome;
    update.away_penalties = penAway;
  }
  const { error } = await client.from('matches').update(update).eq('id', matchId);
  if (error) alert('Nie udało się zapisać wyniku: ' + error.message);
  else await refreshAfterRealtime();
}

function parseOptionalInt(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

async function clearResult(event) {
  const matchId = event.currentTarget.dataset.match;
  if (!confirm('Wyczyścić oficjalny wynik tego meczu?')) return;
  const { error } = await client.from('matches').update({
    home_score: null,
    away_score: null,
    winner_side: null,
    home_penalties: null,
    away_penalties: null
  }).eq('id', matchId);
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
