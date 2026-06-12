/**
 * ComfyUI Quick Panel — v0.7  "Focus Mode"
 * ─────────────────────────────────────────
 * Right-click nodes → "Add to Focus Panel"
 * Click the ⊞ button in the sidebar to enter/exit focus mode
 * Ctrl+Shift+P also toggles
 * Esc exits
 */

import { app } from "../../scripts/app.js";

const EXT_NAME = "Comfy.QuickPanel";
const LSKEY    = "quickpanel_v7";

// ─── persistence ─────────────────────────────────────────────────────────────

const loadData = () => { try { return JSON.parse(localStorage.getItem(LSKEY) || "null") || {}; } catch { return {}; } };
const saveData = v  => localStorage.setItem(LSKEY, JSON.stringify(v));

// ─── geometry helpers ─────────────────────────────────────────────────────────

const GAP          = 80;    // gap between focused nodes (graph units)
const FOCUS_OFFSET = 8000;  // how far right of all workflow nodes we place the focus area

/** Find the rightmost X edge of all non-focus nodes */
function workflowRightEdge(allNodes, focusIds) {
  let maxX = 0;
  for (const n of allNodes) {
    if (focusIds.has(n.id)) continue;
    maxX = Math.max(maxX, n.pos[0] + n.size[0]);
  }
  return maxX;
}

/** Arrange focusNodes in a grid, starting at originX.
 *  Nodes with an entry in savedPositions keep that position. */
function computeLayout(focusNodes, originX = 0, savedPositions = {}) {
  if (focusNodes.length === 0) return null;
  const sorted = [...focusNodes].sort((a, b) => a.pos[0] - b.pos[0]);
  const positions = [];
  const needsGrid = [];
  for (const n of sorted) {
    const saved = savedPositions[n.id];
    if (saved) {
      positions.push({ node: n, nx: originX + saved.x, ny: saved.y });
    } else {
      needsGrid.push(n);
    }
  }

  // Grid positions for nodes that have no saved position
  const cols = Math.ceil(Math.sqrt(needsGrid.length * 1.6));
  let x = 0, rowY = 0, maxRowH = 0, col = 0;

  // Start grid below the lowest saved node
  for (const p of positions) {
    const bottom = p.ny + p.node.size[1] + (LiteGraph?.NODE_TITLE_HEIGHT ?? 30);
    if (bottom > rowY) rowY = bottom + GAP;
  }

  for (const n of needsGrid) {
    if (col === cols) { col = 0; x = 0; rowY += maxRowH + GAP; maxRowH = 0; }
    positions.push({ node: n, nx: originX + x, ny: rowY });
    x += n.size[0] + GAP;
    maxRowH = Math.max(maxRowH, n.size[1] + (LiteGraph?.NODE_TITLE_HEIGHT ?? 30));
    col++;
  }

  let totalW = 0, totalH = 0;
  for (const p of positions) {
    const r = p.nx - originX + p.node.size[0];
    if (r > totalW) totalW = r;
    const b = p.ny + p.node.size[1] + (LiteGraph?.NODE_TITLE_HEIGHT ?? 30);
    if (b > totalH) totalH = b;
  }
  return { positions, totalW, totalH, originX };
}

function applyLayout(layout) {
  if (!layout) return;
  for (const { node, nx, ny } of layout.positions) {
    node.pos[0] = nx;
    node.pos[1] = ny;
  }
}

function zoomToFit(layout, lgCanvas) {
  if (!layout) return;
  const { totalW, totalH, originX } = layout;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 100;
  const scaleX = (vw - margin * 2) / Math.max(totalW, 1);
  const scaleY = (vh - margin * 2) / Math.max(totalH, 1);
  const scale  = Math.min(scaleX, scaleY, 2.0);
  const fitW   = totalW * scale;
  const fitH   = totalH * scale;
  lgCanvas.ds.scale  = scale;
  lgCanvas.ds.offset = [
    (vw - fitW)  / 2 / scale - originX,
    (vh - fitH)  / 2 / scale,
  ];
  lgCanvas.setDirty(true, true);
}

// ─── Link rendering patch ─────────────────────────────────────────────────────
// Instead of setting colours (which didn't work), we patch the actual
// drawConnections method on the LGraphCanvas instance to be a no-op in focus mode.

let _origDrawConnections = null;

function hideLinks(lgCanvas) {
  if (_origDrawConnections) return; // already patched
  _origDrawConnections = lgCanvas.drawConnections.bind(lgCanvas);
  lgCanvas.drawConnections = () => {}; // no-op
}

function showLinks(lgCanvas) {
  if (!_origDrawConnections) return;
  lgCanvas.drawConnections = _origDrawConnections;
  _origDrawConnections = null;
}

// ─── Non-focus node dimming ───────────────────────────────────────────────────
// We patch renderNode to skip non-focus nodes entirely in focus mode.

let _origDrawNode = null;
let _focusIds     = new Set();

function hideNonFocusNodes(lgCanvas) {
  if (_origDrawNode) return;
  _origDrawNode = lgCanvas.drawNode.bind(lgCanvas);
  lgCanvas.drawNode = function(node, ctx) {
    if (!_focusIds.has(node.id)) return; // skip non-focus nodes
    _origDrawNode(node, ctx);
  };
}

function showAllNodes(lgCanvas) {
  if (!_origDrawNode) return;
  lgCanvas.drawNode = _origDrawNode;
  _origDrawNode = null;
}

// ─── QuickPanel ───────────────────────────────────────────────────────────────

class QuickPanel {
  constructor() {
    this.focusNodeIds = new Set();
    this.inFocusMode  = false;
    this._savedState  = null;  // { positions, scale, offset }
    this._layout      = null;  // current focus layout

    this._data = loadData();
    if (Array.isArray(this._data.focusIds)) {
      this._data.focusIds.forEach(id => this.focusNodeIds.add(id));
    }
    this._focusLayoutPositions = this._data.layoutPositions || {};

    this._bindKeyboard();
    console.log("[QuickPanel] v0.8 ready ✓");
  }

  // Called after registerExtension so extensionManager is available
  registerUI() {
    this._injectTopbarBtn(0);
    console.log("[QuickPanel] UI registration started ✓");
  }

  _injectTopbarBtn(attempt) {
    if (attempt > 30) {
      console.warn("[QuickPanel] topbar not found after 30 attempts — use Ctrl+Shift+P");
      return;
    }
    if (document.getElementById("qp-topbar-btn")) return;

    // Use the modern app.menu API (rgthree/bulker approach)
    const anchor =
      app.menu?.settingsGroup?.element ??
      app.ui?.menuContainer ??
      document.querySelector(".comfyui-menu-right") ??
      document.querySelector(".p-menubar-end") ??
      document.querySelector(".comfyui-menu") ??
      null;

    if (!anchor || (anchor instanceof Element && !anchor.isConnected)) {
      setTimeout(() => this._injectTopbarBtn(attempt + 1), 300);
      return;
    }

    const btn = document.createElement("button");
    btn.id = "qp-topbar-btn";
    Object.assign(btn.style, {
      background:    "transparent",
      border:        "1px solid rgba(124,140,248,0.40)",
      borderRadius:  "6px",
      color:         "rgba(160,172,255,0.90)",
      fontSize:      "12px",
      fontWeight:    "600",
      padding:       "4px 12px",
      cursor:        "pointer",
      margin:        "0 6px",
      letterSpacing: "0.04em",
      whiteSpace:    "nowrap",
      transition:    "all 0.15s",
    });
    btn.title = "Toggle Focus Mode (Ctrl+Shift+P)";
    btn.addEventListener("click", () => this.toggleFocusMode());
    btn.addEventListener("mouseenter", () => {
      if (!this.inFocusMode) btn.style.borderColor = "rgba(124,140,248,0.75)";
    });
    btn.addEventListener("mouseleave", () => this._styleTopbarBtn());

    // Insert at the beginning of the settings group (next to Manager)
    anchor.insertBefore(btn, anchor.firstChild);
    this._topbarBtn = btn;
    this._styleTopbarBtn();
    console.log("[QuickPanel] topbar button injected into:", (anchor.className || anchor.nodeName), "✓");
  }

  _styleTopbarBtn() {
    const btn = this._topbarBtn;
    if (!btn) return;
    if (this.inFocusMode) {
      btn.textContent        = "⊞ Exit Focus";
      btn.style.background   = "rgba(104,211,145,0.14)";
      btn.style.borderColor  = "rgba(104,211,145,0.55)";
      btn.style.color        = "rgba(104,211,145,0.95)";
    } else {
      const n = this.focusNodeIds.size;
      btn.textContent        = n > 0 ? `⊞ Focus (${n})` : "⊞ Focus";
      btn.style.background   = "transparent";
      btn.style.borderColor  = "rgba(124,140,248,0.40)";
      btn.style.color        = "rgba(160,172,255,0.90)";
    }
  }

  // _styleSidebarBtn kept as alias so existing call-sites don't break
  _styleSidebarBtn() { this._styleTopbarBtn(); }
  _updateSidebarCount() { this._styleTopbarBtn(); }

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  _bindKeyboard() {
    document.addEventListener("keydown", e => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") { e.preventDefault(); this.toggleFocusMode(); }
      if (e.key === "Escape" && this.inFocusMode)     this.exitFocusMode();
    });
  }

  // ─── Node selection ────────────────────────────────────────────────────────

  addFocusNode(node) {
    this.focusNodeIds.add(node.id);
    _focusIds = this.focusNodeIds;
    this._persist();
    this._updateSidebarCount();
    if (this.inFocusMode) this._rearrange();
  }

  removeFocusNode(nodeId) {
    this.focusNodeIds.delete(nodeId);
    delete this._focusLayoutPositions[nodeId];
    _focusIds = this.focusNodeIds;
    this._persist();
    this._updateSidebarCount();
    if (this.inFocusMode) {
      if (this.focusNodeIds.size === 0) this.exitFocusMode();
      else this._rearrange();
    }
  }

  hasFocusNode(id) { return this.focusNodeIds.has(id); }

  _persist() {
    this._data.focusIds = [...this.focusNodeIds];
    this._data.layoutPositions = this._focusLayoutPositions;
    saveData(this._data);
  }

  // ─── Focus mode ────────────────────────────────────────────────────────────

  toggleFocusMode() {
    this.inFocusMode ? this.exitFocusMode() : this.enterFocusMode();
  }

  enterFocusMode() {
    if (this.inFocusMode) return;

    // Auto-pick canvas selection if nothing explicitly added
    if (this.focusNodeIds.size === 0) {
      const sel = app.canvas?.selected_nodes;
      if (sel && Object.keys(sel).length > 0) {
        for (const id of Object.keys(sel)) this.focusNodeIds.add(parseInt(id));
        _focusIds = this.focusNodeIds;
        this._persist();
      } else {
        // Flash topbar button as a hint
        if (this._topbarBtn) {
          this._topbarBtn.style.background  = "rgba(255,160,50,0.15)";
          this._topbarBtn.style.borderColor = "rgba(255,160,50,0.70)";
          this._topbarBtn.style.color       = "rgba(255,190,80,0.95)";
          this._topbarBtn.textContent       = "⚠ Select nodes first";
          setTimeout(() => this._styleTopbarBtn(), 1800);
        }
        return;
      }
    }

    const lgCanvas = app.canvas;

    // 1. Save current state (positions of ALL nodes + viewport)
    const savedPositions = {};
    for (const n of app.graph._nodes) savedPositions[n.id] = [...n.pos];
    this._savedState = {
      positions: savedPositions,
      scale:     lgCanvas.ds.scale,
      offset:    [...lgCanvas.ds.offset],
    };

    // 2. Compute focus layout far to the right of the workflow
    const originX = workflowRightEdge(app.graph._nodes, this.focusNodeIds) + FOCUS_OFFSET;
    const focusNodes = [...this.focusNodeIds].map(id => app.graph.getNodeById(id)).filter(Boolean);
    this._layout = computeLayout(focusNodes, originX, this._focusLayoutPositions);

    // 3. Move focus nodes to their new positions
    applyLayout(this._layout);

    // 4. Patch rendering: hide links + hide non-focus nodes
    _focusIds = this.focusNodeIds;
    hideLinks(lgCanvas);
    hideNonFocusNodes(lgCanvas);

    // 5. Zoom to fit the focus area
    setTimeout(() => {
      zoomToFit(this._layout, lgCanvas);
      app.graph.setDirtyCanvas(true, true);
    }, 60);

    this.inFocusMode = true;
    this._styleSidebarBtn();
    console.log("[QuickPanel] Focus mode entered ✓");
  }

  exitFocusMode() {
    if (!this.inFocusMode) return;
    const lgCanvas = app.canvas;
    const originX  = this._layout?.originX
      ?? workflowRightEdge(app.graph._nodes, this.focusNodeIds) + FOCUS_OFFSET;

    // 1. Save current focus node positions (relative to originX) BEFORE restoring
    this._focusLayoutPositions = {};
    for (const id of this.focusNodeIds) {
      const n = app.graph.getNodeById(id);
      if (n) this._focusLayoutPositions[id] = { x: n.pos[0] - originX, y: n.pos[1] };
    }
    this._persist();

    // 2. Restore patches
    showLinks(lgCanvas);
    showAllNodes(lgCanvas);

    // 3. Restore all node positions
    if (this._savedState) {
      for (const n of app.graph._nodes) {
        const saved = this._savedState.positions[n.id];
        if (saved) { n.pos[0] = saved[0]; n.pos[1] = saved[1]; }
      }
      lgCanvas.ds.scale  = this._savedState.scale;
      lgCanvas.ds.offset = [...this._savedState.offset];
    }

    this._savedState = null;
    this._layout     = null;
    this.inFocusMode = false;
    this._styleSidebarBtn();
    app.graph.setDirtyCanvas(true, true);
    console.log("[QuickPanel] Focus mode exited ✓");
  }

  // Re-arrange focus nodes preserving manually-set positions
  _rearrange() {
    const lgCanvas   = app.canvas;
    const focusNodes = [...this.focusNodeIds].map(id => app.graph.getNodeById(id)).filter(Boolean);

    // Re-use same originX so we stay far from the workflow
    const originX = this._layout?.originX
      ?? workflowRightEdge(app.graph._nodes, this.focusNodeIds) + FOCUS_OFFSET;

    // Clean up saved positions for nodes no longer in focus
    for (const id of Object.keys(this._focusLayoutPositions)) {
      if (!this.focusNodeIds.has(Number(id))) delete this._focusLayoutPositions[id];
    }

    this._layout = computeLayout(focusNodes, originX, this._focusLayoutPositions);
    applyLayout(this._layout);

    setTimeout(() => {
      zoomToFit(this._layout, lgCanvas);
      app.graph.setDirtyCanvas(true, true);
    }, 30);
  }

  // ─── Workflow persistence ──────────────────────────────────────────────────

  serialise() {
    return {
      focusIds: [...this.focusNodeIds],
      layoutPositions: this._focusLayoutPositions,
    };
  }

  restore(data) {
    if (!data?.focusIds) return;
    this.focusNodeIds = new Set(data.focusIds);
    _focusIds = this.focusNodeIds;
    this._focusLayoutPositions = data.layoutPositions || {};
    this._persist();
  }
}

// ─── Extension ───────────────────────────────────────────────────────────────

let panel = null;

app.registerExtension({
  name: EXT_NAME,

  commands: [
    { id: "quickpanel.toggle", label: "Toggle Focus Mode", function: () => panel?.toggleFocusMode() },
    { id: "quickpanel.exit",   label: "Exit Focus Mode",   function: () => panel?.exitFocusMode()   },
  ],

  menuCommands: [
    { path: ["Extensions", "Focus Panel"], commands: ["quickpanel.toggle", "quickpanel.exit"] },
  ],

  async setup() {
    console.log("[QuickPanel] setup() ✓");
    panel = new QuickPanel();
    panel.registerUI();
  },

  saveCustomNodesData(workflow) {
    if (panel) workflow.quickpanel = panel.serialise();
  },

  loadCustomNodesData(workflow) {
    if (panel && workflow.quickpanel) panel.restore(workflow.quickpanel);
  },

  async loadedGraphNode() {},
});

// ─── Context menu ─────────────────────────────────────────────────────────────

function patchContextMenu() {
  const LGC = window.LGraphCanvas ?? app.canvas?.constructor;
  if (!LGC?.prototype) { setTimeout(patchContextMenu, 500); return; }

  // Node right-click
  const origNode = LGC.prototype.getNodeMenuOptions;
  LGC.prototype.getNodeMenuOptions = function(node) {
    const opts = origNode ? origNode.call(this, node) : [];
    if (!panel) return opts;
    const inFocus = panel.hasFocusNode(node.id);
    opts.push(null);
    opts.push({
      content: inFocus ? "✕ Remove from Focus Panel" : "⊞ Add to Focus Panel",
      callback: () => inFocus ? panel.removeFocusNode(node.id) : panel.addFocusNode(node),
    });
    return opts;
  };

  // Canvas right-click
  const origCanvas = LGC.prototype.getCanvasMenuOptions;
  LGC.prototype.getCanvasMenuOptions = function() {
    const opts = origCanvas ? origCanvas.call(this) : [];
    if (!panel) return opts;
    opts.push(null);
    opts.push({
      content: panel.inFocusMode ? "✕ Exit Focus Mode" : "⊞ Enter Focus Mode",
      callback: () => panel.toggleFocusMode(),
    });
    return opts;
  };

  console.log("[QuickPanel] context menus patched ✓");
}
setTimeout(patchContextMenu, 1200);
