const cfg = window.LIGA_ZIOMKOW_CONFIG;
const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const ROUND_LABELS = {
  group: 'Faza grupowa',
  round_of_32: '1/16 finału',
  round_of_16: '1/8 finału',
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

function hasKickoffPassed(match) {
  return match?.kickoff_at && Date.now() >= new Date(match.kickoff_at).getTime();
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

  const autoBtn = $('#autoBracketBtn');
  if (autoBtn) autoBtn.addEventListener('click', autoFillBracket);

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
  renderManualBracketEditor();
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
  return `<label class="winner-picker">Twój typ awansu — nie uzupełnia drabinki
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
  if (isKnockout(match) && !hasKickoffPassed(match)) {
    alert('Nie rozliczam meczu pucharowego przed jego startem. Typ zwycięzcy przed meczem zapisuje się tylko jako typ gracza i nie może uzupełniać kolejnej rundy. Po meczu wejdź w Wyniki, wpisz oficjalny wynik i wtedy zwycięzca przejdzie dalej.');
    return;
  }
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
  else {
    const savedMatch = { ...match, ...update, _officialResultSaved: true };
    await propagateKnockoutWinner(savedMatch);
    await loadAllData();
    renderAll();
  }
}

const THIRD_PLACE_ASSIGNMENTS = {
  'BEFHIJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3I', '1I': '3H', '1K': '3L', '1L': '3K' },
  'BEFGIJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3I', '1I': '3G', '1K': '3L', '1L': '3K' },
  'BEFGHJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3H', '1I': '3G', '1K': '3L', '1L': '3K' },
  'BEFGHIKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3F', '1G': '3I', '1I': '3H', '1K': '3L', '1L': '3K' },
  'BEFGHIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3H', '1I': '3G', '1K': '3L', '1L': '3I' },
  'BEFGHIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3H', '1I': '3G', '1K': '3I', '1L': '3K' },
  'BDEFIJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3I', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFHJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFHIKL': { '1A': '3E', '1B': '3I', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFHIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3L', '1L': '3I' },
  'BDEFHIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3I', '1L': '3K' },
  'BDEFGJKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFGIKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3I', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFGIJL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3L', '1L': '3I' },
  'BDEFGIJK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3I', '1L': '3K' },
  'BDEFGHKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3L', '1L': '3K' },
  'BDEFGHJL': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3L', '1L': '3E' },
  'BDEFGHJK': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3E', '1L': '3K' },
  'BDEFGHIL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3L', '1L': '3I' },
  'BDEFGHIK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3H', '1I': '3F', '1K': '3I', '1L': '3K' },
  'BDEFGHIJ': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3J', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABEFIJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3A', '1G': '3I', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABEFHJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3L', '1L': '3K' },
  'ABEFHIKL': { '1A': '3E', '1B': '3I', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3L', '1L': '3K' },
  'ABEFHIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3L', '1L': '3I' },
  'ABEFHIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3I', '1L': '3K' },
  'ABEFGJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3L', '1L': '3K' },
  'ABEFGIKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3A', '1G': '3I', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABEFGIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3L', '1L': '3I' },
  'ABEFGIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3I', '1L': '3K' },
  'ABEFGHKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3L', '1L': '3K' },
  'ABEFGHJL': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3L', '1L': '3E' },
  'ABEFGHJK': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3E', '1L': '3K' },
  'ABEFGHIL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3L', '1L': '3I' },
  'ABEFGHIK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3H', '1K': '3I', '1L': '3K' },
  'ABEFGHIJ': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3F', '1G': '3A', '1I': '3G', '1K': '3E', '1L': '3I' },
  'ABDEFIJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABDEFIKL': { '1A': '3E', '1B': '3I', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABDEFIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABDEFIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABDEFHKL': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABDEFHJL': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABDEFHJK': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABDEFHIL': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABDEFHIK': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABDEFHIJ': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABDEFGKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABDEFGJL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3J' },
  'ABDEFGJK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3J', '1L': '3K' },
  'ABDEFGIL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABDEFGIK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABDEFGIJ': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3J' },
  'ABDEFGHL': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABDEFGHK': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABDEFGHJ': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3J' },
  'ABDEFGHI': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABCEFJKL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABCEFIKL': { '1A': '3E', '1B': '3I', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABCEFIJL': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABCEFIJK': { '1A': '3E', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABCEFHKL': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABCEFHJL': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABCEFHJK': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABCEFHIL': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABCEFHIK': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABCEFHIJ': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABCEFGKL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABCEFGJL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3J' },
  'ABCEFGJK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3J', '1L': '3K' },
  'ABCEFGIL': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABCEFGIK': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABCEFGIJ': { '1A': '3E', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3J' },
  'ABCEFGHL': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABCEFGHK': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABCEFGHJ': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3J' },
  'ABCEFGHI': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABCDEFKL': { '1A': '3C', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3K' },
  'ABCDEFJL': { '1A': '3C', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABCDEFJK': { '1A': '3C', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABCDEFIL': { '1A': '3C', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3I' },
  'ABCDEFIK': { '1A': '3C', '1B': '3E', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3I', '1L': '3K' },
  'ABCDEFIJ': { '1A': '3C', '1B': '3J', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABCDEFHL': { '1A': '3H', '1B': '3F', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3D', '1K': '3L', '1L': '3E' },
  'ABCDEFHK': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3D', '1L': '3K' },
  'ABCDEFHJ': { '1A': '3H', '1B': '3J', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3D', '1L': '3E' },
  'ABCDEFHI': { '1A': '3H', '1B': '3E', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3D', '1L': '3I' },
  'ABCDEFGL': { '1A': '3C', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3L', '1L': '3E' },
  'ABCDEFGK': { '1A': '3C', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3K' },
  'ABCDEFGJ': { '1A': '3C', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3J' },
  'ABCDEFGI': { '1A': '3C', '1B': '3G', '1D': '3B', '1E': '3D', '1G': '3A', '1I': '3F', '1K': '3E', '1L': '3I' },
  'ABCDEFGH': { '1A': '3H', '1B': '3G', '1D': '3B', '1E': '3C', '1G': '3A', '1I': '3F', '1K': '3D', '1L': '3E' }
};


function setAutoBracketMessage(text, ok = false) {
  const el = $('#autoBracketMessage');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--ok)' : 'var(--danger)';
}

function setManualBracketMessage(text, ok = false) {
  const el = $('#manualBracketMessage');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--ok)' : 'var(--danger)';
}

function manualTeamOptions(matches = []) {
  const baseTeams = Object.values(window.LZ_GROUPS || {}).flat();
  const seeds = [];
  for (const group of GROUP_KEYS) {
    seeds.push(`1${group}`, `2${group}`, `3${group}`);
  }
  const current = matches.flatMap(m => [m.home_team, m.away_team, m.home_seed, m.away_seed]).filter(Boolean);
  return [...new Set([...baseTeams, ...current, ...seeds])].sort((a, b) => String(a).localeCompare(String(b), 'pl'));
}

function renderManualBracketEditor() {
  const container = $('#manualBracketEditor');
  if (!container) return;
  if (!state.profile?.is_admin) {
    container.innerHTML = '';
    return;
  }
  const matches = state.matches
    .filter(m => Number(m.match_no) >= 73 && Number(m.match_no) <= 88)
    .sort((a, b) => Number(a.match_no) - Number(b.match_no));
  if (!matches.length) {
    container.innerHTML = '<p class="muted">Brak meczów 73–88 w bazie.</p>';
    return;
  }
  const options = manualTeamOptions(matches).map(team => `<option value="${escapeHtml(team)}"></option>`).join('');
  container.innerHTML = `
    <datalist id="manualTeamOptions">${options}</datalist>
    ${matches.map(match => `
      <div class="manual-match-row">
        <div class="manual-match-title">
          <strong>#${match.match_no}</strong>
          <span>${ROUND_LABELS[match.stage] || match.stage}</span>
          <small>${escapeHtml(match.home_seed || '')} vs ${escapeHtml(match.away_seed || '')}</small>
        </div>
        <input list="manualTeamOptions" id="manual-home-${match.id}" value="${escapeHtml(match.home_team || '')}" placeholder="${escapeHtml(match.home_seed || 'Gospodarz')}" />
        <span class="manual-vs">vs</span>
        <input list="manualTeamOptions" id="manual-away-${match.id}" value="${escapeHtml(match.away_team || '')}" placeholder="${escapeHtml(match.away_seed || 'Gość')}" />
        <button class="ghost save-manual-pair" data-match="${match.id}" type="button">Zapisz</button>
      </div>
    `).join('')}`;
  $$('.save-manual-pair').forEach(btn => btn.addEventListener('click', saveManualPair));
}

async function saveManualPair(event) {
  if (!state.profile?.is_admin) return;
  const matchId = event.currentTarget.dataset.match;
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  const homeRaw = $(`#manual-home-${matchId}`)?.value.trim() || '';
  const awayRaw = $(`#manual-away-${matchId}`)?.value.trim() || '';
  const update = {
    home_team: homeRaw && homeRaw.toUpperCase() !== 'TBD' ? homeRaw : null,
    away_team: awayRaw && awayRaw.toUpperCase() !== 'TBD' ? awayRaw : null
  };
  setManualBracketMessage(`Zapisuję parę meczu #${match.match_no}...`, true);
  const { error } = await client.from('matches').update(update).eq('id', matchId);
  if (error) {
    setManualBracketMessage('Nie udało się zapisać pary: ' + error.message);
    alert('Nie udało się zapisać pary: ' + error.message);
    return;
  }
  await loadAllData();
  renderAll();
  setManualBracketMessage(`Zapisane: mecz #${match.match_no}.`, true);
}

function buildGroupTables() {
  const incomplete = [];
  const incompleteByGroup = {};
  const completedGroups = new Set();
  const tables = {};

  for (const group of GROUP_KEYS) {
    const teams = (window.LZ_GROUPS[group] || []).map(team => ({
      group, team, played: 0, points: 0, gf: 0, ga: 0, gd: 0, wins: 0, draws: 0, losses: 0
    }));
    const byTeam = new Map(teams.map(t => [t.team, t]));
    const matches = state.matches.filter(m => m.stage === 'group' && m.group_code === group);
    const missing = [];

    for (const match of matches) {
      if (!isSettled(match)) {
        const label = `#${match.match_no} ${match.home_team} - ${match.away_team}`;
        incomplete.push(label);
        missing.push(label);
        continue;
      }
      const home = byTeam.get(match.home_team);
      const away = byTeam.get(match.away_team);
      if (!home || !away) continue;
      const hs = Number(match.home_score);
      const as = Number(match.away_score);
      home.played += 1; away.played += 1;
      home.gf += hs; home.ga += as; home.gd = home.gf - home.ga;
      away.gf += as; away.ga += hs; away.gd = away.gf - away.ga;
      if (hs > as) { home.points += 3; home.wins += 1; away.losses += 1; }
      else if (hs < as) { away.points += 3; away.wins += 1; home.losses += 1; }
      else { home.points += 1; away.points += 1; home.draws += 1; away.draws += 1; }
    }

    teams.sort(compareStandingRows);
    tables[group] = teams;
    incompleteByGroup[group] = missing;
    if (matches.length >= 6 && missing.length === 0) completedGroups.add(group);
  }

  return { tables, incomplete, incompleteByGroup, completedGroups };
}

function compareStandingRows(a, b) {
  return (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf) || a.team.localeCompare(b.team, 'pl');
}

function rankingKey(row) {
  return `${row.points}:${row.gd}:${row.gf}`;
}

function groupTieProblems(tables, groupsToCheck = GROUP_KEYS) {
  const problems = [];
  for (const group of groupsToCheck) {
    const rows = tables[group] || [];
    for (let i = 0; i < rows.length - 1; i++) {
      if (rankingKey(rows[i]) === rankingKey(rows[i + 1])) {
        problems.push(`Grupa ${group}: ${rows[i].team} i ${rows[i + 1].team}`);
      }
    }
  }
  return problems;
}

function hasUnresolvedGroupTies(tables) {
  return groupTieProblems(tables, GROUP_KEYS);
}

function seedToTeam(seed, tables, completedGroups = null) {
  const resolved = resolveSeed(seed, tables, completedGroups);
  return resolved.team;
}

function seedTieProblem(rows, place) {
  const row = rows?.[place];
  if (!row) return null;
  const prev = rows[place - 1];
  const next = rows[place + 1];
  if (prev && rankingKey(prev) === rankingKey(row)) return `${prev.team} / ${row.team}`;
  if (next && rankingKey(next) === rankingKey(row)) return `${row.team} / ${next.team}`;
  return null;
}

function resolveSeed(seed, tables, completedGroups = null) {
  if (!seed) return { team: null, ok: false, reason: 'pusty slot' };
  const clean = String(seed).trim();
  const m = clean.match(/^([123])([A-L])$/);
  if (!m) return { team: clean, ok: true, reason: 'gotowa nazwa' };

  const place = Number(m[1]) - 1;
  const group = m[2];
  if (completedGroups && !completedGroups.has(group)) {
    return { team: null, ok: false, reason: `${clean}: grupa ${group} nie ma jeszcze kompletu wyników` };
  }

  const rows = tables[group] || [];
  const row = rows[place];
  if (!row) return { team: null, ok: false, reason: `${clean}: brak tabeli grupy ${group}` };

  const tie = seedTieProblem(rows, place);
  if (tie) {
    return { team: null, ok: false, reason: `${clean}: remis w tabeli (${tie})` };
  }

  return { team: row.team, ok: true, reason: '' };
}

function getThirdAssignment(tables) {
  const thirds = GROUP_KEYS.map(group => tables[group]?.[2]).filter(Boolean).sort(compareStandingRows);
  if (thirds.length < 12) throw new Error('Brakuje pełnych tabel grup.');
  const cutoffA = thirds[7];
  const cutoffB = thirds[8];
  if (cutoffA && cutoffB && rankingKey(cutoffA) === rankingKey(cutoffB)) {
    throw new Error(`Remis na granicy najlepszych trzecich miejsc: ${cutoffA.team} i ${cutoffB.team}. Tu trzeba ręcznie potwierdzić oficjalną kolejność FIFA.`);
  }
  const qualifiedGroups = thirds.slice(0, 8).map(row => row.group).sort().join('');
  const assignment = THIRD_PLACE_ASSIGNMENTS[qualifiedGroups];
  if (!assignment) {
    throw new Error(`Brak oficjalnej kombinacji dla trzecich miejsc: ${qualifiedGroups}. Nie wpisuję drabinki, żeby nie zrobić błędu.`);
  }
  return { thirds, qualifiedGroups, assignment };
}

function fixedRoundOf32Seeds() {
  // Te pozycje można aktualizować na bieżąco, gdy dana grupa ma komplet wyników.
  // Sloty z 3. miejscami są celowo puste, bo ich oficjalny przydział zależy od tego,
  // które 8 grup da najlepsze trzecie drużyny.
  return {
    73: ['2A', '2B'],
    74: ['1E', null],
    75: ['1F', '2C'],
    76: ['1C', '2F'],
    77: ['1I', null],
    78: ['2E', '2I'],
    79: ['1A', null],
    80: ['1L', null],
    81: ['1D', null],
    82: ['1G', null],
    83: ['2K', '2L'],
    84: ['1H', '2J'],
    85: ['1B', null],
    86: ['1J', '2H'],
    87: ['1K', null],
    88: ['2D', '2G']
  };
}

function bracketSeedsForRoundOf32(assignment) {
  return {
    73: ['2A', '2B'],
    74: ['1E', assignment['1E']],
    75: ['1F', '2C'],
    76: ['1C', '2F'],
    77: ['1I', assignment['1I']],
    78: ['2E', '2I'],
    79: ['1A', assignment['1A']],
    80: ['1L', assignment['1L']],
    81: ['1D', assignment['1D']],
    82: ['1G', assignment['1G']],
    83: ['2K', '2L'],
    84: ['1H', '2J'],
    85: ['1B', assignment['1B']],
    86: ['1J', '2H'],
    87: ['1K', assignment['1K']],
    88: ['2D', '2G']
  };
}

function groupsFromSeeds(seedMap) {
  return [...new Set(Object.values(seedMap).flat().filter(Boolean).map(seed => String(seed).match(/^[123]([A-L])$/)?.[1]).filter(Boolean))];
}

async function applyRoundOf32SeedMap(seedMap, tables, completedGroups) {
  const changed = [];
  const skipped = [];
  const applied = [];

  for (const [matchNoText, [homeSeed, awaySeed]] of Object.entries(seedMap)) {
    const matchNo = Number(matchNoText);
    const update = {};

    if (homeSeed) {
      const resolved = resolveSeed(homeSeed, tables, completedGroups);
      if (resolved.ok && resolved.team) {
        update.home_team = resolved.team;
        applied.push(`${homeSeed} → ${resolved.team}`);
      } else {
        skipped.push(resolved.reason || `${homeSeed}: jeszcze nie można ustalić`);
      }
    }

    if (awaySeed) {
      const resolved = resolveSeed(awaySeed, tables, completedGroups);
      if (resolved.ok && resolved.team) {
        update.away_team = resolved.team;
        applied.push(`${awaySeed} → ${resolved.team}`);
      } else {
        skipped.push(resolved.reason || `${awaySeed}: jeszcze nie można ustalić`);
      }
    }

    if (Object.keys(update).length) {
      const { error } = await client.from('matches').update(update).eq('match_no', matchNo);
      if (error) throw error;
      changed.push(`#${matchNo}`);
    }
  }

  return { changed, skipped: [...new Set(skipped)], applied: [...new Set(applied)] };
}

async function autoFillBracket() {
  if (!state.profile?.is_admin) return;
  setAutoBracketMessage('Sprawdzam znane miejsca w drabince...', true);
  try {
    const { tables, completedGroups } = buildGroupTables();

    if (!completedGroups.size) {
      const missingByGroup = GROUP_KEYS.map(group => {
        const missing = state.matches.filter(m => m.stage === 'group' && m.group_code === group && !isSettled(m)).length;
        return missing === 0 ? null : `${group}: brakuje ${missing}`;
      }).filter(Boolean).slice(0, 6).join(', ');
      const msg = `Na razie żadna grupa nie ma kompletu wyników w aplikacji. Uzupełniam na bieżąco po zamknięciu każdej grupy. ${missingByGroup ? 'Braki: ' + missingByGroup + '.' : ''}`;
      setAutoBracketMessage(msg, false);
      return;
    }

    const completed = [...completedGroups].sort();
    const partial = await applyRoundOf32SeedMap(fixedRoundOf32Seeds(), tables, completedGroups);
    const changedMatches = [...new Set(partial.changed)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

    let message = `Zrobione. Sprawdziłem zakończone grupy: ${completed.join(', ')}. `;
    message += `Zmienione mecze: ${changedMatches.join(', ') || 'brak nowych zmian'}.`;

    if (partial.applied.length) {
      message += ` Wpisane miejsca: ${partial.applied.slice(0, 12).join(', ')}${partial.applied.length > 12 ? '...' : ''}.`;
    }

    if (partial.skipped.length) {
      message += ` Pominięte sloty: ${partial.skipped.slice(0, 6).join('; ')}${partial.skipped.length > 6 ? '...' : ''}.`;
    }

    if (completedGroups.size === GROUP_KEYS.length) {
      try {
        const { qualifiedGroups, assignment } = getThirdAssignment(tables);
        const fullSeeds = bracketSeedsForRoundOf32(assignment);
        const full = await applyRoundOf32SeedMap(fullSeeds, tables, new Set(GROUP_KEYS));
        message += ` Wszystkie grupy są zakończone, więc sprawdziłem też najlepsze trzecie miejsca. Awans trzecich z grup: ${qualifiedGroups}.`;
        if (full.applied.length) message += ` Dodatkowo wpisane: ${full.applied.slice(0, 10).join(', ')}${full.applied.length > 10 ? '...' : ''}.`;
        if (full.skipped.length) message += ` Do ręcznego potwierdzenia: ${full.skipped.slice(0, 5).join('; ')}.`;
      } catch (thirdError) {
        message += ` Trzecie miejsca jeszcze nie wpisane automatycznie: ${thirdError.message}`;
      }
      await loadAllData();
      // Nie przenosimy zwycięzców po kliknięciu auto-drabinki.
      // Kolejna runda aktualizuje się tylko po zapisaniu oficjalnego wyniku w panelu Wyniki.
    } else {
      const missing = GROUP_KEYS.filter(g => !completedGroups.has(g));
      message += ` Trzecie miejsca zostają na razie jako placeholdery, bo ich oficjalny przydział będzie pewny dopiero po wszystkich 12 grupach. Brakuje grup: ${missing.join(', ')}.`;
    }

    await loadAllData();
    renderAll();
    setAutoBracketMessage(message, true);
  } catch (error) {
    console.error(error);
    setAutoBracketMessage(error.message || 'Nie udało się zaktualizować drabinki.');
    alert(error.message || 'Nie udało się zaktualizować drabinki.');
  }
}


async function propagateKnockoutWinner(match) {
  // Bezpiecznik: zwycięzca może przejść dalej WYŁĄCZNIE po zapisie oficjalnego wyniku
  // z panelu admina „Wyniki”. Zwykły typ gracza nigdy nie aktualizuje kolejnej rundy.
  if (!match?._officialResultSaved) return;
  if (!isKnockout(match) || !isSettled(match)) return;
  if (!hasKickoffPassed(match)) return;
  const side = matchWinnerSide(match);
  if (!side) return;
  const winnerName = side === 'home' ? plainTeam(match, 'home') : plainTeam(match, 'away');
  const loserName = side === 'home' ? plainTeam(match, 'away') : plainTeam(match, 'home');
  const tasks = [];
  if (match.next_match_no && match.winner_to_slot && winnerName && winnerName !== 'TBD') {
    const field = match.winner_to_slot === 'home' ? 'home_team' : 'away_team';
    tasks.push(client.from('matches').update({ [field]: winnerName }).eq('match_no', match.next_match_no));
  }
  if (match.loser_next_match_no && match.loser_to_slot && loserName && loserName !== 'TBD') {
    const field = match.loser_to_slot === 'home' ? 'home_team' : 'away_team';
    tasks.push(client.from('matches').update({ [field]: loserName }).eq('match_no', match.loser_next_match_no));
  }
  const results = await Promise.all(tasks);
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
}

async function propagateExistingKnockoutResults() {
  const settledKo = state.matches
    .filter(m => isKnockout(m) && isSettled(m))
    .sort((a, b) => a.match_no - b.match_no);
  for (const match of settledKo) await propagateKnockoutWinner(match);
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
