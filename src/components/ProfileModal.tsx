import React, { useState, useEffect } from 'react';
import {
  X,
  Dices,
  Shield,
  Puzzle,
  Cookie,
  Cpu,
  Monitor,
  Check,
  Zap,
  Layers,
  UserPlus,
  RefreshCw,
  ArrowLeftRight,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  ProfileItem,
  FingerprintConfig,
  ProxyItem,
  ExtensionItem,
  StatusItem,
  FolderItem,
} from '../types';
import { api } from '../api';
import { parseProxyQuickInput } from '../utils/proxyParser';

interface ProfileModalProps {
  isOpen: boolean;
  initialMode: 'single' | 'mass';
  editingProfile: ProfileItem | null;
  profiles?: ProfileItem[];
  proxies: ProxyItem[];
  extensions: ExtensionItem[];
  statuses: StatusItem[];
  folders: FolderItem[];
  availableTags: string[];
  defaultStartPage: string;
  onClose: () => void;
  onSaved: () => void;
}

const GPU_PRESETS: Record<
  'windows' | 'macos' | 'linux',
  Array<{ vendor: string; renderer: string; cpu: number; ram: number; res: string }>
> = {
  windows: [
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 16,
      ram: 8,
      res: '2560x1440',
    },
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 12,
      ram: 8,
      res: '2560x1440',
    },
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 12,
      ram: 8,
      res: '1920x1080',
    },
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 8,
      ram: 8,
      res: '1920x1080',
    },
    {
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 8,
      ram: 8,
      res: '1920x1080',
    },
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 8,
      ram: 8,
      res: '1920x1080',
    },
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpu: 4,
      ram: 4,
      res: '1366x768',
    },
  ],
  macos: [
    {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      cpu: 8,
      ram: 8,
      res: '1440x900',
    },
    {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
      cpu: 12,
      ram: 8,
      res: '1512x982',
    },
    {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
      cpu: 10,
      ram: 8,
      res: '1512x982',
    },
  ],
  linux: [
    {
      vendor: 'Google Inc. (NVIDIA Corporation)',
      renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6.0)',
      cpu: 12,
      ram: 8,
      res: '1920x1080',
    },
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      cpu: 8,
      ram: 8,
      res: '1920x1080',
    },
  ],
};

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  initialMode,
  editingProfile,
  profiles = [],
  proxies,
  extensions,
  statuses,
  folders,
  availableTags,
  defaultStartPage,
  onClose,
  onSaved,
}) => {
  const [mode, setMode] = useState<'single' | 'mass'>(initialMode);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('fld-all');
  const [statusId, setStatusId] = useState('st-new');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [os, setOs] = useState<'windows' | 'macos' | 'linux'>('windows');
  const [startPage, setStartPage] = useState(defaultStartPage || 'https://www.google.com');

  const [proxyMode, setProxyMode] = useState<'none' | 'saved' | 'custom'>('none');
  const [proxyId, setProxyId] = useState('');
  const [customProxyType, setCustomProxyType] = useState<'http' | 'socks4' | 'socks5' | 'ssh'>('http');
  const [customProxyRaw, setCustomProxyRaw] = useState('');
  const [customProxyHost, setCustomProxyHost] = useState('');
  const [customProxyPort, setCustomProxyPort] = useState('');
  const [customProxyUser, setCustomProxyUser] = useState('');
  const [customProxyPass, setCustomProxyPass] = useState('');
  const [customProxyName, setCustomProxyName] = useState('');
  const [customProxyChangeUrl, setCustomProxyChangeUrl] = useState('');
  const [showProxyFormatTip, setShowProxyFormatTip] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestMsg, setProxyTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [selectedExtIds, setSelectedExtIds] = useState<string[]>([]);
  const [cookieText, setCookieText] = useState('');

  const [fp, setFp] = useState<FingerprintConfig | null>(null);

  const [massCount, setMassCount] = useState(5);
  const [massPrefix, setMassPrefix] = useState('環境');
  const [massStartNum, setMassStartNum] = useState(1);
  const [massProxyAssign, setMassProxyAssign] = useState<'none' | 'sequential' | 'random'>('none');

  useEffect(() => {
    if (!isOpen) return;
    setProxyTestMsg(null);
    if (editingProfile) {
      setMode('single');
      setName(editingProfile.name);
      setFolderId(editingProfile.folderId || 'fld-all');
      setStatusId(editingProfile.statusId || 'st-new');
      setSelectedTags(editingProfile.tags || []);
      setNotes(editingProfile.notes || '');
      setOs(editingProfile.os || 'windows');
      setStartPage(editingProfile.startPages?.[0] || defaultStartPage);
      setProxyMode(editingProfile.proxyMode || 'none');
      setProxyId(editingProfile.proxyId || '');
      if (editingProfile.proxy) {
        setCustomProxyType((editingProfile.proxy.type as any) || 'http');
        setCustomProxyHost(editingProfile.proxy.host || '');
        setCustomProxyPort(editingProfile.proxy.port || '');
        setCustomProxyUser(editingProfile.proxy.username || '');
        setCustomProxyPass(editingProfile.proxy.password || '');
      }
      setSelectedExtIds(editingProfile.extensionIds || []);
      setCookieText(
        editingProfile.cookies && editingProfile.cookies.length > 0
          ? JSON.stringify(editingProfile.cookies, null, 2)
          : ''
      );
      setFp({ ...editingProfile.fingerprint });
    } else {
      setMode(initialMode);
      setName('');
      setFolderId('fld-all');
      setStatusId(statuses[0]?.id || 'st-new');
      setSelectedTags([]);
      setNotes('');
      setOs('windows');
      setStartPage(defaultStartPage || 'https://www.google.com');
      setProxyMode('none');
      setProxyId(proxies[0]?.id || '');
      setCustomProxyRaw('');
      setCustomProxyHost('');
      setCustomProxyPort('');
      setCustomProxyUser('');
      setCustomProxyPass('');
      setSelectedExtIds(extensions.filter((e) => e.enabledForAll).map((e) => e.id));
      setCookieText('');
      api.generateFingerprint({ os: 'windows' }).then(setFp);
    }
  }, [isOpen, editingProfile, initialMode]);

  if (!isOpen || !fp) return null;

  const handleRandomizeFingerprint = async (targetOs = os, targetBrand = fp.brand) => {
    const generated = await api.generateFingerprint({ os: targetOs, brand: targetBrand });
    setFp(generated);
  };

  const handleOsChange = async (newOs: 'windows' | 'macos' | 'linux') => {
    setOs(newOs);
    await handleRandomizeFingerprint(newOs, fp.brand);
  };

  const handleQuickParseProxy = (raw: string) => {
    setCustomProxyRaw(raw);
    setProxyTestMsg(null);
    const parsed = parseProxyQuickInput(raw, customProxyType);
    if (parsed) {
      setCustomProxyType(parsed.type);
      if (parsed.host) setCustomProxyHost(parsed.host);
      if (parsed.port) setCustomProxyPort(parsed.port);
      setCustomProxyUser(parsed.username || '');
      setCustomProxyPass(parsed.password || '');
      if (parsed.name) setCustomProxyName(parsed.name);
    }
  };

  const handleTestSelectedProxy = async () => {
    setTestingProxy(true);
    setProxyTestMsg(null);
    try {
      let res;
      if (proxyMode === 'saved' && proxyId) {
        res = await api.testProxy({ proxyId });
      } else if (proxyMode === 'custom') {
        res = await api.testProxy({
          proxyConfig: {
            type: customProxyType,
            host: customProxyHost,
            port: customProxyPort,
            username: customProxyUser,
            password: customProxyPass,
          },
        });
      }
      if (res?.ok) {
        setProxyTestMsg({
          ok: true,
          text: `連線成功：${res.ip} (${res.country}) ${res.latency}ms`,
        });
      } else {
        setProxyTestMsg({ ok: false, text: res?.error || '連線失敗' });
      }
    } catch (err: any) {
      setProxyTestMsg({ ok: false, text: err.message });
    } finally {
      setTestingProxy(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleAddCustomTag = () => {
    const val = customTagInput.trim();
    if (!val) return;
    if (!selectedTags.includes(val)) {
      setSelectedTags([...selectedTags, val]);
    }
    api.createTag(val);
    setCustomTagInput('');
  };

  const toggleExt = (id: string) => {
    setSelectedExtIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (mode === 'mass' && !editingProfile) {
        await api.massCreateProfiles({
          count: massCount,
          namePrefix: massPrefix,
          startNumber: massStartNum,
          os,
          brand: fp.brand,
          folderId,
          statusId,
          tags: selectedTags,
          notes,
          proxyAssignMode: massProxyAssign,
          extensionIds: selectedExtIds,
          startPage,
        });
      } else {
        const customProxyObj: ProxyItem | null =
          proxyMode === 'custom' && customProxyHost && customProxyPort
            ? {
                id: 'px-custom',
                name: `${customProxyHost}:${customProxyPort}`,
                type: customProxyType,
                host: customProxyHost,
                port: customProxyPort,
                username: customProxyUser,
                password: customProxyPass,
              }
            : null;

        const payload: Partial<ProfileItem> = {
          name: name.trim() || undefined,
          folderId,
          statusId,
          tags: selectedTags,
          notes,
          os,
          startPages: [startPage],
          proxyMode,
          proxyId: proxyMode === 'saved' ? proxyId : '',
          proxy: customProxyObj,
          fingerprint: fp,
          extensionIds: selectedExtIds,
          cookies: cookieText.trim() ? (cookieText as any) : [],
        };

        if (editingProfile) {
          await api.updateProfile(editingProfile.id, payload);
        } else {
          await api.createProfile(payload);
        }
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12161c] border border-[#262f3c] rounded-2xl w-full max-w-6xl h-[86vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3.5 bg-[#171a28] border-b border-[#262f3c] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-white">
              {editingProfile ? `編輯環境：${editingProfile.name}` : '建立瀏覽器環境'}
            </h2>

            {!editingProfile && (
              <div className="flex bg-[#11131c] p-1 rounded-lg border border-[#262f3c]">
                <button
                  onClick={() => setMode('single')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    mode === 'single'
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>單一建立</span>
                </button>
                <button
                  onClick={() => setMode('mass')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    mode === 'mass'
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>批量建立</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRandomizeFingerprint()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold transition cursor-pointer"
            >
              <Dices className="w-4 h-4" />
              <span>隨機刷新指紋</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#262f3c] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {mode === 'mass' && !editingProfile ? (
              <div className="p-4 rounded-xl bg-[#12161c] border border-[#262f3c] space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">建立數量</label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={massCount}
                      onChange={(e) => setMassCount(Number(e.target.value))}
                      className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">名稱前綴</label>
                    <input
                      type="text"
                      value={massPrefix}
                      onChange={(e) => setMassPrefix(e.target.value)}
                      className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">起始編號</label>
                    <input
                      type="number"
                      min={1}
                      value={massStartNum}
                      onChange={(e) => setMassStartNum(Number(e.target.value))}
                      className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">代理分配方式</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'none', label: '無代理 (直連)' },
                      { id: 'sequential', label: '從代理池依序分配' },
                      { id: 'random', label: '從代理池隨機分配' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMassProxyAssign(opt.id as any)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          massProxyAssign === opt.id
                            ? 'bg-sky-500/25 border-sky-500 text-white'
                            : 'bg-[#12141e] border-[#262f3c] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {massProxyAssign !== 'none' && massCount > proxies.length && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs mt-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <div className="text-[11px]">
                        <strong>注意：</strong>欲建立 {massCount} 個環境，但可用代理庫僅 {proxies.length} 組，將會有 {massCount - proxies.length} 個環境分配到相同代理造成 IP 重複！
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">環境名稱</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="留空自動編號"
                    className="w-full bg-[#12161c] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white focus:border-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">啟動首頁</label>
                  <input
                    type="text"
                    value={startPage}
                    onChange={(e) => setStartPage(e.target.value)}
                    className="w-full bg-[#12161c] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white focus:border-sky-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Folder, Status, OS */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">資料夾</label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full bg-[#12161c] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">狀態</label>
                <select
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  className="w-full bg-[#12161c] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                >
                  {statuses.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">作業系統</label>
                <div className="grid grid-cols-3 gap-1 bg-[#12161c] p-1 rounded-lg border border-[#262f3c]">
                  {[
                    { id: 'windows', label: 'Windows' },
                    { id: 'macos', label: 'macOS' },
                    { id: 'linux', label: 'Linux' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOsChange(item.id as any)}
                      className={`py-1 rounded text-xs font-semibold transition cursor-pointer ${
                        os === item.id
                          ? 'bg-sky-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tags & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#12161c] p-3.5 rounded-xl border border-[#262f3c]">
                <label className="block text-xs font-semibold text-slate-300 mb-2">標籤</label>
                {availableTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-20 overflow-y-auto">
                    {availableTags.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-0.5 rounded-full text-[11px] transition cursor-pointer ${
                            active
                              ? 'bg-sky-500 text-white'
                              : 'bg-[#181d24] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          # {tag}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomTag())}
                    placeholder="新增標籤..."
                    className="flex-1 bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    className="px-3 py-1.5 rounded-lg bg-[#262f3c] hover:bg-sky-500 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    新增
                  </button>
                </div>
              </div>

              <div className="bg-[#12161c] p-3.5 rounded-xl border border-[#262f3c] flex flex-col">
                <label className="text-xs font-semibold text-slate-300 mb-2">備註</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="輸入備註..."
                  className="flex-1 bg-[#12141e] border border-[#262f3c] rounded-lg p-2 text-xs text-white resize-none outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Proxy Section */}
            {mode === 'single' && (
              <div className="bg-[#12161c] p-4 rounded-xl border border-[#262f3c] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-400" />
                    <span>Proxy 設定</span>
                  </label>
                  <div className="flex bg-[#12141e] p-1 rounded-lg border border-[#262f3c]">
                    {[
                      { id: 'none', label: '無代理' },
                      { id: 'saved', label: '選擇已存代理' },
                      { id: 'custom', label: '自訂代理' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setProxyMode(tab.id as any)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                          proxyMode === tab.id
                            ? 'bg-sky-500 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {proxyMode === 'saved' && (() => {
                  const getProxyBoundProfiles = (targetProxyId: string) => {
                    return profiles.filter(
                      (p) => p.id !== editingProfile?.id && p.proxyMode === 'saved' && p.proxyId === targetProxyId
                    );
                  };
                  const currentSelectedBound = proxyId ? getProxyBoundProfiles(proxyId) : [];

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={proxyId}
                          onChange={(e) => setProxyId(e.target.value)}
                          className="flex-1 bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-2 text-xs text-white outline-none"
                        >
                          <option value="">-- 選擇代理 --</option>
                          {proxies.map((px) => {
                            const bound = getProxyBoundProfiles(px.id);
                            return (
                              <option key={px.id} value={px.id}>
                                [{px.type.toUpperCase()}] {px.name} ({px.host}:{px.port})
                                {bound.length > 0 ? ` [⚠️ 已綁定 ${bound.length} 個環境]` : ''}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          disabled={!proxyId || testingProxy}
                          onClick={handleTestSelectedProxy}
                          className="px-3 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{testingProxy ? '測試中' : '測試連線'}</span>
                        </button>
                      </div>

                      {currentSelectedBound.length > 0 && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          <div>
                            <span className="font-bold">⚠️ 代理重複使用提醒：</span>
                            <span className="text-[11px] text-amber-200/90 block mt-0.5">
                              該代理目前已指派給「{currentSelectedBound.map((p) => p.name).join('、')}」使用。若同時啟動將導致出口 IP 相同，提高關聯封鎖風險！
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {proxyMode === 'custom' && (
                  <div className="space-y-3">
                    {/* 快速輸入 */}
                    <div>
                      <div className="flex items-center bg-[#12141e] border border-[#262f3c] focus-within:border-sky-500 rounded-lg px-3 py-2">
                        <input
                          type="text"
                          value={customProxyRaw}
                          onChange={(e) => handleQuickParseProxy(e.target.value)}
                          placeholder="快速輸入"
                          className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
                        />
                        <div className="flex items-center gap-2 ml-2 text-slate-400">
                          <button
                            type="button"
                            onClick={handleTestSelectedProxy}
                            title="檢測代理連線"
                            className="hover:text-white transition cursor-pointer"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowProxyFormatTip(!showProxyFormatTip)}
                            title="檢視格式說明"
                            className="hover:text-white transition cursor-pointer"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {showProxyFormatTip && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[#12141e] border border-[#262f3c] text-[11px] text-slate-300 font-mono space-y-0.5">
                          <div>• 192.168.0.1:8000:login:password</div>
                          <div>• login:password:192.168.0.1:8000</div>
                          <div>• login:password@192.168.0.1:8000</div>
                          <div>• socks5://login:password@192.168.0.1:8000</div>
                        </div>
                      )}
                    </div>

                    {/* Protocol Segmented Buttons */}
                    <div className="inline-flex bg-[#12141e] p-1 rounded-lg border border-[#262f3c]">
                      {(['http', 'socks4', 'socks5', 'ssh'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCustomProxyType(t)}
                          className={`px-3 py-1 rounded-md text-xs font-bold uppercase transition cursor-pointer ${
                            customProxyType === t
                              ? 'bg-[#262f3c] text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {/* 主機 & 端口 */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={customProxyHost}
                        onChange={(e) => setCustomProxyHost(e.target.value)}
                        placeholder="主機"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        value={customProxyPort}
                        onChange={(e) => setCustomProxyPort(e.target.value)}
                        placeholder="端口"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>

                    {/* 登入 & 密碼 */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={customProxyUser}
                        onChange={(e) => setCustomProxyUser(e.target.value)}
                        placeholder="登入"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                      <input
                        type="password"
                        value={customProxyPass}
                        onChange={(e) => setCustomProxyPass(e.target.value)}
                        placeholder="密碼"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>

                    {/* 代理名稱 & IP 更換連結 */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={customProxyName}
                        onChange={(e) => setCustomProxyName(e.target.value)}
                        placeholder="代理名稱 (選填)"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                      <input
                        type="text"
                        value={customProxyChangeUrl}
                        onChange={(e) => setCustomProxyChangeUrl(e.target.value)}
                        placeholder="IP 更換連結 (選填)"
                        className="bg-[#12141e] border border-[#262f3c] focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                  </div>
                )}

                {proxyTestMsg && (
                  <div
                    className={`p-2 rounded-lg text-xs ${
                      proxyTestMsg.ok
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {proxyTestMsg.text}
                  </div>
                )}
              </div>
            )}

            {/* Extensions Selection */}
            {extensions.length > 0 && (
              <div className="bg-[#12161c] p-4 rounded-xl border border-[#262f3c] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Puzzle className="w-4 h-4 text-sky-400" />
                    <span>擴充功能</span>
                  </label>
                  <span className="text-[11px] text-slate-400">已選 {selectedExtIds.length} 個</span>
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {extensions.map((ext) => {
                    const checked = selectedExtIds.includes(ext.id) || ext.enabledForAll;
                    return (
                      <div
                        key={ext.id}
                        onClick={() => !ext.enabledForAll && toggleExt(ext.id)}
                        className={`p-2 rounded-lg border flex items-center justify-between transition ${
                          checked
                            ? 'bg-sky-500/15 border-sky-500/40 text-white'
                            : 'bg-[#12141e] border-[#262f3c] text-slate-400'
                        } ${ext.enabledForAll ? 'opacity-90' : 'cursor-pointer'}`}
                      >
                        <div className="text-xs font-semibold truncate pr-2">🧩 {ext.name}</div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                            checked ? 'bg-sky-500 text-white' : 'border border-slate-600'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fingerprint Config */}
            <div className="bg-[#12161c] p-4 rounded-xl border border-[#262f3c] space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span>指紋參數</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Seed:</span>
                  <input
                    type="text"
                    value={fp.seed}
                    onChange={(e) => setFp({ ...fp, seed: e.target.value })}
                    className="w-28 bg-[#12141e] border border-sky-500/40 rounded px-2 py-1 text-xs font-mono text-sky-300 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRandomizeFingerprint()}
                    className="p-1 rounded bg-[#262f3c] hover:bg-sky-500 text-slate-200 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">WebRTC</label>
                  <select
                    value={fp.webrtc}
                    onChange={(e) => setFp({ ...fp, webrtc: e.target.value as any })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="altered">替換 (跟隨代理)</option>
                    <option value="disabled">停用</option>
                    <option value="real">真實</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Canvas</label>
                  <select
                    value={fp.canvas}
                    onChange={(e) => setFp({ ...fp, canvas: e.target.value as any })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="noise">雜訊</option>
                    <option value="real">真實</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">AudioContext</label>
                  <select
                    value={fp.audio}
                    onChange={(e) => setFp({ ...fp, audio: e.target.value as any })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="noise">雜訊</option>
                    <option value="real">真實</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">CPU 核心數</label>
                  <select
                    value={fp.cpuCores}
                    onChange={(e) => setFp({ ...fp, cpuCores: Number(e.target.value) })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    {[4, 6, 8, 10, 12, 16, 24].map((c) => (
                      <option key={c} value={c}>
                        {c} 核
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">記憶體 (RAM)</label>
                  <select
                    value={fp.memory}
                    onChange={(e) => setFp({ ...fp, memory: Number(e.target.value) })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    {[4, 8, 16, 32].map((m) => (
                      <option key={m} value={m}>
                        {m === 8 ? '8 GB (Chrome 標準上限)' : `${m} GB`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">解析度</label>
                  <select
                    value={fp.resolution}
                    onChange={(e) => setFp({ ...fp, resolution: e.target.value })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    {[
                      '1920x1080',
                      '2560x1440',
                      '1536x864',
                      '1680x1050',
                      '1440x900',
                      '1512x982',
                      '1728x1117',
                      '1366x768',
                    ].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">時區</label>
                  <select
                    value={fp.timezone}
                    onChange={(e) => setFp({ ...fp, timezone: e.target.value })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="Asia/Taipei">Asia/Taipei</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                    <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">語系</label>
                  <select
                    value={fp.locale}
                    onChange={(e) =>
                      setFp({
                        ...fp,
                        locale: e.target.value,
                        languages: [e.target.value, 'en-US', 'en'],
                      })
                    }
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="zh-TW">繁體中文 (zh-TW)</option>
                    <option value="en-US">英文 (en-US)</option>
                    <option value="ja-JP">日文 (ja-JP)</option>
                    <option value="ko-KR">韓文 (ko-KR)</option>
                    <option value="zh-CN">簡體中文 (zh-CN)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">瀏覽器品牌</label>
                  <select
                    value={fp.brand}
                    onChange={(e) => setFp({ ...fp, brand: e.target.value as any })}
                    className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="Chrome">Chrome</option>
                    <option value="Edge">Edge</option>
                    <option value="Opera">Opera</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">WebGL 顯示卡</label>
                <select
                  value={fp.webglRenderer}
                  onChange={(e) => {
                    const found = (GPU_PRESETS[os] || GPU_PRESETS.windows).find(
                      (g) => g.renderer === e.target.value
                    );
                    setFp({
                      ...fp,
                      webglVendor: found ? found.vendor : fp.webglVendor,
                      webglRenderer: e.target.value,
                      ...(found
                        ? {
                            cpuCores: found.cpu,
                            memory: found.ram,
                            resolution: found.res,
                          }
                        : {}),
                    });
                  }}
                  className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                >
                  {(GPU_PRESETS[os] || GPU_PRESETS.windows).map((g, idx) => (
                    <option key={idx} value={g.renderer}>
                      {g.vendor} — {g.renderer}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">User-Agent</label>
                <input
                  type="text"
                  value={fp.userAgent}
                  onChange={(e) => setFp({ ...fp, userAgent: e.target.value })}
                  className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 outline-none"
                />
              </div>
            </div>

            {/* Cookies Input */}
            {mode === 'single' && (
              <div className="bg-[#12161c] p-4 rounded-xl border border-[#262f3c] space-y-2">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Cookie className="w-4 h-4 text-amber-400" />
                  <span>Cookie 匯入</span>
                </label>
                <textarea
                  value={cookieText}
                  onChange={(e) => setCookieText(e.target.value)}
                  rows={3}
                  placeholder="貼上 JSON 或 Netscape 格式 Cookie..."
                  className="w-full bg-[#12141e] border border-[#262f3c] rounded-lg p-2.5 text-xs font-mono text-slate-300 resize-none outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>

          {/* Right Summary Sidebar */}
          <div className="w-76 bg-[#171a28] border-l border-[#262f3c] p-5 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between border-b border-[#262f3c] pb-3 mb-3">
              <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Monitor className="w-4 h-4" />
                指紋摘要
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">
                #{fp.seed}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {[
                ['Seed', fp.seed],
                ['作業系統', `${os.toUpperCase()} (${fp.platform})`],
                ['核心品牌', `${fp.brand} v${fp.chromeVersion}`],
                ['WebRTC', fp.webrtc === 'altered' ? '替換' : fp.webrtc === 'disabled' ? '停用' : '真實'],
                ['Canvas', fp.canvas === 'noise' ? '雜訊' : '真實'],
                ['AudioContext', fp.audio === 'noise' ? '雜訊' : '真實'],
                ['WebGL 廠商', fp.webglVendor],
                ['CPU / RAM', `${fp.cpuCores} 核 / ${fp.memory} GB`],
                ['解析度', fp.resolution],
                ['時區', fp.timezone],
                ['語系', fp.locale],
                ['電腦名稱', fp.deviceName],
                ['MAC', fp.macAddress],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-2 py-1.5 border-b border-[#181d24]"
                >
                  <span className="text-slate-400 shrink-0">{label}</span>
                  <span className="text-slate-200 font-medium text-right break-all">{val}</span>
                </div>
              ))}

              <div className="pt-1">
                <div className="text-slate-400 mb-1">WebGL 渲染器：</div>
                <div className="p-2 rounded bg-[#12141e] border border-[#262f3c] text-[11px] text-sky-200 break-all">
                  {fp.webglRenderer}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#171a28] border-t border-[#262f3c] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#262f3c] hover:bg-[#2c3149] text-xs font-semibold text-slate-300 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="px-5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
          >
            {saving
              ? '處理中...'
              : editingProfile
              ? '儲存'
              : mode === 'mass'
              ? `批量建立 (${massCount})`
              : '建立環境'}
          </button>
        </div>
      </div>
    </div>
  );
};
