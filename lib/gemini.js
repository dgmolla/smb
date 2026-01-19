/**
 * Gemini AI Service
 * Handles all interactions with Google's Gemini API
 *
 * Free tier limits (as of Jan 2026):
 * - gemini-2.5-flash: 20-50 requests/day, 5-15 RPM
 * - gemini-2.0-flash-lite: 1,000 requests/day, 15 RPM
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { BUSINESS_CONFIG } from "../config.js";
import { getProducts, getKnowledgeBase, searchKnowledgeAsync, getProductByNameAsync } from "./tools/data-access.js";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rate limiting per session
const SESSION_AI_LIMIT = 50; // Max AI calls per session (Flash-Lite has 1000/day limit)
const sessionCallCounts = new Map();

/**
 * Track and check AI call limits per session
 * @param {string} sessionId - Session identifier
 * @returns {Object} { allowed: boolean, remaining: number }
 */
export function checkAILimit(sessionId) {
  const count = sessionCallCounts.get(sessionId) || 0;
  return {
    allowed: count < SESSION_AI_LIMIT,
    remaining: Math.max(0, SESSION_AI_LIMIT - count),
    count
  };
}

/**
 * Increment AI call count for session
 */
function incrementAICount(sessionId) {
  const count = sessionCallCounts.get(sessionId) || 0;
  sessionCallCounts.set(sessionId, count + 1);
}

/**
 * Try to answer FAQ using Google Sheets data
 * Returns null if no confident match found
 */
export async function tryLocalFAQ(message) {
  const lower = message.toLowerCase();

  // Check for product-specific ingredient questions FIRST
  if (lower.includes("ingredient") || lower.includes("what's in") || lower.includes("whats in") || lower.includes("made of") || lower.includes("made with")) {
    const products = await getProducts();

    // Find which product they're asking about
    for (const product of products) {
      const productLower = product.name.toLowerCase();
      // Check if product name appears in message
      if (lower.includes(productLower)) {
        if (product.ingredients) {
          return `The ${product.name} cookies contain: ${product.ingredients}. Let me know if you have any allergy concerns!`;
        } else {
          return `I don't have the specific ingredients list for ${product.name} cookies. For detailed ingredient information or allergy concerns, please contact us at ${BUSINESS_CONFIG.contact.email} or DM us on Instagram ${BUSINESS_CONFIG.contact.instagram}.`;
        }
      }
    }

    // Generic ingredients question (no specific product)
    return `For specific ingredient information, please let me know which cookie flavor you're asking about, or contact us at ${BUSINESS_CONFIG.contact.email}. We're happy to help with any allergy concerns!`;
  }

  // Search FAQ from Google Sheets
  const results = await searchKnowledgeAsync(message);

  // Only return if we have a high-confidence match (score >= 3)
  if (results.length > 0 && results[0].score >= 3) {
    console.log("FAQ answered from sheet:", results[0].question);
    return results[0].answer;
  }

  // Menu/flavors question
  if (lower.includes("menu") || lower.includes("flavor") || lower.includes("what do you have") || lower.includes("what cookies")) {
    const products = await getProducts();
    if (products.length === 0) return null;
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
    const list = products.map(p => `• ${p.name} - ${symbol}${p.price.toFixed(2)}/${p.unit}`).join("\n");
    return `Here are our delicious cookie flavors:\n\n${list}\n\nWould you like to place an order?`;
  }

  // Instagram/social
  if (lower.includes("instagram") || lower.includes("social") || lower.includes("follow")) {
    return `Follow us on Instagram ${BUSINESS_CONFIG.contact.instagram} for updates, new flavors, and pickup information!`;
  }

  // Contact
  if (lower.includes("contact") || lower.includes("email") || lower.includes("reach")) {
    return `You can reach us at ${BUSINESS_CONFIG.contact.email} or follow us on Instagram ${BUSINESS_CONFIG.contact.instagram}. We're located in ${BUSINESS_CONFIG.contact.location}.`;
  }

  // Price question
  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) {
    const products = await getProducts();
    if (products.length === 0) return null;
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
    const prices = products.map(p => `${p.name}: ${symbol}${p.price.toFixed(2)}/${p.unit}`).join(", ");
    return `Our prices are: ${prices}. Would you like to order?`;
  }

  return null;
}

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

CONTACT INFO:
- Instagram: ${BUSINESS_CONFIG.contact.instagram}
- Email: ${BUSINESS_CONFIG.contact.email}
- Location: ${BUSINESS_CONFIG.contact.location}

ORDER RULES:
1. Orders are in "${products[0]?.unit || "units"}" (e.g., "2 dozen chocolate chip")
2. Mixed orders welcome (multiple flavors)
3. Collect: items, customer name, email
4. Always confirm before finalizing

CRITICAL - ORDER CONFIRMATION:
When confirming a completed order, you MUST include this EXACT format:
"🎉 Order confirmed!

**Order ID:** [generate random ID like EWE-XXXXX]
**Total:** [calculated total]

Thank you for your order, [customer name]! Check our Instagram ${BUSINESS_CONFIG.contact.instagram} for pickup information.

Is there anything else I can help with?"

NEVER skip the Instagram pickup information. This is required for every order confirmation.

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
 * @param {string} sessionId - Session identifier for rate limiting
 * @returns {Object} AI response with intent, response, and extracted data
 */
export async function processWithGemini(message, history = [], currentState = "idle", sessionId = "default") {
  // Try local FAQ first (no API call)
  const localAnswer = await tryLocalFAQ(message);
  if (localAnswer) {
    return {
      intent: "FAQ",
      response: localAnswer,
      confidence: 1.0,
      needsEscalation: false,
      extractedData: {}
    };
  }

  // Check session rate limit
  const limit = checkAILimit(sessionId);
  if (!limit.allowed) {
    console.log(`Session ${sessionId} exceeded AI limit (${limit.count}/${SESSION_AI_LIMIT})`);
    return {
      intent: "RATE_LIMITED",
      response: "You've sent a lot of messages! To keep our service running smoothly, please complete your current order or try again later. You can also reach us on Instagram @ewe_cookies.",
      confidence: 1.0,
      needsEscalation: false,
      extractedData: {}
    };
  }

  // Track this AI call
  incrementAICount(sessionId);
  console.log(`AI call for session ${sessionId}: ${limit.count + 1}/${SESSION_AI_LIMIT}`);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-lite",  // Use Flash-Lite for higher free tier limits (1000/day vs 50/day)
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

    // Parse JSON response - clean up markdown code blocks if present
    try {
      let cleanText = responseText.trim();
      // Remove markdown code blocks
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(cleanText);
      return {
        intent: parsed.intent || "UNKNOWN",
        response: parsed.response || "I'm not sure how to help with that.",
        confidence: parsed.confidence ?? 0.5,
        needsEscalation: parsed.needsEscalation || false,
        extractedData: parsed.extractedData || {}
      };
    } catch {
      // If not valid JSON, extract response if it looks like JSON was attempted
      const responseMatch = responseText.match(/"response"\s*:\s*"([^"]+)"/);
      if (responseMatch) {
        return {
          intent: "UNKNOWN",
          response: responseMatch[1],
          confidence: 0.5,
          needsEscalation: false,
          extractedData: {}
        };
      }

      // Return as plain response
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
 * @param {string} message - User's message
 * @param {Array} products - Available products from Google Sheets
 * @returns {Object} Extracted items
 */
function extractOrderDetailsLocal(message, products) {
  const items = [];
  const lower = message.toLowerCase();

  for (const product of products) {
    const productLower = product.name.toLowerCase();

    // Escape special regex chars
    const escaped = productLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match patterns like: "2 dozen froot loops", "2 froot loops"
    const boundary = productLower.length <= 3 ? '\\b' : '';

    const regexWithQty = new RegExp(
      `(\\d+)\\s*(?:dozen|dz|doz)?\\s*(?:\\w+\\s+)?${boundary}${escaped}${boundary}`,
      'i'
    );
    const match = lower.match(regexWithQty);

    if (match) {
      const quantity = parseInt(match[1], 10);
      const existing = items.find(i => i.flavor === product.name);
      if (existing) {
        existing.quantity += quantity;
      } else {
        items.push({ flavor: product.name, quantity });
      }
      continue;
    }

    // Also try: "froot loops 2 dozen" (flavor before quantity)
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
      continue;
    }

    // Match just flavor name without quantity (assume 1)
    const nameMatch = productLower.length <= 3
      ? new RegExp(`\\b${escaped}\\b`, 'i').test(lower)
      : lower.includes(productLower);

    if (nameMatch && !items.find(i => i.flavor === product.name)) {
      const hasNumber = /\d+/.test(lower);
      if (!hasNumber) {
        items.push({ flavor: product.name, quantity: 1 });
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
    model: "gemini-2.0-flash-lite",  // Use Flash-Lite for higher free tier limits
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
 * Note: Does not check specific flavors - extractOrderDetails handles that
 */
export function classifyIntentQuick(message) {
  const lower = message.toLowerCase().trim();

  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening))[\s!.]*$/i.test(lower)) {
    return "GREETING";
  }

  // Check for order-related keywords with quantities (e.g., "2 dozen", "3 cookies")
  if (/\d+\s*(?:dozen|dz|doz|cookie)/i.test(lower)) {
    return "ORDER_ITEM";
  }

  // Check for order intent
  if (/(order|buy|want|get|need|like)\s*(some|a|an|the|to)?\s*(order|cookie|dozen)?/i.test(lower)) {
    return "ORDER";
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
