const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect('mongodb+srv://digitalexpressindia30_db_user:digitalexpressindia30_db_user@clusterdigital.1y0nunx.mongodb.net/urlll')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// MongoDB Schemas
const urlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  status: { type: String, default: 'pending' },
  response: { type: Object },
  accountUsed: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  jsonFile: { type: String, required: true },
  totalUrlsProcessed: { type: Number, default: 0 },
  dailyQuotaUsed: { type: Number, default: 0 },
  lastUsed: { type: Date }
});

const Url = mongoose.model('Url', urlSchema);
const Account = mongoose.model('Account', accountSchema);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Global variable to track Python script status
let pythonScriptStatus = {
  isRunning: false,
  startTime: null,
  accountsUsed: 0,
  urlsProcessed: 0,
  progress: 0,
  currentAccount: null,
  logs: []
};

// Routes

// Upload CSV to DB
app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const urls = [];
    
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        if (data.URL) urls.push(data.URL);
      })
      .on('end', async () => {
        const urlDocs = [];
        for (const url of urls) {
          try {
            const urlDoc = new Url({ url });
            await urlDoc.save();
            urlDocs.push(urlDoc);
          } catch (error) {
            if (error.code !== 11000) {
              console.error('Error saving URL:', error);
            }
          }
        }

        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }

        res.json({ 
          message: `Successfully processed ${urlDocs.length} URLs`, 
          totalUrls: urlDocs.length 
        });
      });

  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).json({ error: 'Error processing CSV file' });
  }
});

// Upload Account JSON
app.post('/api/upload-account', upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const accountName = req.body.name || `account-${Date.now()}`;
    
    const account = new Account({
      name: accountName,
      jsonFile: req.file.filename
    });

    await account.save();
    res.json({ 
      message: 'Account uploaded successfully', 
      account: account 
    });

  } catch (error) {
    console.error('Error uploading account:', error);
    res.status(500).json({ error: 'Error uploading account file' });
  }
});

// Get all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find();
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Error fetching accounts' });
  }
});

// Get URLs with pagination
app.get('/api/urls', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const urls = await Url.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Url.countDocuments();

    res.json({
      urls,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.status(500).json({ error: 'Error fetching URLs' });
  }
});

// Get Python Script Status
app.get('/api/python-status', (req, res) => {
  res.json({
    ...pythonScriptStatus,
    runningTime: pythonScriptStatus.startTime 
      ? Math.round((Date.now() - pythonScriptStatus.startTime) / 1000) 
      : 0
  });
});

// Start Indexing - Python Script Call
app.post('/api/start-indexing', async (req, res) => {
  try {
    // Check if Python script is already running
    if (pythonScriptStatus.isRunning) {
      return res.status(400).json({ 
        error: 'Python script is already running. Please wait for it to complete.' 
      });
    }

    const accounts = await Account.find();
    const pendingUrls = await Url.find({ status: 'pending' }).limit(200 * accounts.length);

    if (pendingUrls.length === 0) {
      return res.json({ message: 'No pending URLs to process' });
    }

    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts configured' });
    }

    // Reset and initialize Python script status
    pythonScriptStatus = {
      isRunning: true,
      startTime: Date.now(),
      accountsUsed: accounts.length,
      urlsProcessed: pendingUrls.length,
      progress: 0,
      currentAccount: null,
      logs: [
        `🚀 Starting indexing process at ${new Date().toLocaleString()}`,
        `📊 Accounts: ${accounts.length}, URLs: ${pendingUrls.length}`
      ]
    };

    console.log('🐍 Python Script Status: STARTED');
    console.log(`📊 Processing ${pendingUrls.length} URLs with ${accounts.length} accounts`);

    // Create data.csv for Python script
    const csvData = ['URL'];
    pendingUrls.forEach(url => csvData.push(url.url));
    
    try {
      fs.writeFileSync('data.csv', csvData.join('\n'));
      pythonScriptStatus.logs.push('✅ data.csv created successfully');
      console.log('✅ data.csv created successfully');
    } catch (fileError) {
      pythonScriptStatus.logs.push('❌ Error creating data.csv');
      console.error('Error creating data.csv:', fileError);
      pythonScriptStatus.isRunning = false;
      return res.status(500).json({ error: 'Error creating data file' });
    }

    // Copy account files to root
    try {
      accounts.forEach((account, index) => {
        const sourcePath = path.join('uploads', account.jsonFile);
        const destPath = `account${index + 1}.json`;
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          pythonScriptStatus.logs.push(`✅ ${destPath} created from ${account.name}`);
          console.log(`✅ ${destPath} created successfully`);
        } else {
          pythonScriptStatus.logs.push(`❌ Source file not found: ${sourcePath}`);
          console.error(`❌ Source file not found: ${sourcePath}`);
        }
      });
    } catch (copyError) {
      pythonScriptStatus.logs.push('❌ Error copying account files');
      console.error('Error copying account files:', copyError);
      pythonScriptStatus.isRunning = false;
      return res.status(500).json({ error: 'Error copying account files' });
    }

    pythonScriptStatus.logs.push('🐍 Starting Python script execution...');
    console.log(`🚀 Starting Python script with ${accounts.length} accounts`);

    // Run Python script
    const pythonProcess = spawn('python', ['indexing_script.py', accounts.length.toString()]);

    let output = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const dataStr = data.toString().trim();
      output += dataStr + '\n';
      
      // Parse Python script output for status updates
      if (dataStr.includes('Processing URLs for Account')) {
        const accountMatch = dataStr.match(/Account (\d+)/);
        if (accountMatch) {
          pythonScriptStatus.currentAccount = `Account ${accountMatch[1]}`;
          pythonScriptStatus.logs.push(`🔧 ${dataStr}`);
        }
      }
      
      if (dataStr.includes('Total URLs Tried:')) {
        const urlsMatch = dataStr.match(/Total URLs Tried: (\d+)/);
        const successMatch = dataStr.match(/Successful URLs: (\d+)/);
        const errorMatch = dataStr.match(/URLs with Error 429: (\d+)/);
        
        if (urlsMatch && successMatch) {
          pythonScriptStatus.logs.push(`📈 ${dataStr}`);
          pythonScriptStatus.progress = Math.min(100, pythonScriptStatus.progress + 25);
        }
      }
      
      if (dataStr.includes('Successful URLs:')) {
        pythonScriptStatus.logs.push(`✅ ${dataStr}`);
      }
      
      console.log('🐍 Python Output:', dataStr);
    });

    pythonProcess.stderr.on('data', (data) => {
      const errorStr = data.toString().trim();
      pythonScriptStatus.logs.push(`❌ Error: ${errorStr}`);
      console.error('🐍 Python Error:', errorStr);
    });

    pythonProcess.on('close', async (code) => {
      const endTime = Date.now();
      const runningTime = Math.round((endTime - pythonScriptStatus.startTime) / 1000);
      
      pythonScriptStatus.isRunning = false;
      pythonScriptStatus.progress = 100;
      
      if (code === 0) {
        pythonScriptStatus.logs.push(`🎉 Python script completed successfully in ${runningTime} seconds`);
        console.log(`✅ Python process completed successfully in ${runningTime} seconds`);
      } else {
        pythonScriptStatus.logs.push(`⚠️ Python script exited with code ${code} after ${runningTime} seconds`);
        console.log(`⚠️ Python process exited with code ${code} after ${runningTime} seconds`);
      }

      // Update DB with results
      try {
        await updateDatabaseWithResults();
        pythonScriptStatus.logs.push('✅ Database updated with results');
        console.log('✅ Database updated with results');
      } catch (updateError) {
        pythonScriptStatus.logs.push('❌ Error updating database');
        console.error('Error updating database:', updateError);
      }
      
      res.json({ 
        message: 'Indexing completed successfully', 
        output: output,
        exitCode: code,
        accountsUsed: accounts.length,
        urlsProcessed: pendingUrls.length,
        runningTime: runningTime
      });
    });

    // Send immediate response that indexing has started
    res.json({ 
      message: 'Indexing started successfully', 
      accounts: accounts.length,
      urls: pendingUrls.length,
      status: 'started'
    });

  } catch (error) {
    pythonScriptStatus.isRunning = false;
    pythonScriptStatus.logs.push(`❌ Error: ${error.message}`);
    console.error('Error starting indexing:', error);
    res.status(500).json({ error: 'Error starting indexing process' });
  }
});

async function updateDatabaseWithResults() {
  try {
    const pendingUrls = await Url.find({ status: 'pending' }).limit(1000);
    
    for (const url of pendingUrls) {
      url.status = 'completed';
      await url.save();
    }
    
    console.log(`✅ Updated ${pendingUrls.length} URLs to completed status`);
  } catch (error) {
    console.error('Error in updateDatabaseWithResults:', error);
    throw error;
  }
}

// Dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalUrls = await Url.countDocuments();
    const successUrls = await Url.countDocuments({ status: 'completed' });
    const errorUrls = await Url.countDocuments({ status: 'error' });
    const pendingUrls = await Url.countDocuments({ status: 'pending' });
    const totalAccounts = await Account.countDocuments();

    res.json({
      totalUrls,
      successUrls,
      errorUrls,
      pendingUrls,
      totalAccounts,
      successRate: totalUrls > 0 ? (successUrls / totalUrls * 100).toFixed(2) : 0,
      pythonScript: pythonScriptStatus
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Error fetching statistics' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    pythonScript: {
      isRunning: pythonScriptStatus.isRunning,
      runningTime: pythonScriptStatus.startTime 
        ? Math.round((Date.now() - pythonScriptStatus.startTime) / 1000) 
        : 0
    }
  });
});

// Delete account endpoint
app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const account = await Account.findByIdAndDelete(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Error deleting account' });
  }
});

// Clear Python logs endpoint
app.delete('/api/python-logs', (req, res) => {
  pythonScriptStatus.logs = [];
  res.json({ message: 'Python logs cleared successfully' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Health check: http://localhost:5000/api/health');
  console.log('🐍 Python status: http://localhost:5000/api/python-status');
  console.log('📈 Stats: http://localhost:5000/api/stats');
});