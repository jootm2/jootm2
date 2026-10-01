// 实体精灵：根据实体快照 + 动作状态（_action/_actionAt）计算当前帧图索引，并懒加载纹理。
// 对应 Delphi 客户端 TActor/THumActor 的帧计算（Actor.pas）。
// 渲染层按绘制顺序返回（武器→身体→头发，后者覆盖前者）。

import { getLib } from '../image/Images.mjs';
import * as A from './actorData.mjs';

// 动作名 → 动作表段名（玩家用 HA，怪物/NPC 用 MA）
const PLAYER_SEG = { stand: 'stand', walk: 'walk', attack: 'hit', struck: 'struck', die: 'die' };
const MON_SEG = { stand: 'stand', walk: 'walk', attack: 'attack', struck: 'struck', die: 'die' };

export class ActorSprite {
    constructor(entity) {
        this.entity = entity;
        // 站立帧动画相位（各实体错开，避免同帧同步）
        this._phase = ((entity.id || 0) % 1000) * 37;
        this._tex = new Map();      // 'lib/index' -> {canvas,px,py} 或 null
        this._loading = new Set();  // 已触发加载的 key（防重复）
    }

    /** 返回当前帧的绘制层 [{canvas,px,py}]；未加载返回 null。 */
    getLayers(now) {
        const spec = this._frameSpec(now);
        if (!spec) return null;
        const out = [];
        for (const f of spec) {
            const tex = this._texture(f.lib, f.index);
            if (tex) out.push({ canvas: tex.canvas, px: tex.px, py: tex.py });
        }
        return out.length ? out : null;
    }

    // 计算当前帧（各层 {lib,index}），按绘制顺序
    _frameSpec(now) {
        const e = this.entity;
        const dir = e.dir || 0;
        const action = e._action || 'stand';
        const at = e._actionAt || 0;

        let segs, segKey;
        if (e.type === 'player') {
            segs = A.HA;
            segKey = PLAYER_SEG[action] || 'stand';
        } else if (e.type === 'npc') {
            segs = A.npcAction(e.appr);
            segKey = MON_SEG[action] || 'stand';
        } else {
            segs = A.raceByPM(e.raceImg);
            segKey = MON_SEG[action] || 'stand';
        }
        if (!segs) return null;

        // walk/attack/struck 播放完成后回 stand
        if (action === 'walk' || action === 'attack' || action === 'struck') {
            const seg = segs[segKey] || segs.stand;
            const af = A.actionFrames(0, seg, dir);
            if (af.ftime > 0 && (now - at) > af.count * af.ftime) {
                segKey = 'stand';
            }
        }

        const seg = segs[segKey] || segs.stand;
        const af = A.actionFrames(0, seg, dir);   // offset 统一为 0，怪物/NPC 之后再加外观 offset

        // 相对帧（0..count-1）
        let rel;
        if (action === 'die') {
            rel = af.ftime > 0 ? Math.min(Math.floor((now - at) / af.ftime), af.count - 1) : 0;
        } else if (segKey === 'stand') {
            rel = af.ftime > 0 ? Math.floor((now + this._phase) / af.ftime) % af.count : 0;
        } else {
            rel = af.ftime > 0 ? Math.floor((now - at) / af.ftime) % af.count : 0;
        }
        const cf = af.start + rel;   // 相对帧号（已含方向偏移）

        // 玩家分层：武器→身体→头发（各库 600 帧/外观）
        // dress/weapon 由服务端按 Delphi GetRelFeature 算好（shape*2+sex；无装备 = sex）
        if (e.type === 'player') {
            const dress = e.dress != null ? e.dress : e.sex;
            const weapon = e.weapon != null ? e.weapon : 0;
            const layers = [];
            if (weapon >= 2) {
                layers.push({ lib: 'weapon', index: A.HUMANFRAME * weapon + cf });
            }
            layers.push({ lib: 'hum', index: A.HUMANFRAME * dress + cf });
            if ((e.hair || 0) >= 1) {
                layers.push({ lib: 'hair', index: A.HUMANFRAME * (e.hair * 2 + e.sex) + cf });
            }
            return layers;
        }

        // 怪物/NPC：单层，外观 offset + cf
        const offset = e.type === 'npc' ? A.getNpcOffset(e.appr) : A.getMonOffset(e.appr);
        const lib = e.type === 'npc' ? 'npc' : A.getMonImgLib(e.appr);
        return [{ lib, index: offset + cf }];
    }

    // 取纹理（同步返回已加载，未加载触发异步并返回 null）
    _texture(lib, index) {
        const key = lib + '/' + index;
        if (this._tex.has(key)) return this._tex.get(key);
        const wlib = getLib(lib);
        if (wlib && !this._loading.has(key)) {
            this._loading.add(key);
            wlib.getTexture(index).then(tex => {
                this._tex.set(key, tex || null);
            }).catch(() => {
                this._tex.set(key, null);
            });
        }
        this._tex.set(key, null);   // 占位，加载完成后覆盖
        return null;
    }
}
