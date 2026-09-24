/*
顺丰速运 获取 Token（多账号·直接抓 sign 版）
作者：gulangyushaonian / 修复增强版

【关键】抓的是 APP 登录接口 universalSign 的【响应】，直接把它回包里的 obj.sign 存下来。
  不再依赖"重放请求去换 sign" —— 重放用的 body 里可能带有时效令牌，隔几小时就失效，
  表现为「登录回包无 obj.sign」+ 只剩一个 WAF 挑战 Cookie(HWWAFSESTIME)。

获取方式：
  QX 开重写 + MitM，打开【顺丰 APP → 我的】，触发 universalSign 即被捕获。
  多账号：切换登录一个抓一次，同账号重复捕获只覆盖不重复追加。

====================================
[rewrite_local]
^https:\/\/ccsp-egmas\.sf-express\.com\/cx-app-member\/member\/app\/user\/universalSign url script-response-body https://raw.githubusercontent.com/gulangyushaonian/Script/main/Script/Cda-sfexpress.cookie.js, requires-body=true, timeout=60, tag=顺丰获取token

[mitm]
hostname = ccsp-egmas.sf-express.com, mcs-mimp-web.sf-express.com
====================================

存下来的每条记录：{url, body, headers, sign, userId, mobile}
  · sign：优先取响应回包里的 obj.sign，没有就从请求 URL 的 sign 参数取
  · 签到脚本直接拿 sign 去换网页会话，不需要重放登录请求
  · 若 sign 缺失，签到脚本仍会退回去重放登录请求（兜底）
*/

const $ = new Env('顺丰速运')
$.KEY_login = 'chavy_login_sfexpress'
$.is_debug = 'false'

// true: 失败也弹通知并打印抓到的详情（排障用）
const DIAG = true

// 账号识别用的规则常量 —— 必须声明在 IIFE 之前（否则 identify() 撞 TDZ）
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
  // ---------- 0. 触发检查 ----------
  if (typeof $request === 'undefined' || !$request) {
    notify('脚本未触发', '这是 QX 重写脚本，不能手动运行。\n请用【重写规则】在打开顺丰 APP「我的」时自动触发。')
    return
  }
  if (String($request.method || '').toUpperCase() === 'OPTIONS') return

  const url = String($request.url || '')
  const reqBody = String($request.body || '')
  const headers = $request.headers || {}
  const respBody = typeof $response !== 'undefined' && $response ? String($response.body || '') : ''
  const respStatus = typeof $response !== 'undefined' && $response ? $response.status : ''

  // ---------- 1. 取 sign（本次的核心） ----------
  const sign = findSign(respBody, url)
  const respJson = safeJson(respBody)

  // ---------- 2. 识别账号 ----------
  const id = identify(respBody, reqBody, headers)

  const detail = [
    `URL: ${shorten(url, 78)}`,
    `HTTP: ${respStatus || '?'}`,
    `响应: ${respBody ? respBody.length + ' 字符' : '空'}${respJson ? '' : '（非 JSON）'}`,
    `响应字段: ${bodyKeys(respBody)}`,
    `sign: ${sign ? shorten(sign, 24) + '…' : '(未取到)'}`,
    `请求body: ${reqBody ? reqBody.length + ' 字符' : '空'}`,
    `请求body字段: ${bodyKeys(reqBody)}`,
    `识别方式: ${id.by}`,
    `手机号: ${id.mobile || (id.value ? id.value : '(未识别)')}`
  ].join('\n')
  $.log(`\n【诊断】\n${detail}\n`)

  // ---------- 3. 读列表（兼容旧的单对象存档） ----------
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
  // 有效条目 = 至少有 sign 或 url
  list = list.filter((it) => it && (it.sign || it.url))

  // ---------- 4. 组装并去重 ----------
  const session = {
    url: url,
    body: reqBody,
    headers: headers,
    sign: sign || '',
    userId: id.userId || '',
    mobile: id.mobile || '',
    key: id.value
  }

  let updated = false
  if (id.value) {
    for (let i = 0; i < list.length; i++) {
      const oldKey = String(list[i].key || identify('', list[i].body, list[i].headers).value || '').trim()
      if (oldKey && oldKey === id.value) {
        // 保留旧记录里可能还有用的 sign
        if (!session.sign && list[i].sign) session.sign = list[i].sign
        list[i] = session
        updated = true
        break
      }
    }
  }
  if (!updated) list.push(session)

  // ---------- 5. 保存 ----------
  const ok = $.setdata(JSON.stringify(list), $.KEY_login)
  const action = updated ? '更新' : '新增'
  if (!ok) {
    notify('保存失败', `账号 ${id.mobile || id.value} 写入失败\n\n${detail}`)
    return
  }

  $.log(`✅ ${action}账号 [${id.value}] ${id.mobile} sign=${sign ? '有' : '无'}`)
  notify(
    `${action}账号成功`,
    [
      `手机号: ${id.mobile || id.value || '未知'}`,
      `sign: ${sign ? '已捕获 ✓' : '⚠️ 未捕获到（签到脚本会退回去重放登录请求）'}`,
      `当前共 ${list.length} 个账号${before > list.length ? `（清理 ${before - list.length + 1} 条旧数据）` : ''}`
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

// ==================== 取 sign（多路兜底） ====================
function findSign(respBody, url) {
  const j = safeJson(respBody)
  const paths = [
    ['obj', 'sign'],
    ['obj', 'data', 'sign'],
    ['data', 'sign'],
    ['result', 'sign'],
    ['sign']
  ]
  for (const path of paths) {
    let cur = j
    for (const k of path) {
      if (!cur || typeof cur !== 'object') {
        cur = null
        break
      }
      cur = cur[k]
    }
    if (cur && typeof cur === 'string') return cur.trim()
  }
  // 正则兜底：响应里任何 "sign":"..."
  let m = String(respBody || '').match(/"sign"\s*:\s*"([^"]{8,})"/)
  if (m) return m[1]
  // 最后：请求 URL 自带的 sign 参数
  m = String(url || '').match(/[?&]sign=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

// ==================== 账号识别 ====================
// 优先用响应（服务端权威），其次请求 body / headers
function identify(respBody, reqBody, headers) {
  const sources = [safeJson(respBody), safeJson(reqBody)]
  const h = lowerHeaders(headers)

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
    for (const f of MOBILE_FIELDS) {
      const v = h[f.toLowerCase()]
      if (v && /1[3-9]\d{9}/.test(String(v))) return build(String(v), `headers.${f}`, flat)
    }
    // 深层：整个对象里搜第一个 11 位手机号
    const m = JSON.stringify(src).match(PHONE_RE)
    if (m) return build(m[1], '响应/请求内手机号', flat)
  }

  // 兜底：请求 body 的 md5
  return { value: md5(String(reqBody || '')), by: '请求body哈希(兜底)', userId: '', mobile: '' }
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

// 把嵌套对象的关键字段拍平（只看一层嵌套，够用且不会爆栈）
function flatten(obj) {
  const out = {}
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 3) return
    Object.keys(o).forEach((k) => {
      const v = o[k]
      if (v === null || v === undefined) return
      if (typeof v === 'object') {
        walk(v, depth + 1)
      } else if (!(k in out)) {
        out[k] = v
      }
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

function bodyKeys(body) {
  const o = safeJson(body)
  if (!o || typeof o !== 'object') return '(非 JSON)'
  const keys = Object.keys(o)
  return keys.length ? keys.slice(0, 10).join(', ') : '(空对象)'
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
