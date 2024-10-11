let body = $response.body; // 获取响应体

let jsonBody = JSON.parse(body); // 将字符串形式的响应体解析成 JSON 对象

// 从 qualities 中提取所有 vtype 值
let vtypeValues = jsonBody.qualities.map(quality => quality.vtype);

// 找到 vtype 的最大值
let maxVtype = Math.max(...vtypeValues);

// 设置 quality 为 vtype 的最大值
jsonBody.quality = maxVtype; // 修改 quality 为最大 vtype 值

// 返回修改后的 JSON 对象
$done({ body: JSON.stringify(jsonBody) }); // 将修改后的 JSON 对象转换成字符串，并返回给客户端
