import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({});
  const [urls, setUrls] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    fetchStats();
    fetchAccounts();
    fetchUrls();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/accounts`);
      setAccounts(response.data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchUrls = async (page = 1) => {
    try {
      const response = await axios.get(`${API_BASE}/urls?page=${page}&limit=50`);
      setUrls(response.data.urls);
    } catch (error) {
      console.error('Error fetching URLs:', error);
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
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await axios.post(`${API_BASE}/upload-csv`, formData, {
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
      alert('Error uploading CSV');
      console.error(error);
    } finally {
      setLoading(false);
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
      await axios.post(`${API_BASE}/upload-account`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('Account JSON uploaded successfully!');
      fetchAccounts();
    } catch (error) {
      alert('Error uploading account JSON');
      console.error(error);
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const startIndexing = async () => {
    if (!window.confirm('Are you sure you want to start indexing? This may take several minutes.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/start-indexing`, {
        urlsPerAccount: 200
      });
      
      alert(`Indexing completed!\n\nResults:\n${response.data.output || 'Check console for details'}`);
      fetchStats();
      fetchUrls();
    } catch (error) {
      alert('Error starting indexing');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (accountId) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        // You'll need to add this endpoint to your backend
        await axios.delete(`${API_BASE}/accounts/${accountId}`);
        alert('Account deleted successfully!');
        fetchAccounts();
      } catch (error) {
        alert('Error deleting account');
        console.error(error);
      }
    }
  };

  return (
    <div className="container-fluid">
      {/* Navigation */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4 shadow">
        <div className="container">
          <span className="navbar-brand">
            <i className="fas fa-google me-2"></i>
            Google Indexing Tool
          </span>
          <div className="navbar-nav ms-auto">
            <button 
              className={`nav-link btn btn-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <i className="fas fa-tachometer-alt me-1"></i> Dashboard
            </button>
            <button 
              className={`nav-link btn btn-link ${activeTab === 'urls' ? 'active' : ''}`}
              onClick={() => { setActiveTab('urls'); fetchUrls(); }}
            >
              <i className="fas fa-link me-1"></i> URLs
            </button>
            <button 
              className={`nav-link btn btn-link ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => setActiveTab('accounts')}
            >
              <i className="fas fa-user-circle me-1"></i> Accounts
            </button>
          </div>
        </div>
      </nav>

      <div className="container">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2><i className="fas fa-tachometer-alt me-2"></i>Dashboard</h2>
              <button 
                className="btn btn-success"
                onClick={fetchStats}
                disabled={loading}
              >
                <i className="fas fa-sync-alt me-1"></i> Refresh
              </button>
            </div>

            {/* Stats Cards */}
            <div className="row mb-4">
              <div className="col-md-3 mb-3">
                <div className="card text-white bg-primary h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <div>
                        <h5 className="card-title">Total URLs</h5>
                        <h2 className="card-text">{stats.totalUrls || 0}</h2>
                      </div>
                      <i className="fas fa-link fa-2x opacity-50"></i>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-3 mb-3">
                <div className="card text-white bg-success h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <div>
                        <h5 className="card-title">Successful</h5>
                        <h2 className="card-text">{stats.successUrls || 0}</h2>
                        <small>Success Rate: {stats.successRate || 0}%</small>
                      </div>
                      <i className="fas fa-check-circle fa-2x opacity-50"></i>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-3 mb-3">
                <div className="card text-white bg-danger h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <div>
                        <h5 className="card-title">Errors</h5>
                        <h2 className="card-text">{stats.errorUrls || 0}</h2>
                      </div>
                      <i className="fas fa-exclamation-triangle fa-2x opacity-50"></i>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-3 mb-3">
                <div className="card text-white bg-warning h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <div>
                        <h5 className="card-title">Pending</h5>
                        <h2 className="card-text">{stats.pendingUrls || 0}</h2>
                      </div>
                      <i className="fas fa-clock fa-2x opacity-50"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="row">
              <div className="col-md-6">
                <div className="card shadow-sm">
                  <div className="card-header bg-light">
                    <h5 className="mb-0"><i className="fas fa-file-csv me-2"></i>Upload CSV</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Select CSV File</label>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleCSVUpload}
                        disabled={loading}
                        className="form-control"
                      />
                      <div className="form-text">
                        CSV file must contain a column named "URL"
                      </div>
                    </div>
                    {uploadProgress > 0 && (
                      <div className="mt-3">
                        <div className="progress">
                          <div 
                            className="progress-bar progress-bar-striped progress-bar-animated" 
                            style={{ width: `${uploadProgress}%` }}
                          >
                            {uploadProgress}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="card shadow-sm">
                  <div className="card-header bg-light">
                    <h5 className="mb-0"><i className="fas fa-play-circle me-2"></i>Start Indexing</h5>
                  </div>
                  <div className="card-body">
                    <div className="d-grid gap-2">
                      <button 
                        className="btn btn-primary btn-lg"
                        onClick={startIndexing}
                        disabled={loading || !stats.pendingUrls}
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                            Processing...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-play me-2"></i>
                            Start Indexing
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-2">
                      <small className="text-muted">
                        <i className="fas fa-info-circle me-1"></i>
                        {stats.pendingUrls || 0} URLs pending indexing • {stats.totalAccounts || 0} accounts available
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* URLs Tab */}
        {activeTab === 'urls' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2><i className="fas fa-link me-2"></i>URL Management</h2>
              <div>
                <span className="badge bg-secondary me-2">Total: {stats.totalUrls || 0}</span>
                <button className="btn btn-sm btn-outline-secondary" onClick={fetchUrls}>
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>

            <div className="card shadow-sm">
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead className="table-light">
                      <tr>
                        <th>URL</th>
                        <th>Status</th>
                        <th>Account</th>
                        <th>Date Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {urls.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-center text-muted py-4">
                            <i className="fas fa-inbox fa-3x mb-3"></i>
                            <br />
                            No URLs found. Upload a CSV file to get started.
                          </td>
                        </tr>
                      ) : (
                        urls.map((url, index) => (
                          <tr key={index}>
                            <td style={{ maxWidth: '400px' }}>
                              <div className="text-truncate" title={url.url}>
                                {url.url}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${
                                url.status === 'success' || url.status === 'completed' ? 'bg-success' : 
                                url.status === 'error' ? 'bg-danger' : 'bg-warning'
                              }`}>
                                {url.status}
                              </span>
                            </td>
                            <td>{url.accountUsed || '-'}</td>
                            <td>
                              <small>{new Date(url.createdAt).toLocaleDateString()}</small>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2><i className="fas fa-user-circle me-2"></i>Google Service Accounts</h2>
              <span className="badge bg-primary">{accounts.length} Accounts</span>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="card shadow-sm mb-4">
                  <div className="card-header bg-light">
                    <h5 className="mb-0"><i className="fas fa-upload me-2"></i>Upload New Account</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Select Service Account JSON File</label>
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={handleAccountUpload}
                        disabled={loading}
                        className="form-control"
                      />
                      <div className="form-text">
                        Upload your Google Service Account JSON file
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="card shadow-sm">
                  <div className="card-header bg-light">
                    <h5 className="mb-0"><i className="fas fa-info-circle me-2"></i>Account Information</h5>
                  </div>
                  <div className="card-body">
                    <p className="text-muted">
                      <small>
                        <i className="fas fa-lightbulb me-1"></i>
                        Each account can process up to 200 URLs per day. Upload multiple accounts for bulk indexing.
                      </small>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm">
              <div className="card-body">
                {accounts.length === 0 ? (
                  <div className="text-center text-muted py-5">
                    <i className="fas fa-user-slash fa-3x mb-3"></i>
                    <br />
                    No accounts configured. Upload your first service account JSON file.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead className="table-light">
                        <tr>
                          <th>Account Name</th>
                          <th>Total URLs Processed</th>
                          <th>Daily Quota Used</th>
                          <th>Last Used</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((account, index) => (
                          <tr key={index}>
                            <td>
                              <i className="fas fa-user-circle me-2 text-primary"></i>
                              {account.name}
                            </td>
                            <td>
                              <span className="badge bg-secondary">{account.totalUrlsProcessed}</span>
                            </td>
                            <td>
                              <span className="badge bg-info">{account.dailyQuotaUsed}/200</span>
                            </td>
                            <td>
                              <small>
                                {account.lastUsed ? 
                                  new Date(account.lastUsed).toLocaleString() : 'Never used'
                                }
                              </small>
                            </td>
                            <td>
                              <button 
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => deleteAccount(account._id)}
                                title="Delete Account"
                              >
                                <i className="fas fa-trash"></i>
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
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-5 py-3 bg-light border-top">
        <div className="container text-center">
          <small className="text-muted">
            Google Indexing Tool &copy; 2024 | Built with React & Express
          </small>
        </div>
      </footer>
    </div>
  );
}

export default App;