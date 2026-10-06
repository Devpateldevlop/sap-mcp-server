import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export class SAPMCPServer {
  constructor(sapService) {
    this.sapService = sapService;
    this.server = new McpServer({
      name: 'sap-mcp-server',
      version: '1.0.0'
    });
    
    this.setupErrorHandling();
    this.registerTools();
  }

  setupErrorHandling() {
    this.server.server.onerror = (error) => {
      console.error('MCP Server Error:', error);
    };
  }

  registerTools() {
    this.registerHealthTool();
    this.registerProductTools();
    this.registerDynamicSearchTool(); 
    this.registerCreateTools();
  }

  registerHealthTool() {
    this.server.tool(
      'sap_health_check',
      {},
      async () => {
        try {
          const health = await this.sapService.healthCheck();
          return { content: [{ type: 'text', text: `SAP Health Check:\nStatus: ${health.status}\nMessage: ${health.message}` }] };
        } catch (error) {
          return { content: [{ type: 'text', text: `Health check failed: ${error.message}` }] };
        }
      }
    );
  }

  registerDynamicSearchTool() {
    this.server.tool(
      'sap_dynamic_search',
      {
        tableName: z.string().describe('Name of the SAP table (e.g., MARA, VBAK, MARD, LFA1). MUST be uppercase.'),
        fieldName: z.string().default('ALL').describe('Field name to search by (e.g., MATNR). MUST be uppercase. Use ALL for no filter.'),
        searchValue: z.string().default('ALL').describe('Value to search for. Use ALL for no filter.')
      },
      async ({ tableName, fieldName, searchValue }) => {
        try {
          const records = await this.sapService.dynamicTableSearch(
            tableName.toUpperCase(), 
            fieldName.toUpperCase(), 
            searchValue
          );
          
          if (!records || records.length === 0) {
            return {
              content: [{
                type: 'text',
                text: `No data found in SAP table ${tableName} matching ${fieldName} = '${searchValue}'.`
              }]
            };
          }
          
          const jsonString = JSON.stringify(records, null, 2);
          
          return {
            content: [{
              type: 'text',
              text: `Successfully retrieved ${records.length} records from SAP table ${tableName}:\n\n${jsonString}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error fetching data from SAP table ${tableName}: ${error.message}`
            }]
          };
        }
      }
    );
  }

  registerProductTools() {
    this.server.tool(
      'get_products',
      {
        limit: z.number().min(1).max(100).default(10).describe('Number of records to fetch'),
        skip: z.number().min(0).default(0).describe('Number of records to skip'),
        search: z.string().optional().describe('Search in product description')
      },
      async ({ limit, skip, search }) => {
        try {
          const data = await this.sapService.getProducts(limit, skip, search);
          const products = Array.isArray(data) ? data : (data?.d?.results || data?.value || []);
          
          if (products.length === 0) {
            return { content: [{ type: 'text', text: 'No products found matching your criteria.' }] };
          }
          
          const productList = products.map(product => 
            `• ${product.Product || 'Unknown ID'} - ${product.Product_Text || 'No description'} (Type: ${product.ProductType || 'N/A'}, Unit: ${product.BaseUnit || 'N/A'})`
          ).join('\n');
          
          return { content: [{ type: 'text', text: `Products ${skip + 1} to ${skip + products.length}:\n\n${productList}\n\nTotal: ${products.length} products` }] };
        } catch (error) {
          return { content: [{ type: 'text', text: `Error fetching products: ${error.message}` }] };
        }
      }
    );
  }

  // ==========================================
  // 🚀 NAYE CREATE TOOLS (BOSS-READY)
  // ==========================================
  registerCreateTools() {
    // 🧠 TOOL 1: The Template Fetcher (Claude puchega details)
    this.server.tool(
      'sap_get_document_template',
      {
        docType: z.enum(['PO', 'SO', 'PR']).describe('The type of SAP document to create (e.g., PO for Purchase Order)'),
      },
      async ({ docType }) => {
      const templates = {
          // 🔥 Sabko CAPITAL mein kar diya hai (COMP_CODE, VENDOR, etc.)
          'PO': [
            'COMP_CODE (Company Code, e.g., RE01)', 
            'PURCH_ORG (Purchasing Organization, e.g., RE01)', 
            'PUR_GROUP (Purchasing Group, e.g., 001)',
            'VENDOR (Vendor Number)', 
            'MATERIAL (Material Number)', 
            'QUANTITY (Numeric amount)', 
            'PLANT (Plant Code)'
          ],
          'SO': ['CUSTOMER', 'MATERIAL', 'QUANTITY', 'SALES_ORG'],
          'PR': ['MATERIAL', 'QUANTITY', 'PLANT']
        };

        const requiredFields = templates[docType] || [];
        return {
          content: [{ 
            type: 'text', 
            text: `To create a ${docType}, you MUST strictly ask the user to provide these exact fields: ${requiredFields.join(', ')}. Do not call the create tool until the user provides all of them.` 
          }]
        };
      }
    );

    // 🚀 TOOL 2: The Document Creator (Actual BAPI Trigger)
    this.server.tool(
      'sap_create_document',
      {
        docType: z.string().describe('Document type like PO, SO, PR'),
        jsonData:  z.record(z.any()).describe('JSON object containing the details. CRITICAL: All JSON keys MUST be in UPPERCASE EXACTLY as template (e.g., "VENDOR", "MATERIAL", "COMP_CODE"). Do not use lowercase keys.'),
      },
      async ({ docType, jsonData }) => {
        try {
          console.log(`🤖 Claude is triggering BAPI for ${docType} with data:`, jsonData);
          
          // sap-service.js wala naya function call hoga
          const result = await this.sapService.createGenericDocument(docType, jsonData);
          
          return {
            content: [{ 
              type: 'text', 
              text: `SAP Execution Result -> Status: ${result.ReturnStatus}, Message: ${result.ReturnMessage}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: 'text', 
              text: `Error triggering SAP creation: ${error.message}` 
            }]
          };
        }
      }
    );
  }


  

  // 👇 Yahan se maine start() method aur StdioTransport hata diya hai
  // Kyunki ab server ko run karne ka kaam index.js aur Express handle kar rahe hain

  getServer() {
    return this.server;
  }
}