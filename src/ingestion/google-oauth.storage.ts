import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
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
 * Persists Google OAuth tokens: file (local) or Upstash Redis when REST URL + token are set.
 * Redis is required for multi-instance serverless (e.g. Vercel); each instance has its own /tmp.
 */
@Injectable()
export class GoogleOAuthStorageService implements OnModuleInit {
  private readonly logger = new Logger(GoogleOAuthStorageService.name);
  private readonly filePath: string;
  private readonly redis: Redis | null;
  private readonly redisKey: string;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('google.upstashRedisRestUrl')?.trim() ??
      process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token =
      this.config.get<string>('google.upstashRedisRestToken')?.trim() ??
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    this.redis =
      url && token ? new Redis({ url, token }) : null;
    this.redisKey =
      this.config.get<string>('google.oauthRedisKey')?.trim() ||
      process.env.GOOGLE_OAUTH_REDIS_KEY?.trim() ||
      'google-oauth:tokens';

    const fromEnv = process.env.GOOGLE_OAUTH_TOKEN_PATH?.trim();
    const fromConfig = this.config.get<string>('google.oauthTokenPath')?.trim();
    const explicit = fromEnv || fromConfig;
    this.filePath = explicit
      ? path.resolve(explicit)
      : path.join(process.cwd(), 'data', 'google-oauth.json');
  }

  async onModuleInit(): Promise<void> {
    if (this.redis) {
      this.logger.log(
        `Google OAuth tokens: Upstash Redis key "${this.redisKey}"`,
      );
      return;
    }
    if (process.env.VERCEL === '1') {
      this.logger.warn(
        'VERCEL without UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: OAuth tokens live in per-instance /tmp. ' +
          'Use Upstash (free tier) so all function instances share tokens.',
      );
    }
    await this.ensureParentDir();
  }

  private async ensureParentDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  /** Where tokens are stored (file path or redis key label). */
  getTokenFilePath(): string {
    return this.redis ? `redis:${this.redisKey}` : this.filePath;
  }

  async load(): Promise<GoogleCredentials | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get<string>(this.redisKey);
        if (raw == null || raw === '') {
          return null;
        }
        const parsed = JSON.parse(raw) as PersistedGoogleOAuthFile;
        if (!parsed?.accessToken) {
          return null;
        }
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
        };
      } catch (e) {
        this.logger.warn(`Could not read OAuth from Redis: ${String(e)}`);
        return null;
      }
    }

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
    const payload: PersistedGoogleOAuthFile = {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: (creds.expiresAt ?? new Date()).toISOString(),
    };
    const json = JSON.stringify(payload);

    if (this.redis) {
      await this.redis.set(this.redisKey, json);
      this.logger.log('Saved Google OAuth tokens to Redis');
      return;
    }

    await this.ensureParentDir();
    await fs.writeFile(this.filePath, `${json}\n`, 'utf8');
    this.logger.log('Saved Google OAuth tokens');
  }

  async clear(): Promise<void> {
    if (this.redis) {
      await this.redis.del(this.redisKey);
      this.logger.log('Removed Google OAuth tokens from Redis');
      return;
    }
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
