# syncFile Optimization Roadmap

Last updated: 2026-04-12

## Goal

Move syncFile from a usable LAN transfer prototype to a reliable desktop tool with:

- safer device trust
- clearer transfer control
- stronger recovery after interruption/restart
- better maintenance and observability

## Current State

Already implemented:

- LAN device discovery
- send / receive with manual confirmation
- sandbox storage and location switching
- receive progress
- trusted-device auto-accept with size limits
- cancel / retry controls
- resumable transfer foundation using partial files and offsets
- persisted transfer history

Still incomplete or weak:

- trust is still based on device identity records rather than a proper pairing / signature model
- resumable transfers do not yet verify source-file consistency or partial-file integrity
- paused / queued task semantics are not separated from cancelled / retried semantics
- maintenance operations are still minimal
- transfer history is useful but not yet a full task center

## Priority Phases

### Phase 1: Reliability and Maintenance

Objectives:

- make interruption recovery predictable
- make local cleanup explicit
- reduce hidden state

Tasks:

- add transfer history cleanup
- add resumable cache cleanup
- show maintenance counters in settings
- preserve enough metadata for retries after restart
- improve failed / cancelled transfer status consistency

### Phase 2: Trust and Security

Objectives:

- make “trusted device” safer and easier to audit

Tasks:

- introduce device fingerprint display everywhere trust is granted
- persist trust decisions with more metadata
- add pairing / first-trust confirmation flow
- eventually move from device-id trust to verifiable identity trust

### Phase 3: Task Center

Objectives:

- turn transfer history into an actionable task surface

Tasks:

- filters by status / direction
- search by file name / peer
- bulk cleanup
- better status explanations
- expose saved path and source path consistently

### Phase 4: Transport Controls

Objectives:

- make long transfers controllable instead of all-or-nothing

Tasks:

- pause semantics distinct from cancel
- queue management
- bounded retry policy
- better resume negotiation
- throttled progress emission

### Phase 5: Integrity and Recovery

Objectives:

- make resumed transfers trustworthy

Tasks:

- source-file change detection on retry
- partial-file integrity checks
- resume metadata versioning / migration
- startup recovery of unfinished tasks

## Backlog

High priority:

- pairing / trust fingerprint flow
- resume integrity checks
- startup recovery of unfinished transfers
- maintenance actions in settings

Medium priority:

- desktop notifications
- task filters and search
- grouped receive prompts
- transfer rate / ETA display

Lower priority:

- bandwidth throttling
- batch receive approval
- richer analytics / diagnostics

## Work Started This Round

Phase 1 maintenance work:

- add maintenance section in settings
- add transfer history cleanup
- add resumable cache cleanup
- expose counts / sizes for these states
