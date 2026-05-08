import { TransferList } from './TransferList';
import type { RendererTransferProgress } from '../hooks/useSyncFile';
import type { Messages } from '../i18n';

interface LedgerPanelProps {
  messages: Messages;
  transfers: RendererTransferProgress[];
  activeTransferCount: number;
  issueTransferCount: number;
  busyTransferIds: Set<string>;
  selectedTransferId: string | null;
  onSelectedTransferIdChange: (transferId: string | null) => void;
  onPause: (transferId: string) => void | Promise<void>;
  onCancel: (transferId: string) => void | Promise<void>;
  onRetry: (transferId: string) => void | Promise<void>;
  onClearTransfers: (transferIds: string[]) => void | Promise<void>;
}

export function LedgerPanel({
  messages,
  transfers,
  activeTransferCount,
  issueTransferCount,
  busyTransferIds,
  selectedTransferId,
  onSelectedTransferIdChange,
  onPause,
  onCancel,
  onRetry,
  onClearTransfers
}: LedgerPanelProps): JSX.Element {
  return (
    <section className="card card-ledger workspace-panel">
      <div className="card-head workspace-panel-head">
        <div className="card-head-copy">
          <span className="workspace-panel-kicker">{messages.ledgerKicker}</span>
          <h2>{messages.transferActivity}</h2>
          <span className="card-head-caption">{activeTransferCount}/{issueTransferCount}</span>
        </div>
      </div>
      <TransferList
        transfers={transfers}
        messages={messages}
        onPause={onPause}
        onCancel={onCancel}
        onRetry={onRetry}
        onClearTransfers={onClearTransfers}
        busyTransferIds={busyTransferIds}
        selectedTransferId={selectedTransferId}
        onSelectedTransferIdChange={onSelectedTransferIdChange}
      />
    </section>
  );
}
