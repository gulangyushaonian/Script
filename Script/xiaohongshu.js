// 2023-12-20 19:00

const url = $request.url;
const isQuanX = typeof $task !== "undefined";
if (!$response.body) $done({});
let obj = JSON.parse($response.body);

// 递归遍历对象，修改 disable_save、disable_watermark 和 disable_weibo_cover
function updateMediaSaveConfig(obj) {
  if (obj && typeof obj === "object") {
    for (let key in obj) {
      if (key === "disable_save") {
        obj[key] = false;  // 允许保存
      } else if (key === "disable_watermark") {
        obj[key] = true;   // 去除水印
      } else if (key === "disable_weibo_cover") {
        obj[key] = true;   // 去除微博封面
      } else if (typeof obj[key] === "object") {
        updateMediaSaveConfig(obj[key]);  // 递归遍历嵌套对象
      }
    }
  }
}

// 在处理数据前统一调用
updateMediaSaveConfig(obj);

if (url.includes("/v1/note/imagefeed") || url.includes("/v2/note/feed")) {
  if (obj?.data?.length > 0) {
    let data0 = obj.data[0];
    if (data0?.note_list?.length > 0) {
      for (let item of data0.note_list) {
        if (item?.share_info?.function_entries?.length > 0) {
          const additem = { type: "video_download" };
          let func = item.share_info.function_entries[0];
          if (func?.type !== "video_download") {
            item.share_info.function_entries.unshift(additem);
          }
        }
      }
    }
    if (isQuanX) {
      $prefs.removeValueForKey("redBookLivePhoto");
      $prefs.setValueForKey(JSON.stringify(obj.data[0].note_list[0].images_list), "redBookLivePhoto");
    } else {
      $persistentStore.write("", "redBookLivePhoto");
      $persistentStore.write(JSON.stringify(obj.data[0].note_list[0].images_list), "redBookLivePhoto");
    }
  }
} else if (url.includes("/v1/note/live_photo/save")) {
  let livePhoto;
  let newDatas = [];
  if (isQuanX) {
    livePhoto = JSON.parse($prefs.valueForKey("redBookLivePhoto"));
  } else {
    livePhoto = JSON.parse($persistentStore.read("redBookLivePhoto"));
  }
  if (livePhoto?.length > 0) {
    for (let item of livePhoto) {
      if (item.live_photo_file_id) {
        let myData = {
          file_id: item.live_photo_file_id,
          video_id: item.live_photo.media.video_id,
          url: item.live_photo.media.stream.h265[0].master_url
        };
        newDatas.push(myData);
      }
    }
  }
  if (obj?.data?.datas?.length > 0) {
    obj.data.datas.forEach((itemA) => {
      newDatas.forEach((itemB) => {
        if (itemB.file_id === itemA.file_id && itemA.url.includes(".mp4")) {
          itemA.url = itemB.url;
        }
      });
    });
  } else {
    obj = { code: 0, success: true, msg: "成功", data: { datas: newDatas } };
  }
} else if (url.includes("/v1/search/banner_list")) {
  if (obj?.data) {
    obj.data = {};
  }
} else if (url.includes("/v1/search/hot_list")) {
  if (obj?.data?.items?.length > 0) {
    obj.data.items = [];
  }
} else if (url.includes("/v2/system_service/splash_config")) {
  if (obj?.data?.ads_groups?.length > 0) {
    for (let i of obj.data.ads_groups) {
      i.start_time = 3818332800;
      i.end_time = 3818419199;
      if (i?.ads?.length > 0) {
        for (let ii of i.ads) {
          ii.start_time = 3818332800;
          ii.end_time = 3818419199;
        }
      }
    }
  }
}

$done({ body: JSON.stringify(obj) });
