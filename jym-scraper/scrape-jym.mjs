import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const DEFAULT_URL = "https://www.jiaoyimao.com/jg1009207/f1844418-c1844419/o110/?newPage=true";
const GOODS_CARD_SELECTOR = ".goods-item-role, .pcGoodsListItem[data-goodsid][data-price], .pcGoodsListItem[data-goods-id][data-price]";
const require = createRequire(import.meta.url);
const { chromium } = await loadPlaywright();

const args = parseArgs(process.argv.slice(2));
const url = args.url || DEFAULT_URL;
const outDir = path.resolve(args.outDir || "output");
const maxIdleScrolls = Number(args.maxIdleScrolls || 6);
const maxScrolls = Number(args.maxScrolls || 200);
const delayMs = Number(args.delayMs || 1200);
const headless = Boolean(args.headless);
const withDetails = Boolean(args.withDetails);
const detailLimit = args.detailLimit ? Number(args.detailLimit) : null;
const requirePkServer = args.requirePkServer !== "false";
const excludeRegionalServer = args.excludeRegionalServer !== "false";
const productTypeFilter = args.productType === "false"
  ? null
  : (args.productType || "\u6210\u54c1\u53f7");
const EXPORT_GAME_TITLE = "\u4e09\u56fd\u5fd7\u6218\u7565\u7248";
const EXPORT_BASENAME = `jym-goods-\u300a${EXPORT_GAME_TITLE}\u300b`;
const OMIT_GOODS_EXPORT_FIELDS = new Set([
  "gameName",
  "gameId",
  "rawText",
  "position",
  "index",
]);
const FIELD_TITLES = {
  goodsId: "\u5546\u54c1ID",
  name: "\u5546\u54c1\u6807\u9898",
  publisher: "\u5356\u5bb6",
  price: "\u4ef7\u683c",
  productType: "\u5546\u54c1\u7c7b\u578b",
  detailUrl: "\u5546\u54c1\u94fe\u63a5",
  gameOs: "\u6e38\u620f\u7cfb\u7edf",
  cid: "\u7c7b\u76eeID",
  pid: "\u7236\u7c7b\u76eeID",
  systemCid: "\u7cfb\u7edf\u7c7b\u76eeID",
  sceneId: "\u573a\u666fID",
  totalFiveStarGenerals: "\u6a59\u8272\u6b66\u5c06\u6570\u91cf",
  sTactics: "S\u6218\u6cd5\u6570\u91cf",
  seasonStartDays: "\u8d5b\u5b63\u5f00\u59cb\u65f6\u95f4",
  experiencedSeasons: "\u7ecf\u5386\u8d5b\u5b63",
  specialOrangeEquipment: "\u7279\u6280\u6a59\u88c5\u6570\u91cf",
  recruitmentCurrent: "\u6c42\u8d24\u5f53\u524d\u503c",
  recruitmentTarget: "\u6c42\u8d24\u76ee\u6807\u503c",
  transferStatus: "\u8f6c\u533a\u72b6\u6001",
  wantedCount: "\u60f3\u8981\u4eba\u6570",
  publishedAgo: "\u53d1\u5e03\u65f6\u95f4",
  detailScrapeStatus: "\u8be6\u60c5\u91c7\u96c6\u72b6\u6001",
  detailError: "\u8be6\u60c5\u91c7\u96c6\u9519\u8bef",
  detailHeroCount: "\u6b66\u5c06\u8bb0\u5f55\u6570",
  detailUniqueHeroCount: "\u53bb\u91cd\u6b66\u5c06\u6570",
  importantHeroMatchedCount: "\u91cd\u8981\u6b66\u5c06\u547d\u4e2d\u6570",
};
const IMPORTANT_HERO_NAMES = [
  "sp\u66f9\u64cd",
  "sp\u8c82\u8749",
  "sp\u5362\u690d",
  "sp\u5173\u7fbd",
  "sp\u6cd5\u6b63",
  "\u9a6c\u5cb1",
  "\u5218\u5907",
  "sp\u9a6c\u8d85",
  "sp\u7687\u752b\u5d69",
  "\u8bb8\u6538",
  "sp\u8340\u5f67",
  "sp\u90ed\u5609",
  "\u8d3e\u8be9",
  "\u8340\u6538",
  "\u5b59\u5c1a\u9999",
  "\u5b59\u6743",
  "\u51cc\u7edf",
  "\u5468\u6cf0",
  "sp\u5468\u745c",
  "\u9646\u900a",
  "sp\u5415\u8499",
  "sp\u8bf8\u845b\u4eae",
  "\u5173\u5174",
  "\u5f20\u82de",
  "\u8bf8\u845b\u4eae",
  "sp\u8881\u7ecd",
  "\u6cae\u6388",
  "sp\u6731\u5101",
  "\u5e9e\u7edf",
  "\u59dc\u7ef4",
  "\u5173\u7fbd",
  "\u5173\u94f6\u5c4f",
  "\u5f20\u98de",
  "sp\u9ec4\u6708\u82f1",
  "\u53f8\u9a6c\u61ff",
  "\u66f9\u64cd",
  "\u6ee1\u5ba0",
  "\u5f20\u89d2",
  "\u5de6\u6148",
  "\u4e8e\u5409",
  "\u5f20\u8fbd",
  "\u90ed\u5609",
  "\u738b\u5143\u59ec",
  "\u8bf8\u845b\u606a",
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless,
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });

  page.setDefaultTimeout(20_000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(GOODS_CARD_SELECTOR, { timeout: 30_000 });

  let idle = 0;
  let lastCount = 0;

  for (let i = 0; i < maxScrolls && idle < maxIdleScrolls; i += 1) {
    const count = await page.locator(GOODS_CARD_SELECTOR).count();
    if (count > lastCount) {
      lastCount = count;
      idle = 0;
      console.log(`Loaded ${count} goods`);
    } else {
      idle += 1;
      console.log(`No new goods after scroll ${i + 1}; idle ${idle}/${maxIdleScrolls}`);
    }

    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(delayMs);
  }

  const goods = await page.evaluate((goodsCardSelector) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const num = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = Number(String(value).replace(/[^\d.]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const matchNum = (text, pattern) => {
      const match = text.match(pattern);
      return match ? Number(match[1]) : null;
    };
    const parseRecruitment = (text) => {
      const match = text.match(/求贤令\s*(\d+)\/(\d+)(.*)$/);
      if (!match) return null;

      const validTargets = ["3900", "3600", "3300", "3000", "2700", "2400", "2100", "1800"];
      const afterSlash = match[2];
      const target = validTargets.find((candidate) => afterSlash.startsWith(candidate));

      if (!target) {
        return {
          fullMatch: match[0],
          current: Number(match[1]),
          target: Number(afterSlash),
          remainder: "",
          afterText: match[3] || "",
        };
      }

      return {
        fullMatch: match[0],
        current: Number(match[1]),
        target: Number(target),
        remainder: afterSlash.slice(target.length),
        afterText: match[3] || "",
      };
    };
    const pickDataset = (ds, keys) => {
      for (const key of keys) {
        if (ds[key]) return ds[key];
      }
      return null;
    };
    const parseProductType = (text, ds) => (
      pickDataset(ds, [
        "productType",
        "productTypeName",
        "goodsType",
        "goodsTypeName",
        "categoryName",
        "cateName",
        "bizType",
        "bizTypeName",
        "tradeType",
        "tradeTypeName",
      ]) || (String(text || "").match(/(\u6210\u54c1\u53f7|\u521d\u59cb\u53f7|\u81ea\u62bd\u53f7|\u5f00\u5c40\u53f7|\u4ee3\u7ec3|\u9053\u5177|\u793c\u5305)/)?.[1] || null)
    );

    const selectedProductType = document.querySelector('.select-item.selected[data-filter-name="\u7c7b\u76ee\u5feb\u7b5b"]')?.dataset?.item_name || null;

    return Array.from(document.querySelectorAll(goodsCardSelector)).map((el) => {
      const text = clean(el.textContent);
      const ds = el.dataset || {};
      const qx = parseRecruitment(text);
      const textWithoutRecruitment = qx
        ? text.replace(qx.fullMatch, ` ${qx.remainder}${qx.afterText} `)
        : text;
      const transfer = text.match(/(\d+天后可跨区转服|可跨区转服)/);
      const wanted = textWithoutRecruitment.match(/(\d+)人想要/);
      const published = textWithoutRecruitment.match(/((?:\d+)(?:分钟|小时|天)前发布|刚刚发布)/);
      const href = el.getAttribute("href") || el.querySelector("a[href]")?.getAttribute("href");
      const detailUrl = href
        ? new URL(href, location.href).href
        : null;

      return {
        goodsId: ds.goodsid || ds.goodsId || ds.goods_id || null,
        name: ds.goods_name || ds.goodsName || null,
        publisher: ds.publisher || null,
        price: num(ds.price),
        productType: selectedProductType || parseProductType(text, ds),
        gameName: ds.game_name || ds.gameName || null,
        gameId: ds.game_id || ds.gameId || null,
        detailUrl: detailUrl || (ds.goodsid || ds.goodsId || ds.goods_id
          ? `https://www.jiaoyimao.com/jg${ds.game_id || ds.gameId}/${ds.goodsid || ds.goodsId || ds.goods_id}.html?isGray=true`
          : null),
        gameOs: ds.game_os || ds.gameOs || null,
        cid: ds.cid || null,
        pid: ds.pid || null,
        systemCid: ds.system_cid || ds.systemCid || null,
        sceneId: ds.scene_id || ds.sceneId || null,
        position: num(ds.position),
        index: num(ds.index),
        totalFiveStarGenerals: matchNum(text, /总(\d+)五星武将/),
        sTactics: matchNum(text, /S战法(\d+)个/),
        seasonStartDays: matchNum(text, /赛季开始(\d+)天/),
        experiencedSeasons: matchNum(text, /经历(\d+)赛季/),
        specialOrangeEquipment: matchNum(text, /特技橙装(\d+)个/),
        recruitmentCurrent: qx ? qx.current : null,
        recruitmentTarget: qx ? qx.target : null,
        transferStatus: transfer ? transfer[1] : null,
        wantedCount: wanted ? Number(wanted[1]) : null,
        publishedAgo: published ? published[1] : null,
        rawText: text,
      };
    });
  }, GOODS_CARD_SELECTOR);

  const dedupedGoods = [...new Map(goods.map((item) => [item.goodsId || item.rawText, item])).values()];
  if (productTypeFilter && dedupedGoods.length && !dedupedGoods.some((goods) => isProductType(goods, productTypeFilter))) {
    console.warn(`No goods matched product type "${productTypeFilter}" in list-card data; check whether the site exposes this filter in the current page.`);
  }
  const uniqueGoods = dedupedGoods.filter(isTargetGoods);
  uniqueGoods.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `${EXPORT_BASENAME}-${timestamp}.json`);
  const csvPath = path.join(outDir, `${EXPORT_BASENAME}-${timestamp}.csv`);

  await writeGoodsTable(jsonPath, csvPath, uniqueGoods);

  console.log(`Saved ${uniqueGoods.length} unique goods after filters (${dedupedGoods.length} before filters)`);
  console.log(jsonPath);
  console.log(csvPath);

  if (withDetails) {
    const goodsForDetails = uniqueGoods.slice(0, detailLimit || uniqueGoods.length);
    const details = [];
    const heroRows = [];
    const uniqueHeroRows = [];

    for (let i = 0; i < goodsForDetails.length; i += 1) {
      const goods = goodsForDetails[i];
      if (!goods.detailUrl) continue;

      console.log(`Scraping details ${i + 1}/${goodsForDetails.length}: ${goods.goodsId}`);
      let detail;
      try {
        detail = await scrapeGoodsDetail(page, goods);
      } catch (error) {
        detail = {
          goodsId: goods.goodsId,
          goodsName: goods.name,
          detailUrl: goods.detailUrl,
          error: error?.message || String(error),
          heroCount: 0,
          uniqueHeroCount: 0,
          heroes: [],
          uniqueHeroes: [],
        };
        console.log(`Detail failed for ${goods.goodsId}: ${detail.error}`);
      }
      details.push(detail);
      heroRows.push(...detail.heroes.map((hero) => ({
        goodsId: goods.goodsId,
        goodsName: goods.name,
        goodsPrice: goods.price,
        ...hero,
      })));
      uniqueHeroRows.push(...detail.uniqueHeroes.map((hero) => ({
        goodsId: goods.goodsId,
        goodsName: goods.name,
        goodsPrice: goods.price,
        ...hero,
      })));
      await page.waitForTimeout(delayMs);
    }

    const detailsByGoodsId = new Map(details.map((detail) => [detail.goodsId, detail]));
    const enrichedGoods = uniqueGoods.map((goods) => ({
      ...goods,
      ...buildDetailSummaryColumns(detailsByGoodsId.get(goods.goodsId)),
    }));
    const detailsPath = path.join(outDir, `jym-goods-details-${timestamp}.json`);
    const heroesCsvPath = path.join(outDir, `jym-goods-heroes-${timestamp}.csv`);
    const uniqueHeroesCsvPath = path.join(outDir, `jym-goods-heroes-unique-${timestamp}.csv`);
    await writeGoodsTable(jsonPath, csvPath, enrichedGoods);
    await writeFile(detailsPath, JSON.stringify(details, null, 2), "utf8");
    await writeFile(heroesCsvPath, `\uFEFF${toCsv(heroRows)}`, "utf8");
    await writeFile(uniqueHeroesCsvPath, `\uFEFF${toCsv(uniqueHeroRows)}`, "utf8");
    console.log(`Updated goods table with ${IMPORTANT_HERO_NAMES.length} important hero columns`);
    console.log(`Saved ${details.length} detail pages, ${heroRows.length} raw hero rows, and ${uniqueHeroRows.length} unique hero rows`);
    console.log(jsonPath);
    console.log(csvPath);
    console.log(detailsPath);
    console.log(heroesCsvPath);
    console.log(uniqueHeroesCsvPath);
  }
} finally {
  await browser.close();
}

async function scrapeGoodsDetail(page, goods) {
  await page.goto(goods.detailUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => (
    Array.from(document.scripts).some((script) => (
      (script.textContent || "").includes("window.__INITIAL_DATA__=")
    ))
  ), null, { timeout: 20_000 });

  const scriptText = await page.evaluate(() => (
    Array.from(document.scripts)
      .map((script) => script.textContent || "")
      .find((text) => text.includes("window.__INITIAL_DATA__=")) || ""
  ));

  if (!scriptText) {
    return {
      goodsId: goods.goodsId,
      goodsName: goods.name,
      detailUrl: goods.detailUrl,
      error: "INITIAL_DATA_NOT_FOUND",
      heroCount: 0,
      uniqueHeroCount: 0,
      heroes: [],
    };
  }

  const data = parseInitialData(scriptText);
  const goodsData = data?.pageInitialProps?.initialData?.goodsData || {};
  const detailComponent = (goodsData.sortedComponents || []).find((component) => (
    Array.isArray(component?.multiplePropertyList)
  ));
  const heroModule = detailComponent?.multiplePropertyList?.find((module) => module.title === "武将");
  const rawHeroes = heroModule?.viewData?.data || [];
  const heroes = rawHeroes
    .map(parseHeroCard)
    .filter((hero) => hero.name && !String(hero.detailIndex || "").includes("已求贤"));
  const uniqueHeroes = uniqueBy(heroes, (hero) => [
    hero.name,
    hero.image,
    hero.rarity,
    hero.season,
    hero.camp,
    hero.stage,
    hero.level,
    hero.awake,
  ].join("|"));

  return {
    goodsId: goods.goodsId,
    goodsName: goods.name,
    detailUrl: goods.detailUrl,
    heroCount: heroes.length,
    uniqueHeroCount: uniqueHeroes.length,
    heroes,
    uniqueHeroes,
  };
}

function parseInitialData(scriptText) {
  const expression = extractAssignedObject(scriptText, "window.__INITIAL_DATA__=");
  return vm.runInNewContext(`(${expression})`, { Date }, { timeout: 5_000 });
}

function extractAssignedObject(scriptText, marker) {
  const markerIndex = scriptText.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${marker} not found`);

  const start = scriptText.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error("Assigned object start not found");

  let depth = 0;
  let inString = false;
  let quote = "";
  let escape = false;

  for (let i = start; i < scriptText.length; i += 1) {
    const char = scriptText[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === quote) {
        inString = false;
      }
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
      if (depth === 0) return scriptText.slice(start, i + 1);
    }
  }

  throw new Error("Assigned object end not found");
}

function parseHeroCard(item) {
  const label = getCardValue(item, "center_down_text") || "";
  const match = String(label).match(/^(\d+)?(.+)$/);
  const rawName = match?.[2] || label;
  const season = getCardValue(item, "left_down_img");

  return {
    label,
    level: match?.[1] ? Number(match[1]) : null,
    name: normalizeHeroName(rawName, season),
    rawName,
    image: getCardValue(item, "default"),
    rarity: getCardValue(item, "left_top_img") || getCardValue(item, "left_center_img"),
    season,
    camp: getCardValue(item, "left_down_img2"),
    stage: normalizeStage(getCardValue(item, "center_down_img")),
    awake: getCardValue(item, "right_center_img"),
    detailIndex: item.index || null,
  };
}

function normalizeHeroName(name, season) {
  if (String(season || "").toLowerCase() !== "sp") return name;
  if (/^(sp|SP|典藏SP)/.test(name)) return name;
  return `sp${name}`;
}

function buildImportantHeroColumns(heroes) {
  const columns = {
    importantHeroMatchedCount: 0,
  };

  for (const heroName of IMPORTANT_HERO_NAMES) {
    const matches = heroes.filter((hero) => hero.name === heroName);
    columns[heroName] = formatHeroMatches(matches) || "0";
    if (matches.length) columns.importantHeroMatchedCount += matches.length;
  }

  return columns;
}

function buildDetailSummaryColumns(detail) {
  if (!detail) {
    return {
      detailScrapeStatus: "not_scanned",
      detailError: "",
      detailHeroCount: "",
      detailUniqueHeroCount: "",
    };
  }

  if (detail.error) {
    return {
      detailScrapeStatus: "failed",
      detailError: detail.error,
      detailHeroCount: 0,
      detailUniqueHeroCount: 0,
    };
  }

  return {
    detailScrapeStatus: "success",
    detailError: "",
    detailHeroCount: detail.heroCount,
    detailUniqueHeroCount: detail.uniqueHeroCount,
    ...buildImportantHeroColumns(detail.uniqueHeroes || []),
  };
}

function formatHeroMatches(matches) {
  if (!matches.length) return "";

  const totalStage = Math.min(
    5,
    matches.reduce((sum, hero) => sum + (Number(hero.stage) || 0), 0)
  );
  const hasCollection = matches.some((hero) => String(hero.rarity || "").includes("\u5178\u85cf"));
  const hasDynamic = matches.some((hero) => String(hero.rarity || "").includes("\u52a8\u6001"));
  const prefix = hasCollection && hasDynamic
    ? "\u5178\u85cf\u52a8\u6001"
    : hasCollection
      ? "\u5178\u85cf"
      : hasDynamic
        ? "\u52a8\u6001"
        : "";

  return `${prefix}${totalStage}\u7ea2`;
}

function formatHeroStageRarity(stage, rarity) {
  const text = String(rarity || "");
  const hasCollection = text.includes("\u5178\u85cf");
  const hasDynamic = text.includes("\u52a8\u6001");
  const prefix = hasCollection && hasDynamic
    ? "\u5178\u85cf\u52a8\u6001"
    : hasCollection
      ? "\u5178\u85cf"
      : hasDynamic
        ? "\u52a8\u6001"
        : "";

  return `${prefix}${stage}\u7ea2`;
}

function getCardValue(item, positionKey) {
  return item?.data?.find((entry) => entry.positionKey === positionKey)?.value || null;
}

function normalizeStage(value) {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function uniqueBy(items, getKey) {
  return [...new Map(items.map((item) => [getKey(item), item])).values()];
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i += 1;
      }
    }
  }
  return parsed;
}

function isTargetGoods(goods) {
  const serverText = [goods.name, goods.rawText].filter(Boolean).join(" ");
  if (requirePkServer && !/\bPK\d+\b/i.test(serverText)) return false;
  if (excludeRegionalServer && /\u5730\u533a\u670d/.test(serverText)) return false;
  if (productTypeFilter && !isProductType(goods, productTypeFilter)) return false;
  return true;
}

function isProductType(goods, expectedType) {
  const typeText = [goods.productType, goods.rawText].filter(Boolean).join(" ");
  return typeText.includes(expectedType);
}

async function writeGoodsTable(jsonPath, csvPath, rows) {
  const exportRows = prepareGoodsRowsForExport(rows);
  await writeFile(jsonPath, JSON.stringify(exportRows, null, 2), "utf8");
  await writeFile(csvPath, `\uFEFF${toCsv(exportRows, { includeTitleRow: true })}`, "utf8");
}

function prepareGoodsRowsForExport(rows) {
  return rows.map((row) => {
    const cleaned = {};
    for (const [key, value] of Object.entries(row)) {
      if (!OMIT_GOODS_EXPORT_FIELDS.has(key)) cleaned[key] = value;
    }
    return cleaned;
  });
}

function getFieldTitle(header) {
  return FIELD_TITLES[header] || header;
}

function toCsv(rows, options = {}) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(",")];
  if (options.includeTitleRow) {
    lines.push(headers.map((header) => escape(getFieldTitle(header))).join(","));
  }
  lines.push(...rows.map((row) => headers.map((header) => escape(row[header])).join(",")));
  return lines.join("\n");
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed for this project. Install Node.js/npm, then run `npm install` in the jym-scraper folder."
    );
  }
}
