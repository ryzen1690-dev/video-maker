// Video maker: runs fully in the browser. No API keys, no server cost.
const W = 720;
const H = 1280;
const MAX_SECONDS = 90;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

const scriptEl = document.getElementById('script');
const mediaEl = document.getElementById('media');
const musicEl = document.getElementById('music');
const makeBtn = document.getElementById('make');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const playerEl = document.getElementById('player');
const downloadEl = document.getElementById('download');
const topicEl = document.getElementById('topic');
const writeBtn = document.getElementById('write');
const stockEl = document.getElementById('stock');

const palettes = [
  ['#14213d', '#e63946'],
  ['#0b3954', '#bfd7ea'],
  ['#2d1e2f', '#f18f01'],
  ['#1b4332', '#95d5b2'],
  ['#3a0ca3', '#f72585']
];

function setStatus(text) {
  statusEl.textContent = text;
}

// ---------- Scenes ----------
function buildScenes(lines) {
  let t = 0;
  return lines.map((text) => {
    const words = text.split(/\s+/).length;
    const length = Math.min(8, Math.max(2.5, words * 0.45));
    const scene = { text, start: t, end: t + length };
    t += length;
    return scene;
  });
}

// ---------- Media loading ----------
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.onloadeddata = () => resolve(v);
    v.onerror = reject;
    v.src = url;
  });
}

async function loadMedia(files) {
  const items = [];
  for (const file of files) {
    try {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('image/')) items.push(await loadImage(url));
      else if (file.type.startsWith('video/')) items.push(await loadVideo(url));
    } catch (e) {
      console.warn('Could not load', file.name, e);
    }
  }
  return items;
}

// ---------- Drawing ----------
function drawCover(src, zoom) {
  const sw = src.videoWidth || src.naturalWidth;
  const sh = src.videoHeight || src.naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function wrapText(text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCaption(text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '800 60px Sora, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lines = wrapText(text, W - 120);
  const lineHeight = 78;
  const slide = (1 - alpha) * 30;
  let y = H * 0.62 - (lines.length * lineHeight) / 2 + slide;
  for (const line of lines) {
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, W / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
  ctx.restore();
}

function drawFrame(t, scenes, total, media) {
  let i = scenes.findIndex((s) => t < s.end);
  if (i < 0) i = scenes.length - 1;
  const scene = scenes[i];
  const progress = (t - scene.start) / (scene.end - scene.start);

  if (media.length) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawCover(media[i % media.length], 1 + progress * 0.08);
  } else {
    const [a, b] = palettes[i % palettes.length];
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, W, H);
  drawCaption(scene.text, Math.min(1, (t - scene.start) / 0.4));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W * Math.min(1, t / total), 8);
}

function drawIdle() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, palettes[0][0]);
  g.addColorStop(1, palettes[0][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 54px Sora, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Your video', W / 2, H / 2 - 30);
  ctx.fillText('appears here', W / 2, H / 2 + 40);
}

// ---------- Recording ----------
function pickMimeType() {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function makeVideo() {
  const lines = scriptEl.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    setStatus('Write at least one line first.');
    return;
  }
  const scenes = buildScenes(lines);
  const total = scenes[scenes.length - 1].end;
  if (total > MAX_SECONDS) {
    setStatus('This script makes a ' + Math.round(total) + 's video. Shorten it to stay under 90s.');
    return;
  }
  if (!window.MediaRecorder) {
    setStatus('This browser cannot record video. Use Chrome on a computer.');
    return;
  }

  makeBtn.disabled = true;
  resultEl.hidden = true;
  setStatus('Loading your media...');

  let media = await loadMedia([...mediaEl.files]);
  if (stockEl.checked && topicEl.value.trim()) {
    setStatus('Fetching stock clips...');
    try {
      media = media.concat(await loadStock(topicEl.value.trim(), lines.length));
    } catch (e) {
      console.warn(e);
      setStatus('Stock clips failed. Making the video without them...');
    }
  }
  await document.fonts.ready;

  const stream = canvas.captureStream(30);
  let audioEl = null;
  let audioCtx = null;
  if (musicEl.files[0]) {
    audioCtx = new AudioContext();
    audioEl = new Audio(URL.createObjectURL(musicEl.files[0]));
    audioEl.loop = true;
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 4000000 } : undefined
  );
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  recorder.onstop = () => {
    media.forEach((m) => m instanceof HTMLVideoElement && m.pause());
    if (audioEl) audioEl.pause();
    if (audioCtx) audioCtx.close();

    const type = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    playerEl.src = url;
    downloadEl.href = url;
    downloadEl.download = 'my-video.' + (type.includes('mp4') ? 'mp4' : 'webm');
    resultEl.hidden = false;
    makeBtn.disabled = false;
    setStatus('Done. Your ' + Math.round(total) + 's video is ready below.');
  };

  media.forEach((m) => m instanceof HTMLVideoElement && m.play().catch(() => {}));
  if (audioCtx) {
    await audioCtx.resume();
    audioEl.play().catch(() => {});
  }

  drawFrame(0, scenes, total, media);
  recorder.start();
  const startTime = performance.now();
  let lastShown = -1;

  function tick() {
    const t = Math.max(0, (performance.now() - startTime) / 1000);
    if (t >= total) {
      recorder.stop();
      return;
    }
    const left = Math.ceil(total - t);
    if (left !== lastShown) {
      lastShown = left;
      setStatus('Recording... keep this tab open (' + left + 's left)');
    }
    drawFrame(t, scenes, total, media);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

makeBtn.addEventListener('click', () => {
  makeVideo().catch((err) => {
    console.error(err);
    makeBtn.disabled = false;
    setStatus('Something went wrong. Try fewer or smaller files.');
  });
});

// ---------- AI script + stock clips (through the Cloudflare worker) ----------
async function loadStock(topic, count) {
  const res = await fetch('/api/clips?q=' + encodeURIComponent(topic) + '&n=' + Math.max(3, count));
  const data = await res.json();
  const clips = [];
  for (const url of data.urls || []) {
    try {
      const file = await fetch('/api/media?u=' + encodeURIComponent(url));
      const blob = await file.blob();
      clips.push(await loadVideo(URL.createObjectURL(blob)));
    } catch (e) {
      console.warn('Skipped a clip', e);
    }
  }
  return clips;
}

writeBtn.addEventListener('click', async () => {
  const topic = topicEl.value.trim();
  if (!topic) {
    setStatus('Type a topic first.');
    return;
  }
  writeBtn.disabled = true;
  setStatus('Writing your script...');
  try {
    const res = await fetch('/api/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    scriptEl.value = data.lines.join('\n');
    setStatus('Script ready. Edit it if you like, then press Make video.');
  } catch (err) {
    console.error(err);
    setStatus('Could not write the script: ' + err.message);
  }
  writeBtn.disabled = false;
});

drawIdle();
