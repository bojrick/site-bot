import fs from 'fs';
import path from 'path';

interface TokenData {
  authorization_code: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  token_type: string | null;
  scope: string | null;
  created_at: string | null;
}

interface TokenStatus {
  hasAuthCode: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  scope: string | null;
  createdAt: string | null;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const TOKEN_STORAGE_FILE = path.join(process.cwd(), 'zoho_tokens.json');

export class TokenManager {
  private tokens: TokenData;
  private logHistory: LogEntry[] = [];

  constructor() {
    this.tokens = this.loadTokens();
  }

  private loadTokens(): TokenData {
    try {
      if (fs.existsSync(TOKEN_STORAGE_FILE)) {
        const data = fs.readFileSync(TOKEN_STORAGE_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.log('warn', 'Failed to load stored tokens', { error: (error as Error).message });
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

  private saveTokens(): void {
    try {
      fs.writeFileSync(TOKEN_STORAGE_FILE, JSON.stringify(this.tokens, null, 2));
      this.log('success', 'Tokens saved to storage');
    } catch (error) {
      this.log('error', 'Failed to save tokens', { error: (error as Error).message });
    }
  }

  log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data
    };
    
    this.logHistory.push(logEntry);
    
    // Keep only last 100 log entries
    if (this.logHistory.length > 100) {
      this.logHistory.shift();
    }
    
    // Console output with colors
    const colors: { [key: string]: string } = {
      INFO: '\x1b[36m',    // Cyan
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

  storeAuthorizationCode(code: string): void {
    this.tokens.authorization_code = code;
    this.tokens.created_at = new Date().toISOString();
    this.saveTokens();
    this.log('success', 'Authorization code stored', { code: code.substring(0, 10) + '...' });
  }

  storeTokens(tokenData: any): void {
    this.tokens.access_token = tokenData.access_token;
    this.tokens.refresh_token = tokenData.refresh_token;
    this.tokens.token_type = tokenData.token_type;
    this.tokens.scope = tokenData.scope;
    this.tokens.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
    this.saveTokens();
    this.log('success', 'OAuth tokens stored', {
      expires_in: tokenData.expires_in,
      expires_at: this.tokens.expires_at,
      scope: this.tokens.scope
    });
  }

  isTokenExpired(): boolean {
    if (!this.tokens.expires_at) return true;
    return new Date() >= new Date(this.tokens.expires_at);
  }

  hasValidTokens(): boolean {
    return !!(this.tokens.access_token && this.tokens.refresh_token && !this.isTokenExpired());
  }

  async refreshTokens(): Promise<boolean> {
    if (!this.tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    this.log('info', 'Refreshing OAuth tokens');
    
    try {
      const axios = require('axios');
      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
        params: {
          grant_type: 'refresh_token',
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
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
      this.log('success', 'Tokens refreshed successfully');
      return true;
    } catch (error) {
      this.log('error', 'Token refresh failed', {
        error: (error as Error).message,
        response: (error as any).response?.data
      });
      throw error;
    }
  }

  async getValidTokens(): Promise<TokenData> {
    if (this.hasValidTokens()) {
      this.log('info', 'Using existing valid tokens');
      return this.tokens;
    }

    if (this.tokens.refresh_token) {
      this.log('info', 'Tokens expired, refreshing...');
      await this.refreshTokens();
      return this.tokens;
    }

    throw new Error('No valid tokens available. Please re-authorize.');
  }

  getTokenStatus(): TokenStatus {
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

  getTokens(): TokenData {
    return this.tokens;
  }

  getLogs(): LogEntry[] {
    return this.logHistory;
  }

  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logHistory.slice(-count);
  }
}

export const tokenManager = new TokenManager(); 