import crypto from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP_KEY = "12574478";
const LIST_API = "mtop.com.jym.layout.pc.goodslist.getUnifiedGoodsList";
const LIST_ENDPOINT = `https://mtop.jiaoyimao.com/h5/${LIST_API.toLowerCase()}/1.0/`;
const BOOTSTRAP_URL = "https://www.jiaoyimao.com/jg1009207/f1844418-c1844419/o110/?newPage=true";
const GOODS_CARD_SELECTOR = ".goods-item-role, .pcGoodsListItem[data-goodsid][data-price], .pcGoodsListItem[data-goods-id][data-price]";
const EXPORT_PREFIX = "jym-goods-\u300a\u4e09\u56fd\u5fd7\u6218\u7565\u7248\u300b";

const IMPORTANT_HERO_NAMES = [
  "sp\u66f9\u64cd", "sp\u8c82\u8749", "sp\u5362\u690d", "sp\u5173\u7fbd", "sp\u6cd5\u6b63", "\u9a6c\u5cb1",
  "\u5218\u5907", "sp\u9a6c\u8d85", "sp\u7687\u752b\u5d69", "\u8bb8\u6538", "sp\u8340\u5f67", "sp\u90ed\u5609",
  "\u8d3e\u8be9", "\u8340\u6538", "\u5b59\u5c1a\u9999", "\u5b59\u6743", "\u51cc\u7edf", "\u5468\u6cf0",
  "sp\u5468\u745c", "\u9646\u900a", "sp\u5415\u8499", "sp\u8bf8\u845b\u4eae", "\u5173\u5174", "\u5f20\u82de",
  "\u8bf8\u845b\u4eae", "sp\u8881\u7ecd", "\u6cae\u6388", "sp\u6731\u5101", "\u5e9e\u7edf", "\u59dc\u7ef4",
  "\u5173\u7fbd", "\u5173\u94f6\u5c4f", "\u5f20\u98de", "sp\u9ec4\u6708\u82f1", "\u53f8\u9a6c\u61ff", "\u66f9\u64cd",
  "\u6ee1\u5ba0", "\u5f20\u89d2", "\u5de6\u6148", "\u4e8e\u5409", "\u5f20\u8fbd", "\u90ed\u5609",
  "\u738b\u5143\u59ec", "\u8bf8\u845b\u606a",
];

const REQUIRED_TACTICS = [
  "\u6843\u56ed\u7ed3\u4e49", "\u6df1\u85cf\u82e5\u865a", "\u96c1\u884c\u9635", "\u5148\u767b\u6b7b\u58eb",
  "\u52e0\u529b\u540c\u5fc3", "\u521a\u67d4\u5e76\u6d4e", "\u901f\u4e58\u5176\u5229", "\u4e34\u5371\u6551\u4e3b",
  "\u89e3\u70e6\u536b", "\u6467\u950b\u65ad\u5203", "\u8349\u8239\u501f\u7bad", "\u5a01\u8c0b\u9761\u4ea2",
  "\u4ee5\u5be1\u654c\u4f17", "\u9c7c\u9cde\u9635", "\u84c4\u52bf\u5f85\u53d1", "\u85cf\u5668\u5f85\u65f6",
  "\u85e4\u7532\u5175", "\u975e\u653b\u5236\u80dc", "\u9274\u65f6\u5ba1\u52bf", "\u593a\u9b42\u631f\u9b44",
  "\u7075\u673a\u4e00\u52a8", "\u522e\u9aa8\u7597\u6bd2", "\u4e0a\u5175\u4f10\u8c0b", "\u5a74\u57ce\u81ea\u5b88",
  "\u4f17\u5fd7\u6210\u57ce", "\u529f\u4e0d\u5510\u6350", "\u5f53\u950b\u6467\u51b3", "\u58eb\u522b\u4e09\u65e5",
  "\u4e07\u519b\u593a\u5e05", "\u76db\u6c14\u51cc\u654c", "\u5b88\u671b\u76f8\u52a9",
];

const CORE_EQUIPMENT_SKILLS = [
  "\u5fa1\u7b56", "\u6cbb\u519b", "\u56de\u5143", "\u6b66\u5723", "\u7834\u52bf", "\u5947\u7b97",
];

const JSON_ONLY_FIELDS = new Set(["allHeroes", "allTactics", "allEventTactics", "allEquipment"]);

const FIELD_TITLES = {
  goodsId: "\u5546\u54c1ID",
  name: "\u5546\u54c1\u6807\u9898",
  price: "\u4ef7\u683c",
  productType: "\u5546\u54c1\u7c7b\u578b",
  transferService: "\u8d26\u53f7\u8f6c\u79fb",
  publisher: "\u5ba2\u6237\u7aef",
  serverName: "\u670d\u52a1\u5668",
  pkServer: "PK\u670d\u52a1\u5668",
  detailUrl: "\u5546\u54c1\u94fe\u63a5",
  status: "\u5f53\u524d\u72b6\u6001",
  listedAt: "\u5546\u54c1\u4e0a\u67b6\u65f6\u95f4",
  firstSeenAt: "\u9996\u6b21\u8bb0\u5f55\u65f6\u95f4",
  lastSeenAt: "\u6700\u540e\u8bb0\u5f55\u65f6\u95f4",
  soldObservedAt: "\u552e\u51fa\u89c2\u6d4b\u65f6\u95f4",
  sellDuration: "\u552e\u51fa\u7528\u65f6",
  delistedObservedAt: "\u4e0b\u67b6\u89c2\u6d4b\u65f6\u95f4",
  delistDuration: "\u4e0b\u67b6\u7528\u65f6",
  gold: "\u91d1\u73e0",
  missingRequiredTactics: "\u7f3a\u5931\u5173\u952e\u6218\u6cd5",
  missingCoreEquipmentSkills: "\u7f3a\u5931\u6838\u5fc3\u88c5\u5907\u7279\u6280",
  totalFiveStarGenerals: "\u6a59\u8272\u6b66\u5c06\u6570\u91cf",
  sTactics: "S\u6218\u6cd5\u6570\u91cf",
  specialOrangeEquipment: "\u6a59\u88c5\u6570\u91cf",
  detailHeroCount: "\u6b66\u5c06\u8bb0\u5f55\u6570",
  detailUniqueHeroCount: "\u53bb\u91cd\u6b66\u5c06\u6570",
  importantHeroMatchedCount: "\u91cd\u8981\u6b66\u5c06\u547d\u4e2d\u6570",
};

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.outDir || "protocol-output");
const pages = args.pages ? Number(args.pages) : null;
const pageSize = Number(args.pageSize || 16);
const maxScanGoods = Number(args.maxScanGoods || 10000);
const targetGoods = Number(args.targetGoods || args.detailLimit || 1000);
const detailLimit = args.detailLimit ? Number(args.detailLimit) : targetGoods;
const delayMs = Number(args.delayMs || 1500);
const listDelayMs = Number(args.listDelayMs || 300);
const mode = args.mode || "protocol";
const useBrowserMode = ["browser", "chrome", "cdp", "cdp-browser"].includes(mode);
const useCdpBrowser = ["chrome", "cdp", "cdp-browser"].includes(mode) || Boolean(args.cdp || args.cdpEndpoint);
const cdpEndpoint = args.cdp || args.cdpEndpoint || "http://127.0.0.1:9222";
const clickDetails = args.clickDetails !== "false";
const closeDetailTabs = args.closeDetailTabs !== "false";
const closeDelayMs = Number(args.closeDelayMs || 0);
const browserMaxScrolls = Number(args.maxScrolls || 1000);
const browserMaxIdleScrolls = Number(args.maxIdleScrolls || 20);
const headless = Boolean(args.headless);
const configuredMinPrice = args.minPrice === undefined ? 500 : Number(args.minPrice);
const minPrice = Math.max(500, Number.isFinite(configuredMinPrice) ? configuredMinPrice : 500);
const checkMissingExisting = args.checkMissingExisting !== "false";
const manualCaptcha = args.manualCaptcha !== "false";
const stopOnCaptcha = args.stopOnCaptcha === "true";
const waitOnCaptcha = args.waitOnCaptcha === "true";
const skipExistingDetails = args.skipExistingDetails === "true";
const keepHistory = args.keepHistory === "true";
const checkpointEvery = Number(args.checkpointEvery || 10);
const captchaWaitMs = Number(args.captchaWaitMs || 10 * 60 * 1000);
const runAt = new Date();
const runAtText = formatDateTime(runAt);
let manualDetailBrowser = null;
let manualDetailPage = null;
let browserDetailBrowser = null;
let browserDetailPage = null;
let browserDetailShouldClose = true;

await mkdir(outDir, { recursive: true });

const stamp = formatStamp(runAt);
const jsonPath = path.join(outDir, `${EXPORT_PREFIX}-${stamp}.json`);
const csvPath = path.join(outDir, `${EXPORT_PREFIX}-${stamp}.csv`);
const previousRows = (await loadPreviousRows(outDir)).filter(meetsMinimumPrice);
const previousById = new Map(previousRows.map((row) => [String(row.goodsId), row]));
const seenIds = new Set();
let stoppedByCaptcha = false;

if (checkMissingExisting) {
  await ensureBrowserDetailSession();
  stoppedByCaptcha = await refreshExistingActiveRows(seenIds);
}

const currentRows = stoppedByCaptcha
  ? []
  : useBrowserMode
    ? await collectGoodsWithBrowser()
    : await collectGoodsWithProtocol();

if (!stoppedByCaptcha) {
  stoppedByCaptcha = await fetchNewOrChangedRows(currentRows, seenIds);
}


const outputRows = await saveOutputRows();
if (manualDetailBrowser) await manualDetailBrowser.close();
if (browserDetailBrowser && browserDetailShouldClose) await browserDetailBrowser.close();

console.log(`Saved ${outputRows.length} rows`);
console.log(jsonPath);
console.log(csvPath);
if (browserDetailBrowser && !browserDetailShouldClose) process.exit(0);

async function saveOutputRows() {
  const rows = [...previousById.values()].sort((a, b) => Number(b.lastSeenAtKey || 0) - Number(a.lastSeenAtKey || 0));
  await writeFileWithRetry(jsonPath, JSON.stringify(rows, null, 2), "utf8");
  await writeCsvIfWritable(rows);
  if (!keepHistory) await cleanupOldOutputFiles();
  return rows;
}

async function writeCsvIfWritable(rows) {
  try {
    await writeFileWithRetry(csvPath, `\uFEFF${toCsv(rows, { includeTitleRow: true })}`, "utf8");
  } catch (error) {
    if (error?.code !== "EBUSY") throw error;
    console.warn(`CSV is locked, skipped writing: ${csvPath}`);
  }
}

async function writeFileWithRetry(filePath, data, encoding, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(filePath, data, encoding);
      return;
    } catch (error) {
      if (!["EBUSY", "UNKNOWN"].includes(error?.code) || attempt === attempts) throw error;
      await sleep(1000 * attempt);
    }
  }
}

async function cleanupOldOutputFiles() {
  const files = await readdir(outDir);
  const keep = new Set([path.basename(jsonPath), path.basename(csvPath)]);
  const oldOutputs = files.filter((file) => (
    file.startsWith(EXPORT_PREFIX)
    && (file.endsWith(".json") || file.endsWith(".csv"))
    && !keep.has(file)
  ));
  await Promise.all(oldOutputs.map((file) => unlink(path.join(outDir, file)).catch(() => {})));
}

async function ensureBrowserDetailSession() {
  if (!useBrowserMode || browserDetailPage) return;
  const { browser, page, shouldClose } = await createBrowserSession();
  browserDetailBrowser = browser;
  browserDetailPage = page;
  browserDetailShouldClose = shouldClose;
}

async function refreshExistingActiveRows(updatedIds) {
  const existing = [...previousById.values()]
    .filter((row) => row.detailUrl && isActiveStatus(row.status) && meetsMinimumPrice(row));
  if (!existing.length) return false;

  console.log(`Refresh existing active rows: ${existing.length}`);
  for (let i = 0; i < existing.length; i += 1) {
    const row = existing[i];
    const id = String(row.goodsId);
    updatedIds.add(id);
    console.log(`Status check ${i + 1}/${existing.length}: ${id}`);
    const detail = await fetchGoodsDetail(row).catch((error) => ({ error: error?.message || String(error) }));
    previousById.set(id, mergeRow(row, row, detail, { statusOnly: true }));
    if (detail?.error || (i + 1) % checkpointEvery === 0) await saveOutputRows();
    if (stopOnCaptcha && detail?.error === "CAPTCHA_IN_BROWSER") {
      console.log(`Stop existing refresh: CAPTCHA_IN_BROWSER at ${id}`);
      return true;
    }
    await sleep(delayMs);
  }
  return false;
}

async function fetchNewOrChangedRows(currentRows, updatedIds) {
  const limitedRows = detailLimit ? currentRows.slice(0, detailLimit) : currentRows;
  for (let i = 0; i < limitedRows.length; i += 1) {
    const goods = limitedRows[i];
    const id = String(goods.goodsId);
    const previous = previousById.get(id);

    if (updatedIds.has(id)) {
      console.log(`Skip updated ${i + 1}/${limitedRows.length}: ${id}`);
      previousById.set(id, mergeRow(previous, goods, {}));
      continue;
    }

    updatedIds.add(id);
    if (skipExistingDetails && hasSuccessfulDetail(previous)) {
      console.log(`Skip ${i + 1}/${limitedRows.length}: ${id}`);
      previousById.set(id, mergeRow(previous, goods, {}));
      continue;
    }

    console.log(`Detail ${i + 1}/${limitedRows.length}: ${id}`);
    const detail = await fetchGoodsDetail(goods).catch((error) => ({ error: error?.message || String(error) }));
    const row = mergeRow(previous, goods, detail);
    previousById.set(id, row);
    if (detail?.error || (i + 1) % checkpointEvery === 0) await saveOutputRows();
    if (stopOnCaptcha && detail?.error === "CAPTCHA_IN_BROWSER") {
      console.log(`Stop detail scan: CAPTCHA_IN_BROWSER at ${id}`);
      return true;
    }
    await sleep(delayMs);
  }
  return false;
}

async function collectGoodsWithProtocol() {
  const session = await bootstrapMtopSession();
  const rows = [];
  let scannedGoods = 0;

  for (let page = 1; ; page += 1) {
    if (pages && page > pages) {
      console.log(`Stop list scan: reached page limit ${pages}`);
      break;
    }
    if (scannedGoods >= maxScanGoods) {
      console.log(`Stop list scan: scanned ${scannedGoods}/${maxScanGoods} list goods`);
      break;
    }
    if (rows.length >= targetGoods) {
      console.log(`Stop list scan: collected ${rows.length}/${targetGoods} target goods`);
      break;
    }

    const json = await requestGoodsList(session, page, pageSize);
    const comps = json?.data?.result?.deliverComps || [];
    scannedGoods += comps.length;
    const pageRows = comps
      .map((component) => normalizeGoods(component?.data))
      .filter(Boolean)
      .filter(isTargetGoods);
    console.log(`Protocol page ${page}: ${pageRows.length}/${comps.length} target goods; scanned ${scannedGoods}/${maxScanGoods}; targets ${rows.length + pageRows.length}/${targetGoods}`);
    rows.push(...pageRows);
    if (!comps.length) {
      console.log("Stop list scan: goods list returned empty page");
      break;
    }
    await sleep(listDelayMs);
  }

  return rows;
}

async function collectGoodsWithBrowser() {
  const { browser, page, shouldClose } = await createBrowserSession();
  const goodsById = new Map();
  let idle = 0;
  let lastCount = 0;

  if (!isListPage(page.url())) {
    await page.goto(BOOTSTRAP_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
  await page.waitForSelector(GOODS_CARD_SELECTOR, { timeout: 30_000 });

  for (let scroll = 0; scroll < browserMaxScrolls && idle < browserMaxIdleScrolls; scroll += 1) {
    const batch = await extractBrowserGoodsClean(page);
    for (const goods of batch) {
      if (!goods.goodsId) continue;
      goodsById.set(goods.goodsId, goods);
    }
    const allRows = [...goodsById.values()];
    const targetRows = allRows.filter(isTargetGoods);
    console.log(`Browser scroll ${scroll + 1}: ${targetRows.length}/${allRows.length} target goods; limit ${targetGoods}/${maxScanGoods}`);

    if (allRows.length >= maxScanGoods) {
      console.log(`Stop list scan: scanned ${allRows.length}/${maxScanGoods} browser goods`);
      break;
    }
    if (targetRows.length >= targetGoods) {
      console.log(`Stop list scan: collected ${targetRows.length}/${targetGoods} target goods`);
      break;
    }
    if (allRows.length > lastCount) {
      lastCount = allRows.length;
      idle = 0;
    } else {
      idle += 1;
    }

    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(listDelayMs);
  }

  browserDetailBrowser = browser;
  browserDetailPage = page;
  browserDetailShouldClose = shouldClose;
  return [...goodsById.values()].filter(isTargetGoods).slice(0, targetGoods);
}

async function createBrowserSession() {
  if (useCdpBrowser) {
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    const context = browser.contexts()[0] || await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "zh-CN",
    });
    const pages = context.pages();
    const page = pages.find((candidate) => isListPage(candidate.url()))
      || pages.find((candidate) => (candidate.url() || "").includes("jiaoyimao.com"))
      || await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => {});
    return { browser, page, shouldClose: false };
  }

  const browser = await chromium.launch({ channel: "chrome", headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  return { browser, page, shouldClose: true };
}

function isListPage(url) {
  return (url || "").includes("jiaoyimao.com/jg1009207/f1844418-c1844419");
}

async function extractBrowserGoods(page) {
  return page.evaluate((selector) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const num = (value) => {
      if (value === undefined || value === null || value === "") return 0;
      const parsed = Number(String(value).replace(/[^\d.]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const selectedProductType = document.querySelector('.select-item.selected[data-filter-name="\u7c7b\u76ee\u5feb\u7b5b"]')?.dataset?.item_name || "\u6210\u54c1\u53f7";

    return Array.from(document.querySelectorAll(selector)).map((el) => {
      const ds = el.dataset || {};
      const text = clean(el.textContent);
      const href = el.getAttribute("href") || el.querySelector("a[href]")?.getAttribute("href");
      const detailUrl = href ? new URL(href, location.href).href : null;
      const serverMatch = text.match(/[^,，。；;]*?PK\d+[^,，。；;]*/i);
      const pkMatch = text.match(/PK\d+/i);

      return {
        goodsId: ds.goodsid || ds.goodsId || ds.goods_id || null,
        name: ds.goods_name || ds.goodsName || ds.goodsName || null,
        price: num(ds.price || text.match(/¥\s*([\d,]+)/)?.[1]),
        productType: selectedProductType,
        transferService: text.includes("\u8d26\u53f7\u8f6c\u79fb") ? "\u662f" : "",
        publisher: ds.publisher || null,
        serverName: serverMatch ? clean(serverMatch[0]) : "",
        pkServer: pkMatch ? pkMatch[0] : "",
        detailUrl,
        status: ds.state || "\u5728\u552e",
        rawText: text,
      };
    });
  }, GOODS_CARD_SELECTOR);
}

async function extractBrowserGoodsClean(page) {
  return page.evaluate((selector) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const num = (value) => {
      if (value === undefined || value === null || value === "") return 0;
      const parsed = Number(String(value).replace(/[^\d.]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const server = (value) => {
      const cleaned = String(value || "").replace(/\*\d(?=\D|\d{2,5}服)/g, "").replace(/[,，]/g, "");
      const serverPattern = /((?:(?:争霸|北京|上海|天津|重庆|广东|江苏|浙江|山东|河南|湖南|湖北|安徽|福建|广西|川渝|云贵|西北|五周年))?\d{1,5}服)/;
      const match = cleaned.match(new RegExp(`${serverPattern.source}(?=[\\s\\S]{0,30}\\/?PK\\d+)`, "i"))
        || cleaned.match(serverPattern);
      return match ? match[1] : "";
    };
    const selectedProductType = document.querySelector('.select-item.selected[data-filter-name="\u7c7b\u76ee\u5feb\u7b5b"]')?.dataset?.item_name || "\u6210\u54c1\u53f7";

    return Array.from(document.querySelectorAll(selector)).map((el) => {
      const ds = el.dataset || {};
      const text = clean(el.textContent);
      const href = el.getAttribute("href") || el.querySelector("a[href]")?.getAttribute("href");
      const detailUrl = href ? new URL(href, location.href).href : null;
      const pkMatch = text.match(/PK\d+/i);

      return {
        goodsId: ds.goodsid || ds.goodsId || ds.goods_id || null,
        name: ds.goods_name || ds.goodsName || ds.goodsName || null,
        price: num(ds.price || text.match(/¥\s*([\d,]+)/)?.[1]),
        productType: selectedProductType,
        transferService: text.includes("\u8d26\u53f7\u8f6c\u79fb") ? "\u662f" : "",
        publisher: ds.publisher || null,
        serverName: server(text),
        pkServer: pkMatch ? pkMatch[0] : "",
        detailUrl,
        status: ds.state || "\u5728\u552e",
        rawText: text,
      };
    });
  }, GOODS_CARD_SELECTOR);
}

async function bootstrapMtopSession() {
  const browser = await chromium.launch({ channel: "chrome", headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const page = await context.newPage();
  let envHeaders = null;

  page.on("request", (request) => {
    if (envHeaders || !request.url().includes("mtop.jiaoyimao.com/h5/")) return;
    const headers = request.headers();
    envHeaders = {
      "accept-language": headers["accept-language"] || "zh-CN",
      "jym-meta": headers["jym-meta"],
      "sec-ch-ua": headers["sec-ch-ua"],
      "sec-ch-ua-mobile": headers["sec-ch-ua-mobile"],
      "sec-ch-ua-platform": headers["sec-ch-ua-platform"],
      "user-agent": headers["user-agent"],
      "x-ua": headers["x-ua"],
      "x-umt": headers["x-umt"],
    };
  });

  await page.goto(BOOTSTRAP_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  for (let i = 0; i < 30 && !envHeaders; i += 1) await page.waitForTimeout(500);
  if (!envHeaders?.["x-umt"]) {
    await browser.close();
    throw new Error("Failed to capture mtop environment headers");
  }
  const cookies = await context.cookies("https://mtop.jiaoyimao.com");
  await browser.close();
  return { envHeaders, cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") };
}

async function requestGoodsList(session, page, pageSize) {
  const data = JSON.stringify(buildGoodsListData(page, pageSize));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timestamp = Date.now().toString();
    const token = getMtopToken(session.cookie);
    const sign = crypto.createHash("md5").update(`${token}&${timestamp}&${APP_KEY}&${data}`).digest("hex");
    const url = new URL(LIST_ENDPOINT);
    url.search = new URLSearchParams({
      jsv: "2.6.2",
      appKey: APP_KEY,
      t: timestamp,
      sign,
      dataType: "json",
      valueType: "original",
      type: "originaljson",
      v: "1.0",
      api: LIST_API,
      ttid: "jym_001@chrome_pc_149.0.0.0_jiaoyimao",
      preventFallback: "true",
    }).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...session.envHeaders,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        cookie: session.cookie,
        referer: "https://www.jiaoyimao.com/",
      },
      body: `data=${encodeURIComponent(data)}`,
    });
    mergeSetCookie(session, response.headers.get("set-cookie"));
    const json = await response.json();
    if (!String(json?.ret?.[0] || "").includes("TOKEN")) return json;
  }
  throw new Error("mtop token retry failed");
}

function buildGoodsListData(page, pageSize) {
  return {
    modelType: "pc",
    searchCondition: JSON.stringify({ price: { min: minPrice } }),
    relateId: "10101",
    noBigImg: null,
    pageSize,
    extendCondition: JSON.stringify({ excludeDisplaySites: [9999] }),
    categoryName: "\u6210\u54c1\u53f7",
    parentId: 1844418,
    queryType: 1,
    goodsScene: "goods_search_new",
    selectId: null,
    linkId: null,
    gameCondition: JSON.stringify({
      gameId: 1009207,
      multiClientList: "",
      clientId: "110",
      serverNoRange: "",
      serverIdList: "",
      platformId: 2,
      clientIdList: "",
      serverId: "",
      serverAreaId: "",
      serverAreaIdList: "",
    }),
    sortId: null,
    page: String(page),
    keyword: null,
    class: "com.jym.delivery.hsf.dto.unifiedgoodslist.GoodsListQueryParams",
    categoryId: 1844419,
    platformName: "\u5b89\u5353",
    serverName: "",
    serverConditionStyle: 1,
  };
}

function normalizeGoods(data) {
  if (!data?.goodsId) return null;
  const allText = JSON.stringify(data);
  const serverName = data.serverName || extractServerName(allText);
  return {
    goodsId: String(data.goodsId),
    name: data.title || data.originTitle || null,
    price: Number(data.price ?? 0),
    productType: data.goodsPromotionCategoryDTO?.secondCategoryName || data.goodsPromotionCategoryDTO?.firstCategoryName || "\u6210\u54c1\u53f7",
    transferService: allText.includes("\u8d26\u53f7\u8f6c\u79fb") ? "\u662f" : "",
    publisher: data.publishName || data.category?.categoryName || null,
    serverName,
    pkServer: extractPkServerText(serverName || allText),
    detailUrl: data.detailUrlSeo || data.detailUrl || data.goodsDetailUrl || null,
    status: normalizeStatus(data.status),
    rawText: allText,
  };
}

function isTargetGoods(goods) {
  const text = [goods.name, goods.serverName, goods.pkServer, goods.rawText].filter(Boolean).join(" ");
  return goods.productType === "\u6210\u54c1\u53f7"
    && goods.transferService === "\u662f"
    && meetsMinimumPrice(goods)
    && /\bPK\d+\b/i.test(text)
    && !/\u5730\u533a\u670d/.test(text);
}

function meetsMinimumPrice(goods) {
  return Number(goods?.price || 0) >= minPrice;
}

function isActiveStatus(status) {
  return normalizeStatus(status) === "\u5728\u552e";
}

async function fetchGoodsDetail(goods) {
  if (useBrowserMode) {
    return fetchGoodsDetailWithBrowser(goods);
  }

  const response = await fetch(goods.detailUrl, {
    headers: { "accept-language": "zh-CN", "user-agent": sessionUserAgent() },
  });
  const html = await response.text();
  const data = html.includes("window.__INITIAL_DATA__=")
    ? parseInitialData(html)
    : await recoverDetailData(goods, html);
  const goodsData = data?.pageInitialProps?.initialData?.goodsData || {};
  const commonData = goodsData.commonData || {};
  const modules = (goodsData.sortedComponents || []).flatMap((component) => component?.multiplePropertyList || []);
  const heroes = parseHeroes(findModule(modules, "\u6b66\u5c06"));
  const uniqueHeroes = uniqueBy(heroes, (hero) => [hero.name, hero.rarity, hero.season, hero.stage, hero.level, hero.detailIndex].join("|"));
  const normalTactics = parseNames(findModule(modules, "\u6218\u6cd5"));
  const eventTactics = parseNames(findModule(modules, "\u4e8b\u4ef6\u6218\u6cd5"));
  const tactics = [...normalTactics, ...eventTactics];
  const equipmentModule = findModule(modules, "\u88c5\u5907");
  const equipment = parseEquipment(equipmentModule);
  const equipmentSkills = parseEquipmentSkills(equipmentModule);
  const overview = parseTextBox(findModule(modules, "\u603b\u89c8"));
  const assets = parseTextBox(findModule(modules, "\u8d44\u4ea7"));
  const listedAt = normalizeTimestamp(commonData.itemEventTrack?.a3);
  const status = normalizeStatus(commonData.status, commonData.cateStatus);

  return {
    status,
    listedAt,
    gold: sumNamedNumbers(assets, ["\u91d1\u73e0", "\u91d1\u94e2", "\u91d1\u997c", "\u7389\u74a7"]),
    totalFiveStarGenerals: numberValue(overview["\u4e94\u661f\u6b66\u5c06\u6570\u91cf"]),
    sTactics: numberValue(overview["S\u7ea7\u6218\u6cd5\u6570\u91cf"]),
    specialOrangeEquipment: numberValue(overview["\u6a59\u88c5\u6570\u91cf"]),
    missingRequiredTactics: missingList(REQUIRED_TACTICS, tactics),
    missingCoreEquipmentSkills: missingList(CORE_EQUIPMENT_SKILLS, equipmentSkills),
    detailHeroCount: heroes.length,
    detailUniqueHeroCount: uniqueHeroes.length,
    allHeroes: heroes,
    allTactics: normalTactics,
    allEventTactics: eventTactics,
    allEquipment: equipment,
    ...buildImportantHeroColumns(uniqueHeroes),
  };
}

async function fetchGoodsDetailWithBrowser(goods) {
  const page = await getBrowserDetailPage();
  const detailPage = clickDetails
    ? await openDetailPageFromList(page, goods)
    : await openDetailPageByUrl(page, goods.detailUrl);
  const openedSeparateDetailTab = detailPage !== page;

  try {
    if (await isBrowserCaptchaPage(detailPage)) {
      if (!waitOnCaptcha) throw new Error("CAPTCHA_IN_BROWSER");
      await waitForBrowserCaptcha(detailPage, goods);
    }
    await detailPage.waitForFunction(() => (
      Array.from(document.scripts).some((script) => (
        (script.textContent || "").includes("window.__INITIAL_DATA__=")
      ))
    ), null, { timeout: 60_000 });

    const scriptText = await detailPage.evaluate(() => (
      Array.from(document.scripts)
        .map((script) => script.textContent || "")
        .find((text) => text.includes("window.__INITIAL_DATA__=")) || ""
    ));
    if (!scriptText) throw new Error("INITIAL_DATA_NOT_FOUND_IN_BROWSER");
    return parseDetailData(scriptText);
  } finally {
    if (openedSeparateDetailTab && closeDetailTabs) {
      if (closeDelayMs > 0) await detailPage.waitForTimeout(closeDelayMs).catch(() => {});
      await detailPage.close().catch(() => {});
    }
    await pruneBrowserDetailTabs(page).catch(() => {});
  }
}

async function waitForBrowserCaptcha(page, goods) {
  console.log(`CAPTCHA wait: ${goods.goodsId}. Please solve it in Chrome; scraper will continue automatically.`);
  await page.waitForFunction(() => {
    const text = document.documentElement?.innerText || "";
    const html = document.documentElement?.innerHTML || "";
    const isCaptcha = document.title.includes("\u9a8c\u8bc1\u7801")
      || location.href.includes("_____tmd_____/punish")
      || /验证码|滑块|_____tmd_____|punish/.test(`${text}\n${html.slice(0, 2000)}`);
    const hasInitialData = Array.from(document.scripts).some((script) => (
      (script.textContent || "").includes("window.__INITIAL_DATA__=")
    ));
    return !isCaptcha && hasInitialData;
  }, null, { timeout: captchaWaitMs });
  console.log(`CAPTCHA cleared: ${goods.goodsId}`);
}

async function pruneBrowserDetailTabs(listPage) {
  if (!closeDetailTabs) return;
  for (const candidate of listPage.context().pages()) {
    if (candidate === listPage) continue;
    const url = candidate.url() || "";
    if (/jiaoyimao\.com\/jg1009207\/\d+\.html/.test(url) || url.includes("_____tmd_____/punish")) {
      await candidate.close().catch(() => {});
    }
  }
}

async function openDetailPageFromList(page, goods) {
  const selector = [
    `.pcGoodsListItem[data-goodsid="${cssEscape(goods.goodsId)}"][data-price]`,
    `.pcGoodsListItem[data-goods-id="${cssEscape(goods.goodsId)}"][data-price]`,
    `.goods-item-role[data-goodsid="${cssEscape(goods.goodsId)}"][data-price]`,
  ].join(", ");
  const context = page.context();
  const beforePages = new Set(context.pages());
  const count = await page.locator(selector).count().catch(() => 0);
  if (!count) return openDetailPageByUrl(page, goods.detailUrl);

  await page.evaluate((cardSelector) => {
    document.querySelector(cardSelector)?.scrollIntoView({ block: "center" });
  }, selector).catch(() => {});
  await page.waitForTimeout(600);
  await page.locator(selector).first().click({ timeout: 20_000 });
  const detailPage = await waitForDetailPage(context, beforePages, goods.goodsId, page);
  if (!detailPage) return openDetailPageByUrl(page, goods.detailUrl);
  await detailPage.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => {});
  return detailPage;
}

async function waitForDetailPage(context, beforePages, goodsId, currentPage) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = context.pages();
    const fresh = pages.find((candidate) => (
      !beforePages.has(candidate)
      && (candidate.url() || "").includes(`/jg1009207/${goodsId}.html`)
    ));
    if (fresh) return fresh;
    if ((currentPage.url() || "").includes(`/jg1009207/${goodsId}.html`)) return currentPage;
    await currentPage.waitForTimeout(500);
  }
  return null;
}

async function openDetailPageByUrl(page, detailUrl) {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  return page;
}

async function isBrowserCaptchaPage(page) {
  return page.evaluate(() => {
    const text = document.documentElement?.innerText || "";
    const html = document.documentElement?.innerHTML || "";
    return document.title.includes("\u9a8c\u8bc1\u7801")
      || location.href.includes("_____tmd_____/punish")
      || /验证码|滑块|_____tmd_____|punish/.test(`${text}\n${html.slice(0, 2000)}`);
  }).catch(() => false);
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function getBrowserDetailPage() {
  if (browserDetailPage) return browserDetailPage;
  browserDetailBrowser = await chromium.launch({ channel: "chrome", headless });
  const context = await browserDetailBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
  browserDetailPage = await context.newPage();
  return browserDetailPage;
}

function parseDetailData(scriptOrHtml) {
  const data = parseInitialData(scriptOrHtml);
  const goodsData = data?.pageInitialProps?.initialData?.goodsData || {};
  const commonData = goodsData.commonData || {};
  const modules = (goodsData.sortedComponents || []).flatMap((component) => component?.multiplePropertyList || []);
  const heroes = parseHeroes(findModule(modules, "\u6b66\u5c06"));
  const uniqueHeroes = uniqueBy(heroes, (hero) => [hero.name, hero.rarity, hero.season, hero.stage, hero.level, hero.detailIndex].join("|"));
  const normalTactics = parseNames(findModule(modules, "\u6218\u6cd5"));
  const eventTactics = parseNames(findModule(modules, "\u4e8b\u4ef6\u6218\u6cd5"));
  const tactics = [...normalTactics, ...eventTactics];
  const equipmentModule = findModule(modules, "\u88c5\u5907");
  const equipment = parseEquipment(equipmentModule);
  const equipmentSkills = parseEquipmentSkills(equipmentModule);
  const overview = parseTextBox(findModule(modules, "\u603b\u89c8"));
  const assets = parseTextBox(findModule(modules, "\u8d44\u4ea7"));
  const listedAt = normalizeTimestamp(commonData.itemEventTrack?.a3);
  const status = normalizeStatus(commonData.status, commonData.cateStatus);

  return {
    status,
    listedAt,
    gold: sumNamedNumbers(assets, ["\u91d1\u73e0", "\u91d1\u94e2", "\u91d1\u997c", "\u7389\u74a7"]),
    totalFiveStarGenerals: numberValue(overview["\u4e94\u661f\u6b66\u5c06\u6570\u91cf"]),
    sTactics: numberValue(overview["S\u7ea7\u6218\u6cd5\u6570\u91cf"]),
    specialOrangeEquipment: numberValue(overview["\u6a59\u88c5\u6570\u91cf"]),
    missingRequiredTactics: missingList(REQUIRED_TACTICS, tactics),
    missingCoreEquipmentSkills: missingList(CORE_EQUIPMENT_SKILLS, equipmentSkills),
    detailHeroCount: heroes.length,
    detailUniqueHeroCount: uniqueHeroes.length,
    allHeroes: heroes,
    allTactics: normalTactics,
    allEventTactics: eventTactics,
    allEquipment: equipment,
    ...buildImportantHeroColumns(uniqueHeroes),
  };
}

async function recoverDetailData(goods, html) {
  if (!isCaptchaPage(html)) return parseInitialData(html);
  if (!manualCaptcha) throw new Error("CAPTCHA_REQUIRED");

  console.log(`CAPTCHA required for ${goods.goodsId}. A Chrome window will open; solve the slider, then the script will continue.`);
  const page = await getManualDetailPage();
  await page.goto(goods.detailUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const hasInitial = await waitForInitialDataInPage(page, captchaWaitMs);
  if (!hasInitial) throw new Error("CAPTCHA_NOT_SOLVED_IN_TIME");

  const scriptText = await page.evaluate(() => (
    Array.from(document.scripts)
      .map((script) => script.textContent || "")
      .find((text) => text.includes("window.__INITIAL_DATA__=")) || ""
  ));
  if (!scriptText) throw new Error("INITIAL_DATA_NOT_FOUND_AFTER_CAPTCHA");
  console.log(`CAPTCHA cleared for ${goods.goodsId}; continuing.`);
  return parseInitialData(scriptText);
}

async function getManualDetailPage() {
  if (manualDetailPage) return manualDetailPage;
  manualDetailBrowser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await manualDetailBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
  manualDetailPage = await context.newPage();
  return manualDetailPage;
}

async function waitForInitialDataInPage(page, timeoutMs) {
  try {
    await page.waitForFunction(() => (
      Array.from(document.scripts).some((script) => (
        (script.textContent || "").includes("window.__INITIAL_DATA__=")
      ))
    ), null, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

function isCaptchaPage(html) {
  return /_____tmd_____\/punish|验证码拦截|请拖动下方滑块|x5secdata/.test(String(html || ""));
}

function mergeRow(previous, goods, detail, options = {}) {
  const base = {
    ...(previous || {}),
    ...goods,
    firstSeenAt: previous?.firstSeenAt || runAtText,
    firstSeenAtKey: previous?.firstSeenAtKey || runAt.getTime(),
    lastSeenAt: options.statusOnly ? previous?.lastSeenAt : runAtText,
    lastSeenAtKey: options.statusOnly ? previous?.lastSeenAtKey : runAt.getTime(),
  };
  if (!detail?.error) {
    Object.assign(base, detail);
    delete base.detailError;
  } else {
    base.detailError = detail.error;
  }
  base.status = normalizeStatus(base.status);
  if (base.status === "\u5728\u552e") {
    delete base.soldObservedAt;
    delete base.sellDuration;
    delete base.delistedObservedAt;
    delete base.delistDuration;
  }

  if (previous?.status === "\u5728\u552e" && base.status === "\u552e\u51fa") {
    base.soldObservedAt = runAtText;
    base.sellDuration = durationText(parseDate(base.listedAt || base.firstSeenAt), runAt);
  }
  if (previous?.status === "\u5728\u552e" && base.status === "\u4e0b\u67b6") {
    base.delistedObservedAt = runAtText;
    base.delistDuration = durationText(parseDate(base.listedAt || base.firstSeenAt), runAt);
  }
  return base;
}

function hasSuccessfulDetail(row) {
  return Boolean(row)
    && !row.detailError
    && Number(row.detailHeroCount || 0) > 0
    && Array.isArray(row.allHeroes)
    && Array.isArray(row.allTactics)
    && Array.isArray(row.allEventTactics)
    && Array.isArray(row.allEquipment);
}

function parseHeroes(module) {
  return (module?.viewData?.data || []).map(parseHeroCard).filter((hero) => hero.name);
}

function parseNames(module) {
  return (module?.viewData?.data || []).map((item) => getCardValue(item, "outDown") || getCardValue(item, "center_down_text")).filter(Boolean);
}

function parseEquipment(module) {
  return (module?.viewData?.data || []).map((item) => {
    const entries = Object.fromEntries((item.data || [])
      .filter((entry) => entry.positionKey)
      .map((entry) => [entry.positionKey, entry.value]));
    const skills = equipmentSkillsFromItem(item);
    return {
      name: getCardValue(item, "center_down_text") || getCardValue(item, "outDown") || "",
      type: getCardValue(item, "left_top_img") || getIndexValue(item.index, "\u7c7b\u578b") || "",
      rarity: getCardValue(item, "left_center_img") || getIndexValue(item.index, "\u7a00\u6709\u5ea6") || "",
      skills,
      detailIndex: item.index || null,
      entries,
    };
  }).filter((item) => item.name || item.skills.length || Object.keys(item.entries).length);
}

function parseEquipmentSkills(module) {
  const skills = [];
  for (const item of module?.viewData?.data || []) skills.push(...equipmentSkillsFromItem(item));
  return skills.filter(Boolean);
}

function equipmentSkillsFromItem(item) {
  const skills = [];
  for (const entry of item?.data || []) {
    if (entry.positionKey === "right_down_text" && entry.value) skills.push(entry.value);
    if (entry.type === "badge" && entry.value) {
      try {
        const parsed = JSON.parse(entry.value);
        if (Array.isArray(parsed)) skills.push(...parsed);
      } catch {
        skills.push(entry.value);
      }
    }
  }
  return skills.filter(Boolean);
}

function parseTextBox(module) {
  const out = {};
  for (const group of module?.viewData?.data?.groupContent || []) {
    for (const property of group.properties || []) out[property.name] = property.value;
  }
  return out;
}

function parseHeroCard(item) {
  const label = getCardValue(item, "center_down_text") || getCardValue(item, "outDown") || "";
  const match = String(label).trim().match(/^(\d+)?\s*(.+)$/);
  const rawName = (match?.[2] || label).trim();
  const image = getCardValue(item, "default");
  const season = getCardValue(item, "left_down_img") || getIndexValue(item.index, "\u8d5b\u5b63");
  return {
    label,
    level: match?.[1] ? Number(match[1]) : null,
    name: normalizeHeroName(rawName, season),
    rawName,
    rarity: getCardValue(item, "left_top_img") || getCardValue(item, "left_center_img") || getIndexValue(item.index, "\u7a00\u6709\u5ea6"),
    season,
    stage: normalizeStage(getCardValue(item, "center_down_img")) || normalizeStageFromImage(image),
    detailIndex: item.index || null,
  };
}

function buildImportantHeroColumns(heroes) {
  const columns = { importantHeroMatchedCount: 0 };
  for (const heroName of IMPORTANT_HERO_NAMES) {
    const matches = heroes.filter((hero) => hero.name === heroName);
    columns[heroName] = formatHeroMatches(matches) || "0";
    if (matches.length) columns.importantHeroMatchedCount += matches.length;
  }
  return columns;
}

function formatHeroMatches(matches) {
  if (!matches.length) return "";
  const totalStage = Math.min(5, matches.reduce((sum, hero) => sum + (Number(hero.stage) || 0), 0));
  const hasCollection = matches.some((hero) => String(hero.rarity || "").includes("\u5178\u85cf"));
  const hasDynamic = matches.some((hero) => String(hero.rarity || "").includes("\u52a8\u6001"));
  const prefix = hasCollection && hasDynamic ? "\u5178\u85cf\u52a8\u6001" : hasCollection ? "\u5178\u85cf" : hasDynamic ? "\u52a8\u6001" : "";
  return `${prefix}${totalStage}\u7ea2`;
}

async function loadPreviousRows(dir) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.startsWith(EXPORT_PREFIX) && file.endsWith(".json")).sort();
  if (!files.length) return [];
  const latest = files.at(-1);
  return JSON.parse(await readFile(path.join(dir, latest), "utf8"));
}

function toCsv(rows, options = {}) {
  if (!rows.length) return "";
  const headers = orderedHeaders(rows);
  const lines = [headers.join(",")];
  if (options.includeTitleRow) lines.push(headers.map((header) => escapeCsv(FIELD_TITLES[header] || header)).join(","));
  lines.push(...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")));
  return lines.join("\n");
}

function orderedHeaders(rows) {
  const preferred = [
    "goodsId", "name", "price", "productType", "transferService", "publisher", "serverName", "pkServer", "detailUrl",
    "status", "listedAt", "firstSeenAt", "lastSeenAt", "soldObservedAt", "sellDuration", "delistedObservedAt", "delistDuration", "gold",
    "totalFiveStarGenerals", "sTactics", "specialOrangeEquipment",
    "detailHeroCount", "detailUniqueHeroCount", "importantHeroMatchedCount",
    ...IMPORTANT_HERO_NAMES,
    "missingRequiredTactics", "missingCoreEquipmentSkills",
  ];
  const all = new Set(rows.flatMap((row) => Object.keys(row)));
  return [
    ...preferred.filter((key) => all.has(key)),
    ...[...all].filter((key) => (
      !preferred.includes(key)
      && !key.endsWith("Key")
      && key !== "rawText"
      && !JSON_ONLY_FIELDS.has(key)
    )),
  ];
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join(",") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function findModule(modules, title) {
  return modules.find((module) => module.title === title);
}

function getCardValue(item, positionKey) {
  return item?.data?.find((entry) => entry.positionKey === positionKey)?.value || null;
}

function getIndexValue(indexText, key) {
  return String(indexText || "").match(new RegExp(`${key}:([^;]+)`))?.[1] || null;
}

function normalizeHeroName(name, season) {
  const cleanName = String(name || "").trim();
  if (String(season || "").toLowerCase() !== "sp") return cleanName;
  return `sp${cleanName.replace(/^(\u5178\u85cf)?\s*(sp|SP)\s*/, "")}`;
}

function normalizeStage(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function normalizeStageFromImage(image) {
  const match = String(image || "").match(/hero_\d+_(\d+)_/);
  return match ? Number(match[1]) : 0;
}

function missingList(required, actual) {
  const actualSet = new Set(actual.map((item) => String(item).trim()));
  return required.filter((item) => !actualSet.has(item)).join(",");
}

function sumNamedNumbers(map, names) {
  return names.reduce((sum, name) => sum + numberValue(map[name]), 0);
}

function numberValue(value) {
  const text = String(value ?? "").replace(/,/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function normalizeStatus(status, cateStatus = "") {
  if (String(cateStatus).includes("onsold")) return "\u5728\u552e";
  if (String(status).includes("\u53ef\u552e") || String(status).includes("\u5728\u552e") || String(status).includes("onsold")) return "\u5728\u552e";
  if (String(status).includes("\u5df2\u552e") || String(status).includes("\u552e\u51fa")) return "\u552e\u51fa";
  if (String(status).includes("\u4e0b\u67b6")) return "\u4e0b\u67b6";
  const code = Number(status);
  if (code === 3) return "\u5728\u552e";
  if (code === 4 || code === 5 || code === 6) return "\u552e\u51fa";
  if (code === 0 || code === 1 || code === 2) return "\u4e0b\u67b6";
  return status ? String(status) : "";
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return formatDateTime(new Date(numeric));
}

function parseInitialData(html) {
  const expression = extractAssignedObject(html, "window.__INITIAL_DATA__=");
  return vm.runInNewContext(`(${expression})`, { Date }, { timeout: 5_000 });
}

function extractAssignedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} not found`);
  const start = text.indexOf("{", markerIndex + marker.length);
  let depth = 0, inString = false, quote = "", escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("Assigned object end not found");
}

function uniqueBy(items, keyFn) {
  return [...new Map(items.map((item) => [keyFn(item), item])).values()];
}

function extractPkServerText(text) {
  return String(text || "").match(/PK\d+/i)?.[0] || "";
}

function extractServerName(text) {
  const cleaned = String(text || "")
    .replace(/\*\d(?=\D|\d{2,5}服)/g, "")
    .replace(/[,，]/g, "");
  const serverPattern = /((?:(?:争霸|北京|上海|天津|重庆|广东|江苏|浙江|山东|河南|湖南|湖北|安徽|福建|广西|川渝|云贵|西北|五周年))?\d{1,5}服)/;
  const match = cleaned.match(new RegExp(`${serverPattern.source}(?=[\\s\\S]{0,30}\\/?PK\\d+)`, "i"))
    || cleaned.match(serverPattern);
  return match ? match[1] : "";
}

function getMtopToken(cookie) {
  return cookie.match(/_m_h5_tk=([^_;]+)/)?.[1] || "";
}

function mergeSetCookie(session, setCookie) {
  if (!setCookie) return;
  const cookieMap = new Map(session.cookie.split("; ").filter(Boolean).map((pair) => pair.split(/=(.*)/s).slice(0, 2)));
  for (const part of setCookie.split(/,(?=\s*[^ ;]+=)/).map((item) => item.split(";")[0])) {
    const [key, value] = part.split(/=(.*)/s).slice(0, 2);
    cookieMap.set(key, value);
  }
  session.cookie = [...cookieMap].map(([key, value]) => `${key}=${value}`).join("; ");
}

function formatStamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDate(value) {
  const date = value ? new Date(String(value).replace(" ", "T")) : null;
  return date && Number.isFinite(date.getTime()) ? date : runAt;
}

function durationText(start, end) {
  const minutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return `${days}\u5929${hours}\u5c0f\u65f6${mins}\u5206\u949f`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function sessionUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}
