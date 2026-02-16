import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
    FILES_JSON,
    NODES_JSON,
    STORAGE_DIR,
    readJSON,
    writeJSON,
} from '../utils/fileHelpers.js';

const router = Router();

/**
 * POST /nodes
 * Register a new node and physically redistribute all files across nodes
 * Body: { name: "node-1" }
 */
router.post('/', (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Node name is required' });
        }

        const nodesData = readJSON(NODES_JSON) || { nodes: [], assignments: {} };

        // Check for duplicate node name
        if (nodesData.nodes.some((n) => n.name === name.trim())) {
            return res.status(409).json({ error: `Node "${name}" already exists` });
        }

        // Add new node
        nodesData.nodes.push({
            name: name.trim(),
            joinedAt: new Date().toISOString(),
        });

        // Create the new node's storage folder
        const newNodeDir = path.join(STORAGE_DIR, name.trim());
        if (!fs.existsSync(newNodeDir)) {
            fs.mkdirSync(newNodeDir, { recursive: true });
        }

        // --- Physically redistribute ALL files across ALL nodes ---
        const files = readJSON(FILES_JSON) || [];

        // Compute new round-robin assignments
        const newAssignments = {};
        nodesData.nodes.forEach((node) => {
            newAssignments[node.name] = [];
        });

        files.forEach((file, index) => {
            const nodeIndex = index % nodesData.nodes.length;
            newAssignments[nodesData.nodes[nodeIndex].name].push(file.name);
        });

        // Move files physically to their new node folders
        for (const file of files) {
            const oldNode = file.node || 'unassigned';

            // Find which node this file is now assigned to
            let newNode = null;
            for (const [nodeName, fileList] of Object.entries(newAssignments)) {
                if (fileList.includes(file.name)) {
                    newNode = nodeName;
                    break;
                }
            }

            // Move the file if its node changed
            if (newNode && newNode !== oldNode) {
                const oldPath = path.join(STORAGE_DIR, oldNode, file.name);
                const newDir = path.join(STORAGE_DIR, newNode);
                const newPath = path.join(newDir, file.name);

                if (!fs.existsSync(newDir)) {
                    fs.mkdirSync(newDir, { recursive: true });
                }

                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                    console.log(`  Moved "${file.name}": ${oldNode} → ${newNode}`);
                }

                // Update file metadata
                file.node = newNode;
            }
        }

        // Clean up empty old folders (e.g. "unassigned" if all files moved out)
        const unassignedDir = path.join(STORAGE_DIR, 'unassigned');
        if (fs.existsSync(unassignedDir)) {
            const remaining = fs.readdirSync(unassignedDir);
            if (remaining.length === 0) {
                fs.rmdirSync(unassignedDir);
            }
        }

        // Save updated data
        nodesData.assignments = newAssignments;
        writeJSON(NODES_JSON, nodesData);
        writeJSON(FILES_JSON, files);

        res.json({
            message: `Node "${name}" registered. ${files.length} file(s) redistributed across ${nodesData.nodes.length} node(s).`,
            nodes: nodesData.nodes,
            assignments: nodesData.assignments,
        });
    } catch (error) {
        console.error('Node registration error:', error);
        res.status(500).json({ error: 'Failed to register node' });
    }
});

/**
 * GET /nodes
 * Return all nodes and their file assignments
 */
router.get('/', (req, res) => {
    try {
        const nodesData = readJSON(NODES_JSON) || { nodes: [], assignments: {} };
        res.json(nodesData);
    } catch (error) {
        console.error('Error reading nodes:', error);
        res.status(500).json({ error: 'Failed to retrieve nodes' });
    }
});

export default router;
