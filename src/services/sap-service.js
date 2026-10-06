import axios from 'axios';
import https from 'https';
import { Config } from '../utils/config.js';

export class SAPService {
  constructor() {
    Config.validate();
    this.config = Config.sap;
    this.axios = this.createAxiosClient();
  }

  createAxiosClient() {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, 
      secureProtocol: 'TLSv1_2_method'
    });

    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      httpsAgent: httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      auth: {
        username: this.config.username,
        password: this.config.password
      }
    });

    client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('SAP API Error:', error.response?.data || error.message);
        throw this.formatError(error);
      }
    );

    return client;
  }

  formatError(error) {
    const sapMessage = error.response?.data?.error?.message?.value;
    const status = error.response?.status;
    const statusText = error.response?.statusText;

    return new Error(
      sapMessage || `SAP API Error: ${status} ${statusText} - ${error.message}`
    );
  }

  // 👇 YAHAN HAMARA NAYA DYNAMIC SEARCH FUNCTION HAI 👇
  async dynamicTableSearch(tableName, fieldName = 'ALL', searchValue = 'ALL') {
    // URL construct kar rahe hain apni nayi service ke liye
    const url = `/sap/opu/odata/sap/Z_GENERIC_SEARCH_SRV/TableDataSet(TableName='${tableName}',FieldName='${fieldName}',SearchValue='${searchValue}')?$format=json`;

    console.error(`Calling SAP Dynamic Search: ${url}`);
    
    try {
      const response = await this.axios.get(url);
      const rawJsonString = response.data?.d?.ResultJSON;
      let tableRecords = [];

      if (rawJsonString) {
        // ABAP se aayi JSON string ko array mein convert karna
        tableRecords = JSON.parse(rawJsonString);
        console.error(`[SUCCESS] Parsed ${tableRecords.length} records from ${tableName}.`);
      }

      return tableRecords;
    } catch (error) {
      console.error(`[ERROR] Failed to fetch or parse dynamic data:`, error.message);
      throw error;
    }
  }

  // Purana Product Operations (As it is)
  async getProducts(top = 10, skip = 0, search = '') {
    console.error(`Service Path: ${this.config.productService}`);
    let url = `${this.config.productService}/I_ProductVH?$top=${top}&$skip=${skip}&$format=json`;
    if (search) {
      url += `&$filter=contains(Product_Text,'${search}')`;
    }
    const response = await this.axios.get(url);
    return response.data?.d?.results || response.data?.value || response.data;
  }

  // Health check
  async healthCheck() {
    try {
      // Dynamic service se metadata fetch karke connection test kar rahe hain
      const url = `/sap/opu/odata/sap/Z_GENERIC_SEARCH_SRV/$metadata`;
      await this.axios.get(url);
      return { status: 'connected', message: 'Successfully connected to SAP' };
    } catch (error) {
      return { status: 'error', message: `SAP connection failed: ${error.message}` };
    }
  }
// 🔐 1. CSRF Token Fetcher (SAP Security Bypass)
  async getCsrfToken() {
    try {
      console.log('🔐 Fetching CSRF Token from SAP...');
      
      // FIX 1: Use this.axios.get instead of axios.get
      // FIX 2: Removed auth object because this.axios already has it
      const response = await this.axios.get(`/sap/opu/odata/sap/Z_GENERIC_SEARCH_SRV/TableDataSet?$top=1`, {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/json'
        }
      });

      const csrfToken = response.headers['x-csrf-token'];
      const cookies = response.headers['set-cookie'];
      
      console.log('✅ CSRF Token Fetched Successfully!');
      return { csrfToken, cookies };
    } catch (error) {
      console.error('❌ Failed to fetch CSRF Token:', error.message);
      throw error;
    }
  }

  // 📝 2. Generic Create Document Logic (POST Request)
  async createGenericDocument(docType, jsonData) {
    try {
      const { csrfToken, cookies } = await this.getCsrfToken();

      console.log(`🚀 Sending POST request to SAP for creating ${docType}...`);
      
      const payload = {
        DocType: docType.toUpperCase(),
        JsonData: JSON.stringify(jsonData), 
        ReturnStatus: "",
        ReturnMessage: ""
      };

      // FIX 3: Use this.axios.post instead of axios.post
      const response = await this.axios.post(`/sap/opu/odata/sap/Z_GENERIC_SEARCH_SRV/GenericCreateSet`, payload, {
        headers: {
          'X-CSRF-Token': csrfToken,
          'Cookie': cookies ? cookies.join('; ') : '',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return response.data.d;
    } catch (error) {
      console.error(`❌ Error creating ${docType} in SAP:`, error.message);
      if (error.response && error.response.data && error.response.data.error) {
         const sapError = error.response.data.error.message.value;
         console.error('SAP Error Details:', sapError);
         return { ReturnStatus: 'E', ReturnMessage: sapError };
      }
      throw error;
    }
  }
}