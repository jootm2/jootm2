/**
 * MapTile方便程序逻辑的另类解读方式
 */
class MapTileInfo {
    constructor() {
        /** 背景图索引 */
        this.bngImgIdx = 0;
        /** 是否有背景图(在热血传奇2地图中，背景图大小为4个地图块，具体到绘制地图时则表现在只有横纵坐标都为双数时才绘制) */
        this.hasBng = false;
        /** 是否可行走(站立) */
        this.canStand = false;
        /** 补充背景图索引 */
        this.midImgIdx = 0;
        /** 是否有补充图 */
        this.hasMid = false;
        /** 对象图索引 */
        this.objImgIdx = 0;
        /** 是否有对象图 */
        this.hasObj = false;
        /** 门索引 */
        this.doorIdx = 0;
        /** 是否有门 */
        this.hasDoor = false;
        /** 门偏移 */
        this.doorOffset = 0;
        /** 门是否可开启 */
        this.doorCanOpen = false;
        /** 动画帧数 */
        this.aniFrame = 0;
        /** 动画绘制是否需要混合 */
        this.aniBlendMode = false;
        /** 是否有动画 */
        this.hasAni = false;
        /** 动画跳帧数 */
        this.aniTick = 0;
        /** 资源文件索引 */
        this.objFileIdx = 0;
        /** 背景图资源文件索引 */
        this.bngFileIdx = 0;
        /** 中间层资源文件索引 */
        this.midFileIdx = 0;
        /** 光线 */
        this.light = 0;
    }

    /** 获取背景图索引 */
	getBngImgIdx() {
		return this.bngImgIdx;
	}
	/** 设置背景图索引 */
	setBngImgIdx(bngImgIdx) {
		this.bngImgIdx = bngImgIdx;
	}
	/** 获取该地图块是否有背景图 */
	isHasBng() {
		return this.hasBng;
	}
	/** 设置该地图块是否有背景图 */
	setHasBng(hasBng) {
		this.hasBng = hasBng;
	}
	/** 获取该地图块是否可以站立或走过 */
	isCanStand() {
		return this.canStand;
	}
	/** 设置该地图块是否可以站立或走过 */
	setCanStand(canStand) {
		this.canStand = canStand;
	}
	/** 获取补充图索引 */
	getMidImgIdx() {
		return this.midImgIdx;
	}
	/** 设置补充图索引 */
	setMidImgIdx(midImgIdx) {
		this.midImgIdx = midImgIdx;
	}
	/** 获取该地图块是否有补充图 */
	isHasMid() {
		return this.hasMid;
	}
	/** 设置该地图块是否有补充图 */
	setHasMid(hasMid) {
		this.hasMid = hasMid;
	}
	/** 获取对象图索引 */
	getObjImgIdx() {
		return this.objImgIdx;
	}
	/** 设置对象图索引 */
	setObjImgIdx(objImgIdx) {
		this.objImgIdx = objImgIdx;
	}
	/** 获取该地图块是否有对象图 */
	isHasObj() {
		return this.hasObj;
	}
	/** 设置该地图块是否有对象图 */
	setHasObj(hasObj) {
		this.hasObj = hasObj;
	}
	/** 获取门索引 */
	getDoorIdx() {
		return this.doorIdx;
	}
	/** 设置门索引 */
	setDoorIdx(doorIdx) {
		this.doorIdx = doorIdx;
	}
	/** 获取该地图块是否有门 */
	isHasDoor() {
		return this.hasDoor;
	}
	/** 设置该地图块是否有门 */
	setHasDoor(hasDoor) {
		this.hasDoor = hasDoor;
	}
	/** 获取门偏移 */
	getDoorOffset() {
		return this.doorOffset;
	}
	/** 设置门偏移 */
	setDoorOffset(doorOffset) {
		this.doorOffset = doorOffset;
	}
	/** 获取该地图块门是否可打开 */
	isDoorCanOpen() {
		return this.doorCanOpen;
	}
	/** 设置该地图块门是否可打开 */
	setDoorCanOpen(doorCanOpen) {
		this.doorCanOpen = doorCanOpen;
	}
	/** 获取动画帧数 */
	getAniFrame() {
		return this.aniFrame;
	}
	/** 设置动画帧数 */
	setAniFrame(aniFrame) {
		this.aniFrame = aniFrame;
	}
	/**
	 * 获取动画绘制模式<br>动画像素叠加是否需要混合
	 */
	isAniBlendMode() {
		return this.aniBlendMode;
	}
	/** 设置动画绘制模式<br>动画像素叠加是否需要混合 */
	setAniBlendMode(aniBlendMode) {
		this.aniBlendMode = aniBlendMode;
	}
	/** 获取该地图块是否有动画 */
	isHasAni() {
		return this.hasAni;
	}
	/** 设置该地图块是否有动画 */
	setHasAni(hasAni) {
		this.hasAni = hasAni;
	}
	/** 获取动画跳帧数 */
	getAniTick() {
		return this.aniTick;
	}
	/** 设置动画跳帧数 */
	setAniTick(aniTick) {
		this.aniTick = aniTick;
	}
	/** 获取资源文件索引 */
	getObjFileIdx() {
		return this.objFileIdx;
	}
	/** 设置资源文件索引 */
	setObjFileIdx(objFileIdx) {
		this.objFileIdx = objFileIdx;
	}
	/** 获取背景图资源文件索引 */
	getBngFileIdx() {
		return this.bngFileIdx;
	}
	/** 设置背景图资源文件索引 */
	setBngFileIdx(bngFileIdx) {
		this.bngFileIdx = bngFileIdx;
	}
	/** 获取中间层资源文件索引 */
	getMidFileIdx() {
		return this.midFileIdx;
	}
	/** 设置中间层资源文件索引 */
	setMidFileIdx(midFileIdx) {
		this.midFileIdx = midFileIdx;
	}
	/** 获取亮度 */
	getLight() {
		return this.light;
	}
	/** 设置亮度 */
	setLight(light) {
		this.light = light;
	}

	/*toString() {
		return `${this.bngImgIdx} ${this.hasBng} ${this.canStand} ${this.midImgIdx} ${this.hasMid} ${this.objImgIdx} ${this.hasObj} ${this.doorIdx} ${this.hasDoor} ${this.doorOffset} ${this.doorCanOpen} ${this.aniFrame} ${this.aniBlendMode} ${this.hasAni} ${this.aniTick} ${this.objFileIdx} ${this.bngFileIdx} ${this.midFileIdx} ${this.light}`
	}*/
}

export { MapTileInfo }