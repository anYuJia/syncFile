import type { Device, PeerReachabilityStatus } from '@shared/types';

export type WorkspaceSection = 'manifest' | 'dispatch' | 'ledger' | 'inbox';

export interface SelectedRecipientSnapshot extends Device {
  isOnline: boolean;
  reachability: PeerReachabilityStatus;
  reachabilityError?: string;
}
