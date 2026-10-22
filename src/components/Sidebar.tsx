import React from 'react';
import {
  Globe,
  Shield,
  Puzzle,
  Bookmark,
  Tags,
  Settings,
  Play,
  Sparkles,
  DownloadCloud,
  Archive,
} from 'lucide-react';
import { KernelInfo } from '../types';
import { ChameleonLogo } from './ChameleonLogo';

export type NavTab = 'browsers' | 'proxies' | 'extensions' | 'bookmarks' | 'tags' | 'settings' | 'backup';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCreateModal?: (mode: 'single' | 'mass') => void;
  profileCount: number;
  runningCount: number;
  proxyCount: number;
  extensionCount: number;
  kernelInfo: KernelInfo | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  profileCount,
  runningCount,
  proxyCount,
  extensionCount,
  kernelInfo,
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    activeBadge?: number;
  }> = [
    {
      id: 'browsers',
      label: '瀏覽器環境',
      icon: <Globe className="w-4 h-4" />,
      badge: profileCount,
      activeBadge: runningCount,
    },
    {
      id: 'proxies',
      label: '代理管理',
      icon: <Shield className="w-4 h-4" />,
      badge: proxyCount,
    },
    {
      id: 'extensions',
      label: '擴充功能',
      icon: <Puzzle className="w-4 h-4" />,
      badge: extensionCount,
    },
    {
      id: 'bookmarks',
      label: '書籤設定',
      icon: <Bookmark className="w-4 h-4" />,
    },
    {
      id: 'tags',
      label: '狀態與標籤',
      icon: <Tags className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: '核心與設定',
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'backup',
      label: '備份與還原',
      icon: <Archive className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-56 bg-[#12161c] border-r border-[#262f3c] flex flex-col h-screen select-none shrink-0">
      {/* Brand Header */}
      <div className="px-4 pt-4 pb-4 border-b border-[#262f3c]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15 border border-sky-500/30 p-1 flex items-center justify-center shadow-md shadow-sky-500/10">
            <ChameleonLogo className="w-full h-full" variant="a" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight text-white flex items-center">
              Chameleon<span className="text-sky-400">X</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">防關聯指紋瀏覽器</span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition cursor-pointer group ${
                isActive
                  ? 'bg-sky-500/15 text-white border border-sky-500/40'
                  : 'text-slate-400 hover:bg-[#181d24] hover:text-slate-200 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-1.5 rounded-lg transition ${
                    isActive
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-[#181d24] text-slate-400 group-hover:text-slate-200 border border-[#262f3c]/60'
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-xs font-semibold">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.activeBadge && item.activeBadge > 0 ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Play className="w-2.5 h-2.5 fill-emerald-400" />
                    {item.activeBadge}
                  </span>
                ) : null}
                {item.badge !== undefined && item.badge > 0 ? (
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                      isActive ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30' : 'bg-[#181d24] text-slate-400 border border-[#262f3c]'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Kernel Download Status (Only displayed when actively downloading) */}
      {kernelInfo?.downloadState?.downloading ? (
        <div className="p-2.5 border-t border-[#262f3c] bg-[#0c0e12]">
          <button
            onClick={() => onSelectTab('settings')}
            className="w-full p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-left transition hover:bg-sky-500/25 cursor-pointer"
          >
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold mb-1">
              <DownloadCloud className="w-3.5 h-3.5 animate-bounce" />
              <span>下載核心中 ({kernelInfo.downloadState.progress}%)</span>
            </div>
            <div className="w-full h-1 bg-[#181d24] rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${kernelInfo.downloadState.progress}%` }}
              />
            </div>
          </button>
        </div>
      ) : null}
    </aside>
  );
};
