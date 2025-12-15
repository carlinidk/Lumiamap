// js/projection-features.js
const ProjectionFeatures = (() => {
  const state = {
    canvas: null,
    ctx: null,
    videos: {},
    grid: { rows: 2, cols: 3, gutter: 6 },
    running: true
  };

  function init({ canvasSelector = "#projection-canvas" } = {}) {
    state.canvas = document.querySelector(canvasSelector);
    state.ctx = state.canvas.getContext("2d");
    startRenderLoop();
  }

  function setGrid(rows, cols) {
    state.grid.rows = rows;
    state.grid.cols = cols;
  }

  function addVideo(src) {
    const id = "vid_" + Date.now();
    const video = document.createElement("video");
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.play();

    state.videos[id] = {
      el: video,
      effects: {
        brightness: 1,
        contrast: 1,
        saturate: 1,
        opacity: 1,
        rotation: 0,
        scale: 1
      },
      cells: []
    };

    return id;
  }

  function removeVideo(id) {
    if (!state.videos[id]) return;
    state.videos[id].el.pause();
    delete state.videos[id];
  }

  function assignToCell(videoId, cellIndex) {
    if (!state.videos[videoId]) return;
    if (!state.videos[videoId].cells.includes(cellIndex)) {
      state.videos[videoId].cells.push(cellIndex);
    }
  }

  function draw() {
    const { canvas, ctx } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cellW =
      (canvas.width - (state.grid.cols - 1) * state.grid.gutter) /
      state.grid.cols;
    const cellH =
      (canvas.height - (state.grid.rows - 1) * state.grid.gutter) /
      state.grid.rows;

    Object.values(state.videos).forEach(v => {
      if (v.el.readyState < 2) return;

      v.cells.forEach(i => {
        const r = Math.floor(i / state.grid.cols);
        const c = i % state.grid.cols;

        const x = c * (cellW + state.grid.gutter);
        const y = r * (cellH + state.grid.gutter);

        ctx.save();
        ctx.globalAlpha = v.effects.opacity;
        ctx.filter = `
          brightness(${v.effects.brightness})
          contrast(${v.effects.contrast})
          saturate(${v.effects.saturate})
        `;
        ctx.translate(x + cellW / 2, y + cellH / 2);
        ctx.rotate((v.effects.rotation * Math.PI) / 180);
        ctx.scale(v.effects.scale, v.effects.scale);
        ctx.drawImage(v.el, -cellW / 2, -cellH / 2, cellW, cellH);
        ctx.restore();
      });
    });
  }

  function startRenderLoop() {
    function loop() {
      if (!state.running) return;
      draw();
      requestAnimationFrame(loop);
    }
    loop();
  }

  return {
    init,
    addVideo,
    removeVideo,
    assignToCell,
    setGrid
  };
})();
