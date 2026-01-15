import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleCredentials } from './types';

/**
 * GoogleDocsConnector - handles OAuth and fetching documents from Google.
 * This is the ONLY place that knows about Google APIs.
 */
@Injectable()
export class GoogleDocsConnector {
  private readonly logger = new Logger(GoogleDocsConnector.name);
  private credentials: GoogleCredentials | null = null;

  // Google API endpoints
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly DRIVE_API = 'https://www.googleapis.com/drive/v3';
  private readonly DOCS_API = 'https://docs.googleapis.com/v1';

  constructor(private readonly config: ConfigService) {}

  /**
   * Get the OAuth URL for user to authorize access
   */
  getAuthUrl(): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: redirectUri || '',
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async authenticate(code: string): Promise<boolean> {
    try {
      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.get<string>('GOOGLE_CLIENT_ID') || '',
          client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') || '',
          redirect_uri: this.config.get<string>('GOOGLE_REDIRECT_URI') || '',
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        this.logger.error('Token exchange failed');
        return false;
      }

      const data = await response.json();
      this.credentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      };

      this.logger.log('Authenticated with Google');
      return true;
    } catch (error) {
      this.logger.error('Authentication failed', error);
      return false;
    }
  }

  /**
   * Set credentials directly (for restoring from storage)
   */
  setCredentials(credentials: GoogleCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Check if we have valid credentials
   */
  isAuthenticated(): boolean {
    return !!this.credentials?.accessToken;
  }

  /**
   * List all Google Docs in the user's Drive
   */
  async listDocuments(): Promise<Array<{ id: string; title: string; modifiedTime: string }>> {
    await this.ensureAuth();

    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      fields: 'files(id,name,modifiedTime)',
      pageSize: '100',
    });

    const response = await this.apiCall(`${this.DRIVE_API}/files?${params}`);
    const data = await response.json();

    return (data.files || []).map((f: { id: string; name: string; modifiedTime: string }) => ({
      id: f.id,
      title: f.name,
      modifiedTime: f.modifiedTime,
    }));
  }

  /**
   * Fetch a single document's content
   */
  async fetchDocument(docId: string): Promise<{
    id: string;
    title: string;
    body: unknown;
    revisionId: string;
  }> {
    await this.ensureAuth();

    const response = await this.apiCall(`${this.DOCS_API}/documents/${docId}`);
    const doc = await response.json();

    return {
      id: doc.documentId,
      title: doc.title,
      body: doc.body,
      revisionId: doc.revisionId || '',
    };
  }

  // --- Private helpers ---

  private async ensureAuth(): Promise<void> {
    if (!this.credentials?.accessToken) {
      throw new Error('Not authenticated');
    }

    // Refresh token if expired
    if (this.credentials.expiresAt && this.credentials.expiresAt < new Date()) {
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.credentials?.refreshToken) {
      throw new Error('No refresh token - need to re-authenticate');
    }

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: this.credentials.refreshToken,
        client_id: this.config.get<string>('GOOGLE_CLIENT_ID') || '',
        client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') || '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    this.credentials = {
      ...this.credentials,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async apiCall(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials?.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Google API error: ${response.status} - ${errorBody}`);

      // Provide helpful error messages
      if (response.status === 401) {
        throw new Error('Authentication expired. Please re-authenticate.');
      }
      if (response.status === 403) {
        throw new Error(
          'Access denied. Make sure Google Docs API and Google Drive API ' +
            'are enabled in Google Cloud Console, and you granted the required permissions.',
        );
      }
      if (response.status === 404) {
        throw new Error('Document not found.');
      }

      throw new Error(`Google API error: ${response.status}`);
    }

    return response;
  }
}
