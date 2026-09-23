/*
顺丰速运 获取 Token（多账号·去重修复版）
作者：gulangyushaonian

获取方式：
  QX 开重写 + MitM(mcs-mimp-web.sf-express.com)，打开
  【顺丰速运小程序 → 我的 → 优惠券/积分页面】或【顺丰 APP → 我的 → 积分】
  任意一端捕获成功即可；多账号切换登录会累加，同账号重复捕获只覆盖不重复追加。

====================================
[rewrite_local]
^https:\/\/mcs-mimp-web\.sf-express\.com\/mcs-mimp\/share\/(weChat\/shareGiftReceiveRedirect|app\/shareRedirect).+ url script-response-body https://raw.githubusercontent.com/gulangyushaonian/Script/main/Script/Cda-sfexpress.cookie.js, requires-body=true, timeout=60, tag=顺丰获取token

[mitm]
hostname = mcs-mimp-web.sf-express.com
====================================

说明（相对旧版改了什么）：
  1. 旧版正则只匹配 weChat/shareGiftReceiveRedirect，APP 端 share/app/shareRedirect 抓不到 → 已补全。
  2. 旧版只从 body.userId / headers.memberId 取身份，实际这两个字段都不存在，
     真正的身份在 Cookie 的 _login_user_id_ / _login_mobile_ 里 → 已改为从 Cookie 取。
  3. 旧版不存手机号，签到脚本只能显示"未知手机号" → 现在存 mobile 字段。
  4. 旧版用 script-request-body 拿不到登录后新下发的 Cookie → 改为 script-response-body，
     同时合并 request 与 Set-Cookie，保证存下来的 Cookie 是登录态。
*/

const $ = new Env('顺丰速运')
$.KEY_login = 'chavy_login_sfexpress'
$.is_debug = 'false'

!(async () => {
  if (typeof $request === 'undefined' || !$request) {
    $.log('⚠️ 无 $request，本脚本只能由 QX 重写触发')
    return
  }
  if (String($request.method || '').toUpperCase() === 'OPTIONS') return

  const reqHeaders = $request.headers || {}
  const respHeaders = (typeof $response !== 'undefined' && $response && $response.headers) || {}

  // 1) 合并 Cookie：先放请求里的，再用响应 Set-Cookie 覆盖（登录后新下发的才是有效登录态）
  let cookie = getHeader(reqHeaders, 'cookie') || ''
  const setCookie = collectSetCookie(respHeaders)
  if (setCookie) {
    const map = {}
    parseCookie(cookie).forEach((p) => (map[p.k] = p.v))
    parseCookie(setCookie).forEach((p) => (map[p.k] = p.v))
    cookie = Object.keys(map)
      .map((k) => `${k}=${map[k]}`)
      .join('; ')
  }

  // 2) 从 Cookie 取身份（_login_user_id_ / _login_mobile_）
  const userId = String(cookieVal(cookie, '_login_user_id_') || '').trim()
  const phone = String(cookieVal(cookie, '_login_mobile_') || '').trim()
  const mobile = phone ? (phone.length >= 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone) : ''

  if (!cookie || !userId) {
    $.log(`⚠️ 未取到有效登录 Cookie（userId=${userId || '空'}），可能还未登录，已跳过`)
    return
  }

  const session = {
    url: $request.url,
    body: $request.body || '',
    headers: Object.assign({}, reqHeaders, { Cookie: cookie }),
    userId: userId,
    mobile: mobile
  }

  // 3) 读取已有列表
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
  // 清掉旧格式/脏数据（没有 Cookie 或没有 userId 的条目）
  const before = list.length
  list = list.filter((it) => it && it.headers && getHeader(it.headers, 'cookie'))
  if (list.length !== before) $.log(`🧹 清理了 ${before - list.length} 条无效旧数据`)

  // 4) 按 userId 去重（统一转字符串 + trim，避免数字/字符串不一致导致重复）
  let updated = false
  for (let i = 0; i < list.length; i++) {
    const oldId = String(list[i].userId || legacyId(list[i]) || '').trim()
    if (oldId && oldId === userId) {
      list[i] = session
      updated = true
      break
    }
  }
  if (!updated) list.push(session)

  // 5) 保存
  const ok = $.setdata(JSON.stringify(list), $.KEY_login)
  if (!ok) {
    $.msg($.name, '保存失败', `账号 ${mobile || userId} 写入失败`)
    return
  }

  const action = updated ? '更新' : '新增'
  const desc = `${action}账号成功\n手机号: ${mobile || '未知'}\n当前共 ${list.length} 个账号`
  $.log(`✅ ${action}账号 [${userId}] ${mobile}`)
  $.msg($.name, `${action}账号成功`, desc)
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

// ==================== 工具 ====================
function getHeader(headers, name) {
  const src = headers || {}
  const want = String(name).toLowerCase()
  const keys = Object.keys(src)
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) return src[keys[i]]
  }
  return ''
}

function collectSetCookie(headers) {
  const raw = getHeader(headers, 'set-cookie')
  if (!raw) return ''
  return Array.isArray(raw) ? raw.join('; ') : String(raw)
}

function parseCookie(str) {
  return String(str || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('=')
      return i > 0 ? { k: s.slice(0, i).trim(), v: s.slice(i + 1).trim() } : null
    })
    .filter((x) => x && x.k && x.v.indexOf('=') === -1)
}

function cookieVal(cookie, key) {
  const m = String(cookie || '').match(new RegExp('(?:^|;\\s*)' + key + '=([^;]*)'))
  return m ? m[1] : ''
}

// 兼容旧数据：从 body.userId 或 Cookie 里兜底取 userId
function legacyId(item) {
  try {
    const b = JSON.parse(item.body || '{}')
    if (b.userId) return String(b.userId).trim()
  } catch (e) {}
  return cookieVal(getHeader(item.headers, 'cookie'), '_login_user_id_')
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
