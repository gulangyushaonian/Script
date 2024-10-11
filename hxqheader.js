let body = $response.body; // 获取响应体

let jsonBody = JSON.parse(body); // 将字符串形式的响应体解析成 JSON 对象

// 从 qualities 中提取所有 vtype 值
let vtypeValues = jsonBody.qualities.map(quality => quality.vtype);

// 找到 vtype 的最大值
let maxVtype = Math.max(...vtypeValues);

// 检查 maxVtype 的值是否为 -Infinity （这意味着 qualities 数组可能为空）
if (maxVtype !== -Infinity) {
    jsonBody.quality = maxVtype; // 修改 quality 为最大 vtype 值
} else {
    // 如果 qualities 为空，保留原来的 quality 值
    console.log("No qualities available to determine max vtype.");
}

// 返回修改后的 JSON 对象
$done({ body: JSON.stringify(jsonBody) }); // 将修改后的 JSON 对象转换成字符串，并返回给客户端
