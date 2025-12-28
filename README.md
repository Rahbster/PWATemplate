# PWA Template Project

A lightweight, vanilla JavaScript Progressive Web App (PWA) template featuring a peer-to-peer WebRTC connection.

## Architecture

*   **Pattern**: A simple, modular structure using vanilla JavaScript.
*   **Styling**: CSS Custom Properties (Variables) for easy theming (Light/Dark mode).
*   **PWA**: Fully offline-capable with a Service Worker and Manifest.
*   **Peer Connection**: Uses WebRTC for direct peer-to-peer data channels. Signaling is handled via `localStorage` for same-browser/cross-tab demonstration.

## Directory Structure

*   `index.html`: Main entry point.
*   `css/styles.css`: Global styles and theme variables.
*   `css/peer.css`: Styles for the WebRTC connection UI.
*   `js/app.js`: Main application logic, navigation, and theme management.
*   `js/peer.js`: Handles WebRTC connection logic, signaling, and UI interaction for the peer view.
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