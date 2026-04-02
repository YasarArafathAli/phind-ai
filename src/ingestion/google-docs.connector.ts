import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthStorageService } from './google-oauth.storage';
import type { FetchedDriveDocument, GoogleCredentials } from './types';

// pdf-parse@1 — CommonJS; avoids pulling ESM-only pdf-parse v2 into Nest CJS build
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  data: Buffer,
) => Promise<{ text: string }>;

type GoogleOAuthTokenJson = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type DriveFileListJson = {
  files?: Array<{
    id: string;
    name: string;
    modifiedTime: string;
    mimeType: string;
  }>;
};

type DocsApiDocumentJson = {
  documentId: string;
  title: string;
  body: unknown;
  revisionId?: string;
};

type DriveFileMetadataJson = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
};

/**
 * GoogleDocsConnector - handles OAuth and fetching documents from Google.
 * This is the ONLY place that knows about Google APIs.
 */
@Injectable()
export class GoogleDocsConnector implements OnModuleInit {
  private readonly logger = new Logger(GoogleDocsConnector.name);
  private credentials: GoogleCredentials | null = null;

  // Google API endpoints
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly DRIVE_API = 'https://www.googleapis.com/drive/v3';
  private readonly DOCS_API = 'https://docs.googleapis.com/v1';

  constructor(
    private readonly config: ConfigService,
    private readonly oauthStorage: GoogleOAuthStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    const loaded = await this.oauthStorage.load();
    if (loaded) {
      this.credentials = loaded;
      this.logger.log('Restored Google OAuth tokens from disk');
    }
  }

  /** Reads env from ConfigModule (nested `google.*`) with process.env fallback. */
  private getGoogleOAuthConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    return {
      clientId:
        this.config.get<string>('google.clientId') ??
        process.env.GOOGLE_CLIENT_ID ??
        '',
      clientSecret:
        this.config.get<string>('google.clientSecret') ??
        process.env.GOOGLE_CLIENT_SECRET ??
        '',
      redirectUri:
        this.config.get<string>('google.redirectUri') ??
        process.env.GOOGLE_REDIRECT_URI ??
        '',
    };
  }

  /**
   * Get the OAuth URL for user to authorize access
   */
  getAuthUrl(): string {
    const { clientId, redirectUri } = this.getGoogleOAuthConfig();

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
  /**
   * @param redirectUriOverride Use when the auth code was issued for a different redirect than
   *   `GOOGLE_REDIRECT_URI` (must match the URI sent to Google on the authorize step exactly).
   */
  async authenticate(
    code: string,
    redirectUriOverride?: string,
  ): Promise<boolean> {
    const { clientId, clientSecret, redirectUri } = this.getGoogleOAuthConfig();
    const redirectForToken = (redirectUriOverride || redirectUri).trim();

    try {
      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectForToken,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(
          `Token exchange failed: ${response.status} ${errText}`,
        );
        return false;
      }

      const data = (await response.json()) as GoogleOAuthTokenJson;
      // Google may omit refresh_token on re-consent; keep an existing one from memory or disk.
      this.credentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? this.credentials?.refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      };

      await this.persistCredentials();

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
   * List native Google Docs and PDFs in the user's Drive (not other Office types).
   */
  async listDocuments(): Promise<
    Array<{ id: string; title: string; modifiedTime: string; mimeType: string }>
  > {
    await this.ensureAuth();

    const q =
      "(mimeType='application/vnd.google-apps.document' or mimeType='application/pdf') and trashed=false";
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,modifiedTime,mimeType)',
      pageSize: '100',
    });

    const response = await this.apiCall(`${this.DRIVE_API}/files?${params}`);
    const data = (await response.json()) as DriveFileListJson;

    return (data.files ?? []).map((f) => ({
      id: f.id,
      title: f.name,
      modifiedTime: f.modifiedTime,
      mimeType: f.mimeType,
    }));
  }

  /**
   * Fetch a single file: Google Doc via Docs API, or PDF via Drive download + text extraction.
   */
  async fetchDocument(docId: string): Promise<FetchedDriveDocument> {
    await this.ensureAuth();

    const meta = await this.getDriveFileMetadata(docId);
    const mimeType = meta.mimeType || '';

    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await this.apiCall(
        `${this.DOCS_API}/documents/${docId}`,
      );
      const doc = (await response.json()) as DocsApiDocumentJson;
      return {
        kind: 'gdoc',
        id: doc.documentId,
        title: doc.title,
        body: doc.body,
        revisionId: doc.revisionId || '',
      };
    }

    if (mimeType === 'application/pdf') {
      const buffer = await this.downloadDriveFileMedia(docId);
      const parsed = await pdfParse(buffer);
      const revisionId = meta.md5Checksum || meta.modifiedTime || '';
      return {
        kind: 'pdf',
        id: meta.id,
        title: meta.name,
        text: parsed.text || '',
        revisionId,
      };
    }

    throw new Error(
      `Unsupported Drive file type: ${mimeType || 'unknown'}. ` +
        'Only Google Docs and PDFs are supported.',
    );
  }

  private async getDriveFileMetadata(
    docId: string,
  ): Promise<DriveFileMetadataJson> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,modifiedTime,md5Checksum',
    });
    const response = await this.apiCall(
      `${this.DRIVE_API}/files/${encodeURIComponent(docId)}?${params}`,
    );
    return (await response.json()) as DriveFileMetadataJson;
  }

  /** Raw file bytes (e.g. PDF) from Drive. */
  private async downloadDriveFileMedia(fileId: string): Promise<Buffer> {
    await this.ensureAuth();
    const url = `${this.DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials?.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Drive download error: ${response.status} - ${errorBody}`,
      );
      if (response.status === 401) {
        throw new Error('Authentication expired. Please re-authenticate.');
      }
      if (response.status === 403) {
        throw new Error(
          'Access denied when downloading file. Ensure Drive API is enabled and scope includes drive.readonly.',
        );
      }
      if (response.status === 404) {
        throw new Error('File not found.');
      }
      throw new Error(`Drive download error: ${response.status}`);
    }

    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
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

    const { clientId, clientSecret } = this.getGoogleOAuthConfig();

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: this.credentials.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = (await response.json()) as Pick<
      GoogleOAuthTokenJson,
      'access_token' | 'expires_in'
    >;
    this.credentials = {
      ...this.credentials,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
    await this.persistCredentials();
  }

  /** Write tokens after login or refresh; failures are logged but do not break API calls. */
  private async persistCredentials(): Promise<void> {
    if (!this.credentials) {
      return;
    }
    try {
      await this.oauthStorage.save(this.credentials);
    } catch (error) {
      this.logger.error('Failed to persist OAuth tokens', error);
    }
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
