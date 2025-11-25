import express from 'express';
import cors from 'cors';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { PythonShell } from 'python-shell';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// MongoDB Connection - Render compatible
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/google_indexing';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Connection Error:', err.message));

// MongoDB Schemas
const urlRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  url: { type: String },
  urls: [{ type: String }],
  type: { type: String, enum: ['single', 'batch'], required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  totalUrls: { type: Number, default: 0 },
  results: {
    successful: { type: Number, default: 0 },
    error429: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    note: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

const UrlRequest = mongoose.model('UrlRequest', urlRequestSchema);

// ✅ FIXED CORS CONFIGURATION
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://eclectic-toffee-e21fd7.netlify.app',
      'http://localhost:5173',
     
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Allow any origin during development
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));



app.use(express.json());

// Multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  }
});

// Service Account Setup for Render
function setupServiceAccount() {
  // Option 1: Environment variable se JSON
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const tempPath = `/tmp/account1_${Date.now()}.json`;
      fs.writeFileSync(tempPath, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      console.log('✅ Service account created from environment variable');
      return tempPath;
    } catch (error) {
      console.error('Error creating temp account file:', error);
    }
  }
  
  // Option 2: Local file (development)
  if (fs.existsSync('account1.json')) {
    console.log('✅ Using local account1.json file');
    return 'account1.json';
  }
  
  console.log('❌ No service account configuration found');
  return null;
}

// Routes
app.post('/api/submit-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const requestId = Date.now().toString();
    
    const urlRequest = new UrlRequest({
      requestId: requestId,
      url: url,
      type: 'single',
      status: 'processing',
      totalUrls: 1,
      createdAt: new Date()
    });

    await urlRequest.save();
    console.log('✅ URL request saved to database:', requestId);

    const csvContent = `URL\n${url}`;
    const filename = `single_url_${requestId}.csv`;
    fs.writeFileSync(filename, csvContent);

    runIndexingScript(filename, requestId);

    res.json({
      success: true,
      message: 'URL submitted for indexing',
      requestId: requestId
    });

  } catch (error) {
    console.error('Error submitting URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const urls = [];
    const requestId = Date.now().toString();

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        if (data.URL) {
          urls.push(data.URL);
        }
      })
      .on('end', async () => {
        if (urls.length === 0) {
          return res.status(400).json({ error: 'No URLs found in CSV file' });
        }

        const urlRequest = new UrlRequest({
          requestId: requestId,
          urls: urls,
          type: 'batch',
          status: 'processing',
          totalUrls: urls.length,
          createdAt: new Date()
        });

        await urlRequest.save();
        console.log('✅ Batch URL request saved to database:', requestId);

        const csvContent = 'URL\n' + urls.join('\n');
        const filename = `batch_${requestId}.csv`;
        fs.writeFileSync(filename, csvContent);

        fs.unlinkSync(req.file.path);

        runIndexingScript(filename, requestId);

        res.json({
          success: true,
          message: `CSV uploaded with ${urls.length} URLs`,
          requestId: requestId,
          totalUrls: urls.length
        });
      });

  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Other routes
app.get('/api/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await UrlRequest.findOne({ requestId: requestId });
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/requests', async (req, res) => {
  try {
    const requests = await UrlRequest.find().sort({ createdAt: -1 }).limit(50);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalRequests = await UrlRequest.countDocuments();
    const completedRequests = await UrlRequest.countDocuments({ status: 'completed' });
    const pendingRequests = await UrlRequest.countDocuments({ status: 'processing' });
    const failedRequests = await UrlRequest.countDocuments({ status: 'failed' });
    
    const totalUrls = await UrlRequest.aggregate([
      { $group: { _id: null, total: { $sum: '$totalUrls' } } }
    ]);

    res.json({
      totalRequests,
      completedRequests,
      pendingRequests,
      failedRequests,
      totalUrlsIndexed: totalUrls[0]?.total || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await UrlRequest.deleteOne({ requestId: requestId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const serviceAccountStatus = setupServiceAccount() ? 'configured' : 'not configured';
    
    res.json({ 
      status: 'Backend is running', 
      database: dbStatus,
      serviceAccount: serviceAccountStatus,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.json({ 
      status: 'Backend is running', 
      database: 'error',
      serviceAccount: 'unknown',
      timestamp: new Date().toISOString() 
    });
  }
});

// Updated Python Script Runner for Render
function runIndexingScript(csvFilename, requestId) {
  const accountPath = setupServiceAccount();
  
  if (!accountPath) {
    console.log('❌ No service account found. Using demo mode...');
    useDemoMode(requestId, csvFilename);
    return;
  }

  const pythonCommands = ['python', 'python3', 'py'];
  
  console.log('🔄 Starting Python script execution...');
  
  const tryPythonExecution = async (index = 0) => {
    if (index >= pythonCommands.length) {
      console.log('❌ Python not found. Using demo mode...');
      useDemoMode(requestId, csvFilename);
      return;
    }

    const pythonCommand = pythonCommands[index];
    
    const options = {
      mode: 'text',
      pythonPath: pythonCommand,
      scriptPath: __dirname,
      args: [csvFilename, accountPath],
      pythonOptions: ['-u']
    };

    console.log(`🔧 Trying Python command: ${pythonCommand}`);

    const pyshell = new PythonShell('indexing_script.py', options);

    pyshell.on('message', async (message) => {
      console.log(`🐍 ${pythonCommand}:`, message);
      
      try {
        const request = await UrlRequest.findOne({ requestId: requestId });
        if (request) {
          if (message.includes('✅ Completed') || message.includes('🎉 Indexing process completed')) {
            request.status = 'completed';
            
            const successfulMatch = message.match(/(\d+) successful/);
            const errorMatch = message.match(/(\d+) rate limited/);
            const failedMatch = message.match(/(\d+) failed/);
            
            if (successfulMatch) {
              request.results = {
                successful: parseInt(successfulMatch[1]),
                error429: errorMatch ? parseInt(errorMatch[1]) : 0,
                failed: failedMatch ? parseInt(failedMatch[1]) : 0
              };
            }
            request.completedAt = new Date();
            await request.save();
            console.log('✅ Request completed and saved to database:', requestId);
          } else if (message.includes('Processing') || message.includes('Indexing')) {
            request.status = 'processing';
            await request.save();
          }
        }
      } catch (dbError) {
        console.error('Error updating database:', dbError);
      }
    });

    pyshell.end(async (err) => {
      if (err) {
        console.error(`❌ Python command "${pythonCommand}" failed:`, err.message);
        tryPythonExecution(index + 1);
      } else {
        console.log(`✅ Python script completed successfully with "${pythonCommand}"`);
        
        // Cleanup
        try {
          fs.unlinkSync(csvFilename);
          if (accountPath.includes('/tmp/')) {
            fs.unlinkSync(accountPath);
          }
          console.log('🗑️ Temporary files cleaned up');
        } catch (e) {
          console.log('⚠️ Could not delete temp files');
        }
      }
    });
  };

  tryPythonExecution();
}

// Demo mode fallback
async function useDemoMode(requestId, csvFilename) {
  try {
    const request = await UrlRequest.findOne({ requestId: requestId });
    if (request) {
      setTimeout(async () => {
        request.status = 'completed';
        request.results = {
          successful: request.type === 'single' ? 1 : Math.min(request.urls?.length || 5, 5),
          error429: 0,
          failed: 0,
          note: 'Demo mode - Service account not configured'
        };
        request.completedAt = new Date();
        await request.save();
        console.log('✅ Demo mode completed for request:', requestId);
        
        try {
          fs.unlinkSync(csvFilename);
        } catch (e) {
          console.log('Could not delete temp file:', csvFilename);
        }
      }, 3000);
    }
  } catch (dbError) {
    console.error('Error in demo mode:', dbError);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Server running on port ${PORT}`);
  console.log(`📊 Health: /api/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 CORS: Enabled for all origins`);
});