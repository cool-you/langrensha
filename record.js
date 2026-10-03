let config = null;
let allIdentities = [];
let players = {};
let nightsData = [];
let speechesData = [];
let activePlayer = null;
let editingNightIdx = -1;
let currentStatementIdx = 0;
let editingSpeechPlayerIdx = -1;
let editingSpeechRoundIdx  = -1;
let currentSpeechStatementIdx = 0;
let colorMap = {};
let expandedNights = new Set();
let expandedSpeeches = new Set();
let expandedSpeechRounds = new Set();
let customActions = [];

const STORAGE_KEYS = {
    config:   "wolfgame_config",
    players:  "wolfgame_players",
    nights:   "wolfgame_nights",
    speeches: "wolfgame_speeches",
    actions:  "wolfgame_custom_actions"
};

const IDENTITY_COLORS = {
    '狼人':'#d14836','预言家':'#4a7cc9','女巫':'#7b5ea7',
    '猎人':'#2f9e6e','守卫':'#d99a2b','白痴':'#4aa8b8',
    '平民':'#96968f','好人':'#3f9d7a'
};

const CUSTOM_PALETTE = [
    '#8a5bb8','#c96b9b','#3d8b7a','#b5834a',
    '#5a7fc4','#a04a4a','#7a8b3d','#4a8ba0'
];

/* 夜晚动作（新增 猎人「带」、白痴「翻」） */
const KB_ACTIONS = ['刀', '救', '毒', '验', '守', '带', '翻'];
/* 死亡方式（新增「平安夜」） */
const KB_DEATHS  = ['平安夜', '毒杀', '刀杀', '奶穿'];

/* 发言「自拟」固定词条（"归"需警长标记） */
const SPEECH_KEYWORDS = ['站', '保', '踩', '疑', '投', '跳'];

const SPEECH_KEYWORD_MAP = {
    '预言家': '金水',
    '女巫':   '银水'
};
const SPEECH_KEYWORD_SHERIFF = '归';

const TOKEN_COLORS = {
    '狼人':'#d14836','预言家':'#4a7cc9','女巫':'#7b5ea7',
    '猎人':'#2f9e6e','守卫':'#d99a2b','白痴':'#4aa8b8',
    '平民':'#96968f','好人':'#3f9d7a',
    '刀':'#8b1a1a','救':'#4aa85c','毒':'#7b5ea7',
    '验':'#4a7cc9','守':'#d99a2b',
    '带':'#2f9e6e','翻':'#4aa8b8',
    '毒杀':'#7b5ea7','刀杀':'#8b1a1a','奶穿':'#3f9d7a',
    '平安夜':'#3f7d55',
    '金水':'#4a7cc9','银水':'#7b5ea7','归':'#d99a2b'
};

const SUSPECT_ALPHA = 0.55;

/* ============================================
   初始化
   ============================================ */
window.onload = function () {
    const rawConfig = safeRead(STORAGE_KEYS.config);
    if (!rawConfig || typeof rawConfig !== 'object') {
        alert("请先完成身份配置");
        location.href = "index.html";
        return;
    }
    config = rawConfig;
    if (typeof config.total !== 'number' || config.total < 1) {
        alert("配置数据异常，请返回重新配置");
        location.href = "index.html";
        return;
    }

    const rawPlayers = safeRead(STORAGE_KEYS.players);
    players = (rawPlayers && typeof rawPlayers === 'object' && !Array.isArray(rawPlayers))
        ? rawPlayers : {};

    const rawNights = safeRead(STORAGE_KEYS.nights);
    nightsData = Array.isArray(rawNights) ? normalizeNights(rawNights) : [];
    if (nightsData.length === 0) migrateFromOldNights();

    const rawSpeeches = safeRead(STORAGE_KEYS.speeches);
    speechesData = Array.isArray(rawSpeeches) ? normalizeSpeeches(rawSpeeches) : [];
    ensureSpeechesLength();

    const rawActions = safeRead(STORAGE_KEYS.actions);
    customActions = Array.isArray(rawActions)
        ? rawActions.filter(a => typeof a === 'string' && a.trim()) : [];

    try {
        buildIdentities();
        buildColorMap();
        initPlayers();
        renderPanels();
        renderSpeechList();
    } catch (err) {
        console.error("[狼人杀] 渲染出错：", err);
    }
};

function safeRead(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { console.warn(`[狼人杀] ${key} 解析失败`, e); return null; }
}

/* ============================================
   归一化
   ============================================ */
function normalizeNights(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(night => {
        if (night && Array.isArray(night.statements)) {
            return { statements: night.statements.filter(s => typeof s === 'string').slice() };
        }
        if (night && Array.isArray(night.phrases)) {
            return { statements: night.phrases.map(p => `${p.player}号 ${p.action}`) };
        }
        const stmts = [];
        if (night && typeof night === 'object') {
            for (let pid in night) {
                const nd = night[pid];
                if (!nd) continue;
                if (nd.death) stmts.push(`${pid}号 ${nd.death}`);
                (nd.skills || []).forEach(s => stmts.push(`${pid}号 ${s}`));
            }
        }
        return { statements: stmts };
    }).filter(n => n.statements.length > 0);
}

function normalizeSpeeches(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
        if (item && Array.isArray(item.rounds)) {
            return { rounds: item.rounds.map(r => ({
                statements: Array.isArray(r && r.statements)
                    ? r.statements.filter(s => typeof s === 'string') : []
            }))};
        }
        if (item && Array.isArray(item.statements)) {
            return { rounds: [{ statements: item.statements.filter(s => typeof s === 'string') }] };
        }
        return { rounds: [] };
    });
}

function ensureSpeechesLength() {
    while (speechesData.length < config.total) speechesData.push({ rounds: [] });
    if (speechesData.length > config.total) speechesData.length = config.total;
    for (let i = 0; i < speechesData.length; i++) {
        const item = speechesData[i];
        if (!item || typeof item !== 'object') { speechesData[i] = { rounds: [] }; continue; }
        if (!Array.isArray(item.rounds)) item.rounds = [];
    }
}

function migrateFromOldNights() {
    let maxN = 0;
    for (let k in players) {
        const p = players[k];
        if (p && Array.isArray(p.nights)) maxN = Math.max(maxN, p.nights.length);
    }
    if (maxN === 0) return;
    const oldArr = [];
    for (let n = 0; n < maxN; n++) {
        const obj = {};
        for (let k in players) {
            const p = players[k];
            if (p && p.nights && p.nights[n]) {
                const nd = p.nights[n];
                if (nd.death || (nd.skills && nd.skills.length)) {
                    obj[k] = { death: nd.death || '', skills: nd.skills || [] };
                }
            }
        }
        oldArr.push(obj);
    }
    nightsData = normalizeNights(oldArr);
    for (let k in players) if (players[k]) delete players[k].nights;
    persist(); persistNights();
}

function buildIdentities() {
    const items = [];
    if (config.wolf)   items.push({ name: '狼人' });
    if (config.seer)   items.push({ name: '预言家' });
    if (config.witch)  items.push({ name: '女巫' });
    if (config.hunter) items.push({ name: '猎人' });
    if (config.guard)  items.push({ name: '守卫' });
    if (config.idiot)  items.push({ name: '白痴' });
    if (config.civil)  items.push({ name: '平民' });
    (config.custom || []).forEach(c => {
        if (c.name && c.name !== '好人') items.push({ name: c.name });
    });
    items.push({ name: '好人' });
    allIdentities = items;
}

function buildColorMap() {
    colorMap = {};
    let ci = 0;
    allIdentities.forEach(item => {
        if (IDENTITY_COLORS[item.name]) colorMap[item.name] = IDENTITY_COLORS[item.name];
        else { colorMap[item.name] = CUSTOM_PALETTE[ci % CUSTOM_PALETTE.length]; ci++; }
    });
}

function colorOf(name) { return colorMap[name] || '#96968f'; }

function migrate(v) {
    const base = { suspects: [], locked: [], sheriff: false };
    if (v && typeof v === 'object') {
        if (Array.isArray(v.suspects)) base.suspects = v.suspects.slice();
        if (Array.isArray(v.locked))   base.locked   = v.locked.slice();
        base.sheriff = !!v.sheriff;
    }
    return base;
}

function initPlayers() {
    for (let i = 1; i <= config.total; i++) players[i] = migrate(players[i]);
}

/* ============================================
   工具
   ============================================ */
function withAlpha(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function avatarBackground(locked, suspected) {
    const list = [
        ...locked.map(n => ({ n, locked: true })),
        ...suspected.map(n => ({ n, locked: false }))
    ];
    if (list.length === 0) return '';
    if (list.length === 1) {
        const it = list[0];
        return it.locked ? colorOf(it.n) : withAlpha(colorOf(it.n), SUSPECT_ALPHA);
    }
    const n = list.length;
    const stops = list.map((it, i) => {
        const a = (i * 100 / n).toFixed(4);
        const b = ((i + 1) * 100 / n).toFixed(4);
        const c = it.locked ? colorOf(it.n) : withAlpha(colorOf(it.n), SUSPECT_ALPHA);
        return `${c} ${a}% ${b}%`;
    }).join(', ');
    return `conic-gradient(${stops})`;
}

/* ============================================
   左侧
   ============================================ */
function renderPanels() { renderIdentityPanel(); renderNightPanel(); }

function renderIdentityPanel() {
    const grid = document.getElementById('identityList');
    if (!grid) return;
    const keep = grid.scrollTop;
    let html = '';

    for (let i = 1; i <= config.total; i++) {
        const p = players[i];
        const hasMark = p.locked.length + p.suspects.length > 0;
        const chips = [];
        if (p.sheriff) chips.push('<span class="mark-chip mark-sheriff">★ 警长</span>');
        p.locked.forEach(name => {
            chips.push(`<span class="mark-chip locked" style="--chip-color:${colorOf(name)}">${escapeHtml(name)}</span>`);
        });
        p.suspects.forEach(name => {
            chips.push(`<span class="mark-chip suspected" style="--chip-color:${colorOf(name)}">${escapeHtml(name)}</span>`);
        });

        html += `
            <div class="player-line">
                <button class="avatar ${hasMark ? 'marked' : ''}" data-player="${i}" aria-label="玩家 ${i}">
                    <span class="avatar-num">${i}</span>
                </button>
                <div class="player-marks">
                    ${chips.length ? chips.join('') : '<span class="mark-empty">未标记</span>'}
                </div>
            </div>
        `;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.avatar').forEach(btn => {
        const i = Number(btn.dataset.player);
        const bg = avatarBackground(players[i].locked, players[i].suspects);
        if (bg) btn.style.background = bg;
        btn.onclick = () => openModal(i);
    });
    grid.scrollTop = keep;
}

function renderNightPanel() {
    const list = document.getElementById('nightsList');
    if (!list) return;
    const keep = list.scrollTop;
    let html = '';

    nightsData.forEach((night, i) => {
        const expanded = expandedNights.has(i);
        const count = night.statements.length;
        let bodyHtml = '';
        if (expanded) {
            bodyHtml = count
                ? night.statements.map(s => renderNightStatement(s)).join('')
                : '<div class="night-fold-empty">暂无记录</div>';
            bodyHtml += `<button class="night-fold-edit" onclick="openNightEditor(${i})">编辑此夜</button>`;
        }
        html += `
            <div class="night-fold ${expanded ? 'expanded' : ''}">
                <button class="night-fold-head" onclick="toggleNightFold(${i})">
                    <span class="night-fold-title">第${i + 1}夜</span>
                    <span class="night-fold-count">${count} 条</span>
                    <span class="night-fold-arrow">›</span>
                </button>
                <div class="night-fold-body">${bodyHtml}</div>
            </div>
        `;
    });
    html += `<button class="night-add" onclick="addNewNight()">+ 加夜</button>`;
    list.innerHTML = html;
    list.scrollTop = keep;
}

function renderNightStatement(stmt) {
    const tokens = stmt.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '';
    const inner = tokens.map(t => {
        if (/^\d+号$/.test(t)) return `<span class="tk tk-num">${escapeHtml(t)}</span>`;
        const color = TOKEN_COLORS[t];
        if (color) return `<span class="tk tk-event" style="background:${color}">${escapeHtml(t)}</span>`;
        return `<span class="tk tk-plain">${escapeHtml(t)}</span>`;
    }).join('');
    return `<div class="night-stmt">${inner}</div>`;
}

function toggleNightFold(i) {
    expandedNights.has(i) ? expandedNights.delete(i) : expandedNights.add(i);
    renderNightPanel();
}

/* ============================================
   右侧：发言记录（玩家 → 轮次）
   ============================================ */
function renderSpeechList() {
    const list = document.getElementById('speechList');
    if (!list) return;
    const keep = list.scrollTop;
    let html = '';

    for (let pi = 0; pi < config.total; pi++) {
        const entry = speechesData[pi] || { rounds: [] };
        const expanded = expandedSpeeches.has(pi);
        const totalRounds = entry.rounds.length;
        const totalStmts = entry.rounds.reduce((s, r) => s + r.statements.length, 0);
        const p = players[pi + 1] || {};
        const sheriffTag = p.sheriff ? '<span class="sp-sheriff">★ 警长</span>' : '';
        const metaText = totalRounds > 0 ? `${totalRounds} 轮 · ${totalStmts} 条` : '0 轮';

        let bodyHtml = '';
        if (expanded) {
            bodyHtml += '<div class="speech-rounds">';
            entry.rounds.forEach((round, ri) => {
                const rKey = pi + '-' + ri;
                const rExpanded = expandedSpeechRounds.has(rKey);
                const count = round.statements.length;
                let innerHtml = '';
                if (rExpanded) {
                    innerHtml = count
                        ? round.statements.map(s => renderNightStatement(s)).join('')
                        : '<div class="night-fold-empty">暂无发言</div>';
                    innerHtml += `<button class="night-fold-edit" onclick="openSpeechEditor(${pi}, ${ri})">编辑此轮</button>`;
                }
                bodyHtml += `
                    <div class="night-fold speech-round-fold ${rExpanded ? 'expanded' : ''}">
                        <button class="night-fold-head" onclick="toggleSpeechRoundFold(${pi}, ${ri})">
                            <span class="night-fold-title">第${ri + 1}轮</span>
                            <span class="night-fold-count">${count} 条</span>
                            <span class="night-fold-arrow">›</span>
                        </button>
                        <div class="night-fold-body">${innerHtml}</div>
                    </div>
                `;
            });
            bodyHtml += '</div>';
            bodyHtml += `<button class="speech-round-add" onclick="addNewSpeechRound(${pi})">+ 加轮</button>`;
        }

        html += `
            <div class="night-fold ${expanded ? 'expanded' : ''}">
                <button class="night-fold-head" onclick="toggleSpeechFold(${pi})">
                    <span class="night-fold-title">${pi + 1} 号</span>
                    ${sheriffTag}
                    <span class="night-fold-count">${metaText}</span>
                    <span class="night-fold-arrow">›</span>
                </button>
                <div class="night-fold-body">${bodyHtml}</div>
            </div>
        `;
    }
    list.innerHTML = html;
    list.scrollTop = keep;
}

function toggleSpeechFold(pi) {
    expandedSpeeches.has(pi) ? expandedSpeeches.delete(pi) : expandedSpeeches.add(pi);
    renderSpeechList();
}

function toggleSpeechRoundFold(pi, ri) {
    const key = pi + '-' + ri;
    expandedSpeechRounds.has(key) ? expandedSpeechRounds.delete(key) : expandedSpeechRounds.add(key);
    renderSpeechList();
}

function addNewSpeechRound(pi) {
    const entry = speechesData[pi];
    if (!entry) return;
    entry.rounds.push({ statements: [''] });
    persistSpeeches();
    expandedSpeeches.add(pi);
    expandedSpeechRounds.add(pi + '-' + (entry.rounds.length - 1));
    openSpeechEditor(pi, entry.rounds.length - 1);
}

/* ============================================
   玩家标记弹窗
   ============================================ */
function openModal(index) {
    activePlayer = index;
    document.getElementById('modalTitle').textContent = `${index} 号 · 标记`;
    renderSuspectOptions();
    renderSheriffToggle();
    document.getElementById('playerModal').classList.add('show');
}
function closeModal() {
    document.getElementById('playerModal').classList.remove('show');
    activePlayer = null;
    renderPanels();
    renderSpeechList();
}
function onOverlayClick(e) { if (e.target === e.currentTarget) closeModal(); }

function stateOf(p, name) {
    if (p.locked.includes(name))   return 'lock';
    if (p.suspects.includes(name)) return 'suspect';
    return 'none';
}

function renderSuspectOptions() {
    const grid = document.getElementById('suspectGrid');
    if (!grid) return;
    const p = players[activePlayer];
    grid.innerHTML = allIdentities.map(item => {
        const color = colorOf(item.name);
        const state = stateOf(p, item.name);
        const extraCls = item.name === '好人' ? ' is-extra' : '';
        return `
            <button class="suspect-btn state-${state}${extraCls}"
                    style="--btn-color:${color};--btn-color-soft:${withAlpha(color, 0.14)}"
                    data-name="${escapeAttr(item.name)}">
                <span class="suspect-dot"></span>${escapeHtml(item.name)}
            </button>
        `;
    }).join('');
    grid.querySelectorAll('.suspect-btn').forEach(btn => {
        btn.onclick = () => cycleSuspect(btn.dataset.name);
    });
}

function cycleSuspect(name) {
    const p = players[activePlayer];
    const state = stateOf(p, name);
    if (state === 'none') {
        if (p.locked.length > 0) { p.locked = [name]; p.suspects = []; }
        else p.suspects.push(name);
    } else if (state === 'suspect') {
        p.suspects = []; p.locked = [name];
    } else {
        p.locked = [];
    }
    persist();
    renderPanels();
    renderSuspectOptions();
}

function renderSheriffToggle() {
    const p = players[activePlayer];
    const btn = document.getElementById('sheriffToggle');
    if (!btn) return;
    btn.classList.toggle('active', p.sheriff);
    document.getElementById('sheriffText').textContent = p.sheriff ? '取消警长' : '设为警长';
}

function toggleSheriff() {
    const isS = players[activePlayer].sheriff;
    for (let k in players) players[k].sheriff = false;
    if (!isS) players[activePlayer].sheriff = true;
    persist();
    renderPanels();
    renderSheriffToggle();
    renderSpeechList();
}

/* ============================================
   自定义动作
   ============================================ */
function addCustomAction() {
    const name = (prompt('输入动作名称（最多 6 字）') || '').trim();
    if (!name) return;
    if (name.length > 6) { alert('名称不超过 6 个字'); return; }
    if (KB_ACTIONS.includes(name) || customActions.includes(name)) {
        alert('该动作已存在'); return;
    }
    customActions.push(name);
    persistActions();
    renderKbActions();
    renderSpKbActions();
}

function deleteCustomAction(i) {
    const name = customActions[i];
    if (!name) return;
    if (!confirm(`删除动作「${name}」？`)) return;
    customActions.splice(i, 1);
    persistActions();
    renderKbActions();
    renderSpKbActions();
}

function persistActions() {
    try { localStorage.setItem(STORAGE_KEYS.actions, JSON.stringify(customActions)); }
    catch (e) { console.error(e); }
}

/* ============================================
   夜晚编辑器
   ============================================ */
function addNewNight() {
    nightsData.push({ statements: [''] });
    persistNights();
    expandedNights.add(nightsData.length - 1);
    openNightEditor(nightsData.length - 1);
}

function openNightEditor(idx) {
    editingNightIdx = idx;
    const night = nightsData[idx];
    if (!night) return;
    if (night.statements.length === 0) night.statements.push('');
    currentStatementIdx = 0;
    document.getElementById('nightEditorTitle').textContent = `第 ${idx + 1} 夜`;
    renderNightEditor();
    document.getElementById('nightEditorModal').classList.add('show');
    focusNightStatementInput(currentStatementIdx);
}

function closeNightEditor() {
    const night = nightsData[editingNightIdx];
    if (night) {
        night.statements = night.statements.filter(s => s && s.trim());
        if (night.statements.length === 0) {
            nightsData.splice(editingNightIdx, 1);
            expandedNights.delete(editingNightIdx);
        }
    }
    persistNights();
    document.getElementById('nightEditorModal').classList.remove('show');
    editingNightIdx = -1;
    currentStatementIdx = 0;
    renderPanels();
    renderSpeechList();
}

function onNightEditorOverlayClick(e) { if (e.target === e.currentTarget) closeNightEditor(); }

function deleteCurrentNight() {
    if (!confirm(`确定删除第 ${editingNightIdx + 1} 夜？`)) return;
    nightsData.splice(editingNightIdx, 1);
    expandedNights.delete(editingNightIdx);
    persistNights();
    document.getElementById('nightEditorModal').classList.remove('show');
    editingNightIdx = -1;
    currentStatementIdx = 0;
    renderPanels();
    renderSpeechList();
}

function renderNightEditor() {
    renderKbNumbers();
    renderKbActions();
    renderKbDeaths();
    renderKbIdentities();
    renderStatements();
}

function renderKbNumbers() {
    const row = document.getElementById('kbNumbers');
    if (!row) return;
    let html = '';
    for (let i = 1; i <= config.total; i++) {
        html += `<button class="kb-btn" onclick="clickNumber(${i})">${i}</button>`;
    }
    row.innerHTML = html;
}

function renderKbActions() {
    const row = document.getElementById('kbActions');
    if (!row) return;
    let html = KB_ACTIONS.map(a =>
        `<button class="kb-btn" onclick="clickAction('${a}')">${a}</button>`
    ).join('');
    html += customActions.map((a, i) =>
        `<button class="kb-btn kb-custom" title="双击删除"
                 onclick="clickAction('${escapeAttr(a)}')"
                 ondblclick="deleteCustomAction(${i})">${escapeHtml(a)}</button>`
    ).join('');
    html += `<button class="kb-btn kb-add-action" title="添加动作" onclick="addCustomAction()">+ 添加</button>`;
    row.innerHTML = html;
}

function renderKbDeaths() {
    const row = document.getElementById('kbDeaths');
    if (!row) return;
    row.innerHTML = KB_DEATHS.map(a =>
        `<button class="kb-btn" onclick="clickAction('${a}')">${a}</button>`
    ).join('');
}

function renderKbIdentities() {
    const row = document.getElementById('kbIdentities');
    if (!row) return;
    row.innerHTML = allIdentities.map(item => {
        const extraCls = item.name === '好人' ? ' kb-extra' : '';
        return `<button class="kb-btn kb-identity${extraCls}"
                         onclick="clickAction('${escapeAttr(item.name)}')">${escapeHtml(item.name)}</button>`;
    }).join('');
}

function clickNumber(n) { appendToStatement(n + '号'); }
function clickAction(a) { appendToStatement(a); }

function appendToStatement(text) {
    const night = nightsData[editingNightIdx];
    if (!night) return;
    if (night.statements.length === 0) { night.statements.push(''); currentStatementIdx = 0; }
    if (currentStatementIdx < 0 || currentStatementIdx >= night.statements.length) {
        currentStatementIdx = night.statements.length - 1;
    }
    const cur = night.statements[currentStatementIdx];
    night.statements[currentStatementIdx] = cur ? cur + ' ' + text : text;
    persistNights();
    renderStatements();
    focusNightStatementInput(currentStatementIdx);
}

function renderStatements() {
    const list = document.getElementById('stmtList');
    if (!list) return;
    const night = nightsData[editingNightIdx];
    if (!night) return;
    if (night.statements.length === 0) night.statements.push('');
    if (currentStatementIdx < 0 || currentStatementIdx >= night.statements.length) {
        currentStatementIdx = night.statements.length - 1;
    }
    list.innerHTML = night.statements.map((stmt, i) => `
        <div class="stmt-item ${i === currentStatementIdx ? 'selected' : ''}">
            <input class="stmt-input" type="text" value="${escapeAttr(stmt)}"
                   placeholder="点击键盘，或直接打字…"
                   oninput="updateStatement(${i}, this.value)"
                   onfocus="setCurrentStatement(${i})"
                   onkeydown="onStatementKey(event, ${i})">
            <button class="stmt-del" onclick="deleteStatement(${i}, event)" aria-label="删除">×</button>
        </div>
    `).join('');
}

function updateStatement(i, val) {
    const night = nightsData[editingNightIdx];
    if (!night) return;
    night.statements[i] = val;
    persistNights();
}

function setCurrentStatement(i) {
    currentStatementIdx = i;
    const list = document.getElementById('stmtList');
    if (!list) return;
    list.querySelectorAll('.stmt-item').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
    });
}

function focusNightStatementInput(i) {
    const list = document.getElementById('stmtList');
    if (!list) return;
    const inputs = list.querySelectorAll('.stmt-input');
    const el = inputs[i];
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try { el.setSelectionRange(len, len); } catch (e) {}
}

function onStatementKey(e, i) {
    if (e.key === 'Enter') { e.preventDefault(); addStatement(); }
}

function addStatement() {
    const night = nightsData[editingNightIdx];
    if (!night) return;
    night.statements.push('');
    currentStatementIdx = night.statements.length - 1;
    persistNights();
    renderStatements();
    focusNightStatementInput(currentStatementIdx);
}

function deleteStatement(i, event) {
    event.stopPropagation();
    const night = nightsData[editingNightIdx];
    if (!night) return;
    night.statements.splice(i, 1);
    if (night.statements.length === 0) night.statements.push('');
    if (currentStatementIdx >= night.statements.length) currentStatementIdx = night.statements.length - 1;
    if (currentStatementIdx < 0) currentStatementIdx = 0;
    persistNights();
    renderStatements();
    focusNightStatementInput(currentStatementIdx);
}

/* ============================================
   发言编辑器
   ============================================ */
function currentSpeechRound() {
    const entry = speechesData[editingSpeechPlayerIdx];
    if (!entry) return null;
    return entry.rounds[editingSpeechRoundIdx] || null;
}

function openSpeechEditor(pi, ri) {
    editingSpeechPlayerIdx = pi;
    editingSpeechRoundIdx  = ri;
    const entry = speechesData[pi];
    if (!entry) return;
    const round = entry.rounds[ri];
    if (!round) return;
    if (round.statements.length === 0) round.statements.push('');
    currentSpeechStatementIdx = 0;
    document.getElementById('speechEditorTitle').textContent = `${pi + 1} 号 · 第 ${ri + 1} 轮`;
    renderSpeechEditor();
    document.getElementById('speechEditorModal').classList.add('show');
    focusSpeechStatementInput(currentSpeechStatementIdx);
}

function closeSpeechEditor() {
    const entry = speechesData[editingSpeechPlayerIdx];
    const round = entry && entry.rounds[editingSpeechRoundIdx];
    if (round) {
        round.statements = round.statements.filter(s => s && s.trim());
        if (round.statements.length === 0) {
            const key = editingSpeechPlayerIdx + '-' + editingSpeechRoundIdx;
            entry.rounds.splice(editingSpeechRoundIdx, 1);
            expandedSpeechRounds.delete(key);
        }
    }
    persistSpeeches();
    document.getElementById('speechEditorModal').classList.remove('show');
    editingSpeechPlayerIdx = -1;
    editingSpeechRoundIdx  = -1;
    currentSpeechStatementIdx = 0;
    renderPanels();
    renderSpeechList();
}

function onSpeechEditorOverlayClick(e) { if (e.target === e.currentTarget) closeSpeechEditor(); }

function deleteCurrentSpeechRound() {
    if (editingSpeechPlayerIdx < 0 || editingSpeechRoundIdx < 0) return;
    if (!confirm(`确定删除 ${editingSpeechPlayerIdx + 1} 号 · 第 ${editingSpeechRoundIdx + 1} 轮？`)) return;
    const entry = speechesData[editingSpeechPlayerIdx];
    if (!entry) return;
    entry.rounds.splice(editingSpeechRoundIdx, 1);
    expandedSpeechRounds.delete(editingSpeechPlayerIdx + '-' + editingSpeechRoundIdx);
    persistSpeeches();
    document.getElementById('speechEditorModal').classList.remove('show');
    editingSpeechPlayerIdx = -1;
    editingSpeechRoundIdx  = -1;
    currentSpeechStatementIdx = 0;
    renderPanels();
    renderSpeechList();
}

function renderSpeechEditor() {
    renderSpKbNumbers();
    renderSpKbActions();
    renderSpKbTitles();
    renderSpKbIdentities();
    renderSpStatements();
}

function renderSpKbNumbers() {
    const row = document.getElementById('spKbNumbers');
    if (!row) return;
    let html = '';
    for (let i = 1; i <= config.total; i++) {
        html += `<button class="kb-btn" onclick="spClickNumber(${i})">${i}</button>`;
    }
    row.innerHTML = html;
}

function renderSpKbActions() {
    const row = document.getElementById('spKbActions');
    if (!row) return;
    let html = KB_ACTIONS.map(a =>
        `<button class="kb-btn" onclick="spClickAction('${a}')">${a}</button>`
    ).join('');
    html += customActions.map((a, i) =>
        `<button class="kb-btn kb-custom" title="双击删除"
                 onclick="spClickAction('${escapeAttr(a)}')"
                 ondblclick="deleteCustomAction(${i})">${escapeHtml(a)}</button>`
    ).join('');
    html += `<button class="kb-btn kb-add-action" title="添加动作" onclick="addCustomAction()">+ 添加</button>`;
    row.innerHTML = html;
}

function renderSpKbTitles() {
    const row = document.getElementById('spKbTitles');
    if (!row) return;
    const list = SPEECH_KEYWORDS.slice();
    const pi = editingSpeechPlayerIdx;
    if (pi >= 0) {
        const p = players[pi + 1];
        if (p) {
            const locked   = Array.isArray(p.locked)   ? p.locked   : [];
            const suspects = Array.isArray(p.suspects) ? p.suspects : [];
            const hasMark  = name => locked.includes(name) || suspects.includes(name);
            Object.keys(SPEECH_KEYWORD_MAP).forEach(identity => {
                if (hasMark(identity)) {
                    const word = SPEECH_KEYWORD_MAP[identity];
                    if (!list.includes(word)) list.push(word);
                }
            });
            if (p.sheriff && !list.includes(SPEECH_KEYWORD_SHERIFF)) {
                list.push(SPEECH_KEYWORD_SHERIFF);
            }
        }
    }
    row.innerHTML = list.map(a =>
        `<button class="kb-btn kb-keyword" onclick="spClickAction('${escapeAttr(a)}')">${escapeHtml(a)}</button>`
    ).join('');
}

function renderSpKbIdentities() {
    const row = document.getElementById('spKbIdentities');
    if (!row) return;
    row.innerHTML = allIdentities.map(item => {
        const extraCls = item.name === '好人' ? ' kb-extra' : '';
        return `<button class="kb-btn kb-identity${extraCls}"
                         onclick="spClickAction('${escapeAttr(item.name)}')">${escapeHtml(item.name)}</button>`;
    }).join('');
}

function spClickNumber(n) { appendToSpeechStatement(n + '号'); }
function spClickAction(a) { appendToSpeechStatement(a); }

function appendToSpeechStatement(text) {
    const round = currentSpeechRound();
    if (!round) return;
    if (round.statements.length === 0) { round.statements.push(''); currentSpeechStatementIdx = 0; }
    if (currentSpeechStatementIdx < 0 || currentSpeechStatementIdx >= round.statements.length) {
        currentSpeechStatementIdx = round.statements.length - 1;
    }
    const cur = round.statements[currentSpeechStatementIdx];
    round.statements[currentSpeechStatementIdx] = cur ? cur + ' ' + text : text;
    persistSpeeches();
    renderSpStatements();
    focusSpeechStatementInput(currentSpeechStatementIdx);
}

function renderSpStatements() {
    const list = document.getElementById('spStmtList');
    if (!list) return;
    const round = currentSpeechRound();
    if (!round) return;
    if (round.statements.length === 0) round.statements.push('');
    if (currentSpeechStatementIdx < 0 || currentSpeechStatementIdx >= round.statements.length) {
        currentSpeechStatementIdx = round.statements.length - 1;
    }
    list.innerHTML = round.statements.map((stmt, i) => `
        <div class="stmt-item ${i === currentSpeechStatementIdx ? 'selected' : ''}">
            <input class="stmt-input" type="text" value="${escapeAttr(stmt)}"
                   placeholder="点击键盘，或直接打字…"
                   oninput="updateSpeechStatement(${i}, this.value)"
                   onfocus="setCurrentSpeechStatement(${i})"
                   onkeydown="onSpeechStatementKey(event, ${i})">
            <button class="stmt-del" onclick="deleteSpeechStatement(${i}, event)" aria-label="删除">×</button>
        </div>
    `).join('');
}

function updateSpeechStatement(i, val) {
    const round = currentSpeechRound();
    if (!round) return;
    round.statements[i] = val;
    persistSpeeches();
}

function setCurrentSpeechStatement(i) {
    currentSpeechStatementIdx = i;
    const list = document.getElementById('spStmtList');
    if (!list) return;
    list.querySelectorAll('.stmt-item').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
    });
}

function focusSpeechStatementInput(i) {
    const list = document.getElementById('spStmtList');
    if (!list) return;
    const inputs = list.querySelectorAll('.stmt-input');
    const el = inputs[i];
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try { el.setSelectionRange(len, len); } catch (e) {}
}

function onSpeechStatementKey(e, i) {
    if (e.key === 'Enter') { e.preventDefault(); addSpeechStatement(); }
}

function addSpeechStatement() {
    const round = currentSpeechRound();
    if (!round) return;
    round.statements.push('');
    currentSpeechStatementIdx = round.statements.length - 1;
    persistSpeeches();
    renderSpStatements();
    focusSpeechStatementInput(currentSpeechStatementIdx);
}

function deleteSpeechStatement(i, event) {
    event.stopPropagation();
    const round = currentSpeechRound();
    if (!round) return;
    round.statements.splice(i, 1);
    if (round.statements.length === 0) round.statements.push('');
    if (currentSpeechStatementIdx >= round.statements.length) currentSpeechStatementIdx = round.statements.length - 1;
    if (currentSpeechStatementIdx < 0) currentSpeechStatementIdx = 0;
    persistSpeeches();
    renderSpStatements();
    focusSpeechStatementInput(currentSpeechStatementIdx);
}

/* ============================================
   清空 / 返回 / 持久化
   ============================================ */
function switchTab(name) {
    document.querySelectorAll('#tabBar .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'pane-' + name);
    });
}

function clearAll() {
    if (!confirm("确定清空所有标记、夜晚和发言？")) return;
    players = {};
    nightsData = [];
    speechesData = [];
    expandedNights.clear();
    expandedSpeeches.clear();
    expandedSpeechRounds.clear();
    initPlayers();
    ensureSpeechesLength();
    persist();
    persistNights();
    persistSpeeches();
    renderPanels();
    renderSpeechList();
}

function backToConfig() { location.href = "index.html"; }

function persist() {
    try { localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(players)); }
    catch (e) { console.error(e); }
}
function persistNights() {
    try { localStorage.setItem(STORAGE_KEYS.nights, JSON.stringify(nightsData)); }
    catch (e) { console.error(e); }
}
function persistSpeeches() {
    try { localStorage.setItem(STORAGE_KEYS.speeches, JSON.stringify(speechesData)); }
    catch (e) { console.error(e); }
}

/* ============================================
   工具
   ============================================ */
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    }[ch]));
}
function escapeAttr(str) { return escapeHtml(str); }
//（注：内容由AI生成）