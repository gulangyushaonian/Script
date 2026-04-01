/*
 * 顺丰速运 (增强任务版)
 * 1. 严格保留 Chavy 原版所有变量名 ($.authToken / $.openid)
 * 2. 在原版 sign() 逻辑后直接追加 Python 任务
 */

const $ = new Env('顺丰速运')
$.idx = 0
$.authToken = ''
$.openid = ''

!(async () => {
  // 1. 获取 C 大原始 Cookie 字段
  $.body = $.getdata('chavy_body_sfexpress')
  if (!$.body) {
    $.msg($.name, '❌ 未获取到数据', '请确保已运行 Cookie 脚本并进入会员中心触发')
    return
  }

  // 解析并提取 openId
  try { $.openid = JSON.parse($.body).openId } catch (e) { $.log(`⚠️ 解析 openId 失败`) }

  // 2. 执行原版登录
  await login()

  // 3. 登录成功后执行任务流
  if ($.authToken) {
    $.log(`\n✅ [Login] 登录成功，开始执行任务流...`)
    await sign()              // 原版签到
    await initActivity()      // 增强：活动初始化
    await autoFetchRewards()  // 增强：全量奖励收割
    await showQuery()         // 原版查询
  } else {
    $.log(`❌ [Login] 登录失败，未获取到 Token`)
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// --- 核心登录 (严格按 C 大逻辑) ---
function login() {
  return new Promise((resolve) => {
    const url = {
      url: `https://ccsp-egmas.sf-express.com/cx-app-member/member/app/user/universalSign`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: $.body
    }
    $.post(url, (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success && res.obj && res.obj.token) {
          $.authToken = res.obj.token
          $.log(`🔑 Token 获取成功: ${$.authToken.substring(0, 10)}...`)
        }
      } catch (e) { $.log(`❌ 登录接口返回异常`) }
      resolve()
    })
  })
}

// --- 原版签到 ---
function sign() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: $.openid, authToken: $.authToken })
    }
    $.post(url, (error, response, data) => {
      try {
        const res = JSON.parse(data)
        $.log(`📝 签到结果: ${res.errorMessage || '成功'}`)
      } catch (e) {}
      resolve()
    })
  })
}

// --- [增强] 自动领取所有任务奖励 ---
async function autoFetchRewards() {
  $.log(`\n[奖励收割] 正在扫描任务列表...`)
  const url = {
    url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskAppService~getTaskList`,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
    body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: $.openid, authToken: $.authToken, sysCode: "MCS-MIMP-CORE" })
  }
  return new Promise((resolve) => {
    $.post(url, async (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success && res.obj) {
          for (let item of res.obj) {
            if (item.taskStatus === 2) { 
              $.log(`🎁 自动领取: ${item.taskName}`)
              await fetchTaskReward(item.taskId)
              await $.wait(1200)
            }
          }
        }
      } catch (e) {}
      resolve()
    })
  })
}

function fetchTaskReward(taskId) {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskAppService~fetchTaskReward`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: $.openid, authToken: $.authToken, taskId: taskId })
    }
    $.post(url, () => resolve())
  })
}

// --- [增强] 活动初始化 ---
function initActivity() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~horseYearService~initGame`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: $.openid, authToken: $.authToken })
    }
    $.post(url, (error, response, data) => {
      $.log(`🏇 活动初始化: ${data.includes('success') ? '✅' : '跳过'}`)
      resolve()
    })
  })
}

// --- 原版查询 ---
function showQuery() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberIntegral~userInfoService~queryUserInfo`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ sysCode: "ESG-CEMP-CORE", openId: $.openid, authToken: $.authToken })
    }
    $.post(url, (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success) {
          $.log(`💰 当前总积分: ${res.obj.usablePoint}`)
          $.msg($.name, `✅ 任务完成`, `当前积分: ${res.obj.usablePoint}`)
        }
      } catch (e) {}
      resolve()
    })
  })
}

// --- ⚡️ 环境库 (原封不动) ---
function Env(t, e) {
  return new (class {
    constructor(t, e) { this.name = t, this.logs = [], this.startTime = (new Date).getTime(), Object.assign(this, e) }
    isQuanX() { return "undefined" != typeof $task }
    isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon }
    isLoon() { return "undefined" != typeof $loon }
    getdata(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : null }
    log(...t) { console.log(t.join("\n")) }
    wait(t) { return new Promise(e => setTimeout(e, t)) }
    done(t = {}) { $done(t) }
    post(t, e = (() => {})) {
      if (this.isQuanX()) { "string" == typeof t && (t = { url: t }), t.method = "POST", $task.fetch(t).then(t => e(null, t, t.body), t => e(t)) }
      else if (this.isSurge() || this.isLoon()) { t.method = "POST", $httpClient.post(t, (t, s, i) => e(t, s, i)) }
    }
    msg(t = this.name, e = "", s = "") { if (this.isSurge() || this.isLoon()) $notification.post(t, e, s); else if (this.isQuanX()) $notify(t, e, s) }
  })(t, e)
}
