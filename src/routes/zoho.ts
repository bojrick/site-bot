import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { tokenManager } from '../utils/tokenManager';

const router = express.Router();

// OAuth2 credentials from .env (updated variable names)
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URL,
  ZOHO_SENDER_EMAIL,
  ZOHO_APP_PASSWORD
} = process.env;

// Initialize token manager logging
tokenManager.log('info', 'Zoho routes initialized', {
  ZOHO_SENDER_EMAIL,
  ZOHO_APP_PASSWORD_LENGTH: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.length : 0,
  ZOHO_CLIENT_ID: ZOHO_CLIENT_ID ? 'Present' : 'Missing',
  tokenStatus: tokenManager.getTokenStatus()
});

// Step 1: Generate Authorization URL with correct scope for SMTP
// Reference: https://www.zoho.com/accounts/protocol/oauth/limited-input-devices.html
// We use Authorization Code Grant (not Device Authorization Grant) since we have browser access
// For SMTP access, we need ZohoMail scopes - note that SMTP OAuth2 support is limited
const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ&client_id=${ZOHO_CLIENT_ID}&redirect_uri=${ZOHO_REDIRECT_URL}&response_type=code&access_type=offline&prompt=consent`;

// Dashboard - Main overview page
router.get('/dashboard', (req: Request, res: Response) => {
  const recentLogs = tokenManager.getRecentLogs(20);
  const allLogs = tokenManager.getLogs();
  const successCount = allLogs.filter(log => log.level === 'SUCCESS').length;
  const errorCount = allLogs.filter(log => log.level === 'ERROR').length;
  const tokenStatus = tokenManager.getTokenStatus();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zoho Email Dashboard</title>
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
        .info-box { background: #e7f3ff; border: 1px solid #b3d9ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Zoho Email OAuth Dashboard</h1>
        
        <div class="info-box">
          <h4>📋 OAuth Flow Information</h4>
          <p><strong>Current Method:</strong> Authorization Code Grant (standard web app flow)</p>
          <p><strong>Scopes:</strong> ZohoMail.messages.ALL, ZohoMail.accounts.READ, ZohoMail.folders.READ</p>
          <p><strong>SMTP Note:</strong> Zoho SMTP servers have limited OAuth2 support. App passwords are recommended for SMTP.</p>
          <p><strong>Reference:</strong> <a href="https://www.zoho.com/accounts/protocol/oauth/" target="_blank">Zoho OAuth Documentation</a></p>
        </div>
        
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
            <div class="stat-number info">${allLogs.length}</div>
            <div>Total Log Entries</div>
          </div>
        </div>
        
        <div class="actions">
          ${!tokenStatus.hasAuthCode ? '<a href="/zoho/oauth" class="btn btn-primary">🔐 1. Start OAuth Authorization</a>' : ''}
          ${tokenStatus.hasAuthCode && !tokenStatus.hasAccessToken ? '<a href="/zoho/exchange-token" class="btn btn-success">🔄 2. Exchange for Tokens</a>' : ''}
          ${tokenStatus.hasAccessToken && tokenStatus.isExpired ? '<a href="/zoho/refresh-tokens" class="btn btn-warning">🔄 Refresh Expired Tokens</a>' : ''}
          ${tokenStatus.hasAccessToken && !tokenStatus.isExpired ? '<a href="/zoho/send-oauth-email" class="btn btn-success">📧 Send OAuth Email</a>' : ''}
          <a href="/zoho/test-direct" class="btn btn-info">🧪 Test App Password (Recommended)</a>
          <a href="/zoho/token-status" class="btn btn-warning">📊 Token Status JSON</a>
          <a href="/zoho/logs" class="btn btn-warning">📋 View Logs JSON</a>
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

// Token status endpoint
router.get('/token-status', (req: Request, res: Response) => {
  const status = tokenManager.getTokenStatus();
  tokenManager.log('info', 'Token status requested', status);
  
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

// Manual token refresh endpoint
router.get('/refresh-tokens', async (req: Request, res: Response) => {
  try {
    await tokenManager.refreshTokens();
    res.json({
      status: 'success',
      message: 'Tokens refreshed successfully',
      data: tokenManager.getTokenStatus()
    });
  } catch (error) {
    tokenManager.log('error', 'Manual token refresh failed', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: (error as Error).message
    });
  }
});

// Logging endpoint
router.get('/logs', (req: Request, res: Response) => {
  const logs = tokenManager.getLogs();
  res.json({
    total_logs: logs.length,
    logs: tokenManager.getRecentLogs(50) // Return last 50 logs
  });
});

// Step 2: Endpoint to provide Authorization URL
router.get('/oauth', (req: Request, res: Response) => {
  tokenManager.log('info', 'OAuth authorization URL requested');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zoho OAuth Authorization</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn { padding: 15px 30px; margin: 10px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 16px; }
        .btn-primary { background: #007bff; color: white; }
        .btn-secondary { background: #6c757d; color: white; }
        .info-box { background: #e7f3ff; border: 1px solid #b3d9ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .warning-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .code { background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔐 Zoho OAuth Authorization</h2>
        
        <div class="info-box">
          <h4>📋 OAuth Flow Information</h4>
          <p><strong>Flow Type:</strong> Authorization Code Grant (Standard web application)</p>
          <p><strong>Use Case:</strong> Perfect for web applications with browser access</p>
          <p><strong>Alternative:</strong> Device Authorization Grant is for limited input devices (TVs, printers, etc.)</p>
          <p><strong>Reference:</strong> <a href="https://www.zoho.com/accounts/protocol/oauth/limited-input-devices.html" target="_blank">Zoho OAuth Documentation</a></p>
        </div>
        
        <div class="warning-box">
          <h4>⚠️ Important SMTP Limitations</h4>
          <p><strong>OAuth2 + SMTP:</strong> Zoho SMTP servers have limited OAuth2 support</p>
          <p><strong>Recommended:</strong> Use App Passwords for SMTP authentication</p>
          <p><strong>OAuth2 Best For:</strong> REST API access (not SMTP)</p>
        </div>
        
        <h3>🔑 Requested Permissions</h3>
        <div class="code">
          <strong>Scopes:</strong><br>
          • ZohoMail.messages.ALL - Send and manage email messages<br>
          • ZohoMail.accounts.READ - Read account information<br>
          • ZohoMail.folders.READ - Read folder structure
        </div>
        
        <p>Click the button below to authorize this application to access your Zoho Mail account:</p>
        
        <a href="${authUrl}" class="btn btn-primary">🔐 Authorize Application</a>
        <a href="/zoho/dashboard" class="btn btn-secondary">📊 Back to Dashboard</a>
        
        <div style="margin-top: 30px;">
          <h4>🤔 Having Issues?</h4>
          <p>If OAuth2 doesn't work for SMTP, try the app password method instead:</p>
          <a href="/zoho/test-direct" class="btn" style="background: #28a745; color: white;">🧪 Test App Password Method</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Step 3: Handle OAuth callback and store authorization code
router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  tokenManager.log('info', 'OAuth callback received', { code: code ? 'Present' : 'Missing' });

  if (!code) {
    tokenManager.log('error', 'OAuth callback missing authorization code');
    return res.status(400).send(`
      <h2>❌ Authorization Failed</h2>
      <p>Authorization code is missing from the callback.</p>
      <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
    `);
  }

  try {
    // Store the authorization code
    tokenManager.storeAuthorizationCode(code as string);

    // Immediately exchange for tokens
    tokenManager.log('info', 'Exchanging authorization code for tokens');
    
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
    
    tokenManager.log('success', 'OAuth flow completed successfully', { 
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
      <p><a href="/zoho/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Go to Dashboard</a></p>
      <p><a href="/zoho/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Test Email</a></p>
    `);

  } catch (error) {
    tokenManager.log('error', 'OAuth token exchange failed', {
      error: (error as Error).message,
      response: (error as any).response?.data,
      status: (error as any).response?.status
    });
    res.status(500).send(`
      <h2>❌ Token Exchange Failed</h2>
      <p><strong>Error:</strong> ${(error as Error).message}</p>
      <p>Please try the authorization process again.</p>
      <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

// Test endpoint without OAuth (for direct testing with app password)
router.get('/test-direct', async (req: Request, res: Response) => {
  tokenManager.log('info', 'Direct email test initiated');
  
  tokenManager.log('debug', 'Environment diagnostic check', {
    ZOHO_SENDER_EMAIL,
    ZOHO_APP_PASSWORD_present: ZOHO_APP_PASSWORD ? 'Yes' : 'No',
    ZOHO_APP_PASSWORD_length: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.length : 0,
    ZOHO_APP_PASSWORD_masked: ZOHO_APP_PASSWORD ? ZOHO_APP_PASSWORD.substring(0, 4) + '***' + ZOHO_APP_PASSWORD.substring(ZOHO_APP_PASSWORD.length - 4) : 'Not set'
  });
  
  if (!ZOHO_APP_PASSWORD || ZOHO_APP_PASSWORD === 'your-app-specific-password-here') {
    tokenManager.log('error', 'ZOHO_APP_PASSWORD not configured properly');
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
      <p><a href="/zoho/dashboard">📊 View Dashboard</a></p>
    `);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!ZOHO_SENDER_EMAIL || !emailRegex.test(ZOHO_SENDER_EMAIL)) {
    tokenManager.log('error', 'Invalid email format', { email: ZOHO_SENDER_EMAIL });
    return res.status(400).send(`
      <h2>❌ Invalid Email Format</h2>
      <p>ZOHO_SENDER_EMAIL: ${ZOHO_SENDER_EMAIL}</p>
      <p>Please check your email address in the .env file.</p>
      <p><a href="/zoho/dashboard">📊 View Dashboard</a></p>
    `);
  }

  // Check app password format
  if (ZOHO_APP_PASSWORD.length !== 16 || !ZOHO_APP_PASSWORD.includes(' ')) {
    tokenManager.log('warn', 'App password format may be incorrect', { 
      length: ZOHO_APP_PASSWORD.length,
      hasSpaces: ZOHO_APP_PASSWORD.includes(' ')
    });
  }

  tokenManager.log('info', 'Creating SMTP transporter with app password');
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
  tokenManager.log('info', 'Verifying SMTP connection');
  transporter.verify((error: any, success: any) => {
    if (error) {
      tokenManager.log('error', 'SMTP connection verification failed', {
        error: error.message,
        code: (error as any).code,
        response: (error as any).response
      });
      
      let errorMessage = '<h2>❌ SMTP Connection Failed</h2>';
      
      if ((error as any).code === 'EAUTH') {
        errorMessage += `
          <h3>Authentication Error (${(error as any).response})</h3>
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
      
      errorMessage += '<p><a href="/zoho/dashboard">📊 View Dashboard</a></p>';
      
      return res.status(500).send(errorMessage);
    }
    
    tokenManager.log('success', 'SMTP connection verified successfully');
    
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

    tokenManager.log('info', 'Sending test email', {
      from: ZOHO_SENDER_EMAIL,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    transporter.sendMail(mailOptions, (error: any, info: any) => {
      if (error) {
        tokenManager.log('error', 'Email sending failed', {
          error: error.message,
          code: (error as any).code,
          response: (error as any).response,
          command: (error as any).command
        });
        return res.status(500).send(`
          <h2>❌ Email Send Failed</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Code:</strong> ${(error as any).code}</p>
          <p><strong>Response:</strong> ${(error as any).response}</p>
          <p><a href="/zoho/dashboard">📊 View Dashboard</a> | <a href="/zoho/logs">📋 View Logs</a></p>
        `);
      }
      
      tokenManager.log('success', 'Email sent successfully via app password', {
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
        <p><a href="/zoho/dashboard">📊 View Dashboard</a> | <a href="/zoho/logs">📋 View Logs</a></p>
      `);
    });
  });
});

// Add OAuth email sending endpoint
router.get('/send-oauth-email', async (req: Request, res: Response) => {
  try {
    tokenManager.log('info', 'OAuth email send requested');

    // Get valid tokens (will refresh if needed)
    const tokens = await tokenManager.getValidTokens();

    tokenManager.log('info', 'Creating OAuth2 SMTP transporter');
    
    // Try different OAuth2 configuration approaches
    let transporter;
    
    try {
      // First try with the comprehensive OAuth2 config
      transporter = nodemailer.createTransport({
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
          accessUrl: 'https://accounts.zoho.com/oauth/v2/token'
        },
        tls: {
          rejectUnauthorized: false
        }
      } as any);
    } catch (error) {
      tokenManager.log('warn', 'Primary OAuth2 config failed, trying fallback', { error: (error as Error).message });
      
      // Fallback to app password if OAuth2 fails
      if (ZOHO_APP_PASSWORD) {
        tokenManager.log('info', 'Falling back to app password authentication');
        transporter = nodemailer.createTransport({
          host: 'smtp.zoho.com',
          port: 587,
          secure: false,
          auth: {
            user: ZOHO_SENDER_EMAIL,
            pass: ZOHO_APP_PASSWORD
          },
          tls: {
            rejectUnauthorized: false
          }
        });
      } else {
        throw new Error('OAuth2 failed and no app password available');
      }
    }

    // Verify connection
    tokenManager.log('info', 'Verifying SMTP connection');
    
    transporter.verify((error: any, success: any) => {
      if (error) {
        tokenManager.log('error', 'SMTP verification failed', {
          error: error.message,
          code: error.code,
          response: error.response
        });
        
        // If OAuth2 fails, suggest using app password
        if (error.code === 'EAUTH' && error.response?.includes('Unknown Authentication')) {
          return res.status(500).send(`
            <h2>❌ OAuth2 Authentication Failed</h2>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Issue:</strong> Zoho SMTP server doesn't recognize the OAuth2 authentication method.</p>
            
            <h3>🔧 Recommended Solutions:</h3>
            <ol>
              <li><strong>Use App Password Instead:</strong> 
                <a href="/zoho/test-direct" style="display: inline-block; padding: 8px 16px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 5px;">🧪 Test App Password</a>
              </li>
              <li><strong>Verify OAuth2 Scope:</strong> Ensure your OAuth2 app has the correct scopes (ZohoMail.messages.ALL)</li>
              <li><strong>Check Token Validity:</strong> 
                <a href="/zoho/token-status" style="display: inline-block; padding: 8px 16px; background: #17a2b8; color: white; text-decoration: none; border-radius: 4px; margin: 5px;">📊 Check Token Status</a>
              </li>
              <li><strong>Try Token Refresh:</strong> 
                <a href="/zoho/refresh-tokens" style="display: inline-block; padding: 8px 16px; background: #ffc107; color: black; text-decoration: none; border-radius: 4px; margin: 5px;">🔄 Refresh Tokens</a>
              </li>
            </ol>
            
            <h3>📝 Note:</h3>
            <p>Zoho's SMTP server sometimes has issues with OAuth2. App passwords are more reliable for SMTP authentication.</p>
            <p>If you need OAuth2 for API access, consider using Zoho's Mail API instead of SMTP.</p>
            
            <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
          `);
        }
        
        return res.status(500).send(`
          <h2>❌ SMTP Connection Failed</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p><strong>Code:</strong> ${error.code}</p>
          <p><a href="/zoho/refresh-tokens" class="btn" style="display: inline-block; padding: 10px 20px; background: #ffc107; color: black; text-decoration: none; border-radius: 4px;">🔄 Refresh Tokens</a></p>
          <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
        `);
      }

      tokenManager.log('success', 'SMTP connection verified');

      const mailOptions = {
        from: ZOHO_SENDER_EMAIL,
        to: 'bojrick@gmail.com',
        subject: 'OAuth Email Test - ' + new Date().toISOString(),
        text: 'This email was sent using OAuth2 tokens or app password fallback!',
        html: `
          <h2>🎉 Email Success!</h2>
          <p>This email was sent successfully!</p>
          <ul>
            <li><strong>From:</strong> ${ZOHO_SENDER_EMAIL}</li>
            <li><strong>Method:</strong> OAuth2 or App Password</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>Token Expires:</strong> ${tokens.expires_at ? new Date(tokens.expires_at).toLocaleString() : 'Using App Password'}</li>
            <li><strong>Scope:</strong> ${tokens.scope || 'App Password'}</li>
          </ul>
          <p>✅ Your email integration is working!</p>
        `
      };

      tokenManager.log('info', 'Sending email', {
        from: ZOHO_SENDER_EMAIL,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      transporter.sendMail(mailOptions, (error: any, info: any) => {
        if (error) {
          tokenManager.log('error', 'Email sending failed', {
            error: error.message,
            code: error.code,
            response: error.response
          });

          return res.status(500).send(`
            <h2>❌ Email Send Failed</h2>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Code:</strong> ${error.code}</p>
            <p><a href="/zoho/test-direct" class="btn" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">🧪 Try App Password</a></p>
            <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
          `);
        }

        tokenManager.log('success', 'Email sent successfully', {
          messageId: info.messageId,
          response: info.response,
          accepted: info.accepted,
          rejected: info.rejected
        });

        res.send(`
          <h2>🎉 Email Sent Successfully!</h2>
          <p><strong>Message ID:</strong> ${info.messageId}</p>
          <p><strong>Response:</strong> ${info.response}</p>
          <p><strong>Method:</strong> OAuth2 or App Password</p>
          <p><strong>Accepted:</strong> ${info.accepted}</p>
          <p><strong>Rejected:</strong> ${info.rejected}</p>
          <p>✅ Check bojrick@gmail.com for the test email.</p>
          <p><a href="/zoho/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Dashboard</a></p>
          <p><a href="/zoho/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Another</a></p>
        `);
      });
    });

  } catch (error) {
    tokenManager.log('error', 'OAuth email send failed', { error: (error as Error).message });
    
    if ((error as Error).message.includes('No valid tokens available')) {
      return res.status(401).send(`
        <h2>❌ No Valid Tokens</h2>
        <p>No valid OAuth tokens available. Please re-authorize the application.</p>
        <p><a href="/zoho/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Re-authorize</a></p>
        <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
      `);
    }

    res.status(500).send(`
      <h2>❌ Email Failed</h2>
      <p><strong>Error:</strong> ${(error as Error).message}</p>
      <p><strong>Recommendation:</strong> Try using app password authentication instead.</p>
      <p><a href="/zoho/test-direct" class="btn" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">🧪 Test App Password</a></p>
      <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

// Add manual token exchange endpoint (in case auto-exchange fails)
router.get('/exchange-token', async (req: Request, res: Response) => {
  try {
    const tokens = tokenManager.getTokens();
    
    if (!tokens.authorization_code) {
      return res.status(400).send(`
        <h2>❌ No Authorization Code</h2>
        <p>No authorization code available. Please complete the OAuth flow first.</p>
        <p><a href="/zoho/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Start OAuth</a></p>
        <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
      `);
    }

    tokenManager.log('info', 'Manual token exchange requested');

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

    tokenManager.log('success', 'Manual token exchange completed');

    res.send(`
      <h2>✅ Tokens Exchanged Successfully!</h2>
      <p>Authorization code has been exchanged for access tokens.</p>
      <ul>
        <li><strong>Access Token:</strong> Received ✅</li>
        <li><strong>Refresh Token:</strong> Received ✅</li>
        <li><strong>Expires In:</strong> ${tokenResponse.data.expires_in} seconds</li>
      </ul>
      <p><a href="/zoho/dashboard" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">📊 Dashboard</a></p>
      <p><a href="/zoho/send-oauth-email" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">📧 Send Email</a></p>
    `);

  } catch (error) {
    tokenManager.log('error', 'Manual token exchange failed', { error: (error as Error).message });
    res.status(500).send(`
      <h2>❌ Token Exchange Failed</h2>
      <p><strong>Error:</strong> ${(error as Error).message}</p>
      <p>The authorization code may have expired. Please restart the OAuth flow.</p>
      <p><a href="/zoho/oauth" class="btn" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">🔐 Restart OAuth</a></p>
      <p><a href="/zoho/dashboard">📊 Back to Dashboard</a></p>
    `);
  }
});

export default router; 