## Goal
The Claims hub currently has 14 tabs crammed into one horizontal bar with a "More" overflow. Group them into 3 logical clusters so users can scan faster and stop losing items in the overflow menu.

## Proposed grouping (3 clusters)

**1. Submission & Intake**
- Payers
- Docs Not Submitted
- All Claims
- Submission
- Query

**2. Recovery & Follow-Up**
- Outstanding
- Follow-Up
- Priority
- AR Management
- Denials
- Denial Workflow
- Appeals Tracker

**3. Reconciliation & Quality**
- Discrepancy
- Reconciliation
- Recon Alerts

## UI approach
In `src/components/HubTabBar.tsx`, when the active hub is `claims`, render three grouped clusters inline on the same sticky bar, separated by a thin vertical divider and a small uppercase group label (Submission / Recovery / Reconciliation). Each cluster keeps the existing pill styling, active state, keyboard nav, and badges (Docs Not Submitted, Outstanding, Follow-Up).

```text
[CLAIMS] SUBMISSION  Payers · Docs Not Submitted(25) · All · Submission · Query
         | RECOVERY  Outstanding(₹3.1Cr) · Follow-Up · Priority · AR · Denials · Workflow · Appeals
         | RECON     Discrepancy · Reconciliation · Recon Alerts
```

On narrow viewports the bar stays horizontally scrollable (current behavior); the "More" overflow popover is removed for claims since grouping makes all tabs visible. On desktop the three groups sit on one row; if space is tight they wrap to a second row (groups stay intact).

## Technical changes
- Extend the `Hub` type in `HubTabBar.tsx` to optionally carry `groups: { label: string; tabs: HubTab[] }[]` alongside/instead of `tabs`.
- Convert the `claims` hub entry to use `groups` with the three clusters above; leave `followups`, `analytics`, `admin` unchanged (still flat `tabs`).
- In the render path, if `hub.groups` is set, map over groups → render group label chip + tab pills + divider; skip the `MAX_VISIBLE_TABS`/overflow logic for grouped hubs. Keep keyboard nav working across all visible tabs by flattening `visible` from the groups.
- Preserve badge rendering (`badgeFor`) and admin-subrole filtering pattern (not needed for claims but keep code intact for admin hub).

## Out of scope
- No routing changes; tab paths stay the same.
- No sidebar/left-nav rewrite — this stays in the existing top hub tab bar.
- No changes to page contents.

## Confirm before build
Is the 3-way grouping above the split you want, or would you prefer a different distribution (e.g., splitting Denials/Appeals into their own group)?
