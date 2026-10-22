import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Download,
  CheckCircle2,
  FolderOpen,
  LayoutGrid,
  AlertTriangle,
  Check,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { AppSettings, KernelInfo } from '../types';
import { api } from '../api';

interface KernelSettingsPageProps {
  settings: AppSettings;
  kernelInfo: KernelInfo;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const KernelSettingsPage: React.FC<KernelSettingsPageProps> = ({
  settings,
  kernelInfo,
  onRefresh,
  showToast,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [liveKernel, setLiveKernel] = useState<KernelInfo>(kernelInfo);
  const [saving, setSaving] = useState(false);
  const [justCompletedInstall, setJustCompletedInstall] = useState(false);
  const isDirtyRef = React.useRef(false);

  useEffect(() => {
    // 只有在使用者沒有處於尚未儲存的編輯狀態時，才從後端 props 同步更新
    if (!isDirtyRef.current) {
      setLocalSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    setLiveKernel(kernelInfo);
  }, [kernelInfo]);

  useEffect(() => {
    if (!liveKernel?.downloadState?.downloading) return;
    const timer = setInterval(async () => {
      try {
        const st = await api.getKernelStatus();
        setLiveKernel(st);
        if (!st.downloadState.downloading) {
          if (st.downloadState.progress === 100 && !st.downloadState.error) {
            setJustCompletedInstall(true);
            showToast('✅ Fingerprint-Chromium 核心安裝完成！');
            setTimeout(() => {
              setJustCompletedInstall(false);
            }, 6000);
          }
          onRefresh();
        }
      } catch (e) {}
    }, 1000);
    return () => clearInterval(timer);
  }, [liveKernel?.downloadState?.downloading]);

  const handleStartDownload = async () => {
    try {
      await api.downloadKernel();
      const st = await api.getKernelStatus();
      setLiveKernel(st);
      showToast('開始下載 Fingerprint-Chromium 核心');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSettings = async (override?: Partial<AppSettings>) => {
    setSaving(true);
    const toSave = { ...localSettings, ...(override || {}) };
    try {
      await api.updateSettings(toSave);
      setLocalSettings(toSave);
      isDirtyRef.current = false;
      showToast('設定已儲存');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 開關與下拉選單直接即時儲存，提供直覺且穩定的設定體驗
  const handleToggle = async (key: keyof AppSettings) => {
    const nextVal = !localSettings[key];
    const updated = { ...localSettings, [key]: nextVal };
    setLocalSettings(updated);
    try {
      await api.updateSettings(updated);
      isDirtyRef.current = false;
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSelectChange = async (key: keyof AppSettings, val: any) => {
    const updated = { ...localSettings, [key]: val };
    setLocalSettings(updated);
    try {
      await api.updateSettings(updated);
      isDirtyRef.current = false;
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleBrowseCustomKernel = async () => {
    if (window.electronAPI?.selectFile) {
      const file = await window.electronAPI.selectFile([
        { name: 'Chromium 執行檔', extensions: ['exe'] },
      ]);
      if (file) {
        const updated = { ...localSettings, kernelMode: 'custom' as const, customKernelPath: file };
        setLocalSettings(updated);
        try {
          await api.updateSettings(updated);
          isDirtyRef.current = false;
          showToast('自訂核心路徑已儲存');
          onRefresh();
        } catch (err: any) {
          showToast(err.message, 'error');
        }
      }
    }
  };

  const dl = liveKernel?.downloadState;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] flex items-center justify-between shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>核心與設定</span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Kernel Configuration */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">瀏覽器核心 (Fingerprint-Chromium)</span>
              {liveKernel.hasFingerprintChromium ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  軟體已偵測到核心
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  尚未下載安裝
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {liveKernel.hasFingerprintChromium ? (
                <button
                  onClick={handleStartDownload}
                  disabled={dl?.downloading}
                  className="px-3 py-1.5 rounded-lg bg-[#1f2438] hover:bg-[#282f49] border border-[#2e3654] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="更新核心至最新版本"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${dl?.downloading ? 'animate-spin' : ''}`} />
                  <span>{dl?.downloading ? `更新中 (${dl.progress}%)` : '更新核心'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartDownload}
                  disabled={dl?.downloading}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {dl?.downloading
                      ? `下載中 (${dl.progress}%)`
                      : '一鍵下載安裝 Fingerprint-Chromium'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 未安裝核心提示 */}
          {!liveKernel.hasFingerprintChromium && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-amber-300">
                  ⚠️ 軟體偵測到目前「尚未下載」Fingerprint-Chromium 底層核心
                </div>
                <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  目前啟動環境將自動使用「系統本機 Chrome」。若需要原生 C++ 底層防關聯核心，可點擊右上角「一鍵下載安裝」。
                </div>
              </div>
            </div>
          )}

          {/* 下載進度條 & 安裝完成暫態提示 (安裝完成僅顯示一次) */}
          {(dl?.downloading || (justCompletedInstall && dl?.progress === 100) || dl?.error) && (
            <div className="p-3.5 rounded-xl bg-[#12161c] border border-[#2a3048] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">{dl.statusText}</span>
                <div className="flex items-center gap-2">
                  {dl?.downloading && dl.totalMB !== '0.0' && (
                    <span className="font-mono text-sky-300">
                      {dl.downloadedMB} / {dl.totalMB} MB ({dl.progress}%)
                    </span>
                  )}
                  {justCompletedInstall && (
                    <button
                      onClick={() => setJustCompletedInstall(false)}
                      className="text-slate-400 hover:text-white text-xs cursor-pointer px-2 py-0.5 rounded bg-[#23283c] transition"
                    >
                      關閉
                    </button>
                  )}
                </div>
              </div>
              {dl?.downloading && (
                <div className="w-full h-2 bg-[#0c0e12] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${dl.progress}%` }}
                  />
                </div>
              )}
              {dl?.error && <div className="text-xs text-rose-400">錯誤：{dl.error}</div>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">使用核心</label>
              <select
                value={localSettings.kernelMode}
                onChange={(e) => handleSelectChange('kernelMode', e.target.value)}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
              >
                <option value="auto">
                  自動選擇 (優先使用 Fingerprint-Chromium) - {liveKernel.hasFingerprintChromium ? '[已下載]' : '[⚠️ 未下載，使用系統 Chrome]'}
                </option>
                <option value="fingerprint-chromium">
                  Fingerprint-Chromium - {liveKernel.hasFingerprintChromium ? '[已下載]' : '[⚠️ 尚未下載，降級系統 Chrome]'}
                </option>
                <option value="system-chrome">系統 Chrome (本機安裝版本)</option>
                <option value="custom">自訂核心路徑 (手動指定 chrome.exe)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">自訂核心路徑 (chrome.exe)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localSettings.customKernelPath}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setLocalSettings({ ...localSettings, customKernelPath: e.target.value, kernelMode: 'custom' });
                  }}
                  onBlur={() => handleSaveSettings()}
                  placeholder="C:\path\to\chrome.exe"
                  className="flex-1 bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                {window.electronAPI?.isElectron && (
                  <button
                    type="button"
                    onClick={handleBrowseCustomKernel}
                    className="px-3 py-2 rounded-lg bg-[#262f3c] hover:bg-[#2c3149] text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>瀏覽</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Currently Active Kernel Info Box */}
          <div className="p-3 rounded-lg bg-[#10121c] border border-[#262f3c] text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">軟體當前啟動生效的核心：</span>
              {liveKernel.activeKernel?.isFingerprintCore ? (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                  C++ 底層防關聯核心
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                  一般系統瀏覽器 (無底層 C++ 噪聲)
                </span>
              )}
            </div>
            <div className="text-slate-200 font-medium">
              {liveKernel.activeKernel?.name || '未偵測到瀏覽器'}
            </div>
            <div className="text-slate-400 font-mono text-[11px] truncate">
              {liveKernel.activeKernel?.path || '無路徑'}
            </div>
            {liveKernel.fallbackReason && (
              <div className="text-amber-400 font-semibold text-[11px] pt-1">
                ⚠️ {liveKernel.fallbackReason}
              </div>
            )}
          </div>
        </div>

        {/* General & Bulk Settings */}
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl p-5 space-y-4">
          <div className="text-sm font-bold text-white flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-sky-400" />
            <span>啟動與批量操作選項</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">批量啟動間隔 (毫秒)</label>
              <input
                type="number"
                min={0}
                step={200}
                value={localSettings.batchLaunchDelayMs}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setLocalSettings({ ...localSettings, batchLaunchDelayMs: Number(e.target.value) });
                }}
                onBlur={() => handleSaveSettings()}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">自動並排視窗列數</label>
              <select
                value={localSettings.tileColumns}
                onChange={(e) => handleSelectChange('tileColumns', Number(e.target.value))}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
              >
                <option value={2}>每排 2 個視窗</option>
                <option value={3}>每排 3 個視窗</option>
                <option value={4}>每排 4 個視窗</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">預設啟動首頁</label>
              <input
                type="text"
                value={localSettings.defaultStartPage}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setLocalSettings({ ...localSettings, defaultStartPage: e.target.value });
                }}
                onBlur={() => handleSaveSettings()}
                className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              自訂額外 Chromium 啟動參數 (進階，例如 <span className="font-mono text-sky-400">--disable-gpu</span>)
            </label>
            <input
              type="text"
              placeholder="例如: --disable-gpu --no-sandbox"
              value={localSettings.extraChromiumArgs || ''}
              onChange={(e) => {
                isDirtyRef.current = true;
                setLocalSettings({ ...localSettings, extraChromiumArgs: e.target.value });
              }}
              onBlur={() => handleSaveSettings()}
              className="w-full bg-[#0c0e12] border border-[#262f3c] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {[
              { key: 'autoTileWindows', title: '批量啟動時自動網格並排視窗' },
              { key: 'showWindowBadge', title: '視窗右下角顯示環境名稱與 Seed 標籤' },
              { key: 'syncCookiesOnClose', title: '關閉瀏覽器時自動備份最新 Cookie' },
              { key: 'muteAudio', title: '環境啟動時預設靜音' },
            ].map((item) => {
              const checked = Boolean((localSettings as any)[item.key]);
              return (
                <div
                  key={item.key}
                  onClick={() => handleToggle(item.key as keyof AppSettings)}
                  className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition select-none ${
                    checked
                      ? 'bg-sky-500/15 border-sky-500/40 text-white'
                      : 'bg-[#10121c] border-[#262f3c] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-semibold">{item.title}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    className="w-4 h-4 accent-sky-500 pointer-events-none"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
