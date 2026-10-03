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

// 玩家攻击动画时长（HA.hit：6 帧 × 85ms = 510ms），动作完成才允许下一次攻击
const ATTACK_ANIM_MS = 510;

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

// 被动技能（无法主动施放）：基本剑术/精神力战法/攻杀/刺杀。
// 注意半月弯刀(25)/烈火剑法(26)/野蛮冲撞(27) 虽 EffectType=0 但为主动可施放，
// 故不能用 effectType===0 判被动，需白名单。
const PASSIVE_MAGICS = new Set([3, 4, 7, 12]);

export class PlayScene extends Scene {
    constructor(manager, snapshot) {
        super(manager);
        this.snapshot = snapshot;       // enterGame 快照
        this.self = null;
        this.entities = new Map();      // id -> 实体快照
        this.sprites = new Map();       // id -> ActorSprite
        this.mapActor = new MapActor(SCREEN_WIDTH, MAPSURFACEHEIGHT);
        this._holding = false;       // 鼠标按住状态（按住持续移动，松开停止）
        this._mouseRun = false;      // 是否跑（右键）
        this._mouseDir = -1;         // 当前移动方向（鼠标相对人物，0-7）
        this._lastMoveAt = 0;        // 上次移动时间戳
        this._lastHitTime = 0;       // 上次攻击时间戳（CanNextHit 攻速控制）
        this.magicPage = 0;          // 技能页内部分页页码（每页 5 个技能）
        this.groundItems = new Map();// id -> 地面物品
        this.castTarget = null;      // 施法目标（怪物 id）
        this._zTop = 100;            // 窗口 z-index 计数器（点击前置递增）
        this._dragCleaners = [];     // 窗口拖动监听清理函数
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
        this._muHandler = () => {
            this._holding = false;   // 松开停止移动
        };
        this._mmHandler = (e) => this._onMouseMove(e);   // 按住时实时更新方向
        this._canvas.addEventListener('mousedown', this._mdHandler);
        document.addEventListener('mouseup', this._muHandler);   // 全局松开（防止移出 canvas 后仍按住）
        document.addEventListener('mousemove', this._mmHandler);
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

    // F1-F8 施法：按快捷键 key（F11 技能设置页绑定）查找技能
    _castFromSlot(fkey) {
        const skills = this.self && this.self.skills ? this.self.skills : {};
        for (const [magicId, sk] of Object.entries(skills)) {
            if (sk && sk.key === fkey) {
                this._castMagic(Number(magicId));
                return;
            }
        }
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

    // 朝目标点移动一步（原版 ProcessActionMessages：每步按当前坐标重算朝目标的方向）
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

    _onKeyDown(e) {
        if (e.target === this.chatInput) return;
        if (e.code === 'Space') { e.preventDefault(); this._attackNearest(); }
        if (e.code === 'F9') { e.preventDefault(); this._toggleBag(); }          // 原版 VK_F9 = 背包
        if (e.code === 'F10') { e.preventDefault(); this._toggleStateWin(); }    // 原版 VK_F10 = 状态/装备属性
        if (e.code === 'F12') { e.preventDefault(); this._openSkillSetup(); }    // 原版 VK_F11=技能设置，macOS F11 被系统拦截(显示桌面)改用 F12
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
        if (best) this._tryAttack(best.id);
    }

    // 攻击前判定（对齐原版 CanNextAction + CanNextHit）：
    // 1) 角色空闲（IsIdle，不在攻击/施法/移动动作中）——「后一个动作的前提是前一个动作完成」
    // 2) 攻速间隔到（CanNextHit：1400 - min(800, min(370, level*14) + HitSpeed*60)）
    _tryAttack(targetId) {
        if (!this._isIdle()) return;
        if (!this._canNextHit()) return;
        this._lastHitTime = Date.now();
        // 本地立即标记攻击动作（不等服务端回包）：动画播放期间 _isIdle()=false，无法再次攻击
        if (this.self) {
            this.self._action = 'attack';
            this.self._actionAt = Date.now();
        }
        this.conn.send('attack', { targetId });
    }

    // 角色是否空闲（动作已完成）：self 无动作或已回到 stand
    _isIdle() {
        const s = this.self;
        if (!s) return false;
        const action = s._action || 'stand';
        return action === 'stand';
    }

    // 攻速间隔（原版 CanNextHit）。HitSpeed 简化取 0（StdItems.csv 无攻击速度字段）。
    _canNextHit() {
        const level = this.self ? (this.self.level || 1) : 1;
        let levelfast = Math.min(370, level * 14);
        levelfast = Math.min(800, levelfast);   // + HitSpeed*60（当前 0）
        const nexthit = Math.max(0, 1400 - levelfast);
        return (Date.now() - this._lastHitTime) > nexthit;
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
        const run = e.button === 2;   // 左键走、右键跑
        const { mx, my } = this._mouseXY(e);

        // 贴图区域判定（原版 GetAttackFocusCharacter）：仅左键触发怪物攻击/NPC 对话/玩家攻击/拾取；
        // 右键只用于「跑」，点 NPC/怪不对话不攻击
        if (e.button === 0) {
            const monster = this._actorAtScreen(mx, my, 'monster');
            if (monster && monster.hp > 0 && this._dist(this.self, monster) <= 1) {
                this.castTarget = monster.id;   // 红框高亮
                this._tryAttack(monster.id);
                return;
            }
            const npc = this._actorAtScreen(mx, my, 'npc');
            if (npc) {
                // 原版点中 NPC 贴图即对话（客户端不限距离，服务端限 15 格）
                this.conn.send('npcTalk', { npcId: npc.id });
                return;
            }
            // 其他玩家（原版：点击玩家 = 攻击，与怪物同；排除自己，原版 IsSelectMyself 判断）
            const player = this._actorAtScreen(mx, my, 'player');
            if (player && player.id !== this.self.id && this._dist(this.self, player) <= 1) {
                this.castTarget = player.id;   // 红框高亮
                this._tryAttack(player.id);
                return;
            }
            const { tx, ty } = this._gridFromMouse(e);
            const gi = this._groundAt(tx, ty);
            if (gi && gi.x === this.self.x && gi.y === this.self.y) {
                this.conn.send('pickup', { itemId: gi.id });
                return;
            }
        }

        // 空地移动：记录方向，按住持续朝该方向移动（主循环按间隔节流，快速点击不累计）
        const dir = this._dirFromMouse(e);
        if (dir < 0) return;
        this._holding = true;
        this._mouseRun = run;
        this._mouseDir = dir;
        // 立即可以走第一步（重置间隔，让「点一下」也走一步）
        this._lastMoveAt = 0;
    }

    // 按住移动时，实时更新移动方向（移动过程中转向）
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
                    if (msg.skills !== undefined) e.skills = msg.skills;   // 技能快捷键更新
                }
                // 技能页打开时同步刷新（快捷键变更）
                if (this.stateWin && this.stateWin.style.display === 'block' && this.statePage === 3) {
                    this._refreshSkillPage();
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
                this._mouseDir = -1;
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

    // 窗口可拖动 + 点击前置（原版 TDWindow：MouseDown ChangeChildOrder 置顶，MouseMove 拖动）
    _makeWindowDraggable(win) {
        // 点击任意位置 → 前置（捕获阶段，子元素点击也触发）
        win.addEventListener('mousedown', () => this._bringToFront(win), true);
        // 整个窗口按住拖动；超过 4px 阈值才算拖动（否则视为点击，不影响格子/按钮）
        let drag = null;
        win.addEventListener('mousedown', (e) => {
            drag = { sx: e.clientX, sy: e.clientY, l: win.offsetLeft, t: win.offsetTop, moved: false };
        });
        const mm = (e) => {
            if (!drag || !win.isConnected) return;   // 窗口已移除则忽略
            const dx = e.clientX - drag.sx;
            const dy = e.clientY - drag.sy;
            if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
            drag.moved = true;
            win.style.left = Math.max(0, Math.min(SCREEN_WIDTH - win.offsetWidth, drag.l + dx)) + 'px';
            win.style.top = Math.max(0, Math.min(SCREEN_HEIGHT - win.offsetHeight, drag.t + dy)) + 'px';
        };
        const mu = () => {
            const wasMoved = drag && drag.moved;
            drag = null;
            if (wasMoved) win._suppressClick = Date.now();   // 拖动后抑制 click
        };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
        // 拖动后抑制 click（避免拖动触发格子选中/按钮点击）
        win.addEventListener('click', (e) => {
            if (win._suppressClick && Date.now() - win._suppressClick < 300) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
        this._dragCleaners.push(() => {
            document.removeEventListener('mousemove', mm);
            document.removeEventListener('mouseup', mu);
        });
    }

    _bringToFront(win) {
        win.style.zIndex = ++this._zTop;
    }

    _toggleStateWin() {
        if (!this.stateWin) this._buildStateWin();
        const open = this.stateWin.style.display === 'block';
        this.stateWin.style.display = open ? 'none' : 'block';
        if (!open) this._refreshStateWin();
    }

    // F12：打开/关闭技能设置页（原版 VK_F11 → StatePage:=3 → OpenMyStatus 是 toggle 窗口）
    _openSkillSetup() {
        if (!this.stateWin) this._buildStateWin();
        const open = this.stateWin.style.display === 'block';
        this.statePage = 3;
        if (open) {
            this.stateWin.style.display = 'none';
        } else {
            this.magicPage = 0;   // 打开技能页时回到第一页（原版 OpenMyStatus → PageChanged StatePage=3 → MagicPage:=0）
            this.stateWin.style.display = 'block';
            this._refreshStateWin();
            this._bringToFront(this.stateWin);
        }
    }

    _buildStateWin() {
        if (this.stateWin) return;
        const gui = this.manager.winManager.container;
        const win = document.createElement('div');
        // 用 left 定位（原版右对齐 ≈ 800-232=568），便于拖动
        win.style.cssText = 'position:absolute;left:568px;top:0;width:232px;height:325px;'
            + 'pointer-events:auto;font-family:SimSun,serif;color:#e8d9b0;';
        win.style.display = 'none';
        // 背景 Prguse[370]（标记 win-drag 用于拖动）
        this._libUrl('prguse', 370).then((url) => {
            if (url && this.stateWin === win) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.className = 'win-drag';
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
        // 属性页（数值对齐背景标签）
        this.stateAttrWrap = document.createElement('div');
        this.stateAttrWrap.style.cssText = 'position:absolute;left:0;top:0;width:232px;height:325px;display:none;';
        win.appendChild(this.stateAttrWrap);
        this.stateAttrEl = document.createElement('div');
        this.stateAttrEl.style.cssText = 'position:absolute;left:112px;top:99px;width:96px;'
            + 'font-size:12px;line-height:20px;text-shadow:1px 1px 0 #000;';
        this.stateAttrWrap.appendChild(this.stateAttrEl);
        // 属性数值页（原版 StatePage=2：经验/重量/负重/腕力/精确度/敏捷度等，背景 Prguse[382]）
        this.stateAttr2Wrap = document.createElement('div');
        this.stateAttr2Wrap.style.cssText = 'position:absolute;left:0;top:0;width:232px;height:325px;display:none;';
        win.appendChild(this.stateAttr2Wrap);
        this._libUrl('prguse', 382).then((url) => {
            if (url && this.stateWin === win) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:38px;top:52px;';
                this.stateAttr2Wrap.insertBefore(bg, this.stateAttr2Wrap.firstChild);
            }
        });
        this.stateAttr2El = document.createElement('div');
        this.stateAttr2El.style.cssText = 'position:absolute;left:58px;top:62px;width:150px;'
            + 'font-size:12px;line-height:14px;text-shadow:1px 1px 0 #000;';
        this.stateAttr2Wrap.appendChild(this.stateAttr2El);
        // 技能页（F12，原版 StatePage=3 魔法页：Prguse[383] 背景 + 5 个技能行 + 内部分页）
        this.stateSkillWrap = document.createElement('div');
        this.stateSkillWrap.style.cssText = 'position:absolute;left:0;top:0;width:232px;height:325px;display:none;';
        win.appendChild(this.stateSkillWrap);
        // 技能页背景 Prguse[383]（原版在 38,52；此前缺背景导致沿用装备页 370 底图，界面错乱）
        this._libUrl('prguse', 383).then((url) => {
            if (url && this.stateWin === win) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:38px;top:52px;';
                // 插入到技能列表之前：背景异步加载完时列表已存在，保证列表文字不被背景遮挡
                this.stateSkillWrap.insertBefore(bg, this.stateSkillListEl);
            }
        });
        // 技能列表：5 行（图标 31x33 @原版 DStMag1-5 位置 46,59/96/134/171/208 + 名字/等级/快捷键）
        this.stateSkillListEl = document.createElement('div');
        this.stateSkillListEl.style.cssText = 'position:absolute;left:46px;top:59px;width:170px;height:185px;'
            + 'font-size:12px;color:#e8d9b0;text-shadow:1px 1px 0 #000;';
        this.stateSkillWrap.appendChild(this.stateSkillListEl);
        // 内部分页按钮（原版 DStPageUp=398 上 213,113 / DStPageDown=396 下 213,143），仅技能页显示
        const mkMagPage = (idx, top, delta) => {
            const b = document.createElement('div');
            b.style.cssText = `position:absolute;left:213px;top:${top}px;width:12px;height:21px;cursor:pointer;`;
            b.addEventListener('click', () => {
                this.magicPage += delta;
                this._refreshSkillPage();
            });
            this._libUrl('prguse', idx).then((url) => {
                if (url) { const im = document.createElement('img'); im.src = url; im.draggable = false; b.appendChild(im); }
            });
            this.stateSkillWrap.appendChild(b);
        };
        mkMagPage(398, 113, -1);   // 上翻
        mkMagPage(396, 143, 1);    // 下翻
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
            b.addEventListener('click', () => {
                this.statePage = (this.statePage + page + 4) % 4;   // 0装备 1状态值 2属性数值 3技能 循环
                this._refreshStateWin();
            });
            this._libUrl('prguse', idx).then((url) => {
                if (url) { const im = document.createElement('img'); im.src = url; im.draggable = false; b.appendChild(im); }
            });
            win.appendChild(b);
        };
        mkArrow(373, 128, -1);   // 上箭头 → 上一页
        mkArrow(372, 187, 1);    // 下箭头 → 下一页
        this.stateWin = win;
        this.statePage = 0;
        this._makeWindowDraggable(win);
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
        this.stateAttr2Wrap.style.display = this.statePage === 2 ? 'block' : 'none';
        this.stateSkillWrap.style.display = this.statePage === 3 ? 'block' : 'none';
        if (this.statePage === 0) {
            this._refreshEquipPage();
        } else if (this.statePage === 1) {
            this._refreshAttrPage();
        } else if (this.statePage === 2) {
            this._refreshAttr2Page();
        } else {
            this._refreshSkillPage();
        }
    }

    // 技能页（F12）：已学技能列表（每页 5 个：图标 + 名字 + 等级 + 快捷键）
    _refreshSkillPage() {
        if (!this.stateSkillListEl) return;
        this.stateSkillListEl.innerHTML = '';
        const skills = this.self && this.self.skills ? this.self.skills : {};
        const entries = Object.entries(skills);
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.textContent = '尚未学习任何技能';
            empty.style.color = '#888';
            empty.style.lineHeight = '37px';
            this.stateSkillListEl.appendChild(empty);
            return;
        }
        // 内部分页：每页 5 个，页码钳制
        const pageCount = Math.max(1, Math.ceil(entries.length / 5));
        if (this.magicPage >= pageCount) this.magicPage = pageCount - 1;
        if (this.magicPage < 0) this.magicPage = 0;
        const page = entries.slice(this.magicPage * 5, this.magicPage * 5 + 5);
        for (const [magicId, sk] of page) {
            const mid = Number(magicId);
            const passive = PASSIVE_MAGICS.has(mid);   // 被动技能白名单（基本剑术/精神力战法/攻杀/刺杀）
            const row = document.createElement('div');
            row.style.cssText = 'position:relative;height:37px;overflow:hidden;'
                + (passive ? 'color:#888;' : '');
            // 技能图标（原版 MagIcon[Effect*2]，Effect=0 的被动技能也用 magicon[0]）
            // 单击图标弹快捷键设置对话框（原版 DStMag1Click，仅图标可点，整行不可点）
            if (sk.effect != null && sk.effect >= 0) {
                this._libUrl('magicon', sk.effect * 2).then((url) => {
                    if (url) {
                        const im = document.createElement('img');
                        im.src = url; im.draggable = false;
                        im.style.cssText = 'position:absolute;left:0;top:0;width:31px;height:33px;'
                            + (passive ? '' : 'cursor:pointer;');
                        if (!passive) {
                            im.title = '点击设置快捷键';
                            im.addEventListener('click', () => this._setupSkillKey(mid, sk));
                        }
                        row.appendChild(im);
                    }
                });
            }
            // 名字（原版 TextOut bbx+48）
            const nameEl = document.createElement('div');
            nameEl.textContent = sk.name;
            nameEl.style.cssText = 'position:absolute;left:40px;top:1px;white-space:nowrap;';
            row.appendChild(nameEl);
            // 等级（原版 TextOut bbx+48+16, bby+8+15）
            const lvEl = document.createElement('div');
            lvEl.textContent = String(sk.level);
            lvEl.style.cssText = 'position:absolute;left:56px;top:17px;font-size:11px;';
            row.appendChild(lvEl);
            if (!passive) {
                // 快捷键图标（原版 keyimg Prguse[650..657]，此资源缺失改用 DKeySelDlg 的 F 键图 232/234/...）
                if (sk.key) {
                    this._libUrl('prguse', 232 + (sk.key - 1) * 2).then((url) => {
                        if (url) {
                            const im = document.createElement('img');
                            im.src = url; im.draggable = false;
                            im.style.cssText = 'position:absolute;left:137px;top:8px;';
                            row.appendChild(im);
                        }
                    });
                } else {
                    const unset = document.createElement('div');
                    unset.textContent = '未设置';
                    unset.style.cssText = 'position:absolute;left:70px;top:12px;font-size:11px;color:#a8a090;';
                    row.appendChild(unset);
                }
            }
            this.stateSkillListEl.appendChild(row);
        }
    }

    // 点击技能：弹出快捷键设置对话框（原版 DKeySelDlg：背景 Prguse[229] + MagIcon 图标 + F1-F8 键图标）
    _setupSkillKey(magicId, sk) {
        const gui = this.manager.winManager.container;
        if (this.keySetupEl) { this.keySetupEl.remove(); this.keySetupEl = null; }
        const W = 376, H = 179;
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${Math.floor((SCREEN_WIDTH - W) / 2)}px;`
            + `top:${Math.floor((SCREEN_HEIGHT - H) / 2)}px;width:${W}px;height:${H}px;`
            + 'z-index:9999;font-family:SimSun,serif;color:#e8d9b0;font-size:12px;pointer-events:auto;';
        this.keySetupEl = box;
        // 背景 Prguse[229]（这个资源版本用 229 替代原版 620）
        this._libUrl('prguse', 229).then((url) => {
            if (url && this.keySetupEl === box) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.style.cssText = 'position:absolute;left:0;top:0;';
                box.insertBefore(bg, box.firstChild);
            }
        });
        // 技能图标 MagIcon[Effect*2]（对齐背景图标槽 16-48,16-64）
        this._libUrl('magicon', sk.effect * 2).then((url) => {
            if (url && this.keySetupEl === box) {
                const im = document.createElement('img');
                im.src = url; im.draggable = false;
                im.style.cssText = 'position:absolute;left:16px;top:20px;width:31px;height:33px;';
                box.appendChild(im);
            }
        });
        // 技能名（图标右侧）
        const name = document.createElement('div');
        name.textContent = sk.name;
        name.style.cssText = 'position:absolute;left:55px;top:28px;white-space:nowrap;';
        box.appendChild(name);
        // F1-F8 键（原版 DKsF1..F8：正常态透明、当前键高亮 idx+1、按下显示 idx）
        // 居中一排，背景提示文字（y≈80-112）下方
        for (let k = 1; k <= 8; k++) {
            const idx = 232 + (k - 1) * 2;
            const left = 60 + (k - 1) * 32;
            const btn = document.createElement('div');
            btn.style.cssText = `position:absolute;left:${left}px;top:118px;width:32px;height:30px;cursor:pointer;`;
            const isCurrent = (sk.key === k);
            const im = document.createElement('img');
            im.draggable = false;
            im.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;';
            btn.appendChild(im);
            const show = (imgIdx) => {
                this._libUrl('prguse', imgIdx).then((url) => {
                    if (url && this.keySetupEl === box) { im.src = url; im.style.visibility = 'visible'; }
                });
            };
            if (isCurrent) show(idx + 1);   // 当前快捷键高亮
            btn.addEventListener('mousedown', () => show(idx));
            btn.addEventListener('mouseup', () => { im.style.visibility = isCurrent ? 'visible' : 'hidden'; });
            btn.addEventListener('mouseleave', () => { im.style.visibility = isCurrent ? 'visible' : 'hidden'; });
            btn.addEventListener('click', () => {
                this.conn.send('magicKeyChange', { magicId, key: k });
                this.keySetupEl.remove();
                this.keySetupEl = null;
            });
            box.appendChild(btn);
        }
        // 清除快捷键（原版 DKsNone，此资源无图，用文字）
        const clear = document.createElement('div');
        clear.textContent = '清除';
        clear.style.cssText = 'position:absolute;right:120px;bottom:20px;cursor:pointer;color:#e8d9b0;';
        clear.addEventListener('click', () => {
            this.conn.send('magicKeyChange', { magicId, key: 0 });
            this.keySetupEl.remove();
            this.keySetupEl = null;
        });
        box.appendChild(clear);
        // 取消（原版 DKsOk，用文字按钮）
        const cancel = document.createElement('div');
        cancel.textContent = '取消';
        cancel.style.cssText = 'position:absolute;right:40px;bottom:20px;cursor:pointer;color:#e8d9b0;';
        cancel.addEventListener('click', () => { this.keySetupEl.remove(); this.keySetupEl = null; });
        box.appendChild(cancel);
        gui.appendChild(box);
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

    // 属性页：只显示属性数值（纯数字，标签由背景图提供；经验/金币由背景图自带，无需重复）
    _refreshAttrPage() {
        const p = this.self;
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

    // 属性数值页（原版 StatePage=2）：经验/重量/负重/腕力/精确度/敏捷度 + 防御恢复（当前未实现置 0）
    _refreshAttr2Page() {
        const p = this.self;
        this.stateAttr2El.innerHTML = '';
        const rows = [
            ['当前经验', `${p.exp || 0}`],
            ['升级经验', `${p.maxExp || 0}`],
            ['背包重量', `${p.weight || 0}/${p.maxWeight || 0}`],
            ['负重量', `${p.wearWeight || 0}/${p.maxWearWeight || 0}`],
            ['腕力', `${p.handWeight || 0}/${p.maxHandWeight || 0}`],
            ['精确度', `${p.hit || 0}`],
            ['敏捷度', `${p.speed || 0}`],
            ['魔法防御', `+${(p.antiMagic || 0) * 10}%`],
            ['中毒防御', `+${(p.antiPoison || 0) * 10}%`],
            ['中毒恢复', `+${(p.poisonRecover || 0) * 10}%`],
            ['体力恢复', `+${(p.healthRecover || 0) * 10}%`],
            ['魔法恢复', `+${(p.spellRecover || 0) * 10}%`],
        ];
        rows.forEach(([label, val], i) => {
            const line = document.createElement('div');
            line.style.cssText = `position:absolute;left:0;top:${i * 14}px;white-space:nowrap;`;
            const l = document.createElement('span');
            l.textContent = label;
            line.appendChild(l);
            const v = document.createElement('span');
            v.textContent = val;
            v.style.cssText = 'position:absolute;left:85px;';
            line.appendChild(v);
            this.stateAttr2El.appendChild(line);
        });
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
        // 背景 Prguse[3]（标记 win-drag 用于拖动）
        this._libUrl('prguse', 3).then((url) => {
            if (url && this.bagPanel === panel) {
                const bg = document.createElement('img');
                bg.src = url; bg.draggable = false;
                bg.className = 'win-drag';
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
        // 金币（原版 DItemBagDirectPaint：TextOut(Left+64, Top+185, GetGoldStr) 白色千分位）
        this.goldEl = document.createElement('div');
        this.goldEl.style.cssText = 'position:absolute;left:64px;top:185px;font-size:12px;color:#ffffff;text-shadow:1px 1px 0 #000;';
        panel.appendChild(this.goldEl);
        // 物品描述区（原版 DItemBagDirectPaint：鼠标悬停物品在 Left+70,Top+215 起显示 3 行描述）
        this.bagDescEl = document.createElement('div');
        this.bagDescEl.style.cssText = 'position:absolute;left:70px;top:215px;width:250px;'
            + 'font-size:12px;line-height:14px;color:#ffffff;text-shadow:1px 1px 0 #000;pointer-events:none;';
        panel.appendChild(this.bagDescEl);
        // 背包物品格子（原版 DItemGrid 20,13 286x162；TDGrid ColCount=8 RowCount=5 ColWidth=36 RowHeight=32）
        this.bagGridEl = document.createElement('div');
        this.bagGridEl.style.cssText = 'position:absolute;left:20px;top:13px;width:286px;height:162px;'
            + 'display:grid;grid-template-columns:repeat(8,36px);grid-template-rows:repeat(5,32px);'
            + 'grid-auto-rows:32px;grid-auto-columns:36px;row-gap:0;column-gap:0;';
        panel.appendChild(this.bagGridEl);
        this.bagPanel = panel;
        this._makeWindowDraggable(panel);
        gui.appendChild(panel);
    }

    _refreshBag() {
        if (!this.bagPanel || !this.self) return;
        // 原版 GetGoldStr：千分位逗号，无「金币」前缀
        this.goldEl.textContent = this._formatGold(this.self.gold || 0);
        const items = this.self.items || [];

        // 背包物品（8 列网格，图标居中）：双击使用、单击拿起（原版 GetItemCursor 交互）
        this.bagGridEl.innerHTML = '';
        this._pickedCell = null;
        const bagItems = items.filter(x => x.slot === undefined);
        for (const it of bagItems) {
            const cell = document.createElement('div');
            // 格子显式固定尺寸（36×32，对齐原版 TDGrid ColWidth=36/RowHeight=32）；grid place-items 居中
            cell.style.cssText = 'display:grid;place-items:center;overflow:hidden;cursor:pointer;'
                + 'width:36px;height:32px;';
            cell.addEventListener('mouseenter', () => this._showItemDesc(it));
            cell.addEventListener('mouseleave', () => this._hideItemDesc());
            this._libUrl('items', it.looks).then((url) => {
                if (url) {
                    const im = document.createElement('img');
                    im.src = url; im.draggable = false;
                    im.style.cssText = 'max-width:34px;max-height:30px;';
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

    // 金币千分位格式化（原版 GetGoldStr：每 3 位逗号）
    _formatGold(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // 物品描述（对齐原版 GetMouseItemInfo 按 StdMode 分类）
    _itemDesc(it) {
        const std = it.stdMode || 0;
        let line1 = '', line2 = '', line3 = '';
        if (std === 0) {
            // 药品：+HP +MP 重量
            if (it.ac > 0) line1 += '+' + it.ac + 'HP ';
            if (it.mac > 0) line1 += '+' + it.mac + 'MP ';
            if (it.weight) line1 += '重量' + it.weight;
        } else if (std <= 4) {
            // 消耗品/技能书：重量（+ 书需要等级）
            if (it.weight) line1 += '重量' + it.weight;
            if (std === 4 && it.needLevel) line3 += '需要等级 ' + it.needLevel;
        } else if ([5, 6, 10, 11, 15, 19, 20, 21, 22, 23, 24, 26, 30, 52, 54].includes(std)) {
            // 装备：重量 + 持久 + 攻击/魔法/道术/防御/魔御 + 需要等级
            if (it.weight) line1 += '重量' + it.weight;
            if (it.durabilityMax > 0) {
                line1 += (line1 ? '  ' : '') + '持久 ' + Math.round(it.durability / 1000) + '/' + Math.round(it.durabilityMax / 1000);
            }
            if (it.dcMax) line2 += '攻击 ' + (it.dc || 0) + '-' + it.dcMax + ' ';
            if (it.mcMax) line2 += '魔法 ' + (it.mc || 0) + '-' + it.mcMax + ' ';
            if (it.scMax) line2 += '道术 ' + (it.sc || 0) + '-' + it.scMax + ' ';
            if (it.acMax) line2 += '防御 ' + (it.ac || 0) + '-' + it.acMax + ' ';
            if (it.macMax) line2 += '魔御 ' + (it.mac || 0) + '-' + it.macMax + ' ';
            if (it.needLevel) line3 += '需要等级 ' + it.needLevel;
        } else {
            // 其他（食物 std=40 等）：只显示重量
            if (it.weight) line1 += '重量' + it.weight;
        }
        return { name: it.name, line1, line2, line3 };
    }

    _showItemDesc(it) {
        if (!this.bagDescEl) return;
        const d = this._itemDesc(it);
        this.bagDescEl.innerHTML = '';
        const line1 = document.createElement('div');
        const nameSpan = document.createElement('span');
        nameSpan.style.color = '#ffff00';
        nameSpan.textContent = d.name + ' ';
        line1.appendChild(nameSpan);
        line1.appendChild(document.createTextNode(d.line1));
        this.bagDescEl.appendChild(line1);
        if (d.line2) { const l2 = document.createElement('div'); l2.textContent = d.line2; this.bagDescEl.appendChild(l2); }
        if (d.line3) { const l3 = document.createElement('div'); l3.textContent = d.line3; this.bagDescEl.appendChild(l3); }
    }

    _hideItemDesc() {
        if (this.bagDescEl) this.bagDescEl.innerHTML = '';
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
        this._makeWindowDraggable(dlg);
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
        this._makeWindowDraggable(panel);
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
        this._makeWindowDraggable(panel);
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
        // 按住持续朝当前方向移动（主循环按间隔节流，松开 _holding=false 即停）
        if (this._holding && this.self && this._mouseDir >= 0) {
            const stepDur = this._mouseRun ? RUN_INTERVAL : WALK_INTERVAL;
            if (now - this._lastMoveAt >= stepDur) {
                this.conn.send('move', { dir: this._mouseDir, run: this._mouseRun });
                this._lastMoveAt = now;
            }
        }
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
            // 攻击/受击动作播放完回站立（动作完成，解除 _isIdle 锁定，可进行下一次攻击）
            if ((e._action === 'attack' || e._action === 'struck')
                && (now - (e._actionAt || 0)) > ATTACK_ANIM_MS) {
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
        document.removeEventListener('keydown', this._keyDown);
        if (this._mdHandler) this._canvas.removeEventListener('mousedown', this._mdHandler);
        if (this._muHandler) document.removeEventListener('mouseup', this._muHandler);
        if (this._mmHandler) document.removeEventListener('mousemove', this._mmHandler);
        // 清理窗口拖动监听
        for (const fn of this._dragCleaners) fn();
        this._dragCleaners = [];
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
