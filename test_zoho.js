require('dotenv').config();
const nodemailer = require('nodemailer');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Initialize Express app
const app = express();
const port = 3000;

// Token storage system
const TOKEN_STORAGE_FILE = path.join(__dirname, 'zoho_tokens.json');

class TokenManager {
  constructor() {
    this.tokens = this.loadTokens();
  }

  loadTokens() {
    try {
      if (fs.existsSync(TOKEN_STORAGE_FILE)) {
        const data = fs.readFileSync(TOKEN_STORAGE_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      log('warn', 'Failed to load stored tokens', { error: error.message });
    }
    return {
      authorization_code: null,
      access_token: null,
      refresh_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      created_at: null
    };
  }

  saveTokens() {
    try {
      fs.writeFileSync(TOKEN_STORAGE_FILE, JSON.stringify(this.tokens, null, 2));
      log('success', 'Tokens saved to storage');
    } catch (error) {
      log('error', 'Failed to save tokens', { error: error.message });
    }
  }

  storeAuthorizationCode(code) {
    this.tokens.authorization_code = code;
    this.tokens.created_at = new Date().toISOString();
    this.saveTokens();
    log('success', 'Authorization code stored', { code: code.substring(0, 10) + '...' });
  }

  storeTokens(tokenData) {
    this.tokens.access_token = tokenData.access_token;
    this.tokens.refresh_token = tokenData.refresh_token;
    this.tokens.token_type = tokenData.token_type;
    this.tokens.scope = tokenData.scope;
    this.tokens.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
    this.saveTokens();
    log('success', 'OAuth tokens stored', {
      expires_in: tokenData.expires_in,
      expires_at: this.tokens.expires_at,
      scope: this.tokens.scope
    });
  }

  isTokenExpired() {
    if (!this.tokens.expires_at) return true;
    return new Date() >= new Date(this.tokens.expires_at);
  }

  hasValidTokens() {
    return this.tokens.access_token && this.tokens.refresh_token && !this.isTokenExpired();
  }

  async refreshTokens() {
    if (!this.tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    log('info', 'Refreshing OAuth tokens');
    
    try {
      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
        params: {
          grant_type: 'refresh_token',
          client_id: ZOHO_CLIENT_ID,
          client_secret: ZOHO_CLIENT_SECRET,
          refresh_token: this.tokens.refresh_token
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Update tokens but keep the refresh token if not provided
      const tokenData = response.data;
      if (!tokenData.refresh_token) {
        tokenData.refresh_token = this.tokens.refresh_token;
      }
      
      this.storeTokens(tokenData);
      log('success', 'Tokens refreshed successfully');
      return true;
    } catch (error) {
      log('error', 'Token refresh failed', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async getValidTokens() {
    if (this.hasValidTokens()) {
      log('info', 'Using existing valid tokens');
      return this.tokens;
    }

    if (this.tokens.refresh_token) {
      log('info', 'Tokens expired, refreshing...');
      await this.refreshTokens();
      return this.tokens;
    }

    throw new Error('No valid tokens available. Please re-authorize.');
  }

  getTokenStatus() {
    return {
      hasAuthCode: !!this.tokens.authorization_code,
      hasAccessToken: !!this.tokens.access_token,
      hasRefreshToken: !!this.tokens.refresh_token,
      isExpired: this.isTokenExpired(),
      expiresAt: this.tokens.expires_at,
      scope: this.tokens.scope,
      createdAt: this.tokens.created_at
    };
  }
}

const tokenManager = new TokenManager();

// Logging system
const logHistory = [];

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    data
  };
  
  logHistory.push(logEntry);
  
  // Keep only last 100 log entries
  if (logHistory.length > 100) {
    logHistory.shift();
  }
  
  // Console output with colors
  const colors = {
    INFO: '\x1b[36m',  // Cyan
    SUCCESS: '\x1b[32m', // Green
    ERROR: '\x1b[31m',   // Red
    WARN: '\x1b[33m',    // Yellow
    DEBUG: '\x1b[90m'    // Gray
  };
  
  const color = colors[level.toUpperCase()] || '\x1b[0m';
  const reset = '\x1b[0m';
  
  console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${reset}`);
  if (data) {
    console.log(`${color}Data:${reset}`, JSON.stringify(data, null, 2));
  }
}

// Add token status endpoint
app.get('/token-status', (req, res) => {
  const status = tokenManager.getTokenStatus();
  log('info', 'Token status requested', status);
  
  res.json({
    status: 'success',
    data: status,
    recommendations: {
      needsAuthorization: !status.hasAuthCode,
      needsTokenExchange: status.hasAuthCode && !status.hasAccessToken,
      needsRefresh: status.hasAccessToken && status.isExpired && status.hasRefreshToken,
      readyToSend: status.hasAccessToken && !status.isExpired
    }
  });
});

// Add manual token refresh endpoint
app.get('/refresh-tokens', async (req, res) => {
  try {
    await tokenManager.refreshTokens();
    res.json({
      status: 'success',
      message: 'Tokens refreshed successfully',
      data: tokenManager.getTokenStatus()
    });
  } catch (error) {
    log('error', 'Manual token refresh failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Add logging endpoint
app.get('/logs', (req, res) => {
  res.json({
    total_logs: logHistory.length,
    logs: logHistory.slice(-50) // Return last 50 logs
  });
});

// Add simple dashboard
app.get('/dashboard', (req, res) => {
  const recentLogs = logHistory.slice(-20);
  const successCount = logHistory.filter(log => log.level === 'SUCCESS').length;
  const errorCount = logHistory.filter(log => log.level === 'ERROR').length;
  const tokenStatus = tokenManager.getTokenStatus();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zoho Email Test Dashboard</title>
      <meta http-equiv="refresh" content="10">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex: 1; }
        .stat-number { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .info { color: #17a2b8; }
        .warning { color: #ffc107; }
        .token-status { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-good { background: #28a745; }
        .status-warning { background: #ffc107; }
        .status-error { background: #dc3545; }
        .logs { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .log-entry { padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; }
        .log-SUCCESS { background: #d4edda; }
        .log-ERROR { background: #f8d7da; }
        .log-INFO { background: #d1ecf1; }
        .log-WARN { background: #fff3cd; }
        .actions { margin: 20px 0; }
        .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-info { background: #17a2b8; color: white; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Zoho Email OAuth Dashboard</h1>
        
        <div class="token-status">
          <h3>🔐 OAuth Token Status</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div>
              <span class="status-indicator ${tokenStatus.hasAuthCode ? 'status-good' : 'status-error'}"></span>
              <strong>Authorization Code:</strong> ${tokenStatus.hasAuthCode ? '✅ Present' : '❌ Missing'}
            </div>
            <div>
              <span class="status-indicator ${tokenStatus.hasAccessToken ? 'status-good' : 'status-error'}"></span>
              <strong>Access Token:</strong> ${tokenStatus.hasAccessToken ? '✅ Present' : '❌ Missing'}
            </div>
            <div>
              <span class="status-indicator ${tokenStatus.hasRefreshToken ? 'status-good' : 'status-error'}"></span>
              <strong>Refresh Token:</strong> ${tokenStatus.hasRefreshToken ? '✅ Present' : '❌ Missing'}
            </div>
            <div>
              <span class="status-indicator ${!tokenStatus.isExpired ? 'status-good' : 'status-warning'}"></span>
              <strong>Token Status:</strong> ${!tokenStatus.isExpired ? '✅ Valid' : '⚠️ Expired'}
            </div>
          </div>
          ${tokenStatus.expiresAt ? `<p><small>Expires: ${new Date(tokenStatus.expiresAt).toLocaleString()}</small></p>` : ''}
          ${tokenStatus.scope ? `<p><small>Scope: ${tokenStatus.scope}</small></p>` : ''}
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-number success">${successCount}</div>
            <div>Successful Operations</div>
          </div>
          <div class="stat-card">
            <div class="stat-number error">${errorCount}</div>
            <div>Failed Attempts</div>
          </div>
          <div class="stat-card">
            <div class="stat-number info">${logHistory.length}</div>
            <div>Total Log Entries</div>
          </div>
        </div>
        
        <div class="actions">
          ${!tokenStatus.hasAuthCode ? '<a href="/oauth" class="btn btn-primary">🔐 1. Start OAuth Authorization</a>' : ''}
          ${tokenStatus.hasAuthCode && !tokenStatus.hasAccessToken ? '<a href="/exchange-token" class="btn btn-success">🔄 2. Exchange for Tokens</a>' : ''}
          ${tokenStatus.hasAccessToken && tokenStatus.isExpired ? '<a href="/refresh-tokens" class="btn btn-warning">🔄 Refresh Expired Tokens</a>' : ''}
          ${tokenStatus.hasAccessToken && !tokenStatus.isExpired ? '<a href="/send-oauth-email" class="btn btn-success">📧 Send OAuth Email</a>' : ''}
          <a href="/test-direct" class="btn btn-info">🧪 Test App Password</a>
          <a href="/token-status" class="btn btn-warning">📊 Token Status JSON</a>
          <a href="/logs" class="btn btn-warning">📋 View Logs JSON</a>
        </div>
        
        <div class="logs">
          <h3>📝 Recent Activity (Auto-refresh every 10s)</h3>
          ${recentLogs.map(log => `
            <div class="log-entry log-${log.level}">
              <strong>[${log.timestamp}]</strong> 
              <span class="${log.level.toLowerCase()}">${log.level}</span>: 
              ${log.message}
              ${log.data ? `<br><small>Data: ${JSON.stringify(log.data).substring(0, 200)}...</small>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `);
});

// OAuth2 credentials from .env (updated variable names)
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URL,
  ZOHO_GRANT_TYPE,
  ZOHO_SENDER_EMAIL,
  ZOHO_APP_PASSWORD
} = process.env;

log('info', 'Server starting up', {
  ZOHO_SENDER_EMAIL,
  ZOHO_APP_PASSWORD_LENGTH: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.length : 0,
  ZOHO_CLIENT_ID: ZOHO_CLIENT_ID ? 'Present' : 'Missing',
  tokenStatus: tokenManager.getTokenStatus()
});

// Step 1: Generate Authorization URL with correct scope for SMTP
const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoMail.messages.ALL,ZohoMail.accounts.READ&client_id=${ZOHO_CLIENT_ID}&redirect_uri=${ZOHO_REDIRECT_URL}&response_type=code&access_type=offline&prompt=consent`;

// Step 2: Endpoint to provide Authorization URL
app.get('/oauth', (req, res) => {
  log('info', 'OAuth authorization URL requested');
  res.send(`
    <h2>🔐 Zoho OAuth Authorization</h2>
    <p>Click the button below to authorize this application to send emails on your behalf.</p>
    <p><a href="${authUrl}" class="btn btn-primary" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">Authorize Application</a></p>
    <p><a href="/dashboard">📊 Back to Dashboard</a></p>
  `);
});

// Step 3: Handle OAuth callback and store authorization code
app.get('/zoho/callback', async (req, res) => {
  const { code } = req.query;

  log('info', 'OAuth callback received', { code: code ? 'Present' : 'Missing' });

  if (!code) {
    log('error', 'OAuth callback missing authorization code');
    return res.status(400).send(`
      <h2>❌ Authorization Failed</h2>
      <p>Authorization code is missing from the callback.</p>
      <p><a href="/dashboard">📊 Back to Dashboard</a></p>
    `);
  }

  try {
    // Store the authorization code
    tokenManager.storeAuthorizationCode(code);

    // Immediately exchange for tokens
    log('info', 'Exchanging authorization code for tokens');
    
    const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        code: code,
        redirect_uri: ZOHO_REDIRECT_URL
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Store the tokens
    tokenManager.storeTokens(tokenResponse.data);
    
    log('success', 'OAuth flow completed successfully', { 
      access_token: tokenResponse.data.access_token ? 'Present' : 'Missing', 
      refresh_token: tokenResponse.data.refresh_token ? 'Present' : 'Missing',
      expires_in: tokenResponse.data.expires_in
    });

    res.send(`
      <h2>✅ Authorization Successful!</h2>
      <p>Your Zoho account has been successfully authorized!</p>
      <ul>
        <li><strong>Access Token:</strong> ${tokenResponse.data.access_token ? 'Received ✅' : 'Missing ❌'}</li>
        <li><strong>Refresh Token:</strong> ${tokenResponse.data.refresh_token ? 'Received ✅' : 'Missing ❌'}</li>
        <li><strong>Expires In:</strong> ${tokenResponse.data.expires_in} seconds</li>
        <li><strong>Scope:</strong> ${tokenResponse.data.scope}</li>
      </ul>
      <p><a href="/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Go to Dashboard</a></p>
      <p><a href="/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Test Email</a></p>
    `);

  } catch (error) {
    log('error', 'OAuth token exchange failed', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).send(`
      <h2>❌ Token Exchange Failed</h2>
      <p><strong>Error:</strong> ${error.message}</p>
      <p>Please try the authorization process again.</p>
      <p><a href="/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

// Test endpoint without OAuth (for direct testing with app password)
app.get('/test-direct', async (req, res) => {
  log('info', 'Direct email test initiated');
  
  log('debug', 'Environment diagnostic check', {
    ZOHO_SENDER_EMAIL,
    ZOHO_APP_PASSWORD_present: ZOHO_APP_PASSWORD ? 'Yes' : 'No',
    ZOHO_APP_PASSWORD_length: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.length : 0,
    ZOHO_APP_PASSWORD_masked: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.substring(0, 4) + '***' + ZOHO_APP_PASSWORD.substring(ZOHO_APP_PASSWORD.length - 4) : 'Not set'
  });
  
  if (!ZOHO_APP_PASSWORD || ZOHO_APP_PASSWORD === 'your-app-specific-password-here') {
    log('error', 'ZOHO_APP_PASSWORD not configured properly');
    return res.status(400).send(`
      <h2>❌ ZOHO_APP_PASSWORD Configuration Issue</h2>
      <p>The ZOHO_APP_PASSWORD is not configured properly in your .env file.</p>
      <h3>To fix this:</h3>
      <ol>
        <li>Go to <a href="https://accounts.zoho.com/home#security/2fa" target="_blank">Zoho Security Settings</a></li>
        <li>Enable Two-Factor Authentication if not already enabled</li>
        <li>Go to App Passwords section</li>
        <li>Generate a new App Password for "Mail"</li>
        <li>Copy the generated password (format: xxxx xxxx xxxx xxxx)</li>
        <li>Update your .env file with: ZOHO_APP_PASSWORD=xxxx xxxx xxxx xxxx</li>
        <li>Restart the server</li>
      </ol>
      <p><strong>Note:</strong> App passwords are 16 characters with spaces, different from your regular Zoho password!</p>
      <p><a href="/dashboard">📊 View Dashboard</a></p>
    `);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(ZOHO_SENDER_EMAIL)) {
    log('error', 'Invalid email format', { email: ZOHO_SENDER_EMAIL });
    return res.status(400).send(`
      <h2>❌ Invalid Email Format</h2>
      <p>ZOHO_SENDER_EMAIL: ${ZOHO_SENDER_EMAIL}</p>
      <p>Please check your email address in the .env file.</p>
      <p><a href="/dashboard">📊 View Dashboard</a></p>
    `);
  }

  // Check app password format
  if (ZOHO_APP_PASSWORD.length !== 16 || !ZOHO_APP_PASSWORD.includes(' ')) {
    log('warn', 'App password format may be incorrect', { 
      length: ZOHO_APP_PASSWORD.length,
      hasSpaces: ZOHO_APP_PASSWORD.includes(' ')
    });
  }

  log('info', 'Creating SMTP transporter with app password');
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    auth: {
      user: ZOHO_SENDER_EMAIL,
      pass: ZOHO_APP_PASSWORD
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    debug: false,
    logger: false
  });

  // First verify the connection
  log('info', 'Verifying SMTP connection');
  transporter.verify((error, success) => {
    if (error) {
      log('error', 'SMTP connection verification failed', {
        error: error.message,
        code: error.code,
        response: error.response
      });
      
      let errorMessage = '<h2>❌ SMTP Connection Failed</h2>';
      
      if (error.code === 'EAUTH') {
        errorMessage += `
          <h3>Authentication Error (${error.response})</h3>
          <p><strong>This usually means:</strong></p>
          <ul>
            <li>App-specific password is incorrect or not generated</li>
            <li>Two-factor authentication is not enabled on your Zoho account</li>
            <li>Email address is incorrect</li>
          </ul>
          <h3>Steps to fix:</h3>
          <ol>
            <li><strong>Enable 2FA:</strong> Go to <a href="https://accounts.zoho.com/home#security/2fa" target="_blank">Zoho 2FA Settings</a></li>
            <li><strong>Generate App Password:</strong> Go to <a href="https://accounts.zoho.com/home#security/apppasswords" target="_blank">App Passwords</a></li>
            <li>Create a new app password for "Mail" (should be 16 chars with spaces)</li>
            <li>Update your .env file with the new password</li>
            <li>Restart the server</li>
          </ol>
          <p><strong>Current password length:</strong> ${ZOHO_APP_PASSWORD.length} characters</p>
          <p><strong>Expected:</strong> 16 characters with spaces (e.g., "abcd efgh ijkl mnop")</p>
        `;
      } else {
        errorMessage += `<p>Error: ${error.message}</p>`;
      }
      
      errorMessage += '<p><a href="/dashboard">📊 View Dashboard</a></p>';
      
      return res.status(500).send(errorMessage);
    }
    
    log('success', 'SMTP connection verified successfully');
    
    const mailOptions = {
      from: ZOHO_SENDER_EMAIL,
      to: 'bojrick@gmail.com',
      subject: 'Direct Test Email from Zoho - ' + new Date().toISOString(),
      text: 'This is a direct test email using app-specific password.',
      html: `
        <h2>✅ Zoho Email Test Successful!</h2>
        <p>This email was sent successfully using:</p>
        <ul>
          <li><strong>From:</strong> ${ZOHO_SENDER_EMAIL}</li>
          <li><strong>Method:</strong> App-specific password</li>
          <li><strong>Time:</strong> ${new Date().toISOString()}</li>
          <li><strong>Password Length:</strong> ${ZOHO_APP_PASSWORD.length} characters</li>
          <li><strong>Has Spaces:</strong> ${ZOHO_APP_PASSWORD.includes(' ') ? 'Yes' : 'No'}</li>
        </ul>
        <p>If you received this email, your Zoho SMTP configuration is working correctly! 🎉</p>
      `
    };

    log('info', 'Sending test email', {
      from: ZOHO_SENDER_EMAIL,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        log('error', 'Email sending failed', {
          error: error.message,
          code: error.code,
          response: error.response,
          command: error.command
        });
        return res.status(500).send(`
          <h2>❌ Email Send Failed</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Code:</strong> ${error.code}</p>
          <p><strong>Response:</strong> ${error.response}</p>
          <p><a href="/dashboard">📊 View Dashboard</a> | <a href="/logs">📋 View Logs</a></p>
        `);
      }
      
      log('success', 'Email sent successfully via app password', {
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      });

      res.send(`
        <h2>✅ Email Sent Successfully!</h2>
        <p><strong>Message ID:</strong> ${info.messageId}</p>
        <p><strong>Response:</strong> ${info.response}</p>
        <p><strong>Method:</strong> App-specific password</p>
        <p><strong>Accepted:</strong> ${info.accepted}</p>
        <p><strong>Rejected:</strong> ${info.rejected}</p>
        <p>Check bojrick@gmail.com for the test email.</p>
        <p><a href="/dashboard">📊 View Dashboard</a> | <a href="/logs">📋 View Logs</a></p>
      `);
    });
  });
});

// Add OAuth email sending endpoint
app.get('/send-oauth-email', async (req, res) => {
  try {
    log('info', 'OAuth email send requested');

    // Get valid tokens (will refresh if needed)
    const tokens = await tokenManager.getValidTokens();

    log('info', 'Creating OAuth2 SMTP transporter');
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: ZOHO_SENDER_EMAIL,
        clientId: ZOHO_CLIENT_ID,
        clientSecret: ZOHO_CLIENT_SECRET,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      },
      debug: false,
      logger: false
    });

    // Verify connection
    log('info', 'Verifying OAuth SMTP connection');
    
    transporter.verify((error, success) => {
      if (error) {
        log('error', 'OAuth SMTP verification failed', {
          error: error.message,
          code: error.code,
          response: error.response
        });
        
        return res.status(500).send(`
          <h2>❌ SMTP Connection Failed</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Code:</strong> ${error.code}</p>
          <p>This usually means the OAuth tokens are invalid or expired.</p>
          <p><a href="/refresh-tokens" class="btn" style="display: inline-block; padding: 10px 20px; background: #ffc107; color: black; text-decoration: none; border-radius: 4px;">🔄 Refresh Tokens</a></p>
          <p><a href="/dashboard">📊 Back to Dashboard</a></p>
        `);
      }

      log('success', 'OAuth SMTP connection verified');

      const mailOptions = {
        from: ZOHO_SENDER_EMAIL,
        to: 'bojrick@gmail.com',
        subject: 'OAuth Email Test - ' + new Date().toISOString(),
        text: 'This email was sent using stored OAuth2 tokens!',
        html: `
          <h2>🎉 OAuth Email Success!</h2>
          <p>This email was sent successfully using stored OAuth2 tokens!</p>
          <ul>
            <li><strong>From:</strong> ${ZOHO_SENDER_EMAIL}</li>
            <li><strong>Method:</strong> OAuth2 with stored tokens</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>Token Expires:</strong> ${new Date(tokens.expires_at).toLocaleString()}</li>
            <li><strong>Scope:</strong> ${tokens.scope}</li>
          </ul>
          <p>✅ Your OAuth2 email integration is working perfectly!</p>
        `
      };

      log('info', 'Sending OAuth email', {
        from: ZOHO_SENDER_EMAIL,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          log('error', 'OAuth email sending failed', {
            error: error.message,
            code: error.code,
            response: error.response
          });

          return res.status(500).send(`
            <h2>❌ Email Send Failed</h2>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Code:</strong> ${error.code}</p>
            <p>The tokens may need to be refreshed or re-authorized.</p>
            <p><a href="/refresh-tokens" class="btn" style="display: inline-block; padding: 10px 20px; background: #ffc107; color: black; text-decoration: none; border-radius: 4px;">🔄 Refresh Tokens</a></p>
            <p><a href="/dashboard">📊 Back to Dashboard</a></p>
          `);
        }

        log('success', 'OAuth email sent successfully', {
          messageId: info.messageId,
          response: info.response,
          accepted: info.accepted,
          rejected: info.rejected
        });

        res.send(`
          <h2>🎉 OAuth Email Sent Successfully!</h2>
          <p><strong>Message ID:</strong> ${info.messageId}</p>
          <p><strong>Response:</strong> ${info.response}</p>
          <p><strong>Method:</strong> OAuth2 with stored tokens</p>
          <p><strong>Accepted:</strong> ${info.accepted}</p>
          <p><strong>Rejected:</strong> ${info.rejected}</p>
          <p><strong>Token Status:</strong> Valid until ${new Date(tokens.expires_at).toLocaleString()}</p>
          <p>✅ Check bojrick@gmail.com for the test email.</p>
          <p><a href="/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Dashboard</a></p>
          <p><a href="/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Another</a></p>
        `);
      });
    });

  } catch (error) {
    log('error', 'OAuth email send failed', { error: error.message });
    
    if (error.message.includes('No valid tokens available')) {
      return res.status(401).send(`
        <h2>❌ No Valid Tokens</h2>
        <p>No valid OAuth tokens available. Please re-authorize the application.</p>
        <p><a href="/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Re-authorize</a></p>
        <p><a href="/dashboard">📊 Back to Dashboard</a></p>
      `);
    }

    res.status(500).send(`
      <h2>❌ OAuth Email Failed</h2>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><a href="/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

// Add manual token exchange endpoint (in case auto-exchange fails)
app.get('/exchange-token', async (req, res) => {
  try {
    const tokens = tokenManager.tokens;
    
    if (!tokens.authorization_code) {
      return res.status(400).send(`
        <h2>❌ No Authorization Code</h2>
        <p>No authorization code available. Please complete the OAuth flow first.</p>
        <p><a href="/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Start OAuth</a></p>
        <p><a href="/dashboard">📊 Back to Dashboard</a></p>
      `);
    }

    log('info', 'Manual token exchange requested');

    const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        code: tokens.authorization_code,
        redirect_uri: ZOHO_REDIRECT_URL
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    tokenManager.storeTokens(tokenResponse.data);

    log('success', 'Manual token exchange completed');

    res.send(`
      <h2>✅ Tokens Exchanged Successfully!</h2>
      <p>Authorization code has been exchanged for access tokens.</p>
      <ul>
        <li><strong>Access Token:</strong> Received ✅</li>
        <li><strong>Refresh Token:</strong> Received ✅</li>
        <li><strong>Expires In:</strong> ${tokenResponse.data.expires_in} seconds</li>
      </ul>
      <p><a href="/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Dashboard</a></p>
      <p><a href="/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Email</a></p>
    `);

  } catch (error) {
    log('error', 'Manual token exchange failed', { error: error.message });
    res.status(500).send(`
      <h2>❌ Token Exchange Failed</h2>
      <p><strong>Error:</strong> ${error.message}</p>
      <p>The authorization code may have expired. Please restart the OAuth flow.</p>
      <p><a href="/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Restart OAuth</a></p>
      <p><a href="/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

// Start server
app.listen(port, () => {
  log('success', 'Server started successfully', {
    port,
    urls: {
      dashboard: `http://localhost:${port}/dashboard`,
      logs: `http://localhost:${port}/logs`,
      oauth: `http://localhost:${port}/oauth`,
      test_direct: `http://localhost:${port}/test-direct`
    }
  });
  
  console.log(`\n🚀 Server running at http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
  console.log(`🧪 Test Direct: http://localhost:${port}/test-direct`);
  console.log(`🔐 OAuth Flow: http://localhost:${port}/oauth`);
  console.log(`📋 Logs: http://localhost:${port}/logs`);
});