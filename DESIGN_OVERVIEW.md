# CoMapeo Cloud App -- Prototype Overview

## What This Is

The CoMapeo Cloud App is a **desktop-first web application prototype** for environmental and territorial monitoring teams who use CoMapeo in the field. It provides a cloud-based command center where coordinators can browse archive servers, manage projects, build maps, edit category systems, review field observations, manage alerts, generate reports, and organize reusable assets.

This is a **high-fidelity visual prototype** built with Google Stitch. It represents the intended product experience at the screen-layout level, not a coded implementation. Each screen is a static design artifact that demonstrates layout, content structure, interaction states, and visual language.

## Target Users

- **Field coordinators** who oversee multiple monitoring projects across remote archive servers
- **Territorial monitoring teams** who collect environmental and land-use data via CoMapeo mobile devices
- **GIS analysts** who build and maintain map layers for territorial oversight
- **Program managers** who review observation data, generate reports, and manage cross-project workflows

## Core Problem

CoMapeo mobile users collect observations in disconnected field environments. These observations sync to remote archive servers. The cloud app gives coordinators a centralized desktop workspace to:

1. Navigate between archive servers and the projects they contain
2. Build and style maps from GIS layers for territorial monitoring
3. Define and customize the category systems that structure field observations
4. Browse, filter, and export observation data across projects
5. Place and manage geolocated alerts for environmental threats
6. Store and organize reusable assets (maps, templates, exports)
7. Generate reports from templates and manage finalized outputs
8. Configure connections to external services and field devices

## Shared Application Shell

Every functional screen shares a **three-column shell layout** that provides persistent spatial context:

```
+------------------------------------------------------------------+
|                    TOP NAVIGATION BAR (56px)                      |
|  [Workspace Badge]  [Mode Indicator]              [Primary CTA]  |
+------+-----------+-----------------------------------------------+
| ICON | SECONDARY |                                                |
| RAIL |  COLUMN   |              MAIN CONTENT AREA                 |
| 76px |  268px    |               (fluid width)                    |
|      |           |                                                |
| nav  | context   |  primary workspace content varies per screen   |
| icons| list      |                                                |
|      | controls  |                                                |
+------+-----------+-----------------------------------------------+
```

### Icon Rail (76px, left)
- Vertical column of icon-only navigation buttons (54x54px each)
- One icon per major screen: Home, Map Builder, Categories, Data, Alerts, Vault, Reports, Settings, Connections
- Active state: Whisper-Soft Blue (#EAF2FF) background with Confident Bright Blue (#1F6FFF) icon and a 4px vertical pill indicator on the left edge
- Inactive state: Medium Gray-Blue (#5A6476) icons on transparent background

### Secondary Column (268px, left of main)
- Context-specific sidebar whose content changes per screen
- Contains lists, selectors, filters, or navigation relevant to the current workspace
- White background with Soft Silver-Blue (#D9DEE8) right border
- Independently scrollable

### Main Content Area (fluid, right)
- The primary workspace where the user's task takes place
- Pale Cool Gray (#F4F6FA) background
- Content varies dramatically per screen: full-canvas maps, data tables, editing forms, split layouts, card grids

### Top Navigation Bar (56px, full width)
- Institutional Navy (#04145C) background
- Left: workspace badge as a white pill with dark text showing the current project/server name
- Center-left: mode indicator as a translucent white pill showing the current screen context
- Right: primary action button in Confident Bright Blue (#1F6FFF)

## Screen Inventory

The prototype contains **9 functional screens** plus an **Application Flow** navigation diagram (10 total):

| Key | Screen | Purpose | Primary CTA | States |
|-----|--------|---------|-------------|--------|
| `home` | Home | Entry point for server/project selection and project overview | New Project | 1 |
| `map-builder` | Map Builder | Full-canvas map authoring with GIS sidebar | Export / Share | 2 (layers view, layer editing) |
| `categories-editor` | Categories Editor | Category set management and field editing | Import Set | 2 (categories view, templates view) |
| `data-browser` | Data Browser | Cross-project observation browsing and export | Export Data | 1 |
| `alerts` | Alerts | Geolocated alert placement and management | New Alert | 1 |
| `vault` | Vault | Reusable asset library organized by type | Upload Asset | 1 |
| `settings` | Settings | Application and project configuration | Save Changes | 1 |
| `reports` | Reports | Report template usage and finalized report management | Create from Template | 1 |
| `connections` | Connections | External service and device connection management | Add Connection | 1 |
| `app-flow` | Application Flow | Navigation diagram documenting the full prototype | -- | 1 |

## Design Language

The visual language is **purposeful, utility-driven, and structured**. It avoids decorative excess in favor of operational clarity:

- **Colors:** Institutional Navy anchors the top, Confident Bright Blue drives interaction, Pale Cool Gray provides the canvas, white cards create elevation
- **Typography:** Inter font family with a strict hierarchy from 24px extra-bold stat values down to 12px uppercase labels
- **Cards:** 18px rounded corners, whisper-soft shadows, hairline Soft Silver-Blue borders
- **Buttons:** 12px rounded corners for primary CTAs, pill-shaped tags for status
- **Density:** High information density organized through consistent spacing, clear hierarchy, and restrained chrome
- **Shadows:** Whisper-soft diffused shadows (`0 8px 24px rgba(9, 30, 66, 0.08)`) -- never heavy or dramatic

## Navigation Model

The icon rail provides persistent single-click navigation to all major screens. There is no nested routing or deep navigation hierarchy. The secondary column provides intra-screen context switching (e.g., selecting different category sets, switching between archive servers, choosing map sidebar tabs).

The top navbar updates its workspace badge and mode indicator to reflect the current context. Switching projects on the Home screen updates the badge across all screens.

## Prototype Limitations

- Screens are static design artifacts, not interactive code
- Data shown is representative placeholder content
- Cross-screen navigation is visual only (no actual routing)
- Some interaction states are shown as separate screen instances rather than dynamic UI changes
- The "Details" pill in Categories Editor is deferred pending product clarification
- The App Flow diagram has been regenerated in Stitch with the final 9-screen inventory and cross-screen data flows (screen `fb417c2e954f41c380bd0aaa27de03e9`)
- The Home screen frame has been corrected to 1280x1024 to match all other screens (Stitch edit `9c99e89a1dce48a9b150baaff309aacc`)
- Map Builder Library and Uploads pill states are deferred pending product clarification
- No loading, error, or success/confirmation states are described (prototype scope)
- The boundary between Settings and Connections should be clarified in future product discussions

## Source Files

- **Design system:** `DESIGN.md` (root) and `.stitch/DESIGN.md`
- **Product notes:** `NOTES.md`, `NOTES_1.md`
- **Execution plan:** `plans/2026-04-18-stitch-execution-plan-v3.md`
- **Stitch metadata:** `.stitch/metadata.json`
- **Screenshots:** `.stitch/designs/*.png`
- **Screen descriptions:** `.stitch/screens/*.md` (this folder)
- **Stitch project ID:** `13186086566394241435`

