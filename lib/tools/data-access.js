/**
 * Data Access Layer for Google Sheets
 * Reads Menu and FAQ data from sheets to use as data sources for the AI agent
 */

import { google } from "googleapis";
import { BUSINESS_CONFIG } from "../../config.js";

// Cache for sheet data (avoid reading sheets on every request)
let menuCache = null;
let faqCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize Google Sheets client
 */
function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return Date.now() - cacheTimestamp < CACHE_TTL;
}

/**
 * Clear the cache (call this to force a refresh)
 */
export function clearDataCache() {
  menuCache = null;
  faqCache = null;
  cacheTimestamp = 0;
}

/**
 * Get menu items from the Menu sheet
 * @returns {Array} Array of menu items with name, price, unit, description, ingredients
 */
export async function getMenuFromSheet() {
  const spreadsheetId = BUSINESS_CONFIG.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;

  if (!spreadsheetId) {
    console.log("No spreadsheet configured - using config.js products");
    return null; // Fall back to config.js
  }

  // Return cached data if valid
  if (menuCache && isCacheValid()) {
    return menuCache;
  }

  try {
    const sheets = getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Menu!A2:E100", // Skip header row
    });

    const rows = response.data.values || [];

    menuCache = rows.map(row => ({
      name: row[0] || "",
      price: parseFloat(row[1]) || 0,
      unit: row[2] || "dozen",
      description: row[3] || "",
      ingredients: row[4] || "",
      available: true, // Could add an "Available" column if needed
    })).filter(item => item.name); // Filter out empty rows

    cacheTimestamp = Date.now();
    console.log(`Loaded ${menuCache.length} menu items from sheet`);

    return menuCache;
  } catch (error) {
    console.error("Failed to read Menu sheet:", error.message);
    return null; // Fall back to config.js
  }
}

/**
 * Get FAQ items from the FAQ sheet
 * @returns {Array} Array of FAQ items with question, answer, keywords
 */
export async function getFAQFromSheet() {
  const spreadsheetId = BUSINESS_CONFIG.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;

  if (!spreadsheetId) {
    console.log("No spreadsheet configured - using config.js knowledgeBase");
    return null; // Fall back to config.js
  }

  // Return cached data if valid
  if (faqCache && isCacheValid()) {
    return faqCache;
  }

  try {
    const sheets = getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "FAQ!A2:C100", // Skip header row
    });

    const rows = response.data.values || [];

    faqCache = rows.map(row => ({
      question: row[0] || "",
      answer: row[1] || "",
      keywords: (row[2] || "").split(",").map(k => k.trim()).filter(k => k),
    })).filter(item => item.question && item.answer); // Filter out empty rows

    cacheTimestamp = Date.now();
    console.log(`Loaded ${faqCache.length} FAQ items from sheet`);

    return faqCache;
  } catch (error) {
    console.error("Failed to read FAQ sheet:", error.message);
    return null; // Fall back to config.js
  }
}

/**
 * Get products from Google Sheets
 * @returns {Array} Array of available products
 */
export async function getProducts() {
  const sheetMenu = await getMenuFromSheet();

  if (!sheetMenu || sheetMenu.length === 0) {
    console.error("No products found in Google Sheets - check GOOGLE_SPREADSHEET_ID and Menu sheet");
    return [];
  }

  return sheetMenu.filter(p => p.available);
}

/**
 * Get knowledge base from Google Sheets
 * @returns {Array} Array of FAQ items
 */
export async function getKnowledgeBase() {
  const sheetFAQ = await getFAQFromSheet();

  if (!sheetFAQ || sheetFAQ.length === 0) {
    console.error("No FAQ found in Google Sheets - check GOOGLE_SPREADSHEET_ID and FAQ sheet");
    return [];
  }

  return sheetFAQ;
}

/**
 * Search knowledge base (async version that reads from sheet)
 * @param {string} query - User's question
 * @returns {Array} Matching FAQ entries sorted by relevance
 */
export async function searchKnowledgeAsync(query) {
  const knowledgeBase = await getKnowledgeBase();
  const queryWords = query.toLowerCase().split(/\s+/);

  return knowledgeBase
    .map(entry => {
      let score = 0;
      for (const word of queryWords) {
        if (entry.keywords.some(k => k.toLowerCase().includes(word))) score += 3;
        if (entry.question.toLowerCase().includes(word)) score += 2;
        if (entry.answer.toLowerCase().includes(word)) score += 1;
      }
      return { ...entry, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Get product by name (async version)
 * @param {string} name - Product name or alias
 * @returns {Object|undefined} Product or undefined
 */
export async function getProductByNameAsync(name) {
  const products = await getProducts();
  const normalized = name.toLowerCase().trim();

  // Check aliases first (from config.js)
  const aliasMatch = BUSINESS_CONFIG.flavorAliases[normalized];
  if (aliasMatch) {
    return products.find(p => p.name === aliasMatch);
  }

  // Direct match
  return products.find(p =>
    p.name.toLowerCase() === normalized ||
    p.name.toLowerCase().includes(normalized)
  );
}
