# Ontologies Dashboard — Design Document

**Date**: 2026-03-10
**Status**: Design proposal — awaiting review
**Provenance**: Assessment based on codebase analysis, design system extraction from foldspace-console, and research into mission control / data visualization patterns.

---

## 1. Design Philosophy

The dashboard is mission control for an AI analyst roundtable. Not a monitoring page with charts. Not a Grafana clone. Not an admin panel.

Think: the room in JPL where they watch Perseverance land. Except the spacecraft are four AI analysts arguing about whether GPT-5 matters, and the telemetry is their energy levels, mood, relevance calculations, and the tension arc of their conversation.

The goal is to make the invisible visible — FSM state transitions, agent energy economics, conversational tension, the ripple effects of a new task hitting the system — all rendered with the precision of a Swiss chronograph and the density of a Bloomberg terminal.

### Governing Principles

1. **Show the machine thinking.** Every FSM state change, every relevance evaluation, every cooldown tick should be perceptible. Not as noise — as rhythm. The dashboard should breathe with the system's tick loop.

2. **Information density over whitespace.** Brian stares at terminals. He reads CLI output for fun. This is not a marketing page. Every pixel earns its keep. But density is not clutter — it's organized power.

3. **Ixian aesthetic, not Harkonnen.** The foldspace-console design system (Subterranean Precision) is the foundation. Deep blue-black backgrounds, amber brand accents used like a single indicator light, teal as the signal color. SVG noise overlay. Barely-there borders. The complexity is concealed until you look closer.

4. **Realtime is ambient.** The dashboard should feel alive even when nothing is happening. Agents idle, boredom meters slowly climb, energy recharges, scene tension decays. The tick is the heartbeat. You should be able to glance at the screen and know the system state in under 2 seconds.

5. **The conversation is the centerpiece.** The roundtable is a conversation between analysts. The message feed is not a log — it is the primary artifact. Everything else frames it.

---

## 2. Layout Architecture

### 2.1 The Grid

Three-column layout with a dominant center. Not equal thirds — weighted to emphasize the conversation and agent states.

```
+------------------+-------------------------------+-------------------+
|                  |                               |                   |
|   AGENTS         |       CONVERSATION            |   INTELLIGENCE    |
|   (280px fixed)  |       (fluid center)          |   (320px fixed)   |
|                  |                               |                   |
|   4 agent cards  |   message stream              |   task queue      |
|   FSM gauges     |   scene narration             |   engram browser  |
|   energy/boredom |   typing indicators           |   topic chains    |
|   mood arcs      |   task injection markers      |   system vitals   |
|                  |                               |                   |
+------------------+-------------------------------+-------------------+
|                        STATUS BAR                                    |
|  tick# | tick rate | queue depth | connected ws | uptime | scene     |
+----------------------------------------------------------------------+
```

**Breakpoints:**
- 1440px+: Full three-column layout
- 1024-1439px: Collapse Intelligence panel into tabs below conversation
- 768-1023px: Single column, agents become a horizontal strip of compact badges

### 2.2 The Agent Panel (Left)

Four agent cards stacked vertically, one per analyst: Technologist, Strategist, Contrarian, Historian.

Each card contains:

**Header row**: Agent name (Instrument Sans 600) + role badge + FSM state indicator
- IDLE: dim teal dot, steady
- RESPONDING: bright teal, pulsing glow (the agent is thinking — this is the expensive operation)
- EMOTING: amber flash, quick fade
- COOLDOWN: muted, countdown timer visible

**Gauges** (the heart of each card):

```
Energy   [||||||||||||........]  72/100   +2/tick
Boredom  [||||||..............]  32/50    +1.5/tick
Mood     [----------|--------]   0.12     decaying
Cooldown [                    ]  0/3      --
```

These are not progress bars. They are instrument gauges — thin, horizontal, monochrome fill with the current value in IBM Plex Mono to the right. The fill color shifts:
- Energy: teal when above 50%, amber when 25-50%, red below 25%
- Boredom: neutral gray, shifts to amber as it approaches threshold, then to teal when threshold is crossed (about to initiate)
- Mood: centered zero line, positive side teal, negative side amber
- Cooldown: only visible when >0, counts down visually per tick

**Last spoke**: relative timestamp ("12s ago", "2 ticks ago") in text-dim

**Activity indicator**: the most recent emote or message snippet, truncated to one line, in text-muted italic

### 2.3 The Conversation Panel (Center)

The dominant panel. A scrolling message stream, bottom-anchored (newest at bottom, auto-scroll with "pause on manual scroll up" behavior).

Message types have distinct visual treatments:

**Agent messages** (type: "message"):
```
TECHNOLOGIST                                             12:04:32
The architecture here is fundamentally sound. What concerns
me is the latency characteristics at scale — we're looking
at O(n) fan-out per agent response, which means...
```
- Agent name in their assigned color (see Color Assignments below)
- Timestamp in text-dim, right-aligned
- Body text in text-bright, full width
- Left border accent (3px) in agent color

**Emotes** (type: "emote"):
```
  * Contrarian narrowing eyes at the latest claims *
```
- Italic, text-muted, indented, no timestamp
- Subtle fade-in animation (200ms)

**Scene narration** (type: "scene"):
```
  [SCENE] A contradictory report emerges from an independent
  source — reviewing for relevance.
```
- Full width, bg-elevated background
- text-dim color, small caps label "[SCENE]"
- Top and bottom border in border (barely visible divider)

**System messages** (type: "system"):
```
  [SYSTEM] Ontologies Roundtable initialized. 4 analysts present.
```
- IBM Plex Mono, text-dim, small

**Task injections** (type: "task"):
```
  ============================================================
  NEW TASK: Claude Agent SDK Architecture Review
  ============================================================
  [Source material truncated to first 200 chars...]
  Task ID: a3f2...  Status: ACTIVE
  ============================================================
```
- Full width, amber accent borders top and bottom
- Distinctive visual break — this is a conversation event, not a log line
- Background: amber-dim

**Active typing indicators**: When an agent enters RESPONDING state, show below the last message:
```
  Technologist is analyzing...    Strategist is analyzing...
```
- Animated ellipsis (CSS keyframe, 3 dots cycling)
- Agent color dot beside name
- Multiple agents can show simultaneously

### 2.4 The Intelligence Panel (Right)

Three sections, collapsible:

**Task Queue**
- Active task highlighted with teal border
- Queued tasks listed with submitted time
- Completed tasks with duration and engram link
- Failed tasks with error preview
- "Submit Topic" button at top (opens modal — see Interaction Design)

**Engram Browser**
- List of stored engrams, newest first
- Each entry: title, tags, timestamp, agent count
- Click to expand: full synthesis, per-agent responses
- Topic chain navigation: shows supersession links
- Filter by tag

**System Vitals** (compact)
- Tick number (incrementing counter, IBM Plex Mono)
- Current tick rate (with arrow indicator: slowing/accelerating)
- Scene tension (0-10 gauge, same style as agent gauges)
- Scene tone (text label: "analytical", "skeptical", "urgent", "reflective")
- WebSocket clients connected
- Uptime

### 2.5 The Status Bar (Bottom)

A single 32px-tall strip across the full viewport width. All system-level telemetry in a horizontal flow:

```
TICK #247  |  RATE 5.0s  |  QUEUE 2  |  ACTIVE task:a3f2...  |  TENSION 3.4  |  TONE analytical  |  WS 1  |  UP 02:14:30
```

IBM Plex Mono 12px, text-muted. The tick number should increment visually with each WebSocket tick event — this is the heartbeat. Use a subtle background flash (bg-elevated -> bg-surface -> bg, 150ms) on tick to show the system is alive.

---

## 3. Color System

### 3.1 Foundation (from foldspace-console, Void theme)

```css
--bg:           #060810;
--bg-surface:   #0a0c14;
--bg-elevated:  #0f1219;
--bg-hover:     #13161f;
--bg-inset:     #04050a;
--border:       rgba(255,255,255,0.06);
--border-bright: rgba(255,255,255,0.10);

--text:         #94a0b4;
--text-bright:  #cdd3de;
--text-muted:   #647080;
--text-dim:     #3a4558;

--amber:        #b88a3e;
--amber-dim:    rgba(184,138,62,0.08);
--amber-bright: #d4a650;

--teal:         #3a9e8f;
--teal-dim:     rgba(58,158,143,0.07);
--teal-bright:  #52b8a8;

--green:        #3a9e6a;
--red:          #9e3a3a;
--yellow:       #9e8a3a;
```

### 3.2 Agent Color Assignments

Each agent gets a distinct but muted color for their messages and indicators. These should be desaturated enough to coexist without creating a carnival, but distinct enough to scan quickly.

```css
--agent-technologist: #5b8ab5;   /* cool blue — technical, systematic */
--agent-strategist:   #7ba35b;   /* sage green — strategic, growth */
--agent-contrarian:   #b5785b;   /* warm copper — friction, challenge */
--agent-historian:    #8b7bb5;   /* muted violet — history, depth */
```

Used for: left border accent on messages, name color, dot indicators, gauge fills when agent-specific context is relevant.

### 3.3 FSM State Colors

```css
--state-idle:       var(--text-dim);        /* dim, ambient */
--state-responding: var(--teal-bright);     /* active, pulsing */
--state-emoting:    var(--amber);           /* brief flash */
--state-cooldown:   var(--text-muted);      /* fading, countdown */
```

### 3.4 Signal Colors (task status, alerts)

```css
--task-queued:    var(--text-muted);
--task-active:    var(--teal);
--task-complete:  var(--green);
--task-failed:    var(--red);
```

---

## 4. Realtime Visualizations

### 4.1 The FSM State Machine Diagram

At the top of each agent card (or expandable on click), a miniature state machine visualization:

```
    +---------+
    |  IDLE   |----[message/task/boredom]----> RESPONDING
    +---------+                                    |
        ^                                          |
        |                                    [response done]
        |                                          |
        |                                          v
        +------[cooldown=0]------  COOLDOWN  <-----+
                                      |
                                      |
    +---------+                       |
    | EMOTING |<--[low energy]--------+
    +---------+         (from IDLE)
        |
        +------[emote done]-----> IDLE
```

This is not a full-sized diagram. It is a compact (~120px tall) SVG with circles for states and arcs for transitions. The **current state is highlighted** (filled circle in the agent's color). When a transition fires, the arc animates — a brief pulse traveling along the path from old state to new state, like current flowing through a circuit.

Implementation: Inline SVG, CSS animations triggered by class changes on WebSocket state events. No charting library needed — the topology is fixed, only the active state changes.

### 4.2 Energy/Boredom Sparklines

Below each agent's gauges, a trailing 60-tick sparkline (300px wide, 24px tall) showing energy and boredom over time. Two lines, overlaid:
- Energy in agent color (fading opacity for older values)
- Boredom in amber (dashed)

This shows the economy of each agent — you can see the energy drain when they respond and the slow recharge, the boredom building during idle periods and resetting after they speak.

Implementation: Canvas 2D. On each tick event, push new values, shift the array, redraw. Canvas is the right call here — 4 agents x 2 lines x 60 points is trivial, and Canvas avoids the DOM overhead of SVG for rapidly updating small charts.

### 4.3 Scene Tension Arc

In the Intelligence panel's System Vitals section, a wider sparkline (full panel width, 48px tall) showing tension over time (last 120 ticks). The fill area below the line uses a gradient:

- 0-3: teal-dim (calm)
- 4-6: amber-dim (building)
- 7-10: red at 15% opacity (high tension)

Tone changes are marked as tiny vertical lines on the timeline, color-coded by tone:
- analytical: teal
- skeptical: amber
- urgent: red
- reflective: violet

This gives a visual "mood of the room" at a glance.

### 4.4 Task Timeline

A horizontal timeline strip showing task lifecycle:

```
[queued ........] [active ========= complete] [queued ........] [active ====
                                    ^engram                           ^now
```

Each task is a segment. Width proportional to duration (or time in queue). Color by status. Click a completed segment to jump to its engram. The "now" marker is a thin teal vertical line that pulses.

### 4.5 Message Flow Rate

A tiny area chart in the status bar (80px wide, 24px tall) showing messages-per-tick over the last 30 ticks. High flow = active discussion. Low flow = idle room. This is the "heartbeat monitor" — you should be able to see the conversation rhythm.

---

## 5. Interaction Design

### 5.1 Topic Submission

The "Submit Topic" button in the Intelligence panel opens a modal overlay:

```
+---------------------------------------------------+
|  SUBMIT TOPIC FOR ANALYSIS                    [X]  |
|                                                    |
|  Topic                                             |
|  +----------------------------------------------+  |
|  | [text input]                                  |  |
|  +----------------------------------------------+  |
|                                                    |
|  Source Material                                   |
|  +----------------------------------------------+  |
|  |                                               |  |
|  | [textarea, 8 lines, monospace]                |  |
|  |                                               |  |
|  +----------------------------------------------+  |
|                                                    |
|  Paste a URL, article text, or raw source          |
|  material for the analyst roundtable to evaluate.  |
|                                                    |
|                           [ CANCEL ]  [ SUBMIT ]   |
+---------------------------------------------------+
```

- Modal: bg-elevated background, border-bright border, 480px max width
- Topic input: text-bright, bg-inset background
- Source material: IBM Plex Mono, bg-inset, resizable vertically
- Submit button: teal background, text on dark
- Cancel: ghost button, border only
- On submit: POST /api/task, close modal, new task appears in queue with "queued" status
- Keyboard: Enter in topic field focuses textarea. Cmd+Enter submits.

### 5.2 Engram Deep Dive

Clicking an engram in the browser opens a slide-in detail panel (replaces the Intelligence panel, with a back arrow):

```
+---------------------------------------------------+
|  <- BACK TO INTELLIGENCE                           |
|                                                    |
|  Analysis: Claude Agent SDK Architecture Review    |
|  #ontologies #architecture                         |
|  2026-03-10 14:23:07                              |
|                                                    |
|  PROVENANCE                                        |
|  Activity: multi-agent                             |
|  Agents: Technologist, Strategist, Contrarian,     |
|          Historian                                  |
|  Derived from: [none]                              |
|  Supersedes: [none]                                |
|                                                    |
|  ---                                               |
|                                                    |
|  TECHNOLOGIST                                      |
|  [full response text, markdown rendered]           |
|                                                    |
|  STRATEGIST                                        |
|  [full response text, markdown rendered]           |
|                                                    |
|  CONTRARIAN                                        |
|  [full response text, markdown rendered]           |
|                                                    |
|  HISTORIAN                                         |
|  [full response text, markdown rendered]           |
|                                                    |
|  ---                                               |
|  TOPIC CHAIN                                       |
|  v1 (superseded) -> v2 (current) [this engram]     |
+---------------------------------------------------+
```

- Agent sections color-coded with left border accent
- Markdown rendered with marked.js + highlight.js (same stack as foldspace-console)
- Provenance section in text-muted, compact key-value layout

### 5.3 Agent Card Expansion

Clicking an agent card in the left panel expands it to show:
- Full FSM state machine diagram (larger version)
- Complete trigger keyword list
- Config parameters (energy costs, cooldown ticks, boredom threshold)
- Recent activity log (last 10 state transitions with timestamps)

Other agent cards compress to header-only mode during expansion. Click again or click another agent to cycle.

### 5.4 Conversation Controls

- **Auto-scroll lock**: A small lock icon at the bottom of the conversation panel. When scrolled to bottom = locked (auto-follows new messages). Scroll up = unlocked. Click the lock to snap back to bottom.
- **Message search**: Cmd+F opens a search bar within the conversation panel. Highlights matches, arrows to navigate. Not browser-native search — scoped to the message feed.
- **Agent filter**: Toggle buttons above the conversation panel to show/hide messages by agent. Active by default. Click to dim out an agent's messages (reduced opacity, not removed — context matters).

---

## 6. Technology Choices

### 6.1 Framework: Vanilla TypeScript + Lit

**Not React. Not Svelte. Not a framework at all in the traditional sense.**

Rationale:
- The foldspace-console established a zero-build-step, single-HTML-file architecture. Brian values this pattern.
- The dashboard is a single page with WebSocket-driven updates. No routing. No SSR. No hydration.
- The state is simple: agent states, message list, task queue, scene state. A reactive framework is engineering overhead for what is fundamentally "render data from WebSocket into DOM elements."
- However, raw DOM manipulation at this complexity level gets unwieldy.

The recommendation: **Lit** (lit.dev) — web components with reactive properties. Here is why:

1. **No build step required.** Lit can be loaded from CDN. Components are standard Web Components. Works in a single HTML file.
2. **Reactive rendering.** Property changes automatically re-render affected DOM. No manual `innerHTML` or `querySelector` chains.
3. **Tiny runtime.** ~5KB gzipped. Compared to Svelte's compiler output or React's 40KB+ runtime, this is nothing.
4. **Web standards.** Lit components are standard Custom Elements. No framework lock-in. They work with any other code on the page.
5. **Template literals.** `html\`<div>${this.data}</div>\`` is clean, familiar, and has good editor support.

**Alternative considered: Svelte 5.** Svelte's rune-based reactivity (`$state`, `$derived`, `$effect`) is excellent for this use case, and its compiled output is small. But it requires a build step (Vite/SvelteKit), which breaks the single-HTML-file pattern. If Brian is willing to introduce a build step, Svelte 5 becomes the stronger choice — its animation primitives (`transition:`, `animate:`) are built-in and would simplify the motion design considerably.

**The decision point is: single HTML file (Lit) vs. build step (Svelte 5).** Both are defensible. The design document assumes Lit unless Brian says otherwise.

### 6.2 Charting: Canvas 2D (hand-rolled)

No charting library. Here is why:

- The visualizations are all tiny: sparklines (60 points), area charts (30 points), gauge fills (single values), state machine diagrams (4 nodes, fixed topology).
- D3 is 240KB. ECharts is 800KB. Recharts needs React. Chart.js is reasonable at 65KB but still more than needed.
- Canvas 2D for sparklines is ~50 lines of code per chart type. It redraws every tick (every 3-30 seconds). Performance is not a concern at this data volume.
- The FSM diagram is inline SVG with CSS class-based animations. No library needed.

One reusable module: a `Sparkline` class that takes a canvas element, a data array, and style config, and draws itself. Used for energy sparklines, boredom sparklines, tension arc, and message flow. Four instances of the same renderer with different data.

### 6.3 WebSocket Handling

The server already broadcasts four event types: `stateChange`, `message`, `tick`, `taskComplete`. Plus `connected` on initial connection (includes full status snapshot).

Client-side WebSocket manager:

```
WebSocketManager
  - Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
  - Connection status indicator in status bar (green dot = connected, amber = reconnecting, red = disconnected)
  - Message buffer during reconnection (queue outbound, replay on reconnect)
  - Heartbeat ping every 30s (already supported by server — ping/pong)
  - On connected: populate full state from snapshot
  - On tick: update all agent states, tick counter, sparkline data
  - On stateChange: animate FSM transition on affected agent card
  - On message: append to conversation, auto-scroll if locked
  - On taskComplete: update task in queue, link to engram
```

### 6.4 Markdown Rendering

Same stack as foldspace-console: **marked.js** + **highlight.js** (github-dark theme) + **DOMPurify** for sanitization. Loaded from CDN. Used for engram content display and agent response rendering.

### 6.5 Deployment

The dashboard is a static HTML file served by the same Bun server that runs the ontologies API. Add a route:

```
GET /              -> serve dashboard HTML
GET /ws            -> WebSocket upgrade
GET /api/*         -> REST endpoints
```

No separate hosting. No build pipeline. The dashboard ships with the runner.

---

## 7. Animation and Motion Design

### 7.1 Principles

- **Mechanical, not organic.** Transitions are 150ms with `cubic-bezier(0.25, 0.1, 0.25, 1)` (the Ixian ease). No bounce. No overshoot. Things move like precision machinery.
- **Ambient motion shows life.** The tick counter increments. Sparklines extend. Agent energy recharges. These micro-animations happen continuously and are the system's pulse.
- **Significant events get attention.** FSM transitions, new messages, task injections — these get brief, crisp animations that draw the eye and then settle.
- **Nothing loops.** No spinning loaders, no infinite animations (except the typing ellipsis, which has justification). Looping animation says "waiting." This dashboard says "working."

### 7.2 Specific Animations

**Tick pulse** (every tick):
- Status bar background flashes: bg-surface -> bg-elevated -> bg (150ms total)
- Tick counter increments with a subtle "flip" effect (old number slides up 4px and fades, new number slides in from below)
- Agent gauges smooth-interpolate to new values (CSS transition on width, 200ms)

**FSM state transition**:
- Old state circle dims (opacity 1 -> 0.3, 150ms)
- Transition arc pulses (stroke-dashoffset animation, 300ms, teal glow)
- New state circle brightens (opacity 0.3 -> 1, 150ms)
- Agent card border color changes to new state color (150ms)
- If entering RESPONDING: card gets a subtle teal glow (`box-shadow: 0 0 12px var(--teal-dim)`)
- If entering COOLDOWN: glow fades, countdown number appears

**New message arrival**:
- Message slides in from below (translateY 8px -> 0, opacity 0 -> 1, 200ms)
- Agent's card gets a brief highlight flash (border brightens 100ms, then settles)
- If the message is from an agent that was in RESPONDING, the typing indicator fades out (100ms) as the message fades in

**Task injection**:
- The amber border pulses once (opacity ramp to 0.4, then settle at 0.08)
- Task appears in queue with slide-right animation
- If task transitions to active: teal border appears, queued tasks shift down

**Scene narration**:
- Slow fade-in (400ms, longer than messages — scene events are ambient, not urgent)
- Background color fades from transparent to bg-elevated

**Engram stored**:
- Green flash on the completed task in the queue
- Engram appears in the browser with a slide-in + fade
- Brief confetti-like particle burst? No. This is Ixian. A single green pulse on the border is sufficient.

**Agent emote**:
- Italic text fades in at 60% opacity, then settles to 40% over 2 seconds
- Agent's mood gauge twitches (tiny movement to reflect the emote's effect)

### 7.3 SVG Noise Overlay

Same as foldspace-console:

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background-image: url("data:image/svg+xml,..."); /* fractal noise */
  opacity: 0.012;
  mix-blend-mode: overlay;
}
```

This gives the entire dashboard a faint texture — like looking through facility glass. Subtle, but it prevents the sterile feel of pure flat dark UI.

---

## 8. Data Flow Architecture

### 8.1 State Model (Client-Side)

```typescript
interface DashboardState {
  connected: boolean;
  reconnecting: boolean;

  // From /api/status snapshot (on connect) + tick updates
  tickNumber: number;
  tickRate: number;
  running: boolean;

  // Agent states (updated on every tick + stateChange events)
  agents: Map<string, {
    state: AgentState;           // current FSM state + gauges
    history: AgentState[];       // last 60 ticks for sparklines
    lastTransition: string;      // "IDLE -> RESPONDING"
    transitionTime: number;      // timestamp of last FSM change
  }>;

  // Message stream
  messages: RoomMessage[];       // capped at 500 client-side
  autoScroll: boolean;

  // Tasks
  taskQueue: Task[];
  activeTask: Task | null;
  completedTasks: Task[];        // last 20

  // Scene
  sceneState: SceneState | null;
  tensionHistory: number[];      // last 120 ticks
  toneHistory: Array<{ tick: number; tone: string }>;

  // Engrams (fetched lazily from REST API)
  engramIndex: StoreIndex | null;
  selectedEngram: Engram | null;
}
```

### 8.2 Update Flow

```
WebSocket message received
  |
  +-- type: "connected"
  |     -> Initialize full state from snapshot
  |     -> Fetch engram index from GET /api/engrams
  |
  +-- type: "tick"
  |     -> Update all agent states
  |     -> Push to history arrays (shift if > limit)
  |     -> Update tick counter, tick rate
  |     -> Redraw sparklines (canvas)
  |     -> Animate tick pulse in status bar
  |
  +-- type: "stateChange"
  |     -> Update specific agent's FSM state
  |     -> Trigger FSM transition animation
  |     -> Update agent card border/glow
  |     -> Show/hide typing indicator
  |
  +-- type: "message"
  |     -> Append to message list
  |     -> Auto-scroll if locked
  |     -> Animate message entry
  |
  +-- type: "taskComplete"
        -> Update task status in queue
        -> Move to completedTasks
        -> Refresh engram index (GET /api/engrams)
        -> Animate completion
```

---

## 9. The "Wow Factor" — What Makes This Exceptional

### 9.1 The Breathing Grid

The entire dashboard subtly breathes with the tick loop. Not a dramatic animation — a micro-variation in the status bar opacity, the sparklines extending by one data point, agent gauges adjusting. Someone watching should feel the system's rhythm without consciously identifying any single animation. The tick is between 3 and 30 seconds (dynamic). At faster tick rates, the dashboard feels more alive. At slower rates, it feels contemplative. The dashboard's pace matches the system's pace.

### 9.2 State Transition Traces

When an agent transitions from IDLE to RESPONDING, the FSM diagram in their card doesn't just highlight the new state — it shows the transition path lighting up like a circuit trace. A line of light travels from the old state node to the new state node along the connecting arc. 300ms, teal glow, then settles. This is the Swiss watch mechanism exposed: you are literally watching the state machine execute.

### 9.3 Conversational Tension Heatmap

The conversation panel's background isn't uniform. As scene tension rises, the background very gradually shifts from pure --bg to a faint warm tint (think: amber at 2% opacity over the conversation area). High-tension conversations feel physically warmer. Low-tension analytical discussions feel cool and precise. The change is slow enough that you don't notice it happening, but you feel it. This is subliminal environmental design.

### 9.4 Agent "Personality" in the Gauges

Each agent has different energy economics, and the sparklines make this visible:
- **Technologist**: highest max energy (100), highest response cost (30) — deep spikes and slow recovery
- **Contrarian**: lower max (95) but lower cost (25), higher boredom rate, lower threshold — restless, chattery pattern
- **Historian**: lowest energy (85), patient boredom curve — measured, contemplative rhythm
- **Strategist**: middle everything — steady, balanced waveform

Over time, each agent's sparkline develops a characteristic shape. The Contrarian's boredom line ramps fast and triggers often. The Historian's energy line stays higher, responding less frequently but with more weight. You start reading the sparklines like EKG traces — recognizing each agent's heartbeat.

### 9.5 The Empty State

When no task is active and agents are idle, the dashboard should still be beautiful. The idle state is not "nothing is happening" — it is "the system is at rest." Agents slowly accumulate boredom. Energy gauges top off. The tension line stays low and flat. Occasional emotes drift through the conversation panel (*Contrarian narrowing eyes...*). The tick pulse in the status bar continues.

The dashboard at rest should look like a submarine control room during peacetime — all instruments reading nominal, soft amber from a single indicator, the quiet hum of systems on standby. You should want to stare at it.

### 9.6 Task Injection Drama

When a new task is submitted, the entire dashboard acknowledges it:
1. The task appears in the queue (slide-in)
2. When it activates: the task message punches into the conversation with amber borders
3. All four agent cards light up as they evaluate the task (brief highlights as relevance is calculated)
4. Agents begin transitioning to RESPONDING — their FSM traces fire
5. The tick rate potentially changes (dynamic tick calculation) — you can see it in the status bar
6. Typing indicators appear as agents think
7. Responses arrive one by one, each agent's message sliding in
8. When all four have responded: the task completes, green flash, engram stored

This is the full lifecycle visible in real time. A 2-minute process where you watch four AI analysts receive a question, evaluate it, think about it, and deliver their perspectives. It should feel like watching a command being executed across a distributed system — because that's exactly what it is.

### 9.7 Audio Cues (Optional, Off by Default)

A toggle in the status bar for ambient audio:
- Soft tick sound on each system tick (barely audible, clock mechanism)
- Subtle "activation" tone when an agent enters RESPONDING (different pitch per agent)
- Completion chime when a task completes
- Tension drone that rises with scene tension (extremely subtle, almost subliminal)

This is entirely optional and off by default. But for the "I want to leave this running on a monitor" experience, ambient audio transforms a visual dashboard into an environmental one.

---

## 10. Implementation Phases

### Phase 1: Foundation
- HTML skeleton with three-column grid
- Ixian CSS system (variables, typography, noise overlay)
- WebSocket connection manager with reconnect
- Status bar with live tick counter
- Basic message stream (no animations yet)

### Phase 2: Agent Cards
- Four agent cards with gauges (energy, boredom, mood, cooldown)
- FSM state indicator (dot + label)
- Canvas sparklines for energy/boredom
- State change animations

### Phase 3: Intelligence Panel
- Task queue display
- Topic submission modal
- Engram browser (list view)
- System vitals section
- Tension sparkline

### Phase 4: Polish and Wow
- FSM state machine SVG diagrams with transition traces
- Conversation tension heatmap
- Full animation suite (message entry, task injection, tick pulse)
- Engram detail view with markdown rendering
- Agent card expansion
- Conversation controls (auto-scroll, search, agent filter)

### Phase 5: Refinement
- Responsive breakpoints
- Performance profiling (should target <16ms per frame during tick)
- Audio cues (optional)
- Edge cases (reconnection state, error displays, empty states)

---

## 11. Open Questions

1. **Single HTML or build step?** Lit (single file, CDN) vs. Svelte 5 (build step, better DX). The design works with either. Brian's call.

2. **Dashboard served from the runner or separate?** Current recommendation is same Bun server. If the dashboard grows significantly, it could be split to a separate static deployment.

3. **Authentication?** Currently none. If ontologies is exposed to the internet (ontologies.yntk.news), we need at minimum a bearer token on the WS connection and API endpoints. Design the UI to show a login state.

4. **Mobile?** The responsive breakpoints are defined, but the dashboard is fundamentally a desktop/monitor experience. Invest in mobile only if there is a real use case.

5. **Agent config editing?** The dashboard currently only reads state. Should it also allow modifying agent configs (energy costs, trigger words, etc.) at runtime? This would require new API endpoints and raises the question of whether changes persist.

---

## Appendix A: Inspirations and References

**NASA JPL Mission Control**: The multi-monitor layout where each station shows a different telemetry domain. Our agents panel = individual station monitors. Our conversation = the main event feed. Our intelligence panel = the situational awareness display.

**Bloomberg Terminal**: Information density done right. Every pixel has a purpose. Multiple data streams visible simultaneously. The "wall of numbers" that experts scan in seconds. Our agent gauges and status bar borrow this density ethic.

**Grafana (dark mode)**: The gold standard for time-series dashboards. Panel-based layout, real-time data streaming, query-driven visualization. Our sparklines and tension arc are in this tradition.

**Linear**: The feel, not the function. Linear proved that task management software can feel precise and alive. Their micro-animations, keyboard-first interaction, and dark theme restraint are direct ancestors of this design.

**Foldspace Console**: Brian's own creation. The Ixian design system, Void theme, and "Subterranean Precision" aesthetic are the direct foundation. We are not inventing a new design language — we are extending an existing one into a new domain.

**Submarine/SCIF control rooms**: The ambient, always-on monitoring aesthetic. Soft lighting, instruments at rest, the sense that the system is alive even when nothing is happening. The dashboard at idle should evoke this feeling.
