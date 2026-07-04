---
target: dashboard
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-07-04T12-16-45Z
slug: src-app-components-dashboardclient-tsx
---
# Critique — Dashboard (Monitoramento de Chaves)

Method: DEGRADED single-context (harness policy: no sub-agent spawn without explicit user request).
Target: src/app/components/DashboardClient.tsx (+ Sidebar.tsx nav)

## Design Health Score: 27/40 (Acceptable, near Good)
1 Visibility 3 | 2 Match 3 | 3 Control&Freedom 2 (no cancel of pending) | 4 Consistency 2 (2 modals + 2 pickers + imperative DOM) | 5 Error Prevention 3 | 6 Recognition 3 | 7 Flexibility 3 | 8 Minimalist 3 | 9 Error Recovery 3 | 10 Help 2 (dual-confirm not taught)

## Anti-Patterns: NOT slop. Dead .text-gradient-green rule (unused) to delete. Detector: 6 design-system-color advisories (#f43f5e, #ef4444, #f87171, #5b7ab8) — established status colors, not in DESIGN.md tokens.

## Priority Issues
- [P1] No cancel/undo for a pending request from the dashboard (list btn opacity:0/pointer-events:none @1010). Fix: add Cancelar affordance.
- [P1] Quick-action bar is imperative getElementById/style.display/innerText inside React (526-790); desyncs with 30s router.refresh poll; aria-expanded vs imperative reveal (SR not notified). Fix: useState/useReducer.
- [P2] Two confirm modals (inline modalIn @1034 vs .modal-box/ConfirmModal.tsx) + two user pickers (UserSelector vs unified-emp-input). Fix: unify.
- [P2] Dual-confirmation mental model taught only in 0.8rem modal text. Fix: persistent inline explainer / onboard.
- [P2] Empty state dead-end; same message for zero-keys vs zero-filter-matches (@817). Fix: split cases.

## Persona Red Flags
- Alex: no global shortcut to Ação Rápida; 30s poll re-sorts list mid-click.
- Sam: pending "Aguardando" has no aria-live; imperatively revealed step not announced. Status is color+text (ok).
- Rafael (porteiro under pressure): wrong quick request can't be cancelled from here.

## Minor
- Poll reorders rows / drops focus mid-task. employee_name[0] can throw on empty name. Overdue <ul> uncapped. Mobile list view lacks field labels.
