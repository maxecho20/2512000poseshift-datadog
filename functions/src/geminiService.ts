/**
 * Gemini AI Service for Cloud Functions
 * 
 * This module provides AI-powered pose analysis and image generation
 * using the Google Gemini API. The API key is securely managed via
 * Firebase Secret Manager.
 */

import { GoogleGenAI, Modality, Type } from "@google/genai";
import tracer, { datadogHelper } from './datadog';
import { LLMMetrics } from './datadogApi';

export interface ImageData {
    data: string;      // base64 encoded image data
    mimeType: string;  // e.g., 'image/jpeg', 'image/png'
}

export interface PoseData {
    head: { description: string };
    torso: { description: string };
    leftArm: { description: string };
    rightArm: { description: string };
    leftLeg: { description: string };
    rightLeg: { description: string };
    overall: { description: string };
}

export interface GenerationResult {
    success: boolean;
    generatedImage?: string;  // base64 encoded
    poseDescription?: string;
    poseData?: PoseData;
    error?: string;
}

// Configuration
const CONFIG = {
    POSE_ANALYSIS_MODEL: 'gemini-2.5-flash',
    IMAGE_GENERATION_MODEL: 'gemini-3-pro-image-preview',
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,
};

/**
 * Helper function for auto-retry logic
 */
const retryOperation = async <T>(
    operation: (attempt: number) => Promise<T>,
    operationName: string,
    maxAttempts: number = CONFIG.MAX_RETRIES,
    delayMs: number = CONFIG.RETRY_DELAY_MS
): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[${operationName}] Attempt ${attempt}/${maxAttempts} started...`);
            }
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            console.warn(`[${operationName}] Attempt ${attempt} failed:`, error);

            if (attempt < maxAttempts) {
                console.log(`[${operationName}] Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error(`[${operationName}] All ${maxAttempts} attempts failed.`);
    throw lastError;
};

/**
 * Analyzes a pose image and returns structured JSON describing the pose
 */
export const generatePoseDescription = async (
    apiKey: string,
    poseImage: ImageData
): Promise<{ formattedDescription: string; poseData: PoseData }> => {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Analyze the provided image and generate a highly detailed, systematic JSON object describing the person's pose. 

**IMPORTANT:** You MUST ignore any text, watermarks, graphic overlays, or annotations on the image. Your analysis should focus exclusively on the human figure.

Fill out the JSON schema with precise, descriptive language to capture every nuance of the person's position, orientation, and joint angles. This structured data will be used as keypoints for pose replication.`;

    const poseImagePart = {
        inlineData: {
            data: poseImage.data,
            mimeType: poseImage.mimeType,
        },
    };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            head: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Head tilt, direction of gaze, and facial expression." } },
            },
            torso: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Torso twist, lean (forward/backward/sideways), and overall posture." } },
            },
            leftArm: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Position of the left shoulder, elbow, and wrist. Hand gesture." } },
            },
            rightArm: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Position of the right shoulder, elbow, and wrist. Hand gesture." } },
            },
            leftLeg: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Position of the left hip, knee, and ankle. Foot orientation." } },
            },
            rightLeg: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "Position of the right hip, knee, and ankle. Foot orientation." } },
            },
            overall: {
                type: Type.OBJECT,
                properties: { description: { type: Type.STRING, description: "A summary of the overall pose, including balance and distribution of weight." } },
            },
        },
    };

    return retryOperation(async () => {
        const response = await ai.models.generateContent({
            model: CONFIG.POSE_ANALYSIS_MODEL,
            contents: { parts: [{ text: prompt }, poseImagePart] },
            config: {
                responseMimeType: "application/json",
                responseSchema,
            },
        });

        const responseText = response.text;
        if (!responseText) {
            throw new Error('Pose analysis failed. The model did not return a description.');
        }
        const poseData: PoseData = JSON.parse(responseText.trim());

        const formattedDescription = `
- **Overall:** ${poseData.overall.description}
- **Head:** ${poseData.head.description}
- **Torso:** ${poseData.torso.description}
- **Arms:**
  - Left: ${poseData.leftArm.description}
  - Right: ${poseData.rightArm.description}
- **Legs:**
  - Left: ${poseData.leftLeg.description}
  - Right: ${poseData.rightLeg.description}
    `.trim();

        return { formattedDescription, poseData };
    }, "generatePoseDescription");
};

/**
 * Generates a new image with the user's likeness in the specified pose
 */
export const generatePoseImage = async (
    apiKey: string,
    userImage: ImageData,
    poseImage: ImageData,
    poseDescription: string,
    poseData: PoseData
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
    **Objective:** You are a master image manipulation expert. Your primary and most critical task is to meticulously edit the person in the first image (Image A) to match the pose described in the structured keypoints and shown in the second image (Image B).

    **Image Definitions:**
    *   **Image A:** The source image containing the person to be modified. You must preserve their core identity, clothing, and the background from this image.
    *   **Image B:** The visual pose reference. Its sole purpose is to provide a visual example of the pose.

    **--- PROSE DESCRIPTION (FOR CONTEXT) ---**
    ${poseDescription}
    **-----------------------------------------**

    **--- STRUCTURED POSE KEYPOINTS (GROUND TRUTH) ---**
    This JSON object provides the precise, machine-readable instructions for the pose. This is the definitive source of truth.
    \`\`\`json
    ${JSON.stringify(poseData, null, 2)}
    \`\`\`
    **---------------------------------------------------**

    **--- CRITICAL RULES ---**
    1.  **POSE TRANSFER IS THE #1 PRIORITY:** Your main objective is to change the person's pose. All other rules are secondary to this. The final image MUST show the person from Image A in the new pose.
    2.  **STRUCTURED KEYPOINTS ARE KING:** The "STRUCTURED POSE KEYPOINTS" JSON is the absolute ground truth. Use the prose description and Image B as visual aids to understand the JSON data, but the JSON is the definitive instruction for the pose, head orientation, and facial expression.
    3.  **PRESERVE PERSON A's LIKENESS:** The person's core identity (unique facial features, hair, skin tone, body type) and their clothing/accessories from Image A must be preserved. HOWEVER, you MUST change their facial expression and head orientation to match the structured keypoints. Do not let "preserving identity" prevent you from changing the pose and expression.
    4.  **HANDLE STYLE MISMATCH:** Image B might be an illustration while Image A is a photo. You must intelligently interpret the *abstract pose* from the keypoints and illustration and apply it realistically to the person in the photo (Image A).
    5.  **STRICTLY IGNORE POSE B's CONTENT:** It is FORBIDDEN to transfer any content from Image B other than the pose itself. DO NOT copy the identity, clothing, artistic style, colors, or background from Image B. The final image must have the same photorealistic style as Image A.
    6.  **PRESERVE BACKGROUND A:** The background from Image A is the only one you should use. It must be preserved and seamlessly integrated.
    7.  **ENSURE NATURAL PROPORTIONS & SHOT COMPOSITION:** The generated person must have realistic body proportions. The framing of the final image (e.g., medium shot, full-body shot) must match the framing of Image B.

    **--- INSTRUCTIONS ---**
    1.  Analyze the structured keypoints, the prose description, and Image B to understand the target pose.
    2.  Modify the person from Image A to perfectly match this target pose and expression as defined by the keypoints.
    3.  Intelligently reconstruct and outpaint any parts of the person or background from Image A that are needed to create a coherent and natural-looking final image in the new pose.
    4.  The final output must be a single, high-quality, photorealistic image. It should look like a new photograph of the person from Image A, but in the new pose.
  `;

    const userImagePart = {
        inlineData: {
            data: userImage.data,
            mimeType: userImage.mimeType,
        },
    };

    const poseImagePart = {
        inlineData: {
            data: poseImage.data,
            mimeType: poseImage.mimeType,
        },
    };

    const textPart = { text: prompt };

    return retryOperation(async () => {
        const response = await ai.models.generateContent({
            model: CONFIG.IMAGE_GENERATION_MODEL,
            contents: {
                parts: [userImagePart, poseImagePart, textPart],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        if (
            response.candidates &&
            response.candidates[0].content &&
            response.candidates[0].content.parts
        ) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return part.inlineData.data;
                }
            }
        }

        throw new Error("Image generation failed. The model did not return an image.");
    }, "generatePoseImage");
};

/**
 * Complete generation pipeline: analyze pose + generate image
 * Instrumented with Datadog APM for LLM Observability
 */
export const generateWithPose = async (
    apiKey: string,
    userImage: ImageData,
    poseImage: ImageData
): Promise<GenerationResult> => {
    const startTime = Date.now();

    // Create metrics tracker for direct API fallback
    const metrics = new LLMMetrics('full_generation', 'gemini-pipeline');

    // Create parent span for the entire generation pipeline (dd-trace)
    const parentSpan = datadogHelper.startLLMSpan('full_generation', 'gemini-pipeline');

    try {
        // Step 1: Pose Analysis with child span
        console.log('[generateWithPose] Step 1: Analyzing pose...');
        const analyzeSpan = tracer.startSpan('llm.pose_analysis', {
            childOf: parentSpan,
            tags: {
                'llm.model': CONFIG.POSE_ANALYSIS_MODEL,
                'llm.operation': 'text_generation',
            },
        });

        const { formattedDescription, poseData } = await generatePoseDescription(apiKey, poseImage);
        analyzeSpan.setTag('llm.status', 'success');
        analyzeSpan.finish();
        console.log('[generateWithPose] Pose analysis complete');

        // Step 2: Image Generation with child span
        console.log('[generateWithPose] Step 2: Generating image...');
        const generateSpan = tracer.startSpan('llm.image_generation', {
            childOf: parentSpan,
            tags: {
                'llm.model': CONFIG.IMAGE_GENERATION_MODEL,
                'llm.operation': 'image_generation',
            },
        });

        const generatedImage = await generatePoseImage(
            apiKey,
            userImage,
            poseImage,
            formattedDescription,
            poseData
        );
        generateSpan.setTag('llm.status', 'success');
        generateSpan.finish();
        console.log('[generateWithPose] Image generation complete');

        // Record success metrics
        const latencyMs = Date.now() - startTime;
        parentSpan.setTag('llm.status', 'success');
        parentSpan.setTag('llm.latency_ms', latencyMs);
        datadogHelper.recordGeneration(true, latencyMs);

        // Send metrics via direct API (fallback for serverless)
        await metrics.recordSuccess();

        return {
            success: true,
            generatedImage,
            poseDescription: formattedDescription,
            poseData,
        };
    } catch (error) {
        // Record error metrics
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        parentSpan.setTag('llm.status', 'error');
        parentSpan.setTag('error', true);
        parentSpan.setTag('error.message', errorMessage);
        datadogHelper.recordGeneration(false, latencyMs, errorMessage);

        // Send metrics via direct API (fallback for serverless)
        await metrics.recordError(errorMessage);

        console.error('[generateWithPose] Error:', error);
        return {
            success: false,
            error: errorMessage,
        };
    } finally {
        parentSpan.finish();
    }
};
