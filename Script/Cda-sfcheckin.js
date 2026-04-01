/*
 * 顺丰速运全任务增强版
 * 1. 保留 Chavy (C大) sfexpress.js 原版 Env 环境库
 * 2. 注入 Python 版任务：马年活动、任务列表扫描、自动领取积分
 */

const $ = new Env('顺丰速运增强版')
const timestamp = Math.round(new Date().getTime())

// 变量声明 (由 C 大重写脚本获取)
let sf_body = $.getdata('sfexpress_body_auth') 
let openid = $.getdata('sfexpress_openid')
let authToken = '' 

!(async () => {
  if (!sf_body) {
    $.msg($.name, '❌ 未获取到授权数据', '请进入顺丰小程序会员中心触发抓包')
    return
  }
  
  $.log(`\n🔔 账号 ID: ${openid || '读取中'}`)
  
  // 1. 登录生成 Token (C 大核心逻辑)
  await login()
  
  if (authToken) {
    $.log(`✅ 鉴权成功，开始执行全任务...`)
    
    // --- 任务流水线 ---
    await dailySign()         // 基础签到 (原版)
    await initHorseYear()     // 马年活动初始化 (新增)
    await browseTasks()       // 浏览任务模拟 (新增)
    await autoFetchRewards()  // 扫描全量列表并收割奖励 (新增)
    await showFinalPoint()    // 查询积分 (原版增强)
    
  } else {
    $.log(`❌ 授权失败，请检查 sfexpress_body_auth 是否过期`)
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// --- [业务逻辑层] 授权登录 ---
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
          $.log(`✅ [Login] 动态 Token 生成成功`)
        }
      } catch (e) { $.logErr(e) }
      resolve()
    })
  })
}

// --- [业务逻辑层] 通用请求封装 ---
function mimpPost(path, body = {}) {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/${path}`,
      headers: {
        'Host': 'mcs-mimp-web.sf-express.com',
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48',
        'Platform': 'MINI_PROGRAM',
        'timestamp': `${timestamp}`
      },
      body: JSON.stringify({
        channelFrom: 'WEIXIN',
        comeFrom: 'vioin',
        openId: openid,
        authToken: authToken,
        ...body
      })
    }
    $.post(url, (error, response, data) => {
      try { resolve(JSON.parse(data)) } 
      catch (e) { resolve({ success: false }) }
    })
  })
}

// --- [任务模块 1] 基础签到 ---
async function dailySign() {
  $.log(`\n[基础签到] 正在签到...`)
  const res = await mimpPost('~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage', {})
  $.log(`📝 结果: ${res.errorMessage || '领取成功'}`)
}

// --- [任务模块 2] 马年活动 (Python 移植) ---
async function initHorseYear() {
  $.log(`\n[活动任务] 正在初始化马年游戏...`)
  const res = await mimpPost('~memberNonactivity~horseYearService~initGame', {})
  $.log(`📝 结果: ${res.success ? '初始化完成' : (res.errorMessage || '跳过')}`)
}

// --- [任务模块 3] 浏览任务模拟 (Python 移植) ---
async function browseTasks() {
  $.log(`\n[浏览任务] 模拟点击特定任务 ID...`)
  const taskIds = ["TA-001", "TA-002", "TA-003"]
  for (let id of taskIds) {
    const res = await mimpPost('~memberNonactivity~integralTaskAppService~finishTask', { taskId: id })
    $.log(`👀 浏览任务 ${id}: ${res.success ? '✅' : '❌'}`)
    await $.wait(1200)
  }
}

// --- [任务模块 4] 奖励全量收割 (Python 移植核心) ---
async function autoFetchRewards() {
  $.log(`\n[奖励收割] 正在扫描全量任务列表...`)
  const list = await mimpPost('~memberNonactivity~integralTaskAppService~getTaskList', { sysCode: 'MCS-MIMP-CORE' })
  if (list.success && list.obj) {
    let count = 0
    for (let item of list.obj) {
      if (item.taskStatus === 2) { // 状态 2: 已完成待领取
        $.log(`🎁 发现待领取奖励: ${item.taskName}`)
        const fetch = await mimpPost('~memberNonactivity~integralTaskAppService~fetchTaskReward', { taskId: item.taskId })
        if (fetch.success) count++
        await $.wait(1500)
      }
    }
    $.log(`✅ 本次自动收割了 ${count} 个任务积分`)
  }
}

// --- [任务模块 5] 积分展示 ---
async function showFinalPoint() {
  const res = await mimpPost('~memberIntegral~userInfoService~queryUserInfo', { sysCode: 'ESG-CEMP-CORE' })
  if (res.success && res.obj) {
    $.log(`\n💰 当前账户总积分: ${res.obj.usablePoint}`)
    $.msg($.name, `✅ 任务完成`, `当前总积分: ${res.obj.usablePoint}`)
  }
}

// --- ⚡️ 经典的 Chavy Env 环境库 (保持原版，禁止改动) ---
function Env(t, e) {
  class s {
    constructor(t) { this.env = t }
    send(t, e = "GET") {
      t = "string" == typeof t ? { url: t } : t;
      let s = this.get;
      return "POST" === e && (s = this.post), new Promise((e, i) => {
        s.call(this, t, (t, s, r) => { t ? i(t) : e(s) })
      })
    }
    get(t) { return this.send.call(this.env, t) }
    post(t) { return this.send.call(this.env, t, "POST") }
  }
  return new (class {
    constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) }
    isQuanX() { return "undefined" != typeof $task }
    isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon }
    isLoon() { return "undefined" != typeof $loon }
    getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.get(t, i) : e } catch (t) { e = "" } } return e }
    getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : null }
    msg(t = this.name, e = "", s = "", i = {}) {
      const r = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } };
      this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(t, e, s, r(i)) : this.isQuanX() && $notify(t, e, s, r(i)));
      let o = ["", "==============📣系统通知📣=============="];
      o.push(t), e && o.push(e), s && o.push(s), console.log(o.join("\n")), this.logs = this.logs.concat(o)
    }
    log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) }
    wait(t) { return new Promise(e => setTimeout(e, t)) }
    done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), $done(t) }
    post(t, e = (() => {})) {
      if (this.isQuanX()) {
        "string" == typeof t && (t = { url: t }), t.method = "POST", $task.fetch(t).then(t => { const { statusCode: s, headers: i, body: r } = t; e(null, { status: s, headers: i }, r) }, t => e(t))
      } else if (this.isSurge() || this.isLoon()) {
        t.method = "POST", $httpClient.post(t, (t, s, i) => { e(t, s, i) })
      }
    }
  })(t, e)
}
