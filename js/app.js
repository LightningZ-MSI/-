/* ============================================================================
   整机功耗计算工具 — 交互层
   依赖: js/db.js (HWDB)  js/engine.js (PSUEngine)
   ==========================================================================*/
(function () {
  'use strict';

  var DB = window.HWDB;
  var EN = window.PSUEngine;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* 内联 SVG 图标（单色描边，currentColor）。
     设计系统要求全站不出现 emoji —— emoji 在 Windows / Apple / Android 上渲染
     差异很大，且与描边图标混排时光学大小与基线都不齐。 */
  var SVG = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 L9.5 18 L20 6.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
           'stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L2 20 h20 Z"/>' +
          '<path d="M12 10v4M12 17.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
           'stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>'
  };

  /* ----------------------------------------------------------- 状态 ---- */
  var S = {
    scenario: 'gaming',
    cpuBrand: 'Intel', cpuGen: '', cpuId: '', cpuOc: false, cpuCustomW: '',
    gpuBrand: 'NVIDIA', gpuGen: '', gpuId: '', gpuAibId: '', gpuOc: false,
    gpuCustomName: '', gpuCustomW: '',
    moboId: '', ramId: '', ramKits: 1,
    storage: [], coolerId: '', fanId: '', fanQty: 3,
    caseId: '', argbChannels: 0, extras: {}, customItems: [],
    psuId: '', budget: ''
  };

  var lastResult = null;
  var feedback = [];

  /* 中文名标注由数据层算好（aib.cnLabel），此处仅做兜底 */
  function cnLabel(a) {
    return a.cnLabel != null ? a.cnLabel : (a.cn ? '（' + a.cn + '）' : '');
  }

  /* -------------------------------------------------------- 工具函数 --- */
  function confBadge(c) {
    if (!c) return '';
    var t = { official: '官方', review: '评测', estimate: '估算', leak: '未发布' }[c] || c;
    return '<span class="conf ' + c + '">' + t + '</span>';
  }

  /* 记录所有被捕获的异常，供自动化测试断言"页面无错误" */
  var appErrors = [];
  window.__PSU_ERRORS = appErrors;

  function errMsg(e) {
    var msg = (e && e.message) ? e.message : String(e);
    var where = String((e && e.stack) || '').split('\n')[1] || '';
    appErrors.push(msg + ' @' + where.trim());
    console.error(e);
    toast('出错了：' + msg, true);
  }

  /* 生成 <option> 列表，支持 optgroup 分组 */
  function optionsHtml(list, selected, labelFn, groupFn) {
    var groups = {}, order = [];
    list.forEach(function (it) {
      var g = groupFn ? groupFn(it) : '';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(it);
    });
    return order.map(function (g) {
      var inner = groups[g].map(function (it) {
        var v = it.id;
        return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' +
               esc(labelFn(it)) + '</option>';
      }).join('');
      return g ? '<optgroup label="' + esc(g) + '">' + inner + '</optgroup>' : inner;
    }).join('');
  }

  /* ====================================================== 初始化渲染 === */

  function initMeta() {
    $('dbVersion').textContent = DB.meta.version;
    var d = $('dbDate');
    if (d) d.textContent = DB.meta.updated;
    var c = DB.meta.counts;
    $('dbCounts').textContent =
      'CPU ' + c.cpu + ' · GPU ' + c.gpu + ' · AIC ' + c.aib +
      '（' + c.aibVendors + ' 厂商 / ' + c.aibSeries + ' 系列）' +
      ' · 主板 ' + c.mobo + ' · 电源 ' + c.psu;

    /* AIC 系列目录的可靠性声明——必须显示，不能只写在文档里 */
    var cm = DB.aibCatalogMeta;
    if (cm && $('aibCatalogNote')) {
      $('aibCatalogNote').innerHTML =
        '<b>关于 AIC 板型数据的可靠性</b>' +
        '<div style="margin-top:6px">本目录共 <b>' + cm.seriesCount + '</b> 个厂商系列、' +
        '<b>' + DB.meta.counts.aib + '</b> 个板型组合。其中 <b>' + cm.explicitCount +
        '</b> 个型号有官方规格或权威评测来源（标' +
        '<span class="conf official">官方</span><span class="conf review">评测</span>' +
        '）。</div>' +
        '<div style="margin-top:6px"><b>覆盖范围核实：</b>已按厂商官方新闻稿与产品页，' +
        '逐代核实了 <b>' + cm.coverageVerifiedCount + '</b> / ' + cm.seriesCount +
        ' 个系列的覆盖型号 —— 即「这个系列在这一代到底做不做这个型号」。' +
        '例如 ASUS 在 RX 7000 / RX 9000 上从来没有 ROG Strix（猛禽），' +
        '所以库里不会出现「华硕 ROG Strix RX 9070 XT」。' +
        '未核实覆盖范围的系列，其组合在下拉里标「推算」，表示按系列定位推出来的组合、' +
        '不保证厂商真的发表过该型号；功耗墙也一律是推算值，非厂商实测。</div>' +
        '<div style="margin-top:6px"><b>中文名分三态：</b>' +
        '官方名 <b>' + cm.cnOfficialCount + '</b> 个（厂商中文站确认）· ' +
        '玩家俗称 <b>' + cm.cnColloquialCount + '</b> 个（已确认厂商不使用，标「俗称」）· ' +
        '未核实 <b>' + cm.cnUnverifiedCount + '</b> 个（标「未核实」）。' +
        '例：华硕 ROG Astral 官方名是「夜神」而非常被误写的「星曜」；' +
        '技嘉在 gigabyte.cn 上完全没有中文系列名，超级雕/大雕/小雕/魔鹰等均为玩家俗称。</div>' +
        '<div style="margin-top:6px"><b>已核实：</b>' + cm.verified.join('；') + '。</div>' +
        '<div style="margin-top:6px"><b>已修正：</b>' + cm.corrected.join('；') + '。</div>' +
        '<div style="margin-top:6px">' + esc(cm.unverifiedNote) + '</div>';
    }

    $('sources').innerHTML = Object.keys(DB.sources).map(function (k) {
      var s = DB.sources[k];
      return '<li>' + esc(s.label) + ' — <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
             esc(s.url.replace(/^https?:\/\//, '').slice(0, 62)) + '</a></li>';
    }).join('');
  }

  function initScenarios() {
    // 模式选择器形态：图标 + 文字 + 选中项底部红色短条（奥创的标志性组件）
    var SC_ICON = {
      office:  '<path d="M3 5h18v11H3z"/><path d="M8 20h8"/>',
      gaming:  '<path d="M7 12h4M9 10v4M15.5 11.5v.01M17.5 13.5v.01"/>' +
               '<rect x="2" y="6" width="20" height="12" rx="4"/>',
      creator: '<path d="M12 3v10M8 7l4-4 4 4"/><path d="M4 15v4h16v-4"/>',
      extreme: '<path d="M13 2 L4.5 13.5 H11 L10 22 L19.5 10 H13 Z"/>'
    };
    $('scenarios').innerHTML = Object.keys(EN.SCENARIOS).map(function (k) {
      var s = EN.SCENARIOS[k];
      return '<button class="scenario" data-sc="' + k + '" title="' + esc(s.desc) + '">' +
             '<span class="si" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" ' +
             'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
             (SC_ICON[k] || SC_ICON.gaming) + '</svg></span>' +
             '<b>' + esc(s.label.split(' ')[0]) + '</b>' +
             '<span>负载 ×' + s.factor.toFixed(2) + '</span></button>';
    }).join('');
    $('scenarios').addEventListener('click', function (e) {
      var b = e.target.closest('.scenario');
      if (!b) return;
      S.scenario = b.dataset.sc;
      render();
    });
  }

  /* CPU 三级筛选：① 品牌按钮 ② 系列 / 世代 ③ 型号
     与显卡卡同构 —— 显卡是「品牌 → 型号 → AIC 板型」，
     CPU 是「品牌 → 系列 / 世代 → 型号」。
     164 颗 CPU 塞进一个下拉根本没法翻，按世代切开后每段只剩 10~30 条；
     同时保留「全部世代」这一档，让不记得自己是第几代的用户也能直接找型号。 */
  function initCpu() {
    /* 不预选任何 CPU。
       这里曾硬编码 S.cpuId = 'cu7-270kp'，会让「空态」永远不空 ——
       用户什么都没选，页面却已经有了一颗 CPU 的功耗，
       与首访应当渲染空配置的约定相矛盾。
       品牌默认停在 Intel 只是「筛选器」的初值，不代表已选中任何硬件。 */

    var brands = [];
    DB.cpus.forEach(function (c) { if (brands.indexOf(c.brand) === -1) brands.push(c.brand); });

    $('cpuBrand').innerHTML = brands.map(function (b) {
      return '<button type="button" data-b="' + esc(b) + '">' + esc(b) + '</button>';
    }).join('');

    $('cpuBrand').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.dataset.b === S.cpuBrand) return;
      S.cpuBrand = b.dataset.b;
      S.cpuGen = '';       // 换品牌后原来的世代筛选必然失效，清掉
      S.cpuId = '';        // 已选型号也不属于新品牌了，必须一起清
      render();
    });

    $('cpuGen').addEventListener('change', function () {
      S.cpuGen = this.value;
      /* 只有「已选型号掉到新筛选范围之外」时才清空。
         以前这里无条件清空，用户切一下世代看看有什么，型号就没了。 */
      if (S.cpuId && !cpuMatchesFilter(S.cpuId)) S.cpuId = '';
      render();
    });

    $('cpuSelect').addEventListener('change', function () { S.cpuId = this.value; render(); });
    $('cpuOc').addEventListener('change', function () { S.cpuOc = this.checked; render(); });
    $('cpuCustomW').addEventListener('input', function () { S.cpuCustomW = this.value; render(); });
  }

  /* 型号是否落在当前的「品牌 + 世代」筛选范围内 */
  function cpuMatchesFilter(id) {
    var c = DB.cpus.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    if (S.cpuBrand && c.brand !== S.cpuBrand) return false;
    if (S.cpuGen && c.gen !== S.cpuGen) return false;
    return true;
  }

  /* 启动时修正一次筛选器与已选型号的不一致。
     注意：这个修正**只能在启动时做一次**，绝不能放进 refreshCpuCascade()：
     放进去的话，用户已经把 12 代 i5 选好、再去点「Core Ultra 200S」世代时，
     刷新函数会立刻把 S.cpuGen 改回 intel12 —— 筛选器变成按不动。
     状态修正属于「载入时的一次性修复」，交互期的一致性由事件处理器保证。
     （注：本文件不允许出现 emoji 与变体选择符，designcheck 会查，所以这里不使用警示符号。） */
  function normalizeCpuFilter() {
    if (!S.cpuId) return;
    var cur = DB.cpus.filter(function (c) { return c.id === S.cpuId; })[0];
    if (!cur) { S.cpuId = ''; return; }
    S.cpuBrand = cur.brand;
    if (S.cpuGen && S.cpuGen !== cur.gen) S.cpuGen = '';
  }

  /* ② ③ 两级下拉的联动刷新。纯只读：不修改 S。 */
  function refreshCpuCascade() {
    if (!$('cpuBrand') || !$('cpuGen') || !$('cpuSelect')) return;

    Array.prototype.forEach.call($('cpuBrand').querySelectorAll('button'), function (b) {
      b.className = (b.dataset.b === S.cpuBrand) ? 'on' : '';
    });

    if (!S.cpuBrand) S.cpuBrand = 'Intel';

    var order = DB.cpuGenOrder || [];
    var ofBrand = DB.cpus.filter(function (c) { return c.brand === S.cpuBrand; });

    // 世代按 CPU_GEN_ORDER 排（当前在售 → 已停产 → 未发布），
    // 不在顺序表里的世代兜底附在最后，绝不静默丢掉。
    var genIds = [], seen = {};
    order.forEach(function (id) {
      if (ofBrand.some(function (c) { return c.gen === id; })) { seen[id] = 1; genIds.push(id); }
    });
    ofBrand.forEach(function (c) {
      if (c.gen && !seen[c.gen]) { seen[c.gen] = 1; genIds.push(c.gen); }
    });

    var SEG_CN = { current: '当前在售', legacy: '已停产 · 二手常见', future: '未发布 / 前瞻' };
    var genItems = genIds.map(function (id) {
      var list = ofBrand.filter(function (c) { return c.gen === id; });
      var g = list[0];
      return {
        id: id,
        text: (g.genLabel || id) + (g.year ? '（' + g.year + ' 年）' : '') + ' · ' + list.length + ' 款',
        seg: g.segment
      };
    });

    $('cpuGen').innerHTML =
      '<option value="">全部世代（' + ofBrand.length + ' 款）</option>' +
      optionsHtml(genItems, S.cpuGen,
        function (it) { return it.text; },
        function (it) { return SEG_CN[it.seg] || '其他'; });

    var rank = {};
    order.forEach(function (id, i) { rank[id] = i; });
    var list = ofBrand.filter(function (c) { return !S.cpuGen || c.gen === S.cpuGen; })
      .slice()
      .sort(function (a, b) {
        var ra = rank[a.gen] === undefined ? 999 : rank[a.gen];
        var rb = rank[b.gen] === undefined ? 999 : rank[b.gen];
        return (ra - rb) || (b.tdp - a.tdp);   // 同世代内按 TDP 从高到低
      });

    /* 兜底：万一筛选条件把已选型号挡在外面（例如用户手工改过 localStorage），
       也要把它补回列表。否则下拉显示「请选择 CPU 型号」，
       而引擎已经把这颗 CPU 的功耗算进去了 —— 界面和结果自相矛盾。 */
    if (S.cpuId && !list.some(function (c) { return c.id === S.cpuId; })) {
      var extra = DB.cpus.filter(function (c) { return c.id === S.cpuId; })[0];
      if (extra) list = [extra].concat(list);
    }

    $('cpuSelect').innerHTML =
      (S.cpuId ? '' : '<option value="">— 请选择 CPU 型号 —</option>') +
      optionsHtml(list, S.cpuId, function (c) {
        return c.name + '  ·  ' + c.socket + '  ·  ' + c.tdp + 'W' +
               (c.unlocked === false ? '  ·  锁频' : '') +
               (c.released === '待发布' ? '  ·  未发布' : '');
      }, function (c) {
        return (c.genLabel || c.family) + (c.year ? '（' + c.year + ' 年）' : '');
      });

    $('cpuSelect').disabled = !list.length;
  }

  function initGpu() {
    // ① 品牌
    var brands = [];
    DB.gpus.forEach(function (g) { if (brands.indexOf(g.brand) === -1) brands.push(g.brand); });
    $('gpuBrand').innerHTML =
      '<button data-b="__igpu__">集成显卡</button>' +
      brands.map(function (b) { return '<button data-b="' + esc(b) + '">' + esc(b) + '</button>'; }).join('');

    $('gpuBrand').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var v = b.dataset.b;
      if (v === '__igpu__') {
        S.gpuId = '__igpu__'; S.gpuAibId = '';
      } else {
        /* 点品牌 / 世代只改「筛选条件」，不顺手替你选中一块显卡。
           这里原来会自动挑该品牌的第一款（最新旗舰）并立刻计入功耗，
           用户只是想看看有哪些型号，整机功耗却已经变成 5090 的值了。 */
        S.gpuBrand = v;
        S.gpuGen = '';
        S.gpuId = ''; S.gpuAibId = '';
      }
      render();
    });

    $('gpuGen').addEventListener('change', function () {
      S.gpuGen = this.value;
      /* 只有「已选型号掉到新筛选范围之外」时才清空 */
      if (S.gpuId && S.gpuId !== '__igpu__' && !gpuMatchesFilter(S.gpuId)) {
        S.gpuId = ''; S.gpuAibId = '';
      }
      render();
    });

    $('gpuModel').addEventListener('change', function () {
      S.gpuId = this.value;
      S.gpuAibId = '';
      var a = DB.aibs.filter(function (x) { return x.gpuId === S.gpuId; });
      if (a.length) S.gpuAibId = a[0].id;
      render();
    });
    $('gpuAib').addEventListener('change', function () { S.gpuAibId = this.value; render(); });
    $('gpuOc').addEventListener('change', function () { S.gpuOc = this.checked; render(); });
    $('gpuCustomName').addEventListener('input', function () { S.gpuCustomName = this.value; render(); });
    $('gpuCustomW').addEventListener('input', function () { S.gpuCustomW = this.value; render(); });
  }

  /* 型号是否落在当前的「品牌 + 世代」筛选范围内 */
  function gpuMatchesFilter(id) {
    var g = DB.gpus.filter(function (x) { return x.id === id; })[0];
    if (!g) return false;
    if (S.gpuBrand && g.brand !== S.gpuBrand) return false;
    if (S.gpuGen && g.gen !== S.gpuGen) return false;
    return true;
  }

  /* 启动时修正一次筛选器与已选型号的不一致（理由同 normalizeCpuFilter） */
  function normalizeGpuFilter() {
    if (!S.gpuId || S.gpuId === '__igpu__') return;
    var cur = DB.gpus.filter(function (x) { return x.id === S.gpuId; })[0];
    if (!cur) { S.gpuId = ''; S.gpuAibId = ''; return; }
    S.gpuBrand = cur.brand;
    if (S.gpuGen && S.gpuGen !== cur.gen) S.gpuGen = '';
  }

  /* 世代下拉 + ② ③ AIC 联动刷新。纯只读：不修改 S。 */
  function refreshGpuCascade() {
    var brandBtns = $('gpuBrand').querySelectorAll('button');
    for (var i = 0; i < brandBtns.length; i++) {
      var isI = brandBtns[i].dataset.b === '__igpu__';
      var on = isI ? (S.gpuId === '__igpu__') : (brandBtns[i].dataset.b === S.gpuBrand && S.gpuId !== '__igpu__');
      brandBtns[i].className = on ? 'on' : '';
    }

    var gSel = $('gpuGen'), mSel = $('gpuModel'), aSel = $('gpuAib');

    if (S.gpuId === '__igpu__') {
      gSel.innerHTML = '<option value="">—</option>';
      gSel.disabled = true;
      mSel.innerHTML = '<option value="__igpu__">使用 CPU 集成显卡（无独立显卡）</option>';
      mSel.disabled = true;
      aSel.innerHTML = '<option value="">—</option>';
      aSel.disabled = true;
      return;
    }
    gSel.disabled = false; mSel.disabled = false; aSel.disabled = false;

    var order = DB.gpuGenOrder || [];
    var meta = DB.gpuGenMeta || {};
    var ofBrand = DB.gpus.filter(function (g) { return g.brand === S.gpuBrand; });

    var genIds = [], seen = {};
    order.forEach(function (id) {
      if (ofBrand.some(function (g) { return g.gen === id; })) { seen[id] = 1; genIds.push(id); }
    });
    ofBrand.forEach(function (g) {
      if (g.gen && !seen[g.gen]) { seen[g.gen] = 1; genIds.push(g.gen); }
    });

    /* 世代分组名里直接写明「已停产」，让用户一眼看到老卡也在库里，
       不用点进去猜。这是「关切久远硬件」最直接的界面表达。 */
    var SEG_CN = {
      current: '当前在售',
      legacy: '已停产 · 二手常见',
      unreleased: '未发布 / 前瞻',
      future: '未发布 / 前瞻'
    };
    var genItems = genIds.map(function (id) {
      var list = ofBrand.filter(function (g) { return g.gen === id; });
      var m = meta[id] || {};
      return {
        id: id,
        text: (m.label || id) + (m.year ? '（' + m.year + ' 年）' : '') + ' · ' + list.length + ' 款',
        seg: m.segment || list[0].segment
      };
    });

    gSel.innerHTML = '<option value="">全部世代（' + ofBrand.length + ' 款）</option>' +
      optionsHtml(genItems, S.gpuGen,
        function (it) { return it.text; },
        function (it) { return SEG_CN[it.seg] || '其他'; });

    var rank = {};
    order.forEach(function (id, i) { rank[id] = i; });
    var list = ofBrand.filter(function (g) { return !S.gpuGen || g.gen === S.gpuGen; })
      .slice()
      .sort(function (a, b) {
        var ra = rank[a.gen] === undefined ? 999 : rank[a.gen];
        var rb = rank[b.gen] === undefined ? 999 : rank[b.gen];
        return (ra - rb) || (b.tbp - a.tbp);
      });

    /* 兜底：已选型号必须始终出现在列表里（理由同 refreshCpuCascade） */
    if (S.gpuId && !list.some(function (g) { return g.id === S.gpuId; })) {
      var extraG = DB.gpus.filter(function (g) { return g.id === S.gpuId; })[0];
      if (extraG) list = [extraG].concat(list);
    }

    // 未选型号时给一个显式占位项，避免浏览器默认选中第一个型号
    // （那样界面上像是已经选好了，而 S.gpuId 其实是空的）
    mSel.innerHTML = (S.gpuId ? '' : '<option value="">— 请选择显卡型号 —</option>') +
      optionsHtml(list, S.gpuId, function (g) {
        return g.name + '  ·  TBP ' + g.tbp + 'W  ·  ' + g.memory +
               (g.confidence === 'leak' ? '  [未发布]' : '') +
               (g.segment === 'legacy' ? '  [已停产]' : '');
      }, function (g) {
        var m = meta[g.gen] || {};
        return (m.label || g.family) + (m.year ? '（' + m.year + ' 年）' : '') +
               (g.segment === 'legacy' ? ' · 已停产' : '');
      });

    var aibs = DB.aibs.filter(function (a) { return a.gpuId === S.gpuId; });
    var curGpu = DB.gpus.filter(function (x) { return x.id === S.gpuId; })[0];
    if (!aibs.length) {
      aSel.innerHTML = '<option value="">— 暂无收录板型，按公版 TBP 计算 —</option>';
      S.gpuAibId = '';
    } else {
      // 按「定位 → 厂商」分组，方便在同厂商内横向比较
      var tierCn = { halo: 'Halo 旗舰', flagship: '旗舰款', mainstream: '主流款', value: '入门款', blower: '涡轮 / 工作站' };
      aSel.innerHTML = '<option value="">— 未指定（按公版 TBP ' +
        (curGpu ? curGpu.tbp : '?') + 'W 计算）—</option>' +
        optionsHtml(aibs, S.gpuAibId, function (a) {
          /* 只在尾部标「推算」——该系列这一代确实做这个型号、已逐代核实的，不加字。
             这样下拉里一眼能分辨：没标记的是查证过存在的产品，
             带「推算」的只是按系列定位推出来的组合。 */
          var tag = (a.generated && !a.coverageVerified) ? '  ·  推算' : '';
          return a.vendor + ' ' + a.series + cnLabel(a) +
                 '  ·  ' + a.tbp + 'W' + (a.liquid ? '  ·  水冷' : '') + tag;
        }, function (a) {
          return (tierCn[a.tier] || a.tier) + ' — ' + a.vendor;
        });
    }
  }

  function initMobo() {
    $('moboSelect').innerHTML = '<option value="">— 请选择主板 —</option>' +
      optionsHtml(DB.motherboards, S.moboId, function (m) {
        return m.brand + ' ' + m.model + '  ·  ' + m.socket + '  ·  ' + m.formFactor;
      }, function (m) {
        var p = DB.platforms[m.socket];
        return m.socket + ' · ' + (p ? p.label : '');
      });
    $('moboSelect').addEventListener('change', function () { S.moboId = this.value; render(); });
  }

  function initRam() {
    $('ramSelect').innerHTML = '<option value="">— 请选择内存 —</option>' +
      optionsHtml(DB.ram, S.ramId, function (r) {
        var t = r.type || 'DDR5';
        return r.brand + ' ' + r.model + '  ·  ' + (r.capacityPerStick * r.sticks) + 'GB  ·  ' + t;
      }, function (r) {
        var t = r.type || 'DDR5';
        return t + ' — ' + (r.rgb ? 'RGB 灯条' : '无灯条');
      });
    $('ramSelect').addEventListener('change', function () { S.ramId = this.value; render(); });
    $('ramKits').addEventListener('input', function () { S.ramKits = parseInt(this.value, 10) || 1; render(); });
  }

  /* 主板变更后，给类型不匹配的内存在下拉里打上警示标记 */
  function refreshRamFit() {
    var mobo = DB.motherboards.filter(function (m) { return m.id === S.moboId; })[0];
    if (!mobo) return;
    var sel = $('ramSelect');
    Array.prototype.forEach.call(sel.options, function (op) {
      if (!op.value) return;
      var r = DB.ram.filter(function (x) { return x.id === op.value; })[0];
      if (!r) return;
      var t = r.type || 'DDR5';
      var base = op.textContent.replace(/\s*·.*$/, '');
      op.textContent = base + (t !== mobo.ramType ? ' · ' + t + ' 与 ' + mobo.ramType + ' 主板不兼容' : '');
      op.disabled = false;
    });
  }

  function initStorage() {
    /* 不预置任何硬盘。这里曾硬编码一行 Gen5 SSD，
       会让首访的空态带着一个 11W 的存储项。空态就该是空的。 */
    if (!Array.isArray(S.storage)) S.storage = [];
    $('addStorage').addEventListener('click', function () {
      var used = S.storage.map(function (s) { return s.id; });
      var next = DB.storage.filter(function (s) { return used.indexOf(s.id) === -1; })[0] || DB.storage[0];
      S.storage.push({ id: next.id, qty: 1 });
      render();
    });
  }

  function refreshStorage() {
    var wrap = $('storageList');
    if (!S.storage.length) {
      wrap.innerHTML = '<div class="empty">尚未添加存储设备</div>';
      return;
    }
    wrap.innerHTML = S.storage.map(function (s, i) {
      var opts = optionsHtml(DB.storage, s.id, function (d) {
        return d.model + '  ·  ' + d.watts + 'W';
      }, function (d) { return d.kind === 'HDD' ? '机械硬盘 HDD' : (d.kind === 'SATA' ? 'SATA SSD' : 'NVMe SSD'); });
      return '<div class="storage-row">' +
        '<select data-si="' + i + '" class="s-sel">' + opts + '</select>' +
        '<input type="number" min="1" max="8" value="' + s.qty + '" data-qi="' + i + '" class="s-qty">' +
        '<button class="del" data-di="' + i + '" title="移除">×</button></div>';
    }).join('');

    wrap.querySelectorAll('.s-sel').forEach(function (el) {
      el.addEventListener('change', function () { S.storage[+el.dataset.si].id = el.value; render(); });
    });
    wrap.querySelectorAll('.s-qty').forEach(function (el) {
      el.addEventListener('input', function () {
        S.storage[+el.dataset.qi].qty = Math.max(1, parseInt(el.value, 10) || 1); render();
      });
    });
    wrap.querySelectorAll('.del').forEach(function (el) {
      el.addEventListener('click', function () { S.storage.splice(+el.dataset.di, 1); render(); });
    });
  }

  function initCooling() {
    $('coolerSelect').innerHTML = '<option value="">— 请选择散热器 —</option>' +
      optionsHtml(DB.coolers, S.coolerId, function (c) {
        return c.model + (c.kind === 'AIO' ? '（' + c.radiator + ' 冷排）' : '（风冷）');
      }, function (c) { return c.kind === 'AIO' ? '一体式水冷 AIO' : '风冷散热器'; });
    $('coolerSelect').addEventListener('change', function () { S.coolerId = this.value; render(); });

    $('fanSelect').innerHTML = optionsHtml(DB.fans, S.fanId, function (f) {
      return f.model + '  ·  ' + f.size + 'mm  ·  ' + f.watts + 'W' + (f.argb ? '  ARGB' : '');
    });
    $('fanSelect').addEventListener('change', function () { S.fanId = this.value; render(); });
    $('fanQty').addEventListener('input', function () { S.fanQty = parseInt(this.value, 10) || 0; render(); });
  }

  function initCase() {
    $('caseSelect').innerHTML = '<option value="">— 请选择机箱 —</option>' +
      optionsHtml(DB.cases, S.caseId, function (c) {
        return c.brand + ' ' + c.model + '  ·  显卡限长 ' + c.gpuMaxLen + 'mm  ·  ' +
               c.psuFormFactor.join('/') + ' 电源';
      });
    $('caseSelect').addEventListener('change', function () { S.caseId = this.value; render(); });
  }

  function initExtras() {
    $('extrasGrid').innerHTML = DB.extras.map(function (x) {
      return '<label class="chk"><input type="checkbox" data-x="' + esc(x.id) + '">' +
             '<span>' + esc(x.label) + '</span>' +
             '<input type="number" min="1" max="20" value="1" data-xq="' + esc(x.id) + '"></label>';
    }).join('');

    $('extrasGrid').addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.x) {
        if (t.checked) S.extras[t.dataset.x] = parseInt(
          $('extrasGrid').querySelector('[data-xq="' + t.dataset.x + '"]').value, 10) || 1;
        else delete S.extras[t.dataset.x];
        render();
      }
    });
    $('extrasGrid').addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.xq && S.extras[t.dataset.xq] != null) {
        S.extras[t.dataset.xq] = parseInt(t.value, 10) || 1;
        render();
      }
    });

    $('argbChannels').addEventListener('input', function () { S.argbChannels = parseInt(this.value, 10) || 0; render(); });

    $('addCustomItem').addEventListener('click', function () {
      S.customItems.push({ label: '', watts: 0 });
      render();
    });
  }

  function refreshCustomItems() {
    var wrap = $('customItems');
    if (!S.customItems.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = S.customItems.map(function (c, i) {
      return '<div class="storage-row" style="grid-template-columns:1fr 90px 32px">' +
        '<input type="text" data-cl="' + i + '" placeholder="设备名称" value="' + esc(c.label) + '">' +
        '<input type="number" min="0" step="1" data-cw="' + i + '" placeholder="W" value="' + (c.watts || '') + '">' +
        '<button class="del" data-cd="' + i + '">×</button></div>';
    }).join('');
    wrap.querySelectorAll('[data-cl]').forEach(function (el) {
      el.addEventListener('input', function () { S.customItems[+el.dataset.cl].label = el.value; render(); });
    });
    wrap.querySelectorAll('[data-cw]').forEach(function (el) {
      el.addEventListener('input', function () {
        S.customItems[+el.dataset.cw].watts = parseFloat(el.value) || 0; render();
      });
    });
    wrap.querySelectorAll('[data-cd]').forEach(function (el) {
      el.addEventListener('click', function () { S.customItems.splice(+el.dataset.cd, 1); render(); });
    });
  }

  function initPsu() {
    $('psuSelect').innerHTML = '<option value="">— 不校验 / 尚未选购 —</option>' +
      optionsHtml(DB.psus, S.psuId, function (p) {
        return p.brand + ' ' + p.model + '  ·  ' + p.watts + 'W  ·  ' + p.efficiency;
      }, function (p) { return p.atx + ' · ' + p.tier + '档'; });
    $('psuSelect').addEventListener('change', function () { S.psuId = this.value; render(); });
  }

  /* ==================================================== 渲染各信息块 == */

  function renderCpuInfo() {
    var c = DB.cpus.filter(function (x) { return x.id === S.cpuId; })[0];
    var box = $('cpuInfo');
    if (!c) {
      box.innerHTML = '<div class="note warn">未选择 CPU。若 CPU 属于未收录型号，' +
        '请在上方"自定义功耗"中填入其最大睿频功耗，否则无法计算。</div>';
      return;
    }
    var used = (S.cpuOc && c.unlocked !== false) ? (parseFloat(S.cpuCustomW) || c.ocPeak) : c.maxTurbo;
    box.innerHTML =
      '<dl class="kv">' +
      '<dt>插槽</dt><dd>' + esc(c.socket) + '</dd>' +
      '<dt>核心</dt><dd>' + esc(c.cores) + '</dd>' +
      '<dt>基础 / 睿频功耗</dt><dd>' + c.tdp + ' W / ' + c.maxTurbo + ' W</dd>' +
      '<dt>超频</dt><dd>' + (c.unlocked === false ? '倍频锁定，不支持超频' : '不锁倍频') + '</dd>' +
      '<dt>本次计算取值</dt><dd style="color:var(--accent);font-weight:700">' + used + ' W</dd>' +
      '</dl>' +
      (c.note ? '<div class="note" style="margin-top:9px">' + esc(c.note) + '</div>' : '') +
      (S.cpuOc && c.unlocked === false
        ? '<div class="note warn" style="margin-top:9px">已勾选超频，但该型号倍频锁定，' +
          '功耗仍按 ' + c.maxTurbo + 'W（PL2/PPT 上限）计算。</div>' : '') +
      '<div class="note" style="margin-top:9px">来源：' +
        srcLink(c.source) + ' ' + confBadge(c.confidence) + '</div>';
  }

  function srcLink(key) {
    var s = DB.sources[key];
    if (!s) return '厂商/评测公开数据';
    return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>';
  }

  function renderGpuInfo() {
    var box = $('gpuInfo');
    if (S.gpuId === '__igpu__') {
      box.innerHTML = '<div class="note">使用 CPU 集成显卡，独立显卡功耗按 0W 计算。</div>';
      return;
    }
    if (!S.gpuId && S.gpuCustomName) {
      box.innerHTML = '<div class="note warn">未收录型号「' + esc(S.gpuCustomName) +
        '」，按手动输入的 ' + (parseFloat(S.gpuCustomW) || 250) + 'W 估算。</div>';
      return;
    }
    var g = DB.gpus.filter(function (x) { return x.id === S.gpuId; })[0];
    if (!g) { box.innerHTML = ''; return; }
    var a = DB.aibs.filter(function (x) { return x.id === S.gpuAibId; })[0];
    var used = a ? (S.gpuOc ? a.ocLimit : a.tbp) : (S.gpuOc ? Math.round(g.tbp * 1.08) : g.tbp);
    var tierCn = { halo: 'Halo 旗舰', flagship: '旗舰款', mainstream: '主流款', value: '入门款', blower: '涡轮 / 工作站向' };

    box.innerHTML =
      '<dl class="kv">' +
      '<dt>显存</dt><dd>' + esc(g.memory) + '</dd>' +
      '<dt>总线</dt><dd>' + esc(g.pcie) + '</dd>' +
      '<dt>供电接口</dt><dd>' + esc(a ? a.connector : g.connector) + '</dd>' +
      (a ? '<dt>板型 / 定位</dt><dd>' + esc(a.vendor + ' ' + a.series) + ' ' + esc(cnLabel(a)) +
           ' · ' + (tierCn[a.tier] || a.tier) + '</dd>' : '') +
      (a && a.cnType === 'colloquial'
        ? '<dt>中文名性质</dt><dd style="color:var(--warn)">玩家俗称，厂商官方不使用该名称</dd>' : '') +
      (a && a.cnType === 'unverified'
        ? '<dt>中文名性质</dt><dd style="color:var(--warn)">未核实（按中文媒体/玩家习惯整理）</dd>' : '') +
      (a ? '<dt>尺寸 / 厚度</dt><dd>' + a.length + 'mm · ' + a.slots + ' 槽' +
           (a.liquid ? ' · 水冷（' + (a.radiator || 360) + 'mm 冷排）' : '') + '</dd>' : '') +
      (a ? '<dt>AIC 超频策略</dt><dd>' + ({ aggressive: '激进', moderate: '中性', conservative: '保守' }[a.ocBias] || '—') + '</dd>' : '') +
      '<dt>瞬时峰值倍率</dt><dd>×' + g.transient + '</dd>' +
      '<dt>本次计算取值</dt><dd style="color:var(--accent);font-weight:700">' + used + ' W</dd>' +
      '</dl>' +
      (a && a.recPsu ? '<div class="note accent" style="margin-top:9px">厂商建议整机电源：<b>' +
        a.recPsu + 'W</b>（针对整机全超频场景）</div>' : '') +
      (a && a.generated
        ? '<div class="note warn" style="margin-top:9px"><b>规则生成条目：</b>' +
          esc(a.note) + '<br>该型号未收录厂商实测功耗墙，数值由系列定位推算，仅用于电源容量估算。</div>'
        : '') +
      ((a && a.note && !a.generated) || g.note
        ? '<div class="note" style="margin-top:9px">' + esc((a && a.note && !a.generated) ? a.note : g.note) + '</div>'
        : '') +
      '<div class="note" style="margin-top:9px">来源：' +
        (a && a.generated ? '按系列定位规则推算（公版数据来源：' + srcLink(g.source) + '）'
                          : srcLink(a ? a.source : g.source)) + ' ' +
        confBadge(a ? a.confidence : g.confidence) + '</div>';
  }

  function renderMoboInfo() {
    var m = DB.motherboards.filter(function (x) { return x.id === S.moboId; })[0];
    var box = $('moboInfo');
    if (!m) { box.innerHTML = ''; return; }
    box.innerHTML = '<dl class="kv">' +
      '<dt>芯片组 / 插槽</dt><dd>' + esc(m.chipset) + ' · ' + esc(m.socket) + '</dd>' +
      '<dt>板型</dt><dd>' + esc(m.formFactor) + '</dd>' +
      '<dt>供电相数</dt><dd>' + esc(m.vrm) + '</dd>' +
      '<dt>内存</dt><dd>' + esc(m.ramType) + ' × ' + m.ramSlots + ' 槽，最高 ' + m.maxRam + 'GB</dd>' +
      '<dt>M.2 插槽</dt><dd>' + m.m2Slots + ' 个（Gen5 × ' + m.m2Gen5 + '）</dd>' +
      '<dt>主板自身功耗</dt><dd>' + m.watts + ' W</dd>' +
      '</dl>' +
      '<div class="note" style="margin-top:9px">来源：' + srcLink(m.source) + ' ' + confBadge(m.confidence) + '</div>';
  }

  function renderRamInfo() {
    var r = DB.ram.filter(function (x) { return x.id === S.ramId; })[0];
    var box = $('ramInfo');
    if (!r) { box.innerHTML = ''; return; }
    var sticks = r.sticks * S.ramKits;
    box.innerHTML = '<dl class="kv">' +
      '<dt>总容量</dt><dd>' + (r.capacityPerStick * sticks) + ' GB（' + sticks + ' 条）</dd>' +
      '<dt>频率</dt><dd>DDR5-' + r.speed + '</dd>' +
      '<dt>灯效</dt><dd>' + (r.rgb ? 'RGB' : '无') + '</dd>' +
      '<dt>内存功耗</dt><dd>' + (r.wattsPerStick * sticks).toFixed(1) + ' W</dd>' +
      '</dl>' +
      (r.note ? '<div class="note" style="margin-top:9px">' + esc(r.note) + '</div>' : '');
  }

  function renderCoolerInfo() {
    var c = DB.coolers.filter(function (x) { return x.id === S.coolerId; })[0];
    var box = $('coolerInfo');
    if (!c) { box.innerHTML = ''; return; }
    var w = c.pumpWatts + c.wattPerFan * c.fanCount;
    box.innerHTML = '<dl class="kv">' +
      '<dt>类型</dt><dd>' + (c.kind === 'AIO' ? '一体式水冷 ' + c.radiator + 'mm' : '风冷') + '</dd>' +
      '<dt>支持插槽</dt><dd>' + esc(c.sockets.join(' / ')) + '</dd>' +
      '<dt>散热器功耗</dt><dd>' + w.toFixed(1) + ' W</dd>' +
      '</dl>';
  }

  function renderCaseInfo() {
    var c = DB.cases.filter(function (x) { return x.id === S.caseId; })[0];
    var box = $('caseInfo');
    if (!c) { box.innerHTML = ''; return; }
    box.innerHTML = '<dl class="kv">' +
      '<dt>支持板型</dt><dd>' + esc(c.moboSupport.join(' / ')) + '</dd>' +
      '<dt>显卡限长</dt><dd>' + c.gpuMaxLen + ' mm</dd>' +
      '<dt>电源规格</dt><dd>' + esc(c.psuFormFactor.join(' / ')) + '</dd>' +
      '<dt>垂直显卡</dt><dd>' + (c.verticalGpu ? '支持' : '不支持') + '</dd>' +
      '<dt>冷排支持</dt><dd>' + esc(c.radiatorSupport) + '</dd>' +
      '</dl>';
  }

  function renderPsuInfo() {
    var box = $('psuInfo');
    var r = lastResult;
    if (!r || !r.existingPsu) { box.innerHTML = ''; return; }
    var p = r.existingPsu.psu;
    var lv = r.existingPsu.level === 'error' ? 'error' : (r.existingPsu.level === 'warn' ? 'warn' : 'ok');
    box.innerHTML = '<div class="issue ' + lv + '">' +
      '<span class="ico">' + (lv === 'ok' ? SVG.ok : (lv === 'error' ? SVG.error : SVG.warn)) + '</span>' +
      '<div><b>负载率 ' + r.existingPsu.utilization + '%（规划功耗 / 额定瓦数）</b>' +
      '<div class="d">' + esc(r.existingPsu.verdict) + '</div>' +
      '<div class="d">场景预期负载率 ' + r.existingPsu.utilizationExpected + '%（' +
        esc(r.scenarioInfo.label) + '）</div></div></div>' +
      '<dl class="kv" style="margin-top:9px">' +
      '<dt>效率认证</dt><dd>' + esc(p.efficiency) + '</dd>' +
      '<dt>规范</dt><dd>' + esc(p.atx) + '</dd>' +
      '<dt>12V-2x6 接口</dt><dd>' + p.conn12v2x6 + ' 个</dd>' +
      '<dt>PCIe 8pin 接口</dt><dd>' + p.pcie8pin + ' 个</dd>' +
      '<dt>CPU 8pin 接口</dt><dd>' + p.eps8pin + ' 个</dd>' +
      '</dl>';
  }

  /* ==================================================== 结果列渲染 === */

  function renderResults() {
    var cfg = {
      cpuId: S.cpuId, cpuOc: S.cpuOc, cpuCustomWatts: parseFloat(S.cpuCustomW) || null,
      gpuId: S.gpuCustomName && !S.gpuAibId ? '' : S.gpuId,
      gpuAibId: S.gpuAibId,
      gpuName: S.gpuCustomName, gpuCustomWatts: parseFloat(S.gpuCustomW) || null,
      moboId: S.moboId, ramId: S.ramId, ramKits: S.ramKits,
      storage: S.storage.filter(function (s) { return s.qty > 0; }),
      coolerId: S.coolerId, fanId: S.fanId, fanQty: S.fanQty,
      caseId: S.caseId, argbChannels: S.argbChannels, extras: S.extras,
      otherCustom: S.customItems.filter(function (c) { return c.label && c.watts > 0; }),
      psuId: S.psuId, scenario: S.scenario, overclock: S.cpuOc || S.gpuOc
    };

    // 未收录显卡：优先用自定义名称/功耗
    if (S.gpuCustomName && parseFloat(S.gpuCustomW)) { cfg.gpuId = ''; cfg.gpuAibId = ''; }

    var r = EN.calculate(cfg);
    lastResult = r;

    /* --- 核心数字 --- */
    // 空态一律显示 "—" 而不是 "0 W"：0 是一个断言（"这套配置耗 0 瓦"），
    // 而 "—" 是占位（"还不知道"）。用 0 会让首屏看起来像算错了。
    var EMPTY = '—';
    $('heroPower').innerHTML = r.hasSelection
      ? r.subtotal + '<small> W</small>' : EMPTY + '<small> W</small>';
    $('heroExpected').innerHTML = r.hasSelection
      ? r.expected + '<small> W</small>' : EMPTY + '<small> W</small>';
    $('heroTransient').innerHTML = r.hasSelection
      ? r.transient + '<small> W</small>' : EMPTY + '<small> W</small>';
    // 面向非专业用户：先说"这个数是干什么用的"，再给计算依据
    $('heroPowerNote').textContent = '所有硬件同时吃满电的总和 —— 电源至少要扛得住这个数';
    $('heroExpectedNote').textContent = '你日常实际大概会用掉这么多（' + r.scenarioInfo.label + '）';
    $('heroTransientNote').textContent = r.gpuWatts > 0
      ? '显卡在极短一瞬间能拉到的最高值；杂牌电源扛不住这种冲击，会死机重启'
      : '机械硬盘启动瞬间的额外功耗';

    /* --- 电源推荐 --- */
    if (!r.hasSelection) {
      // 空态：不给数字、不给结论、不给推荐，只说明下一步做什么
      $('recoBig').innerHTML = EMPTY + '<span> W</span>';
      $('recoSub').textContent = '尚未选择硬件';
      $('recoMeta').innerHTML = '';
    } else {
      var sameW = r.recFloor === r.recIdeal;
      $('recoBig').innerHTML = sameW
        ? r.recIdeal + '<span> W</span>'
        : r.recFloor + '–' + r.recIdeal + '<span> W</span>';
      // 结论先行：直接告诉用户"买多大"，再附上计算依据
      $('recoSub').innerHTML = sameW
        ? '买 <b>' + r.recIdeal + 'W</b> 的电源即可。' +
          '<span style="opacity:.75">（依据：硬件满载 ' + r.subtotal + 'W × 1.30 = ' +
          Math.round(r.subtotal * 1.30) + 'W，× ' + r.redundancy.toFixed(2) + ' = ' +
          Math.round(r.subtotal * r.redundancy) + 'W）</span>'
        : '推荐买 <b>' + r.recIdeal + 'W</b>；预算紧张时最低不要低于 <b>' + r.recFloor + 'W</b>。' +
          '<span style="opacity:.75">（依据：硬件满载 ' + r.subtotal + 'W ×' + r.redundancy.toFixed(2) +
          ' = ' + Math.round(r.subtotal * r.redundancy) + 'W；下限 ×1.30 = ' +
          Math.round(r.subtotal * 1.30) + 'W）</span>';
      $('recoMeta').innerHTML =
        '<span class="tag on">ATX 3.1</span>' +
        '<span class="tag blue">原生 12V-2x6</span>' +
        '<span class="tag">80 PLUS 金牌及以上</span>' +
        '<span class="tag">冗余 ' + Math.round((r.redundancy - 1) * 100) + '%</span>' +
        (r.picks.need12v2x6 ? '<span class="tag warn">需 12V-2x6 接口</span>' : '') +
        (r.picks.need8pin ? '<span class="tag warn">需 ' + r.picks.need8pin + '× PCIe 8pin</span>' : '');
    }

    /* --- 三档推荐 --- */
    renderPicks(r);

    /* --- 问题列表 --- */
    renderIssues(r);

    /* --- 顶栏答案筹码 ---
       顶栏是 sticky 的，所以这是「任何滚动位置都能看到推荐瓦数」的实现。
       窄屏另有底部常驻条（ui.js 维护），两者数值同源。 */
    var chip = $('answerChip');
    if (chip) {
      if (!r.hasSelection) {
        chip.hidden = true;
      } else {
        chip.hidden = false;
        $('answerChipValue').textContent = (r.recFloor === r.recIdeal)
          ? r.recIdeal + ' W'
          : r.recFloor + '–' + r.recIdeal + ' W';
        var nErr = r.issues.filter(function (i) { return i.level === 'error'; }).length;
        var nWarn = r.issues.filter(function (i) { return i.level === 'warn'; }).length;
        var ib = $('answerChipIssues');
        ib.textContent = nErr ? nErr + ' 错误' : (nWarn ? nWarn + ' 警告' : '');
        ib.className = 'ac-issues' + (nErr ? ' has-error' : '');
      }
    }

    /* --- 升级空间 --- */
    renderUpgrade(r);

    /* --- 明细表 --- */
    renderDetail(r);

    /* --- 预算建议 --- */
    renderAdvice(r);

    /* --- 已有电源 --- */
    renderPsuInfo();

    /* --- 打印元信息 --- */
    $('printMeta').textContent = '生成时间 ' + new Date().toLocaleString('zh-CN') +
      ' · 数据版本 ' + DB.meta.version +
      (r.hasSelection
        ? ' · 规划功耗 ' + r.subtotal + 'W · 推荐电源 ' +
          (r.recFloor === r.recIdeal ? r.recIdeal : r.recFloor + '–' + r.recIdeal) + 'W'
        : ' · 未选择硬件');
  }

  function renderPicks(r) {
    var roles = [
      { k: 'value', label: '性价比之选' },
      { k: 'balanced', label: '均衡之选' },
      { k: 'flagship', label: '旗舰之选' }
    ];
    var box = $('psuPicks');

    // 空态：不推荐任何电源
    if (!r.hasSelection) {
      box.innerHTML = '<div class="empty">选好硬件后，这里会列出三档推荐电源</div>';
      $('psuPickHint').textContent = '';
      $('psuPickNote').innerHTML = '';
      return;
    }
    if (!r.picks.value && !r.picks.balanced && !r.picks.flagship) {
      box.innerHTML = '<div class="empty">没有满足接口与瓦数要求的电源型号</div>';
      $('psuPickHint').textContent = '';
      $('psuPickNote').innerHTML = '';
      return;
    }
    box.innerHTML = roles.map(function (role) {
      var p = r.picks[role.k];
      if (!p) return '<div class="psu-pick"><div class="role">' + role.label + '</div>' +
                     '<div class="sp">无满足条件的型号</div></div>';
      return '<div class="psu-pick">' +
        '<div class="role">' + role.label + '</div>' +
        '<div class="nm">' + esc(p.brand) + '<br>' + esc(p.model) + '</div>' +
        '<div class="w">' + p.watts + ' W</div>' +
        '<div class="sp">' + esc(p.efficiency) + ' · ' + esc(p.atx) + ' · ' + esc(p.modular) + '</div>' +
        '<div class="sp">12V-2x6 ×' + p.conn12v2x6 + ' · PCIe 8pin ×' + p.pcie8pin +
          ' · CPU 8pin ×' + p.eps8pin + '</div>' +
        '<div class="sp">负载率 ' + Math.round(r.subtotal / p.watts * 100) + '%</div>' +
        '<div class="pr">参考价 ¥' + p.price + '</div>' +
        '</div>';
    }).join('');

    $('psuPickHint').textContent = r.picks.distinctCount + ' 款不同型号';

    var notes = [];
    if (r.picks.distinctCount <= 1 && r.recFloor >= 1200) {
      notes.push('该功率段（≥' + r.recFloor + 'W）的 ATX 3.1 电源在市场上本身就集中在旗舰价位，可选型号较少，属正常现象。');
    }
    if (r.picks.belowFloor && r.picks.belowFloor.length) {
      notes.push('若预算紧张，以下型号接口兼容但<b>低于安全下限</b>，仅列出供参考，不建议长期满载使用：' +
        r.picks.belowFloor.map(function (p) { return esc(p.brand + ' ' + p.model + '（' + p.watts + 'W）'); }).join('、'));
    }
    if (r.picks.filteredByCase) {
      notes.push('已按所选机箱的电源规格（' + esc((DB.cases.filter(function (c) { return c.id === S.caseId; })[0] || {}).psuFormFactor || '') + '）过滤不兼容型号。');
    }
    notes.push('推荐逻辑：' + r.reasons.map(esc).join('；') + '。');
    $('psuPickNote').innerHTML = notes.map(function (n) {
      return '<div class="note" style="margin-top:8px">' + n + '</div>';
    }).join('');
  }

  function renderIssues(r) {
    var box = $('issues');
    var icons = { error: SVG.error, warn: SVG.warn, info: SVG.info, ok: SVG.ok };
    var order = { error: 0, warn: 1, info: 2, ok: 3 };
    var list = r.issues.slice().sort(function (a, b) { return order[a.level] - order[b.level]; });

    $('issueCount').textContent = list.length
      ? list.filter(function (i) { return i.level === 'error'; }).length + ' 错误 / ' +
        list.filter(function (i) { return i.level === 'warn'; }).length + ' 警告'
      : '';

    // 空态必须走中性态，绝不能打绿勾。
    // 「什么都没选」时 issues 天然为空，若照常输出「未检测到兼容性问题 · 均匹配」，
    // 就等于在没有任何输入的情况下宣称校验通过 —— 这是最伤可信度的写法。
    if (!r.hasSelection) {
      box.innerHTML = '<div class="issue info"><span class="ico">i</span><div>' +
        '<b>尚未选择硬件</b>' +
        '<div class="d">选好 CPU、显卡、主板后，这里会列出兼容性检查结果。</div>' +
        '</div></div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="issue ok"><span class="ico">' + SVG.ok + '</span><div>' +
        '<b>未检测到兼容性问题</b><div class="d">所选硬件组合的插槽、板型、尺寸、供电接口与内存规格均匹配。</div>' +
        '</div></div>';
      return;
    }
    box.innerHTML = list.map(function (i) {
      return '<div class="issue ' + i.level + '">' +
        '<span class="ico">' + (icons[i.level] || '·') + '</span>' +
        '<div><b>' + esc(i.title) + '</b>' +
        '<div class="d">' + esc(i.detail) + '</div>' +
        (i.fix ? '<div class="f">→ ' + esc(i.fix) + '</div>' : '') +
        '</div></div>';
    }).join('');
  }

  function renderUpgrade(r) {
    var box = $('upgradeBox');
    if (!r.upgrade) { box.innerHTML = '<div class="empty">选好硬件后才能推演升级空间</div>'; return; }
    var u = r.upgrade;
    box.innerHTML =
      '<dl class="kv">' +
      '<dt>电源余量</dt><dd style="color:var(--accent);font-weight:700">' + u.headroomWatts + ' W（' + u.headroomPct + '%）</dd>' +
      '<dt>可承受显卡 TBP</dt><dd>' + u.gpuBudget + ' W</dd>' +
      '<dt>最高可升级至</dt><dd>' + esc(u.maxGpu || '无明显升级空间') + '</dd>' +
      '</dl>' +
      '<div class="note accent" style="margin-top:10px">' + esc(u.note) + '</div>' +
      '<div class="note" style="margin-top:8px">' +
      '若计划 2-3 年内升级显卡，建议现在直接选择更大瓦数：电源的贬值速度远低于显卡，' +
      '而"电源不够用"只能整套更换。本次推荐为 ' + r.recFloor + '~' + r.recIdeal + 'W。</div>';
  }

  function renderDetail(r) {
    var t = $('detailTable');
    if (!r.items.length) { t.innerHTML = '<tr><td class="empty">尚无已选硬件</td></tr>'; return; }

    var rows = [], lastGroup = null;
    r.items.forEach(function (it) {
      if (it.group !== lastGroup) {
        rows.push('<tr><td colspan="3" class="grp">' + esc(it.group) + '</td></tr>');
        lastGroup = it.group;
      }
      rows.push('<tr' + (it.highlight ? ' class="hl"' : '') + '>' +
        '<td><span class="nm">' + esc(it.label) + '</span>' +
          (it.name ? ' <span class="dt">' + esc(it.name) + '</span>' : '') +
          confBadge(it.confidence) +
          (it.detail ? '<div class="dt">' + esc(it.detail) + '</div>' : '') +
        '</td>' +
        '<td class="dt">' + (it.source ? srcLink(it.source) : '估算值') + '</td>' +
        '<td class="wt">' + it.watts + ' W</td></tr>');
    });

    rows.push('<tr class="sum"><td>规划功耗合计（峰值）</td><td class="dt">各部件功耗上限之和</td>' +
      '<td class="wt">' + r.subtotal + ' W</td></tr>');
    rows.push('<tr class="sum"><td>场景预期功耗</td><td class="dt">× ' + r.scenarioInfo.factor.toFixed(2) +
      '（' + esc(r.scenarioInfo.label) + '）</td><td class="wt">' + r.expected + ' W</td></tr>');
    rows.push('<tr class="sum"><td>瞬时峰值（估算）</td><td class="dt">含显卡功率尖峰与硬盘启动</td>' +
      '<td class="wt">' + r.transient + ' W</td></tr>');
    rows.push('<tr class="sum"><td>推荐电源</td><td class="dt">安全下限 ×1.30 ~ 推荐目标 ×' +
      r.redundancy.toFixed(2) + '</td><td class="wt">' + r.recFloor + '~' + r.recIdeal + ' W</td></tr>');

    t.innerHTML = '<thead><tr><th>部件</th><th>数据来源</th><th style="text-align:right">功耗</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody>';
  }

  function renderAdvice(r) {
    var budget = parseFloat($('budgetInput').value) || 0;
    var adv = EN.advise({
      cpuId: S.cpuId, cpuOc: S.cpuOc, cpuCustomWatts: parseFloat(S.cpuCustomW) || null,
      gpuId: S.gpuCustomName && parseFloat(S.gpuCustomW) ? '' : S.gpuId,
      gpuAibId: S.gpuAibId, gpuName: S.gpuCustomName, gpuCustomWatts: parseFloat(S.gpuCustomW) || null,
      moboId: S.moboId, ramId: S.ramId, ramKits: S.ramKits,
      storage: S.storage, coolerId: S.coolerId, fanId: S.fanId, fanQty: S.fanQty,
      caseId: S.caseId, argbChannels: S.argbChannels, extras: S.extras,
      otherCustom: S.customItems, psuId: S.psuId, scenario: S.scenario,
      overclock: S.cpuOc || S.gpuOc
    }, budget);

    var box = $('adviceBox');
    if (!adv.tips.length) { box.innerHTML = '<div class="empty">选好硬件后才能给出平衡建议</div>'; return; }
    box.innerHTML = adv.tips.map(function (t) {
      return '<div class="issue ' + t.level + '">' +
        '<span class="ico">' + ({ info: SVG.info, warn: SVG.warn, ok: SVG.ok }[t.level] || '·') + '</span>' +
        '<div><b>' + esc(t.title) + '</b>' +
        '<div class="d">' + esc(t.detail) + '</div>' +
        (t.note ? '<div class="f">' + esc(t.note) + '</div>' : '') + '</div></div>';
    }).join('');
  }

  /* ============================================================ 主渲染 = */
  function render() {
    try {
      refreshCpuCascade();
      refreshGpuCascade();
      refreshStorage();
      refreshCustomItems();
      refreshRamFit();

      // 场景按钮态
      $('scenarios').querySelectorAll('.scenario').forEach(function (b) {
        b.classList.toggle('on', b.dataset.sc === S.scenario);
      });
      $('scenarioNote').innerHTML = '<b>' + esc(EN.SCENARIOS[S.scenario].label) + '：</b>' +
        esc(EN.SCENARIOS[S.scenario].desc) + '。负载系数 ' + EN.SCENARIOS[S.scenario].factor.toFixed(2) +
        ' 用于折算"场景预期功耗"；冗余系数 ' + EN.SCENARIOS[S.scenario].redundancy.toFixed(2) +
        ' 用于计算推荐电源瓦数。';

      renderCpuInfo();
      renderGpuInfo();
      renderMoboInfo();
      renderRamInfo();
      renderCoolerInfo();
      renderCaseInfo();
      renderResults();
      save();
    } catch (e) { errMsg(e); }
  }

  /* ============================================================ 导出 === */
  function buildReportRows() {
    var r = lastResult;
    if (!r) return [];
    var rows = [];
    rows.push(['整机功耗与电源选型报告']);
    rows.push(['生成时间', new Date().toLocaleString('zh-CN')]);
    rows.push(['数据版本', DB.meta.version + '（更新于 ' + DB.meta.updated + '）']);
    rows.push(['使用场景', r.scenarioInfo.label + '（负载系数 ' + r.scenarioInfo.factor + '，冗余系数 ' + r.redundancy.toFixed(2) + '）']);
    rows.push([]);
    rows.push(['—— 汇总 ——']);
    rows.push(['规划功耗（峰值合计）', r.subtotal + ' W']);
    rows.push(['场景预期功耗', r.expected + ' W']);
    rows.push(['瞬时峰值（估算）', r.transient + ' W']);
    rows.push(['推荐电源（安全下限）', r.recFloor + ' W']);
    rows.push(['推荐电源（推荐目标）', r.recIdeal + ' W']);
    rows.push(['总价参考', '¥' + r.totalPrice]);
    rows.push([]);
    rows.push(['—— 计算逻辑 ——']);
    r.reasons.forEach(function (x) { rows.push([x]); });
    rows.push([]);
    rows.push(['—— 功耗明细 ——']);
    rows.push(['分组', '部件', '型号', '标称/说明', '功耗(W)', '置信度', '数据来源']);
    r.items.forEach(function (it) {
      var src = it.source && DB.sources[it.source] ? DB.sources[it.source].label + ' ' + DB.sources[it.source].url : '估算值';
      rows.push([it.group, it.label, it.name || '', it.detail || '', it.watts, it.confidence || '', src]);
    });
    rows.push(['', '合计', '', '规划功耗（峰值）', r.subtotal, '', '']);
    rows.push([]);
    rows.push(['—— 电源推荐方案 ——']);
    rows.push(['定位', '品牌', '型号', '瓦数', '认证', '规范', '12V-2x6', 'PCIe 8pin', 'CPU 8pin', '参考价', '负载率']);
    [['性价比之选', r.picks.value], ['均衡之选', r.picks.balanced], ['旗舰之选', r.picks.flagship]]
      .forEach(function (pair) {
        var p = pair[1];
        if (!p) return;
        rows.push([pair[0], p.brand, p.model, p.watts, p.efficiency, p.atx,
                   p.conn12v2x6, p.pcie8pin, p.eps8pin, '¥' + p.price,
                   Math.round(r.subtotal / p.watts * 100) + '%']);
      });
    rows.push([]);
    rows.push(['—— 兼容性与风险提示 ——']);
    if (!r.issues.length) {
      rows.push([r.hasSelection ? '未检测到兼容性问题' : '尚未选择硬件，无可校验项']);
    }
    r.issues.forEach(function (i) {
      rows.push([i.level, i.title, i.detail, i.fix || '']);
    });
    rows.push([]);
    rows.push(['—— 未来升级空间 ——']);
    if (r.upgrade) {
      rows.push(['电源余量', r.upgrade.headroomWatts + ' W（' + r.upgrade.headroomPct + '%）']);
      rows.push(['可承受显卡 TBP', r.upgrade.gpuBudget + ' W']);
      rows.push(['最高可升级至', r.upgrade.maxGpu || '无明显升级空间']);
      rows.push([r.upgrade.note]);
    }
    rows.push([]);
    rows.push(['—— 数据来源 ——']);
    Object.keys(DB.sources).forEach(function (k) {
      rows.push([DB.sources[k].label, DB.sources[k].url]);
    });
    rows.push([]);
    rows.push(['免责声明', '本结果为基于公开数据的估算，真实功耗取决于软件负载、BIOS 功耗墙设置与环境温度。']);
    rows.push(['', '标为"未发布"的硬件规格来自泄露信息，不可作为购买决策依据。']);
    return rows;
  }

  function download(filename, content, mime) {
    var blob = new Blob(['\uFEFF' + content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    if (!lastResult) return;
    var rows = buildReportRows();
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var stamp = new Date().toISOString().slice(0, 10);
    download('整机功耗报告_' + stamp + '.csv', csv, 'text/csv;charset=utf-8');
    toast('已导出 CSV，可直接用 Excel 打开');
  }

  function exportJson() {
    var data = {
      exportedAt: new Date().toISOString(),
      dbVersion: DB.meta.version,
      config: S,
      result: lastResult ? {
        subtotal: lastResult.subtotal, expected: lastResult.expected,
        transient: lastResult.transient,
        recFloor: lastResult.recFloor, recIdeal: lastResult.recIdeal,
        redundancy: lastResult.redundancy
      } : null
    };
    download('配置_' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    toast('已导出配置 JSON');
  }

  /* ========================================================== 反馈 ==== */
  function renderFeedback() {
    var box = $('fbList');
    if (!feedback.length) {
      box.innerHTML = '<div class="note">待提交列表为空。发现数据库里没有的型号时，填在上方点「加入待提交列表」。</div>';
      return;
    }
    box.innerHTML = '<table class="detail"><thead><tr><th>类别</th><th>型号</th><th>功耗</th><th>备注</th><th></th></tr></thead><tbody>' +
      feedback.map(function (f, i) {
        return '<tr><td>' + esc(f.type) + '</td><td class="nm">' + esc(f.name) + '</td>' +
          '<td class="wt">' + (f.watts || '—') + '</td><td class="dt">' + esc(f.note || '') + '</td>' +
          '<td><button class="del" data-fd="' + i + '">×</button></td></tr>';
      }).join('') + '</tbody></table>';
    box.querySelectorAll('[data-fd]').forEach(function (el) {
      el.addEventListener('click', function () { feedback.splice(+el.dataset.fd, 1); renderFeedback(); save(); });
    });
  }

  function initFeedback() {
    $('fbAdd').addEventListener('click', function () {
      var name = $('fbName').value.trim();
      if (!name) { toast('请填写型号名称', true); return; }
      feedback.push({
        type: $('fbType').value, name: name,
        watts: parseFloat($('fbWatts').value) || null,
        note: $('fbNote').value.trim(), at: new Date().toISOString()
      });
      $('fbName').value = ''; $('fbWatts').value = ''; $('fbNote').value = '';
      renderFeedback(); save();
      toast('已加入待提交列表');
    });
    $('fbCopy').addEventListener('click', function () {
      if (!feedback.length) { toast('待提交列表为空', true); return; }
      var text = JSON.stringify({ dbVersion: DB.meta.version, submissions: feedback }, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); },
          function () { download('硬件反馈.json', text, 'application/json'); });
      } else {
        download('硬件反馈.json', text, 'application/json');
        toast('已下载 JSON 文件');
      }
    });
  }

  /* ======================================================== 持久化 ==== */
  var LS_KEY = 'psu-calc-2026-v1';

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ s: S, feedback: feedback }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d && d.s) {
        Object.keys(S).forEach(function (k) { if (d.s[k] !== undefined) S[k] = d.s[k]; });
        feedback = d.feedback || [];
        return true;
      }
    } catch (e) { /* 忽略损坏数据 */ }
    return false;
  }

  function syncInputsFromState() {
    $('cpuOc').checked = S.cpuOc;
    $('cpuCustomW').value = S.cpuCustomW || '';
    $('gpuOc').checked = S.gpuOc;
    $('gpuCustomName').value = S.gpuCustomName || '';
    $('gpuCustomW').value = S.gpuCustomW || '';
    $('ramKits').value = S.ramKits || 1;
    $('fanQty').value = S.fanQty || 0;
    $('argbChannels').value = S.argbChannels || 0;
    $('psuSelect').value = S.psuId || '';
    $('moboSelect').value = S.moboId || '';
    $('ramSelect').value = S.ramId || '';
    $('coolerSelect').value = S.coolerId || '';
    $('fanSelect').value = S.fanId || '';
    $('caseSelect').value = S.caseId || '';
    $('cpuSelect').value = S.cpuId || '';
    $('budgetInput').value = S.budget || '';
    // 复选类扩展设备
    $('extrasGrid').querySelectorAll('[data-x]').forEach(function (el) {
      var on = S.extras && S.extras[el.dataset.x] != null;
      el.checked = !!on;
      if (on) {
        var q = $('extrasGrid').querySelector('[data-xq="' + el.dataset.x + '"]');
        if (q) q.value = S.extras[el.dataset.x];
      }
    });
  }

  /* ============================================================ 提示 == */
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (isErr ? ' err' : ''); }, 2400);
  }

  /* ============================================================ 预设 == */
  var PRESETS = {
    flagship: {
      scenario: 'gaming', cpuId: 'cu7-270kp', cpuOc: false, gpuBrand: 'NVIDIA',
      gpuId: 'rtx5090', gpuAibId: 'asus-astral-5090', moboId: 'asus-z890-hero',
      ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
      storage: [{ id: 'ssd-9100pro-2t', qty: 1 }, { id: 'hdd-exos-20t', qty: 1 }],
      coolerId: 'aio-frozen-warframe-360', fanId: 'fan-tlc12cs', fanQty: 3,
      caseId: 'case-o11d-evo', argbChannels: 1, extras: { 'x-usb-dev': 4 }, psuId: ''
    },
    amd: {
      scenario: 'gaming', cpuId: 'r9-9950x3d2', cpuOc: false, gpuBrand: 'AMD',
      gpuId: 'rx9070xt', gpuAibId: 'powercolor-reddevil-9070xt', moboId: 'msi-b850-tomahawk',
      ramId: 'ddr5-6000-32x2-gskill', ramKits: 1,
      storage: [{ id: 'ssd-tipro9000-2t', qty: 1 }],
      coolerId: 'aio-galahad-ii-360', fanId: 'fan-arctic-p14', fanQty: 4,
      caseId: 'case-p500a', argbChannels: 0, extras: {}, psuId: ''
    },
    creator: {
      scenario: 'creator', cpuId: 'r9-9950x3d2', cpuOc: false, gpuBrand: 'NVIDIA',
      gpuId: 'rtx5080', gpuAibId: 'msi-suprim-5080', moboId: 'gigabyte-x870e-master',
      ramId: 'ddr5-6000-48x2-gskill', ramKits: 2,
      storage: [{ id: 'ssd-9100pro-4t', qty: 2 }, { id: 'hdd-wd-gold-22t', qty: 2 }],
      coolerId: 'aio-ryujin-iii-360', fanId: 'fan-unifan-sl-inf', fanQty: 6,
      caseId: 'case-masterframe-600', argbChannels: 2, extras: { 'x-capture': 1, 'x-usb-dev': 6 }, psuId: ''
    },
    office: {
      scenario: 'office', cpuId: 'r5-9600x', cpuOc: false, gpuBrand: '__igpu__',
      gpuId: '__igpu__', gpuAibId: '', moboId: 'asus-b850-plus',
      ramId: 'ddr5-6000-16x2-kf', ramKits: 1,
      storage: [{ id: 'ssd-990pro-2t', qty: 1 }, { id: 'ssd-870evo-4t', qty: 1 }],
      coolerId: 'air-pa120-se', fanId: 'fan-nfa12x25', fanQty: 2,
      caseId: 'case-inwin-a5', argbChannels: 0, extras: { 'x-usb-dev': 3 }, psuId: ''
    },
    future: {
      scenario: 'gaming', cpuId: 'cu7-270kp', cpuOc: false, gpuBrand: 'NVIDIA',
      gpuId: 'rtx5080super', gpuAibId: 'asus-tuf-5080super', moboId: 'asus-z890-hero',
      ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
      storage: [{ id: 'ssd-9100pro-2t', qty: 1 }],
      coolerId: 'aio-kraken-elite-360', fanId: 'fan-tlc12cs', fanQty: 3,
      caseId: 'case-o11-vision', argbChannels: 1, extras: {}, psuId: ''
    }
  };

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    S.cpuCustomW = ''; S.gpuCustomName = ''; S.gpuCustomW = ''; S.customItems = [];
    Object.keys(p).forEach(function (k) { S[k] = p[k]; });
    /* 预设会把筛选器彻底重置：示例里可能是 AMD 的 U 配 NVIDIA 的卡，
       如果留着用户上一次的「Intel / GTX 10 系」筛选，型号下拉里
       根本看不到刚载入的那颗 CPU / 那块卡。 */
    normalizeCpuFilter();
    normalizeGpuFilter();
    syncInputsFromState();
    render();
    toast('已载入示例配置：' + name);
  }

  /* ============================================================ 启动 == */
  function boot() {
    try {
      initMeta();
      initScenarios();
      initCpu();
      initGpu();
      initMobo();
      initRam();
      initStorage();
      initCooling();
      initCase();
      initExtras();
      initPsu();
      initFeedback();

      /* 首访渲染「空配置」，不静默灌入任何预设。
         以前这里写的是 if (!restored) applyPresetSilent('flagship')，
         结果是新用户第一眼看到的是别人机器的 RTX 5090 配置和 1200W 推荐值，
         而顶栏还摆着「载入示例配置」按钮 —— 状态与按钮自相矛盾，
         也违背「结论必须来自用户自己的输入」这一前提。
         现在：localStorage 有记录才恢复，否则就是干净的空态，
         示例配置改由 #btnQuickStart 显式载入。 */
      load();
      /* 从 localStorage 恢复出来的「筛选器 + 型号」可能对不上
         （比如上次是 Intel 12 代，这次数据库升版后那颗 CPU 改了世代）。
         修正只做这一次，交互期间不再插手，否则筛选器会按不动。 */
      normalizeCpuFilter();
      normalizeGpuFilter();
      syncInputsFromState();
      renderFeedback();
      render();

      /* ------------------------------------------------ 新手引导 ---- */
      var GUIDE_KEY = LS_KEY + '-guide-hidden';
      var guide = $('guideCard');
      try { if (localStorage.getItem(GUIDE_KEY) === '1') guide.style.display = 'none'; } catch (e) {}

      $('btnHideGuide').addEventListener('click', function () {
        guide.style.display = 'none';
        try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
      });

      /* 显式载入示例：循环切换几种有代表性的配置 */
      var quickKeys = ['flagship', 'amd', 'creator', 'office'];
      var quickLabels = {
        flagship: '高端游戏主机',
        amd: 'AMD 游戏机',
        creator: '创作工作站',
        office: '办公机'
      };
      var qi = 0;
      $('btnQuickStart').addEventListener('click', function () {
        var k = quickKeys[qi % quickKeys.length];
        applyPreset(k);
        qi++;
        // 不带括号嵌套，避免出现「换个示例（AMD 平台游戏机（RX 9070 XT））」
        this.textContent = '换个示例：' + quickLabels[quickKeys[qi % quickKeys.length]];
      });

      $('btnReset').addEventListener('click', function () {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        location.reload();
      });

      /* 主题切换：图标 + 文字两个部分，文字在 .theme-label 里 */
      var themeBtn = $('btnTheme');
      function paintThemeBtn(theme) {
        var lab = themeBtn.querySelector('.theme-label');
        if (lab) lab.textContent = theme === 'dark' ? '浅色' : '深色';
      }
      themeBtn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        paintThemeBtn(next);
        try { localStorage.setItem(LS_KEY + '-theme', next); } catch (e) {}
      });
      try {
        var th = localStorage.getItem(LS_KEY + '-theme');
        if (th) {
          document.documentElement.setAttribute('data-theme', th);
          paintThemeBtn(th);
        }
      } catch (e) {}

      $('btnCsv').addEventListener('click', exportCsv);
      $('btnJson').addEventListener('click', exportJson);
      $('btnPdf').addEventListener('click', function () {
        toast('正在打开打印对话框，选择"另存为 PDF"');
        setTimeout(function () { window.print(); }, 320);
      });
      $('budgetInput').addEventListener('input', function () {
        S.budget = this.value;
        if (lastResult) renderAdvice(lastResult);
        save();
      });

      console.log('%c整机功耗计算器已就绪', 'color:#ff0033;font-weight:700',
        '\n数据库版本', DB.meta.version, '| 条目', DB.meta.counts);

      /* 调试 / 脚本化钩子：
         便于测试与自动化（例如在控制台执行
         __PSU_DEBUG.exportCsv() 或读取 __PSU_DEBUG.result() ） */
      window.__PSU_DEBUG = {
        state: S,
        result: function () { return lastResult; },
        db: DB,
        engine: EN,
        buildReportRows: buildReportRows,
        toCsv: function () {
          return buildReportRows().map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
        },
        exportCsv: exportCsv,
        exportJson: exportJson,
        applyPreset: applyPreset,
        calculate: function (cfg) { return EN.calculate(cfg); }
      };
    } catch (e) { errMsg(e); }
  }

  /* applyPresetSilent 已移除：首访不再静默灌入预设配置。
     示例配置统一由 applyPreset()（显式点击）载入。 */

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
