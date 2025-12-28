# PWA Template Project

A lightweight, vanilla JavaScript Progressive Web App (PWA) template featuring a peer-to-peer WebRTC connection.

## Architecture

*   **Pattern**: A simple, modular structure using vanilla JavaScript.
*   **Styling**: CSS Custom Properties (Variables) for easy theming (Light/Dark mode).
*   **PWA**: Fully offline-capable with a Service Worker and Manifest.
*   **Peer Connection**: Uses a hybrid model. **PeerJS** is used for robust signaling and connection brokering. The actual data is sent over a **native WebRTC Data Channel** for maximum performance and control.

## Directory Structure

*   `index.html`: Main entry point.
*   `css/styles.css`: Global styles and theme variables.
*   `css/peer.css`: Styles for the WebRTC connection UI.
*   `js/app.js`: Main application logic, navigation, and theme management.
*   `js/peer.js`: Handles WebRTC connection logic, signaling, and UI interaction for the peer view.
*   `js/peerjs.min.js`: The PeerJS library for signaling.
*   `sw.js`: Service Worker for caching and offline support.
*   `manifest.json`: Web App Manifest.
*   `assets/`: Contains application icons and other static assets.

## Getting Started

1.  Clone or copy this repository.
2.  Serve the root directory using a local web server (e.g., Live Server extension in VS Code).
3.  Open two instances of the application (e.g., in two separate browser tabs) to test the peer connection.

## Key Features Included

*   **Peer-to-Peer Connection**: Establish a WebRTC data channel between two peers using a simple Host/Joiner model with a 6-digit code.
*   **Simple Navigation**: Tab-based navigation between views.
*   **Theme Toggle**: Built-in support for Light/Dark modes, persisting the user's choice.
*   **Offline Ready**: A pre-configured Service Worker caches core application files for offline use.

## Recommended Next Steps

To turn this template into a production-ready application, consider the following:

1.  **Generate Assets**: Replace the placeholder icons in `assets/icons/` with your own branding.
2.  **Update Manifest**: Edit `manifest.json` to reflect your app's name, description, and theme colors.
3.  **Production Signaling**: The current setup uses the public PeerJS cloud server. For production, deploy your own PeerJS Server or use a paid TURN provider to ensure reliable connections through firewalls.
4.  **Hosting**: Deploy your PWA to a static host like GitHub Pages, Netlify, or Vercel. Ensure HTTPS is enabled (required for Service Workers and WebRTC).
5.  **Lighthouse Audit**: Run a Google Lighthouse audit in Chrome DevTools to verify PWA installability and performance.