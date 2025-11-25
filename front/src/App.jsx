import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Link, 
  History, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('single');
  const [url, setUrl] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);

  // Fetch previous requests
  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests');
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!url) {
      setMessage('Please enter a URL');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch('/api/submit-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ URL submitted successfully! Request ID: ${data.requestId}`);
        setUrl('');
      } else {
        setMessage(`❌ ${data.error || 'Submission failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error. Please check if backend server is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvSubmit = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      setMessage('Please select a CSV file');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    const formData = new FormData();
    formData.append('csvFile', csvFile);

    try {
      const response = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ CSV uploaded successfully! ${data.totalUrls} URLs submitted. Request ID: ${data.requestId}`);
        setCsvFile(null);
        document.getElementById('csvFile').value = '';
      } else {
        setMessage(`❌ ${data.error || 'Upload failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error. Please check if backend server is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mr-3">
              <Link className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Google Indexing API</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Submit URLs for Google indexing with real-time progress tracking
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-8">
            {/* Tabs Container */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              {/* Tabs Header */}
              <div className="flex border-b border-gray-200">
                <button
                  className={`flex-1 py-4 font-medium text-center flex items-center justify-center gap-2 ${
                    activeTab === 'single'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveTab('single')}
                >
                  <Link className="w-5 h-5" />
                  Single URL
                </button>
                <button
                  className={`flex-1 py-4 font-medium text-center flex items-center justify-center gap-2 ${
                    activeTab === 'batch'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveTab('batch')}
                >
                  <Upload className="w-5 h-5" />
                  Batch CSV
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Single URL Form */}
                {activeTab === 'single' && (
                  <form onSubmit={handleSingleSubmit} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Enter URL to Index
                      </label>
                      <div className="relative">
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://example.com/page"
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                          required
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                          <Link className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Enter the complete URL you want to index in Google
                      </p>
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isSubmitting || !url}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition duration-200 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Submit for Indexing
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* CSV Upload Form */}
                {activeTab === 'batch' && (
                  <form onSubmit={handleCsvSubmit} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Upload CSV File
                      </label>
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition duration-200 bg-gray-50">
                        <input
                          id="csvFile"
                          type="file"
                          accept=".csv"
                          onChange={(e) => setCsvFile(e.target.files[0])}
                          className="hidden"
                        />
                        <label htmlFor="csvFile" className={`cursor-pointer block ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600 font-medium">Click to upload CSV file</p>
                          <p className="text-sm text-gray-400 mt-1">
                            CSV should contain a column named "URL"
                          </p>
                        </label>
                      </div>
                      {csvFile && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-green-700 text-sm font-medium">
                            ✅ Selected: {csvFile.name}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !csvFile}
                      className="w-full bg-green-600 text-white py-3 px-6 rounded-xl hover:bg-green-700 focus:ring-4 focus:ring-green-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition duration-200 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Upload & Process CSV
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Status Message */}
            {message && (
              <div className={`p-4 rounded-xl border ${
                message.includes('✅') 
                  ? 'bg-green-50 text-green-800 border-green-200' 
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                <div className="flex items-center">
                  {message.includes('✅') ? (
                    <CheckCircle className="w-5 h-5 mr-3" />
                  ) : (
                    <XCircle className="w-5 h-5 mr-3" />
                  )}
                  <span className="font-medium">{message}</span>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                How to Use
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">For Single URL:</p>
                  <ul className="space-y-1 ml-4">
                    <li>• Enter complete URL with https://</li>
                    <li>• Click Submit for Indexing</li>
                    <li>• Monitor progress in Request History</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">For CSV Upload:</p>
                  <ul className="space-y-1 ml-4">
                    <li>• CSV must have "URL" column</li>
                    <li>• One URL per line</li>
                    <li>• Maximum 200 URLs per account</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Request History */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                Request History
              </h3>
              <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                {requests.length} total
              </span>
            </div>
            
            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium">No requests yet</p>
                <p className="text-sm mt-1">Submit URLs to see history here</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {requests.map((request) => (
                  <div key={request.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(request.status)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTime(request.createdAt)}
                      </span>
                    </div>
                    
                    {request.type === 'single' ? (
                      <div>
                        <p className="text-sm text-gray-700 font-mono truncate" title={request.url}>
                          {request.url}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Single URL</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {request.totalUrls} URLs
                        </p>
                        {request.results ? (
                          <div className="text-xs text-gray-500 mt-1 flex gap-4">
                            <span className="text-green-600">✓ {request.results.successful} successful</span>
                            <span className="text-yellow-600">⚠ {request.results.error429} rate limited</span>
                          </div>
                        ) : request.status === 'pending' ? (
                          <div className="flex items-center gap-2 mt-2">
                            <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                            <span className="text-xs text-blue-600">Processing...</span>
                          </div>
                        ) : null}
                      </div>
                    )}
                    
                    {request.error && (
                      <p className="text-xs text-red-600 mt-2 truncate" title={request.error}>
                        Error: {request.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-12 bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">{requests.length}</p>
              <p className="text-sm text-gray-600">Total Requests</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {requests.filter(r => r.status === 'completed').length}
              </p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {requests.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {requests.filter(r => r.status === 'failed').length}
              </p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;