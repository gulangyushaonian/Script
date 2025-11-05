

let body = $request.body;

if (body) {
  try {
    let obj = JSON.parse(body);

    // 修改经纬度
    obj.longitude = "118.124606";
    obj.latitude = "24.481863";

    // 输出修改后的 body
    body = JSON.stringify(obj);
  } catch (e) {
    console.log("解析 body 出错:", e);
  }
}

$done({ body });
