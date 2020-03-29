// ==UserScript==
// @name         云课堂智慧职教 职教云  Icve 网课助手(绿版v3)
// @version      3.0
// @description  职教云刷课刷题助手脚本,中文化自定义各项参数,自动课件,解除作业区复制粘贴限制,支持考试,自动三项评论,智能讨论,搜题填题,软件定制
// @author        tuChanged
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @match       *://*.zjy2.icve.com.cn/*
// @match       *zjy2.icve.com.cn/*
// @license      MIT
// @namespace https://greasyfork.org/users/449085
// @supportURL https://github.com/W-ChihC/SimpleIcveMoocHelper
// @contributionURL https://greasyfork.org/users/449085
// ==/UserScript==
'use strict'
const setting = {
    // 题库 IP地址 ,可在553行查看对接接口要求
    自定义题库服务器: "",// 协议://IP
    // 随机评论,自行扩充格式如     "你好",     (英文符号)
    随机评论词库: ["........", ".", "/n",],
    // 保证文档类与网站请求保持同步,因此速度较慢,实测可以不用这么严格,默认打开
    保险模式: true,
    /*影响刷课速度关键选项,延时非最优解,过慢请自行谨慎调整*/
    最高延迟响应时间: 5000,//毫秒
    最低延迟响应时间: 3000,//毫秒
    组件等待时间: 1500,//毫秒 组件包括视频播放器,JQuery等,视网络,设备性能而定,启动失败则调整
    //0-高清 1-清晰 2-流畅 3-原画 
    //感谢tonylu00提供最新实测参数 --0-原画 1-高清 2-清晰 3-流畅
    视频清晰度: 3,
    //2倍速,允许开倍速则有效,请放心使用,失败是正常现象
    视频播放倍速: 2,
    //是否保持静音
    是否保持静音: true,
    //默认关闭(false),true为打开
    //开启所有选项卡的评论,最高优先等级,打开该项会覆盖下面的细分设置,
    激活仅评论并关闭刷课件: false,
    激活所有选项卡的评论: false,
    激活评论选项卡: false,
    激活问答选项卡: false,
    激活笔记选项卡: false,
    激活报错选项卡: false,
    /*
    * 📣如果您有软件定制(管理系统,APP,小程序等),毕设困扰,又或者课程设计困扰等欢迎联系,
    *    价格从优,源码调试成功再付款💰,
    *     实力保证,包远程,包讲解 QQ:2622321887
    */

}, top = unsafeWindow,
    url = location.pathname
//产生区间随机数
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const classId = getQueryValue("openClassId")
const cellID = getQueryValue("cellId")
// 评论项标志位
const isTabsFinished = [false, false, false, false]
// 课件完成相关判定数据
let pageCount, mediaLong, cellType, startTime
//课件是否已完成
let isFinshed = false;
//定时任务栈
const taskStack = []
/**
 * 使用异步包装
 *  随机延迟执行方法
 * @param {需委托执行的函数} func
 */
async function delayExec(func, fixedDelay = null) {
    taskStack.push(func)
    return (await new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(taskStack.pop())
        }, rnd(
            fixedDelay || (setting.最低延迟响应时间) * (taskStack.length / 3),
            fixedDelay || (setting.最高延迟响应时间) * (taskStack.length / 2.5)
        ));
    }))()
}
// 一页页面加载后的工作,第一启动优先级
delayExec(() => {
    const $dialog = $(".ui-dialog");
    //关闭限制弹窗
    if ($dialog.length > 0)
        $dialog.find("#studyNow").click()
    //匹配不需要监听网络的URL
    switch (url) {
        //作业区
        case "/study/homework/preview.html":
        case "/study/homework/do.html":
        case "/study/onlineExam/preview.html":
        case "/study/onlineExam/do.html":
            homeworkHandler()
            break;
    }
    console.log(`脚本已启动 当前位置:${url}`);
}, setting.Jquery等待时间);
// 全局请求拦截器
(function (open, send) {
    // 拦截发出的请求
    XMLHttpRequest.prototype.send = function (data) {
        // 学生课件状态检查
        if (data.indexOf("studyNewlyTime") >= 0) {
            const readedNum = parseInt(getQueryValue("studyNewlyPicNum", "?" + data));
            const readedTime = parseFloat(getQueryValue("studyNewlyTime", "?" + data));
            console.log(`文档同步进度:${readedNum}/${pageCount}`, `视频同步进度:${readedTime}/${mediaLong}`);

            // 非媒体课件下启动
            if (!readedTime && !startTime)
                startTime = $.now()
            // 判断当前课件是否已结束
            if (pageCount === readedNum || (mediaLong != 0 && readedTime != 0 && (mediaLong === readedTime))) {
                isFinshed = true
                const endTime = $.now()

                // 应对检测需停留 10 秒
                if (endTime - startTime >= 10000) {
                    commentHandler()
                }
            } else if (setting.保险模式) {
                pageCount && console.log(`文档类🔐模式:${readedNum}/${pageCount}`);
                const pptNext = $(".stage-next"), docNext = $(".MPreview-pageNext");
                pptNext && pptNext.click()
                docNext && docNext.click()
            }
        }
        send.apply(this, arguments);
    };
    // 拦截数据响应
    XMLHttpRequest.prototype.open = function () {
        this.addEventListener("readystatechange", () => {
            if (this.readyState >= 4)
                requestMatcher(this.responseURL, JSON.parse(this.responseText))
        }, false);
        open.apply(this, arguments);
    };
})(XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send);
/**
 * 请求匹配器,任务调度中心
 */
async function requestMatcher(url, data) {
    switch (url) {
        // 评论
        case String(url.match(/.*getCellCommentData$/)):
            {
                const userId = localStorage.getItem("userId");
                const item = data.list && data.list.find(item => item.userId === userId);
                if (item) {
                    // 评论已完成
                    console.log(item);
                    isTabsFinished[data.type - 1] = true
                }
            }
            break;
        // 载入课件
        case String(url.match(/.*viewDirectory|loadCellResource$/)):
            {
                if (setting.激活仅评论并关闭刷课) {
                    commentHandler()
                    return
                }
                // 课件页数
                pageCount = data.pageCount
                // // 课件当前已阅览时间
                // readTime = data.stuStudyNewlyTime
                // 媒体时间长度
                mediaLong = data.audioVideoLong;
                // 课件进度
                const cellPercent = data.cellPercent
                // 课件类型
                cellType = data.categoryName
                // 如果当前课件为遗漏课件则进入下一个课件
                if (cellPercent === 100) {
                    nextCell()
                    return
                }
                cellHandlerMatcher()
                console.log(data);
            }
            break;
        // 课程章节目录
        case String(url.match(/.*getProcessList$/)):
            {
                const localS = localStorage.getItem(classId);
                //未在本地找到遗留数据则重新获取
                if (!localS || localS == "[]") {
                    console.log("正在获取未完成小节数据,为避免检测,请耐心等待");
                    const parentNode = data && data.progress;
                    //过滤已经学习完的课件
                    const dirs = parentNode && parentNode.moduleList.filter(item => item.percent !== 100)
                    //请求课程所有数据
                    const orginalData = (await sendIcveRequest(urls2.courseView_getCourseDetailList)).courseProcessInfo
                    //过滤掉已完成的章节
                    const list = orginalData && orginalData.filter(item => dirs.find(i => i.id === item.id))
                    const cid = getQueryValue("courseOpenId")
                    const oid = getQueryValue("openClassId")
                    //最终处理数据
                    const finalData = []
                    //提取未完成的课件
                    for (const item of list) {
                        for (const i of item.topics) {
                            // 最终需要处理的数据
                            console.log(item);
                            const cellList = (await sendIcveRequest(urls.process_getCellByTopicId, { courseOpenId: cid, openClassId: oid, topicId: i.id })).cellList

                            console.log(cellList);

                            cellList && cellList.forEach(item => {
                                const childList = item.childNodeList;
                                if (childList && childList.length !== 0) {
                                    const childVaildList = childList.filter(i => i.stuCellFourPercent !== 100);
                                    finalData.push(...childVaildList)
                                } else if (item.stuCellPercent !== 100) {
                                    finalData.push(item)
                                }
                            })
                        }
                    }
                    console.log(`已成功缓存${finalData.length}条未完成小节信息`);
                    localStorage.setItem(classId, JSON.stringify(finalData))
                }
                const data_ = JSON.parse(localStorage.getItem(classId))

                if (confirm(`✅已初始化完成,发现${data_.length}个课件未完成,是否立即启动不知疲倦学习🙇🏼‍♂️📚模式`))
                    goPage(null, data_[0])
            }
            break;
        default:
            if (data && data.msg && data.msg.indexOf("操作成功") < 0)
                console.log("无任务可分配");
            break;
    }
}
/**
 * 查找下一个课件,并在本地缓存更新相应信息
 */
function nextCell() {
    const data = JSON.parse(localStorage.getItem(classId));
    const surplusData = data.filter(item => item.Id !== cellID);
    localStorage.setItem(classId, JSON.stringify(surplusData))

    if (surplusData.length === 0) {
        alert("课程已完成")
        return
    }

    goPage(null, surplusData.pop())
}

/**
 * 跳转到某页面
 */
function goPage(url, data = undefined) {
    const newPage = `${location.origin}/common/directory/directory.html?courseOpenId=${data.courseOpenId}&openClassId=${classId}&cellId=${data.Id}&flag=${data.flag || "s"}&moduleId=${data.parentId}`;
    console.log(newPage);
    top.location.href = newPage
}

/**
 * 对网站发送请求集中处理,解析结果,处理成功与否逻辑
 */
function sendIcveRequest(url, data = {}) {
    return new Promise((resolve, reject) => {
        delayExec(() => {
            _.ajax(url, data, (r) => {
                if (r.code == 1) {
                    resolve(r)
                } else {
                    console.log("请求出问题了🔐", r)
                    reject(r)
                }
            })
        })
    })
}


/**
 * 课件匹配处理调度
 */
function cellHandlerMatcher() {
    switch (cellType) {
        case "图片":
        case "文档":
        case "excel文档":
        case "office文档":
        case "pdf文档":
            if (!setting.保险模式)
                docHandler()
            break;
        case "ppt":
        case "ppt文档":
            if (!setting.保险模式)
                pptHandler()
            break;
        case "swf":
            swfHandler()
            break;
        case "视频":
        case "音频":
            delayExec(() => {
                mediaHandler()
            }, setting.Jquery等待时间)
            break;
        case "图文":
        case "压缩包":
            emptyHandler()
            break;
        default:
            console.log(`课件 : ${cellType} 未提供兼容, ${setting.未做兼容课件打开评论 ? '已开启兼容评论,仅运行评论' : '已跳过处理'},请在github issue(https://github.com/W-ChihC/SimpleIcveMoocHelper)反馈该日志,与作者取得联系`);
            break
    }
}





/**
 * 获取url查询字段
 * @param {查询字段} query
 * @param 默认为地址栏
 */
function getQueryValue(query, url = window.location.search) {
    let theRequest = new Object();
    if (url.indexOf("?") != -1) {
        let str = url.substr(1);
        let strs = str.split("&");
        for (let i = 0; i < strs.length; i++)
            theRequest[strs[i].split("=")[0]] = unescape(strs[i].split("=")[1]);
    }
    return theRequest[query];
}


/**
 * 仅仅评论的处理器 
 */
async function emptyHandler() {
    console.log("啥也没干,请联系作者");
}

async function swfHandler() {
    //当不支持flash时执行
    if ($('.popBox').length !== 0) {
        $($('.popBox a')[1]).click()
    }
}

/**
 * 视频/音频类处理
 */
function mediaHandler() {
    let player = top.jwplayer($(".jwplayer").attr("id"));
    const state = player.getState();
    //视频暂停状态
    if (state == "paused" || state === 'idle') {
        console.log("媒体已暂停,恢复播放");
        player.play()
    }
    //配置
    player.setMute(setting.是否保持静音)//静音
    player.setCurrentQuality(setting.视频清晰度)
    try {
        player.setPlaybackRate(setting.视频播放倍速)
    } catch (error) {
        console.log('倍速开启失败...正常现象.');
    }
}
/**
 * 文档处理
 */
async function docHandler() {
    //根据按钮状态判断是否还有下一页
    while ($(".MPreview-pageNext").hasClass('current')) {
        console.log(`文档翻页,总页数:${pageCount}`);
        //ppt翻页 异步方式
        await delayExec(() => {
            $(".MPreview-pageNext").click()
        })
    }
}


/**
 * PPT类别处理
 */
async function pptHandler() {
    // 异步处理
    await new Promise(async (resolve, reject) => {
        for (let i = 1; i <= pageCount; i++) {
            //点击下一页
            await delayExec(() => {
                $(".stage-next").click()
                console.log(`ppt第${i}页,总页数:${pageCount}`);
                //达到次数解除阻塞
                if (isFinshed || i === pageCount)
                    resolve()
            })
        }
    })
}


/**
* 处理评论
*    并准备换页
*/
async function commentHandler() {
    if (!isTabsFinished[0] && setting.激活评论选项卡 || setting.激活所有选项卡的评论)
        await submitComment()
    if (!isTabsFinished[1] && setting.激活笔记选项卡 || setting.激活所有选项卡的评论)
        await submitNote()
    if (!isTabsFinished[2] && setting.激活问答选项卡 || setting.激活所有选项卡的评论)
        await submitQuestion()
    if (!isTabsFinished[3] && setting.激活报错选项卡 || setting.激活所有选项卡的评论)
        await submitReport()
    console.log("评论阶段结束工作,开始进入下一个课件");
    nextCell()
}
/**
 * 评论
 */
async function submitComment() {
    return new Promise(async (resolve, reject) => {
        //评5星
        $("#star #starImg4").click();
        //随机从词库填写评论
        $(".commentContent").text(setting.随机评论词库[rnd(0, setting.随机评论词库.length - 1)])
        //提交
        await delayExec(async () => {
            $("#btnComment").click();
            await delayExec(async () => {
                $(".sgBtn.ok").click();
                console.log("评论成功");
                isTabsFinished[0] = true
                resolve()
            });
        });
    })
}
/**
 * 问答
 */
async function submitQuestion() {
    await delayExec(() => {
        $($(".am-tabs-nav>li a")[1]).click()
    })
    return new Promise(async (resolve, reject) => {
        //随机从词库填写评论
        $(".questionContent").text(setting.随机评论词库[rnd(0, setting.随机评论词库.length - 1)])
        //提交
        await delayExec(async () => {
            $("#btnQuestion").click();
            await delayExec(async () => {
                $(".sgBtn.ok").click();
                console.log("问答成功");
                isTabsFinished[1] = true
                resolve()
            });
        }, 60000);

    })


}
/**
 * 笔记
 */
async function submitNote() {
    await delayExec(() => {
        $($(".am-tabs-nav>li a")[2]).click()
    })
    return new Promise(async (resolve, reject) => {

        //随机从词库填写评论
        $(".noteContent").text(setting.随机评论词库[rnd(0, setting.随机评论词库.length - 1)])
        //提交
        await delayExec(async () => {
            $("#btnNote").click();
            await delayExec(async () => {
                $(".sgBtn.ok").click();
                console.log("笔记成功");
                isTabsFinished[2] = true
                resolve()
            });
        });
    })
}
/**
 * 报错
 */
async function submitReport() {
    await delayExec(() => {
        $($(".am-tabs-nav>li a")[3]).click()
    })
    return new Promise(async (resolve, reject) => {

        //随机从词库填写评论
        $(".cellErrorContent").text(setting.随机评论词库[rnd(0, setting.随机评论词库.length - 1)])
        //提交
        await delayExec(async () => {
            $("#btnCellError").click();
            await delayExec(async () => {
                $(".sgBtn.ok").click();
                console.log("报错成功");
                isTabsFinished[3] = true
                resolve()
            });
        }, 60000);
    })
}


/*
*  解除文本限制
*/
function uncageCopyLimit() {
    let arr = ["oncontextmenu", "ondragstart", "onselectstart", "onselect", "oncopy", "onbeforecopy"]
    for (let i of arr)
        $(".hasNoLeft").attr(i, "return true")
    console.log("已成功复制解除限制,📣如果您有软件定制(管理系统,APP,小程序等),毕设困扰,又或者课程设计困扰等欢迎联系,价格从优,源码调试成功再付款💰,实力保证,包远程,包讲解 QQ:2622321887")
}



/**
* 作业处理
*/
function homeworkHandler() {
    uncageCopyLimit()
    bindBtnToQuestion()
}

// 重新渲染答题区的标志位
let reRender = false

/**
 * 将查询按钮按ID调用插入到题目区未位
*/
function bindBtnToQuestion() {
    // $(`<button class="qBtn" type="button">🔍</button>`).appendTo(".e-q-quest")
    // $($(".e-a-g")[2]).prev(".e-q-q")
    $(".e-q-quest").each(async (i, e) => {
        $(`<button class="qBtn" x="${i}" type="button">🔍</button>`).appendTo($(e))
    })
    //去除填空按钮,提高答案匹配
    $('.fillbox').detach()

    //绕过网站全局事件注册
    $(".qBtn").on("click", (event) => {
        reRender = true
        searchAnswer(event.srcElement.attributes["x"].value)
    })
}

const server = setting.自定义题库服务器 || "http://127.0.0.1:5000"

/**
 * //接口对接规范(JSON) 快速通道(/q?q=问题) 更多信息(/q2?q=问题)
 *  [
 *   {
 *    'question': '问题,可留空',
 *    'answer': '答案', //判断题 √为正确,其余为错误
 *    'options':'题目选项,可留空',
 *    'msg': '消息,可留空'
 * },{
 * 
 *    }
 * ]
 * 
 */

/**
 * 搜索答案
 * @param {*} i 
 */
function searchAnswer(i) {
    // 往前查找同辈元素
    const question = $($(".qBtn")[i]).prevAll(".e-q-q").text().trim();

    requestAPI('GET', `${server}/q?q=${question}`, {
        onSuccess: (xhr) => {
            const body = JSON.parse(xhr.responseText)
            showAnswerListDiv(question, body, i)
        }
    })
}

// 查看更多答案的锁
let nextLock = false
/**
 * 显示搜索框
 * @param {*} params 
 */
function showAnswerListDiv(questionTitle, data, id) {
    if ($("#answerBlock").length == 0) {
        const baseDiv = ` <div id="answerBlock"   style="background: #cccccc8c;max-width:50%; float: right; margin-right: 230px;height:400px;overflow:auto; position: fixed; top: 0; right: 0; z-index: 9999;">
                                    <table border="1" cellspacing="0" align="center" style="font-size: 14px;">
                                    <caption>${questionTitle}</caption>
                                    <thead>
                                        <tr>
                                            <th>标题</th>
                                            <th>填题目📝</th>
                                            <th>消息</th>
                                        </tr>
                                        <tr>
                                            <th colspan="2">选项</th>
                                        </tr>
                                        <tr>
                                            <th colspan="2">结果</th>
                                        </tr>
                                    </thead>
                                    <tbody align="left">
                                            
                                    </tbody>
                                    <tfoot align="center">
                                    <tr>
                                        <td><button type="button" id="nextBtn" >查找更多</a></td>
                                    </tr>
                                </tfoot>
                                </table>
                            </div>`
        $(baseDiv).appendTo("body")
        // 初次初始化后关闭
        reRender = false
        //允许查看更多
        nextLock = false
    } else {
        if (reRender) {
            //更新对应数据
            $("#answerBlock caption").text(questionTitle)
            //删除原有的数据
            $('#answerBlock tbody tr').detach()
            // 换题后立即关闭
            reRender = false
            //允许查看更多
            nextLock = false
        }
    }
    let tbody = "";
    data && data.forEach((item, i) => {
        if (item != null) {
            let { question, answer, options, msg } = item
            const x = rnd(10, 1000000) + i
            tbody += `
                    <tr>
                        <td>${question || ""}</td>
                        <td><button class="aBtn" aId="${x}" qId=${id} type="button">填入</button></td>
                        <td>
                            <p>${(msg && msg.length > 10) ? "" : msg}</p>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="3">${options || ""}</td>
                    </tr>
                    <tr>
                        <td colspan="3"><textarea id=${x} cols="20" rows="2">${answer || ""}</textarea></td>
                    </tr>
                    `
        }
    });

    /**
      * 查看更多
      */
    if (!nextLock) {
        $("#nextBtn").off("click")
        $("#nextBtn").on("click", (event) => {
            if (!nextLock)
                requestAPI('GET', `${server}/q2?q=${questionTitle}`, {
                    onSuccess: (xhr) => {
                        const body = JSON.parse(xhr.responseText)
                        console.log(body);
                        showAnswerListDiv(questionTitle, body, id)
                        //不再允许重复访问
                        nextLock = true
                    }
                })
        })
    }
    /**
     * tbody区
     */
    $(tbody).appendTo("#answerBlock table tbody")
    $('#answerBlock p').css({ margin: '0', wordwrap: 'break-word', maxwidth: '50px' });
    $('#answerBlock em').css({ color: 'red' })
    //绕过网站全局事件注册
    $(".aBtn").on("click", (event) => {
        fillAnswer(event.srcElement.attributes["aId"].value, event.srcElement.attributes["qId"].value)
    })

}
/**
 * 填题
 * @param {*} id  答案 ID
 */
function fillAnswer(aID, qId) {
    //todo 后端: 1,2,3
    const answer = $(`#${aID}`).val();
    const qBody = $($(".qBtn")[qId]).parents(".e-q-body");
    const questionType = qBody.data("questiontype");
    switch (questionType) {
        // <!-- 1：单选 2：多选 -->
        case 1:
            $(qBody.find(`.e-a-g li:contains('${answer}')`)).click()
            break;
        case 2:
            break;
        // < !--3：判断题-- >
        case 3:
            //默认第一项为正确
            $(qBody.find(".e-a-g li")[answer == "√" ? 0 : 1]).click()
            break;
        // <!-- 4：填空题(主观) 5：填空题(客观) 6 问答-->
        case 4:
        case 5:
            $(qBody.find(".e-a-g input")[0]).val(answer)
            break;
        case 6:
            $(qBody.find("textarea")[0]).val(answer)
            break;
        default:
            break;
    }
}

/**
* 对XHR的二次全局封装,方便后期扩展
* @param {*} method 
* @param {*} url 
* @param {*} headers 
* @param {*} data 
* @param {*} onSuccess 
*/
function requestAPI(method, url, { headers, data, onSuccess }) {
    GM_xmlhttpRequest({
        method: method,
        url: url,
        headers: headers,
        data: data,
        timeout: setting.请求超时,
        onload: function (xhr) {
            switch (xhr.status) {
                case 200:
                    // let obj = $.parseJSON(xhr.responseText) || {};
                    onSuccess(xhr)
                    break;
                default:
                    alert(xhr)
                    console.log(xhr);
                    break;
            }
        },
        ontimeout: function () {
            alert("响应超时")
        }
    });
}
