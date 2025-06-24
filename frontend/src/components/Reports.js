import React, { useState, useRef, useEffect } from 'react';
import { Camera, Download, Trash2, RefreshCw, CheckCircle, XCircle, AlertCircle, X, Eye, Smartphone } from 'lucide-react';

function ReceiptDetectionApp() {
  const [currentView, setCurrentView] = useState('home'); // 'home', 'camera', 'results', 'history'
  const [detectedReceipts, setDetectedReceipts] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastCapturedImage, setLastCapturedImage] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Detect if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isTouchDevice = 'ontouchstart' in window;
      const hasSmallScreen = window.innerWidth <= 768;
      
      setIsMobile(isMobileDevice || (isTouchDevice && hasSmallScreen));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Enhanced mobile camera detection
  const startCamera = async () => {
    // For mobile devices, prefer native camera app
    if (isMobile) {
      setDebugInfo('Mobile device detected - using native camera');
      setCurrentView('camera');
      return;
    }

    // Desktop camera code (existing logic)
    try {
      console.log('Starting desktop camera...');
      setCameraError('');
      setDebugInfo('Requesting camera access...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported by this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'environment'
        } 
      });
      
      console.log('Got camera stream:', stream);
      setDebugInfo('Camera stream acquired');
      streamRef.current = stream;
      
      setCurrentView('camera');
      
      setTimeout(() => {
        const video = videoRef.current;
        if (video && streamRef.current) {
          console.log('Setting up video element');
          setDebugInfo('Setting up video element...');
          
          video.srcObject = streamRef.current;
          
          const handleCanPlay = () => {
            console.log('Video can play - dimensions:', video.videoWidth, 'x', video.videoHeight);
            setDebugInfo(`Video ready: ${video.videoWidth}x${video.videoHeight}`);
            setCameraActive(true);
            video.removeEventListener('canplay', handleCanPlay);
          };
          
          const handleError = (e) => {
            console.error('Video error:', e);
            setDebugInfo('Video error: ' + e.message);
            setCameraError('Video playback error');
          };
          
          video.addEventListener('canplay', handleCanPlay);
          video.addEventListener('error', handleError);
          
          video.play().catch(e => {
            console.error('Video play error:', e);
            setDebugInfo('Video play error: ' + e.message);
          });
          
          setTimeout(() => {
            if (!cameraActive && streamRef.current) {
              console.log('Fallback: forcing camera active');
              setDebugInfo('Fallback: forcing camera active');
              setCameraActive(true);
            }
          }, 3000);
        } else {
          console.error('Video ref or stream not available');
          setDebugInfo('Error: Video element or stream not available');
        }
      }, 500);
      
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError(error.message);
      setDebugInfo('Camera error: ' + error.message);
      setCurrentView('camera');
      return false;
    }
  };

  // Handle mobile camera capture
  const handleMobileCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file selection from mobile camera
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setProcessing(true);
    setDebugInfo('Processing image from mobile camera...');

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target.result;
        setLastCapturedImage(imageData);
        
        // Process the image
        await processImage(imageData);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing mobile image:', error);
      setDebugInfo('Error: ' + error.message);
      setProcessing(false);
    }
  };

  // Process image (common function for both mobile and desktop)
  const processImage = async (imageData) => {
    setDebugInfo('Sending image to backend...');
    
    try {
      const response = await fetch('https://2c6a-24-35-46-77.ngrok-free.app/detect-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          image: imageData,
          timestamp: new Date().toISOString()
        }),
      });

      setDebugInfo(`Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HTTP Error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      console.log('Detection result:', result);
      setDebugInfo('Detection successful!');

      if (result.cards && result.cards.length > 0) {
        setDetectedReceipts(result.cards);
        setConnectionStatus('connected');

        const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
        const newCsvEntries = result.cards.map(card => ({
          timestamp,
          item: card.label,
          confidence: `${card.confidence}%`,
          type: card.rank,
          category: card.suit
        }));
        setCsvData(prev => [...prev, ...newCsvEntries]);
      } else {
        setDetectedReceipts([]);
        setConnectionStatus('connected');
      }

    } catch (error) {
      console.error('Error during detection:', error);
      setConnectionStatus('error');
      setDebugInfo('Error: ' + error.message);
      
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        console.log('Backend not available, using simulation');
        setDebugInfo('Backend not available, using simulation');
        simulateDetection();
      } else {
        alert('Detection failed: ' + error.message);
      }
    } finally {
      setProcessing(false);
      stopCamera();
      setCurrentView('results');
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    console.log('Stopping camera...');
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setCameraActive(false);
    setCameraError('');
    setDebugInfo('');
    setCurrentView('home');
  };

  // Enhanced capture for desktop
  const captureAndDetect = async () => {
    if (!cameraActive || !videoRef.current || !canvasRef.current) {
      alert('Camera not ready. Please ensure camera is active.');
      return;
    }

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert('Video not ready - no dimensions available');
      return;
    }

    setProcessing(true);
    setDetectedReceipts([]);
    setDebugInfo('Capturing image...');

    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      setLastCapturedImage(imageData);
      
      await processImage(imageData);
    } catch (error) {
      console.error('Error during capture:', error);
      setProcessing(false);
    }
  };

  // Simulate detection for demo purposes
  const simulateDetection = () => {
    const possibleItems = [
      { label: 'Coffee', type: 'Beverage', category: 'Food', confidence: 85.2 + Math.random() * 10 },
      { label: 'Sandwich', type: 'Food', category: 'Food', confidence: 92.7 + Math.random() * 5 },
      { label: 'Gas', type: 'Fuel', category: 'Transportation', confidence: 78.3 + Math.random() * 15 },
      { label: 'Groceries', type: 'Food', category: 'Food', confidence: 89.1 + Math.random() * 8 },
      { label: 'Pharmacy', type: 'Medicine', category: 'Health', confidence: 84.5 + Math.random() * 12 }
    ];

    const numItems = Math.floor(Math.random() * 3) + 1;
    const mockItems = possibleItems.slice(0, numItems).map(item => ({
      ...item,
      confidence: Math.round(item.confidence * 100) / 100
    }));

    setDetectedReceipts(mockItems);
    setConnectionStatus('simulation');

    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const newCsvEntries = mockItems.map(item => ({
      timestamp,
      item: item.label,
      confidence: `${item.confidence}%`,
      type: item.type,
      category: item.category
    }));
    setCsvData(prev => [...prev, ...newCsvEntries]);
  };

  // Download CSV data
  const downloadCSV = () => {
    if (csvData.length === 0) {
      alert('No data to download');
      return;
    }

    const csvContent = 'Timestamp,Item,Type,Category,Confidence\n' + 
      csvData.map(row => `${row.timestamp},${row.item},${row.type},${row.category},${row.confidence}`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipt_detections.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Clear all data
  const clearData = () => {
    setCsvData([]);
    setDetectedReceipts([]);
    setLastCapturedImage(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Home View
  const HomeView = () => (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-semibold mb-4">Receipt Detection</h2>
        
        {/* Mobile/Desktop indicator */}
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-blue-800">
            <Smartphone className="w-4 h-4" />
            <span className="text-sm">
              {isMobile ? 'Mobile Device - Using Native Camera' : 'Desktop Device - Using Web Camera'}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={startCamera}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Camera className="w-5 h-5" />
            {isMobile ? 'Open Camera' : 'Start Camera'}
          </button>
          
          <button
            onClick={() => setCurrentView('results')}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Eye className="w-5 h-5" />
            View Results
          </button>
          
          <button
            onClick={() => setCurrentView('history')}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Eye className="w-5 h-5" />
            View Past Receipts
          </button>
        </div>
      </div>
    </div>
  );

  // Camera View - Different for mobile vs desktop
  const CameraView = () => {
    if (currentView !== 'camera') return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold">Capture Receipt</h2>
            <button
              onClick={stopCamera}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6">
            {/* Debug Info */}
            {debugInfo && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">Debug: {debugInfo}</p>
              </div>
            )}
            
            {isMobile ? (
              // Mobile Camera Interface
              <div className="text-center">
                <div className="mb-6 p-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">
                    Take a Photo
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    This will open your device's camera app
                  </p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  <button
                    onClick={handleMobileCapture}
                    disabled={processing}
                    className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                      processing
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {processing ? 'Processing...' : 'Open Camera'}
                  </button>
                </div>
                
                <p className="text-xs text-gray-500">
                  Position your receipt clearly in the camera frame before taking the photo
                </p>
              </div>
            ) : (
              // Desktop Camera Interface (existing code)
              <>
                <div className="relative bg-gray-900 rounded-lg overflow-hidden mb-4" style={{ aspectRatio: '4/3' }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-75">
                      <div className="text-center text-white p-4">
                        <XCircle className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-lg font-medium mb-2">Camera Error</p>
                        <p className="text-sm">{cameraError}</p>
                        <button
                          onClick={stopCamera}
                          className="mt-4 px-4 py-2 bg-white text-red-900 rounded-lg hover:bg-gray-100"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {!cameraActive && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <div className="text-center text-white">
                        <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <span>Loading camera...</span>
                      </div>
                    </div>
                  )}
                  
                  {processing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                      <div className="text-center text-white">
                        <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={captureAndDetect}
                    disabled={!cameraActive || processing}
                    className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                      !cameraActive || processing
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {processing ? 'Processing...' : 'Capture Receipt'}
                  </button>
                  
                  <button
                    onClick={stopCamera}
                    className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                
                {cameraActive && (
                  <p className="text-sm text-gray-600 text-center mt-2">
                    Camera is active - position your receipt in the frame
                  </p>
                )}
              </>
            )}
            
            {processing && (
              <div className="mt-4 text-center">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-blue-600" />
                <p className="text-sm text-gray-600">Processing your image...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Results View (unchanged)
  const ResultsView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Detection Results</h2>
        <div className="flex gap-3">
          <button
            onClick={downloadCSV}
            disabled={csvData.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              csvData.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
          <button
            onClick={() => setCurrentView('home')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-6">
        {lastCapturedImage && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-700 mb-3">Last Captured Image:</h3>
            <img 
              src={lastCapturedImage} 
              alt="Last capture" 
              className="w-full max-w-md h-48 object-cover rounded-lg border mx-auto"
            />
          </div>
        )}
        
        <div className="space-y-3">
          {detectedReceipts.length > 0 ? (
            detectedReceipts.map((item, index) => (
              <div
                key={index}
                className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg">{item.label}</h3>
                    <p className="text-sm text-gray-600">Type: {item.type || item.rank}</p>
                    <p className="text-sm text-gray-600">Category: {item.category || item.suit}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      {item.confidence}%
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Camera className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No receipts detected</p>
              <p className="text-sm">Capture a photo to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // History View (unchanged)
  const HistoryView = () => (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Receipt History</h2>
        <div className="flex gap-3">
          <button
            onClick={clearData}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
          <button
            onClick={() => setCurrentView('home')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-6">
        {csvData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {csvData.slice().reverse().map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {new Date(row.timestamp.slice(0,8) + 'T' + row.timestamp.slice(9,15).replace(/(.{2})/g, '$1:')).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.item}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {row.type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {row.category}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                        {row.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No receipt history available</p>
            <p className="text-sm">Start capturing receipts to see them here</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Receipt Detection System</h1>
          <p className="text-gray-600">Mobile-First Design - Optimized for Phone Cameras</p>
        </header>

        {currentView === 'home' && <HomeView />}
        {currentView === 'results' && <ResultsView />}
        {currentView === 'history' && <HistoryView />}
        
        {/* Camera Modal - renders over other views */}
        <CameraView />
      </div>
    </div>
  );
}

export default ReceiptDetectionApp;