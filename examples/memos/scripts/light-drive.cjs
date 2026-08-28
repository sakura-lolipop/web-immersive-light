/* memos × web-immersive-light 驱动脚本(阶段 A:初始化+建 memo+机制验证) */
const { chromium } = require("C:/Users/littl/bark/tmp/gotify-mock/node_modules/playwright-core");
const SHOTS = "C:/Users/littl/bark/tmp/memos-light-demo/shots";
const BASE = "http://localhost:3001";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  // ── 0. light-layer 静态存在 ──
  const layerExists = await page.locator("#light-layer").count();
  check("light-layer div 存在", layerExists === 1, `count=${layerExists}`);

  // ── 1. 首次运行:建管理员 ──
  if (page.url().includes("/auth/signup")) {
    const user = page.locator('input[type="text"]').first();
    const pass = page.locator('input[type="password"]').first();
    await user.fill("lightadmin");
    await pass.fill("light-demo-pass-1");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !String(u).includes("/auth/"), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  console.log("url after signup:", page.url());

  // ── 2. 建 6 条 memo(CodeMirror + Ctrl+Enter)──
  const seeds = [
    "接入验证第一条:光应该在卡片边缘先亮。",
    "指针=光源,光=连续物理场,不按元素切片。",
    "k = clamp(1 - dist(光源→元素矩形)/2R) ∈ (0,1]。",
    "四通道:blob 光斑 / 面光斑 / 边缘接光带 / input 内联径向。",
    "dark 主题 blend=screen,light 主题 blend=normal。",
    "触屏补 touch 通道,scroll 监听空参包一层。",
  ];
  const editor = page.locator(".cm-content").first();
  for (const text of seeds) {
    await editor.click();
    await page.keyboard.type(text, { delay: 5 });
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(1500);

  const cardCount = await page.locator(".memo-card").count();
  check("memo 卡片渲染(memo-card class)", cardCount >= 5, `count=${cardCount}`);

  // ── 3. 机制验证:pointermove → blob .on ──
  const card = page.locator(".memo-card").nth(1);
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 10); // 卡片上缘(边缘带特征区)
  await page.waitForTimeout(600);
  const layerOn = await page.locator("#light-layer.on").count();
  check("pointermove 后 #light-layer.on 出现", layerOn === 1, `count=${layerOn}`);

  // 卡片 .lit + --light-k
  const litCard = await page.evaluate(() => {
    const el = document.querySelectorAll(".memo-card")[1];
    return {
      lit: el.classList.contains("lit"),
      k: el.style.getPropertyValue("--light-k"),
      mx: el.style.getPropertyValue("--mx"),
    };
  });
  check("memo 卡片挂 .lit", litCard.lit, JSON.stringify(litCard));
  check("卡片 --light-k ∈ (0,1]", litCard.k !== "" && parseFloat(litCard.k) > 0 && parseFloat(litCard.k) <= 1, `k=${litCard.k}`);

  // 侧边栏行 .lit .lit-row
  const sideRows = await page.evaluate(() => {
    const rows = document.querySelectorAll(".sidebar-row");
    let lit = 0;
    let litRow = 0;
    rows.forEach((r) => {
      if (r.classList.contains("lit")) lit++;
      if (r.classList.contains("lit-row")) litRow++;
    });
    return { total: rows.length, lit, litRow };
  });
  check("侧边栏行受光(.lit/.lit-row)", sideRows.total > 0 && sideRows.lit > 0, JSON.stringify(sideRows));

  // input 通道(编辑器底下有无 input?用侧边栏 quick find 或设置页再验,此处只报状态)
  // ── 4. 远离后灯灭 ──
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  await page.mouse.move(700, 60); // 远离列表区
  await page.waitForTimeout(600);
  const stillLit = await page.evaluate(() => document.querySelectorAll(".memo-card.lit").length);
  check("指针远离后卡片灭灯(出圈 k<=0)", stillLit === 0, `lit count=${stillLit}`);

  // ── 5. 截图:light 主题 hover 卡片 ──
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/01-light-theme-hover-card.png` });

  // 侧边栏 hover
  const srow = page.locator(".sidebar-row").first();
  const sbox = await srow.boundingBox();
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/02-light-theme-hover-sidebar.png` });

  // 保存登录态供阶段 B 复用
  const state = await page.context().storageState();
  require("fs").writeFileSync(`${SHOTS}/state.json`, JSON.stringify(state));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
