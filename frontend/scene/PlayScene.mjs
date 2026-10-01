// 游戏场景（对应旧 PlayScene）
// 真实等距地图 + 实体（暂用圆点，后续换 sprite）+ 键盘移动 + HUD + 聊天。

import { Scene } from './Scene.mjs';
import { MapActor } from '../map/MapActor.mjs';
import { ActorSprite } from '../actor/ActorSprite.mjs';
import { findPath } from '../map/pathfind.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT, MAPSURFACEHEIGHT } from '../core/config.mjs';

// 8 方向映射（与服务器 Direction 一致）
const DIRMAP = {
    '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3,
    '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7,
};

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
        this.path = [];              // 寻路方向队列（覆盖键盘移动）
        this._onArrive = null;       // 到达回调
        this.groundItems = new Map();// id -> 地面物品
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
    }

    _startMoveLoop() {
        if (this.moveTimer) return;
        this.moveTimer = setInterval(() => {
            if (!this.self) return;
            let d = -1;
            if (this.path.length) {
                d = this.path.shift();
                if (!this.path.length && this._onArrive) {
                    const cb = this._onArrive;
                    this._onArrive = null;
                    cb();
                }
            } else {
                d = this._currentDir();
            }
            if (d >= 0) this.conn.send('move', { dir: d });
        }, 120);
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
        if (e.button !== 0) return;   // 仅左键
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        const tx = Math.round((mx - ox) / 48 + this.self.x);
        const ty = Math.round((my - oy) / 32 + this.self.y);

        const monster = this._actorAt(tx, ty, 'monster');
        if (monster && monster.hp > 0) {
            this._walkAdjacent(tx, ty, () => this.conn.send('attack', { targetId: monster.id }));
            return;
        }
        const npc = this._actorAt(tx, ty, 'npc');
        if (npc) {
            this._walkAdjacent(tx, ty, () => this.conn.send('npcTalk', { npcId: npc.id }));
            return;
        }
        const gi = this._groundAt(tx, ty);
        if (gi) {
            this._walkAdjacent(tx, ty, () => this.conn.send('pickup', { itemId: gi.id }));
            return;
        }
        // 空地：寻路走过去
        this._walkTo(tx, ty, null);
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

    // 走到目标相邻格后执行动作（距离 <=1 直接执行）
    _walkAdjacent(tx, ty, cb) {
        const dist = Math.max(Math.abs(tx - this.self.x), Math.abs(ty - this.self.y));
        if (dist <= 1) { cb(); return; }
        const map = this.mapActor.map;
        let bx = -1, by = -1, bd = Infinity;
        for (let ddx = -1; ddx <= 1; ddx++) {
            for (let ddy = -1; ddy <= 1; ddy++) {
                if (ddx === 0 && ddy === 0) continue;
                const nx = tx + ddx, ny = ty + ddy;
                if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
                if (!map.tiles[nx][ny].canStand) continue;
                const dd = Math.max(Math.abs(nx - this.self.x), Math.abs(ny - this.self.y));
                if (dd < bd) { bd = dd; bx = nx; by = ny; }
            }
        }
        if (bx >= 0) this._walkTo(bx, by, cb);
    }

    _walkTo(tx, ty, cb) {
        const map = this.mapActor.map;
        const path = findPath(map, this.self.x, this.self.y, tx, ty);
        if (path && path.length) {
            this.path = path;
            this._onArrive = cb || null;
        } else if (path && cb) {
            cb();   // 已在目标格
        }
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
            case 'changeMap': {
                // 换图快照：重建实体 + 地面物品 + 切地图
                this.entities.clear();
                this.groundItems.clear();
                this.path = [];
                this._onArrive = null;
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

    update() {}

    render(ctx) {
        if (!this.self) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        const now = Date.now();
        const entities = [];
        for (const e of this.entities.values()) {
            const sp = this._sprite(e);
            entities.push({
                x: e.x, y: e.y, name: e.name, isSelf: e.id === this.self.id,
                hp: e.hp, maxHp: e.maxHp, type: e.type,
                layers: sp.getLayers(now),
            });
        }
        this.mapActor.render(ctx, this.self.x, this.self.y, entities);
        this._renderGroundItems(ctx);
        this._renderHpBars(ctx);
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

    // 地面物品（金币金色圆点，物品绿块 + 名字）
    _renderGroundItems(ctx) {
        if (!this.self) return;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        for (const g of this.groundItems.values()) {
            const sx = ox + (g.x - this.self.x) * 48;
            const sy = oy + (g.y - this.self.y) * 32;
            if (g.gold > 0) {
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(sx + 24, sy + 18, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = '#4ade80';
                ctx.fillRect(sx + 19, sy + 13, 10, 10);
            }
            if (g.name) {
                ctx.font = '11px SimSun,serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(g.name, sx + 24, sy + 6);
            }
        }
    }

    // 血条（身体由 MapActor 画 sprite）
    _renderHpBars(ctx) {
        if (!this.self) return;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        for (const e of this.entities.values()) {
            const sx = ox + (e.x - this.self.x) * 48;
            const sy = oy + (e.y - this.self.y) * 32;
            const isSelf = e.id === this.self.id;
            const maxHp = e.maxHp || 1;
            const hp = Math.max(0, e.hp != null ? e.hp : maxHp);
            ctx.fillStyle = '#000';
            ctx.fillRect(sx + 4, sy - 4, 40, 4);
            ctx.fillStyle = isSelf ? '#0ea5e9' : '#ef4444';
            ctx.fillRect(sx + 4, sy - 4, 40 * hp / maxHp, 4);
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
        this.keys.clear();
        this.path = [];
        this._onArrive = null;
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
    }
}
