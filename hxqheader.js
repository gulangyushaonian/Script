
let body = $response.body;

let jsonBody = JSON.parse(body);
jsonBody.quality = 11;

$done({ body: JSON.stringify(jsonBody) });
