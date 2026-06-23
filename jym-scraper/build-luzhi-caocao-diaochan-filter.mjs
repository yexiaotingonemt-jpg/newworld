import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const ROOT = path.resolve(".");
const OUT_DIR = path.join(ROOT, "chrome-output");
const EXPORT_DIR = path.join(ROOT, "outputs");
const SOURCE_PREFIX = "jym-goods-";
const TARGET_HEROES = ["sp卢植", "sp曹操", "sp貂蝉"];
const REQUIRED_TACTICS = ["桃园结义", "深藏若虚", "雁行阵", "先登死士", "勠力同心", "刚柔并济"];

const latestJson = await findLatestJson(OUT_DIR);
const rows = JSON.parse(await fs.readFile(path.join(OUT_DIR, latestJson), "utf8"));

const filtered = rows
  .filter((row) => TARGET_HEROES.every((hero) => hasCollectionHero(row[hero])))
  .filter((row) => !missingAnyRequiredTactic(row.missingRequiredTactics))
  .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

await fs.mkdir(EXPORT_DIR, { recursive: true });
const stamp = formatStamp(new Date());
const outputPath = path.join(EXPORT_DIR, `sp卢植-sp曹操-sp貂蝉-典藏战法齐全-${stamp}.xlsx`);

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("筛选结果");
sheet.showGridLines = false;

const headers = [
  "商品ID",
  "商品标题",
  "价格",
  "当前状态",
  "商品上架时间",
  "客户端",
  "服务器",
  "PK服务器",
  "商品链接",
  "sp卢植",
  "sp曹操",
  "sp貂蝉",
  "缺失关键战法",
  "缺失核心装备特技",
];

const data = filtered.map((row) => [
  row.goodsId || "",
  row.name || "",
  Number(row.price || 0),
  row.status || "",
  row.listedAt || "",
  row.publisher || "",
  row.serverName || "",
  row.pkServer || "",
  row.detailUrl || "",
  row["sp卢植"] || "",
  row["sp曹操"] || "",
  row["sp貂蝉"] || "",
  row.missingRequiredTactics || "",
  row.missingCoreEquipmentSkills || "",
]);

sheet.getRange("A1:N1").merge();
sheet.getRange("A1").values = [[`sp卢植 / sp曹操 / sp貂蝉 典藏筛选结果（${filtered.length} 条）`]];
sheet.getRange("A2:N2").merge();
sheet.getRange("A2").values = [[`来源：${latestJson}；条件：三个武将均至少典藏0红，且不缺失 ${REQUIRED_TACTICS.join("、")}`]];
sheet.getRange("A4:N4").values = [headers];
if (data.length) {
  sheet.getRangeByIndexes(4, 0, data.length, headers.length).values = data;
}

const usedRows = Math.max(data.length + 4, 5);
sheet.getRange(`A1:N${usedRows}`).format = {
  font: { name: "Microsoft YaHei", size: 10, color: "#1F2937" },
};
sheet.getRange("A1:N1").format = {
  fill: "#17324D",
  font: { name: "Microsoft YaHei", size: 14, bold: true, color: "#FFFFFF" },
};
sheet.getRange("A2:N2").format = {
  fill: "#EAF2F8",
  font: { name: "Microsoft YaHei", size: 10, color: "#334155" },
};
sheet.getRange("A4:N4").format = {
  fill: "#2F5D62",
  font: { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" },
  wrapText: true,
};
if (data.length) {
  sheet.getRange(`A4:N${usedRows}`).format.borders = { preset: "all", style: "thin", color: "#D7DEE8" };
  sheet.getRange(`C5:C${usedRows}`).format.numberFormat = "¥#,##0";
}
sheet.freezePanes.freezeRows(4);

setWidths(sheet, [110, 280, 90, 85, 145, 80, 180, 110, 360, 100, 100, 100, 260, 180]);

const sourceSheet = workbook.worksheets.add("筛选条件");
sourceSheet.showGridLines = false;
sourceSheet.getRange("A1:B8").values = [
  ["来源文件", latestJson],
  ["原始商品数", rows.length],
  ["筛选后商品数", filtered.length],
  ["武将条件", TARGET_HEROES.join("、") + " 均至少典藏0红"],
  ["战法条件", REQUIRED_TACTICS.join("、") + " 均不缺失"],
  ["排序", "价格升序"],
  ["生成时间", formatDateTime(new Date())],
  ["说明", "当前公开详情未提供真实成交时间；状态字段沿用当前商品表。"],
];
sourceSheet.getRange("A1:B8").format = {
  font: { name: "Microsoft YaHei", size: 10, color: "#1F2937" },
  borders: { preset: "all", style: "thin", color: "#D7DEE8" },
};
sourceSheet.getRange("A1:A8").format = {
  fill: "#2F5D62",
  font: { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" },
};
setWidths(sourceSheet, [130, 640]);

const inspect = await workbook.inspect({
  kind: "table",
  range: "筛选结果!A1:N12",
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 14,
});
console.log(inspect.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(JSON.stringify({
  source: latestJson,
  sourceRows: rows.length,
  filteredRows: filtered.length,
  outputPath,
}, null, 2));

async function findLatestJson(dir) {
  const files = await fs.readdir(dir);
  const jsons = [];
  for (const file of files) {
    if (!file.startsWith(SOURCE_PREFIX) || !file.endsWith(".json")) continue;
    const stat = await fs.stat(path.join(dir, file));
    jsons.push({ file, mtime: stat.mtimeMs });
  }
  if (!jsons.length) throw new Error(`No ${SOURCE_PREFIX}*.json files found in ${dir}`);
  jsons.sort((a, b) => b.mtime - a.mtime);
  return jsons[0].file;
}

function hasCollectionHero(value) {
  const text = String(value || "").trim();
  if (!text || text === "0") return false;
  const match = text.match(/典藏(?:动态)?(\d+)红/);
  return Boolean(match) && Number(match[1]) >= 0;
}

function missingAnyRequiredTactic(value) {
  const missing = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return REQUIRED_TACTICS.some((tactic) => missing.includes(tactic));
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function formatStamp(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatDateTime(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
