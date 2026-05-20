import { motion, type Transition } from 'framer-motion';

import type { Messages } from '../i18n';
import type { WorkspaceSection } from '../types/workspace';

type WorkflowPhase = 'discover' | 'device' | 'files' | 'ready' | 'transferring';

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
  activeSendTransferCount: number;
  activeTransferCount: number;
  completedTransferCount: number;
  issueTransferCount: number;
  pendingRequestCount: number;
}

export function WorkspaceHeader({
  messages,
  activeSection,
  deviceCount,
  pendingFileCount,
  selectedRecipientCount,
  activeSendTransferCount,
  activeTransferCount,
  completedTransferCount,
  issueTransferCount,
  pendingRequestCount
}: WorkspaceHeaderProps): JSX.Element {
  const hasDevices = deviceCount > 0;
  const hasRecipients = selectedRecipientCount > 0;
  const hasFiles = pendingFileCount > 0;
  const hasActiveTransfers = activeSendTransferCount > 0;
  const phase: WorkflowPhase = hasActiveTransfers
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
  const phaseOrder: WorkflowPhase[] = ['discover', 'device', 'files', 'ready', 'transferring'];
  const currentPhaseIndex = phaseOrder.indexOf(phase);
  const flowSteps = [
    {
      phase: 'discover' as const,
      label: messages.workflowStepDiscover
    },
    {
      phase: 'device' as const,
      label: messages.workflowStepDevice
    },
    {
      phase: 'files' as const,
      label: messages.workflowStepFiles
    },
    {
      phase: 'ready' as const,
      label: messages.workflowStepReady
    },
    {
      phase: 'transferring' as const,
      label: messages.workflowStepTransfer
    }
  ];
  const signals = {
    manifest: [
      {
        label: messages.workspaceMetricDevices,
        value: deviceCount,
        tone: deviceCount > 0 ? 'active' : 'idle'
      },
      {
        label: messages.workspaceMetricRequests,
        value: pendingRequestCount,
        tone: pendingRequestCount > 0 ? 'attention' : 'idle'
      }
    ],
    dispatch: [
      {
        label: messages.workspaceMetricRecipients,
        value: selectedRecipientCount,
        tone: selectedRecipientCount > 0 ? 'active' : 'idle'
      },
      {
        label: messages.workspaceMetricFiles,
        value: pendingFileCount,
        tone: pendingFileCount > 0 ? 'active' : 'idle'
      },
      {
        label: messages.workspaceMetricActive,
        value: activeSendTransferCount,
        tone: activeSendTransferCount > 0 ? 'accent' : 'idle'
      }
    ],
    ledger: [
      {
        label: messages.workspaceMetricActive,
        value: activeTransferCount,
        tone: activeTransferCount > 0 ? 'accent' : 'idle'
      },
      {
        label: messages.workspaceMetricCompleted,
        value: completedTransferCount,
        tone: completedTransferCount > 0 ? 'active' : 'idle'
      },
      {
        label: messages.workspaceMetricIssues,
        value: issueTransferCount,
        tone: issueTransferCount > 0 ? 'attention' : 'idle'
      }
    ],
    inbox: [
      {
        label: messages.workspaceMetricRequests,
        value: pendingRequestCount,
        tone: pendingRequestCount > 0 ? 'attention' : 'idle'
      }
    ]
  }[activeSection];
  const showFlow = activeSection === 'dispatch' || activeSendTransferCount > 0;

  return (
    <motion.header layout transition={headerSpring} className={`workspace-hero is-${phase} is-section-${activeSection}`}>
      <div className="workspace-hero-copy">
        <span className="workspace-hero-kicker">{sectionHeader.kicker}</span>
        <h1>{sectionHeader.title}</h1>
        <p>{sectionHeader.note}</p>
      </div>
      <div className="workspace-hero-tools">
        {showFlow && (
          <ol className="workspace-flow" aria-label={messages.workflowKicker}>
            {flowSteps.map((step) => {
              const stepIndex = phaseOrder.indexOf(step.phase);
              const isCurrent = step.phase === phase;
              const isComplete = stepIndex < currentPhaseIndex;

              return (
                <li
                  className={`workspace-flow-step${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}`}
                  key={step.phase}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="workspace-flow-dot" aria-hidden="true" />
                  <span className="workspace-flow-label">{step.label}</span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="workspace-signals" aria-label={messages.workspaceSignalsLabel}>
          {signals.map((item) => (
            <span className={`workspace-signal is-${item.tone}`} key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      </div>
    </motion.header>
  );
}
