/**
 * Send Demo Metrics to Datadog
 * 
 * This script sends sample metrics to Datadog for demo purposes.
 * It uses the Datadog HTTP API directly to ensure data arrives.
 * 
 * Usage: node send_demo_metrics.js
 */

const https = require('https');

const DD_API_KEY = '369ababddd60ac3207098818cf65d805';
const DD_SITE = 'us5.datadoghq.com';

/**
 * Send a metric to Datadog
 */
async function sendMetric(metricName, value, tags = []) {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        series: [{
            metric: metricName,
            type: 'gauge',
            points: [[now, value]],
            tags: ['service:poseshift-ai', 'env:prod', ...tags],
        }]
    };

    return new Promise((resolve, reject) => {
        const options = {
            hostname: `api.${DD_SITE}`,
            port: 443,
            path: '/api/v1/series',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'DD-API-KEY': DD_API_KEY,
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 202) {
                    console.log(`✅ Sent ${metricName}: ${value}`);
                    resolve(true);
                } else {
                    console.log(`❌ Failed ${metricName}: ${res.statusCode} - ${data}`);
                    resolve(false);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

/**
 * Send a log to Datadog
 */
async function sendLog(message, level = 'info') {
    const payload = [{
        ddsource: 'nodejs',
        ddtags: 'service:poseshift-ai,env:prod',
        hostname: 'firebase-functions',
        message: message,
        service: 'poseshift-ai',
        status: level,
    }];

    return new Promise((resolve, reject) => {
        const options = {
            hostname: `http-intake.logs.${DD_SITE}`,
            port: 443,
            path: '/api/v2/logs',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'DD-API-KEY': DD_API_KEY,
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 202 || res.statusCode === 200) {
                    console.log(`✅ Sent log: ${message.substring(0, 50)}...`);
                    resolve(true);
                } else {
                    console.log(`❌ Failed log: ${res.statusCode} - ${data}`);
                    resolve(false);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

async function main() {
    console.log('🚀 Sending demo metrics to Datadog...\n');
    console.log(`📡 Target: ${DD_SITE}\n`);

    // Send LLM metrics
    const metrics = [
        ['llm.request.count', 15],
        ['llm.request.latency', 2500],
        ['llm.request.success', 14],
        ['llm.request.error', 1],
        ['llm.tokens.input', 1200],
        ['llm.tokens.output', 850],
        ['pose.generation.count', 12],
        ['pose.generation.latency_ms', 3200],
    ];

    for (const [name, value] of metrics) {
        await sendMetric(name, value);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n📝 Sending demo logs...\n');

    // Send sample logs
    const logs = [
        'AI pose generation started for user u8oUYa64nIPkoZqnWzBHtfht3we2',
        'Gemini API call completed in 2.3s',
        'Image generated successfully, size: 1.2MB',
        'Credits deducted: 6 credits, remaining: 773',
        'Request completed successfully',
    ];

    for (const log of logs) {
        await sendLog(log);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n✨ Demo data sent! Check Datadog in 1-2 minutes.');
    console.log('📊 Dashboard: https://us5.datadoghq.com/dashboard/lists');
}

main().catch(console.error);
