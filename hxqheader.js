let body = $response.body; // 获取响应体

let jsonBody = JSON.parse(body); // 将字符串形式的响应体解析成 JSON 对象

// 从 qualities 中提取所有 value 值
let valueValues = jsonBody.qualities.map(quality => quality.value);

// 找到 value 的最大值
let maxValue = Math.max(...valueValues);

// 如果 qualities 数组不为空，更新 quality 和 qualityName 字段
if (valueValues.length > 0) {
    jsonBody.quality = maxValue; // 修改 quality 为最大 value 值
    // 找到与最大 value 值对应的质量名称
    let maxQuality = jsonBody.qualities.find(q => q.value === maxValue);
    jsonBody.qualityName = maxQuality ? maxQuality.name : ""; // 更新 qualityName
} 

// 返回修改后的 JSON 对象
$done({ body: JSON.stringify(jsonBody) }); // 将修改后的 JSON 对象转换成字符串，并返回给客户端
