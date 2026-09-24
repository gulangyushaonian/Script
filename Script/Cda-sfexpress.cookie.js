/*
顺丰速运 获取 Token（多账号 · 双通道抓取）
作者：gulangyushaonian / 修复增强版

一次抓两样东西，签到脚本按可靠性依次使用：
  ① Cookie —— 从 mcs-mimp-web 的【任意请求头】里抓完整 Cookie（最可靠，业界通用做法）
  ② sign  —— 从 ccsp-egmas 的 universalSign【响应】里抓 obj.sign（换会话用）

====================================
[rewrite_local]
# ① 抓 Cookie（打开顺丰 APP/小程序、进「我的」或签到页时触发）
^https:\/\/mcs-mimp-web\.sf-express\.com\/ url script-request-header <你上传的脚本地址>/Cda-sfexpress.cookie.js, tag=顺丰抓Cookie

# ② 抓 sign（打开顺丰 APP「我的」时触发）
^https:\/\/ccsp-egmas\.sf-express\.com\/cx-app-member\/member\/app\/user\/universalSign url script-response-body <你上传的脚本地址>/Cda-sfexpress.cookie.js, requires-body=true, timeout=60, tag=顺丰抓sign

[mitm]
hostname = ccsp-egmas.sf-express.com, mcs-mimp-web.sf-express.com
====================================

存下来的每条记录：{url, body, headers, sign, cookie, userId, mobile}
  · cookie：完整 Cookie 头，签到脚本原样带给业务接口（首选）
  · sign  ：没有 cookie 时用它换会话（备用）
  · 识别账号优先用 Cookie 里的 _login_user_id_ / _login_mobile_，其次响应/请求体字段
*/

const $ = new Env('顺丰速运')
$.KEY_login = 'chavy_login_sfexpress'
$.is_debug = 'false'

// true: 打印抓到的详情（排障用）
const DIAG = true

// 常量必须声明在 IIFE 之前（否则 identify() 撞 TDZ）
const PHONE_RE = /(?:^|[^\d])(1[3-9]\d{9})(?:[^\d]|$)/
const ID_FIELDS = ['userId', 'userid', 'uid', 'memberId', 'memberid', 'customerId', 'accountId']
const MOBILE_FIELDS = [
  'mobile',
  'phone',
  'userMobile',
  'loginMobile',
  'mobilePhone',
  'mobileNo',
  'telephone',
  'userPhone'
]

!(async () => {
  if (typeof $request === 'undefined' || !$request) {
    notify('脚本未触发', '这是 QX 重写脚本，不能手动运行。请用【重写规则】在打开顺丰 APP/小程序时自动触发。')
    return
  }
  if (String($request.method || '').toUpperCase() === 'OPTIONS') return

  const url = String($request.url || '')
  const reqBody = String($request.body || '')
  const headers = $request.headers || {}
  const hLow = lowerHeaders(headers)
  const reqCookie = String(hLow['cookie'] || '')
  const respBody = typeof $response !== 'undefined' && $response ? String($response.body || '') : ''
  const respStatus = typeof $response !== 'undefined' && $response ? $response.status : ''

  const isSignHost = url.indexOf('universalSign') >= 0
  const isCookieHost = url.indexOf('mcs-mimp-web.sf-express.com') >= 0

  // ---------- 1. 分别取两样东西 ----------
  const sign = isSignHost ? findSign(respBody, url) : ''
  const cookie = reqCookie || extractCookieFromHeaders(headers)

  const id = identify(respBody, reqBody, reqCookie, headers)

  const detail = [
    `触发: ${isSignHost ? 'universalSign(抓sign)' : isCookieHost ? 'mcs-mimp-web(抓Cookie)' : '未知URL'}`,
    `URL: ${shorten(url, 78)}`,
    `HTTP: ${respStatus || '?'}`,
    `Cookie: ${cookie ? cookie.length + ' 字符' : '无'}`,
    `Cookie 键: ${cookieKeys(cookie) || '无'}`,
    `sign: ${sign ? shorten(sign, 24) + '…' : '(无)'}`,
    `请求body: ${reqBody ? reqBody.length + ' 字符' : '空'}`,
    `识别方式: ${id.by}`,
    `手机号: ${id.mobile || '(未识别)'}`
  ].join('\n')
  if (DIAG) $.log(`\n【诊断】\n${detail}\n`)

  // 这次触发什么都没抓到：不写存储，但要让用户知道（否则看起来像没反应）
  if (!sign && !cookie) {
    notify(
      '本次未捕获到有效信息',
      [
        `触发: ${isSignHost ? 'universalSign' : isCookieHost ? 'mcs-mimp-web' : '未知'}`,
        `Cookie: 无`,
        `sign: 无`,
        ``,
        `若是 universalSign：请确认该接口的回包里有 obj.sign`,
        `若是 mcs-mimp-web：请确认已登录顺丰再访问`
      ].join('\n')
    )
    return
  }

  // ---------- 2. 读列表（兼容旧的单对象存档） ----------
  let list = []
  const old = $.getdata($.KEY_login)
  if (old) {
    try {
      const parsed = JSON.parse(old)
      list = Array.isArray(parsed) ? parsed : [parsed]
    } catch (e) {
      list = []
    }
  }
  const before = list.length
  list = list.filter((it) => it && (it.sign || it.cookie || it.url))

  // ---------- 3. 找同账号记录（userId 或 mobile 任一相同即为同一账号） ----------
  const cand = [id.userId, id.mobile].filter(Boolean)
  let idx = -1
  for (let i = 0; i < list.length; i++) {
    const keys = [list[i].userId, list[i].mobile].filter(Boolean)
    if (cand.length && keys.length && cand.some((c) => keys.indexOf(c) >= 0)) {
      idx = i
      break
    }
  }

  if (idx >= 0) {
    const rec = list[idx]
    // 合并：只覆盖本次真正抓到的东西，另一种保留原值
    if (sign) rec.sign = sign
    if (cookie) rec.cookie = cookie
    if (isSignHost) {
      rec.url = url
      rec.body = reqBody
      rec.headers = headers
    }
    if (id.userId) rec.userId = id.userId
    if (id.mobile) rec.mobile = id.mobile
    $.setdata(JSON.stringify(list), $.KEY_login)
    $.log(`✅ 更新账号 ${rec.mobile || rec.userId}｜cookie=${rec.cookie ? '有' : '无'} sign=${rec.sign ? '有' : '无'}`)
    notify(
      '更新账号成功',
      [
        `手机号: ${rec.mobile || rec.userId || '未知'}`,
        `Cookie: ${rec.cookie ? '已捕获 ✓' : '无'}`,
        `sign: ${rec.sign ? '已捕获 ✓' : '无'}`,
        `当前共 ${list.length} 个账号`
      ].join('\n')
    )
    return
  }

  // ---------- 4. 新账号 ----------
  const session = {
    url: isSignHost ? url : '',
    body: isSignHost ? reqBody : '',
    headers: isSignHost ? headers : {},
    sign: sign || '',
    cookie: cookie || '',
    userId: id.userId || '',
    mobile: id.mobile || '',
    key: id.value
  }
  list.push(session)
  const ok = $.setdata(JSON.stringify(list), $.KEY_login)
  if (!ok) {
    notify('保存失败', `账号 ${id.mobile || id.value} 写入失败\n\n${detail}`)
    return
  }

  $.log(`✅ 新增账号 [${id.value}] ${id.mobile}｜cookie=${cookie ? '有' : '无'} sign=${sign ? '有' : '无'}`)
  notify(
    '新增账号成功',
    [
      `手机号: ${id.mobile || id.value || '未知'}`,
      `Cookie: ${cookie ? '已捕获 ✓' : '无（请再访问一次顺丰签到页）'}`,
      `sign: ${sign ? '已捕获 ✓' : '无（可再打开顺丰 APP 我的）'}`,
      `当前共 ${list.length} 个账号${before > 0 ? `（原有 ${before} 个）` : ''}`
    ].join('\n')
  )
})()
  .catch((e) => {
    try {
      notify('获取 Token 异常', String((e && e.message) || e))
    } catch (e2) {
      $.logErr(e)
    }
  })
  .finally(() => $.done())

// ==================== 通知 ====================
function notify(title, content) {
  try {
    $.msg($.name, title, content)
  } catch (e) {
    $.log(`【${title}】${content}`)
  }
  if (DIAG) $.log(`\n⚠️ ${title}\n${content}\n`)
}

// ==================== 取 sign ====================
function findSign(respBody, url) {
  const j = safeJson(respBody)
  const paths = [
    ['obj', 'sign'],
    ['obj', 'data', 'sign'],
    ['data', 'sign'],
    ['result', 'sign'],
    ['sign']
  ]
  for (const p of paths) {
    let cur = j
    for (const k of p) {
      if (!cur || typeof cur !== 'object') {
        cur = null
        break
      }
      cur = cur[k]
    }
    if (cur && typeof cur === 'string' && cur.trim().length >= 4) return cur.trim()
  }
  let m = String(respBody || '').match(/"sign"\s*:\s*"([^"]{8,})"/)
  if (m) return m[1]
  m = String(url || '').match(/[?&]sign=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

// 有些环境把 Cookie 放在奇怪的位置，兜底从 headers 拼
function extractCookieFromHeaders(headers) {
  const low = lowerHeaders(headers)
  if (low['cookie']) return String(low['cookie'])
  const parts = []
  Object.keys(headers || {}).forEach((k) => {
    if (/^cookie$/i.test(k) || /^set-cookie$/i.test(k)) parts.push(String(headers[k]))
  })
  return parts.join('; ')
}

function cookieKeys(cookie) {
  return String(cookie || '')
    .split(';')
    .map((x) => x.split('=')[0].trim())
    .filter(Boolean)
    .join(', ')
}

// ==================== 账号识别 ====================
function identify(respBody, reqBody, reqCookie, headers) {
  // Cookie 里最权威：_login_user_id_ / _login_mobile_
  const ck = parseCookie(reqCookie)
  const ckUid = ck['_login_user_id_'] || ck['_login_user_id'] || ''
  const ckMobile = ck['_login_mobile_'] || ck['_login_mobile'] || ''
  if (ckUid) return { value: ckUid, by: 'Cookie._login_user_id_', userId: ckUid, mobile: formatPhone(ckMobile) }
  if (ckMobile && /1[3-9]\d{9}/.test(ckMobile))
    return { value: ckMobile, by: 'Cookie._login_mobile_', userId: '', mobile: formatPhone(ckMobile) }

  const h = lowerHeaders(headers)
  const sources = [safeJson(respBody), safeJson(reqBody)]
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue
    const flat = flatten(src)
    for (const f of ID_FIELDS) {
      const v = findKeyCI(flat, f)
      if (v) return build(String(v), `响应/请求.${f}`, flat)
    }
    for (const f of MOBILE_FIELDS) {
      const v = findKeyCI(flat, f)
      if (v && /1[3-9]\d{9}/.test(String(v))) return build(String(v), `响应/请求.${f}`, flat)
    }
    const m = JSON.stringify(src).match(PHONE_RE)
    if (m) return build(m[1], '响应/请求内手机号', flat)
  }
  for (const f of MOBILE_FIELDS) {
    const v = h[f.toLowerCase()]
    if (v && /1[3-9]\d{9}/.test(String(v))) return build(String(v), `headers.${f}`, {})
  }
  // 兜底：Cookie 里的纯数字 userId（可能是别的键名）
  const guess = guessUidFromCookie(ck)
  if (guess) return { value: guess, by: 'Cookie.数字ID(推断)', userId: guess, mobile: '' }

  return { value: md5(String(reqBody || reqCookie || '')), by: '内容哈希(兜底)', userId: '', mobile: '' }
}

function guessUidFromCookie(ck) {
  const keys = Object.keys(ck)
  for (let i = 0; i < keys.length; i++) {
    if (/user_?id|member_?id|uid/i.test(keys[i])) {
      const v = String(ck[keys[i]] || '').replace(/^"|"$/g, '')
      if (/^\d{5,}$/.test(v)) return v
    }
  }
  return ''
}

function build(v, by, flat) {
  const isPhone = /^1[3-9]\d{9}$/.test(v)
  let mobile = isPhone ? formatPhone(v) : ''
  if (!mobile) {
    for (const f of MOBILE_FIELDS) {
      const cand = findKeyCI(flat, f)
      if (cand && /1[3-9]\d{9}/.test(String(cand))) {
        mobile = formatPhone(String(cand))
        break
      }
    }
  }
  if (!mobile) {
    const mm = JSON.stringify(flat || {}).match(PHONE_RE)
    if (mm) mobile = formatPhone(mm[1])
  }
  return { value: v, by: by, userId: isPhone ? '' : v, mobile: mobile }
}

function parseCookie(str) {
  const out = {}
  const skip = ['path', 'domain', 'expires', 'max-age', 'httponly', 'secure', 'samesite', 'version', 'comment']
  String(str || '')
    .split(';')
    .forEach((seg) => {
      const i = seg.indexOf('=')
      if (i < 1) return
      const k = seg.slice(0, i).trim()
      const v = seg.slice(i + 1).trim()
      if (!k || skip.indexOf(k.toLowerCase()) >= 0) return
      out[k] = v
    })
  return out
}

function flatten(obj) {
  const out = {}
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 3) return
    Object.keys(o).forEach((k) => {
      const v = o[k]
      if (v === null || v === undefined) return
      if (typeof v === 'object') walk(v, depth + 1)
      else if (!(k in out)) out[k] = v
    })
  }
  walk(obj, 0)
  return out
}

function findKeyCI(obj, key) {
  const keys = Object.keys(obj || {})
  const want = String(key).toLowerCase()
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) {
      const v = obj[keys[i]]
      if (v === null || v === undefined || typeof v === 'object') return ''
      return String(v)
    }
  }
  return ''
}

function lowerHeaders(headers) {
  const o = {}
  const src = headers || {}
  Object.keys(src).forEach((k) => {
    o[k.toLowerCase()] = src[k]
  })
  return o
}

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

function formatPhone(p) {
  const v = String(p || '').trim()
  if (!v) return ''
  return v.length >= 11 ? `${v.slice(0, 3)}****${v.slice(7)}` : v
}

function shorten(s, n) {
  const v = String(s || '')
  return v.length > n ? v.slice(0, n) + '…' : v
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
