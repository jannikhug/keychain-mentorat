# Keychain Portfolio

An interactive 3D portfolio website featuring an animated keychain built with Three.js. The keychain responds to mouse movement and scroll events, with physics simulation for pendant interactions and a drag mechanic to hang the key on a nail.

**Live features:**
- 3D keychain model with mouse-tracking rotation and floating animation
- Scroll-driven animations (rotation, physics activation)
- Rapier physics simulation for realistic pendant movement
- Drag-and-drop interaction to hang the keychain on a nail
- Smooth scroll with Lenis and GSAP-powered transitions

**Tech stack:** Three.js, GSAP, Rapier3D, Lenis, Vite

---

## Setup

**Prerequisites:** [Node.js](https://nodejs.org) (v18 or later)

### Install dependencies

```bash
npm install
```

### Start development server

```bash
npx vite
```

The site is available at `http://localhost:5173`.

### Build for production

```bash
npx vite build
```

The output is placed in the `dist/` folder.