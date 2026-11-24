# 經驗柑仔店 品牌套件（經驗柑仔店 Know-how Corner Store Design System｜網站 UI/UX 規範，Ver. Official）

給組員建置網站用。把整個資料夾放進 GitHub 專案（建議放在 `assets/brand/`），照下面三步就能套用。

> 設計師、行銷夥伴請看 Figma 檔「巷口服務所 Design System Ver. Official」，那裡有標誌使用規範、色票、字體與元件。

## 資料夾內容

```
brand-kit/
├─ css/
│  ├─ tokens.css       設計變數：顏色、字體、間距、圓角、陰影、動畫（一定要先載入）
│  ├─ components.css   元件樣式（按鈕、面板、狀態標籤、對話泡泡、印章…，class 前綴 xk-）
│  └─ brand.css        標誌元件（.brand-logo）
├─ logo/
│  ├─ mark.svg              標誌圖形（網頁用這個）
│  ├─ favicon.svg           瀏覽器分頁小圖示
│  ├─ mark-16/32/48/512.png 圖形的 PNG 版（舊瀏覽器、社群分享用）
│  ├─ app-icon.svg          App 圖示（鵝黃方塊版）
│  ├─ app-icon-512.png
│  └─ apple-touch-icon.png  手機加到主畫面時的圖示（180px）
├─ icons/
│  ├─ svg/                  17 個 Symbol 圖示，一個圖示一個檔
│  ├─ icons-sprite.svg      全部圖示合成一個檔（進階用法）
│  └─ icons.json            每個圖示代表的意思
├─ patterns/                紋樣：遮雨棚條紋、道路虛線、筆記本橫線
├─ mascot/svg/              店貓小橘 12 張（4 表情 × 無／新人名牌／資深圍巾）
├─ js/xiaoju.js             用程式產生小橘（可換表情、尾巴會甩）
├─ preview.html        預覽頁：打開就能看到所有東西套用後的樣子
└─ README.md
```

## 1. 在每個頁面的 `<head>` 加這幾行

```html
<link rel="icon" type="image/svg+xml" href="assets/brand/logo/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="assets/brand/logo/mark-32.png">
<link rel="apple-touch-icon" href="assets/brand/logo/apple-touch-icon.png">
<link rel="stylesheet" href="assets/brand/css/tokens.css">
<link rel="stylesheet" href="assets/brand/css/components.css">
<link rel="stylesheet" href="assets/brand/css/brand.css">
```

順序很重要：`tokens.css` 一定在最前面。字體（粉圓體 Huninn、思源黑體 Noto Sans TC）會由 `tokens.css` 自動從 Google Fonts 載入。

## 2. 放上標誌

橫式（網站頁首用）：

```html
<a class="brand-logo" href="index.html" aria-label="經驗柑仔店 首頁">
  <img class="brand-logo__mark" src="assets/brand/logo/mark.svg" alt="">
  <span class="brand-logo__text">
    <span class="brand-logo__name">經驗柑仔店</span>
    <span class="brand-logo__tagline">Know-how Corner Store</span>
  </span>
</a>
```

- 直式（首頁、封面）：在 `brand-logo` 後面加 `brand-logo--vertical`
- 深色底（ink）：再加 `brand-logo--dark`

字樣用文字＋字體做，不用圖片，所以清楚、好改，也方便螢幕報讀。

## 3. 用變數，不要寫死色碼

```css
.my-card {
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  color: var(--ink);
}
```

常用元件 class：`xk-btn`（主要按鈕）、`xk-btn-ghost`（次要按鈕）、`xk-panel`（主要面板）、`xk-soft`（次要面板）、`xk-cap`（格子標籤）、`xk-chip xk-chip-new / doing / ship / return / done / alert`（狀態標籤）、`xk-bubble`（對話泡泡）、`xk-stamp`（印章）。完整樣式看 `preview.html`。

## 4. 使用 Symbol 圖示

```html
<img class="xk-icon" src="assets/brand/icons/svg/book.svg" alt=""> SOP 查詢
```

- 預設 24px；`xk-icon--sm` 是 20px（最小），`xk-icon--lg` 是 48px。
- 圖示一定搭配文字。圖示只是裝飾時寫 `alt=""`；單獨使用（例如只有圖示的按鈕）要在按鈕加 `aria-label`。
- 放進狀態標籤：`<span class="xk-chip xk-chip-new"><img class="xk-icon" src=".../chat.svg" alt="">待處理</span>`

| 圖示 | 用在哪裡 |
| --- | --- |
| storefront | 首頁、街區地圖、功能區入口 |
| book | SOP、知識書屋、規則查詢 |
| search | 搜尋 |
| chat | 對話、買家來訊、待處理、練習對話 |
| quiz | 測驗、檢核 |
| medal | 徽章、等級、獎勵 |
| person | 我的、新人、個人進度 |
| lightbulb | 提示、學長姐小撇步 |
| pencil | 筆記、回饋紀錄、回報 |
| clock | 回覆時限、等待時間 |
| headset | 客服、處理中 |
| package | 包裹、出貨、配送中 |
| return-box | 退貨、退款 |
| receipt | 付款、發票、扣款紀錄 |
| cart | 下單、訂單內容 |
| stamp | 完成、已確認、結案 |
| lantern | 注意、異常、需升級主管 |

狀態標籤固定搭配：待處理＝chat、處理中＝headset、配送中＝package、退貨／退款中＝return-box、已完成＝stamp、需升級主管＝lantern。

## 5. 使用紋樣

```html
<div class="xk-pat-awning"></div>      <!-- 遮雨棚條紋：店面、頁首裝飾條 -->
<div class="xk-pat-road"></div>        <!-- 道路虛線：進度條、物流時間線 -->
<div class="xk-pat-notebook">…</div>   <!-- 筆記本橫線：回覆草稿、筆記區，行高 32px -->
```

紋樣只用在插畫和特定元件，不要鋪滿整頁背景。

## 6. 店貓小橘

兩種用法，擇一：

```html
<!-- A. 直接放圖檔（最簡單） -->
<img class="xiaoju" src="assets/brand/mascot/svg/xiaoju-happy-rookie.svg" alt="店貓小橘">

<!-- B. 用 JS 產生（可以換表情，尾巴會甩） -->
<script src="assets/brand/js/xiaoju.js"></script>
<div class="xk-cat-say">
  <span id="cat"></span>
  <div class="xk-bubble xk-bubble-cat">先看訂單紀錄再回覆，喵。</div>
</div>
<script>document.getElementById("cat").innerHTML = xiaoju({expr: "hint", gear: "rookie"});</script>
```

- 表情 `expr`：`default` 平常、`happy` 道謝／結案、`hint` 提醒、`confused` 喵？（回覆有問題）
- 配件 `gear`：空白（無）、`rookie` 新人名牌、`senior` 資深圍巾
- 大小：`xiaoju`（96px）、`xiaoju--sm`（56px）、`xiaoju--lg`（140px）
- `xiaoju.js` 的參數和 SOP 統整中心 `core.js` 裡的舊版 `xiaoju()` 相同，可以直接取代舊版畫法。
- 規則：只出現在對話泡泡旁與進度路上；不負責打分數；一則話最多一個「喵」；不做飄在畫面上的角色。

## 規則速記

- 一頁只用奶茶底、陶土紅、鵝黃三個色系；gold、terracotta-light 填色上的文字一律用 ink。
- 每頁最多 1–2 個 `xk-panel`，每個區塊最多 1 個主要按鈕。
- 標誌不改色、不變形、不加模糊陰影；圖形最小 18px。
- 動畫要支援「減少動態效果」（已寫在 components.css）。
- API 金鑰不能放在這些前端檔案或 GitHub 裡。

## 版本

- Ver. Official（2026-11-23）：以巷口服務所 Design System v2 為基礎，加入「經驗柑仔店／對話小舖」標誌，取代 v2 的腳掌標誌；依標誌風格重新繪製網站用的 17 個 Symbol 與 3 種紋樣，狀態標籤加上圖示。
- 同日更新：依標誌風格重畫店貓小橘（4 表情 × 3 配件），加入 `mascot/` 與 `js/xiaoju.js`。
- 未納入：3D 互動城市的插畫素材、v2 的小橘 Lv1～Lv5 等級裝備（components.css 仍保留 v2 的 3D 城市樣式）。
