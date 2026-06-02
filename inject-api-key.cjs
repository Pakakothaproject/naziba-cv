// Build script to inject OpenRouter API key into static files
// This runs during Cloudflare Pages build process

const fs = require('fs');
const path = require('path');

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error('❌ Error: OPENROUTER_API_KEY environment variable is not set');
  console.error('Please set this in Cloudflare Pages -> Settings -> Environment Variables');
  process.exit(1);
}

console.log('🔑 Injecting OpenRouter API key into static files...');

// Read the static-app.js file
const appJsPath = path.join(__dirname, 'docs', 'static-app.js');
let appJsContent = fs.readFileSync(appJsPath, 'utf-8');

// Replace the initApiKey function to use the injected key
const initApiKeyFunction = `function initApiKey() {
  // API key is injected at build time
  state.apiKey = '${apiKey}';
  updateApiStatus('ok', '✓ API connected');
  console.log('✓ API key configured');
}`;

// Find and replace the initApiKey function
const initApiKeyRegex = /function initApiKey\(\) \{[\s\S]*?\n\}/;
appJsContent = appJsContent.replace(initApiKeyRegex, initApiKeyFunction);

// Also update the loadModels function to auto-load without checking API key input
const loadModelsCheck = `async function loadModels() {
  if (!state.apiKey) {
    $('aDot').className = 'dot d-wa';
    $('aSt').textContent = 'Enter API key to load models';
    return;
  }`;

const loadModelsReplaced = `async function loadModels() {
  // API key is always available (injected at build time)
  if (!state.apiKey) {
    $('aDot').className = 'dot d-err';
    $('aSt').textContent = 'API key not configured';
    showToast('API key is missing. Please contact support.', true);
    return;
  }`;

appJsContent = appJsContent.replace(loadModelsCheck, loadModelsReplaced);

// Remove the API key input event listener
const apiKeyEventListener = `$('apiKeyInput').addEventListener('input', (e) => {
  state.apiKey = e.target.value.trim();
  if (state.apiKey) {
    localStorage.setItem(API_KEY, state.apiKey);
    updateApiStatus('ok', 'API key configured');
  } else {
    localStorage.removeItem(API_KEY);
    updateApiStatus('wa', 'Enter your OpenRouter API key');
  }
});`;

appJsContent = appJsContent.replace(apiKeyEventListener, '// API key input listener removed - key is injected at build time');

// Write the modified file
fs.writeFileSync(appJsPath, appJsContent, 'utf-8');

console.log('✅ API key successfully injected into static-app.js');
console.log('📦 Building complete. Ready for deployment.');
