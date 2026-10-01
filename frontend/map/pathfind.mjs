// 8 方向 A* 寻路（对应旧客户端点地走）
// 地图 tile 的 canStand 标志决定可行走；返回方向序列（0..7，与服务器 Direction 一致）。

const DIRS = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

function dirBetween(x, y, nx, ny) {
    const dx = Math.sign(nx - x);
    const dy = Math.sign(ny - y);
    for (let d = 0; d < 8; d++) {
        if (Math.sign(DIRS[d][0]) === dx && Math.sign(DIRS[d][1]) === dy) return d;
    }
    return 0;
}

/**
 * @param map {width,height,tiles}（Maps.mjs loadMap 返回）
 * @returns 方向数组（每步一个方向 0..7），无路径返回 null；原地返回 []
 */
export function findPath(map, sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    const w = map.width, h = map.height;
    const canStand = (x, y) => x >= 0 && y >= 0 && x < w && y < h && map.tiles[x][y].canStand;
    if (!canStand(tx, ty)) return null;

    const key = (x, y) => x + ',' + y;
    const gScore = new Map();
    const came = new Map();   // key -> {x,y,d}
    const startKey = key(sx, sy);
    gScore.set(startKey, 0);

    // 开放列表（小场景线性取最小 f；点击寻路非每帧，可接受）
    const open = [{ x: sx, y: sy, f: heuristic(sx, sy, tx, ty) }];
    const inOpen = new Set([startKey]);
    const closed = new Set();

    const hx = (x, y) => Math.max(Math.abs(tx - x), Math.abs(ty - y));   // 切比雪夫距离

    while (open.length) {
        // 取 f 最小节点
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0];
        const curKey = key(cur.x, cur.y);
        inOpen.delete(curKey);
        if (closed.has(curKey)) continue;
        closed.add(curKey);

        if (cur.x === tx && cur.y === ty) {
            // 回溯路径
            const path = [];
            let k = curKey;
            while (k !== startKey) {
                const c = came.get(k);
                path.push(c.d);
                k = key(c.x, c.y);
            }
            path.reverse();
            return path;
        }

        for (let d = 0; d < 8; d++) {
            const nx = cur.x + DIRS[d][0];
            const ny = cur.y + DIRS[d][1];
            if (!canStand(nx, ny)) continue;
            const nk = key(nx, ny);
            if (closed.has(nk)) continue;
            const stepCost = (d % 2 === 0) ? 1 : 1.4;
            const ng = gScore.get(curKey) + stepCost;
            if (ng < (gScore.get(nk) ?? Infinity)) {
                gScore.set(nk, ng);
                came.set(nk, { x: cur.x, y: cur.y, d });
                const f = ng + hx(nx, ny);
                if (!inOpen.has(nk)) {
                    open.push({ x: nx, y: ny, f });
                    inOpen.add(nk);
                }
            }
        }
    }
    return null;
}

function heuristic(x, y, tx, ty) {
    return Math.max(Math.abs(tx - x), Math.abs(ty - y));
}
