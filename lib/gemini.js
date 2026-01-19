/**
 * Gemini AI Service
 * Handles all interactions with Google's Gemini 2.0 Flash-Lite
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { BUSINESS_CONFIG, getAvailableProducts } from "../config.js";
import { getProducts, getKnowledgeBase } from "./tools/data-access.js";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Builds the system prompt with business-specific data
 * Loads menu and FAQ from Google Sheets (falls back to config.js)
 */
async function buildSystemPrompt() {
  // Get products from sheet (or config.js fallback)
  const products = await getProducts();
  const productsList = products
    .map(p => {
      const price = `${BUSINESS_CONFIG.orderSettings.currencySymbol}${p.price.toFixed(2)}/${p.unit}`;
      const desc = p.description || "";
      const ingredients = p.ingredients ? ` (Ingredients: ${p.ingredients})` : "";
      return `- ${p.name}: ${price} - ${desc}${ingredients}`;
    })
    .join("\n");

  // Get FAQ from sheet (or config.js fallback)
  const knowledgeBase = await getKnowledgeBase();
  const knowledgeList = knowledgeBase
    .map(k => `Q: ${k.question}\nA: ${k.answer}`)
    .join("\n\n");

  return `You are a friendly and helpful customer service assistant for "${BUSINESS_CONFIG.businessName}".

YOUR ROLE:
- Answer questions about the business, products, and policies
- Help customers place orders
- Be warm, professional, and efficient
- Keep responses concise (2-3 sentences for simple questions)

AVAILABLE PRODUCTS (per ${products[0]?.unit || "unit"}):
${productsList}

KNOWLEDGE BASE:
${knowledgeList}

ORDER RULES:
1. Orders are in "${products[0]?.unit || "units"}" (e.g., "2 dozen chocolate chip")
2. Mixed orders welcome (multiple flavors)
3. Collect: items, customer name, email
4. Always confirm before finalizing

RESPONSE FORMAT (JSON):
{
  "intent": "GREETING|FAQ|ORDER|ORDER_ITEM|CONFIRM|CANCEL|MODIFY|UNKNOWN",
  "response": "Your natural language response",
  "extractedData": {
    "items": [{"flavor": "exact name", "quantity": number}],
    "name": "customer name if mentioned",
    "email": "email if mentioned"
  },
  "confidence": 0.0 to 1.0,
  "needsEscalation": true/false
}

Set needsEscalation=true if you cannot answer from the knowledge base.`;
}

/**
 * Process a chat message with Gemini
 * @param {string} message - User's message
 * @param {Array} history - Conversation history
 * @param {string} currentState - Current conversation state
 * @returns {Object} AI response with intent, response, and extracted data
 */
export async function processWithGemini(message, history = [], currentState = "idle") {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",  // Latest available model
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  });

  // Build conversation for Gemini (loads menu/FAQ from sheets)
  const systemPrompt = await buildSystemPrompt();

  const chatHistory = [
    {
      role: "user",
      parts: [{ text: systemPrompt + "\n\nRespond ONLY in valid JSON format." }]
    },
    {
      role: "model",
      parts: [{ text: JSON.stringify({
        intent: "GREETING",
        response: `Hello! Welcome to ${BUSINESS_CONFIG.businessName}! How can I help you today?`,
        confidence: 1.0,
        needsEscalation: false,
        extractedData: {}
      })}]
    }
  ];

  // Add conversation history
  for (const msg of history.slice(-6)) { // Keep last 6 messages for context
    chatHistory.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.role === "user" ? msg.content : JSON.stringify({ response: msg.content }) }]
    });
  }

  // Add current message with state context
  chatHistory.push({
    role: "user",
    parts: [{ text: `[State: ${currentState}]\n\nCustomer: "${message}"` }]
  });

  try {
    const chat = model.startChat({ history: chatHistory.slice(0, -1) });
    const result = await chat.sendMessage(chatHistory[chatHistory.length - 1].parts[0].text);
    const responseText = result.response.text();

    // Parse JSON response
    try {
      const parsed = JSON.parse(responseText);
      return {
        intent: parsed.intent || "UNKNOWN",
        response: parsed.response || "I'm not sure how to help with that.",
        confidence: parsed.confidence ?? 0.5,
        needsEscalation: parsed.needsEscalation || false,
        extractedData: parsed.extractedData || {}
      };
    } catch {
      // If not valid JSON, return as plain response
      return {
        intent: "UNKNOWN",
        response: responseText,
        confidence: 0.5,
        needsEscalation: false,
        extractedData: {}
      };
    }
  } catch (error) {
    console.error("Gemini API error:", error);

    // Handle rate limiting gracefully
    if (error.status === 429 || error.message?.includes('429')) {
      return {
        intent: "UNKNOWN",
        response: "I'm experiencing high traffic right now. Please try again in a moment, or feel free to ask about our cookies!",
        confidence: 0.5,
        needsEscalation: false,
        extractedData: {}
      };
    }

    throw new Error("Failed to process message with AI");
  }
}

/**
 * Extract order details from a message using regex (fast, no API call)
 * Falls back to this when AI extraction fails
 * @param {string} message - User's message
 * @param {Array} products - Available products
 * @returns {Object} Extracted items
 */
function extractOrderDetailsLocal(message, products) {
  const items = [];
  const lower = message.toLowerCase();

  // Patterns to match: "2 dozen chocolate chip", "3 chocolate chip", "chocolate chip"
  // Also handles aliases from config
  const aliases = BUSINESS_CONFIG.flavorAliases;

  // Build a combined pattern for all flavors and aliases
  const allNames = [
    ...products.map(p => p.name.toLowerCase()),
    ...Object.keys(aliases)
  ];

  for (const product of products) {
    const productLower = product.name.toLowerCase();
    const productAliases = Object.entries(aliases)
      .filter(([, v]) => v === product.name)
      .map(([k]) => k.toLowerCase());

    const allPatterns = [productLower, ...productAliases];

    for (const pattern of allPatterns) {
      // Escape special regex chars
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Match patterns like:
      // "2 dozen chocolate chip", "2 dz chocolate chip", "2 chocolate chip"
      // "3 pb cookies", "3 dozen pb", "3 pb"
      // Allow optional words between number and flavor (like "dozen", "cookies", etc.)
      const boundary = pattern.length <= 3 ? '\\b' : '';

      // More flexible regex that allows optional words between quantity and flavor
      const regexWithQty = new RegExp(
        `(\\d+)\\s*(?:dozen|dz|doz)?\\s*(?:\\w+\\s+)?${boundary}${escaped}${boundary}`,
        'i'
      );
      const match = lower.match(regexWithQty);

      if (match) {
        const quantity = parseInt(match[1], 10);
        // Check if already added
        const existing = items.find(i => i.flavor === product.name);
        if (existing) {
          existing.quantity += quantity;
        } else {
          items.push({ flavor: product.name, quantity });
        }
        break; // Found match for this product, move on
      }

      // Also try: "chocolate chip 2 dozen" (flavor before quantity)
      const regexFlavorFirst = new RegExp(
        `${boundary}${escaped}${boundary}\\s*(?:cookies?)?\\s*(\\d+)\\s*(?:dozen|dz|doz)?`,
        'i'
      );
      const matchFlavorFirst = lower.match(regexFlavorFirst);

      if (matchFlavorFirst) {
        const quantity = parseInt(matchFlavorFirst[1], 10);
        const existing = items.find(i => i.flavor === product.name);
        if (existing) {
          existing.quantity += quantity;
        } else {
          items.push({ flavor: product.name, quantity });
        }
        break;
      }

      // Match just flavor name without quantity (assume 1)
      // Use word boundary check for short patterns
      const nameMatch = pattern.length <= 3
        ? new RegExp(`\\b${escaped}\\b`, 'i').test(lower)
        : lower.includes(pattern);

      if (nameMatch && !items.find(i => i.flavor === product.name)) {
        // Make sure it's not part of a number pattern we already matched
        const hasNumber = new RegExp(`\\d+`, 'i').test(lower);
        if (!hasNumber) {
          items.push({ flavor: product.name, quantity: 1 });
        }
        break;
      }
    }
  }

  return { items };
}

/**
 * Extract order details from a message
 * Uses local regex extraction first (fast), falls back to AI for complex cases
 * @param {string} message - User's message
 * @returns {Object} Extracted items
 */
export async function extractOrderDetails(message) {
  // Get products from sheet (or config.js fallback)
  const products = await getProducts();

  // First try local extraction (fast, no API call)
  const localResult = extractOrderDetailsLocal(message, products);
  if (localResult.items.length > 0) {
    console.log("Order extracted locally:", JSON.stringify(localResult));
    return localResult;
  }

  // Fall back to AI for complex/ambiguous messages
  const flavorNames = products.map(p => p.name).join(", ");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      maxOutputTokens: 200,
      temperature: 0.1,
    },
  });

  const prompt = `Extract cookie order from: "${message}"
Available flavors: ${flavorNames}

Return JSON only:
{"items": [{"flavor": "exact flavor name", "quantity": number}]}

If unclear, assume quantity=1. If no valid items, return {"items": []}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Clean up potential markdown code blocks
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log("AI extraction response:", cleanText);
    const parsed = JSON.parse(cleanText);
    return parsed;
  } catch (error) {
    console.error("AI extraction failed:", error.message);
    return { items: [] };
  }
}

/**
 * Quick intent classification (no API call)
 */
export function classifyIntentQuick(message) {
  const lower = message.toLowerCase().trim();

  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening))[\s!.]*$/i.test(lower)) {
    return "GREETING";
  }
  if (/(order|buy|want|get|need)\s*(some|a|the)?\s*(cookie|dozen)/i.test(lower)) {
    return "ORDER";
  }
  // Check for order items - include all flavor names and common aliases
  // Pattern: number + optional "dozen" + flavor name/alias
  const flavorPatterns = [
    // Full names
    "chocolate\\s*chip", "oatmeal", "snicker", "peanut\\s*butter", "sugar", "double\\s*choc",
    // Common aliases
    "pb", "cc", "choc", "cinnamon", "plain", "gf"
  ].join("|");
  const orderItemRegex = new RegExp(`\\d+\\s*(?:dozen|dz|doz)?\\s*(?:\\w+\\s+)?(?:${flavorPatterns})`, "i");
  if (orderItemRegex.test(lower)) {
    return "ORDER_ITEM";
  }
  // Also check for flavor + number pattern (e.g., "chocolate chip 2 dozen")
  const flavorFirstRegex = new RegExp(`(?:${flavorPatterns})\\s*(?:cookies?)?\\s*\\d+`, "i");
  if (flavorFirstRegex.test(lower)) {
    return "ORDER_ITEM";
  }
  if (/^(yes|yeah|confirm|correct|sure|ok)[\s!.]*$/i.test(lower)) {
    return "CONFIRM";
  }
  if (/^(no|cancel|nevermind|stop)[\s!.]*$/i.test(lower)) {
    return "CANCEL";
  }
  if (/\?|what|when|where|how|do you|can i/i.test(lower)) {
    return "FAQ";
  }

  return "UNKNOWN";
}
