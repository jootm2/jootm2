import { LoginScene } from "./LoginScene.mjs"
import { NewAccountScene } from "./NewAccount.mjs"
import { GB2312Encoder } from "../GB2312Encoder.mjs"
import { EDcode } from "../EDcode.mjs"
import * as SDK from "../SDK.mjs"
import { Images } from "../image/Images.mjs"
import * as PIXI from "../pixi.mjs"
import { ChgpwdScene } from "./ChgpwdScene.mjs"
import { ChrselScene } from "./ChrselScene.mjs"
import { PlayScene } from "./PlayScene.mjs"

class SceneManager {
    constructor(options) {
        delete PIXI.Renderer.__plugins["accessibility"]
        // 绘制地图、人物、怪物、NPC、掉落物品、技能特效等
        this.game_app = new PIXI.Application({ background: '#000', width: options.width
            , height: options.height, view: document.getElementById("game_canvas") })
        // 绘制模态对话框（公告、确定取消、输入框）等
        this.dlg_app = new PIXI.Application({ backgroundAlpha: 0, width: options.width
            , height: options.height, view: document.getElementById("frm_dlg_canvas") })
        const scene_optios = {
            stage: this.game_app.stage
            , width: options.width
            , height: options.height
        }
        this.login_scene = new LoginScene(scene_optios, this)
        this.new_account_scene = new NewAccountScene(scene_optios, this)
        this.chg_pwd_scene = new ChgpwdScene(scene_optios, this)
        scene_optios.server_title = options.server_titile
        this.chrsel_scene = new ChrselScene(scene_optios, this)
        this.play_scene = new PlayScene(scene_optios, this)
        this.scene = 0 // 0:登录 1:新用户 2:修改密码 3:选择角色 4:游戏（含健康公告）
        this.server_base_url = options.server_base_url
        this.ws = null
        this.send_idx = 1
        this.edcode = new EDcode(10000)
        this.gb2312_encoder = new GB2312Encoder
        this.gb2312_decoder = new TextDecoder("gbk")
        this.utf8_encoder = new TextEncoder
        this.view_width = options.width // 视区宽度
        this.view_height = options.height // 视区高度
        this.server_name = options.server_name
        this.login_id = null
        this.certification = null
        this.runport = 0
        this.gameport = 0
        this.chr_name = null
        this.recv_buf = '' // 进入游戏网关后可能一次接收多个数据包，要做拆包处理
        // begine 对话框相关
        this.need_loading = new Array // 需要加载的图片
        this.frm_dlg_pixi_parent = this.dlg_app.stage
        this.dom_frm_dlg = document.getElementById("frm_dlg")
        this.dom_frm_dlg_window = document.getElementById("frm_dlg_window")
        this.dom_frm_dlg_label = document.getElementById("frm_dlg_label")
        this.dom_frm_dlg_input = document.getElementById("frm_dlg_input")
        this.dom_frm_dlg_ok = document.getElementById("frm_dlg_ok")
        this.dom_frm_dlg_cancel = document.getElementById("frm_dlg_cancel")
        this.need_loading.push(["prguse", 360]) // 背景
        this.need_loading.push(["prguse", 380]) // 背景（健康公告）
        this.need_loading.push(["prguse", 361]) // mbOk
        this.need_loading.push(["prguse", 362])
        this.need_loading.push(["prguse", 363]) // mbYes
        this.need_loading.push(["prguse", 364])
        this.need_loading.push(["prguse", 365]) // mbCancel
        this.need_loading.push(["prguse", 366])
        this.need_loading.push(["prguse", 367]) // mbNo
        this.need_loading.push(["prguse", 368])
        this.sp_frm_dlg_bg = null
        this.sp_frm_dlg_ok = null
        this.sp_frm_dlg_cancel = null
        this.sp_frm_dlg_cancel_down = null
        // end 对话框相关
    }

    // begin 对话框
    _close_dlg() {
        this.frm_dlg_pixi_parent.removeChildren()
        this.dom_frm_dlg.style.visibility = "hidden"
        this.dom_frm_dlg_label.style.visibility = "hidden"
        this.dom_frm_dlg_input.style.visibility = "hidden"
        this.dom_frm_dlg_ok.style.visibility = "hidden"
        this.dom_frm_dlg_cancel.style.visibility = "hidden"
    }
    dlg_message(text, btns, callback) {
        this._close_dlg()

        this.dom_frm_dlg.style.visibility = "visible"
        // 展示背景图
        this.sp_frm_dlg_bg = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache['prguse/360']))
        this.sp_frm_dlg_bg.x = (this.view_width - this.sp_frm_dlg_bg.width) / 2
        this.sp_frm_dlg_bg.y = (this.view_height - this.sp_frm_dlg_bg.height) / 2
        this.dom_frm_dlg_window.style.left = `${this.sp_frm_dlg_bg.x}px`
        this.dom_frm_dlg_window.style.top = `${this.sp_frm_dlg_bg.y}px`
        this.dom_frm_dlg_window.style.width = `${this.sp_frm_dlg_bg.width}px`
        this.dom_frm_dlg_window.style.height = `${this.sp_frm_dlg_bg.height}px`
        this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_bg)
        
        // 按钮的坐标
        let mb_left = 324
        let mb_top = 126
        // 提示文本的坐标
        const msgx = 39
        const msgy = 38

        if (text) {
            this.dom_frm_dlg_label.innerHTML = SDK.transtring(text)
            this.dom_frm_dlg_label.style.visibility = "visible"
            this.dom_frm_dlg_label.style.left = `${msgx}px`
            this.dom_frm_dlg_label.style.top = `${msgy}px`
        }

        if (!!btns) {
            if (btns.includes(SDK.DlgButtons.mbCancel) || btns.includes(SDK.DlgButtons.mbNo)) {
                const img_id = btns.includes(SDK.DlgButtons.mbCancel) ? 365 : 367
                this.sp_frm_dlg_cancel = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache[`prguse/${img_id}`]))
                const bt_frm_dlg_cancel_down = globalThis.BaseTextureCache[`prguse/${img_id+1}`]
                this.sp_frm_dlg_cancel.x = this.sp_frm_dlg_bg.x + mb_left
                this.sp_frm_dlg_cancel.y = this.sp_frm_dlg_bg.y + mb_top
                this.dom_frm_dlg_cancel.style.left = `${mb_left}px`
                this.dom_frm_dlg_cancel.style.top = `${mb_top}px`
                this.dom_frm_dlg_cancel.style.width = `${bt_frm_dlg_cancel_down.width}px`
                this.dom_frm_dlg_cancel.style.height = `${bt_frm_dlg_cancel_down.height}px`
                this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_cancel)
                this.dom_frm_dlg_cancel.style.visibility = "visible"
                this.dom_frm_dlg_cancel.onmousedown = (event) => {
                    if (!!!this.sp_frm_dlg_cancel_down) {
                        this.sp_frm_dlg_cancel_down = new PIXI.Sprite(new PIXI.Texture(bt_frm_dlg_cancel_down))
                        this.sp_frm_dlg_cancel_down.x = this.sp_frm_dlg_cancel.x
                        this.sp_frm_dlg_cancel_down.y = this.sp_frm_dlg_cancel.y
                    }
                    this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_cancel_down)
                }
                this.dom_frm_dlg_cancel.onmouseleave = (event) => {
                    this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_cancel_down)
                }
                this.dom_frm_dlg_cancel.onmouseup = (event) => {
                    this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_cancel_down)
                    this.sp_frm_dlg_cancel_down = null
                    this._close_dlg()
                    if (!!callback) {
                        callback(btns.includes(SDK.DlgButtons.mbCancel) ? SDK.DlgButtons.mbCancel : SDK.DlgButtons.mbNo)
                    }
                }
                mb_left -= 110
            }
        } else {
            btns = [SDK.DlgButtons.mbOk]
        }

        if (btns.includes(SDK.DlgButtons.mbOk) || btns.includes(SDK.DlgButtons.mbYes)) {
            const img_id = btns.includes(SDK.DlgButtons.mbOk) ? 361 : 363
            this.sp_frm_dlg_ok = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache[`prguse/${img_id}`]))
            const bt_frm_dlg_cancel_down = globalThis.BaseTextureCache[`prguse/${img_id+1}`]
            this.sp_frm_dlg_ok.x = this.sp_frm_dlg_bg.x + mb_left
            this.sp_frm_dlg_ok.y = this.sp_frm_dlg_bg.y + mb_top
            this.dom_frm_dlg_ok.style.left = `${mb_left}px`
            this.dom_frm_dlg_ok.style.top = `${mb_top}px`
            this.dom_frm_dlg_ok.style.width = `${bt_frm_dlg_cancel_down.width}px`
            this.dom_frm_dlg_ok.style.height = `${bt_frm_dlg_cancel_down.height}px`
            this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_ok)
            this.dom_frm_dlg_ok.style.visibility = "visible"
            this.dom_frm_dlg_ok.onmousedown = (event) => {
                if (!!!this.sp_frm_dlg_ok_down) {
                    this.sp_frm_dlg_ok_down = new PIXI.Sprite(new PIXI.Texture(bt_frm_dlg_cancel_down))
                    this.sp_frm_dlg_ok_down.x = this.sp_frm_dlg_ok.x
                    this.sp_frm_dlg_ok_down.y = this.sp_frm_dlg_ok.y
                }
                this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_ok_down)
            }
            this.dom_frm_dlg_ok.onmouseleave = (event) => {
                this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_ok_down)
            }
            this.dom_frm_dlg_ok.onmouseup = (event) => {
                this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_ok_down)
                this.sp_frm_dlg_ok_down = null
                this._close_dlg()
                if (!!callback) {
                    callback(btns.includes(SDK.DlgButtons.mbOk) ? SDK.DlgButtons.mbOk : SDK.DlgButtons.mbYes)
                }
            }
        }
    }

    dlg_notice(text, callback) {
        this._close_dlg()

        this.dom_frm_dlg.style.visibility = "visible"
        // 展示背景图
        this.sp_frm_dlg_bg = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache['prguse/380']))
        this.sp_frm_dlg_bg.x = (this.view_width - this.sp_frm_dlg_bg.width) / 2
        this.sp_frm_dlg_bg.y = (this.view_height - this.sp_frm_dlg_bg.height) / 2
        this.dom_frm_dlg_window.style.left = `${this.sp_frm_dlg_bg.x}px`
        this.dom_frm_dlg_window.style.top = `${this.sp_frm_dlg_bg.y}px`
        this.dom_frm_dlg_window.style.width = `${this.sp_frm_dlg_bg.width}px`
        this.dom_frm_dlg_window.style.height = `${this.sp_frm_dlg_bg.height}px`
        this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_bg)
        
        // 按钮的坐标
        let mb_left = 90
        let mb_top = 305
        // 提示文本的坐标
        const msgx = 23
        const msgy = 20

        if (text) {
            this.dom_frm_dlg_label.innerHTML = SDK.transtring(text)
            this.dom_frm_dlg_label.style.visibility = "visible"
            this.dom_frm_dlg_label.style.left = `${msgx}px`
            this.dom_frm_dlg_label.style.top = `${msgy}px`
        }

        {
            const img_id = 361
            this.sp_frm_dlg_ok = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache[`prguse/${img_id}`]))
            const bt_frm_dlg_cancel_down = globalThis.BaseTextureCache[`prguse/${img_id+1}`]
            this.sp_frm_dlg_ok.x = this.sp_frm_dlg_bg.x + mb_left
            this.sp_frm_dlg_ok.y = this.sp_frm_dlg_bg.y + mb_top
            this.dom_frm_dlg_ok.style.left = `${mb_left}px`
            this.dom_frm_dlg_ok.style.top = `${mb_top}px`
            this.dom_frm_dlg_ok.style.width = `${bt_frm_dlg_cancel_down.width}px`
            this.dom_frm_dlg_ok.style.height = `${bt_frm_dlg_cancel_down.height}px`
            this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_ok)
            this.dom_frm_dlg_ok.style.visibility = "visible"
            this.dom_frm_dlg_ok.onmousedown = (event) => {
                if (!!!this.sp_frm_dlg_ok_down) {
                    this.sp_frm_dlg_ok_down = new PIXI.Sprite(new PIXI.Texture(bt_frm_dlg_cancel_down))
                    this.sp_frm_dlg_ok_down.x = this.sp_frm_dlg_ok.x
                    this.sp_frm_dlg_ok_down.y = this.sp_frm_dlg_ok.y
                }
                this.frm_dlg_pixi_parent.addChild(this.sp_frm_dlg_ok_down)
            }
            this.dom_frm_dlg_ok.onmouseleave = (event) => {
                this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_ok_down)
            }
            this.dom_frm_dlg_ok.onmouseup = (event) => {
                this.frm_dlg_pixi_parent.removeChild(this.sp_frm_dlg_ok_down)
                this.sp_frm_dlg_ok_down = null
                this._close_dlg()
                if (!!callback) {
                    callback()
                }
            }
        }
    }

    dlg_input(text, callback) {

    }
    // end 对话框

    update() {
        do {
            if (this.need_loading.length < 1) break
            let load_done = true
            for (const [key, value] of this.need_loading) {
                const tex = globalThis.BaseTextureCache[`${key}/${value}`]
                if (!tex) {
                    Images.load(key, value)
                    load_done = false
                    break
                }
            }
            if (!load_done) break
            this.need_loading = new Array
        } while (false)
        if(this.scene == 0) {
            this.login_scene.update()
        } else if (this.scene == 1) {
            this.new_account_scene.update()
        } else if (this.scene == 2) {
            this.chg_pwd_scene.update()
        } else if (this.scene == 3) {
            this.chrsel_scene.update()
        } else if (this.scene == 4) {
            this.play_scene.update()
        }
    }

    change_scene(scene_type) {
        if (this.scene == 0) {
            this.login_scene.leave_scene()
        } else if (this.scene == 1) {
            this.new_account_scene.leave_scene()
        } else if (this.scene == 2) {
            this.chg_pwd_scene.leave_scene()
        } else if (this.scene == 3) {
            this.chrsel_scene.leave_scene()
        } else if (this.scene == 4) {
            this.play_scene.leave_scene()
        }

        this.scene = scene_type

        if (this.scene == 0) {
            this.login_scene.enter_scene()
        } else if (this.scene == 1) {
            this.new_account_scene.enter_scene()
        } else if (this.scene == 2) {
            this.chg_pwd_scene.enter_scene()
        } else if (this.scene == 3) {
            this.chrsel_scene.enter_scene()
        } else if (this.scene == 4) {
            this.play_scene.enter_scene()
        }

        // 单连接架构：登录、选角、进入游戏复用同一条 WebSocket
        this._ensure_ws()
    }

    // ---- WebSocket 连接管理 ----
    _ensure_ws() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return
        }
        this.ws = new WebSocket(this.server_base_url)
        this.ws.onmessage = (event) => {
            this._on_ws_message(event)
        }
        this.ws.onopen = (event) => {
            this._on_ws_open()
        }
        this.ws.onclose = (event) => {
            this._on_ws_close()
        }
    }

    _on_ws_open() {
        if (this.pending_messages) {
            for (const obj of this.pending_messages) {
                this.ws.send(JSON.stringify(obj))
            }
            this.pending_messages = []
        }
        // 进入选角界面时刷新角色列表
        if (this.scene == 3) {
            this.send_list_characters()
        }
    }

    _on_ws_close() {
        // 游戏中连接断开则退回登录
        if (this.scene == 4) {
            this.dlg_message('与服务器的连接已断开。', [SDK.DlgButtons.mbOk], (mb) => {
                this.change_scene(0)
            })
        }
    }

    close_connection() {
        if (this.ws) {
            try {
                this.ws.onclose = null
                this.ws.close()
            } catch (e) {
            }
            this.ws = null
        }
    }

    send_json(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj))
            return
        }
        if (!this.pending_messages) this.pending_messages = []
        this.pending_messages.push(obj)
    }

    _on_ws_message(event) {
        let msg = null
        try {
            msg = JSON.parse(event.data)
        } catch (e) {
            return
        }
        switch (msg.type) {
            case 'pong':
                break
            case 'loginResult':
                this.login_scene.on_login_response(msg)
                break
            case 'registerResult':
                this.new_account_scene.on_create_user_response(msg)
                break
            case 'characterList':
                this.characters = msg.characters || []
                this.chrsel_scene.on_query_chr_response(this.characters)
                break
            case 'createCharacterResult':
                this.chrsel_scene.on_new_chr_response(msg)
                break
            case 'deleteCharacterResult':
                this.chrsel_scene.on_del_chr_response(msg)
                break
            case 'enterGameResult':
                if (!msg.ok) {
                    this.dlg_message(msg.error || '进入游戏失败。')
                }
                break
            case 'enterGame':
                this.play_scene.on_enter_game(msg)
                this.change_scene(4)
                break
            case 'changeMap':
                this.play_scene.on_change_map(msg)
                break
            case 'entityAdd':
            case 'entityRemove':
            case 'move':
            case 'stats':
            case 'attack':
            case 'death':
            case 'chat':
            case 'systemMessage':
                if (this.scene == 4) {
                    this.play_scene.on_server_msg(msg)
                }
                break
            default:
                break
        }
    }

    on_login_ok() {
        // 登录成功后拉取角色列表并播放开门动画
        this.send_list_characters()
        this.login_scene.open_door()
    }

    // begin 与服务器交互函数
    send_login(username, password) {
        this.login_id = username
        this.send_json({ type: 'login', username: username, password: password })
    }

    send_register(username, password) {
        this.send_json({ type: 'register', username: username, password: password })
    }

    send_list_characters() {
        this.send_json({ type: 'listCharacters' })
    }

    send_create_char(name, hair, job, sex) {
        this.send_json({ type: 'createCharacter', name: name, hair: hair, job: job, sex: sex })
    }

    send_delete_char(name) {
        this.send_json({ type: 'deleteCharacter', name: name })
    }

    send_enter_game(name) {
        this.send_json({ type: 'enterGame', name: name })
    }

    send_move(dir) {
        this.send_json({ type: 'move', dir: dir })
    }

    send_say(text) {
        this.send_json({ type: 'say', text: text })
    }

    send_attack(target_id) {
        this.send_json({ type: 'attack', targetId: target_id })
    }

    send_logout() {
        this.send_json({ type: 'logout' })
        this.close_connection()
    }
    // end 与服务器交互函数
}

export { SceneManager }
