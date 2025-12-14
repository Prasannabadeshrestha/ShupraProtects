// content.js - Email phishing detection with auto-scan

let emailService = null;
let scanButton = null;
let resultBanner = null;
let lastScannedKey = null;

// Initialize
initialize();

function initialize() {
  emailService = detectPlatform();

  if (emailService) {
    console.log(`Phishing Detector: Running on ${emailService}`);
    injectScanButton();
    startAutoScan();
  } else {
    console.log('Phishing Detector: Unsupported email service');
  }
}

// Helper for UTF-8 safe Base64 encoding
function utf8ToBase64(str) {
  try {
    const utf8Bytes = new TextEncoder().encode(str);
    const binaryString = String.fromCharCode.apply(null, utf8Bytes);
    return btoa(binaryString);
  } catch (e) {
    console.error("Error in UTF-8 Base64 encoding:", e);
    return btoa(encodeURIComponent(str));
  }
}

// Detect platform
function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('mail.google.com')) return 'gmail';
  if (host.includes('outlook.live.com') || host.includes('outlook.office.com')) return 'outlook';
  return null;
}

// Helper to get text content safely
function textContent(el) {
  return el ? (el.innerText || el.textContent || '') : '';
}

// Extract Gmail data
function getGmailData() {
  try {
    // Look for the currently active email subject/body elements
    const subjectEl = document.querySelector('h2.hP') || document.querySelector('.hP');
    const bodyEl = document.querySelector('.a3s.aiL') || document.querySelector("div[role='main'] .a3s");
    const fromEl = document.querySelector('.gD') || document.querySelector('[email]');

    const subject = textContent(subjectEl).trim();
    const body = textContent(bodyEl).trim();
    const from = fromEl ? (fromEl.getAttribute('email') || textContent(fromEl).trim()) : '';

    // If no subject/body is found, we might be in the inbox view
    if (!subject && !body) return null;

    // Extract links
    const linkElements = document.querySelectorAll('.a3s.aiL a, [data-message-id] a');
    const links = Array.from(linkElements)
      .map(a => a.href)
      .filter(href => href && href.startsWith('http'));

    return { subject, body, from, links, service: 'gmail' };
  } catch (error) {
    console.error('Error extracting Gmail data:', error);
    return null;
  }
}

// Extract Outlook data
function getOutlookData() {
  try {
    // Look for the currently active email subject/body elements
    const subjectEl = document.querySelector("div[role='heading'][aria-level='1']") || document.querySelector('div._3W2');
    const bodyEl = document.querySelector("div[aria-label='Message body']") || document.querySelector("div[role='main'] div[dir='auto']");
    const fromEl = document.querySelector("div[role='article'] span[role='link']") || document.querySelector('div._3t0 span');

    const subject = textContent(subjectEl).trim();
    const body = textContent(bodyEl).trim();
    const from = textContent(fromEl).trim();

    // If no subject/body is found, we might be in the inbox view
    if (!subject && !body) return null;

    // Extract links
    const linkElements = document.querySelectorAll("div[aria-label='Message body'] a, div[role='main'] a");
    const links = Array.from(linkElements)
      .map(a => a.href)
      .filter(href => href && href.startsWith('http'));

    return { subject, body, from, links, service: 'outlook' };
  } catch (error) {
    console.error('Error extracting Outlook data:', error);
    return null;
  }
}

// Extract email data based on platform
function extractEmailData() {
  if (emailService === 'gmail') {
    return getGmailData();
  } else if (emailService === 'outlook') {
    return getOutlookData();
  }
  return null;
}

// Generate unique key for email
function generateEmailKey(emailData) {
  if (!emailData) return null;
  return `${emailData.subject}_${emailData.from}_${emailData.body.substring(0, 100)}`;
}

// Start auto-scan observer
function startAutoScan() {
  const observer = new MutationObserver(() => {
    try {
      const emailData = extractEmailData();
      
      // FIX 1A: If no email data is found (e.g., user is in inbox view), reset key and banner
      if (!emailData) {
        if (lastScannedKey !== null) {
          console.log('Detected navigation away from email. Resetting state.');
          lastScannedKey = null;
          removeResultBanner();
        }
        return;
      }

      const emailKey = generateEmailKey(emailData);

      // FIX 1B: Check if the email key has changed. If it has, remove the old banner.
      if (emailKey !== lastScannedKey) {
        removeResultBanner();
      }
      
      // Skip if already scanned this email
      if (emailKey === lastScannedKey) {
        return;
      }

      lastScannedKey = emailKey;
      
      console.log('Auto-scanning new email:', emailData.subject);

      // Add unique ID
      emailData.emailId = utf8ToBase64(emailKey).substring(0, 20);

      // Send to background for analysis
      chrome.runtime.sendMessage(
        {
          action: 'analyzeEmail',
          emailData: emailData
        },
        (response) => {
          if (!response) {
             // This can happen on timeout/disconnect, but the main timeout fix is in the listener below.
             console.error('Analysis message failed to return a response.');
             return;
          }

          if (response.success) {
            displayInlineResults(response.result);
          } else {
            console.warn('Analysis failed:', response.error);
            showError(response.error);
          }
        }
      );

    } catch (error) {
      console.error('Auto-scan error:', error);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Inject scan button
function injectScanButton() {
  let targetElement = null;

  if (emailService === 'gmail') {
    targetElement = document.querySelector('[role="toolbar"]') || document.querySelector('.nH.if');
  } else if (emailService === 'outlook') {
    targetElement = document.querySelector('[role="menubar"]') || document.querySelector('.customScrollBar');
  }

  if (targetElement && !targetElement.querySelector('.phishing-scan-button')) {
    scanButton = createScanButton();
    targetElement.appendChild(scanButton);
  }

  // Re-inject button when DOM changes
  setTimeout(() => {
    if (!document.querySelector('.phishing-scan-button')) {
      injectScanButton();
    }
  }, 2000);
}

// Create scan button
function createScanButton() {
  const button = document.createElement('button');
  button.className = 'phishing-scan-button';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm1 12H7V7h2v5zm0-6H7V4h2v2z"/>
    </svg>
    <span>Rescan Email</span>
  `;
  button.title = 'Manually rescan this email for phishing';
  button.addEventListener('click', handleManualScan);

  return button;
}

// Handle manual scan
async function handleManualScan(event) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  button.disabled = true;
  button.innerHTML = `
    <svg class="spinner" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="30" />
    </svg>
    <span>Scanning...</span>
  `;

  try {
    await scanCurrentEmail();
  } catch (error) {
    console.error('Manual scan error:', error);
    showError(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm1 12H7V7h2v5zm0-6H7V4h2v2z"/>
      </svg>
      <span>Rescan Email</span>
    `;
  }
}

// Manual scan function (called from button or popup)
window.scanCurrentEmail = async function() {
  const emailData = extractEmailData();

  if (!emailData) {
    // FIX 1C: Clear the old banner if the user clicks scan but isn't on an email
    removeResultBanner();
    throw new Error('Could not extract email data. Please open an email first.');
  }

  const emailKey = generateEmailKey(emailData);
  lastScannedKey = emailKey; // Mark as scanned
  
  // Uses utf8ToBase64
  emailData.emailId = utf8ToBase64(emailKey).substring(0, 20);

  removeResultBanner();

  console.log('Manual scan:', emailData.subject);

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'analyzeEmail',
        emailData: emailData
      },
      (response) => {
        // FIX 2B: Handle the timeout case gracefully
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || 'The scan timed out. The API request might be too slow.';
          reject(new Error(errorMessage));
          return;
        }

        if (response && response.success) {
          displayInlineResults(response.result);
          resolve(response.result);
        } else {
          const errorMsg = response?.error || 'Analysis failed';
          reject(new Error(errorMsg));
        }
      }
    );
  });
};

// Display results
function displayInlineResults(result) {
  removeResultBanner();

  resultBanner = document.createElement('div');
  // Use the safety flag to set the class, fixing the inconsistent banner color
  resultBanner.className = `phishing-result-banner ${result.isPhishing ? 'danger' : 'safe'}`;

  const icon = result.isPhishing ? '⚠️' : '✅';
  const title = result.isPhishing ? 'Potential Phishing Detected' : 'Email Appears Safe';
  const confidence = result.confidence || 0;

  resultBanner.innerHTML = `
    <div class="phishing-result-header">
      <span class="phishing-result-icon">${icon}</span>
      <div class="phishing-result-content">
        <div class="phishing-result-title">${title}</div>
        <div class="phishing-result-confidence">Confidence: ${confidence}%</div>
      </div>
      <button class="phishing-result-close" title="Close">×</button>
    </div>
    <div class="phishing-result-body">
      <p class="phishing-result-recommendation">${escapeHtml(result.recommendation)}</p>
      ${result.indicators && result.indicators.length > 0 ? `
        <details class="phishing-result-details">
          <summary>View ${result.indicators.length} suspicious indicator(s)</summary>
          <ul class="phishing-result-indicators">
            ${result.indicators.map(ind => `<li>${escapeHtml(ind)}</li>`).join('')}
          </ul>
        </details>
      ` : ''}
    </div>
  `;

  const closeBtn = resultBanner.querySelector('.phishing-result-close');
  closeBtn.addEventListener('click', removeResultBanner);

  // Insert banner
  let insertTarget = null;
  if (emailService === 'gmail') {
    insertTarget = document.querySelector('.nH.if') || document.body;
  } else if (emailService === 'outlook') {
    insertTarget = document.querySelector('[role="main"]') || document.body;
  }

  if (insertTarget) {
    insertTarget.insertBefore(resultBanner, insertTarget.firstChild);
    resultBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Show notification
  chrome.runtime.sendMessage({
    action: 'showNotification',
    title: title,
    message: `Confidence: ${confidence}% - ${result.recommendation}`
  });
}

// Show error
function showError(message) {
  removeResultBanner();

  resultBanner = document.createElement('div');
  resultBanner.className = 'phishing-result-banner error';
  resultBanner.innerHTML = `
    <div class="phishing-result-header">
      <span class="phishing-result-icon">❌</span>
      <div class="phishing-result-content">
        <div class="phishing-result-title">Scan Failed</div>
      </div>
      <button class="phishing-result-close" title="Close">×</button>
    </div>
    <div class="phishing-result-body">
      <p class="phishing-result-recommendation">${escapeHtml(message)}</p>
    </div>
  `;

  const closeBtn = resultBanner.querySelector('.phishing-result-close');
  closeBtn.addEventListener('click', removeResultBanner);

  let insertTarget = null;
  if (emailService === 'gmail') {
    insertTarget = document.querySelector('.nH.if') || document.body;
  } else if (emailService === 'outlook') {
    insertTarget = document.querySelector('[role="main"]') || document.body;
  }

  if (insertTarget) {
    insertTarget.insertBefore(resultBanner, insertTarget.firstChild);
  }
}

// Remove banner
function removeResultBanner() {
  if (resultBanner) {
    resultBanner.remove();
    resultBanner = null;
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanFromPopup') {
    scanCurrentEmail()
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    // FIX 2A: Return true to tell Chrome to keep the messaging port open
    // until scanCurrentEmail calls sendResponse().
    return true; 
  }
});

console.log('Phishing Detector content script loaded');