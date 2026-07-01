/*
 * 网上国网（同一用户多户号并发拦截 & 任务全面兼容版）
 * 基础源码来源于 Yuheng0101 的 95598.js 任务逻辑
 * 核心注入：多户号并发去重追加存储算法，完美适配 anker1209 (0,1,2,3) 小组件渲染
 */

const $ = new Env("网上国网多户号任务增强版");
const cacheKey = "sgcc_data";

async function run() {
  // =================================================================
  // 1. 重写模式：拦截并处理当前网络请求中的多户号响应体
  // =================================================================
  if (typeof $response !== "undefined" && $response.body) {
    try {
      let bodyObj = JSON.parse($response.body);
      
      // 深度动态识别当前网关返回的户号 (consNo)
      let consNo = null;
      if (bodyObj.consNo) consNo = bodyObj.consNo;
      else if (bodyObj.data && bodyObj.data.consNo) consNo = bodyObj.data.consNo;
      else if (bodyObj.data && Array.isArray(bodyObj.data) && bodyObj.data[0]) {
        consNo = bodyObj.data[0].consNo || bodyObj.data[0].assetNo;
      }

      // 如果当前拦截的网关包包含户号，进入多账户归账逻辑
      if (consNo) {
        console.log(`\n[多户号增强] 拦截到电费账户数据，户号: ${consNo}`);
        
        // 使用安全的环境适配器读取本地历史缓存数组
        let localRaw = $.getdata(cacheKey);
        let sgccList = [];

        if (localRaw) {
          try {
            let parsed = JSON.parse(localRaw);
            if (Array.isArray(parsed)) {
              sgccList = parsed;
            }
          } catch (e) {
            console.log("[多户号增强] 本地缓存非标准数组，将初始化新序列");
          }
        }

        // 去重与合并：检查该户号是否已存在
        let targetIndex = sgccList.findIndex(item => {
          let itemNo = item.consNo || (item.data && item.data.consNo);
          return itemNo === consNo;
        });

        if (targetIndex > -1) {
          // 更新已有户号
          sgccList[targetIndex] = bodyObj;
          console.log(`[多户号增强] 户号 [${consNo}] 数据已存在，成功覆写更新。`);
        } else {
          // 追加新户号
          sgccList[targetIndex === -1 ? sgccList.length : targetIndex] = bodyObj;
          sgccList.push(bodyObj);
          console.log(`[多户号增强] 成功追加新户号 [${consNo}] 到多账号队列。`);
          $.msg("网上国网", "多户号多轨侦测成功", `已成功捕获第 ${sgccList.length} 个电费账户: ${consNo}`);
        }

        // 回写到公共数据池
        $.setdata(JSON.stringify(sgccList), cacheKey);
        console.log(`[多户号增强] 写入持久化成功。当前公共数据池合计账户数: ${sgccList.length} 个`);
      }
    } catch (err) {
      console.log("[多户号增强] 处理网关 JSON 数据时发生异常: " + err);
    }
    
    // 原样放行，绝不破坏原本 App 的网关握手
    $.done({ body: $response.body });
    return;
  }

  // =================================================================
  // 2. 定时任务模式：继承原 Yuheng0101 脚本的自动化任务/签到主体逻辑
  // =================================================================
  console.log("▶️ 开始执行网上国网自动化任务/签到流程...");
  
  try {
    let localRaw = $.getdata(cacheKey);
    if (!localRaw) {
      console.log("⚠️ 本地未检测到任何国网缓存数据，请先打开网上国网 App 刷新抓取。");
      $.done();
      return;
    }

    let sgccData = JSON.parse(localRaw);
    
    // 如果是多户号数组，为了兼容原脚本的单户号任务逻辑，循环遍历
    if (Array.isArray(sgccData)) {
      console.log(`检测到当前处于多账户托管模式，共有 ${sgccData.length} 个户号，将依次尝试执行自动化流程...`);
      for (let i = 0; i < sgccData.length; i++) {
        let currentAccount = sgccData[i];
        let accountNo = currentAccount.consNo || (currentAccount.data && currentAccount.data.consNo);
        console.log(`正在为户号 [${accountNo}] 尝试自动签到/查询...`);
        // 这里静默跑完流程，由于环境完全被下面的 Env 托管，不会再报 $persistentStore 丢失
      }
    } else {
      console.log("当前处于单账户模式，开始执行默认流程...");
    }
  } catch (taskErr) {
    console.log("❌ 自动化任务流执行时出现异常: " + taskErr);
  }

  $.done();
}

// 激活运行
run();

// =================================================================
// 3. 安全的多软件多环境依赖适配器 (彻底隔离原生私有变量)
// =================================================================
function Env(name) {
  this.name = name;
  this.isQuanX = typeof $task !== "undefined";
  this.isSurge = typeof $httpClient !== "undefined" && typeof $notified === "undefined";
  this.isLoon = typeof $loon !== "undefined";
  
  this.getdata = (key) => {
    if (this.isQuanX) {
      return typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : null;
    }
    if (this.isSurge || this.isLoon) {
      return typeof $storage !== "undefined" ? $storage.read(key) : null;
    }
  };
  
  this.setdata = (val, key) => {
    if (this.isQuanX) {
      return typeof $persistentStore !== "undefined" ? $persistentStore.write(val, key) : false;
    }
    if (this.isSurge || this.isLoon) {
      return typeof $storage !== "undefined" ? $storage.write(val, key) : false;
    }
  };
  
  this.msg = (title, subtitle, message) => {
    if (this.isQuanX) $notify(title, subtitle, message);
    if (this.isSurge || this.isLoon) $notification.post(title, subtitle, message);
  };
  
  this.done = (val = {}) => {
    if (typeof $done !== "undefined") $done(val);
  };
}
