/**
 * 值班台 (duty-board) — Hermes dashboard plugin.
 *
 * One live page for work scattered across many Discord threads: what is running,
 * what is waiting on the user, what finished, background delegations, cron health.
 * Data: GET /api/plugins/duty-board/summary (polled every 5s while visible).
 * Plain IIFE, no build step; React + components come from window.__HERMES_PLUGIN_SDK__.
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

  // ── formatting ──────────────────────────────────────────────────────────
  function dur(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    if (sec < 60) return sec + " 秒";
    const m = Math.floor(sec / 60);
    if (m < 60) return m + " 分钟";
    const hr = Math.floor(m / 60);
    if (hr < 24) return hr + " 小时" + (m % 60 ? " " + (m % 60) + " 分" : "");
    const d = Math.floor(hr / 24);
    return d + " 天" + (hr % 24 ? " " + (hr % 24) + " 小时" : "");
  }
  function clock(ts) {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const today = new Date();
    const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (d.toDateString() === today.toDateString()) return hm;
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + hm;
  }
  function until(ts, now) {
    const s = ts - now;
    if (s <= 0) return "即将运行";
    return dur(s) + "后";
  }
  // gateway activity strings → short Chinese
  function activityZh(s) {
    if (!s) return "";
    let t = String(s);
    let prefix = "";
    const sub = t.match(/^delegate_task:\s*subagent\s*(.*)$/i);
    if (sub) { prefix = "子任务 · "; t = sub[1]; }
    t = t.replace(/\s*\(iteration (\d+)\/(\d+)\)/i, " · 第 $1 步");
    const rules = [
      [/^receiving stream response/i, "正在输出"],
      [/^waiting for (stream|provider|non-streaming API) response.*/i, "等待模型响应"],
      [/^⏳\s*waiting on (.+?) — (\d+)s.*$/i, "等 $1 响应 · $2 秒"],
      [/^starting API call #(\d+)/i, "第 $1 次调用模型"],
      [/^API call #(\d+) completed/i, "第 $1 次调用完成"],
      [/^starting new turn/i, "刚开始"],
      [/^API error recovery \(attempt (\d+)\/(\d+)\)/i, "接口出错重试 $1/$2"],
      [/^tool running: (.+)$/i, "执行 $1"],
      [/^tool completed: (\S+) \(([\d.]+)s\)( \(error\))?/i, (m, a, b, e) => "$1 完成".replace("$1", a) + (e ? "（出错）" : "")],
      [/^terminal command running \((\d+)s elapsed\)/i, "终端命令已跑 $1 秒"],
      [/^execute_code running \((\d+)s elapsed\)/i, "脚本已跑 $1 秒"],
      [/^context compression completed/i, "刚压缩完上下文"],
    ];
    for (const [re, rep] of rules) {
      if (re.test(t)) { t = t.replace(re, rep); break; }
    }
    return prefix + t;
  }
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── hooks ───────────────────────────────────────────────────────────────
  function useNow(ms) {
    const [now, setNow] = useState(() => Date.now() / 1000);
    useEffect(() => {
      const id = setInterval(() => setNow(Date.now() / 1000), ms);
      return () => clearInterval(id);
    }, [ms]);
    return now;
  }

  function useSummary() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [okAt, setOkAt] = useState(0);
    const inflight = useRef(false);
    const load = useCallback(() => {
      if (inflight.current) return Promise.resolve();
      inflight.current = true;
      return SDK.fetchJSON(API + "/summary")
        .then((d) => { setData(d); setError(null); setOkAt(Date.now() / 1000); })
        .catch((e) => setError(String((e && e.message) || e)))
        .finally(() => { inflight.current = false; });
    }, []);
    useEffect(() => {
      load();
      const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
      const onVis = () => { if (!document.hidden) load(); };
      document.addEventListener("visibilitychange", onVis);
      return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    }, [load]);
    return { data, error, okAt, reload: load };
  }

  // ── small pieces ────────────────────────────────────────────────────────
  function Chip(props) {
    return h("span", { className: "db-chip db-chip--" + (props.tone || "muted"), title: props.title }, props.children);
  }

  function Place(props) {
    const s = props.s || {};
    const label = s.where || s.source || "";
    return h("span", { className: "db-place" },
      s.who ? h(Chip, { tone: s.mine === false ? "accent" : "muted" }, s.who) : null,
      h("span", { className: "db-place-text" }, label));
  }

  function Title(props) {
    const s = props.s || {};
    const text = s.title || s.session_id || "未命名会话";
    if (s.link) {
      return h("a", { className: "db-title", href: s.link, target: "_blank", rel: "noreferrer", title: "在 Discord 打开" }, text, h("span", { className: "db-title-arrow" }, "↗"));
    }
    return h("span", { className: "db-title" }, text);
  }

  function Section(props) {
    return h("section", { className: "db-section", id: props.id },
      h("header", { className: "db-section-head" },
        h("h2", null, props.title),
        props.count != null ? h("span", { className: "db-count db-count--" + (props.tone || "muted") }, props.count) : null,
        props.hint ? h("span", { className: "db-section-hint" }, props.hint) : null),
      props.children);
  }

  function Empty(props) {
    return h("div", { className: "db-empty" }, props.children);
  }

  function More(props) {
    const [open, setOpen] = useState(false);
    const items = props.items || [];
    const limit = props.limit || 5;
    if (items.length <= limit) return h(React.Fragment, null, items.map(props.render));
    return h(React.Fragment, null,
      items.slice(0, limit).map(props.render),
      h("div", { className: "db-more-wrap" + (open ? " is-open" : "") },
        h("div", { className: "db-more-inner", "aria-hidden": !open }, items.slice(limit).map(props.render))),
      h("button", { className: "db-more", type: "button", onClick: () => setOpen(!open) },
        open ? "收起" : "展开其余 " + (items.length - limit) + " 条"));
  }

  function Leaving(props) {
    return h("div", { className: "db-item" + (props.leaving ? " is-leaving" : "") + (props.className ? " " + props.className : "") }, props.children);
  }

  function waitTone(sec) {
    if (sec > 24 * 3600) return "danger";
    if (sec > 4 * 3600) return "warn";
    return "muted";
  }

  // ── sections ────────────────────────────────────────────────────────────
  function Kpis(props) {
    const { d, now } = props;
    const c = d.conversations, dl = d.delegations, cr = d.cron;
    const waitN = c.waiting.length + c.unanswered.length;
    const oldest = [...c.waiting, ...c.unanswered].reduce((m, x) => Math.min(m, x.since || now), now);
    const stalled = c.running.filter((x) => x.stalled).length;
    const longest = c.running.reduce((m, x) => Math.max(m, now - (x.started_at || now)), 0);
    const next = cr.upcoming[0];
    const tiles = [
      { id: "db-waiting", label: "等你回复", value: waitN, tone: waitN ? "accent" : "muted",
        sub: waitN ? "最久已等 " + dur(now - oldest) : "没有在等你的事" },
      { id: "db-running", label: "正在跑", value: c.running.length, tone: stalled ? "warn" : (c.running.length ? "live" : "muted"),
        sub: stalled ? stalled + " 个超过 10 分钟没动静" : (c.running.length ? "最长已跑 " + dur(longest) : "全部空闲") },
      { id: "db-deleg", label: "后台子任务", value: dl.running.length, tone: dl.dropped.length ? "warn" : "muted",
        sub: dl.dropped.length ? dl.dropped.length + " 个结果没送回对话" : (dl.running.length ? "运行中" : "没有在跑的") },
      { id: "db-cron", label: "定时任务", value: cr.problems.length ? cr.problems.length + " 异常" : cr.enabled, tone: cr.problems.length ? "danger" : "muted",
        sub: next ? "下一个 " + clock(next.next_at) + " · " + next.name : cr.enabled + " 个启用" },
    ];
    return h("div", { className: "db-kpis" }, tiles.map((t) =>
      h("button", { key: t.id, className: "db-kpi db-kpi--" + t.tone, onClick: () => scrollTo(t.id), type: "button" },
        h("span", { className: "db-kpi-label" }, t.label),
        h("span", { className: "db-kpi-value" }, t.value),
        h("span", { className: "db-kpi-sub" }, t.sub))));
  }

  function WaitingList(props) {
    const { items, unanswered, now, leaving, onDismiss } = props;
    return h(Section, { id: "db-waiting", title: "等你回复", count: items.length + unanswered.length, tone: items.length + unanswered.length ? "accent" : "muted", hint: "最后一句是我在问你 / 等你定，按等待时长排序" },
      unanswered.length ? h("div", { className: "db-alert" },
        h("div", { className: "db-alert-head" }, "你发了消息，但没有看到回复"),
        unanswered.map((s) => h(Leaving, { key: s.dismiss_key, leaving: leaving[s.dismiss_key] },
          h("div", { className: "db-row" },
            h("div", { className: "db-row-main" }, h(Title, { s }), h(Place, { s })),
            h(Chip, { tone: "danger" }, "已 " + dur(now - s.since)),
            h("button", { className: "db-ghost", type: "button", onClick: () => onDismiss(s.dismiss_key) }, "知道了")),
          s.ask ? h("div", { className: "db-quote" }, "你：" + s.ask) : null))) : null,
      items.length === 0 && unanswered.length === 0 ? h(Empty, null, "没有在等你的事") :
        h(More, { items: items, limit: 8, render: (s) => {
          const w = now - s.since;
          return h(Leaving, { key: s.dismiss_key, leaving: leaving[s.dismiss_key], className: "db-card" },
            h("div", { className: "db-row" },
              h("div", { className: "db-row-main" }, h(Title, { s }), h(Place, { s })),
              h(Chip, { tone: waitTone(w) }, "等了 " + dur(w)),
              h("button", { className: "db-ghost", type: "button", title: "从列表里收起，有新回复会重新出现", onClick: () => onDismiss(s.dismiss_key) }, "已看过")),
            h("div", { className: "db-quote db-quote--me" }, s.reply_tail),
            s.ask ? h("div", { className: "db-sub" }, "起因：" + s.ask) : null);
        } }));
  }

  function RunningList(props) {
    const { items, now } = props;
    return h(Section, { id: "db-running", title: "正在跑", count: items.length, tone: items.length ? "live" : "muted", hint: "进度条满格 = 1 小时" },
      items.length === 0 ? h(Empty, null, "全部空闲") :
        items.map((s) => {
          const el = now - (s.started_at || now);
          const pct = Math.min(100, (el / 3600) * 100);
          return h("div", { key: s.session_id, className: "db-item db-card" + (s.stalled ? " is-stalled" : "") },
            h("div", { className: "db-row" },
              h("div", { className: "db-row-main" }, h(Title, { s }), h(Place, { s })),
              h(Chip, { tone: s.stalled ? "warn" : "live" }, s.stalled ? dur(s.quiet_s) + " 没动静" : "已跑 " + dur(el))),
            h("div", { className: "db-bar" }, h("div", { className: "db-bar-fill" + (s.stalled ? " is-stalled" : ""), style: { width: pct + "%" } })),
            h("div", { className: "db-doing" }, h("span", { className: "db-pulse" }), s.private ? "处理中（内容不显示）" : (activityZh(s.doing) || "处理中")),
            s.ask ? h("div", { className: "db-sub" }, "在做：" + s.ask) : null);
        }));
  }

  function DelegationList(props) {
    const { d, now, leaving, onDismiss } = props;
    return h(Section, { id: "db-deleg", title: "后台子任务", count: d.running.length, tone: d.running.length ? "live" : "muted" },
      d.running.length === 0 ? h(Empty, null, "没有在跑的后台子任务") :
        d.running.map((x) => h("div", { key: x.id, className: "db-item db-line" },
          h("div", { className: "db-line-main" },
            h("div", { className: "db-line-title" }, x.count > 1 ? x.count + " 路并行 · " : "", x.goal),
            h("div", { className: "db-line-meta" }, h(Title, { s: x.session }), x.model ? h("span", { className: "db-mono" }, x.model) : null)),
          h(Chip, { tone: "live" }, dur(now - x.dispatched_at)))),
      d.dropped.length ? h("div", { className: "db-subsection" },
        h("div", { className: "db-subhead" }, "做完了，但结果没能自动送回原会话（会话中途被切换）——可能已在新会话里处理，点开核对后收起"),
        h(More, { items: d.dropped, limit: 3, render: (x) => h(Leaving, { key: x.id, leaving: leaving[x.id], className: "db-line" },
          h("div", { className: "db-line-main" },
            h("div", { className: "db-line-title" }, x.goal),
            h("div", { className: "db-line-meta" }, h(Title, { s: x.session }), h("span", null, "完成于 " + clock(x.completed_at))),
            x.summary ? h("div", { className: "db-sub" }, x.summary) : null),
          h("button", { className: "db-ghost", type: "button", onClick: () => onDismiss(x.id) }, "已处理")) })) : null);
  }

  function CronList(props) {
    const { c, now } = props;
    return h(Section, { id: "db-cron", title: "定时任务", count: c.enabled, hint: c.paused ? c.paused + " 个已暂停" : null },
      c.problems.map((j) => h("div", { key: j.id, className: "db-item db-line db-line--danger" },
        h("div", { className: "db-line-main" },
          h("div", { className: "db-line-title" }, j.name),
          h("div", { className: "db-sub" }, j.reasons.join("；"))),
        h(Chip, { tone: "danger" }, j.last_at ? "上次 " + clock(j.last_at) : "异常"))),
      c.running.map((j) => h("div", { key: "r" + j.id, className: "db-item db-line" },
        h("div", { className: "db-line-main" }, h("div", { className: "db-line-title" }, j.name)),
        h(Chip, { tone: "live" }, "运行中"))),
      h("div", { className: "db-timeline" }, c.upcoming.map((j) => h("div", { key: j.id, className: "db-tl-row" },
        h("span", { className: "db-tl-time" }, clock(j.next_at)),
        h("span", { className: "db-tl-dot" + (j.last_status === "error" ? " is-bad" : "") }),
        h("span", { className: "db-tl-name" }, j.name, j.script_only ? h("span", { className: "db-tl-tag" }, "脚本") : null),
        h("span", { className: "db-tl-eta" }, until(j.next_at, now))))));
  }

  function DoneList(props) {
    const { items, now } = props;
    return h(Section, { id: "db-done", title: "最近完成", count: items.length, hint: "24 小时内，最后一句是汇报而不是提问" },
      items.length === 0 ? h(Empty, null, "暂无") :
        h(More, { items: items, limit: 6, render: (s) => h("div", { key: s.session_id, className: "db-item db-line" },
          h("div", { className: "db-line-main" },
            h("div", { className: "db-line-meta" }, h(Title, { s }), h(Place, { s }),
              s.promised ? h(Chip, { tone: "accent", title: "最后一句说了之后还会回来汇报" }, "说了会回来") : null),
            h("div", { className: "db-sub" }, s.reply_tail)),
          h("span", { className: "db-time" }, dur(now - s.since) + "前")) }));
  }

  function GoalList(props) {
    const { g } = props;
    if (!g.items.length && !g.stale) return null;
    return h(Section, { id: "db-goals", title: "长期目标", count: g.items.length, hint: g.stale ? "另有 " + g.stale + " 个超过 14 天没动的旧目标未显示" : null },
      g.items.length === 0 ? h(Empty, null, "近 14 天没有挂着的长期目标") :
        g.items.map((x, i) => h("div", { key: i, className: "db-item db-line" },
          h("div", { className: "db-line-main" },
            h("div", { className: "db-line-title" }, x.goal),
            h("div", { className: "db-line-meta" }, h(Title, { s: x.session }), h("span", null, (x.turns || 0) + "/" + (x.max_turns || "?") + " 轮")),
            x.reason ? h("div", { className: "db-sub" }, x.reason) : null),
          h(Chip, { tone: x.status === "active" ? "live" : "warn" }, x.status === "active" ? "推进中" : "已暂停"))));
  }

  function GatewayChips(props) {
    const g = props.g || {};
    const zh = { connected: "在线", retrying: "重连中", disconnected: "离线", error: "异常" };
    const name = { discord: "Discord", feishu: "飞书", wechat_android: "微信" };
    return h("div", { className: "db-gw" }, (g.platforms || []).map((p) =>
      h("span", { key: p.name, className: "db-gw-item", title: p.error || "" },
        h("span", { className: "db-gw-dot db-gw-dot--" + (p.state === "connected" ? "ok" : "bad") }),
        (name[p.name] || p.name) + " " + (zh[p.state] || p.state || ""))));
  }

  // ── page ────────────────────────────────────────────────────────────────
  function DutyBoard() {
    const { data, error, okAt, reload } = useSummary();
    const now = useNow(1000);
    const [leaving, setLeaving] = useState({});

    const onDismiss = useCallback((key) => {
      setLeaving((m) => Object.assign({}, m, { [key]: true }));
      setTimeout(() => {
        SDK.fetchJSON(API + "/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: key }),
        }).then(reload).catch(() => setLeaving((m) => { const n = Object.assign({}, m); delete n[key]; return n; }));
      }, 220);
    }, [reload]);

    const age = okAt ? now - okAt : null;
    const stale = error || (age != null && age > 20);

    return h("div", { className: "duty-board" },
      h("header", { className: "db-head" },
        h("div", null,
          h("h1", { className: "db-h1" }, "值班台"),
          h("div", { className: "db-head-sub" }, "所有对话、后台任务和定时任务的实时状态")),
        h("div", { className: "db-head-right" },
          data ? h(GatewayChips, { g: data.gateway }) : null,
          h("span", { className: "db-live" + (stale ? " is-stale" : "") },
            h("span", { className: "db-live-dot" }),
            stale ? (error ? "刷新失败：" + error : "数据已 " + dur(age) + "未更新") : (age != null ? (age < 2 ? "刚刚更新" : Math.floor(age) + " 秒前更新") : "加载中")))),
      !data ? h("div", { className: "db-loading" }, error ? "加载失败：" + error : "正在读取…") :
        h(React.Fragment, null,
          h(Kpis, { d: data, now }),
          h("div", { className: "db-grid" },
            h("div", { className: "db-col" },
              h(WaitingList, { items: data.conversations.waiting, unanswered: data.conversations.unanswered, now, leaving, onDismiss }),
              h(DoneList, { items: data.conversations.done, now })),
            h("div", { className: "db-col" },
              h(RunningList, { items: data.conversations.running, now }),
              h(DelegationList, { d: data.delegations, now, leaving, onDismiss }),
              h(CronList, { c: data.cron, now }),
              h(GoalList, { g: data.goals })))));
  }

  window.__HERMES_PLUGINS__.register("duty-board", DutyBoard);
})();
