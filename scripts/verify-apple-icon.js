const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  
  const iconPath = path.resolve(__dirname, '../public/apple-touch-icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('FAIL: public/apple-touch-icon.png does not exist');
    process.exit(1);
  }

  const iconBase64 = fs.readFileSync(iconPath).toString('base64');
  await page.setContent(`<img id="icon" src="data:image/png;base64,${iconBase64}">`);

  const results = await page.evaluate(async () => {
    const icon = document.getElementById('icon');
    await icon.decode();

    const w = icon.naturalWidth;
    const h = icon.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(icon, 0, 0);

    const imgData = ctx.getImageData(0, 0, w, h).data;
    const totalPixels = w * h;

    let transparentCount = 0;
    let whiteBorderCount = 0; // white/near-white pixels on or near edges

    // Check every single pixel
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = imgData[i];
        const g = imgData[i+1];
        const b = imgData[i+2];
        const a = imgData[i+3];

        if (a < 255) {
          transparentCount++;
        }

        // Check if outer 10% margins have any white/near-white pixels (unintended white frame)
        const isOuter = (x < 15 || x >= w - 15 || y < 15 || y >= h - 15);
        if (isOuter && r > 200 && g > 200 && b > 200) {
          whiteBorderCount++;
        }
      }
    }

    // Sample the 4 corner pixels
    const corners = {
      topLeft: Array.from(ctx.getImageData(0, 0, 1, 1).data),
      topRight: Array.from(ctx.getImageData(w - 1, 0, 1, 1).data),
      bottomLeft: Array.from(ctx.getImageData(0, h - 1, 1, 1).data),
      bottomRight: Array.from(ctx.getImageData(w - 1, h - 1, 1, 1).data),
    };

    // Sample edge centers
    const edgeCenters = {
      top: Array.from(ctx.getImageData(Math.floor(w/2), 0, 1, 1).data),
      bottom: Array.from(ctx.getImageData(Math.floor(w/2), h - 1, 1, 1).data),
      left: Array.from(ctx.getImageData(0, Math.floor(h/2), 1, 1).data),
      right: Array.from(ctx.getImageData(w - 1, Math.floor(h/2), 1, 1).data),
    };

    // Verify center artwork content (bat, ball, typography)
    let batPixels = 0;
    let ballPixels = 0;
    let textPixels = 0;

    for (let y = 30; y < h - 30; y++) {
      for (let x = 30; x < w - 30; x++) {
        const i = (y * w + x) * 4;
        const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
        // Red ball
        if (r > 140 && g < 80 && b < 80) ballPixels++;
        // Bat wood
        if (r > 170 && g > 110 && b < 160) batPixels++;
        // White typography
        if (r > 210 && g > 210 && b > 210) textPixels++;
      }
    }

    return {
      width: w,
      height: h,
      totalPixels,
      transparentCount,
      whiteBorderCount,
      corners,
      edgeCenters,
      artwork: { batPixels, ballPixels, textPixels }
    };
  });

  console.log('Validation Results:');
  console.log(`- Dimensions: ${results.width}x${results.height} (Expected: 180x180)`);
  console.log(`- Transparent Pixels: ${results.transparentCount} (Expected: 0)`);
  console.log(`- White Border Pixels: ${results.whiteBorderCount} (Expected: 0)`);
  console.log(`- Corner Top-Left: rgba(${results.corners.topLeft.join(',')})`);
  console.log(`- Corner Top-Right: rgba(${results.corners.topRight.join(',')})`);
  console.log(`- Corner Bottom-Left: rgba(${results.corners.bottomLeft.join(',')})`);
  console.log(`- Corner Bottom-Right: rgba(${results.corners.bottomRight.join(',')})`);
  console.log(`- Artwork Detected: Bat=${results.artwork.batPixels}px, Ball=${results.artwork.ballPixels}px, Text=${results.artwork.textPixels}px`);

  const passed = results.width === 180 &&
                 results.height === 180 &&
                 results.transparentCount === 0 &&
                 results.whiteBorderCount === 0 &&
                 results.artwork.batPixels > 100 &&
                 results.artwork.ballPixels > 50 &&
                 results.artwork.textPixels > 50;

  if (passed) {
    console.log('\n[PASS] All Apple touch icon verification checks passed with 100% compliance!');
    await browser.close();
    process.exit(0);
  } else {
    console.error('\n[FAIL] Apple touch icon failed verification checks.');
    await browser.close();
    process.exit(1);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
