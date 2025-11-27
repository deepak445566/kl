const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: [ 'http://localhost:5173'],
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

// Helper function to clean up files
const cleanupFiles = () => {
  const filesToClean = ['data.csv', 'single_url.csv'];
  
  for (let i = 1; i <= 5; i++) {
    filesToClean.push(`account${i}.json`);
  }

  filesToClean.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`🧹 Cleaned up: ${file}`);
      } catch (error) {
        console.log(`⚠️ Could not delete ${file}: ${error.message}`);
      }
    }
  });
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
        let duplicates = 0;

        for (const url of urls) {
          try {
            const urlDoc = new Url({ url });
            await urlDoc.save();
            urlDocs.push(urlDoc);
          } catch (error) {
            if (error.code === 11000) {
              duplicates++;
            } else {
              console.error('Error saving URL:', error);
            }
          }
        }

        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }

        let message = `Successfully processed ${urlDocs.length} URLs`;
        if (duplicates > 0) {
          message += ` (${duplicates} duplicates skipped)`;
        }

        res.json({ 
          message: message, 
          totalUrls: urlDocs.length,
          duplicates: duplicates
        });
      });

  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).json({ error: 'Error processing CSV file' });
  }
});

// Add Single URL to DB
app.post('/api/add-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format. Please use full URL like https://example.com' });
    }

    let urlDoc;
    try {
      urlDoc = new Url({ url });
      await urlDoc.save();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'URL already exists in database' });
      }
      throw error;
    }

    res.json({ 
      message: 'URL added successfully', 
      url: urlDoc 
    });

  } catch (error) {
    console.error('Error adding URL:', error);
    res.status(500).json({ error: 'Error adding URL to database' });
  }
});

// Index Single URL Immediately
app.post('/api/index-single-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format. Please use full URL like https://example.com' });
    }

    const accounts = await Account.find();
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts configured. Please upload Google Service Account JSON files first.' });
    }

    // Use the first available account
    const account = accounts[0];
    
    console.log(`🚀 Starting single URL indexing for: ${url}`);
    console.log(`👤 Using account: ${account.name}`);

    // Clean up any existing files first
    cleanupFiles();

    // Create temporary CSV with single URL
    const csvData = ['URL', url];
    try {
      fs.writeFileSync('single_url.csv', csvData.join('\n'));
      console.log('✅ single_url.csv created successfully');
    } catch (fileError) {
      console.error('Error creating single_url.csv:', fileError);
      return res.status(500).json({ error: 'Error creating data file' });
    }

    // Copy account file to root
    try {
      const sourcePath = path.join('uploads', account.jsonFile);
      const destPath = 'account1.json';
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`✅ ${destPath} created successfully`);
      } else {
        console.error(`❌ Source file not found: ${sourcePath}`);
        return res.status(500).json({ error: 'Account file not found' });
      }
    } catch (copyError) {
      console.error('Error copying account file:', copyError);
      return res.status(500).json({ error: 'Error copying account file' });
    }

    // Run Python script for single URL
    const pythonProcess = spawn('python', ['single_url_script.py']);

    let output = '';
    let success = false;
    
    pythonProcess.stdout.on('data', (data) => {
      const dataStr = data.toString().trim();
      output += dataStr + '\n';
      console.log('🐍 Single URL Python Output:', dataStr);
      
      if (dataStr.includes('SUCCESS') || dataStr.includes('completed successfully')) {
        success = true;
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const errorStr = data.toString().trim();
      console.error('🐍 Single URL Python Error:', errorStr);
      output += `ERROR: ${errorStr}\n`;
    });

    pythonProcess.on('close', async (code) => {
      console.log(`✅ Single URL Python process exited with code ${code}`);
      
      // Clean up temporary files
      cleanupFiles();

      // Save URL to database with result
      try {
        let urlDoc;
        try {
          urlDoc = new Url({
            url: url,
            status: success ? 'completed' : 'error',
            accountUsed: account.name,
            response: { 
              output: output, 
              success: success, 
              exitCode: code,
              timestamp: new Date()
            }
          });
          await urlDoc.save();
        } catch (dbError) {
          if (dbError.code === 11000) {
            // Update existing URL
            urlDoc = await Url.findOne({ url: url });
            if (urlDoc) {
              urlDoc.status = success ? 'completed' : 'error';
              urlDoc.accountUsed = account.name;
              urlDoc.response = { 
                output: output, 
                success: success, 
                exitCode: code,
                timestamp: new Date()
              };
              await urlDoc.save();
            }
          } else {
            throw dbError;
          }
        }

        // Update account usage
        account.totalUrlsProcessed += 1;
        account.dailyQuotaUsed += 1;
        account.lastUsed = new Date();
        await account.save();

        res.json({ 
          message: 'Single URL indexing completed',
          success: success,
          output: output,
          accountUsed: account.name,
          exitCode: code
        });

      } catch (dbError) {
        console.error('Error saving URL to database:', dbError);
        res.status(500).json({ 
          error: 'Error saving results to database',
          success: success,
          output: output
        });
      }
    });

  } catch (error) {
    console.error('Error indexing single URL:', error);
    res.status(500).json({ error: 'Error indexing single URL' });
  }
});

// Upload Account JSON
app.post('/api/upload-account', upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate JSON file
    try {
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      // Check if it's a valid Google Service Account JSON
      if (!jsonData.type || !jsonData.project_id || !jsonData.private_key_id || !jsonData.private_key || !jsonData.client_email) {
        fs.unlinkSync(req.file.path); // Delete invalid file
        return res.status(400).json({ error: 'Invalid Google Service Account JSON file' });
      }
    } catch (jsonError) {
      fs.unlinkSync(req.file.path); // Delete invalid file
      return res.status(400).json({ error: 'Invalid JSON file format' });
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
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Error uploading account file' });
  }
});

// Get all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find().sort({ createdAt: -1 });
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
      return res.status(400).json({ error: 'No accounts configured. Please upload Google Service Account JSON files first.' });
    }

    // Clean up any existing files first
    cleanupFiles();

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
      cleanupFiles();
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

      if (dataStr.includes('FINAL SUMMARY')) {
        pythonScriptStatus.progress = 100;
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
      
      // Clean up temporary files
      cleanupFiles();

      if (code === 0) {
        pythonScriptStatus.logs.push(`🎉 Python script completed successfully in ${runningTime} seconds`);
        console.log(`✅ Python process completed successfully in ${runningTime} seconds`);
      } else {
        pythonScriptStatus.logs.push(`⚠️ Python script exited with code ${code} after ${runningTime} seconds`);
        console.log(`⚠️ Python process exited with code ${code} after ${runningTime} seconds`);
      }

      // Update DB with results - mark processed URLs as completed
      try {
        const processedUrls = await Url.find({ status: 'pending' }).limit(pendingUrls.length);
        for (const url of processedUrls) {
          url.status = 'completed';
          await url.save();
        }
        pythonScriptStatus.logs.push(`✅ Updated ${processedUrls.length} URLs to completed status`);
        console.log(`✅ Updated ${processedUrls.length} URLs to completed status`);
      } catch (updateError) {
        pythonScriptStatus.logs.push('❌ Error updating database');
        console.error('Error updating database:', updateError);
      }
      
      // Update account usage statistics
      try {
        for (const account of accounts) {
          account.totalUrlsProcessed += Math.floor(pendingUrls.length / accounts.length);
          account.dailyQuotaUsed += Math.floor(pendingUrls.length / accounts.length);
          account.lastUsed = new Date();
          await account.save();
        }
      } catch (accountError) {
        console.error('Error updating account statistics:', accountError);
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
    cleanupFiles();
    res.status(500).json({ error: 'Error starting indexing process' });
  }
});

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
    
    // Delete the associated JSON file
    const filePath = path.join('uploads', account.jsonFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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

// Clear all URLs endpoint
app.delete('/api/urls', async (req, res) => {
  try {
    const result = await Url.deleteMany({});
    res.json({ 
      message: `Deleted ${result.deletedCount} URLs successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting URLs:', error);
    res.status(500).json({ error: 'Error deleting URLs' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Health check: http://localhost:5000/api/health');
  console.log('🐍 Python status: http://localhost:5000/api/python-status');
  console.log('📈 Stats: http://localhost:5000/api/stats');
  
  // Clean up any existing files on startup
  cleanupFiles();
});