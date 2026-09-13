/* ============================================================================
 *  桌面处理器功耗数据库  ——  民用级全覆盖
 * ----------------------------------------------------------------------------
 *  覆盖范围：
 *    Intel  LGA1851 (Core Ultra 200S / 200S Plus)
 *           LGA1700 (第 12 / 13 / 14 代)
 *           LGA1200 (第 10 / 11 代)
 *    AMD    AM5 (Ryzen 9000 / 8000G / 7000)
 *           AM4 (Ryzen 5000 / 3000 / 2000 / 1000)
 *
 *  不在范围内（需求限定"民用级"）：
 *    HEDT / 工作站平台 —— Threadripper (sTR5/sWRX8)、Xeon W、EPYC。
 *    这些平台使用独立插槽与主板，与消费级 DIY 装机不是同一类需求。
 *    若要纳入，需要同时补充 sTR5 主板与其功耗模型。
 *
 *  列格式（便于横向比对，勿随意调整顺序）：
 *    [id, 名称, 别名, 核心, PBP/TDP, MTP/PPT, 解锁功耗墙建议值,
 *     核显, 上市, 参考价, 是否可超频, 备注, 置信度覆盖(可选)]
 *
 *  第 13 列用于覆盖 block 级的默认置信度。典型场景：TDP 是官方值但 PPT 来自爆料，
 *  此时整条记为 'review' 比记为 'official' 更诚实。
 * ==========================================================================*/
(function (root) {
  'use strict';

  function block(cfg, rows) {
    return rows.map(function (r) {
      return {
        id: r[0], brand: cfg.brand, family: cfg.family, socket: cfg.socket,
        name: r[1], alias: r[2], cores: r[3],
        tdp: r[4], maxTurbo: r[5], ocPeak: r[6] || r[5],
        memMax: cfg.memMax, igpu: r[7],
        released: r[8], price: r[9] || 0,
        unlocked: r[10] !== false,
        confidence: r[12] || cfg.confidence || 'official',
        source: cfg.source,
        segment: 'mainstream',
        note: r[11] || ''
      };
    });
  }

  /* ======================================================= Intel 平台 ==== */
  var INTEL = [];

  /* --------------------------- Core Ultra 200S Plus (Arrow Lake Refresh) */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core Ultra 200S Plus (Arrow Lake Refresh)',
    socket: 'LGA1851', memMax: 'DDR5-7200', source: 'yesky200splus'
  }, [
    ['cu7-270kp', 'Core Ultra 7 270K Plus', '270KP', '24C/24T (8P+16E)', 125, 250, 300, true, '2026-03', 2499, true,
      'P核睿频 5.5GHz / E核 4.7GHz / 36MB L3。用户常称"Ultra 9 270KP"，实际官方名为 Core Ultra 7 270K Plus。'],
    ['cu5-250kp', 'Core Ultra 5 250K Plus', '250KP', '18C/18T (6P+12E)', 125, 159, 200, true, '2026-03', 1699, true,
      'P核最高 5.3GHz / 30MB L3。'],
    ['cu5-250kf', 'Core Ultra 5 250KF Plus', '250KFP', '18C/18T (6P+12E)', 125, 159, 200, false, '2026-03', 1549, true,
      '无核显版本。']
  ]));

  /* ------------------------------------------- Core Ultra 200S (Arrow Lake) */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core Ultra 200S (Arrow Lake)',
    socket: 'LGA1851', memMax: 'DDR5-6400', source: 'intelArk'
  }, [
    ['cu9-285k', 'Core Ultra 9 285K', '285K', '24C/24T (8P+16E)', 125, 250, 295, true, '2024-10', 4299, true],
    ['cu9-285', 'Core Ultra 9 285', '285', '24C/24T (8P+16E)', 65, 182, 182, true, '2025-01', 3799, false,
      '非 K 型号，倍频锁定；PL2 182W 即为实际上限。'],
    ['cu9-285t', 'Core Ultra 9 285T', '285T', '24C/24T (8P+16E)', 35, 112, 112, true, '2025-01', 0, false,
      '35W 低功耗版，主要面向 OEM 整机。'],
    ['cu7-265k', 'Core Ultra 7 265K', '265K', '20C/20T (8P+12E)', 125, 250, 290, true, '2024-10', 2899, true],
    ['cu7-265kf', 'Core Ultra 7 265KF', '265KF', '20C/20T (8P+12E)', 125, 250, 290, false, '2024-10', 2799, true],
    ['cu7-265', 'Core Ultra 7 265', '265', '20C/20T (8P+12E)', 65, 182, 182, true, '2025-01', 2499, false],
    ['cu7-265t', 'Core Ultra 7 265T', '265T', '20C/20T (8P+12E)', 35, 112, 112, true, '2025-01', 0, false],
    ['cu5-245k', 'Core Ultra 5 245K', '245K', '14C/14T (6P+8E)', 125, 159, 190, true, '2024-10', 2199, true],
    ['cu5-245kf', 'Core Ultra 5 245KF', '245KF', '14C/14T (6P+8E)', 125, 159, 190, false, '2024-10', 2099, true],
    ['cu5-245', 'Core Ultra 5 245', '245', '14C/14T (6P+8E)', 65, 121, 121, true, '2025-01', 1799, false],
    ['cu5-235', 'Core Ultra 5 235', '235', '14C/14T (6P+8E)', 65, 121, 121, true, '2025-01', 1599, false],
    ['cu5-225', 'Core Ultra 5 225', '225', '10C/10T (6P+4E)', 65, 121, 121, true, '2025-01', 1399, false],
    ['cu5-225f', 'Core Ultra 5 225F', '225F', '10C/10T (6P+4E)', 65, 121, 121, false, '2025-01', 1299, false]
  ]));

  /* ------------------------------------------------- 第 14 代 Raptor Lake */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core 14 代 (Raptor Lake Refresh)',
    socket: 'LGA1700', memMax: 'DDR5-5600 / DDR4-3200', source: 'intelArk'
  }, [
    ['i9-14900ks', 'Core i9-14900KS', '14900KS', '24C/32T (8P+16E)', 150, 253, 350, true, '2024-03', 4799, true,
      '6.0GHz 特挑版，官方 PBP 提升到 150W。'],
    ['i9-14900k', 'Core i9-14900K', '14900K', '24C/32T (8P+16E)', 125, 253, 330, true, '2023-10', 3899, true,
      'PL2 253W 为官方默认；解除功耗墙后实测可达 300W+。'],
    ['i9-14900kf', 'Core i9-14900KF', '14900KF', '24C/32T (8P+16E)', 125, 253, 330, false, '2023-10', 3599, true],
    ['i9-14900', 'Core i9-14900', '14900', '24C/32T (8P+16E)', 65, 219, 219, true, '2024-01', 3299, false],
    ['i9-14900f', 'Core i9-14900F', '14900F', '24C/32T (8P+16E)', 65, 219, 219, false, '2024-01', 3199, false],
    ['i9-14900t', 'Core i9-14900T', '14900T', '24C/32T (8P+16E)', 35, 106, 106, true, '2024-01', 0, false],
    ['i7-14700k', 'Core i7-14700K', '14700K', '20C/28T (8P+12E)', 125, 253, 300, true, '2023-10', 2799, true],
    ['i7-14700kf', 'Core i7-14700KF', '14700KF', '20C/28T (8P+12E)', 125, 253, 300, false, '2023-10', 2599, true],
    ['i7-14700', 'Core i7-14700', '14700', '20C/28T (8P+12E)', 65, 219, 219, true, '2024-01', 2399, false],
    ['i7-14700f', 'Core i7-14700F', '14700F', '20C/28T (8P+12E)', 65, 219, 219, false, '2024-01', 2299, false],
    ['i5-14600k', 'Core i5-14600K', '14600K', '14C/20T (6P+8E)', 125, 181, 220, true, '2023-10', 1899, true],
    ['i5-14600kf', 'Core i5-14600KF', '14600KF', '14C/20T (6P+8E)', 125, 181, 220, false, '2023-10', 1799, true],
    ['i5-14600', 'Core i5-14600', '14600', '14C/20T (6P+8E)', 65, 154, 154, true, '2024-01', 1699, false],
    ['i5-14500', 'Core i5-14500', '14500', '14C/20T (6P+8E)', 65, 154, 154, true, '2024-01', 1499, false],
    ['i5-14400', 'Core i5-14400', '14400', '10C/16T (6P+4E)', 65, 148, 148, true, '2024-01', 1299, false],
    ['i5-14400f', 'Core i5-14400F', '14400F', '10C/16T (6P+4E)', 65, 148, 148, false, '2024-01', 1199, false],
    ['i5-14400t', 'Core i5-14400T', '14400T', '10C/16T (6P+4E)', 35, 82, 82, true, '2024-01', 0, false],
    ['i3-14100', 'Core i3-14100', '14100', '4C/8T', 60, 110, 110, true, '2024-01', 899, false],
    ['i3-14100f', 'Core i3-14100F', '14100F', '4C/8T', 60, 110, 110, false, '2024-01', 799, false],
    ['i3-14100t', 'Core i3-14100T', '14100T', '4C/8T', 35, 69, 69, true, '2024-01', 0, false],
    ['intel-300', 'Intel Processor 300', '300', '2C/4T', 46, 46, 46, true, '2024-01', 599, false,
      '入门级，用于替代奔腾系列。']
  ]));

  /* ------------------------------------------------- 第 13 代 Raptor Lake */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core 13 代 (Raptor Lake)',
    socket: 'LGA1700', memMax: 'DDR5-5600 / DDR4-3200', source: 'intelArk'
  }, [
    ['i9-13900ks', 'Core i9-13900KS', '13900KS', '24C/32T (8P+16E)', 150, 253, 350, true, '2023-01', 5299, true],
    ['i9-13900k', 'Core i9-13900K', '13900K', '24C/32T (8P+16E)', 125, 253, 330, true, '2022-10', 4299, true],
    ['i9-13900kf', 'Core i9-13900KF', '13900KF', '24C/32T (8P+16E)', 125, 253, 330, false, '2022-10', 3999, true],
    ['i9-13900', 'Core i9-13900', '13900', '24C/32T (8P+16E)', 65, 219, 219, true, '2023-01', 3699, false],
    ['i9-13900f', 'Core i9-13900F', '13900F', '24C/32T (8P+16E)', 65, 219, 219, false, '2023-01', 3499, false],
    ['i7-13700k', 'Core i7-13700K', '13700K', '16C/24T (8P+8E)', 125, 253, 300, true, '2022-10', 2999, true],
    ['i7-13700kf', 'Core i7-13700KF', '13700KF', '16C/24T (8P+8E)', 125, 253, 300, false, '2022-10', 2799, true],
    ['i7-13700', 'Core i7-13700', '13700', '16C/24T (8P+8E)', 65, 219, 219, true, '2023-01', 2599, false],
    ['i7-13700f', 'Core i7-13700F', '13700F', '16C/24T (8P+8E)', 65, 219, 219, false, '2023-01', 2499, false],
    ['i5-13600k', 'Core i5-13600K', '13600K', '14C/20T (6P+8E)', 125, 181, 220, true, '2022-10', 2099, true],
    ['i5-13600kf', 'Core i5-13600KF', '13600KF', '14C/20T (6P+8E)', 125, 181, 220, false, '2022-10', 1999, true],
    ['i5-13600', 'Core i5-13600', '13600', '14C/20T (6P+8E)', 65, 154, 154, true, '2023-01', 1799, false],
    ['i5-13500', 'Core i5-13500', '13500', '14C/20T (6P+8E)', 65, 154, 154, true, '2023-01', 1599, false],
    ['i5-13400', 'Core i5-13400', '13400', '10C/16T (6P+4E)', 65, 148, 148, true, '2023-01', 1399, false],
    ['i5-13400f', 'Core i5-13400F', '13400F', '10C/16T (6P+4E)', 65, 148, 148, false, '2023-01', 1299, false],
    ['i5-13490f', 'Core i5-13490F', '13490F', '10C/16T (6P+4E)', 65, 148, 148, false, '2023-02', 1249, false,
      '中国大陆特供型号。'],
    ['i3-13100', 'Core i3-13100', '13100', '4C/8T', 60, 110, 110, true, '2023-01', 999, false],
    ['i3-13100f', 'Core i3-13100F', '13100F', '4C/8T', 60, 110, 110, false, '2023-01', 899, false]
  ]));

  /* ------------------------------------------------- 第 12 代 Alder Lake */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core 12 代 (Alder Lake)',
    socket: 'LGA1700', memMax: 'DDR5-4800 / DDR4-3200', source: 'intelArk'
  }, [
    ['i9-12900ks', 'Core i9-12900KS', '12900KS', '16C/24T (8P+8E)', 150, 241, 300, true, '2022-04', 4999, true],
    ['i9-12900k', 'Core i9-12900K', '12900K', '16C/24T (8P+8E)', 125, 241, 290, true, '2021-11', 4299, true],
    ['i9-12900kf', 'Core i9-12900KF', '12900KF', '16C/24T (8P+8E)', 125, 241, 290, false, '2021-11', 3899, true],
    ['i9-12900', 'Core i9-12900', '12900', '16C/24T (8P+8E)', 65, 202, 202, true, '2022-01', 3599, false],
    ['i9-12900f', 'Core i9-12900F', '12900F', '16C/24T (8P+8E)', 65, 202, 202, false, '2022-01', 3299, false],
    ['i7-12700k', 'Core i7-12700K', '12700K', '12C/20T (8P+4E)', 125, 190, 240, true, '2021-11', 2799, true],
    ['i7-12700kf', 'Core i7-12700KF', '12700KF', '12C/20T (8P+4E)', 125, 190, 240, false, '2021-11', 2599, true],
    ['i7-12700', 'Core i7-12700', '12700', '12C/20T (8P+4E)', 65, 180, 180, true, '2022-01', 2399, false],
    ['i7-12700f', 'Core i7-12700F', '12700F', '12C/20T (8P+4E)', 65, 180, 180, false, '2022-01', 2199, false],
    ['i5-12600k', 'Core i5-12600K', '12600K', '10C/16T (6P+4E)', 125, 150, 190, true, '2021-11', 1999, true],
    ['i5-12600kf', 'Core i5-12600KF', '12600KF', '10C/16T (6P+4E)', 125, 150, 190, false, '2021-11', 1799, true],
    ['i5-12600', 'Core i5-12600', '12600', '6C/12T', 65, 117, 117, true, '2022-01', 1599, false,
      '无能效核，纯 6 性能核。'],
    ['i5-12490f', 'Core i5-12490F', '12490F', '6C/12T', 65, 117, 117, false, '2022-01', 1099, false,
      '中国大陆特供型号，频率略高于 12400F。'],
    ['i5-12400', 'Core i5-12400', '12400', '6C/12T', 65, 117, 117, true, '2022-01', 1299, false],
    ['i5-12400f', 'Core i5-12400F', '12400F', '6C/12T', 65, 117, 117, false, '2022-01', 1099, false,
      '长期占据性价比装机首选位置。'],
    ['i3-12100', 'Core i3-12100', '12100', '4C/8T', 60, 89, 89, true, '2022-01', 899, false],
    ['i3-12100f', 'Core i3-12100F', '12100F', '4C/8T', 60, 89, 89, false, '2022-01', 699, false],
    ['pentium-g7400', 'Pentium Gold G7400', 'G7400', '2C/4T', 46, 46, 46, true, '2022-01', 599, false],
    ['celeron-g6900', 'Celeron G6900', 'G6900', '2C/2T', 46, 46, 46, true, '2022-01', 399, false]
  ]));

  /* ------------------------------------------------ 第 11 代 Rocket Lake */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core 11 代 (Rocket Lake)',
    socket: 'LGA1200', memMax: 'DDR4-3200', source: 'intelArk'
  }, [
    ['i9-11900k', 'Core i9-11900K', '11900K', '8C/16T', 125, 251, 290, true, '2021-03', 3999, true],
    ['i9-11900kf', 'Core i9-11900KF', '11900KF', '8C/16T', 125, 251, 290, false, '2021-03', 3699, true],
    ['i9-11900', 'Core i9-11900', '11900', '8C/16T', 65, 224, 224, true, '2021-03', 3299, false],
    ['i9-11900f', 'Core i9-11900F', '11900F', '8C/16T', 65, 224, 224, false, '2021-03', 3099, false],
    ['i7-11700k', 'Core i7-11700K', '11700K', '8C/16T', 125, 251, 280, true, '2021-03', 2699, true],
    ['i7-11700kf', 'Core i7-11700KF', '11700KF', '8C/16T', 125, 251, 280, false, '2021-03', 2499, true],
    ['i7-11700', 'Core i7-11700', '11700', '8C/16T', 65, 224, 224, true, '2021-03', 2299, false],
    ['i7-11700f', 'Core i7-11700F', '11700F', '8C/16T', 65, 224, 224, false, '2021-03', 2199, false],
    ['i5-11600k', 'Core i5-11600K', '11600K', '6C/12T', 125, 224, 250, true, '2021-03', 1799, true],
    ['i5-11600kf', 'Core i5-11600KF', '11600KF', '6C/12T', 125, 224, 250, false, '2021-03', 1599, true],
    ['i5-11400', 'Core i5-11400', '11400', '6C/12T', 65, 154, 154, true, '2021-03', 1299, false],
    ['i5-11400f', 'Core i5-11400F', '11400F', '6C/12T', 65, 154, 154, false, '2021-03', 1099, false]
  ]));

  /* ------------------------------------------------- 第 10 代 Comet Lake */
  INTEL = INTEL.concat(block({
    brand: 'Intel', family: 'Core 10 代 (Comet Lake)',
    socket: 'LGA1200', memMax: 'DDR4-2933', source: 'intelArk'
  }, [
    ['i9-10900k', 'Core i9-10900K', '10900K', '10C/20T', 125, 250, 300, true, '2020-05', 3899, true],
    ['i9-10900kf', 'Core i9-10900KF', '10900KF', '10C/20T', 125, 250, 300, false, '2020-05', 3599, true],
    ['i9-10900', 'Core i9-10900', '10900', '10C/20T', 65, 224, 224, true, '2020-05', 3299, false],
    ['i9-10900f', 'Core i9-10900F', '10900F', '10C/20T', 65, 224, 224, false, '2020-05', 3099, false],
    ['i7-10700k', 'Core i7-10700K', '10700K', '8C/16T', 125, 229, 270, true, '2020-05', 2599, true],
    ['i7-10700kf', 'Core i7-10700KF', '10700KF', '8C/16T', 125, 229, 270, false, '2020-05', 2399, true],
    ['i7-10700', 'Core i7-10700', '10700', '8C/16T', 65, 224, 224, true, '2020-05', 2299, false],
    ['i7-10700f', 'Core i7-10700F', '10700F', '8C/16T', 65, 224, 224, false, '2020-05', 2099, false],
    ['i5-10600k', 'Core i5-10600K', '10600K', '6C/12T', 125, 182, 220, true, '2020-05', 1699, true],
    ['i5-10600kf', 'Core i5-10600KF', '10600KF', '6C/12T', 125, 182, 220, false, '2020-05', 1499, true],
    ['i5-10400', 'Core i5-10400', '10400', '6C/12T', 65, 134, 134, true, '2020-05', 1199, false],
    ['i5-10400f', 'Core i5-10400F', '10400F', '6C/12T', 65, 134, 134, false, '2020-05', 899, false],
    ['i3-10105', 'Core i3-10105', '10105', '4C/8T', 65, 90, 90, true, '2021-03', 699, false],
    ['i3-10100', 'Core i3-10100', '10100', '4C/8T', 65, 90, 90, true, '2020-05', 799, false],
    ['i3-10100f', 'Core i3-10100F', '10100F', '4C/8T', 65, 90, 90, false, '2020-10', 599, false]
  ]));

  /* ========================================================= AMD 平台 ==== */
  var AMD = [];

  /* ---------------------------------------------------- AM5 Ryzen 9000 -- */
  AMD = AMD.concat(block({
    brand: 'AMD', family: 'Ryzen 9000 (Zen 5)',
    socket: 'AM5', memMax: 'DDR5-6400 (EXPO)', source: 'amdSpec'
  }, [
    ['r9-9950x3d2', 'Ryzen 9 9950X3D2 Dual Edition', '9950X3D2', '16C/32T', 200, 250, 300, true, '2026-04', 7199, true,
      'AMD 首款双 CCD 堆叠 3D V-Cache（每 CCD 64MB，总缓存 208MB）。' +
      'TDP 200W 为 AMD 官网标注值，也是 AM5 桌面最高；' +
      'PPT 250W 来自爆料（较 9950X3D 高 50W），AMD 官网并不公布 PPT 数值，' +
      '泄露的 HWBOT 测试显示默认风冷下最大功耗约 220W。'],
    ['r9-9950x3d', 'Ryzen 9 9950X3D', '9950X3D', '16C/32T', 170, 230, 270, true, '2025-03', 4599, true],
    ['r9-9900x3d', 'Ryzen 9 9900X3D', '9900X3D', '12C/24T', 120, 162, 200, true, '2025-03', 3499, true],
    ['r9-9950x', 'Ryzen 9 9950X', '9950X', '16C/32T', 170, 230, 280, true, '2024-08', 3999, true],
    ['r9-9900x', 'Ryzen 9 9900X', '9900X', '12C/24T', 120, 162, 200, true, '2024-08', 2999, true],
    ['r7-9800x3d', 'Ryzen 7 9800X3D', '9800X3D', '8C/16T', 120, 162, 200, true, '2024-11', 2999, true,
      '首款开放超频的 X3D 型号。'],
    ['r7-9700x', 'Ryzen 7 9700X', '9700X', '8C/16T', 65, 88, 142, true, '2024-08', 2199, true],
    ['r5-9600x', 'Ryzen 5 9600X', '9600X', '6C/12T', 65, 88, 142, true, '2024-08', 1499, true],
    ['r5-9600', 'Ryzen 5 9600', '9600', '6C/12T', 65, 88, 142, true, '2025-01', 1299, true],
    ['r5-9500f', 'Ryzen 5 9500F', '9500F', '6C/12T', 65, 88, 142, false, '2025-06', 1099, true,
      '中国大陆特供无核显型号。'],
    ['r5-8400f', 'Ryzen 5 8400F', '8400F', '6C/12T', 65, 88, 142, false, '2024-04', 899, true],
    ['r7-8700f', 'Ryzen 7 8700F', '8700F', '8C/16T', 65, 88, 142, false, '2024-04', 1399, true],
    ['r7-8700g', 'Ryzen 7 8700G', '8700G', '8C/16T', 65, 88, 142, true, '2024-01', 1999, true,
      'APU，集成 Radeon 780M，可省去独立显卡。'],
    ['r5-8600g', 'Ryzen 5 8600G', '8600G', '6C/12T', 65, 88, 142, true, '2024-01', 1399, true,
      'APU，集成 Radeon 760M。'],
    ['r5-8500g', 'Ryzen 5 8500G', '8500G', '6C/12T', 65, 88, 142, true, '2024-01', 1099, true,
      'APU，集成 Radeon 740M。']
  ]));

  /* ---------------------------------------------------- AM5 Ryzen 7000 -- */
  AMD = AMD.concat(block({
    brand: 'AMD', family: 'Ryzen 7000 (Zen 4)',
    socket: 'AM5', memMax: 'DDR5-5200 (EXPO)', source: 'amdSpec'
  }, [
    ['r9-7950x3d', 'Ryzen 9 7950X3D', '7950X3D', '16C/32T', 120, 162, 200, true, '2023-02', 4599, true],
    ['r9-7900x3d', 'Ryzen 9 7900X3D', '7900X3D', '12C/24T', 120, 162, 200, true, '2023-02', 3999, true],
    ['r7-7800x3d', 'Ryzen 7 7800X3D', '7800X3D', '8C/16T', 120, 162, 180, true, '2023-04', 2599, true,
      '单 CCD + 3D V-Cache，游戏能效比极高，整机功耗需求低。'],
    ['r9-7950x', 'Ryzen 9 7950X', '7950X', '16C/32T', 170, 230, 280, true, '2022-09', 3999, true],
    ['r9-7900x', 'Ryzen 9 7900X', '7900X', '12C/24T', 170, 230, 260, true, '2022-09', 3299, true],
    ['r9-7900', 'Ryzen 9 7900', '7900', '12C/24T', 65, 88, 142, true, '2023-01', 2799, true],
    ['r7-7700x', 'Ryzen 7 7700X', '7700X', '8C/16T', 105, 142, 180, true, '2022-09', 2299, true],
    ['r7-7700', 'Ryzen 7 7700', '7700', '8C/16T', 65, 88, 142, true, '2023-01', 1999, true],
    ['r5-7600x', 'Ryzen 5 7600X', '7600X', '6C/12T', 105, 142, 180, true, '2022-09', 1699, true],
    ['r5-7600', 'Ryzen 5 7600', '7600', '6C/12T', 65, 88, 142, true, '2023-01', 1499, true],
    ['r5-7500f', 'Ryzen 5 7500F', '7500F', '6C/12T', 65, 88, 142, false, '2023-07', 1099, true,
      '无核显，是 AM5 平台最经济的入门选择。']
  ]));

  /* --------------------------------------------- AM4 Ryzen 5000 (Zen 3) - */
  AMD = AMD.concat(block({
    brand: 'AMD', family: 'Ryzen 5000 (Zen 3)',
    socket: 'AM4', memMax: 'DDR4-3200', source: 'amdSpec'
  }, [
    ['r9-5950x', 'Ryzen 9 5950X', '5950X', '16C/32T', 105, 142, 180, false, '2020-11', 4299, true],
    ['r9-5900x', 'Ryzen 9 5900X', '5900X', '12C/24T', 105, 142, 180, false, '2020-11', 3299, true],
    ['r9-5900', 'Ryzen 9 5900', '5900', '12C/24T', 65, 88, 142, false, '2021-01', 2599, true],
    ['r7-5800x3d', 'Ryzen 7 5800X3D', '5800X3D', '8C/16T', 105, 142, 142, false, '2022-04', 2799, false,
      '首款 3D V-Cache 消费级型号，倍频锁定，142W PPT 即为实际功耗上限。'],
    ['r7-5800x', 'Ryzen 7 5800X', '5800X', '8C/16T', 105, 142, 180, false, '2020-11', 2199, true],
    ['r7-5800', 'Ryzen 7 5800', '5800', '8C/16T', 65, 88, 142, false, '2021-01', 1899, true],
    ['r7-5700x3d', 'Ryzen 7 5700X3D', '5700X3D', '8C/16T', 105, 142, 142, false, '2024-01', 1399, false,
      'AM4 平台的"末期升级神 U"，性价比突出；倍频锁定。'],
    ['r7-5700x', 'Ryzen 7 5700X', '5700X', '8C/16T', 65, 88, 142, false, '2022-04', 1299, true],
    ['r7-5700', 'Ryzen 7 5700', '5700', '8C/16T', 65, 88, 142, false, '2023-04', 1199, true],
    ['r5-5600x3d', 'Ryzen 5 5600X3D', '5600X3D', '6C/12T', 105, 142, 142, false, '2023-07', 1099, false,
      '北美零售渠道特供（Micro Center 独占）；倍频锁定。'],
    ['r5-5600x', 'Ryzen 5 5600X', '5600X', '6C/12T', 65, 88, 142, false, '2020-11', 1099, true],
    ['r5-5600', 'Ryzen 5 5600', '5600', '6C/12T', 65, 88, 142, false, '2022-04', 899, true],
    ['r5-5500', 'Ryzen 5 5500', '5500', '6C/12T', 65, 88, 142, false, '2022-04', 699, true,
      '无核显，不支持 PCIe 4.0。'],
    ['r7-5700g', 'Ryzen 7 5700G', '5700G', '8C/16T', 65, 88, 142, true, '2021-08', 1599, true,
      'APU，集成 Radeon Vega 8。'],
    ['r5-5600g', 'Ryzen 5 5600G', '5600G', '6C/12T', 65, 88, 142, true, '2021-08', 1099, true,
      'APU，集成 Radeon Vega 7，办公机常用。'],
    ['r5-5600gt', 'Ryzen 5 5600GT', '5600GT', '6C/12T', 65, 88, 142, true, '2024-01', 899, true, 'APU 型号。'],
    ['r5-5500gt', 'Ryzen 5 5500GT', '5500GT', '6C/12T', 65, 88, 142, true, '2024-01', 799, true, 'APU 型号。'],
    ['r3-5300g', 'Ryzen 3 5300G', '5300G', '4C/8T', 65, 88, 142, true, '2021-04', 0, true, '主要为 OEM 渠道。']
  ]));

  /* --------------------------------------------- AM4 Ryzen 3000 (Zen 2) - */
  AMD = AMD.concat(block({
    brand: 'AMD', family: 'Ryzen 3000 (Zen 2)',
    socket: 'AM4', memMax: 'DDR4-3200', source: 'amdSpec'
  }, [
    ['r9-3950x', 'Ryzen 9 3950X', '3950X', '16C/32T', 105, 142, 180, false, '2019-11', 5999, true],
    ['r9-3900x', 'Ryzen 9 3900X', '3900X', '12C/24T', 105, 142, 180, false, '2019-07', 3999, true],
    ['r9-3900xt', 'Ryzen 9 3900XT', '3900XT', '12C/24T', 105, 142, 180, false, '2020-07', 4299, true],
    ['r7-3800x', 'Ryzen 7 3800X', '3800X', '8C/16T', 105, 142, 180, false, '2019-07', 2799, true],
    ['r7-3800xt', 'Ryzen 7 3800XT', '3800XT', '8C/16T', 105, 142, 180, false, '2020-07', 2999, true],
    ['r7-3700x', 'Ryzen 7 3700X', '3700X', '8C/16T', 65, 88, 142, false, '2019-07', 2299, true],
    ['r5-3600x', 'Ryzen 5 3600X', '3600X', '6C/12T', 95, 128, 160, false, '2019-07', 1699, true],
    ['r5-3600xt', 'Ryzen 5 3600XT', '3600XT', '6C/12T', 95, 128, 160, false, '2020-07', 1799, true],
    ['r5-3600', 'Ryzen 5 3600', '3600', '6C/12T', 65, 88, 142, false, '2019-07', 1399, true,
      '一代神 U，二手市场保有量极大。'],
    ['r5-3500x', 'Ryzen 5 3500X', '3500X', '6C/6T', 65, 88, 142, false, '2019-10', 999, true],
    ['r3-3300x', 'Ryzen 3 3300X', '3300X', '4C/8T', 65, 88, 142, false, '2020-05', 899, true],
    ['r3-3100', 'Ryzen 3 3100', '3100', '4C/8T', 65, 88, 142, false, '2020-05', 799, true]
  ]));

  /* ------------------------------------------- AM4 Ryzen 2000 / 1000 ---- */
  AMD = AMD.concat(block({
    brand: 'AMD', family: 'Ryzen 2000 / 1000 (Zen+ / Zen)',
    socket: 'AM4', memMax: 'DDR4-2933', source: 'amdSpec'
  }, [
    ['r7-2700x', 'Ryzen 7 2700X', '2700X', '8C/16T', 105, 142, 180, false, '2018-04', 2599, true],
    ['r5-2600x', 'Ryzen 5 2600X', '2600X', '6C/12T', 95, 128, 160, false, '2018-04', 1599, true],
    ['r7-1700x', 'Ryzen 7 1700X', '1700X', '8C/16T', 95, 128, 160, false, '2017-03', 2499, true],
    ['r5-1600', 'Ryzen 5 1600', '1600', '6C/12T', 65, 88, 142, false, '2017-04', 1399, true],
    ['athlon-3000g', 'Athlon 3000G', '3000G', '2C/4T', 35, 35, 35, true, '2019-11', 399, true,
      '入门级 APU，功耗极低。']
  ]));

  /* ============================================ 未发布平台（前瞻推演） == */
  var FUTURE = [
    {
      id: 'zen6-olympic-ridge', brand: 'AMD', family: 'Ryzen Zen 6 (Olympic Ridge) — 未发布',
      name: 'Zen 6 旗舰（待发布）', alias: 'Zen6', socket: 'AM5',
      cores: '待公布', tdp: 170, maxTurbo: 250, ocPeak: 300,
      memMax: 'DDR5 (待公布)', igpu: true, released: '待发布', price: 0,
      unlocked: true, segment: 'mainstream',
      confidence: 'estimate', source: 'tpuZen6am5',
      note: 'AMD 已确认 Zen 6 桌面版继续使用 AM5 接口，现有 AM5 主板可延用。' +
            '功耗为按当前旗舰定位的估算值，不可用于购买决策，仅用于"未来升级"推演。'
    },
    {
      id: 'nova-lake-flagship', brand: 'Intel', family: 'Nova Lake-S (LGA1954) — 未发布',
      name: 'Nova Lake 旗舰（待发布）', alias: 'NovaLake', socket: 'LGA1954',
      cores: '最高 28 核（传闻）', tdp: 125, maxTurbo: 250, ocPeak: 320,
      memMax: 'DDR5 (待公布)', igpu: true, released: '待发布', price: 0,
      unlocked: true, segment: 'mainstream',
      confidence: 'estimate', source: 'hartwareNova',
      note: 'Intel 已确认 Nova Lake 采用全新 LGA1954 接口，与现有 LGA1851 主板物理不兼容。' +
            '功耗为估算值。'
    }
  ];

  /* ================================================ 世代 / 系列分组元数据 ====
   * 与 db.js 中 GPU 的做法一致：把 family 长名映射成稳定的世代 id、短标签、
   * 上市年份与新旧分段，供 UI 做三级筛选（品牌 → 系列/世代 → 型号）。
   *
   * segment 取值：
   *   'current' —— 当前在售、装机会优先考虑
   *   'legacy'  —— 已停产，多见于二手/沿用旧机
   *   'future'  —— 已公布或强传闻，尚未上市
   * ========================================================================*/
  var CPU_GEN_MAP = {
    'Core Ultra 200S Plus (Arrow Lake Refresh)':
      { id: 'cu200splus', label: 'Core Ultra 200S Plus', year: 2026, segment: 'current' },
    'Core Ultra 200S (Arrow Lake)':
      { id: 'cu200s', label: 'Core Ultra 200S', year: 2024, segment: 'current' },
    'Core 14 代 (Raptor Lake Refresh)':
      { id: 'intel14', label: 'Core 第 14 代', year: 2023, segment: 'current' },
    'Core 13 代 (Raptor Lake)':
      { id: 'intel13', label: 'Core 第 13 代', year: 2022, segment: 'legacy' },
    'Core 12 代 (Alder Lake)':
      { id: 'intel12', label: 'Core 第 12 代', year: 2021, segment: 'legacy' },
    'Core 11 代 (Rocket Lake)':
      { id: 'intel11', label: 'Core 第 11 代', year: 2020, segment: 'legacy' },
    'Core 10 代 (Comet Lake)':
      { id: 'intel10', label: 'Core 第 10 代', year: 2020, segment: 'legacy' },
    'Ryzen 9000 (Zen 5)':
      { id: 'ryzen9000', label: 'Ryzen 9000', year: 2024, segment: 'current' },
    'Ryzen 7000 (Zen 4)':
      { id: 'ryzen7000', label: 'Ryzen 7000', year: 2022, segment: 'current' },
    'Ryzen 5000 (Zen 3)':
      { id: 'ryzen5000', label: 'Ryzen 5000', year: 2020, segment: 'current' },
    'Ryzen 3000 (Zen 2)':
      { id: 'ryzen3000', label: 'Ryzen 3000', year: 2019, segment: 'legacy' },
    'Ryzen 2000 / 1000 (Zen+ / Zen)':
      { id: 'ryzen2000', label: 'Ryzen 2000 / 1000', year: 2018, segment: 'legacy' },
    'Ryzen Zen 6 (Olympic Ridge) — 未发布':
      { id: 'zen6', label: 'Ryzen Zen 6（未发布）', year: 2027, segment: 'future' },
    'Nova Lake-S (LGA1954) — 未发布':
      { id: 'novalake', label: 'Nova Lake-S（未发布）', year: 2027, segment: 'future' }
  };

  /* 展示顺序：当前世代在前，老平台居中，未发布殿后 */
  var CPU_GEN_ORDER = [
    'cu200splus', 'cu200s', 'ryzen9000',
    'intel14', 'ryzen7000',
    'intel13', 'intel12', 'ryzen5000',
    'intel11', 'intel10', 'ryzen3000', 'ryzen2000',
    'zen6', 'novalake'
  ];

  var CPUS = INTEL.concat(AMD, FUTURE);

  CPUS.forEach(function (c) {
    var g = CPU_GEN_MAP[c.family] || null;
    if (!g) {
      /* 兜底：将来新增 block 忘了登记时，不静默变成 undefined，
         而是显式标记为未分组，方便 dataaudit 抓到。 */
      g = { id: 'ungrouped', label: c.family || '未分组', year: 0, segment: 'current' };
    }
    c.gen = g.id;
    c.genLabel = g.label;
    c.year = c.year || g.year;
    c.segment = g.segment;
  });

  root.HWDB_CPUS = CPUS;
  root.HWDB_CPU_GEN_ORDER = CPU_GEN_ORDER;
  root.HWDB_CPU_GEN_META = CPU_GEN_MAP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
