# Floor Plan App - UX Improvement Plan

## Executive Summary

This document outlines practical, implementable improvements for five identified UX pain points in the floor plan web application. Each section includes the current state analysis, proposed solution, implementation approach, and estimated complexity.

---

## Pain Point 1: Drawing New Sections Isn't Obvious

### Current State
- Users must select a zone type from the sidebar, then click-and-drag on the canvas
- No visual indicator that zone drawing mode is active
- No on-canvas instructions or preview
- Tool state only shown by button highlight in toolbar (easy to miss)

### Proposed Solution

**A. Visual Mode Indicator**
- Add a prominent banner/toast at the top of the canvas when in zone-drawing mode
- Display: "Click and drag to draw [Zone Type] zone" with the zone's color
- Show escape hint: "Press ESC to cancel"

**B. Cursor Change**
- Change cursor to crosshair when in zone-drawing mode
- Current: default pointer cursor in all modes

**C. Ghost Preview**
- Show a semi-transparent rectangle following the mouse before first click
- After first click, show the zone being drawn in real-time (already partially implemented)

**D. Sidebar Visual Feedback**
- Highlight the selected zone type in the sidebar with a colored border
- Add pulsing animation or glow to indicate active selection

**E. Contextual Help Tooltip**
- On first use (or via help icon), show a brief tutorial overlay
- Store "has seen tutorial" in localStorage

### Implementation Details

```javascript
// In index.html, add mode indicator element
<div id="mode-indicator" class="mode-indicator hidden">
    <span id="mode-text"></span>
    <span class="mode-hint">Press ESC to cancel</span>
</div>

// CSS for mode indicator
.mode-indicator {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 122, 255, 0.9);
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 100;
    display: flex;
    gap: 12px;
    align-items: center;
}
.mode-indicator.hidden { display: none; }

// JavaScript modifications
function setTool(tool) {
    currentTool = tool;
    const indicator = document.getElementById('mode-indicator');
    const modeText = document.getElementById('mode-text');

    if (tool === 'zone' && pendingZoneType) {
        indicator.classList.remove('hidden');
        modeText.textContent = `Drawing: ${ZONE_COLORS[pendingZoneType]?.label || pendingZoneType}`;
        canvas.style.cursor = 'crosshair';
    } else if (tool === 'measure') {
        indicator.classList.remove('hidden');
        modeText.textContent = 'Measure: Click and drag';
        canvas.style.cursor = 'crosshair';
    } else {
        indicator.classList.add('hidden');
        canvas.style.cursor = 'default';
    }
}
```

### Files to Modify
- `index.html`: Lines 460-478 (tool state), Lines 1132-1139 (tool buttons), CSS section

### Complexity: Low-Medium

---

## Pain Point 2: Cannot Select Multiple Items for Bulk Delete

### Current State
- Only single selection supported (`selectedItem` and `selectedZone` are singular)
- Delete key removes one item at a time
- No shift-click, ctrl-click, or marquee selection

### Proposed Solution

**A. Multi-Selection Data Structure**
```javascript
// Replace single selection with arrays
let selectedItems = [];  // Array of selected items
let selectedZones = [];  // Array of selected zones
```

**B. Selection Methods**
1. **Shift+Click**: Add/remove item from selection (toggle)
2. **Ctrl/Cmd+Click**: Add item to selection
3. **Click (no modifier)**: Clear selection, select clicked item only
4. **Marquee Selection**: Click and drag on empty space to draw selection rectangle

**C. Visual Feedback**
- All selected items show red outline (existing style)
- Selection count displayed in info panel: "3 items selected"
- Bulk actions shown: "Press Delete to remove all"

**D. Keyboard Shortcuts**
- `Ctrl/Cmd+A`: Select all items (or all zones if in zone mode)
- `Escape`: Deselect all
- `Delete/Backspace`: Delete all selected

### Implementation Details

```javascript
// New selection state
let selectedItems = [];
let selectedZones = [];
let selectionRect = null; // For marquee selection {x1, y1, x2, y2}

// Modified click handler for multi-select
canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'select') return;

    const { x, y } = getCanvasCoords(e);
    const item = getItemAt(x, y);
    const zone = getZoneAt(x, y);

    if (item) {
        if (e.shiftKey) {
            // Toggle selection
            const idx = selectedItems.indexOf(item);
            if (idx >= 0) selectedItems.splice(idx, 1);
            else selectedItems.push(item);
        } else if (e.ctrlKey || e.metaKey) {
            // Add to selection
            if (!selectedItems.includes(item)) selectedItems.push(item);
        } else {
            // Single select
            selectedItems = [item];
            selectedZones = [];
        }
    } else if (zone) {
        // Similar logic for zones
    } else {
        // Start marquee selection
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            selectedItems = [];
            selectedZones = [];
        }
        selectionRect = { x1: x, y1: y, x2: x, y2: y };
    }
    draw();
});

// Marquee selection during drag
canvas.addEventListener('mousemove', (e) => {
    if (selectionRect) {
        const { x, y } = getCanvasCoords(e);
        selectionRect.x2 = x;
        selectionRect.y2 = y;
        draw();
    }
});

// Finalize marquee on mouseup
canvas.addEventListener('mouseup', () => {
    if (selectionRect) {
        selectItemsInRect(selectionRect);
        selectionRect = null;
        draw();
    }
});

// Helper: select items within rectangle
function selectItemsInRect(rect) {
    const minX = Math.min(rect.x1, rect.x2);
    const maxX = Math.max(rect.x1, rect.x2);
    const minY = Math.min(rect.y1, rect.y2);
    const maxY = Math.max(rect.y1, rect.y2);

    placedItems.forEach(item => {
        const iw = item.w / 12, ih = item.h / 12;
        if (item.x + iw >= minX && item.x <= maxX &&
            item.y + ih >= minY && item.y <= maxY) {
            if (!selectedItems.includes(item)) selectedItems.push(item);
        }
    });
}

// Modified delete handler
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === document.body) {
        e.preventDefault();
        if (selectedItems.length > 0) {
            placedItems = placedItems.filter(i => !selectedItems.includes(i));
            selectedItems = [];
        }
        if (selectedZones.length > 0) {
            zones = zones.filter(z => !selectedZones.includes(z));
            selectedZones = [];
        }
        saveToLocalStorage();
        showSaveIndicator('✓ Deleted');
        draw();
    }
});

// Draw selection rectangle
function draw() {
    // ... existing draw code ...

    // Draw marquee selection rectangle
    if (selectionRect) {
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const rx = ox + Math.min(selectionRect.x1, selectionRect.x2) * SCALE;
        const ry = oy + Math.min(selectionRect.y1, selectionRect.y2) * SCALE;
        const rw = Math.abs(selectionRect.x2 - selectionRect.x1) * SCALE;
        const rh = Math.abs(selectionRect.y2 - selectionRect.y1) * SCALE;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
    }
}
```

### Files to Modify
- `index.html`: Lines 462-478 (state variables), Lines 805-822 (item rendering), Lines 926-973 (mouse handlers), Lines 1118-1130 (delete handler)

### Complexity: Medium

---

## Pain Point 3: No Undo/Redo or Item History

### Current State
- No undo/redo functionality
- Deleted items are gone immediately
- Only recovery method is loading a saved version
- Users must manually save versions before making changes

### Proposed Solution

**A. Undo/Redo Stack**
```javascript
const MAX_HISTORY = 50;
let undoStack = [];    // Array of state snapshots
let redoStack = [];    // For redo after undo
```

**B. State Snapshot System**
- Capture state before each destructive operation
- Store: zones, placedItems, and operation description
- Limit stack size to prevent memory issues

**C. Keyboard Shortcuts**
- `Ctrl/Cmd+Z`: Undo
- `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y`: Redo

**D. UI Buttons**
- Add undo/redo buttons to toolbar
- Show disabled state when stack is empty
- Tooltip showing what will be undone/redone

**E. Recently Deleted Panel (Alternative/Complement)**
- Sidebar panel showing recently deleted items
- Click to restore item to original position
- Auto-clear after session or after 20 items

### Implementation Details

```javascript
// History management
const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];

function saveState(description) {
    // Deep clone current state
    const state = {
        zones: JSON.parse(JSON.stringify(zones)),
        items: JSON.parse(JSON.stringify(placedItems)),
        description: description
    };

    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift(); // Remove oldest
    }

    // Clear redo stack on new action
    redoStack = [];

    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;

    // Save current state to redo stack
    redoStack.push({
        zones: JSON.parse(JSON.stringify(zones)),
        items: JSON.parse(JSON.stringify(placedItems)),
        description: 'Redo'
    });

    // Restore previous state
    const state = undoStack.pop();
    zones = state.zones;
    placedItems = state.items;

    selectedItems = [];
    selectedZones = [];

    saveToLocalStorage();
    updateUndoRedoButtons();
    showSaveIndicator('↩ Undid: ' + state.description);
    draw();
}

function redo() {
    if (redoStack.length === 0) return;

    // Save current state to undo stack
    undoStack.push({
        zones: JSON.parse(JSON.stringify(zones)),
        items: JSON.parse(JSON.stringify(placedItems)),
        description: 'Undo'
    });

    // Restore redo state
    const state = redoStack.pop();
    zones = state.zones;
    placedItems = state.items;

    selectedItems = [];
    selectedZones = [];

    saveToLocalStorage();
    updateUndoRedoButtons();
    showSaveIndicator('↪ Redid');
    draw();
}

function updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;

    // Update tooltips
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    if (undoStack.length > 0) {
        undoBtn.title = 'Undo: ' + undoStack[undoStack.length - 1].description;
    } else {
        undoBtn.title = 'Nothing to undo';
    }
}

// Modify operations to save state first
// Example: delete operation
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === document.body) {
        e.preventDefault();

        const itemCount = selectedItems.length;
        const zoneCount = selectedZones.length;

        if (itemCount > 0 || zoneCount > 0) {
            // Save state before delete
            saveState(`Delete ${itemCount} item(s), ${zoneCount} zone(s)`);

            placedItems = placedItems.filter(i => !selectedItems.includes(i));
            zones = zones.filter(z => !selectedZones.includes(z));
            selectedItems = [];
            selectedZones = [];

            saveToLocalStorage();
            showSaveIndicator('✓ Deleted');
            draw();
        }
    }

    // Undo shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    }

    // Redo shortcut
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
    }
});

// HTML for undo/redo buttons (add to toolbar)
<button id="btn-undo" class="toolbar-btn" title="Undo (Ctrl+Z)" disabled>
    <svg><!-- undo icon --></svg>
</button>
<button id="btn-redo" class="toolbar-btn" title="Redo (Ctrl+Y)" disabled>
    <svg><!-- redo icon --></svg>
</button>
```

### Operations That Should Save State
1. Item placement (drop from sidebar)
2. Item deletion
3. Item move (on drag end)
4. Zone creation
5. Zone deletion
6. Zone resize
7. Zone move

### Files to Modify
- `index.html`: Add new state variables, modify all mutation operations, add toolbar buttons

### Complexity: Medium-High

---

## Pain Point 4: Canvas Stuck to Top-Left Corner

### Current State
- Canvas is positioned at start of flex container
- No centering when canvas is smaller than viewport
- Feels cramped and unbalanced
- When zoomed out, empty space is on bottom/right

### Proposed Solution

**A. Center Canvas in Container**
```css
#canvas-container {
    display: flex;
    justify-content: center;
    align-items: center;
    /* When canvas is larger, allow scrolling */
    overflow: auto;
}
```

**B. Dynamic Centering Logic**
- When canvas fits in viewport: center it
- When canvas exceeds viewport: allow scroll, start centered

**C. Background Pattern**
- Add subtle grid or dot pattern to container background
- Distinguishes canvas area from app background
- Professional CAD-like appearance

**D. Canvas Shadow/Border**
- Add subtle drop shadow to canvas
- Creates depth and visual separation

### Implementation Details

```css
/* Updated canvas container styles */
#canvas-container {
    flex: 1;
    overflow: auto;
    background: #e5e5e5;
    /* Subtle pattern background */
    background-image:
        radial-gradient(circle, #ccc 1px, transparent 1px);
    background-size: 20px 20px;

    /* Centering */
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 40px;
}

/* Canvas wrapper for centering when small */
#canvas-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100%;
}

#floor-canvas {
    background: white;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
}

/* When zoomed out, ensure minimum padding */
@media (min-width: 1200px) {
    #canvas-container {
        padding: 60px;
    }
}
```

```javascript
// Updated resize function
function resize() {
    const container = document.getElementById('canvas-container');
    const canvasWidth = (BUILDING.width * SCALE) + 40;
    const canvasHeight = (BUILDING.depth * SCALE) + 40;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Center canvas if smaller than container
    const containerWidth = container.clientWidth - 80; // minus padding
    const containerHeight = container.clientHeight - 80;

    if (canvasWidth < containerWidth && canvasHeight < containerHeight) {
        // Canvas fits, center it
        canvas.style.margin = 'auto';
    } else {
        // Canvas larger than container, align to allow scroll from center
        canvas.style.margin = '0';
    }

    draw();
}

// Scroll to center on initial load
function centerCanvasView() {
    const container = document.getElementById('canvas-container');
    const scrollX = (container.scrollWidth - container.clientWidth) / 2;
    const scrollY = (container.scrollHeight - container.clientHeight) / 2;
    container.scrollLeft = Math.max(0, scrollX);
    container.scrollTop = Math.max(0, scrollY);
}

// Call on load
window.addEventListener('load', () => {
    // ... existing init ...
    centerCanvasView();
});
```

### HTML Structure Update
```html
<div id="canvas-container">
    <div id="canvas-wrapper">
        <canvas id="floor-canvas"></canvas>
    </div>
</div>
```

### Files to Modify
- `index.html`: CSS section (around line 30-150), canvas container HTML, resize() function

### Complexity: Low

---

## Pain Point 5: Zoom is Too Fast/Sensitive

### Current State
- Button zoom: ±4 scale units per click (50% jumps)
- Scroll zoom: ±2 scale units per tick (25% jumps)
- At low zoom (SCALE=4), each step is 50% change
- No smooth/animated zoom transitions
- Zoom centers on canvas origin, not mouse position

### Proposed Solution

**A. Finer Zoom Increments**
```javascript
// New zoom steps (more granular)
const ZOOM_LEVELS = [4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32];
// Percentages: 50%, 62%, 75%, 87%, 100%, 125%, 150%, 175%, 200%, 250%, 300%, 350%, 400%
```

**B. Smooth Zoom Transitions**
- Animate scale changes over ~150ms
- Use requestAnimationFrame for smooth interpolation
- Prevents jarring visual jumps

**C. Zoom to Mouse Position**
- When using scroll wheel zoom, zoom toward cursor position
- Maintains spatial context during zoom
- Standard behavior in design tools

**D. Zoom Slider Control**
- Add a slider in addition to buttons
- Allows continuous zoom control
- Shows current zoom level

### Implementation Details

```javascript
// Zoom levels for stepped zoom
const ZOOM_LEVELS = [4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32];
let currentZoomIndex = ZOOM_LEVELS.indexOf(8); // Default 100%

function getNextZoomLevel(direction) {
    const newIndex = currentZoomIndex + direction;
    if (newIndex >= 0 && newIndex < ZOOM_LEVELS.length) {
        currentZoomIndex = newIndex;
        return ZOOM_LEVELS[currentZoomIndex];
    }
    return SCALE;
}

// Smooth zoom animation
let zoomAnimation = null;

function animateZoom(targetScale, centerX, centerY) {
    if (zoomAnimation) cancelAnimationFrame(zoomAnimation);

    const startScale = SCALE;
    const startTime = performance.now();
    const duration = 150; // ms

    const container = document.getElementById('canvas-container');
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);

        SCALE = startScale + (targetScale - startScale) * eased;

        // Resize canvas
        canvas.width = (BUILDING.width * SCALE) + 40;
        canvas.height = (BUILDING.depth * SCALE) + 40;

        // Adjust scroll to keep point under cursor
        if (centerX !== undefined && centerY !== undefined) {
            const scaleRatio = SCALE / startScale;
            const newScrollLeft = (startScrollLeft + centerX) * scaleRatio - centerX;
            const newScrollTop = (startScrollTop + centerY) * scaleRatio - centerY;
            container.scrollLeft = newScrollLeft;
            container.scrollTop = newScrollTop;
        }

        draw();
        updateZoomDisplay();

        if (progress < 1) {
            zoomAnimation = requestAnimationFrame(animate);
        } else {
            SCALE = targetScale;
            saveToLocalStorage();
            zoomAnimation = null;
        }
    }

    zoomAnimation = requestAnimationFrame(animate);
}

// Updated scroll wheel handler with mouse-centered zoom
document.getElementById('canvas-container').addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        // Get mouse position relative to container
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Determine zoom direction (invert deltaY for natural feel)
        const direction = e.deltaY < 0 ? 1 : -1;
        const targetScale = getNextZoomLevel(direction);

        if (targetScale !== SCALE) {
            animateZoom(targetScale, mouseX, mouseY);
        }
    }
}, { passive: false });

// Updated button handlers
document.getElementById('btn-zoom-in').onclick = () => {
    const targetScale = getNextZoomLevel(1);
    if (targetScale !== SCALE) {
        animateZoom(targetScale);
    }
};

document.getElementById('btn-zoom-out').onclick = () => {
    const targetScale = getNextZoomLevel(-1);
    if (targetScale !== SCALE) {
        animateZoom(targetScale);
    }
};

document.getElementById('btn-zoom-reset').onclick = () => {
    currentZoomIndex = ZOOM_LEVELS.indexOf(8);
    animateZoom(8);
};

// Zoom slider (optional enhancement)
// HTML: <input type="range" id="zoom-slider" min="0" max="12" value="4">
document.getElementById('zoom-slider').addEventListener('input', (e) => {
    currentZoomIndex = parseInt(e.target.value);
    animateZoom(ZOOM_LEVELS[currentZoomIndex]);
});
```

### Zoom Display Update
```javascript
function updateZoomDisplay() {
    const percentage = Math.round((SCALE / 8) * 100);
    document.getElementById('zoom-display').textContent = percentage + '%';

    // Update slider if present
    const slider = document.getElementById('zoom-slider');
    if (slider) {
        slider.value = ZOOM_LEVELS.indexOf(Math.round(SCALE));
    }
}
```

### Files to Modify
- `index.html`: Lines 452-453 (zoom constants), Lines 666-668 (zoom display), Lines 1420-1431 (zoom handlers)

### Complexity: Medium

---

## Implementation Priority & Dependencies

### Recommended Implementation Order

| Priority | Pain Point | Complexity | Dependencies |
|----------|-----------|------------|--------------|
| 1 | Canvas Centering (#4) | Low | None |
| 2 | Zoom Sensitivity (#5) | Medium | None |
| 3 | Drawing Mode Indicator (#1) | Low-Medium | None |
| 4 | Multi-Select (#2) | Medium | None |
| 5 | Undo/Redo (#3) | Medium-High | Pairs well with #2 |

### Rationale
1. **Canvas centering** is quick win with high visual impact
2. **Zoom fix** improves daily usability significantly
3. **Mode indicator** reduces confusion for new and existing users
4. **Multi-select** is highly requested feature, moderate effort
5. **Undo/redo** most complex but highest value for workflow

---

## Additional Recommendations

### Quick Wins (Not in Original List)
1. **Keyboard shortcuts legend**: Add `?` key to show shortcuts overlay
2. **Snap to grid toggle**: Allow toggling 0.5ft snap on/off
3. **Item duplication**: Ctrl+D to duplicate selected item
4. **Zoom percentage input**: Click on zoom display to type exact percentage

### Future Considerations
1. **Touch/tablet support**: Pinch-to-zoom, two-finger pan
2. **Item rotation**: 90-degree rotation support
3. **Layer management**: Send to back/bring to front
4. **Copy/paste between sessions**: Clipboard integration

---

## Testing Checklist

For each implemented feature:
- [ ] Works with keyboard navigation
- [ ] Works with mouse interactions
- [ ] State persists after refresh (localStorage)
- [ ] Works at all zoom levels
- [ ] No performance degradation with many items
- [ ] Visual feedback is clear and timely
- [ ] Mobile/touch fallback (if applicable)
