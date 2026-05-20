import { motion, type Transition } from 'framer-motion';
import {
  Activity,
  FolderOpen,
  Inbox,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  SendHorizontal,
  Settings,
  Sun
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

import { Avatar } from './Avatar';
import { Button } from './ui/button';
import type { Locale, Messages } from '../i18n';
import type { WorkspaceSection } from '../types/workspace';
import type { Device } from '@shared/types';

const desktopSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.8
};

interface AppSidebarProps {
  messages: Messages;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  selfDevice: Device | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  activeSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  statusHeadline: string;
  statusDetail: string;
  liveProgressPercent: number;
  reachableDeviceCount: number;
  deviceCount: number;
  pendingFileCount: number;
  selectedRecipientCount: number;
  activeSendTransferCount: number;
  completedTransferCount: number;
  issueTransferCount: number;
  activeTransferCount: number;
  pendingRequestCount: number;
  unreadRequestCount: number;
  themeMode: 'light' | 'dark' | 'system';
  isDarkMode: boolean;
  onOpenRequestsInbox: () => void;
  onOpenSettings: () => void;
  onOpenLogs: () => void;
  onOpenSandbox: () => void;
  onToggleTheme: () => void;
}

interface NavItem {
  section: WorkspaceSection;
  label: string;
  meta: string;
  count: number;
  icon: JSX.Element;
  hasUnread?: boolean;
}

function SidebarTooltip({ label, children }: { label: string; children: ReactElement }): JSX.Element {
  return (
    <Tooltip.Root delayDuration={420}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="ui-tooltip" side="right" align="center" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="ui-tooltip-arrow" width={8} height={4} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function AppSidebar({
  messages,
  locale,
  setLocale,
  selfDevice,
  isCollapsed,
  onToggleCollapsed,
  activeSection,
  onSectionChange,
  statusHeadline,
  statusDetail,
  liveProgressPercent,
  reachableDeviceCount,
  deviceCount,
  pendingFileCount,
  selectedRecipientCount,
  activeSendTransferCount,
  completedTransferCount,
  issueTransferCount,
  activeTransferCount,
  pendingRequestCount,
  unreadRequestCount,
  themeMode,
  isDarkMode,
  onOpenRequestsInbox,
  onOpenSettings,
  onOpenLogs,
  onOpenSandbox,
  onToggleTheme
}: AppSidebarProps): JSX.Element {
  const navItems: NavItem[] = [
    {
      section: 'manifest',
      label: messages.onlineDevices,
      meta: `${reachableDeviceCount}/${deviceCount || 0}`,
      count: deviceCount,
      icon: <Monitor aria-hidden="true" />
    },
    {
      section: 'dispatch',
      label: messages.sendFile,
      meta: `${pendingFileCount}/${selectedRecipientCount}`,
      count: activeSendTransferCount,
      icon: <SendHorizontal aria-hidden="true" />
    },
    {
      section: 'ledger',
      label: messages.transferActivity,
      meta: `${completedTransferCount}/${issueTransferCount}`,
      count: activeTransferCount,
      icon: <Activity aria-hidden="true" />
    },
    {
      section: 'inbox',
      label: messages.requestsInbox,
      meta: pendingRequestCount > 0 ? messages.waitingRequests(pendingRequestCount) : messages.requestsEmptyTitle,
      count: pendingRequestCount,
      icon: <Inbox aria-hidden="true" />,
      hasUnread: unreadRequestCount > 0
    }
  ];
  const toolItems = [
    { label: messages.settings, onClick: onOpenSettings, icon: <Settings aria-hidden="true" /> },
    { label: messages.logs, onClick: onOpenLogs, icon: <ScrollText aria-hidden="true" /> },
    { label: messages.openSandbox, onClick: onOpenSandbox, icon: <FolderOpen aria-hidden="true" /> },
    {
      label:
        themeMode === 'light'
          ? messages.appearanceDark
          : themeMode === 'dark'
            ? messages.appearanceSystem
            : messages.appearanceLight,
      onClick: onToggleTheme,
      icon:
        themeMode === 'light' ? (
          <Moon aria-hidden="true" />
        ) : themeMode === 'dark' ? (
          <Monitor aria-hidden="true" />
        ) : isDarkMode ? (
          <Sun aria-hidden="true" />
        ) : (
          <Moon aria-hidden="true" />
        )
    }
  ];

  return (
    <Tooltip.Provider>
    <motion.aside
      layout
      transition={desktopSpring}
      className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}`}
      aria-label={messages.mainMenuAriaLabel}
    >
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">
          <SendHorizontal aria-hidden="true" />
        </span>
        <span className="sidebar-brand-copy">
          <strong>syncFile</strong>
          <span>{messages.heroEyebrow}</span>
        </span>
        <SidebarTooltip label={isCollapsed ? messages.expandMenu : messages.collapseMenu}>
          <Button
            type="button"
            variant="sidebar"
            size="compactIcon"
            className="sidebar-collapse-button"
            onClick={onToggleCollapsed}
            title={isCollapsed ? messages.expandMenu : messages.collapseMenu}
            aria-label={isCollapsed ? messages.expandMenu : messages.collapseMenu}
            aria-pressed={isCollapsed}
          >
            {isCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </Button>
        </SidebarTooltip>
      </div>

      <div className="sidebar-command-card">
        <span className="sidebar-command-kicker">{messages.sidebarCommandCenter}</span>
        <div className="sidebar-command-body">
          {selfDevice ? (
            <Avatar name={selfDevice.name} avatarDataUrl={selfDevice.avatarDataUrl} size="sm" />
          ) : (
            <span className="sidebar-command-placeholder" aria-hidden="true" />
          )}
          <span className="sidebar-command-copy">
            <strong>{selfDevice?.name ?? messages.loadingLocalDevice}</strong>
            <span>{statusHeadline}</span>
          </span>
        </div>
        <div className="sidebar-progress-console" aria-hidden="true">
          <span className="sidebar-progress-track">
            <motion.span
              className="sidebar-progress-fill"
              animate={{ width: `${liveProgressPercent}%` }}
              transition={desktopSpring}
            />
          </span>
          <span className="sidebar-progress-readout">{statusDetail}</span>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {statusDetail}
        </span>
      </div>

      <nav className="sidebar-nav" aria-label={messages.workspaceSectionsAriaLabel}>
        <span className="sidebar-section-label">{messages.sidebarWorkspaceLabel}</span>
        {navItems.map((item) => (
          <SidebarTooltip key={item.section} label={item.label}>
            <motion.button
              type="button"
              className={`sidebar-nav-item${activeSection === item.section ? ' is-active' : ''}${item.hasUnread ? ' has-unread' : ''}`}
              onClick={() => {
                if (item.section === 'inbox') {
                  onOpenRequestsInbox();
                  return;
                }
                onSectionChange(item.section);
              }}
              title={item.label}
              aria-current={activeSection === item.section ? 'page' : undefined}
              whileTap={{ scale: 0.96 }}
              transition={desktopSpring}
            >
              {activeSection === item.section && (
                <motion.span
                  layoutId="sidebar-active-section"
                  className="sidebar-nav-active-pill"
                  transition={desktopSpring}
                />
              )}
              <span className="sidebar-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="sidebar-nav-copy">
                <strong>{item.label}</strong>
                <small>{item.meta}</small>
              </span>
              {item.hasUnread ? (
                <span className="sidebar-nav-unread-dot" aria-label={messages.requestsUnreadIndicator(unreadRequestCount)} />
              ) : (
                <span className="sidebar-nav-count">{item.count}</span>
              )}
            </motion.button>
          </SidebarTooltip>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-section-label">{messages.sidebarUtilitiesLabel}</span>
        <div className="sidebar-tool-grid">
          {toolItems.map((item) => (
            <SidebarTooltip key={item.label} label={item.label}>
              <Button
                type="button"
                variant="sidebar"
                size="sm"
                className="sidebar-tool-button"
                onClick={item.onClick}
                title={item.label}
                aria-label={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </Button>
            </SidebarTooltip>
          ))}
        </div>
        <div
          className="locale-switch sidebar-locale-switch"
          aria-label={messages.languageLabel}
          aria-hidden={isCollapsed}
        >
          <button
            type="button"
            className={`locale-switch-button${locale === 'zh' ? ' is-active' : ''}`}
            onClick={() => setLocale('zh')}
            aria-pressed={locale === 'zh'}
            tabIndex={isCollapsed ? -1 : 0}
          >
            中文
          </button>
          <button
            type="button"
            className={`locale-switch-button${locale === 'en' ? ' is-active' : ''}`}
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            tabIndex={isCollapsed ? -1 : 0}
          >
            EN
          </button>
        </div>
      </div>
    </motion.aside>
    </Tooltip.Provider>
  );
}
