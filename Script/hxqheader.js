let body = $response.body;

let jsonBody = JSON.parse(body);

// 判断 rescode 是否为 0，如果不是 0，将其修改为 0
if (jsonBody.rescode !== 0) {
    jsonBody.rescode = 0; // 修改 rescode 为 0
}

// 获取 qualities 中的值，并找出最大值
let valueValues = jsonBody.qualities ? jsonBody.qualities.map(quality => quality.value) : [];
let maxValue = valueValues.length > 0 ? Math.max(...valueValues) : 10;

jsonBody.quality = maxValue;

// 获取与最大值对应的质量名称
let maxQuality = jsonBody.qualities ? jsonBody.qualities.find(q => q.value === maxValue) : null;
jsonBody.qualityName = maxQuality ? maxQuality.name : "默认质量";

// 最后返回修改后的 JSON
$done({ body: JSON.stringify(jsonBody) });
