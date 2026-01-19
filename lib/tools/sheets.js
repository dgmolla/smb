/**
 * Google Sheets Integration
 * Records orders with each flavor as a separate column
 */

import { google } from "googleapis";
import { BUSINESS_CONFIG } from "../../config.js";
import { getProducts } from "./data-access.js";

/**
 * Initialize Google Sheets client
 */
function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Get the sheet name from config or default
 */
function getSheetName() {
  return BUSINESS_CONFIG.sheetName || "Orders";
}

/**
 * Record an order to Google Sheets
 * Format: Timestamp | Name | Email | Phone | [Flavor1] | [Flavor2] | ... | total
 * @param {Object} orderData - Order details
 * @returns {Object} Result with orderId
 */
export async function recordOrderToSheets(orderData) {
  const spreadsheetId = BUSINESS_CONFIG.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;

  if (!spreadsheetId) {
    console.log("No spreadsheet configured - skipping sheet recording");
    return { success: true, orderId: generateOrderId(), skipped: true };
  }

  try {
    const sheets = getSheetsClient();
    const orderId = generateOrderId();
    const sheetName = getSheetName();

    // Get all available products to build columns (from sheet or config)
    const products = await getProducts();

    // Build row: Timestamp | Name | Email | Phone | [each flavor qty] | total
    const timestamp = new Date().toLocaleString();

    // Create a map of flavor quantities
    const flavorQuantities = {};
    for (const product of products) {
      flavorQuantities[product.name] = 0;
    }

    // Fill in quantities from order
    for (const item of orderData.items || []) {
      if (flavorQuantities.hasOwnProperty(item.flavor)) {
        flavorQuantities[item.flavor] = item.quantity;
      }
    }

    // Build row data
    const rowData = [
      timestamp,
      orderData.customerName || "",
      orderData.customerEmail || "",
      orderData.customerPhone || "", // Phone number (optional)
      ...products.map(p => flavorQuantities[p.name] || ""),
      orderData.total || 0,
    ];

    // Determine the range based on number of columns
    const numColumns = 4 + products.length + 1; // Timestamp, Name, Email, Phone, [flavors], Total
    const lastColumn = String.fromCharCode(64 + numColumns); // A=65, so 64+1=A

    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:${lastColumn}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowData],
      },
    });

    console.log("Order recorded to Sheets:", orderId);

    return {
      success: true,
      orderId,
      timestamp,
    };
  } catch (error) {
    console.error("Failed to record order to Sheets:", error);

    // Don't fail the order - just log and continue
    return {
      success: false,
      orderId: generateOrderId(),
      error: error.message,
    };
  }
}

/**
 * Update order status in Sheets (simplified - not used with new format)
 */
export async function updateOrderInSheets(orderId, status, additionalData = {}) {
  // With the new format, we don't track status in the sheet
  // Orders are simply recorded when confirmed
  return { success: true, skipped: true };
}

/**
 * Generate a unique order ID
 */
function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}
