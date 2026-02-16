import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Directory paths
export const CHUNKS_DIR = path.join(ROOT, 'chunks');
export const STORAGE_DIR = path.join(ROOT, 'storage');
export const DATA_DIR = path.join(ROOT, 'data');
export const FILES_JSON = path.join(DATA_DIR, 'files.json');
export const NODES_JSON = path.join(DATA_DIR, 'nodes.json');

// Max file size: 100 MB
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Chunk size: 5 MB
export const CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Create required directories if they don't exist
 */
export function ensureDirs() {
  [CHUNKS_DIR, STORAGE_DIR, DATA_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Initialize files.json if it doesn't exist
  if (!fs.existsSync(FILES_JSON)) {
    fs.writeFileSync(FILES_JSON, JSON.stringify([], null, 2));
  }

  // Initialize nodes.json if it doesn't exist
  if (!fs.existsSync(NODES_JSON)) {
    fs.writeFileSync(NODES_JSON, JSON.stringify({ nodes: [], assignments: {} }, null, 2));
  }
}

/**
 * Read and parse a JSON file
 */
export function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Write data as JSON to a file
 */
export function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Format file size in human-readable form
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}
