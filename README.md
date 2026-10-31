# Resistor Band Reader

A single-file, browser-based resistor color-band reader. Open `index.html` on a secure site, point a camera at a horizontal resistor, capture a frame, and check the proposed colors and calculated resistance.

## Use

1. Select **Start camera**, place the resistor horizontally in the guide, and choose **Capture & scan**. You can also upload a photo.
2. Select **4 bands** or **5 bands**.
3. Verify the color menus from left to right. Use **Reverse order** if needed. Tap a band in the captured image to assign a sampled color to a band position.
4. Read the value and tolerance.

Camera access requires HTTPS or localhost. GitHub Pages provides HTTPS. Photos are processed in the browser and are never uploaded.

## Publish with GitHub Pages

In this repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then select **main** and **/(root)**. Save and wait for GitHub to show the site URL.

## Accuracy

Automatic scanning is a simple pixel-color estimate and works best with a sharply focused, horizontal resistor in even light. Similar colors, shadows, glossy bands, and gold/silver can be misread. Always verify the suggested colors against the actual resistor before relying on the value.
