// 登录 / 注册界面（对应旧 LoginScene / FrmLogin）
// 用原生 DOM 控件（过渡界面，不进 DWinManager），登录成功切到选角场景。

import { Scene } from '../scene/Scene.mjs';
import { SelectCharScene } from './SelectCharScene.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../core/config.mjs';

export class LoginScene extends Scene {
    onEnter() {
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';

        this.panel = document.createElement('div');
        this.panel.style.cssText = 'position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);'
            + 'width:320px;background:rgba(0,0,0,0.82);border:1px solid #8a6d3b;border-radius:6px;'
            + 'padding:22px 28px;font-family:SimSun,serif;color:#e8d9b0;box-shadow:0 0 24px rgba(0,0,0,0.7);'
            + 'pointer-events:auto;';

        const title = document.createElement('div');
        title.textContent = '传 奇 MIR2';
        title.style.cssText = 'text-align:center;font-size:26px;letter-spacing:6px;color:#ffd76a;'
            + 'margin-bottom:4px;text-shadow:0 0 8px rgba(255,200,60,0.5);';
        this.panel.appendChild(title);

        const sub = document.createElement('div');
        sub.textContent = '登录服务器';
        sub.style.cssText = 'text-align:center;font-size:12px;color:#9a8b6a;margin-bottom:16px;';
        this.panel.appendChild(sub);

        const mkField = (label, isPwd) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:12px;';
            const lab = document.createElement('div');
            lab.textContent = label;
            lab.style.cssText = 'font-size:13px;color:#c9b98a;margin-bottom:4px;';
            const input = document.createElement('input');
            input.type = isPwd ? 'password' : 'text';
            input.style.cssText = 'width:100%;box-sizing:border-box;background:#15110a;color:#f0e6c8;'
                + 'border:1px solid #5a4a2a;border-radius:3px;padding:7px 9px;font-size:14px;outline:none;';
            input.addEventListener('focus', () => input.style.borderColor = '#c9a34a');
            input.addEventListener('blur', () => input.style.borderColor = '#5a4a2a');
            row.appendChild(lab);
            row.appendChild(input);
            this.panel.appendChild(row);
            return input;
        };

        this.userInput = mkField('账号');
        this.pwdInput = mkField('密码', true);

        this.errorEl = document.createElement('div');
        this.errorEl.style.cssText = 'min-height:18px;font-size:12px;color:#ff6b5e;text-align:center;margin:2px 0 10px;';
        this.panel.appendChild(this.errorEl);

        const mkBtn = (text, primary, fn) => {
            const b = document.createElement('button');
            b.textContent = text;
            b.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:9px;font-size:15px;'
                + 'cursor:pointer;border-radius:3px;border:1px solid '
                + (primary ? '#c9a34a' : '#5a4a2a') + ';'
                + (primary
                    ? 'background:linear-gradient(#8a6d3b,#5f4a26);color:#ffe9b0;'
                    : 'background:#221c12;color:#c9b98a;')
                + 'letter-spacing:2px;';
            b.addEventListener('click', fn);
            return b;
        };

        const loginBtn = mkBtn('登 录', true, () => this._login());
        loginBtn.style.marginBottom = '8px';
        this.panel.appendChild(loginBtn);

        const regBtn = mkBtn('注 册 账 号', false, () => this._register());
        this.panel.appendChild(regBtn);

        gui.appendChild(this.panel);

        // 回车触发登录
        this._keyHandler = (e) => { if (e.key === 'Enter') this._login(); };
        document.addEventListener('keydown', this._keyHandler);
    }

    _login() {
        const u = this.userInput.value.trim();
        const p = this.pwdInput.value;
        if (!u || !p) {
            this._error('请输入账号和密码。');
            return;
        }
        this.conn.send('login', { username: u, password: p });
    }

    _register() {
        const u = this.userInput.value.trim();
        const p = this.pwdInput.value;
        if (!u || !p) {
            this._error('注册需填写账号和密码。');
            return;
        }
        this.conn.send('register', { username: u, password: p });
    }

    _error(t) {
        this.errorEl.textContent = t;
    }

    onMessage(type, msg) {
        if (type === 'loginResult') {
            if (msg.ok) {
                this.manager.switchTo(new SelectCharScene(this.manager));
            } else {
                this._error(msg.error || '登录失败。');
            }
        } else if (type === 'registerResult') {
            if (msg.ok) {
                this._error('');
                this._login();   // 注册成功后自动登录
            } else {
                this._error(msg.error || '注册失败。');
            }
        }
    }

    onExit() {
        document.removeEventListener('keydown', this._keyHandler);
        if (this.panel) this.panel.remove();
    }

    render(ctx) {
        ctx.fillStyle = '#0a0805';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }
}
