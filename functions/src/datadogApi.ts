/**
 * Datadog Direct API Integration
 * For AI Partner Catalyst Hackathon - Datadog Challenge
 * 
 * This module provides direct HTTP API calls to Datadog for:
 * - Custom Metrics (via Metrics API)
 * - Logs (via Logs API)
 * 
 * This is a fallback approach when dd-trace doesn't work in serverless.
 */

import https from 'https';

// Configuration from environment
const DD_API_KEY = process.env.DD_API_KEY;
const DD_SITE = process.env.DD_SITE || 'us5.datadoghq.com';
const DD_SERVICE = process.env.DD_SERVICE || 'poseshift-ai';
const DD_ENV = process.env.DD_ENV || 'prod';

/**
 * Send custom metric to Datadog via HTTP API
 */
export async function sendMetric(
    metricName: string,
    value: number,
    tags: string[] = [],
    metricType: 'gauge' | 'count' | 'rate' = 'gauge'
): Promise<void> {
    if (!DD_API_KEY) {
        console.log('[Datadog API] No API key, skipping metric');
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const allTags = [
        `service:${DD_SERVICE}`,
        `env:${DD_ENV}`,
        ...tags,
    ];

    // Datadog API v1 format:
    // - type: string ("gauge", "count", "rate")
    // - points: array of [timestamp, value] arrays
    const payload = {
        series: [
            {
                metric: metricName,
                type: metricType,
                points: [[timestamp, value]],
                tags: allTags,
            },
        ],
    };

    const data = JSON.stringify(payload);

    const options: https.RequestOptions = {
        hostname: `api.${DD_SITE}`,
        port: 443,
        path: '/api/v1/series',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'DD-API-KEY': DD_API_KEY,
            'Content-Length': Buffer.byteLength(data),
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode === 202) {
                    console.log(`[Datadog API] Metric sent: ${metricName} = ${value}`);
                    resolve();
                } else {
                    console.error(`[Datadog API] Error: ${res.statusCode} - ${body}`);
                    resolve(); // Don't reject, just log
                }
            });
        });

        req.on('error', (error) => {
            console.error(`[Datadog API] Request error: ${error.message}`);
            resolve(); // Don't reject, just log
        });

        req.write(data);
        req.end();
    });
}

/**
 * Send log to Datadog via HTTP API
 */
export async function sendLog(
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
    additionalData: Record<string, any> = {}
): Promise<void> {
    if (!DD_API_KEY) {
        console.log('[Datadog API] No API key, skipping log');
        return;
    }

    const logEntry = {
        ddsource: 'nodejs',
        ddtags: `env:${DD_ENV},service:${DD_SERVICE}`,
        hostname: 'firebase-functions',
        message,
        service: DD_SERVICE,
        status: level,
        ...additionalData,
    };

    const data = JSON.stringify(logEntry);

    const options: https.RequestOptions = {
        hostname: `http-intake.logs.${DD_SITE}`,
        port: 443,
        path: '/api/v2/logs',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'DD-API-KEY': DD_API_KEY,
            'Content-Length': Buffer.byteLength(data),
        },
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 202) {
                    console.log(`[Datadog API] Log sent: ${message.substring(0, 50)}...`);
                } else {
                    console.error(`[Datadog API] Log error: ${res.statusCode} - ${body}`);
                }
                resolve();
            });
        });

        req.on('error', (error) => {
            console.error(`[Datadog API] Log request error: ${error.message}`);
            resolve();
        });

        req.write(data);
        req.end();
    });
}

/**
 * Helper class for tracking LLM generation metrics
 */
export class LLMMetrics {
    private startTime: number;
    private operationName: string;
    private modelName: string;

    constructor(operationName: string, modelName: string) {
        this.startTime = Date.now();
        this.operationName = operationName;
        this.modelName = modelName;
        console.log(`[LLM Metrics] Starting: ${operationName} with ${modelName}`);
    }

    async recordSuccess(): Promise<void> {
        const latency = Date.now() - this.startTime;
        await Promise.all([
            sendMetric('poseshift.llm.request.count', 1, [
                `operation:${this.operationName}`,
                `model:${this.modelName}`,
                'status:success',
            ], 'count'),
            sendMetric('poseshift.llm.request.latency', latency, [
                `operation:${this.operationName}`,
                `model:${this.modelName}`,
            ], 'gauge'),
            sendLog(`LLM generation completed: ${this.operationName}`, 'info', {
                operation: this.operationName,
                model: this.modelName,
                latency_ms: latency,
                status: 'success',
            }),
        ]);
    }

    async recordError(errorMessage: string): Promise<void> {
        const latency = Date.now() - this.startTime;
        await Promise.all([
            sendMetric('poseshift.llm.request.count', 1, [
                `operation:${this.operationName}`,
                `model:${this.modelName}`,
                'status:error',
            ], 'count'),
            sendMetric('poseshift.llm.error.count', 1, [
                `operation:${this.operationName}`,
                `model:${this.modelName}`,
            ], 'count'),
            sendLog(`LLM generation failed: ${this.operationName} - ${errorMessage}`, 'error', {
                operation: this.operationName,
                model: this.modelName,
                latency_ms: latency,
                status: 'error',
                error: errorMessage,
            }),
        ]);
    }
}
