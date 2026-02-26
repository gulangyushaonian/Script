/***********************
 * 动态随机定位脚本
 ***********************/

const BAIDU_API = "/reverse_geocoding/v3";
const CLOCK_API = "/attendance/timeCollectorAttendanceMsg/clock";

// ===== 你的中心点（公司位置）=====
const BASE_LNG = 118.124606;
const BASE_LAT = 24.481863;

// 随机范围（米）
const RANDOM_RADIUS = 50;


// ================= 随机坐标函数 =================
function randomOffset(baseLng, baseLat, radiusMeters) {

  const meterToLat = 1 / 111000;
  const meterToLng = 1 / (111000 * Math.cos(baseLat * Math.PI / 180));

  const r = radiusMeters * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;

  const dLat = r * Math.sin(theta) * meterToLat;
  const dLng = r * Math.cos(theta) * meterToLng;

  return {
    lng: (baseLng + dLng).toFixed(6),
    lat: (baseLat + dLat).toFixed(6)
  };
}


// ================= 百度接口 =================
if ($response && $request.url.includes(BAIDU_API)) {

  let obj = JSON.parse($response.body);

  const newLoc = randomOffset(BASE_LNG, BASE_LAT, RANDOM_RADIUS);

  // 修改百度返回
  obj.result.location.lng = Number(newLoc.lng);
  obj.result.location.lat = Number(newLoc.lat);

  // 保存给打卡接口使用
  $prefs.setValueForKey(newLoc.lng, "fake_lng");
  $prefs.setValueForKey(newLoc.lat, "fake_lat");

  console.log(`📍随机定位: ${newLoc.lng}, ${newLoc.lat}`);

  $done({ body: JSON.stringify(obj) });
  return;
}


// ================= 打卡接口 =================
if ($request && $request.url.includes(CLOCK_API)) {

  let body = $request.body;

  if (body) {
    try {

      let obj = JSON.parse(body);

      const lng = $prefs.valueForKey("fake_lng");
      const lat = $prefs.valueForKey("fake_lat");

      if (lng && lat) {
        obj.longitude = lng;
        obj.latitude = lat;
      }

      body = JSON.stringify(obj);

    } catch (e) {
      console.log("解析 body 出错:", e);
    }
  }

  $done({ body });
  return;
}

$done({});
