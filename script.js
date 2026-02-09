// =======================
// Turniej bilardowy — script.js
// Liga: round-robin (circle method) + ranking + ręczne rozstrzyganie remisów
// Play-off: TOP 12 (baraże -> ćwierćfinały -> półfinały -> finał + 3. miejsce)
// NOWE: Stoły i harmonogram "na żywo"
// - wybór liczby stołów 3–5
// - wybór konkretnych numerów stołów (1–9)
// - przydział stołu tylko dla tylu meczów ile jest stołów
// - kolejne mecze dostają stół dopiero po zakończeniu (wpisaniu kompletnego wyniku)
// =======================

// Dane systemu
const system = {
  playerPool: [],
  tournament: {
    players: [],
    rounds: 3,
    currentRound: 0,
    allMatches: [],
    playerStats: {},
    playedPairs: new Set(),
    isActive: false,
    nextMatchId: 1,
    gameType: 3, // LICZBA
    manualOrder: {}, // ręczna kolejność w obrębie pełnego remisu

    // Stoły
    tableCount: 3,       // 3–5
    tables: [1, 2, 3],   // numery 1–9
    tableScheduler: {    // stan harmonogramu
      free: [],          // wolne stoły
      busy: {}           // { tableNumber: matchId }
    }
  }
};

// Stały znacznik wolnego losu
const BYE = 'bye';

// Elementy DOM
const playerPoolEl = document.getElementById('playerPool');
const tournamentPlayersEl = document.getElementById('tournamentPlayers');
const matchesContainerEl = document.getElementById('matchesContainer');
const rankingTableBodyEl = document.getElementById('rankingTable')?.querySelector('tbody');
const roundsSelectEl = document.getElementById('rounds');
const gameTypeSelectEl = document.getElementById('gameType');
const newPlayerNameEl = document.getElementById('newPlayerName');
const addPlayerBtnEl = document.getElementById('addPlayerBtn');
const startBtnEl = document.getElementById('startBtn');
const resetBtnEl = document.getElementById('resetBtn');
const exportBtnEl = document.getElementById('exportBtn');
const tournamentStatusEl = document.getElementById('tournamentStatus');
const currentRoundInfoEl = document.getElementById('currentRoundInfo');
const playerCountEl = document.getElementById('playerCount');
const tournamentPlayerCountEl = document.getElementById('tournamentPlayerCount');

// Stoły: DOM
const tableCountSelectEl = document.getElementById('tableCount');
const tablesPickerEl = document.getElementById('tablesPicker');
const tablesHintEl = document.getElementById('tablesHint');

// ===== Pomocnicze =====
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getPlayerColor(player) {
  if (!player || player === BYE) return '#888888';
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  const index = system.tournament.players.indexOf(player) % colors.length;
  return colors[(index + colors.length) % colors.length];
}

function updatePlayerCount() {
  if (playerCountEl) playerCountEl.textContent = system.playerPool.length;
}

function updateTournamentPlayerCount() {
  if (tournamentPlayerCountEl) tournamentPlayerCountEl.textContent = system.tournament.players.length;
}

// Dynamiczna lista rund
function refreshRoundsOptions() {
  if (!roundsSelectEl) return;

  const playerCount = system.tournament.players.length;
  const prev = parseInt(roundsSelectEl.value) || 3;

  // max rund dla full RR: parzyste N -> N-1, nieparzyste N -> N (1 bye na rundę)
  const maxRounds = playerCount <= 1 ? 3 : (playerCount % 2 === 0 ? playerCount - 1 : playerCount);

  const options = [];
  if (playerCount > 0 && playerCount < 10) {
    const end = Math.max(5, maxRounds);
    for (let r = 3; r <= end; r++) {
      if (r > maxRounds) break;
      const label = (r === maxRounds) ? `${r} rund (każdy z każdym)` : `${r} rund`;
      options.push({ value: r, label });
    }
    if (options.length === 0) {
      options.push({ value: 3, label: '3 rundy' });
      options.push({ value: 4, label: '4 rundy' });
      options.push({ value: 5, label: '5 rund' });
    }
  } else {
    options.push({ value: 3, label: '3 rundy' });
    options.push({ value: 4, label: '4 rundy' });
    options.push({ value: 5, label: '5 rund' });
  }

  roundsSelectEl.innerHTML = '';
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = String(o.value);
    opt.textContent = o.label;
    roundsSelectEl.appendChild(opt);
  });

  const values = options.map(o => o.value);
  let nextVal = prev;
  if (!values.includes(nextVal)) {
    nextVal = values.includes(maxRounds) ? maxRounds : values[0];
  }
  roundsSelectEl.value = String(nextVal);
}

// ===== LocalStorage =====
function saveToLocalStorage() {
  const payload = {
    playerPool: system.playerPool,
    tournament: {
      ...system.tournament,
      playedPairs: Array.from(system.tournament.playedPairs || [])
    }
  };
  localStorage.setItem('tournamentSystem', JSON.stringify(payload));
}

function loadFromLocalStorage() {
  const savedData = localStorage.getItem('tournamentSystem');
  if (!savedData) return;

  try {
    const data = JSON.parse(savedData);

    system.playerPool = Array.isArray(data.playerPool) ? data.playerPool : [];

    const t = data.tournament || {};
    const parsedPlayedPairs = new Set(Array.isArray(t.playedPairs) ? t.playedPairs : []);

    // Stoły - normalizacja
    const tableCount = Number.isFinite(parseInt(t.tableCount)) ? parseInt(t.tableCount) : 3;
    const rawTables = Array.isArray(t.tables) ? t.tables : [1,2,3];
    const tables = Array.from(new Set(rawTables.map(n => parseInt(n)).filter(n => n >= 1 && n <= 9))).slice(0, tableCount);
    while (tables.length < tableCount) {
      for (let i = 1; i <= 9 && tables.length < tableCount; i++) {
        if (!tables.includes(i)) tables.push(i);
      }
    }

    system.tournament = {
      players: Array.isArray(t.players) ? t.players : [],
      rounds: Number.isFinite(parseInt(t.rounds)) ? parseInt(t.rounds) : 3,
      currentRound: Number.isFinite(parseInt(t.currentRound)) ? parseInt(t.currentRound) : 0,
      allMatches: Array.isArray(t.allMatches) ? t.allMatches : [],
      playerStats: t.playerStats && typeof t.playerStats === 'object' ? t.playerStats : {},
      playedPairs: parsedPlayedPairs,
      isActive: !!t.isActive,
      nextMatchId: Number.isFinite(parseInt(t.nextMatchId)) ? parseInt(t.nextMatchId) : 1,
      gameType: Number.isFinite(parseInt(t.gameType)) ? parseInt(t.gameType) : 3,
      manualOrder: t.manualOrder && typeof t.manualOrder === 'object' ? t.manualOrder : {},

      tableCount,
      tables,
      tableScheduler: (t.tableScheduler && typeof t.tableScheduler === 'object') ? t.tableScheduler : { free: [], busy: {} }
    };
  } catch (e) {
    console.warn('Błąd wczytywania localStorage:', e);
  }

  // normalizacja starych zapisów: null -> BYE + pola match.table
  if (Array.isArray(system.tournament.allMatches)) {
    system.tournament.allMatches.forEach(m => {
      if (m.player1 === null) m.player1 = BYE;
      if (m.player2 === null) m.player2 = BYE;
      m.isBye = (m.player1 === BYE || m.player2 === BYE);
      if (!('table' in m)) m.table = null;
    });
  }
}

// ===== Stoły: UI =====
function renderTablesPicker() {
  if (!tablesPickerEl || !tableCountSelectEl) return;

  const count = Math.max(3, Math.min(5, parseInt(tableCountSelectEl.value) || 3));
  system.tournament.tableCount = count;

  // stan stołów: unikatowe, 1–9, długość = count
  const unique = Array.from(new Set((system.tournament.tables || [])
    .map(n => parseInt(n))
    .filter(n => n >= 1 && n <= 9)
  ));

  while (unique.length < count) {
    for (let t = 1; t <= 9 && unique.length < count; t++) {
      if (!unique.includes(t)) unique.push(t);
    }
  }
  system.tournament.tables = unique.slice(0, count);

  tablesPickerEl.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const sel = document.createElement('select');
    sel.dataset.idx = String(i);

    for (let t = 1; t <= 9; t++) {
      const opt = document.createElement('option');
      opt.value = String(t);
      opt.textContent = `Stół ${t}`;
      sel.appendChild(opt);
    }

    sel.value = String(system.tournament.tables[i] || (i + 1));

    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.idx);
      const chosen = parseInt(sel.value);

      const otherIdx = system.tournament.tables.findIndex((v, j) => v === chosen && j !== idx);
      if (otherIdx !== -1) {
        const tmp = system.tournament.tables[idx];
        system.tournament.tables[idx] = chosen;
        system.tournament.tables[otherIdx] = tmp;
      } else {
        system.tournament.tables[idx] = chosen;
      }

      renderTablesPicker();
      saveToLocalStorage();
    });

    tablesPickerEl.appendChild(sel);
  }

  if (tablesHintEl) {
    tablesHintEl.textContent = `Aktywne stoły: ${system.tournament.tables.join(', ')}.`;
  }

  // blokada w trakcie turnieju
  const disabled = !!system.tournament.isActive;
  tableCountSelectEl.disabled = disabled;
  tablesPickerEl.querySelectorAll('select').forEach(s => s.disabled = disabled);

  saveToLocalStorage();
}

// ===== Stoły: harmonogram "na żywo" =====
function initTableScheduler() {
  const tables = (system.tournament.tables || [])
    .map(n => parseInt(n))
    .filter(n => n >= 1 && n <= 9);

  system.tournament.tableScheduler = {
    free: [...tables],
    busy: {}
  };

  // czyścimy stoły w meczach
  system.tournament.allMatches.forEach(m => { m.table = null; });

  assignTablesWhilePossible();
}

function getNextWaitingMatch() {
  // kolejka globalna: po kolejności w allMatches (czyli po rundach i globalIndex)
  return system.tournament.allMatches.find(m =>
    !m.isBye &&
    !m.completed &&
    (m.table == null)
  ) || null;
}

function assignTablesWhilePossible() {
  const sch = system.tournament.tableScheduler;
  if (!sch || !Array.isArray(sch.free)) return;

  while (sch.free.length > 0) {
    const nextMatch = getNextWaitingMatch();
    if (!nextMatch) break;

    const table = sch.free.shift();
    nextMatch.table = table;
    sch.busy[table] = nextMatch.id;
  }
}

function onMatchCompletedReleaseTable(match) {
  const sch = system.tournament.tableScheduler;
  if (!sch) return;

  const table = match.table;
  if (table == null) return;

  if (sch.busy && sch.busy[table] === match.id) {
    delete sch.busy[table];
    if (!sch.free.includes(table)) sch.free.push(table);
    assignTablesWhilePossible();
  }
}

// ===== UI: lista graczy =====
function updatePlayerPool() {
  playerPoolEl.innerHTML = '';

  if (system.playerPool.length === 0) {
    playerPoolEl.innerHTML = '<p>Brak graczy. Dodaj pierwszego gracza.</p>';
    return;
  }

  system.playerPool.forEach((player, index) => {
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    playerItem.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox"
               onchange="toggleTournamentPlayer(${index})"
               ${system.tournament.players.includes(player) ? 'checked' : ''}>
        <span>${player}</span>
      </label>
      <button class="danger" onclick="removeFromPool(${index})">Usuń</button>
    `;
    playerPoolEl.appendChild(playerItem);
  });
}

function updateTournamentPlayersList() {
  tournamentPlayersEl.innerHTML = '';

  if (system.tournament.players.length === 0) {
    tournamentPlayersEl.innerHTML = '<p>Wybierz graczy z bazy powyżej</p>';
    return;
  }

  system.tournament.players.forEach((player, index) => {
    const playerElement = document.createElement('div');
    playerElement.className = 'player-item';
    playerElement.innerHTML = `
      <span>${player}</span>
      <button class="warning" onclick="removeFromTournament(${index})">Usuń</button>
    `;
    tournamentPlayersEl.appendChild(playerElement);
  });
}

function addToPlayerPool() {
  const name = (newPlayerNameEl?.value || '').trim();

  if (!name) {
    alert('Wpisz nazwę gracza!');
    return;
  }

  if (system.playerPool.includes(name)) {
    newPlayerNameEl.value = '';
    return;
  }

  system.playerPool.push(name);
  newPlayerNameEl.value = '';

  updatePlayerPool();
  updatePlayerCount();
  saveToLocalStorage();
}

function removeFromPool(index) {
  const player = system.playerPool[index];

  const ti = system.tournament.players.indexOf(player);
  if (ti !== -1) {
    system.tournament.players.splice(ti, 1);
    updateTournamentPlayersList();
    updateTournamentPlayerCount();
    refreshRoundsOptions();
    if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2;
  }

  system.playerPool.splice(index, 1);
  updatePlayerPool();
  updatePlayerCount();
  refreshRoundsOptions();
  saveToLocalStorage();
}

function toggleTournamentPlayer(poolIndex) {
  const player = system.playerPool[poolIndex];
  const idx = system.tournament.players.indexOf(player);

  if (idx === -1) system.tournament.players.push(player);
  else system.tournament.players.splice(idx, 1);

  updateTournamentPlayersList();
  updateTournamentPlayerCount();
  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2 || system.tournament.isActive;
  refreshRoundsOptions();
  saveToLocalStorage();
}

function removeFromTournament(index) {
  system.tournament.players.splice(index, 1);
  updateTournamentPlayersList();
  updatePlayerPool();
  updateTournamentPlayerCount();
  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2 || system.tournament.isActive;
  refreshRoundsOptions();
  saveToLocalStorage();
}

// ===== Turniej: status =====
function updateTournamentStatus() {
  if (!tournamentStatusEl) return;

  if (system.tournament.isActive) {
    tournamentStatusEl.textContent = 'Aktywny';
    tournamentStatusEl.className = 'status-badge status-active';
  } else {
    tournamentStatusEl.textContent = 'Nieaktywny';
    tournamentStatusEl.className = 'status-badge status-ended';
  }
}

// ===== Turniej: start/reset =====
function startTournament() {
  if (!roundsSelectEl || !gameTypeSelectEl) {
    alert('Brak wymaganych elementów na stronie!');
    return;
  }

  system.tournament.rounds = parseInt(roundsSelectEl.value) || 3;
  system.tournament.gameType = parseInt(gameTypeSelectEl.value) || 3;
  system.tournament.currentRound = 1;
  system.tournament.allMatches = [];
  system.tournament.playedPairs = new Set();
  system.tournament.isActive = true;
  system.tournament.nextMatchId = 1;
  system.tournament.manualOrder = {};

  // staty
  system.tournament.playerStats = {};
  system.tournament.players.forEach(player => {
    system.tournament.playerStats[player] = {
      matches: 0,
      wonGames: 0,
      totalGames: 0,
      byes: 0
    };
  });

  generateAllRounds();

  // Harmonogram stołów: start
  initTableScheduler();
  renderTablesPicker(); // zablokuje wybór stołów w trakcie

  updateTournamentView();
  updateRanking();
  updateTournamentStatus();
  saveToLocalStorage();

  if (startBtnEl) startBtnEl.disabled = true;
  if (resetBtnEl) resetBtnEl.disabled = false;
}

function resetTournament() {
  if (!confirm('Czy na pewno chcesz zresetować turniej? Wszystkie wyniki zostaną utracone.')) return;

  const keepPlayers = [...system.tournament.players];
  const keepTables = [...(system.tournament.tables || [1,2,3])];
  const keepTableCount = system.tournament.tableCount || 3;

  system.tournament = {
    players: keepPlayers,
    rounds: parseInt(roundsSelectEl?.value) || 3,
    currentRound: 0,
    allMatches: [],
    playerStats: {},
    playedPairs: new Set(),
    isActive: false,
    nextMatchId: 1,
    gameType: parseInt(gameTypeSelectEl?.value) || 3,
    manualOrder: {},

    tableCount: keepTableCount,
    tables: keepTables.slice(0, keepTableCount),
    tableScheduler: { free: [], busy: {} }
  };

  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2;
  if (resetBtnEl) resetBtnEl.disabled = true;
  if (exportBtnEl) exportBtnEl.style.display = 'none';

  renderTablesPicker(); // odblokuje wybór stołów

  updateTournamentView();
  updateRanking();
  updateTournamentStatus();
  saveToLocalStorage();
}

// ===== Generowanie rund i par =====
function generateAllRounds() {
  const roundsToPlay = system.tournament.rounds;

  // losujemy kolejność raz na start
  let players = shuffleArray([...system.tournament.players]);

  // nieparzysta liczba -> BYE
  if (players.length % 2 !== 0) {
    players.push(BYE);
  }

  const n = players.length;
  const maxRounds = n - 1;

  system.tournament.allMatches = [];
  system.tournament.playedPairs = new Set();
  system.tournament.nextMatchId = 1;

  const rounds = Math.min(roundsToPlay, maxRounds);
  if (roundsToPlay > maxRounds) {
    console.warn(`Za dużo rund (${roundsToPlay}). Maksimum bez powtórek: ${maxRounds}. Ucinam do ${rounds}.`);
  }

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const p1 = players[i];
      const p2 = players[n - 1 - i];
      const isBye = (p1 === BYE || p2 === BYE);

      const match = {
        id: system.tournament.nextMatchId++,
        player1: p1,
        player2: p2,
        score1: 0,
        score2: 0,
        completed: false,
        round,
        isBye,
        table: null, // NOWE
        globalIndex: system.tournament.allMatches.length
      };

      if (!isBye) {
        const pairKey = [p1, p2].sort().join('-');
        match.pairKey = pairKey;
        system.tournament.playedPairs.add(pairKey);
      }

      system.tournament.allMatches.push(match);
    }

    // rotacja: pierwszy zostaje, reszta się kręci
    players = [players[0], players[n - 1], ...players.slice(1, n - 1)];
  }
}

// ===== Wyniki meczów (liga) =====
function updateMatchScore(globalIndex, playerNumber, value) {
  const match = system.tournament.allMatches[globalIndex];
  const winThreshold = system.tournament.gameType;

  // nie pozwalamy edytować meczu bez stołu (bo jeszcze nie gra)
  if (!match.isBye && match.table == null) {
    updateTournamentView();
    return;
  }

  const wasCompleted = !!match.completed;

  const numValue = Math.max(0, Math.min(winThreshold, parseInt(value) || 0));

  const prevScore1 = match.score1;
  const prevScore2 = match.score2;

  if (playerNumber === 1) match.score1 = numValue;
  else match.score2 = numValue;

  updateStatsAfterEdit(match, prevScore1, prevScore2);

  match.completed = (match.score1 === winThreshold || match.score2 === winThreshold);

  // jeśli mecz właśnie się domknął -> zwolnij stół i przydziel kolejny
  if (!wasCompleted && match.completed) {
    onMatchCompletedReleaseTable(match);
  }

  const matchElement = document.querySelector(`.match[data-id="${match.id}"]`);
  if (matchElement) {
    const input1 = matchElement.querySelector('input[data-player="1"]');
    const input2 = matchElement.querySelector('input[data-player="2"]');

    if (input1) input1.value = match.score1;
    if (input2) input2.value = match.score2;

    if (match.completed) {
      if (!matchElement.querySelector('.edit-btn')) {
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = 'Edytuj';
        editBtn.onclick = () => enableMatchEdit(globalIndex);
        matchElement.querySelector('.match-controls')?.appendChild(editBtn);
      }
      matchElement.classList.add('completed');
      matchElement.querySelectorAll('input').forEach(inp => inp.disabled = true);
    } else {
      const editBtn = matchElement.querySelector('.edit-btn');
      if (editBtn) editBtn.remove();
      matchElement.classList.remove('completed');
    }
  }

  updateTournamentView(); // odśwież label stołów i blokady
  updateRanking();
  saveToLocalStorage();
}

function updateStatsAfterEdit(match, prevScore1, prevScore2) {
  const stats = system.tournament.playerStats;
  const { player1, player2 } = match;

  if (!stats[player1]) stats[player1] = { matches: 0, wonGames: 0, totalGames: 0, byes: 0 };
  if (player2 && player2 !== BYE && !stats[player2]) stats[player2] = { matches: 0, wonGames: 0, totalGames: 0, byes: 0 };

  // odejmij stare
  if (player1) {
    stats[player1].wonGames -= prevScore1;
    stats[player1].totalGames -= (prevScore1 + (prevScore2 || 0));
  }
  if (player2 && player2 !== BYE) {
    stats[player2].wonGames -= prevScore2;
    stats[player2].totalGames -= (prevScore2 + prevScore1);
  }

  // dodaj nowe
  if (player1) {
    stats[player1].wonGames += match.score1;
    stats[player1].totalGames += (match.score1 + (match.score2 || 0));
  }
  if (player2 && player2 !== BYE) {
    stats[player2].wonGames += match.score2;
    stats[player2].totalGames += (match.score2 + match.score1);
  }

  const winScore = system.tournament.gameType;
  const wasCompleted = (prevScore1 === winScore || prevScore2 === winScore);
  const isCompleted = (match.score1 === winScore || match.score2 === winScore);

  if (wasCompleted && !isCompleted) {
    if (player1) stats[player1].matches--;
    if (player2 && player2 !== BYE) stats[player2].matches--;
  } else if (!wasCompleted && isCompleted) {
    if (player1) stats[player1].matches++;
    if (player2 && player2 !== BYE) stats[player2].matches++;
  }

  if (match.isBye && player1) stats[player1].byes = 1;
}

function enableMatchEdit(globalIndex) {
  const match = system.tournament.allMatches[globalIndex];
  match.completed = false;

  const matchElement = document.querySelector(`.match[data-id="${match.id}"]`);
  if (matchElement) {
    matchElement.classList.remove('completed');
    matchElement.querySelectorAll('input').forEach(input => input.disabled = false);
    const editBtn = matchElement.querySelector('.edit-btn');
    if (editBtn) editBtn.remove();
  }
  saveToLocalStorage();
}

// ===== Ranking + ręczne rozstrzyganie remisów =====
function getRankedPlayers() {
  return system.tournament.players
    .map(player => {
      const stats = system.tournament.playerStats[player] || { totalGames: 0, wonGames: 0, matches: 0, byes: 0 };
      return { name: player, stats };
    })
    .sort((a, b) => {
      const ratioA = a.stats.totalGames > 0 ? a.stats.wonGames / a.stats.totalGames : 0;
      const ratioB = b.stats.totalGames > 0 ? b.stats.wonGames / b.stats.totalGames : 0;

      if (ratioB !== ratioA) return ratioB - ratioA;
      if (b.stats.wonGames !== a.stats.wonGames) return b.stats.wonGames - a.stats.wonGames;

      const mo = system.tournament.manualOrder || {};
      const ma = mo[a.name];
      const mb = mo[b.name];

      if (ma != null && mb == null) return -1;
      if (ma == null && mb != null) return 1;
      if (ma != null && mb != null && ma !== mb) return ma - mb;

      return a.name.localeCompare(b.name, 'pl');
    });
}

function updateRanking() {
  if (!rankingTableBodyEl) return;

  const rankedPlayers = getRankedPlayers();
  rankingTableBodyEl.innerHTML = '';

  const tieKey = (p) => {
    const r = p.stats.totalGames > 0 ? (p.stats.wonGames / p.stats.totalGames) : 0;
    const rKey = Math.round(r * 1000000);
    return `${rKey}|${p.stats.wonGames}`;
  };

  const groups = new Map();
  rankedPlayers.forEach((p, idx) => {
    const k = tieKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(idx);
  });

  function ensureManualOrderForGroup(indices) {
    const mo = system.tournament.manualOrder || (system.tournament.manualOrder = {});
    indices.forEach((i, pos) => {
      const name = rankedPlayers[i].name;
      if (mo[name] == null) mo[name] = pos + 1;
    });
  }

  function normalizeManualOrder(indices) {
    const mo = system.tournament.manualOrder || {};
    const names = indices.map(i => rankedPlayers[i].name);
    names.sort((a, b) => (mo[a] ?? 9999) - (mo[b] ?? 9999));
    names.forEach((name, idx) => mo[name] = idx + 1);
    saveToLocalStorage();
  }

  function moveInGroup(playerName, dir, indices) {
    const mo = system.tournament.manualOrder || (system.tournament.manualOrder = {});
    ensureManualOrderForGroup(indices);

    const names = indices
      .map(i => rankedPlayers[i].name)
      .sort((a, b) => (mo[a] ?? 9999) - (mo[b] ?? 9999));

    const i = names.indexOf(playerName);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= names.length) return;

    const tmp = mo[names[i]];
    mo[names[i]] = mo[names[j]];
    mo[names[j]] = tmp;

    normalizeManualOrder(indices);
    updateRanking();
  }

  rankedPlayers.forEach((player, index) => {
    const row = document.createElement('tr');

    const winPercentage = player.stats.totalGames > 0
      ? (player.stats.wonGames / player.stats.totalGames * 100).toFixed(1)
      : '0.0';

    const k = tieKey(player);
    const indices = groups.get(k);
    const isTied = indices.length > 1;

    let controlsHtml = '';
    if (isTied) {
      controlsHtml = `
        <div style="display:inline-flex; gap:6px; margin-left:10px;">
          <button type="button" class="secondary" data-move="up">↑</button>
          <button type="button" class="secondary" data-move="down">↓</button>
        </div>
      `;
    }

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <span>${player.name}</span>
        ${controlsHtml}
      </td>
      <td>${player.stats.matches}</td>
      <td>${player.stats.wonGames}</td>
      <td>${player.stats.totalGames}</td>
      <td>${winPercentage}%</td>
    `;

    if (isTied) {
      const btnUp = row.querySelector('button[data-move="up"]');
      const btnDown = row.querySelector('button[data-move="down"]');
      btnUp?.addEventListener('click', () => moveInGroup(player.name, -1, indices));
      btnDown?.addEventListener('click', () => moveInGroup(player.name, +1, indices));
    }

    rankingTableBodyEl.appendChild(row);
  });
}

// ===== Widok meczów (liga) =====
function updateTournamentView() {
  if (!matchesContainerEl) return;

  if (!system.tournament.isActive) {
    matchesContainerEl.innerHTML = '<p>Wybierz graczy i rozpocznij turniej</p>';
    return;
  }

  matchesContainerEl.innerHTML = '';

  const rounds = {};
  system.tournament.allMatches.forEach(match => {
    if (!rounds[match.round]) rounds[match.round] = [];
    rounds[match.round].push(match);
  });

  for (const roundNum in rounds) {
    if (matchesContainerEl.children.length > 0) {
      const separator = document.createElement('hr');
      separator.className = 'round-separator';
      matchesContainerEl.appendChild(separator);
    }

    const roundDiv = document.createElement('div');
    roundDiv.className = 'round';

    const roundTitle = document.createElement('div');
    roundTitle.className = 'round-title';
    roundTitle.textContent = `Runda ${roundNum}.   Do ${system.tournament.gameType} wygr.`;
    roundTitle.style.color = '#007bff';
    roundDiv.appendChild(roundTitle);

    rounds[roundNum].forEach(match => {
      const matchDiv = document.createElement('div');
      matchDiv.className = `match ${match.completed ? 'completed' : ''}`;
      if (!match.completed && match.table != null) matchDiv.classList.add('playing');
      matchDiv.dataset.id = match.id;
      const maxScore = system.tournament.gameType;

      const p1 = (match.player1 === null ? BYE : match.player1);
      const p2 = (match.player2 === null ? BYE : match.player2);
      const p2Label = p2 ? p2 : 'bye';

      const tableLabel = match.isBye
        ? 'BYE'
        : (match.table != null ? `Stół ${match.table}` : 'Czeka na stół');

      const disableInputs = match.completed || (!match.isBye && match.table == null);

      matchDiv.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="billiard-ball" style="background:${getPlayerColor(p1)}"></div>
          <strong>${p1}</strong>
          <span>vs</span>
          <strong>${p2Label}</strong>
          <div class="billiard-ball" style="background:${getPlayerColor(p2)}"></div>
          <span class="table-badge ${match.table != null ? 'table-active' : 'table-wait'}">${tableLabel}</span>
        </div>
        <div class="match-controls">
          <input type="number" min="0" max="${maxScore}"
            value="${match.score1}"
            data-player="1"
            onchange="updateMatchScore(${match.globalIndex}, 1, this.value)"
            ${disableInputs ? 'disabled' : ''}>
          <span> - </span>
          <input type="number" min="0" max="${maxScore}"
            value="${match.score2}"
            data-player="2"
            onchange="updateMatchScore(${match.globalIndex}, 2, this.value)"
            ${disableInputs ? 'disabled' : ''}>
          ${match.completed ? `<button class="edit-btn" onclick="enableMatchEdit(${match.globalIndex})">Edytuj</button>` : ''}
        </div>
      `;

      roundDiv.appendChild(matchDiv);
    });

    matchesContainerEl.appendChild(roundDiv);
  }

  updateRanking();
}

// ===== Play-off (top 12) =====
function getTop12Players() {
  const ranked = getRankedPlayers();
  return ranked.slice(0, 12);
}

function getTop12PlayerNames() {
  return getTop12Players().map(p => p.name);
}

function generatePlayoffBracket() {
  const topPlayers = getTop12PlayerNames();
  const totalPlayers = topPlayers.length;

  if (totalPlayers < 8) {
    alert('Za mało graczy do fazy play-off! Minimalna liczba to 8.');
    return null;
  }

  const bracket = {
    roundOf12: [],
    quarterfinals: [
      [topPlayers[0] || BYE, null], // 1 vs winner 8/9
      [topPlayers[3] || BYE, null], // 4 vs winner 5/12
      [topPlayers[1] || BYE, null], // 2 vs winner 7/10
      [topPlayers[2] || BYE, null]  // 3 vs winner 6/11
    ],
    semifinals: [[], []],
    final: [null, null],
    thirdPlace: [null, null]
  };

  const playInPairs = [
    [4, 11], // 5 vs 12 -> ćw 1
    [5, 10], // 6 vs 11 -> ćw 3
    [6, 9],  // 7 vs 10 -> ćw 2
    [7, 8]   // 8 vs 9  -> ćw 0
  ];

  for (let i = 0; i < 4; i++) {
    const [aIdx, bIdx] = playInPairs[i];
    const playerA = topPlayers[aIdx] || BYE;
    const playerB = topPlayers[bIdx] || BYE;
    bracket.roundOf12.push([playerA, playerB]);
  }

  return bracket;
}

function displayPlayoffBracket(playoffBracket) {
  const container = document.getElementById('playoffContainer');
  if (!container) return;

  const savedScores = {};
  container.querySelectorAll('input[type="number"]').forEach(input => {
    savedScores[input.id] = input.value;
  });

  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.gap = '20px';
  container.style.alignItems = 'flex-start';

  const createMatch = (roundKey, index, player1, player2) => {
    const div = document.createElement('div');
    div.classList.add('match');

    const p1Name = document.createElement('span');
    p1Name.id = `${roundKey}${index}_p1`;
    p1Name.textContent = player1 ? player1 : '???';

    const vs = document.createElement('span');
    vs.textContent = ' vs ';

    const p2Name = document.createElement('span');
    p2Name.id = `${roundKey}${index}_p2`;
    p2Name.textContent = player2 ? player2 : '???';

    const p1Score = document.createElement('input');
    p1Score.type = 'number';
    p1Score.id = `${roundKey}_${index}_a`;
    p1Score.classList.add('score-input');
    if (savedScores[p1Score.id] !== undefined) p1Score.value = savedScores[p1Score.id];

    const p2Score = document.createElement('input');
    p2Score.type = 'number';
    p2Score.id = `${roundKey}_${index}_b`;
    p2Score.classList.add('score-input');
    if (savedScores[p2Score.id] !== undefined) p2Score.value = savedScores[p2Score.id];

    div.appendChild(p1Name);
    div.appendChild(vs);
    div.appendChild(p2Name);
    div.appendChild(p1Score);
    div.appendChild(p2Score);

    return div;
  };

  const addColumn = (title, roundData, roundKey) => {
    const column = document.createElement('div');
    column.classList.add('bracket-column');

    const heading = document.createElement('h3');
    heading.textContent = title;
    column.appendChild(heading);

    roundData.forEach((match, i) => {
      const matchDiv = createMatch(roundKey, i, match[0], match[1]);
      column.appendChild(matchDiv);

      const separator = document.createElement('div');
      separator.classList.add('match-separator');
      column.appendChild(separator);
    });

    container.appendChild(column);
  };

  addColumn('Baraże', playoffBracket.roundOf12, 'roundOf12');
  addColumn('Ćwierćfinały', playoffBracket.quarterfinals, 'quarterfinals');
  addColumn('Półfinały', playoffBracket.semifinals || [[], []], 'semifinals');

  const final = playoffBracket.final || [null, null];
  addColumn('Finał', [final.length === 2 ? final : [null, null]], 'final');

  const thirdPlace = playoffBracket.thirdPlace || [null, null];
  addColumn('Mecz o 3. miejsce', [thirdPlace.length === 2 ? thirdPlace : [null, null]], 'thirdPlace');
}

function handlePlayoffResults(playoffBracket) {
  const getScore = (id) => {
    const el = document.getElementById(id);
    return el ? (parseInt(el.value) || 0) : 0;
  };

  const winScore = system.tournament.gameType;

  const determineWinner = (idA, idB, playerA, playerB) => {
    const scoreA = getScore(idA);
    const scoreB = getScore(idB);

    if (!playerA || playerA === BYE) return playerB;
    if (!playerB || playerB === BYE) return playerA;

    if (scoreA === winScore) return playerA;
    if (scoreB === winScore) return playerB;

    return null;
  };

  // baraże -> ćwierćfinały
  playoffBracket.roundOf12.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`roundOf12_${i}_a`, `roundOf12_${i}_b`, a, b);
    const targetMap = [1, 3, 2, 0];
    playoffBracket.quarterfinals[targetMap[i]][1] = winner || null;
  });

  // ćwierćfinały -> półfinały
  playoffBracket.quarterfinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`quarterfinals_${i}_a`, `quarterfinals_${i}_b`, a, b);
    const semiIndex = i < 2 ? 0 : 1;
    const pos = i % 2;
    playoffBracket.semifinals[semiIndex][pos] = winner || null;
  });

  // półfinały -> finał i 3. miejsce
  playoffBracket.semifinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`semifinals_${i}_a`, `semifinals_${i}_b`, a, b);
    const loser = (winner === a) ? b : (winner === b ? a : null);

    playoffBracket.final[i] = winner || null;
    playoffBracket.thirdPlace[i] = loser || null;
  });

  const finalWinner = determineWinner(`final_0_a`, `final_0_b`, playoffBracket.final[0], playoffBracket.final[1]);
  if (finalWinner) console.log('Zwycięzca turnieju:', finalWinner);

  const thirdWinner = determineWinner(`thirdPlace_0_a`, `thirdPlace_0_b`, playoffBracket.thirdPlace[0], playoffBracket.thirdPlace[1]);
  if (thirdWinner) console.log('3. miejsce:', thirdWinner);

  displayPlayoffBracket(playoffBracket);
}

// ===== Globalny stan play-off =====
let currentPlayoffBracket = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();

  updatePlayerPool();
  updateTournamentPlayersList();
  updatePlayerCount();
  updateTournamentPlayerCount();
  updateTournamentStatus();

  refreshRoundsOptions();

  // ustaw selecty wg zapisów
  if (roundsSelectEl) roundsSelectEl.value = String(system.tournament.rounds || 3);
  if (gameTypeSelectEl) gameTypeSelectEl.value = String(system.tournament.gameType || 3);
  if (tableCountSelectEl) tableCountSelectEl.value = String(system.tournament.tableCount || 3);

  renderTablesPicker();

  updateTournamentView();
  updateRanking();

  // listenery
  addPlayerBtnEl?.addEventListener('click', addToPlayerPool);
  newPlayerNameEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addToPlayerPool();
  });

  startBtnEl?.addEventListener('click', startTournament);
  resetBtnEl?.addEventListener('click', resetTournament);

  tableCountSelectEl?.addEventListener('change', () => {
    renderTablesPicker();
  });

  document.getElementById('generatePlayoffBtn')?.addEventListener('click', () => {
    currentPlayoffBracket = generatePlayoffBracket();
    if (currentPlayoffBracket) {
      initPlayoffScheduler(currentPlayoffBracket);
      displayPlayoffBracket(currentPlayoffBracket);
    }
  });

  document.getElementById('updatePlayoffBtn')?.addEventListener('click', () => {
    if (currentPlayoffBracket) handlePlayoffResults(currentPlayoffBracket);
  });

  // stan przycisków
  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2 || system.tournament.isActive;
  if (resetBtnEl) resetBtnEl.disabled = !system.tournament.isActive;
});


// =======================
// PLAY-OFF v2: czytelny widok + stoły (na żywo)
// =======================

function ensurePlayoffMeta(bracket) {
  if (!bracket) return;
  if (!bracket._meta) bracket._meta = { matches: {}, scheduler: { free: [], busy: {} } };

  const mk = (roundKey, idx) => `${roundKey}_${idx}`;
  const ensure = (roundKey, idx) => {
    const key = mk(roundKey, idx);
    if (!bracket._meta.matches[key]) {
      bracket._meta.matches[key] = { id: key, table: null, completed: false, editing: false };
    }
    return bracket._meta.matches[key];
  };

  (bracket.roundOf12 || []).forEach((_, i) => ensure('roundOf12', i));
  (bracket.quarterfinals || []).forEach((_, i) => ensure('quarterfinals', i));
  (bracket.semifinals || []).forEach((_, i) => ensure('semifinals', i));
  ensure('final', 0);
  ensure('thirdPlace', 0);
}

function playoffPlayersReady(p1, p2) {
  return !!p1 && !!p2 && p1 !== BYE && p2 !== BYE;
}

function getPlayoffMatch(bracket, roundKey, idx) {
  if (!bracket) return null;
  if (roundKey === 'roundOf12') return bracket.roundOf12?.[idx] || null;
  if (roundKey === 'quarterfinals') return bracket.quarterfinals?.[idx] || null;
  if (roundKey === 'semifinals') return bracket.semifinals?.[idx] || null;
  if (roundKey === 'final') return (bracket.final?.length === 2 ? bracket.final : [null, null]);
  if (roundKey === 'thirdPlace') return (bracket.thirdPlace?.length === 2 ? bracket.thirdPlace : [null, null]);
  return null;
}

function playoffIsPlayable(bracket, roundKey, idx) {
  const match = getPlayoffMatch(bracket, roundKey, idx);
  if (!match) return false;
  const [p1, p2] = match;
  const meta = bracket._meta.matches[`${roundKey}_${idx}`];
  if (meta?.completed) return false;
  return playoffPlayersReady(p1, p2);
}

function initPlayoffScheduler(bracket) {
  ensurePlayoffMeta(bracket);

  const tables = (system.tournament.tables || []).map(n => parseInt(n)).filter(n => n >= 1 && n <= 9);
  bracket._meta.scheduler = { free: [...tables], busy: {} };

  // wyczyść stoły tylko przy nowej drabince
  Object.values(bracket._meta.matches).forEach(m => { m.table = null; m.completed = false; });

  assignPlayoffTablesWhilePossible(bracket);
}

function assignPlayoffTablesWhilePossible(bracket) {
  ensurePlayoffMeta(bracket);
  const sch = bracket._meta.scheduler;
  if (!sch || !Array.isArray(sch.free)) return;

  const order = [
    ['roundOf12', 4],
    ['quarterfinals', 4],
    ['semifinals', 2],
    ['final', 1],
    ['thirdPlace', 1]
  ];

  const nextPlayable = () => {
    for (const [rk, count] of order) {
      for (let i = 0; i < count; i++) {
        const key = `${rk}_${i}`;
        const meta = bracket._meta.matches[key];
        if (!meta) continue;
        if (meta.table != null) continue;
        if (meta.completed) continue;
        if (playoffIsPlayable(bracket, rk, i)) return { rk, i, key, meta };
      }
    }
    return null;
  };

  while (sch.free.length > 0) {
    const n = nextPlayable();
    if (!n) break;
    const table = sch.free.shift();
    n.meta.table = table;
    sch.busy[table] = n.key;
  }
}

function releasePlayoffTable(bracket, roundKey, idx) {
  ensurePlayoffMeta(bracket);
  const key = `${roundKey}_${idx}`;
  const meta = bracket._meta.matches[key];
  if (!meta || meta.table == null) return;

  const table = meta.table;
  const sch = bracket._meta.scheduler;
  if (sch?.busy?.[table] === key) {
    delete sch.busy[table];
    if (!sch.free.includes(table)) sch.free.push(table);
  }
}

// Override: czytelny display + table badge + blokady inputów
function displayPlayoffBracket(playoffBracket) {
  const container = document.getElementById('playoffContainer');
  if (!container) return;

  ensurePlayoffMeta(playoffBracket);

  // zachowaj wpisane wyniki
  const savedScores = {};
  container.querySelectorAll('input[type="number"]').forEach(input => {
    savedScores[input.id] = input.value;
  });

  container.innerHTML = '';

  const createMatchCard = (roundKey, index) => {
    const key = `${roundKey}_${index}`;
    const meta = playoffBracket._meta.matches[key] || { table: null, completed: false };
    const match = getPlayoffMatch(playoffBracket, roundKey, index) || [null, null];
    const [player1, player2] = match;

    const card = document.createElement('div');
    card.className = 'playoff-match';

    const playable = playoffIsPlayable(playoffBracket, roundKey, index);
    const playing = playable && !meta.completed && meta.table != null;

    if (meta.completed) card.classList.add('completed');
    if (playing) card.classList.add('playing');

    const tableLabel = meta.completed
      ? (meta.table != null ? `Stół ${meta.table}` : 'Zakończony')
      : (meta.editing ? 'Edycja' : (meta.table != null ? `Stół ${meta.table}` : (playable ? 'Czeka' : 'Niegotowy')));

    const badgeClass = (meta.table != null ? 'table-active' : 'table-wait');

    card.innerHTML = `
      <div class="playoff-header">
        <div style="font-weight:700; font-size:12px; color:#444;">${roundKey}</div>
        <span class="table-badge ${badgeClass}">${tableLabel}</span>
      </div>
      <div class="playoff-players">
        <div><strong>${player1 || '???'}</strong></div>
        <div class="playoff-vs">vs</div>
        <div><strong>${player2 || '???'}</strong></div>
      </div>
      <div class="playoff-scores">
        <span style="font-size:12px;color:#666;">Wynik:</span>
        <input type="number" id="${roundKey}_${index}_a" min="0">
        <span class="dash">-</span>
        <input type="number" id="${roundKey}_${index}_b" min="0">
      </div>
    
      ${meta.completed ? `<button class="edit-btn" style="margin-top:8px;" onclick="enablePlayoffEdit('${roundKey}', ${index})">Edytuj</button>` : ''}
`;

    const a = card.querySelector(`#${roundKey}_${index}_a`);
    const b = card.querySelector(`#${roundKey}_${index}_b`);
    if (savedScores[a.id] !== undefined) a.value = savedScores[a.id];
    if (savedScores[b.id] !== undefined) b.value = savedScores[b.id];

    // tylko "grające" (ma stół) są edytowalne
    const disable = meta.completed || (!playing && !meta.editing);
    a.disabled = disable;
    b.disabled = disable;

    // Auto-aktualizacja play-off po zmianie wyniku (tylko dla aktywnych inputów)
    if (!disable) {
      a.addEventListener('input', schedulePlayoffAutoUpdate);
      b.addEventListener('input', schedulePlayoffAutoUpdate);
      a.addEventListener('change', schedulePlayoffAutoUpdate);
      b.addEventListener('change', schedulePlayoffAutoUpdate);
    }

    return card;
  };

  const addColumn = (title, roundKey, count) => {
    const col = document.createElement('div');
    col.className = 'playoff-column';
    const h = document.createElement('h3');
    h.textContent = title;
    col.appendChild(h);
    for (let i = 0; i < count; i++) col.appendChild(createMatchCard(roundKey, i));
    container.appendChild(col);
  };

  addColumn('Baraże', 'roundOf12', 4);
  addColumn('Ćwierćfinały', 'quarterfinals', 4);
  addColumn('Półfinały', 'semifinals', 2);
  addColumn('Finał', 'final', 1);
  addColumn('Mecz o 3. miejsce', 'thirdPlace', 1);
}

// Override: wyniki + zwolnienie stołu + nowy przydział
function handlePlayoffResults(playoffBracket) {
  ensurePlayoffMeta(playoffBracket);

  // ZMIANA: rozróżniamy "puste" pole od 0.
  // Dzięki temu wpisanie wyniku zwycięzcy nie blokuje meczu, dopóki nie wpiszesz wyniku przegranego.
  const getScore = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = (el.value ?? '').trim();
    if (raw === '') return null;
    const n = parseInt(raw);
    return Number.isFinite(n) ? n : null;
  };

  const winScore = system.tournament.gameType;

  const determineWinner = (idA, idB, playerA, playerB) => {
    const scoreA = getScore(idA);
    const scoreB = getScore(idB);

    // WAŻNE: brak zawodnika (null/undefined/???) = mecz jeszcze NIE jest rozstrzygalny.
    // Auto-awans robimy tylko dla BYE.
    if (playerA == null || playerB == null) return null;
    if (playerA === BYE) return playerB;
    if (playerB === BYE) return playerA;

    // JEŚLI któryś wynik nie jest wpisany -> nie rozstrzygamy
    if (scoreA == null || scoreB == null) return null;

    // standard: zwycięzca musi dobić do winScore, przegrany ma mniej niż winScore
    if (scoreA === winScore && scoreB < winScore) return playerA;
    if (scoreB === winScore && scoreA < winScore) return playerB;

    return null;
  };

  const syncCompletion = (roundKey, i, winner) => {
    const key = `${roundKey}_${i}`;
    const meta = playoffBracket._meta.matches[key];
    if (!meta) return;

    // jeśli jest zwycięzca -> mecz zakończony
    if (winner) {
      if (!meta.completed) {
        meta.completed = true;
        meta.editing = false;
        releasePlayoffTable(playoffBracket, roundKey, i);
      }
      return;
    }

    // jeśli nie ma zwycięzcy (np. korekta wyniku) -> odblokuj mecz
    if (meta.completed) {
      meta.completed = false;
      meta.editing = true;
    }
  };

  // baraże -> ćwierćfinały
  playoffBracket.roundOf12.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`roundOf12_${i}_a`, `roundOf12_${i}_b`, a, b);
    syncCompletion('roundOf12', i, winner);
    const targetMap = [1, 3, 2, 0];
    playoffBracket.quarterfinals[targetMap[i]][1] = winner || null;
  });

  // ćwierćfinały -> półfinały
  playoffBracket.quarterfinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`quarterfinals_${i}_a`, `quarterfinals_${i}_b`, a, b);
    syncCompletion('quarterfinals', i, winner);
    const semiIndex = i < 2 ? 0 : 1;
    const pos = i % 2;
    playoffBracket.semifinals[semiIndex][pos] = winner || null;
  });

  // półfinały -> finał i 3. miejsce
  playoffBracket.semifinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`semifinals_${i}_a`, `semifinals_${i}_b`, a, b);
    syncCompletion('semifinals', i, winner);
    const loser = (winner === a) ? b : (winner === b ? a : null);

    playoffBracket.final[i] = winner || null;
    playoffBracket.thirdPlace[i] = loser || null;
  });

  // finał
  const fw = determineWinner(`final_0_a`, `final_0_b`, playoffBracket.final[0], playoffBracket.final[1]);
  syncCompletion('final', 0, fw);

  // 3 miejsce
  const tw = determineWinner(`thirdPlace_0_a`, `thirdPlace_0_b`, playoffBracket.thirdPlace[0], playoffBracket.thirdPlace[1]);
  syncCompletion('thirdPlace', 0, tw);

  // Resetuj meta dla meczów, które stały się "niegotowe" (np. cofnięty wynik w 1/4 usuwa półfinał)
  const resetIfNotReady = (rk, i) => {
    const key = `${rk}_${i}`;
    const meta = playoffBracket._meta.matches[key];
    if (!meta) return;
    if (meta.completed) return;
    if (!playoffIsPlayable(playoffBracket, rk, i) && !meta.editing) {
      // jeśli mecz nie ma dwóch zawodników, nie powinien być zakończony ani mieć przydzielonego stołu
      meta.completed = false;
      meta.table = null;
    }
  };

  ['quarterfinals','semifinals'].forEach((rk) => {
    const count = rk === 'quarterfinals' ? 4 : 2;
    for (let i = 0; i < count; i++) resetIfNotReady(rk, i);
  });
  resetIfNotReady('final', 0);
  resetIfNotReady('thirdPlace', 0);

  // przydziel stoły do nowo gotowych
  assignPlayoffTablesWhilePossible(playoffBracket);

  displayPlayoffBracket(playoffBracket);
}

// --- Auto update play-off (debounce) ---
let playoffAutoUpdateTimer = null;
function schedulePlayoffAutoUpdate() {
  if (!currentPlayoffBracket) return;
  if (playoffAutoUpdateTimer) clearTimeout(playoffAutoUpdateTimer);
  playoffAutoUpdateTimer = setTimeout(() => {
    handlePlayoffResults(currentPlayoffBracket);
  }, 120);
}




/* =======================
   Play-off: ręczna edycja (odblokowanie wyniku)
   ======================= */
function enablePlayoffEdit(roundKey, index) {
  if (!currentPlayoffBracket) return;
  ensurePlayoffMeta(currentPlayoffBracket);

  const key = `${roundKey}_${index}`;
  const meta = currentPlayoffBracket._meta.matches[key];
  if (!meta) return;

  // Włącz tryb edycji: pozwala poprawić wynik nawet bez stołu (to korekta, nie "mecz w trakcie")
  meta.completed = false;
  meta.editing = true;

  displayPlayoffBracket(currentPlayoffBracket);
}
