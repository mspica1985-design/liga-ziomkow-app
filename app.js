const STORAGE_KEY = 'liga-ziomkow-state-v1';

const defaultState = {
  selectedGroup: 'A',
  selectedPlayer: 'marcin',
  predictions: {},
  results: {}
};

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch (error) {
    console.warn('Nie udało się wczytać danych:', error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function getMatch(id) {
  return MATCHES.find((match) => match.id === id);
}

function getPrediction(matchId, playerId) {
  return state.predictions?.[matchId]?.[playerId] || { home: '', away: '' };
}

function getResult(matchId) {
  return state.results?.[matchId] || { home: '', away: '' };
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) return '';
  return Math.floor(number);
}

function scorePrediction(prediction, result) {
  if (prediction.home === '' || prediction.away === '' || result.home === '' || result.away === '') return 0;
  const ph = Number(prediction.home);
  const pa = Number(prediction.away);
  const rh = Number(result.home);
  const ra = Number(result.away);

  if (ph === rh && pa === ra) return 3;

  const predOutcome = Math.sign(ph - pa);
  const realOutcome = Math.sign(rh - ra);
  return predOutcome === realOutcome ? 1 : 0;
}

function calculateTable() {
  return PLAYERS.map((player) => {
    let points = 0;
    let exact = 0;
    let outcome = 0;
    let typed = 0;

    MATCHES.forEach((match) => {
      const prediction = getPrediction(match.id, player.id);
      const result = getResult(match.id);
      if (prediction.home !== '' && prediction.away !== '') typed += 1;
      const score = scorePrediction(prediction, result);
      points += score;
      if (score === 3) exact += 1;
      if (score === 1) outcome += 1;
    });

    return { ...player, points, exact, outcome, typed };
  }).sort((a, b) =>
    b.points - a.points ||
    b.exact - a.exact ||
    b.outcome - a.outcome ||
    a.name.localeCompare(b.name)
  );
}

function renderHeroStats() {
  const completed = MATCHES.filter((match) => {
    const result = getResult(match.id);
    return result.home !== '' && result.away !== '';
  }).length;
  const typed = Object.values(state.predictions).reduce((sum, matchPredictions) => {
    return sum + Object.values(matchPredictions).filter((prediction) => prediction.home !== '' && prediction.away !== '').length;
  }, 0);

  qs('#heroStats').innerHTML = `
    <div><strong>${MATCHES.length}</strong><span>meczów</span></div>
    <div><strong>${completed}</strong><span>wyników</span></div>
    <div><strong>${typed}</strong><span>typów</span></div>
    <div><strong>4</strong><span>ziomków</span></div>
  `;
}

function renderRanking() {
  const table = calculateTable();
  qs('#rankingCards').innerHTML = table.map((player, index) => `
    <article class="rank-card ${index === 0 ? 'leader' : ''}">
      <div class="place">${index + 1}</div>
      <div class="avatar">${player.name[0]}</div>
      <div class="rank-main">
        <h3>${escapeHtml(player.name)}</h3>
        <p>${escapeHtml(player.title)}</p>
      </div>
      <div class="points"><strong>${player.points}</strong><span>pkt</span></div>
      <div class="mini-stats">
        <span>Dokładne: <b>${player.exact}</b></span>
        <span>Rozstrz.: <b>${player.outcome}</b></span>
        <span>Typy: <b>${player.typed}</b></span>
      </div>
    </article>
  `).join('');

  const completedMatches = MATCHES
    .filter((match) => {
      const result = getResult(match.id);
      return result.home !== '' && result.away !== '';
    })
    .slice(-6)
    .reverse();

  qs('#recentMatches').innerHTML = completedMatches.length
    ? completedMatches.map((match) => renderResultSummary(match)).join('')
    : '<p class="empty">Jeszcze nie wpisano żadnych oficjalnych wyników.</p>';
}

function renderResultSummary(match) {
  const result = getResult(match.id);
  const best = PLAYERS.map((player) => {
    const points = scorePrediction(getPrediction(match.id, player.id), result);
    return { player, points };
  }).filter((entry) => entry.points > 0);

  return `
    <article class="match-card small">
      <div class="match-meta">Grupa ${match.group} · Kolejka ${match.round}</div>
      <div class="teams-line"><b>${escapeHtml(match.home)}</b> ${result.home}:${result.away} <b>${escapeHtml(match.away)}</b></div>
      <div class="chips">
        ${best.length ? best.map((entry) => `<span>${entry.player.name}: ${entry.points} pkt</span>`).join('') : '<span>Nikt nie punktował</span>'}
      </div>
    </article>
  `;
}

function renderPlayerSelect() {
  qs('#playerSelect').innerHTML = PLAYERS.map((player) => `
    <option value="${player.id}" ${state.selectedPlayer === player.id ? 'selected' : ''}>${player.name}</option>
  `).join('');
}

function renderGroupFilters() {
  qs('#groupFilters').innerHTML = GROUPS.map((group) => `
    <button class="filter ${state.selectedGroup === group ? 'active' : ''}" data-group="${group}">${group}</button>
  `).join('');
}

function renderPredictionMatches() {
  const matches = MATCHES.filter((match) => match.group === state.selectedGroup);
  qs('#predictionMatches').innerHTML = matches.map((match) => {
    const prediction = getPrediction(match.id, state.selectedPlayer);
    const result = getResult(match.id);
    const points = scorePrediction(prediction, result);
    const resultText = result.home !== '' && result.away !== '' ? `${result.home}:${result.away}` : 'brak';

    return `
      <article class="match-card">
        <div class="match-top">
          <div>
            <div class="match-meta">Grupa ${match.group} · Kolejka ${match.round} · ${escapeHtml(match.date)}</div>
            <h3>${escapeHtml(match.home)} <span>vs</span> ${escapeHtml(match.away)}</h3>
          </div>
          <div class="points-pill">${points} pkt</div>
        </div>
        <div class="score-row">
          <label>${escapeHtml(match.home)}
            <input type="number" min="0" inputmode="numeric" value="${prediction.home}" data-kind="prediction" data-match="${match.id}" data-player="${state.selectedPlayer}" data-side="home" />
          </label>
          <span class="colon">:</span>
          <label>${escapeHtml(match.away)}
            <input type="number" min="0" inputmode="numeric" value="${prediction.away}" data-kind="prediction" data-match="${match.id}" data-player="${state.selectedPlayer}" data-side="away" />
          </label>
        </div>
        <div class="match-footer">Oficjalny wynik: <strong>${resultText}</strong></div>
      </article>
    `;
  }).join('');
}

function renderAdminMatches() {
  qs('#adminMatches').innerHTML = GROUPS.map((group) => {
    const matches = MATCHES.filter((match) => match.group === group);
    return `
      <div class="group-block">
        <h3>Grupa ${group}</h3>
        ${matches.map((match) => {
          const result = getResult(match.id);
          return `
            <article class="match-card admin-card">
              <div>
                <div class="match-meta">Kolejka ${match.round}</div>
                <h3>${escapeHtml(match.home)} <span>vs</span> ${escapeHtml(match.away)}</h3>
              </div>
              <div class="score-row admin-score">
                <input type="number" min="0" inputmode="numeric" value="${result.home}" data-kind="result" data-match="${match.id}" data-side="home" aria-label="Wynik gospodarzy" />
                <span class="colon">:</span>
                <input type="number" min="0" inputmode="numeric" value="${result.away}" data-kind="result" data-match="${match.id}" data-side="away" aria-label="Wynik gości" />
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderHeroStats();
  renderRanking();
  renderPlayerSelect();
  renderGroupFilters();
  renderPredictionMatches();
  renderAdminMatches();
}

function switchView(viewName) {
  qsa('.tab').forEach((button) => button.classList.toggle('active', button.dataset.view === viewName));
  qsa('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
}

function bindEvents() {
  qsa('.tab').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  document.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-group]');
    if (filter) {
      state.selectedGroup = filter.dataset.group;
      saveState();
      renderGroupFilters();
      renderPredictionMatches();
    }
  });

  qs('#playerSelect').addEventListener('change', (event) => {
    state.selectedPlayer = event.target.value;
    saveState();
    renderPredictionMatches();
  });

  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.matches('input[data-kind]')) return;

    const value = normalizeNumber(input.value);
    input.value = value;

    if (input.dataset.kind === 'prediction') {
      const { match, player, side } = input.dataset;
      state.predictions[match] ||= {};
      state.predictions[match][player] ||= { home: '', away: '' };
      state.predictions[match][player][side] = value;
    }

    if (input.dataset.kind === 'result') {
      const { match, side } = input.dataset;
      state.results[match] ||= { home: '', away: '' };
      state.results[match][side] = value;
    }

    saveState();
    renderHeroStats();
    renderRanking();
    if (input.dataset.kind === 'result') renderPredictionMatches();
  });

  qs('#exportBtn').addEventListener('click', () => {
    qs('#dataBox').value = JSON.stringify(state, null, 2);
  });

  qs('#copyDataBtn').addEventListener('click', async () => {
    const value = qs('#dataBox').value;
    if (!value) return alert('Najpierw kliknij „Eksportuj dane”.');
    try {
      await navigator.clipboard.writeText(value);
      alert('Skopiowano dane.');
    } catch {
      alert('Nie udało się automatycznie skopiować. Zaznacz tekst ręcznie.');
    }
  });

  qs('#importBtn').addEventListener('click', () => {
    try {
      const imported = JSON.parse(qs('#dataBox').value);
      state = { ...structuredClone(defaultState), ...imported };
      saveState();
      renderAll();
      alert('Zaimportowano dane.');
    } catch {
      alert('Import nieudany. Sprawdź, czy wkleiłeś poprawny eksport JSON.');
    }
  });

  qs('#resetDemoBtn').addEventListener('click', () => {
    if (!confirm('Na pewno wyczyścić typy i wyniki z tej przeglądarki?')) return;
    state = structuredClone(defaultState);
    saveState();
    renderAll();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => null);
  });
}

bindEvents();
renderAll();
