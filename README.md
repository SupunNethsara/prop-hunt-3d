# 📦🕵️ Athal Prop Hunt 3D (Multiplayer Live Action Game)

An action-packed, fast-paced **3D Multiplayer Prop Hunt (Hide & Seek)** browser game built with **Three.js** and **Socket.io**. Play with friends in real-time, disguise as inanimate 3D objects, taunt the hunter, and earn **Free AI-Generated Secret Agent Trophies & Digital Gifts** for every victory!

---

## 🎮 Game Concept & Mechanics

* **Two Roles:**
  * **Hiders (Disguised Props):** Transform into 3D objects (Cardboard Box 📦, Office Chair 🪑, Potted Plant 🪴, Wooden Barrel 🛢️, Trash Can 🗑️, Giant Watermelon 🍉, Rubber Tire 🛞, Toilet 🚽). Blend into the 3D room, hit **Lock/Freeze (`F` or `L`)** to freeze your prop rotation and blend with the environment.
  * **The Hunter (Ace Detective):** Equipped with a scanner blaster. Find sneaky props! If you hit a real player prop, they take heavy damage. If you spam-shoot innocent static props, you lose scanner health!
* **Hilarious Taunts:** Hiders can trigger 5 audio taunts (Whistle, Duck Quack, Tuk-Tuk Horn, Fart, Laugh) which emit 3D sound waves on the map to confuse or tease the hunter!
* **User Accounts & Agent Vault:** Sign up / Login, keep track of your match wins, hunter kills, and collect unlocked digital gifts.
* **🎁 Free API Winner Gifts:**
  * Powered by **Pollinations.ai** (100% Free, zero API key required, unlimited high-res image generation).
  * Automatically crafts a personalized **Secret Agent Master of Disguise Trophy** or **Ace Hunter Cyberpunk Badge** with your username stamped on it!
  * Directly view and download in high-definition (HD) or showcase in your **Agent Vault**.

---

## 🕹️ Controls

| Action | Key / Control |
|---|---|
| **Move** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Look / Aim** | Mouse (Click canvas to enable Pointer Lock) |
| **Jump** | `Spacebar` |
| **Lock / Freeze Prop** | `F` or `L` key (Locks prop angle so you can freely orbit camera) |
| **Fire Scanner Blaster (Hunter)** | `Left Mouse Click` |
| **Quick Taunt (Prop)** | `T` key (or click the Taunt buttons on the HUD) |
| **In-Game Chat** | Click Chat input, type and hit `Enter` |

---

## 🚀 Running Locally

1. Open your terminal in this project folder:
   ```bash
   cd "C:\Users\Kavisha\Documents\Clone Projects\prop-hunt-3d"
   ```

2. Start the game server:
   ```bash
   npm start
   ```

3. Open your browser:
   ```
   http://localhost:3000
   ```

4. Open multiple browser tabs or invite friends on your local Wi-Fi / LAN to test multiplayer action simultaneously!

---

## 🌐 100% FREE Deployment Guide (Render.com)

You can host this entire game online for **100% free** so your friends anywhere in the world can play via a live link:

### Deploying to Render.com (Recommended - 2 Minutes):
1. Push this project to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of 3D Prop Hunt"
   git remote add origin https://github.com/YOUR_USERNAME/prop-hunt-3d.git
   git push -u origin main
   ```
2. Go to [Render.com](https://render.com) (Create a free account).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Set:
   * **Environment:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free`
6. Click **Create Web Service**. Within 1 minute, you will get a live HTTPS URL (e.g., `https://prop-hunt-3d.onrender.com`) to share with friends!

---

## 🛠️ Tech Architecture

* **Frontend:** Three.js (WebGL 3D Rendering, Procedural 3D Models, Dynamic Lighting & Shadows, Custom Third/First Person Camera Controller)
* **Audio:** Web Audio API Sound Synthesizer (Instant 0-delay sound effects with zero external audio assets)
* **Realtime Sync:** Socket.io (Low-latency player transforms, hit detection, taunt soundwaves)
* **Backend:** Node.js + Express
* **Database & Auth:** Persistent JSON storage with bcryptjs password hashing
* **Rewards API:** Pollinations.ai Free Generative AI endpoint
