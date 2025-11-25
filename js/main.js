// --- 1. Setup & Globals ---
lucide.createIcons();

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const workspace = document.getElementById('workspace');
const sidebar = document.getElementById('sidebar');
const fileInput = document.getElementById('video-upload');
const videoSourceList = document.getElementById('video-source-list');
const noSourcesMessage = document.getElementById('no-sources-message');
const goLiveBtn = document.getElementById('go-live-btn');
const toggleUiBtn = document.getElementById('toggle-ui-btn');
const addSurfaceBtn = document.getElementById('add-surface-btn');

let surfaces = [];
let videoSources = []; // [{ id: string, name: string, element: HTMLVideoElement }]
let activePoint = null; 
let activeSurface = null; 
let isLive = false;
let previousWidth = 0;
let previousHeight = 0;


// --- 2. Surface Class (The Quad Shape) ---
class Surface {
    constructor(x, y, w, h, sourceId) {
        this.id = Date.now();
        this.sourceId = sourceId; // Reference to the video source
        // 4 Points: TL, TR, BR, BL
        this.points = [
            { x: x, y: y },         
            { x: x + w, y: y },     
            { x: x + w, y: y + h }, 
            { x: x, y: y + h }      
        ];
        this.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    }

    draw(ctx, isLive) {
        // Find the correct video element for this surface
        const source = videoSources.find(s => s.id === this.sourceId);
        const video = source ? source.element : null;

        // A. Create Path
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        this.points.forEach((p, i) => {
            if (i > 0) ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();

        // B. Draw Content (Video or Placeholder)
        ctx.save();
        ctx.clip(); // Limit drawing to inside the shape

        if (video && video.readyState >= 2) {
            // Simple bounding box mapping (Affine approximation)
            const minX = Math.min(...this.points.map(p => p.x));
            const maxX = Math.max(...this.points.map(p => p.x));
            const minY = Math.min(...this.points.map(p => p.y));
            const maxY = Math.max(...this.points.map(p => p.y));
            
            ctx.drawImage(video, minX, minY, maxX - minX, maxY - minY);
        } else {
            // Fallback color
            ctx.fillStyle = isLive ? '#000000' : this.color;
            ctx.fill();
            
            // Text label if not live
            if(!isLive) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = '14px sans-serif';
                const label = source ? source.name.substring(0, 15) : "MISSING VIDEO";
                ctx.fillText(`Source: ${label}`, this.points[0].x + 10, this.points[0].y + 20);
            }
        }
        ctx.restore();

        // C. Draw UI Handles (Editing Mode Only)
        if (!isLive) {
            // Outline
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke(new Path2D(ctx.currentPath));
            ctx.setLineDash([]);

            // Corners
            this.points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.stroke();
            });
        }
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
}

// --- 3. Interaction Logic & Resizing ---
function resize() {
    canvas.width = workspace.clientWidth;
    canvas.height = workspace.clientHeight;
}
window.addEventListener('resize', resize);
resize();

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

const handleStart = (e) => {
    if (isLive) return;
    const pos = getMousePos(e);
    
    for (let s of surfaces) {
        for (let p of s.points) {
            if (Math.hypot(p.x - pos.x, p.y - pos.y) < 15) {
                activePoint = p;
                activeSurface = s;
                return;
            }
        }
    }
};

const handleMove = (e) => {
    if (isLive || !activePoint) return;
    e.preventDefault(); 
    const pos = getMousePos(e);
    activePoint.x = pos.x;
    activePoint.y = pos.y;
};

const handleEnd = () => {
    activePoint = null;
    activeSurface = null;
};

const handleDoubleClick = (e) => {
    if (isLive) return;
    const pos = getMousePos(e);
    for (let i = surfaces.length - 1; i >= 0; i--) {
        if (surfaces[i].contains(pos.x, pos.y)) {
            surfaces.splice(i, 1);
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


// Scaling logic for fullscreen toggle
function scaleSurfaces(oldW, oldH, newW, newH) {
    if (oldW === 0 || oldH === 0 || (oldW === newW && oldH === newH)) return;

    const scaleX = newW / oldW;
    const scaleY = newH / oldH;
    
    surfaces.forEach(surface => {
        surface.points.forEach(p => {
            p.x *= scaleX;
            p.y *= scaleY;
        });
    });

    previousWidth = newW;
    previousHeight = newH;
}

function toggleLiveMode() {
    isLive = !isLive;
    if (isLive) {
        // --- GOING LIVE ---
        previousWidth = canvas.width;
        previousHeight = canvas.height;

        sidebar.classList.add('hidden-ui');
        workspace.classList.add('live-mode');
        
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().then(() => {
                scaleSurfaces(previousWidth, previousHeight, canvas.width, canvas.height);
            });
        }

    } else {
        // --- EXITING LIVE MODE ---
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                const newWidth = canvas.width;
                const newHeight = canvas.height;
                scaleSurfaces(previousWidth, previousHeight, newWidth, newHeight); 
            }).catch(err => {});
        }
        
        sidebar.classList.remove('hidden-ui');
        workspace.classList.remove('live-mode');
    }
}

goLiveBtn.addEventListener('click', toggleLiveMode);
toggleUiBtn.addEventListener('click', toggleLiveMode);

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && isLive) toggleLiveMode();
});


// --- 4. Multi-Video Source Management ---

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
        div.innerHTML = `
            <span class="source-name" title="${source.name}">${source.name}</span>
            <i data-lucide="video" class="w-4 h-4 text-green-400"></i>
        `;
        videoSourceList.appendChild(div);
        lucide.createIcons();
    });
}

fileInput.addEventListener('change', function(e) {
    const files = e.target.files;
    
    Array.from(files).forEach(file => {
        const fileURL = URL.createObjectURL(file);
        
        // Create a new hidden video element
        const videoElement = document.createElement('video');
        videoElement.src = fileURL;
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.playsInline = true;
        videoElement.style.display = 'none';
        
        // Start playing to ensure the video loads and loops correctly
        videoElement.play().catch(e => console.error("Video auto-play failed, usually due to browser policy:", e));

        const newSource = {
            id: crypto.randomUUID(), // Unique ID for referencing
            name: file.name,
            element: videoElement
        };

        // Add to global state and to the DOM (hidden)
        videoSources.push(newSource);
        document.body.appendChild(videoElement);
    });
    
    renderVideoSources();
    e.target.value = null; // Clear input
});


// --- 5. Add Surface with Source Selection ---

addSurfaceBtn.addEventListener('click', () => {
    if (videoSources.length === 0) {
        // Use custom modal instead of alert for better UX
        alert("Please upload at least one video source first!");
        return;
    }

    // 1. Create a prompt list of choices
    let promptMessage = "Select the video source for the new surface:\n";
    videoSources.forEach((source, index) => {
        promptMessage += `${index + 1}: ${source.name}\n`;
    });
    
    let selection;
    let selectedSource;

    // Use a loop to keep prompting until valid input or cancellation
    while (!selectedSource) {
        selection = prompt(promptMessage);

        if (selection === null) {
            // User cancelled
            return; 
        }

        const index = parseInt(selection) - 1;
        
        if (index >= 0 && index < videoSources.length) {
            selectedSource = videoSources[index];
        } else {
            alert("Invalid selection. Please enter the number corresponding to the video.");
        }
    }
    
    // 2. Create the new surface with the selected source ID
    const cx = canvas.width / 2 - 100;
    const cy = canvas.height / 2 - 100;
    surfaces.push(new Surface(cx, cy, 200, 200, selectedSource.id));
});


// --- 6. Initial Render & Loop ---
renderVideoSources();
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw calls now rely on the sourceId stored in the Surface object
    surfaces.forEach(surface => surface.draw(ctx, isLive));
    requestAnimationFrame(animate);
}
animate();

