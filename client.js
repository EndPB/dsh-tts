/**
 * dsh-tts — browser half.
 *
 *  - tool.call.toolview (`tts_speak`): inline speech card with a click-only
 *    Speech button; the host may still be synthesizing in the background;
 *  - conversation.chat.assistant-actions: per-message Speech / Pause / Resume;
 *  - conversation.chat.turnTail: `always` auto-read for turns completed after
 *    the page opened;
 *  - settings.section (`tts`): provider management, generation mode, cache.
 *
 * Nothing plays on mount: the user must click Speech. The tool card streams
 * its background job, while Read aloud waits for the full file so the progress
 * bar starts with an accurate duration.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-tts',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const CHANNEL = '/dsh-tts'
    const NS = 'dsh-tts'

    const DICTS = {
      en: {
        'provider.cosyvoice': 'CosyVoice',
        'provider.cosyvoice.desc': 'Alibaba Cloud Model Studio duplex streaming with cloned or designed voices.',
        'provider.edge': 'Edge TTS',
        'provider.edge.desc': 'Microsoft Edge online voices through the local edge-tts CLI.',
        'readAloud': 'Speech',
        'reading': 'Reading…',
        'pause': 'Pause',
        'resume': 'Resume',
        'synthesizing': 'Synthesizing…',
        'confirmTitle': 'Synthesize this reply?',
        'confirmBody': 'This reply has {n} characters; the confirmation threshold is {threshold}. Synthesis may take a while.',
        'confirmChars': '{n} characters',
        'confirmScroll': 'Scroll to read the full text',
        'seek': 'Drag to seek',
        'seekHint': 'Drag left or right to seek',
        'confirmYes': 'Synthesize',
        'confirmNo': 'Cancel',
        'stop': 'Stop',
        'busy': 'Synthesizing…',
        'pending': 'Starting speech synthesis…',
        'ready': 'Speech ready',
        'generating': 'Generating speech…',
        'failed': 'Speech synthesis failed',
        'characters': 'characters',
        'truncated': 'truncated',
        'settings.title': 'Speech',
        'settings.lead': 'Choose the default voice engine, tune each provider, and keep the DashScope key in the credential store.',
        'settings.loading': 'Loading speech settings…',
        'settings.loadError': 'Could not load speech settings.',
        'settings.retry': 'Retry',
        'settings.save': 'Save',
        'settings.saving': 'Saving…',
        'settings.saved': 'Saved',
        'settings.reset': 'Reset to defaults',
        'settings.confirmReset': 'Click again to reset',
        'settings.unsaved': 'Unsaved changes',
        'settings.defaultProvider': 'Default provider',
        'settings.auto': 'Automatic reading',
        'settings.autoOff': 'Off',
        'settings.autoTagged': 'When the model asks (tagged)',
        'settings.autoAlways': 'Every reply (always)',
        'settings.speechMode': 'Speech generation',
        'settings.speechModeAsync': 'Async — return immediately',
        'settings.speechModeBlocking': 'Blocking — wait for the audio',
        'settings.speechModeHint': 'Async lets the model keep replying while CosyVoice streams in the background. Playback still starts only when you click Speech.',
        'settings.systemPrompt': 'Add voice-output guidance to the system prompt',
        'settings.maxChars': 'Maximum spoken characters per call',
        'settings.confirmThreshold': 'Confirmation threshold for replies without a tts_speak call',
        'settings.confirmThresholdHint': 'Replies longer than this ask before synthesis; 0 always asks.',
        'settings.cache': 'Speech cache',
        'settings.cacheEnabled': 'Keep synthesized audio on disk',
        'settings.cacheMaxEntries': 'Maximum cached entries (0 = unlimited)',
        'settings.cacheMaxSize': 'Maximum cache size in MB (0 = unlimited)',
        'settings.cacheUsed': 'Cache usage',
        'settings.cacheClear': 'Clear speech cache',
        'settings.cacheConfirmClear': 'Click again to clear',
        'settings.cacheCleared': 'Speech cache cleared',
        'settings.cacheHint': 'Clearing removes audio only; the model-call text stays in the Session log.',
        'settings.provider': 'Provider',
        'settings.enabled': 'Enabled',
        'settings.disabled': 'Disabled',
        'settings.model': 'Model',
        'settings.voice': 'Voice',
        'settings.voiceHint': 'Pick a suggestion or type any voice id.',
        'settings.refreshVoices': 'Refresh voices',
        'settings.voiceLoading': 'Loading voices…',
        'settings.instruction': 'Emotion / style instruction',
        'settings.instructionHint': 'CosyVoice only. For example: 用开心的语气，语速稍快.',
        'settings.rate': 'Speech rate',
        'settings.pitch': 'Pitch',
        'settings.volume': 'Volume',
        'settings.languageHint': 'Language hint',
        'settings.streaming': 'Progressive playback',
        'settings.streamingHint': 'Start playing after the first sentence instead of waiting for the whole reply.',
        'settings.apiKey': 'API key',
        'settings.apiKeyHint': 'Stored by the DSH credentials service; never returned to this page.',
        'settings.configured': 'Configured',
        'settings.notConfigured': 'Not configured',
        'settings.replaceKey': 'Enter a new key to replace',
        'settings.enterKey': 'Paste the DashScope API key',
        'settings.saveKey': 'Save key',
        'settings.clearKey': 'Clear',
        'settings.keySaved': 'Key saved',
        'settings.keyCleared': 'Key cleared',
        'settings.source.stored': 'From the credential store',
        'settings.source.environment': 'From the environment',
        'settings.source.project-env': 'From the project .env',
        'settings.source.home-env': 'From the home .env',
        'settings.advanced': 'Advanced',
        'settings.apiKeyRef': 'Credential reference name',
        'settings.baseUrl': 'WebSocket endpoint',
        'settings.format': 'Audio format',
        'settings.sampleRate': 'Sample rate',
        'settings.bitRate': 'MP3 bit rate (kbps)',
        'settings.python': 'Python command',
        'settings.test': 'Preview',
        'settings.testing': 'Synthesizing…',
        'settings.check': 'Check',
        'settings.checking': 'Checking…',
        'settings.testText': 'Preview text',
        'settings.testTextPlaceholder': 'Text to speak in the preview',
        'settings.statusOk': 'Ready',
        'settings.statusFail': 'Unavailable',
        'settings.noProviders': 'Enable at least one provider.',
        'settings.file': 'Settings file',
        'settings.edgeRateHint': 'Edge syntax, for example +10%',
        'settings.edgePitchHint': 'Edge syntax, for example +0Hz',
        'settings.edgeVolumeHint': 'Edge syntax, for example +0%',
        'settings.playing': 'Playing preview…',
      },
      zh: {
        'provider.cosyvoice': 'CosyVoice',
        'provider.cosyvoice.desc': '阿里云百炼双向流式合成，支持克隆音色与定制音色。',
        'provider.edge': 'Edge TTS',
        'provider.edge.desc': '通过本机 edge-tts CLI 使用 Microsoft Edge 在线音色。',
        'readAloud': '语音',
        'reading': '读取中…',
        'pause': '暂停',
        'resume': '继续',
        'synthesizing': '合成中…',
        'confirmTitle': '合成这段回复？',
        'confirmBody': '这段回复有 {n} 字，超过确认阈值 {threshold} 字，合成可能需要一些时间。',
        'confirmChars': '共 {n} 字',
        'confirmScroll': '可滚动查看全文',
        'seek': '拖动调整进度',
        'seekHint': '左右拖动调整进度',
        'confirmYes': '合成',
        'confirmNo': '取消',
        'stop': '停止',
        'busy': '合成中…',
        'pending': '正在开始生成语音…',
        'ready': '语音已生成',
        'generating': '正在生成语音…',
        'failed': '语音合成失败',
        'characters': '字',
        'truncated': '已截断',
        'settings.title': '语音合成',
        'settings.lead': '选择默认语音引擎、调整各供应商参数；DashScope 密钥保存在 DSH 凭据存储中。',
        'settings.loading': '正在读取语音设置…',
        'settings.loadError': '读取语音设置失败。',
        'settings.retry': '重试',
        'settings.save': '保存',
        'settings.saving': '保存中…',
        'settings.saved': '已保存',
        'settings.reset': '恢复默认',
        'settings.confirmReset': '再点一次确认恢复',
        'settings.unsaved': '有未保存的修改',
        'settings.defaultProvider': '默认供应商',
        'settings.auto': '自动朗读',
        'settings.autoOff': '关闭',
        'settings.autoTagged': '模型需要时（tagged）',
        'settings.autoAlways': '每条回复（always）',
        'settings.speechMode': '语音生成方式',
        'settings.speechModeAsync': '异步 — 立即返回，后台合成',
        'settings.speechModeBlocking': '阻塞 — 等完整音频',
        'settings.speechModeHint': '异步模式让模型继续回复，CosyVoice 在后台流式合成；播放仍然只在你点击「语音」后开始。',
        'settings.systemPrompt': '在系统提示中加入语音输出说明',
        'settings.maxChars': '单次朗读最大字符数',
        'settings.confirmThreshold': '无 tts_speak 调用时的确认阈值',
        'settings.confirmThresholdHint': '超过该字数的回复会先弹窗确认；0 表示总是确认。',
        'settings.cache': '语音缓存',
        'settings.cacheEnabled': '将合成音频保留在磁盘',
        'settings.cacheMaxEntries': '最大缓存条目数（0 = 不限）',
        'settings.cacheMaxSize': '最大缓存容量 MB（0 = 不限）',
        'settings.cacheUsed': '缓存占用',
        'settings.cacheClear': '清理语音缓存',
        'settings.cacheConfirmClear': '再点一次确认清理',
        'settings.cacheCleared': '语音缓存已清理',
        'settings.cacheHint': '清理只删除音频；模型调用时的文本仍在 Session 日志中。',
        'settings.provider': '供应商',
        'settings.enabled': '启用',
        'settings.disabled': '已禁用',
        'settings.model': '模型',
        'settings.voice': '音色',
        'settings.voiceHint': '可从建议中选择，也可以直接输入任意音色 id。',
        'settings.refreshVoices': '刷新音色',
        'settings.voiceLoading': '正在加载音色…',
        'settings.instruction': '情感 / 风格指令',
        'settings.instructionHint': '仅 CosyVoice。例如：用开心的语气，语速稍快。',
        'settings.rate': '语速',
        'settings.pitch': '音调',
        'settings.volume': '音量',
        'settings.languageHint': '语言提示',
        'settings.streaming': '渐进播放',
        'settings.streamingHint': '第一句合成完就开始播放，不必等整段结束。',
        'settings.apiKey': 'API Key',
        'settings.apiKeyHint': '由 DSH 凭据服务保存，不会回传到本页面。',
        'settings.configured': '已配置',
        'settings.notConfigured': '未配置',
        'settings.replaceKey': '输入新密钥以替换',
        'settings.enterKey': '粘贴 DashScope API Key',
        'settings.saveKey': '保存密钥',
        'settings.clearKey': '清除',
        'settings.keySaved': '密钥已保存',
        'settings.keyCleared': '密钥已清除',
        'settings.source.stored': '来自凭据存储',
        'settings.source.environment': '来自环境变量',
        'settings.source.project-env': '来自项目 .env',
        'settings.source.home-env': '来自用户目录 .env',
        'settings.advanced': '高级',
        'settings.apiKeyRef': '凭据引用名',
        'settings.baseUrl': 'WebSocket 地址',
        'settings.format': '音频格式',
        'settings.sampleRate': '采样率',
        'settings.bitRate': 'MP3 码率（kbps）',
        'settings.python': 'Python 命令',
        'settings.test': '试听',
        'settings.testing': '合成中…',
        'settings.check': '检测',
        'settings.checking': '检测中…',
        'settings.testText': '试听文本',
        'settings.testTextPlaceholder': '输入试听时要朗读的文字',
        'settings.statusOk': '可用',
        'settings.statusFail': '不可用',
        'settings.noProviders': '请至少启用一个供应商。',
        'settings.file': '设置文件',
        'settings.edgeRateHint': 'Edge 语法，例如 +10%',
        'settings.edgePitchHint': 'Edge 语法，例如 +0Hz',
        'settings.edgeVolumeHint': 'Edge 语法，例如 +0%',
        'settings.playing': '正在播放试听…',
      },
    }
    const CSS = [
      '.dsh-tts-card{display:flex;flex-direction:column;gap:8px;margin:6px 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);max-width:560px}',
      '.dsh-tts-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.4;flex-wrap:wrap}',
      '.dsh-tts-title{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-tts-text{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dsh-tts-audio{width:100%;height:36px}',
      '.dsh-tts-card-foot{display:flex;align-items:center;gap:8px;min-height:22px}',
      '.dsh-tts-action{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s,color .15s}',
      '.dsh-tts-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-tts-action[aria-pressed="true"]{color:var(--dsw-alias-brand-primary)}',
      '.dsh-tts-action:disabled{opacity:.55;cursor:default}',
      '.dsh-tts-error{color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.dsh-tts-pending{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;padding:6px 2px}',
      '.dsh-tts-settings{display:flex;flex-direction:column;width:100%;color:var(--dsw-alias-label-primary)}',
      '.dsh-tts-settings-title{margin:0;font-size:16px;line-height:24px;font-weight:600}',
      '.dsh-tts-settings-lead{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:6px 0 14px}',
      '.dsh-tts-section{border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dsh-tts-row{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dsh-tts-row:last-child{border-bottom:0}',
      '.dsh-tts-row-label{min-width:0;flex:1}',
      '.dsh-tts-row-title{font-size:13px;line-height:20px}',
      '.dsh-tts-row-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}',
      '.dsh-tts-row-control{flex:0 0 auto;max-width:55%;display:flex;flex-direction:column;align-items:flex-end;gap:6px}',
      '.dsh-tts-input,.dsh-tts-select,.dsh-tts-textarea{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:6px 8px;min-width:180px;outline:none}',
      '.dsh-tts-input:focus,.dsh-tts-select:focus,.dsh-tts-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-tts-input:disabled,.dsh-tts-select:disabled,.dsh-tts-textarea:disabled{opacity:.55}',
      '.dsh-tts-textarea{min-width:260px;min-height:56px;resize:vertical}',
      '.dsh-tts-number{width:110px;min-width:110px}',
      '.dsh-tts-provider{border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);margin:14px 0;overflow:hidden}',
      '.dsh-tts-provider-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 16px;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-tts-provider-name{font-size:14px;line-height:20px;font-weight:600}',
      '.dsh-tts-provider-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}',
      '.dsh-tts-provider-body{padding:2px 16px 12px}',
      '.dsh-tts-provider-off{padding:12px 16px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-tts-provider-foot{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.dsh-tts-switch{position:relative;flex:0 0 auto;width:34px;height:20px;border-radius:999px;border:0;background:var(--dsw-alias-state-idle-primary);cursor:pointer;padding:0;transition:background .15s}',
      '.dsh-tts-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
      '.dsh-tts-switch:disabled{opacity:.5;cursor:default}',
      '.dsh-tts-switch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}',
      '.dsh-tts-switch[aria-checked="true"] .dsh-tts-switch-knob{transform:translateX(14px)}',
      '.dsh-tts-btn{font:inherit;font-size:12px;line-height:18px;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dsh-tts-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-tts-btn:disabled{opacity:.5;cursor:default}',
      '.dsh-tts-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.dsh-tts-btn-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}',
      '.dsh-tts-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-tts-pill.ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-tts-key{display:flex;flex-direction:column;align-items:flex-end;gap:6px}',
      '.dsh-tts-key-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.dsh-tts-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:16px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2);margin-top:8px}',
      '.dsh-tts-ok{color:var(--dsw-alias-state-success-primary);font-size:12px}',
      '.dsh-tts-error-text{color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.dsh-tts-muted{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-tts-dirty{color:var(--dsw-alias-state-warn-primary);font-size:12px}',
      '.dsh-tts-details{margin-top:4px}',
      '.dsh-tts-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;user-select:none}',
      '.dsh-tts-test-text{min-width:260px}',
      '.dsh-tts-now{display:flex;flex-direction:column;gap:6px;padding:8px 2px 4px;max-width:720px}',
      '.dsh-tts-now-text{position:relative;height:24px;overflow:hidden;white-space:nowrap;cursor:grab;user-select:none;touch-action:none;mask-image:linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%)}',
      '.dsh-tts-now-text:active{cursor:grabbing}',
      '.dsh-tts-now-track{display:inline-flex;align-items:center;height:24px;width:max-content;max-width:none;white-space:nowrap;transition:transform .12s linear;will-change:transform}',
      '.dsh-tts-now-pad{display:inline-block;height:1px;flex:0 0 auto}',
      '.dsh-tts-now-char{display:inline-block;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:24px;opacity:.4;transition:color .15s,opacity .15s}',
      '.dsh-tts-now-char.near{opacity:.72}',
      '.dsh-tts-now-char.current{color:var(--dsw-alias-brand-primary);opacity:1;font-weight:600}',
      '.dsh-tts-now-time{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.dsh-tts-now-bar{position:relative;flex:1;height:16px;cursor:pointer;touch-action:none;outline:none}',
      '.dsh-tts-now-bar::before{content:"";position:absolute;left:0;right:0;top:50%;height:3px;margin-top:-1.5px;border-radius:999px;background:var(--dsw-alias-border-l1)}',
      '.dsh-tts-now-bar:focus-visible::after{content:"";position:absolute;inset:-2px;border:2px solid var(--dsw-alias-brand-primary);border-radius:8px}',
      '.dsh-tts-now-fill{position:absolute;left:0;top:50%;height:3px;margin-top:-1.5px;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .18s linear}',
      '.dsh-tts-now-thumb{position:absolute;top:50%;width:10px;height:10px;margin-left:-5px;transform:translateY(-50%);border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1);pointer-events:none}',
      '.dsh-tts-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}',
      '.dsh-tts-modal-box{width:min(460px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:hidden;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.25)}',
      '.dsh-tts-modal-title{font-size:14px;font-weight:600}',
      '.dsh-tts-modal-summary{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-tts-modal-text{margin-top:8px;max-height:min(45vh,380px);overflow-y:auto;overscroll-behavior:contain;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);scrollbar-gutter:stable}',
      '.dsh-tts-modal-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-tts-modal-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.dsh-tts-cache-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
    ].join('\n')

    function installStyles() {
      const tag = document.createElement('style')
      tag.dataset.dshTts = '1'
      tag.textContent = CSS
      document.head.append(tag)
      return () => tag.remove()
    }

    function SpeakerIcon({ size = 15 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M4 9.3v5.4a1 1 0 0 0 1 1h3.1l4.2 3.4a1 1 0 0 0 1.6-.8V5.7a1 1 0 0 0-1.6-.8L8.1 8.3H5a1 1 0 0 0-1 1Z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M16.4 8.6a4.8 4.8 0 0 1 0 6.8M19 5.9a8.6 8.6 0 0 1 0 12.2',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
        }),
      )
    }
    // One shared <audio> for every surface: two players must never overlap.
    const audioListeners = new Set()
    let audioElement
    let audioState = { url: null, key: null, playing: false, loading: false, error: null, currentTime: 0, duration: 0, speech: null }

    function publish(next) {
      audioState = next
      for (const listener of [...audioListeners]) listener()
    }

    function audioFor() {
      if (audioElement === undefined) {
        audioElement = new Audio()
        audioElement.preload = 'auto'
        const syncTime = () => publish({
          ...audioState,
          currentTime: Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0,
          duration: Number.isFinite(audioElement.duration) && audioElement.duration > 0 ? audioElement.duration : audioState.duration,
        })
        audioElement.addEventListener('playing', () => publish({ ...audioState, playing: true, loading: false }))
        audioElement.addEventListener('pause', () => publish({ ...audioState, playing: false }))
        audioElement.addEventListener('waiting', () => publish({ ...audioState, loading: true }))
        audioElement.addEventListener('timeupdate', syncTime)
        audioElement.addEventListener('loadedmetadata', syncTime)
        audioElement.addEventListener('durationchange', syncTime)
        audioElement.addEventListener('seeked', syncTime)
        audioElement.addEventListener('ended', () => publish({ ...audioState, playing: false, loading: false, currentTime: audioState.duration }))
        audioElement.addEventListener('error', () => publish({ ...audioState, playing: false, loading: false, error: 'playback failed' }))
      }
      return audioElement
    }

    function playAudio(url, key, speech = null) {
      const element = audioFor()
      if (audioState.url !== url) {
        element.src = url
        publish({ url, key, playing: false, loading: true, error: null, currentTime: 0, duration: 0, speech })
      } else {
        publish({ ...audioState, key, speech: speech ?? audioState.speech, error: null })
      }
      try {
        const attempt = element.play()
        if (attempt !== undefined) {
          attempt
            .then(() => publish({ ...audioState, playing: true, loading: false }))
            // A browser-blocked play is not a stream failure: leave the media
            // error slot empty so the Read aloud fallback is not triggered.
            .catch(() => publish({ ...audioState, playing: false, loading: false }))
        }
      } catch (error) {
        publish({ ...audioState, playing: false, loading: false, error: String(error?.message ?? error) })
      }
    }

    function pauseAudio() {
      if (audioElement !== undefined) {
        audioElement.pause()
        publish({ ...audioState, playing: false, loading: false, currentTime: audioElement.currentTime || audioState.currentTime })
        return
      }
      publish({ ...audioState, playing: false, loading: false })
    }

    function resumeAudio() {
      const element = audioFor()
      if (element.src === '' || element.src === undefined) return
      try {
        const attempt = element.play()
        if (attempt !== undefined) {
          attempt
            .then(() => publish({ ...audioState, playing: true, loading: false }))
            .catch(() => publish({ ...audioState, playing: false, loading: false }))
        }
      } catch {
        publish({ ...audioState, playing: false, loading: false })
      }
    }

    function seekAudio(seconds) {
      const element = audioFor()
      if (element.src === '' || element.src === undefined) return
      const value = Number(seconds)
      if (!Number.isFinite(value)) return
      const hostDuration = Number(audioState.speech?.duration)
      const maximum = Number.isFinite(element.duration) && element.duration > 0
        ? element.duration
        : Number.isFinite(hostDuration) && hostDuration > 0 ? hostDuration : value
      const target = Math.max(0, Math.min(maximum, value))
      try {
        element.currentTime = target
      } catch {
        return
      }
      publish({ ...audioState, currentTime: target, playing: !element.paused, loading: false })
      if (!element.paused) {
        try { void element.play() } catch { /* the running element is already playing */ }
      }
    }

    function stopAudio() {
      if (audioElement !== undefined) {
        audioElement.pause()
        try {
          audioElement.currentTime = 0
        } catch {
          // A not-yet-loaded source cannot seek; pausing is enough.
        }
      }
      publish({ ...audioState, playing: false, loading: false, currentTime: 0 })
    }

    function disposeAudio() {
      stopAudio()
      if (audioElement !== undefined) {
        audioElement.removeAttribute('src')
        audioElement.load()
        audioElement = undefined
      }
      audioListeners.clear()
    }

    function useAudioState() {
      const subscribe = React.useCallback((listener) => {
        audioListeners.add(listener)
        return () => audioListeners.delete(listener)
      }, [])
      const snapshot = React.useCallback(() => audioState, [])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function createRpc(ctx) {
      return async function call(endpoint, payload) {
        const response = await ctx.connection.rpc.call(CHANNEL, endpoint, payload ?? null)
        if (response === null || typeof response !== 'object' || response.ok !== true) {
          const message = response?.error?.message
          throw new Error(typeof message === 'string' && message !== '' ? message : 'TTS request failed')
        }
        return response.value
      }
    }

    function createInfoStore(rpc) {
      let state = { status: 'loading', value: null, error: null }
      const listeners = new Set()
      const push = (next) => {
        state = next
        for (const listener of [...listeners]) listener()
      }
      const load = () => {
        rpc('info').then(
          (value) => push({ status: 'ready', value, error: null }),
          (error) => push({ status: 'error', value: null, error: String(error?.message ?? error) }),
        )
      }
      load()
      return {
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        snapshot: () => state,
        reload: load,
      }
    }

    function useInfo(infoStore) {
      const subscribe = React.useCallback((listener) => infoStore.subscribe(listener), [infoStore])
      const snapshot = React.useCallback(() => infoStore.snapshot(), [infoStore])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function useT(t) {
      return React.useCallback((key, fallback) => {
        const value = typeof t === 'function' ? t(key) : undefined
        return typeof value === 'string' && value !== '' && value !== key ? value : fallback ?? key
      }, [t])
    }

    function Toggle({ checked, onChange, label, disabled }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'dsh-tts-switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          title: label,
          disabled,
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dsh-tts-switch-knob' }),
      )
    }

    function SettingsRow({ title, hint, children }) {
      return h(
        'div',
        { className: 'dsh-tts-row' },
        h('div', { className: 'dsh-tts-row-label' }, h('div', { className: 'dsh-tts-row-title' }, title), hint ? h('div', { className: 'dsh-tts-row-hint' }, hint) : null),
        h('div', { className: 'dsh-tts-row-control' }, children),
      )
    }

    function Select({ value, onChange, options, disabled }) {
      return h(
        'select',
        { className: 'dsh-tts-select', value: value ?? '', disabled, onChange: (event) => onChange(event.target.value) },
        options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
      )
    }

    function NumberInput({ value, onChange, min, max, step = 1, disabled }) {
      return h('input', {
        type: 'number',
        className: 'dsh-tts-input dsh-tts-number',
        value: Number.isFinite(value) ? value : '',
        min,
        max,
        step,
        disabled,
        onChange: (event) => {
          const next = event.target.value === '' ? '' : Number(event.target.value)
          onChange(next)
        },
      })
    }

    function TextInput({ value, onChange, placeholder, disabled, type = 'text', className = 'dsh-tts-input', list }) {
      return h('input', {
        type,
        className,
        ...(list === undefined ? {} : { list }),
        value: value ?? '',
        placeholder: placeholder ?? '',
        disabled,
        onChange: (event) => onChange(event.target.value),
        spellCheck: false,
        autoComplete: 'off',
      })
    }
    function TtsToolView({ phase, block, t, rpc }) {
      const tx = useT(t)
      if (phase !== 'result') {
        return h('div', { className: 'dsh-tts-pending' }, h(SpeakerIcon), tx('pending', 'Starting speech synthesis…'))
      }
      const meta = block !== null && typeof block === 'object' && block.meta !== null && typeof block.meta === 'object' && block.meta.kind === 'dsh-tts' ? block.meta : null
      if (block.isError === true || meta === null) {
        return h('div', { className: 'dsh-tts-pending' }, h('span', { className: 'dsh-tts-error' }, tx('failed', 'Speech synthesis failed')))
      }
      return h(TtsCard, { meta, tx, rpc })
    }

    function TtsCard({ meta, tx, rpc }) {
      const audio = useAudioState()
      const [live, setLive] = React.useState(null)
      const liveComplete = live !== null && live.complete === true
      React.useEffect(() => {
        setLive(null)
      }, [meta.id])
      React.useEffect(() => {
        if (meta.complete !== false || liveComplete || typeof meta.id !== 'string' || typeof rpc !== 'function') return undefined
        let cancelled = false
        const tick = () => {
          rpc('speech', { id: meta.id }).then(
            (value) => { if (!cancelled && value !== null && typeof value === 'object') setLive(value) },
            () => {},
          )
        }
        tick()
        const timer = setInterval(tick, 700)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [meta.id, meta.complete, liveComplete, rpc])

      const data = live !== null && live.id === meta.id ? live : meta
      const complete = data.complete !== false
      const active = audio.key === meta.id
      const playing = active && audio.playing
      const loading = active && audio.loading
      const hostDuration = Number(data.duration)
      const effectiveDuration = Number.isFinite(hostDuration) && hostDuration > 0
        ? hostDuration
        : Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const ended = active && effectiveDuration > 0 && audio.currentTime >= effectiveDuration - 0.15
      const paused = active && !audio.playing && !audio.loading && audio.currentTime > 0 && !ended
      const onClick = () => {
        if (active && (audio.playing || audio.loading)) {
          pauseAudio()
          return
        }
        if (active && ended) {
          seekAudio(0)
          resumeAudio()
          return
        }
        if (active && paused) {
          resumeAudio()
          return
        }
        playAudio(meta.url, meta.id, {
          id: meta.id,
          text: String(data.text ?? ''),
          timings: Array.isArray(data.timings) ? data.timings : [],
          duration: Number(data.duration) || 0,
          complete,
          provider: meta.provider,
          voice: meta.voice,
        })
      }
      const label = loading
        ? tx('reading', 'Reading…')
        : playing
          ? tx('pause', 'Pause')
          : paused
            ? tx('resume', 'Resume')
            : tx('readAloud', 'Speech')
      const details = [meta.provider, meta.voice, `${String(meta.characters)} ${tx('characters', 'characters')}`]
        .filter((part) => typeof part === 'string' && part !== '')
        .join(' · ')
      const preview = String(data.text ?? '').slice(0, 200)
      return h(
        'div',
        { className: 'dsh-tts-card' },
        h(
          'div',
          { className: 'dsh-tts-head' },
          h('span', { className: 'dsh-tts-title' }, h(SpeakerIcon), ' ', complete ? tx('ready', 'Speech ready') : tx('generating', 'Generating speech…')),
          h('span', null, details),
          meta.truncated === true ? h('span', null, tx('truncated', 'truncated')) : null,
        ),
        preview ? h('div', { className: 'dsh-tts-text' }, preview) : null,
        h(
          'div',
          { className: 'dsh-tts-card-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-tts-action',
              title: tx('readAloud', 'Speech'),
              'aria-label': label,
              'aria-pressed': playing ? 'true' : 'false',
              onClick,
            },
            h(SpeakerIcon, { size: 14 }),
            h('span', null, label),
          ),
          complete ? null : h('span', { className: 'dsh-tts-muted' }, tx('generating', 'Generating speech…')),
          active && audio.error ? h('span', { className: 'dsh-tts-error' }, audio.error) : null,
        ),
      )
    }

    function speechMeta(value, sessionId) {
      return {
        id: value.id,
        sessionId,
        text: value.speechText ?? value.text ?? '',
        timings: Array.isArray(value.timings) ? value.timings : [],
        duration: Number(value.duration) || 0,
        complete: value.complete !== false,
        turn: value.turn,
        seq: value.seq,
        messageId: value.messageId,
        source: value.source,
        provider: value.provider,
        voice: value.voice,
      }
    }

    function ConfirmDialog({ info, tx, onConfirm, onCancel }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onCancel])
      const fullText = String(info.text ?? info.rawText ?? '')
      const body = tx('confirmBody', 'This reply has {n} characters; the confirmation threshold is {threshold}.')
        .replaceAll('{n}', String(info.characters))
        .replaceAll('{threshold}', String(info.threshold))
      let portal
      try {
        portal = require('react-dom')
      } catch {
        portal = undefined
      }
      const overlay = h(
        'div',
        { className: 'dsh-tts-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': tx('confirmTitle', 'Synthesize this reply?'), onMouseDown: onCancel },
        h(
          'div',
          { className: 'dsh-tts-modal-box', onMouseDown: (event) => event.stopPropagation() },
          h('div', { className: 'dsh-tts-modal-title' }, tx('confirmTitle', 'Synthesize this reply?')),
          h(
            'div',
            { className: 'dsh-tts-modal-summary' },
            body,
            ' ',
            tx('confirmChars', '{n} characters').replaceAll('{n}', String(info.characters)),
          ),
          fullText === ''
            ? null
            : h('div', { className: 'dsh-tts-modal-text', tabIndex: 0 }, fullText),
          fullText.length > 500
            ? h('div', { className: 'dsh-tts-modal-hint' }, tx('confirmScroll', 'Scroll to read the full text'))
            : null,
          h(
            'div',
            { className: 'dsh-tts-modal-actions' },
            h('button', { type: 'button', className: 'dsh-tts-btn', autoFocus: true, onClick: onCancel }, tx('confirmNo', 'Cancel')),
            h('button', { type: 'button', className: 'dsh-tts-btn dsh-tts-btn-primary', onClick: onConfirm }, tx('confirmYes', 'Synthesize')),
          ),
        ),
      )
      return portal !== undefined && typeof portal.createPortal === 'function' && typeof document !== 'undefined'
        ? portal.createPortal(overlay, document.body)
        : overlay
    }
    function ReadAloudAction({ messageId, sessionId, t, rpc }) {
      const tx = useT(t)
      const audio = useAudioState()
      const [phase, setPhase] = React.useState('idle')
      const [error, setError] = React.useState(null)
      const [confirm, setConfirm] = React.useState(null)
      const requestRef = React.useRef(0)
      const fallback = React.useRef(false)
      const active = audio.key === messageId || (audio.speech?.sessionId === sessionId && audio.speech?.messageId === messageId)
      const playing = active && audio.playing
      const busy = phase === 'reading' || phase === 'synthesizing'
      const hostDuration = Number(audio.speech?.duration)
      const effectiveDuration = Number.isFinite(hostDuration) && hostDuration > 0
        ? hostDuration
        : Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const ended = active && effectiveDuration > 0 && audio.currentTime >= effectiveDuration - 0.15
      const paused = active && !audio.playing && !audio.loading && audio.currentTime > 0 && !ended

      const playValue = (value) => {
        playAudio(value.url, messageId, speechMeta(value, sessionId))
        setPhase('playing')
      }

      const synthesizeNow = async (token, confirmed) => {
        setPhase('synthesizing')
        const value = await rpc('prepare', { source: 'message', sessionId, messageId, confirmed, stream: false })
        if (requestRef.current !== token) return
        if (value !== null && typeof value === 'object' && value.needsConfirm === true) {
          setConfirm(value)
          setPhase('idle')
          return
        }
        if (value === null || typeof value !== 'object' || typeof value.url !== 'string') throw new Error('no audio was produced')
        playValue(value)
      }

      const onClick = () => {
        setError(null)
        if (active && (audio.playing || audio.loading)) {
          pauseAudio()
          requestRef.current += 1
          setPhase('idle')
          return
        }
        if (active && ended) {
          seekAudio(0)
          resumeAudio()
          requestRef.current += 1
          setPhase('playing')
          return
        }
        if (active && paused) {
          resumeAudio()
          requestRef.current += 1
          setPhase('playing')
          return
        }
        const token = ++requestRef.current
        fallback.current = false
        setPhase('reading')
        rpc('speech', { sessionId, messageId }).then(async (info) => {
          if (requestRef.current !== token) return
          if (info.needsConfirm === true) {
            setConfirm(info)
            setPhase('idle')
            return
          }
          if (info.cacheHit === true && typeof info.url === 'string') {
            playValue(info)
            return
          }
          await synthesizeNow(token, true)
        }).catch((reason) => {
          if (requestRef.current !== token) return
          setError(String(reason?.message ?? reason))
          setPhase('idle')
        })
      }

      const confirmAndPlay = () => {
        const token = ++requestRef.current
        setConfirm(null)
        synthesizeNow(token, true).catch((reason) => {
          if (requestRef.current !== token) return
          setError(String(reason?.message ?? reason))
          setPhase('idle')
        })
      }

      React.useEffect(() => {
        if (audio.error === null || audio.key !== messageId || fallback.current) return
        fallback.current = true
        rpc('prepare', { source: 'message', sessionId, messageId, confirmed: true, stream: false })
          .then((value) => {
            if (value !== null && typeof value === 'object' && typeof value.url === 'string') {
              playAudio(value.url, messageId, speechMeta(value, sessionId))
              setPhase('playing')
            }
          })
          .catch((reason) => setError(String(reason?.message ?? reason)))
      }, [audio.error, audio.key, messageId, sessionId, rpc])

      const label = confirm !== null
        ? tx('readAloud', 'Speech')
        : ended
          ? tx('readAloud', 'Speech')
          : playing || phase === 'playing'
            ? tx('pause', 'Pause')
            : paused
              ? tx('resume', 'Resume')
              : phase === 'reading'
                ? tx('reading', 'Reading…')
                : phase === 'synthesizing'
                  ? tx('synthesizing', 'Synthesizing…')
                  : tx('readAloud', 'Speech')

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-tts-action',
            title: error ?? label,
            'aria-label': label,
            'aria-pressed': playing ? 'true' : 'false',
            disabled: busy,
            onClick,
          },
          h(SpeakerIcon, { size: 14 }),
          h('span', null, label),
        ),
        confirm === null ? null : h(ConfirmDialog, { info: confirm, tx, onConfirm: confirmAndPlay, onCancel: () => setConfirm(null) }),
      )
    }

    const watermarks = new Map()
    const ARM_DELAY_MS = 3000

    function shouldAutoplay(sessionId, seq) {
      if (!Number.isFinite(seq)) return false
      const now = Date.now()
      const entry = watermarks.get(sessionId)
      if (entry === undefined) {
        watermarks.set(sessionId, { seq, armedAt: now })
        return false
      }
      const fresh = seq > entry.seq
      if (fresh) entry.seq = seq
      if (now - entry.armedAt < ARM_DELAY_MS) return false
      return fresh
    }

    function AutoReadTurn({ sessionId, seq, infoStore, rpc }) {
      const info = useInfo(infoStore)
      React.useEffect(() => {
        if (info.status !== 'ready' || info.value === null) return
        if (info.value.auto !== 'always') return
        if (!shouldAutoplay(sessionId, seq)) return
        let cancelled = false
        rpc('prepare', { source: 'turn', sessionId, beforeSeq: seq, stream: false })
          .then((value) => {
            if (cancelled || value === null || typeof value !== 'object') return
            if (value.needsConfirm === true || typeof value.url !== 'string') return
            playAudio(value.url, `turn:${sessionId}:${String(seq)}`, speechMeta(value, sessionId))
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [info.status, info.value, sessionId, seq, rpc])
      return null
    }

    function formatBytes(value) {
      const bytes = Number(value) || 0
      if (bytes < 1024) return `${String(bytes)} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
    function formatClock(seconds) {
      const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
      const total = Math.floor(value)
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    function NowPlaying({ sessionId, turn, seq, t, rpc }) {
      const audio = useAudioState()
      const speech = audio.speech
      const [live, setLive] = React.useState(null)
      const [layoutTick, setLayoutTick] = React.useState(0)
      const [pad, setPad] = React.useState(360)
      const [offset, setOffset] = React.useState(0)
      const charRefs = React.useRef([])
      const textRef = React.useRef(null)
      const trackRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const tx = useT(t)
      const turnNumber = typeof turn === 'number'
        ? turn
        : turn !== null && typeof turn === 'object'
          ? (typeof turn.turn === 'number' ? turn.turn : turn.index)
          : undefined
      const same = speech !== null
        && speech !== undefined
        && speech.sessionId === sessionId
        && (
          (turnNumber !== undefined && speech.turn === turnNumber)
          || (speech.turn === undefined && Number.isFinite(speech.seq) && Number.isFinite(seq) && speech.seq <= seq && seq - speech.seq < 400)
        )

      React.useEffect(() => {
        setLive(null)
      }, [speech?.id])

      const liveComplete = live !== null && live !== undefined && live.complete === true
      React.useEffect(() => {
        if (!same || speech === null || speech === undefined || speech.complete !== false || liveComplete || typeof speech.id !== 'string') return
        let cancelled = false
        const tick = () => {
          rpc('speech', { id: speech.id }).then(
            (value) => { if (!cancelled && value !== null && typeof value === 'object') setLive(value) },
            () => {},
          )
        }
        tick()
        const timer = setInterval(tick, 600)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [same, speech?.id, speech?.complete, liveComplete, rpc])

      const data = live !== null && speech !== null && live.id === speech.id ? live : speech
      const text = String(data?.text ?? '')
      const chars = React.useMemo(() => Array.from(text), [text])
      const timings = Array.isArray(data?.timings) ? data.timings : []
      const hostDuration = Number(data?.duration)
      const total = Number.isFinite(hostDuration) && hostDuration > 0
        ? hostDuration
        : Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const current = total > 0 ? Math.min(Math.max(0, Number(audio.currentTime) || 0), total) : Math.max(0, Number(audio.currentTime) || 0)
      const currentMs = current * 1000
      let currentWord
      if (timings.length > 0) {
        currentWord = timings[0]
        for (const word of timings) {
          if (Number(word.begin_time) <= currentMs) currentWord = word
          else break
        }
      }
      let currentIndex
      let wordStart
      let wordEnd
      if (currentWord !== undefined) {
        currentIndex = Math.max(0, Math.min(chars.length - 1, Number(currentWord.begin_index) || 0))
        wordStart = Math.max(0, Number(currentWord.begin_index) || 0)
        wordEnd = Math.max(wordStart + 1, Number(currentWord.end_index) || wordStart + 1)
        const firstTiming = timings[0]
        const leadEndMs = Number(firstTiming.begin_time) || 0
        const leadEndIndex = Math.max(0, Number(firstTiming.begin_index) || 0)
        if (currentWord === firstTiming && leadEndMs > 0 && leadEndIndex > 0 && currentMs < leadEndMs) {
          const progress = Math.max(0, Math.min(1, currentMs / leadEndMs))
          currentIndex = Math.min(leadEndIndex - 1, Math.floor(progress * leadEndIndex))
          wordStart = currentIndex
          wordEnd = currentIndex + 1
        }
        const lastTiming = timings[timings.length - 1]
        const coveredEnd = Math.max(0, Number(currentWord.end_index) || 0)
        const lastEndMs = Number(currentWord.end_time) || 0
        // Some CosyVoice runs only timestamp the first sentence. Fill the
        // remaining text across the remaining audio so the tail still reaches
        // the centre instead of freezing on the first sentence.
        if (currentWord === lastTiming && coveredEnd < chars.length && total > lastEndMs / 1000 && currentMs > lastEndMs) {
          const span = Math.max(1, total * 1000 - lastEndMs)
          const progress = Math.min(1, Math.max(0, (currentMs - lastEndMs) / span))
          const tailIndex = coveredEnd + Math.floor(progress * (chars.length - coveredEnd))
          currentIndex = Math.max(0, Math.min(chars.length - 1, tailIndex))
          wordStart = currentIndex
          wordEnd = Math.min(chars.length, currentIndex + 1)
        }
      } else {
        currentIndex = total > 0
          ? Math.max(0, Math.min(chars.length - 1, Math.floor((current / total) * chars.length)))
          : 0
        wordStart = currentIndex
        wordEnd = currentIndex + 1
      }
      const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0

      const seekFromBar = (event) => {
        if (total <= 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return
        const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        seekAudio(fraction * total)
      }
      const onBarDown = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        seekFromBar(event)
      }
      const onBarMove = (event) => {
        if ((event.buttons & 1) === 0) return
        seekFromBar(event)
      }
      const onBarUp = (event) => {
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
      }
      const onBarKey = (event) => {
        if (total <= 0) return
        const step = event.shiftKey ? 15 : 5
        let target
        if (event.key === 'ArrowLeft') target = current - step
        else if (event.key === 'ArrowRight') target = current + step
        else if (event.key === 'Home') target = 0
        else if (event.key === 'End') target = total
        else return
        event.preventDefault()
        seekAudio(Math.max(0, Math.min(total, target)))
      }
      const onTextDown = (event) => {
        if (event.button !== 0 || total <= 0) return
        event.preventDefault()
        const container = textRef.current
        if (container === null) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          x: event.clientX,
          time: current,
          width: Math.max(1, container.getBoundingClientRect().width),
        }
      }
      const onTextMove = (event) => {
        const drag = dragRef.current
        if (drag === null || (event.buttons & 1) === 0) return
        const delta = (event.clientX - drag.x) / drag.width
        seekAudio(drag.time + delta * total)
      }
      const onTextUp = (event) => {
        dragRef.current = null
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
      }

      React.useEffect(() => {
        const container = textRef.current
        if (container === null) return
        const measure = () => {
          setPad((container.clientWidth || 720) / 2)
          setLayoutTick((value) => value + 1)
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(container)
        return () => observer.disconnect()
      }, [])

      React.useLayoutEffect(() => {
        const container = textRef.current
        if (container === null || container.clientWidth === 0) return
        const frame = requestAnimationFrame(() => {
          const element = charRefs.current[currentIndex]
          const target = textRef.current
          if (element === undefined || target === null || target.clientWidth === 0) return
          setOffset(element.offsetLeft + element.offsetWidth / 2 - target.clientWidth / 2)
        })
        return () => cancelAnimationFrame(frame)
      }, [currentIndex, text, timings.length, layoutTick, pad])

      if (!same || chars.length === 0) return null
      return h(
        'div',
        { className: 'dsh-tts-now' },
        h(
          'div',
          { className: 'dsh-tts-now-text', ref: textRef, title: tx('seekHint', 'Drag left or right to seek'), onPointerDown: onTextDown, onPointerMove: onTextMove, onPointerUp: onTextUp, onPointerCancel: onTextUp },
          h(
            'div',
            { className: 'dsh-tts-now-track', ref: trackRef, style: { transform: `translateX(${-offset}px)` } },
            h('span', { className: 'dsh-tts-now-pad', style: { width: `${String(pad)}px` } }),
            chars.map((char, index) => {
              const inWord = index >= wordStart && index < wordEnd
              const near = Math.abs(index - currentIndex) <= 10
              return h(
                'span',
                {
                  key: index,
                  ref: (element) => { charRefs.current[index] = element },
                  className: `dsh-tts-now-char${inWord ? ' current' : near ? ' near' : ''}`,
                },
                char === ' ' ? '\u00a0' : char,
              )
            }),
            h('span', { className: 'dsh-tts-now-pad', style: { width: `${String(pad)}px` } }),
          ),
        ),
        h(
          'div',
          { className: 'dsh-tts-now-time' },
          h('span', null, formatClock(current)),
          h(
            'div',
            {
              className: 'dsh-tts-now-bar',
              role: 'slider',
              tabIndex: 0,
              'aria-label': tx('seek', 'Drag to seek'),
              'aria-valuemin': 0,
              'aria-valuemax': Math.round(total * 10) / 10,
              'aria-valuenow': Math.round(current * 10) / 10,
              'aria-valuetext': `${formatClock(current)} / ${formatClock(total)}`,
              title: tx('seek', 'Drag to seek'),
              onPointerDown: onBarDown,
              onPointerMove: onBarMove,
              onPointerUp: onBarUp,
              onPointerCancel: onBarUp,
              onKeyDown: onBarKey,
            },
            h('div', { className: 'dsh-tts-now-fill', style: { width: `${pct}%` } }),
            total > 0 ? h('div', { className: 'dsh-tts-now-thumb', style: { left: `${pct}%` } }) : null,
          ),
          h('span', null, total > 0 ? formatClock(total) : '--:--'),
        ),
      )
    }
    function ProviderCard({ provider, draft, data, tx, update, saveKey, clearKey, keyDrafts, setKeyDrafts, test, testing, status, checkStatus, checking, voices, voiceLoading, refreshVoices }) {
      const id = provider.id
      const config = draft.providers[id]
      const enabled = config.enabled !== false
      const capabilities = provider.capabilities ?? {}
      const label = tx(`provider.${id}`, provider.label)
      const description = tx(`provider.${id}.desc`, provider.description)
      const list = voices[id] ?? []
      const constants = data.constants?.cosyvoice ?? {}
      const ref = id === 'cosyvoice' ? config.apiKeyRef : undefined
      const credential = ref === undefined ? undefined : data.credentials?.[ref]

      const fields = []
      if (id === 'cosyvoice') {
        fields.push(
          h(SettingsRow, { key: 'model', title: tx('settings.model') },
            h(Select, {
              value: config.model,
              onChange: (value) => update(id, 'model', value),
              options: (constants.models ?? [config.model]).map((model) => ({ value: model, label: model })),
            })),
          h(SettingsRow, { key: 'voice', title: tx('settings.voice'), hint: tx('settings.voiceHint') },
            h('div', { className: 'dsh-tts-key' },
              h(TextInput, { value: config.voice, onChange: (value) => update(id, 'voice', value), placeholder: 'longanyang', list: 'dsh-tts-voice-cosyvoice' }),
              h('datalist', { id: `dsh-tts-voice-${id}` }, list.map((voice) => h('option', { key: voice.id, value: voice.id, label: voice.label ?? voice.id }))),
            )),
          h(SettingsRow, { key: 'instruction', title: tx('settings.instruction'), hint: tx('settings.instructionHint') },
            h('textarea', {
              className: 'dsh-tts-textarea',
              value: config.instruction ?? '',
              placeholder: '用开心的语气，语速稍快',
              onChange: (event) => update(id, 'instruction', event.target.value),
            })),
          h(SettingsRow, { key: 'rate', title: tx('settings.rate') },
            h(NumberInput, { value: config.rate, min: 0.5, max: 2, step: 0.05, onChange: (value) => update(id, 'rate', value) })),
          h(SettingsRow, { key: 'pitch', title: tx('settings.pitch') },
            h(NumberInput, { value: config.pitch, min: 0.5, max: 2, step: 0.05, onChange: (value) => update(id, 'pitch', value) })),
          h(SettingsRow, { key: 'volume', title: tx('settings.volume') },
            h(NumberInput, { value: config.volume, min: 0, max: 100, step: 1, onChange: (value) => update(id, 'volume', value) })),
          h(SettingsRow, { key: 'language', title: tx('settings.languageHint') },
            h(Select, {
              value: config.languageHint ?? '',
              onChange: (value) => update(id, 'languageHint', value),
              options: [
                { value: '', label: 'Auto' },
                { value: 'zh', label: '中文 (zh)' },
                { value: 'en', label: 'English (en)' },
                { value: 'ja', label: '日本語 (ja)' },
                { value: 'ko', label: '한국어 (ko)' },
                { value: 'yue', label: '粤语 (yue)' },
              ],
            })),
          h(SettingsRow, { key: 'streaming', title: tx('settings.streaming'), hint: tx('settings.streamingHint') },
            h(Toggle, { checked: config.streaming !== false, label: tx('settings.streaming'), onChange: (value) => update(id, 'streaming', value) })),
          h(SettingsRow, { key: 'apiKey', title: tx('settings.apiKey'), hint: tx('settings.apiKeyHint') },
            h('div', { className: 'dsh-tts-key' },
              h('div', { className: 'dsh-tts-key-row' },
                h('span', { className: `dsh-tts-pill${credential?.configured ? ' ok' : ''}` }, credential?.configured ? tx('settings.configured') : tx('settings.notConfigured')),
                h(TextInput, {
                  type: 'password',
                  value: keyDrafts[ref] ?? '',
                  placeholder: credential?.configured ? tx('settings.replaceKey') : tx('settings.enterKey'),
                  disabled: credential?.writable === false,
                  onChange: (value) => setKeyDrafts((previous) => ({ ...previous, [ref]: value })),
                }),
                h('button', { type: 'button', className: 'dsh-tts-btn', disabled: (keyDrafts[ref] ?? '') === '' || credential?.writable === false, onClick: () => saveKey(ref) }, tx('settings.saveKey')),
                credential?.configured ? h('button', { type: 'button', className: 'dsh-tts-btn', onClick: () => clearKey(ref) }, tx('settings.clearKey')) : null,
              ),
              credential?.source ? h('div', { className: 'dsh-tts-row-hint' }, tx(`settings.source.${credential.source}`, credential.source)) : null,
            )),
        )
      }
      if (id === 'edge') {
        fields.push(
          h(SettingsRow, { key: 'voice', title: tx('settings.voice'), hint: voiceLoading[id] ? tx('settings.voiceLoading') : tx('settings.voiceHint') },
            h('div', { className: 'dsh-tts-key' },
              h(TextInput, { value: config.voice, onChange: (value) => update(id, 'voice', value), placeholder: 'zh-CN-XiaoyiNeural', list: 'dsh-tts-voice-edge' }),
              h('datalist', { id: `dsh-tts-voice-${id}` }, list.map((voice) => h('option', { key: voice.id, value: voice.id, label: voice.label ?? voice.id }))),
            )),
          h(SettingsRow, { key: 'rate', title: tx('settings.rate'), hint: tx('settings.edgeRateHint') },
            h(TextInput, { value: config.rate, onChange: (value) => update(id, 'rate', value), placeholder: '+10%' })),
          h(SettingsRow, { key: 'pitch', title: tx('settings.pitch'), hint: tx('settings.edgePitchHint') },
            h(TextInput, { value: config.pitch, onChange: (value) => update(id, 'pitch', value), placeholder: '+0Hz' })),
          h(SettingsRow, { key: 'volume', title: tx('settings.volume'), hint: tx('settings.edgeVolumeHint') },
            h(TextInput, { value: config.volume, onChange: (value) => update(id, 'volume', value), placeholder: '+0%' })),
        )
      }

      const advanced = []
      if (id === 'cosyvoice') {
        advanced.push(
          h(SettingsRow, { key: 'ref', title: tx('settings.apiKeyRef') },
            h(TextInput, { value: config.apiKeyRef, onChange: (value) => update(id, 'apiKeyRef', value) })),
          h(SettingsRow, { key: 'baseUrl', title: tx('settings.baseUrl') },
            h(TextInput, { value: config.baseUrl, onChange: (value) => update(id, 'baseUrl', value) })),
          h(SettingsRow, { key: 'format', title: tx('settings.format') },
            h(Select, {
              value: config.format,
              onChange: (value) => update(id, 'format', value),
              options: (constants.formats ?? ['mp3']).map((format) => ({ value: format, label: format })),
            })),
          h(SettingsRow, { key: 'sampleRate', title: tx('settings.sampleRate') },
            h(Select, {
              value: String(config.sampleRate),
              onChange: (value) => update(id, 'sampleRate', Number(value)),
              options: (constants.sampleRates ?? [24000]).map((rate) => ({ value: String(rate), label: String(rate) })),
            })),
          h(SettingsRow, { key: 'bitRate', title: tx('settings.bitRate') },
            h(NumberInput, { value: config.bitRate, min: 6, max: 510, step: 1, onChange: (value) => update(id, 'bitRate', value) })),
        )
      }
      if (id === 'edge') {
        advanced.push(
          h(SettingsRow, { key: 'python', title: tx('settings.python') },
            h(TextInput, { value: config.python, onChange: (value) => update(id, 'python', value) })),
        )
      }

      return h(
        'section',
        { className: 'dsh-tts-provider' },
        h(
          'div',
          { className: 'dsh-tts-provider-head' },
          h('div', null, h('div', { className: 'dsh-tts-provider-name' }, label), h('div', { className: 'dsh-tts-provider-desc' }, description)),
          h(Toggle, { checked: enabled, label: tx('settings.enabled'), onChange: (value) => update(id, 'enabled', value) }),
        ),
        enabled
          ? h(
              'div',
              { className: 'dsh-tts-provider-body' },
              fields,
              advanced.length > 0
                ? h('details', { className: 'dsh-tts-details' }, h('summary', null, tx('settings.advanced')), advanced)
                : null,
            )
          : h('div', { className: 'dsh-tts-provider-off' }, tx('settings.disabled')),
        h(
          'div',
          { className: 'dsh-tts-provider-foot' },
          h('button', { type: 'button', className: 'dsh-tts-btn', disabled: !enabled || testing, onClick: () => test(id) }, testing ? tx('settings.testing') : tx('settings.test')),
          h('button', { type: 'button', className: 'dsh-tts-btn', disabled: checking, onClick: () => checkStatus(id) }, checking ? tx('settings.checking') : tx('settings.check')),
          status === undefined ? null : h('span', { className: status.ok ? 'dsh-tts-ok' : 'dsh-tts-error-text' }, status.ok ? `${tx('settings.statusOk')}${status.detail ? ` · ${status.detail}` : ''}` : `${tx('settings.statusFail')} · ${status.reason}`),
          h('button', { type: 'button', className: 'dsh-tts-btn', disabled: voiceLoading[id], onClick: () => refreshVoices(id) }, voiceLoading[id] ? tx('settings.voiceLoading') : tx('settings.refreshVoices')),
        ),
      )
    }
    function TtsSettingsSection({ rpc, t, infoStore }) {
      const tx = useT(t)
      const [state, setState] = React.useState({ status: 'loading', data: null, error: null })
      const [draft, setDraft] = React.useState(null)
      const [keyDrafts, setKeyDrafts] = React.useState({})
      const [voices, setVoices] = React.useState({})
      const [voiceLoading, setVoiceLoading] = React.useState({})
      const [statuses, setStatuses] = React.useState({})
      const [testing, setTesting] = React.useState({})
      const [checking, setChecking] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [testText, setTestText] = React.useState('')
      const [resetting, setResetting] = React.useState(false)
      const [cacheArmed, setCacheArmed] = React.useState(false)
      const [cacheClearing, setCacheClearing] = React.useState(false)
      const resetTimer = React.useRef()
      const cacheTimer = React.useRef()
      const audio = useAudioState()
      const voiceLoaded = React.useRef(new Set())

      const load = React.useCallback(() => {
        setState((previous) => ({ ...previous, status: 'loading', error: null }))
        rpc('getSettings').then(
          (data) => {
            setState({ status: 'ready', data, error: null })
            setDraft(data.settings)
            setNotice(null)
          },
          (error) => setState({ status: 'error', data: null, error: String(error?.message ?? error) }),
        )
      }, [rpc])

      React.useEffect(() => {
        load()
        return () => {
          if (resetTimer.current !== undefined) clearTimeout(resetTimer.current)
          if (cacheTimer.current !== undefined) clearTimeout(cacheTimer.current)
        }
      }, [load])

      React.useEffect(() => {
        if (state.status !== 'ready' || state.data === null) return
        let cancelled = false
        for (const provider of state.data.providers) {
          if (voiceLoaded.current.has(provider.id)) continue
          voiceLoaded.current.add(provider.id)
          rpc('voices', { provider: provider.id }).then(
            (list) => {
              if (!cancelled) setVoices((previous) => ({ ...previous, [provider.id]: list }))
            },
            () => {
              if (!cancelled) setVoices((previous) => ({ ...previous, [provider.id]: [] }))
            },
          )
        }
        return () => {
          cancelled = true
        }
      }, [state.status, state.data, rpc])

      const saved = state.data?.settings ?? null
      const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)

      const update = (id, key, value) => {
        setDraft((previous) => {
          if (previous === null) return previous
          const next = {
            ...previous,
            providers: { ...previous.providers, [id]: { ...previous.providers[id], [key]: value } },
          }
          if (key === 'enabled' && value === false && previous.provider === id) {
            const other = id === 'cosyvoice' ? 'edge' : 'cosyvoice'
            if (next.providers[other]?.enabled !== false) next.provider = other
          }
          return next
        })
      }

      const save = () => {
        if (draft === null || busy) return
        setBusy(true)
        setNotice(null)
        rpc('saveSettings', { settings: draft }).then(
          (data) => {
            setState({ status: 'ready', data, error: null })
            setDraft(data.settings)
            setNotice({ kind: 'ok', text: tx('settings.saved', 'Saved') })
            infoStore.reload()
          },
          (error) => setNotice({ kind: 'error', text: String(error?.message ?? error) }),
        ).finally(() => setBusy(false))
      }

      const reset = () => {
        if (busy) return
        if (!resetting) {
          setResetting(true)
          resetTimer.current = setTimeout(() => setResetting(false), 3000)
          return
        }
        if (resetTimer.current !== undefined) clearTimeout(resetTimer.current)
        setResetting(false)
        setBusy(true)
        rpc('resetSettings').then(
          (data) => {
            setState({ status: 'ready', data, error: null })
            setDraft(data.settings)
            setNotice({ kind: 'ok', text: tx('settings.saved', 'Saved') })
            infoStore.reload()
          },
          (error) => setNotice({ kind: 'error', text: String(error?.message ?? error) }),
        ).finally(() => setBusy(false))
      }

      const clearCache = () => {
        if (cacheClearing) return
        if (!cacheArmed) {
          setCacheArmed(true)
          cacheTimer.current = setTimeout(() => setCacheArmed(false), 3000)
          return
        }
        if (cacheTimer.current !== undefined) clearTimeout(cacheTimer.current)
        setCacheArmed(false)
        setCacheClearing(true)
        rpc('clearCache').then(
          () => {
            setState((previous) => previous.data === null ? previous : ({
              ...previous,
              data: { ...previous.data, cacheStats: { ...(previous.data.cacheStats ?? {}), entries: 0, bytes: 0 } },
            }))
            setNotice({ kind: 'ok', text: tx('settings.cacheCleared', 'Speech cache cleared') })
          },
          (error) => setNotice({ kind: 'error', text: String(error?.message ?? error) }),
        ).finally(() => setCacheClearing(false))
      }

      const saveKey = (ref) => {
        const value = keyDrafts[ref] ?? ''
        if (value === '') return
        setNotice(null)
        rpc('setCredential', { ref, value }).then(
          (info) => {
            setState((previous) => previous.data === null ? previous : ({
              ...previous,
              data: { ...previous.data, credentials: { ...previous.data.credentials, [ref]: info } },
            }))
            setKeyDrafts((previous) => ({ ...previous, [ref]: '' }))
            setNotice({ kind: 'ok', text: tx('settings.keySaved', 'Key saved') })
          },
          (error) => setNotice({ kind: 'error', text: String(error?.message ?? error) }),
        )
      }

      const clearKey = (ref) => {
        setNotice(null)
        rpc('clearCredential', { ref }).then(
          (info) => {
            setState((previous) => previous.data === null ? previous : ({
              ...previous,
              data: { ...previous.data, credentials: { ...previous.data.credentials, [ref]: info } },
            }))
            setNotice({ kind: 'ok', text: tx('settings.keyCleared', 'Key cleared') })
          },
          (error) => setNotice({ kind: 'error', text: String(error?.message ?? error) }),
        )
      }

      const test = (id) => {
        if (draft === null) return
        setTesting((previous) => ({ ...previous, [id]: true }))
        setStatuses((previous) => ({ ...previous, [id]: undefined }))
        const text = testText.trim() === '' ? undefined : testText.trim()
        rpc('preview', { provider: id, overrides: draft.providers[id], ...(text === undefined ? {} : { text }) }).then(
          (value) => {
            if (value !== null && typeof value === 'object' && typeof value.url === 'string') playAudio(value.url, `preview:${id}`)
          },
          (error) => setStatuses((previous) => ({ ...previous, [id]: { ok: false, reason: String(error?.message ?? error) } })),
        ).finally(() => setTesting((previous) => ({ ...previous, [id]: false })))
      }

      const checkStatus = (id) => {
        if (draft === null) return
        setChecking((previous) => ({ ...previous, [id]: true }))
        rpc('status', { provider: id, overrides: draft.providers[id] }).then(
          (value) => setStatuses((previous) => ({ ...previous, [id]: value })),
          (error) => setStatuses((previous) => ({ ...previous, [id]: { ok: false, reason: String(error?.message ?? error) } })),
        ).finally(() => setChecking((previous) => ({ ...previous, [id]: false })))
      }

      const refreshVoices = (id) => {
        if (draft === null) return
        setVoiceLoading((previous) => ({ ...previous, [id]: true }))
        rpc('voices', { provider: id, overrides: draft.providers[id] }).then(
          (list) => setVoices((previous) => ({ ...previous, [id]: list })),
          () => setVoices((previous) => ({ ...previous, [id]: [] })),
        ).finally(() => setVoiceLoading((previous) => ({ ...previous, [id]: false })))
      }

      if (state.status === 'loading') {
        return h('div', { className: 'dsh-tts-settings' }, h('div', { className: 'dsh-tts-muted' }, tx('settings.loading', 'Loading speech settings…')))
      }
      if (state.status === 'error') {
        return h(
          'div',
          { className: 'dsh-tts-settings' },
          h('div', { className: 'dsh-tts-error-text' }, tx('settings.loadError', 'Could not load speech settings.')),
          h('div', { className: 'dsh-tts-muted' }, state.error),
          h('button', { type: 'button', className: 'dsh-tts-btn', onClick: load }, tx('settings.retry', 'Retry')),
        )
      }
      if (draft === null || state.data === null) return null

      const enabledProviders = state.data.providers.filter((provider) => draft.providers[provider.id]?.enabled !== false)
      const providerOptions = (enabledProviders.length > 0 ? enabledProviders : state.data.providers).map((provider) => ({
        value: provider.id,
        label: tx(`provider.${provider.id}`, provider.label),
      }))
      const previewPlaying = audio.key?.startsWith('preview:') === true && audio.playing

      return h(
        'div',
        { className: 'dsh-tts-settings' },
        h('h2', { className: 'dsh-tts-settings-title' }, tx('settings.title', 'Speech')),
        h('p', { className: 'dsh-tts-settings-lead' }, tx('settings.lead', '')),
        h(
          'section',
          { className: 'dsh-tts-section' },
          h(SettingsRow, { title: tx('settings.defaultProvider', 'Default provider') },
            h(Select, { value: draft.provider, onChange: (value) => setDraft((previous) => ({ ...previous, provider: value })), options: providerOptions })),
          h(SettingsRow, { title: tx('settings.speechMode', 'Speech generation'), hint: tx('settings.speechModeHint', '') },
            h(Select, {
              value: draft.speech?.mode ?? 'async',
              onChange: (value) => setDraft((previous) => ({ ...previous, speech: { ...(previous.speech ?? {}), mode: value } })),
              options: [
                { value: 'async', label: tx('settings.speechModeAsync', 'Async — return immediately') },
                { value: 'blocking', label: tx('settings.speechModeBlocking', 'Blocking — wait for the audio') },
              ],
            })),
          h(SettingsRow, { title: tx('settings.auto', 'Automatic reading') },
            h(Select, {
              value: draft.auto,
              onChange: (value) => setDraft((previous) => ({ ...previous, auto: value })),
              options: [
                { value: 'off', label: tx('settings.autoOff', 'Off') },
                { value: 'tagged', label: tx('settings.autoTagged', 'When the model asks') },
                { value: 'always', label: tx('settings.autoAlways', 'Every reply') },
              ],
            })),
          h(SettingsRow, { title: tx('settings.systemPrompt', 'Add voice-output guidance') },
            h(Toggle, { checked: draft.systemPrompt !== false, label: tx('settings.systemPrompt'), onChange: (value) => setDraft((previous) => ({ ...previous, systemPrompt: value })) })),
          h(SettingsRow, { title: tx('settings.maxChars', 'Maximum spoken characters') },
            h(NumberInput, { value: draft.maxChars, min: 100, max: 100000, step: 100, onChange: (value) => setDraft((previous) => ({ ...previous, maxChars: value })) })),
          h(SettingsRow, { title: tx('settings.confirmThreshold', 'Confirmation threshold'), hint: tx('settings.confirmThresholdHint', '') },
            h(NumberInput, {
              value: draft.speech?.confirmThreshold ?? 100,
              min: 0,
              max: 1000000,
              step: 10,
              onChange: (value) => setDraft((previous) => ({ ...previous, speech: { ...(previous.speech ?? {}), confirmThreshold: Number(value) || 0 } })),
            })),
        ),
        h(
          'section',
          { className: 'dsh-tts-section' },
          h(SettingsRow, { title: tx('settings.cache', 'Speech cache'), hint: tx('settings.cacheHint', '') },
            h(Toggle, {
              checked: draft.cache?.enabled !== false,
              label: tx('settings.cacheEnabled', 'Keep synthesized audio on disk'),
              onChange: (value) => setDraft((previous) => ({ ...previous, cache: { ...(previous.cache ?? {}), enabled: value } })),
            })),
          h(SettingsRow, { title: tx('settings.cacheMaxEntries', 'Maximum cached entries') },
            h(NumberInput, {
              value: draft.cache?.maxEntries ?? 0,
              min: 0,
              max: 10000000,
              step: 10,
              onChange: (value) => setDraft((previous) => ({ ...previous, cache: { ...(previous.cache ?? {}), maxEntries: Number(value) || 0 } })),
            })),
          h(SettingsRow, { title: tx('settings.cacheMaxSize', 'Maximum cache size (MB)') },
            h(NumberInput, {
              value: draft.cache?.maxSizeMB ?? 0,
              min: 0,
              max: 10000000,
              step: 10,
              onChange: (value) => setDraft((previous) => ({ ...previous, cache: { ...(previous.cache ?? {}), maxSizeMB: Number(value) || 0 } })),
            })),
          h(SettingsRow, { title: tx('settings.cacheUsed', 'Cache usage'), hint: state.data.cacheStats?.dir ?? draft.cache?.dir ?? '' },
            h('div', { className: 'dsh-tts-cache-row' },
              h('span', { className: 'dsh-tts-muted' }, `${String(state.data.cacheStats?.entries ?? 0)} · ${formatBytes(state.data.cacheStats?.bytes ?? 0)}`),
              h('button', {
                type: 'button',
                className: 'dsh-tts-btn',
                disabled: cacheClearing,
                onClick: clearCache,
              }, cacheClearing ? tx('settings.cacheClear', 'Clear speech cache') : cacheArmed ? tx('settings.cacheConfirmClear', 'Click again to clear') : tx('settings.cacheClear', 'Clear speech cache')),
            )),
        ),
        h(
          'section',
          { className: 'dsh-tts-section' },
          h(SettingsRow, { title: tx('settings.testText', 'Preview text') },
            h(TextInput, { className: 'dsh-tts-input dsh-tts-test-text', value: testText, placeholder: tx('settings.testTextPlaceholder', ''), onChange: setTestText })),
        ),
        state.data.providers.map((provider) => h(ProviderCard, {
          key: provider.id,
          provider,
          draft,
          data: state.data,
          tx,
          update,
          saveKey,
          clearKey,
          keyDrafts,
          setKeyDrafts,
          test,
          testing: testing[provider.id] === true,
          status: statuses[provider.id],
          checkStatus,
          checking: checking[provider.id] === true,
          voices,
          voiceLoading,
          refreshVoices,
        })),
        previewPlaying ? h('div', { className: 'dsh-tts-muted' }, tx('settings.playing', 'Playing preview…')) : null,
        h(
          'div',
          { className: 'dsh-tts-actions' },
          h('button', { type: 'button', className: 'dsh-tts-btn dsh-tts-btn-primary', disabled: !dirty || busy, onClick: save }, busy ? tx('settings.saving', 'Saving…') : tx('settings.save', 'Save')),
          h('button', { type: 'button', className: 'dsh-tts-btn', disabled: busy, onClick: reset }, resetting ? tx('settings.confirmReset', 'Click again to reset') : tx('settings.reset', 'Reset to defaults')),
          dirty ? h('span', { className: 'dsh-tts-dirty' }, tx('settings.unsaved', 'Unsaved changes')) : null,
          notice === null ? null : h('span', { className: notice.kind === 'ok' ? 'dsh-tts-ok' : 'dsh-tts-error-text', role: 'status' }, notice.text),
        ),
        h('div', { className: 'dsh-tts-muted' }, `${tx('settings.file', 'Settings file')}: ${state.data.settingsFile}`),
      )
    }
    return {
      name: '@local/dsh-tts',
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en), 'dsh-tts: en locale')
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh), 'dsh-tts: zh locale')
        const t = ctx.locale.bind(NS)
        const rpc = createRpc(ctx)
        const infoStore = createInfoStore(rpc)

        ctx.effect(() => installStyles(), 'dsh-tts: styles')
        ctx.effect(() => () => disposeAudio(), 'dsh-tts: audio element')

        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register(
            { name: 'tool.call.toolview', key: 'tts_speak', inject: () => ({ t, rpc }) },
            TtsToolView,
          ),
        )

        ctx.slots.inject('conversation.chat.assistant-actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.assistant-actions',
              id: 'dsh-tts/read-aloud',
              order: 20,
              locale: NS,
              inject: (sessionId) => ({ sessionId, t, rpc }),
            },
            ReadAloudAction,
          ),
        )

        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'dsh-tts/now-playing',
              order: 30,
              locale: NS,
              inject: (sessionId) => ({ sessionId, t, rpc }),
            },
            NowPlaying,
          ),
        )

        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'dsh-tts/auto-read',
              order: 40,
              locale: NS,
              inject: (sessionId) => ({ sessionId, t, rpc, infoStore }),
            },
            AutoReadTurn,
          ),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'tts',
              order: 12,
              label: () => t('settings.title'),
              inject: () => ({ rpc, t, infoStore }),
            },
            TtsSettingsSection,
          ),
        )
      },
    }
  },
})
