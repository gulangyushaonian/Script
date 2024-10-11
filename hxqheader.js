let body = $response.body; // 获取响应体

let jsonBody = JSON.parse(body); // 将字符串形式的响应体解析成 JSON 对象

// 从 qualities 中提取所有 vtype 值
let vtypeValues = jsonBody.qualities.map(quality => quality.vtype);

// 找到 vtype 的最大值
let maxVtype = Math.max(...vtypeValues);

// 如果 qualities 数组不为空，更新 quality 字段
if (vtypeValues.length > 0) {
    jsonBody.quality = maxVtype; // 修改 quality 为最大 vtype 值
    jsonBody.qualityName = jsonBody.qualities.find(q => q.vtype === maxVtype).name; // 更新 qualityName
} else {
    console.log("No qualities available to determine max vtype."); // 提示信息
}

// 返回修改后的 JSON 对象
$done({ body: JSON.stringify(jsonBody) }); // 将修改后的 JSON 对象转换成字符串，并返回给客户端
