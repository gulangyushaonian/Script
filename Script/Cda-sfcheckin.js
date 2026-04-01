/*
 * 顺丰速运全任务增强版
 * 100% 兼容 Chavy 原版 Cookie 字段
 * 修改点：在原有 sign() 逻辑后追加了“全量奖励收割”和“活动初始化”
 */

const $ = new Env('顺丰速运') // 保持原版名称，确保读取 Key 一致
const timestamp = Math.round(new Date().getTime())

// --- 保持原版变量读取逻辑 ---
let sf_body = $.getdata('chavy_body_sfexpress')
let openid = ''
let authToken = ''

!(async () => {
  // 1. 严格执行原版校验
  if (!sf_body) {
    $.msg($.name, '❌ 未获取到授权数据', '请确保已运行 C 大 Cookie 脚本并进入会员中心触发')
    return
  }
  
  // 提取 openid 用于 Python 任务
  try { openid = JSON.parse(sf_body).openId } catch (e) {}

  // 2. 执行原版登录逻辑
  await login()

  if (authToken) {
    $.log(`\n✅ 鉴权成功，开始任务流...`)
    
    // --- 执行任务 ---
    await sign()              // 原版签到
    
    // --- 注入 Python 增强任务 ---
    $.log(`\n[增强任务] 开始收割隐藏积分...`)
    await initActivity()      // 初始化活动接口
    await autoFetchRewards()  // 扫描并领取全量任务积分
    
    await showQuery()         // 原版查询积分
  } else {
    $.log(`❌ 登录失败，请检查网络或 CK`)
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// --- 核心鉴权 (保持原版逻辑) ---
function login() {
  return new Promise((resolve) => {
    const url = {
      url: `https://ccsp-egmas.sf-express.com/cx-app-member/member/app/user/universalSign`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: sf_body
    }
    $.post(url, (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success && res.obj && res.obj.token) {
          authToken = res.obj.token
          $.log(`✅ 动态 Token 获取成功`)
        }
      } catch (e) { $.log(`❌ 登录接口异常`) }
      resolve()
    })
  })
}

// --- 原版签到 (保持原版) ---
function sign() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: openid, authToken: authToken })
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

// --- [新增] Python 版增强：全量奖励收割 ---
async function autoFetchRewards() {
  const url = {
    url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskAppService~getTaskList`,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
    body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: openid, authToken: authToken, sysCode: "MCS-MIMP-CORE" })
  }
  return new Promise((resolve) => {
    $.post(url, async (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success && res.obj) {
          for (let item of res.obj) {
            if (item.taskStatus === 2) { // 已完成待领取
              $.log(`🎁 自动领取奖励: ${item.taskName}`)
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

// 辅助领取函数
function fetchTaskReward(taskId) {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskAppService~fetchTaskReward`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: openid, authToken: authToken, taskId: taskId })
    }
    $.post(url, () => resolve())
  })
}

// --- [新增] 活动初始化 ---
function initActivity() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~horseYearService~initGame`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ channelFrom: "WEIXIN", comeFrom: "vioin", openId: openid, authToken: authToken })
    }
    $.post(url, (error, response, data) => {
      $.log(`🏇 活动初始化: ${data.includes('success') ? '✅' : '跳过'}`)
      resolve()
    })
  })
}

// --- 原版查询 (保持原版) ---
function showQuery() {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberIntegral~userInfoService~queryUserInfo`,
      headers: { 'Content-Type': 'application/json;charset=utf-8', 'Platform': 'MINI_PROGRAM' },
      body: JSON.stringify({ sysCode: "ESG-CEMP-CORE", openId: openid, authToken: authToken })
    }
    $.post(url, (error, response, data) => {
      try {
        const res = JSON.parse(data)
        if (res.success) $.log(`💰 当前总积分: ${res.obj.usablePoint}`)
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
