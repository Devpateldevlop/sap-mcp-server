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
// Vercel par incoming JSON messages parse karne ke liye
app.use(express.json()); 

let sapService;
let mcpServer;
let transport;

// 🚀 Server Initialize Karne Ka Function
async function initializeServer() {
  if (!mcpServer) {
    console.log('🚀 Initializing SAP MCP Server for Vercel...');
    sapService = new SAPService();
    mcpServer = new SAPMCPServer(sapService);
    
    // Connection test during initialization
    const health = await sapService.healthCheck();
    console.log(`🏥 SAP Health: ${health.status} - ${health.message}`);
  }
  // Yahan hum mcpServer.getServer() return kar rahe hain 
  // (mcp-server.js wali start() method ab yahan web ke through handle hogi)
  return mcpServer.getServer();
}

// 🔗 1. SSE Connection Endpoint (Claude Web UI yahan connect karega)
app.get('/sse', async (req, res) => {
  try {
    const server = await initializeServer();
    
    // Web ke liye SSE Transport use karte hain, Stdio nahi
    transport = new SSEServerTransport('/messages', res);
    await server.connect(transport);
    
    console.log('✅ Claude Web Client connected via SSE');
  } catch (error) {
    console.error('❌ SSE Connection Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// 📩 2. Messages Endpoint (Claude prompts yahan bhejega)
app.post('/messages', async (req, res) => {
  try {
    if (!transport) {
      return res.status(400).send('No active SSE connection found.');
    }
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('❌ Message Handling Error:', error.message);
    res.status(500).send('Error processing message');
  }
});

// 🏥 3. Basic Health Check URL (Browser mein check karne ke liye)
app.get('/', (req, res) => {
  res.send('SAP MCP Server is LIVE on Vercel! 🚀');
});

// Vercel ko HTTP server export karke dena padta hai
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SAP Live Agent is running on port ${PORT}`);
});
export default app;