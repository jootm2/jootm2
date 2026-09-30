import { Images } from "../image/Images.mjs"
import * as PIXI from "../pixi.mjs"
import * as SDK from "../SDK.mjs"

class NewAccountScene {
    constructor(options, manager) {
        this.pixi_parent = options.stage // 生成的贴图元素需要停靠的父级树节点
        this.manager = manager // 场景管理对象
        this.view_width = options.width // 视区宽度
        this.view_height = options.height // 视区高度
        this.new_id = "" // 账号（新建）
        this.need_loading = new Array // 需要加载的图片
        this.need_loading.push(["prguse", 63]) // 背景
        this.need_loading.push(["prguse", 62]) // 确定
        this.need_loading.push(["prguse", 52]) // 取消
        this.need_loading.push(["prguse", 64]) // 关闭
        this.sp_new_account_bg = null // 背景图片精灵对象
        this.sp_new_account_ok = null // 提交按钮按下贴图
        this.sp_new_account_cancel = null // 取消按钮按下贴图
        this.sp_new_account_close = null // 关闭按钮按下贴图
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

            // 背景图
            this.sp_new_account_bg = new PIXI.Sprite(new PIXI.Texture(globalThis.BaseTextureCache['prguse/63']))
            this.sp_new_account_bg.x = (this.view_width - this.sp_new_account_bg.width) / 2
            this.sp_new_account_bg.y = (this.view_height - this.sp_new_account_bg.height) / 2
            // 关闭按钮
            const bt_new_account_close = globalThis.BaseTextureCache['prguse/64']
            const dom_new_account_close = document.getElementById("new_account_close")
            dom_new_account_close.style.left = `${this.sp_new_account_bg.x + 587}px`
            dom_new_account_close.style.top = `${this.sp_new_account_bg.y + 33}px`
            dom_new_account_close.style.width = `${bt_new_account_close.width}px`
            dom_new_account_close.style.height = `${bt_new_account_close.height}px`
            dom_new_account_close.onmousedown = (event) => {
                if (!!!this.sp_new_account_close) {
                    this.sp_new_account_close = new PIXI.Sprite(new PIXI.Texture(bt_new_account_close))
                    this.sp_new_account_close.x = this.sp_new_account_bg.x + 587
                    this.sp_new_account_close.y = this.sp_new_account_bg.y + 33
                }
                this.pixi_parent.addChild(this.sp_new_account_close)
            }
            dom_new_account_close.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_close)
            }
            dom_new_account_close.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_close)
                this.close_click()
            }
            // 提交按钮
            const bt_new_account_ok = globalThis.BaseTextureCache['prguse/62']
            const dom_new_account_ok = document.getElementById("new_account_ok")
            dom_new_account_ok.style.left = `${this.sp_new_account_bg.x + 158}px`
            dom_new_account_ok.style.top = `${this.sp_new_account_bg.y + 416}px`
            dom_new_account_ok.style.width = `${bt_new_account_ok.width}px`
            dom_new_account_ok.style.height = `${bt_new_account_ok.height}px`
            dom_new_account_ok.onmousedown = (event) => {
                if (!!!this.sp_new_account_ok) {
                    this.sp_new_account_ok = new PIXI.Sprite(new PIXI.Texture(bt_new_account_ok))
                    this.sp_new_account_ok.x = this.sp_new_account_bg.x + 158
                    this.sp_new_account_ok.y = this.sp_new_account_bg.y + 416
                }
                this.pixi_parent.addChild(this.sp_new_account_ok)
            }
            dom_new_account_ok.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_ok)
            }
            dom_new_account_ok.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_ok)
                this.ok_click()
            }
            // 取消按钮
            const bt_new_account_cancel = globalThis.BaseTextureCache['prguse/52']
            const dom_new_account_cancel = document.getElementById("new_account_cancel")
            dom_new_account_cancel.style.left = `${this.sp_new_account_bg.x + 446}px`
            dom_new_account_cancel.style.top = `${this.sp_new_account_bg.y + 419}px`
            dom_new_account_cancel.style.width = `${bt_new_account_cancel.width}px`
            dom_new_account_cancel.style.height = `${bt_new_account_cancel.height}px`
            dom_new_account_cancel.onmousedown = (event) => {
                if (!!!this.sp_new_account_cancel) {
                    this.sp_new_account_cancel = new PIXI.Sprite(new PIXI.Texture(bt_new_account_cancel))
                    this.sp_new_account_cancel.x = this.sp_new_account_bg.x + 446
                    this.sp_new_account_cancel.y = this.sp_new_account_bg.y + 419
                }
                this.pixi_parent.addChild(this.sp_new_account_cancel)
            }
            dom_new_account_cancel.onmouseleave = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_cancel)
            }
            dom_new_account_cancel.onmouseup = (event) => {
                this.pixi_parent.removeChild(this.sp_new_account_cancel)
                this.close_click()
            }
            // 提示信息
            const dom_new_account_help = document.getElementById("new_account_help")
            dom_new_account_help.style.left = `${this.sp_new_account_bg.x + 387}px`
            dom_new_account_help.style.top = `${this.sp_new_account_bg.y + 124}px`
            // 用户名
            const dom_new_account_id = document.getElementById("new_account_id")
            dom_new_account_id.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_id.style.top = `${this.sp_new_account_bg.y + 116}px`
            dom_new_account_id.onfocus = (event) => {
                dom_new_account_help.value = '你的ID可以是以下内容的组合：\n'
                +'字符、数字\nID必须至少有4位。\n\n'
                +'请仔细选择你的ID，\n登陆名可用于我们所有服务器。\n\n'
                +'我们建议你用一个不同的名字，\n和你想给游戏角色用的那个区别开来。'
            }
            // 密码
            const dom_new_account_psw = document.getElementById("new_account_psw")
            dom_new_account_psw.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_psw.style.top = `${this.sp_new_account_bg.y + 137}px`
            dom_new_account_psw.onfocus = (event) => {
                dom_new_account_help.value = '你的密码可以是一个组合，\n'
                +'包括：字符和数字。\n而且它至少要有4位。\n\n把你的密码记住是'
                +'玩我们的游戏最基本的要素，\n所以请确认你已经记好了它。\n\n我们建议你最好不要用'
                +'一个简单的密码，\n以消除一些不安全因素'
            }
            // 确认密码
            const dom_new_account_psw2 = document.getElementById("new_account_psw2")
            dom_new_account_psw2.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_psw2.style.top = `${this.sp_new_account_bg.y + 158}px`
            dom_new_account_psw2.onfocus = (event) => {
                dom_new_account_help.value = '再次输入密码以确认'
            }
            // 姓名
            const dom_new_account_yourname = document.getElementById("new_account_yourname")
            dom_new_account_yourname.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_yourname.style.top = `${this.sp_new_account_bg.y + 187}px`
            dom_new_account_yourname.onfocus = (event) => {
                dom_new_account_help.value = '键入你的全名。'
            }
            // 生日
            const dom_new_account_birthday = document.getElementById("new_account_birthday")
            dom_new_account_birthday.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_birthday.style.top = `${this.sp_new_account_bg.y + 227}px`
            dom_new_account_birthday.onfocus = (event) => {
                dom_new_account_help.value = '请键入你的出生日期和月份，年/月/日\n例如：1975/08/21'
            }
            // 问题1
            const dom_new_account_quiz1 = document.getElementById("new_account_quiz1")
            dom_new_account_quiz1.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_quiz1.style.top = `${this.sp_new_account_bg.y + 256}px`
            dom_new_account_quiz1.onfocus = (event) => {
                dom_new_account_help.value = '请输入一个密码提示问题\n请明确,只有你本人才知道这个问题.'
            }
            // 密码1
            const dom_new_account_answer1 = document.getElementById("new_account_answer1")
            dom_new_account_answer1.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_answer1.style.top = `${this.sp_new_account_bg.y + 276}px`
            dom_new_account_answer1.onfocus = (event) => {
                dom_new_account_help.value = '请输入上面问题的答案。'
            }
            // 问题2
            const dom_new_account_quiz2 = document.getElementById("new_account_quiz2")
            dom_new_account_quiz2.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_quiz2.style.top = `${this.sp_new_account_bg.y + 297}px`
            dom_new_account_quiz2.onfocus = (event) => {
                dom_new_account_help.value = '请输入一个密码提示问题\n请明确,只有你本人才知道这个问题.'
            }
            // 密码2
            const dom_new_account_answer2 = document.getElementById("new_account_answer2")
            dom_new_account_answer2.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_answer2.style.top = `${this.sp_new_account_bg.y + 317}px`
            dom_new_account_answer2.onfocus = (event) => {
                dom_new_account_help.value = '请输入上面问题的答案。'
            }
            // 电话
            const dom_new_account_phone = document.getElementById("new_account_phone")
            dom_new_account_phone.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_phone.style.top = `${this.sp_new_account_bg.y + 347}px`
            dom_new_account_phone.onfocus = (event) => {
                dom_new_account_help.value = '请键入你的电话号码。'
            }
            // 手机
            const dom_new_account_mobphone = document.getElementById("new_account_mobphone")
            dom_new_account_mobphone.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_mobphone.style.top = `${this.sp_new_account_bg.y + 368}px`
            dom_new_account_mobphone.onfocus = (event) => {
                dom_new_account_help.value = '请键入你的手机号码。'
            }
            // 邮箱
            const dom_new_account_email = document.getElementById("new_account_email")
            dom_new_account_email.style.left = `${this.sp_new_account_bg.x + 161}px`
            dom_new_account_email.style.top = `${this.sp_new_account_bg.y + 388}px`
            dom_new_account_email.onfocus = (event) => {
                dom_new_account_help.value = '请键入你的邮件地址。\n你的邮件将被用于访问我们的一些服务器，\n'
                +'你能收到最近更新的一些信息。'
            }
        }
        if (this.first_update) {
            this.pixi_parent.addChild(this.sp_new_account_bg)
            document.getElementById("new_account_window").style.visibility = "visible"
            const dom_new_account_id = document.getElementById("new_account_id")
            //const dom_login_id = document.getElementById("login_id")
            //dom_login_id.value = this.login_id
            dom_new_account_id.focus()
            this.first_update = false
        }
    }

    // 进入当前场景
    enter_scene() {
        this.first_update = true
    }

    // 离开当前场景
    leave_scene() {
        document.getElementById("new_account_window").style.visibility = "hidden"
        //this.login_id = document.getElementById("login_id").value
        this.pixi_parent.removeChild(this.sp_new_account_bg)
    }

    // 用户点击关闭按钮
    close_click() {
        this.manager.change_scene(0)
    }

    // 提交按钮
    ok_click() {
        this.manager.send_register(
            document.getElementById("new_account_id").value,
            document.getElementById("new_account_psw").value
        )
    }

    on_create_user_response(resp) {
        if (resp.ok) {
            this.manager.dlg_message("您的帐号创建成功。请妥善保管您的帐号和密码，不要告知他人。", [SDK.DlgButtons.mbOk], (btn) => {
                this.manager.change_scene(0)
            })
        } else {
            this.manager.dlg_message(resp.error || "注册失败。", [SDK.DlgButtons.mbOk], (btn) => {
                document.getElementById("new_account_id").focus()
            })
        }
    }
}

export { NewAccountScene }
