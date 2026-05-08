import { motion, type Transition } from 'framer-motion';

import type { Messages } from '../i18n';
import type { WorkspaceSection } from '../types/workspace';

const headerSpring: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 34,
  mass: 0.8
};

interface WorkspaceHeaderProps {
  messages: Messages;
  activeSection: WorkspaceSection;
  deviceCount: number;
  pendingFileCount: number;
  selectedRecipientCount: number;
  activeTransferCount: number;
  pendingRequestCount: number;
}

export function WorkspaceHeader({
  messages,
  activeSection,
  deviceCount,
  pendingFileCount,
  selectedRecipientCount,
  activeTransferCount,
  pendingRequestCount
}: WorkspaceHeaderProps): JSX.Element {
  const hasDevices = deviceCount > 0;
  const hasRecipients = selectedRecipientCount > 0;
  const hasFiles = pendingFileCount > 0;
  const hasActiveTransfers = activeTransferCount > 0;
  const phase = hasActiveTransfers
    ? 'transferring'
    : hasFiles && hasRecipients
      ? 'ready'
      : hasRecipients
        ? 'files'
        : hasDevices
          ? 'device'
          : 'discover';
  const title = {
    discover: messages.workflowNoDeviceTitle,
    device: messages.workflowSelectDeviceTitle,
    files: messages.workflowAddFilesTitle,
    ready: messages.workflowReadyTitle,
    transferring: messages.workflowTransferringTitle
  }[phase];
  const note = {
    discover: messages.workflowNoDeviceNote,
    device: messages.workflowSelectDeviceNote,
    files: messages.workflowAddFilesNote,
    ready: messages.workflowReadyNote,
    transferring: messages.workflowTransferringNote
  }[phase];
  const sectionHeader = {
    manifest: {
      kicker: messages.manifestKicker,
      title: hasDevices ? messages.onlineDevices : title,
      note: hasDevices ? messages.manifestNote : note
    },
    dispatch: {
      kicker: messages.dispatchKicker,
      title,
      note
    },
    ledger: {
      kicker: messages.ledgerKicker,
      title: messages.transferActivity,
      note: messages.ledgerNote
    },
    inbox: {
      kicker: messages.sidebarIntakeLabel,
      title: messages.requestsInbox,
      note: pendingRequestCount > 0 ? messages.waitingRequests(pendingRequestCount) : messages.requestsEmptyBody
    }
  }[activeSection];

  return (
    <motion.header layout transition={headerSpring} className={`workspace-hero is-${phase} is-section-${activeSection}`}>
      <div className="workspace-hero-copy">
        <span className="workspace-hero-kicker">{sectionHeader.kicker}</span>
        <h1>{sectionHeader.title}</h1>
        <p>{sectionHeader.note}</p>
      </div>
    </motion.header>
  );
}
