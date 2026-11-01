const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  
  const cricketPath = path.resolve(__dirname, '../public/assets/icon/cricket.png');
  const cricketBase64 = fs.readFileSync(cricketPath).toString('base64');
  await page.setContent(`<img id="src" src="data:image/png;base64,${cricketBase64}">`);

  const icons = await page.evaluate(async () => {
    const src = document.getElementById('src');
    await src.decode();

    const w = 1024, h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw source artwork
    ctx.drawImage(src, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Dark navy gradient background calculator matching CricScorer Pro master artwork
    function getBgColor(x, y) {
      const t = y / 1023;
      let r, g, b;
      if (t < 0.25) {
        const u = t / 0.25;
        r = 16 * (1 - u) + 12 * u;
        g = 45 * (1 - u) + 38 * u;
        b = 83 * (1 - u) + 74 * u;
      } else if (t < 0.5) {
        const u = (t - 0.25) / 0.25;
        r = 12 * (1 - u) + 5 * u;
        g = 38 * (1 - u) + 26 * u;
        b = 74 * (1 - u) + 54 * u;
      } else if (t < 0.75) {
        const u = (t - 0.5) / 0.25;
        r = 5 * (1 - u) + 2 * u;
        g = 26 * (1 - u) + 18 * u;
        b = 54 * (1 - u) + 40 * u;
      } else {
        const u = (t - 0.75) / 0.25;
        r = 2 * (1 - u) + 0 * u;
        g = 18 * (1 - u) + 9 * u;
        b = 40 * (1 - u) + 22 * u;
      }

      // Ambient radial glow behind bat handle at top-center (512, 240)
      const dx = x - 512;
      const dy = y - 240;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 460) {
        const glowFactor = Math.pow((1 - dist / 460), 1.5) * 0.35;
        r += 12 * glowFactor;
        g += 30 * glowFactor;
        b += 60 * glowFactor;
      }

      return [
        Math.min(255, Math.round(r)),
        Math.min(255, Math.round(g)),
        Math.min(255, Math.round(b))
      ];
    }

    // Distance transform from transparent pixels
    const isTransparent = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] === 0) isTransparent[i] = 1;
    }

    const dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = isTransparent[i] ? 0 : 99999;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (dist[i] > 0) {
          if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
          if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1);
          if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - w - 1] + 1.414);
          if (x < w - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - w + 1] + 1.414);
        }
      }
    }

    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (dist[i] > 0) {
          if (x < w - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
          if (y < h - 1) dist[i] = Math.min(dist[i], dist[i + w] + 1);
          if (x < w - 1 && y < h - 1) dist[i] = Math.min(dist[i], dist[i + w + 1] + 1.414);
          if (x > 0 && y < h - 1) dist[i] = Math.min(dist[i], dist[i + w - 1] + 1.414);
        }
      }
    }

    // Blend:
    // d <= 42: replace with background gradient
    // 42 < d < 58: smooth cosine blend into artwork
    // d >= 58: 100% original artwork intact
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = dist[y * w + x];
        const [bgR, bgG, bgB] = getBgColor(x, y);

        if (d <= 42) {
          data[i] = bgR;
          data[i + 1] = bgG;
          data[i + 2] = bgB;
          data[i + 3] = 255;
        } else if (d < 58) {
          const t = (d - 42) / 16;
          const weight = 0.5 - 0.5 * Math.cos(t * Math.PI);
          data[i] = Math.round(bgR * (1 - weight) + data[i] * weight);
          data[i + 1] = Math.round(bgG * (1 - weight) + data[i + 1] * weight);
          data[i + 2] = Math.round(bgB * (1 - weight) + data[i + 2] * weight);
          data[i + 3] = 255;
        } else {
          data[i + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Render 180x180 standard Apple Touch Icon with high-quality downsampling
    const appleCanvas = document.createElement('canvas');
    appleCanvas.width = 180;
    appleCanvas.height = 180;
    const appleCtx = appleCanvas.getContext('2d');
    appleCtx.imageSmoothingEnabled = true;
    appleCtx.imageSmoothingQuality = 'high';
    appleCtx.drawImage(canvas, 0, 0, 180, 180);

    return {
      apple180: appleCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
      master1024: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
    };
  });

  const pubDir = path.resolve(__dirname, '../public');
  const assetIconDir = path.resolve(__dirname, '../public/assets/icon');

  fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), Buffer.from(icons.apple180, 'base64'));
  fs.writeFileSync(path.join(pubDir, 'apple-touch-icon-precomposed.png'), Buffer.from(icons.apple180, 'base64'));
  fs.writeFileSync(path.join(assetIconDir, 'apple-touch-icon.png'), Buffer.from(icons.apple180, 'base64'));

  console.log('Successfully generated:');
  console.log('- public/apple-touch-icon.png (180x180)');
  console.log('- public/apple-touch-icon-precomposed.png (180x180)');
  console.log('- public/assets/icon/apple-touch-icon.png (180x180)');

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
