<p align="center">
  <img src="frontend/public/logo.png" alt="E2E Logo" width="120" />
</p>

<h1 align="center">E2E — End-to-End Encrypted File Sharing</h1>

<p align="center">
  A zero-knowledge, encrypted file sharing social platform designed for private communities on local networks.
</p>

---

## Purpose

Most file-sharing platforms store your data on centralized servers where the provider can read, scan, or hand over your files to third parties. **E2E** takes a fundamentally different approach.

E2E is built for **small communities, teams, families, or organizations** who want to share files with absolute certainty that:

- **No server administrator** can read their files
- **No third party** can intercept or decrypt their data
- **Files live on user devices**, not on a central server
- **Encryption happens in the browser** before data ever leaves the device

This is not a cloud service. It's a **self-hosted, LAN-first platform** where a group of people can share encrypted files, form connections, create groups, and interact through a social feed — all while maintaining true end-to-end encryption.

**Use cases:**
- A family sharing private photos and documents at home
- A small team collaborating with sensitive files on an office network
- A group of friends sharing media on a local network without trusting any cloud provider
- An organization that needs an air-gapped file sharing solution

---

## Technology Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ | Runtime environment |
| **Express** | 4.x | HTTP server & REST API |
| **Socket.IO** | 4.x | Real-time WebSocket communication for chunk routing |
| **Prisma** | 5.x | ORM for database operations |
| **SQLite** | — | Lightweight file-based database (zero setup) |
| **JSON Web Tokens** | — | Authentication (15-min access + 7-day refresh tokens) |
| **bcrypt** | — | Password hashing |
| **Helmet** | — | HTTP security headers |
| **express-rate-limit** | — | API rate limiting |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.x | React framework (Pages Router) |
| **React** | 19.x | UI library |
| **node-forge** | 1.x | RSA-OAEP 4096 & AES-256-GCM encryption (works over HTTP) |
| **Socket.IO Client** | 4.x | Real-time connection to backend |
| **IndexedDB** | Browser API | Local storage for encryption keys and file chunks |

### Why node-forge instead of Web Crypto API?
The browser's native `crypto.subtle` API is only available in **Secure Contexts** (HTTPS or localhost). Since E2E is designed to run on a **local network over HTTP** (e.g., `http://192.168.x.x:3000`), we use `node-forge` as a pure-JavaScript cryptography library that works in any context.

---

## Features

### File Management
- **Encrypted upload** — Files are encrypted client-side with AES-256-GCM before upload
- **Chunk-based storage** — Files are split into chunks and distributed to connected devices
- **Encrypted download** — Chunks are reassembled and decrypted in the browser
- **My Files** — View, download, share, and delete your uploaded files

### Social Platform
- **Feed** — A social feed showing shared files with previews (images, video, audio)
- **Connections** — Send and accept connection requests (like friends)
- **Groups** — Create groups, add members, share files within groups
- **Posts** — Share files with captions, set visibility (public, connections only, or group)
- **Comments & Likes** — Interact with shared posts

### Security
- **RSA-4096 key pairs** — Generated in-browser during signup
- **AES-256-GCM file encryption** — Each file gets a unique encryption key
- **Per-recipient key wrapping** — File keys are wrapped with each recipient's RSA public key
- **Zero-knowledge server** — Server never sees plaintext files, keys, or passwords
- **HTTP-only refresh tokens** — Secure session management with auto-refresh

---

## How Data Is Stored — In Depth

### The Encryption Flow

```
┌──────────────────────────────────────────────────────┐
│                   YOUR BROWSER                        │
│                                                       │
│  1. You select a file                                 │
│  2. A random AES-256-GCM key is generated            │
│  3. The file is encrypted with this key              │
│  4. Encrypted data is split into chunks              │
│  5. AES key is stored in IndexedDB (your device)     │
│  6. AES key is wrapped with YOUR RSA public key      │
│     and sent to server (for multi-device access)     │
│                                                       │
│  ┌─────────┐    AES-256-GCM    ┌─────────────┐      │
│  │ Raw File │ ───────────────► │ Ciphertext   │      │
│  └─────────┘                   └──────┬──────┘      │
│                                        │              │
│                              Split into chunks        │
│                                        │              │
└────────────────────────────────────────┼──────────────┘
                                         │
                                         ▼
                              ┌─────────────────┐
                              │  Socket.IO       │
                              │  (WebSocket)     │
                              └────────┬────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                     ┌────────┐  ┌────────┐  ┌────────┐
                     │Device 1│  │Device 2│  │Device 3│
                     │ IndexDB│  │ IndexDB│  │ IndexDB│
                     │Chunk 0 │  │Chunk 1 │  │Chunk 2 │
                     └────────┘  └────────┘  └────────┘
```

### What the Server Stores (SQLite Database)

The server's SQLite database contains **only metadata and encrypted key material**:

| Data | What's Stored | Can Server Read It? |
|---|---|---|
| **User account** | Username, bcrypt password hash, avatar ID | ❌ Password is hashed |
| **RSA Public Key** | User's public key (used by others to encrypt for you) | ✅ Public by design |
| **RSA Private Key** | Encrypted with your password via PBKDF2 | ❌ Useless without password |
| **File metadata** | File ID, name, size, chunk count, chunk map | ✅ Metadata only, no content |
| **File key shares** | AES key wrapped with recipient's RSA public key | ❌ Can only be unwrapped by recipient's private key |
| **Posts/comments/likes** | Social interactions | ✅ Social metadata |
| **Connections/groups** | Who's connected to whom | ✅ Social metadata |

### What the Server Does NOT Store

- ❌ Raw file data (not a single byte)
- ❌ Plaintext encryption keys
- ❌ Your password in plaintext
- ❌ Your private key in usable form
- ❌ Any decrypted file content
- ❌ File previews or thumbnails

### Where File Chunks Actually Live

File chunks are stored in **IndexedDB** inside the browsers of connected devices. The server acts only as a WebSocket relay — when a device needs a chunk, the server asks other connected devices for it.

```
Server (coordinator only)
  │
  ├── "Device A, do you have chunk 3 of file X?"
  │     └── Device A: "Yes, here it is" → encrypted chunk sent via WebSocket
  │
  └── Chunk is delivered to the requesting device
        └── Device decrypts locally with AES key from its own IndexedDB
```

**No file data touches the server's disk.** The server is a message broker, not a storage provider.

### Key Wrapping for Sharing

When you share a file with someone:

```
Your AES key for the file
        │
        ▼
Wrapped with recipient's RSA-4096 Public Key
        │
        ▼
Stored on server as FileKeyShare record
        │
        ▼
Recipient downloads the wrapped key
        │
        ▼
Unwraps with their RSA Private Key (in their browser)
        │
        ▼
Uses AES key to decrypt file chunks
```

Even if someone compromises the server database, they get RSA-encrypted blobs that are computationally infeasible to decrypt without the recipient's private key.

---

## Self-Hosting Guide

### Prerequisites
- **Node.js 18+** installed
- **npm** (comes with Node.js)
- A machine on your local network (a PC, Raspberry Pi, old laptop, etc.)

### Step 1: Clone the Repository

```bash
git clone https://github.com/starrvarse/end2end.git
cd end2end
```

### Step 2: Set Up the Backend

```bash
cd backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create/push database schema (creates SQLite file)
npx prisma db push

# Start the server
node server.js
```

The backend starts on **port 4000**.

### Step 3: Configure Environment

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-random-secret-here-make-it-long"
FRONTEND_ORIGIN="http://localhost:3000,http://YOUR_LOCAL_IP:3000"
```

Replace `YOUR_LOCAL_IP` with your machine's local IP (e.g., `192.168.1.100`).

**Finding your local IP:**
- **Windows:** `ipconfig` → Look for IPv4 Address
- **macOS/Linux:** `ifconfig` or `ip addr`

### Step 4: Set Up the Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Build for production
npm run build

# Start the production server
npm start
```

The frontend starts on **port 3000**.

### Step 5: Configure Frontend API URL

Create or edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://YOUR_LOCAL_IP:4000
```

### Step 6: Access from Devices

Open a browser on any device connected to the same network:

```
http://YOUR_LOCAL_IP:3000
```

Each person creates their own account, and RSA keys are generated in their browser automatically.

### Using PM2 (Recommended for Production)

For keeping the servers running permanently:

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd backend
pm2 start server.js --name "e2e-backend"

# Start frontend
cd ../frontend
pm2 start npm --name "e2e-frontend" -- start

# Save process list (auto-restart on reboot)
pm2 save
pm2 startup
```

**PM2 commands:**
```bash
pm2 list              # View running processes
pm2 logs              # View logs
pm2 restart all       # Restart all
pm2 stop all          # Stop all
```

---

## Security Analysis

### What Makes E2E Secure

| Layer | Protection |
|---|---|
| **Encryption Algorithm** | AES-256-GCM — military-grade symmetric encryption with authentication |
| **Key Exchange** | RSA-OAEP with 4096-bit keys — quantum-resistant key length |
| **Password Storage** | bcrypt with salt rounds — industry standard |
| **Key Derivation** | PBKDF2 — protects private key at rest |
| **Transport** | WebSocket on LAN — data never leaves your network |
| **Architecture** | Zero-knowledge — server mathematically cannot decrypt files |
| **Token Security** | HTTP-only cookies for refresh tokens, short-lived access tokens |
| **Rate Limiting** | express-rate-limit prevents brute force attacks |
| **Headers** | Helmet.js sets security headers |

### Attack Scenarios & Mitigations

| Attack | Result |
|---|---|
| **Server database stolen** | Attacker gets bcrypt hashes, encrypted private keys, and RSA-wrapped AES keys. Without user passwords, nothing is decryptable. |
| **Network traffic intercepted** | Attacker sees encrypted chunks. Without AES keys (stored in browser IndexedDB), chunks are random noise. |
| **Server admin goes rogue** | Admin can see metadata (file names, usernames) but cannot decrypt any file content. |
| **Physical access to a device** | If the browser is open and logged in, the attacker could access that session. Always log out on shared devices. |
| **Brute force password** | Rate limiting on the API. bcrypt is slow by design (~10 hashes/second). |

### Honest Limitations

- **Metadata is visible** — The server knows file names, sizes, who shared with whom, and social activity. Only file *contents* are encrypted.
- **No forward secrecy** — If a private key is compromised, all past files shared with that key can be decrypted.
- **HTTP on LAN** — Traffic on the local network is not encrypted in transit (use a reverse proxy with TLS for added security).
- **Browser storage is fragile** — Clearing browser data destroys keys and chunks permanently.

---

## ⚠️ Responsible Use

### How This Can Be Misused

Any encryption tool can be used for wrong purposes. The zero-knowledge design means:

- **Server operators cannot monitor** what files are being shared
- **File contents cannot be audited** or scanned
- **Shared material cannot be intercepted** even with full server access
- **Deleted evidence cannot be recovered** from encrypted chunks

### Our Request

This platform was built to **protect privacy**, not to enable harm. We strongly urge:

- ❌ **Do NOT** use this for sharing illegal content of any kind
- ❌ **Do NOT** use this for distributing copyrighted material without authorization
- ❌ **Do NOT** use this to evade lawful investigations
- ❌ **Do NOT** use this for harassment, exploitation, or any harmful purpose
- ✅ **DO** use this for sharing private family photos, work documents, personal media
- ✅ **DO** use this to protect sensitive business communications
- ✅ **DO** use this because you believe in your right to privacy

**Privacy is a right. Abuse is a choice. Choose wisely.**

If you're hosting this for a community, you are responsible for establishing acceptable use policies and ensuring your members use the platform ethically.

---

## Project Structure

```
end2end/
├── backend/
│   ├── server.js              # Express + Socket.IO entry point
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── routes/
│   │   ├── auth.js            # Login, signup, token refresh
│   │   ├── keys.js            # RSA key storage & retrieval
│   │   ├── upload.js          # Chunk upload endpoint
│   │   ├── merge.js           # Chunk merge coordination
│   │   ├── download.js        # Chunk download routing
│   │   ├── files.js           # File metadata & listing
│   │   ├── sharing.js         # File key sharing (AES key wrapping)
│   │   ├── connections.js     # Friend/connection management
│   │   ├── groups.js          # Group CRUD & membership
│   │   └── posts.js           # Social feed, comments, likes
│   └── utils/
│       └── fileHelpers.js     # Directory & file utilities
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── pages/
│   │   ├── login.js           # Sign in page
│   │   ├── signup.js          # Account creation + T&C
│   │   ├── feed.js            # Social feed
│   │   ├── upload.js          # File upload
│   │   ├── myfiles.js         # User's file management
│   │   ├── connections.js     # People & connection requests
│   │   ├── groups/
│   │   │   └── [id].js        # Group detail page
│   │   └── groups.js          # Groups listing
│   ├── components/
│   │   ├── Navbar.js          # Navigation (desktop + mobile)
│   │   ├── PostCard.js        # Feed post display
│   │   ├── ShareDialog.js     # File sharing modal
│   │   ├── MembersList.js     # Group members modal
│   │   └── AuthGuard.js       # Auth protection wrapper
│   ├── lib/
│   │   ├── authStore.js       # JWT auth, login, signup, authFetch
│   │   ├── crypto.js          # AES-256-GCM encrypt/decrypt
│   │   ├── keyManager.js      # RSA key generation & wrapping
│   │   ├── chunkStore.js      # IndexedDB chunk & key storage
│   │   ├── upload.js          # Chunked upload logic
│   │   └── useSocket.js       # Socket.IO hook & device registration
│   ├── styles/
│   │   └── globals.css        # All styles (CSS variables, responsive)
│   └── public/
│       └── logo.png           # App logo
└── README.md
```

---

## Quick Start (TL;DR)

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma db push
node server.js

# Frontend (new terminal)
cd frontend
npm install
npm run build
npm start
```

Open `http://localhost:3000` — create an account and start sharing.

---

## License

This project is for educational and personal use. Use responsibly.
