/*
 * 顺丰速运增强版 (基于 Chavy 逻辑移植)
 * 功能：基础签到 + 马年活动 + 任务列表自动扫描 + 浏览任务领取
 * 变量获取：同原版，通过小程序首页或会员中心触发 rewrite
 */

const $ = new Env('顺丰速运增强版')
const notify = $.isNode() ? require('./sendNotify') : ''
const timestamp = Math.round(new Date().getTime())

let sf_headers = $.getdata('sfexpress_headers_mimp') 
let sf_body = $.getdata('sfexpress_body_auth') // universalSign 的 Body
let openid = $.getdata('sfexpress_openid')
let authToken = '' // 动态生成的 Token

!(async () => {
  if (!sf_body) {
    $.msg($.name, '❌ 未获取到授权 Body', '请进入顺丰小程序会员中心触发抓包')
    return
  }
  
  $.log(`\n🔔 开始执行顺丰全任务...`)
  
  // 1. 第一步：自产 Token (C 大核心逻辑)
  await login()
  
  if (authToken) {
    // 2. 第二步：执行 Python 移植的任务流
    await dailySign()         // 基础签到
    await initHorseYear()     // 马年活动初始化
    await browseTasks()       // 模拟浏览任务
    await autoFetchRewards()  // 自动扫描并领取所有奖励
    await showFinalPoint()    // 查询最终积分
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// --- 核心鉴权：生成 Token ---
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
        } else {
          $.log(`❌ Token 生成失败: ${res.errorMessage || '未知错误'}`)
        }
      } catch (e) { $.logErr(e) }
      resolve()
    })
  })
}

// --- 通用请求封装 (针对 mcs-mimp-web 域名) ---
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

// --- 任务 1: 每日基础签到 ---
async function dailySign() {
  $.log(`\n[基础签到] 正在执行...`)
  const res = await mimpPost('~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage', {})
  $.log(`📝 结果: ${res.errorMessage || '领取成功'}`)
}

// --- 任务 2: 马年活动初始化 (Python 移植) ---
async function initHorseYear() {
  $.log(`\n[马年活动] 正在初始化游戏...`)
  const res = await mimpPost('~memberNonactivity~horseYearService~initGame', {})
  $.log(`📝 结果: ${res.success ? '初始化成功' : '活动火爆或已结束'}`)
}

// --- 任务 3: 模拟浏览任务补偿 (Python 移植) ---
async function browseTasks() {
  $.log(`\n[浏览任务] 正在模拟点击...`)
  const taskIds = ["TA-001", "TA-002", "TA-003"]
  for (let id of taskIds) {
    const res = await mimpPost('~memberNonactivity~integralTaskAppService~finishTask', { taskId: id })
    $.log(`👀 任务 ${id}: ${res.success ? '模拟成功' : '跳过'}`)
    await $.wait(1000)
  }
}

// --- 任务 4: 自动收割任务奖励 (核心增强) ---
async function autoFetchRewards() {
  $.log(`\n[奖励扫描] 正在查询任务列表...`)
  const list = await mimpPost('~memberNonactivity~integralTaskAppService~getTaskList', { sysCode: 'MCS-MIMP-CORE' })
  if (list.success && list.obj) {
    for (let item of list.obj) {
      if (item.taskStatus === 2) { // 状态 2: 已完成待领取
        $.log(`🎁 发现可领取奖励: ${item.taskName}`)
        const fetch = await mimpPost('~memberNonactivity~integralTaskAppService~fetchTaskReward', { taskId: item.taskId })
        $.log(`   领取结果: ${fetch.success ? '✅' : '❌'}`)
        await $.wait(1500)
      }
    }
  }
}

// --- 任务 5: 最终积分查询 ---
async function showFinalPoint() {
  const res = await mimpPost('~memberIntegral~userInfoService~queryUserInfo', { sysCode: 'ESG-CEMP-CORE' })
  if (res.success) {
    $.log(`\n💰 任务全部完成！当前总积分: ${res.obj.usablePoint}`)
    if ($.isNode()) {
        // Node 环境下发送通知
    }
  }
}

// --- 环境适配器 (Env 库，简化版) ---
function Env(name) {
  return new (class {
    constructor(name) { this.name = name }
    getdata(key) { return $.isNode() ? process.env[key] : $prefs.valueForKey(key) }
    log(msg) { console.log(msg) }
    logErr(e) { console.log(`❌ Error: ${e}`) }
    wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
    done() { $.log(`\n🏁 执行完毕`); return }
    post(opts, cb) { 
        if ($.isNode()) { const request = require('request'); request.post(opts, cb) }
        else { $task.fetch(opts).then(res => cb(null, res, res.body)) }
    }
  })(name)
}
