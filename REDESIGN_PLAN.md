AGRO Redesign - Agent Orchestration Plan
Overview
We're redesigning the AGRO GUI from a tab-based layout to a modern sidebar navigation system. The current code is functional but organizationally chaotic. We'll use parallel agents with clear boundaries.

MASTER ORCHESTRATION (You - Sonnet 4.5)
Your Role: Architecture lead and integration manager
Your Instructions:
Phase 1: Discovery & Architecture (First)

Run make dev to spin up the full stack
Open http://127.0.0.1:8012 and document EVERY visible tab/feature
Read through gui/index.html and gui/app.js to understand current wiring
Create REDESIGN_SPEC.md with:

Complete navigation structure (sidebar hierarchy)
File ownership matrix (which agent owns which files)
Integration contracts (APIs between modules)
Visual design spec (typography, colors, spacing)



Phase 2: Build the Shell (You do this)
Create the new navigation framework:
Files you'll create:

gui/index-new.html - New app shell with sidebar
gui/js/navigation.js - Router and nav management
gui/css/navigation.css - Sidebar and layout styles
gui/views/ - Directory for view templates

Key Requirements:

Left sidebar navigation (collapsible sections)
Main content area (single active view)
Top bar (breadcrumbs, status indicators like that green "healthy" badge)
Grafana and VSCode embedded in dedicated areas (top-right or separate panel)
Theme-aware (dark/light mode via existing window.Theme)
Typewriter/monospace font for headers (like the status screen shows)

Export from navigation.js:
javascriptwindow.Navigation = {
  navigateTo(viewId),
  registerView(viewId, mountFn, unmountFn),
  getCurrentView(),
  updateBreadcrumb(items),
  showPanel(panelId), // for Grafana/VSCode
  hidePanel(panelId)
};
```

### Phase 3: Write Agent Specs
Once you have the shell working, create these instruction files:

**For each agent, create a `.claude/agent-N-rules.md` file with:**
1. Their specific mission
2. Files they own (MUST NOT touch others)
3. Integration points (what they consume/export)
4. Testing requirements
5. Playwright test commands

---

## AGENT 1: Module Migrator (Haiku 4.5)

**Mission:** Port existing tab content to new navigation system

**Your Prompt:**
```
You are migrating AGRO's existing features from a tab-based UI to a new sidebar navigation system. 

Read REDESIGN_SPEC.md for the navigation structure and integration contracts.

Your responsibilities:
1. For each existing tab in gui/index.html, create a corresponding view in gui/views/
2. Update the associated JS module to use window.Navigation.registerView()
3. Remove old tab-switching logic that uses window.Tabs
4. Maintain all existing functionality - just change how it's accessed
5. Run playwright tests after each migration

Files you own:
- gui/views/*.html (create these)
- Modify existing gui/js/*.js to register with new Navigation

Files you MUST NOT touch:
- gui/index-new.html (Shell Builder owns this)
- gui/js/navigation.js (Shell Builder owns this)
- gui/css/* (Visual Polish owns this)

Testing:
After migrating each view, run:
npm run test:gui -- --grep "view-name"

Use playwright constantly. Every change needs a smoke test.
```

**Key Rules:**
- One view at a time, test before moving on
- Don't redesign, just port existing functionality
- Ask Sonnet 4 (master) if you're unclear on routing

---

## AGENT 2: Grafana Fixer (Haiku 4.5)

**Mission:** Fix Grafana dashboard persistence and user edit permissions

**Your Prompt:**
```
You are fixing the AGRO Grafana integration. 

Current state:
- Dashboard loads correctly at http://127.0.0.1:3000
- Shows as "shared with me" (good - no login required)
- User CANNOT edit dashboard
- Settings do NOT persist
- Located in infra/grafana/provisioning/

Goal:
- Keep the "no login required" behavior
- Allow user to edit dashboard
- Persist settings across restarts
- Integrate as embedded panel in new GUI

Files you own:
- infra/grafana/provisioning/**/*
- docker-compose.yml (Grafana service config only)
- gui/js/grafana.js (create this for integration)

Research Grafana provisioning docs for:
- Anonymous user permissions
- Dashboard edit permissions
- Persistent storage configuration

Testing:
1. Restart containers: make down && make dev
2. Open Grafana, edit dashboard, save
3. Restart again, verify changes persist
4. Check that embedded iframe in GUI works

Do NOT touch other Docker services.
```

---

## AGENT 3: Visual Polish (Haiku 4.5)

**Mission:** Implement the visual design system

**Your Prompt:**
```
You are implementing AGRO's visual design system.

Wait for Sonnet 4 to approve the design spec in REDESIGN_SPEC.md before starting.

Design requirements:
- Typewriter/monospace font for headers and key UI elements
- Clean, technical aesthetic (not corporate, not playful)
- Dark mode and light mode equally awesome
- Clear visual hierarchy (no "button soup")
- Textured, slightly imperfect feel (not sterile)
- Reference the terminal-style status indicators in screenshots

Files you own:
- gui/css/*.css (all styles except navigation.css structure)
- gui/assets/ (icons, graphics)
- Color variables and theming

Files you MUST NOT touch:
- gui/js/*.js (no JavaScript)
- gui/index-new.html structure (just style it)

Create:
- gui/css/design-system.css (typography, colors, spacing)
- gui/css/components.css (buttons, inputs, cards)
- gui/css/dark-theme.css
- gui/css/light-theme.css

Testing:
Test both themes after every change:
window.Theme.applyTheme('dark')
window.Theme.applyTheme('light')

Use playwright to screenshot and verify visual consistency.
```

---

## COORDINATION PROTOCOL

### Communication Flow
```
You (Sonnet 4) ← → Agent 1 (Module Migrator)
      ↓
   Agent 2 (Grafana Fixer)
      ↓  
   Agent 3 (Visual Polish)
```

### Integration Points

**Sonnet 4 creates and all agents read:**
- `REDESIGN_SPEC.md` - Master architecture document
- `INTEGRATION_CONTRACTS.md` - API definitions between modules

**Testing Strategy:**
- Each agent runs playwright tests after changes
- Sonnet 4 runs full integration tests
- `make dev` brings up entire stack for testing

### File Ownership Matrix
```
Sonnet 4 (Shell):
├── gui/index-new.html
├── gui/js/navigation.js
└── gui/css/navigation.css

Agent 1 (Migration):
├── gui/views/*.html
└── Modifications to gui/js/*.js (existing modules)

Agent 2 (Grafana):
├── infra/grafana/**/*
├── docker-compose.yml (Grafana only)
└── gui/js/grafana.js

Agent 3 (Visual):
├── gui/css/*.css (except navigation.css)
└── gui/assets/

EXECUTION PLAN
For You (Sonnet 4):
Right Now:

Clone the repo to a safe branch: git checkout -b redesign-shell
Run make dev and explore the current UI
Document every tab, every feature, every interaction
Create REDESIGN_SPEC.md with navigation hierarchy
Build the navigation shell (index-new.html, navigation.js, navigation.css)
Test the empty shell works
Create the agent instruction files above
Report back status

Command to spin up everything:
bashcd /Users/davidmontgomery/faxbot_folder/vivi-site/agro_full_repo_for_web_dev
git checkout -b redesign-shell
make dev
# Now you can access:
# - GUI: http://127.0.0.1:8012
# - Grafana: http://127.0.0.1:3000
# - Prometheus: http://127.0.0.1:9090
# - VSCode: http://127.0.0.1:4440