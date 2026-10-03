let totalNum = 0;
let customIdentities = JSON.parse(localStorage.getItem("wolf_custom_identity")) || [];
let presets = JSON.parse(localStorage.getItem("wolfgame_presets")) || [];
let editingPresetId = null;

window.onload = function () {
    renderCustomIdentityRows();
};

/* ============================================
   第一步：显示身份配置面板
   ============================================ */
function showIdentityPanel() {
    totalNum = Number(document.getElementById('totalPlayer').value);
    if (totalNum < 7 || totalNum > 20) {
        alert("人数范围：7 ~ 20 人");
        return;
    }
    document.getElementById("identityPanel").style.display = "block";
}

/* ============================================
   身份统计
   ============================================ */
function getIdentitySum() {
    const wolf   = Number(document.getElementById('wolf').value);
    const civil  = Number(document.getElementById('civil').value);
    const seer   = Number(document.getElementById('seer').value);
    const witch  = Number(document.getElementById('witch').value);
    const hunter = Number(document.getElementById('hunter').value);
    const idiot  = Number(document.getElementById('idiot').value);
    const guard  = Number(document.getElementById('guard').value);

    let customSum = 0;
    customIdentities.forEach(item => { customSum += Number(item.count); });

    return wolf + civil + seer + witch + hunter + idiot + guard + customSum;
}

/* ============================================
   规则校验
   返回 null 表示通过，否则返回错误信息
   ============================================ */
function validateConfig() {
    const wolf   = Number(document.getElementById('wolf').value);
    const civil  = Number(document.getElementById('civil').value);
    const seer   = Number(document.getElementById('seer').value);
    const witch  = Number(document.getElementById('witch').value);
    const hunter = Number(document.getElementById('hunter').value);
    const idiot  = Number(document.getElementById('idiot').value);
    const guard  = Number(document.getElementById('guard').value);

    const sum = getIdentitySum();

    if (sum !== totalNum) {
        return `身份总数 ${sum}，总人数 ${totalNum}，请调整`;
    }
    if (wolf < 1) {
        return "狼人至少 1 个";
    }
    // 好人 = 神职 + 平民 + 自定义
    const goodCount = sum - wolf;
    if (wolf >= goodCount) {
        return `狼人 ${wolf} 人，好人 ${goodCount} 人，狼人不能过半`;
    }
    // 神职各不超过 1
    if (seer   > 1) return "预言家最多 1 个";
    if (witch  > 1) return "女巫最多 1 个";
    if (hunter > 1) return "猎人最多 1 个";
    if (idiot  > 1) return "白痴最多 1 个";
    if (guard  > 1) return "守卫最多 1 个";
    // 女巫 + 守卫不宜同时存在（民间常见，可跳过；此处仅提示不阻止）
    // 平票/常规配置不阻止

    return null;
}

/* ============================================
   自定义身份：增删改
   ============================================ */
function addCustomIdentity() {
    const name  = document.getElementById("customName").value.trim();
    const count = Number(document.getElementById("customCount").value);

    if (!name) { alert("请输入身份名称"); return; }
    if (count <= 0) { alert("数量必须大于0"); return; }

    customIdentities.push({ name, count });
    localStorage.setItem("wolf_custom_identity", JSON.stringify(customIdentities));
    renderCustomIdentityRows();

    document.getElementById("customName").value = "";
    document.getElementById("customCount").value = 1;
}

function removeCustom(index) {
    customIdentities.splice(index, 1);
    localStorage.setItem("wolf_custom_identity", JSON.stringify(customIdentities));
    renderCustomIdentityRows();
}

function renderCustomIdentityRows() {
    const container = document.getElementById("customIdentityContainer");
    container.innerHTML = "";
    customIdentities.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "row";
        div.innerHTML = `
            <label>${escapeHtml(item.name)}</label>
            <div style="display:flex;gap:8px;align-items:center">
                <input type="number" min="0" value="${item.count}" onchange="updateCustomCount(${idx},this.value)">
                <button class="btn-reset" style="padding:6px 10px" onclick="removeCustom(${idx})">删除</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateCustomCount(idx, val) {
    customIdentities[idx].count = Number(val);
    localStorage.setItem("wolf_custom_identity", JSON.stringify(customIdentities));
}

/* ============================================
   重置
   ============================================ */
function resetAll() {
    ['wolf','civil','seer','witch','hunter','idiot','guard'].forEach(id => {
        document.getElementById(id).value = 0;
    });
    document.getElementById('tipBox').innerText = "";
}

/* ============================================
   读取表单 → config
   ============================================ */
function collectConfig() {
    return {
        total:  totalNum,
        wolf:   Number(document.getElementById('wolf').value),
        civil:  Number(document.getElementById('civil').value),
        seer:   Number(document.getElementById('seer').value),
        witch:  Number(document.getElementById('witch').value),
        hunter: Number(document.getElementById('hunter').value),
        idiot:  Number(document.getElementById('idiot').value),
        guard:  Number(document.getElementById('guard').value),
        custom: JSON.parse(JSON.stringify(customIdentities))
    };
}

/* ============================================
   保存配置
   ============================================ */
function saveConfig() {
    const tip = document.getElementById('tipBox');
    const err = validateConfig();
    if (err) {
        tip.className = "tip err";
        tip.innerText = `❌ ${err}`;
        return;
    }

    const config = collectConfig();
    let message = "";
    const target = editingPresetId !== null ? presets.find(x => x.id === editingPresetId) : null;

    if (target) {
        Object.assign(target, config);
        target.savedAt = Date.now();
        message = `✅ 已更新该预设`;
    } else {
        const now = Date.now();
        const preset = { id: now, savedAt: now, ...config };
        presets.push(preset);
        editingPresetId = preset.id;
        message = `✅ 配置已保存`;
    }

    localStorage.setItem("wolfgame_presets", JSON.stringify(presets));
    tip.className = "tip ok";
    tip.innerText = message;
}

/* ============================================
   确定：校验 → 保存 → 进入记录页
   ============================================ */
function confirmAndRecord() {
    const tip = document.getElementById('tipBox');
    const err = validateConfig();
    if (err) {
        tip.className = "tip err";
        tip.innerText = `❌ ${err}`;
        return;
    }

    const config = collectConfig();
    localStorage.setItem("wolfgame_config", JSON.stringify(config));
    location.href = "record.html";
}

/* ============================================
   预设
   ============================================ */
function openPresetPanel() {
    renderPresetList();
    document.getElementById('presetModal').classList.add('show');
}
function closePresetPanel() {
    document.getElementById('presetModal').classList.remove('show');
}
function onOverlayClick(e) {
    if (e.target === e.currentTarget) closePresetPanel();
}

function renderPresetList() {
    const list = document.getElementById('presetList');
    if (presets.length === 0) {
        list.innerHTML = '<div class="preset-empty">还没有保存的配置</div>';
        return;
    }
    const sorted = [...presets].sort((a, b) => b.savedAt - a.savedAt);
    list.innerHTML = sorted.map(p => `
        <div class="preset-item ${p.id === editingPresetId ? 'active' : ''}" onclick="loadPreset(${p.id})">
            <div class="preset-info">
                <div class="preset-name">${buildSummary(p)}</div>
                <div class="preset-meta">${formatTime(p.savedAt)}</div>
            </div>
            <button class="preset-del" onclick="deletePreset(${p.id}, event)">删除</button>
        </div>
    `).join('');
}

function loadPreset(id) {
    const p = presets.find(x => x.id === id);
    if (!p) return;

    totalNum = p.total;
    document.getElementById('totalPlayer').value = p.total;
    document.getElementById('wolf').value   = p.wolf   || 0;
    document.getElementById('civil').value  = p.civil  || 0;
    document.getElementById('seer').value   = p.seer   || 0;
    document.getElementById('witch').value  = p.witch  || 0;
    document.getElementById('hunter').value = p.hunter || 0;
    document.getElementById('idiot').value  = p.idiot  || 0;
    document.getElementById('guard').value  = p.guard  || 0;

    customIdentities = JSON.parse(JSON.stringify(p.custom || []));
    localStorage.setItem("wolf_custom_identity", JSON.stringify(customIdentities));
    renderCustomIdentityRows();

    editingPresetId = p.id;

    document.getElementById('identityPanel').style.display = "block";
    document.getElementById('tipBox').innerText = "";
    closePresetPanel();
    document.getElementById('identityPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deletePreset(id, event) {
    event.stopPropagation();
    presets = presets.filter(x => x.id !== id);
    localStorage.setItem("wolfgame_presets", JSON.stringify(presets));
    if (editingPresetId === id) editingPresetId = null;
    renderPresetList();
}

/* ============================================
   工具
   ============================================ */
function formatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSummary(p) {
    const parts = [];
    if (p.wolf)   parts.push(`狼 ${p.wolf}`);
    if (p.seer)   parts.push(`预言家 ${p.seer}`);
    if (p.witch)  parts.push(`女巫 ${p.witch}`);
    if (p.hunter) parts.push(`猎人 ${p.hunter}`);
    if (p.guard)  parts.push(`守卫 ${p.guard}`);
    if (p.idiot)  parts.push(`白痴 ${p.idiot}`);
    if (p.civil)  parts.push(`民 ${p.civil}`);
    (p.custom || []).forEach(c => parts.push(`${c.name} ${c.count}`));
    const detail = parts.length ? parts.join(' · ') : '无身份';
    return `${p.total} 人 · ${escapeHtml(detail)}`;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    }[ch]));
}
//（注：内容由AI生成）