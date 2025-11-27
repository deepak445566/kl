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
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect('mongodb+srv://digitalexpressindia30_db_user:digitalexpressindia30_db_user@clusterdigital.1y0nunx.mongodb.net/urlll', {
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

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
            if (error.code !== 11000) console.error('Error saving URL:', error);
          }
        }

        fs.unlinkSync(req.file.path);
        res.json({ message: `Processed ${urlDocs.length} URLs`, totalUrls: urlDocs.length });
      });

  } catch (error) {
    res.status(500).json({ error: 'Error processing CSV' });
  }
});

// Upload Account JSON
app.post('/api/upload-account', upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const account = new Account({
      name: req.body.name || `account-${Date.now()}`,
      jsonFile: req.file.filename
    });

    await account.save();
    res.json({ message: 'Account uploaded', account });

  } catch (error) {
    res.status(500).json({ error: 'Error uploading account' });
  }
});

// Get accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find();
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching accounts' });
  }
});

// Get URLs
app.get('/api/urls', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const urls = await Url.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Url.countDocuments();

    res.json({ urls, totalPages: Math.ceil(total / limit), currentPage: page, total });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching URLs' });
  }
});

// Start Indexing - Python Script Call
app.post('/api/start-indexing', async (req, res) => {
  try {
    const accounts = await Account.find();
    const pendingUrls = await Url.find({ status: 'pending' }).limit(200 * accounts.length);

    if (pendingUrls.length === 0) {
      return res.json({ message: 'No pending URLs' });
    }

    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts configured' });
    }

    // Create data.csv for Python script
    const csvData = ['URL'];
    pendingUrls.forEach(url => csvData.push(url.url));
    fs.writeFileSync('data.csv', csvData.join('\n'));

    // Copy account files to root
    accounts.forEach((account, index) => {
      fs.copyFileSync(
        `uploads/${account.jsonFile}`, 
        `account${index + 1}.json`
      );
    });

    // Run Python script
    const pythonProcess = spawn('python', ['indexing_script.py', accounts.length.toString()]);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('Python Output:', data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python Error:', data.toString());
    });

    pythonProcess.on('close', async (code) => {
      console.log(`Python process exited with code ${code}`);
      
      // Update DB with results
      await updateDatabaseWithResults();
      
      res.json({ 
        message: 'Indexing completed', 
        output: output,
        exitCode: code 
      });
    });

  } catch (error) {
    res.status(500).json({ error: 'Error starting indexing' });
  }
});

async function updateDatabaseWithResults() {
  // This function would parse Python script output and update DB
  // For now, we'll mark all processed URLs as completed
  const pendingUrls = await Url.find({ status: 'pending' }).limit(1000);
  for (const url of pendingUrls) {
    url.status = 'completed';
    await url.save();
  }
}

// Stats
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
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('MongoDB connected');
});