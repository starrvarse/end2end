# File Upload & Listing System

A chunk-based file upload system with **Express** backend and **Next.js** frontend, featuring simulated node distribution.

## Project Structure

```
end2end/
├── backend/           # Express API server
│   ├── server.js
│   ├── routes/
│   │   ├── upload.js  # POST /upload  — receive a chunk
│   │   ├── merge.js   # POST /merge   — merge chunks
│   │   ├── files.js   # GET  /files   — list files
│   │   └── nodes.js   # POST/GET /nodes — node distribution
│   └── utils/
│       └── fileHelpers.js
├── frontend/          # Next.js UI (Pages Router)
│   ├── pages/
│   │   └── index.js   # Upload page
│   ├── lib/
│   │   └── upload.js  # Chunk upload helper
│   └── styles/
│       └── globals.css
└── README.md
```

## Setup & Run

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Server starts at **http://localhost:4000**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App opens at **http://localhost:3000**

## API Endpoints

| Method | Endpoint  | Description                                |
| ------ | --------- | ------------------------------------------ |
| POST   | /upload   | Upload a single chunk (multipart/form-data)|
| POST   | /merge    | Merge all chunks into final file           |
| GET    | /files    | Get list of uploaded files                 |
| POST   | /nodes    | Register a new node `{ "name": "node-1" }` |
| GET    | /nodes    | List nodes and file assignments            |

## Node Distribution

When a new node is registered via `POST /nodes`, all uploaded files are redistributed across nodes using **round-robin** logic. This is a logical simulation only (no real P2P).

### Example

```bash
# Register nodes
curl -X POST http://localhost:4000/nodes -H "Content-Type: application/json" -d '{"name": "node-1"}'
curl -X POST http://localhost:4000/nodes -H "Content-Type: application/json" -d '{"name": "node-2"}'

# Check assignments
curl http://localhost:4000/nodes
```
