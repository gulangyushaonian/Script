/*
 * 顺丰速运增强版 (集成完整 Env 环境库)
 * 功能：自动授权 + 基础签到 + 马年活动 + 任务列表扫描领取
 */

const $ = new Env('顺丰速运增强版')
const timestamp = Math.round(new Date().getTime())

let sf_body = $.getdata('sfexpress_body_auth') 
let openid = $.getdata('sfexpress_openid')
let authToken = '' 

!(async () => {
  if (!sf_body) {
    $.msg($.name, '❌ 未获取到授权数据', '请在脚本配置好重写后，进入顺丰小程序会员中心触发')
    return
  }
  
  $.log(`\n🔔 账号: ${openid || '获取中'}`)
  
  // 1. 生成 Token (C 大逻辑)
  await login()
  
  if (authToken) {
    // 2. 执行全量任务
    await dailySign()         // 基础签到
    await initHorseYear()     // 活动初始化
    await browseTasks()       // 模拟浏览
    await autoFetchRewards()  // 自动收割任务奖励
    await showFinalPoint()    // 查询积分
  } else {
    $.msg($.name, '❌ 授权失败', '请检查抓包的 Body 是否过期或格式错误')
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// --- 授权生成 Token ---
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
          $.log(`✅ Token 动态生成成功`)
        }
      } catch (e) { $.logErr(e) }
      resolve()
    })
  })
}

// --- 通用请求 ---
function mimpPost(path, body = {}) {
  return new Promise((resolve) => {
    const url = {
      url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/${path}`,
      headers: {
        'Host': 'mcs-mimp-web.sf-express.com',
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48',
        'Platform': 'MINI_PROGRAM'
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

// --- 任务模块 ---
async function dailySign() {
  const res = await mimpPost('~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage', {})
  $.log(`📝 签到结果: ${res.errorMessage || '成功'}`)
}

async function initHorseYear() {
  const res = await mimpPost('~memberNonactivity~horseYearService~initGame', {})
  $.log(`🏇 马年活动: ${res.success ? '初始化成功' : '跳过'}`)
}

async function browseTasks() {
  const taskIds = ["TA-001", "TA-002", "TA-003"]
  for (let id of taskIds) {
    await mimpPost('~memberNonactivity~integralTaskAppService~finishTask', { taskId: id })
    await $.wait(1000)
  }
}

async function autoFetchRewards() {
  const list = await mimpPost('~memberNonactivity~integralTaskAppService~getTaskList', { sysCode: 'MCS-MIMP-CORE' })
  if (list.success && list.obj) {
    for (let item of list.obj) {
      if (item.taskStatus === 2) {
        $.log(`🎁 自动领取: ${item.taskName}`)
        await mimpPost('~memberNonactivity~integralTaskAppService~fetchTaskReward', { taskId: item.taskId })
        await $.wait(1200)
      }
    }
  }
}

async function showFinalPoint() {
  const res = await mimpPost('~memberIntegral~userInfoService~queryUserInfo', { sysCode: 'ESG-CEMP-CORE' })
  if (res.success) $.log(`💰 当前总积分: ${res.obj.usablePoint}`)
}

// --- ⚡️ 经典的 Chavy Env 环境库 (修复版) ---
function Env(t, e) {
  class s {
    constructor(t) { this.env = t }
    send(t, e = "GET") {
      t = "string" == typeof t ? { url: t } : t
      let s = this.get
      return "POST" === e && (s = this.post), new Promise((e, i) => {
        s.call(this, t, (t, s, r) => { t ? i(t) : e(s) })
      })
    }
    get(t) { return this.send.call(this.env, t) }
    post(t) { return this.send.call(this.env, t, "POST") }
  }
  return new (class {
    constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) }
    isNode() { return "undefined" != typeof module && !!module.exports }
    isQuanX() { return "undefined" != typeof $task }
    isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon }
    isLoon() { return "undefined" != typeof $loon }
    getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.get(t, i) : e } catch (t) { e = "" } } return e }
    getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? process.env[t] : this.data ? this.data[t] : null }
    setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data[t] = e, !0) : !1 }
    log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) }
    logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) }
    wait(t) { return new Promise(e => setTimeout(e, t)) }
    done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) }
    get(t, e = (() => {})) { this.isQuanX() ? ("string" == typeof t && (t = { url: t }), t.method = "GET", $task.fetch(t).then(t => { const { statusCode: s, headers: i, body: r } = t; e(null, { status: s, headers: i }, r) }, t => e(t))) : e() }
    post(t, e = (() => {})) { if (this.isQuanX() ? ("string" == typeof t && (t = { url: t }), t.method = "POST", $task.fetch(t).then(t => { const { statusCode: s, headers: i, body: r } = t; e(null, { status: s, headers: i }, r) }, t => e(t))) : this.isNode()) { this.request = this.request ? this.request : require("request"); const s = Object.assign({ method: "POST" }, t); this.request.post(s, (t, s, i) => { e(t, s, i) }) } }
  })(t, e)
}
