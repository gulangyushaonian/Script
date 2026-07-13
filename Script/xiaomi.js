const $ = new Env("小米抽奖");

const SCRIPT_VERSION = "2026-07-13.multi_v1"; 
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
    $.msg($.name, "", "✅ Cookie 已清除，请重新抓取");
    $.done();
} else {
    run().finally(() => $.done());
}

// 提取能够唯一标识账号的特征串（优先找 userId 或 serviceToken，找不到则取整个 Cookie 排除干扰项后的 md5 简写）
function getAccountFingerprint(cookieStr) {
    if (!cookieStr) return "";
    // 尝试匹配 userId=xxxx
    const userIdMatch = cookieStr.match(/userId=([^;\s]+)/);
    if (userIdMatch && userIdMatch[1]) return "uid_" + userIdMatch[1];
    
    // 尝试匹配 serviceToken=xxxx
    const tokenMatch = cookieStr.match(/serviceToken=([^;\s]+)/);
    if (tokenMatch && tokenMatch[1]) return "stoken_" + tokenMatch[1].slice(-20); // 取后20位作特征
    
    // 保底：去掉容易变动的空格后返回整体
    return cookieStr.replace(/\s+/g, "");
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
        $.msg($.name, "❌ Cookie 获取失败", "活动请求中没有 Cookie，请确认已登录小米商城");
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

    // 计算当前抓取账号的特征指纹
    const currentFingerprint = getAccountFingerprint(cookie);
    
    // 精确查找是否存在相同账号
    const matchIndex = accountList.findIndex(item => {
        const oldCk = header(item.headers, "cookie") || "";
        return getAccountFingerprint(oldCk) === currentFingerprint;
    });

    if (matchIndex > -1) {
        // 发现重复账号：直接替换更新，并保持位置不变
        accountList[matchIndex] = current;
        $.msg($.name, "", `✅ 账号 [${matchIndex + 1}] Cookie 更新替换成功`);
        $.log(`[INFO] 成功替换更新第 ${matchIndex + 1} 个账号的缓存数据`);
    } else {
        // 新账号：顺次追加
        accountList.push(current);
        $.msg($.name, "", `✅ 账号 [${accountList.length}] 抓取成功，当前共管理 ${accountList.length} 个账号`);
        $.log(`[INFO] 成功追加第 ${accountList.length} 个新账号`);
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

    $.log(`[INFO] 核心就绪，共检测到 ${accountList.length} 个账号，开始队列执行...\n`);

    let accIndex = 0;
    for (const auth of accountList) {
        accIndex++;
        $.log(`\n================== 开始执行账号 [${accIndex}/${accountList.length}] ==================`);
        
        if (!auth.body || !header(auth.headers || {}, "cookie")) {
            $.log(`[WARN] 账号 [${accIndex}] 数据结构不完整，跳过。`);
            continue;
        }

        const first = await queryTasks(auth);
        if (!first) continue;
        
        let tasks = extractTasks(first);
        const lottery = tasks.find((task) => Number(task.taskType) === 128);
        if (!lottery) {
            $.log(`⚠️ 账号 [${accIndex}] 未找到抽奖活动，可能配置已失效，跳过`);
            continue;
        }

        const now = Number(lottery.serverTime || Date.now());
        if ((lottery.startTime && now < lottery.startTime) || (lottery.endTime && now > lottery.endTime)) {
            $.log(`⚠️ 账号 [${accIndex}] 活动不在当前有效期内，跳过`);
            continue;
        }

        const taskResult = { done: 0, skipped: 0, failed: [] };
        let actionCount = 0;
        
        // 过滤出支持的任务列表
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

        // 刷新任务状态，准备抽奖
        const refreshed = await queryTasks(auth);
        if (!refreshed) continue;
        
        tasks = extractTasks(refreshed);
        const drawTask = tasks.find((task) => Number(task.taskType) === 128);
        if (!drawTask) {
            $.log(`⚠️ 账号 [${accIndex}] 重新查询后未找到抽奖入口`);
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
            if (i + 1 < drawCount) await sleep(3000); // 抽奖间隔略微拉开防风控
        }

        // 组装并推送当前账号结果
        const lines = [
            `任务状态: 完成 ${taskResult.done} 次 · 已跳过已完成项 ${taskResult.skipped} 个`,
            `抽奖状态: 成功 ${drawResult.count}/${drawCount} 次${drawResult.empty ? ` (其中未中奖 ${drawResult.empty} 次)` : ""}`,
        ];
        if (drawResult.prizes.length) lines.push(`🎁 奖品明细: ${drawResult.prizes.join("、")}`);
        if (taskResult.failed.length) lines.push(`⚠️ 任务中断: ${taskResult.failed[0]}`);
        if (drawResult.failed) lines.push(`⚠️ 抽奖中止: ${drawResult.failed}`);

        const isOk = !taskResult.failed.length && !drawResult.failed;
        $.msg(`${$.name} - 账号[${accIndex}]`, isOk ? "✅ 执行完成" : "⚠️ 部分完成", lines.join("\n"));
        
        // 账号间防黑头冷却延迟
        if (accountList.indexOf(auth) < accountList.length - 1) {
            $.log(`[INFO] 账号 [${accIndex}] 完毕，冷却 5 秒后安全切换下一个账号...`);
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
        debug(`query raw: ${JSON.stringify(result).slice(0, 500)}`);
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
                debug(`[${url}] request error: ${JSON.stringify(err)}`);
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                debug(`[${url}] parse error status=${resp && resp.statusCode}: ${(data || "").slice(0, 300)}`);
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
