import { Images } from "../image/Images.mjs"
import * as PIXI from "../pixi.mjs"

class ChgpwdScene {
    constructor(params, manager) {
        this.pixi_parent = params.pixi_container // 生成的贴图元素需要停靠的父级树节点
        this.manager = manager // 场景管理对象
        this.view_width = params.width // 视区宽度
        this.view_height = params.height // 视区高度
        this.need_loading = new Array // 需要加载的图片
        this.need_loading.push(["prguse", 50]) // 修改密码：背景
        this.need_loading.push(["prguse", 62]) // 修改密码：同意
        this.need_loading.push(["prguse", 52]) // 修改密码：取消
        this.sp_chgpwd_bg = null // 背景图片精灵对象
        this.sp_chgpwd_ok = null // 确定按钮贴图精灵对象（按下）
        this.sp_chgpwd_cancel = null // 关闭按钮贴图精灵对象（按下）
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
            this.sp_chgpwd_bg= new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache['prguse/50']))
            this.sp_chgpwd_bg.x = (this.view_width - this.sp_chgpwd_bg.width) / 2
            this.sp_chgpwd_bg.y = (this.view_height - this.sp_chgpwd_bg.height) / 2
            // 同意按钮
            const bt_chgpwd_ok = globalThis.BaseTextureCache['prguse/62']
            const dom_chgpwd_ok = document.getElementById("chgpwd_ok")
            dom_chgpwd_ok.style.left = `${this.sp_chgpwd_bg.x + 181}px`
            dom_chgpwd_ok.style.top = `${this.sp_chgpwd_bg.y + 253}px`
            dom_chgpwd_ok.style.width = `${bt_chgpwd_ok.width}px`
            dom_chgpwd_ok.style.height = `${bt_chgpwd_ok.height}px`
            dom_chgpwd_ok.onmousedown = (event) => {
                if (!!!this.sp_chgpwd_ok) {
                    this.sp_chgpwd_ok = new PIXI.Sprite(new PIXI.Texture(bt_chgpwd_ok))
                    this.sp_chgpwd_ok.x = this.sp_chgpwd_bg.x + 181
                    this.sp_chgpwd_ok.y = this.sp_chgpwd_bg.y + 253
                }
                this.pixi_parent.addChild(this.sp_chgpwd_ok)
            }
            dom_chgpwd_ok.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_chgpwd_ok)
            }
            dom_chgpwd_ok.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_chgpwd_ok)
                this.ok_click()
            }
            // 取消按钮
            const bt_chgpwd_cancel = globalThis.BaseTextureCache['prguse/52']
            const dom_chgpwd_cancel = document.getElementById("chgpwd_cancel")
            dom_chgpwd_cancel.style.left = `${this.sp_chgpwd_bg.x + 276}px`
            dom_chgpwd_cancel.style.top = `${this.sp_chgpwd_bg.y + 252}px`
            dom_chgpwd_cancel.style.width = `${bt_chgpwd_cancel.width}px`
            dom_chgpwd_cancel.style.height = `${bt_chgpwd_cancel.height}px`
            dom_chgpwd_cancel.onmousedown = (event) => {
                if (!!!this.sp_chgpwd_cancel) {
                    this.sp_chgpwd_cancel = new PIXI.Sprite(new PIXI.Texture(bt_chgpwd_cancel))
                    this.sp_chgpwd_cancel.x = this.sp_chgpwd_bg.x + 276
                    this.sp_chgpwd_cancel.y = this.sp_chgpwd_bg.y + 252
                }
                this.pixi_parent.addChild(this.sp_chgpwd_cancel)
            }
            dom_chgpwd_cancel.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_chgpwd_cancel)
            }
            dom_chgpwd_cancel.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_chgpwd_cancel)
                this.cancel_click()
            }
            // 用户名
            const dom_chgpwd_id = document.getElementById("chgpwd_id")
            dom_chgpwd_id.style.left = `${this.sp_chgpwd_bg.x + 239}px`
            dom_chgpwd_id.style.top = `${this.sp_chgpwd_bg.y + 117}px`
            // 旧密码
            const dom_chgpwd_cur_pw = document.getElementById("chgpwd_cur_pw")
            dom_chgpwd_cur_pw.style.left = `${this.sp_chgpwd_bg.x + 239}px`
            dom_chgpwd_cur_pw.style.top = `${this.sp_chgpwd_bg.y + 149}px`
            // 新密码
            const dom_chgpwd_new_pw = document.getElementById("chgpwd_new_pw")
            dom_chgpwd_new_pw.style.left = `${this.sp_chgpwd_bg.x + 239}px`
            dom_chgpwd_new_pw.style.top = `${this.sp_chgpwd_bg.y + 176}px`
            // 确认密码
            const dom_chgpwd_repeat_pw = document.getElementById("chgpwd_repeat_pw")
            dom_chgpwd_repeat_pw.style.left = `${this.sp_chgpwd_bg.x + 239}px`
            dom_chgpwd_repeat_pw.style.top = `${this.sp_chgpwd_bg.y + 208}px`
        }

        if (this.first_update) {
            this.pixi_parent.addChild(this.sp_chgpwd_bg)
            document.getElementById("chgpwd_window").style.visibility = "visible"
            const dom_chgpwd_id = document.getElementById("chgpwd_id")
            dom_chgpwd_id.focus()
            this.first_update = false
        }
    }

    // 进入当前场景
    enter_scene() {
        this.first_update = true
    }

    // 离开当前场景
    leave_scene() {
        document.getElementById("chgpwd_window").style.visibility = "hidden"
        this.pixi_parent.removeChild(this.sp_chgpwd_bg)
    }

    // 取消按钮
    cancel_click() {
        this.manager.change_scene(0)
    }

    // 同意按钮
    ok_click() {

    }
}

export { ChgpwdScene }