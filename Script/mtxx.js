/*

by：https://iosgs.xyz/gzFile/quanX/mtxx.conf

【Quantumult_X】

[rewrite_local]
^https?://(api|h5).xiuxiu.meitu.com/(v1/user/show.json|v1/vip/vip_show.json|v1/vip/prompt/query.json|v1/h5/vip/sub_detail.json|v1/h5/user/self_show.json|v1/h5/vip/user_detail.json|v1/vip/prompt/query.json|v1/vip/prompt/query.json) url script-response-body https://raw.githubusercontent.com/githubdulong/Script/master/Mtxx.js

[MITM]
hostname: api.xiuxiu.meitu.com, h5.xiuxiu.meitu.com

************************************************



【Surge】

[Script]
美图秀秀 = requires-body=1,max-size=0,script-path=https://raw.githubusercontent.com/githubdulong/Script/master/Mtxx.js,type=http-response,pattern=^https?://(api|h5).xiuxiu.meitu.com/(v1/user/show.json|v1/vip/vip_show.json|v1/vip/prompt/query.json|v1/h5/vip/sub_detail.json|v1/h5/user/self_show.json|v1/h5/vip/user_detail.json|v1/vip/prompt/query.json|v1/vip/prompt/query.json)
美图秀秀-zj = requires-body=1,max-size=0,script-path=https://raw.githubusercontent.com/githubdulong/Script/master/Mtxx.js,type=http-response,pattern=^https?://(api|h5).xiuxiu.meitu.com/(?!(v\d/feed/|v\d/search/|v\d/channel/))

[MITM]
hostname: api.xiuxiu.meitu.com, h5.xiuxiu.meitu.com

*/

var obj = JSON.parse($response.body);

// 如果请求的 URL 包含 v1/vip/vip_show.json，则进行特殊处理，否则保持原样
if ($request.url.includes("/v1/vip/vip_show.json")) {
    obj = {
        "degrade": 0,
        "ret": 0,
        "error_code": 0,
        "error": "Ok",
        "msg": "成功",
        "data": {
            "vip_type": 1,
            "expire_days": -9999999999,
            "is_expire": 0,
            "in_valid_time": 5576488923,
            "is_valid_user": 1,
            "valid_time": 5576488923,
            "home_prompt": "粉钻会员 2100年1月1日到期",
            "home_btn_prompt": "已解锁"
        }
    };
} else {
    // 否则，进行普通的修改处理
    obj.data.vip_type = 1;
    obj.data.expire_days = -9999999999;
    obj.data.is_expire = 0;
    obj.data.in_valid_time = 5576488923;
    obj.data.is_valid_user = 1;
    obj.data.valid_time = 5576488923;
    obj.data.home_prompt = "粉钻会员 2100年1月1日到期";
    obj.data.home_btn_prompt = "已解锁";
}

$done({ body: JSON.stringify(obj) });
