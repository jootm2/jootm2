// 游戏场景（对应旧 PlayScene）
// 真实等距地图 + 实体（暂用圆点，后续换 sprite）+ 键盘移动 + HUD + 聊天。

import { Scene } from './Scene.mjs';
import { MapActor } from '../map/MapActor.mjs';
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
        this.mapActor = new MapActor(SCREEN_WIDTH, MAPSURFACEHEIGHT);
        this.keys = new Set();
        this.moveTimer = null;
        this.chatLines = [];
        this._chatInput = null;
    }

    async onEnter() {
        const { map, player, nearby } = this.snapshot;
        this.self = player;
        this.entities.clear();
        this.entities.set(player.id, player);
        for (const e of nearby || []) this.entities.set(e.id, e);

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
            const d = this._currentDir();
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
                if (e) { e.x = msg.x; e.y = msg.y; e.dir = msg.dir; }
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
            case 'attack':
                this._log(`攻击 ${msg.targetId}，伤害 ${msg.damage}`);
                break;
            case 'death':
                this.entities.delete(msg.id);
                break;
            case 'chat':
                this._log(`${msg.name}: ${msg.text}`);
                break;
            case 'systemMessage':
                this._log(`[系统] ${msg.text}`);
                break;
            case 'changeMap': {
                // 换图快照：重建实体 + 切地图
                this.entities.clear();
                if (msg.player) { this.self = msg.player; this.entities.set(msg.player.id, msg.player); }
                for (const e of msg.nearby || []) this.entities.set(e.id, e);
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

        const entities = [];
        for (const e of this.entities.values()) {
            entities.push({
                x: e.x, y: e.y, name: e.name, isSelf: e.id === this.self.id,
                hp: e.hp, maxHp: e.maxHp, type: e.type, tex: null,
            });
        }
        this.mapActor.render(ctx, this.self.x, this.self.y, entities);
        this._renderEntities(ctx);
        this._renderHud();
    }

    // 实体圆点 + 血条（过渡；后续换 sprite）
    _renderEntities(ctx) {
        if (!this.self) return;
        const ox = Math.floor((SCREEN_WIDTH - 48) / 2);
        const oy = Math.floor((MAPSURFACEHEIGHT - 32) / 2);
        for (const e of this.entities.values()) {
            const sx = ox + (e.x - this.self.x) * 48;
            const sy = oy + (e.y - this.self.y) * 32;
            const isSelf = e.id === this.self.id;
            const isMonster = e.type === 'monster';
            // 身体圆点
            ctx.fillStyle = isSelf ? '#38bdf8' : (isMonster ? '#ef4444' : '#60a5fa');
            ctx.beginPath();
            ctx.arc(sx + 24, sy + 16, 15, 0, Math.PI * 2);
            ctx.fill();
            // 血条
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
        this.keys.clear();
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
    }
}
