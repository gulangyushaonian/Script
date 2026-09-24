/*
顺丰速运 多账号 · 签到 + 日常任务 + 超值福利 + 采蜜换大礼 + 会员日
作者：gulangyushaonian / 修复增强版
获取 token：配合 Cda-sfexpress.cookie.js（QX 开重写，打开【顺丰 APP → 我的】，捕获 universalSign）

====================================
[task_local]
1 0 * * * https://raw.githubusercontent.com/gulangyushaonian/Script/main/Script/Cda-sfcheckin.js, tag=顺丰速运签到, enabled=true

[mitm]
hostname = mcs-mimp-web.sf-express.com
====================================

v4 登录流程（对齐 chavyleung 原版，这才是对的）：
  1. 重放捕获到的 APP 登录请求（ccsp-egmas.sf-express.com/.../universalSign），
     回包里的 obj.sign 才是换取网页会话的钥匙。
  2. 用该 sign 请求 shareRedirect，由服务端下发 mcs-mimp-web 的会话 Cookie。
  3. 业务请求不硬塞抓包时的旧 Cookie（那是另一个域名的，塞进去反而导致「用户信息失效」），
     只带上本轮从响应里收割到的新 Cookie；QX 自带 cookie 罐同时也在工作，双保险。
  4. 失效关键字判定补上「用户信息失效」，命中即停，不再空刷后面 4 个接口。
*/

const $ = new Env('顺丰速运')
$.KEY_login = 'chavy_login_sfexpress'
$.is_debug = 'false'
$.messages = []

// ==================== 功能开关 ====================
const CFG = {
  sign: true,          // 每日签到
  welfare: true,       // 超值福利签到红包
  dailyTask: true,     // 日常任务（去完成 + 领积分）
  honey: true,         // 采蜜换大礼
  memberDay: true,     // 会员日（仅每月 26-28 号执行）
  honeyGameRounds: 3,  // 采蜜大冒险次数（原版 5 次，降低风控概率）
  maxPacketLevel: 8,   // 会员日红包最高等级
  inviteUserId: '',    // 可选：邀请人 userId（留空则用本账号 userId）
  cleanDead: true,     // 移除连登录 URL 都没有的坏数据
  retryLogin: true,    // 失效时自动重新登录并重试一次
  waitAccount: 2000    // 账号之间间隔（毫秒）
}

const SIGN_TOKEN = 'wwesldfs29aniversaryvdld29'
// shareRedirect 固定 bizCode（原版保持一致）
const BIZ_CODE = '647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw=='
const SYS_CODE = 'MCS-MIMP-CORE'
const API_BASE = 'https://mcs-mimp-web.sf-express.com/mcs-mimp/'

// Cookie 属性名（解析 Set-Cookie 时要跳过）。必须声明在 IIFE 之前，否则 TDZ 报错
const COOKIE_ATTRS = ['path', 'domain', 'expires', 'max-age', 'httponly', 'secure', 'samesite', 'version', 'comment']

const U = {
  sign: API_BASE + 'commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage',
  taskQuery: API_BASE + 'commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES',
  taskFinish: API_BASE + 'commonRoutePost/memberEs/taskRecord/finishTask',
  taskReward: API_BASE + 'commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral',
  shareRedirect: API_BASE + 'share/app/shareRedirect',
  welfare: API_BASE + 'commonPost/~memberActLengthy~redPacketActivityService~superWelfare~receiveRedPacket',
  honeyTaskDetail: API_BASE + 'commonPost/~memberNonactivity~receiveExchangeIndexService~taskDetail',
  honeyIndex: API_BASE + 'commonPost/~memberNonactivity~receiveExchangeIndexService~indexData',
  honeyExpand: API_BASE + 'commonPost/~memberNonactivity~receiveExchangeIndexService~expand',
  honeyReceive: API_BASE + 'commonPost/~memberNonactivity~receiveExchangeIndexService~receiveHoney',
  honeyGame: API_BASE + 'commonPost/~memberNonactivity~receiveExchangeGameService~gameReport',
  honeyFinish: API_BASE + 'commonPost/~memberEs~taskRecord~finishTask',
  couponList: API_BASE + 'commonPost/~memberGoods~mallGoodsLifeService~list',
  couponOrder: API_BASE + 'commonPost/~memberGoods~pointMallService~createOrder',
  mdIndex: API_BASE + 'commonPost/~memberNonactivity~memberDayIndexService~index',
  mdInviteAward: API_BASE + 'commonPost/~memberNonactivity~memberDayIndexService~receiveInviteAward',
  mdLottery: API_BASE + 'commonPost/~memberNonactivity~memberDayLotteryService~lottery',
  mdTaskList: API_BASE + 'commonPost/~memberNonactivity~activityTaskService~taskList',
  mdFinish: API_BASE + 'commonPost/~memberNonactivity~memberEs~taskRecord~finishTask',
  mdReward: API_BASE + 'commonPost/~memberNonactivity~activityTaskService~fetchMixTaskReward',
  mdPacketStatus: API_BASE + 'commonPost/~memberNonactivity~memberDayPacketService~redPacketStatus',
  mdPacketMerge: API_BASE + 'commonPost/~memberNonactivity~memberDayPacketService~redPacketMerge',
  mdPacketDraw: API_BASE + 'commonPost/~memberNonactivity~memberDayPacketService~redPacketDraw'
}

// ==================== 主流程 ====================
!(async () => {
  const raw = $.getdata($.KEY_login)
  let accounts = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      accounts = Array.isArray(parsed) ? parsed : [parsed]
    } catch (e) {
      accounts = []
    }
  }
  accounts = accounts.filter((a) => a && a.url)

  if (accounts.length === 0) {
    const tip = '❌ 未找到顺丰账号\n请在【顺丰 APP → 我的】里操作一次以获取 token' + '\n（抓的是 universalSign 接口，只有 APP 端才有）'
    $.msg($.name, '未找到账号', tip)
    await sendMsg(tip)
    return
  }

  $.log(`\n🔔 发现 ${accounts.length} 个顺丰账号，开始执行...\n`)
  const blocks = []
  const dead = []
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]
    const tag = `账号${i + 1}`
    try {
      const lines = await runAccount(acc, tag)
      $.log(`\n${lines.join('\n')}`)
      blocks.push(lines.join('\n'))
    } catch (e) {
      $.logErr(e)
      blocks.push(`👤 ${tag} ${acc.mobile || ''}\n❌ 执行异常: ${e.message || e}`)
    }
    if (acc.__dead) dead.push(acc)
    if (i < accounts.length - 1) await $.wait(CFG.waitAccount)
  }

  if (dead.length > 0 && CFG.cleanDead) {
    const alive = accounts.filter((a) => !a.__dead)
    $.setdata(JSON.stringify(alive), $.KEY_login)
    blocks.push(`🧹 已自动移除 ${dead.length} 个无效账号，当前剩余 ${alive.length} 个`)
    $.log(`🧹 已自动移除 ${dead.length} 个无效账号`)
  }

  const msg = blocks.join('\n\n')
  $.msg($.name, `执行结果 · 共 ${accounts.length} 个账号`, msg)
  await sendMsg(msg)
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// ==================== 单账号执行 ====================
async function runAccount(acc, tag) {
  const jar = {} // 只装本轮响应收割到的新 Cookie，绝不复用抓包旧值
  const st = {
    mobile: String(acc.mobile || '').trim() || getMobile(acc),
    userId: String(acc.userId || '').trim() || getUserId(acc),
    ua: getUA(acc),
    jar: jar,
    black: false,
    retried: false,
    loginOk: false
  }
  const L = [`👤 ${tag} ${st.mobile || '(未知手机号)'}`]

  if (!acc.url || !acc.body) {
    acc.__dead = true
    L.push('❌ 存储里缺 url/body（不是有效的登录请求存档），请重新获取 token（会从列表移除）')
    return L
  }

  // 1. 用捕获的登录 URL 重新建立会话（拿刷新后的 Cookie）
  await establishSession(acc, st, L)

  // 2. 签到
  if (CFG.sign) await doSign(st, L, acc)

  // 3. 超值福利
  if (CFG.welfare && !st.black) await doWelfare(st, L)

  // 4. 日常任务 + 积分
  if (CFG.dailyTask && !st.black) await doDailyTasks(st, L, acc)

  // 5. 采蜜换大礼
  if (CFG.honey && !st.black) await doHoney(st, L, acc)

  // 6. 会员日（仅 26-28 号）
  if (CFG.memberDay && !st.black) await doMemberDay(st, L, acc)

  if (st.black) {
    L.push(`⛔ 该账号登录态无效，已跳过其余任务`)
    L.push(`   └ 当前 Cookie 键: ${Object.keys(st.jar).join(', ') || '(空)'}`)
  }
  return L
}

// -------------------- 会话建立（对齐原版：重放 APP 登录 → 换 web 会话） --------------------
async function establishSession(acc, st, L) {
  let sign = ''

  // (a) 重放捕获到的 APP 登录请求，回包里取 obj.sign
  try {
    const r = await $.http.post({
      url: acc.url,
      body: acc.body,
      headers: cleanReplayHeaders(acc.headers)
    })
    harvest(resp_cookies(r), st) // 顺手收割（本域名的响应，安全）
    const d = safeJson(r && r.body)
    if (d && d.obj && d.obj.sign) sign = String(d.obj.sign)
    else if (d && !d.success) $.log(`⚠️ APP 登录返回失败: ${d.errorMessage || JSON.stringify(d).slice(0, 120)}`)
  } catch (e) {
    L.push(`⚠️ APP 登录请求失败: ${e.message || e}`)
  }

  // 兜底：捕获 URL 自带 sign
  if (!sign) sign = extractSign(acc.url)

  if (!sign) {
    L.push('❌ 未取到 sign（登录回包无 obj.sign，URL 也没有 sign 参数）')
    return false
  }
  st.sign = sign

  // (b) 用 sign 换 mcs-mimp-web 的会话 Cookie
  try {
    const r2 = await rawRequest(
      'GET',
      `${U.shareRedirect}?sign=${encodeURIComponent(sign)}&source=SFAPP&bizCode=${BIZ_CODE}`,
      st
    )
    const n = harvest(resp_cookies(r2), st)
    $.log(`🔑 sign 换取会话: 新 Cookie ${n} 项${n ? '（' + Object.keys(st.jar).join(', ') + '）' : ''}`)
  } catch (e) {
    L.push(`⚠️ shareRedirect 失败: ${e.message || e}`)
  }

  st.loginOk = true
  return true
}

// 重放登录请求时：去掉会造成冲突/失效的头部，但保留 APP 自定义头（syscode/platform 等）
function cleanReplayHeaders(headers) {
  const drop = ['cookie', 'host', 'content-length', 'connection', 'accept-encoding']
  const out = {}
  const src = headers || {}
  Object.keys(src).forEach((k) => {
    if (drop.indexOf(k.toLowerCase()) >= 0) return
    out[k] = src[k]
  })
  if (!hasHeaderKey(out, 'content-type')) out['Content-Type'] = 'application/json'
  return out
}

function hasHeaderKey(headers, name) {
  const keys = Object.keys(headers || {})
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === name) return true
  }
  return false
}

// -------------------- 签到 --------------------
async function doSign(st, L, acc) {
  let r = await apiPost(st, U.sign, { comeFrom: 'vioin', channelFrom: 'WEIXIN' })

  // 失效 → 重新登录并重试一次
  if (!(r.ok && r.data.success) && isAuthFail(errText(r)) && CFG.retryLogin && !st.retried) {
    st.retried = true
    L.push('🔁 登录态失效，重新登录后重试…')
    await establishSession(acc, st, L)
    r = await apiPost(st, U.sign, { comeFrom: 'vioin', channelFrom: 'WEIXIN' })
  }

  if (r.ok && r.data.success) {
    const obj = r.data.obj || {}
    const pk = obj.integralTaskSignPackageVOList
    if (pk && pk.length) {
      L.push(`✅ 签到: 成功，获得【${pk[0].packetName || '奖励'}】，本周累计 ${obj.countDay || 0} 天`)
    } else {
      L.push(`📝 签到: 今日已签到，本周累计 ${obj.countDay || 0} 天`)
    }
    return
  }

  L.push(`❌ 签到失败: ${errText(r)}`)
  if (isAuthFail(errText(r))) {
    st.black = true
    L.push('   └ 说明：顺丰拒绝了这次登录态。请在【顺丰 APP → 我的】里重新获取 token（抓包目标是 universalSign，只有 APP 端才有）。')
    L.push(`   └ 已带上的 Cookie 键: ${Object.keys(st.jar).join(', ') || '(空)'}`)
  }
}

// -------------------- 超值福利 --------------------
async function doWelfare(st, L) {
  const r = await apiPost(st, U.welfare, { channel: 'czflqdlhbxcx' })
  if (r.ok && r.data.success) {
    const obj = r.data.obj || {}
    let gifts = obj.giftList || []
    if (obj.extraGiftList && obj.extraGiftList.length) gifts = gifts.concat(obj.extraGiftList)
    const names = gifts.map((g) => g.giftName).filter(Boolean).join('、')
    const status = obj.receiveStatus === 1 ? '领取成功' : '今日已领过'
    L.push(`🎁 超值福利: ${status}${names ? '（' + names + '）' : ''}`)
  } else {
    L.push(`📝 超值福利: ${errText(r)}`)
    markBlack(st, r)
  }
}

// -------------------- 日常任务 --------------------
async function doDailyTasks(st, L, acc) {
  let q = await apiPost(st, U.taskQuery, { channelType: '1', deviceId: deviceId() })
  if (!(q.ok && q.data.success) && isAuthFail(errText(q)) && CFG.retryLogin && !st.retried) {
    st.retried = true
    await establishSession(acc, st, L)
    q = await apiPost(st, U.taskQuery, { channelType: '1', deviceId: deviceId() })
  }
  if (!(q.ok && q.data.success && q.data.obj)) {
    L.push(`📝 日常任务: 查询失败(${errText(q)})`)
    markBlack(st, q)
    return
  }
  const obj = q.data.obj
  const before = num(obj.totalPoint)
  const tasks = obj.taskTitleLevels || []

  // 需要真去操作 App/下单 的任务，自动跳过，避免刷接口
  const skipTitles = ['用行业模板寄件下单', '去新增一个收件偏好', '参与积分活动']
  let finished = 0
  let rewarded = 0
  const details = []

  for (const t of tasks) {
    if (t.status === 3) continue
    if (skipTitles.indexOf(t.title) >= 0) {
      details.push(`${t.title}: 跳过（需手动）`)
      continue
    }
    if (t.taskCode) {
      const f = await apiPost(st, U.taskFinish, { taskCode: t.taskCode })
      if (f.ok && f.data.success) finished++
      else details.push(`${t.title}: 完成失败(${errText(f)})`)
      await $.wait(1500)
    }
    const g = await apiPost(st, U.taskReward, {
      strategyId: t.strategyId,
      taskId: t.taskId,
      taskCode: t.taskCode,
      deviceId: deviceId()
    })
    if (g.ok && g.data.success) rewarded++
    else details.push(`${t.title}: 领奖失败(${errText(g)})`)
    await $.wait(1200)
    markBlack(st, g)
    if (st.black) break
  }

  const q2 = await apiPost(st, U.taskQuery, { channelType: '1', deviceId: deviceId() })
  let after = before
  if (q2.ok && q2.data.success && q2.data.obj) after = num(q2.data.obj.totalPoint)

  L.push(
    `💰 积分: ${before} → ${after}${after - before > 0 ? `（+${after - before}）` : ''}` +
      `｜任务: 完成${finished}项 领取${rewarded}项`
  )
  if (details.length) L.push(`   └ ${details.slice(0, 6).join('；')}`)
}

// -------------------- 采蜜换大礼 --------------------
async function doHoney(st, L, acc) {
  let list = await apiPost(st, U.honeyTaskDetail, {}, 'honey')
  if (!(list.ok && list.data.success) && isAuthFail(errText(list)) && CFG.retryLogin && !st.retried) {
    st.retried = true
    await establishSession(acc, st, L)
    list = await apiPost(st, U.honeyTaskDetail, {}, 'honey')
  }
  if (!(list.ok && list.data.success && list.data.obj && list.data.obj.list)) {
    L.push(`📝 采蜜: ${errText(list)}`)
    markBlack(st, list)
    return
  }

  const items = list.data.obj.list
  let done = 0
  let got = 0
  for (const item of items) {
    if (st.black) break
    const type = item.taskType
    if (item.status === 3) continue
    try {
      if (type === 'DAILY_VIP_TASK_TYPE') {
        if (await claimCoupon(st)) got++
      } else if (item.taskCode) {
        const f = await apiPost(st, U.honeyFinish, { taskCode: item.taskCode }, 'honey')
        if (f.ok && f.data.success) done++
        else L.push(`   └ 采蜜任务[${type}]: ${errText(f)}`)
      }
      if (type === 'BEES_GAME_TASK_TYPE') {
        const g = await honeyAdventure(st)
        if (g) got++
      }
    } catch (e) {
      L.push(`   └ 采蜜任务[${type}]异常: ${e.message || e}`)
    }
    await $.wait(1500)
  }

  const idx = await apiPost(st, U.honeyIndex, invitePayload(st), 'honey')
  let honeyInfo = ''
  if (idx.ok && idx.data.success && idx.data.obj) {
    const obj = idx.data.obj
    const taskDetail = obj.taskDetail || []
    let receive = 0
    for (const t of taskDetail) {
      if (st.black) break
      const r = await apiPost(st, U.honeyReceive, { taskType: t.type }, 'honey')
      if (r.ok && r.data.success) receive++
      await $.wait(1500)
    }
    const end = await apiPost(st, U.honeyIndex, invitePayload(st), 'honey')
    const usable = end.ok && end.data.success && end.data.obj ? num(end.data.obj.usableHoney) : num(obj.usableHoney)
    const endTime = obj.activityEndTime ? `（本期 ${String(obj.activityEndTime).slice(0, 10)} 结束）` : ''
    honeyInfo = `丰蜜 ${usable}${endTime}｜收取${receive}次 任务${done}项`
  } else {
    honeyInfo = `查询失败(${errText(idx)})`
  }

  L.push(`🍯 采蜜: ${honeyInfo}`)
}

async function honeyAdventure(st) {
  for (let i = 0; i < CFG.honeyGameRounds; i++) {
    const r = await apiPost(st, U.honeyGame, { gatherHoney: 20 }, 'honey')
    if (r.ok && r.data.success) {
      await $.wait(1200)
      continue
    }
    if (errText(r).indexOf('容量不足') >= 0) {
      await apiPost(st, U.honeyExpand, {}, 'honey')
      await $.wait(1200)
      continue
    }
    return false
  }
  return true
}

// 生活特权领券（采蜜 VIP 任务）
async function claimCoupon(st) {
  const r = await apiPost(st, U.couponList, { memGrade: 2, categoryCode: 'SHTQ', showCode: 'SHTQWNTJ' }, 'honey')
  if (!(r.ok && r.data.success)) return false
  const groups = r.data.obj
  if (!Array.isArray(groups)) return false
  let goods = []
  for (const g of groups) {
    if (g && Array.isArray(g.goodsList)) goods = goods.concat(g.goodsList)
  }
  for (const item of goods) {
    if (num(item.exchangeTimesLimit) < 1) continue
    const o = await apiPost(
      st,
      U.couponOrder,
      {
        from: 'Point_Mall',
        orderSource: 'POINT_MALL_EXCHANGE',
        goodsNo: item.goodsNo,
        quantity: 1,
        taskCode: 'DAILY_VIP_TASK_TYPE'
      },
      'honey'
    )
    if (o.ok && o.data.success) return true
  }
  return false
}

// -------------------- 会员日 --------------------
async function doMemberDay(st, L, acc) {
  const day = new Date().getDate()
  if (day < 26 || day > 28) {
    L.push('🎭 会员日: 未到活动时间（每月 26-28 号）')
    return
  }

  const idx = await apiPost(st, U.mdIndex, invitePayload(st))
  if (!(idx.ok && idx.data.success) || !idx.data.obj) {
    L.push(`📝 会员日: ${errText(idx)}`)
    markBlack(st, idx)
    return
  }
  const info = idx.data.obj
  const lotteryNum = num(info.lotteryNum)
  const parts = []

  if (info.canReceiveInviteAward) {
    const a = await apiPost(st, U.mdInviteAward, invitePayload(st))
    parts.push(a.ok && a.data.success ? '邀请奖励已领' : `邀请奖励失败(${errText(a)})`)
  }

  for (let i = 0; i < lotteryNum; i++) {
    if (st.black) break
    const r = await apiPost(st, U.mdLottery, {})
    if (r.ok && r.data.success) parts.push(`抽奖得【${(r.data.obj && r.data.obj.productName) || '空气'}】`)
    else {
      parts.push(`抽奖失败(${errText(r)})`)
      markBlack(st, r)
    }
    await $.wait(1200)
  }

  const packet = await doRedPacket(st)
  if (packet) parts.push(packet)

  const tasks = await doMemberDayTasks(st)
  if (tasks) parts.push(tasks)

  L.push(`🎭 会员日: ${parts.length ? parts.join('；') : '无可用动作'}`)
}

async function doMemberDayTasks(st) {
  const r = await apiPost(st, U.mdTaskList, { activityCode: 'MEMBER_DAY', channelType: 'MINI_PROGRAM' })
  if (!(r.ok && r.data.success)) return `任务查询失败(${errText(r)})`
  const list = r.data.obj || []
  if (!Array.isArray(list)) return '任务列表为空'

  const manualTypes = [
    'SEND_SUCCESS',
    'INVITEFRIENDS_PARTAKE_ACTIVITY',
    'OPEN_SVIP',
    'OPEN_NEW_EXPRESS_CARD',
    'OPEN_FAMILY_CARD',
    'CHARGE_NEW_EXPRESS_CARD',
    'INTEGRAL_EXCHANGE'
  ]
  let got = 0
  let done = 0

  for (const t of list) {
    if (st.black) break
    if (t.status === 1) {
      const g = await apiPost(st, U.mdReward, {
        taskType: t.taskType,
        activityCode: 'MEMBER_DAY',
        channelType: 'MINI_PROGRAM'
      })
      if (g.ok && g.data.success) got++
      await $.wait(1000)
    }
  }
  for (const t of list) {
    if (st.black) break
    if (t.status !== 2) continue
    if (manualTypes.indexOf(t.taskType) >= 0) continue
    const times = Math.max(1, Math.min(num(t.restFinishTime) || 1, 5))
    for (let i = 0; i < times; i++) {
      if (st.black) break
      const f = await apiPost(st, U.mdFinish, { taskCode: t.taskCode })
      if (f.ok && f.data.success) {
        done++
        const g = await apiPost(st, U.mdReward, {
          taskType: t.taskType,
          activityCode: 'MEMBER_DAY',
          channelType: 'MINI_PROGRAM'
        })
        if (g.ok && g.data.success) got++
      }
      await $.wait(1200)
    }
  }
  return `任务 完成${done}项 领奖${got}项`
}

async function doRedPacket(st) {
  const r = await apiPost(st, U.mdPacketStatus, {})
  if (!(r.ok && r.data.success)) return `红包查询失败(${errText(r)})`
  const map = {}
  const list = (r.data.obj && r.data.obj.packetList) || []
  for (const p of list) map[num(p.level)] = num(p.count)

  const maxLv = CFG.maxPacketLevel
  for (let lv = 1; lv < maxLv; lv++) {
    let cnt = map[lv] || 0
    while (cnt >= 2) {
      const m = await apiPost(st, U.mdPacketMerge, { level: lv, num: 2 })
      if (!(m.ok && m.data.success)) break
      map[lv] = (map[lv] || 0) - 2
      map[lv + 1] = (map[lv + 1] || 0) + 1
      cnt -= 2
      await $.wait(1000)
    }
  }

  const owned = Object.keys(map)
    .filter((k) => map[k] > 0)
    .map((k) => `[${k}级]×${map[k]}`)
    .join(' ')

  if (map[maxLv] > 0) {
    const d = await apiPost(st, U.mdPacketDraw, { level: String(maxLv) })
    let names = ''
    if (d.ok && d.data.success && Array.isArray(d.data.obj)) {
      names = d.data.obj.map((x) => x.couponName).filter(Boolean).join('、')
    }
    return `红包${owned ? owned + ' ' : ''}提取[${maxLv}级]: ${names || '空气'}`
  }
  return `红包${owned || '无'}（未达 ${maxLv} 级）`
}

// ==================== 请求层 ====================
function buildHeaders(st, opts) {
  const o = opts || {}
  const h = {
    'User-Agent': st.ua,
    'Content-Type': 'application/json',
    platform: 'MINI_PROGRAM'
  }
  const ck = jarToString(st.jar)
  if (ck) h.Cookie = ck // 只带本轮收割到的新 Cookie；没有就交给 QX 自带 cookie 罐
  if (o.honey) h.channel = 'wxwdsj'
  if (o.signature) {
    h.syscode = SYS_CODE
    const ts = String(Date.now())
    h.timestamp = ts
    h.signature = md5(`token=${SIGN_TOKEN}&timestamp=${ts}&sysCode=${SYS_CODE}`)
  }
  return h
}

async function rawRequest(method, url, st, body, opts) {
  const headers = buildHeaders(st, opts)
  if (String(method).toUpperCase() === 'GET') return await $.http.get({ url: url, headers: headers })
  return await $.http.post({ url: url, body: body || '', headers: headers })
}

async function apiPost(st, url, body, kind) {
  try {
    const resp = await rawRequest('POST', url, st, JSON.stringify(body || {}), {
      signature: !st.black,
      honey: kind === 'honey'
    })
    harvest(resp_cookies(resp), st)
    const data = safeJson(resp && resp.body)
    if (!data) return { ok: false, data: null, err: '返回非 JSON' }
    return { ok: true, data: data }
  } catch (e) {
    return { ok: false, data: null, err: e.message || String(e) }
  }
}

// ==================== Cookie 会话罐 ====================
function resp_cookies(resp) {
  if (!resp || !resp.headers) return ''
  const raw = resp.headers['set-cookie'] || resp.headers['Set-Cookie']
  if (!raw) return ''
  if (Array.isArray(raw)) return raw.join('; ')
  return String(raw)
}

function parseCookieObj(str) {
  const out = {}
  String(str || '')
    .split(';')
    .forEach((s) => {
      const item = s.trim()
      if (!item) return
      const i = item.indexOf('=')
      if (i <= 0) return
      const k = item.slice(0, i).trim()
      const v = item.slice(i + 1).trim()
      if (!k || !v) return
      if (COOKIE_ATTRS.indexOf(k.toLowerCase()) >= 0) return
      // Set-Cookie 里可能带逗号分隔的属性，取第一个 token 即可
      out[k] = v.split(',')[0].trim()
    })
  return out
}

function jarToString(jar) {
  const j = jar || {}
  return Object.keys(j)
    .map((k) => `${k}=${j[k]}`)
    .join('; ')
}

// 把响应下发的 Cookie 合并进会话罐，返回变化条数
function harvest(cookieStr, st) {
  if (!cookieStr) return 0
  const pairs = parseCookieObj(cookieStr)
  let n = 0
  Object.keys(pairs).forEach((k) => {
    if (st.jar[k] !== pairs[k]) {
      st.jar[k] = pairs[k]
      n++
    }
  })
  return n
}

function hasKey(jar, k) {
  return !!(jar && jar[k])
}

// ==================== 工具 ====================
function isAuthFail(text) {
  return /用户信息失效|请退出重新进入|Not login|未登录|登录状态|重新登录|登录已失效/.test(String(text || ''))
}

function markBlack(st, r) {
  const t = errText(r)
  if (t.indexOf('没有资格参与活动') >= 0 || isAuthFail(t)) st.black = true
}

function errText(r) {
  if (!r) return '无返回'
  if (r.err) return r.err
  if (r.data && r.data.errorMessage) return r.data.errorMessage
  return '未知错误'
}

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

function safeDecode(s) {
  try {
    return decodeURIComponent(String(s || ''))
  } catch (e) {
    return String(s || '')
  }
}

function num(v) {
  const n = parseInt(v, 10)
  return isNaN(n) ? 0 : n
}

function invitePayload(st) {
  if (CFG.inviteUserId) return { inviteUserId: String(CFG.inviteUserId) }
  if (st.userId) return { inviteUserId: String(st.userId) }
  return {}
}

function extractSign(url) {
  try {
    const m = String(url).match(/[?&]sign=([^&#]+)/)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (e) {
    return ''
  }
}

function getCookie(acc) {
  const h = acc.headers || {}
  const keys = Object.keys(h)
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === 'cookie') return String(h[keys[i]] || '').trim()
  }
  return ''
}

function getUA(acc) {
  const h = acc.headers || {}
  const keys = Object.keys(h)
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === 'user-agent') return String(h[keys[i]] || '').trim()
  }
  return 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.30'
}

function cookieVal(cookie, key) {
  const m = String(cookie || '').match(new RegExp('(?:^|;\\s*)' + key + '=([^;]*)'))
  return m ? m[1] : ''
}

function getUserId(acc) {
  const b = safeJson(acc.body) || {}
  const keys = ['userId', 'uid', 'memberId', 'customerId']
  for (const k of keys) {
    const hit = Object.keys(b).filter((x) => x.toLowerCase() === k.toLowerCase())[0]
    if (hit && b[hit]) return String(b[hit]).trim()
  }
  const ck = cookieVal(getCookie(acc), '_login_user_id_')
  return ck ? String(ck).trim() : ''
}

function formatPhone(p) {
  const v = String(p || '').trim()
  if (!v) return ''
  return v.length >= 11 ? `${v.slice(0, 3)}****${v.slice(7)}` : v
}

function getMobile(acc) {
  const direct = String(acc.mobile || '').trim()
  if (direct) return direct
  const ck = cookieVal(getCookie(acc), '_login_mobile_')
  if (ck) return formatPhone(ck)
  const m = String(acc.body || '').match(/(?:^|[^\d])(1[3-9]\d{9})(?:[^\d]|$)/)
  return m ? formatPhone(m[1]) : ''
}

function deviceId() {
  const cs = 'abcdef0123456789'
  let s = ''
  for (const ch of 'xxxxxxxxxxxx') {
    s += ch === 'x' ? cs.charAt(Math.floor(Math.random() * cs.length)) : ch
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}`
}

// 通知推送（Node 环境用 sendNotify）
async function sendMsg(message) {
  if (!message) return
  try {
    if ($.isNode()) {
      let notify
      try {
        notify = require('./sendNotify')
      } catch (e) {
        notify = require('./utils/sendNotify')
      }
      await notify.sendNotify($.name, message)
    } else {
      $.msg($.name, '', message)
    }
  } catch (e) {
    $.log(`\n\n-----${$.name}-----\n${message}`)
  }
}

// ==================== MD5（纯 JS，QX/Node 通用） ====================
function md5(str) {
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6,
    10, 15, 21
  ]
  const K = []
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  const utf8 = unescape(encodeURIComponent(String(str)))
  const bytes = []
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xff)
  const bitLen = utf8.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const lo = bitLen >>> 0
  const hi = Math.floor(bitLen / 4294967296)
  for (let i = 0; i < 4; i++) bytes.push((lo >>> (8 * i)) & 0xff)
  for (let i = 0; i < 4; i++) bytes.push((hi >>> (8 * i)) & 0xff)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < bytes.length; off += 64) {
    const M = []
    for (let i = 0; i < 16; i++) {
      M[i] =
        bytes[off + 4 * i] |
        (bytes[off + 4 * i + 1] << 8) |
        (bytes[off + 4 * i + 2] << 16) |
        (bytes[off + 4 * i + 3] << 24)
    }
    let A = a0
    let B = b0
    let C = c0
    let D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  const hx = function (n) {
    let s = ''
    for (let i = 0; i < 4; i++) {
      const b = (n >>> (8 * i)) & 0xff
      s += (b < 16 ? '0' : '') + b.toString(16)
    }
    return s
  }
  return hx(a0) + hx(b0) + hx(c0) + hx(d0)
}
// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
