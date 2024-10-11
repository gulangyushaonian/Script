
let body = $response.body;

let jsonBody = JSON.parse(body);
jsonBody.vnjoy = {
    "quality":10
};

$done({ body: JSON.stringify(jsonBody) });
