// =======================
// Turniej bilardowy — script.js (wersja uporządkowana + ręczne rozstrzyganie remisów)
// Zmiany:
// - ręczna kolejność przy pełnym remisie (procent + wonGames) w rankingu (↑/↓ tylko dla remisów)
// - naprawiona walidacja dodawania gracza
// - ujednolicone gameType jako liczba (wszędzie)
// - poprawny zapis/odczyt playedPairs (Set) w localStorage
// - usunięte duplikaty listenerów i konfliktów zmiennych (playoffBracket/currentPlayoffBracket)
// - drobne poprawki: kolor dla bye, stabilny sort po nazwie jako ostatni tie-break
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
    manualOrder: {} // ręczna kolejność w obrębie pełnego remisu
  }
};

// Stały znacznik wolnego losu (używany konsekwentnie w lidze i play-off)
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


// Dynamiczna lista rund:
// - standardowo: 3–5
// - jeśli graczy < 10: pozwól wybrać do pełnego "każdy z każdym"
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


// ===== LocalStorage (Set + manualOrder) =====
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
    system.tournament = {
      players: Array.isArray(t.players) ? t.players : [],
      rounds: Number.isFinite(parseInt(t.rounds)) ? parseInt(t.rounds) : 3,
      currentRound: Number.isFinite(parseInt(t.currentRound)) ? parseInt(t.currentRound) : 0,
      allMatches: Array.isArray(t.allMatches) ? t.allMatches : [],
      playerStats: t.playerStats && typeof t.playerStats === 'object' ? t.playerStats : {},
      playedPairs: new Set(Array.isArray(t.playedPairs) ? t.playedPairs : []),
      isActive: !!t.isActive,
      nextMatchId: Number.isFinite(parseInt(t.nextMatchId)) ? parseInt(t.nextMatchId) : 1,
      gameType: Number.isFinite(parseInt(t.gameType)) ? parseInt(t.gameType) : 3,
      manualOrder: t.manualOrder && typeof t.manualOrder === 'object' ? t.manualOrder : {}
    };
  } catch (e) {
    console.warn('Błąd wczytywania localStorage:', e);
  }

  // normalizacja starych zapisów: null -> BYE
  if (Array.isArray(system.tournament.allMatches)) {
    system.tournament.allMatches.forEach(m => {
      if (m.player1 === null) m.player1 = BYE;
      if (m.player2 === null) m.player2 = BYE;
      m.isBye = (m.player1 === BYE || m.player2 === BYE);
    });
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

  // FIX: poprawna walidacja
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
  system.tournament.gameType = parseInt(gameTypeSelectEl.value) || 3; // liczba
  system.tournament.currentRound = 1;
  system.tournament.allMatches = [];
  system.tournament.playedPairs = new Set();
  system.tournament.isActive = true;
  system.tournament.nextMatchId = 1;
  system.tournament.manualOrder = {};

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
    manualOrder: {}
  };

  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2;
  if (resetBtnEl) resetBtnEl.disabled = true;
  if (exportBtnEl) exportBtnEl.style.display = 'none';

  updateTournamentView();
  updateRanking();
  updateTournamentStatus();
  saveToLocalStorage();
}

// ===== Generowanie rund i par =====
function generateAllRounds() {
  const roundsToPlay = system.tournament.rounds;

  // OPCJA 1: losujemy kolejność TYLKO RAZ na start turnieju
  let players = shuffleArray([...system.tournament.players]);

  // Jeśli nieparzysta liczba graczy – dodajemy BYE
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
    console.warn(`Za dużo rund (${roundsToPlay}). Maksimum bez powtórek dla tej liczby graczy: ${maxRounds}. Ucinam do ${rounds}.`);
  }

  // Circle method (round-robin): brak powtórek = gwarancja
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
    players = [
      players[0],
      players[n - 1],
      ...players.slice(1, n - 1)
    ];
  }
}

// ===== Wyniki meczów (liga) =====
function updateMatchScore(globalIndex, playerNumber, value) {
  const match = system.tournament.allMatches[globalIndex];
  const winThreshold = system.tournament.gameType;

  const numValue = Math.max(0, Math.min(winThreshold, parseInt(value) || 0));

  const prevScore1 = match.score1;
  const prevScore2 = match.score2;

  if (playerNumber === 1) match.score1 = numValue;
  else match.score2 = numValue;

  updateStatsAfterEdit(match, prevScore1, prevScore2);

  match.completed = (match.score1 === winThreshold || match.score2 === winThreshold);

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

  updateRanking();
  saveToLocalStorage();
}

function updateStatsAfterEdit(match, prevScore1, prevScore2) {
  const stats = system.tournament.playerStats;
  const { player1, player2 } = match;

  if (!stats[player1]) stats[player1] = { matches: 0, wonGames: 0, totalGames: 0, byes: 0 };
  if (player2 && player2 !== BYE && !stats[player2]) stats[player2] = { matches: 0, wonGames: 0, totalGames: 0, byes: 0 };

  if (player1) {
    stats[player1].wonGames -= prevScore1;
    stats[player1].totalGames -= (prevScore1 + (prevScore2 || 0));
  }
  if (player2 && player2 !== BYE) {
    stats[player2].wonGames -= prevScore2;
    stats[player2].totalGames -= (prevScore2 + prevScore1);
  }

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
      matchDiv.dataset.id = match.id;
      const maxScore = system.tournament.gameType;

      const p1 = (match.player1 === null ? BYE : match.player1);
      const p2 = (match.player2 === null ? BYE : match.player2);
      const p2Label = p2 ? p2 : 'bye';

      matchDiv.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="billiard-ball" style="background:${getPlayerColor(p1)}"></div>
          <strong>${p1}</strong>
          <span>vs</span>
          <strong>${p2Label}</strong>
          <div class="billiard-ball" style="background:${getPlayerColor(p2)}"></div>
        </div>
        <div class="match-controls">
          <input type="number" min="0" max="${maxScore}"
            value="${match.score1}"
            data-player="1"
            onchange="updateMatchScore(${match.globalIndex}, 1, this.value)"
            ${match.completed ? 'disabled' : ''}>
          <span> - </span>
          <input type="number" min="0" max="${maxScore}"
            value="${match.score2}"
            data-player="2"
            onchange="updateMatchScore(${match.globalIndex}, 2, this.value)"
            ${match.completed ? 'disabled' : ''}>
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
    if (winner) {
      const targetMap = [1, 3, 2, 0];
      playoffBracket.quarterfinals[targetMap[i]][1] = winner;
    }
  });

  // ćwierćfinały -> półfinały
  playoffBracket.quarterfinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`quarterfinals_${i}_a`, `quarterfinals_${i}_b`, a, b);
    if (winner) {
      const semiIndex = i < 2 ? 0 : 1;
      const pos = i % 2;
      playoffBracket.semifinals[semiIndex][pos] = winner;
    }
  });

  // półfinały -> finał i 3. miejsce
  playoffBracket.semifinals.forEach((match, i) => {
    const [a, b] = match;
    const winner = determineWinner(`semifinals_${i}_a`, `semifinals_${i}_b`, a, b);
    const loser = (winner === a) ? b : (winner === b ? a : null);

    if (winner) playoffBracket.final[i] = winner;
    if (loser) playoffBracket.thirdPlace[i] = loser;
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

  updateTournamentView();
  updateRanking();

  // listenery (raz)
  addPlayerBtnEl?.addEventListener('click', addToPlayerPool);

  // enter w input dodawania
  newPlayerNameEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addToPlayerPool();
  });

  startBtnEl?.addEventListener('click', startTournament);
  resetBtnEl?.addEventListener('click', resetTournament);

  document.getElementById('generatePlayoffBtn')?.addEventListener('click', () => {
    currentPlayoffBracket = generatePlayoffBracket();
    if (currentPlayoffBracket) displayPlayoffBracket(currentPlayoffBracket);
  });

  document.getElementById('updatePlayoffBtn')?.addEventListener('click', () => {
    if (currentPlayoffBracket) handlePlayoffResults(currentPlayoffBracket);
  });

  // stan przycisków
  if (startBtnEl) startBtnEl.disabled = system.tournament.players.length < 2 || system.tournament.isActive;
  if (resetBtnEl) resetBtnEl.disabled = !system.tournament.isActive;
});
