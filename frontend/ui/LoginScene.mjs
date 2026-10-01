// 登录 / 注册 / 改密码界面 —— 1:1 移植 Delphi TLoginScene（IntroScn.pas）
// + FrmDlg 的 DLogIn(Prguse[60]) / DNewAccount(Prguse[63]) / DChgPw(Prguse[50]) 窗口。
// 场景背景 = ChrSel[22]（800×600，照 TLoginScene.PlayScene 的 WChrSel.Images[102-80]）。
// 输入框照原版 TEdit：无边框（bsNone）黑底（clBlack）白字，叠加在背景图黑色输入区上。
// 按钮照原版 TDButton + SetImgIndex（Prguse 图），坐标照 FState.pas。

import { Scene } from '../scene/Scene.mjs';
import { SelectCharScene } from './SelectCharScene.mjs';
import { getLib } from '../image/Images.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../core/config.mjs';

// 窗口定义（FState.pas：DLogIn=60 / DNewAccount=63 / DChgPw=50，尺寸取自图）
const WIN_LOGIN = { bg: 60, w: 296, h: 254 };
const WIN_REG   = { bg: 63, w: 640, h: 473 };
const WIN_CHGPW = { bg: 50, w: 420, h: 299 };
// 按钮图（FState.pas：Ok=62 New=61 ChgPw=53 Cancel=52 Close=64）
const BTN_SUBMIT = 62, BTN_NEWUSER = 61, BTN_CHGPW = 53, BTN_CANCEL = 52, BTN_CLOSE = 64;

// 注册表单字段（照 IntroScn.pas Create：left=161，宽 116（问答 163），top 相对窗口）
const REG_FIELDS = [
    { key: 'username', top: 116, w: 116, max: 10 },
    { key: 'password', top: 137, w: 116, max: 10, pwd: true },
    { key: 'confirm',  top: 158, w: 116, max: 10, pwd: true },
    { key: 'name',     top: 187, w: 116, max: 20 },
    { key: 'ssno',     top: 207, w: 116, max: 14 },
    { key: 'birthday', top: 227, w: 116, max: 10 },
    { key: 'quiz1',    top: 256, w: 163, max: 20 },
    { key: 'answer1',  top: 276, w: 163, max: 12 },
    { key: 'quiz2',    top: 297, w: 163, max: 20 },
    { key: 'answer2',  top: 317, w: 163, max: 12 },
    { key: 'phone',    top: 347, w: 116, max: 14 },
    { key: 'mobile',   top: 368, w: 116, max: 13 },
    { key: 'email',    top: 388, w: 116, max: 40 },
];
// 改密码字段（照 IntroScn.pas：left=241，宽 137）
const CHGPW_FIELDS = [
    { key: 'username', top: 117, w: 137, max: 10 },
    { key: 'current',  top: 149, w: 137, max: 10, pwd: true },
    { key: 'newpw',    top: 176, w: 137, max: 10, pwd: true },
    { key: 'repeat',   top: 208, w: 137, max: 10, pwd: true },
];

export class LoginScene extends Scene {
    constructor(manager) {
        super(manager);
        this.prg = getLib('prguse');
        this.chr = getLib('chrsel');
        this._urls = new Map();     // Prguse 图 URL 缓存
        this._bgTex = null;         // ChrSel[22] 背景
        this._bgLoading = false;
        this.root = null;
        this._edits = [];           // 当前窗口的输入框（回车跳转）
    }

    // WIL 纹理 → img URL（缓存）
    async _url(idx) {
        if (this._urls.has(idx)) return this._urls.get(idx);
        const tex = await this.prg.getTexture(idx);
        if (!tex) return null;
        const url = tex.canvas.toDataURL
            ? tex.canvas.toDataURL('image/png')
            : URL.createObjectURL(await tex.canvas.convertToBlob());
        this._urls.set(idx, url);
        return url;
    }

    onEnter() {
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';
        this.root = document.createElement('div');
        this.root.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';
        gui.appendChild(this.root);
        this.showLogin();
    }

    onExit() {
        if (this.root) this.root.remove();
    }

    // ---- 构建辅助 ---------------------------------------------------------

    // 无边框输入框（照原版 TEdit：bsNone + 黑底 + 白字 + PasswordChar）
    _edit(parent, left, top, width, opts = {}) {
        const el = document.createElement('input');
        el.type = opts.pwd ? 'password' : 'text';
        el.maxLength = opts.max || 20;
        el.autocomplete = 'off';
        el.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:16px;`
            + 'border:none;background:#000;color:#fff;font-size:12px;font-family:SimSun,serif;'
            + 'padding:0 3px;box-sizing:content-box;outline:none;';
        parent.appendChild(el);
        this._edits.push(el);
        return el;
    }

    // WIL 图按钮（照原版 TDButton + SetImgIndex，坐标相对窗口）
    async _btn(parent, idx, left, top, onClick) {
        const url = await this._url(idx);
        if (!url) return null;
        const el = document.createElement('img');
        el.src = url;
        el.draggable = false;
        el.style.cssText = `position:absolute;left:${left}px;top:${top}px;cursor:pointer;`;
        el.addEventListener('click', onClick);
        parent.appendChild(el);
        return el;
    }

    // 窗口容器：背景图 + 屏幕居中（照原版 (SCREENWIDTH-w)/2, (SCREENHEIGHT-h)/2）
    async _win(def) {
        this.root.innerHTML = '';
        this._edits = [];
        const left = Math.floor((SCREEN_WIDTH - def.w) / 2);
        const top = Math.floor((SCREEN_HEIGHT - def.h) / 2);
        const win = document.createElement('div');
        win.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${def.w}px;height:${def.h}px;`;
        const bgUrl = await this._url(def.bg);
        if (bgUrl) {
            const bg = document.createElement('img');
            bg.src = bgUrl;
            bg.draggable = false;
            bg.style.cssText = 'position:absolute;left:0;top:0;';
            win.appendChild(bg);
        }
        this.root.appendChild(win);
        return win;
    }

    // 错误提示（照原版 PassWdFail / NewIdRetry 的提示位）
    _err(parent, left, top, width) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;`
            + 'font-size:12px;color:#ff6b5e;text-align:center;font-family:SimSun,serif;';
        parent.appendChild(el);
        return el;
    }

    // 回车逐个跳转，最后一个回车提交（照原版 EdNewIdKeyPress）
    _enterChain(fields) {
        for (let i = 0; i < fields.length; i++) {
            const el = fields[i].el;
            el.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                if (i + 1 < fields.length) fields[i + 1].el.focus();
                else fields[i].submit();
            });
        }
    }

    // ---- 登录窗口（DLogIn） -----------------------------------------------

    async showLogin() {
        const win = await this._win(WIN_LOGIN);
        // 输入框：EdId(350,259) EdPasswd(350,291)，窗口居中(252,173) → 相对 (98,86)/(98,118)
        const id = this._edit(win, 98, 86, 137, { max: 20 });
        const pw = this._edit(win, 98, 118, 137, { pwd: true, max: 10 });
        id.addEventListener('keydown', (e) => { if (e.key === 'Enter') pw.focus(); });
        pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._login(); });

        this.errEl = this._err(win, 24, 224, 248);

        // 按钮（FState.pas）：Ok(171,165) New(24,207) ChgPw(111,207) Close(252,28)
        await this._btn(win, BTN_SUBMIT, 171, 165, () => this._login());
        await this._btn(win, BTN_NEWUSER, 24, 207, () => this.showRegister());
        await this._btn(win, BTN_CHGPW, 111, 207, () => this.showChgpw());
        await this._btn(win, BTN_CLOSE, 252, 28, () => this.conn.close());

        id.focus();   // 照 OpenScene：EdId.SetFocus
    }

    // ---- 注册窗口（DNewAccount） ------------------------------------------

    async showRegister() {
        const win = await this._win(WIN_REG);
        // 13 个输入框（照 IntroScn.pas：left=161，top=116..388）
        const fields = REG_FIELDS.map(f => ({
            ...f,
            el: this._edit(win, 161, f.top, f.w, { pwd: f.pwd, max: f.max }),
        }));
        this._regInputs = {};
        for (const f of fields) this._regInputs[f.key] = f.el;

        this.errEl = this._err(win, 60, 452, 520);

        // 回车跳转 + 末尾提交
        fields[fields.length - 1].submit = () => this._register();
        this._enterChain(fields);

        // 按钮（FState.pas）：Ok(160,417) Cancel(448,419) Close(587,33)
        await this._btn(win, BTN_SUBMIT, 160, 417, () => this._register());
        await this._btn(win, BTN_CANCEL, 448, 419, () => this.showLogin());
        await this._btn(win, BTN_CLOSE, 587, 33, () => this.showLogin());

        fields[0].el.focus();
    }

    // 注册校验（照原版 NewIdCheckNewId / NewIdCheckSSno / NewIdCheckBirthDay 精神）
    _register() {
        const v = {};
        for (const f of REG_FIELDS) v[f.key] = this._regInputs[f.key].value.trim();
        if (v.username.length < 3) {
            this.errEl.textContent = '帐号至少 3 位。';
            this._regInputs.username.focus();
            return;
        }
        if (v.password.length < 4) {
            this.errEl.textContent = '密码至少 4 位。';
            this._regInputs.password.focus();
            return;
        }
        if (v.confirm !== v.password) {
            this.errEl.textContent = '两次密码不一致。';
            this._regInputs.confirm.focus();
            return;
        }
        // 服务端当前只认 username/password；其余字段一并发送（服务端忽略，将来扩展无需改前端）
        this.conn.send('register', {
            username: v.username, password: v.password,
            name: v.name, ssno: v.ssno, birthday: v.birthday,
            quiz1: v.quiz1, answer1: v.answer1, quiz2: v.quiz2, answer2: v.answer2,
            phone: v.phone, mobile: v.mobile, email: v.email,
        });
    }

    // ---- 改密码窗口（DChgPw） ----------------------------------------------

    async showChgpw() {
        const win = await this._win(WIN_CHGPW);
        const fields = CHGPW_FIELDS.map(f => ({
            ...f,
            el: this._edit(win, 241, f.top, f.w, { pwd: f.pwd, max: f.max }),
        }));
        this._chgInputs = {};
        for (const f of fields) this._chgInputs[f.key] = f.el;

        this.errEl = this._err(win, 30, 278, 360);

        fields[fields.length - 1].submit = () => this._chgpw();
        this._enterChain(fields);

        // 按钮（FState.pas）：Ok(181,253) Cancel(276,252)
        await this._btn(win, BTN_SUBMIT, 181, 253, () => this._chgpw());
        await this._btn(win, BTN_CANCEL, 276, 252, () => this.showLogin());

        fields[0].el.focus();
    }

    _chgpw() {
        // 服务端暂无 changePassword 协议（照 Delphi CM_CHANGEPASSWORD=2003，待补）
        this.errEl.textContent = '修改密码功能暂未开放。';
    }

    // ---- 逻辑 ---------------------------------------------------------------

    _login() {
        const u = this._edits[0].value.trim();
        const p = this._edits[1].value;
        if (!u || !p) {
            this.errEl.textContent = '请输入帐号和密码。';
            return;
        }
        this.conn.send('login', { username: u, password: p });
    }

    onMessage(type, msg) {
        if (type === 'loginResult') {
            if (msg.ok) {
                this.manager.switchTo(new SelectCharScene(this.manager));
            } else {
                this.errEl.textContent = msg.error || '登录失败。';   // 照原版 PassWdFail
            }
        } else if (type === 'registerResult') {
            if (msg.ok) {
                this._login();   // 照原版注册成功后自动登录
            } else {
                this.errEl.textContent = msg.error || '注册失败。';
            }
        }
    }

    // 场景背景（照 TLoginScene.PlayScene：WChrSel.Images[102-80] = ChrSel[22] 铺满全屏）
    render(ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        if (this._bgTex) {
            ctx.drawImage(this._bgTex.canvas, 0, 0);
        } else if (!this._bgLoading) {
            this._bgLoading = true;
            this.chr.getTexture(22).then((t) => { this._bgTex = t; });
        }
    }
}
