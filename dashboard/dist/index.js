/**
 * Duty Board — Hermes web dashboard plugin.
 * The i18n block is deliberately self-contained so it can be checked without
 * loading the dashboard runtime.
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !window.__HERMES_PLUGINS__) return;
  const { React } = SDK;
  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef } = SDK.hooks;
  const API = "/api/plugins/duty-board";
  const POLL_MS = 5000;

  /* i18n:start */
  const MESSAGES = {"en":{"appTitle":"Duty Board","appSubtitle":"Live status of conversations, background work, and scheduled jobs","openIn":"Open links in","discordApp":"Discord app","browser":"Browser","warnings":"Some data is unavailable","waiting":"Waiting on you","waitingHint":"The last reply asks for your decision, oldest first","unanswered":"You wrote, but no reply arrived","waitingEmpty":"Nothing is waiting on you","unansweredAge":"waiting {value}","waitingAge":"waiting {value}","causedBy":"Because: {value}","you":"You: {value}","openInDiscord":"Open in Discord","web":"Web","dismiss":"Dismiss","seen":"Seen","collapse":"Collapse","expandMore":{"one":"Show {count} more","other":"Show {count} more"},"running":"Running","runningHint":"A full bar represents one hour","allIdle":"All idle","runningFor":"running {value}","stalledFor":"quiet for {value}","doing":"Working","privateConversation":"Conversation with {who}","someone":"someone","privateContent":"Content hidden","delegations":"Background jobs","noDelegations":"No background jobs running","completedNotDelivered":"Finished, but not delivered","delegationHint":"The result may be in a newer conversation; open it to check, then dismiss","parallel":{"one":"{count} parallel","other":"{count} parallel"},"completedAt":"completed {value}","handled":"Handled","cron":"Scheduled jobs","cronPaused":{"one":"{count} paused","other":"{count} paused"},"cronRunning":"Running","cronScript":"script","cronUpcoming":"next {time} · {name}","cronReason":{"lastError":"Error: {detail}","deliveryError":"Delivery failed: {detail}","state":"State: {detail}","overdue":"Overdue"},"recentDone":"Recently completed","recentDoneHint":"Within the last day; the last reply was a report, not a question","promised":"Said it would follow up","none":"None","goals":"Standing goals","staleGoals":{"one":"{count} older goal is hidden","other":"{count} older goals are hidden"},"noGoals":"No standing goals in the lookback window","progress":{"one":"{turns}/{count} turn","other":"{turns}/{count} turns"},"active":"Active","paused":"Paused","gateway":{"connected":"online","retrying":"reconnecting","disconnected":"offline","error":"error"},"refreshed":"updated {value} ago","justNow":"updated just now","loading":"Loading…","loadFailed":"Load failed: {error}","stale":"data is {value} old","sectionUnavailable":"Section unavailable","neverRan":"Never ran","ago":"{value} ago","in":"in {value}","soon":"soon","conversation":"Conversation","activity":{"output":"Streaming","response":"Waiting for model response","waiting":"Waiting for {who} · {duration}","call":"Model call #{n}","callDone":"Model call complete","starting":"Just started","retry":"Retrying API call {a}/{b}","tool":"Running {tool}","toolDone":"{tool} complete","toolError":"{tool} failed","terminal":"Terminal command running ({duration})","script":"Script running ({duration})","compressed":"Context compression complete","subtask":"Subtask · {value}"},"section":{"conversations":"Conversations","gateway":"Gateway status","database":"Hermes database"},"issue":{"missingTable":"{section}: table {detail} not found","missingColumn":"{section}: column {detail} not found","collectorFailed":"{section}: could not be read ({detail})"},"platform":{"discord":"Discord","telegram":"Telegram","slack":"Slack","whatsapp":"WhatsApp","whatsapp_cloud":"WhatsApp","signal":"Signal","mattermost":"Mattermost","matrix":"Matrix","feishu":"Feishu","dingtalk":"DingTalk","wecom":"WeCom","weixin":"WeChat","wechat":"WeChat","wechat_android":"WeChat","qqbot":"QQ","bluebubbles":"iMessage","email":"Email","sms":"SMS"}},"ja":{"appTitle":"当番ボード","appSubtitle":"会話、バックグラウンド処理、定期ジョブのライブ状態","openIn":"リンクを開く先","discordApp":"Discord アプリ","browser":"ブラウザ","warnings":"一部のデータを利用できません","waiting":"あなたの返信待ち","waitingHint":"最後の返信が判断を求めている会話（古い順）","unanswered":"あなたが送信しましたが返信がありません","waitingEmpty":"返信待ちの項目はありません","unansweredAge":"{value} 待機","waitingAge":"{value} 待機","causedBy":"きっかけ: {value}","you":"あなた: {value}","openInDiscord":"Discord で開く","web":"Web","dismiss":"閉じる","seen":"確認済み","collapse":"折りたたむ","expandMore":{"other":"残り {count} 件を表示"},"running":"実行中","runningHint":"バー全体が 1 時間を表します","allIdle":"すべてアイドル","runningFor":"{value} 実行中","stalledFor":"{value} 動きなし","doing":"処理中","privateConversation":"{who}との会話","someone":"他のユーザー","privateContent":"内容は非表示です","delegations":"バックグラウンドジョブ","noDelegations":"実行中のバックグラウンドジョブはありません","completedNotDelivered":"完了しましたが、結果を元の会話に届けられませんでした","delegationHint":"新しい会話で処理済みかもしれません。開いて確認してから閉じてください","parallel":{"other":"{count} 件並列"},"completedAt":"完了 {value}","handled":"処理済み","cron":"定期ジョブ","cronPaused":{"other":"{count} 件一時停止"},"cronRunning":"実行中","cronScript":"スクリプト","cronUpcoming":"次: {time} · {name}","cronReason":{"lastError":"エラー: {detail}","deliveryError":"配信エラー: {detail}","state":"状態: {detail}","overdue":"期限超過"},"recentDone":"最近完了","recentDoneHint":"24 時間以内。最後の返信は質問ではなく報告です","promised":"後で報告すると言っています","none":"なし","goals":"長期目標","staleGoals":{"other":"さらに {count} 件の古い目標を非表示"},"noGoals":"対象期間に長期目標はありません","progress":{"other":"{turns}/{count} ターン"},"active":"進行中","paused":"一時停止","gateway":{"connected":"接続中","retrying":"再接続中","disconnected":"オフライン","error":"エラー"},"refreshed":"{value}前に更新","justNow":"たった今更新","loading":"読み込み中…","loadFailed":"読み込み失敗: {error}","stale":"{value}更新されていません","sectionUnavailable":"一部のセクションを利用できません","neverRan":"未実行","ago":"{value}前","in":"{value}後","soon":"まもなく実行","conversation":"会話","activity":{"output":"出力中","response":"モデルの応答待ち","waiting":"{who}の応答待ち · {duration}","call":"モデル呼び出し #{n}","callDone":"モデル呼び出し完了","starting":"開始直後","retry":"API 呼び出しを再試行 {a}/{b}","tool":"{tool}を実行中","toolDone":"{tool}完了","toolError":"{tool}失敗","terminal":"ターミナルコマンド実行中（{duration}）","script":"スクリプト実行中（{duration}）","compressed":"コンテキスト圧縮完了","subtask":"サブタスク · {value}"},"section":{"conversations":"会話","gateway":"ゲートウェイの状態","database":"Hermes データベース"},"issue":{"missingTable":"{section}: テーブル {detail} が見つかりません","missingColumn":"{section}: カラム {detail} が見つかりません","collectorFailed":"{section}: 読み取りに失敗しました（{detail}）"},"platform":{"discord":"Discord","telegram":"Telegram","slack":"Slack","whatsapp":"WhatsApp","whatsapp_cloud":"WhatsApp","signal":"Signal","mattermost":"Mattermost","matrix":"Matrix","feishu":"Feishu","dingtalk":"DingTalk","wecom":"WeCom","weixin":"WeChat","wechat":"WeChat","wechat_android":"WeChat","qqbot":"QQ","bluebubbles":"iMessage","email":"メール","sms":"SMS"}},"zh-hant":{"appTitle":"值班台","appSubtitle":"所有對話、背景任務和排程任務的即時狀態","openIn":"開啟連結：","discordApp":"Discord 應用程式","browser":"瀏覽器","warnings":"部分資料暫時無法使用","waiting":"等你回覆","waitingHint":"最後一句是在問你 / 等你決定，按等待時間排序","unanswered":"你發了訊息，但沒有收到回覆","waitingEmpty":"沒有正在等你的事","unansweredAge":"已 {value}","waitingAge":"等了 {value}","causedBy":"起因：{value}","you":"你：{value}","openInDiscord":"在 Discord 中開啟","web":"網頁","dismiss":"知道了","seen":"已看過","collapse":"收起","expandMore":{"other":"展開其餘 {count} 條"},"running":"執行中","runningHint":"進度條滿格 = 1 小時","allIdle":"全部閒置","runningFor":"已執行 {value}","stalledFor":"{value} 沒有動靜","doing":"處理中","privateConversation":"{who}的對話","someone":"其他人","privateContent":"內容不顯示","delegations":"背景子任務","noDelegations":"沒有正在執行的背景子任務","completedNotDelivered":"已完成，但結果未能送回原對話","delegationHint":"可能已在新對話中處理，開啟確認後收起","parallel":{"other":"{count} 路並行"},"completedAt":"完成於 {value}","handled":"已處理","cron":"排程任務","cronPaused":{"other":"{count} 個已暫停"},"cronRunning":"執行中","cronScript":"腳本","cronUpcoming":"下一個 {time} · {name}","cronReason":{"lastError":"錯誤：{detail}","deliveryError":"傳送失敗：{detail}","state":"狀態：{detail}","overdue":"逾時未執行"},"recentDone":"最近完成","recentDoneHint":"最近一天內，最後一句是回報而不是提問","promised":"說過會回來回報","none":"暫無","goals":"長期目標","staleGoals":{"other":"另有 {count} 個超出時間範圍的舊目標未顯示"},"noGoals":"近期沒有掛起的長期目標","progress":{"other":"{turns}/{count} 回合"},"active":"進行中","paused":"已暫停","gateway":{"connected":"線上","retrying":"重新連線中","disconnected":"離線","error":"異常"},"refreshed":"{value}前更新","justNow":"剛剛更新","loading":"讀取中…","loadFailed":"載入失敗：{error}","stale":"資料已 {value} 未更新","sectionUnavailable":"部分區域無法使用","neverRan":"尚未執行過","ago":"{value}前","in":"{value}後","soon":"即將執行","conversation":"對話","activity":{"output":"正在輸出","response":"等待模型回應","waiting":"等待 {who} 回應 · {duration}","call":"第 {n} 次模型呼叫","callDone":"呼叫完成","starting":"剛開始","retry":"介面錯誤重試 {a}/{b}","tool":"執行 {tool}","toolDone":"{tool} 完成","toolError":"{tool} 出錯","terminal":"終端命令已執行 {duration}","script":"腳本已執行 {duration}","compressed":"剛完成上下文壓縮","subtask":"子任務 · {value}"},"section":{"conversations":"對話","gateway":"閘道狀態","database":"Hermes 資料庫"},"issue":{"missingTable":"{section}：找不到資料表 {detail}","missingColumn":"{section}：找不到欄位 {detail}","collectorFailed":"{section}：讀取失敗（{detail}）"},"platform":{"discord":"Discord","telegram":"Telegram","slack":"Slack","whatsapp":"WhatsApp","whatsapp_cloud":"WhatsApp","signal":"Signal","mattermost":"Mattermost","matrix":"Matrix","feishu":"飛書","dingtalk":"釘釘","wecom":"企業微信","weixin":"微信","wechat":"微信","wechat_android":"微信","qqbot":"QQ","bluebubbles":"iMessage","email":"電子郵件","sms":"簡訊"}},"zh":{"appTitle":"值班台","appSubtitle":"所有对话、后台任务和定时任务的实时状态","openIn":"打开链接：","discordApp":"Discord 应用","browser":"浏览器","warnings":"部分数据暂不可用","waiting":"等你回复","waitingHint":"最后一句是我在问你 / 等你定，按等待时长排序","unanswered":"你发了消息，但没有看到回复","waitingEmpty":"没有在等你的事","unansweredAge":"已 {value}","waitingAge":"等了 {value}","causedBy":"起因：{value}","you":"你：{value}","openInDiscord":"在 Discord 中打开","web":"网页","dismiss":"知道了","seen":"已看过","collapse":"收起","expandMore":{"other":"展开其余 {count} 条"},"running":"正在跑","runningHint":"进度条满格 = 1 小时","allIdle":"全部空闲","runningFor":"已跑 {value}","stalledFor":"{value} 没动静","doing":"处理中","privateConversation":"{who}的对话","someone":"其他人","privateContent":"内容不显示","delegations":"后台子任务","noDelegations":"没有在跑的后台子任务","completedNotDelivered":"做完了，但结果没能自动送回原会话","delegationHint":"可能已在新会话里处理，点开核对后收起","parallel":{"other":"{count} 路并行"},"completedAt":"完成于 {value}","handled":"已处理","cron":"定时任务","cronPaused":{"other":"{count} 个已暂停"},"cronRunning":"运行中","cronScript":"脚本","cronUpcoming":"下一个 {time} · {name}","cronReason":{"lastError":"报错：{detail}","deliveryError":"投递失败：{detail}","state":"状态：{detail}","overdue":"到点未跑"},"recentDone":"最近完成","recentDoneHint":"24 小时内，最后一句是汇报而不是提问","promised":"说过会回来汇报","none":"暂无","goals":"长期目标","staleGoals":{"other":"另有 {count} 个超过时间范围的旧目标未显示"},"noGoals":"近段时间没有挂着的长期目标","progress":{"other":"{turns}/{count} 轮"},"active":"推进中","paused":"已暂停","gateway":{"connected":"在线","retrying":"重连中","disconnected":"离线","error":"异常"},"refreshed":"{value}前更新","justNow":"刚刚更新","loading":"正在读取…","loadFailed":"加载失败：{error}","stale":"数据已 {value} 未更新","sectionUnavailable":"部分区域不可用","neverRan":"还没跑过","ago":"{value}前","in":"{value}后","soon":"即将运行","conversation":"对话","activity":{"output":"正在输出","response":"等待模型响应","waiting":"等 {who} 响应 · {duration}","call":"第 {n} 次调用模型","callDone":"调用完成","starting":"刚开始","retry":"接口出错重试 {a}/{b}","tool":"执行 {tool}","toolDone":"{tool} 完成","toolError":"{tool} 出错","terminal":"终端命令已跑 {duration}","script":"脚本已跑 {duration}","compressed":"刚压缩完上下文","subtask":"子任务 · {value}"},"section":{"conversations":"对话","gateway":"网关状态","database":"Hermes 数据库"},"issue":{"missingTable":"{section}：找不到数据表 {detail}","missingColumn":"{section}：找不到字段 {detail}","collectorFailed":"{section}：读取失败（{detail}）"},"platform":{"discord":"Discord","telegram":"Telegram","slack":"Slack","whatsapp":"WhatsApp","whatsapp_cloud":"WhatsApp","signal":"Signal","mattermost":"Mattermost","matrix":"Matrix","feishu":"飞书","dingtalk":"钉钉","wecom":"企业微信","weixin":"微信","wechat":"微信","wechat_android":"微信","qqbot":"QQ","bluebubbles":"iMessage","email":"邮件","sms":"短信"}}};
  /* i18n:end */

  const SUPPORTED = Object.keys(MESSAGES);
  const RTL = { ar: true };
  const NUMBERS = { ar: "latn" };
  function localeName(value) {
    const raw = String(value || "").toLowerCase().replace(/_/g, "-");
    if (!raw) return "en";
    if (raw === "zh-hant" || /^zh-(tw|hk|mo)/.test(raw) || raw.startsWith("zh-hant")) return MESSAGES["zh-hant"] ? "zh-hant" : "zh";
    if (MESSAGES[raw]) return raw;
    const base = raw.split("-")[0];
    if (base === "pt" && MESSAGES.pt) return "pt";
    return MESSAGES[base] ? base : "en";
  }
  function intlLocale(locale) { return NUMBERS[locale] ? locale + "-u-nu-" + NUMBERS[locale] : locale; }
  function storedLocale() { try { return window.localStorage.getItem("hermes-locale") || ""; } catch (_) { return ""; } }
  function hostLocale() {
    const i18n = SDK.useI18n ? SDK.useI18n() : null;
    return i18n && typeof i18n.locale === "string" ? i18n.locale : "";
  }
  function useLocale() {
    // The host's i18n context re-renders us when the user switches language;
    // localStorage and the browser language are fallbacks for older hosts.
    const fromHost = hostLocale();
    const [fallback, setFallback] = useState(() => storedLocale() || navigator.language || "en");
    useEffect(() => {
      const onStorage = (event) => { if (!event.key || event.key === "hermes-locale") setFallback(storedLocale() || navigator.language || "en"); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }, []);
    return localeName(fromHost || fallback);
  }
  function lookup(locale, key) {
    const walk = (catalog) => { let value = catalog; for (const part of key.split(".")) value = value && value[part]; return value; };
    const value = walk(MESSAGES[locale]);
    return value != null ? value : walk(MESSAGES.en);
  }
  const pluralCache = {};
  function pluralCategory(locale, n) {
    const rules = pluralCache[locale] || (pluralCache[locale] = new Intl.PluralRules(locale));
    return rules.select(Number(n) || 0);
  }
  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (_, name) => (vars && vars[name] != null ? String(vars[name]) : "{" + name + "}"));
  }
  function tr(locale, key, vars) {
    let value = lookup(locale, key);
    if (value && typeof value === "object") {
      const n = vars && vars.count != null ? vars.count : 0;
      value = value[pluralCategory(locale, n)] || value.other || "";
    }
    if (typeof value !== "string") return key;
    if (vars) {
      const out = {};
      for (const name of Object.keys(vars)) out[name] = typeof vars[name] === "number" ? num(vars[name], locale) : vars[name];
      return fill(value, out);
    }
    return value;
  }
  const numCache = {};
  function num(n, locale) {
    const f = numCache[locale] || (numCache[locale] = new Intl.NumberFormat(intlLocale(locale)));
    return f.format(n);
  }
  const durCache = {};
  function durationParts(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    if (sec < 60) return { seconds: sec };
    const m = Math.floor(sec / 60);
    if (m < 60) return { minutes: m };
    const hr = Math.floor(m / 60);
    if (hr < 24) return m % 60 ? { hours: hr, minutes: m % 60 } : { hours: hr };
    const d = Math.floor(hr / 24);
    return hr % 24 ? { days: d, hours: hr % 24 } : { days: d };
  }
  function dur(sec, locale) {
    const parts = durationParts(sec);
    if (typeof Intl.DurationFormat === "function") {
      const f = durCache[locale] || (durCache[locale] = new Intl.DurationFormat(intlLocale(locale), { style: "short" }));
      return f.format(parts);
    }
    // Fallback for engines without Intl.DurationFormat: unit-formatted numbers joined by the locale's list format.
    const units = { days: "day", hours: "hour", minutes: "minute", seconds: "second" };
    const pieces = Object.keys(parts).map((k) => new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: units[k], unitDisplay: "short" }).format(parts[k]));
    return pieces.length > 1 && Intl.ListFormat ? new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(pieces) : pieces.join(" ");
  }
  function rel(sec, locale) { return tr(locale, "ago", { value: dur(sec, locale) }); }
  function clock(ts, locale) {
    if (!ts) return "—";
    const date = new Date(ts * 1000);
    const today = new Date();
    const opts = { hour: "2-digit", minute: "2-digit" };
    if (date.toDateString() !== today.toDateString()) { opts.month = "2-digit"; opts.day = "2-digit"; }
    return new Intl.DateTimeFormat(intlLocale(locale), opts).format(date);
  }
  function until(ts, now, locale) { return ts - now <= 0 ? tr(locale, "soon") : tr(locale, "in", { value: dur(ts - now, locale) }); }

  function activityLabel(locale, value) {
    if (!value) return "";
    let text = String(value), sub = null;
    const subtask = text.match(/^delegate_task:\s*subagent\s*(.*)$/i);
    if (subtask) { sub = true; text = subtask[1]; }
    let match = text.match(/\s*\(iteration (\d+)\/(\d+)\)/i);
    if (match) text = text.replace(match[0], " · " + match[1] + "/" + match[2]);
    const rules = [
      [/^receiving stream response/i, () => tr(locale, "activity.output")],
      [/^waiting for (stream|provider|non-streaming API) response.*/i, () => tr(locale, "activity.response")],
      [/^⏳\s*waiting on (.+?) — (\d+)s.*$/i, (m) => tr(locale, "activity.waiting", { who: m[1], duration: dur(+m[2], locale) })],
      [/^starting API call #(\d+)/i, (m) => tr(locale, "activity.call", { n: +m[1] })],
      [/^API call #(\d+) completed/i, () => tr(locale, "activity.callDone")],
      [/^starting new turn/i, () => tr(locale, "activity.starting")],
      [/^API error recovery \(attempt (\d+)\/(\d+)\)/i, (m) => tr(locale, "activity.retry", { a: +m[1], b: +m[2] })],
      [/^tool running: (.+)$/i, (m) => tr(locale, "activity.tool", { tool: m[1] })],
      [/^tool completed: (\S+) \(([\d.]+)s\)( \(error\))?/i, (m) => tr(locale, m[3] ? "activity.toolError" : "activity.toolDone", { tool: m[1] })],
      [/^terminal command running \((\d+)s elapsed\)/i, (m) => tr(locale, "activity.terminal", { duration: dur(+m[1], locale) })],
      [/^execute_code running \((\d+)s elapsed\)/i, (m) => tr(locale, "activity.script", { duration: dur(+m[1], locale) })],
      [/^context compression completed/i, () => tr(locale, "activity.compressed")],
    ];
    for (const [regex, replacement] of rules) { if ((match = text.match(regex))) { text = replacement(match); break; } }
    return sub ? tr(locale, "activity.subtask", { value: text }) : text;
  }
  function platformName(locale, name) { const v = lookup(locale, "platform." + name); return typeof v === "string" ? v : name; }
  function issueText(locale, issue) {
    const section = lookup(locale, issue.section) || lookup(locale, "section." + issue.section);
    return tr(locale, "issue." + issue.code, { section: typeof section === "string" ? section : issue.section, detail: issue.detail || "" });
  }
  function listJoin(locale, items) { if (items.length < 2) return items.join(""); return Intl.ListFormat ? new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(items) : items.join(", "); }
  const scrollTo = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

  function useNow(ms) {
    const [now, setNow] = useState(() => Date.now() / 1000);
    useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000), ms); return () => clearInterval(id); }, [ms]);
    return now;
  }
  function useSummary() {
    const [data, setData] = useState(null), [error, setError] = useState(null), [okAt, setOkAt] = useState(0);
    const inflight = useRef(false);
    const load = useCallback(() => {
      if (inflight.current) return Promise.resolve();
      inflight.current = true;
      return SDK.fetchJSON(API + "/summary").then((value) => { setData(value); setError(null); setOkAt(Date.now() / 1000); }).catch((e) => setError(String((e && e.message) || e))).finally(() => { inflight.current = false; });
    }, []);
    useEffect(() => { load(); const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS); const onVis = () => { if (!document.hidden) load(); }; document.addEventListener("visibilitychange", onVis); return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); }; }, [load]);
    return { data, error, okAt, reload: load };
  }

  function Chip(props) { return h("span", { className: "db-chip db-chip--" + (props.tone || "muted"), title: props.title }, props.children); }
  function Place(props) { const s = props.s || {}; return h("span", { className: "db-place" }, s.who ? h(Chip, { tone: s.mine === false ? "accent" : "muted" }, s.who) : null, h("span", { className: "db-place-text" }, s.where || s.source || "")); }
  function Title(props) { const s = props.s || {}, text = s.title || s.session_id || lookup(props.locale, "conversation"); return s.link ? h("a", { className: "db-title", href: s.link, target: "_blank", rel: "noreferrer", title: props.t("web") }, text, h("span", { className: "db-title-arrow" }, "↗")) : h("span", { className: "db-title" }, text); }
  function ConversationTitle(props) { return props.s && props.s.private ? h("span", { className: "db-title" }, props.t("privateConversation", { who: props.s.who || props.t("someone") })) : h(Title, props); }
  function LinkActions(props) {
    const s = props.s || {};
    if (!s.app_link || !s.link) return null;
    const open = (event) => { event.preventDefault(); event.stopPropagation(); if (props.openIn === "browser") window.open(s.link, "_blank", "noopener,noreferrer"); else window.location.href = s.app_link; };
    return h("span", { className: "db-link-actions" }, h("button", { className: "db-primary", type: "button", onClick: open, "aria-label": props.t("openInDiscord") }, props.t("openInDiscord")), h("a", { className: "db-web", href: s.link, target: "_blank", rel: "noreferrer", onClick: (event) => event.stopPropagation(), "aria-label": props.t("web") }, props.t("web")));
  }
  function Section(props) { return h("section", { className: "db-section", id: props.id }, h("header", { className: "db-section-head" }, h("h2", null, props.title), props.count != null ? h("span", { className: "db-count db-count--" + (props.tone || "muted") }, props.locale ? num(props.count, props.locale) : props.count) : null, props.hint ? h("span", { className: "db-section-hint" }, props.hint) : null), props.children); }
  function Empty(props) { return h("div", { className: "db-empty" }, props.children); }
  function More(props) { const [open, setOpen] = useState(false), items = props.items || [], limit = props.limit || 5; if (items.length <= limit) return h(React.Fragment, null, items.map(props.render)); return h(React.Fragment, null, items.slice(0, limit).map(props.render), h("div", { className: "db-more-wrap" + (open ? " is-open" : "") }, h("div", { className: "db-more-inner", "aria-hidden": !open }, items.slice(limit).map(props.render))), h("button", { className: "db-more", type: "button", onClick: () => setOpen(!open) }, open ? props.t("collapse") : props.t("expandMore", { count: items.length - limit }))); }
  function Leaving(props) { return h("div", { className: "db-item" + (props.leaving ? " is-leaving" : "") + (props.className ? " " + props.className : "") }, props.children); }
  function waitTone(sec) { if (sec > 24 * 3600) return "danger"; if (sec > 4 * 3600) return "warn"; return "muted"; }

  function Kpis(props) {
    const { d, now, locale, t } = props, c = d.conversations, dl = d.delegations, cr = d.cron, waitN = c.waiting.length + c.unanswered.length;
    const oldest = [...c.waiting, ...c.unanswered].reduce((m, x) => Math.min(m, x.since || now), now), stalled = c.running.filter((x) => x.stalled).length, longest = c.running.reduce((m, x) => Math.max(m, now - (x.started_at || now)), 0), next = cr.upcoming[0];
    const tiles = [
      { id: "db-waiting", label: t("waiting"), value: waitN, tone: waitN ? "accent" : "muted", sub: waitN ? t("waitingAge", { value: dur(now - oldest, locale) }) : t("waitingEmpty") },
      { id: "db-running", label: t("running"), value: c.running.length, tone: stalled ? "warn" : (c.running.length ? "live" : "muted"), sub: stalled ? t("stalledFor", { value: dur(now - (c.running[0].activity_at || now), locale) }) : (c.running.length ? t("runningFor", { value: dur(longest, locale) }) : t("allIdle")) },
      { id: "db-deleg", label: t("delegations"), value: dl.running.length, tone: dl.dropped.length ? "warn" : "muted", sub: dl.dropped.length ? t("completedNotDelivered") : (dl.running.length ? t("cronRunning") : t("noDelegations")) },
      { id: "db-cron", label: t("cron"), value: cr.problems.length ? cr.problems.length : cr.enabled, tone: cr.problems.length ? "danger" : "muted", sub: next ? t("cronUpcoming", { time: clock(next.next_at, locale), name: next.name }) : num(cr.enabled, locale) },
    ];
    return h("div", { className: "db-kpis" }, tiles.map((tile) => h("button", { key: tile.id, className: "db-kpi db-kpi--" + tile.tone, onClick: () => scrollTo(tile.id), type: "button" }, h("span", { className: "db-kpi-label" }, tile.label), h("span", { className: "db-kpi-value" }, num(tile.value, locale)), h("span", { className: "db-kpi-sub" }, tile.sub))));
  }

  function WaitingList(props) {
    const { items, unanswered, now, leaving, onDismiss, locale, openIn, t } = props;
    const actions = (s) => h(LinkActions, { s, openIn, t });
    return h(Section, { locale, id: "db-waiting", title: t("waiting"), count: items.length + unanswered.length, tone: items.length + unanswered.length ? "accent" : "muted", hint: t("waitingHint") },
      unanswered.length ? h("div", { className: "db-alert" }, h("div", { className: "db-alert-head" }, t("unanswered")), unanswered.map((s) => h(Leaving, { key: s.dismiss_key, leaving: leaving[s.dismiss_key], className: "db-card" }, h("div", { className: "db-row" }, h("div", { className: "db-row-main" }, h(Title, { s, locale, t }), h(Place, { s, t })), h(Chip, { tone: "danger" }, t("unansweredAge", { value: dur(now - s.since, locale) })), actions(s), h("button", { className: "db-ghost", type: "button", onClick: () => onDismiss(s.dismiss_key) }, t("dismiss"))), s.ask ? h("div", { className: "db-quote" }, t("you", { value: s.ask })) : null))) : null,
      items.length === 0 && unanswered.length === 0 ? h(Empty, null, t("waitingEmpty")) : h(More, { items, limit: 8, t, render: (s) => { const waited = now - s.since; return h(Leaving, { key: s.dismiss_key, leaving: leaving[s.dismiss_key], className: "db-card" }, h("div", { className: "db-row" }, h("div", { className: "db-row-main" }, h(Title, { s, locale, t }), h(Place, { s, t })), h(Chip, { tone: waitTone(waited) }, t("waitingAge", { value: dur(waited, locale) })), actions(s), h("button", { className: "db-ghost", type: "button", title: t("dismiss"), onClick: () => onDismiss(s.dismiss_key) }, t("seen"))), h("div", { className: "db-quote db-quote--me" }, s.reply_tail), s.ask ? h("div", { className: "db-sub" }, t("causedBy", { value: s.ask })) : null); } }));
  }

  function RunningList(props) {
    const { items, now, locale, openIn, t } = props;
    return h(Section, { locale, id: "db-running", title: t("running"), count: items.length, tone: items.length ? "live" : "muted", hint: t("runningHint") }, items.length === 0 ? h(Empty, null, t("allIdle")) : items.map((s) => { const elapsed = now - (s.started_at || now), pct = Math.min(100, (elapsed / 3600) * 100); return h("div", { key: s.session_id, className: "db-item db-card" + (s.stalled ? " is-stalled" : "") }, h("div", { className: "db-row" }, h("div", { className: "db-row-main" }, h(ConversationTitle, { s, locale, t }), h(Place, { s, t })), h(Chip, { tone: s.stalled ? "warn" : "live" }, s.stalled ? t("stalledFor", { value: dur(s.quiet_s, locale) }) : t("runningFor", { value: dur(elapsed, locale) })), h(LinkActions, { s, openIn, t })), h("div", { className: "db-bar" }, h("div", { className: "db-bar-fill" + (s.stalled ? " is-stalled" : ""), style: { width: pct + "%" } })), h("div", { className: "db-doing" }, h("span", { className: "db-pulse" }), s.private ? t("privateContent") : (activityLabel(locale, s.doing) || t("doing"))), s.ask ? h("div", { className: "db-sub" }, t("causedBy", { value: s.ask })) : null); }));
  }

  function DelegationList(props) {
    const { d, now, leaving, onDismiss, locale, t } = props;
    return h(Section, { locale, id: "db-deleg", title: t("delegations"), count: d.running.length, tone: d.running.length ? "live" : "muted" }, d.running.length === 0 ? h(Empty, null, t("noDelegations")) : d.running.map((x) => h("div", { key: x.id, className: "db-item db-line" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, x.private ? t("privateConversation", { who: x.who || t("someone") }) : (x.count > 1 ? t("parallel", { count: x.count }) + " · " : "") + x.goal), h("div", { className: "db-line-meta" }, x.session && x.session.session_id ? h(ConversationTitle, { s: x.session, locale, t }) : null, x.model ? h("span", { className: "db-mono" }, x.model) : null)), h(Chip, { tone: "live" }, dur(now - x.dispatched_at, locale)))), d.dropped.length ? h("div", { className: "db-subsection" }, h("div", { className: "db-subhead" }, t("completedNotDelivered") + " — " + t("delegationHint")), h(More, { items: d.dropped, limit: 3, t, render: (x) => h(Leaving, { key: x.id, leaving: leaving[x.id], className: "db-line" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, x.private ? t("privateConversation", { who: x.who || t("someone") }) : x.goal), h("div", { className: "db-line-meta" }, x.session && x.session.session_id ? h(ConversationTitle, { s: x.session, locale, t }) : null, h("span", null, t("completedAt", { value: clock(x.completed_at, locale) }))), x.summary ? h("div", { className: "db-sub" }, x.summary) : null), h("button", { className: "db-ghost", type: "button", onClick: () => onDismiss(x.id) }, t("handled"))) })) : null);
  }

  function cronReason(locale, reason, t) { return reason && reason.code ? t("cronReason." + reason.code, { detail: reason.detail || "" }) : ""; }
  function CronList(props) { const { c, now, locale, t } = props; return h(Section, { locale, id: "db-cron", title: t("cron"), count: c.enabled, hint: c.paused ? t("cronPaused", { count: c.paused }) : null }, c.problems.map((j) => h("div", { key: j.id, className: "db-item db-line db-line--danger" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, j.name), h("div", { className: "db-sub" }, listJoin(locale, (j.reasons || []).map((reason) => cronReason(locale, reason, t)).filter(Boolean)))), h(Chip, { tone: "danger" }, j.last_at ? clock(j.last_at, locale) : t("neverRan")))), c.running.map((j) => h("div", { key: "r" + j.id, className: "db-item db-line" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, j.name)), h(Chip, { tone: "live" }, t("cronRunning")))), h("div", { className: "db-timeline" }, c.upcoming.map((j) => h("div", { key: j.id, className: "db-tl-row" }, h("span", { className: "db-tl-time" }, clock(j.next_at, locale)), h("span", { className: "db-tl-dot" + (j.last_status === "error" ? " is-bad" : "") }), h("span", { className: "db-tl-name" }, j.name, j.script_only ? h("span", { className: "db-tl-tag" }, t("cronScript")) : null), h("span", { className: "db-tl-eta" }, until(j.next_at, now, locale)))))); }
  function DoneList(props) { const { items, now, locale, t } = props; return h(Section, { locale, id: "db-done", title: t("recentDone"), count: items.length, hint: t("recentDoneHint") }, items.length === 0 ? h(Empty, null, t("none")) : h(More, { items, limit: 6, t, render: (s) => h("div", { key: s.session_id, className: "db-item db-line" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-meta" }, h(Title, { s, locale, t }), h(Place, { s, t }), s.promised ? h(Chip, { tone: "warn" }, t("promised")) : null), h("div", { className: "db-sub" }, s.reply_tail)), h("span", { className: "db-time" }, rel(now - s.since, locale))) })); }
  function GoalList(props) { const { g, locale, t } = props; if (!g.items.length && !g.stale) return null; return h(Section, { locale, id: "db-goals", title: t("goals"), count: g.items.length, hint: g.stale ? t("staleGoals", { count: g.stale }) : null }, g.items.length === 0 ? h(Empty, null, t("noGoals")) : g.items.map((x, i) => h("div", { key: i, className: "db-item db-line" }, h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, x.goal), h("div", { className: "db-line-meta" }, h(Title, { s: x.session, locale, t }), h("span", null, (x.max_turns ? t("progress", { turns: x.turns || 0, count: x.max_turns }) : String(x.turns || 0)))), x.reason ? h("div", { className: "db-sub" }, x.reason) : null), h(Chip, { tone: x.status === "active" ? "live" : "warn" }, x.status === "active" ? t("active") : t("paused"))))); }
  function GatewayChips(props) { const g = props.g || {}, locale = props.locale, known = { connected: 1, retrying: 1, disconnected: 1, error: 1 }; return h("div", { className: "db-gw" }, (g.platforms || []).map((p) => h("span", { key: p.name, className: "db-gw-item", title: p.error || "" }, h("span", { className: "db-gw-dot db-gw-dot--" + (p.state === "connected" ? "ok" : "bad") }), h("bdi", null, platformName(locale, p.name)), " " + tr(locale, "gateway." + (known[p.state] ? p.state : "error"))))); }
  function WarningBanner(props) { const issues = props.issues && props.issues.length ? props.issues.map((x) => issueText(props.locale, x)) : (props.warnings || []); if (!issues.length) return null; return h("div", { className: "db-warning", role: "status" }, h("strong", null, props.t("warnings")), h("ul", null, issues.map((text, i) => h("li", { key: i }, h("bdi", null, text))))); }

  function DutyBoard() {
    const { data, error, okAt, reload } = useSummary(), now = useNow(1000), locale = useLocale(), t = (key, vars) => tr(locale, key, vars), [openIn, setOpenIn] = useState(() => { try { return window.localStorage.getItem("duty-board:open-in") === "browser" ? "browser" : "app"; } catch (_) { return "app"; } }), [leaving, setLeaving] = useState({});
    const setOpenMode = (value) => { const mode = value === "browser" ? "browser" : "app"; setOpenIn(mode); try { window.localStorage.setItem("duty-board:open-in", mode); } catch (_) {} };
    const onDismiss = useCallback((key) => { setLeaving((m) => Object.assign({}, m, { [key]: true })); setTimeout(() => { SDK.fetchJSON(API + "/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then(reload).catch(() => setLeaving((m) => { const next = Object.assign({}, m); delete next[key]; return next; })); }, 220); }, [reload]);
    const age = okAt ? now - okAt : null, stale = error || (age != null && age > 20);
    return h("div", { className: "duty-board", lang: locale, dir: RTL[locale] ? "rtl" : "ltr" }, h("header", { className: "db-head" }, h("div", null, h("h1", { className: "db-h1" }, t("appTitle")), h("div", { className: "db-head-sub" }, t("appSubtitle"))), h("div", { className: "db-head-right" }, h("label", { className: "db-open-mode" }, t("openIn"), h("select", { value: openIn, onChange: (event) => setOpenMode(event.target.value), "aria-label": t("openIn") }, h("option", { value: "app" }, t("discordApp")), h("option", { value: "browser" }, t("browser")))), data ? h(GatewayChips, { g: data.gateway, locale }) : null, h("span", { className: "db-live" + (stale ? " is-stale" : "") }, h("span", { className: "db-live-dot" }), stale ? (error ? t("loadFailed", { error }) : t("stale", { value: dur(age, locale) })) : (age != null ? (age < 2 ? t("justNow") : t("refreshed", { value: dur(age, locale) })) : t("loading"))))), !data ? h("div", { className: "db-loading" }, error ? t("loadFailed", { error }) : t("loading")) : h(React.Fragment, null, h(WarningBanner, { issues: data.issues, warnings: data.warnings, locale, t }), h(Kpis, { d: data, now, locale, t }), h("div", { className: "db-grid" }, h("div", { className: "db-col" }, h(WaitingList, { items: data.conversations.waiting, unanswered: data.conversations.unanswered, now, leaving, onDismiss, locale, openIn, t }), h(DoneList, { items: data.conversations.done, now, locale, t })), h("div", { className: "db-col" }, h(RunningList, { items: data.conversations.running, now, locale, openIn, t }), h(DelegationList, { d: data.delegations, now, leaving, onDismiss, locale, t }), h(CronList, { c: data.cron, now, locale, t }), h(GoalList, { g: data.goals, locale, t })))));
  }

  window.__HERMES_PLUGINS__.register("duty-board", DutyBoard);
})();
