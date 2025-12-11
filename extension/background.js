// background.js - Handles API calls to OpenRouter with custom settings

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeEmail') {
    analyzeEmailWithOpenRouter(request.emailData)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: request.title,
      message: request.message
    });
  }
});

async function analyzeEmailWithOpenRouter(emailData) {
  // Get settings from storage
  const settings = await chrome.storage.local.get([
    'or_api_key',
    'or_endpoint', 
    'or_model',
    'user_threshold'
  ]);
  
  const apiKey = settings.or_api_key;
  const endpoint = settings.or_endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  const model = settings.or_model || 'meta-llama/llama-3.2-3b-instruct:free';
  const threshold = settings.user_threshold || 70; // Raised default threshold
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set it in the extension popup.');
  }

  const prompt = `Analyze this email for phishing indicators. Respond ONLY with a valid JSON object in this exact format (no markdown, no backticks):
{
  "isPhishing": true or false,
  "confidence": number between 0-100,
  "indicators": ["list", "of", "suspicious", "things"],
  "recommendation": "brief recommendation text"
}

Email Details:
From: ${emailData.from}
Subject: ${emailData.subject}
Body: ${emailData.body.substring(0, 2000)}
Links: ${emailData.links.slice(0, 10).join(', ')}

IMPORTANT: Be conservative in flagging legitimate emails. Only flag as phishing if there are MULTIPLE strong indicators:
- Mismatched sender domain (e.g., claims to be "Bank" but from random domain)
- Suspicious/shortened links that don't match claimed sender
- Urgent threats (account closure, legal action, prize expiration)
- Requests for passwords, credit cards, or SSN
- Poor grammar/spelling throughout
- Spoofed/lookalike domains (g00gle.com, paypa1.com)

DO NOT flag as phishing if:
- Email is from a legitimate company domain (anthropic.com, google.com, etc.)
- Links match the sender's domain
- Professional formatting and grammar
- No requests for sensitive information
- Normal marketing/newsletter content

Analyze carefully and be accurate.`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'Phishing Detector Extension'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a cybersecurity expert specializing in phishing detection. You are CONSERVATIVE and only flag emails as phishing when there are multiple strong indicators. Legitimate marketing emails, newsletters, and automated emails from real companies should NOT be flagged as phishing. Respond ONLY with valid JSON. No markdown formatting, no code blocks, just the raw JSON object.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from API');
    }
    
    // Extract JSON from response (handle both raw JSON and markdown-wrapped JSON)
    let jsonStr = content.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from API. Expected JSON object.');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Validate result structure
    if (typeof result.isPhishing !== 'boolean' || 
        typeof result.confidence !== 'number' ||
        !Array.isArray(result.indicators) ||
        typeof result.recommendation !== 'string') {
      throw new Error('Invalid response structure from API');
    }
    
    // --- FIX START ---

    // 1. Enforce Phishing Flag if indicators are present, to resolve the conflict.
    // If the AI found indicators (like 'Suspicious link'), the email MUST be flagged as phishing.
    if (result.indicators && result.indicators.length > 0) {
        if (!result.isPhishing) {
            console.warn(`AI output was inconsistent (safe, but with indicators). Forcing result to PHISHING.`);
        }
        result.isPhishing = true;
        // Ensure confidence reflects the risk, using the user threshold as a minimum floor if low
        result.confidence = Math.max(result.confidence, 50); 
    }
    
    // 2. Apply user threshold for final safety decision.
    if (result.confidence >= threshold && !result.isPhishing) {
      result.isPhishing = true;
      result.recommendation = `Flagged due to high confidence (${result.confidence}%) exceeding threshold (${threshold}%). ${result.recommendation}`;
    }
    
    // --- FIX END ---
    
    // Store result for this email
    await chrome.storage.local.set({
      [`analysis_${emailData.emailId || Date.now()}`]: {
        ...result,
        timestamp: Date.now(),
        emailData: {
          from: emailData.from,
          subject: emailData.subject
        },
        settings: {
          model,
          threshold
        }
      }
    });
    
    return result;
  } catch (error) {
    console.error('OpenRouter API Error:', error);
    throw error;
  }
}