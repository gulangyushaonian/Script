const $ = new Env("小米抽奖");

const SCRIPT_VERSION = "2026-07-13.multi_v3"; 
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);

const CK_KEY = "milottery_data";
const API = "https://shop-api.retail.mi.com";
const ACT_API = "https://act-api.retail.mi.com";
const BATCH_PATH = "/mtop/navi/venue/batch";
const SUPPORTED_TASK_TYPES = [101, 200];

if (typeof $request !== "undefined") {
    capture();
} else if (JSON.parse($.getdata("milottery_clear") || "false")) {
    $.setdata("", CK_KEY);
    $.setdata("false", "milottery_clear");
    $.msg($.name, "", "✅ Cookie 已全部清除成功");
    $.done();
} else {
    run().finally(() => $.done());
}

// 智能提取登录特征：返回 { id: 用于唯一去重的凭证, name: 类似手机后4位或用户标识 }
function parseAccountInfo(cookieStr) {
    if (!cookieStr) return null;

    // 1. 强力拦截未登录/黑名单/空壳标识
    if (
        cookieStr.includes("userId=;") || 
        cookieStr.includes("userId=0;") || 
        cookieStr.includes("userId=\"\"") ||
        cookieStr.includes("XMGUEST") && !cookieStr.includes("serviceToken=")
    ) {
        return null;
    }

    // 获取合法 userId
    const userIdMatch = cookieStr.match(/userId=([^;\s"'\x00-\x1F]+)/);
    const userId = (userIdMatch && userIdMatch[1] && userIdMatch[1] !== "0") ? userIdMatch[1] : "";

    // 获取合法 serviceToken
    const tokenMatch = cookieStr.match(/serviceToken=([^;\s"'\x00-\x1F]+)/);
    const serviceToken = (tokenMatch && tokenMatch[1] && tokenMatch[1].length > 10) ? tokenMatch[1] : "";

    // 如果连核心凭证都没有，说明是未登录的游客脏数据
    if (!userId && !serviceToken) return null;

    // --- 计算显示名称 (优先匹配手机号/标识符，保底用 userId 后 4 位) ---
    let showName = "";
    
    // 某些小米 Cookie 中会包含暗码或手机号相关的混淆字段（如 passport_id 等），
    // 如果没有，直接截取用户最容易辨认的 userId 结尾 4 位（效果等同于辨别多账号）
    if (userId && userId.length >= 4) {
        showName = `尾号${userId.slice(-4)}`;
    } else if (serviceToken) {
        showName = `凭证${serviceToken.slice(-4)}`;
    } else {
        showName = "未知账号";
    }

    return {
        id: userId || serviceToken.slice(-30), // 用于比对去重的唯一 ID
        name: showName
    };
}

function capture() {
    $.log(`[INFO] 抓取钩子命中 ${$request.url}`);
    const body = $request.body || "";
    const query = mainTaskQuery(body);
    if (!query) {
        $.done();
        return;
    }

    const headers = cleanHeaders($request.headers || {});
    const cookie = normalizeCookie(header(headers, "cookie"));
    if (!cookie) {
        $.log(`[WARN] 抓取失败: 请求中完全不包含 Cookie 字段`);
        $.done();
        return;
    }

    // 验证登录有效性并提取账号标志
    const accInfo = parseAccountInfo(cookie);
    if (!accInfo) {
        $.log(`[WARN] 自动拦截脏数据: 检测到当前属于未登录或游客状态，放弃保存此垃圾 Cookie。`);
        $.done();
        return;
    }

    setHeader(headers, "cookie", cookie);
    const current = {
        url: ($request.url || API + BATCH_PATH).replace(/\?.*$/, ""),
        headers,
        body,
        actId: query.actId,
        capturedAt: Date.now(),
    };

    let accountList = [];
    try {
        const saved = $.getdata(CK_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            accountList = Array.isArray(parsed) ? parsed : [parsed];
        }
    } catch (e) {
        debug(`saved data parse error: ${e.message || e}`);
    }

    // 【1. 顺便在这里清理掉以往缓存里的历史无效脏数据】
    accountList = accountList.filter(item => {
        const oldCk = header(item.headers, "cookie") || "";
        return !!parseAccountInfo(oldCk);
    });
    
    // 【2. 精确匹配去重，防止获取重复，并进行实时更新覆盖】
    const matchIndex = accountList.findIndex(item => {
        const oldCk = header(item.headers, "cookie") || "";
        const oldInfo = parseAccountInfo(oldCk);
        return oldInfo && oldInfo.id === accInfo.id;
    });

    if (matchIndex > -1) {
        // 发现相同用户：直接更新替换，确保不重复添加
        accountList[matchIndex] = current;
        $.msg($.name, "", `✅ 账号 [${accInfo.name}] Cookie 更新替换成功`);
        $.log(`[INFO] 成功替换更新账号 [${accInfo.name}] 的缓存配置`);
    } else {
        // 新用户：顺次追加
        accountList.push(current);
        $.msg($.name, "", `✅ 账号 [${accInfo.name}] 抓取成功，当前共管理 ${accountList.length} 个账号`);
        $.log(`[INFO] 成功追加新账号 [${accInfo.name}]`);
    }

    const ok = $.setdata(JSON.stringify(accountList), CK_KEY);
    if (!ok) {
        $.msg($.name, "❌ Cookie 保存失败", "请查看脚本日志后重试");
    }
    $.done();
}

async function run() {
    const raw = $.getdata(CK_KEY);
    if (!raw) {
        $.msg($.name, "🚫 缺少 Cookie", "请先进入小米商城 APP → 狂欢礼 → 抽奖活动页抓取");
        return;
    }

    let accountList = [];
    try {
        const parsed = JSON.parse(raw);
        accountList = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        $.msg($.name, "🚫 Cookie 解析失败", "请清除后重新抓取");
        return;
    }

    // 【3. 彻底执行前置脏数据清洗：过滤掉任何不规范、未登录的残留项】
    accountList = accountList.filter(auth => {
        const ck = header(auth.headers || {}, "cookie");
        return !!parseAccountInfo(ck);
    });

    if (accountList.length === 0) {
        $.msg($.name, "🚫 缓存中无可用的登录账号", "原有账号已全部被作为脏数据清洗或已失效，请重新登录抓取");
        return;
    }

    $.log(`[INFO] 核心就绪，共检测到 ${accountList.length} 个有效登录账号，开始队列执行...\n`);

    let accIndex = 0;
    for (const auth of accountList) {
        accIndex++;
        const ck = header(auth.headers || {}, "cookie");
        const accInfo = parseAccountInfo(ck) || { name: `账号${accIndex}` };

        $.log(`\n================== 开始执行: [${accInfo.name}] (${accIndex}/${accountList.length}) ==================`);
        
        if (!auth.body || !ck) {
            $.log(`[WARN] 账号 [${accInfo.name}] 数据结构不完整，跳过。`);
            continue;
        }

        const first = await queryTasks(auth);
        if (!first) continue;
        
        let tasks = extractTasks(first);
        const lottery = tasks.find((task) => Number(task.taskType) === 128);
        if (!lottery) {
            $.log(`⚠️ 账号 [${accInfo.name}] 未找到抽奖活动，可能配置已失效，跳过`);
            continue;
        }

        const now = Number(lottery.serverTime || Date.now());
        if ((lottery.startTime && now < lottery.startTime) || (lottery.endTime && now > lottery.endTime)) {
            $.log(`⚠️ 账号 [${accInfo.name}] 活动不在当前有效期内，跳过`);
            continue;
        }

        const taskResult = { done: 0, skipped: 0, failed: [] };
        let actionCount = 0;
        const validTasks = tasks.filter((item) => SUPPORTED_TASK_TYPES.includes(Number(item.taskType)));
        
        for (const task of validTasks) {
            const remaining = Math.max(0, Number(task.totalNumber || 0) - Number(task.finishedNumber || 0));
            if (!remaining) {
                taskResult.skipped++;
                continue;
            }
            const count = Math.min(remaining, Number(task.upperLimit || remaining), 10);
            for (let i = 0; i < count; i++) {
                if (actionCount > 0) {
                    const gap = randomInt(1500, 3500);
                    await sleep(gap);
                }
                const result = await completeTask(auth, task);
                actionCount++;
                if (result.ok) {
                    taskResult.done++;
                } else {
                    taskResult.failed.push(`${task.taskName || task.taskId}: ${result.message}`);
                    break;
                }
            }
        }

        // 刷新状态，准备抽奖
        const refreshed = await queryTasks(auth);
        if (!refreshed) continue;
        
        tasks = extractTasks(refreshed);
        const drawTask = tasks.find((task) => Number(task.taskType) === 128);
        if (!drawTask) {
            $.log(`⚠️ 账号 [${accInfo.name}] 重新查询后未找到抽奖入口`);
            continue;
        }

        const singleCost = Math.max(1, Number(drawTask.singleCostScores || 1));
        const available = Math.floor(Number(drawTask.scores || 0) / singleCost);
        const drawLimit = Math.max(0, Number(drawTask.totalNumber || 0) - Number(drawTask.finishedNumber || 0));
        const drawCount = Math.min(available, drawLimit, 30);
        const drawResult = { count: 0, empty: 0, prizes: [], failed: "" };

        for (let i = 0; i < drawCount; i++) {
            const result = await draw(auth, drawTask);
            if (!result.ok) {
                drawResult.failed = result.message;
                break;
            }
            drawResult.count++;
            const awards = result.awards.filter((award) => Number(award.awardType) !== 0);
            if (!awards.length) drawResult.empty++;
            for (const award of awards) {
                const name = award.customAwardName || award.awardName || "奖励";
                const value = award.awardValue && award.awardValue !== "1" ? ` +${award.awardValue}` : "";
                drawResult.prizes.push(`${name}${value}`);
            }
            if (i + 1 < drawCount) await sleep(3000); 
        }

        // 组装结果通知
        const lines = [
            `任务状态: 完成 ${taskResult.done} 次 · 已跳过已完成项 ${taskResult.skipped} 个`,
            `抽奖状态: 成功 ${drawResult.count}/${drawCount} 次${drawResult.empty ? ` (未中奖 ${drawResult.empty} 次)` : ""}`,
        ];
        if (drawResult.prizes.length) lines.push(`🎁 奖品明细: ${drawResult.prizes.join("、")}`);
        if (taskResult.failed.length) lines.push(`⚠️ 任务中断: ${taskResult.failed[0]}`);
        if (drawResult.failed) lines.push(`⚠️ 抽奖中止: ${drawResult.failed}`);

        const isOk = !taskResult.failed.length && !drawResult.failed;
        $.msg(`${$.name} - ${accInfo.name}`, isOk ? "✅ 执行完成" : "⚠️ 部分完成", lines.join("\n"));
        
        if (accountList.indexOf(auth) < accountList.length - 1) {
            $.log(`[INFO] 账号 [${accInfo.name}] 执行完毕，安全切换冷却 5 秒...`);
            await sleep(5000);
        }
    }
}

async function queryTasks(auth) {
    const result = await request(auth.url || API + BATCH_PATH, auth.headers, auth.body);
    if (!result) {
        $.log("❌ 查询任务失败: 网络无响应");
        return null;
    }
    if (Number(result.code) !== 0) {
        const message = result.message || result.msg || "未知错误";
        $.log(`❌ 查询任务失败: ${message}`);
        return null;
    }
    return result;
}

async function completeTask(auth, task) {
    const start = await post(auth, "/mtop/mf/act/infinite/do", [
        {},
        { actId: task.actId, taskId: task.taskId },
    ]);
    if (!start || Number(start.code) !== 0 || !start.data || !start.data.taskToken) {
        return { ok: false, message: messageOf(start) };
    }

    if (Number(task.taskType) === 200) {
        const minSeconds = Math.max(5, Math.ceil(Number(task.duration || 5)));
        const wait = randomInt(minSeconds * 1000, (minSeconds + 3) * 1000);
        debug(`browse wait ${wait}ms: ${task.taskName || task.taskId}`);
        await sleep(wait);
        const taskApi = Number(task.subType) === 2 ? ACT_API : API;
        const extraHeaders = taskApi === ACT_API ? { needlogin: "true" } : {};
        const done = await post(auth, "/mtop/act/lego/task/done/v2", [
            {},
            { taskToken: start.data.taskToken, taskType: String(task.taskType) },
        ], taskApi, extraHeaders);
        return { ok: !!done && Number(done.code) === 0, message: messageOf(done) };
    }

    await sleep(1500);
    const done = await post(auth, "/mtop/mf/act/infinite/done", [
        {},
        { taskToken: start.data.taskToken, actId: task.actId, taskType: task.taskType },
    ]);
    return { ok: !!done && Number(done.code) === 0, message: messageOf(done) };
}

async function draw(auth, task) {
    const start = await post(auth, "/mtop/mf/act/infinite/do", [
        {},
        { actId: task.actId, taskId: task.taskId },
    ]);
    if (!start || Number(start.code) !== 0 || !start.data || !start.data.taskToken) {
        return { ok: false, message: messageOf(start), awards: [] };
    }
    const done = await post(auth, "/mtop/mf/act/infinite/done", [
        {},
        {
            actId: task.actId,
            taskToken: start.data.taskToken,
            taskType: task.taskType,
            extra: { privacyAuth: true },
        },
    ]);
    return {
        ok: !!done && Number(done.code) === 0,
        message: messageOf(done),
        awards: (done && done.data && done.data.awardList) || [],
    };
}

function post(auth, path, body, baseUrl = API, extraHeaders = {}) {
    return request(baseUrl + path, auth.headers, JSON.stringify(body), extraHeaders);
}

function request(url, sourceHeaders, body, extraHeaders = {}) {
    return new Promise((resolve) => {
        const headers = cleanHeaders(sourceHeaders || {});
        setHeader(headers, "content-type", "application/json");
        Object.keys(extraHeaders).forEach((key) => setHeader(headers, key, extraHeaders[key]));
        const opts = { url, headers, body };
        $.post(opts, (err, resp, data) => {
            if (err) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                resolve(null);
            }
        });
    });
}

function extractTasks(root) {
    const tasks = new Map();
    const walk = (value) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (value.taskId && value.actId && value.taskType !== undefined) {
            const previous = tasks.get(value.taskId);
            if (!previous || Number(value.serverTime || 0) >= Number(previous.serverTime || 0)) {
                tasks.set(value.taskId, value);
            }
        }
        Object.keys(value).forEach((key) => walk(value[key]));
    };
    walk(root);
    return Array.from(tasks.values());
}

function mainTaskQuery(body) {
    if (!body || !/infinite-task/.test(body)) return null;
    try {
        const parsed = JSON.parse(body);
        const list = parsed.query_list || (Array.isArray(parsed) && parsed[1] && parsed[1].query_list) || [];
        for (const item of list) {
            if (!item || item.resolver !== "infinite-task") continue;
            const parameter = typeof item.parameter === "string" ? JSON.parse(item.parameter) : item.parameter;
            const types = (parameter && parameter.taskTypeList) || [];
            const taskIds = parameter && parameter.taskIdList;
            const filtered = Array.isArray(taskIds) ? taskIds.length > 0 : !!taskIds;
            if (!parameter || !parameter.actId || filtered) continue;
            if ([101, 128, 200].every((type) => types.map(Number).includes(type))) {
                return { actId: String(parameter.actId) };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function cleanHeaders(source) {
    const result = {};
    Object.keys(source || {}).forEach((key) => {
        if (/^(content-length|host|connection|accept-encoding)$/i.test(key) || key.startsWith(":")) return;
        result[key] = source[key];
    });
    return result;
}

function header(headers, name) {
    const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : "";
}

function setHeader(headers, name, value) {
    const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
    headers[key || name] = value;
}

function normalizeCookie(raw) {
    const values = Array.isArray(raw) ? raw : [raw || ""];
    return values
        .join("\n")
        .split(/\r?\n/)
        .map((line) => line.replace(/^cookie:\s*/i, "").trim())
        .filter(Boolean)
        .join("; ")
        .replace(/;\s*;/g, ";");
}

// 提取错误提示
function messageOf(result) {
    if (!result) return "网络无响应";
    return result.message || result.msg || `code=${result.code}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function debug(content) {
    if (($.getdata("milottery_debug") || "false") !== "true") return;
    $.log(`[DEBUG] ${typeof content === "string" ? content : JSON.stringify(content)}`);
}

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== "undefined";
    this.isQuanX = () => typeof $task !== "undefined";
    this.isLoon = () => typeof $loon !== "undefined";
    this.log = (...args) => console.log(args.join("\n"));
    this.msg = (title = this.name, subtitle = "", body = "") => {
        if (this.isSurge() || this.isLoon()) $notification.post(title, subtitle, body);
        else if (this.isQuanX()) $notify(title, subtitle, body);
        console.log(["", `====📣${title}====`, subtitle, body].filter(Boolean).join("\n"));
    };
    this.getdata = (key) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
        if (this.isQuanX()) return $prefs.valueForKey(key);
        return null;
    };
    this.setdata = (value, key) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(value, key);
        if (this.isQuanX()) return $prefs.setValueForKey(value, key);
        return false;
    };
    this.post = (request, callback) => this.send(request, "POST", callback);
    this.send = (request, method, callback) => {
        if (this.isSurge() || this.isLoon()) {
            const fn = method === "POST" ? $httpClient.post : $httpClient.get;
            fn(request, (error, response, data) => {
                if (response) {
                    response.body = data;
                    response.statusCode = response.status || response.statusCode;
                }
                callback(error, response, data);
            });
        } else if (this.isQuanX()) {
            request.method = method;
            $task.fetch(request).then(
                (response) => callback(null, response, response.body),
                (error) => callback(error.error || error, null, null)
            );
        }
    };
    this.done = (value = {}) => {
        if (typeof $done !== "undefined") $done(value);
    };
}
