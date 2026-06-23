import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP_KEY = "12574478";
const LIST_API = "mtop.com.jym.layout.pc.goodslist.getUnifiedGoodsList";
const LIST_ENDPOINT = `https://mtop.jiaoyimao.com/h5/${LIST_API.toLowerCase()}/1.0/`;
const BOOTSTRAP_URL = "https://www.jiaoyimao.com/jg1009207/f1844418-c1844419/o110/?newPage=true";

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.outDir || "protocol-output");
const pages = Number(args.pages || 1);
const pageSize = Number(args.pageSize || 16);
const headless = Boolean(args.headless);

await mkdir(outDir, { recursive: true });

const session = await bootstrapMtopSession();
const goods = [];

for (let page = 1; page <= pages; page += 1) {
  const json = await requestGoodsList(session, page, pageSize);
  const comps = json?.data?.result?.deliverComps || [];
  const rows = comps
    .map((component) => normalizeGoods(component?.data))
    .filter(Boolean)
    .filter(isTargetGoods);
  goods.push(...rows);
  console.log(`Protocol page ${page}: ${rows.length}/${comps.length} target goods`);
}

const firstGoods = goods[0] || null;
const firstDetail = firstGoods ? await fetchGoodsDetail(firstGoods) : null;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outDir, `protocol-sample-${timestamp}.json`);

await writeFile(outputPath, JSON.stringify({
  source: "protocol-sample",
  pages,
  pageSize,
  goodsCount: goods.length,
  firstGoods,
  firstDetail,
  goods,
}, null, 2), "utf8");

console.log(outputPath);

async function bootstrapMtopSession() {
  const browser = await chromium.launch({ channel: "chrome", headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
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
  for (let i = 0; i < 30 && !envHeaders; i += 1) {
    await page.waitForTimeout(500);
  }

  if (!envHeaders?.["x-umt"]) {
    await browser.close();
    throw new Error("Failed to capture mtop environment headers");
  }

  const cookies = await context.cookies("https://mtop.jiaoyimao.com");
  await browser.close();

  return {
    envHeaders,
    cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
  };
}

async function requestGoodsList(session, page, pageSize) {
  const data = JSON.stringify(buildGoodsListData(page, pageSize));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timestamp = Date.now().toString();
    const token = getMtopToken(session.cookie);
    const sign = crypto
      .createHash("md5")
      .update(`${token}&${timestamp}&${APP_KEY}&${data}`)
      .digest("hex");
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
    const ret = String(json?.ret?.[0] || "");

    if (!ret.includes("TOKEN")) return json;
  }

  throw new Error("mtop token retry failed");
}

function buildGoodsListData(page, pageSize) {
  return {
    modelType: "pc",
    searchCondition: JSON.stringify({ price: {} }),
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
  const text = [
    data.title,
    data.originTitle,
    data.description,
    data.serverName,
    ...(data.keyProperties || []).map((item) => item?.value || item?.name || ""),
    ...(data.sellPoints || []).map((item) => item?.text || item?.name || item || ""),
  ].filter(Boolean).join(" ");

  return {
    goodsId: String(data.goodsId),
    name: data.title || data.originTitle || null,
    price: data.price ?? null,
    productType: data.goodsPromotionCategoryDTO?.secondCategoryName || data.goodsPromotionCategoryDTO?.firstCategoryName || "\u6210\u54c1\u53f7",
    publisher: data.publishName || data.category?.categoryName || null,
    serverName: data.serverName || null,
    detailUrl: data.detailUrlSeo || data.detailUrl || data.goodsDetailUrl || null,
    gameName: data.gameName || null,
    gameId: data.newGameId || data.gameId || null,
    rawText: text,
  };
}

function isTargetGoods(goods) {
  const text = [goods.name, goods.serverName, goods.rawText].filter(Boolean).join(" ");
  return goods.productType === "\u6210\u54c1\u53f7"
    && /\bPK\d+\b/i.test(text)
    && !/\u5730\u533a\u670d/.test(text);
}

async function fetchGoodsDetail(goods) {
  const response = await fetch(goods.detailUrl, {
    headers: {
      "accept-language": "zh-CN",
      "user-agent": sessionUserAgent(),
    },
  });
  const html = await response.text();
  const data = parseInitialData(html);
  const goodsData = data?.pageInitialProps?.initialData?.goodsData || {};
  const propertyModules = (goodsData.sortedComponents || [])
    .flatMap((component) => component?.multiplePropertyList || []);
  const heroModule = propertyModules.find((module) => (
    module.title === "\u6b66\u5c06" || module.title === "\u59dd\ufe40\u5f30"
  ));
  const rawHeroes = heroModule?.viewData?.data || [];
  const heroes = rawHeroes.map(parseHeroCard).filter((hero) => hero.name);

  return {
    goodsId: goods.goodsId,
    detailUrl: goods.detailUrl,
    htmlBytes: html.length,
    heroCount: heroes.length,
    firstHeroes: heroes.slice(0, 10),
  };
}

function parseInitialData(html) {
  const expression = extractAssignedObject(html, "window.__INITIAL_DATA__=");
  return vm.runInNewContext(`(${expression})`, { Date }, { timeout: 5_000 });
}

function extractAssignedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} not found`);
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error("Assigned object start not found");

  let depth = 0;
  let inString = false;
  let quote = "";
  let escape = false;

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

function normalizeHeroName(name, season) {
  const cleanName = String(name || "").trim();
  if (String(season || "").toLowerCase() !== "sp") return cleanName;
  return `sp${cleanName.replace(/^(\u5178\u85cf)?\s*(sp|SP)\s*/, "")}`;
}

function normalizeStage(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getCardValue(item, positionKey) {
  return item?.data?.find((entry) => entry.positionKey === positionKey)?.value || null;
}

function getIndexValue(indexText, key) {
  const pattern = new RegExp(`${key}:([^;]+)`);
  return String(indexText || "").match(pattern)?.[1] || null;
}

function normalizeStageFromImage(image) {
  const match = String(image || "").match(/hero_\d+_(\d+)_/);
  return match ? Number(match[1]) : 0;
}

function getMtopToken(cookie) {
  return cookie.match(/_m_h5_tk=([^_;]+)/)?.[1] || "";
}

function mergeSetCookie(session, setCookie) {
  if (!setCookie) return;
  const cookieMap = new Map(
    session.cookie.split("; ").filter(Boolean).map((pair) => pair.split(/=(.*)/s).slice(0, 2))
  );
  for (const part of setCookie.split(/,(?=\s*[^ ;]+=)/).map((item) => item.split(";")[0])) {
    const [key, value] = part.split(/=(.*)/s).slice(0, 2);
    cookieMap.set(key, value);
  }
  session.cookie = [...cookieMap].map(([key, value]) => `${key}=${value}`).join("; ");
}

function sessionUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}
