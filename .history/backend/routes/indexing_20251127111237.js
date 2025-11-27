// backend/routes/indexing.js
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import IndexingTask from '../models/IndexingTask.js';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `urls-${Date.now()}.csv`);
    }
});

const upload = multer({ storage });

// Upload URLs via CSV
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }

        const urls = [];
        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (row) => {
                if (row.URL) {
                    urls.push(row.URL);
                }
            })
            .on('end', async () => {
                // Clean up uploaded file
                fs.unlinkSync(req.file.path);

                if (urls.length === 0) {
                    return res.status(400).json({ error: 'No URLs found in CSV' });
                }

                // Create task in database
                const task = new IndexingTask({
                    taskId: `task_${Date.now()}`,
                    urls: urls.map(url => ({ url, status: 'pending' })),
                    summary: {
                        totalUrls: urls.length,
                        successfulUrls: 0,
                        error429Count: 0,
                        otherErrorsCount: 0
                    }
                });

                await task.save();

                res.json({
                    message: 'CSV processed successfully',
                    taskId: task.taskId,
                    totalUrls: urls.length
                });
            });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start indexing process
router.post('/start-indexing', async (req, res) => {
    try {
        const { taskId, numAccounts = 1 } = req.body;

        const task = await IndexingTask.findOne({ taskId });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Run Python script
        const pythonProcess = spawn('python', [
            path.join(__dirname, '../python_indexer.py'),
            '--task-id', taskId,
            '--accounts', numAccounts.toString()
        ]);

        let output = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('Python Output:', data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('Python Error:', data.toString());
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
        });

        res.json({
            message: 'Indexing process started',
            taskId: taskId,
            status: 'processing'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get task status
router.get('/status/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await IndexingTask.findOne({ taskId });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({
            taskId: task.taskId,
            status: task.status,
            summary: task.summary,
            progress: {
                processed: task.urls.filter(u => u.status !== 'pending').length,
                total: task.urls.length
            },
            startedAt: task.startedAt,
            completedAt: task.completedAt
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get detailed results
router.get('/results/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await IndexingTask.findOne({ taskId });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({
            taskId: task.taskId,
            status: task.status,
            urls: task.urls,
            summary: task.summary,
            startedAt: task.startedAt,
            completedAt: task.completedAt
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
account
// Get all tasks
router.get('/tasks', async (req, res) => {
    try {
        const tasks = await IndexingTask.find()
            .sort({ startedAt: -1 })
            .limit(50)
            .select('taskId status summary startedAt completedAt');

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;