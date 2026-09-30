import { MapTileInfo } from "./MapTileInfo.mjs"

/**
 * 热血传奇2地图
 * 即地图文件(*.map)到JavaScript中数据结构的描述
 */
class Map {
	constructor() {
        /** 地图宽度 */
        this.width = 0;
        /** 地图高度 */
        this.height = 0;
        /** 地图块数据 */
        this.tiles = null;
    }
	
	/** 获取地图宽度 */
	getWidth() {
		return this.width;
	}
	/** 设置地图宽度 */
	setWidth(width) {
		this.width = width;
	}
	/** 获取地图高度 */
	getHeight() {
		return this.height;
	}
	/** 设置地图高度 */
	setHeight(height) {
		this.height = height;
	}
	/** 获取地图块信息 */
	getTiles() {
		return this.tiles;
	}
	/** 设置地图块信息 */
	setMapTiles(mapTiles) {
		this.tiles = mapTiles;
	}
}

export { Map }