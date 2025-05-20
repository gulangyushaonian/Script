var ddm = JSON.parse($response.body);
const expireAt = "2099-09-09 09:09:09";

function calculateDaysToEnd(expireDate) {
  const expire = new Date(expireDate.replace(" ", "T"));
  const today = new Date();
  const diffTime = expire - today;
  return diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
}

const daysLeft = calculateDaysToEnd(expireAt);

Object.assign(ddm.data, {
    "vipTime" : expireAt,
    "hasPaidSvip" : 1,
    "ssvip" : {
      "isVip" : true,
      "vipExpiringDays" : daysLeft,
      "isPaidVip" : true,
      "isTempVip" : false
    },
    "vipType" : "SVIP会员",
    "vipNotifyStatus" : 1,
    "pureSvipTime" : expireAt,
    "svip" : {
      "isVip" : true,
      "vipExpiringDays" : daysLeft,
      "isPaidVip" : true,
      "isTempVip" : false
    },
    "svipTime" : expireAt,
    "svipType" : 1,
    "ssvipTime" : expireAt,
    "trainingCampVip" : {
      "isVip" : true,
      "vipExpiringDays" : daysLeft,
      "isPaidVip" : true,
      "isTempVip" : false
    },
    "vip" : {
      "isVip" : true,
      "vipExpiringDays" : daysLeft,
      "isPaidVip" : true,
      "isTempVip" : false
    }
});

$done({ body: JSON.stringify(ddm) });
