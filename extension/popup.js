// popup.js - Enhanced version with fixes for email scanning

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Clean up old analysis results (keep only last 10)
  await cleanupOldResults();
  
  // Load saved settings
  const stored = await chrome.storage.local.get([
    'or_api_key', 
    'or_endpoint', 
    'or_model', 
    'user_threshold'
  ]);
  
  // Populate form fields
  const apiKeyEl = document.getElementById('apiKey');
  const endpointEl = document.getElementById('endpoint');
  const modelEl = document.getElementById('model');
  const thresholdEl = document.getElementById('threshold');
  
  if (stored.or_api_key) {
    apiKeyEl.value = stored.or_api_key;
    showStatus('key-status', 'API key configured', 'success');
  }
  endpointEl.value = stored.or_endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  modelEl.value = stored.or_model || 'meta-llama/llama-3.2-3b-instruct:free';
  thresholdEl.value = stored.user_threshold || 70; // Higher default threshold
  
  // Load last analysis result if available
  loadLastResult();
  
  // Event listeners
  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('clear').addEventListener('click', clearApiKey);
  document.getElementById('scan-btn').addEventListener('click', scanEmail);
  
  // Check if we're on a supported email page
  checkEmailPage();
}

async function cleanupOldResults() {
  const storage = await chrome.storage.local.get(null);
  const analysisKeys = Object.keys(storage)
    .filter(k => k.startsWith('analysis_'))
    .sort()
    .reverse();
  
  // Keep only last 10 results
  if (analysisKeys.length > 10) {
    const keysToRemove = analysisKeys.slice(10);
    await chrome.storage.local.remove(keysToRemove);
    console.log(`Cleaned up ${keysToRemove.length} old analysis results`);
  }
}

async function saveSettings() {
  const apiKeyEl = document.getElementById('apiKey');
  const endpointEl = document.getElementById('endpoint');
  const modelEl = document.getElementById('model');
  const thresholdEl = document.getElementById('threshold');
  
  const k = apiKeyEl.value.trim();
  const e = endpointEl.value.trim();
  const m = modelEl.value.trim();
  const t = Math.max(1, Math.min(100, parseInt(thresholdEl.value, 10) || 70));
  
  if (!k) {
    showStatus('key-status', 'Please enter an API key', 'error');
    return;
  }
  
  if (!k.startsWith('sk-or-')) {
    showStatus('key-status', 'Invalid API key format (should start with sk-or-)', 'error');
    return;
  }
  
  await chrome.storage.local.set({ 
    or_api_key: k, 
    or_endpoint: e, 
    or_model: m, 
    user_threshold: t 
  });
  
  showStatus('key-status', '✓ Settings saved successfully', 'success');
}

async function clearApiKey() {
  await chrome.storage.local.remove(['or_api_key']);
  document.getElementById('apiKey').value = '';
  showStatus('key-status', 'API key cleared', 'info');
}

async function scanEmail() {
  const { or_api_key } = await chrome.storage.local.get('or_api_key');
  
  if (!or_api_key) {
    showStatus('scan-status', 'Please configure your API key first', 'error');
    return;
  }
  
  // Clear old results display
  document.getElementById('results-section').style.display = 'none';
  
  const scanBtn = document.getElementById('scan-btn');
  scanBtn.disabled = true;
  scanBtn.innerHTML = '<span class="btn-icon">⏳</span> Scanning...';
  
  showStatus('scan-status', 'Analyzing email...', 'info');
  
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('mail.google.com') && 
        !tab.url.includes('outlook.live.com') && 
        !tab.url.includes('outlook.office.com')) {
      throw new Error('Please open Gmail or Outlook to scan emails');
    }
    
    // Inject and execute scan
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.scanCurrentEmail) {
          return window.scanCurrentEmail();
        }
        throw new Error('Scan function not available');
      }
    });
    
    // Get result from injection
    if (result && result[0] && result[0].result) {
      displayResult(result[0].result);
      showStatus('scan-status', 'Analysis complete!', 'success');
    } else {
      // Fallback: wait for storage update
      await pollForResult();
    }
    
  } catch (error) {
    console.error('Scan error:', error);
    showStatus('scan-status', `Error: ${error.message}`, 'error');
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="btn-icon">🔍</span> Scan Current Email';
  }
}

async function pollForResult() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const interval = setInterval(async () => {
      attempts++;
      
      // Get all analysis results
      const storage = await chrome.storage.local.get(null);
      const analysisKeys = Object.keys(storage).filter(k => k.startsWith('analysis_'));
      
      if (analysisKeys.length > 0) {
        // Get most recent analysis
        const latestKey = analysisKeys.sort().pop();
        const result = storage[latestKey];
        
        displayResult(result);
        showStatus('scan-status', 'Analysis complete!', 'success');
        clearInterval(interval);
        resolve();
      } else if (attempts >= maxAttempts) {
        showStatus('scan-status', 'Analysis timed out. Please try again.', 'error');
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

async function loadLastResult() {
  const storage = await chrome.storage.local.get(null);
  const analysisKeys = Object.keys(storage).filter(k => k.startsWith('analysis_'));
  
  if (analysisKeys.length > 0) {
    const latestKey = analysisKeys.sort().pop();
    const result = storage[latestKey];
    displayResult(result);
  }
}

function displayResult(result) {
  const resultsSection = document.getElementById('results-section');
  const resultCard = document.getElementById('result-card');
  const resultHeader = resultCard.querySelector('.result-header');
  const resultIcon = document.getElementById('result-icon');
  const resultTitle = document.getElementById('result-title');
  const confidenceFill = document.getElementById('confidence-fill');
  const confidenceText = document.getElementById('confidence-text');
  const recommendationText = document.getElementById('recommendation-text');
  const indicatorsList = document.getElementById('indicators-list');
  const indicatorsSection = document.getElementById('indicators-section');
  
  // Show results section
  resultsSection.style.display = 'block';
  
  // Set header style
  resultHeader.className = `result-header ${result.isPhishing ? 'danger' : 'safe'}`;
  resultIcon.textContent = result.isPhishing ? '⚠️' : '✅';
  resultTitle.textContent = result.isPhishing ? 'Potential Phishing Detected' : 'Email Appears Safe';
  
  // Set confidence bar
  const confidence = result.confidence || 0;
  confidenceFill.style.width = `${confidence}%`;
  
  // Color code confidence
  if (confidence >= 80) {
    confidenceFill.style.background = result.isPhishing ? '#ef4444' : '#10b981';
  } else if (confidence >= 50) {
    confidenceFill.style.background = '#f59e0b';
  } else {
    confidenceFill.style.background = '#6b7280';
  }
  
  confidenceText.textContent = `${confidence}% confidence`;
  
  // Set recommendation
  recommendationText.textContent = result.recommendation || 'No specific recommendation';
  
  // Set indicators
  if (result.indicators && result.indicators.length > 0) {
    indicatorsSection.style.display = 'block';
    indicatorsList.innerHTML = result.indicators
      .map(indicator => `<li>${indicator}</li>`)
      .join('');
  } else {
    indicatorsSection.style.display = 'none';
  }
  
  // Update stats
  const timestamp = new Date(result.timestamp).toLocaleString();
  document.getElementById('stats-text').textContent = `Last scan: ${timestamp}`;
}

function showStatus(elementId, message, type) {
  const statusEl = document.getElementById(elementId);
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status-message show ${type}`;
  
  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 5000);
}

async function checkEmailPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isEmailPage = tab.url.includes('mail.google.com') || 
                        tab.url.includes('outlook.live.com') || 
                        tab.url.includes('outlook.office.com');
    
    if (!isEmailPage) {
      showStatus('scan-status', 'Open Gmail or Outlook to scan emails', 'info');
    }
  } catch (error) {
    console.error('Error checking page:', error);
  }
}