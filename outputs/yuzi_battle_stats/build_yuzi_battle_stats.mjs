import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/onemt/Documents/Playground/outputs/yuzi_battle_stats";
await fs.mkdir(outputDir, { recursive: true });

const rows = [
  ["与子同歌", 5, 9781169],
  ["与子同仇", 4, 9578959],
  ["与子同烬", 16, 6874620],
  ["与子同毛", 33, 5430058],
  ["与子同仙", 26, 5132351],
  ["与子同尘", 31, 4942567],
  ["与子同思", 61, 3803260],
  ["与子同舞", 82, 2406329],
  ["与子同依", 147, 2001204],
  ["与子同翎", 228, 1537704],
  ["与子同梦", 180, 1521013],
  ["与子同泡", 183, 1315272],
  ["与子同耘", 198, 982950],
  ["与子同泽", 265, 579829],
  ["与子同影", 282, 69067],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("与子战功统计");
sheet.showGridLines = false;

sheet.getRange("A1:D1").merge();
sheet.getRange("A1").values = [["与子成员战功统计"]];
sheet.getRange("A1").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A1:D1").format.rowHeightPx = 34;

sheet.getRange("A2:D2").values = [[
  "按战功总量降序排列；最后一行为 15 名成员战功总量平均值。",
  null,
  null,
  null,
]];
sheet.getRange("A2:D2").merge();
sheet.getRange("A2").format = {
  fill: "#F3F4F6",
  font: { color: "#374151" },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};

const header = [["排名", "成员", "贡献排名", "战功总量"]];
sheet.getRange("A4:D4").values = header;
sheet.getRange("A4:D4").format = {
  fill: "#2563EB",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: {
    bottom: { style: "medium", color: "#1E3A8A" },
  },
};

const data = rows.map((row, index) => [index + 1, ...row]);
sheet.getRange("A5:D19").values = data;
sheet.getRange("A20:C20").values = [["-", "平均", "-"]];
sheet.getRange("D20").formulas = [["=AVERAGE(D5:D19)"]];

sheet.getRange("A5:A19").format.horizontalAlignment = "center";
sheet.getRange("B5:B19").format.horizontalAlignment = "left";
sheet.getRange("C5:D19").format.horizontalAlignment = "right";
sheet.getRange("C5:D19").format.numberFormat = "#,##0";
sheet.getRange("A20:C20").format.horizontalAlignment = "center";
sheet.getRange("D20").format.horizontalAlignment = "right";
sheet.getRange("D20").format.numberFormat = "#,##0.00";

sheet.getRange("A5:D19").format = {
  borders: {
    insideHorizontal: { style: "thin", color: "#D1D5DB" },
    bottom: { style: "thin", color: "#D1D5DB" },
  },
};

sheet.getRange("A4:D20").format.borders = {
  outside: { style: "medium", color: "#111827" },
};
sheet.getRange("A20:D20").format = {
  fill: "#F3F4F6",
  font: { bold: true, color: "#111827" },
  borders: {
    top: { style: "thick", color: "#000000" },
    bottom: { style: "medium", color: "#111827" },
  },
};

sheet.getRange("A4:D20").format.wrapText = false;
sheet.getRange("A:A").format.columnWidth = 8;
sheet.getRange("B:B").format.columnWidth = 14;
sheet.getRange("C:C").format.columnWidth = 12;
sheet.getRange("D:D").format.columnWidth = 14;
sheet.getRange("A4:D20").format.rowHeightPx = 24;

sheet.freezePanes.freezeRows(4);
const table = sheet.tables.add("A4:D20", true, "YuziBattleStats");
table.showFilterButton = true;
table.showBandedColumns = false;

const summaryStart = "G4";
sheet.getRange("G4:H7").values = [
  ["统计项", "数值"],
  ["人数", rows.length],
  ["战功总量合计", null],
  ["平均战功", null],
];
sheet.getRange("H6").formulas = [["=SUM(D5:D19)"]];
sheet.getRange("H7").formulas = [["=AVERAGE(D5:D19)"]];
sheet.getRange("G4:H4").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
sheet.getRange("G5:G7").format = {
  fill: "#F3F4F6",
  font: { bold: true, color: "#111827" },
};
sheet.getRange("H5:H7").format = {
  horizontalAlignment: "right",
  numberFormat: "#,##0.00",
};
sheet.getRange("H5").format.numberFormat = "0";
sheet.getRange("G4:H7").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
sheet.getRange("G:G").format.columnWidth = 16;
sheet.getRange("H:H").format.columnWidth = 16;

const inspect = await workbook.inspect({
  kind: "table",
  range: "A4:D20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 5,
  maxChars: 5000,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "与子战功统计",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outputDir}/与子成员战功统计_preview.png`, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(`${outputDir}/与子成员战功统计.xlsx`);
