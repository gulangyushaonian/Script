/***********************
 * 动态随机定位（高精度返回 + 6位打卡）
 ***********************/

const BAIDU_API = "/reverse_geocoding/v3";
const CLOCK_API = "/attendance/timeCollectorAttendanceMsg/clock";

// ===== 公司中心点 =====
const BASE_LNG = 118.124606;
const BASE_LAT = 24.481863;

// 随机范围（米）
const RANDOM_RADIUS = 50;


// ================= 高精度随机坐标 =================
function randomOffset(baseLng, baseLat, radiusMeters) {

  const meterToLat = 1 / 111000;
  const meterToLng = 1 / (111000 * Math.cos(baseLat * Math.PI / 180));

  const r = radiusMeters * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;

  const dLat = r * Math.sin(theta) * meterToLat;
  const dLng = r * Math.cos(theta) * meterToLng;

  // ❗ 不截断，保持高精度
  return {
    lng: baseLng + dLng,
    lat: baseLat + dLat
  };
}


// ================= 百度接口（Response） =================
if ($response && $request.url.includes(BAIDU_API)) {

  let obj = JSON.parse($response.body);

  const newLoc = randomOffset(BASE_LNG, BASE_LAT, RANDOM_RADIUS);

  // ✅ 保持高精度返回（模拟真实GPS）
  obj.result.location.lng = newLoc.lng;
  obj.result.location.lat = newLoc.lat;

  // 保存高精度坐标
  $prefs.setValueForKey(String(newLoc.lng), "fake_lng_full");
  $prefs.setValueForKey(String(newLoc.lat), "fake_lat_full");

  console.log(`📍高精度定位: ${newLoc.lng}, ${newLoc.lat}`);

  $done({ body: JSON.stringify(obj) });
  return;
}


// ================= 打卡接口（Request） =================
if ($request && $request.url.includes(CLOCK_API)) {

  let body = $request.body;

  if (body) {
    try {

      let obj = JSON.parse(body);

      const lngFull = $prefs.valueForKey("fake_lng_full");
      const latFull = $prefs.valueForKey("fake_lat_full");

      if (lngFull && latFull) {

        // ✅ 打卡时才截取6位
        obj.longitude = Number(lngFull).toFixed(6);
        obj.latitude  = Number(latFull).toFixed(6);

        console.log(
          `✅ 打卡坐标(6位): ${obj.longitude}, ${obj.latitude}`
        );
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
