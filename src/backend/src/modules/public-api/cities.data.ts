/**
 * Bundled Chinese city coordinates — replaces Nominatim geocoding.
 * Nominatim is blocked from our network region (timeouts), so we ship a
 * static lookup table of ~30 representative Chinese cities instead.
 *
 * For unknown cities, fallback to Beijing.
 */

export interface CityCoord {
  name: string; // 中文城市名
  aliases: string[]; // 别名 / 英文名
  lat: number;
  lng: number;
}

export const CITY_COORDS: CityCoord[] = [
  { name: '北京', aliases: ['beijing', '北京市', '北平'], lat: 39.9042, lng: 116.4074 },
  { name: '上海', aliases: ['shanghai', '上海市'], lat: 31.2304, lng: 121.4737 },
  { name: '广州', aliases: ['guangzhou', '广州市'], lat: 23.1291, lng: 113.2644 },
  { name: '深圳', aliases: ['shenzhen', '深圳市'], lat: 22.5431, lng: 114.0579 },
  { name: '成都', aliases: ['chengdu', '成都市'], lat: 30.5728, lng: 104.0668 },
  { name: '重庆', aliases: ['chongqing', '重庆市'], lat: 29.563, lng: 106.5516 },
  { name: '杭州', aliases: ['hangzhou', '杭州市'], lat: 30.2741, lng: 120.1551 },
  { name: '武汉', aliases: ['wuhan', '武汉市'], lat: 30.5928, lng: 114.3055 },
  { name: '西安', aliases: ["xi'an", 'xian', '西安市', '长安'], lat: 34.3416, lng: 108.9398 },
  { name: '南京', aliases: ['nanjing', '南京市', '金陵'], lat: 32.0603, lng: 118.7969 },
  { name: '天津', aliases: ['tianjin', '天津市'], lat: 39.3433, lng: 117.3616 },
  { name: '苏州', aliases: ['suzhou', '苏州市'], lat: 31.2989, lng: 120.5853 },
  { name: '长沙', aliases: ['changsha', '长沙市'], lat: 28.2282, lng: 112.9388 },
  { name: '青岛', aliases: ['qingdao', '青岛市'], lat: 36.0671, lng: 120.3826 },
  { name: '郑州', aliases: ['zhengzhou', '郑州市'], lat: 34.7466, lng: 113.6253 },
  { name: '沈阳', aliases: ['shenyang', '沈阳市', '盛京'], lat: 41.8057, lng: 123.4315 },
  { name: '大连', aliases: ['dalian', '大连市'], lat: 38.914, lng: 121.6143 },
  { name: '哈尔滨', aliases: ['harbin', '哈尔滨市', '冰城'], lat: 45.8038, lng: 126.534 },
  { name: '昆明', aliases: ['kunming', '昆明市', '春城'], lat: 24.8801, lng: 102.8329 },
  { name: '厦门', aliases: ['xiamen', '厦门市', '鹭岛'], lat: 24.4798, lng: 118.0894 },
  { name: '福州', aliases: ['fuzhou', '福州市', '榕城'], lat: 26.0745, lng: 119.2965 },
  { name: '济南', aliases: ['jinan', '济南市', '泉城'], lat: 36.6512, lng: 117.1201 },
  { name: '合肥', aliases: ['hefei', '合肥市'], lat: 31.8206, lng: 117.2272 },
  { name: '南昌', aliases: ['nanchang', '南昌市', '洪城'], lat: 28.682, lng: 115.8579 },
  { name: '贵阳', aliases: ['guiyang', '贵阳市', '林城'], lat: 26.647, lng: 106.6302 },
  { name: '南宁', aliases: ['nanning', '南宁市'], lat: 22.817, lng: 108.3669 },
  { name: '兰州', aliases: ['lanzhou', '兰州市'], lat: 36.0611, lng: 103.8343 },
  { name: '太原', aliases: ['taiyuan', '太原市', '并州'], lat: 37.8706, lng: 112.5489 },
  { name: '石家庄', aliases: ['shijiazhuang', '石家庄市'], lat: 38.0428, lng: 114.5149 },
  { name: '海口', aliases: ['haikou', '海口市', '椰城'], lat: 20.044, lng: 110.199 },
  { name: '拉萨', aliases: ['lhasa', '拉萨市', '逻些'], lat: 29.65, lng: 91.1 },
  { name: '乌鲁木齐', aliases: ['urumqi', '乌鲁木齐市', '迪化'], lat: 43.8256, lng: 87.6168 },
  { name: '呼和浩特', aliases: ['hohhot', '呼和浩特市', '青城'], lat: 40.8426, lng: 111.749 },
];

export function findCityCoord(query: string): CityCoord {
  const q = query.toLowerCase().trim();
  // 1. exact match on Chinese name
  const byName = CITY_COORDS.find(
    (c) => c.name === query.trim() || c.name.startsWith(query.trim()),
  );
  if (byName) return byName;
  // 2. alias match (case-insensitive)
  const byAlias = CITY_COORDS.find(
    (c) =>
      c.aliases.some((a) => a.toLowerCase() === q) ||
      c.aliases.some((a) => a.toLowerCase().startsWith(q)),
  );
  if (byAlias) return byAlias;
  // 3. fallback to Beijing
  return CITY_COORDS[0];
}
