/* ============================================================================
 *  ui.js —— 改版增强层
 * ----------------------------------------------------------------------------
 *  设计原则（与改版提示词包的硬性约束一致）：
 *    · 不修改任何 id / name / data-* 属性 —— app.js 靠 getElementById 绑定
 *    · 不参与任何计算 —— 只读取 app.js 渲染出来的 DOM 文本
 *    · 不改动 engine.js / db*.js、不改动 app.js
 *    · 全部效果都能在 @media print 里被压平（见 style.css 打印段）
 *
 *  它只做五件事：
 *    1. 给左列 10 张卡注入折叠开关 + 已选摘要；默认全部收起，由用户自己展开
 *    2. 用 IntersectionObserver 高亮当前正在看的卡片
 *    3. 把配置列里冗长的 .note 说明收成两行 + ⓘ 展开（结果列的说明不动，
 *       因为那是"答案的一部分"，折叠它反而有害）
 *    4. 移动端底部常驻条，同步显示推荐瓦数
 *    5. 数据声明弹窗（打开页面时自动出现，顶栏按钮可重开）
 *
 *  加载位置：app.js 之后（需要读取 app.js 渲染后的 DOM）。
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ 配置 --- */
  var LS_KEY = 'psu-calc-2026-v1-ui';

  /* 默认展开的卡片序号。空数组 = 打开页面时所有选项都收起来，
     由用户自己点开需要填的那几步。
     注意这里给的是「默认值」：用户手动展开过的那张卡会记在 localStorage 里，
     下次打开保持用户自己的状态，不会又被强行收起。 */
  var ALWAYS_OPEN = [];

  // 折叠态摘要：按卡片序号读对应控件的当前值
  var SUMMARY_RULES = {
    1: function () {
      var on = document.querySelector('.scenario.on b');
      return on ? on.textContent.trim() : '未选择';
    },
    2: function () {
      var head = optionHead($('cpuSelect'));
      if (head) return head;
      // 只选了品牌/世代还没选型号时，把当前筛选条件显示出来，
      // 否则收起状态下用户看不出「我已经筛到 Intel 12 代」了
      var b = $('cpuBrand') ? $('cpuBrand').querySelector('button.on') : null;
      var bTxt = b ? b.textContent.trim() : '';
      var g = $('cpuGen');
      var gTxt = (g && g.value) ? (g.options[g.selectedIndex] || {}).textContent || '' : '';
      gTxt = gTxt.split(' · ')[0].trim();
      var parts = [bTxt, gTxt].filter(Boolean);
      return parts.length ? parts.join(' / ') + ' · 未选型号' : '未选择';
    },
    3: function () {
      var m = $('gpuModel');
      if (!m) return '';
      if (m.value === '__igpu__') return '集成显卡';
      var aib = $('gpuAib');
      if (aib && aib.value) return optionHead(aib) || '未指定板型';
      var head = optionHead(m);
      if (head) return head;
      var b = $('gpuBrand') ? $('gpuBrand').querySelector('button.on') : null;
      return b ? b.textContent.trim() + ' · 未选型号' : '未选择';
    },
    4: function () { return optionHead($('moboSelect')) || '未选择'; },
    5: function () {
      var head = optionHead($('ramSelect'));
      if (!head) return '未选择';
      var kits = $('ramKits') ? (parseInt($('ramKits').value, 10) || 1) : 1;
      return head + ' ×' + kits + ' 套';
    },
    6: function () {
      var rows = document.querySelectorAll('#storageList .storage-row');
      if (!rows.length) return '未添加';
      var n = 0;
      Array.prototype.forEach.call(rows, function (r) {
        var q = r.querySelector('.s-qty');
        n += parseInt(q && q.value, 10) || 1;
      });
      return n + ' 块硬盘 / SSD';
    },
    7: function () {
      var c = optionHead($('coolerSelect'));
      var fans = $('fanQty') ? (parseInt($('fanQty').value, 10) || 0) : 0;
      return (c ? c + ' · ' : '') + fans + ' 只机箱风扇';
    },
    8: function () { return optionHead($('caseSelect')) || '未选择'; },
    9: function () {
      var n = document.querySelectorAll('#extrasGrid input[type="checkbox"]:checked').length;
      var c = document.querySelectorAll('#customItems .storage-row').length;
      var ar = $('argbChannels') ? (parseInt($('argbChannels').value, 10) || 0) : 0;
      var parts = [];
      if (n) parts.push('扩展 ' + n + ' 项');
      if (c) parts.push('自定义 ' + c + ' 项');
      if (ar) parts.push('ARGB ' + ar + ' 路');
      return parts.length ? parts.join(' · ') : '未添加';
    },
    10: function () {
      var v = optionHead($('psuSelect'));
      return v ? v : '暂不校验';
    }
  };

  /* 从 select 的当前选中项取出「·」之前的主名称 */
  function optionHead(sel) {
    if (!sel || !sel.value) return '';
    var op = sel.options[sel.selectedIndex];
    if (!op) return '';
    return (op.textContent || '').split('·')[0].trim();
  }

  /* -------------------------------------------------------- 折叠控制 --- */
  var cards = [];              // { el, no, summaryEl, toggleEl }
  var noteDone = new WeakSet(); // 已处理过的说明块，避免重复扫描

  function readState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* 每个配置分区的图标（参考 MSI 电源计算器的「图标 + 分组名」左栏）。
     内联 SVG、单色描边，颜色跟随 currentColor —— 与全站图标同一套做法。 */
  var SEC_ICON = {
    1: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    2: '<rect x="7" y="7" width="10" height="10"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
    3: '<rect x="3" y="7" width="18" height="10" rx="1"/><circle cx="9" cy="12" r="2.4"/><path d="M16 10v4"/>',
    4: '<rect x="4" y="4" width="16" height="16" rx="1"/><rect x="8" y="8" width="5" height="5"/><path d="M16 8h.01M16 12h.01M16 16h.01M8 16h5"/>',
    5: '<path d="M3 8h18v8H3z"/><path d="M7 8v8M11 8v8M15 8v8"/>',
    6: '<rect x="3" y="5" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="5" rx="1"/><path d="M7 8.5h.01M7 16.5h.01"/>',
    7: '<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>',
    8: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h6M9 11h6M12 15v3"/>',
    9: '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="4"/>',
    10: '<path d="M4 8h16v10H4z"/><path d="M8 8V5h8v3M8 13h8"/>'
  };

  function injectIcons() {
    var col = document.querySelector('.col-config');
    if (!col) return;
    var no = 0;
    Array.prototype.forEach.call(col.querySelectorAll('section.card'), function (sec) {
      if (sec.id === 'guideCard') return;
      no++;
      var h2 = sec.querySelector('h2');
      var path = SEC_ICON[no];
      if (!h2 || !path || h2.querySelector('.sec-ico')) return;
      var ico = document.createElement('span');
      ico.className = 'sec-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
      h2.insertBefore(ico, h2.firstChild);
    });
  }

  function setupCards() {
    var col = document.querySelector('.col-config');
    if (!col) return;

    var sections = col.querySelectorAll('section.card');
    var state = readState();
    var no = 0;   // 显式计数，不依赖 DOM 索引（guideCard 不参与编号）

    Array.prototype.forEach.call(sections, function (sec) {
      if (sec.id === 'guideCard') return;   // 引导卡有自己的关闭按钮
      no++;

      var h2 = sec.querySelector('h2');
      if (!h2) return;

      /* 把卡片内容包一层，好让「展开 / 收起」能有平滑的高度过渡。
         display:none 是没法过渡的；用 grid-template-rows 从 0fr 到 1fr
         可以让高度自然动画，且不需要事先知道内容有多高。
         这一层只是包装，不动任何 id —— app.js 全程按 id 取元素，不受影响。 */
      var body = sec.querySelector('.card-body');
      if (body && !body.firstElementChild?.classList?.contains('card-body-in')) {
        var inner = document.createElement('div');
        inner.className = 'card-body-in';
        while (body.firstChild) inner.appendChild(body.firstChild);
        body.appendChild(inner);
      }

      /* 摘要与折叠键挂在**分区**上而不是 h2 上：
         参考 MSI 的布局后，h2 变成左侧窄栏（图标 + 分组名），
         右侧那一大片留给字段。摘要与折叠键属于「右侧那一列」，
         放进窄栏会把分组名挤爆。 */
      var sum = document.createElement('span');
      sum.className = 'card-summary';
      sec.appendChild(sum);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-toggle';
      btn.setAttribute('aria-label', '折叠 / 展开');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCard(sec, btn);
      });
      sec.appendChild(btn);

      // 点标题栏任意位置也能折叠，更符合直觉
      h2.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a')) return;
        toggleCard(sec, btn);
      });
      // 收起状态下整行都可点，不用非得瞄准标题
      sec.addEventListener('click', function (e) {
        if (!sec.classList.contains('is-collapsed')) return;
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-body')) return;
        toggleCard(sec, btn);
      });

      var rec = { el: sec, no: no, summaryEl: sum, toggleEl: btn };
      cards.push(rec);

      // 初始状态：优先用记忆值，否则按 ALWAYS_OPEN 决定（现在是全部收起）
      var remembered = state['c' + no];
      var open = (remembered === undefined) ? (ALWAYS_OPEN.indexOf(no) !== -1) : !!remembered;
      setCollapsed(sec, btn, !open);
    });

    refreshSummaries();
  }

  function setCollapsed(sec, btn, collapsed) {
    sec.classList.toggle('is-collapsed', collapsed);
    if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function toggleCard(sec, btn) {
    var collapsed = !sec.classList.contains('is-collapsed');
    setCollapsed(sec, btn, collapsed);

    /* 展开后如果标题已经被顶出视口上方，把它拉回来 ——
       否则用户点了最后一张卡，内容在屏幕外长出来，看起来像「没反应」。 */
    if (!collapsed) {
      var r = sec.getBoundingClientRect();
      if (r.top < 64) {
        try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { sec.scrollIntoView(); }
      }
    }

    for (var i = 0; i < cards.length; i++) {
      if (cards[i].el === sec) {
        var s = readState();
        s['c' + cards[i].no] = collapsed ? 0 : 1;
        writeState(s);
        break;
      }
    }
  }

  /* -------------------------------------------------------- 摘要刷新 --- */
  function refreshSummaries() {
    cards.forEach(function (c) {
      var rule = SUMMARY_RULES[c.no];
      if (!rule) return;
      var txt = '';
      try { txt = rule() || ''; } catch (e) { txt = ''; }
      // 只在内容真的变了时才写 DOM，避免触发 MutationObserver 死循环
      if (c.summaryEl.textContent !== txt) c.summaryEl.textContent = txt;
    });
  }

  /* ------------------------------------------------------ 视口高亮 ---- */
  function setupActiveHighlight() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          cards.forEach(function (c) { c.el.classList.remove('is-active'); });
          en.target.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    cards.forEach(function (c) { io.observe(c.el); });
  }

  /* ------------------------------------------------------ 说明收纳 ---- */
  /* 只处理「配置列」里的说明块。
     结果列里的 .note 是结论的一部分（如升级建议、方案说明），折叠它反而有害。 */
  function collapseNotes() {
    var col = document.querySelector('.col-config');
    if (!col) return;
    var notes = col.querySelectorAll('.note');
    Array.prototype.forEach.call(notes, function (n) {
      if (noteDone.has(n)) return;
      if (n.closest('.glossary') || n.closest('.banner')) { noteDone.add(n); return; }
      // 只有真正长的纯文字说明才收纳；含表格/列表的保持完整
      var len = (n.textContent || '').trim().length;
      if (len < 90 || n.querySelector('dl, table, ul, ol')) { noteDone.add(n); return; }
      noteDone.add(n);
      n.classList.add('note-collapsible');
      n.addEventListener('click', function () { n.classList.toggle('open'); });
    });
  }

  /* -------------------------------------------------- 移动端结果条 ---- */
  /* 数值统一取自顶栏答案筹码（app.js 维护）。
     两者同源，避免各自解析导致不一致；筹码隐藏即空态，底栏也不显示。 */
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setupMobileBar() {
    var bar = $('mobileBar');
    var out = $('mobileBarValue');
    var chip = $('answerChip');
    var src = $('answerChipValue') || $('recoBig');
    if (!bar || !out || !src) return;

    function sync() {
      if (chip && chip.hidden) { bar.hidden = true; return; }
      var t = (src.textContent || '').replace(/\s+/g, ' ').trim();
      // 保留数字、区间连接符（- – ~ ～）、小数点与 W
      var clean = t.replace(/[^\d\-–~～.W\s]/g, '').trim();
      if (!/\d/.test(clean)) { bar.hidden = true; return; }
      var html = escHtml(clean) + (/W/.test(clean) ? '' : '<span> W</span>');
      if (out.innerHTML !== html) out.innerHTML = html;
      if (bar.hidden) bar.hidden = false;
    }

    if ('MutationObserver' in window) {
      new MutationObserver(sync).observe(src, {
        childList: true, characterData: true, subtree: true
      });
      if (chip) {
        new MutationObserver(sync).observe(chip, {
          attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true
        });
      }
    }
    sync();
  }

  /* -------------------------------------------------------- 数据声明 ----
     打开页面时自动出现的声明弹窗。原来的「数据来源」卡片与显卡卡里的两段
     声明都搬进了这里，所以 id="sources" / id="aibCatalogNote" 都还在原位
     （只是换了父节点），app.js 一行都不用改。

     抑制规则（两者之一成立就不弹）：
       · URL 带 ?nodisclaimer=1 —— 给截图 / OG 图 / 回归测试用，
         否则弹窗会盖住整页，基线比对和预览图全废
       · localStorage 里记住了同一个数据版本 —— 用户勾了「不再提示」。
         按「数据版本」而不是布尔值记，是为了数据库升版后能再提示一次。 */
  var DM_KEY = 'psu-calc-2026-v1-disclaimer';

  function setupDisclaimer() {
    var m = $('disclaimerModal');
    var openBtn = $('btnDisclaimer');
    if (!m || !openBtn) return;

    var body = $('dmBody');
    var okBtn = $('dmOk');
    var xBtn = $('dmClose');
    var never = $('dmNever');
    var lastFocus = null;

    function dbVersion() {
      var d = window.HWDB;
      return (d && d.meta && d.meta.version) || '1';
    }
    function suppressed() {
      if (/[?&]nodisclaimer=1(&|$)/.test(location.search)) return true;
      if (location.hash === '#nodisclaimer') return true;
      try { return localStorage.getItem(DM_KEY) === dbVersion(); } catch (e) { return false; }
    }

    function isOpen() { return !m.hidden; }

    function open() {
      if (isOpen()) return;
      lastFocus = document.activeElement;
      m.hidden = false;
      document.body.classList.add('modal-open');
      if (body) body.scrollTop = 0;
      if (okBtn) { try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); } }
    }

    function close() {
      if (!isOpen()) return;
      // 勾了「不再提示」才记；没勾就下次打开还提示 —— 声明不能被动消失
      if (never && never.checked) {
        try { localStorage.setItem(DM_KEY, dbVersion()); } catch (e) {}
      }
      m.hidden = true;
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
      }
      lastFocus = null;
    }

    openBtn.addEventListener('click', open);
    if (okBtn) okBtn.addEventListener('click', close);
    if (xBtn) xBtn.addEventListener('click', close);

    // 点遮罩（卡片之外）关闭
    m.addEventListener('mousedown', function (e) {
      if (e.target === m) close();
    });

    // Esc 关闭 + 焦点锁在弹窗内（Tab 不跑到背后的配置表单上）
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = m.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      var list = Array.prototype.filter.call(f, function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* 首访的自动弹出**延后**到启动序列结束之后再执行（见 setupBoot）——
       参考录屏里启动屏期间不会叠弹窗。这里只登记「本次需不需要弹」。 */
    var needed = !suppressed();

    // 供自动化测试 / 其他脚本调用
    window.__PSU_DISCLAIMER__ = { open: open, close: close, isOpen: isOpen };
    return { needed: needed, open: open };
  }

  /* --------------------------------------------------------- 动效开关 ----
     与 ?nodisclaimer=1 同一套约定：URL 参数优先，其次是给自动化用的
     window.__PSU_NOANIM（脚本执行前就能读到），最后尊重系统的「减少动态效果」。
     三者任一成立 → 一步都不播，而不是「加速播」。 */
  function animDisabled() {
    try {
      if (/(?:^|[?&])noanim=1(?:&|$)/.test(location.search)) return true;
    } catch (e) { /* file:// 等场景忽略 */ }
    if (window.__PSU_NOANIM) return true;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
      }
    } catch (e) { /* 老浏览器忽略 */ }
    return false;
  }

  /* ------------------------------------------------ 启动序列（Phase A）--
     节奏来自对参考录屏的**逐帧量化**（1152×720 / 11.925s）：
       · 开机段 0→1.6s 是一块中灰底（亮度 48/255、近黑像素仅 9%），
         白色内容分几次离散跳变增长，红色横跨整个宽度
       · 帧差中位数只有 0.30（几乎静止），整段**只有一次真硬切**（df=14.1）收尾
     这里是**用户指定**的时长：整段 ≥5 秒，覆盖录屏实测的 1.6 秒。
     只保留实测的两条**形状**约束：遮罩硬切出现、结束时 90ms 硬切离开（不做长淡出）。
     时间轴：T0 遮罩已在首帧 → T1 刻度线离散推进 4600ms（步进 8 档）+ 静止 600ms
             → T2 90ms 硬切离开 → T3 交接给声明弹窗。总时长约 5.29 秒。
     任意 click / keydown / touchstart 立即跳到 T3。 */
  var SPLASH_MS = 5200;   // = 刻度推进 4600ms（与 style.css 的 transition 对齐）+ 收尾静止 600ms

  function setupBoot(afterBoot) {
    var el = $('boot');
    var root = document.documentElement;
    var finished = false;
    var timers = [];

    function clearTimers() {
      timers.forEach(function (t) { clearTimeout(t); });
      timers = [];
    }
    function unbind() {
      document.removeEventListener('click', onInput, true);
      document.removeEventListener('keydown', onInput, true);
      document.removeEventListener('touchstart', onInput, true);
    }
    function settle(instant) {
      root.classList.remove('is-booting');
      root.dataset.boot = 'done';
      if (instant && el) { el.classList.remove('is-out'); el.classList.add('is-done'); }
      if (afterBoot) afterBoot();
    }
    /* 完全不播（?noanim=1 / reduced-motion / 遮罩节点缺失）：首帧即「已完成」 */
    function skipAll() {
      if (finished) return;
      finished = true; clearTimers(); unbind();
      if (el) el.classList.add('is-done');
      settle(true);
    }
    /* 用户中途催促：立刻结束，不等那 90ms 过渡 */
    function skipNow() {
      if (finished) return;
      finished = true; clearTimers(); unbind();
      settle(true);
    }
    function onInput() { skipNow(); }

    if (!el || animDisabled()) { skipAll(); return; }

    root.dataset.boot = 'running';
    root.classList.add('is-booting');

    /* 让刻度线跑起来。必须先把 scaleX(0) 的初始样式**同步提交**一次
       （读 offsetWidth 强制 style/layout 计算），再切 is-run 才会真的产生过渡；
       若与首帧样式同帧生效，浏览器会把两次样式合并、过渡被跳过。
       这里刻意不用 requestAnimationFrame：无头环境（--dump-dom）不产生渲染帧，
       rAF 不触发，进度条会一直停在 0。 */
    void el.offsetWidth;
    if (!finished) el.classList.add('is-run');

    document.addEventListener('click', onInput, true);
    document.addEventListener('keydown', onInput, true);
    document.addEventListener('touchstart', onInput, true);

    // bfcache 返回（浏览器后退）：页面是恢复的，不该再播一次
    window.addEventListener('pageshow', function (e) { if (e.persisted) skipNow(); });

    timers.push(setTimeout(function () {          // T1：静止 550ms
      if (finished) return;
      unbind();
      if (el) el.classList.add('is-out');         // T2：90ms 硬切离开
      root.classList.remove('is-booting');        // T3：先解锁滚动
      root.dataset.boot = 'done';
      timers.push(setTimeout(function () {        // T3 收尾：移出渲染树后才开声明弹窗
        if (finished) return;
        finished = true;
        if (el) el.classList.add('is-done');
        if (afterBoot) afterBoot();
      }, 90));
    }, SPLASH_MS));
  }

  /* ------------------------------------------------------------ 启动 --- */
  function boot() {
    try {
      injectIcons();
      setupCards();
      setupActiveHighlight();
      collapseNotes();
      setupMobileBar();
      var disclaimer = setupDisclaimer();

      // 启动序列：跑完（或直接降级）之后，才让首访的声明弹窗出现
      setupBoot(function () {
        if (disclaimer && disclaimer.needed) disclaimer.open();
      });

      // 控件值变化 → 刷新摘要
      // 用捕获阶段监听，不影响 app.js 自己的监听器
      ['change', 'input'].forEach(function (ev) {
        document.addEventListener(ev, refreshSummaries, true);
      });

      // 动态增删的存储行 / 自定义设备行不会触发 change，需要观察 DOM。
      // refreshSummaries 内部有"内容没变就不写"的判断，不会自激。
      var col = document.querySelector('.col-config');
      if (col && 'MutationObserver' in window) {
        new MutationObserver(function () {
          refreshSummaries();
          collapseNotes();
        }).observe(col, { childList: true, subtree: true });
      }
    } catch (e) {
      // ui.js 是增强层，任何异常都不能影响主计算功能
      console.error('[ui.js]', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
