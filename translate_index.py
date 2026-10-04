file_path = "c:/Users/user/Desktop/phi-sim/sim-phi/src/index.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    ("'Phi\\x67ros模拟器'", "'Phi\\x67ros Simulator'"),
    ("'<p>提示</p>'", "'<p>Hint</p>'"),
    ("'<p><a href=\"https://docs.lchz\\x68.net/project/sim-phi-core\" target=\"_blank\">点击此处</a>查看使用说明</p>'", "'<p><a href=\"https://docs.lchz\\x68.net/project/sim-phi-core\" target=\"_blank\">Click here</a> to view instructions</p>'"),
    ("'恢复默认设置(刷新生效)'", "'Restore default settings (refresh to apply)'"),
    ("'Early/Late特效'", "'Early/Late Effects'"),
    ("'显示定位点'", "'Show anchor point'"),
    ("'调试 blockArea'", "'Debug blockArea'"),
    ("'显示 blockArea 调试文本'", "'Show blockArea debug text'"),
    ("'显示Acc'", "'Show Acc'"),
    ("'显示统计'", "'Show statistics'"),
    ("'低分辨率'", "'Low resolution'"),
    ("'横屏锁定'", "'Lock landscape'"),
    ("'限制帧率'", "'Limit frame rate'"),
    ("'音画实时同步(若声音卡顿则建议关闭)'", "'Real-time audio sync (turn off if audio stutters)'"),
    ("'隐藏距离较远的音符'", "'Hide distant notes'"),
    ("'使用单精度浮点运算'", "'Use single-precision floating point'"),
    ("`读取文件：${uploaderDone}/${uploaderTotal}`", "`Reading files: ${uploaderDone}/${uploaderTotal}`"),
    ("'加载zip组件...'", "'Loading zip component...'"),
    ("`加载文件：${percent}% (${bytefm((evt as ProgressEvent).loaded)}/${bytefm((evt as ProgressEvent).total)})`", "`Loading file: ${percent}% (${bytefm((evt as ProgressEvent).loaded)}/${bytefm((evt as ProgressEvent).total)})`"),
    ("`不支持的文件：${data.pathname}\\n${data.data as string || 'Error: Unknown File Type'}`", "`Unsupported file: ${data.pathname}\\n${data.data as string || 'Error: Unknown File Type'}`"),
    ("`按太多下了！(${msg})`", "`Pressed too many times! (${msg})`"),
    ("'(当前设备或浏览器不支持)'", "'(Current device or browser not supported)'"),
    ("'检测到图片加载异常，请关闭所有应用程序然后重试'", "'Image loading anomaly detected, please close all applications and try again'"),
    ("'等待上传文件...'", "'Waiting for file upload...'"),
    ("'错误：解析资源时出现问题（点击查看详情）'", "'Error: Problem parsing resource (click for details)'"),
    ("`解析资源时出现问题：\\n${(err as Error).message}\\n原始数据：\\n${text}`", "`Problem parsing resource:\\n${(err as Error).message}\\nRaw data:\\n${text}`"),
    ("`加载资源：${Math.floor(loadedNum++ / res1.length * 100)}%`", "`Loading resource: ${Math.floor(loadedNum++ / res1.length * 100)}%`"),
    ("`资源加载失败，请检查您的网络连接然后重试：\\n${new URL(url, location.toString()).toString()}`", "`Resource load failed, please check your network connection and try again:\\n${new URL(url, location.toString()).toString()}`"),
    ("`资源加载失败，请检查您的网络连接然后重试：\\n${new URL(src, location.toString()).toString()}`", "`Resource load failed, please check your network connection and try again:\\n${new URL(src, location.toString()).toString()}`"),
    ("`音频加载存在问题，将导致以下音频无法正常播放：\\n${name}(${err.message})\\n如果多次刷新问题仍然存在，建议更换设备或浏览器。`", "`Audio load issue, will cause the following audio to not play properly:\\n${name}(${err.message})\\nIf the issue persists after refreshing, please change device or browser.`"),
    ("`错误：${errorNum++}个资源加载失败（点击查看详情）`", "`Error: ${errorNum++} resources failed to load (click for details)`"),
    ("'播放'", "'Play'"),
    ("'停止'", "'Stop'"),
    ("'继续'", "'Resume'"),
    ("'暂停'", "'Pause'"),
    ("'未选择任何谱面'", "'No chart selected'"),
    ("'未指定判定线id'", "'Judge line id not specified'"),
    ("`指定id的判定线不存在：${data.lineId}`", "`Judge line with specified id does not exist: ${data.lineId}`"),
    ("`图片不存在：${data.image}`", "`Image does not exist: ${data.image}`"),
    ("'<p>错误</p>'", "'<p>Error</p>'"),
    ("'初始化...'", "'Initializing...'")
]

for old_str, new_str in replacements:
    content = content.replace(old_str, new_str)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Translation complete.")
