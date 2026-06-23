# JYM scraper

This is a small Playwright-based collector for the public goods list rendered at:

https://www.jiaoyimao.com/lingxi/g1009207/?newPage=true

It opens the page in Chrome, scrolls slowly until no more goods are loaded, extracts `.goods-item-role` cards, deduplicates by `goodsId`, and writes JSON plus CSV files into `output/`.

## Run

From this folder:

```powershell
npm install
npm run scrape
```

If `npm` is not recognized, install Node.js from https://nodejs.org/ first, then reopen PowerShell.

You can also run the script directly after `npm install`:

```powershell
node .\scrape-jym.mjs
```

## Options

```powershell
node .\scrape-jym.mjs --url "https://www.jiaoyimao.com/lingxi/g1009207/?newPage=true" --outDir output --maxIdleScrolls 6 --maxScrolls 200 --delayMs 1200
```

Collect detail-page hero data for the loaded goods:

```powershell
node .\scrape-jym.mjs --withDetails --detailLimit 1 --maxScrolls 3 --outDir output-test
```

`--withDetails` opens each goods detail page and extracts the `武将` module from the page's initial data. It writes:

- `jym-goods-*.csv`: main goods table, updated with important hero columns when details are enabled
- `jym-goods-details-*.json`: nested detail data per goods item
- `jym-goods-heroes-*.csv`: flat raw hero rows for Excel
- `jym-goods-heroes-unique-*.csv`: de-duplicated hero rows for Excel

Use `--headless` only after the visible Chrome run works reliably.

## Protocol sample

The protocol sampler avoids list-page scrolling. It bootstraps the mtop headers once, requests the goods-list protocol directly, then fetches the first detail page HTML directly to verify hero extraction:

```powershell
npm run protocol:sample -- --pages 1 --pageSize 16 --outDir protocol-output-test
```

Current confirmed protocol endpoints:

- Goods list: `mtop.com.jym.layout.pc.goodslist.getUnifiedGoodsList`
- Detail heroes: still parsed from detail-page `window.__INITIAL_DATA__`

Formal protocol scraper:

```powershell
npm run scrape:protocol -- --maxScanGoods 10000 --targetGoods 1000 --pageSize 16 --outDir protocol-output
```

Default protocol filters:

- 商品类型：成品号
- 服务保障：账号转移
- 价格：>= 1000
- 服务器：PK 服务器
- 排除：地区服

The protocol scraper reads the newest JSON table in the output directory and updates rows by `goodsId`. New goods are appended; existing goods are refreshed. If a previously in-sale item changes to sold/down, it records the observed sale time and sale duration.

Current run rules:

- Rows priced below 500 are filtered out before each run.
- Existing active rows are refreshed first.
- Newly scanned goods are processed afterward.
- Goods already refreshed in the same run are not opened again.

List scanning stops when any one condition is met:

- scanned list goods reaches `--maxScanGoods` (default `10000`)
- collected target goods reaches `--targetGoods` (default `1000`)
- the goods-list protocol returns an empty page
- optional `--pages` limit is reached

Delay controls:

- `--delayMs 1500` controls detail-page request delay; default is 1500ms.
- `--listDelayMs 300` controls goods-list protocol page delay; default is 300ms.

CAPTCHA handling is enabled by default. If a detail page returns a slider-verification page, the scraper opens a visible Chrome window and waits for manual completion:

```powershell
npm run scrape:protocol -- --pages 10 --pageSize 16 --outDir protocol-output --captchaWaitMs 600000
```

Use `--manualCaptcha false` to disable this and record the failure instead.

Browser scrolling mode:

```powershell
npm run scrape:browser -- --maxScanGoods 10000 --targetGoods 1000 --outDir browser-output --delayMs 5000 --listDelayMs 1000
```

This mode loads the goods list in Chrome, scrolls the page to collect cards, then opens detail pages in the same browser session. It keeps the same filters and output columns as the protocol scraper.

Chrome assisted mode:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222 --user-data-dir=$env:USERPROFILE\jym-chrome-profile"
```

In that Chrome window, log in to Jiaoyimao and open the goods list page. Then run:

```powershell
npm run scrape:chrome -- --maxScanGoods 10000 --targetGoods 1000 --outDir chrome-output --delayMs 1500 --listDelayMs 1000 --maxIdleScrolls 60 --stopOnCaptcha true --skipExistingDetails true --checkpointEvery 10
```

This mode connects to `http://127.0.0.1:9222`, reuses the opened Chrome session, scrolls the list, and opens detail pages by clicking goods cards when possible. It does not bypass slider verification. If verification appears, pause the run and handle it manually in Chrome.

Default goods filters:

- `--requirePkServer false` disables the default `PK数字` server requirement.
- `--excludeRegionalServer false` disables the default `地区服` exclusion.
- `--productType 成品号` keeps only finished-account goods. Use `--productType false` to disable the product-type filter.

## Notes

Use this gently and respect the site's terms, robots rules, rate limits, and account rules. The script does not bypass login, CAPTCHA, or anti-abuse checks.
