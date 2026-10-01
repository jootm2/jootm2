// 游戏场景（对应旧 PlayScene）
// 真实等距地图 + 实体（暂用圆点，后续换 sprite）+ 键盘移动 + HUD + 聊天。

import { Scene } from './Scene.mjs';
import { MapActor } from '../map/MapActor.mjs';
import { ActorSprite } from '../actor/ActorSprite.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT, MAPSURFACEHEIGHT } from '../core/config.mjs';

// 8 方向映射（与服务器 Direction 一致）
const DIRMAP = {
    '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3,
    '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7,
};

// 装备槽名（对应 MessageIds U_DRESS..U_CHARM）
const SLOT_NAMES = ['衣服', '武器', '右手', '项链', '头盔', '手镯L', '手镯R', '戒指L', '戒指R', '护身符', '腰带', '靴子', '宝石'];

// 需要施法目标的魔法（伤害/施毒/火墙/诱惑）
const TARGET_MAGICS = new Set([1, 5, 6, 11, 20, 22, 35]);

export class PlayScene extends Scene {
    constructor(manager, snapshot) {
        super(manager);
        this.snapshot = snapshot;       // enterGame 快照
        this.self = null;
        this.entities = new Map();      // id -> 实体快照
        this.sprites = new Map();       // id -> ActorSprite
        this.mapActor = new MapActor(SCREEN_WIDTH, MAPSURFACEHEIGHT);
        this.keys = new Set();
        this.moveTimer = null;
        this._clickTarget = null;    // 点击移动目标 {tx,ty,run,action?...}
        this.groundItems = new Map();// id -> 地面物品
        this.castTarget = null;      // 施法目标（怪物 id）
        this._canvas = document.getElementById('screen');
        this.chatLines = [];
        this._chatInput = null;
    }

    async onEnter() {
        const { map, player, nearby, groundItems } = this.snapshot;
        this.self = player;
        this.entities.clear();
        this.entities.set(player.id, player);
        for (const e of nearby || []) this.entities.set(e.id, e);
        this.groundItems.clear();
        for (const g of groundItems || []) this.groundItems.set(g.id, g);

        try {
            await this.mapActor.enter(map.name);
        } catch (e) {
            console.error('[play]', e);
        }

        this._buildHud();
        this._keyDown = (e) => this._onKeyDown(e);
        this._keyUp = (e) => this.keys.delete(e.code);
        document.addEventListener('keydown', this._keyDown);
        document.addEventListener('keyup', this._keyUp);
        this._mouseDown = (e) => this._onCanvasClick(e);
        this._canvas.addEventListener('mousedown', this._mouseDown);
        // 拦截右键菜单（右键用于「跑动」）
        this._ctxMenu = (e) => e.preventDefault();
        this._canvas.addEventListener('contextmenu', this._ctxMenu);
        this._startMoveLoop();
    }

    // ---- HUD（DOM 简单面板）----
    _buildHud() {
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';

        this.hudEl = document.createElement('div');
        this.hudEl.style.cssText = 'position:absolute;left:10px;top:8px;font-family:SimSun,serif;'
            + 'font-size:13px;color:#f0e6c8;text-shadow:1px 1px 0 #000;pointer-events:none;';
        gui.appendChild(this.hudEl);

        // 聊天输入框 + 日志
        const chatBox = document.createElement('div');
        chatBox.style.cssText = 'position:absolute;left:8px;bottom:8px;width:300px;pointer-events:auto;';
        this.chatLog = document.createElement('div');
        this.chatLog.style.cssText = 'height:70px;overflow-y:auto;background:rgba(0,0,0,0.55);'
            + 'padding:4px 6px;font-size:12px;color:#d8c9a0;border-radius:3px;margin-bottom:4px;';
        this.chatInput = document.createElement('input');
        this.chatInput.type = 'text';
        this.chatInput.placeholder = '回车发送聊天…';
        this.chatInput.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(0,0,0,0.55);'
            + 'color:#f0e6c8;border:1px solid #5a4a2a;border-radius:3px;padding:4px 6px;font-size:12px;';
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const t = this.chatInput.value.trim();
            if (t) this.conn.send('say', { text: t });
            this.chatInput.value = '';
        });
        chatBox.appendChild(this.chatLog);
        chatBox.appendChild(this.chatInput);
        gui.appendChild(chatBox);

        // 技能栏（F1-F8）
        this.skillBar = document.createElement('div');
        this.skillBar.style.cssText = 'position:absolute;left:50%;bottom:8px;transform:translateX(-50%);'
            + 'display:flex;gap:4px;pointer-events:auto;';
        for (let i = 1; i <= 8; i++) {
            const slot = document.createElement('div');
            slot.dataset.fkey = i;
            slot.dataset.magicId = '';
            slot.style.cssText = 'width:56px;height:42px;background:rgba(0,0,0,0.65);border:1px solid #5a4a2a;'
                + 'border-radius:3px;font-size:10px;color:#c9b98a;text-align:center;cursor:pointer;'
                + 'display:flex;flex-direction:column;justify-content:center;overflow:hidden;';
            slot.innerHTML = `<div style="color:#9a8b6a;font-size:9px;">F${i}</div><div class="skname" style="font-size:11px;color:#e8d9b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>`;
            slot.addEventListener('click', () => this._castFromSlot(i));
            this.skillBar.appendChild(slot);
        }
        gui.appendChild(this.skillBar);
        this._refreshSkillBar();
    }

    // 刷新技能栏（self.skills → F1-F8 槽）
    _refreshSkillBar() {
        if (!this.skillBar || !this.self) return;
        const skills = this.self.skills || {};
        const entries = Object.entries(skills);
        for (let i = 0; i < 8; i++) {
            const slot = this.skillBar.children[i];
            const entry = entries[i];
            if (entry) {
                slot.dataset.magicId = entry[0];
                slot.querySelector('.skname').textContent = entry[1].name || entry[0];
                slot.style.borderColor = '#c9a34a';
            } else {
                slot.dataset.magicId = '';
                slot.querySelector('.skname').textContent = '';
                slot.style.borderColor = '#5a4a2a';
            }
        }
    }

    _castFromSlot(fkey) {
        const slot = this.skillBar && this.skillBar.children[fkey - 1];
        const magicId = slot ? Number(slot.dataset.magicId) : 0;
        if (!magicId) return;
        this._castMagic(magicId);
    }

    _castMagic(magicId) {
        if (TARGET_MAGICS.has(magicId)) {
            const t = this.castTarget != null ? this.entities.get(this.castTarget) : null;
            if (!t) {
                this._log('[系统] 请先点击选择一个怪物作为施法目标。');
                return;
            }
            this.conn.send('castMagic', { magicId, targetId: t.id });
        } else {
            this.conn.send('castMagic', { magicId, targetId: -1 });
        }
    }

    _startMoveLoop() {
        if (this.moveTimer) return;
        this.moveTimer = setInterval(() => {
            if (!this.self) return;
            this._tick = (this._tick || 0) + 1;
            let d = -1;
            const t = this._clickTarget;
            if (t) {
                // 左键走（每 2 tick 一步）、右键跑（每 tick 一步）
                if (!t.run && this._tick % 2 !== 0) return;
                const dist = Math.max(Math.abs(t.tx - this.self.x), Math.abs(t.ty - this.self.y));
                if (t.action && dist <= 1) {
                    // 走到相邻格：执行动作
                    this._doClickAction(t);
                    this._clickTarget = null;
                } else if (!t.action && dist <= 0) {
                    this._clickTarget = null;   // 到达
                } else {
                    // 贪心直线走向目标（不寻路绕障碍）
                    const dx = Math.sign(t.tx - this.self.x);
                    const dy = Math.sign(t.ty - this.self.y);
                    d = DIRMAP[dx + ',' + dy];
                    // 卡住检测：位置连续多次没变则放弃
                    if (this.self.x === this._stuckX && this.self.y === this._stuckY) {
                        this._stuckN = (this._stuckN || 0) + 1;
                        if (this._stuckN > 4) { this._clickTarget = null; this._stuckN = 0; }
                    } else {
                        this._stuckX = this.self.x;
                        this._stuckY = this.self.y;
                        this._stuckN = 0;
                    }
                }
            } else {
                d = this._currentDir();   // 键盘移动
            }
            if (d >= 0) this.conn.send('move', { dir: d });
        }, 100);
    }

    // 点击目标动作（走近后执行）
    _doClickAction(t) {
        if (t.action === 'attack') this.conn.send('attack', { targetId: t.targetId });
        else if (t.action === 'npc') this.conn.send('npcTalk', { npcId: t.npcId });
        else if (t.action === 'pickup') this.conn.send('pickup', { itemId: t.itemId });
    }

    _currentDir() {
        const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
        const dn = this.keys.has('ArrowDown') || this.keys.has('KeyS');
        const lf = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
        const rt = this.keys.has('ArrowRight') || this.keys.has('KeyD');
        const dx = (rt ? 1 : 0) - (lf ? 1 : 0);
        const dy = (dn ? 1 : 0) - (up ? 1 : 0);
        return (dx === 0 && dy === 0) ? -1 : DIRMAP[dx + ',' + dy];
    }

    _onKeyDown(e) {
        if (e.target === this.chatInput) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
        this.keys.add(e.code);
        if (e.code === 'Space') this._attackNearest();
        if (e.code === 'KeyB') this._toggleBag();
        if (e.code >= 'F1' && e.code <= 'F8') {
            e.preventDefault();
            this._castFromSlot(Number(e.code.substring(1)));
        }
    }

    _attackNearest() {
        if (!this.self) return;
        let best = null, bestDist = 2;
        for (const e of this.entities.values()) {
            if (e.type !== 'monster') continue;
            const d = Math.max(Math.abs(e.x - this.self.x), Math.abs(e.y - this.self.y));
            if (d <= 1 && d < bestDist) { bestDist = d; best = e; }
        }
        if (best) this.conn.send('attack', { targetId: best.id });
    }

    // ---- 点击交互（点怪攻击 / 点 NPC 对话 / 点物拾取 / 点地走）----
    _onCanvasClick(e) {
        if (!this.self || !this.mapActor.map) return;
        if (e.button !== 0 && e.button !== 2) return;   // 0=左键 2=右键
        e.preventDefault();
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        // 用「渲染中心 + 卷动偏移」反推格子（与 MapActor.screenX/screenY 严格互逆）。
        // 之前用 self.x 且忽略 shiftX，卷动时点击会偏 1 格、走向错误目标（像「寻路乱走」）。
        const cx = this.mapActor._cx;
        const cy = this.mapActor._cy;
        const shiftX = this.mapActor._shiftX;
        const shiftY = this.mapActor._shiftY;
        const tx = Math.floor((mx - ox + shiftX) / 48) + cx;
        const ty = Math.floor((my - oy + shiftY) / 32) + cy;
        const run = e.button === 2;   // 左键走、右键跑

        const monster = this._actorAt(tx, ty, 'monster');
        if (monster && monster.hp > 0) {
            this.castTarget = monster.id;   // 设为施法目标（红框高亮）
            this._clickTarget = { tx, ty, run, action: 'attack', targetId: monster.id };
            return;
        }
        const npc = this._actorAt(tx, ty, 'npc');
        if (npc) {
            this._clickTarget = { tx, ty, run, action: 'npc', npcId: npc.id };
            return;
        }
        const gi = this._groundAt(tx, ty);
        if (gi) {
            this._clickTarget = { tx, ty, run, action: 'pickup', itemId: gi.id };
            return;
        }
        // 空地：贪心直线走向点击点（左键走、右键跑）
        this._clickTarget = { tx, ty, run };
    }

    _actorAt(tx, ty, type) {
        for (const e of this.entities.values()) {
            if (e.type === type && e.x === tx && e.y === ty) return e;
        }
        return null;
    }

    _groundAt(tx, ty) {
        for (const g of this.groundItems.values()) {
            if (g.x === tx && g.y === ty) return g;
        }
        return null;
    }

    onMessage(type, msg) {
        switch (type) {
            case 'entityAdd':
                // 跳过自己：self 持有 enterGame 快照里的完整对象（toPlayerJson），
                // 不能被 toBriefJson 的简化实体覆盖，否则 self 与 entities[id] 引用分离。
                if (msg.entity && this.self && msg.entity.id !== this.self.id) {
                    this.entities.set(msg.entity.id, msg.entity);
                }
                break;
            case 'entityRemove':
                this.entities.delete(msg.id);
                break;
            case 'move': {
                const e = this.entities.get(msg.id);
                if (e) {
                    e.x = msg.x; e.y = msg.y; e.dir = msg.dir;
                    e._action = 'walk'; e._actionAt = Date.now();
                }
                break;
            }
            case 'stats': {
                const e = this.entities.get(msg.id);
                if (e) {
                    if (msg.hp !== undefined) e.hp = msg.hp;
                    if (msg.maxHp !== undefined) e.maxHp = msg.maxHp;
                    if (msg.mp !== undefined) e.mp = msg.mp;
                    if (msg.maxMp !== undefined) e.maxMp = msg.maxMp;
                    if (msg.level !== undefined) e.level = msg.level;
                    if (msg.exp !== undefined) e.exp = msg.exp;
                    if (msg.gold !== undefined) e.gold = msg.gold;
                }
                break;
            }
            case 'attack': {
                this._log(`攻击 ${msg.targetId}，伤害 ${msg.damage}`);
                const a = this.entities.get(msg.attackerId);
                if (a) { a._action = 'attack'; a._actionAt = Date.now(); }
                const t = this.entities.get(msg.targetId);
                if (t) { t._action = 'struck'; t._actionAt = Date.now(); }
                break;
            }
            case 'death': {
                // 播死亡动画（普通怪物重生时 entityAdd 替换对象恢复；换图时清空）
                const e = this.entities.get(msg.id);
                if (e) { e._action = 'die'; e._actionAt = Date.now(); }
                if (this.castTarget === msg.id) this.castTarget = null;
                break;
            }
            case 'spellCast': {
                const c = this.entities.get(msg.casterId);
                if (c) { c._action = 'attack'; c._actionAt = Date.now(); }
                break;
            }
            case 'chat':
                this._log(`${msg.name}: ${msg.text}`);
                break;
            case 'systemMessage':
                this._log(`[系统] ${msg.text}`);
                break;
            case 'itemDrop':
                this.groundItems.set(msg.id, msg);
                break;
            case 'itemRemove':
                this.groundItems.delete(msg.id);
                break;
            case 'bagUpdate':
                if (this.self) {
                    this.self.gold = msg.gold;
                    this.self.items = msg.items || [];
                    if (msg.dress !== undefined) this.self.dress = msg.dress;
                    if (msg.weapon !== undefined) this.self.weapon = msg.weapon;
                }
                this._refreshBag();
                break;
            case 'npcSay':
                this._showNpcDialog(msg);
                break;
            case 'npcClose':
                this._closeNpcDialog();
                break;
            case 'changeMap': {
                // 换图快照：重建实体 + 地面物品 + 切地图
                this.entities.clear();
                this.groundItems.clear();
                this._clickTarget = null;
                this._viewX = null;   // 重置卷动中心
                this.castTarget = null;
                if (msg.player) { this.self = msg.player; this.entities.set(msg.player.id, msg.player); }
                for (const e of msg.nearby || []) this.entities.set(e.id, e);
                for (const g of msg.groundItems || []) this.groundItems.set(g.id, g);
                if (msg.map) this.mapActor.enter(msg.map.name).catch(console.error);
                break;
            }
            default:
                break;
        }
    }

    _log(text) {
        if (!this.chatLog) return;
        const line = document.createElement('div');
        line.textContent = text;
        this.chatLog.appendChild(line);
        this.chatLog.scrollTop = this.chatLog.scrollHeight;
        while (this.chatLog.children.length > 100) this.chatLog.removeChild(this.chatLog.firstChild);
    }

    // ---- 背包面板（B 键）----
    _toggleBag() {
        if (!this.bagPanel) this._buildBag();
        const open = this.bagPanel.style.display === 'block';
        this.bagPanel.style.display = open ? 'none' : 'block';
        if (!open) this._refreshBag();
    }

    _buildBag() {
        if (this.bagPanel) return;
        const gui = this.manager.winManager.container;
        const panel = document.createElement('div');
        panel.style.cssText = 'position:absolute;right:8px;top:8px;width:280px;max-height:500px;overflow-y:auto;'
            + 'background:rgba(0,0,0,0.9);border:1px solid #8a6d3b;border-radius:6px;padding:12px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        panel.style.display = 'none';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        const title = document.createElement('span');
        title.textContent = '背 包';
        title.style.cssText = 'font-size:16px;color:#ffd76a;';
        this.goldEl = document.createElement('span');
        this.goldEl.style.cssText = 'font-size:13px;color:#fbbf24;';
        head.appendChild(title);
        head.appendChild(this.goldEl);
        panel.appendChild(head);

        this.equipEl = document.createElement('div');
        this.equipEl.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px;'
            + 'padding-bottom:10px;border-bottom:1px solid #5a4a2a;';
        panel.appendChild(this.equipEl);

        this.bagGridEl = document.createElement('div');
        this.bagGridEl.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
        panel.appendChild(this.bagGridEl);

        this.bagPanel = panel;
        gui.appendChild(panel);
    }

    _refreshBag() {
        if (!this.bagPanel || !this.self) return;
        this.goldEl.textContent = '金币 ' + (this.self.gold || 0);
        const items = this.self.items || [];

        // 装备区
        this.equipEl.innerHTML = '';
        for (let slot = 0; slot < 13; slot++) {
            const it = items.find(x => x.slot === slot);
            const cell = document.createElement('div');
            cell.style.cssText = 'background:#171209;border:1px solid #4a3d22;border-radius:3px;padding:4px;'
                + 'font-size:11px;text-align:center;min-height:32px;';
            cell.innerHTML = `<div style="color:#9a8b6a;font-size:10px;">${SLOT_NAMES[slot] || slot}</div>`
                + (it ? `<div style="color:#e8d9b0;margin-top:2px;">${it.name}</div>` : '');
            this.equipEl.appendChild(cell);
        }

        // 背包物品
        this.bagGridEl.innerHTML = '';
        const bagItems = items.filter(x => x.slot === undefined);
        for (const it of bagItems) {
            const cell = document.createElement('div');
            cell.style.cssText = 'background:#171209;border:1px solid #4a3d22;border-radius:3px;padding:5px;'
                + 'font-size:11px;text-align:center;cursor:pointer;min-height:34px;';
            cell.title = it.name + '（点击使用）';
            cell.textContent = it.name;
            cell.addEventListener('click', () => this.conn.send('useItem', { makeIndex: it.makeIndex }));
            this.bagGridEl.appendChild(cell);
        }
        if (!bagItems.length) {
            const empty = document.createElement('div');
            empty.textContent = '（空）';
            empty.style.cssText = 'grid-column:1/-1;text-align:center;color:#9a8b6a;padding:12px;';
            this.bagGridEl.appendChild(empty);
        }
    }

    // ---- NPC 对话框 ----
    _showNpcDialog(msg) {
        this._closeNpcDialog();
        const gui = this.manager.winManager.container;
        const dlg = document.createElement('div');
        dlg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;max-height:430px;'
            + 'overflow-y:auto;background:rgba(0,0,0,0.94);border:1px solid #8a6d3b;border-radius:6px;padding:16px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';

        const title = document.createElement('div');
        title.textContent = msg.name || 'NPC';
        title.style.cssText = 'font-size:18px;color:#ffd76a;margin-bottom:10px;';
        dlg.appendChild(title);

        const text = document.createElement('div');
        text.textContent = msg.text || '';
        text.style.cssText = 'font-size:13px;line-height:1.6;margin-bottom:12px;white-space:pre-wrap;';
        dlg.appendChild(text);

        // 商店：buy 显示 goods，sell 显示背包物品
        if (msg.shop === 'buy' && msg.goods) {
            const grid = document.createElement('div');
            grid.style.cssText = 'margin-bottom:12px;max-height:180px;overflow-y:auto;';
            for (const g of msg.goods) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'
                    + 'padding:4px 0;border-bottom:1px dashed #4a3d22;font-size:12px;';
                const nm = document.createElement('span');
                nm.textContent = `${g.name}（${g.price} 金币）`;
                const btn = document.createElement('button');
                btn.textContent = '购买';
                btn.style.cssText = 'font-size:12px;padding:2px 8px;cursor:pointer;';
                btn.addEventListener('click', () => this.conn.send('buyItem', { npcId: msg.npcId, index: g.index, count: 1 }));
                row.appendChild(nm);
                row.appendChild(btn);
                grid.appendChild(row);
            }
            dlg.appendChild(grid);
        } else if (msg.shop === 'sell') {
            const grid = document.createElement('div');
            grid.style.cssText = 'margin-bottom:12px;max-height:180px;overflow-y:auto;';
            const bagItems = (this.self.items || []).filter(x => x.slot === undefined);
            for (const it of bagItems) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'
                    + 'padding:4px 0;border-bottom:1px dashed #4a3d22;font-size:12px;';
                const nm = document.createElement('span');
                nm.textContent = it.name;
                const btn = document.createElement('button');
                btn.textContent = '出售';
                btn.style.cssText = 'font-size:12px;padding:2px 8px;cursor:pointer;';
                btn.addEventListener('click', () => this.conn.send('sellItem', { npcId: msg.npcId, makeIndex: it.makeIndex }));
                row.appendChild(nm);
                row.appendChild(btn);
                grid.appendChild(row);
            }
            dlg.appendChild(grid);
        }

        // 选项按钮
        for (const op of msg.options || []) {
            const btn = document.createElement('button');
            btn.textContent = op.label;
            btn.style.cssText = 'display:block;width:100%;margin-bottom:6px;padding:7px;font-size:13px;cursor:pointer;'
                + 'border:1px solid #5a4a2a;background:#221c12;color:#c9b98a;border-radius:3px;text-align:left;';
            btn.addEventListener('click', () => this.conn.send('npcSelect', { npcId: msg.npcId, value: op.value }));
            dlg.appendChild(btn);
        }

        // 关闭按钮
        const close = document.createElement('button');
        close.textContent = '关 闭';
        close.style.cssText = 'display:block;width:100%;margin-top:8px;padding:7px;font-size:13px;cursor:pointer;'
            + 'border:1px solid #6b3a3a;background:#2a1414;color:#e08a80;border-radius:3px;';
        close.addEventListener('click', () => this.conn.send('npcSelect', { npcId: msg.npcId, value: 'exit' }));
        dlg.appendChild(close);

        this.npcDlg = dlg;
        gui.appendChild(dlg);
    }

    _closeNpcDialog() {
        if (this.npcDlg) { this.npcDlg.remove(); this.npcDlg = null; }
    }

    update() {}

    render(ctx) {
        if (!this.self) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        const now = Date.now();
        // 平滑卷动：显示中心 lerp 追踪玩家坐标；floor 保证 shift ∈ [0,48) 连续、整数（避免浮点绘制模糊 + round 突变跳变）
        if (this._viewX == null) { this._viewX = this.self.x; this._viewY = this.self.y; }
        this._viewX += (this.self.x - this._viewX) * 0.25;
        this._viewY += (this.self.y - this._viewY) * 0.25;
        const vcx = Math.floor(this._viewX);
        const vcy = Math.floor(this._viewY);
        const shiftX = Math.round((this._viewX - vcx) * 48);
        const shiftY = Math.round((this._viewY - vcy) * 32);
        const entities = [];
        for (const e of this.entities.values()) {
            const sp = this._sprite(e);
            entities.push({
                x: e.x, y: e.y, name: e.name, isSelf: e.id === this.self.id,
                hp: e.hp, maxHp: e.maxHp, type: e.type,
                isTarget: this.castTarget != null && e.id === this.castTarget,
                layers: sp.getLayers(now),
            });
        }
        this.mapActor.render(ctx, vcx, vcy, entities, shiftX, shiftY);
        this._renderGroundItems(ctx);
        this._renderHud();
    }

    // 实体精灵缓存（entityAdd 替换对象后重建）
    _sprite(e) {
        let sp = this.sprites.get(e.id);
        if (!sp || sp.entity !== e) {
            sp = new ActorSprite(e);
            this.sprites.set(e.id, sp);
        }
        return sp;
    }

    // 地面物品（照原版 DropedItemList：格子中心对齐；金币金色圆点，物品绿块 + 名字）
    _renderGroundItems(ctx) {
        if (!this.self) return;
        for (const g of this.groundItems.values()) {
            const sx = this.mapActor.screenX(g.x);
            const sy = this.mapActor.screenY(g.y);
            if (g.gold > 0) {
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(sx + 24, sy + 16, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = '#4ade80';
                ctx.fillRect(sx + 19, sy + 11, 10, 10);
            }
            if (g.name) {
                ctx.font = '11px SimSun,serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(g.name, sx + 24, sy + 6);
            }
        }
    }

    _renderHud() {
        if (!this.hudEl || !this.self) return;
        const p = this.self;
        this.hudEl.textContent = `${p.name}  Lv.${p.level}  HP ${p.hp}/${p.maxHp}  MP ${p.mp}/${p.maxMp}  金币 ${p.gold || 0}  (${p.x},${p.y})`;
    }

    onExit() {
        if (this.moveTimer) { clearInterval(this.moveTimer); this.moveTimer = null; }
        document.removeEventListener('keydown', this._keyDown);
        document.removeEventListener('keyup', this._keyUp);
        if (this._mouseDown) this._canvas.removeEventListener('mousedown', this._mouseDown);
        if (this._ctxMenu) this._canvas.removeEventListener('contextmenu', this._ctxMenu);
        this.keys.clear();
        this._clickTarget = null;
        this.bagPanel = null;
        this.npcDlg = null;
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
    }
}
