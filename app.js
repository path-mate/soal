(function () {
  "use strict";

  const SESSIONS = window.SESSIONS || [];
  const TIPS = window.TIPS || [];
  const KEY = "ashnaei:v1:";

  document.documentElement.lang = "fa";
  document.documentElement.dir = "rtl";

  // ---------- storage: everything stays in this browser only ----------
  function load(name, fallback) {
    try {
      const raw = localStorage.getItem(KEY + name);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function save(name, value) {
    try {
      localStorage.setItem(KEY + name, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable (private mode, blocked site data) */
    }
  }

  // ---------- helpers ----------
  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[d]);
  const pct = (done, total) => (total ? (done / total) * 100 : 0);
  const byId = (id) => document.getElementById(id);
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // search normalisation: Arabic/Persian letter variants, digits, diacritics, spaces and half-spaces
  function norm(s) {
    return String(s || "")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[ۀة]/g, "ه")
      .replace(/[أإآ]/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[\s\u200C\u200D\u200E\u200F.,،؛:!?؟«»"'()\-–—…]/g, "")
      .toLowerCase();
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid);
    }
    return el;
  }

  const ICONS = {
    note:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l3 3"/></svg>',
    loop:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/></svg>',
  };
  function icon(name) {
    const span = h("span", { class: "ic", "aria-hidden": "true" });
    span.innerHTML = ICONS[name];
    return span;
  }

  // ---------- index ----------
  const index = new Map();
  const allQs = [];
  SESSIONS.forEach((s, si) => {
    s.num = si + 1;
    s.all = [];
    s.groups.forEach((g) => {
      g.qs.forEach((q) => {
        q.n = Number(String(q.id).split("-")[1]) || 0;
        q.hay = norm(q.q + " " + (q.f || "") + " " + g.title);
        index.set(q.id, { q, s, g });
        s.all.push(q);
        allQs.push(q);
      });
    });
  });

  // ---------- state ----------
  let checked = load("checked", {});
  let notes = load("notes", {});
  if (!checked || typeof checked !== "object") checked = {};
  if (!notes || typeof notes !== "object") notes = {};

  const state = {
    session: String(load("session", SESSIONS[0] ? SESSIONS[0].id : "")),
    onlyOpen: !!load("onlyOpen", false),
    query: "",
  };
  if (!SESSIONS.some((s) => s.id === state.session) && SESSIONS[0]) state.session = SESSIONS[0].id;

  const openNotes = new Set();
  const doneIn = (list) => list.reduce((n, q) => n + (checked[q.id] ? 1 : 0), 0);
  const current = () => SESSIONS.find((s) => s.id === state.session);
  const countText = (list) => fa(doneIn(list)) + " از " + fa(list.length);

  const navEl = byId("sessions");
  const mainEl = byId("main");
  const summaryEl = byId("summary");
  const searchEl = byId("search");
  const clearEl = byId("search-clear");

  // ---------- session strip ----------
  function renderNav() {
    navEl.textContent = "";
    for (const s of SESSIONS) {
      const done = doneIn(s.all);
      const fill = h("i");
      fill.style.width = pct(done, s.all.length) + "%";
      const active = !state.query && s.id === state.session;
      navEl.append(
        h(
          "button",
          {
            type: "button",
            class: "tab",
            id: "tab-" + s.id,
            "aria-current": active ? "true" : null,
            "aria-label": "جلسه " + fa(s.num) + "، " + s.title + "، " + countText(s.all) + " پرسیده شده",
            onclick: () => openSession(s.id, true),
          },
          h("span", { class: "t-num", text: fa(s.num) }),
          h("span", { class: "t-name", text: s.title }),
          h("span", { class: "t-meta", text: countText(s.all) }),
          h("span", { class: "t-bar", "aria-hidden": "true" }, fill)
        )
      );
    }
    summaryEl.textContent =
      fa(SESSIONS.length) + " جلسه · " + fa(allQs.length) + " سوال · " + fa(doneIn(allQs)) + " پرسیده شده";
  }

  // ---------- one question row ----------
  function qRow(q, showGroup) {
    const id = q.id;
    const info = index.get(id);
    const li = h("li", { class: "q" + (checked[id] ? " is-done" : ""), id: "q-" + id });

    const cb = h("input", { type: "checkbox", id: "cb-" + id, "aria-describedby": "qt-" + id });
    cb.checked = !!checked[id];
    cb.addEventListener("change", () => {
      if (cb.checked) checked[id] = 1;
      else delete checked[id];
      save("checked", checked);
      li.classList.toggle("is-done", cb.checked);
      refreshCounts();
    });
    const check = h("label", { class: "check", title: "پرسیده شد" }, cb, h("span", { class: "sr-only", text: "پرسیده شد" }));

    const body = h(
      "div",
      { class: "q-body" },
      showGroup ? h("p", { class: "q-place", text: info.g.title }) : null,
      h("p", { class: "q-text", id: "qt-" + id }, h("span", { class: "q-num", text: fa(q.n) }), q.q),
      q.f ? h("p", { class: "q-follow", text: q.f }) : null,
      q.see ? seeLink(q.see) : null
    );

    const hasNote = !!(notes[id] && notes[id].trim());
    const open = hasNote || openNotes.has(id);
    const wrap = h("div", { class: "note", id: "note-wrap-" + id });
    wrap.hidden = !open;
    const btn = h(
      "button",
      {
        type: "button",
        class: "note-btn" + (hasNote ? " has-note" : ""),
        "aria-expanded": String(open),
        "aria-controls": "note-wrap-" + id,
        "aria-label": "یادداشت برای سوال " + fa(q.n),
        title: "یادداشت",
      },
      icon("note")
    );

    let ta = null;
    function commit() {
      const v = ta.value;
      if (v.trim()) notes[id] = v;
      else delete notes[id];
      save("notes", notes);
      btn.classList.toggle("has-note", !!v.trim());
    }
    function ensureTextarea() {
      if (ta) return ta;
      ta = h("textarea", {
        id: "note-" + id,
        rows: "2",
        placeholder: "جوابش یا برداشت خودت رو بنویس. فقط روی همین دستگاه ذخیره می‌شه.",
        "aria-label": "یادداشت برای سوال " + fa(q.n),
      });
      ta.value = notes[id] || "";
      let timer = 0;
      ta.addEventListener("input", () => {
        autosize(ta);
        clearTimeout(timer);
        timer = setTimeout(commit, 300);
      });
      ta.addEventListener("change", () => {
        clearTimeout(timer);
        commit();
      });
      wrap.append(ta);
      return ta;
    }
    if (open) {
      ensureTextarea();
      requestAnimationFrame(() => autosize(ta));
    }
    btn.addEventListener("click", () => {
      const willOpen = wrap.hidden;
      wrap.hidden = !willOpen;
      btn.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        openNotes.add(id);
        ensureTextarea();
        autosize(ta);
        ta.focus();
      } else {
        openNotes.delete(id);
      }
    });

    li.append(check, body, btn, wrap);
    return li;
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }

  function seeLink(targetId) {
    const t = index.get(targetId);
    if (!t) return null;
    return h(
      "button",
      {
        type: "button",
        class: "see",
        title: "این سوال، موضوع سوال " + fa(t.q.n) + " از جلسه " + fa(t.s.num) + " رو از زاویه دیگه می‌پرسه: «" + t.q.q + "»",
        onclick: () => jumpTo(targetId),
      },
      icon("loop"),
      "مرور سوال " + fa(t.q.n) + " از جلسه " + fa(t.s.num)
    );
  }

  // ---------- session view ----------
  function renderMain() {
    mainEl.textContent = "";
    if (state.query) {
      renderResults();
      return;
    }
    const s = current();
    if (!s) return;

    mainEl.append(
      h(
        "header",
        { class: "s-head" },
        h("p", { class: "eyebrow", text: "جلسه " + fa(s.num) + " از " + fa(SESSIONS.length) }),
        h("h2", { class: "s-title", text: s.title }),
        h("p", { class: "s-goal", text: s.goal }),
        progressRow(s)
      )
    );

    s.groups.forEach((g, gi) => {
      const gid = "g-" + s.id + "-" + gi;
      const shown = state.onlyOpen ? g.qs.filter((q) => !checked[q.id]) : g.qs;
      mainEl.append(
        h(
          "section",
          { class: "group", "aria-labelledby": gid },
          h(
            "div",
            { class: "g-head" },
            h("h3", { id: gid, text: g.title }),
            h("span", { class: "g-count", "data-group": gid, text: countText(g.qs) })
          ),
          g.tip ? h("p", { class: "tip" }, h("b", { text: "به چی دقت کنم: " }), g.tip) : null,
          shown.length
            ? h("ol", { class: "qs" }, shown.map((q) => qRow(q, false)))
            : h("p", { class: "g-empty", text: "همه سوال‌های این بخش پرسیده شده." })
        )
      );
    });

    mainEl.append(pager(s));
  }

  function progressRow(s) {
    const done = doneIn(s.all);
    const fill = h("i", { id: "p-fill" });
    fill.style.width = pct(done, s.all.length) + "%";
    const toggle = h("input", { type: "checkbox", id: "only-open", role: "switch" });
    toggle.checked = state.onlyOpen;
    toggle.addEventListener("change", () => {
      state.onlyOpen = toggle.checked;
      save("onlyOpen", state.onlyOpen);
      renderMain();
      const again = byId("only-open");
      if (again) again.focus();
    });
    return h(
      "div",
      { class: "progress" },
      h("span", { class: "p-text", id: "p-text", text: progressText(done, s.all.length) }),
      h("span", { class: "p-bar", "aria-hidden": "true" }, fill),
      h("label", { class: "switch" }, toggle, h("span", { text: "فقط سوال‌های پرسیده‌نشده" }))
    );
  }

  const progressText = (done, total) => fa(done) + " از " + fa(total) + " سوال پرسیده شده";

  function pager(s) {
    const i = SESSIONS.indexOf(s);
    const prev = SESSIONS[i - 1];
    const next = SESSIONS[i + 1];
    return h(
      "nav",
      { class: "pager", "aria-label": "جلسه قبلی و بعدی" },
      prev
        ? h(
            "button",
            { type: "button", class: "prev", onclick: () => openSession(prev.id, true) },
            h("small", { text: "→ جلسه قبل" }),
            h("b", { text: prev.title })
          )
        : null,
      next
        ? h(
            "button",
            { type: "button", class: "next", onclick: () => openSession(next.id, true) },
            h("small", { text: "جلسه بعد ←" }),
            h("b", { text: next.title })
          )
        : null
    );
  }

  // keep counters in sync without re-rendering the rows (so an open note keeps focus)
  function refreshCounts() {
    renderNav();
    if (state.query) return;
    const s = current();
    if (!s) return;
    const done = doneIn(s.all);
    const text = byId("p-text");
    const fill = byId("p-fill");
    if (text) text.textContent = progressText(done, s.all.length);
    if (fill) fill.style.width = pct(done, s.all.length) + "%";
    s.groups.forEach((g, gi) => {
      const el = mainEl.querySelector('[data-group="g-' + s.id + "-" + gi + '"]');
      if (el) el.textContent = countText(g.qs);
    });
  }

  // ---------- search results ----------
  function renderResults() {
    const needle = norm(state.query);
    const found = [];
    let count = 0;
    for (const s of SESSIONS) {
      const hits = s.all.filter((q) => q.hay.includes(needle));
      if (hits.length) {
        found.push([s, hits]);
        count += hits.length;
      }
    }
    mainEl.append(
      h(
        "header",
        { class: "s-head" },
        h("p", { class: "eyebrow", text: "جستجو" }),
        h("h2", { class: "s-title", text: count ? fa(count) + " سوال پیدا شد" : "سوالی پیدا نشد" }),
        h("p", {
          class: "s-goal",
          text: count
            ? "برای «" + state.query + "» در همه جلسه‌ها."
            : "برای «" + state.query + "» چیزی پیدا نشد. یه کلمه کوتاه‌تر امتحان کن، مثلاً «خانواده» یا «پول».",
        })
      )
    );
    for (const [s, hits] of found) {
      mainEl.append(
        h(
          "section",
          { class: "group" },
          h(
            "div",
            { class: "g-head" },
            h("h3", { text: "جلسه " + fa(s.num) + " · " + s.title }),
            h("span", { class: "g-count", text: fa(hits.length) + " سوال" })
          ),
          h("ol", { class: "qs" }, hits.map((q) => qRow(q, true)))
        )
      );
    }
  }

  // ---------- navigation ----------
  function clearSearch() {
    if (!state.query && !searchEl.value) return;
    state.query = "";
    searchEl.value = "";
    syncClear();
  }

  function scrollToMainTop() {
    const nav = document.querySelector(".nav");
    const offset = nav ? nav.offsetHeight : 0;
    const top = mainEl.getBoundingClientRect().top + window.scrollY - offset - 4;
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  function openSession(id, toTop) {
    clearSearch();
    state.session = id;
    save("session", id);
    renderNav();
    renderMain();
    const tab = byId("tab-" + id);
    if (tab && tab.scrollIntoView) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (toTop) scrollToMainTop();
  }

  function jumpTo(id) {
    const t = index.get(id);
    if (!t) return;
    if (state.onlyOpen && checked[id]) {
      state.onlyOpen = false;
      save("onlyOpen", false);
    }
    openSession(t.s.id, false);
    const row = byId("q-" + id);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
    const cb = byId("cb-" + id);
    if (cb) cb.focus({ preventScroll: true });
  }

  // ---------- search ----------
  function syncClear() {
    clearEl.hidden = !searchEl.value;
  }

  let searchTimer = 0;
  searchEl.placeholder = "جستجو بین " + fa(allQs.length) + " سوال… مثلاً خانواده، پول یا بچه";
  searchEl.addEventListener("input", () => {
    syncClear();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const v = searchEl.value.trim();
      state.query = norm(v) ? v : "";
      renderNav();
      renderMain();
    }, 150);
  });
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearSearch();
      renderNav();
      renderMain();
    }
  });
  clearEl.addEventListener("click", () => {
    clearSearch();
    renderNav();
    renderMain();
    searchEl.focus();
  });
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      searchEl.focus();
    }
  });

  // ---------- tips ----------
  const tipsEl = byId("tips");
  const tipsList = byId("tips-list");
  TIPS.forEach((t) => tipsList.append(h("li", { text: t })));
  byId("tips-count").textContent = fa(TIPS.length) + " نکته";
  tipsEl.open = !!load("tipsOpen", true);
  tipsEl.addEventListener("toggle", () => save("tipsOpen", tipsEl.open));

  // ---------- theme ----------
  const root = document.documentElement;
  const themeBtn = byId("theme-toggle");
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const storedTheme = load("theme", null);
  if (storedTheme === "dark" || storedTheme === "light") root.setAttribute("data-theme", storedTheme);

  function effectiveTheme() {
    const t = root.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }
  function syncThemeButton() {
    const label = effectiveTheme() === "dark" ? "رفتن به تم روشن" : "رفتن به تم تاریک";
    themeBtn.setAttribute("aria-label", label);
    themeBtn.title = label;
  }
  themeBtn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    save("theme", next);
    syncThemeButton();
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", syncThemeButton);

  // ---------- reset ----------
  const resetBtn = byId("reset");
  const confirmBox = byId("reset-confirm");
  const statusEl = byId("reset-status");
  resetBtn.addEventListener("click", () => {
    statusEl.textContent = "";
    resetBtn.hidden = true;
    confirmBox.hidden = false;
    byId("reset-no").focus();
  });
  byId("reset-no").addEventListener("click", () => {
    confirmBox.hidden = true;
    resetBtn.hidden = false;
    resetBtn.focus();
  });
  byId("reset-yes").addEventListener("click", () => {
    checked = {};
    notes = {};
    openNotes.clear();
    save("checked", checked);
    save("notes", notes);
    confirmBox.hidden = true;
    resetBtn.hidden = false;
    renderNav();
    renderMain();
    statusEl.textContent = "همه تیک‌ها و یادداشت‌ها پاک شد.";
    resetBtn.focus();
  });

  // ---------- start ----------
  syncThemeButton();
  syncClear();
  renderNav();
  renderMain();

  const hash = decodeURIComponent(location.hash || "");
  if (hash.indexOf("#q-") === 0 && index.has(hash.slice(3))) jumpTo(hash.slice(3));
})();
