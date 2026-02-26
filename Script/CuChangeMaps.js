/**
 * 百度定位 → 打卡坐标联动脚本
 * 适用于 Quantumult X / Surge / Loon
 */

const BAIDU_API =
  "https://api.map.baidu.com/sdkproxy/v2/lbs_iossdk/reverse_geocoding/v3";

const CLOCK_API =
  "https://cu-communityservice.chinaums.com/hr-api/attendance/timeCollectorAttendanceMsg/clock";


// =================================================
// 两个伪造定位返回（完整可用）
// =================================================

const resp1 = {
	"status": 0,
	"result": {
		"location": {
			"lng": 118.12472520947807,
			"lat": 24.479862747274414
		},
		"formatted_address": "福建省厦门市思明区梧村街道双涵路24号",
		"edz": {
			"name": ""
		},
		"business": "莲坂,禾祥西路,湖滨南路",
		"business_info": [
			{
				"name": "莲坂",
				"location": {
					"lng": 118.12666536660886,
					"lat": 24.485998127942157
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			},
			{
				"name": "禾祥西路",
				"location": {
					"lng": 118.10213273297002,
					"lat": 24.472253520131645
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			},
			{
				"name": "湖滨南路",
				"location": {
					"lng": 118.1088269954587,
					"lat": 24.479499115687346
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			}
		],
		"addressComponent": {
			"country": "中国",
			"country_code": 0,
			"region_code_iso": "CHN",
			"country_code_iso": "CHN",
			"country_code_iso2": "CN",
			"province": "福建省",
			"city": "厦门市",
			"city_level": 2,
			"district": "思明区",
			"town": "梧村街道",
			"town_code": "350203008",
			"distance": "19",
			"direction": "附近",
			"adcode": "350203",
			"street": "双涵路",
			"street_number": "24号"
		},
		"pois": [
			{
				"addr": "福建省厦门市思明区湖滨南路366号(地铁1号线莲坂站旁)",
				"cp": "",
				"direction": "内",
				"distance": "0",
				"name": "轻工大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.12437181298155,
					"y": 24.480176583001345
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "35ee23000fb725574f3a59e4",
				"zip": "",
				"popularity_level": "1",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区厦禾路989-999号",
				"cp": " ",
				"direction": "西",
				"distance": "101",
				"name": "源昌商业中心",
				"poiType": "房地产",
				"point": {
					"x": 118.12562045764,
					"y": 24.479707947024433
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "fa835ce2ba523db6e912e4b1",
				"zip": "",
				"popularity_level": "8",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区双涵路16-20号(莲坂地铁站2号出口步行490米)",
				"cp": " ",
				"direction": "东北",
				"distance": "125",
				"name": "裕康花园",
				"poiType": "房地产",
				"point": {
					"x": 118.12376994829006,
					"y": 24.479321526558046
				},
				"tag": "房地产;住宅区",
				"tel": "",
				"uid": "606ab0d09ddd3d2a0f3ddab1",
				"zip": "",
				"popularity_level": "8",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区湖滨南路334号",
				"cp": " ",
				"direction": "南",
				"distance": "163",
				"name": "二轻大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.1244975757529,
					"y": 24.481187844096283
				},
				"tag": "房地产;写字楼",
				"tel": "(0592)5167073",
				"uid": "6b86efdba7b40d16fbf0cb6c",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "湖滨南路334号",
				"cp": " ",
				"direction": "东南",
				"distance": "190",
				"name": "厦门市思明区人民法院",
				"poiType": "政府机构",
				"point": {
					"x": 118.12353638885754,
					"y": 24.480990525503568
				},
				"tag": "政府机构;公检法机构",
				"tel": "(0592)12368",
				"uid": "8e3ccd83344c9f0bb5f42fbe",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区湖滨南路328号",
				"cp": " ",
				"direction": "东",
				"distance": "215",
				"name": "亿宝大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.1227907952845,
					"y": 24.47993815439152
				},
				"tag": "房地产;写字楼",
				"tel": "(0592)5816376",
				"uid": "79cceb360033a3891f5800b0",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区双涵路24号",
				"cp": " ",
				"direction": "附近",
				"distance": "26",
				"name": "裕康花园-24栋",
				"poiType": "房地产",
				"point": {
					"x": 118.12464130463445,
					"y": 24.47965861681894
				},
				"tag": "房地产;内部楼栋",
				"tel": "",
				"uid": "84c58b95531fab337ab55c44",
				"zip": "",
				"popularity_level": "2",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "裕康花园",
					"tag": "房地产;住宅区",
					"addr": "福建省厦门市思明区双涵路16-20号(莲坂地铁站2号出口步行490米)",
					"point": {
						"x": 118.12376994829006,
						"y": 24.479321526558046
					},
					"direction": "东北",
					"distance": "125",
					"uid": "606ab0d09ddd3d2a0f3ddab1",
					"popularity_level": "8"
				}
			},
			{
				"addr": "厦门市思明区厦禾路987号",
				"cp": " ",
				"direction": "西北",
				"distance": "121",
				"name": "城立方",
				"poiType": "房地产",
				"point": {
					"x": 118.12519825405045,
					"y": 24.478959770140353
				},
				"tag": "房地产;住宅区",
				"tel": "",
				"uid": "c2576e4268c073202afc48de",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区厦禾路1126-1128号",
				"cp": " ",
				"direction": "西北",
				"distance": "225",
				"name": "富兴大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.12653672925987,
					"y": 24.479033765856794
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "15e1e85e271775a2591093b1",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦禾路1019号",
				"cp": " ",
				"direction": "西南",
				"distance": "146",
				"name": "厦门珠宝城(裕发广场店)",
				"poiType": "购物",
				"point": {
					"x": 118.12563842375019,
					"y": 24.480735655191562
				},
				"tag": "购物;商铺",
				"tel": "(0592)5365666",
				"uid": "4c488d07a54c1b15a2d230cd",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			}
		],
		"roads": [],
		"poiRegions": [
			{
				"direction_desc": "内",
				"name": "轻工大厦",
				"tag": "房地产;写字楼",
				"uid": "35ee23000fb725574f3a59e4",
				"distance": "0",
				"region_area": 16685.46
			}
		],
		"sematic_description": "轻工大厦内",
		"formatted_address_poi": "福建省厦门市思明区梧村街道轻工大厦",
		"cityCode": 194
	}
};

const resp2 = {
	"status": 0,
	"result": {
		"location": {
			"lng": 118.12475841098528,
			"lat": 24.479853235528513
		},
		"formatted_address": "福建省厦门市思明区梧村街道湖滨南路328号-2号楼",
		"edz": {
			"name": ""
		},
		"business": "莲坂,禾祥西路,湖滨南路",
		"business_info": [
			{
				"name": "莲坂",
				"location": {
					"lng": 118.12666536660886,
					"lat": 24.485998127942157
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			},
			{
				"name": "禾祥西路",
				"location": {
					"lng": 118.10213273297002,
					"lat": 24.472253520131645
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			},
			{
				"name": "湖滨南路",
				"location": {
					"lng": 118.1088269954587,
					"lat": 24.479499115687346
				},
				"adcode": 350203,
				"distance": 0,
				"direction": "内"
			}
		],
		"addressComponent": {
			"country": "中国",
			"country_code": 0,
			"region_code_iso": "CHN",
			"country_code_iso": "CHN",
			"country_code_iso2": "CN",
			"province": "福建省",
			"city": "厦门市",
			"city_level": 2,
			"district": "思明区",
			"town": "梧村街道",
			"town_code": "350203008",
			"distance": "19",
			"direction": "附近",
			"adcode": "350203",
			"street": "湖滨南路",
			"street_number": "328号-2号楼"
		},
		"pois": [
			{
				"addr": "福建省厦门市思明区湖滨南路366号(地铁1号线莲坂站旁)",
				"cp": " ",
				"direction": "东南",
				"distance": "58",
				"name": "轻工大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.12437181298155,
					"y": 24.480176583001345
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "35ee23000fb725574f3a59e4",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区厦禾路989-999号",
				"cp": " ",
				"direction": "西",
				"distance": "97",
				"name": "源昌商业中心",
				"poiType": "房地产",
				"point": {
					"x": 118.12562045764,
					"y": 24.479707947024433
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "fa835ce2ba523db6e912e4b1",
				"zip": "",
				"popularity_level": "8",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区双涵路16-20号(莲坂地铁站2号出口步行490米)",
				"cp": " ",
				"direction": "东北",
				"distance": "127",
				"name": "裕康花园",
				"poiType": "房地产",
				"point": {
					"x": 118.12376994829006,
					"y": 24.479321526558046
				},
				"tag": "房地产;住宅区",
				"tel": "",
				"uid": "606ab0d09ddd3d2a0f3ddab1",
				"zip": "",
				"popularity_level": "8",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区湖滨南路334号",
				"cp": " ",
				"direction": "南",
				"distance": "164",
				"name": "二轻大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.1244975757529,
					"y": 24.481187844096283
				},
				"tag": "房地产;写字楼",
				"tel": "(0592)5167073",
				"uid": "6b86efdba7b40d16fbf0cb6c",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "湖滨南路334号",
				"cp": " ",
				"direction": "东南",
				"distance": "194",
				"name": "厦门市思明区人民法院",
				"poiType": "政府机构",
				"point": {
					"x": 118.12353638885754,
					"y": 24.480990525503568
				},
				"tag": "政府机构;公检法机构",
				"tel": "(0592)12368",
				"uid": "8e3ccd83344c9f0bb5f42fbe",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区湖滨南路328号",
				"cp": " ",
				"direction": "东",
				"distance": "219",
				"name": "亿宝大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.1227907952845,
					"y": 24.47993815439152
				},
				"tag": "房地产;写字楼",
				"tel": "(0592)5816376",
				"uid": "79cceb360033a3891f5800b0",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦门市思明区厦禾路987号",
				"cp": " ",
				"direction": "西北",
				"distance": "119",
				"name": "城立方",
				"poiType": "房地产",
				"point": {
					"x": 118.12519825405045,
					"y": 24.478959770140353
				},
				"tag": "房地产;住宅区",
				"tel": "",
				"uid": "c2576e4268c073202afc48de",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "福建省厦门市思明区双涵路24号",
				"cp": " ",
				"direction": "附近",
				"distance": "27",
				"name": "裕康花园-24栋",
				"poiType": "房地产",
				"point": {
					"x": 118.12464130463445,
					"y": 24.47965861681894
				},
				"tag": "房地产;内部楼栋",
				"tel": "",
				"uid": "84c58b95531fab337ab55c44",
				"zip": "",
				"popularity_level": "2",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "裕康花园",
					"tag": "房地产;住宅区",
					"addr": "福建省厦门市思明区双涵路16-20号(莲坂地铁站2号出口步行490米)",
					"point": {
						"x": 118.12376994829006,
						"y": 24.479321526558046
					},
					"direction": "东北",
					"distance": "127",
					"uid": "606ab0d09ddd3d2a0f3ddab1",
					"popularity_level": "8"
				}
			},
			{
				"addr": "厦门市思明区厦禾路1126-1128号",
				"cp": " ",
				"direction": "西北",
				"distance": "221",
				"name": "富兴大厦",
				"poiType": "房地产",
				"point": {
					"x": 118.12653672925987,
					"y": 24.479033765856794
				},
				"tag": "房地产;写字楼",
				"tel": "",
				"uid": "15e1e85e271775a2591093b1",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			},
			{
				"addr": "厦禾路1019号",
				"cp": " ",
				"direction": "西南",
				"distance": "145",
				"name": "厦门珠宝城(裕发广场店)",
				"poiType": "购物",
				"point": {
					"x": 118.12563842375019,
					"y": 24.480735655191562
				},
				"tag": "购物;商铺",
				"tel": "(0592)5365666",
				"uid": "4c488d07a54c1b15a2d230cd",
				"zip": "",
				"popularity_level": "9",
				"aoi_name": "",
				"alias_name": "",
				"parent_poi": {
					"name": "",
					"tag": "",
					"addr": "",
					"point": {
						"x": 0,
						"y": 0
					},
					"direction": "",
					"distance": "",
					"uid": "",
					"popularity_level": ""
				}
			}
		],
		"roads": [],
		"poiRegions": [],
		"sematic_description": "轻工大厦东南58米",
		"formatted_address_poi": "福建省厦门市思明区梧村街道轻工大厦东南58米",
		"cityCode": 194
	}
};


// =================================================
// 工具函数
// =================================================

// 保留6位小数
function fix6(num) {
  return Number(num).toFixed(6);
}

// 持久化兼容
function write(key, val) {
  if (typeof $prefs !== "undefined") {
    $prefs.setValueForKey(val, key);
  } else {
    $persistentStore.write(val, key);
  }
}

function read(key) {
  if (typeof $prefs !== "undefined") {
    return $prefs.valueForKey(key);
  } else {
    return $persistentStore.read(key);
  }
}


// =================================================
// ① 百度定位接口（Response）
// =================================================
if ($response && $request.url.indexOf(BAIDU_API) !== -1) {

  // 随机返回一个定位
  const fakeResp = Math.random() < 0.5 ? resp1 : resp2;

  try {

    const lng = fix6(fakeResp.result.location.lng);
    const lat = fix6(fakeResp.result.location.lat);

    // 保存坐标
    write("fake_lng", lng);
    write("fake_lat", lat);

    console.log("✅ 已生成随机定位:", lng, lat);

  } catch (e) {
    console.log("❌ 解析定位失败:", e);
  }

  // 返回伪造定位
  $done({
    body: JSON.stringify(fakeResp)
  });

  return;
}


// =================================================
// ② 打卡接口（Request）
// =================================================
if ($request && $request.url.indexOf(CLOCK_API) !== -1) {

  let body = $request.body;

  if (body) {
    try {

      let obj = JSON.parse(body);

      const lng = read("fake_lng");
      const lat = read("fake_lat");

      if (lng && lat) {
        obj.longitude = lng;
        obj.latitude = lat;

        console.log("✅ 打卡坐标已替换:", lng, lat);
      } else {
        console.log("⚠️ 未读取到定位缓存");
      }

      body = JSON.stringify(obj);

    } catch (e) {
      console.log("❌ body解析失败:", e);
    }
  }

  $done({ body });
  return;
}

$done({});
