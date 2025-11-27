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

  useEffect(() => {
    fetchStats();
    fetchAccounts();
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
    try {
      await axios.post(`${API_BASE}/upload-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('CSV uploaded successfully!');
      fetchStats();
    } catch (error) {
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
    }
  };

  const startIndexing = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/start-indexing`, {
        urlsPerAccount: 200
      });
      alert(`Indexing completed!\n\nResults:\nTotal: ${response.data.totalProcessed}\nSuccessful: ${response.data.successful}\nErrors: ${response.data.errors}\n429 Errors: ${response.data.error429}`);
      fetchStats();
    } catch (error) {
      alert('Error starting indexing');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid">
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
        <div className="container">
          <span className="navbar-brand">Google Indexing Tool</span>
          <div className="navbar-nav">
            <button 
              className={`nav-link btn btn-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={`nav-link btn btn-link ${activeTab === 'urls' ? 'active' : ''}`}
              onClick={() => { setActiveTab('urls'); fetchUrls(); }}
            >
              URLs
            </button>
            <button 
              className={`nav-link btn btn-link ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => setActiveTab('accounts')}
            >
              Accounts
            </button>
          </div>
        </div>
      </nav>

      <div className="container">
        {activeTab === 'dashboard' && (
          <div>
            <h2>Dashboard</h2>
            <div className="row">
              <div className="col-md-3">
                <div className="card text-white bg-primary mb-3">
                  <div className="card-body">
                    <h5 className="card-title">Total URLs</h5>
                    <h2 className="card-text">{stats.totalUrls || 0}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-white bg-success mb-3">
                  <div className="card-body">
                    <h5 className="card-title">Successful</h5>
                    <h2 className="card-text">{stats.successUrls || 0}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-white bg-danger mb-3">
                  <div className="card-body">
                    <h5 className="card-title">Errors</h5>
                    <h2 className="card-text">{stats.errorUrls || 0}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-white bg-warning mb-3">
                  <div className="card-body">
                    <h5 className="card-title">Pending</h5>
                    <h2 className="card-text">{stats.pendingUrls || 0}</h2>
                  </div>
                </div>
              </div>
            </div>

            <div className="row mt-4">
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h5>Upload CSV</h5>
                  </div>
                  <div className="card-body">
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleCSVUpload}
                      disabled={loading}
                      className="form-control"
                    />
                    <small className="form-text text-muted">
                      CSV file should have a column named "URL"
                    </small>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h5>Start Indexing</h5>
                  </div>
                  <div className="card-body">
                    <button 
                      className="btn btn-primary btn-lg w-100"
                      onClick={startIndexing}
                      disabled={loading || stats.pendingUrls === 0}
                    >
                      {loading ? 'Processing...' : 'Start Indexing'}
                    </button>
                    <small className="form-text text-muted">
                      {stats.pendingUrls || 0} URLs pending indexing
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'urls' && (
          <div>
            <h2>URLs Management</h2>
            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Account</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((url, index) => (
                    <tr key={index}>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {url.url}
                      </td>
                      <td>
                        <span className={`badge ${
                          url.status === 'success' ? 'bg-success' : 
                          url.status === 'error' ? 'bg-danger' : 'bg-warning'
                        }`}>
                          {url.status}
                        </span>
                      </td>
                      <td>{url.accountUsed || '-'}</td>
                      <td>{new Date(url.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'accounts' && (
          <div>
            <h2>Google Service Accounts</h2>
            
            <div className="card mb-4">
              <div className="card-header">
                <h5>Upload New Account JSON</h5>
              </div>
              <div className="card-body">
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleAccountUpload}
                  disabled={loading}
                  className="form-control"
                />
                <small className="form-text text-muted">
                  Upload your Google Service Account JSON file
                </small>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Total URLs Processed</th>
                    <th>Daily Quota Used</th>
                    <th>Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account, index) => (
                    <tr key={index}>
                      <td>{account.name}</td>
                      <td>{account.totalUrlsProcessed}</td>
                      <td>{account.dailyQuotaUsed}</td>
                      <td>
                        {account.lastUsed ? 
                          new Date(account.lastUsed).toLocaleString() : 'Never'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;