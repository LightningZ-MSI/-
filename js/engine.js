/* ============================================================================
 *  PSUEngine — 整机功耗计算 / 兼容性校验 / 电源推荐引擎
 *  纯函数实现，不依赖 DOM，可在 Node 中直接单测（见 tools/selftest.mjs）
 * ==========================================================================*/
(function (root) {
  'use strict';

  var HWDB = (typeof module === 'object' && module.exports)
    ? require('./db.js')
    : root.HWDB;

  /* ------------------------------------------------------------ 常量模型 -- */

  // 使用场景：factor = 场景预期功耗 / 峰值规划功耗；redundancy = 电源冗余系数
  var SCENARIOS = {
    office: {
      label: '日常办公 / 影音上网', factor: 0.75, redundancy: 1.30,
      desc: '长时间轻载，CPU/GPU 几乎不会同时满载'
    },
    gaming: {
      label: '重度游戏 (2K/4K 高画质)', factor: 0.95, redundancy: 1.40,
      desc: 'GPU 长期满载、CPU 中高负载，是最常见的装机场景'
    },
    creator: {
      label: '内容创作 / 渲染 / 编译', factor: 1.00, redundancy: 1.50,
      desc: 'CPU 与 GPU 可能同时满载（如 GPU 渲染 + CPU 编码）'
    },
    extreme: {
      label: '极限超频 / 压力测试', factor: 1.08, redundancy: 1.50,
      desc: '解除功耗墙 + 双烤，瞬时功耗超出标称值'
    }
  };

  var STANDARD_WATTS = [450, 500, 550, 650, 750, 850, 1000, 1200, 1300, 1500, 1600, 2000];

  /* ------------------------------------------------------------- 工具函数 - */

  function byId(list, id) {
    if (!id) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  function sourceOf(key) {
    if (!key) return null;
    return HWDB.sources[key] || null;
  }

  /* 向上取整到标准瓦数。
   * tol 为容许的欠量比例：电源瓦数序列在高段跨度很大（1600 → 2000 差 25%），
   * 若需求仅比某个标准瓦数高出不到 1%，强行跳到下一档会让用户多花上千元却买不到实际安全性。
   * 模型的功耗数据本身不确定度远大于 1%，因此 tol=0.01 是合理的。
   * 安全下限 recFloor 不启用容差——它是硬性底线。 */
  function roundUpStandard(watts, tol) {
    var t = 1 + (tol || 0);
    for (var i = 0; i < STANDARD_WATTS.length; i++) {
      if (STANDARD_WATTS[i] * t >= watts) return STANDARD_WATTS[i];
    }
    return Math.ceil(watts / 100) * 100;
  }

  // 12V-2x6 / 12VHPWR 是 600W 级接口；显卡用 8pin 时按 150W/根 估算所需根数
  function requiredPcie8pin(connector) {
    var m = /(\d+)\s*[×x]\s*8pin/i.exec(connector || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  function needs12v2x6(connector) {
    return /12V-?2x6|12VHPWR|16pin/i.test(connector || '');
  }

  /* ============================================================ 主计算 ====
   * @param {Object} cfg 用户配置
   * @returns {Object}    完整计算结果
   * ======================================================================*/
  function calculate(cfg) {
    cfg = cfg || {};
    var oc = !!cfg.overclock;
    var issues = [];
    var items = [];

    /* ---------------------------------------------------------- 1. CPU -- */
    var cpu = byId(HWDB.cpus, cfg.cpuId);
    var cpuWatts = 0, cpuDetail = '', cpuOcApplied = false;
    if (cpu) {
      // 锁频型号（Intel 非 K / 部分 X3D）无法通过倍频超频，超频开关对其无效
      var canOc = cpu.unlocked !== false;
      cpuOcApplied = oc && canOc;
      if (cpuOcApplied) {
        cpuWatts = num(cfg.cpuCustomWatts, cpu.ocPeak);
        cpuDetail = '超频模式：' + (cfg.cpuCustomWatts
          ? '用户自定义 ' + cpuWatts + 'W'
          : '解锁功耗墙 ' + cpu.maxTurbo + 'W → ' + cpuWatts + 'W');
      } else {
        cpuWatts = cpu.maxTurbo;
        cpuDetail = '最大睿频功耗（基础 ' + cpu.tdp + 'W / 睿频 ' + cpu.maxTurbo + 'W）' +
                    (oc && !canOc ? ' — 该型号倍频锁定，超频开关不生效' : '');
      }
      items.push({
        group: '核心部件', label: 'CPU', name: cpu.name, alias: cpu.alias,
        watts: cpuWatts, nominal: cpu.tdp, detail: cpuDetail,
        locked: !canOc,
        confidence: cfg.cpuCustomWatts ? 'estimate' : cpu.confidence,
        source: cpu.source, highlight: true
      });
    } else if (cfg.cpuName) {
      cpuWatts = num(cfg.cpuCustomWatts, 150);
      items.push({
        group: '核心部件', label: 'CPU', name: cfg.cpuName,
        watts: cpuWatts, detail: '未收录型号，按同类均值估算（' + cpuWatts + 'W）',
        confidence: 'estimate', source: null, highlight: true, unknown: true
      });
    }

    /* ---------------------------------------------------------- 2. GPU -- */
    var gpu = null, aib = null, gpuWatts = 0, gpuTransientFactor = 1.8;
    var staleAib = false;
    if (cfg.gpuId === '__igpu__') {
      items.push({
        group: '核心部件', label: '显卡', name: '使用 CPU 集成显卡',
        watts: 0, detail: '无独立显卡', confidence: 'official', source: null, highlight: true
      });
    } else {
      /* 先按 AIC 板型解析；板型 ID 失效时回退到公版数据，绝不静默按 0W 处理 */
      if (cfg.gpuAibId) {
        aib = byId(HWDB.aibs, cfg.gpuAibId);
        if (aib) gpu = byId(HWDB.gpus, aib.gpuId);
        else staleAib = true;
      }
      if (!gpu && cfg.gpuId) gpu = byId(HWDB.gpus, cfg.gpuId);

      if (gpu) {
        if (aib) {
          gpuWatts = oc ? aib.ocLimit : aib.tbp;
        } else {
          gpuWatts = oc ? Math.round(gpu.tbp * 1.08) : gpu.tbp;
        }
        gpuTransientFactor = gpu.transient;
        items.push({
          group: '核心部件', label: '显卡',
          name: aib
            ? gpu.name + ' — ' + aib.vendor + ' ' + aib.series + (aib.cnLabel || '')
            : gpu.name + '（公版 / 未指定 AIC）',
          sub: aib ? aib.sku : '',
          watts: gpuWatts, nominal: aib ? aib.tbp : gpu.tbp,
          detail: aib
            ? (oc ? 'OC 功耗墙 ' + aib.ocLimit + 'W' : '出厂 TBP ' + aib.tbp + 'W') +
              ' · ' + aib.connector + ' · ' +
              ({ aggressive: 'AIC 超频策略激进', moderate: 'AIC 超频策略中性', conservative: 'AIC 超频策略保守' }[aib.ocBias] || '') +
              (aib.liquid ? ' · 水冷形态' : '') +
              (aib.generated ? ' · 功耗墙由系列定位推算' : '')
            : '标称 TBP ' + gpu.tbp + 'W · ' + gpu.connector,
          confidence: aib ? aib.confidence : gpu.confidence,
          source: aib ? (aib.source || gpu.source) : gpu.source,
          highlight: true
        });
      } else if (cfg.gpuName) {
        gpuWatts = num(cfg.gpuCustomWatts, 250);
        items.push({
          group: '核心部件', label: '显卡', name: cfg.gpuName,
          watts: gpuWatts, detail: '未收录型号，按同类均值估算（' + gpuWatts + 'W）',
          confidence: 'estimate', source: null, highlight: true, unknown: true
        });
      }
    }
    if (staleAib) {
      issues.push({
        level: 'warn', code: 'STALE_AIB',
        title: '显卡板型数据已失效，已回退到公版功耗',
        detail: '配置中记录的板型（' + cfg.gpuAibId + '）在当前数据库版本中不存在，' +
                '可能是浏览器缓存的旧配置。已按 ' + (gpu ? gpu.name + ' 公版 ' + gpu.tbp + 'W' : '无显卡') + ' 计算。',
        fix: '请在「③ AIC 厂商 / 板型」中重新选择一次板型，以获得准确的功耗墙。'
      });
    }

    /* --------------------------------------------------------- 3. 主板 -- */
    var mobo = byId(HWDB.motherboards, cfg.moboId);
    if (mobo) {
      items.push({
        group: '核心部件', label: '主板', name: mobo.brand + ' ' + mobo.model,
        watts: mobo.watts, detail: mobo.chipset + ' · ' + mobo.formFactor + ' · 供电 ' + mobo.vrm,
        confidence: mobo.confidence, source: mobo.source
      });
    }

    /* --------------------------------------------------------- 4. 内存 -- */
    var ram = byId(HWDB.ram, cfg.ramId);
    var ramWatts = 0, ramSticks = 0, ramCapacity = 0;
    if (ram) {
      var kits = Math.max(1, num(cfg.ramKits, 1));
      ramSticks = ram.sticks * kits;
      ramCapacity = ram.capacityPerStick * ramSticks;
      ramWatts = round1(ram.wattsPerStick * ramSticks);
      items.push({
        group: '核心部件', label: '内存', name: ram.brand + ' ' + ram.model + ' ×' + kits + ' 套',
        watts: ramWatts, detail: ramSticks + ' 条 · 共 ' + ramCapacity + 'GB · DDR5-' + ram.speed +
                              (ram.rgb ? ' · RGB' : ''),
        confidence: ram.confidence, source: ram.source
      });
    }

    /* --------------------------------------------------------- 5. 存储 -- */
    var storageList = Array.isArray(cfg.storage) ? cfg.storage : [];
    var storageWatts = 0, storageSpinUp = 0, nvmeCount = 0, gen5Count = 0, hddCount = 0;
    storageList.forEach(function (s) {
      var drv = byId(HWDB.storage, s.id);
      if (!drv) return;
      var qty = Math.max(0, num(s.qty, 0));
      if (qty <= 0) return;
      storageWatts += drv.watts * qty;
      storageSpinUp += (drv.spinUp || 0) * qty;
      if (drv.kind === 'NVMe') nvmeCount += qty;
      if (/PCIe 5\.0/.test(drv.model)) gen5Count += qty;
      if (drv.kind === 'HDD') hddCount += qty;
      items.push({
        group: '存储', label: drv.kind, name: drv.model + ' ×' + qty,
        watts: round1(drv.watts * qty), detail: drv.capacity + ' · 单盘 ' + drv.watts + 'W',
        confidence: drv.confidence, source: drv.source
      });
    });

    /* --------------------------------------------------- 6. 散热 / 风扇 -- */
    var cooler = byId(HWDB.coolers, cfg.coolerId);
    if (cooler) {
      var coolerWatts = cooler.pumpWatts + cooler.wattPerFan * cooler.fanCount;
      items.push({
        group: '散热与风道', label: cooler.kind === 'AIO' ? '一体式水冷' : '风冷散热器',
        name: cooler.model, watts: round1(coolerWatts),
        detail: (cooler.kind === 'AIO' ? '水泵 ' + cooler.pumpWatts + 'W + ' : '') +
                cooler.fanCount + ' × 风扇 ' + cooler.wattPerFan + 'W',
        confidence: cooler.confidence, source: cooler.source
      });
    }
    var fan = byId(HWDB.fans, cfg.fanId);
    var fanQty = Math.max(0, num(cfg.fanQty, 0));
    if (fan && fanQty > 0) {
      // 水冷自带风扇已计入散热器，机箱风扇单独计
      var fanWatts = round1(fan.watts * fanQty);
      items.push({
        group: '散热与风道', label: '机箱风扇', name: fan.model + ' ×' + fanQty,
        watts: fanWatts, detail: (fan.argb ? 'ARGB + PWM' : 'PWM') + ' · 单只 ' + fan.watts + 'W',
        confidence: fan.confidence, source: fan.source
      });
    }

    /* --------------------------------------------------------- 7. 机箱 -- */
    var pcCase = byId(HWDB.cases, cfg.caseId);
    if (pcCase && pcCase.argbWatts > 0) {
      items.push({
        group: '散热与风道', label: '机箱灯效', name: pcCase.brand + ' ' + pcCase.model + ' 内置 ARGB',
        watts: pcCase.argbWatts, detail: '机箱自带灯带 / 控制器',
        confidence: 'estimate', source: pcCase.source
      });
    }

    /* ------------------------------------------------------- 8. 其他 ----- */
    var argbChannels = Math.max(0, num(cfg.argbChannels, 0));
    if (argbChannels > 0) {
      items.push({
        group: '其他与扩展', label: 'ARGB 灯带', name: '外接 ARGB 灯带 ×' + argbChannels + ' 通道',
        watts: argbChannels * 4, detail: '按每通道 4W 估算（3-5W/通道）',
        confidence: 'estimate', source: null
      });
    }
    var extras = cfg.extras || {};
    Object.keys(extras).forEach(function (k) {
      var def = byId(HWDB.extras, k);
      var qty = Math.max(0, num(extras[k], 0));
      if (!def || qty <= 0) return;
      items.push({
        group: '其他与扩展', label: '扩展设备', name: def.label + (qty > 1 ? ' ×' + qty : ''),
        watts: round1(def.watts * qty), detail: '按 ' + def.watts + 'W/个 估算',
        confidence: 'estimate', source: null
      });
    });
    (cfg.otherCustom || []).forEach(function (c) {
      if (!c || !c.label || !isFinite(parseFloat(c.watts))) return;
      items.push({
        group: '其他与扩展', label: '自定义', name: c.label,
        watts: num(c.watts), detail: '用户手动输入', confidence: 'estimate',
        source: null, unknown: true
      });
    });

    /* ---------------------------------------------------- 9. 合计与系数 -- */
    var subtotal = items.reduce(function (a, b) { return a + b.watts; }, 0);
    subtotal = round1(subtotal);

    /* 是否真正选了硬件。
       判据是「有没有产生功耗」而不是「有没有条目」：
       默认状态里 gpuId='__igpu__' 会压入一个 0W 的「集成显卡」条目，
       若按条目数判定，空配置依然会被当成"已选择"，
       于是又走回推荐电源 + 绿勾的老路。

       这条判据是三个可信度缺陷的总开关：
       没有它，空配置会算出 subtotal=0 → roundUpStandard(0) 取到最小标准瓦数 450W
       → 推荐 3 款电源（负载率 0%）、给出升级建议，
       同时兼容性检查因 issues 为空而输出绿色「未检测到兼容性问题 · 均匹配」。 */
    var hasSelection = subtotal > 0;

    var scenarioKey = SCENARIOS[cfg.scenario] ? cfg.scenario : 'gaming';
    var sc = SCENARIOS[scenarioKey];
    var expected = round1(subtotal * sc.factor);

    // 瞬时峰值：显卡/硬盘启动瞬间会远超持续功耗
    var gpuPeak = gpuWatts;
    var transient = subtotal - gpuPeak + gpuPeak * gpuTransientFactor + storageSpinUp;
    transient = round1(transient);

    /* ------------------------------------------------ 10. 电源推荐逻辑 --
     * 双阈值模型（对应需求中的「总功率 × 1.3~1.5」）：
     *   recFloor 安全下限 = 规划功耗 × 1.30，低于此值判为不合格
     *   recIdeal 推荐目标 = 规划功耗 × 场景冗余系数（1.40 ~ 1.50）
     * 之所以拆成两个值：单一阈值向上取整到标准瓦数时会「跳档」
     * （例如 1327W 直接跳到 1500W），既掩盖了真实余量，也浪费预算。
     * ---------------------------------------------------------------- */
    var FLOOR_FACTOR = 1.30;
    var redundancy = sc.redundancy;
    if (oc) redundancy = Math.max(redundancy, 1.50);
    if (hddCount > 0) redundancy = Math.max(redundancy, 1.40);

    var recFloor = hasSelection ? roundUpStandard(subtotal * FLOOR_FACTOR) : 0;   // 硬性底线，不容差
    var recIdeal = hasSelection ? roundUpStandard(subtotal * redundancy, 0.01) : 0;

    // 厂商建议整机电源（如 ASUS 对 5090 全超频平台建议 1000W、
    // 微星对 5090 闪电建议 1600W）作为地板
    var vendorFloor = aib && aib.recPsu ? aib.recPsu : (gpu && gpu.tbp >= 400 ? 1000 : 0);
    if (vendorFloor > recFloor) recFloor = vendorFloor;
    if (vendorFloor > recIdeal) recIdeal = vendorFloor;
    if (recIdeal < recFloor) recIdeal = recFloor;

    // 超出消费级电源常规范围时如实告知，而不是给出一个买不到的非标准瓦数
    var MAX_CONSUMER = STANDARD_WATTS[STANDARD_WATTS.length - 1];
    var idealTarget = round1(subtotal * redundancy);   // 未取整的理想目标，用于说明缺口
    var beyond = hasSelection && recIdeal > MAX_CONSUMER;
    if (beyond) {
      issues.push({
        level: 'warn', code: 'BEYOND_CONSUMER_PSU',
        title: '推荐瓦数超出消费级电源常规范围（>' + MAX_CONSUMER + 'W）',
        detail: '按场景冗余系数需要 ' + idealTarget + 'W，但标准 ATX 电源最高只到 ' +
                MAX_CONSUMER + 'W。已按 ' + MAX_CONSUMER + 'W 给出建议，' +
                '距离理想目标仍差 ' + round1(idealTarget - MAX_CONSUMER) + 'W。',
        fix: '可考虑：① 降低显卡功耗墙（如闪电的"默认 800W"而非"极致 1000W"）；' +
             '② 适当降低 CPU 超频幅度；③ 选用服务器级电源或双电源方案（需自行评估供电与开机时序）。'
      });
      recIdeal = MAX_CONSUMER;
      if (recFloor > MAX_CONSUMER) recFloor = MAX_CONSUMER;
    }

    var recMin = recFloor;   // 保留旧字段名，等价于安全下限
    var recMax = recIdeal;

    var reasons = [
      '规划功耗 ' + subtotal + 'W ｜ 安全下限 ×' + FLOOR_FACTOR.toFixed(2) + ' = ' +
      Math.round(subtotal * FLOOR_FACTOR) + 'W → ' + recFloor + 'W',
      '推荐目标 ×' + redundancy.toFixed(2) + '（' + sc.label + '）= ' +
      idealTarget + 'W → ' + recIdeal + 'W' + (beyond ? '（已受标准规格上限约束）' : '')
    ];
    if (vendorFloor) {
      reasons.push('显卡厂商建议整机电源不低于 ' + vendorFloor + 'W，已作为推荐下限');
    }
    if (oc) reasons.push('已启用超频：冗余系数自动提升至 ≥1.50');
    if (hddCount > 0) {
      reasons.push('检测到 ' + hddCount + ' 块机械硬盘：已计入启动瞬间 ' + round1(storageSpinUp) +
                   'W 额外功耗，冗余系数提升至 ≥1.40');
    }

    /* ------------------------------------------------ 11. 电源候选推荐 -- */
    /* 没选硬件时不推荐任何电源 —— 空配置下 compatible() 全部返回 true，
       会把 ≥450W 的型号全塞进候选池，渲染出 3 张「负载率 0%」的电源卡。 */
    var psuPicks = hasSelection
      ? pickPsus(recFloor, recIdeal, mobo, aib, gpu, pcCase)
      : { value: null, balanced: null, flagship: null, min: null, list: [],
          distinctCount: 0, belowFloor: [], need12v2x6: false, need8pin: 0, filteredByCase: false };

    /* ------------------------------------------------- 12. 升级余量推演 -- */
    var otherWatts = subtotal - gpuWatts;
    var upgrade = null;
    if (hasSelection && recIdeal > 0) {
      var gpuBudget = round1(recIdeal / redundancy - otherWatts);
      /* 升级建议只在「当前在售」的卡里挑。
         数据库补了 GTX 900 ~ RTX 30 系老卡之后，这里原来「TBP 最大者胜」的
         比较会把 2019 年的 RTX 2070 SUPER（215W）顶掉 Arc B580（190W）——
         对一个 2026 年准备升级显卡的人来说这是坏建议：TBP 高不等于性能好，
         更不等于买得到。
         规则：先在当前世代里找 TBP 最高的；只有预算内一块在售卡都放不下，
         才退回老卡，并在文案里点明「只能选到已停产的型号」。 */
      var best = null, bestLegacy = null;
      for (var i = 0; i < HWDB.gpus.length; i++) {
        var g = HWDB.gpus[i];
        if (g.confidence === 'leak') continue;
        if (g.tbp > gpuBudget) continue;
        if (g.segment === 'legacy') {
          if (!bestLegacy || g.tbp > bestLegacy.tbp) bestLegacy = g;
        } else if (!best || g.tbp > best.tbp) {
          best = g;
        }
      }
      var legacyOnly = false;
      if (!best && bestLegacy) { best = bestLegacy; legacyOnly = true; }

      var nonGpuPct = subtotal > 0 ? (otherWatts / subtotal * 100) : 100;
      upgrade = {
        headroomWatts: round1(recIdeal - subtotal),
        headroomPct: recIdeal > 0 ? Math.round((recIdeal - subtotal) / recIdeal * 100) : 0,
        gpuBudget: Math.max(0, gpuBudget),
        maxGpu: best ? best.name + '（' + best.tbp + 'W）' : null,
        legacyOnly: legacyOnly,
        note: best
          ? '按 ' + recIdeal + 'W 电源与 ' + redundancy.toFixed(2) + ' 倍冗余计算，可支持最高 ' +
            best.name + '（TBP ' + best.tbp + 'W）；非显卡部分占整机 ' + Math.round(nonGpuPct) + '%' +
            (legacyOnly
              ? '。注意：这个余量只够上已停产的老卡（' + best.name +
                '），在当前在售的型号里挑不到合适的——如果打算买新卡，建议直接换更大瓦数的电源'
              : '')
          : '当前电源余量不足以升级到数据库内任何更强的显卡，若计划大幅升级建议直接上更大瓦数'
      };
    }

    /* ------------------------------------------------- 13. 兼容性校验 --- */
    issues = issues.concat(checkCompatibility(cfg, {
      cpu: cpu, mobo: mobo, gpu: gpu, aib: aib, ram: ram, pcCase: pcCase,
      cooler: cooler, storage: storageList, nvmeCount: nvmeCount, gen5Count: gen5Count,
      ramSticks: ramSticks, ramCapacity: ramCapacity,
      psu: byId(HWDB.psus, cfg.psuId)
    }));

    /* --------------------------------------------- 14. 数据库缺失提醒 ---- */
    var unknownItems = items.filter(function (it) { return it.unknown; });
    if (unknownItems.length) {
      issues.push({
        level: 'info', code: 'UNKNOWN_MODEL',
        title: '存在未收录型号（' + unknownItems.length + ' 项）',
        detail: '「' + unknownItems.map(function (u) { return u.name; }).join('、') +
                '」暂用同类硬件均值估算，结果可能与实际有偏差。',
        fix: '可在页面底部「提交新硬件」入口反馈该型号，我们会尽快补入库。'
      });
    }
    var leaks = items.filter(function (it) { return it.confidence === 'leak'; });
    if (leaks.length) {
      issues.push({
        level: 'warn', code: 'UNRELEASED',
        title: '配置中包含尚未发布的硬件',
        detail: '「' + leaks.map(function (u) { return u.name; }).join('、') +
                '」的功耗来自泄露/推算数据，NVIDIA 官方尚未确认规格。',
        fix: '该结果仅可用于前瞻推演，请勿作为现在购买电源的依据。'
      });
    }

    /* ---------------------------------------------- 15. 已有电源评估 ----- */
    var existingPsu = null;
    var userPsu = byId(HWDB.psus, cfg.psuId);
    if (userPsu) {
      var util = subtotal / userPsu.watts;
      var utilExpected = expected / userPsu.watts;
      var verdict, vlevel;
      if (userPsu.watts < recFloor) {
        verdict = '低于安全下限 ' + recFloor + 'W，存在过载保护关机甚至损坏风险';
        vlevel = 'error';
      } else if (util > 0.85) {
        verdict = '余量偏紧，瞬时峰值可能触发保护';
        vlevel = 'warn';
      } else if (util > 0.4) {
        verdict = '负载区间合理，效率与静音表现良好';
        vlevel = 'ok';
      } else {
        verdict = '功率严重过剩，长期低负载下效率偏低（但不影响安全）';
        vlevel = 'warn';
      }
      existingPsu = {
        psu: userPsu,
        utilization: Math.round(util * 100),
        utilizationExpected: Math.round(utilExpected * 100),
        verdict: verdict, level: vlevel,
        meetsFloor: userPsu.watts >= recFloor,
        meetsIdeal: userPsu.watts >= recIdeal
      };
      if (vlevel === 'error' || vlevel === 'warn') {
        var recPick = psuPicks.balanced || psuPicks.min || psuPicks.flagship;
        issues.push({
          level: vlevel, code: 'PSU_TIGHT',
          title: (vlevel === 'error' ? '所选电源功率不足' : '所选电源余量偏低') +
                 '（负载率 ' + Math.round(util * 100) + '%）',
          detail: '规划功耗 ' + subtotal + 'W ÷ 电源额定 ' + userPsu.watts + 'W = ' +
                  Math.round(util * 100) + '%。' + verdict + '。',
          fix: '建议更换为 ' + recIdeal + 'W 及以上' +
               (recPick ? '，例如 ' + recPick.brand + ' ' + recPick.model + '（' + recPick.watts + 'W）' : '') + '。'
        });
      }
    }

    var totalPrice = items.reduce(function (a) { return a; }, 0);
    totalPrice = sumPrice(cfg);

    return {
      hasSelection: hasSelection,
      scenario: scenarioKey,
      scenarioInfo: sc,
      items: items,
      subtotal: subtotal,
      expected: expected,
      transient: transient,
      redundancy: redundancy,
      recFloor: recFloor,
      recIdeal: recIdeal,
      recMin: recFloor,
      recMax: recIdeal,
      reasons: reasons,
      picks: psuPicks,
      upgrade: upgrade,
      issues: issues,
      existingPsu: existingPsu,
      totalPrice: totalPrice,
      gpuWatts: gpuWatts,
      cpuWatts: cpuWatts,
      hasError: issues.some(function (i) { return i.level === 'error'; })
    };
  }

  /* ============================================================ 价格合计 = */
  function sumPrice(cfg) {
    var total = 0;
    var cpu = byId(HWDB.cpus, cfg.cpuId); if (cpu) total += cpu.price || 0;
    var aib = byId(HWDB.aibs, cfg.gpuAibId);
    if (aib) { var g = byId(HWDB.gpus, aib.gpuId); if (g) total += g.price || 0; }
    var mobo = byId(HWDB.motherboards, cfg.moboId); if (mobo) total += mobo.price || 0;
    var ram = byId(HWDB.ram, cfg.ramId);
    if (ram) total += (ram.price || 0) * Math.max(1, num(cfg.ramKits, 1));
    (cfg.storage || []).forEach(function (s) {
      var d = byId(HWDB.storage, s.id); if (d) total += (d.price || 0) * num(s.qty, 0);
    });
    var cooler = byId(HWDB.coolers, cfg.coolerId); if (cooler) total += cooler.price || 0;
    var fan = byId(HWDB.fans, cfg.fanId); if (fan) total += (fan.price || 0) * num(cfg.fanQty, 0);
    var c = byId(HWDB.cases, cfg.caseId); if (c) total += c.price || 0;
    var p = byId(HWDB.psus, cfg.psuId); if (p) total += p.price || 0;
    return total;
  }

  /* ======================================================== 电源候选推荐 =
   *  责任划分：先按「接口 / 机箱规格」做硬过滤，再按「瓦数」分档。
   *
   *  注意：这里刻意不按数据库里的 tier 字段硬性分三档。
   *  因为 1300W 以上的电源在现实中基本都是旗舰产品，"基础款 1600W" 并不存在，
   *  强行分档会退化成一个型号重复三次。改为按【角色】推荐：
   *    value    性价比之选 —— 达标前提下最便宜
   *    balanced 均衡之选   —— 达标前提下认证等级与价格最平衡
   *    flagship 旗舰之选   —— 达标前提下规格最高
   *  三者去重，若同瓦数段可选型号太少则如实告知。
   * ======================================================================*/
  var EFF_RANK = { '80 PLUS 钛金': 4, '80 PLUS 铂金': 3, '80 PLUS 金牌': 2, '80 PLUS 铜牌': 1 };

  function pickPsus(recFloor, recIdeal, mobo, aib, gpu, pcCase) {
    var need12v = aib ? needs12v2x6(aib.connector) : (gpu ? needs12v2x6(gpu.connector) : false);
    var need8pin = aib ? requiredPcie8pin(aib.connector) : (gpu ? requiredPcie8pin(gpu.connector) : 0);
    var casePsuForm = pcCase ? pcCase.psuFormFactor : null;

    function compatible(p) {
      var form = p.formFactor || 'ATX';
      if (casePsuForm && casePsuForm.indexOf(form) === -1) return false;
      if (need12v && p.conn12v2x6 < 1 && p.pcie8pin < 4) return false; // 允许 4×8pin 转 16pin
      if (need8pin > 0 && p.pcie8pin < need8pin) return false;
      return true;
    }

    var all = HWDB.psus.filter(compatible);
    var compliant = all.filter(function (p) { return p.watts >= recFloor; });
    // 优先展示同时满足「推荐目标」的型号；若存在则只在其中挑选
    var idealSet = compliant.filter(function (p) { return p.watts >= recIdeal; });
    var pool = idealSet.length ? idealSet : compliant;

    pool = pool.slice().sort(function (a, b) {
      if (a.watts !== b.watts) return a.watts - b.watts;
      return (a.price || 0) - (b.price || 0);
    });

    var picks = { value: null, balanced: null, flagship: null };
    if (pool.length) {
      // 性价比之选：达标前提下价格最低
      picks.value = pool.slice().sort(function (a, b) { return (a.price || 0) - (b.price || 0); })[0];
      // 旗舰之选：瓦数最高，其次认证最高
      picks.flagship = pool.slice().sort(function (a, b) {
        if (b.watts !== a.watts) return b.watts - a.watts;
        return (EFF_RANK[b.efficiency] || 0) - (EFF_RANK[a.efficiency] || 0);
      })[0];
      // 均衡之选：在 1.0~1.2 倍安全下限的瓦数区间内，取认证等级最高的
      var sweet = pool.filter(function (p) { return p.watts <= recFloor * 1.2; });
      var base = sweet.length ? sweet : pool;
      picks.balanced = base.slice().sort(function (a, b) {
        var d = (EFF_RANK[b.efficiency] || 0) - (EFF_RANK[a.efficiency] || 0);
        if (d !== 0) return d;
        return (a.price || 0) - (b.price || 0);
      })[0];
    }

    // 去重统计，供 UI 如实提示
    var uniq = {};
    var distinct = [];
    ['value', 'balanced', 'flagship'].forEach(function (k) {
      if (picks[k] && !uniq[picks[k].id]) { uniq[picks[k].id] = 1; distinct.push(picks[k].id); }
    });

    return {
      value: picks.value,
      balanced: picks.balanced,
      flagship: picks.flagship,
      // 兼容旧字段名
      min: picks.value,
      list: pool.slice(0, 8),
      distinctCount: distinct.length,
      // 非达标但接口兼容的型号，用于「预算紧张时的次优选择」提示
      belowFloor: all.filter(function (p) { return p.watts < recFloor; })
                    .sort(function (a, b) { return b.watts - a.watts; }).slice(0, 3),
      need12v2x6: need12v,
      need8pin: need8pin,
      filteredByCase: !!casePsuForm
    };
  }

  /* ========================================================== 兼容性校验 = */
  function checkCompatibility(cfg, ctx) {
    var out = [];
    var cpu = ctx.cpu, mobo = ctx.mobo, gpu = ctx.gpu, aib = ctx.aib;
    var pcCase = ctx.pcCase, cooler = ctx.cooler, ram = ctx.ram, psu = ctx.psu;

    /* ---- CPU ↔ 主板 插槽 ---- */
    if (cpu && mobo && cpu.socket !== mobo.socket) {
      var alts = HWDB.motherboards.filter(function (m) { return m.socket === cpu.socket; });
      out.push({
        level: 'error', code: 'SOCKET_MISMATCH',
        title: 'CPU 与主板接口不兼容',
        detail: cpu.name + ' 使用 ' + cpu.socket + ' 接口，而 ' + mobo.brand + ' ' + mobo.model +
                ' 是 ' + mobo.socket + ' 接口（' + mobo.chipset + ' 芯片组）。两者物理上无法安装。',
        fix: alts.length
          ? '建议改用 ' + cpu.socket + ' 主板，例如：' + alts.slice(0, 3).map(function (m) {
              return m.brand + ' ' + m.model;
            }).join('、')
          : '数据库中暂无匹配 ' + cpu.socket + ' 的主板，请手动确认。'
      });
    }
    if (cpu && cpu.released === '待发布') {
      out.push({
        level: 'warn', code: 'UNRELEASED_PLATFORM',
        title: '所选 CPU 尚未发布',
        detail: cpu.name + ' 属于未发布平台（' + cpu.family + '），上市时间与最终规格均未确定。',
        fix: '建议按现役平台规划电源，或仅用本结果做前瞻推演。'
      });
    }

    /* ---- 主板 ↔ 机箱 板型 ---- */
    if (mobo && pcCase && pcCase.moboSupport.indexOf(mobo.formFactor) === -1) {
      out.push({
        level: 'error', code: 'CASE_MOBO_FIT',
        title: '机箱装不下所选主板',
        detail: pcCase.brand + ' ' + pcCase.model + ' 支持 ' + pcCase.moboSupport.join(' / ') +
                '，而主板为 ' + mobo.formFactor + '。',
        fix: '请更换支持 ' + mobo.formFactor + ' 的机箱，或选择更小尺寸的主板。'
      });
    }

    /* ---- 显卡 ↔ 机箱 限长 ---- */
    if (aib && pcCase && aib.length) {
      if (aib.length > pcCase.gpuMaxLen) {
        out.push({
          level: 'error', code: 'GPU_TOO_LONG',
          title: '显卡长度超出机箱限长',
          detail: aib.vendor + ' ' + aib.series + ' 长度 ' + aib.length + 'mm，机箱 ' +
                  pcCase.model + ' 显卡限长 ' + pcCase.gpuMaxLen + 'mm，超出 ' +
                  round1(aib.length - pcCase.gpuMaxLen) + 'mm。',
          fix: '建议更换限长 ≥' + Math.ceil(aib.length / 10) * 10 + 'mm 的机箱。'
        });
      } else if (pcCase.gpuMaxLen - aib.length < 15) {
        out.push({
          level: 'warn', code: 'GPU_FIT_TIGHT',
          title: '显卡安装空间紧张',
          detail: '显卡 ' + aib.length + 'mm vs 机箱限长 ' + pcCase.gpuMaxLen + 'mm，仅余 ' +
                  round1(pcCase.gpuMaxLen - aib.length) + 'mm。前置风扇/水冷排可能占用这部分空间。',
          fix: '安装前置水冷时建议重新测量，或选择更短的非公版。'
        });
      }
    }

    /* ---- 水冷显卡 ↔ 机箱冷排位 ---- */
    if (aib && aib.liquid && pcCase) {
      var need = aib.radiator || 360;
      var sup = pcCase.radiatorSupport || '';
      var sz = (sup.match(/\d{3}/g) || []).map(Number);
      var fits = sz.length && Math.max.apply(null, sz) >= need;
      out.push({
        level: fits ? 'info' : 'error', code: 'GPU_LIQUID_RAD',
        title: fits ? '水冷显卡需占用机箱冷排位（' + need + 'mm）'
                    : '机箱可能装不下水冷显卡的 ' + need + 'mm 冷排',
        detail: aib.vendor + ' ' + aib.series + ' 为水冷形态，需额外安装 ' + need + 'mm 冷排；' +
                pcCase.model + ' 标称冷排支持 ' + (sup || '未标注') + '。',
        fix: fits
          ? '请预留一个 ' + need + 'mm 冷排安装位，注意与 CPU 水冷冷排位冲突（同尺寸时通常无法同时安装两个）。'
          : '建议更换支持 ' + need + 'mm 冷排的机箱，或改选风冷版本的显卡板型。'
      });
    }

    /* ---- 显卡厚度 ↔ 主板 PCIe 插槽 ---- */
    if (aib && aib.slots >= 3.5 && mobo) {
      out.push({
        level: 'info', code: 'GPU_SLOT_OCCUPY',
        title: '显卡占用 ' + aib.slots + ' 槽，将遮挡下方扩展插槽',
        detail: '该非公版属于超厚散热模组，安装后主板的第 2、3 条 PCIe 插槽基本不可用。',
        fix: '如需同时使用万兆网卡/采集卡，请优先选择第 1 条 PCIe x16 之外的可用插槽，或改用 M.2 方案。'
      });
    }

    /* ---- 显卡 PCIe 代数 ↔ 主板 ---- */
    if (gpu && mobo && /5\.0/.test(gpu.pcie) && /4\.0/.test(mobo.pcieGen)) {
      out.push({
        level: 'info', code: 'PCIE_DOWNGRADE',
        title: '显卡将被降速到 PCIe 4.0 运行',
        detail: gpu.name + ' 支持 ' + gpu.pcie + '，但 ' + mobo.model + ' 仅有 ' + mobo.pcieGen + '。',
        fix: '实测性能损失通常在 1%~3%，可接受；若追求极致可换 PCIe 5.0 主板。'
      });
    }

    /* ---- 存储 ↔ 主板 M.2 ---- */
    if (mobo && ctx.nvmeCount > mobo.m2Slots) {
      out.push({
        level: 'error', code: 'M2_NOT_ENOUGH',
        title: 'M.2 插槽数量不足',
        detail: '已选 ' + ctx.nvmeCount + ' 块 NVMe SSD，但 ' + mobo.model + ' 只有 ' + mobo.m2Slots + ' 个 M.2 插槽。',
        fix: '可改用 PCIe 转 M.2 扩展卡（占用 PCIe 插槽），或减少 SSD 数量。'
      });
    }
    if (mobo && ctx.gen5Count > mobo.m2Gen5) {
      out.push({
        level: 'warn', code: 'M2_GEN5_LIMIT',
        title: 'PCIe 5.0 SSD 数量超过主板 Gen5 插槽数',
        detail: '已选 ' + ctx.gen5Count + ' 块 PCIe 5.0 SSD，' + mobo.model +
                ' 仅提供 ' + mobo.m2Gen5 + ' 个 PCIe 5.0 M.2 插槽。',
        fix: '多出的 Gen5 盘会以 PCIe 4.0 速率运行，顺序读写性能约减半。'
      });
    }

    /* ---- 内存 ---- */
    if (ram && mobo) {
      var ramType = ram.type || 'DDR5';
      if (ramType !== mobo.ramType) {
        out.push({
          level: 'error', code: 'RAM_TYPE',
          title: '内存类型与主板不匹配',
          detail: '所选内存为 ' + ramType + '，而 ' + mobo.model + ' 仅支持 ' + mobo.ramType + '。' +
                  '两者金手指缺口位置不同，物理上无法插入。',
          fix: '请改用 ' + mobo.ramType + ' 内存，或更换支持 ' + ramType + ' 的主板。' +
               '注意 Intel 平台存在同一芯片组的 DDR4 / DDR5 两种版本，选购时容易混淆。'
        });
      }
      if (ram.sticks * Math.max(1, num(cfg.ramKits, 1)) > mobo.ramSlots) {
        out.push({
          level: 'error', code: 'RAM_SLOTS',
          title: '内存插槽数量不足',
          detail: '需要 ' + (ram.sticks * Math.max(1, num(cfg.ramKits, 1))) + ' 条内存，主板仅 ' + mobo.ramSlots + ' 条插槽。',
          fix: '减少套装数量，或改用单条容量更大的内存。'
        });
      }
      if (ctx.ramCapacity > mobo.maxRam) {
        out.push({
          level: 'error', code: 'RAM_CAPACITY',
          title: '内存容量超出主板支持上限',
          detail: '合计 ' + ctx.ramCapacity + 'GB，主板最大支持 ' + mobo.maxRam + 'GB。',
          fix: '请降低内存容量，并在装机前更新到最新版 BIOS。'
        });
      }
      if (ram.speed > mobo.ramSpeedMax) {
        out.push({
          level: 'warn', code: 'RAM_SPEED',
          title: '内存频率高于主板标称支持值',
          detail: '内存 DDR5-' + ram.speed + '，主板标称最高 DDR5-' + mobo.ramSpeedMax + '。',
          fix: '通常可通过 XMP/EXPO 手动超频达成，但也可能需降频运行；' +
               '4 条满插时高频更难达成，建议优先 2 条方案。'
        });
      }
    }
    if (ram && cpu && cpu.memMax) {
      var cpuMax = parseInt((/(\d{4,5})/.exec(cpu.memMax) || [])[1], 10);
      if (cpuMax && ram.speed > cpuMax) {
        out.push({
          level: 'info', code: 'RAM_CPU_SPEED',
          title: '内存频率高于 CPU 官方支持值',
          detail: cpu.name + ' 官方支持 ' + cpu.memMax + '，内存为 DDR5-' + ram.speed + '。',
          fix: '超出部分属于内存控制器超频，需在 BIOS 中开启 XMP/EXPO；' +
               '酷睿 Ultra 200S Plus 平台官方支持已提升至 DDR5-7200。'
        });
      }
    }

    /* ---- 散热器 ↔ CPU 插槽 ---- */
    if (cooler && cpu && cooler.sockets.indexOf(cpu.socket) === -1) {
      out.push({
        level: 'error', code: 'COOLER_SOCKET',
        title: '散热器不支持该 CPU 插槽',
        detail: cooler.model + ' 支持 ' + cooler.sockets.join(' / ') + '，CPU 为 ' + cpu.socket + '。',
        fix: '请更换扣具或选择支持 ' + cpu.socket + ' 的散热器。'
      });
    }
    if (cooler && pcCase && cooler.radiator > 0) {
      var support = pcCase.radiatorSupport || '';
      var sizes = (support.match(/\d{3}/g) || []).map(Number);
      if (sizes.length && sizes.indexOf(cooler.radiator) === -1 && Math.max.apply(null, sizes) < cooler.radiator) {
        out.push({
          level: 'warn', code: 'RADIATOR_FIT',
          title: '水冷排尺寸可能超出机箱支持',
          detail: cooler.model + ' 为 ' + cooler.radiator + 'mm 冷排，机箱标称支持 ' + support + '。',
          fix: '请确认安装位（顶置/前置/侧置）与冷排厚度、风扇厚度是否冲突。'
        });
      }
    }
    /* ---- 散热能力提示 ---- */
    if (cpu && cooler) {
      var cap = cooler.kind === 'AIO' ? cooler.radiator : 200;
      if (cpu.maxTurbo >= 200 && cap < 360) {
        out.push({
          level: 'warn', code: 'COOLING_POWER',
          title: '散热规格对高功耗 CPU 偏弱',
          detail: cpu.name + ' 最大睿频功耗 ' + cpu.maxTurbo + 'W，' + cooler.model + ' 的散热余量有限。',
          fix: '建议升级到 360mm 一体式水冷或高端双塔风冷，否则会因温度墙而降频。'
        });
      }
      if (cpu.tdp >= 200) {
        out.push({
          level: 'info', code: 'HIGH_TDP_CPU',
          title: '该 CPU 是 AM5 平台功耗最高的型号（TDP ' + cpu.tdp + 'W）',
          detail: cpu.name + ' 双堆叠 3D 缓存结构对供电与散热要求显著高于前代。',
          fix: '建议搭配 360mm 水冷与供电 ≥14 相的主板，并确保机箱风道良好。'
        });
      }
    }

    /* ---- 机箱 ↔ 电源规格 ---- */
    if (pcCase && psu) {
      var pForm = psu.formFactor || 'ATX';
      if (pcCase.psuFormFactor.indexOf(pForm) === -1) {
        out.push({
          level: 'error', code: 'PSU_FORMFACTOR',
          title: '电源规格与机箱不匹配',
          detail: pcCase.model + ' 仅支持 ' + pcCase.psuFormFactor.join(' / ') + '，所选电源为 ' + pForm + '。',
          fix: '请选择 ' + pcCase.psuFormFactor.join(' / ') + ' 规格的电源。'
        });
      }
    }

    /* ---- 电源接口生态检查 ---- */
    if (psu && (aib || gpu)) {
      var conn = aib ? aib.connector : gpu.connector;
      var need12 = needs12v2x6(conn);
      var need8 = requiredPcie8pin(conn);
      if (need12 && psu.conn12v2x6 < 1) {
        out.push({
          level: 'warn', code: 'PSU_NO_12V2X6',
          title: '电源没有原生 12V-2x6 / 12VHPWR 接口',
          detail: psu.model + ' 提供 ' + psu.pcie8pin + ' 个 PCIe 8pin，显卡需要 ' + conn + '。',
          fix: '需使用显卡附带的 4×8pin 转 16pin 转接线。' +
               '注意：转接线会增加接触电阻与发热风险，强烈建议改用原生 12V-2x6 的 ATX 3.1 电源。'
        });
      }
      if (need8 > 0 && psu.pcie8pin < need8) {
        out.push({
          level: 'error', code: 'PSU_PCIE_COUNT',
          title: 'PCIe 8pin 接口数量不足',
          detail: '显卡需要 ' + need8 + ' 个 PCIe 8pin，电源只有 ' + psu.pcie8pin + ' 个。',
          fix: '避免使用一分二转接线串联供电（单路超载风险），请更换接口更多的电源。' +
               (need8 >= 3
                 ? ' AMD 多 8pin 显卡（如 ' + (gpu ? gpu.name : '本卡') + '）对供电稳定性非常敏感，' +
                   '供电不稳是「掉驱动」的常见诱因，建议选择带 ' + need8 + ' 个独立 PCIe 8pin 输出的电源。'
                 : '')
        });
      }
      if (need12 && psu.atx !== 'ATX 3.1') {
        out.push({
          level: 'warn', code: 'PSU_NOT_ATX31',
          title: '建议选用 ATX 3.1 标准电源',
          detail: psu.model + ' 为 ' + psu.atx + ' 规范。' + (gpu ? gpu.name : '') +
                  ' 属于高瞬时功耗显卡（峰值可达 ' + (gpu ? gpu.transient : 1.8) + ' 倍 TBP）。',
          fix: 'ATX 3.1 电源的 12V-2x6 接口与瞬时偏移承受能力经过针对性强化，' +
               '更适配 50 系/RDNA 4 显卡的功率尖峰。'
        });
      }
      if (!need12 && psu.conn12v2x6 > 0) {
        out.push({
          level: 'info', code: 'PSU_12V2X6_IDLE',
          title: '电源原生 12V-2x6 接口闲置',
          detail: '所选显卡使用 ' + conn + ' 供电，电源的 ' + psu.conn12v2x6 + ' 个 12V-2x6 接口不会被占用。',
          fix: '属于正常情况，该接口已为未来升级 50 系显卡预留。'
        });
      }
    }

    /* ---- CPU 供电接口 ---- */
    if (psu && cpu && cpu.maxTurbo >= 200 && psu.eps8pin < 2) {
      out.push({
        level: 'warn', code: 'EPS_COUNT',
        title: 'CPU 供电接口偏少',
        detail: cpu.name + ' 最大睿频功耗 ' + cpu.maxTurbo + 'W，电源仅提供 ' + psu.eps8pin + ' 个 CPU 8pin。',
        fix: '单 8pin 理论可承载约 235W，日常可用但超频/长时间满载建议使用 2 个 CPU 8pin。'
      });
    }

    /* ---- 超频提示 ---- */
    if (cfg.overclock && cpu && cpu.unlocked === false) {
      out.push({
        level: 'info', code: 'CPU_LOCKED',
        title: '该 CPU 倍频锁定，超频开关不生效',
        detail: cpu.name + ' 属于非 K / 锁频型号，无法通过倍频调节超频，' +
                'PL2（' + cpu.maxTurbo + 'W）即为实际功耗上限。',
        fix: '功耗已按 ' + cpu.maxTurbo + 'W 计算。若需更高性能，请选择 K / KF / KS 或 AMD 非锁频型号；' +
             '部分主板支持 BCLK 外频超频，但幅度有限且有风险。'
      });
    }
    if (cfg.overclock && (!cpu || cpu.unlocked !== false)) {
      out.push({
        level: 'warn', code: 'OC_NOTICE',
        title: '已启用超频功耗模式',
        detail: 'CPU 与显卡均按解锁功耗墙后的数值计算，瞬时峰值可能进一步超出。',
        fix: '建议选择更高瓦数电源（冗余系数已自动提升至 ≥1.50），并确认主板供电与散热余量。'
      });
    }

    return out;
  }

  /* ==================================================== 预算 / 平衡建议 ==
   *  规则引擎（非 AI 模型）：按功耗结构与预算给出可解释的取舍建议
   * ======================================================================*/
  function advise(cfg, budget) {
    var r = calculate(cfg);
    var tips = [];
    var gpuPct = r.subtotal > 0 ? r.gpuWatts / r.subtotal : 0;

    if (gpuPct >= 0.55) {
      tips.push({
        level: 'info', title: '显卡功耗占比 ' + Math.round(gpuPct * 100) + '%，电源压力主要来自显卡',
        detail: '这是现代游戏平台的典型特征。若预算有限，优化显卡功耗墙（如 -10% 功耗限制）' +
                '通常只损失 2-3% 性能，却能显著降低对电源的要求。'
      });
    } else if (gpuPct <= 0.3 && r.gpuWatts > 0) {
      tips.push({
        level: 'warn', title: 'CPU 侧功耗占比偏高',
        detail: 'CPU 功耗 ' + r.cpuWatts + 'W 已接近显卡。若主要用于游戏，可考虑功耗更低的 X3D' +
                ' 或非 K 型号，把这部分预算转移到显卡上，游戏帧数通常更划算。'
      });
    }

    if (budget > 0 && r.totalPrice > 0) {
      var pick = r.picks.balanced || r.picks.min;
      var psuCost = pick ? pick.price : 0;
      var pct = Math.round(psuCost / budget * 100);
      tips.push({
        level: 'ok', title: '电源预算占比约 ' + pct + '%',
        detail: '推荐电源 ' + (pick ? pick.model + '（' + pick.watts + 'W，' + pick.efficiency + '）' : '—') +
                '，参考价 ¥' + psuCost + '，整机参考价 ¥' + r.totalPrice + '。',
        note: pct < 8
          ? '电源占比低于 8% 属于偏紧，不建议为省钱降级电源——它是唯一会连带损坏其他硬件的部件。'
          : (pct > 18 ? '电源占比偏高，可考虑降一档认证等级（金牌→铜牌差额不大时优先保功率）。'
                      : '占比处于健康区间。')
      });
    }

    if (r.upgrade && r.upgrade.maxGpu) {
      tips.push({
        level: r.upgrade.legacyOnly ? 'warn' : 'info',
        title: '升级路径：可支持 ' + r.upgrade.maxGpu,
        detail: '当前电源预留 ' + r.upgrade.headroomPct + '% 余量（' + r.upgrade.headroomWatts + 'W），' +
                '非显卡部分占 ' + Math.round((r.subtotal - r.gpuWatts) / r.subtotal * 100) + '%。',
        note: r.upgrade.legacyOnly
          ? '这个余量只够上已停产的老卡，在当前在售型号里挑不到合适的。' +
            '老卡只能买二手，且使用多年后实际功耗抖动更大，建议直接换更大瓦数的电源。'
          : '若计划 2 年内升级到更高阶显卡，建议现在就上更大瓦数，电源的折旧速度远低于显卡。'
      });
    }

    if (r.transient > r.recIdeal) {
      tips.push({
        level: 'warn', title: '瞬时峰值 ' + r.transient + 'W 高于推荐电源额定 ' + r.recIdeal + 'W',
        detail: '这是正常的：ATX 3.1 电源被要求具备承受短时功率偏移的能力。',
        note: '但请务必选择正规品牌的 ATX 3.1 产品，杂牌电源的"标称瓦数"通常无法覆盖瞬时峰值。'
      });
    }

    if (r.picks && r.picks.distinctCount <= 1 && r.subtotal > 0) {
      tips.push({
        level: 'info', title: '该瓦数段可选型号较少（' + r.recFloor + 'W 以上）',
        detail: '此功率区间内数据库仅收录到 ' + r.picks.distinctCount + ' 款达标型号，推荐结果会集中。',
        note: '1300W 以上的 ATX 3.1 电源本身就集中在旗舰价位，属正常现象。'
      });
    }

    return { result: r, tips: tips };
  }

  var API = {
    calculate: calculate,
    advise: advise,
    checkCompatibility: checkCompatibility,
    SCENARIOS: SCENARIOS,
    STANDARD_WATTS: STANDARD_WATTS,
    roundUpStandard: roundUpStandard,
    needs12v2x6: needs12v2x6,
    requiredPcie8pin: requiredPcie8pin
  };

  root.PSUEngine = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
