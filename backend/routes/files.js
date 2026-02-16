import { Router } from 'express';
import { FILES_JSON, readJSON } from '../utils/fileHelpers.js';

const router = Router();

/**
 * GET /files
 * Return the list of uploaded files
 */
router.get('/', (req, res) => {
    try {
        const files = readJSON(FILES_JSON) || [];
        res.json({ files });
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({ error: 'Failed to retrieve file list' });
    }
});

export default router;
