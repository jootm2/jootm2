import * as PIXI from "../pixi.mjs"
import * as SDK from "../SDK.mjs"

// 8 方向移动映射（与服务器 Direction 一致）
const TILE = 40        // 每个格子像素
const VIEW = 7         // 以玩家为中心，上下左右可见的格子数
const GRID = VIEW * 2 + 1

const DIRMAP = {
    "0,-1": 0, "1,-1": 1, "1,0": 2, "1,1": 3,
    "0,1": 4, "-1,1": 5, "-1,0": 6, "-1,-1": 7
}

class PlayScene {
    constructor(options, manager) {
        this.pixi_parent = options.stage
        this.manager = manager
        this.view_width = options.width
        this.view_height = options.height

        this.self = null       // 自己的人物
        this.entities = {}     // id -> 实体快照
        this.map = null

        this.world_container = null
        this.grid = null
        this.entity_layer = null
        this.hud_text = null

        this.keys = new Set()
        this.move_timer = null
        this.key_down_handler = (e) => this._on_key_down(e)
        this.key_up_handler = (e) => this.keys.delete(e.code)
        this.chat_key_handler = (e) => this._on_chat_key(e)
        this.canvas_click_handler = (e) => this._on_canvas_click(e)

        this.chat_input = document.getElementById("game_chat_input")
        this.chat_log = document.getElementById("game_chat_log")
        this.chat_window = document.getElementById("game_chat_window")

        // 地面物品 / 背包 / NPC 对话 / 点击目标
        this.ground_items = {}
        this.bag = []
        this.gold = 0
        this.npc_dialog = null
        this.click_target = null

        this.canvas = document.getElementById("game_canvas")
        this.bag_panel = document.getElementById("game_bag_panel")
        this.bag_list = document.getElementById("game_bag_list")
        this.npc_dialog_el = document.getElementById("npc_dialog")
        this.npc_name = document.getElementById("npc_dialog_name")
        this.npc_text = document.getElementById("npc_dialog_text")
        this.npc_options = document.getElementById("npc_dialog_options")
    }

    // ---- 进入世界的快照 ----
    on_enter_game(msg) {
        this.map = msg.map || null
        this.self = msg.player || null
        this.entities = {}
        this.ground_items = {}
        this.npc_dialog = null
        this.click_target = null
        if (this.self) {
            this.entities[this.self.id] = this.self
            this.gold = this.self.gold || 0
            this._set_bag(this.self.items || [])
        }
        for (const e of (msg.nearby || [])) {
            this.entities[e.id] = e
        }
        for (const gi of (msg.groundItems || [])) {
            this.ground_items[gi.id] = gi
        }
        this._render_bag()
    }

    _set_bag(items) {
        // items 里带 slot 的是已装备，其余是背包
        this.bag = items.filter(it => it.slot === undefined)
    }

    // ---- 切换地图（服务器在玩家踩到地图门时推送） ----
    on_change_map(msg) {
        this.on_enter_game(msg)
    }

    on_server_msg(msg) {
        switch (msg.type) {
            case 'entityAdd': {
                if (msg.entity) this.entities[msg.entity.id] = msg.entity
                break
            }
            case 'entityRemove': {
                delete this.entities[msg.id]
                break
            }
            case 'move': {
                const e = this.entities[msg.id]
                if (e) {
                    e.x = msg.x
                    e.y = msg.y
                    e.dir = msg.dir
                }
                break
            }
            case 'stats': {
                const e = this.entities[msg.id]
                if (e) {
                    if (msg.hp !== undefined) e.hp = msg.hp
                    if (msg.maxHp !== undefined) e.maxHp = msg.maxHp
                    if (msg.mp !== undefined) e.mp = msg.mp
                    if (msg.maxMp !== undefined) e.maxMp = msg.maxMp
                    if (msg.level !== undefined) e.level = msg.level
                    if (msg.exp !== undefined) e.exp = msg.exp
                }
                break
            }
            case 'attack': {
                this._log("攻击 " + msg.targetId + "，伤害 " + msg.damage)
                break
            }
            case 'death': {
                delete this.entities[msg.id]
                break
            }
            case 'chat': {
                this._log(msg.name + ": " + msg.text)
                break
            }
            case 'systemMessage': {
                this._log("[系统] " + msg.text)
                break
            }
            case 'itemDrop': {
                this.ground_items[msg.id] = msg
                break
            }
            case 'itemRemove': {
                delete this.ground_items[msg.id]
                break
            }
            case 'bagUpdate': {
                this.gold = msg.gold || 0
                this._set_bag(msg.items || [])
                this._render_bag()
                break
            }
            case 'npcSay': {
                this._show_npc_dialog(msg)
                break
            }
            case 'npcClose': {
                this._close_npc_dialog()
                break
            }
            default:
                break
        }
    }
update() {
        this._render()
    }

    _render() {
        if (!this.entity_layer || !this.self) return
        this.entity_layer.removeChildren()

        const cx = this.self.x
        const cy = this.self.y
        for (const id in this.entities) {
            this._draw_entity(this.entities[id], cx, cy)
        }
        for (const id in this.ground_items) {
            this._draw_ground_item(this.ground_items[id], cx, cy)
        }
        this._render_hud()
    }

    _screen(e, cx, cy) {
        return {
            x: (e.x - cx + VIEW) * TILE + TILE / 2,
            y: (e.y - cy + VIEW) * TILE + TILE / 2
        }
    }

    _draw_entity(e, cx, cy) {
        const s = this._screen(e, cx, cy)
        if (s.x < -TILE || s.y < -TILE || s.x > GRID * TILE + TILE || s.y > GRID * TILE + TILE) {
            return
        }

        const is_self = this.self && e.id === this.self.id
        const is_monster = e.type === 'monster'
        const color = is_self ? 0x38bdf8 : (is_monster ? 0xef4444 : 0x60a5fa)

        const body = new PIXI.Graphics()
        body.beginFill(color)
        body.drawCircle(s.x, s.y, TILE * 0.4)
        body.endFill()
        this.entity_layer.addChild(body)

        // 血条
        const max_hp = e.maxHp || 1
        const hp = Math.max(0, e.hp != null ? e.hp : max_hp)
        const bw = TILE
        const bh = 3
        const bg = new PIXI.Graphics()
        bg.beginFill(0x000000)
        bg.drawRect(s.x - bw / 2, s.y - TILE * 0.6, bw, bh)
        bg.endFill()
        this.entity_layer.addChild(bg)

        const bar = new PIXI.Graphics()
        bar.beginFill(is_self ? 0x0ea5e9 : 0xef4444)
        bar.drawRect(s.x - bw / 2, s.y - TILE * 0.6, bw * (hp / max_hp), bh)
        bar.endFill()
        this.entity_layer.addChild(bar)

        const name = new PIXI.Text(e.name || ('#' + e.id), {
            fontFamily: 'monospace', fontSize: 10, fill: 0xffffff, align: 'center'
        })
        name.anchor.set(0.5, 0)
        name.x = s.x
        name.y = s.y + TILE * 0.45
        this.entity_layer.addChild(name)
    }

    _draw_ground_item(gi, cx, cy) {
        const s = this._screen(gi, cx, cy)
        if (s.x < -TILE || s.y < -TILE || s.x > GRID * TILE + TILE || s.y > GRID * TILE + TILE) {
            return
        }
        const is_gold = (gi.gold || 0) > 0
        const color = is_gold ? 0xfacc15 : 0xfbbf24
        const g = new PIXI.Graphics()
        g.beginFill(color)
        g.drawRect(s.x - TILE * 0.2, s.y - TILE * 0.2, TILE * 0.4, TILE * 0.4)
        g.endFill()
        this.entity_layer.addChild(g)

        const label = is_gold ? ('金币 ' + gi.gold) : (gi.name || '物品')
        const t = new PIXI.Text(label, { fontFamily: 'monospace', fontSize: 9, fill: 0xfde68a, align: 'center' })
        t.anchor.set(0.5, 0)
        t.x = s.x
        t.y = s.y + TILE * 0.18
        this.entity_layer.addChild(t)
    }

    _render_hud() {
        if (!this.hud_text) return
        if (!this.self) {
            this.hud_text.text = ''
            return
        }
        const p = this.self
        this.hud_text.text = p.name + '  Lv.' + p.level + '  HP ' + p.hp + '/' + p.maxHp + '  MP ' + p.mp + '/' + p.maxMp + '  金币 ' + this.gold + '  (' + p.x + ',' + p.y + ')'
    }

    _log(text) {
        if (!this.chat_log) return
        const line = document.createElement('div')
        line.textContent = text
        this.chat_log.appendChild(line)
        this.chat_log.scrollTop = this.chat_log.scrollHeight
        while (this.chat_log.children.length > 100) {
            this.chat_log.removeChild(this.chat_log.firstChild)
        }
    }

    // ---- 背包 ----
    _render_bag() {
        if (!this.bag_list) return
        this.bag_list.innerHTML = ''
        for (const it of this.bag) {
            const div = document.createElement('div')
            div.className = 'bag_item'
            div.textContent = it.name || ('#' + it.index)
            div.title = '点击使用/装备'
            div.onclick = () => this.manager.send_use_item(it.makeIndex)
            this.bag_list.appendChild(div)
        }
    }

    _toggle_bag() {
        if (!this.bag_panel) return
        const visible = this.bag_panel.style.visibility !== 'visible'
        this.bag_panel.style.visibility = visible ? 'visible' : 'hidden'
        if (visible) this._render_bag()
    }

    // ---- NPC 对话框 ----
    _show_npc_dialog(msg) {
        this.npc_dialog = msg
        if (this.npc_name) this.npc_name.textContent = msg.name || 'NPC'
        if (this.npc_text) this.npc_text.innerHTML = (msg.text || '').replace(/\n/g, '<br>')
        if (this.npc_options) {
            this.npc_options.innerHTML = ''
            for (const opt of (msg.options || [])) {
                const btn = document.createElement('button')
                btn.className = 'npc_option'
                btn.textContent = opt.label
                btn.onclick = () => this.manager.send_npc_select(msg.npcId, opt.value)
                this.npc_options.appendChild(btn)
            }
        }
        const goods = document.getElementById('npc_shop_goods')
        if (goods) {
            goods.innerHTML = ''
            goods.style.visibility = 'hidden'
            if (msg.shop === 'buy') {
                for (const g of (msg.goods || [])) {
                    const div = document.createElement('div')
                    div.className = 'shop_item'
                    div.textContent = g.name + ' ' + g.price + '金'
                    div.onclick = () => this.manager.send_json({ type: 'buyItem', npcId: msg.npcId, index: g.index, count: 1 })
                    goods.appendChild(div)
                }
                goods.style.visibility = 'visible'
            }
        }
        if (this.npc_dialog_el) this.npc_dialog_el.style.visibility = 'visible'
    }

    _close_npc_dialog() {
        this.npc_dialog = null
        if (this.npc_dialog_el) this.npc_dialog_el.style.visibility = 'hidden'
        const goods = document.getElementById('npc_shop_goods')
        if (goods) goods.style.visibility = 'hidden'
    }

    // ---- 点击交互 ----
    _on_canvas_click(e) {
        if (!this.self) return
        const rect = this.canvas.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        const cx = this.self.x
        const cy = this.self.y
        const wx = cx - VIEW + Math.floor(px / TILE)
        const wy = cy - VIEW + Math.floor(py / TILE)
        for (const id in this.ground_items) {
            const gi = this.ground_items[id]
            if (gi.x === wx && gi.y === wy) {
                this.click_target = { type: 'item', id: gi.id, x: wx, y: wy }
                return
            }
        }
        for (const id in this.entities) {
            const e = this.entities[id]
            if (e.id === this.self.id) continue
            if (e.x === wx && e.y === wy) {
                this.click_target = { type: e.type, id: e.id, x: wx, y: wy }
                return
            }
        }
        this.click_target = { type: 'tile', x: wx, y: wy }
    }

    _process_click_target() {
        if (!this.click_target || !this.self) return
        const t = this.click_target
        const dist = Math.max(Math.abs(this.self.x - t.x), Math.abs(this.self.y - t.y))
        if (t.type === 'item') {
            if (dist <= 1) {
                this.manager.send_pickup(t.id)
                this.click_target = null
            } else {
                this._move_towards(t.x, t.y)
            }
        } else if (t.type === 'npc') {
            if (dist <= 3) {
                this.manager.send_npc_talk(t.id)
                this.click_target = null
            } else {
                this._move_towards(t.x, t.y)
            }
        } else if (t.type === 'monster') {
            if (dist <= 1) {
                this.manager.send_attack(t.id)
            } else {
                this._move_towards(t.x, t.y)
            }
        } else {
            if (dist <= 0) this.click_target = null
            else this._move_towards(t.x, t.y)
        }
    }

    _move_towards(x, y) {
        const dx = x > this.self.x ? 1 : (x < this.self.x ? -1 : 0)
        const dy = y > this.self.y ? 1 : (y < this.self.y ? -1 : 0)
        const d = DIRMAP[dx + ',' + dy]
        if (d !== undefined) this.manager.send_move(d)
    }

_on_key_down(e) {
        if (e.target === this.chat_input) return

        // Alt + Q 退出
        if (e.altKey && (e.key === 'q' || e.code === 'KeyQ')) {
            e.preventDefault()
            this.manager.dlg_message('你真的要退出游戏吗?', [SDK.DlgButtons.mbOk, SDK.DlgButtons.mbCancel], (mb) => {
                if (mb == SDK.DlgButtons.mbOk) {
                    this.manager.send_logout()
                    this.manager.change_scene(0)
                }
            })
            return
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault()
        }
        // 手动移动时取消点击目标
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
            this.click_target = null
        }
        this.keys.add(e.code)
        if (e.code === 'Space') {
            this._attack_nearest()
        }
        if (e.code === 'KeyB') {
            this._toggle_bag()
        }
    }

    _on_chat_key(e) {
        if (e.key !== 'Enter') return
        const text = (this.chat_input.value || '').trim()
        if (text) {
            this.manager.send_say(text)
        }
        this.chat_input.value = ''
    }

    _current_dir() {
        const up = this.keys.has('ArrowUp') || this.keys.has('KeyW')
        const dn = this.keys.has('ArrowDown') || this.keys.has('KeyS')
        const lf = this.keys.has('ArrowLeft') || this.keys.has('KeyA')
        const rt = this.keys.has('ArrowRight') || this.keys.has('KeyD')
        const dx = (rt ? 1 : 0) - (lf ? 1 : 0)
        const dy = (dn ? 1 : 0) - (up ? 1 : 0)
        return (dx === 0 && dy === 0) ? -1 : DIRMAP[dx + ',' + dy]
    }

    _start_move_loop() {
        if (this.move_timer) return
        this.move_timer = setInterval(() => {
            if (!this.self) return
            if (this.click_target) {
                this._process_click_target()
            } else {
                const d = this._current_dir()
                if (d >= 0) {
                    this.manager.send_move(d)
                }
            }
        }, 120)
    }

    _attack_nearest() {
        if (!this.self) return
        let best = null
        let best_dist = 2
        for (const id in this.entities) {
            const e = this.entities[id]
            if (e.type !== 'monster') continue
            const dist = Math.max(Math.abs(e.x - this.self.x), Math.abs(e.y - this.self.y))
            if (dist <= 1 && dist < best_dist) {
                best_dist = dist
                best = e
            }
        }
        if (best) this.manager.send_attack(best.id)
    }

    _build_scene() {
        this.pixi_parent.removeChildren()

        this.world_container = new PIXI.Container()
        this.grid = new PIXI.Graphics()
        this.entity_layer = new PIXI.Container()
        this.hud_text = new PIXI.Text('', { fontFamily: 'monospace', fontSize: 14, fill: 0xffffff })

        this.world_container.x = this.view_width / 2 - VIEW * TILE
        this.world_container.y = this.view_height / 2 - VIEW * TILE

        this.world_container.addChild(this.grid)
        this.world_container.addChild(this.entity_layer)

        this.hud_text.x = 12
        this.hud_text.y = 8

        this.pixi_parent.addChild(this.world_container)
        this.pixi_parent.addChild(this.hud_text)

        this.grid.lineStyle(1, 0x333333, 0.5)
        const size = GRID * TILE
        for (let i = 0; i <= GRID; ++i) {
            this.grid.moveTo(i * TILE, 0)
            this.grid.lineTo(i * TILE, size)
            this.grid.moveTo(0, i * TILE)
            this.grid.lineTo(size, i * TILE)
        }
    }

    enter_scene() {
        this._build_scene()
        if (this.chat_window) this.chat_window.style.visibility = 'visible'
        if (this.chat_input) this.chat_input.addEventListener('keydown', this.chat_key_handler)
        if (this.canvas) this.canvas.addEventListener('click', this.canvas_click_handler)
        if (this.bag_panel) this.bag_panel.style.visibility = 'hidden'
        if (this.npc_dialog_el) this.npc_dialog_el.style.visibility = 'hidden'
        document.addEventListener('keydown', this.key_down_handler)
        document.addEventListener('keyup', this.key_up_handler)
        this._start_move_loop()
    }

    leave_scene() {
        if (this.move_timer) {
            clearInterval(this.move_timer)
            this.move_timer = null
        }
        document.removeEventListener('keydown', this.key_down_handler)
        document.removeEventListener('keyup', this.key_up_handler)
        if (this.chat_input) this.chat_input.removeEventListener('keydown', this.chat_key_handler)
        if (this.canvas) this.canvas.removeEventListener('click', this.canvas_click_handler)
        if (this.chat_window) this.chat_window.style.visibility = 'hidden'
        if (this.bag_panel) this.bag_panel.style.visibility = 'hidden'
        if (this.npc_dialog_el) this.npc_dialog_el.style.visibility = 'hidden'
        this.keys.clear()
        this.click_target = null
        this.self = null
        this.entities = {}
        this.ground_items = {}
        this.pixi_parent.removeChildren()
    }
}

export { PlayScene }