// ============================================
// LuminaMap Pro - Enhanced Projection Mapping Tool
// ============================================

// --- Setup & Globals ---
lucide.createIcons();

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const workspace = document.getElementById('workspace');
const sidebar = document.getElementById('sidebar');
const fileInput = document.getElementById('video-upload');
const videoSourceList = document.getElementById('video-source-list');
const noSourcesMessage = document.getElementById('no-sources-message');
const surfaceList = document.getElementById('surface-list');
const surfaceCount = document.getElementById('surface-count');
const goLiveBtn = document.getElementById('go-live-btn');
const toggleUiBtn = document.getElementById('toggle-ui-btn');
const addSurfaceBtn = document.getElementById('add-surface-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const saveProjectBtn = document.getElementById('save-project-btn');
const loadProjectBtn = document.getElementById('load-project-btn');
const projectLoadInput = document.getElementById('project-load-input');
const showGridCheckbox = document.getElementById('show-grid');
const snapToGridCheckbox = document.getElementById('snap-to-grid');
const gridSizeInput = document.getElementById('grid-size');
const gridSizeValue = document.getElementById('grid-size-value');

// State
let surfaces = [];
let videoSources = [];
let activePoint = null;
let activeSurface = null;
let selectedSurface = null;
let isLive = false;
let uiVisible = true;
let showGrid = true;
let gridSize = 20;
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// --- Utility: Matrix Math for Perspective Transform ---
function perspectiveTransform(ctx, points, drawFn) {
    // This implements a basic perspective transform using matrix decomposition
    // For production, consider using a proper homography library
    
    const [tl, tr, br, bl] = points;
    
    // Calculate transform matrix
    const sx = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const sy = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    
    // Apply transform
    const dx = tl.x;
    const dy = tl.y;
    const a = (tr.x - tl.x) / sx;
    const b = (tr.y - tl.y) / sx;
    const c = (bl.x - tl.x) / sy;
    const d = (bl.y - tl.y) / sy;
    
    ctx.transform(a, b, c, d, dx, dy);
    
    drawFn(sx, sy);
    
    ctx.restore();
}

// --- Surface Class ---
class Surface {
    constructor(x, y, w, h, sourceId) {
        this.id = `surface_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.sourceId = sourceId;
        this.points = [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x + w, y: y + h },
            { x: x, y: y + h }
        ];
        this.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
        this.opacity = 1;
        this.brightness = 1;
        this.contrast = 1;
        this.feather = 0;
        this.blendMode = 'normal';
    }

    draw(ctx, isLive) {
        const source = videoSources.find(s => s.id === this.sourceId);
        const media = source ? source.element : null;

        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.globalCompositeOperation = this.blendMode;

        // Apply filters
        const filters = [];
        if (this.brightness !== 1) filters.push(`brightness(${this.brightness})`);
        if (this.contrast !== 1) filters.push(`contrast(${this.contrast})`);
        if (filters.length > 0) ctx.filter = filters.join(' ');

        // Draw the quad path
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        this.points.forEach((p, i) => {
            if (i > 0) ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();

        // Edge feathering
        if (this.feather > 0 && !isLive) {
            const gradient = ctx.createRadialGradient(
                (this.points[0].x + this.points[2].x) / 2,
                (this.points[0].y + this.points[2].y) / 2,
                0,
                (this.points[0].x + this.points[2].x) / 2,
                (this.points[0].y + this.points[2].y) / 2,
                Math.hypot(this.points[2].x - this.points[0].x, this.points[2].y - this.points[0].y) / 2
            );
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(1 - this.feather / 50, 'rgba(255,255,255,1)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            
            ctx.save();
            ctx.clip();
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.restore();
        }

        // Draw content
        if (media && (media.readyState >= 2 || media.complete)) {
            perspectiveTransform(ctx, this.points, (w, h) => {
                ctx.drawImage(media, 0, 0, w, h);
            });
        } else {
            ctx.fillStyle = isLive ? '#000000' : this.color + '40';
            ctx.fill();
            
            if (!isLive) {
                ctx.fillStyle = 'white';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                const centerX = (this.points[0].x + this.points[2].x) / 2;
                const centerY = (this.points[0].y + this.points[2].y) / 2;
                const label = source ? source.name.substring(0, 15) : "NO SOURCE";
                ctx.fillText(label, centerX, centerY);
            }
        }

        // Draw UI handles (edit mode only)
        if (!isLive) {
            ctx.strokeStyle = selectedSurface === this ? '#ef4444' : '#3b82f6';
            ctx.lineWidth = selectedSurface === this ? 3 : 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            this.points.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = selectedSurface === this ? '#ef4444' : '#3b82f6';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Point number
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i + 1, p.x, p.y);
            });
        }

        ctx.restore();
    }

    contains(x, y) {
        let inside = false;
        for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
            const xi = this.points[i].x, yi = this.points[i].y;
            const xj = this.points[j].x, yj = this.points[j].y;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    clone() {
        const clone = new Surface(0, 0, 0, 0, this.sourceId);
        clone.id = this.id;
        clone.points = this.points.map(p => ({...p}));
        clone.color = this.color;
        clone.opacity = this.opacity;
        clone.brightness = this.brightness;
        clone.contrast = this.contrast;
        clone.feather = this.feather;
        clone.blendMode = this.blendMode;
        return clone;
    }
}

// --- History Management ---
function saveState() {
    const state = surfaces.map(s => s.clone());
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
    else historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        surfaces = history[historyIndex].map(s => s.clone());
        renderSurfaceList();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        surfaces = history[historyIndex].map(s => s.clone());
        renderSurfaceList();
    }
}

// --- Canvas Setup ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- Grid Drawing ---
function drawGrid() {
    if (!showGrid || isLive) return;
    
    ctx.save();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    ctx.restore();
}

// --- Mouse/Touch Interaction ---
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { 
        x: clientX - rect.left, 
        y: clientY - rect.top 
    };
}

function snapToGrid(pos) {
    if (snapToGridCheckbox.checked) {
        return {
            x: Math.round(pos.x / gridSize) * gridSize,
            y: Math.round(pos.y / gridSize) * gridSize
        };
    }
    return pos;
}

const handleStart = (e) => {
    if (isLive) return;
    
    // Ignore if clicking on sidebar
    if (uiVisible) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const clickX = e.touches ? e.touches[0].clientX : e.clientX;
        if (clickX > sidebarRect.left) return;
    }
    
    let pos = getMousePos(e);
    
    // Check for point grab
    for (let s of surfaces) {
        for (let p of s.points) {
            if (Math.hypot(p.x - pos.x, p.y - pos.y) < 15) {
                activePoint = p;
                activeSurface = s;
                selectedSurface = s;
                renderSurfaceList();
                return;
            }
        }
    }
    
    // Check for surface selection
    for (let i = surfaces.length - 1; i >= 0; i--) {
        if (surfaces[i].contains(pos.x, pos.y)) {
            selectedSurface = surfaces[i];
            renderSurfaceList();
            return;
        }
    }
    
    selectedSurface = null;
    renderSurfaceList();
};

const handleMove = (e) => {
    if (isLive || !activePoint) return;
    e.preventDefault();
    
    let pos = getMousePos(e);
    pos = snapToGrid(pos);
    
    activePoint.x = pos.x;
    activePoint.y = pos.y;
};

const handleEnd = () => {
    if (activePoint) {
        saveState();
    }
    activePoint = null;
    activeSurface = null;
};

const handleDoubleClick = (e) => {
    if (isLive) return;
    const pos = getMousePos(e);
    
    for (let i = surfaces.length - 1; i >= 0; i--) {
        if (surfaces[i].contains(pos.x, pos.y)) {
            surfaces.splice(i, 1);
            selectedSurface = null;
            saveState();
            renderSurfaceList();
            return;
        }
    }
};

canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseup', handleEnd);
canvas.addEventListener('dblclick', handleDoubleClick);
canvas.addEventListener('touchstart', handleStart, {passive: false});
canvas.addEventListener('touchmove', handleMove, {passive: false});
canvas.addEventListener('touchend', handleEnd);

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Live mode toggle
    if (e.code === 'Space' && !e.target.matches('input, textarea, select')) {
        e.preventDefault();
        toggleLiveMode();
    }
    
    // Delete selected surface
    if (e.code === 'Delete' && selectedSurface && !isLive) {
        const index = surfaces.indexOf(selectedSurface);
        if (index > -1) {
            surfaces.splice(index, 1);
            selectedSurface = null;
            saveState();
            renderSurfaceList();
        }
    }
    
    // Undo/Redo
    if (e.ctrlKey || e.metaKey) {
        if (e.code === 'KeyZ' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if ((e.code === 'KeyY') || (e.code === 'KeyZ' && e.shiftKey)) {
            e.preventDefault();
            redo();
        }
    }
    
    // Nudge selected surface points
    if (selectedSurface && !isLive) {
        const nudge = e.shiftKey ? 10 : 1;
        let moved = false;
        
        switch(e.code) {
            case 'ArrowLeft':
                selectedSurface.points.forEach(p => p.x -= nudge);
                moved = true;
                break;
            case 'ArrowRight':
                selectedSurface.points.forEach(p => p.x += nudge);
                moved = true;
                break;
            case 'ArrowUp':
                selectedSurface.points.forEach(p => p.y -= nudge);
                moved = true;
                break;
            case 'ArrowDown':
                selectedSurface.points.forEach(p => p.y += nudge);
                moved = true;
                break;
        }
        
        if (moved) {
            e.preventDefault();
            saveState();
        }
    }
    
    // Escape to exit live mode
    if (e.code === 'Escape' && isLive) {
        toggleLiveMode();
    }
});

// --- UI Toggle ---
function toggleUI() {
    uiVisible = !uiVisible;
    sidebar.classList.toggle('hidden-ui', !uiVisible);
    
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');
    
    if (uiVisible) {
        eyeIcon.style.display = 'block';
        eyeOffIcon.style.display = 'none';
    } else {
        eyeIcon.style.display = 'none';
        eyeOffIcon.style.display = 'block';
    }
    
    lucide.createIcons();
}

toggleUiBtn.addEventListener('click', toggleUI);

// --- Live Mode Toggle ---
function toggleLiveMode() {
    isLive = !isLive;
    workspace.classList.toggle('live-mode', isLive);
    goLiveBtn.classList.toggle('active', isLive);
    
    const playIcon = document.getElementById('play-icon');
    const editIcon = document.getElementById('edit-icon');
    
    if (isLive) {
        playIcon.style.display = 'none';
        editIcon.style.display = 'block';
        goLiveBtn.title = 'Exit Live Mode (Space)';
    } else {
        playIcon.style.display = 'block';
        editIcon.style.display = 'none';
        goLiveBtn.title = 'Toggle Live Mode (Space)';
    }
    
    lucide.createIcons();
}

goLiveBtn.addEventListener('click', toggleLiveMode);

// --- Video/Image Source Management ---
function renderVideoSources() {
    videoSourceList.innerHTML = '';
    
    if (videoSources.length === 0) {
        noSourcesMessage.style.display = 'block';
        return;
    }
    
    noSourcesMessage.style.display = 'none';
    
    videoSources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'source-item';
        
        const icon = source.element.tagName === 'VIDEO' ? 'video' : 'image';
        
        div.innerHTML = `
            <span class="source-name" title="${source.name}">${source.name}</span>
            <i data-lucide="${icon}" class="w-4 h-4 text-green-400"></i>
        `;
        
        videoSourceList.appendChild(div);
    });
    
    lucide.createIcons();
}

fileInput.addEventListener('change', function(e) {
    const files = e.target.files;
    
    Array.from(files).forEach(file => {
        const fileURL = URL.createObjectURL(file);
        const isVideo = file.type.startsWith('video/');
        
        const element = document.createElement(isVideo ? 'video' : 'img');
        element.src = fileURL;
        
        if (isVideo) {
            element.loop = true;
            element.muted = true;
            element.playsInline = true;
            element.play().catch(e => console.warn("Auto-play prevented:", e));
        }
        
        element.style.display = 'none';
        
        const newSource = {
            id: crypto.randomUUID(),
            name: file.name,
            element: element,
            isVideo: isVideo
        };
        
        videoSources.push(newSource);
        document.body.appendChild(element);
    });
    
    renderVideoSources();
    e.target.value = null;
});

// --- Surface Management ---
function renderSurfaceList() {
    surfaceCount.textContent = surfaces.length;
    surfaceList.innerHTML = '';
    
    if (surfaces.length === 0) {
        surfaceList.innerHTML = '<p class="text-xs text-gray-500">Add a surface to begin mapping.</p>';
        return;
    }
    
    surfaces.forEach((surface, index) => {
        const source = videoSources.find(s => s.id === surface.sourceId);
        const sourceName = source ? source.name : 'No Source';
        
        const div = document.createElement('div');
        div.className = 'surface-item';
        if (surface === selectedSurface) div.classList.add('selected');
        
        div.innerHTML = `
            <div class="surface-color-indicator" style="background-color: ${surface.color}"></div>
            <div class="surface-item-info">
                <div class="surface-item-name">Surface ${index + 1}</div>
                <div class="surface-item-source">${sourceName}</div>
            </div>
            <div class="surface-item-actions">
                <button class="surface-action-btn" title="Properties" data-action="properties">
                    <i data-lucide="settings" class="w-4 h-4"></i>
                </button>
                <button class="surface-action-btn" title="Delete" data-action="delete">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.surface-action-btn')) {
                selectedSurface = surface;
                renderSurfaceList();
            }
        });
        
        div.querySelector('[data-action="properties"]').addEventListener('click', (e) => {
            e.stopPropagation();
            openPropertiesModal(surface);
        });
        
        div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            surfaces.splice(surfaces.indexOf(surface), 1);
            if (selectedSurface === surface) selectedSurface = null;
            saveState();
            renderSurfaceList();
        });
        
        surfaceList.appendChild(div);
    });
    
    lucide.createIcons();
}

// --- Source Selection Modal ---
function openSourceModal(callback) {
    if (videoSources.length === 0) {
        alert("Please upload at least one media source first!");
        return;
    }
    
    const modal = document.getElementById('source-modal');
    const grid = document.getElementById('source-selection-grid');
    
    grid.innerHTML = '';
    
    videoSources.forEach(source => {
        const card = document.createElement('div');
        card.className = 'source-card';
        
        const preview = source.element.cloneNode(true);
        preview.style.display = 'block';
        preview.muted = true;
        if (source.isVideo) preview.play().catch(() => {});
        
        card.appendChild(preview);
        
        const label = document.createElement('div');
        label.className = 'source-card-label';
        label.textContent = source.name;
        card.appendChild(label);
        
        card.addEventListener('click', () => {
            callback(source.id);
            closeSourceModal();
        });
        
        grid.appendChild(card);
    });
    
    modal.classList.add('active');
    lucide.createIcons();
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.remove('active');
}

addSurfaceBtn.addEventListener('click', () => {
    openSourceModal((sourceId) => {
        const cx = canvas.width / 2 - 150;
        const cy = canvas.height / 2 - 100;
        surfaces.push(new Surface(cx, cy, 300, 200, sourceId));
        saveState();
        renderSurfaceList();
    });
});

// --- Properties Modal ---
function openPropertiesModal(surface) {
    selectedSurface = surface;
    renderSurfaceList();
    
    const modal = document.getElementById('properties-modal');
    
    // Set current values
    document.getElementById('surface-opacity').value = surface.opacity * 100;
    document.getElementById('opacity-value').textContent = Math.round(surface.opacity * 100);
    
    document.getElementById('surface-brightness').value = surface.brightness * 100;
    document.getElementById('brightness-value').textContent = Math.round(surface.brightness * 100);
    
    document.getElementById('surface-contrast').value = surface.contrast * 100;
    document.getElementById('contrast-value').textContent = Math.round(surface.contrast * 100);
    
    document.getElementById('surface-feather').value = surface.feather;
    document.getElementById('feather-value').textContent = surface.feather;
    
    document.getElementById('blend-mode').value = surface.blendMode;
    
    // Event listeners for real-time updates
    const opacityInput = document.getElementById('surface-opacity');
    opacityInput.oninput = () => {
        surface.opacity = opacityInput.value / 100;
        document.getElementById('opacity-value').textContent = opacityInput.value;
    };
    opacityInput.onchange = () => saveState();
    
    const brightnessInput = document.getElementById('surface-brightness');
    brightnessInput.oninput = () => {
        surface.brightness = brightnessInput.value / 100;
        document.getElementById('brightness-value').textContent = brightnessInput.value;
    };
    brightnessInput.onchange = () => saveState();
    
    const contrastInput = document.getElementById('surface-contrast');
    contrastInput.oninput = () => {
        surface.contrast = contrastInput.value / 100;
        document.getElementById('contrast-value').textContent = contrastInput.value;
    };
    contrastInput.onchange = () => saveState();
    
    const featherInput = document.getElementById('surface-feather');
    featherInput.oninput = () => {
        surface.feather = parseFloat(featherInput.value);
        document.getElementById('feather-value').textContent = featherInput.value;
    };
    featherInput.onchange = () => saveState();
    
    const blendModeSelect = document.getElementById('blend-mode');
    blendModeSelect.onchange = () => {
        surface.blendMode = blendModeSelect.value;
        saveState();
    };
    
    // Change source button
    document.getElementById('change-source-btn').onclick = () => {
        closePropertiesModal();
        openSourceModal((sourceId) => {
            surface.sourceId = sourceId;
            saveState();
            renderSurfaceList();
        });
    };
    
    modal.classList.add('active');
}

function closePropertiesModal() {
    document.getElementById('properties-modal').classList.remove('active');
}

window.closeSourceModal = closeSourceModal;
window.closePropertiesModal = closePropertiesModal;

// --- Grid Controls ---
showGridCheckbox.addEventListener('change', () => {
    showGrid = showGridCheckbox.checked;
});

gridSizeInput.addEventListener('input', () => {
    gridSize = parseInt(gridSizeInput.value);
    gridSizeValue.textContent = gridSize;
});

// --- Project Management ---
function exportProject() {
    const project = {
        version: '2.0',
        surfaces: surfaces.map(s => ({
            id: s.id,
            sourceId: s.sourceId,
            points: s.points,
            color: s.color,
            opacity: s.opacity,
            brightness: s.brightness,
            contrast: s.contrast,
            feather: s.feather,
            blendMode: s.blendMode
        })),
        sources: videoSources.map(s => ({
            id: s.id,
            name: s.name,
            isVideo: s.isVideo
        }))
    };
    
    const blob = new Blob([JSON.stringify(project, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lumina_project_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importProject(json) {
    try {
        const project = JSON.parse(json);
        
        // Note: This won't restore the actual video files, only the configuration
        // Users will need to re-upload media and match by name
        
        surfaces = project.surfaces.map(s => {
            const surface = new Surface(0, 0, 0, 0, s.sourceId);
            Object.assign(surface, s);
            return surface;
        });
        
        selectedSurface = null;
        saveState();
        renderSurfaceList();
        
        alert('Project loaded! Note: You may need to re-upload media files.');
    } catch (e) {
        alert('Error loading project: ' + e.message);
    }
}

saveProjectBtn.addEventListener('click', exportProject);

loadProjectBtn.addEventListener('click', () => {
    projectLoadInput.click();
});

projectLoadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => importProject(e.target.result);
        reader.readAsText(file);
    }
    e.target.value = null;
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all surfaces?')) {
        surfaces = [];
        selectedSurface = null;
        saveState();
        renderSurfaceList();
    }
});

// --- Animation Loop ---
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawGrid();
    
    surfaces.forEach(surface => surface.draw(ctx, isLive));
    
    requestAnimationFrame(animate);
}

// --- Initialize ---
renderVideoSources();
renderSurfaceList();
saveState(); // Initial state
animate();
