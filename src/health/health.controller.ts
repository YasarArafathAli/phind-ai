import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoogleDocsConnector } from '../ingestion/google-docs.connector';
import { DocumentStore } from '../ingestion/document.store';

/**
 * Health check endpoints following Google Cloud best practices.
 *
 * - /health         - Basic health check
 * - /health/live    - Kubernetes liveness probe (is the app running?)
 * - /health/ready   - Kubernetes readiness probe (can the app serve traffic?)
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly connector: GoogleDocsConnector,
    private readonly store: DocumentStore,
  ) {}

  /**
   * Basic health check - returns OK if the server is running
   */
  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ai-doc-chat-backend',
    };
  }

  /**
   * Liveness probe - used by Kubernetes to check if the app is alive
   * Should return 200 if the process is running
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe - used by Kubernetes to check if the app can serve traffic
   * Checks if dependencies are available
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to accept traffic',
  })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  readiness() {
    // Check if core services are available
    const checks = {
      documentStore: true, // In-memory store is always ready
      googleAuth: this.connector.isAuthenticated(),
    };

    const allReady = Object.values(checks).every((v) => v === true);

    return {
      status: allReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        documentStore: checks.documentStore ? 'ok' : 'fail',
        googleAuth: checks.googleAuth ? 'ok' : 'not_authenticated',
      },
    };
  }

  /**
   * Detailed status - returns info about the service state
   */
  @Get('status')
  @ApiOperation({ summary: 'Detailed service status' })
  @ApiResponse({ status: 200, description: 'Service status details' })
  status() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ai-doc-chat-backend',
      version: process.env.npm_package_version || '0.0.1',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
      documents: {
        count: this.store.count(),
      },
      integrations: {
        google: {
          authenticated: this.connector.isAuthenticated(),
        },
      },
    };
  }
}
