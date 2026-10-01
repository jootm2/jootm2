// 全局 HTTP Range 请求调度器（单例）
// 所有 WIL 库共享，最多 MAX_CONCURRENT 个并发 fetch（先到先得）。
// 去重：若某请求的字节范围已被「进行中」的请求完全覆盖，则复用其数据（不占并发额度），
//       空出的额度可以让给后续请求。

const MAX_CONCURRENT = 5;

class RangeScheduler {
    constructor() {
        this.active = [];   // { url, start, end, consumers: [{start,end,resolve,reject}] }
        this.queue = [];    // { url, start, end, resolve, reject }
        this.totalRequests = 0;    // 实际发起的 fetch 数（调试统计）
        this.dedupedRequests = 0;  // 被去重复用的请求数（调试统计）
    }

    /**
     * 调度一个字节范围请求。
     * @returns {Promise<{start:number, buffer:ArrayBuffer}>} start 为实际数据起始偏移
     */
    schedule(url, start, end) {
        // 1. 去重：若图片偏移 start 已落在「进行中」请求的 chunk 内，复用其数据
        //    （该 chunk 覆盖了 start，图片可直接从其中解包，无需再发请求）
        for (const a of this.active) {
            if (a.url === url && a.start <= start && start < a.end) {
                this.dedupedRequests++;
                return new Promise((resolve, reject) => {
                    a.consumers.push({ start, end, resolve, reject });
                });
            }
        }
        // 2. 入队等待
        return new Promise((resolve, reject) => {
            this.queue.push({ url, start, end, resolve, reject });
            this._pump();
        });
    }

    _pump() {
        while (this.active.length < MAX_CONCURRENT && this.queue.length > 0) {
            const req = this.queue.shift();
            this._start(req);
        }
    }

    _start(req) {
        const item = {
            url: req.url,
            start: req.start,
            end: req.end,
            consumers: [{ start: req.start, end: req.end, resolve: req.resolve, reject: req.reject }],
        };
        this.active.push(item);
        this.totalRequests++;

        fetch(req.url, { headers: { Range: `bytes=${req.start}-${req.end}` } })
            .then(resp => {
                if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`);
                // 从 Content-Range 提取文件总大小（"bytes 0-1023/267372" -> 267372）
                let total = 0;
                const cr = resp.headers.get('content-range');
                if (cr) {
                    const m = cr.match(/\/(\d+)\s*$/);
                    if (m) total = parseInt(m[1], 10);
                }
                return resp.arrayBuffer().then(buffer => ({ buffer, total }));
            })
            .then(({ buffer, total }) => {
                for (const c of item.consumers) {
                    c.resolve({ start: item.start, buffer, total });
                }
            })
            .catch(err => {
                for (const c of item.consumers) {
                    c.reject(err);
                }
            })
            .finally(() => {
                const i = this.active.indexOf(item);
                if (i >= 0) this.active.splice(i, 1);
                this._pump();
            });
    }

    stats() {
        return { active: this.active.length, queue: this.queue.length, total: this.totalRequests, deduped: this.dedupedRequests };
    }
}

export const scheduler = new RangeScheduler();
