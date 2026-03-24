/**
 * 63e - Run Monitoring Agent — trigger the monitoring agent deployed by 63d.
 *
 * Demonstrates the concept of running a deployed agent by workflow name
 * from a separate process.
 *
 * NOTE: The TypeScript SDK's runtime.run() currently requires an Agent
 * object. To run by name, use the HTTP API directly.
 *
 * Requirements:
 *   - Conductor server running
 *   - 63d-serve-from-package.ts running in another terminal
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 */

console.log('Run Monitoring Agent by Name');
console.log('');
console.log('The TypeScript SDK currently requires an Agent object for runtime.run().');
console.log('To run the monitoring agent by name, use the HTTP API:');
console.log('');
console.log('  POST /api/agent/run');
console.log('  { "name": "monitoring", "prompt": "Is everything healthy? Run a full check." }');
console.log('');
console.log('Or use the Python SDK: runtime.run("monitoring", "Is everything healthy?")');
