/**
 * Datadog APM & LLM Observability Configuration
 * For AI Partner Catalyst Hackathon - Datadog Challenge
 * 
 * Uses @datadog/serverless-compat for Firebase Cloud Functions (serverless)
 */

// IMPORTANT: Import serverless-compat FIRST before dd-trace
import '@datadog/serverless-compat';
import tracer from 'dd-trace';

// Get configuration from environment variables
const DD_API_KEY = process.env.DD_API_KEY;
const DD_SITE = process.env.DD_SITE || 'us5.datadoghq.com';
const DD_SERVICE = process.env.DD_SERVICE || 'poseshift-ai';
const DD_ENV = process.env.DD_ENV || 'prod';

// Log configuration status (for debugging in Cloud Functions logs)
console.log(`[Datadog] Initializing tracer...`);
console.log(`[Datadog] Service: ${DD_SERVICE}, Env: ${DD_ENV}, Site: ${DD_SITE}`);
console.log(`[Datadog] API Key present: ${DD_API_KEY ? 'YES (length: ' + DD_API_KEY.length + ')' : 'NO'}`);

// Initialize Datadog tracer
tracer.init({
    service: DD_SERVICE,
    env: DD_ENV,
    version: '1.0.0',
    logInjection: true,
    plugins: true,
    runtimeMetrics: true,
    // Serverless specific settings
    profiling: false, // Disable profiling in serverless
    appsec: false, // Disable AppSec in serverless for performance
});

console.log(`[Datadog] Tracer initialized successfully`);

// Helper functions for custom spans
export const datadogHelper = {
    /**
     * Create a span for LLM operations
     */
    startLLMSpan: (operationName: string, modelName: string) => {
        console.log(`[Datadog] Creating span: llm.${operationName}, model: ${modelName}`);
        const span = tracer.startSpan(`llm.${operationName}`, {
            tags: {
                'llm.provider': 'google',
                'llm.model': modelName,
                'llm.request_type': 'pose_transformation',
            },
        });
        return span;
    },

    /**
     * Record generation metrics
     */
    recordGeneration: (success: boolean, latencyMs: number, errorType?: string) => {
        const status = success ? 'success' : 'error';
        console.log(`[Datadog] Generation ${status}, latency: ${latencyMs}ms${errorType ? ', error: ' + errorType : ''}`);
    },
};

export default tracer;
