// DButton 按钮（对应旧 TDButton）
// 在 DControl 基础上增加按下状态 + 点击音效类型

import { DControl } from './control.mjs';

export class DButton extends DControl {
    constructor(manager, parent = null) {
        super(manager, parent);
        this.downed = false;        // 按下状态（视觉反馈）
        this.clickSound = 'none';   // 音效：none/stone/glass/norm（对应旧 csNone/csStone/csGlass/csNorm）
        this.onClickSound = null;   // 点击音效回调 (clickSound) => void
    }

    // 按下
    pressDown() {
        this.downed = true;
    }

    pressUp() {
        this.downed = false;
    }
}
