// DGrid 网格控件（对应旧 TDGrid）
// 用于背包格子、交易格子等。用 canvas 绘制格子内容（背景 + 物品图标），鼠标命中计算格子行列。

import { DControl } from './control.mjs';

export class DGrid extends DControl {
    constructor(manager, parent = null) {
        super(manager, parent);
        this.colCount = 0;
        this.rowCount = 0;
        this.colWidth = 0;
        this.rowHeight = 0;
        this.selectedCol = -1;
        this.selectedRow = -1;

        // 网格绘制回调 (col, row, ctx) => void
        this.onGridPaint = null;
        // 格子选中回调 (col, row) => void
        this.onGridSelect = null;

        // 用 canvas 绘制网格内容
        this.gridCanvas = document.createElement('canvas');
        this.gridCanvas.style.position = 'absolute';
        this.gridCanvas.style.left = '0';
        this.gridCanvas.style.top = '0';
        this.gridCanvas.style.pointerEvents = 'none';
        this.el.appendChild(this.gridCanvas);
    }

    setGrid(colCount, rowCount, colWidth, rowHeight) {
        this.colCount = colCount;
        this.rowCount = rowCount;
        this.colWidth = colWidth;
        this.rowHeight = rowHeight;
        this.width = colCount * colWidth;
        this.height = rowCount * rowHeight;
        this.gridCanvas.width = this.width;
        this.gridCanvas.height = this.height;
        this._apply();
    }

    // 重绘整个网格
    paint() {
        const ctx = this.gridCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.width, this.height);
        for (let r = 0; r < this.rowCount; r++) {
            for (let c = 0; c < this.colCount; c++) {
                if (this.onGridPaint) this.onGridPaint(c, r, ctx);
            }
        }
    }

    // 命中格子（返回 {col, row} 或 null）
    hitCell(lx, ly) {
        const col = Math.floor(lx / this.colWidth);
        const row = Math.floor(ly / this.rowHeight);
        if (col < 0 || row < 0 || col >= this.colCount || row >= this.rowCount) return null;
        return { col, row };
    }

    // 覆写命中：点击到格子时触发 onGridSelect
    hitTest(x, y) {
        if (!this.visible) return false;
        const lx = this.localX(x);
        const ly = this.localY(y);
        return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    }

    // 由 manager 分发 click 时，转换为格子选择
    handleClick(lx, ly) {
        const cell = this.hitCell(lx, ly);
        if (cell && this.onGridSelect) {
            this.selectedCol = cell.col;
            this.selectedRow = cell.row;
            this.onGridSelect(cell.col, cell.row);
            this.paint();   // 刷新选中高亮
        }
    }
}
