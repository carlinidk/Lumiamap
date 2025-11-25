// --- 1. Setup & Globals ---
lucide.createIcons();

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const workspace = document.getElementById('workspace');
const sidebar = document.getElementById('sidebar');
const videoElement = document.getElementById('source-video');
const fileInput = document.getElementById('video-upload');
const videoStatus = document.getElementById('video-status');
const goLiveBtn = document.getElementById('go-live-btn');
const toggleUiBtn = document.getElementById('toggle-ui-btn');

let surfaces = [];      // Array to store our "Quad" shapes
let activePoint = null; // Point currently being dragged
let activeSurface = null; 
let isLive = false;     // State flag for Presentation Mode

// GLOBAL VARIABLES TO STORE DIMENSIONS BEFORE FULLSCREEN
let previousWidth = 0;
let previousHeight = 0;


// --- 2. Surface Class (The Quad Shape) ---
class Surface {
    constructor(x, y, w, h) {
        this.id = Date.now();
        // 4 Points: TL, TR, BR, BL
        this.points = [
            { x: x, y: y },         
            { x: x + w, y: y },     
            { x: x + w, y: y + h }, 
            { x: x, y: y + h }      
        ];
        this.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    }

    draw(ctx, video, isLive) {
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
            
            ctx.drawImage(video, minX, minY, maxX - minX, maxY - minX); // Fixed typo here (was maxX - minX)
        } else {
            // Fallback color
            ctx.fillStyle = isLive ? '#ffffff' : this.color;
            ctx.fill();
            
            // Text label if not live
            if(!isLive) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = '14px sans-serif';
                ctx.fillText("No Video", this.points[0].x + 10, this.points[0].y + 20);
            }
        }
        ctx.restore();

        // C. Draw UI Handles (Editing Mode Only)
        if (!isLive) {
            // Outline
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke(new Path2D(ctx.currentPath)); // Re-use path
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
        // Ray-casting algorithm for point in polygon
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

// --- 3. Interaction Logic ---
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

// Input Handlers
const handleStart = (e) => {
    if (isLive) return;
    const pos = getMousePos(e);
    
    // 1. Check for corner clicks (Resize)
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
    // Delete surface if clicked inside
    for (let i = surfaces.length - 1; i >= 0; i--) {
        if (surfaces[i].contains(pos.x, pos.y)) {
            surfaces.splice(i, 1);
            return;
        }
    }
};

// Attach Events
canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseup', handleEnd);
canvas.addEventListener('dblclick', handleDoubleClick);
canvas.addEventListener('touchstart', handleStart, {passive: false});
canvas.addEventListener('touchmove', handleMove, {passive: false});
canvas.addEventListener('touchend', handleEnd);

// --- 4. UI Controls ---

// Add Surface
document.getElementById('add-surface-btn').addEventListener('click', () => {
    const cx = canvas.width / 2 - 100;
    const cy = canvas.height / 2 - 100;
    surfaces.push(new Surface(cx, cy, 200, 200));
});

// Clear All
document.getElementById('clear-all-btn').addEventListener('click', () => {
    if(confirm("Delete all projection surfaces?")) surfaces = [];
});

// Video Upload
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fileURL = URL.createObjectURL(file);
    videoElement.src = fileURL;
    videoElement.play();
    videoStatus.innerText = file.name;
});

// Toggle Live Mode
function toggleLiveMode() {
    isLive = !isLive;
    if (isLive) {
        // --- GOING LIVE ---
        // 1. Store current non-fullscreen dimensions
        previousWidth = canvas.width;
        previousHeight = canvas.height;

        sidebar.classList.add('hidden-ui');
        workspace.classList.add('live-mode');
        
        // 2. Request Fullscreen (which triggers resize event)
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().then(() => {
                // Wait for the native resize event to fire (which updates canvas.width/height)
                // Then, scale the points based on the new dimensions
                scaleSurfaces(previousWidth, previousHeight, canvas.width, canvas.height);
            });
        }

    } else {
        // --- EXITING LIVE MODE ---
        // 1. Exit Fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                // Fullscreen exit also triggers a resize event naturally,
                // but we need to explicitly scale back based on the stored live dimensions
                // The resize() function updates canvas.width/height to the new window size
                const newWidth = canvas.width;
                const newHeight = canvas.height;
                scaleSurfaces(previousWidth, previousHeight, newWidth, newHeight); 
            }).catch(err => {}); // Ignore error if not fullscreen
        }
        
        sidebar.classList.remove('hidden-ui');
        workspace.classList.remove('live-mode');
    }
}

// Function to calculate and apply the scaling factor
function scaleSurfaces(oldW, oldH, newW, newH) {
    if (oldW === newW && oldH === newH) return; // No need to scale

    const scaleX = newW / oldW;
    const scaleY = newH / oldH;
    
    surfaces.forEach(surface => {
        surface.points.forEach(p => {
            p.x *= scaleX;
            p.y *= scaleY;
        });
    });

    // Update stored dimensions for the next toggle
    previousWidth = newW;
    previousHeight = newH;
}


goLiveBtn.addEventListener('click', toggleLiveMode);
toggleUiBtn.addEventListener('click', toggleLiveMode);

// Escape Key Support
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && isLive) toggleLiveMode();
});

// --- 5. Animation Loop ---
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    surfaces.forEach(surface => surface.draw(ctx, videoElement, isLive));
    requestAnimationFrame(animate);
}
animate();

