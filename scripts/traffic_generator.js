/**
 * Traffic Generator for Datadog Demo
 * 
 * This script generates traffic patterns to demonstrate
 * the observability features configured in Datadog.
 * 
 * Usage:
 *   node traffic_generator.js          # Normal traffic (simulated)
 *   node traffic_generator.js error    # Trigger error scenario
 */

const https = require('https');

// Configuration
const CONFIG = {
    // Replace with your actual deployment URL if needed for real testing,
    // or use a placeholder for the demo script.
    ENDPOINT: 'https://poseshift.mossecho.cn',
    REQUEST_COUNT: 5,
    INTERVAL_MS: 3000,
};

/**
 * Simulates a request to the API
 */
async function makeRequest(isErrorScenario = false) {
    console.log(`[${new Date().toISOString()}] Sending request... (Error scenario: ${isErrorScenario})`);

    // In a real traffic generator, you would make an actual HTTP request here.
    // For this demo structure, we'll simulate the "wait" time of an AI generation.

    /* 
    // Example implementation:
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    // ... make https request ...
    */

    // Simulate latency
    const latency = isErrorScenario ? 500 : 2000 + Math.random() * 1000;
    await new Promise(r => setTimeout(r, latency));

    if (isErrorScenario) {
        console.log(`❌ Request failed (Simulated 500 Error)`);
    } else {
        console.log(`✅ Request successful (Latency: ${Math.round(latency)}ms)`);
    }
}

async function runTrafficGenerator() {
    const args = process.argv.slice(2);
    const scenario = args[0] || 'normal';

    console.log(`🚀 Starting Traffic Generator - Scenario: ${scenario.toUpperCase()}`);
    console.log(`Target: ${CONFIG.ENDPOINT}`);
    console.log(`Will generate ${CONFIG.REQUEST_COUNT} requests with ${CONFIG.INTERVAL_MS}ms interval\n`);

    const isError = scenario === 'error';

    for (let i = 1; i <= CONFIG.REQUEST_COUNT; i++) {
        process.stdout.write(`Request ${i}/${CONFIG.REQUEST_COUNT}: `);
        await makeRequest(isError);

        if (i < CONFIG.REQUEST_COUNT) {
            await new Promise(r => setTimeout(r, CONFIG.INTERVAL_MS));
        }
    }

    console.log('\n✨ Traffic generation complete!');
}

runTrafficGenerator().catch(console.error);
