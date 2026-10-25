# 🦎 變色龍指紋瀏覽器 (ChameleonX) — 全繁體中文防關聯桌面系統

這是一套專為多帳號隔離、電商矩陣、社群營運與手動防關聯打造的**全繁體中文獨立桌面軟體（Electron）**，具備變色龍般靈活的多維指紋擬態與無限制環境管理能力。

> 📥 **Windows 安裝程式直接下載**：[點此前往 GitHub Releases 下載最新版安裝檔 (`ChameleonX Setup 1.0.0.exe`)](https://github.com/pialboo/ChameleonX/releases/latest)

## ✨ 核心特色

1. **無數量與功能限制**：
   - 環境數量無上限（完全取決於您的硬碟空間），所有資料保存在本地 `data/db.json` 與 `data/profiles/`。
2. **雙重底層指紋防護（Fingerprint-Chromium + AntyCore）**：
   - **C++ 底層核心**：內建一鍵從 GitHub 自動下載並安裝最新 **[fingerprint-chromium](https://github.com/adryfish/fingerprint-chromium)** 功能，支援 `--fingerprint=<種子>`、`--fingerprint-platform`、`--fingerprint-brand`、`--fingerprint-hardware-concurrency`、`--timezone`、`--lang` 等底層參數。
   - **AntyCore 輔助引擎**：每個環境啟動時自動生成專屬的 `MAIN` world 硬體指紋防護與右下角視窗環境識別標籤（即使尚未下載 Fingerprint-Chromium、使用本機 Google Chrome 也能立即體驗環境隔離、WebGL 顯卡偽裝、Canvas/Audio 雜訊防護與視窗識別）。
3. **強大的擴充功能自動掛載與更新中心（Extensions Manager）**：
   - **方式一（本地資料夾）**：直接選擇任何已解壓縮、包含 `manifest.json` 的擴充功能目錄，支援一鍵重新讀取更新。
   - **方式二（匯入 `.crx` / `.zip`）**：自動剝離 CRX2/CRX3 標頭並解壓縮至本地擴充功能庫，支援選取新版檔案覆蓋更新。
   - **方式三（Chrome 線上商店一鍵安裝）**：貼上商店網址或 32 位元 ID，直接從 Google 官方下載，支援在刪除按鈕旁一鍵線上檢查更新。
   - 支援設為 **「全域預設掛載」**（所有環境啟動時自動透過 `--load-extension` 載入）或透過批量操作掛載至特定環境。
4. **完整的批量操作中心（Bulk Actions）**：
   - **批量建立環境 (Mass Create)**：一次建立多達 200 個獨立指紋環境，自動依序或隨機分配代理池。
   - **批量啟動 & 自動網格並排視窗 (Auto Tile Windows)**：勾選多個環境一鍵啟動，自動計算螢幕座標將多個瀏覽器視窗整齊排列於桌面。
   - **批量關閉 / 批量更換代理 / 批量掛載擴充功能 / 批量更換新指紋 / 批量匯出 Cookie / 批量改狀態與標籤**。
5. **內建本地認證代理轉發（Proxy Forwarder）**：
   - 透過 `proxy-chain` 自動將帶帳號密碼的 `http://user:pass@ip:port` 轉發為本地免驗證埠號，瀏覽器啟動絕不彈出代理帳密輸入框，並支援一鍵批量測速與查詢出口 IP 地區/時區。

---

## 🚀 啟動方式

### 方法一：雙擊批次檔直接啟動桌面軟體
直接雙擊專案目錄下的：
- [`啟動_ChameleonX.bat`](./啟動_ChameleonX.bat)

### 方法二：透過終端機指令啟動
```bash
# 編譯前端資源
npm.cmd run build

# 啟動 Electron 桌面視窗
npm.cmd start
```

---

## 📦 製作與發布 Windows 安裝檔

本軟體採用輕量化安裝檔架構（不隨附大型舊版核心，安裝包僅約 80MB）。使用者安裝後，可在軟體介面內直接在線下載最新版指紋核心。

### 製作安裝檔指令
在專案目錄執行：
```bash
npm.cmd run dist
```
建置完成後，安裝檔將產生於 `release/` 目錄：
- `release/ChameleonX Setup 1.0.0.exe`（直接提供給其他使用者安裝即可）

### 其他使用者安裝流程
1. 執行 `ChameleonX Setup 1.0.0.exe` 開始安裝（支援自選路徑、自動建立桌面捷徑）。
2. **安裝過程中彈出核心下載選項**：
   - 點選**【是】**：安裝程式自動從官方 GitHub 下載最新版 Fingerprint-Chromium 並配置完成，安裝後直接開箱即用。
   - 點選**【否】**：跳過下載（適用離線安裝），使用者隨時可在開啟軟體後，至「核心設定」手動下載。
