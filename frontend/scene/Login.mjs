import { Images } from "../image/Images.mjs"
import * as PIXI from "../pixi.mjs"

class LoginScene {
    constructor(params, manager) {
        this.pixi_parent = params.pixi_container // 生成的贴图元素需要停靠的父级树节点
        this.manager = manager // 场景管理对象
        this.view_width = params.width // 视区宽度
        this.view_height = params.height // 视区高度
        this.login_id = "" // 账号（用作缓存）
        this.need_loading = new Array // 需要加载的图片
        this.need_loading.push(["prguse", 53]) // 登陆界面：修改密码按钮
        this.need_loading.push(["prguse", 60]) // 登录：背景
        this.need_loading.push(["prguse", 61]) // 登录：新用户按钮
        this.need_loading.push(["prguse", 62]) // 登录：确定按钮
        this.need_loading.push(["prguse", 64]) // 登录：关闭按钮
        this.sp_login_bg = null // 背景图片精灵对象
        this.sp_login_close = null // 关闭按钮贴图精灵对象（按下）
        this.sp_new_account = null // 新用户按钮贴图精灵对象（按下）
        this.sp_chpsw = null // 修改密码按钮贴图精灵对象（按下）
        this.sp_login_ok = null // 提交按钮贴图精灵对象（按下）
        this.first_update = false // 是否初次从其他场景切换过来
    }

    update() {
        if (this.need_loading.length > 0) {
            for (const [key, value] of this.need_loading) {
                const tex = globalThis.BaseTextureCache[`${key}/${value}`]
                if (!tex) {
                    Images.load(key, value)
                    return
                }
            }
            this.need_loading = new Array

            // 展示背景图
            this.sp_login_bg= new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache['prguse/60']))
            this.sp_login_bg.x = (this.view_width - this.sp_login_bg.width) / 2
            this.sp_login_bg.y = (this.view_height - this.sp_login_bg.height) / 2
            // 关闭按钮
            const bt_login_close = globalThis.BaseTextureCache['prguse/64']
            const dom_login_close = document.getElementById("login_close")
            dom_login_close.style.left = `${this.sp_login_bg.x + 252}px`
            dom_login_close.style.top = `${this.sp_login_bg.y + 28}px`
            dom_login_close.style.width = `${bt_login_close.width}px`
            dom_login_close.style.height = `${bt_login_close.height}px`
            dom_login_close.onmousedown = (event) => {
                if (!!!this.sp_login_close) {
                    this.sp_login_close = new PIXI.Sprite(new PIXI.Texture(bt_login_close))
                    this.sp_login_close.x = this.sp_login_bg.x + 252
                    this.sp_login_close.y = this.sp_login_bg.y + 28
                }
                this.pixi_parent.addChild(this.sp_login_close)
            }
            dom_login_close.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_login_close)
            }
            dom_login_close.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_login_close)
                this.close_click()
            }
            // 用户名
            const dom_login_id = document.getElementById("login_id")
            dom_login_id.style.left = `${this.sp_login_bg.x + 98}px`
            dom_login_id.style.top = `${this.sp_login_bg.y + 85}px`
            // 密码
            const dom_login_pw = document.getElementById("login_pw")
            dom_login_pw.style.left = `${this.sp_login_bg.x + 98}px`
            dom_login_pw.style.top = `${this.sp_login_bg.y + 117}px`
            // 新用户
            const bt_newuser = globalThis.BaseTextureCache['prguse/61']
            const dom_new_account = document.getElementById("new_account")
            dom_new_account.style.left = `${this.sp_login_bg.x + 25}px`
            dom_new_account.style.top = `${this.sp_login_bg.y + 207}px`
            dom_new_account.style.width = `${bt_newuser.width}px`
            dom_new_account.style.height = `${bt_newuser.height}px`
            dom_new_account.onmousedown = (event) => {
                if (!!!this.sp_new_account) {
                    this.sp_new_account = new PIXI.Sprite(new PIXI.Texture(bt_newuser))
                    this.sp_new_account.x = this.sp_login_bg.x + 25
                    this.sp_new_account.y = this.sp_login_bg.y + 207
                }
                this.pixi_parent.addChild(this.sp_new_account)
            }
            dom_new_account.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account)
            }
            dom_new_account.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account)
                this.new_account_click()
            }
            // 修改密码
            const bt_chpsw = globalThis.BaseTextureCache['prguse/53']
            const dom_chpsw = document.getElementById("chpsw")
            dom_chpsw.style.left = `${this.sp_login_bg.x + 130}px`
            dom_chpsw.style.top = `${this.sp_login_bg.y + 207}px`
            dom_chpsw.style.width = `${bt_chpsw.width}px`
            dom_chpsw.style.height = `${bt_chpsw.height}px`
            dom_chpsw.onmousedown = (event) => {
                if (!!!this.sp_chpsw) {
                    this.sp_chpsw = new PIXI.Sprite(new PIXI.Texture(bt_chpsw))
                    this.sp_chpsw.x = this.sp_login_bg.x + 130
                    this.sp_chpsw.y = this.sp_login_bg.y + 207
                }
                this.pixi_parent.addChild(this.sp_chpsw)
            }
            dom_chpsw.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_chpsw)
            }
            dom_chpsw.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_chpsw)
                this.chpsw_click()
            }
            // 提交
            const bt_login_ok = globalThis.BaseTextureCache['prguse/62']
            const dom_login_ok = document.getElementById("login_ok")
            dom_login_ok.style.left = `${this.sp_login_bg.x + 169}px`
            dom_login_ok.style.top = `${this.sp_login_bg.y + 163}px`
            dom_login_ok.style.width = `${bt_login_ok.width}px`
            dom_login_ok.style.height = `${bt_login_ok.height}px`
            dom_login_ok.onmousedown = (event) => {
                if (!!!this.sp_login_ok) {
                    this.sp_login_ok = new PIXI.Sprite(new PIXI.Texture(bt_login_ok))
                    this.sp_login_ok.x = this.sp_login_bg.x + 169
                    this.sp_login_ok.y = this.sp_login_bg.y + 163
                }
                this.pixi_parent.addChild(this.sp_login_ok)
            }
            dom_login_ok.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_login_ok)
            }
            dom_login_ok.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_login_ok)
                this.ok_click()
            }
        }
        if (this.first_update) {
            this.pixi_parent.addChild(this.sp_login_bg)
            document.getElementById("login_window").style.visibility = "visible"
            const dom_login_id = document.getElementById("login_id")
            dom_login_id.value = this.login_id
            dom_login_id.focus()
            this.first_update = false
        }
    }

    // 进入当前场景
    enter_scene() {
        this.first_update = true
    }

    // 离开当前场景
    leave_scene() {
        document.getElementById("login_window").style.visibility = "hidden"
        this.login_id = document.getElementById("login_id").value
        this.pixi_parent.removeChild(this.sp_login_bg)
    }

    // 用户点击关闭按钮
    close_click() {
        alert("你还能去哪儿？！！")
    }

    // 用户点击新建账号按钮
    new_account_click() {
        this.manager.change_scene(1)
    }

    // 用户点击修改密码按钮
    chpsw_click() {
        this.manager.change_scene(2)
    }

    // 提交
    ok_click() {
        
    }
}

export { LoginScene }