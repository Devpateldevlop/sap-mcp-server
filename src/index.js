import express from 'express';
import cors from 'cors';
import { SAPService } from './services/sap-service.js';
import { SAPMCPServer } from './server/mcp-server.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
app.use(cors()); 
app.use((req, res, next) => {
  console.log(`[DEBUG] Claude is trying to hit: ${req.method} ${req.url}`);
  next();
});

let sapService;
let mcpServer;

// 🗂️ Multiple sessions ko track karne ke liye Map
const transports = {};

async function initializeServer() {
  if (!mcpServer) {
    console.log('🚀 Initializing SAP MCP Server...');
    sapService = new SAPService();
    mcpServer = new SAPMCPServer(sapService);
    
    const health = await sapService.healthCheck();
    console.log(`🏥 SAP Health: ${health.status} - ${health.message}`);
  }
  return mcpServer.getServer();
}

// 🔗 1. SSE Connection Endpoint (GET)
// 🔗 1. SSE Connection Endpoint (GET)
app.get('/sse', async (req, res) => {
  try {
    const server = await initializeServer();
    
    // 🛠️ FIX: Relative path ki jagah poora Absolute URL generate karke paas karein
    const messagesUrl = `${req.protocol}://${req.get('host')}/messages`;
    const transport = new SSEServerTransport(messagesUrl, res);
    
    // Session ID ke basis par store karein
    transports[transport.sessionId] = transport;

    transport.onclose = () => {
      delete transports[transport.sessionId];
      console.log(`❌ Session closed: ${transport.sessionId}`);
    };

    await server.connect(transport);
    console.log(`✅ Claude Web Client connected via SSE (Session: ${transport.sessionId})`);
  } catch (error) {
    console.error('❌ SSE Connection Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// 📩 2. Messages Endpoint (POST /sse with sessionId)
// 📩 2. Messages Endpoint (POST /sse)
app.post('/sse', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];

  if (!transport) {
    // Agar validator bina session ke probe kare, toh simple plain text 'OK' bhej dein
    if (!sessionId) {
      return res.status(200).send('OK');
    }
    return res.status(400).send('No active SSE connection found for this session.');
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('❌ Message Handling Error:', error.message);
    res.status(500).send('Error processing message');
  }
});

// ==========================================
// 🔐 MOCK OAUTH 2.0 ENDPOINTS (Claude Validator ke liye)
// ==========================================

// 1. OAuth Discovery Metadata
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"]
  });
});

// 2. OAuth Authorize Endpoint (Automatic approve karke redirect kar dega)
app.get('/oauth/authorize', (req, res) => {
  const { redirect_uri, state } = req.query;
  console.log('[OAuth] Authorize hit, redirecting back with code...');
  if (redirect_uri) {
    return res.redirect(`${redirect_uri}?code=mock_auth_code_sap_123&state=${state || ''}`);
  }
  res.status(400).send('Missing redirect_uri');
});

// 3. OAuth Token Endpoint (Dummy Access Token dega)
app.post('/oauth/token', express.urlencoded({ extended: true }), (req, res) => {
  console.log('[OAuth] Token exchange requested');
  res.json({
    access_token: "mock_sap_bearer_token_xyz999",
    token_type: "Bearer",
    expires_in: 86400
  });
});

// Fallback /messages route
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];

  if (!transport) {
    return res.status(400).send('No active SSE connection found.');
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('❌ Message Handling Error:', error.message);
    res.status(500).send('Error processing message');
  }
});

// 🏥 Health Check & Redirects
app.get('/', (req, res) => {
  res.status(200).send('SAP MCP Server is active and ready! 🚀');
});

app.get('/mcp', (req, res) => {
  res.redirect('/sse');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 SAP Live Agent is running on port ${PORT}`);
});

export default app;