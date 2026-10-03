// 游戏场景（对应旧 PlayScene）
// 真实等距地图 + 实体（sprite）+ 鼠标按住移动（走/跑）+ HUD + 聊天。

import { Scene } from './Scene.mjs';
import { MapActor } from '../map/MapActor.mjs';
import { ActorSprite } from '../actor/ActorSprite.mjs';
import { getLib } from '../image/Images.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT, MAPSURFACEHEIGHT } from '../core/config.mjs';

// 8 方向映射（与服务器 Direction 一致）
const DIRMAP = {
    '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3,
    '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7,
};

// 移动动作间隔（ms/步）：走慢跑快，动作之间必须有间隔
// 对齐动画周期：walk 动画 6 帧×90ms=540ms；run 动画 6 帧×120ms=720ms 覆盖 2 格 → 360ms/格
const WALK_INTERVAL = 540;   // 走（左键）
const RUN_INTERVAL = 360;    // 跑（右键）

// 怪物/NPC 移动过渡时长（ms）：对齐多数怪物 walk 动画 6 帧×120ms=720ms
const MONSTER_MOVE_DUR = 720;

// 装备槽名（对应 MessageIds U_DRESS..U_CHARM）
const SLOT_NAMES = ['衣服', '武器', '右手', '项链', '头盔', '手镯L', '手镯R', '戒指L', '戒指R', '护身符', '腰带', '靴子', '宝石'];

// 装备槽位（相对 F9 状态窗口坐标，对齐原版 FState.pas DSWxxx）[slot, x, y, w, h]
const EQUIP_SLOTS = [
    [0,   96, 122, 53, 112],   // 衣服 DSWDress
    [1,   47,  80, 47,  87],   // 武器 DSWWeapon
    [2,  168, 125, 34,  31],   // 右手(蜡烛) DSWLight
    [3,  168,  87, 34,  31],   // 项链 DSWNecklace
    [4,  115,  93, 18,  18],   // 头盔 DSWHelmet
    [5,  168, 176, 34,  31],   // 手镯L DSWArmRingL
    [6,   42, 176, 34,  31],   // 手镯R DSWArmRingR
    [7,  168, 215, 34,  31],   // 戒指L DSWRingL
    [8,   42, 215, 34,  31],   // 戒指R DSWRingR
    [9,   42, 254, 34,  31],   // 护身符 DSWBujuk
    [10,  84, 254, 34,  31],   // 腰带 DSWBelt
    [11, 126, 254, 34,  31],   // 靴子 DSWBoots
    [12, 168, 254, 34,  31],   // 宝石 DSWCharm
];

// 属性数值行（原版 DStateWin StatePage 1：x=112，y 每 20px）[字段, y]
const ATTR_ROWS = [
    ['ac', 99], ['mac', 119], ['dc', 139], ['mc', 159], ['sc', 179],
    ['hp', 199], ['mp', 219],
];

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
        this.moveTimer = null;
        this._holding = false;       // 鼠标按住状态
        this._mouseDir = -1;         // 按住时的移动方向
        this._mouseRun = false;      // 是否跑（右键）
        this._lastMoveAt = 0;        // 上次移动时间戳
        this._runTimer = null;       // 跑动第 2 格定时器
        this._runCycleTimer = null;  // 下一跑周期定时器
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
        document.addEventListener('keydown', this._keyDown);
        this._mdHandler = (e) => this._onMouseDown(e);
        this._muHandler = () => { this._holding = false; };
        this._mmHandler = (e) => this._onMouseMove(e);   // 按住时实时更新方向
        this._canvas.addEventListener('mousedown', this._mdHandler);
        document.addEventListener('mouseup', this._muHandler);   // 全局松开（防止移出 canvas 后仍按住）
        document.addEventListener('mousemove', this._mmHandler);
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

        // 状态窗口（F9）/ 背包窗口（F10）—— 原版 DStateWin / DItemBag
        this._buildStateWin();
        this._buildBag();
    }

    // F1-F8 施法：按已学技能顺序取第 fkey-1 个（原版快捷键，技能列表见 F10 背包）
    _castFromSlot(fkey) {
        const skills = this.self && this.self.skills ? this.self.skills : {};
        const entry = Object.entries(skills)[fkey - 1];
        if (!entry) return;
        this._castMagic(Number(entry[0]));
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
            if (!this.self || !this._holding || this._mouseRun) return;   // 跑由 _runStep 的 setTimeout 链处理
            const now = Date.now();
            if (now - this._lastMoveAt >= WALK_INTERVAL) {
                this._lastMoveAt = now;
                this.conn.send('move', { dir: this._mouseDir, run: false });
            }
        }, 50);
    }

    _onKeyDown(e) {
        if (e.target === this.chatInput) return;
        if (e.code === 'Space') { e.preventDefault(); this._attackNearest(); }
        if (e.code === 'F9') { e.preventDefault(); this._toggleBag(); }          // 原版 VK_F9 = 背包
        if (e.code === 'F10') { e.preventDefault(); this._toggleStateWin(); }    // 原版 VK_F10 = 状态/装备属性
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

    // ---- 鼠标按下（点怪攻击 / 点 NPC 对话 / 点物拾取 / 空地走）----
    _onMouseDown(e) {
        if (!this.self || !this.mapActor.map) return;
        if (e.button !== 0 && e.button !== 2) return;   // 0=左键 2=右键
        e.preventDefault();
        // 选中（拿起）物品时点击画面 → 扔到对应格子（原版 DropItem）
        if (this.pickedItem) {
            const { tx, ty } = this._gridFromMouse(e);
            this.conn.send('drop', { makeIndex: this.pickedItem.makeIndex, x: tx, y: ty });
            this._clearPicked();
            return;
        }
        const dir = this._dirFromMouse(e);
        if (dir < 0) return;
        const run = e.button === 2;   // 左键走、右键跑
        const { mx, my } = this._mouseXY(e);

        // 贴图区域判定（原版 GetAttackFocusCharacter）：怪物相邻→攻击、NPC→对话
        const monster = this._actorAtScreen(mx, my, 'monster');
        if (monster && monster.hp > 0 && this._dist(this.self, monster) <= 1) {
            this.castTarget = monster.id;   // 红框高亮
            this.conn.send('attack', { targetId: monster.id });
            return;
        }
        const npc = this._actorAtScreen(mx, my, 'npc');
        if (npc) {
            // 原版点中 NPC 贴图即对话（客户端不限距离，服务端限 15 格）
            this.conn.send('npcTalk', { npcId: npc.id });
            return;
        }
        // 其他玩家（原版：点击玩家 = 攻击，与怪物同）
        const player = this._actorAtScreen(mx, my, 'player');
        if (player && this._dist(this.self, player) <= 1) {
            this.castTarget = player.id;   // 红框高亮
            this.conn.send('attack', { targetId: player.id });
            return;
        }
        const { tx, ty } = this._gridFromMouse(e);
        const gi = this._groundAt(tx, ty);
        if (gi && gi.x === this.self.x && gi.y === this.self.y) {
            this.conn.send('pickup', { itemId: gi.id });
            return;
        }
        // 空地：记录方向；走立即走 1 格、跑立即跑 2 格（原子）；按住则持续
        this._holding = true;
        this._mouseDir = dir;
        this._mouseRun = run;
        if (run) {
            this._runStep();
        } else {
            this.conn.send('move', { dir, run: false });
            this._lastMoveAt = Date.now();
        }
    }

    // 一次跑动：朝当前方向移动 2 格（原版 SM_RUN movestep=2），原子、不受抬起中断
    _runStep() {
        this.conn.send('move', { dir: this._mouseDir, run: true });
        this._lastMoveAt = Date.now();
        this._runTimer = setTimeout(() => {
            this.conn.send('move', { dir: this._mouseDir, run: true });   // 第 2 格
            this._lastMoveAt = Date.now();
            this._runTimer = null;
            // 仍按住则安排下一个跑周期（再跑 2 格）
            if (this._holding && this._mouseRun) {
                this._runCycleTimer = setTimeout(() => {
                    this._runCycleTimer = null;
                    if (this._holding && this._mouseRun) this._runStep();
                }, RUN_INTERVAL);
            }
        }, RUN_INTERVAL);
    }

    // 按住移动时，鼠标位置实时更新移动方向（移动过程中转向）
    _onMouseMove(e) {
        if (!this._holding) return;
        const dir = this._dirFromMouse(e);
        if (dir >= 0) this._mouseDir = dir;
    }

    // 鼠标 → 游戏格子（渲染中心 + 卷动偏移反推，与 screenX/screenY 互逆）
    _gridFromMouse(e) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        const tx = Math.floor((mx - ox + this.mapActor._shiftX) / 48) + this.mapActor._cx;
        const ty = Math.floor((my - oy + this.mapActor._shiftY) / 32) + this.mapActor._cy;
        return { tx, ty };
    }

    // 鼠标相对画面中心（人物）→ 逻辑 8 方向
    _dirFromMouse(e) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        const dx = mx - (ox + 24);   // 人物格子中心 X
        const dy = my - (oy + 16);   // 人物格子中心 Y
        if (dx === 0 && dy === 0) return -1;
        const ax = Math.abs(dx) / 48;
        const ay = Math.abs(dy) / 32;
        let lgx, lgy;
        if (ax > ay * 1.5) { lgx = Math.sign(dx); lgy = 0; }
        else if (ay > ax * 1.5) { lgx = 0; lgy = Math.sign(dy); }
        else { lgx = Math.sign(dx); lgy = Math.sign(dy); }
        return DIRMAP[lgx + ',' + lgy];
    }

    _dist(a, b) {
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }

    // 鼠标事件 → canvas 内坐标
    _mouseXY(e) {
        const rect = this._canvas.getBoundingClientRect();
        return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    }

    // 贴图区域命中实体（原版 GetAttackFocusCharacter：贴图中间 40×70 判定）
    _actorAtScreen(mx, my, type) {
        for (const e of this.entities.values()) {
            if (e.type !== type) continue;
            const sp = this._sprite(e);
            const layers = sp.getLayers(Date.now());
            if (!layers || !layers.length) continue;
            // 实体屏幕锚点（self 含走动画偏移 offsetX/offsetY）
            const isSelf = e.id === this.self.id;
            const ox = isSelf ? (this._viewX - e.x) * 48 : 0;
            const oy = isSelf ? (this._viewY - e.y) * 32 : 0;
            const anchorX = this.mapActor.screenX(e.x) + ox;
            const anchorY = this.mapActor.screenY(e.y) + oy;
            for (const layer of layers) {
                if (!layer.canvas) continue;
                const dx = anchorX + (layer.px || 0);
                const dy = anchorY + (layer.py || 0);
                const cw = layer.canvas.width;
                const ch = layer.canvas.height;
                const centx = cw > 40 ? (cw - 40) / 2 : 0;
                const centy = ch > 70 ? (ch - 70) / 2 : 0;
                if (mx >= dx + centx && mx <= dx + cw - centx
                    && my >= dy + centy && my <= dy + ch - centy) {
                    return e;
                }
            }
        }
        return null;
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
                    const moved = (e.x !== msg.x || e.y !== msg.y);
                    // 记录移动起点（非 self 实体走动画过渡用：从旧格滑到新格）
                    e._fromX = e.x; e._fromY = e.y;
                    e.x = msg.x; e.y = msg.y; e.dir = msg.dir;
                    if (moved) {
                        const action = msg.run ? 'run' : 'walk';
                        // 动作切换才重置动画相位；连续同动作保持相位连续（避免每步重播前几帧）
                        if (e._action !== action) {
                            e._action = action;
                            e._actionAt = Date.now();
                        }
                        e._lastMoveAt = Date.now();   // 停止超时回 stand 用
                        e._moveAt = Date.now();
                    }
                    // 纯转向（位置不变，如攻击转身）：只更新 dir，不触发移动动画
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
                this._refreshStateWin();
                if (this.shopGoldEl) this.shopGoldEl.textContent = '金币 ' + (this.self.gold || 0);
                // 卖出后投放框物品自动消失（被卖的物品已不在背包）
                if (this.shopSellItem) {
                    const still = (msg.items || []).some(x => x.makeIndex === this.shopSellItem.makeIndex);
                    if (!still) this._clearSellSpot();
                }
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
                this._holding = false;
                if (this._runTimer) { clearTimeout(this._runTimer); this._runTimer = null; }
                if (this._runCycleTimer) { clearTimeout(this._runCycleTimer); this._runCycleTimer = null; }
                this._viewX = null;   // 重置卷动中心
                this.castTarget = null;
                this._clearPicked();   // 换图丢弃手中拿起的物品状态
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
    // ---- 状态窗口（F9，原版 DStateWin）----

    _toggleStateWin() {
        if (!this.stateWin) this._buildStateWin();
        const open = this.stateWin.style.display === 'block';
        this.stateWin.style.display = open ? 'none' : 'block';
        if (!open) this._refreshStateWin();
    }

    _buildStateWin() {
        if (this.stateWin) return;
        const gui = this.manager.winManager.container;
        const win = document.createElement('div');
        win.style.cssText = 'position:absolute;right:0;top:0;width:232px;height:325px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        win.style.display = 'none';
        // 背景 Prguse[370]
        this._libUrl('prguse', 370).then((url) => {
            if (url && this.stateWin === win) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                win.insertBefore(bg, win.firstChild);
            }
        });
        // 装备页（人物底图 + 13 装备槽）
        this.stateEquipWrap = document.createElement('div');
        this.stateEquipWrap.style.cssText = 'position:absolute;left:0;top:0;width:232px;height:325px;';
        win.appendChild(this.stateEquipWrap);
        this.stateBodyEl = document.createElement('div');
        this.stateBodyEl.style.cssText = 'position:absolute;left:38px;top:52px;';
        this.stateEquipWrap.appendChild(this.stateBodyEl);
        this.stateEquipEl = document.createElement('div');
        this.stateEquipEl.style.cssText = 'position:absolute;left:0;top:0;';
        this.stateEquipWrap.appendChild(this.stateEquipEl);
        // 属性页（数值对齐背景标签 + 角色信息）
        this.stateAttrWrap = document.createElement('div');
        this.stateAttrWrap.style.cssText = 'position:absolute;left:0;top:0;width:232px;height:325px;display:none;';
        win.appendChild(this.stateAttrWrap);
        this.stateInfoEl = document.createElement('div');
        this.stateInfoEl.style.cssText = 'position:absolute;left:12px;top:16px;width:208px;'
            + 'font-size:12px;line-height:18px;text-shadow:1px 1px 0 #000;';
        this.stateAttrWrap.appendChild(this.stateInfoEl);
        this.stateAttrEl = document.createElement('div');
        this.stateAttrEl.style.cssText = 'position:absolute;left:112px;top:99px;width:96px;'
            + 'font-size:12px;line-height:20px;text-shadow:1px 1px 0 #000;';
        this.stateAttrWrap.appendChild(this.stateAttrEl);
        // 角色名（原版：Left+122 水平居中，Top+23，纯名字）
        this.stateNameEl = document.createElement('div');
        this.stateNameEl.style.cssText = 'position:absolute;left:0;top:23px;width:232px;text-align:center;'
            + 'font-size:12px;color:#f0e6c8;text-shadow:1px 1px 0 #000;';
        win.appendChild(this.stateNameEl);
        // 关闭按钮（原版 DCloseState=371，位置 8,39）：正常态红X画在背景图里，
        // img 为按下态，按下才显示、抬起恢复（原版 Downed 语义）
        const close = document.createElement('div');
        close.style.cssText = 'position:absolute;left:8px;top:39px;width:16px;height:23px;cursor:pointer;';
        close.addEventListener('click', () => { win.style.display = 'none'; });
        win.appendChild(close);
        this._libUrl('prguse', 371).then((url) => {
            if (url && this.stateWin === win) {
                const im = document.createElement('img');
                im.src = url; im.draggable = false;
                im.style.cssText = 'visibility:hidden;display:block;';
                close.appendChild(im);
                close.addEventListener('mousedown', () => { im.style.visibility = 'visible'; });
                const restore = () => { im.style.visibility = 'hidden'; };
                close.addEventListener('mouseup', restore);
                close.addEventListener('mouseleave', restore);
            }
        });
        // 翻页箭头（原版 DPrevState=373 上 / DNextState=372 下，位置 7,128 / 7,187）
        const mkArrow = (idx, top, page) => {
            const b = document.createElement('div');
            b.style.cssText = `position:absolute;left:7px;top:${top}px;width:24px;height:23px;cursor:pointer;`;
            b.addEventListener('click', () => { this.statePage = page; this._refreshStateWin(); });
            this._libUrl('prguse', idx).then((url) => {
                if (url) { const im = document.createElement('img'); im.src = url; im.draggable = false; b.appendChild(im); }
            });
            win.appendChild(b);
        };
        mkArrow(373, 128, 0);   // 上箭头 → 装备页
        mkArrow(372, 187, 1);   // 下箭头 → 属性页
        this.stateWin = win;
        this.statePage = 0;
        gui.appendChild(win);
    }

    _refreshStateWin() {
        if (!this.stateWin || !this.self) return;
        const p = this.self;
        // 角色名（原版只显示名字）
        this.stateNameEl.textContent = p.name;
        // 分页显示
        this.stateEquipWrap.style.display = this.statePage === 0 ? 'block' : 'none';
        this.stateAttrWrap.style.display = this.statePage === 1 ? 'block' : 'none';
        if (this.statePage === 0) {
            this._refreshEquipPage();
        } else {
            this._refreshAttrPage();
        }
    }

    // 装备页：人物底图（男376/女377）+ 13 槽图标
    _refreshEquipPage() {
        const p = this.self;
        this.stateBodyEl.innerHTML = '';
        const bodyIdx = p.sex === 1 ? 377 : 376;
        this._libUrl('prguse', bodyIdx).then((url) => {
            if (url && this.stateWin && this.stateBodyEl) {
                const im = document.createElement('img');
                im.src = url; im.draggable = false;
                this.stateBodyEl.appendChild(im);
            }
        });
        this.stateEquipEl.innerHTML = '';
        const items = p.items || [];
        for (const [slot, x, y, w, h] of EQUIP_SLOTS) {
            const it = items.find(v => v.slot === slot);
            const cell = document.createElement('div');
            cell.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`
                + 'display:flex;align-items:center;justify-content:center;overflow:hidden;';
            if (it) {
                cell.title = `${SLOT_NAMES[slot]}：${it.name}`;
                this._libUrl('stateitem', it.looks).then((url) => {
                    if (url) {
                        const im = document.createElement('img');
                        im.src = url; im.draggable = false;
                        im.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
                        cell.appendChild(im);
                    }
                });
            }
            this.stateEquipEl.appendChild(cell);
        }
    }

    // 属性页：角色信息 + 属性数值（纯数字，标签由背景图提供）
    _refreshAttrPage() {
        const p = this.self;
        this.stateInfoEl.innerHTML = '';
        const rows = [
            `经验 ${p.exp}`,
            `金币 ${p.gold || 0}`,
        ];
        for (const r of rows) {
            const div = document.createElement('div');
            div.textContent = r;
            this.stateInfoEl.appendChild(div);
        }
        this.stateAttrEl.innerHTML = '';
        for (const [field, y] of ATTR_ROWS) {
            const div = document.createElement('div');
            div.style.cssText = `position:absolute;left:0;top:${y - 99}px;`;
            div.textContent = field === 'hp' ? `${p.hp}/${p.maxHp}`
                : field === 'mp' ? `${p.mp}/${p.maxMp}`
                : (p[field] || '0-0');
            this.stateAttrEl.appendChild(div);
        }
    }

    // ---- 背包（F10，原版 DItemBag）----

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
        panel.style.cssText = 'position:absolute;left:0;top:0;width:336px;height:270px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        panel.style.display = 'none';
        // 背景 Prguse[3]
        this._libUrl('prguse', 3).then((url) => {
            if (url && this.bagPanel === panel) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                panel.insertBefore(bg, panel.firstChild);
            }
        });
        // 关闭按钮（红X，原版 DCloseBag 309,203）
        const close = document.createElement('div');
        close.style.cssText = 'position:absolute;left:309px;top:203px;width:14px;height:20px;cursor:pointer;';
        close.addEventListener('click', () => { panel.style.display = 'none'; });
        panel.appendChild(close);
        // 金币（原版 DGold 10,190）
        this.goldEl = document.createElement('div');
        this.goldEl.style.cssText = 'position:absolute;left:10px;top:190px;font-size:13px;color:#fbbf24;text-shadow:1px 1px 0 #000;';
        panel.appendChild(this.goldEl);
        // 背包物品格子（原版 DItemGrid 20,13 286x162，8 列）
        this.bagGridEl = document.createElement('div');
        this.bagGridEl.style.cssText = 'position:absolute;left:20px;top:13px;width:286px;height:162px;'
            + 'display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(4,40px);';
        panel.appendChild(this.bagGridEl);
        this.bagPanel = panel;
        gui.appendChild(panel);
    }

    _refreshBag() {
        if (!this.bagPanel || !this.self) return;
        this.goldEl.textContent = '金币 ' + (this.self.gold || 0);
        const items = this.self.items || [];

        // 背包物品（8 列网格，图标居中）：双击使用、单击拿起（原版 GetItemCursor 交互）
        this.bagGridEl.innerHTML = '';
        this._pickedCell = null;
        const bagItems = items.filter(x => x.slot === undefined);
        for (const it of bagItems) {
            const cell = document.createElement('div');
            cell.style.cssText = 'display:flex;align-items:center;justify-content:center;'
                + 'overflow:hidden;cursor:pointer;';
            cell.title = it.name + '（双击使用，单击拿起）';
            this._libUrl('items', it.looks).then((url) => {
                if (url) {
                    const im = document.createElement('img');
                    im.src = url; im.draggable = false;
                    im.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
                    cell.appendChild(im);
                }
            });
            cell.addEventListener('dblclick', () => {
                this.conn.send('useItem', { makeIndex: it.makeIndex });
            });
            cell.addEventListener('click', () => this._onBagItemClick(it, cell));
            this.bagGridEl.appendChild(cell);
        }
    }

    // 背包物品单击：拿起 → 再点同一格取消 / 点另一格换位（移动）
    _onBagItemClick(it, cell) {
        if (!this.pickedItem) {
            this.pickedItem = it;            // 拿起
            this._markPicked(cell);
            return;
        }
        if (this.pickedItem.makeIndex === it.makeIndex) {
            this._clearPicked();             // 点同一物品：放下（取消）
            return;
        }
        // 点另一物品：换位
        this.conn.send('moveItem', { makeIndex: this.pickedItem.makeIndex, targetIndex: it.makeIndex });
        this._clearPicked();
    }

    _markPicked(cell) {
        if (this._pickedCell && this._pickedCell !== cell) this._pickedCell.style.outline = '';
        this._pickedCell = cell;
        cell.style.outline = '2px solid #ffe400';
    }

    _clearPicked() {
        if (this._pickedCell) this._pickedCell.style.outline = '';
        this._pickedCell = null;
        this.pickedItem = null;
    }

    // ---- NPC 对话框（原版 DMerchantDlg 样式）----

    // 任意 WIL 库图 → img URL（缓存）
    async _libUrl(libKey, idx) {
        if (this._texCache == null) this._texCache = new Map();
        const key = libKey + ':' + idx;
        if (this._texCache.has(key)) return this._texCache.get(key);
        const lib = getLib(libKey);
        if (!lib) return null;
        const tex = await lib.getTexture(idx);
        if (!tex) return null;
        const url = tex.canvas.toDataURL
            ? tex.canvas.toDataURL('image/png')
            : URL.createObjectURL(await tex.canvas.convertToBlob());
        this._texCache.set(key, url);
        return url;
    }

    // Prguse 图 → img URL（缓存）
    _prgUrl(idx) {
        return this._libUrl('prguse', idx);
    }

    _showNpcDialog(msg) {
        this._closeNpcDialog();
        // 非买卖对话（如点「返回」回主界面）时关闭买卖面板，避免残留
        if (!msg.shop) this._closeShopPanel();
        // 记录打开时玩家位置（原版 MDlgX/MDlgY），走远自动关闭
        this._npcDlgX = this.self.x;
        this._npcDlgY = this.self.y;
        const gui = this.manager.winManager.container;
        const dlg = document.createElement('div');
        dlg.style.cssText = 'position:absolute;left:0;top:0;width:416px;height:176px;pointer-events:auto;';
        this.npcDlg = dlg;
        gui.appendChild(dlg);

        // 背景 Prguse[384]（商人对话框 416×176，异步插入不阻塞文本）
        // 注意：不能用 z-index:-1，会被 #screen canvas 遮挡；背景图先插入、内容后追加即可盖在其上
        this._prgUrl(384).then((bgUrl) => {
            if (bgUrl && this.npcDlg === dlg) {
                const bg = document.createElement('img');
                bg.src = bgUrl;
                bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                dlg.insertBefore(bg, dlg.firstChild);
            }
        });

        // NPC 说话文本（白描边，从 30,20 开始；原版 lx=30 ly=20，字体 9号≈12px、行高 16px）
        // 不设 overflow:hidden：原版 canvas 逐行绘制不裁剪，长文本（如公约多页）末行「下一页」会溢出对话框仍可见可点
        const text = document.createElement('div');
        text.style.cssText = 'position:absolute;left:30px;top:20px;width:340px;'
            + 'font-family:SimSun,serif;font-size:12px;color:#ffffff;line-height:16px;'
            + 'text-shadow:1px 1px 0 #000;white-space:pre-wrap;';
        // 说话文本：解析 <label@value> 为内联黄色链接（原版 DMerchantDlgDirectPaint 语义）
        this._renderNpcSay(text, msg.text || '', msg.npcId);
        dlg.appendChild(text);

        // 买卖面板（原版 DSellDlg 独立窗口，替代挤在对话里的列表）
        if (msg.shop === 'buy' || msg.shop === 'sell') {
            this._showShopPanel(msg);
        }

        // 关闭按钮 Prguse[64]（399,1）：正常态红X画在背景图 384 里；透明热区接收点击，
        // img（按下态）按下才显示、抬起恢复（原版 DccCloseDirectPaint 的 Downed 语义）
        const close = document.createElement('div');
        close.style.cssText = 'position:absolute;left:399px;top:1px;width:16px;height:23px;cursor:pointer;';
        close.addEventListener('click', () => this.conn.send('npcSelect', { npcId: msg.npcId, value: 'exit' }));
        dlg.appendChild(close);
        this._prgUrl(64).then((closeUrl) => {
            if (closeUrl && this.npcDlg === dlg) {
                const img = document.createElement('img');
                img.src = closeUrl;
                img.draggable = false;
                img.style.cssText = 'visibility:hidden;display:block;';
                close.appendChild(img);
                close.addEventListener('mousedown', () => { img.style.visibility = 'visible'; });
                const restore = () => { img.style.visibility = 'hidden'; };
                close.addEventListener('mouseup', restore);
                close.addEventListener('mouseleave', restore);
            }
        });
    }

    // 买卖界面（原版：buy=DMenuDlg 物品列表+翻页+买入；sell=DSellDlg ok 框投放）
    _showShopPanel(msg) {
        this._closeShopPanel();
        if (msg.shop === 'buy') {
            this._showBuyMenu(msg);
        } else {
            this._showSellDlg(msg);
        }
    }

    // 购买：物品列表（原版 DMenuDlg，在 NPC 对话下方）+ 上下翻页 + 买入按钮
    _showBuyMenu(msg) {
        this.shopGoods = msg.goods || [];
        this.shopPage = 0;      // 列表起始行
        this.shopSel = -1;      // 选中商品全局索引
        const gui = this.manager.winManager.container;
        const panel = document.createElement('div');
        panel.style.cssText = 'position:absolute;left:0;top:176px;width:308px;height:205px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        this.shopPanel = panel;
        this._libUrl('prguse', 385).then((url) => {
            if (url && this.shopPanel === panel) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                panel.insertBefore(bg, panel.firstChild);
            }
        });
        // 标题「物品列表」(19,9) /「价格」(156,9)——原版 DMenuDlgDirectPaint 坐标，y 上移 2px
        const title = document.createElement('div');
        title.style.cssText = 'position:absolute;left:19px;top:9px;font-size:12px;color:#fff;text-shadow:1px 1px 0 #000;white-space:nowrap;';
        title.textContent = '物品列表';
        panel.appendChild(title);
        const priceTitle = document.createElement('div');
        priceTitle.style.cssText = 'position:absolute;left:156px;top:9px;font-size:12px;color:#fff;text-shadow:1px 1px 0 #000;white-space:nowrap;';
        priceTitle.textContent = '价格';
        panel.appendChild(priceTitle);
        // 列表（y=30 起，保持当前位置，不挤标题）
        this.shopListEl = document.createElement('div');
        this.shopListEl.style.cssText = 'position:absolute;left:19px;top:30px;width:270px;height:138px;'
            + 'font-size:12px;line-height:13px;text-shadow:1px 1px 0 #000;';
        panel.appendChild(this.shopListEl);
        // 热区按钮（背景 385 已画正常态：箭头/买入/关闭；img 为按下态，按下显示抬起隐藏）
        const mkBtn = (idx, x, y, w, h, cb) => {
            const b = document.createElement('div');
            b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:pointer;`;
            b.addEventListener('click', cb);
            this._libUrl('prguse', idx).then((url) => {
                if (url) {
                    const im = document.createElement('img');
                    im.src = url; im.draggable = false;
                    im.style.cssText = 'visibility:hidden;display:block;';
                    b.appendChild(im);
                    b.addEventListener('mousedown', () => { im.style.visibility = 'visible'; });
                    const restore = () => { im.style.visibility = 'hidden'; };
                    b.addEventListener('mouseup', restore);
                    b.addEventListener('mouseleave', restore);
                }
            });
            panel.appendChild(b);
        };
        mkBtn(388, 43, 175, 24, 24, () => this._shopPageTurn(-9));
        mkBtn(387, 90, 175, 24, 24, () => this._shopPageTurn(9));
        mkBtn(386, 215, 171, 44, 16, () => this._buySelected(msg.npcId));
        mkBtn(64, 291, 0, 16, 23, () => this._closeShopPanel());
        gui.appendChild(panel);
        this._renderBuyList();
    }

    _renderBuyList() {
        if (!this.shopListEl) return;
        this.shopListEl.innerHTML = '';
        const max = 10;
        const start = this.shopPage;
        const goods = this.shopGoods;
        for (let i = 0; i < max; i++) {
            const idx = start + i;
            if (idx >= goods.length) break;
            const g = goods[idx];
            const row = document.createElement('div');
            row.style.cssText = `position:relative;height:13px;cursor:pointer;color:${idx === this.shopSel ? '#ff4444' : '#fff'};`;
            row.innerHTML = `<span style="position:absolute;left:0;">${idx === this.shopSel ? '▶' : ''}${g.name}</span>`
                + `<span style="position:absolute;left:137px;color:#fff;">${g.price}金币</span>`;
            row.addEventListener('click', () => { this.shopSel = idx; this._renderBuyList(); });
            this.shopListEl.appendChild(row);
        }
    }

    _shopPageTurn(delta) {
        const max = 10;
        const np = this.shopPage + delta;
        if (np < 0) return;
        if (np >= this.shopGoods.length) return;
        this.shopPage = np;
        this._renderBuyList();
    }

    _buySelected(npcId) {
        if (this.shopSel < 0 || this.shopSel >= this.shopGoods.length) return;
        const g = this.shopGoods[this.shopSel];
        this.conn.send('buyItem', { npcId, index: g.index, count: 1 });
    }

    // 卖出：ok 框（原版 DSellDlg 投放框）+ 背包物品列表
    _showSellDlg(msg) {
        this.shopSellItem = null;   // 选中要卖的物品
        const gui = this.manager.winManager.container;
        const panel = document.createElement('div');
        panel.style.cssText = 'position:absolute;left:260px;top:176px;width:140px;height:181px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        this.shopPanel = panel;
        this._libUrl('prguse', 392).then((url) => {
            if (url && this.shopPanel === panel) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                panel.insertBefore(bg, panel.firstChild);
            }
        });
        // 标题「卖: 价格」
        this.shopPriceEl = document.createElement('div');
        this.shopPriceEl.style.cssText = 'position:absolute;left:8px;top:6px;font-size:12px;text-shadow:1px 1px 0 #000;';
        this.shopPriceEl.textContent = '卖: ';
        panel.appendChild(this.shopPriceEl);
        // 投放框 Spot (27,67) 61x52：拿起物品后点这里放入要卖的物品
        const spot = document.createElement('div');
        spot.style.cssText = 'position:absolute;left:27px;top:67px;width:61px;height:52px;'
            + 'display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;';
        spot.title = '拿起物品后点这里放入要卖的物品';
        spot.addEventListener('click', () => {
            if (this.pickedItem) {
                this._pickSellItem(this.pickedItem);
                this._clearPicked();
            }
        });
        this.shopSpotEl = spot;
        panel.appendChild(spot);
        // OK 按钮（原版 393 按下态，背景已画 OK）+ 关闭（背景已画红X）——热区模式
        const mkBtn = (idx, x, y, w, h, cb) => {
            const b = document.createElement('div');
            b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:pointer;`;
            b.addEventListener('click', cb);
            this._libUrl('prguse', idx).then((url) => {
                if (url) {
                    const im = document.createElement('img');
                    im.src = url; im.draggable = false;
                    im.style.cssText = 'visibility:hidden;display:block;';
                    b.appendChild(im);
                    b.addEventListener('mousedown', () => { im.style.visibility = 'visible'; });
                    const restore = () => { im.style.visibility = 'hidden'; };
                    b.addEventListener('mouseup', restore);
                    b.addEventListener('mouseleave', restore);
                }
            });
            panel.appendChild(b);
        };
        mkBtn(393, 85, 150, 24, 13, () => this._sellOk(msg.npcId));
        mkBtn(64, 115, 0, 16, 23, () => this._closeShopPanel());
        gui.appendChild(panel);

        // 卖出模式：打开原版背包（右侧 475,0，原版 DItemBag 卖出位置），背包物品点击放入投放框
        this.shopSellMode = true;
        if (!this.bagPanel) this._buildBag();
        this.bagPanel.style.display = 'block';
        this.bagPanel.style.left = '475px';
        this.bagPanel.style.top = '0px';
        this._refreshBag();
    }

    _pickSellItem(it) {
        this.shopSellItem = it;
        // 投放框显示物品图标
        this.shopSpotEl.innerHTML = '';
        if (it.looks > 0) {
            this._libUrl('items', it.looks).then((url) => {
                if (url) {
                    const im = document.createElement('img');
                    im.src = url; im.draggable = false;
                    im.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
                    this.shopSpotEl.appendChild(im);
                }
            });
        }
        this.shopPriceEl.textContent = '卖: ' + it.name;
    }

    _sellOk(npcId) {
        if (!this.shopSellItem) return;
        this.conn.send('sellItem', { npcId, makeIndex: this.shopSellItem.makeIndex });
    }

    _clearSellSpot() {
        this.shopSellItem = null;
        if (this.shopSpotEl) this.shopSpotEl.innerHTML = '';
        if (this.shopPriceEl) this.shopPriceEl.textContent = '卖: ';
    }

    _closeShopPanel() {
        if (this.shopPanel) { this.shopPanel.remove(); this.shopPanel = null; }
        if (this.shopBagListEl) { this.shopBagListEl.remove(); this.shopBagListEl = null; }
        this.shopGoldEl = null;
        this.shopSellMode = false;
        this.shopSellItem = null;
        // 恢复背包位置（卖出时移到右侧）
        if (this.bagPanel) {
            this.bagPanel.style.left = '0px';
            this.bagPanel.style.top = '0px';
            this.bagPanel.style.display = 'none';
        }
    }

    // 解析 NPC 说话文本：<label@value> 渲染为内联黄色下划线链接，其余为普通文本
    // （对齐原版 DMerchantDlgDirectPaint 的 <cmdstr@cmdparam> 语义）
    _renderNpcSay(container, sayText, npcId) {
        let i = 0;
        const appendText = (s) => {
            if (!s) return;
            const span = document.createElement('span');
            span.textContent = s;
            container.appendChild(span);
        };
        while (i < sayText.length) {
            const lt = sayText.indexOf('<', i);
            if (lt < 0) { appendText(sayText.slice(i)); break; }
            const gt = sayText.indexOf('>', lt);
            if (gt < 0) { appendText(sayText.slice(i)); break; }
            appendText(sayText.slice(i, lt));
            const inner = sayText.slice(lt + 1, gt);
            const at = inner.indexOf('@');
            if (at >= 0) {
                // 原脚本格式 <label/@value>，label 末尾的 '/' 是分隔符，去掉
                const label = inner.slice(0, at).replace(/[\/ ]+$/, '');
                const value = inner.slice(at);   // @xxx
                const a = document.createElement('a');
                a.textContent = label;
                a.style.cssText = 'color:#ffd76a;text-decoration:underline;cursor:pointer;'
                    + 'text-shadow:1px 1px 0 #000;pointer-events:auto;';
                a.addEventListener('click', () => this.conn.send('npcSelect', { npcId, value }));
                container.appendChild(a);
            } else {
                appendText(inner);
            }
            i = gt + 1;
        }
    }

    _closeNpcDialog() {
        if (this.npcDlg) { this.npcDlg.remove(); this.npcDlg = null; }
        this._npcDlgX = null;
        this._closeShopPanel();   // 关闭对话框时同步关闭买卖面板（买列表 / 卖 ok 框）
    }

    update() {}

    render(ctx) {
        if (!this.self) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        const now = Date.now();
        // NPC 对话框走远自动关闭（原版：离开打开时的位置 >= 8 格即 CloseMDlg）
        if (this.npcDlg && this._npcDlgX != null) {
            if (Math.abs(this.self.x - this._npcDlgX) >= 8
                || Math.abs(this.self.y - this._npcDlgY) >= 8) {
                this._closeNpcDialog();
                this._npcDlgX = null;
            }
        }
        // 匀速卷动：显示中心以「移动速度」匀速逼近玩家坐标（格/ms 固定），
        // 消除 lerp 指数逼近的「先快后慢」追停抖动；shift 整数化避免浮点绘制模糊。
        if (this._viewX == null) { this._viewX = this.self.x; this._viewY = this.self.y; this._lastFrame = now; }
        const dt = now - this._lastFrame;
        this._lastFrame = now;
        const stepDur = this._mouseRun ? RUN_INTERVAL : WALK_INTERVAL;   // 每格耗时 ms
        const maxStep = dt / stepDur;                                    // 本帧最大卷动（格）
        const dx = this.self.x - this._viewX;
        const dy = this.self.y - this._viewY;
        this._viewX += dx > maxStep ? maxStep : (dx < -maxStep ? -maxStep : dx);
        this._viewY += dy > maxStep ? maxStep : (dy < -maxStep ? -maxStep : dy);
        const vcx = Math.floor(this._viewX);
        const vcy = Math.floor(this._viewY);
        const shiftX = Math.round((this._viewX - vcx) * 48);
        const shiftY = Math.round((this._viewY - vcy) * 32);
        const entities = [];
        for (const e of this.entities.values()) {
            // 移动停止超时回站立（所有实体：连续移动动画循环，停止后归位 stand）
            if ((e._action === 'walk' || e._action === 'run')
                && (now - (e._lastMoveAt || 0)) > 600) {
                e._action = 'stand';
            }
            const sp = this._sprite(e);
            const isSelf = e.id === this.self.id;
            let ox = 0, oy = 0;
            if (isSelf) {
                // self 走动画偏移：从逻辑格滑向过渡位置 _viewX（地图反向偏移共用 _viewX）
                ox = (this._viewX - e.x) * 48;
                oy = (this._viewY - e.y) * 32;
            } else if (e._moveAt != null && e._fromX != null) {
                // 怪物/NPC 移动过渡：从旧格滑到新格（时长对齐 walk 动画周期）
                const t = (now - e._moveAt) / MONSTER_MOVE_DUR;
                if (t < 1) {
                    ox = (e._fromX - e.x) * 48 * (1 - t);
                    oy = (e._fromY - e.y) * 32 * (1 - t);
                }
            }
            entities.push({
                x: e.x, y: e.y,   // 逻辑位置（遮挡排序用）
                offsetX: ox, offsetY: oy,
                name: e.name, isSelf,
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
                // 金币堆：黄色圆点（原版用金币袋图，暂用圆点）
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(sx + 24, sy + 16, 5, 0, Math.PI * 2);
                ctx.fill();
            } else if (g.looks > 0) {
                // 物品：DnItems[looks] 图标（原版掉落物贴图）
                this._drawDropTex(ctx, g.looks, sx, sy);
            }
            if (g.name) {
                ctx.font = '11px SimSun,serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(g.name, sx + 24, sy + 6);
            }
        }
    }

    // 绘制掉落物物品图标（DnItems 库，异步加载 + 缓存）
    _drawDropTex(ctx, looks, sx, sy) {
        if (!this._dropTex) this._dropTex = new Map();
        if (!this._dropTexLoading) this._dropTexLoading = new Set();
        let tex = this._dropTex.get(looks);
        if (!tex) {
            if (!this._dropTexLoading.has(looks)) {
                this._dropTexLoading.add(looks);
                const lib = getLib('dnitems');
                if (lib) {
                    lib.getTexture(looks).then((t) => {
                        if (t) this._dropTex.set(looks, t);
                        this._dropTexLoading.delete(looks);
                    }).catch(() => this._dropTexLoading.delete(looks));
                }
            }
            // 加载中占位
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(sx + 19, sy + 11, 10, 10);
            return;
        }
        ctx.drawImage(tex.canvas, sx + (48 - tex.width) / 2, sy + (32 - tex.height) / 2);
    }

    _renderHud() {
        if (!this.hudEl || !this.self) return;
        const p = this.self;
        this.hudEl.textContent = `${p.name}  Lv.${p.level}  HP ${p.hp}/${p.maxHp}  MP ${p.mp}/${p.maxMp}`;
    }

    onExit() {
        if (this.moveTimer) { clearInterval(this.moveTimer); this.moveTimer = null; }
        if (this._runTimer) { clearTimeout(this._runTimer); this._runTimer = null; }
        if (this._runCycleTimer) { clearTimeout(this._runCycleTimer); this._runCycleTimer = null; }
        document.removeEventListener('keydown', this._keyDown);
        if (this._mdHandler) this._canvas.removeEventListener('mousedown', this._mdHandler);
        if (this._muHandler) document.removeEventListener('mouseup', this._muHandler);
        if (this._mmHandler) document.removeEventListener('mousemove', this._mmHandler);
        this._holding = false;
        this.bagPanel = null;
        this.stateWin = null;
        this.npcDlg = null;
        this.shopPanel = null;
        this.shopBagListEl = null;
        this.shopListEl = null;
        this.shopSpotEl = null;
        this.shopGoldEl = null;
        this.shopSellItem = null;
        this.pickedItem = null;
        this._pickedCell = null;
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
    }
}
