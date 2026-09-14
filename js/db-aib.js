/* ============================================================================
 *  AIC 厂商 / 系列目录  ——  显卡板型数据库
 * ----------------------------------------------------------------------------
 *  为什么要做成"系列目录 + 规则生成"而不是手写全部 SKU？
 *
 *  "所有 AIC 厂商 × 所有显卡型号"是 20+ 厂商 × 70+ 系列 × 16+ GPU ≈ 上千个组合。
 *  其中绝大多数厂商从不公布 TBP，如果全部手写，只会得到上千条无法核实的臆造数字。
 *
 *  真实情况是：功耗墙主要由【系列定位】决定，而不是由具体型号决定。
 *  同一厂商的入门系列与旗舰系列之间，存在稳定且可验证的功耗档位差异
 *  （例：RTX 5090 公版 575W → 主流非公 ~600W → 旗舰非公 ~660W → Halo 700-1000W）。
 *
 *  因此这里分两层：
 *    SERIES    —— 厂商系列目录（真实存在，含中英文名、定位、散热形态）
 *    EXPLICIT  —— 有确切实测/官方数据的 SKU，逐条手写并标注来源
 *    build()   —— 用系列定位推算其余 SKU 的功耗墙，全部标记 confidence='estimate'
 *
 *  界面上，规则生成的板型会显示"规则生成"徽标，与有实测来源的条目明确区分。
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* ------------------------------------------------------- 定位档位默认值 --
   *  powerMult / ocMult 是基于"公版 TBP → 非公功耗墙"的经验倍率。
   *
   *  已用有实测数据的型号校准（以 RTX 5090 公版 575W 为基准）：
   *    FE 575W → 主流非公 575-600W → 旗舰非公 600W → Halo 690W+（闪电/骇客实测 800W）
   *
   *  ⚠️ Halo 档位离散度极大：同为 Halo，影驰 HOF OC Lab 与微星闪电相差可达 200W。
   *     凡是有确切官方/实测数据的 Halo 型号都写在 EXPLICIT 层覆盖本表，
   *     本表只用于推算没有数据的 Halo 型号，取中间值。
   * ----------------------------------------------------------------------*/
  var TIER_DEFAULT = {
    blower:     { length: 267, slots: 2.0, powerMult: 1.00, ocMult: 1.00 },
    value:      { length: 285, slots: 2.3, powerMult: 1.00, ocMult: 1.05 },
    mainstream: { length: 320, slots: 3.0, powerMult: 1.02, ocMult: 1.09 },
    flagship:   { length: 340, slots: 3.5, powerMult: 1.05, ocMult: 1.13 },
    halo:       { length: 340, slots: 3.5, powerMult: 1.20, ocMult: 1.15 }
  };

  var TIER_LABEL = {
    blower: '涡轮 / 工作站向', value: '入门款', mainstream: '主流款',
    flagship: '旗舰款', halo: 'Halo 旗舰'
  };

  /* =========================================================== 系列目录 ==
   *  minTbp  该系列最低覆盖到多大 TBP 的 GPU（Halo 系列通常只做最顶级型号）
   *  maxTbp  可选上限。用于限定"只做一个型号"的系列，例如华硕 Noctua Edition
   *          经核实仅覆盖 RTX 5080，没有 maxTbp 就会错误地生成到 5090 上
   *  onlyGpus 可选的精确覆盖清单（GPU id 数组）。当厂商官网型号表已核实，
   *          用它可以精确到"该系列只做这几个型号"，比 minTbp/maxTbp 区间更可靠。
   *          例：华擎 Taichi 经官网核实只做 RX 9070 XT 与 RX 7900 XTX，
   *          用区间无法表达（会误伤中间的 9070），必须用 onlyGpus。
   *  gens / exceptGpus / brands 的**核实结果统一写在文件下方的 COVERAGE 表里**，
   *          不散落在每条系列定义中 —— 这样「哪些系列已逐代核实」一眼可查。
   *          gens       世代白名单（GPU 世代 id 数组，如 ['rtx50','rx7000']）
   *          exceptGpus 在该白名单里再排掉个别型号（同一代里只做部分 SKU 时用）
   *          已核实的例子：ASUS 在 RX 7000 / RX 9000 上都没有 ROG Strix；
   *          ROG Strix 在 RTX 50 世代只做 5070 Ti / 5070，5090/5080 走 Astral 与 TUF。
   *  liquid  是否为水冷/液冷形态（影响机箱冷排校验）
   * ======================================================================*/
  var SERIES = [
    /* ------------------------------------------------------ NVIDIA 阵营 -- */
    /* 华硕 ASUS */
    { id: 'asus-rog-matrix', vendor: '华硕 ASUS', series: 'ROG Matrix', cn: '骇客',
      brands: ['NVIDIA'], tier: 'halo', minTbp: 500, since: 2025, liquid: true, radiator: 360,
      powerMult: 1.30, ocMult: 1.05, bias: 'aggressive', length: 280, slots: 2.0,
      connector: '1× 12V-2x6', recPsu: 1200,
      note: 'ROG 最高阶液冷系列，配 360mm 冷排，出厂功耗墙远高于公版，面向极限超频。' },
    { id: 'asus-rog-astral', vendor: '华硕 ASUS', series: 'ROG Astral', cn: '星曜',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250, since: 2025,
      powerMult: 1.04, ocMult: 1.00, bias: 'aggressive', length: 357.6, slots: 3.8 },
    { id: 'asus-rog-strix', vendor: '华硕 ASUS', series: 'ROG Strix', cn: '猛禽',
      brands: ['NVIDIA', 'AMD'], tier: 'flagship', minTbp: 180,
      powerMult: 1.05, ocMult: 1.12, bias: 'aggressive', length: 340, slots: 3.2 },
    { id: 'asus-tuf', vendor: '华硕 ASUS', series: 'TUF Gaming', cn: '电竞特工',
      brands: ['NVIDIA', 'AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.10, bias: 'moderate', length: 320, slots: 3.0 },
    { id: 'asus-prime', vendor: '华硕 ASUS', series: 'Prime', cn: '大师',
      brands: ['NVIDIA', 'AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 285, slots: 2.5 },
    { id: 'asus-dual', vendor: '华硕 ASUS', series: 'Dual', cn: '雪豹',
      brands: ['NVIDIA', 'AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 240, slots: 2.0 },
    { id: 'asus-proart', vendor: '华硕 ASUS', series: 'ProArt', cn: '创艺国度',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 300, slots: 2.5,
      note: '面向内容创作者，三风扇但厚度控制较好，适合多卡/多扩展卡机箱。' },
    { id: 'asus-turbo', vendor: '华硕 ASUS', series: 'Turbo', cn: '涡轮',
      brands: ['NVIDIA'], tier: 'blower', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative' },
    { id: 'asus-noctua', vendor: '华硕 ASUS', series: 'Noctua Edition', cn: '猫头鹰联名',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 355, maxTbp: 380, since: 2022,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 310, slots: 3.8,
      note: '与猫头鹰联名的静音向型号。经核实仅覆盖 RTX 5080，功耗墙偏保守但噪音表现最好。' },

    /* 微星 MSI */
    { id: 'msi-lightning-z', vendor: '微星 MSI', series: 'Lightning Z', cn: '闪电',
      brands: ['NVIDIA'], tier: 'halo', minTbp: 500, since: 2026,
      powerMult: 1.39, ocMult: 1.25, bias: 'aggressive', liquid: true, radiator: 360,
      length: 300, slots: 2.5,
      connector: '2× 12V-2x6', recPsu: 1600,
      note: '微星最高阶超频系列，Lightning 系列时隔七年于 CES 2026 回归。' +
            '双 12V-2x6 供电 + 360mm 水冷，默认功耗墙 800W，极致预设可解锁至 1000W。' },
    { id: 'msi-suprim', vendor: '微星 MSI', series: 'SUPRIM', cn: '超龙',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.11, ocMult: 1.00, bias: 'aggressive', length: 359, slots: 3.8 },
    { id: 'msi-gaming-trio', vendor: '微星 MSI', series: 'GAMING TRIO', cn: '魔龙',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'moderate', length: 337, slots: 3.0 },
    { id: 'msi-gaming-x', vendor: '微星 MSI', series: 'GAMING X', cn: '魔龙 X',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0, since: 2016,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 300, slots: 2.5 },
    { id: 'msi-vanguard', vendor: '微星 MSI', series: 'VANGUARD', cn: '神龙',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 200, since: 2025,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5,
      note: '微星 RTX 50 世代新增的高端系列。' },
    { id: 'msi-shadow', vendor: '微星 MSI', series: 'SHADOW', cn: '幻影师',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0, since: 2025,
      powerMult: 1.02, ocMult: 1.07, bias: 'moderate', length: 310, slots: 2.5 },
    { id: 'msi-ventus', vendor: '微星 MSI', series: 'VENTUS', cn: '万图师',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 305, slots: 2.5 },
    { id: 'msi-aero', vendor: '微星 MSI', series: 'AERO', cn: '创世',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 300, slots: 2.5 },
    { id: 'msi-inspire', vendor: '微星 MSI', series: 'INSPIRE', cn: '硬派',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 280, slots: 2.5 },
    { id: 'msi-expert', vendor: '微星 MSI', series: 'EXPERT', cn: '专家',
      brands: ['NVIDIA'], tier: 'blower', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 300, slots: 2.0,
      note: '涡轮式散热，适合多卡并行与风道受限的机箱。' },

    /* 技嘉 GIGABYTE */
    { id: 'gigabyte-aorus-xtreme', vendor: '技嘉 GIGABYTE', series: 'AORUS XTREME', cn: '超级雕',
      brands: ['NVIDIA'], tier: 'halo', minTbp: 400, since: 2020, liquid: true, radiator: 360,
      powerMult: 1.13, ocMult: 1.10, bias: 'aggressive', length: 290, slots: 2.0,
      recPsu: 1000,
      note: '实际产品为 AORUS XTREME WATERFORCE（水冷形态），覆盖 RTX 5090 D 32G / 5080 16G。' },
    { id: 'gigabyte-aorus-master', vendor: '技嘉 GIGABYTE', series: 'AORUS MASTER', cn: '大雕',
      brands: ['NVIDIA', 'AMD'], tier: 'flagship', minTbp: 250,
      powerMult: 1.06, ocMult: 1.10, bias: 'aggressive', length: 360, slots: 3.5 },
    { id: 'gigabyte-aorus-elite', vendor: '技嘉 GIGABYTE', series: 'AORUS ELITE', cn: '小雕',
      brands: ['NVIDIA', 'AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.04, ocMult: 1.10, bias: 'moderate', length: 330, slots: 3.0 },
    { id: 'gigabyte-gaming-oc', vendor: '技嘉 GIGABYTE', series: 'GAMING OC', cn: '魔鹰',
      brands: ['NVIDIA', 'AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 320, slots: 3.0 },
    { id: 'gigabyte-eagle', vendor: '技嘉 GIGABYTE', series: 'EAGLE', cn: '猎鹰',
      brands: ['NVIDIA', 'AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 280, slots: 2.5 },
    { id: 'gigabyte-windforce', vendor: '技嘉 GIGABYTE', series: 'WINDFORCE', cn: '风魔',
      brands: ['NVIDIA', 'AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 297, slots: 2.5 },
    { id: 'gigabyte-aero', vendor: '技嘉 GIGABYTE', series: 'AERO', cn: '风之力',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 300, slots: 2.5,
      note: '技嘉面向内容创作者的系列，覆盖 RTX 5070 / 5060。' },
    /* 注：技嘉 AI TOP 的实际产品是 Radeon AI PRO R9700 32G（AMD 工作站卡），
       该 GPU 不在本工具的消费级显卡库内，无法正确建模，故不纳入系列目录。
       曾误将其列为 NVIDIA 系列，已移除。 */

    /* 七彩虹 iGame */
    /* 注：iGame Kudan（九段）曾出现在 RTX 3090 / 4090 世代，但经检索未发现 RTX 50 系
       Kudan 产品，故不纳入系列目录——宁可少一个系列，也不给出不存在的型号。 */
    { id: 'igame-vulcan', vendor: '七彩虹 iGame', series: 'Vulcan', cn: '火神',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.04, ocMult: 1.12, bias: 'aggressive', length: 360, slots: 3.5,
      note: '带可拆卸智屏，是国内出货量最大的旗舰非公系列之一。' },
    { id: 'igame-neptune', vendor: '七彩虹 iGame', series: 'Neptune', cn: '水神',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250, liquid: true, radiator: 360,
      powerMult: 1.06, ocMult: 1.12, bias: 'aggressive', length: 290, slots: 2.0 },
    { id: 'igame-advanced', vendor: '七彩虹 iGame', series: 'Advanced OC', cn: '进阶',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.11, bias: 'moderate', length: 337, slots: 3.0,
      note: '带一键超频按钮，按下后启用 OC 模式。' },
    { id: 'igame-ultra', vendor: '七彩虹 iGame', series: 'Ultra W', cn: 'ultra',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.08, bias: 'moderate', length: 330, slots: 3.0 },
    { id: 'colorful-battleax', vendor: '七彩虹 Colorful', series: 'Battle-Ax', cn: '战斧',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.04, bias: 'conservative', length: 300, slots: 2.5 },

    /* 影驰 GALAX */
    { id: 'galax-hof-oclab', vendor: '影驰 GALAX', series: 'HOF OC Lab', cn: '名人堂 OC Lab',
      brands: ['NVIDIA'], tier: 'halo', minTbp: 400,
      powerMult: 1.13, ocMult: 1.12, bias: 'aggressive', length: 340, slots: 3.5,
      note: '名人堂超频实验室版本，为 LN2 / 极限超频设计，通常限量发售。' },
    { id: 'galax-hof', vendor: '影驰 GALAX', series: 'HOF', cn: '名人堂',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.06, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5 },
    { id: 'galax-boomstar', vendor: '影驰 GALAX', series: 'Boomstar', cn: '星曜',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 320, slots: 3.0 },
    { id: 'galax-metal-master', vendor: '影驰 GALAX', series: 'Metal Master', cn: '金属大师',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 310, slots: 2.5 },
    { id: 'galax-gamer', vendor: '影驰 GALAX', series: 'Gamer', cn: '大将',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 290, slots: 2.5 },

    /* 索泰 ZOTAC */
    { id: 'zotac-amp-extreme-infinity', vendor: '索泰 ZOTAC', series: 'AMP EXTREME INFINITY', cn: '玩家力量 无限',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.06, ocMult: 1.12, bias: 'aggressive', length: 356, slots: 3.5 },
    { id: 'zotac-amp-extreme', vendor: '索泰 ZOTAC', series: 'AMP EXTREME', cn: '玩家力量',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.04, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5 },
    { id: 'zotac-amp', vendor: '索泰 ZOTAC', series: 'AMP', cn: '至尊',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 320, slots: 3.0 },
    { id: 'zotac-trinity', vendor: '索泰 ZOTAC', series: 'Trinity', cn: '三一',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 315, slots: 2.5 },
    { id: 'zotac-solid', vendor: '索泰 ZOTAC', series: 'SOLID', cn: '硬核',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.08, bias: 'moderate', length: 331, slots: 3.5 },
    { id: 'zotac-twin-edge', vendor: '索泰 ZOTAC', series: 'Twin Edge', cn: '双刃',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.04, bias: 'conservative', length: 220, slots: 2.0,
      note: '短卡设计，适合 ITX 机箱。' },

    /* 映众 INNO3D */
    { id: 'inno3d-ichill-frostbite', vendor: '映众 INNO3D', series: 'iCHILL FROSTBITE', cn: '冰龙 水冷版',
      brands: ['NVIDIA'], tier: 'halo', minTbp: 400, since: 2020, liquid: true, radiator: 360,
      powerMult: 1.10, ocMult: 1.10, bias: 'aggressive', length: 280, slots: 2.0 },
    { id: 'inno3d-ichill-x4', vendor: '映众 INNO3D', series: 'iCHILL X4', cn: '冰龙 X4',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 200,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5 },
    { id: 'inno3d-ichill-x3', vendor: '映众 INNO3D', series: 'iCHILL X3', cn: '冰龙 X3',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 320, slots: 3.0 },
    { id: 'inno3d-twin-x2', vendor: '映众 INNO3D', series: 'Twin X2', cn: '双风扇',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.04, bias: 'conservative', length: 250, slots: 2.0 },

    /* 耕升 Gainward —— 注意：中国区 RTX 50 系列使用的是独立命名（炫光/踏雪/追风），
       并非全球市场的 Phantom/Ghost/Python。此处按中国区实际产品线命名。 */
    { id: 'gainward-glare', vendor: '耕升 Gainward', series: 'Glare', cn: '炫光',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 200,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5,
      source: 'expreviewGainward',
      note: '耕升中国区 RTX 50 系列的高端型号（如 RTX 5080 炫光 OC）。' },
    { id: 'gainward-taxue', vendor: '耕升 Gainward', series: 'Taxue', cn: '踏雪',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 320, slots: 3.0,
      source: 'expreviewGainward' },
    { id: 'gainward-wind', vendor: '耕升 Gainward', series: 'Wind', cn: '追风',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 300, slots: 2.5,
      source: 'expreviewGainward',
      note: '耕升主打性价比的系列。' },

    /* 铭瑄 MAXSUN */
    { id: 'maxsun-icraft', vendor: '铭瑄 MAXSUN', series: 'iCraft', cn: '电竞之心',
      brands: ['NVIDIA', 'Intel'], tier: 'flagship', minTbp: 150,
      powerMult: 1.04, ocMult: 1.10, bias: 'aggressive', length: 330, slots: 3.5 },
    { id: 'maxsun-turbo', vendor: '铭瑄 MAXSUN', series: 'Turbo', cn: '涡轮',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 300, slots: 2.5 },
    { id: 'maxsun-mega', vendor: '铭瑄 MAXSUN', series: 'Mega', cn: '巨无霸',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 280, slots: 2.5 },

    /* 同德 Palit */
    { id: 'palit-gamerock', vendor: '同德 Palit', series: 'GameRock', cn: '玩家力量',
      brands: ['NVIDIA'], tier: 'flagship', minTbp: 250,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 340, slots: 3.5 },
    { id: 'palit-gamingpro', vendor: '同德 Palit', series: 'GamingPro', cn: '游戏专家',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 300, slots: 2.5 },
    { id: 'palit-dual', vendor: '同德 Palit', series: 'Dual', cn: '双风扇',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 250, slots: 2.0 },

    /* PNY / 丽台 / 万丽 */
    { id: 'pny-xlr8', vendor: 'PNY', series: 'XLR8 Gaming', cn: 'XLR8',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 310, slots: 2.5 },
    { id: 'pny-verto', vendor: 'PNY', series: 'Verto', cn: 'Verto',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 280, slots: 2.5 },
    { id: 'leadtek-winfast', vendor: '丽台 Leadtek', series: 'WinFast', cn: 'WinFast',
      brands: ['NVIDIA'], tier: 'blower', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 267, slots: 2.0 },
    { id: 'manli-gallardo', vendor: '万丽 Manli', series: 'Gallardo', cn: '盖拉多',
      brands: ['NVIDIA'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 300, slots: 2.5 },
    { id: 'manli-nebula', vendor: '万丽 Manli', series: 'Nebula', cn: '星云',
      brands: ['NVIDIA'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.00, bias: 'conservative', length: 280, slots: 2.5 },

    /* --------------------------------------------------------- AMD 阵营 --
       ⚠️ 覆盖范围的核实结果见下方 COVERAGE 表。这里是系列本身的定位与功耗模型。 */
    { id: 'powercolor-liquid-devil', vendor: '撼讯 PowerColor', series: 'Liquid Devil', cn: '水魔',
      brands: ['AMD'], tier: 'halo', minTbp: 280, since: 2019, liquid: true, radiator: 360,
      powerMult: 1.12, ocMult: 1.08, bias: 'aggressive', length: 280, slots: 2.0 },
    { id: 'powercolor-red-devil', vendor: '撼讯 PowerColor', series: 'Red Devil', cn: '红魔',
      brands: ['AMD'], tier: 'flagship', minTbp: 180,
      powerMult: 1.09, ocMult: 1.03, bias: 'aggressive', length: 340, slots: 3.0,
      connector: '3× 8pin' },
    { id: 'powercolor-hellhound', vendor: '撼讯 PowerColor', series: 'Hellhound', cn: '暗黑犬',
      brands: ['AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.05, ocMult: 1.06, bias: 'moderate', length: 322, slots: 3.0 },
    { id: 'powercolor-reaper', vendor: '撼讯 PowerColor', series: 'Reaper', cn: '死神',
      brands: ['AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.04, bias: 'conservative', length: 300, slots: 2.5,
      note: '撼讯在 RX 9000 世代的入门款（替代以往的 Fighter），已核实覆盖 RX 9070 XT。' },
    { id: 'powercolor-fighter', vendor: '撼讯 PowerColor', series: 'Fighter', cn: '战将',
      brands: ['AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 270, slots: 2.0 },

    { id: 'sapphire-toxic', vendor: '蓝宝石 SAPPHIRE', series: 'TOXIC', cn: '毒药',
      brands: ['AMD'], tier: 'halo', minTbp: 280, since: 2019, liquid: true, radiator: 360,
      powerMult: 1.13, ocMult: 1.05, bias: 'aggressive', length: 280, slots: 2.0 },
    { id: 'sapphire-nitro-plus', vendor: '蓝宝石 SAPPHIRE', series: 'NITRO+', cn: '超白金',
      brands: ['AMD'], tier: 'flagship', minTbp: 180,
      powerMult: 1.09, ocMult: 1.03, bias: 'aggressive', length: 331, slots: 3.0,
      connector: '3× 8pin' },
    { id: 'sapphire-pulse', vendor: '蓝宝石 SAPPHIRE', series: 'PULSE', cn: '白金',
      brands: ['AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 280, slots: 2.5 },
    { id: 'sapphire-pure', vendor: '蓝宝石 SAPPHIRE', series: 'PURE', cn: '极光',
      brands: ['AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.06, bias: 'moderate', length: 300, slots: 2.5 },

    /* 华擎 ASRock —— 覆盖型号已按 asrock.com 官网型号表逐条核对（见
       docs/asrock-gpu-models.txt）。这是全库中覆盖范围唯一被逐条核实的厂商。 */
    { id: 'asrock-aqua', vendor: '华擎 ASRock', series: 'AQUA', cn: '水神',
      brands: ['AMD'], tier: 'halo', since: 2019, liquid: true, radiator: 360,
      onlyGpus: ['rx7900xtx'],
      powerMult: 1.12, ocMult: 1.08, bias: 'aggressive', length: 280, slots: 2.0,
      note: '华擎水冷旗舰系列。官网型号表显示仅 RX 7900 XTX AQUA 24GB OC 一款。' },
    { id: 'asrock-taichi', vendor: '华擎 ASRock', series: 'Taichi', cn: '太极',
      brands: ['AMD'], tier: 'flagship',
      onlyGpus: ['rx9070xt', 'rx7900xtx'],
      powerMult: 1.00, ocMult: 1.09, bias: 'moderate', length: 330, slots: 3.0,
      note: '官网型号表：RX 9070 XT Taichi（含白色版）与 RX 7900 XTX Taichi（含白色版）。' },
    { id: 'asrock-steel-legend', vendor: '华擎 ASRock', series: 'Steel Legend', cn: '钢铁传奇',
      brands: ['AMD', 'Intel'], tier: 'mainstream',
      onlyGpus: ['rx9070xt', 'rx9070', 'rx9060xt', 'rx7800xt', 'rx7600', 'arc-b580'],
      powerMult: 1.00, ocMult: 1.09, bias: 'moderate', length: 300, slots: 2.5,
      note: '官网型号表覆盖 RX 9070 XT / 9070 / 9060 XT / 7800 XT / 7600 与 Arc B580（含 Dark 版本）。' },
    { id: 'asrock-challenger', vendor: '华擎 ASRock', series: 'Challenger', cn: '挑战者',
      brands: ['AMD', 'Intel'], tier: 'value',
      onlyGpus: ['rx9070xt', 'rx9070', 'rx9060xt', 'rx7800xt', 'rx7600', 'arc-b580', 'arc-b570', 'arc-a770'],
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 270, slots: 2.0,
      note: '官网型号表覆盖最广的系列，横跨 Radon RX 9000 / 7000 与 Arc A/B 两代。' },
    { id: 'asrock-phantom-gaming', vendor: '华擎 ASRock', series: 'Phantom Gaming', cn: '幻影电竞',
      brands: ['AMD', 'Intel'], tier: 'mainstream',
      onlyGpus: ['arc-a770', 'arc-b580', 'arc-b570', 'rx7900xtx', 'rx7800xt', 'rx7600'],
      powerMult: 1.00, ocMult: 1.08, bias: 'moderate', length: 300, slots: 2.5,
      note: '官网型号表：用于 Arc A770 与 RX 7000 世代；RX 9000 世代华擎改用 Taichi / Steel Legend / Challenger。' },

    { id: 'xfx-mercury', vendor: '讯景 XFX', series: 'MERCURY', cn: '海外版',
      brands: ['AMD'], tier: 'flagship', minTbp: 180, since: 2019,
      powerMult: 1.09, ocMult: 1.09, bias: 'aggressive', length: 340, slots: 3.0,
      connector: '3× 8pin' },
    { id: 'xfx-qick', vendor: '讯景 XFX', series: 'QICK', cn: '快速版',
      brands: ['AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.06, bias: 'moderate', length: 273, slots: 2.5 },
    { id: 'xfx-swft', vendor: '讯景 XFX', series: 'SWFT', cn: '标准版',
      brands: ['AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 240, slots: 2.0 },

    { id: 'vastarmor-alloy', vendor: '瀚铠 VASTARMOR', series: '超合金', cn: '超合金',
      brands: ['AMD'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.02, ocMult: 1.08, bias: 'moderate', length: 310, slots: 3.0 },
    { id: 'vastarmor-alloy-pro', vendor: '瀚铠 VASTARMOR', series: '合金版', cn: '合金版',
      brands: ['AMD'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.05, bias: 'conservative', length: 280, slots: 2.5 },

    /* ------------------------------------------------------- Intel 阵营 -- */
    { id: 'gunnir-photon', vendor: '蓝戟 GUNNIR', series: 'Photon', cn: '光子',
      brands: ['Intel'], tier: 'flagship', minTbp: 150,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 300, slots: 2.5 },
    { id: 'gunnir-index', vendor: '蓝戟 GUNNIR', series: 'Index', cn: '索引',
      brands: ['Intel'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 280, slots: 2.0 },
    { id: 'gunnir-flux', vendor: '蓝戟 GUNNIR', series: 'Flux', cn: '通量',
      brands: ['Intel'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 250, slots: 2.0 },
    { id: 'sparkle-titan', vendor: '撼与 Sparkle', series: 'Titan', cn: '泰坦',
      brands: ['Intel'], tier: 'flagship', minTbp: 150,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 300, slots: 2.5 },
    { id: 'sparkle-orc', vendor: '撼与 Sparkle', series: 'Orc', cn: '兽人',
      brands: ['Intel'], tier: 'mainstream', minTbp: 0,
      powerMult: 1.00, ocMult: 1.06, bias: 'moderate', length: 270, slots: 2.0 },
    { id: 'sparkle-elf', vendor: '撼与 Sparkle', series: 'Elf', cn: '精灵',
      brands: ['Intel'], tier: 'value', minTbp: 0,
      powerMult: 1.00, ocMult: 1.03, bias: 'conservative', length: 250, slots: 2.0 },
    { id: 'acer-bifrost', vendor: '宏碁 Acer', series: 'BiFrost', cn: '双霜',
      brands: ['Intel'], tier: 'flagship', minTbp: 150,
      powerMult: 1.05, ocMult: 1.10, bias: 'aggressive', length: 300, slots: 2.5 }
  ];

  /* ============================================ 覆盖范围核实表 ============
   *  为什么需要这张表：
   *    规则生成器按「品牌 + TBP 区间」把系列组合到 GPU 上，于是会造出厂商
   *    **根本没发表过的型号**。实测到的例子：
   *      · 「华硕 ROG Strix RX 9070 XT」—— 不存在。ASUS 官网筛选
   *        ROG Strix + AMD 返回 0 项；RX 7000 与 RX 9000 都只有 TUF Gaming
   *        （RX 9000 另有 Prime）。依据 ASUS 官方新闻稿 2025-02-28。
   *      · 「技嘉 AORUS MASTER RX 9070 XT」—— 不存在。技嘉 RX 9070 XT 只有
   *        GAMING / GAMING OC / GAMING OC ICE / AORUS ELITE 四款。
   *      · 「华硕 ROG Strix RTX 5090」—— 不存在。5090 走 ROG Astral 与 TUF，
   *        5060 / 5060 Ti 只到 TUF / Prime / Dual。
   *
   *  表里的每一项都是**逐代核实过**的覆盖范围。没进这张表的系列表示
   *  尚未逐代核实，界面会把它们标成「按系列推算」而不是当作事实。
   *
   *  gens       世代白名单；不在名单里的世代一律不生成
   *  exceptGpus 同一世代里再排掉个别型号（厂商只做了其中一部分 SKU 时用）
   *  brands     纠正系列定义里的品牌范围
   * ======================================================================*/
  var COVERAGE = {
    /* ---------------------------------------------------------- 华硕 ASUS -- */
    /* Astral 只做 5090 与 5080（含对应的 50 SUPER）；5070 Ti / 5070 是 ROG Strix。
       minTbp:250 放行了 5070 Ti / 5070，所以必须在这里排掉。 */
    'asus-rog-astral': {
      gens: ['rtx50', 'rtx50super'],
      exceptGpus: ['rtx5070ti', 'rtx5070', 'rtx5070tisuper', 'rtx5070super']
    },
    /* Matrix 是 5090 独占的液冷 Halo（minTbp:500 已经卡住，这里显式记一笔） */
    'asus-rog-matrix': { gens: ['rtx50'] },
    'asus-rog-strix': {
      brands: ['NVIDIA', 'AMD'],
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10', 'gtx900',
             'rx6000', 'rx5000', 'rx500'],
      /* RTX 50 世代里 Strix 只做 5070 Ti / 5070：
         5090 / 5080 是 Astral 与 TUF，5060 / 5060 Ti 只到 TUF / Prime / Dual。 */
      exceptGpus: ['rtx5090', 'rtx5080', 'rtx5060ti', 'rtx5060']
    },
    'asus-tuf': {
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16',
             'rx9000', 'rx7000', 'rx6000', 'rx5000']
    },
    'asus-prime': {
      /* 5080 有 Prime，5090 没有（5090 走 Astral / TUF / ProArt）。 */
      gens: ['rtx50', 'rtx40', 'rx9000', 'rx7000'],
      exceptGpus: ['rtx5090']
    },
    'asus-dual': {
      /* RX 9000 上 Dual 只做 9060 XT；9070 XT / 9070 仅 TUF 与 Prime。
         NVIDIA 侧 Dual 是入门款，够不到 5090 / 5080 / 5070 Ti。 */
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10', 'gtx900',
             'rx9000', 'rx7000', 'rx6000', 'rx5000', 'rx500'],
      exceptGpus: ['rx9070xt', 'rx9070', 'rtx5090', 'rtx5080', 'rtx5070ti']
    },
    /* ProArt 是创作者线，只做 xx90 / xx80 档；5070 Ti / 5070 与 5060 系列都没有。 */
    'asus-proart': {
      gens: ['rtx50', 'rtx40', 'rtx30'],
      exceptGpus: ['rtx5070ti', 'rtx5070', 'rtx5060ti', 'rtx5060']
    },
    /* Turbo 是涡轮散热的工作站向系列，RTX 50 世代整代没做。 */
    'asus-turbo': { gens: ['rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10'] },

    /* ------------------------------------------------------ 技嘉 GIGABYTE -- */
    'gigabyte-aorus-master': {
      /* AORUS MASTER 没有任何 AMD 卡：RX 7900 XTX 与 RX 9070 XT 都只到 AORUS ELITE。
         另外 RTX 50 世代里 5060 Ti / 5060 也只到 AORUS ELITE。 */
      brands: ['NVIDIA'],
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20'],
      exceptGpus: ['rtx5060ti', 'rtx5060']
    },
    'gigabyte-aorus-elite': {
      /* ELITE 不是「只做顶级」的系列：RTX 5060 / 5060 Ti 与 RX 9070 XT 都有它。
         但 RTX 50 世代里 5090 / 5080 与 5070 Ti / 5070 都轮不到它，
         那几档是 AORUS MASTER / XTREME 与 GAMING OC / EAGLE。 */
      gens: ['rtx50', 'rtx40', 'rtx30', 'rx9000', 'rx7000'],
      exceptGpus: ['rtx5090', 'rtx5080', 'rtx5070ti', 'rtx5070']
    },
    'gigabyte-aorus-xtreme': { gens: ['rtx50', 'rtx40', 'rtx30'] },
    'gigabyte-gaming-oc': {
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'rx9000', 'rx7000', 'rx6000']
    },
    /* EAGLE 是中端，5090 / 5080 上没有。 */
    'gigabyte-eagle': {
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'rx7000', 'rx6000'],
      exceptGpus: ['rtx5090', 'rtx5080']
    },
    'gigabyte-windforce': {
      gens: ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10', 'gtx900',
             'rx7000', 'rx6000', 'rx5000']
    },
    /* AERO 是创作者线，5090 上没有。 */
    'gigabyte-aero': { gens: ['rtx50', 'rtx40', 'rtx30'], exceptGpus: ['rtx5090'] },

    /* --------------------------------------------------- 撼讯 PowerColor -- */
    'powercolor-red-devil': { gens: ['rx9000', 'rx7000', 'rx6000', 'rx5000'] },
    'powercolor-hellhound': { gens: ['rx9000', 'rx7000', 'rx6000'] },
    'powercolor-reaper': { gens: ['rx9000'] },
    'powercolor-liquid-devil': { gens: ['rx7000', 'rx6000', 'rx5000'] },
    'powercolor-fighter': { gens: ['rx7000', 'rx6000', 'rx5000', 'rx500'] },

    /* --------------------------------------------------- 蓝宝石 SAPPHIRE -- */
    'sapphire-toxic': { gens: ['rx6000', 'rx5000'] },
    'sapphire-nitro-plus': { gens: ['rx9000', 'rx7000', 'rx6000', 'rx5000'] },
    'sapphire-pulse': { gens: ['rx9000', 'rx7000', 'rx6000', 'rx5000', 'rx500'] },
    'sapphire-pure': { gens: ['rx9000', 'rx7000', 'rx6000'] },

    /* --------------------------------------------------- 瀚铠 VASTARMOR -- */
    'vastarmor-alloy': { gens: ['rx9000', 'rx7000', 'rx6000'] },
    'vastarmor-alloy-pro': { gens: ['rx9000', 'rx7000', 'rx6000'] }
  };

  SERIES.forEach(function (s) {
    var c = COVERAGE[s.id];
    if (!c) return;
    if (c.gens) s.gens = c.gens;
    if (c.exceptGpus) s.exceptGpus = c.exceptGpus;
    if (c.brands) s.brands = c.brands;
    s.coverageVerified = true;
  });

  /* ================================================ 中文名核实状态 ========
   *  这是最容易出错、也最容易被当成"官方"传播的信息，因此单独建模：
   *
   *    'official'    厂商中文站页面标题或官方新闻稿确认（可放心引用）
   *    'colloquial'  已确认只是玩家/媒体俗称，厂商官方并不使用
   *    'none'        厂商官方没有为该系列起中文名
   *    （未列出的系列一律为 'unverified'：按中文媒体/玩家习惯整理，未核实）
   *
   *  典型坑：
   *    · 华硕 ROG Astral 官方中文名是「夜神」，不是常被误写的「星曜」
   *    · 技嘉 gigabyte.cn 上完全没有中文系列名，超级雕/大雕/小雕/魔鹰等全是玩家俗称
   *    · 耕升中国区命名与全球市场完全不同（炫光/踏雪/追风 vs Phantom/Ghost/Python）
   * ======================================================================*/
  var CN_STATUS = {
    /* ---- 官方中文名 ---- */
    'asus-rog-astral': { cn: '夜神', type: 'official' },
    'asus-rog-strix': { cn: '猛禽', type: 'official' },
    'asus-tuf': { cn: '电竞特工', type: 'official' },
    'asus-prime': { cn: '大师', type: 'official' },
    'asus-proart': { cn: '创艺国度', type: 'official' },
    'msi-lightning-z': { cn: '闪电', type: 'official' },
    'msi-suprim': { cn: '超龙', type: 'official' },
    'msi-gaming-trio': { cn: '魔龙', type: 'official' },
    'msi-ventus': { cn: '万图师', type: 'official' },
    'msi-vanguard': { cn: '神龙', type: 'official' },
    'msi-shadow': { cn: '幻影师', type: 'official' },
    'msi-inspire': { cn: '硬派师', type: 'official' },
    'gainward-glare': { cn: '炫光', type: 'official' },
    'gainward-taxue': { cn: '踏雪', type: 'official' },
    'gainward-wind': { cn: '追风', type: 'official' },
    /* ---- 厂商官方无中文名 ---- */
    'asus-dual': { cn: '', type: 'none' },
    'asus-turbo': { cn: '', type: 'none' },
    'msi-aero': { cn: '', type: 'none' },
    'msi-expert': { cn: '', type: 'none' },
    'gigabyte-ai-top': { cn: '', type: 'none' },
    /* ---- 确认为玩家 / 媒体俗称 ---- */
    'asus-rog-matrix': { cn: '骇客', type: 'colloquial' },
    'asus-noctua': { cn: '猫头鹰联名', type: 'colloquial' },
    'gigabyte-aorus-xtreme': { cn: '超级雕', type: 'colloquial' },
    'gigabyte-aorus-master': { cn: '大雕', type: 'colloquial' },
    'gigabyte-aorus-elite': { cn: '小雕', type: 'colloquial' },
    'gigabyte-gaming-oc': { cn: '魔鹰', type: 'colloquial' },
    'gigabyte-eagle': { cn: '猎鹰', type: 'colloquial' },
    'gigabyte-windforce': { cn: '风魔', type: 'colloquial' }
  };

  /* 应用核实结果：覆盖 cn，并给每个系列打上 cnType */
  SERIES.forEach(function (s) {
    var st = CN_STATUS[s.id];
    if (st) { s.cn = st.cn; s.cnType = st.type; }
    else { s.cnType = 'unverified'; }
  });

  /* ================================================== 有确切数据的 SKU ====
   *  只有查到了官方规格或权威评测实测值的型号才写在这里。
   * ======================================================================*/
  var EXPLICIT = [
    /* ------------------------------------------------ NVIDIA RTX 5090 --- */
    { id: 'nvidia-fe-5090', gpuId: 'rtx5090', vendor: 'NVIDIA', series: 'Founders Edition',
      cn: '公版', sku: 'GeForce RTX 5090 FE', tier: 'flagship',
      tbp: 575, ocLimit: 575, ocBias: 'conservative', connector: '1× 12V-2x6',
      length: 304, slots: 2, recPsu: 1000, liquid: false,
      confidence: 'official', source: 'tpuGpuDb' },
    { id: 'asus-astral-5090', gpuId: 'rtx5090', vendor: '华硕 ASUS', series: 'ROG Astral',
      cn: '星曜', sku: 'ROG-ASTRAL-RTX5090-O32G-GAMING', tier: 'flagship',
      tbp: 600, ocLimit: 600, ocBias: 'aggressive', connector: '1× 12V-2x6 (+ 可选 GC-HPWR 背插)',
      length: 357.6, slots: 3.8, recPsu: 1000, liquid: false,
      confidence: 'review', source: 'asusAstral5090',
      note: 'ASUS 官方建议：整机全超频场景搭配 1000W 电源。3.8 槽厚度需注意遮挡下方 PCIe 插槽。' },
    { id: 'msi-lightning-z-5090', gpuId: 'rtx5090', vendor: '微星 MSI', series: 'Lightning Z',
      cn: '闪电', sku: 'RTX 5090 32G LIGHTNING Z', tier: 'halo',
      tbp: 800, ocLimit: 1000, ocBias: 'aggressive', connector: '2× 12V-2x6',
      length: 300, slots: 2.5, recPsu: 1600, liquid: true, radiator: 360,
      confidence: 'official', source: 'ithome5090lightning',
      note: 'CES 2026 发布，Lightning 系列时隔七年回归，全球限量 1300 张。40 相 VRM，' +
            '双 16-pin 12V-2x6（理论供电 1200W），默认功耗墙 800W，开启"极致"预设配合 360mm 水冷可解锁至 1000W。' +
            '微星官方建议整机电源不低于 1600W。LN2 超频峰值功耗突破 2500W（非日常使用场景）。' },
    { id: 'asus-rog-matrix-5090', gpuId: 'rtx5090', vendor: '华硕 ASUS', series: 'ROG Matrix',
      cn: '骇客', sku: 'ROG-MATRIX-RTX5090-P24G-GAMING', tier: 'halo',
      tbp: 800, ocLimit: 800, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 280, slots: 2.0, recPsu: 1200, liquid: true, radiator: 360,
      confidence: 'review', source: 'asusAstral5090',
      note: 'ROG 最高阶液冷型号，配 360mm 冷排，功耗墙 800W，是 50 系非公中最高档位之一。' },
    { id: 'msi-suprim-5090', gpuId: 'rtx5090', vendor: '微星 MSI', series: 'SUPRIM',
      cn: '超龙', sku: 'RTX 5090 32G SUPRIM SOC', tier: 'flagship',
      tbp: 600, ocLimit: 600, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 359, slots: 3.8, recPsu: 1000, liquid: false,
      confidence: 'review', source: 'tpuGpuDb' },
    { id: 'msi-trio-5090', gpuId: 'rtx5090', vendor: '微星 MSI', series: 'GAMING TRIO',
      cn: '魔龙', sku: 'RTX 5090 32G GAMING TRIO OC', tier: 'mainstream',
      tbp: 575, ocLimit: 600, ocBias: 'moderate', connector: '1× 12V-2x6',
      length: 337, slots: 3, recPsu: 1000, liquid: false,
      confidence: 'review', source: 'tpuGpuDb' },
    { id: 'gigabyte-aorus-5090', gpuId: 'rtx5090', vendor: '技嘉 GIGABYTE', series: 'AORUS MASTER',
      cn: '大雕', sku: 'GV-N5090AORUSM-32GD', tier: 'flagship',
      tbp: 600, ocLimit: 600, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 360, slots: 3.8, recPsu: 1000, liquid: false,
      confidence: 'review', source: 'tpuGpuDb' },
    { id: 'igame-vulcan-5090', gpuId: 'rtx5090', vendor: '七彩虹 iGame', series: 'Vulcan',
      cn: '火神', sku: 'iGame RTX 5090 Vulcan OC 32GB', tier: 'flagship',
      tbp: 600, ocLimit: 600, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 360, slots: 3.5, recPsu: 1000, liquid: false,
      confidence: 'estimate', source: 'tpuGpuDb' },
    { id: 'galax-hof-5090', gpuId: 'rtx5090', vendor: '影驰 GALAX', series: 'HOF OC Lab',
      cn: '名人堂 OC Lab', sku: 'RTX 5090 HOF OC Lab 32GB', tier: 'halo',
      tbp: 620, ocLimit: 700, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 340, slots: 3.5, recPsu: 1000, liquid: false,
      confidence: 'estimate', source: 'tpuGpuDb' },
    { id: 'zotac-amp-5090', gpuId: 'rtx5090', vendor: '索泰 ZOTAC', series: 'AMP EXTREME',
      cn: '玩家力量', sku: 'ZT-B50900F-10P', tier: 'flagship',
      tbp: 600, ocLimit: 600, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 356, slots: 3.5, recPsu: 1000, liquid: false,
      confidence: 'review', source: 'tpuGpuDb' },
    { id: 'asus-tuf-5090', gpuId: 'rtx5090', vendor: '华硕 ASUS', series: 'TUF Gaming',
      cn: '电竞特工', sku: 'TUF-RTX5090-O32G-GAMING', tier: 'mainstream',
      tbp: 575, ocLimit: 600, ocBias: 'moderate', connector: '1× 12V-2x6',
      length: 348, slots: 3.6, recPsu: 1000, liquid: false,
      confidence: 'estimate', source: 'asusAstral5090' },

    /* ------------------------------------------------ NVIDIA RTX 5080 --- */
    { id: 'nvidia-fe-5080', gpuId: 'rtx5080', vendor: 'NVIDIA', series: 'Founders Edition',
      cn: '公版', sku: 'GeForce RTX 5080 FE', tier: 'flagship',
      tbp: 360, ocLimit: 360, ocBias: 'conservative', connector: '1× 12V-2x6',
      length: 304, slots: 2, recPsu: 850, liquid: false,
      confidence: 'official', source: 'tpuGpuDb' },
    { id: 'asus-astral-5080', gpuId: 'rtx5080', vendor: '华硕 ASUS', series: 'ROG Astral',
      cn: '星曜', sku: 'ROG-ASTRAL-RTX5080-O16G-GAMING', tier: 'flagship',
      tbp: 400, ocLimit: 400, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 357.6, slots: 3.8, recPsu: 850, liquid: false,
      confidence: 'review', source: 'asusAstral5090',
      note: '与 5090 Astral 共用散热模具，PCB 功耗墙 400W。' },
    { id: 'msi-suprim-5080', gpuId: 'rtx5080', vendor: '微星 MSI', series: 'SUPRIM',
      cn: '超龙', sku: 'RTX 5080 16G SUPRIM SOC', tier: 'flagship',
      tbp: 400, ocLimit: 400, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 359, slots: 3.8, recPsu: 850, liquid: false,
      confidence: 'review', source: 'tpuGpuDb' },
    { id: 'igame-advanced-5080', gpuId: 'rtx5080', vendor: '七彩虹 iGame', series: 'Advanced OC',
      cn: '进阶', sku: 'iGame RTX 5080 Advanced OC 16GB', tier: 'mainstream',
      tbp: 360, ocLimit: 400, ocBias: 'moderate', connector: '1× 12V-2x6',
      length: 337, slots: 3, recPsu: 850, liquid: false,
      confidence: 'review', source: 'yesky200splus',
      note: '带一键超频按钮，按下后启用 OC 模式。' },

    /* --------------------------------------- NVIDIA RTX 5070 Ti / 5070 -- */
    { id: 'asus-tuf-5070ti', gpuId: 'rtx5070ti', vendor: '华硕 ASUS', series: 'TUF Gaming',
      cn: '电竞特工', sku: 'TUF-RTX5070TI-O16G-GAMING', tier: 'mainstream',
      tbp: 300, ocLimit: 330, ocBias: 'moderate', connector: '1× 12V-2x6',
      length: 302, slots: 3, recPsu: 750, liquid: false,
      confidence: 'estimate', source: 'tpuGpuDb' },
    { id: 'msi-trio-5070ti', gpuId: 'rtx5070ti', vendor: '微星 MSI', series: 'GAMING TRIO',
      cn: '魔龙', sku: 'RTX 5070 Ti 16G GAMING TRIO OC', tier: 'mainstream',
      tbp: 300, ocLimit: 330, ocBias: 'moderate', connector: '1× 12V-2x6',
      length: 338, slots: 3, recPsu: 750, liquid: false,
      confidence: 'estimate', source: 'tpuGpuDb' },

    /* ------------------------------------------------ NVIDIA RTX 5060 --- */
    { id: 'asus-dual-5060ti', gpuId: 'rtx5060ti', vendor: '华硕 ASUS', series: 'Dual',
      cn: '雪豹', sku: 'DUAL-RTX5060TI-O16G', tier: 'value',
      tbp: 180, ocLimit: 200, ocBias: 'moderate', connector: '1× 8pin',
      length: 227, slots: 2, recPsu: 550, liquid: false,
      confidence: 'estimate', source: 'tpuGpuDb' },

    /* ------------------------------------------- NVIDIA RTX 50 SUPER ----- */
    { id: 'asus-tuf-5080super', gpuId: 'rtx5080super', vendor: '华硕 ASUS', series: 'TUF Gaming',
      cn: '电竞特工', sku: 'TUF-RTX5080S-O24G-GAMING', tier: 'mainstream',
      tbp: 415, ocLimit: 450, ocBias: 'aggressive', connector: '1× 12V-2x6',
      length: 348, slots: 3.6, recPsu: 1000, liquid: false,
      confidence: 'leak', source: 'ithome50super',
      note: '注意：显卡本身未发布，规格纯属前瞻推演。' },

    /* ------------------------------------------------------ AMD RDNA 4 -- */
    { id: 'powercolor-reddevil-9070xt', gpuId: 'rx9070xt', vendor: '撼讯 PowerColor', series: 'Red Devil',
      cn: '红魔', sku: 'RX9070XT 16G-E/OC', tier: 'flagship',
      tbp: 330, ocLimit: 340, ocBias: 'aggressive', connector: '3× 8pin',
      length: 340, slots: 3, recPsu: 800, liquid: false,
      confidence: 'review', source: 'guru3d9070',
      note: '出厂功耗墙高于公版 304W，达 330W。' },
    { id: 'sapphire-nitro-9070xt', gpuId: 'rx9070xt', vendor: '蓝宝石 SAPPHIRE', series: 'NITRO+',
      cn: '超白金', sku: '11348-01-20G', tier: 'flagship',
      tbp: 330, ocLimit: 340, ocBias: 'aggressive', connector: '3× 8pin',
      length: 331, slots: 3, recPsu: 800, liquid: false,
      confidence: 'review', source: 'guru3d9070' },
    { id: 'asrock-taichi-9070xt', gpuId: 'rx9070xt', vendor: '华擎 ASRock', series: 'Taichi',
      cn: '太极', sku: 'RX9070XT TC 16GO', tier: 'flagship',
      tbp: 304, ocLimit: 330, ocBias: 'moderate', connector: '2× 8pin',
      length: 330, slots: 3, recPsu: 750, liquid: false,
      confidence: 'review', source: 'guru3d9070' },
    { id: 'gigabyte-gamingoc-9070xt', gpuId: 'rx9070xt', vendor: '技嘉 GIGABYTE', series: 'GAMING OC',
      cn: '魔鹰', sku: 'GV-R9070XTGAMINGOC-16GD', tier: 'mainstream',
      tbp: 304, ocLimit: 320, ocBias: 'moderate', connector: '2× 8pin',
      length: 288, slots: 2.5, recPsu: 750, liquid: false,
      confidence: 'estimate', source: 'guru3d9070' }
  ];

  /* ==================================================== SKU 生成器 ===== */
  function pickTierDefaults(tier) { return TIER_DEFAULT[tier] || TIER_DEFAULT.mainstream; }

  function connectorFor(gpu, s, ov) {
    if (ov.connector) return ov.connector;
    if (s.connector) return s.connector;
    if (/12V-?2x6|12VHPWR|16pin/i.test(gpu.connector || '')) return '1× 12V-2x6 (16pin)';
    return gpu.connector || '1× 8pin';
  }

  /* 中文名展示串：官方名直接显示，俗称与未核实分别标出，
     避免被当成官方名引用。由数据层算好，引擎与界面共用。 */
  function formatCn(cn, cnType) {
    if (!cn) return '';
    if (cnType === 'official') return '（' + cn + '）';
    if (cnType === 'colloquial') return '（' + cn + '·俗称）';
    if (cnType === 'unverified') return '（' + cn + '·未核实）';
    return '（' + cn + '）';
  }

  function build(gpus) {
    var gpuById = {};
    gpus.forEach(function (g) { gpuById[g.id] = g; });

    var out = [];
    var covered = {};   // gpuId|seriesId -> true，避免与手写条目重复

    /* 1. 手写条目优先（含真实来源） */
    EXPLICIT.forEach(function (e) {
      if (!gpuById[e.gpuId]) return;             // 引用了不存在的 GPU，跳过
      var s = SERIES.filter(function (x) { return x.id === e.seriesId; })[0];
      covered[e.gpuId + '|' + (e.series || '')] = true;
      out.push(e);
    });

    /* 2. 系列目录 × GPU 生成其余组合 */
    gpus.forEach(function (g) {
      SERIES.forEach(function (s) {
        if (s.brands.indexOf(g.brand) === -1) return;
        if (s.onlyGpus && s.onlyGpus.indexOf(g.id) === -1) return;
        /* 年代约束：系列不能长到它还不存在的年代。
           没有这条，2025 年才出现的 ROG Astral / 闪电 会被生成到 GTX 970 上，
           产出一堆现实中根本不存在的型号。 */
        if (s.since && g.year && g.year < s.since) return;
        /* 世代白名单：厂商根本没做这一代。
           例如华硕在 RDNA4（RX 9000）上只出 TUF Gaming 与 Prime，
           并没有 ROG Strix / Dual —— 实测「ASUS ROG Strix RX 9070 XT」
           这个型号根本不存在（依据 ASUS 官方新闻稿）。
           since 只能挡住「系列还没诞生」的年代，挡不住「这一代没做」，
           而 TBP 区间又会把 9070 XT 和 9070 一起误伤，所以需要按世代精确声明。 */
        if (s.gens && s.gens.indexOf(g.gen) === -1) return;
        if (s.exceptGpus && s.exceptGpus.indexOf(g.id) !== -1) return;
        if (g.tbp < (s.minTbp || 0)) return;
        if (s.maxTbp != null && g.tbp > s.maxTbp) return;

        var key = g.id + '|' + s.series;
        if (covered[key]) return;

        // 若该 GPU + 该系列已有手写条目（按 vendor+series 判定），跳过
        var dup = out.some(function (o) {
          return o.gpuId === g.id && o.vendor === s.vendor && o.series === s.series;
        });
        if (dup) return;

        var d = pickTierDefaults(s.tier);
        var tbp = Math.round(g.tbp * (s.powerMult != null ? s.powerMult : d.powerMult));
        var ocLimit = Math.round(tbp * (s.ocMult != null ? s.ocMult : d.ocMult));
        if (ocLimit < tbp) ocLimit = tbp;

        var isLiquid = !!s.liquid;
        out.push({
          id: 'gen-' + s.id + '-' + g.id,
          gpuId: g.id,
          vendor: s.vendor,
          series: s.series,
          cn: s.cn,
          cnType: s.cnType,
          sku: s.series + ' ' + g.name.replace(/^(GeForce|Radeon|Arc)\s+/, ''),
          tier: s.tier,
          tbp: tbp,
          ocLimit: ocLimit,
          ocBias: s.bias || 'moderate',
          connector: connectorFor(g, s, {}),
          length: s.length != null ? s.length : d.length,
          slots: s.slots != null ? s.slots : d.slots,
          recPsu: s.recPsu || null,
          liquid: isLiquid,
          radiator: s.radiator || (isLiquid ? 360 : 0),
          generated: true,
          /* 这个型号本身是否经过核实存在。
             coverageVerified 表示「该系列在这一代确实做这个型号」已逐代查证
             （见 COVERAGE 表）；没有这个标记的只是按系列定位推算出来的组合，
             界面必须把它与已核实的型号区分开，不能当成事实展示。 */
          coverageVerified: !!s.coverageVerified,
          confidence: 'estimate',
          source: null,                 // 功耗墙是推算值，绝不伪造数据来源
          seriesSource: s.source || null, // 系列名称本身的来源（若有）
          note: '功耗墙由「' + TIER_LABEL[s.tier] + '」定位规则推算（公版 ' + g.tbp +
                'W × ' + (s.powerMult != null ? s.powerMult : d.powerMult) + '），非厂商实测值。' +
                (s.note ? ' ' + s.note : '')
        });
      });
    });

    /* 统一补全中文名展示串。
       中文名以【系列目录 SERIES】为唯一权威来源——EXPLICIT 条目里的 cn 一律被覆盖，
       避免两处各写一份导致不一致（初版就出现过 EXPLICIT 里残留「星曜」的情况）。
       cnType 也必须继承，否则「骇客」「大雕」会被误显示成官方中文名。 */
    return out.map(function (a) {
      var s = null;
      for (var i = 0; i < SERIES.length; i++) {
        if (SERIES[i].vendor === a.vendor && SERIES[i].series === a.series) { s = SERIES[i]; break; }
      }
      if (s) {
        a.cn = s.cn;
        a.cnType = s.cnType;
      } else if (a.cnType == null) {
        a.cnType = a.cn ? 'unverified' : 'none';
      }
      a.cnLabel = formatCn(a.cn, a.cnType);
      return a;
    });
  }

  root.HWDB_AIB = {
    series: SERIES,
    explicit: EXPLICIT,
    tierDefaults: TIER_DEFAULT,
    tierLabel: TIER_LABEL,
    build: build,

    /* ---------------------------------------------------------------------
     *  数据可靠性声明 —— 必须在界面上如实展示
     *
     *  EXPLICIT 层（%n% 条）有官方规格或权威评测来源，可以依赖。
     *  SERIES 层的功耗墙全部是规则推算值；而且**系列名称与覆盖型号的准确性
     *  只经过部分核实**，属于按领域知识整理的目录，不是逐条查证的结果。
     *
     *  已知的具体核实情况：
     *    ✅ 微星 Lightning Z（闪电）：RTX 5090 规格已核实（官方发布信息）
     *    ✅ 耕升中国区系列名：炫光 / 踏雪 / 追风（超能网报道），
     *       早期误写为全球市场的 Phantom/Ghost/Python，已修正
     *    ❌ 七彩虹 Kudan（九段）：未发现 RTX 50 系产品，已从目录移除
     *    ✅ 华硕 / 技嘉 / 撼讯 / 蓝宝石 / 华擎 / 瀚铠 的**世代级覆盖范围**已核实
     *       （见 COVERAGE 表）：原先会生成「华硕 ROG Strix RX 9070 XT」这类
     *       厂商根本没发表的型号，现已按官方新闻稿与产品页逐代收紧
     *    ⚠️ 其余厂商（尤其中国区品牌）的系列名与覆盖型号：未逐条核实
     * ------------------------------------------------------------------- */
    catalogMeta: {
      explicitCount: EXPLICIT.length,
      seriesCount: SERIES.length,
      coverageVerifiedCount: SERIES.filter(function (s) { return s.coverageVerified; }).length,
      cnOfficialCount: SERIES.filter(function (s) { return s.cnType === 'official'; }).length,
      cnColloquialCount: SERIES.filter(function (s) { return s.cnType === 'colloquial'; }).length,
      cnUnverifiedCount: SERIES.filter(function (s) { return s.cnType === 'unverified'; }).length,
      verified: [
        '微星 Lightning Z（闪电）5090 —— 官方新闻稿：双 12V-2x6、最高 1000W、全球限量 1300 张',
        '华擎 ASRock 全部系列的覆盖型号 —— 逐条核对 asrock.com 官网型号表（见 docs/asrock-gpu-models.txt）',
        '华硕 / 技嘉 / 撼讯 / 蓝宝石 / 瀚铠 的世代级覆盖范围 —— 依据厂商官方新闻稿与产品页（见 COVERAGE 表）',
        '华硕官方中文名：ROG Astral=夜神 / ROG STRIX=猛禽 / TUF=电竞特工 / PRIME=大师 / ProArt=创艺国度',
        '微星官方中文名：闪电 / 超龙 / 魔龙 / 万图师 / 神龙 / 幻影师 / 硬派师',
        '耕升中国区命名：炫光 / 踏雪 / 追风'
      ],
      corrected: [
        '微星闪电 5090 规格（原 700W/OC 800W/风冷/建议 1200W → 800W/极致 1000W/360 水冷/建议 1600W）',
        '华硕 ROG Astral 中文名（原「星曜」→ 官方「夜神」）',
        /* ---- 覆盖范围核实：删掉厂商根本没做的组合 ---- */
        '华硕 ROG Strix 的 AMD 覆盖（原包含 RX 7000 / RX 9000 → 官方筛选 0 项，已移除）',
        '华硕 RX 9000 系列（原含 ROG Strix / Dual → 9070 XT / 9070 仅 TUF Gaming 与 Prime）',
        '华硕 ROG Astral 覆盖（原含 5070 Ti / 5070 → 只做 5090 / 5080 及其 SUPER）',
        '技嘉 AORUS MASTER 的 AMD 覆盖（原含 RX 7000 / RX 9000 → AORUS MASTER 无任何 AMD 卡）',
        '技嘉 RX 9070 XT 型号（原含 AORUS MASTER / EAGLE / WINDFORCE → 仅 GAMING OC 与 AORUS ELITE）',
        '撼讯 RX 9070 XT 型号（原含 Liquid Devil / Fighter → 实际是 Red Devil / Hellhound / Reaper，已补 Reaper 系列）',
        '微星 INSPIRE 中文名（原「硬派」→ 官方「硬派师」）',
        '华硕 DUAL / TURBO 中文名（原「雪豹」/「涡轮」→ 官方无中文名，已清空）',
        '技嘉中文名（原当作官方名 → 实为玩家俗称，已标注）',
        '技嘉 AI TOP（原列为 NVIDIA 系列 → 实为 AMD 的 Radeon AI PRO R9700，属工作站卡，已移除）',
        '技嘉 AORUS XTREME（原按风冷建模 → 实为 WATERFORCE 水冷，已改）',
        '华硕 Noctua Edition（原覆盖 5080~5090 → 经核实仅 RTX 5080，已加 maxTbp 限定）',
        '耕升系列名（原 Phantom/Ghost/Python → 中国区 炫光/踏雪/追风）',
        '七彩虹 Kudan 已移除（未发现 RTX 50 系产品）'
      ],
      unverifiedNote: '除已核实项外，AIC 系列目录（覆盖型号、散热形态、尺寸）' +
                      '是按领域知识整理的，未逐条查证；功耗墙为规则推算值。' +
                      '中文名分为「官方 / 俗称 / 未核实」三态，列表中已分别标注。' +
                      '选购前请以厂商官网规格页为准。'
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
