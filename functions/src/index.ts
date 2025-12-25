/**
 * Firebase Cloud Functions Entry Point
 * Instrumented with Datadog for APM and LLM Observability
 */

// IMPORTANT: Datadog tracer must be imported FIRST before any other modules
import './datadog';

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { generateWithPose, ImageData } from './geminiService';
import tracer from './datadog';

// Initialize Firebase Admin
admin.initializeApp();

// Define Secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Interface for the generation request
 */
interface GenerateWithAIRequest {
    userImage: ImageData;
    poseImage: ImageData;
}

/**
 * Cloud Function: generateWithAI
 * 
 * Securely handles AI-powered pose transformation requests.
 * - Validates user authentication
 * - Calls Gemini API via geminiService (with Datadog instrumentation)
 * - Flushes Datadog traces before returning
 */
export const generateWithAI = onCall(
    {
        cors: true,
        timeoutSeconds: 300,
        memory: '512MiB',
        secrets: [geminiApiKey],
    },
    async (request: CallableRequest<GenerateWithAIRequest>) => {
        console.log('[generateWithAI] Request received');

        // 1. Verify authentication
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be logged in');
        }

        // 2. Validate request
        const { userImage, poseImage } = request.data;
        if (!userImage || !poseImage) {
            throw new HttpsError('invalid-argument', 'Missing image data');
        }

        const apiKey = geminiApiKey.value();

        console.log('[generateWithAI] Starting AI generation...');

        // 3. Call AI Service (Instrumented with Datadog)
        const result = await generateWithPose(apiKey, userImage, poseImage);

        if (!result.success) {
            console.error('[generateWithAI] Generation failed:', result.error);
            throw new HttpsError('internal', result.error || 'Generation failed');
        }

        console.log('[generateWithAI] AI generation successful');

        // 4. CRITICAL: Flush Datadog traces before returning (Serverless)
        // This ensures traces are sent before the execution environment freezes
        console.log('[generateWithAI] Flushing Datadog traces...');
        await new Promise<void>((resolve) => {
            const tracerAny = tracer as any;
            if (tracerAny && typeof tracerAny.flush === 'function') {
                tracerAny.flush(() => resolve());
            } else {
                setTimeout(resolve, 100);
            }
        });
        console.log('[generateWithAI] Datadog traces flushed');

        return {
            success: true,
            generatedImage: result.generatedImage,
            poseDescription: result.poseDescription,
        };
    }
);
