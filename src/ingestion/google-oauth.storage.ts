import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { GoogleCredentials } from './types';

/** JSON file shape (dates as ISO strings). */
interface PersistedGoogleOAuthFile {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

/**
 * Persists Google OAuth tokens to disk so a server restart stays signed in.
 * For production, replace with a secrets store or encrypted DB per user.
 */
@Injectable()
export class GoogleOAuthStorageService implements OnModuleInit {
  private readonly logger = new Logger(GoogleOAuthStorageService.name);
  private readonly filePath: string;

  constructor(private readonly config: ConfigService) {
    const fromEnv = process.env.GOOGLE_OAUTH_TOKEN_PATH?.trim();
    const fromConfig = this.config.get<string>('google.oauthTokenPath')?.trim();
    const explicit = fromEnv || fromConfig;
    this.filePath = explicit
      ? path.resolve(explicit)
      : path.join(process.cwd(), 'data', 'google-oauth.json');
  }

  async onModuleInit(): Promise<void> {
    await this.ensureParentDir();
  }

  private async ensureParentDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  /** Resolved path (for logs / docs). */
  getTokenFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<GoogleCredentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      let parsed: PersistedGoogleOAuthFile;
      try {
        parsed = JSON.parse(raw) as PersistedGoogleOAuthFile;
      } catch {
        this.logger.warn('OAuth token file is not valid JSON; ignoring');
        return null;
      }
      if (!parsed?.accessToken) {
        return null;
      }
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return null;
      }
      this.logger.warn(`Could not read OAuth token file: ${String(e)}`);
      return null;
    }
  }

  async save(creds: GoogleCredentials): Promise<void> {
    await this.ensureParentDir();
    const payload: PersistedGoogleOAuthFile = {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: (creds.expiresAt ?? new Date()).toISOString(),
    };
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
    this.logger.log(`Saved Google OAuth tokens`);
  }

  /** Remove persisted tokens (disconnect / switch account). */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
      this.logger.log('Removed Google OAuth token file');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw e;
      }
    }
  }
}
