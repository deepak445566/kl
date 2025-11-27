import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Enhanced API configuration
const API_BASE = 'https://kl-nk83.onrender.com/api';

// Create axios instance with better error handling
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🔄 Making API request to: ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.code === 'ERR_NETWORK') {
      console.error('🌐 Network Error: Backend server is not running or not accessible');
      alert('⚠️ Cannot connect to backend server. Please make sure the server is running on port 5001.\n\nRun: npm start in your backend directory');
    }
    return Promise.reject(error);
  }
);

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({});
  const [urls, setUrls] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [singleUrl, setSingleUrl] = useState('');
  const [pythonStatus, setPythonStatus] = useState({});
  const [showSingleUrlForm, setShowSingleUrlForm] = useState(false);
  const [singleUrlResult, setSingleUrlResult] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');

  // Check backend connection on component mount
  useEffect(() => {
    checkBackendConnection();
    fetchStats();
    fetchAccounts();
    fetchUrls();
    fetchPythonStatus();
  }, []);

  // Poll Python status when script is running
  useEffect(() => {
    let interval;
    if (pythonStatus.isRunning) {
      interval = setInterval(fetchPythonStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [pythonStatus.isRunning]);

  // Check backend connection
  const checkBackendConnection = async () => {
    try {
      const response = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
      if (response.data.status === 'OK') {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      console.error('Backend connection failed:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      if (error.code === 'ERR_NETWORK') {
        setStats({ error: 'Backend server not available' });
      }
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchUrls = async (page = 1) => {
    try {
      const response = await api.get(`/urls?page=${page}&limit=50`);
      setUrls(response.data.urls);
    } catch (error) {
      console.error('Error fetching URLs:', error);
    }
  };

  const fetchPythonStatus = async () => {
    try {
      const response = await api.get('/python-status');
      setPythonStatus(response.data);
    } catch (error) {
      console.error('Error fetching Python status:', error);
    }
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    setLoading(true);
    setUploadProgress(0);
    
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await api.post('/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        setUploadProgress(0);
        alert('CSV uploaded successfully!');
        fetchStats();
        fetchUrls();
      }, 500);

    } catch (error) {
      setUploadProgress(0);
      alert('Error uploading CSV: ' + (error.response?.data?.error || error.message));
      console.error(error);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleAccountUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('jsonFile', file);
    formData.append('name', `account-${Date.now()}`);

    setLoading(true);
    try {
      await api.post('/upload-account', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('Account JSON uploaded successfully!');
      fetchAccounts();
    } catch (error) {
      alert('Error uploading account JSON: ' + (error.response?.data?.error || error.message));
      console.error(error);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleAddSingleUrl = async () => {
    if (!singleUrl.trim()) {
      alert('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(singleUrl);
    } catch (error) {
      alert('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setLoading(true);
    setSingleUrlResult(null);
    try {
      await api.post('/add-url', { url: singleUrl });
      setSingleUrlResult({
        type: 'success',
        message: 'URL added successfully to database!',
        url: singleUrl
      });
      setSingleUrl('');
      fetchStats();
      fetchUrls();
    } catch (error) {
      setSingleUrlResult({
        type: 'error',
        message: error.response?.data?.error || 'Error adding URL'
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleIndexSingleUrl = async () => {
    if (!singleUrl.trim()) {
      alert('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(singleUrl);
    } catch (error) {
      alert('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    if (accounts.length === 0) {
      alert('No accounts configured. Please upload an account first.');
      return;
    }

    setLoading(true);
    setSingleUrlResult(null);
    try {
      const response = await api.post('/index-single-url', { url: singleUrl });
      
      setSingleUrlResult({
        type: response.data.success ? 'success' : 'error',
        message: `Single URL indexing ${response.data.success ? 'completed successfully!' : 'failed'}`,
        details: `Account: ${response.data.accountUsed}`,
        output: response.data.output,
        url: singleUrl
      });

      if (response.data.success) {
        setSingleUrl('');
      }
      
      fetchStats();
      fetchUrls();
      fetchAccounts();
    } catch (error) {
      setSingleUrlResult({
        type: 'error',
        message: error.response?.data?.error || 'Error indexing URL'
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startIndexing = async () => {
    if (!window.confirm('Are you sure you want to start indexing? This may take several minutes.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/start-indexing');
      
      if (response.data.status === 'started') {
        alert('Indexing started successfully! Check the Python status for progress.');
        fetchPythonStatus();
      } else {
        alert(`Indexing completed!\n\nAccounts: ${response.data.accountsUsed}\nURLs: ${response.data.urlsProcessed}`);
      }
      
      fetchStats();
      fetchUrls();
      fetchAccounts();
    } catch (error) {
      alert(error.response?.data?.error || 'Error starting indexing');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (accountId) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        await api.delete(`/accounts/${accountId}`);
        alert('Account deleted successfully!');
        fetchAccounts();
      } catch (error) {
        alert('Error deleting account');
        console.error(error);
      }
    }
  };

  const clearSingleUrlResult = () => {
    setSingleUrlResult(null);
  };

  const retryConnection = () => {
    checkBackendConnection();
    fetchStats();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Connection Status Banner */}
      {connectionStatus === 'disconnected' && (
        <div className="bg-red-500 text-white p-3 text-center">
          <div className="flex items-center justify-center space-x-2">
            <span>⚠️ Cannot connect to backend server</span>
            <button 
              onClick={retryConnection}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
            >
              Retry
            </button>
          </div>
          <p className="text-sm mt-1">Make sure the backend server is running on port 5001</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-blue-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 16.5v-9l6 4.5-6 4.5z"/>
                </svg>
                <span className="ml-2 text-white text-xl font-bold">Google Indexing Tool</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400' : 
                connectionStatus === 'checking' ? 'bg-yellow-400' : 'bg-red-400'
              }`} title={
                connectionStatus === 'connected' ? 'Backend connected' :
                connectionStatus === 'checking' ? 'Checking connection' : 'Backend disconnected'
              }></div>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
                onClick={() => setActiveTab('dashboard')}
              >
                📊 Dashboard
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'urls'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
                onClick={() => { setActiveTab('urls'); fetchUrls(); }}
              >
                🔗 URLs
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'accounts'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
                onClick={() => setActiveTab('accounts')}
              >
                👥 Accounts
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
              <div className="flex space-x-2">
                <button
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                  onClick={fetchStats}
                  disabled={loading}
                >
                  🔄 Refresh
                </button>
                <button
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md transition-colors"
                  onClick={() => setShowSingleUrlForm(!showSingleUrlForm)}
                >
                  {showSingleUrlForm ? '📋 Hide Single URL' : '🔗 Add Single URL'}
                </button>
              </div>
            </div>

            {/* Single URL Form */}
            {showSingleUrlForm && (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <div className="flex items-center mb-4">
                  <div className="text-purple-500 text-xl mr-3">🔗</div>
                  <h3 className="text-lg font-semibold text-gray-900">Single URL Operations</h3>
                </div>
                
                {/* Single URL Result Display */}
                {singleUrlResult && (
                  <div className={`mb-4 p-4 rounded-lg ${
                    singleUrlResult.type === 'success' 
                      ? 'bg-green-50 border border-green-200 text-green-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span className="text-lg mr-2">
                            {singleUrlResult.type === 'success' ? '✅' : '❌'}
                          </span>
                          <strong>{singleUrlResult.message}</strong>
                        </div>
                        {singleUrlResult.details && (
                          <p className="mt-1 text-sm">{singleUrlResult.details}</p>
                        )}
                        {singleUrlResult.url && (
                          <p className="mt-1 text-sm truncate">
                            <strong>URL:</strong> {singleUrlResult.url}
                          </p>
                        )}
                        {singleUrlResult.output && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm font-medium">
                              View Details
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {singleUrlResult.output}
                            </pre>
                          </details>
                        )}
                      </div>
                      <button
                        onClick={clearSingleUrlResult}
                        className="text-gray-500 hover:text-gray-700 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter URL
                    </label>
                    <input
                      type="url"
                      value={singleUrl}
                      onChange={(e) => setSingleUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleIndexSingleUrl();
                        }
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Press Enter to index immediately
                    </p>
                  </div>
                  <div className="flex space-x-4">
                    <button
                      onClick={handleAddSingleUrl}
                      disabled={loading || !singleUrl.trim()}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      ) : null}
                      ➕ Add to Database
                    </button>
                    <button
                      onClick={handleIndexSingleUrl}
                      disabled={loading || !singleUrl.trim() || accounts.length === 0}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      ) : null}
                      🚀 Index Now
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>• <strong>Add to Database:</strong> Stores URL for batch processing</p>
                    <p>• <strong>Index Now:</strong> Immediately indexes the URL</p>
                    <p>• Requires at least one Google Service Account</p>
                  </div>
                </div>
              </div>
            )}

            {/* Python Script Status */}
            {pythonStatus.isRunning && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-center mb-2">
                  <div className="text-yellow-600 text-xl mr-2">🐍</div>
                  <h3 className="text-lg font-semibold text-yellow-800">Python Script Running</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress:</span>
                    <span>{pythonStatus.progress}%</span>
                  </div>
                  <div className="w-full bg-yellow-200 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${pythonStatus.progress}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-yellow-700">
                    <p>Current: {pythonStatus.currentAccount || 'Starting...'}</p>
                    <p>Running Time: {pythonStatus.runningTime}s</p>
                    <p>URLs: {pythonStatus.urlsProcessed}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-blue-500 text-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total URLs</p>
                    <p className="text-3xl font-bold">{stats.totalUrls || 0}</p>
                  </div>
                  <div className="text-blue-200 text-2xl">🔗</div>
                </div>
              </div>

              <div className="bg-green-500 text-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Successful</p>
                    <p className="text-3xl font-bold">{stats.successUrls || 0}</p>
                    <p className="text-green-100 text-xs mt-1">
                      Success Rate: {stats.successRate || 0}%
                    </p>
                  </div>
                  <div className="text-green-200 text-2xl">✅</div>
                </div>
              </div>

              <div className="bg-red-500 text-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-red-100 text-sm font-medium">Errors</p>
                    <p className="text-3xl font-bold">{stats.errorUrls || 0}</p>
                  </div>
                  <div className="text-red-200 text-2xl">❌</div>
                </div>
              </div>

              <div className="bg-yellow-500 text-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-yellow-100 text-sm font-medium">Pending</p>
                    <p className="text-3xl font-bold">{stats.pendingUrls || 0}</p>
                  </div>
                  <div className="text-yellow-200 text-2xl">⏳</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upload CSV Card */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center mb-4">
                  <div className="text-blue-500 text-xl mr-3">📁</div>
                  <h3 className="text-lg font-semibold text-gray-900">Upload CSV</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select CSV File
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      disabled={loading}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      CSV file must contain a column named "URL"
                    </p>
                  </div>
                  {uploadProgress > 0 && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-blue-500 h-4 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        >
                          <div className="text-xs text-white text-center leading-4">
                            {uploadProgress}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Start Indexing Card */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center mb-4">
                  <div className="text-green-500 text-xl mr-3">🚀</div>
                  <h3 className="text-lg font-semibold text-gray-900">Start Indexing</h3>
                </div>
                <div className="space-y-4">
                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    onClick={startIndexing}
                    disabled={loading || !stats.pendingUrls || pythonStatus.isRunning}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        🚀 Start Indexing
                      </>
                    )}
                  </button>
                  <div className="text-sm text-gray-600">
                    <p>📊 {stats.pendingUrls || 0} URLs pending indexing</p>
                    <p>👥 {stats.totalAccounts || 0} accounts available</p>
                    {pythonStatus.isRunning && (
                      <p className="text-yellow-600">🐍 Python script is currently running</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* URLs Tab */}
        {activeTab === 'urls' && (
          <div className="fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">URL Management</h2>
              <div className="flex items-center space-x-2">
                <span className="bg-gray-500 text-white px-2 py-1 rounded text-sm">
                  Total: {stats.totalUrls || 0}
                </span>
                <button
                  className="bg-gray-200 hover:bg-gray-300 p-2 rounded transition-colors"
                  onClick={fetchUrls}
                >
                  🔄
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date Added
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {urls.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center">
                          <div className="text-gray-400 text-4xl mb-4">📭</div>
                          <p className="text-gray-500 text-lg">No URLs found</p>
                          <p className="text-gray-400 text-sm mt-1">
                            Upload a CSV file or add single URLs to get started
                          </p>
                        </td>
                      </tr>
                    ) : (
                      urls.map((url, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                              {url.url}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              url.status === 'success' || url.status === 'completed' 
                                ? 'bg-green-100 text-green-800'
                                : url.status === 'error'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {url.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {url.accountUsed || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(url.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div className="fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Google Service Accounts</h2>
              <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
                {accounts.length} Accounts
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Upload Account Card */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center mb-4">
                  <div className="text-blue-500 text-xl mr-3">⬆️</div>
                  <h3 className="text-lg font-semibold text-gray-900">Upload New Account</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Service Account JSON File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleAccountUpload}
                    disabled={loading}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Upload your Google Service Account JSON file
                  </p>
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center mb-4">
                  <div className="text-yellow-500 text-xl mr-3">💡</div>
                  <h3 className="text-lg font-semibold text-gray-900">Account Information</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  Each account can process up to 200 URLs per day. Upload multiple accounts for bulk indexing.
                </p>
              </div>
            </div>

            {/* Accounts Table */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {accounts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="text-gray-400 text-4xl mb-4">👤</div>
                  <p className="text-gray-500 text-lg">No accounts configured</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Upload your first service account JSON file
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Account Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total URLs Processed
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Daily Quota Used
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Used
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accounts.map((account, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-blue-500 text-lg mr-3">👤</div>
                              <span className="text-sm font-medium text-gray-900">
                                {account.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
                              {account.totalUrlsProcessed}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              {account.dailyQuotaUsed}/200
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {account.lastUsed ? 
                              new Date(account.lastUsed).toLocaleString() : 'Never used'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              className="text-red-600 hover:text-red-900 transition-colors"
                              onClick={() => deleteAccount(account._id)}
                              title="Delete Account"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-500 text-sm">
            Google Indexing Tool &copy; 2024 | Built with React & Express
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;