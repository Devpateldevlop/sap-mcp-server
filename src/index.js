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
app.get('/sse', async (req, res) => {
  try {
    const server = await initializeServer();
    
    // Create transport specifying /sse endpoint
    const transport = new SSEServerTransport('/sse', res);
    
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
    // Agar Claude ka validator bina session ke probe kare, toh use SSE headers ke sath OK bhej dein
    if (!sessionId) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      return res.status(200).write(': ping\n\n');
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