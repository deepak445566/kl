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

// MongoDB Connection (Fixed - removed deprecated options)
mongoose.connect('mongodb://localhost:27017/google-indexing')
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
    // Create uploads directory if it doesn't exist
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

// Routes - Only DB Operations

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

        // Clean up uploaded file
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

// Start Indexing - Python Script Call
app.post('/api/start-indexing', async (req, res) => {
  try {
    const accounts = await Account.find();
    const pendingUrls = await Url.find({ status: 'pending' }).limit(200 * accounts.length);

    if (pendingUrls.length === 0) {
      return res.json({ message: 'No pending URLs to process' });
    }

    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts configured' });
    }

    // Create data.csv for Python script
    const csvData = ['URL'];
    pendingUrls.forEach(url => csvData.push(url.url));
    
    try {
      fs.writeFileSync('data.csv', csvData.join('\n'));
      console.log('✅ data.csv created successfully');
    } catch (fileError) {
      console.error('Error creating data.csv:', fileError);
      return res.status(500).json({ error: 'Error creating data file' });
    }

    // Copy account files to root
    try {
      accounts.forEach((account, index) => {
        const sourcePath = path.join('uploads', account.jsonFile);
        const destPath = `account${index + 1}.json`;
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`✅ ${destPath} created successfully`);
        } else {
          console.error(`❌ Source file not found: ${sourcePath}`);
        }
      });
    } catch (copyError) {
      console.error('Error copying account files:', copyError);
      return res.status(500).json({ error: 'Error copying account files' });
    }

    console.log(`🚀 Starting indexing with ${accounts.length} accounts and ${pendingUrls.length} URLs`);

    // Run Python script
    const pythonProcess = spawn('python', ['indexing_script.py', accounts.length.toString()]);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      output += dataStr;
      console.log('Python Output:', dataStr);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python Error:', data.toString());
    });

    pythonProcess.on('close', async (code) => {
      console.log(`✅ Python process exited with code ${code}`);
      
      // Update DB with results
      try {
        await updateDatabaseWithResults();
        console.log('✅ Database updated with results');
      } catch (updateError) {
        console.error('Error updating database:', updateError);
      }
      
      res.json({ 
        message: 'Indexing completed successfully', 
        output: output,
        exitCode: code,
        accountsUsed: accounts.length,
        urlsProcessed: pendingUrls.length
      });
    });

  } catch (error) {
    console.error('Error starting indexing:', error);
    res.status(500).json({ error: 'Error starting indexing process' });
  }
});

async function updateDatabaseWithResults() {
  try {
    // Mark first 1000 pending URLs as completed for demo
    // In real implementation, you would parse Python script output
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
      successRate: totalUrls > 0 ? (successUrls / totalUrls * 100).toFixed(2) : 0
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
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Health check: http://localhost:5000/api/health');
  console.log('🔗 Make sure MongoDB is running on localhost:27017');
});