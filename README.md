# Resistor Band Reader

A browser-based resistor color-band reader. It runs entirely on the device and has no runtime dependencies or image uploads.

## Use

Serve this repository over HTTPS or localhost. For local development, run `python -m http.server 8000` and open `http://localhost:8000`. Camera access needs a secure context; opening `index.html` directly as a file is not supported by the JavaScript modules.

1. Choose **3**, **4**, **5**, or **6** bands.
2. Start the camera and hold a horizontal resistor in the guide, or upload a photo. Live results appear only after several matching frames. **Capture & scan** freezes a camera frame and releases the camera.
3. For a captured or uploaded image, use **Mark resistor ends** and tap both ends of the colored body if the default horizontal scan misses it. You can then select a band number and tap its center to sample a color.
4. Check every proposed color and the reading direction. Use the menus and **Reverse order** to correct the reading. Gold, silver, and other ambiguous colors may need manual selection.

The result shows the nominal resistance, tolerance range, and a calculation for each band. Three-band resistors use the standard ±20% tolerance because they have no tolerance band. Six-band resistors also show the temperature coefficient.

## Accuracy and limits

The scanner analyzes pixel colors along the resistor body. Shadows, glare, focus, coating color, and metallic bands can make colors indistinguishable in an RGB image. It leaves uncertain colors unresolved and shows no resistance until the band code is valid. Confirm the bands against the physical resistor before relying on the value. The live guide expects a horizontal resistor; marking the body ends supports other angles in a still image. Automatic direction selection occurs only when the band roles or spacing resolve it.

Color code and temperature-coefficient values follow [Vishay's resistor color-code chart](https://www.vishay.com/docs/20143/colorcod.pdf).

## Test

Run `node --test test.mjs` for calculation, direction, and synthetic image checks. Browser camera permission and detection under real lighting must be tested with a physical camera and resistors.

## Publish with GitHub Pages

In repository **Settings → Pages**, select **Deploy from a branch**, **main**, and **/(root)**. GitHub Pages provides HTTPS.
