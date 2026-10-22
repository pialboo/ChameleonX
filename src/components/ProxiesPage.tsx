import React, { useState } from 'react';
import {
  Shield,
  Plus,
  Zap,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeftRight,
  Info,
  Check,
  X,
  Edit3,
} from 'lucide-react';
import { ProxyItem, ProfileItem } from '../types';
import { api } from '../api';
import { parseProxyQuickInput } from '../utils/proxyParser';

interface ProxiesPageProps {
  proxies: ProxyItem[];
  profiles: ProfileItem[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ProxiesPage: React.FC<ProxiesPageProps> = ({
  proxies,
  profiles,
  onRefresh,
  showToast,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  // Modal state ('single' = 添加代理, 'batch' = 批量添加)
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<'single' | 'batch'>('single');
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);

  // Single Proxy Form State (Dolphin Anty style)
  const [quickInput, setQuickInput] = useState('');
  const [showFormatTip, setShowFormatTip] = useState(false);
  const [proxyType, setProxyType] = useState<'http' | 'socks4' | 'socks5' | 'ssh'>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [changeIpUrl, setChangeIpUrl] = useState('');
  const [touchedSubmit, setTouchedSubmit] = useState(false);
  const [quickTestStatus, setQuickTestStatus] = useState<{
    loading?: boolean;
    ok?: boolean;
    msg?: string;
  } | null>(null);

  // Batch Proxy Form State
  const [batchType, setBatchType] = useState<'http' | 'socks4' | 'socks5' | 'ssh'>('http');
  const [batchRawText, setBatchRawText] = useState('');

  const openCreateModal = (initialTab: 'single' | 'batch' = 'single') => {
    setEditingProxyId(null);
    setModalTab(initialTab);
    setQuickInput('');
    setProxyType('http');
    setHost('');
    setPort('');
    setUsername('');
    setPassword('');
    setName('');
    setChangeIpUrl('');
    setTouchedSubmit(false);
    setQuickTestStatus(null);
    setBatchRawText('');
    setShowModal(true);
  };

  const openEditModal = (px: ProxyItem) => {
    setEditingProxyId(px.id);
    setModalTab('single');
    setQuickInput('');
    setProxyType((px.type as any) || 'http');
    setHost(px.host || '');
    setPort(px.port || '');
    setUsername(px.username || '');
    setPassword(px.password || '');
    setName(px.name || '');
    setChangeIpUrl(px.changeIpUrl || '');
    setTouchedSubmit(false);
    setQuickTestStatus(null);
    setShowModal(true);
  };

  const handleQuickInputChange = (val: string) => {
    setQuickInput(val);
    setQuickTestStatus(null);
    const parsed = parseProxyQuickInput(val, proxyType);
    if (parsed) {
      setProxyType(parsed.type);
      if (parsed.host) setHost(parsed.host);
      if (parsed.port) setPort(parsed.port);
      setUsername(parsed.username || '');
      setPassword(parsed.password || '');
      if (parsed.name) setName(parsed.name);
    }
  };

  const handleCheckQuickProxy = async () => {
    if (!host.trim() || !port.trim()) {
      setTouchedSubmit(true);
      setQuickTestStatus({ ok: false, msg: '代理不可用（請先填寫主機與端口）' });
      return;
    }
    setQuickTestStatus({ loading: true, msg: '正在檢測代理連線...' });
    try {
      const res = await api.testProxy({
        proxyConfig: {
          type: proxyType as any,
          host: host.trim(),
          port: port.trim(),
          username: username.trim(),
          password: password.trim(),
        },
      });
      if (res.ok) {
        setQuickTestStatus({
          ok: true,
          msg: `代理可用 — 出口 IP: ${res.ip} (${res.country}) ${res.latency}ms`,
        });
      } else {
        setQuickTestStatus({
          ok: false,
          msg: '代理不可用',
        });
      }
    } catch (e) {
      setQuickTestStatus({ ok: false, msg: '代理不可用' });
    }
  };

  const handleSubmitSingle = async () => {
    setTouchedSubmit(true);
    if (!host.trim() || !port.trim()) return;

    try {
      const payload = {
        name: name.trim() || `${host.trim()}:${port.trim()}`,
        type: proxyType,
        host: host.trim(),
        port: port.trim(),
        username: username.trim(),
        password: password.trim(),
        changeIpUrl: changeIpUrl.trim(),
      };
      if (editingProxyId) {
        await api.updateProxy(editingProxyId, payload as any);
        showToast('已更新代理');
      } else {
        await api.addProxies(payload);
        showToast('已新增代理');
      }
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmitBatch = async () => {
    if (!batchRawText.trim()) {
      showToast('請輸入至少一行代理資訊', 'error');
      return;
    }
    try {
      const res = await api.addProxies({ rawText: batchRawText, defaultType: batchType });
      showToast(`已批量新增 ${res.addedCount} 組代理`);
      setBatchRawText('');
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === proxies.length) setSelectedIds([]);
    else setSelectedIds(proxies.map((p) => p.id));
  };

  const handleTestSingle = async (proxyId: string) => {
    setTestingId(proxyId);
    try {
      const res = await api.testProxy({ proxyId });
      if (res.ok) {
        showToast(`連線正常：${res.ip} (${res.country}) ${res.latency}ms`);
      } else {
        showToast(`連線失敗：${res.error}`, 'error');
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      const targetIds = selectedIds.length > 0 ? selectedIds : undefined;
      await api.testAllProxies(targetIds);
      showToast('代理檢測完成');
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setTestingAll(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    await api.bulkDeleteProxies(selectedIds);
    showToast(`已刪除 ${selectedIds.length} 組代理`);
    setSelectedIds([]);
    onRefresh();
  };

  const parsedBatchPreviewCount = batchRawText
    .split(/\r?\n/)
    .map((l) => parseProxyQuickInput(l, batchType))
    .filter((x) => x && x.host && x.port).length;

  const hostEmptyError = touchedSubmit && !host.trim();
  const portEmptyError = touchedSubmit && !port.trim();

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0c0e12]">
      <div className="px-6 py-4 bg-[#12161c] border-b border-[#262f3c] flex items-center justify-between shrink-0">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-400" />
          <span>代理管理</span>
        </h1>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>刪除 ({selectedIds.length})</span>
            </button>
          )}
          <button
            onClick={handleTestAll}
            disabled={testingAll || proxies.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-[#181d24] hover:bg-[#262c44] text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{testingAll ? '檢測中...' : '批量檢測連線'}</span>
          </button>
          <button
            onClick={() => openCreateModal('batch')}
            className="px-3.5 py-1.5 rounded-lg bg-[#181d24] hover:bg-[#262c44] text-sky-300 border border-sky-500/30 text-xs font-semibold transition cursor-pointer"
          >
            批量新增
          </button>
          <button
            onClick={() => openCreateModal('single')}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建代理</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-[#12161c] border border-[#262f3c] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#12161c] border-b border-[#262f3c] text-[11px] font-bold text-slate-400">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={proxies.length > 0 && selectedIds.length === proxies.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-600 accent-sky-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">名稱</th>
                <th className="py-3 px-4">類型</th>
                <th className="py-3 px-4">主機與端口</th>
                <th className="py-3 px-4">出口 IP / 地區</th>
                <th className="py-3 px-4">狀態</th>
                <th className="py-3 px-4">綁定環境</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202437] text-xs">
              {proxies.map((px) => {
                const boundCount = profiles.filter((p) => p.proxyMode === 'saved' && p.proxyId === px.id).length;
                return (
                  <tr key={px.id} className="hover:bg-[#12161c] transition">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(px.id)}
                        onChange={() => toggleSelect(px.id)}
                        className="rounded border-slate-600 accent-sky-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">{px.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[10px] uppercase">
                        {px.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-200">
                      {px.host}:{px.port}
                    </td>
                    <td className="py-3 px-4">
                      {px.lastIp ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold text-[10px]">
                            {px.country || 'IP'}
                          </span>
                          <span className="font-mono text-slate-200">{px.lastIp}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {px.status === 'online' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{px.latency}ms</span>
                        </span>
                      ) : px.status === 'offline' ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>不可用</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>未測試</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{boundCount}</td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleTestSingle(px.id)}
                        disabled={testingId === px.id}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-[11px] font-semibold cursor-pointer"
                      >
                        {testingId === px.id ? '測試中' : '測速'}
                      </button>
                      <button
                        onClick={() => openEditModal(px)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#262f3c] cursor-pointer"
                        title="編輯"
                      >
                        <Edit3 className="w-3.5 h-3.5 inline" />
                      </button>
                      <button
                        onClick={async () => {
                          await api.deleteProxy(px.id);
                          onRefresh();
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {proxies.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-500 text-xs">
                    尚未新增任何代理伺服器
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dolphin Anty 1:1 新建代理 Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18191d] border border-[#2c2e36] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">
            {/* Top Bar */}
            <div className="px-6 pt-5 pb-0 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingProxyId ? '編輯代理' : '新建代理'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs: 新增代理 | 批量新增 */}
            <div className="px-6 mt-3 border-b border-[#2c2e36] flex items-center gap-6">
              <button
                type="button"
                onClick={() => setModalTab('single')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                  modalTab === 'single'
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                新增代理
              </button>
              {!editingProxyId && (
                <button
                  type="button"
                  onClick={() => setModalTab('batch')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                    modalTab === 'batch'
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  批量新增
                </button>
              )}
            </div>

            {modalTab === 'single' ? (
              /* Tab 1: 添加代理 (Simple Form Version — Exact Dolphin Anty Layout) */
              <div className="p-6 space-y-4">
                {/* 快速輸入 */}
                <div className="relative">
                  <div
                    className={`flex items-center bg-[#1e2026] border rounded-lg px-3.5 py-2.5 transition ${
                      quickTestStatus?.ok === false
                        ? 'border-rose-500'
                        : quickTestStatus?.ok === true
                        ? 'border-emerald-500'
                        : 'border-[#343742] focus-within:border-sky-500'
                    }`}
                  >
                    <input
                      type="text"
                      value={quickInput}
                      onChange={(e) => handleQuickInputChange(e.target.value)}
                      placeholder="快速輸入 (貼上將自動填入下方欄位)"
                      className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
                    />
                    <div className="flex items-center gap-2 ml-2 text-slate-400">
                      <button
                        type="button"
                        onClick={handleCheckQuickProxy}
                        title="檢測代理連線"
                        className="hover:text-white transition cursor-pointer"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFormatTip(!showFormatTip)}
                        title="檢視支援的代理格式"
                        className="hover:text-white transition cursor-pointer"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {quickTestStatus && (
                    <div
                      className={`text-[11px] mt-1 font-medium ${
                        quickTestStatus.loading
                          ? 'text-sky-400'
                          : quickTestStatus.ok
                          ? 'text-emerald-400'
                          : 'text-rose-500'
                      }`}
                    >
                      {quickTestStatus.msg}
                    </div>
                  )}

                  {showFormatTip && (
                    <div className="mt-2 p-3 rounded-lg bg-[#23262f] border border-[#363a47] text-[11px] text-slate-300 space-y-1 font-mono">
                      <div className="font-sans font-bold text-white mb-1">支援自動識別以下所有格式順序：</div>
                      <div>• 192.168.0.1:8000</div>
                      <div>• 192.168.0.1:8000:login:password</div>
                      <div>• login:password:192.168.0.1:8000</div>
                      <div>• login:password@192.168.0.1:8000</div>
                      <div>• 192.168.0.1:8000@login:password</div>
                      <div>• socks5://login:password@192.168.0.1:8000</div>
                    </div>
                  )}
                </div>

                {/* Protocol Segmented Buttons: HTTP | SOCKS4 | SOCKS5 | SSH */}
                <div className="inline-flex bg-[#121317] p-1 rounded-lg border border-[#2c2e36]">
                  {(['http', 'socks4', 'socks5', 'ssh'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProxyType(t)}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-bold uppercase transition cursor-pointer ${
                        proxyType === t
                          ? 'bg-[#2b2e38] text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* 主機 & 端口 (2 Columns) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="主機"
                      className={`w-full bg-[#1e2026] border rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none transition ${
                        hostEmptyError ? 'border-rose-500' : 'border-[#343742] focus:border-sky-500'
                      }`}
                    />
                    {hostEmptyError && (
                      <div className="text-[11px] text-rose-500 mt-1">此欄位為必填項</div>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="端口"
                      className={`w-full bg-[#1e2026] border rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none transition ${
                        portEmptyError ? 'border-rose-500' : 'border-[#343742] focus:border-sky-500'
                      }`}
                    />
                    {portEmptyError && (
                      <div className="text-[11px] text-rose-500 mt-1">此欄位為必填項</div>
                    )}
                  </div>
                </div>

                {/* 登入 & 密碼 (2 Columns) */}
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="登入"
                    className="w-full bg-[#1e2026] border border-[#343742] focus:border-sky-500 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密碼"
                    className="w-full bg-[#1e2026] border border-[#343742] focus:border-sky-500 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                {/* 代理名稱 */}
                <div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="代理名稱"
                    className="w-full bg-[#1e2026] border border-[#343742] focus:border-sky-500 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">可選</div>
                </div>

                {/* IP 更換連結 */}
                <div>
                  <input
                    type="text"
                    value={changeIpUrl}
                    onChange={(e) => setChangeIpUrl(e.target.value)}
                    placeholder="IP 更換連結"
                    className="w-full bg-[#1e2026] border border-[#343742] focus:border-sky-500 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                {/* Footer */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitSingle}
                    className="px-5 py-2 rounded-lg bg-[#2b2e38] hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingProxyId ? '儲存代理' : '添加代理'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Tab 2: 批量添加 (Batch Input Version) */
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="inline-flex bg-[#121317] p-1 rounded-lg border border-[#2c2e36]">
                    {(['http', 'socks4', 'socks5', 'ssh'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setBatchType(t)}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold uppercase transition cursor-pointer ${
                          batchType === t
                            ? 'bg-[#2b2e38] text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">
                    已識別 <strong className="text-sky-400">{parsedBatchPreviewCount}</strong> 組代理
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#23262f] border border-[#363a47] text-[11px] text-slate-300 font-mono space-y-0.5">
                  <div className="font-sans font-semibold text-slate-200 mb-1">
                    每行輸入一組代理，支援以下所有格式順序：
                  </div>
                  <div>• 主機:端口:登入:密碼 (例: 192.168.0.1:8000:user:pass#名稱)</div>
                  <div>• 登入:密碼:主機:端口 (例: user:pass:192.168.0.1:8000)</div>
                  <div>• 登入:密碼@主機:端口 或 主機:端口@登入:密碼</div>
                  <div>• socks5://登入:密碼@主機:端口</div>
                </div>

                <textarea
                  rows={7}
                  value={batchRawText}
                  onChange={(e) => setBatchRawText(e.target.value)}
                  placeholder={'每行貼上一組代理...\n192.168.0.1:8000:login:password\nlogin:password@192.168.0.1:8000'}
                  className="w-full bg-[#1e2026] border border-[#343742] focus:border-sky-500 rounded-lg p-3.5 text-xs font-mono text-white placeholder:text-slate-500 outline-none"
                />

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitBatch}
                    className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>批量新增 ({parsedBatchPreviewCount})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
