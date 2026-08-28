/* 阶段 B:侧边栏受光 / 真远离灭灯 / dark 主题 / 对话框 / computed-style 判据 */
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem("memos-theme", "default-dark"));
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  // 管理员已建,这里是登录页:登回去
  if (page.url().includes("/auth")) {
    await page.locator('input[type="text"]').first().fill("lightadmin");
    await page.locator('input[type="password"]').first().fill("light-demo-pass-1");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !String(u).includes("/auth"), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  console.log("url:", page.url());

  // ── 1. dark 主题生效 ──
  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check("memos dark 主题生效([data-theme=default-dark])", themeAttr === "default-dark", `data-theme=${themeAttr}`);

  // ── 2. 侧边栏行:hover 侧边栏后受光 ──
  const srow = page.locator(".sidebar-row").first();
  if ((await srow.count()) > 0) {
    const sbox = await srow.boundingBox();
    await page.mouse.move(sbox.x + 60, sbox.y + sbox.height / 2);
    await page.waitForTimeout(700);
    const side = await page.evaluate(() => {
      const rows = document.querySelectorAll(".sidebar-row");
      let lit = 0;
      let litRow = 0;
      rows.forEach((r) => {
        if (r.classList.contains("lit")) lit++;
        if (r.classList.contains("lit-row")) litRow++;
      });
      const first = rows[0];
      const cs = first ? getComputedStyle(first) : null;
      return { total: rows.length, lit, litRow, position: cs ? cs.position : null };
    });
    check("侧边栏行挂 .lit/.lit-row", side.lit > 0 && side.litRow > 0, JSON.stringify(side));
    check("侧边栏行 position=relative(base 层方案生效)", side.position === "relative", `position=${side.position}`);
    await page.screenshot({ path: `${SHOTS}/03-dark-theme-hover-sidebar.png` });
  } else {
    check("侧边栏行存在", false, "no .sidebar-row");
  }

  // ── 3. dark 配方 computed 判据(memory:视觉判据走 computed 非 inline)──
  const darkVars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const blob = document.getElementById("light-layer");
    return {
      blend: cs.getPropertyValue("--light-blend").trim(),
      rgb: cs.getPropertyValue("--primary-rgb").trim(),
      a: cs.getPropertyValue("--light-a").trim(),
      blobBlend: getComputedStyle(blob).mixBlendMode,
    };
  });
  check("dark 配方:blend=screen / 主色=91,151,211", darkVars.blend === "screen" && darkVars.rgb === "91, 151, 211", JSON.stringify(darkVars));

  // ── 4. 卡片受光 + 伪元素 computed + blob transform ──
  const card = page.locator(".memo-card").nth(1);
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.waitForTimeout(700);
  const cardDeep = await page.evaluate(() => {
    const el = document.querySelectorAll(".memo-card")[1];
    const before = getComputedStyle(el, "::before");
    const after = getComputedStyle(el, "::after");
    const blob = document.getElementById("light-layer");
    return {
      lit: el.classList.contains("lit"),
      k: el.style.getPropertyValue("--light-k"),
      beforeImg: before.backgroundImage.slice(0, 60),
      beforeBlend: before.mixBlendMode,
      afterPad: after.padding,
      blobTransform: getComputedStyle(blob).transform.slice(0, 40),
      blobOpacity: getComputedStyle(blob).opacity,
    };
  });
  check("dark 卡片 .lit + k", cardDeep.lit && parseFloat(cardDeep.k) > 0, `k=${cardDeep.k}`);
  check("面光斑 ::before 渐变已渲染", !cardDeep.beforeImg.includes("none"), cardDeep.beforeImg + "…");
  check("::before blend=screen(dark)", cardDeep.beforeBlend === "screen", cardDeep.beforeBlend);
  check("边缘带 ::after 1.5px mask padding", /1\.5px/.test(cardDeep.afterPad), cardDeep.afterPad);
  check("blob 合成器 transform 含位移", cardDeep.blobTransform !== "none" && cardDeep.blobTransform !== "matrix(1, 0, 0, 1, 0, 0)", cardDeep.blobTransform + "…");
  check("blob opacity=1(.on)", cardDeep.blobOpacity === "1", cardDeep.blobOpacity);
  await page.screenshot({ path: `${SHOTS}/04-dark-theme-hover-card.png` });

  // ── 5. 对话框受光:侧边栏搜索按钮开 QuickFind ──
  const searchBtn = page.getByRole("button", { name: /^(搜索|Search)$/i });
  if ((await searchBtn.count()) > 0) await searchBtn.first().click();
  await page.waitForTimeout(1000);
  const dlgCount = await page.locator('[data-slot="dialog-content"]').count();
  if (dlgCount > 0) {
    const dbox = await page.locator('[data-slot="dialog-content"]').first().boundingBox();
    await page.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
    await page.waitForTimeout(700);
    const dlg = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="dialog-content"]');
      const cs = getComputedStyle(el);
      return { lit: el.classList.contains("lit"), position: cs.position, k: el.style.getPropertyValue("--light-k") };
    });
    check("对话框受光(.lit + k)", dlg.lit && parseFloat(dlg.k) > 0, JSON.stringify(dlg));
    check("对话框 position 仍为 fixed(未被 .lit 打崩)", dlg.position === "fixed", `position=${dlg.position}`);
    await page.screenshot({ path: `${SHOTS}/05-dark-theme-dialog.png` });
    await page.keyboard.press("Escape");
  } else {
    check("QuickFind 对话框打开", false, "no dialog-content; ctrl+k may differ");
  }

  // ── 6. 真远离灭灯(角落)──
  // 样板语义:指针在页内 blob 常亮(仅 pointerleave 灭);出圈判据=卡片 .lit 全清
  await page.mouse.move(1420, 870);
  await page.waitForTimeout(700);
  const stillLit = await page.evaluate(() => document.querySelectorAll(".memo-card.lit").length);
  check("指针移到角落:卡片全部出圈灭灯", stillLit === 0, `lit=${stillLit}`);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
