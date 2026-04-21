/**
 * Quantumult X 脚本 - 修改 Wood 会员信息
 */

let obj = JSON.parse($response.body);

if (obj.data) {
    // 修改会员状态对象
    obj.data.vip = {
        "desc": "会员",
        "value": "YES",
        "code": "YES"
    };
    
    // 修改剩余天数（保持为字符串或根据原格式调整）
    obj.data.remainDay = "9999";
    
    // 修改过期时间戳 (2100-01-01)
    obj.data.vipTerminationTime = 4102444800000;
}

$done({ body: JSON.stringify(obj) });
