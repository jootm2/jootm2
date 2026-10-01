// 选角 / 创建角色界面（对应旧 SelectChar / NewChr 场景）
// 登录成功后进入：列出角色、创建角色、选择角色进游戏。

import { Scene } from '../scene/Scene.mjs';
import { PlayScene } from '../scene/PlayScene.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../core/config.mjs';

const JOB_NAMES = ['战士', '法师', '道士'];

export class SelectCharScene extends Scene {
    onEnter() {
        const gui = this.manager.winManager.container;
        gui.innerHTML = '';

        this.panel = document.createElement('div');
        this.panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
            + 'width:560px;height:430px;background:rgba(0,0,0,0.85);border:1px solid #8a6d3b;'
            + 'border-radius:6px;padding:20px;font-family:SimSun,serif;color:#e8d9b0;'
            + 'box-shadow:0 0 24px rgba(0,0,0,0.7);pointer-events:auto;';

        const title = document.createElement('div');
        title.textContent = '选 择 角 色';
        title.style.cssText = 'text-align:center;font-size:22px;letter-spacing:4px;color:#ffd76a;margin-bottom:16px;';
        this.panel.appendChild(title);

        this.listBox = document.createElement('div');
        this.listBox.style.cssText = 'min-height:180px;max-height:260px;overflow-y:auto;';
        this.panel.appendChild(this.listBox);

        // 创建角色区
        const createBox = document.createElement('div');
        createBox.style.cssText = 'border-top:1px solid #5a4a2a;margin-top:12px;padding-top:12px;';
        const createTitle = document.createElement('div');
        createTitle.textContent = '创建新角色';
        createTitle.style.cssText = 'font-size:14px;color:#c9a34a;margin-bottom:10px;';
        createBox.appendChild(createTitle);

        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex;align-items:center;margin-bottom:10px;';
        const nameLab = document.createElement('span');
        nameLab.textContent = '名字';
        nameLab.style.cssText = 'font-size:13px;width:50px;color:#c9b98a;';
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.maxLength = 14;
        this.nameInput.style.cssText = 'flex:1;background:#15110a;color:#f0e6c8;border:1px solid #5a4a2a;'
            + 'border-radius:3px;padding:6px 9px;font-size:13px;outline:none;';
        nameRow.appendChild(nameLab);
        nameRow.appendChild(this.nameInput);
        createBox.appendChild(nameRow);

        // 性别 + 发型 + 职业 选择行
        this.state = { sex: 0, hair: 0, job: 0 };

        const optRow = document.createElement('div');
        optRow.style.cssText = 'display:flex;gap:14px;margin-bottom:12px;align-items:center;';

        this.sexLabel = this._seg(optRow, '性别', ['男', '女'], 'sex');
        this.hairLabel = this._seg(optRow, '发型', ['0', '1', '2'], 'hair');
        this.jobLabel = this._seg(optRow, '职业', JOB_NAMES, 'job');

        createBox.appendChild(optRow);

        this.createError = document.createElement('div');
        this.createError.style.cssText = 'min-height:16px;font-size:12px;color:#ff6b5e;margin-bottom:8px;';
        createBox.appendChild(this.createError);

        const createBtn = document.createElement('button');
        createBtn.textContent = '创 建';
        createBtn.style.cssText = 'width:100%;padding:8px;font-size:14px;cursor:pointer;border-radius:3px;'
            + 'border:1px solid #c9a34a;background:linear-gradient(#8a6d3b,#5f4a26);color:#ffe9b0;letter-spacing:2px;';
        createBtn.addEventListener('click', () => this._create());
        createBox.appendChild(createBtn);

        this.panel.appendChild(createBox);
        gui.appendChild(this.panel);

        this._refreshSegs();
        this.conn.send('listCharacters');
    }

    // 分段选择（性别/发型/职业）
    _seg(parent, label, options, key) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const lab = document.createElement('span');
        lab.textContent = label;
        lab.style.cssText = 'font-size:12px;color:#c9b98a;';
        wrap.appendChild(lab);
        const btns = options.map((opt, i) => {
            const b = document.createElement('button');
            b.textContent = opt;
            b.dataset.val = i;
            b.style.cssText = 'padding:3px 8px;font-size:12px;cursor:pointer;border-radius:2px;'
                + 'border:1px solid #5a4a2a;background:#221c12;color:#c9b98a;';
            b.addEventListener('click', () => { this.state[key] = i; this._refreshSegs(); });
            wrap.appendChild(b);
            return b;
        });
        parent.appendChild(wrap);
        return { wrap, btns };
    }

    _refreshSegs() {
        for (const [key, label] of [['sex', this.sexLabel], ['hair', this.hairLabel], ['job', this.jobLabel]]) {
            for (const b of label.btns) {
                const sel = Number(b.dataset.val) === this.state[key];
                b.style.background = sel ? '#8a6d3b' : '#221c12';
                b.style.color = sel ? '#ffe9b0' : '#c9b98a';
                b.style.borderColor = sel ? '#c9a34a' : '#5a4a2a';
            }
        }
    }

    _renderList(chars) {
        this.listBox.innerHTML = '';
        if (!chars.length) {
            const empty = document.createElement('div');
            empty.textContent = '（暂无角色，请在下方创建）';
            empty.style.cssText = 'text-align:center;color:#9a8b6a;padding:30px 0;font-size:13px;';
            this.listBox.appendChild(empty);
            return;
        }
        for (const c of chars) {
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
                + 'background:#171209;border:1px solid #4a3d22;border-radius:4px;'
                + 'padding:8px 12px;margin-bottom:8px;';
            const info = document.createElement('div');
            info.innerHTML = `<span style="font-size:15px;color:#ffd76a;">${c.name}</span>`
                + `<span style="font-size:12px;color:#c9b98a;margin-left:10px;">${JOB_NAMES[c.job] || c.job}</span>`
                + `<span style="font-size:12px;color:#9a8b6a;margin-left:10px;">Lv.${c.level}</span>`
                + `<span style="font-size:12px;color:#9a8b6a;margin-left:10px;">${c.sex === 0 ? '男' : '女'}</span>`;
            card.appendChild(info);

            const btnBox = document.createElement('div');
            const enter = document.createElement('button');
            enter.textContent = '进入游戏';
            enter.style.cssText = 'padding:4px 12px;font-size:13px;cursor:pointer;border-radius:3px;'
                + 'border:1px solid #c9a34a;background:#8a6d3b;color:#ffe9b0;margin-right:6px;';
            enter.addEventListener('click', () => this._enter(c.name));
            btnBox.appendChild(enter);

            const del = document.createElement('button');
            del.textContent = '删除';
            del.style.cssText = 'padding:4px 10px;font-size:12px;cursor:pointer;border-radius:3px;'
                + 'border:1px solid #6b3a3a;background:#2a1414;color:#e08a80;';
            del.addEventListener('click', () => this.conn.send('deleteCharacter', { name: c.name }));
            btnBox.appendChild(del);

            card.appendChild(btnBox);
            this.listBox.appendChild(card);
        }
    }

    _create() {
        const name = this.nameInput.value.trim();
        if (!name) {
            this.createError.textContent = '请输入角色名（1-14 字符）。';
            return;
        }
        this.conn.send('createCharacter', { name, ...this.state });
    }

    _enter(name) {
        this.conn.send('enterGame', { name });
    }

    onMessage(type, msg) {
        if (type === 'characterList') {
            this._renderList(msg.characters || []);
        } else if (type === 'createCharacterResult') {
            if (msg.ok) {
                this.createError.textContent = '';
                this.nameInput.value = '';
                this.conn.send('listCharacters');
            } else {
                this.createError.textContent = msg.error || '创建失败。';
            }
        } else if (type === 'deleteCharacterResult') {
            this.conn.send('listCharacters');
        } else if (type === 'enterGameResult') {
            if (!msg.ok) {
                this.createError.textContent = msg.error || '进入游戏失败。';
            }
        } else if (type === 'enterGame') {
            // 收到地图快照，切到游戏场景
            this.manager.switchTo(new PlayScene(this.manager, msg));
        }
    }

    onExit() {
        if (this.panel) this.panel.remove();
    }

    render(ctx) {
        ctx.fillStyle = '#0a0805';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }
}
