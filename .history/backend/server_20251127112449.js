const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { google } = require('googleapis');
const async = require('async');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000'], // React frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.static('uploads'));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/google-indexing', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

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

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Routes

// Upload CSV file
app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const urls = [];
    
    // Read CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        if (data.URL) {
          urls.push(data.URL);
        }
      })
      .on('end', async () => {
        // Save URLs to database
        const urlDocs = [];
        for (const url of urls) {
          try {
            const urlDoc = new Url({ url });
            await urlDoc.save();
            urlDocs.push(urlDoc);
          } catch (error) {
            if (error.code !== 11000) { // Ignore duplicate key errors
              console.error('Error saving URL:', error);
            }
          }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

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

// Upload account JSON file
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

// Start indexing process
app.post('/api/start-indexing', async (req, res) => {
  try {
    const { urlsPerAccount = 200 } = req.body;
    
    const accounts = await Account.find();
    const pendingUrls = await Url.find({ status: 'pending' }).limit(urlsPerAccount * accounts.length);

    if (pendingUrls.length === 0) {
      return res.json({ message: 'No pending URLs to process' });
    }

    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts configured' });
    }

    // Distribute URLs among accounts
    const results = {
      totalProcessed: 0,
      successful: 0,
      errors: 0,
      error429: 0
    };

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const startIndex = i * urlsPerAccount;
      const endIndex = startIndex + urlsPerAccount;
      const accountUrls = pendingUrls.slice(startIndex, endIndex);

      if (accountUrls.length === 0) break;

      const accountResults = await processUrlsWithAccount(account, accountUrls);
      
      results.totalProcessed += accountResults.totalProcessed;
      results.successful += accountResults.successful;
      results.errors += accountResults.errors;
      results.error429 += accountResults.error429;

      // Update account usage
      account.totalUrlsProcessed += accountResults.totalProcessed;
      account.dailyQuotaUsed += accountResults.totalProcessed;
      account.lastUsed = new Date();
      await account.save();
    }

    res.json(results);

  } catch (error) {
    console.error('Error starting indexing:', error);
    res.status(500).json({ error: 'Error starting indexing process' });
  }
});

// Process URLs with a specific account
async function processUrlsWithAccount(account, urls) {
  const results = {
    totalProcessed: urls.length,
    successful: 0,
    errors: 0,
    error429: 0
  };

  const keyFile = require(`./uploads/${account.jsonFile}`);
  const indexing = google.indexing({ version: 'v3', auth: await getAuthClient(keyFile) });

  for (const urlDoc of urls) {
    try {
      const response = await indexing.urlNotifications.publish({
        requestBody: {
          url: urlDoc.url,
          type: 'URL_UPDATED'
        }
      });

      urlDoc.status = 'success';
      urlDoc.response = response.data;
      urlDoc.accountUsed = account.name;
      results.successful++;

    } catch (error) {
      urlDoc.status = 'error';
      urlDoc.response = { error: error.response?.data || error.message };
      
      if (error.response?.status === 429) {
        results.error429++;
      } else {
        results.errors++;
      }
    }

    await urlDoc.save();
    
    // Rate limiting - don't overwhelm the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

// Get Google Auth Client
async function getAuthClient(keyFile) {
  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/indexing']
  });

  return auth;
}

// Dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalUrls = await Url.countDocuments();
    const successUrls = await Url.countDocuments({ status: 'success' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Make sure MongoDB is running on localhost:27017');
});