# Pre-implementation audit

Reference: all 18 SVG documents, PNG previews, brand colors and README in figma/DadhiCutting_Professional_Figma_Kit. User approved the supplied SVG logo on 25 October 2026.

| Area | Current State | Figma Requirement | Required Changes | Priority |
|---|---|---|---|---|
| Angular | Angular 22 standalone, Signals, lazy routes | Preserve architecture | Template and styling changes | High |
| Theme | Conflicting tokens; some tokens only in header scope | Emerald #07594D, ivory #FAF8F3, sage #E7F2EC | Global semantic tokens | High |
| Navigation | Phone frame, broken logo path, missing active states | Compact headers, bottom navigation | Responsive shell, intact approved SVG | High |
| Screens | 18 routes exist; inconsistent spacing and decorative fake status bars | Individual screen layouts | Adapt real controls to reference layouts | High |
| Forms | Some handlers have no visible controls | Preserve CRUD, OTP and financial workflows | Restore dialogs and form bindings | High |
| Data | Supabase store, authentication guards and roles | Real data unchanged | Preserve contracts, schemas and calculations | Critical |
| Assets | Detailed legacy PNG and simplified kit SVG | Approved identity | Use kit SVG unchanged; no separate compact asset provided | High |
| Testing | Angular/Vitest, Playwright and database scripts | Build, regression and responsive verification | Run tests; distinguish fixtures from live backend | High |

Missing reference details: no desktop layouts, error/loading/empty screens, separate compact logo, photos, employee ratings/shift data, or interaction specifications. Preserve existing supported controls when the references omit them. Do not render simulated OS status bars or illustrative business values as real data. Use the intact full logo on a light surface for legibility.
