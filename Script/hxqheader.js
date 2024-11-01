let body = $response.body;

let jsonBody = JSON.parse(body);

if (jsonBody.rescode !== 0) {
    jsonBody.quality = 10;
    $done({ body: JSON.stringify(jsonBody) });
}

let valueValues = jsonBody.qualities ? jsonBody.qualities.map(quality => quality.value) : [];
let maxValue = valueValues.length > 0 ? Math.max(...valueValues) : 10;

jsonBody.quality = maxValue;

let maxQuality = jsonBody.qualities ? jsonBody.qualities.find(q => q.value === maxValue) : null;
jsonBody.qualityName = maxQuality ? maxQuality.name : "默认质量";

$done({ body: JSON.stringify(jsonBody) });
