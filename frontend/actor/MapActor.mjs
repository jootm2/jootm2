import { Images } from "../image/Images.mjs"
import { Maps } from "../map/Maps.mjs"
import * as PIXI from "../pixi.mjs"

// 每个地图块的像素尺寸（传奇斜视角矩形网格）
const TILE_W = 48
const TILE_H = 32

// 已经加载完成的地图（mapNo -> GameMap）
const cachedGameMaps = new Map

// 地图在游戏中的数据结构
class GameMap {
    constructor(width, height) {
        this.width = width
        this.height = height
        // 地图可站立标记（[x][y] = boolean）
        this.canStand = []
        // 大地砖纹理名（[x][y] = "tiles/123" 或 null）
        this.tilesTextureName = []
        // 小地砖纹理名（[x][y] = "smtiles/123" 或 null）
        this.smTilesTextureName = []
        // 对象层纹理名（[x][y] = "objects/123" 或 null）
        this.objsTextureName = []

        for (let w = 0; w < this.width; ++w) {
            this.canStand[w] = []
            this.tilesTextureName[w] = []
            this.smTilesTextureName[w] = []
            this.objsTextureName[w] = []
            for (let h = 0; h < this.height; ++h) {
                this.canStand[w][h] = false
                this.tilesTextureName[w][h] = null
                this.smTilesTextureName[w][h] = null
                this.objsTextureName[w][h] = null
            }
        }
    }
}

/**
 * 地图绘制类（相机跟随 + 绝对坐标 + 增量渲染）。
 *
 * 坐标约定：
 *  - 游戏坐标：地图块 (x, y)，x 向右、y 向下。
 *  - 像素坐标：块 (x, y) 左上角在 (x * TILE_W, y * TILE_H)。
 *  - 相机：整个 container 反向平移，使中心块始终落在画布中心。
 *
 * 实体层（spriteContainer）由外部传入并挂在本容器内，因此实体用
 * 绝对像素坐标绘制即可，卷动由相机统一完成。
 */
class MapActor {
    constructor(options, spriteContainer) {
        this.mapNo = null
        this.map = null

        this.container = new PIXI.Container()
        this.bngContainer = new PIXI.Container()   // 大地砖
        this.midContainer = new PIXI.Container()   // 小地砖
        this.objContainer = new PIXI.Container()   // 对象层（树、墙）
        this.spriteContainer = spriteContainer     // 实体层（玩家/NPC/怪物/掉落）
        this.container.addChild(this.bngContainer)
        this.container.addChild(this.midContainer)
        this.container.addChild(this.objContainer)
        this.container.addChild(this.spriteContainer)
        options.stage.addChild(this.container)

        this.width = options.width
        this.height = options.height

        // 相机中心（游戏坐标）
        this.centerX = 0
        this.centerY = 0

        // 当前已绘制的块范围（用于增量判断）
        this.drawnLeft = 0
        this.drawnTop = 0
        this.drawnRight = -1
        this.drawnBottom = -1
    }

    /**
     * 进入地图（幂等：相同 mapNo 直接返回）。
     */
    enter(mapNo) {
        if (mapNo != null && mapNo === this.mapNo) return this
        this.mapNo = mapNo
        this.map = null
        this.bngContainer.removeChildren()
        this.midContainer.removeChildren()
        this.objContainer.removeChildren()
        this.drawnLeft = 0
        this.drawnTop = 0
        this.drawnRight = -1
        this.drawnBottom = -1
        return this
    }

    /**
     * 设置相机中心（即当前玩家的游戏坐标）。
     */
    setCenter(roleX, roleY) {
        this.centerX = roleX
        this.centerY = roleY
        return this
    }

    /** 获取中心块左上角的像素坐标（供外部点击坐标换算使用）。 */
    centerPixel() {
        return { x: this.centerX * TILE_W, y: this.centerY * TILE_H }
    }

    update() {
        // 1. 加载地图（异步 .map 解析 + GameMap 构建，仅一次）
        if (this.map == null) {
            if (this.mapNo == null) return
            let m = cachedGameMaps.get(this.mapNo)
            if (!m) {
                const sm = Maps.get(this.mapNo)
                if (sm) {
                    m = this._buildGameMap(sm)
                    cachedGameMaps.set(this.mapNo, m)
                }
            }
            this.map = m
            if (this.map == null) {
                return
            }
        }

        // 2. 相机：中心块居中
        const px = this.centerX * TILE_W + TILE_W / 2
        const py = this.centerY * TILE_H + TILE_H / 2
        this.container.x = Math.round(this.width / 2 - px)
        this.container.y = Math.round(this.height / 2 - py)

        // 3. 可见范围（含少量冗余；上限取地图边界内最后一个块）
        //    注意：插值时 centerX/centerY 是浮点，绘制范围的块索引必须取整，
        //    否则浮点下标访问纹理数组会越界（相机偏移仍用浮点以保证平滑）。
        const cx = Math.floor(this.centerX)
        const cy = Math.floor(this.centerY)
        const halfW = Math.ceil(this.width / 2 / TILE_W) + 1
        const halfH = Math.ceil(this.height / 2 / TILE_H) + 1
        const left = Math.max(1, cx - halfW)
        const top = Math.max(1, cy - halfH)
        const right = Math.min(this.map.width - 1, cx + halfW)
        const bottom = Math.min(this.map.height - 1, cy + halfH)

        // 4. 增量：范围变化或尚有纹理未加载完成时重绘可见块
        if (this.drawnRight < 0
            || left !== this.drawnLeft || top !== this.drawnTop
            || right !== this.drawnRight || bottom !== this.drawnBottom) {
            const allLoaded = this._drawRange(left, top, right, bottom)
            if (allLoaded) {
                this.drawnLeft = left
                this.drawnTop = top
                this.drawnRight = right
                this.drawnBottom = bottom
            } else {
                // 有纹理仍在异步加载，保持 -1 让下一帧重试
                this.drawnRight = -1
            }
        }
    }

    _buildGameMap(sm) {
        const w = sm.getWidth()
        const h = sm.getHeight()
        const m = new GameMap(w, h)
        for (let x = 0; x < w; ++x) {
            for (let y = 0; y < h; ++y) {
                const mi = sm.getTiles()[x][y]
                m.canStand[x][y] = mi.isCanStand()
                if (mi.isHasBng()) {
                    let name = "tiles"
                    if (mi.getBngFileIdx() != 0) name += mi.getBngFileIdx()
                    m.tilesTextureName[x][y] = name + "/" + mi.getBngImgIdx()
                }
                if (mi.isHasMid()) {
                    let name = "smtiles"
                    if (mi.getMidFileIdx() != 0) name += mi.getMidFileIdx()
                    m.smTilesTextureName[x][y] = name + "/" + mi.getMidImgIdx()
                }
                if (!mi.isHasAni() && mi.isHasObj()) {
                    let name = "objects"
                    if (mi.getObjFileIdx() != 0) name += mi.getObjFileIdx()
                    m.objsTextureName[x][y] = name + "/" + mi.getObjImgIdx()
                }
            }
        }
        return m
    }

    /**
     * 重建可见范围内的地图块。
     *
     * 地砖层按可视范围绘制；对象层（树、建筑）锚点在底部且高度不定，
     * 很高的树其锚点块远在可视范围下方，因此对象层的绘制范围要
     * 向下多延伸若干行、左右各多留几列，否则树会出现「中间空洞」。
     *
     * @returns {boolean} 所有纹理是否都已就绪
     */
    _drawRange(left, top, right, bottom) {
        this.bngContainer.removeChildren()
        this.midContainer.removeChildren()
        this.objContainer.removeChildren()

        let allLoaded = true
        // 地砖层（大地砖 + 小地砖）
        for (let x = left; x <= right; ++x) {
            for (let y = top; y <= bottom; ++y) {
                const px = x * TILE_W
                const py = y * TILE_H
                const bng = this.map.tilesTextureName[x][y]
                if (bng != null && !this._addTile(this.bngContainer, bng, px, py)) allLoaded = false
                const mid = this.map.smTilesTextureName[x][y]
                if (mid != null && !this._addTile(this.midContainer, mid, px, py)) allLoaded = false
            }
        }

        // 对象层：向下延伸 16 行（512px，覆盖最高的树）、左右各 2 列
        const objLeft = Math.max(1, left - 2)
        const objRight = Math.min(this.map.width - 1, right + 2)
        const objBottom = Math.min(this.map.height - 1, bottom + 16)
        for (let x = objLeft; x <= objRight; ++x) {
            for (let y = top; y <= objBottom; ++y) {
                const obj = this.map.objsTextureName[x][y]
                if (obj != null && !this._addObj(obj, x, y)) allLoaded = false
            }
        }
        return allLoaded
    }

    /** @returns {boolean} 纹理是否已就绪（已就绪则加入容器） */
    _addTile(container, textureName, px, py) {
        const tex = globalThis.BaseTextureCache[textureName]
        if (tex) {
            const sp = new PIXI.Sprite(new PIXI.Texture(tex))
            sp.x = px
            sp.y = py
            container.addChild(sp)
            return true
        }
        const parts = textureName.split('/')
        Images.load(parts[0], parts[1])
        return false
    }

    /** @returns {boolean} 纹理是否已就绪（已就绪则加入容器） */
    _addObj(textureName, x, y) {
        const tex = globalThis.BaseTextureCache[textureName]
        if (tex) {
            const sp = new PIXI.Sprite(new PIXI.Texture(tex))
            sp.anchor.set(0, 1)          // 对象层以底部为锚点
            sp.x = x * TILE_W
            sp.y = (y + 1) * TILE_H
            this.objContainer.addChild(sp)
            return true
        }
        const parts = textureName.split('/')
        Images.load(parts[0], parts[1])
        return false
    }
}

export { MapActor }
