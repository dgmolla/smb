/**
 * ADK Agent for Ewe Cookies
 *
 * Uses Google ADK with function calling for reliable order extraction
 * and structured parameter validation.
 */

import { LlmAgent, FunctionTool, Runner, InMemorySessionService } from "@google/adk";
import { BUSINESS_CONFIG } from "../config.js";
import { getProducts, getKnowledgeBase, searchKnowledgeAsync, getProductByNameAsync } from "./tools/data-access.js";
import { recordOrderToSheets, updateOrderInSheets } from "./tools/sheets.js";

// Session service for managing conversation state
const sessionService = new InMemorySessionService();

// Store for order state per session (not in ADK state for simplicity)
const orderStore = new Map();

/**
 * Get or create order state for a session
 */
function getOrderState(sessionId) {
  if (!orderStore.has(sessionId)) {
    orderStore.set(sessionId, {
      items: [],
      customerName: null,
      customerEmail: null,
      total: 0,
      pendingItems: [],
      awaitingConfirmation: false,
    });
  }
  return orderStore.get(sessionId);
}

/**
 * Recalculate order total
 */
function recalculateTotal(orderState) {
  orderState.total = orderState.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
}

// ============================================
// TOOLS - These are the functions the AI can call
// ============================================

/**
 * Tool: Get the menu
 */
const getMenuTool = new FunctionTool({
  name: "get_menu",
  description: "Get the list of available cookie flavors with prices. Call this when the user asks about the menu, what's available, or wants to see options. The tool returns a pre-formatted menu - just relay it to the user directly.",
  execute: async () => {
    const products = await getProducts();
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;

    // Build a nicely formatted menu
    const menuLines = products.map(p =>
      `• ${p.name} — ${symbol}${p.price.toFixed(2)}/${p.unit}`
    );

    const formattedMenu = `Here's our menu:\n\n${menuLines.join("\n")}\n\nWhat would you like to order?`;

    return {
      products: products.map(p => ({
        name: p.name,
        price: p.price,
        unit: p.unit
      })),
      formattedMenu,
      count: products.length
    };
  }
});

/**
 * Tool: Add items to order
 * Uses JSON Schema for structured parameter extraction
 */
const addToOrderTool = new FunctionTool({
  name: "add_to_order",
  description: "Add cookie items to the customer's order. Use this when the customer wants to order cookies. The quantity is in DOZENS (e.g., '2 dozen' means quantity=2, '1 dozen' means quantity=1). IMPORTANT: quantity is number of dozens, NOT individual cookies.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Array of items to add to the order",
        items: {
          type: "object",
          properties: {
            flavor: {
              type: "string",
              description: "The exact cookie flavor name from the menu"
            },
            quantity: {
              type: "integer",
              description: "Number of DOZENS to order. '1 dozen' = 1, '2 dozen' = 2. If no number specified, use 1."
            }
          },
          required: ["flavor", "quantity"]
        }
      }
    },
    required: ["items"]
  },
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
    const addedItems = [];
    const notFoundItems = [];

    for (const item of input.items) {
      const product = await getProductByNameAsync(item.flavor);

      if (product) {
        // Check if already in order
        const existing = orderState.items.find(
          i => i.flavor.toLowerCase() === product.name.toLowerCase()
        );

        if (existing) {
          existing.quantity += item.quantity;
        } else {
          orderState.items.push({
            flavor: product.name,
            quantity: item.quantity,
            price: product.price
          });
        }

        addedItems.push({
          flavor: product.name,
          quantity: item.quantity,
          price: product.price,
          subtotal: item.quantity * product.price
        });
      } else {
        notFoundItems.push(item.flavor);
      }
    }

    recalculateTotal(orderState);

    // Format current order
    const orderLines = orderState.items.map(
      item => `${item.quantity} dozen ${item.flavor}: ${symbol}${(item.quantity * item.price).toFixed(2)}`
    );

    return {
      success: addedItems.length > 0,
      added: addedItems,
      notFound: notFoundItems,
      currentOrder: {
        items: orderState.items,
        total: orderState.total,
        formatted: orderLines.join(", ")
      },
      message: addedItems.length > 0
        ? `Added ${addedItems.map(i => `${i.quantity} dozen ${i.flavor}`).join(", ")} to your order.`
        : "I couldn't find those flavors in our menu."
    };
  }
});

/**
 * Tool: Get current order status
 */
const getOrderStatusTool = new FunctionTool({
  name: "get_order_status",
  description: "Get the current order status including items, total, and collected customer info. Call this when the user asks about their order or wants to see what they've ordered.",
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;

    if (orderState.items.length === 0) {
      return {
        hasOrder: false,
        message: "No items in your order yet. What would you like to order?"
      };
    }

    const orderLines = orderState.items.map(
      item => `${item.quantity} dozen ${item.flavor}: ${symbol}${(item.quantity * item.price).toFixed(2)}`
    );

    return {
      hasOrder: true,
      items: orderState.items,
      total: orderState.total,
      customerName: orderState.customerName,
      customerEmail: orderState.customerEmail,
      formatted: orderLines.join("\n"),
      readyToCheckout: orderState.items.length > 0,
      needsName: !orderState.customerName,
      needsEmail: !orderState.customerEmail
    };
  }
});

/**
 * Tool: Remove item from order
 */
const removeFromOrderTool = new FunctionTool({
  name: "remove_from_order",
  description: "Remove a cookie flavor from the current order. Call this when the user wants to remove something from their order.",
  parameters: {
    type: "object",
    properties: {
      flavor: {
        type: "string",
        description: "The cookie flavor to remove from the order"
      }
    },
    required: ["flavor"]
  },
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);

    const index = orderState.items.findIndex(
      i => i.flavor.toLowerCase().includes(input.flavor.toLowerCase())
    );

    if (index === -1) {
      return {
        success: false,
        message: `${input.flavor} is not in your order.`
      };
    }

    const removed = orderState.items.splice(index, 1)[0];
    recalculateTotal(orderState);

    return {
      success: true,
      removed: removed,
      message: `Removed ${removed.quantity} dozen ${removed.flavor} from your order.`,
      currentOrder: {
        items: orderState.items,
        total: orderState.total
      }
    };
  }
});

/**
 * Tool: Set customer info
 */
const setCustomerInfoTool = new FunctionTool({
  name: "set_customer_info",
  description: "Set the customer's name and/or email for the order. Call this when the customer provides their name or email address.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Customer's name"
      },
      email: {
        type: "string",
        description: "Customer's email address"
      }
    }
  },
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);

    if (input.name) {
      orderState.customerName = input.name;
    }
    if (input.email) {
      orderState.customerEmail = input.email.toLowerCase();
    }

    const needsName = !orderState.customerName;
    const needsEmail = !orderState.customerEmail;
    const readyToConfirm = !needsName && !needsEmail && orderState.items.length > 0;

    return {
      success: true,
      customerName: orderState.customerName,
      customerEmail: orderState.customerEmail,
      needsName,
      needsEmail,
      readyToConfirm,
      message: readyToConfirm
        ? `Got it! Ready to confirm your order.`
        : needsName
          ? "Thanks! What's your name?"
          : "Thanks! What's your email address?"
    };
  }
});

/**
 * Tool: Confirm and place order
 */
const confirmOrderTool = new FunctionTool({
  name: "confirm_order",
  description: "Finalize and place the customer's order. Only call this after items, name, and email have been collected AND the customer has confirmed they want to place the order.",
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);
    const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;

    console.log(`[confirm_order] Session: ${sessionId}`);
    console.log(`[confirm_order] Order state:`, JSON.stringify(orderState));

    // Validate order is complete
    if (orderState.items.length === 0) {
      console.log(`[confirm_order] FAILED: No items in order`);
      return { success: false, message: "No items in order. Please add items first." };
    }
    if (!orderState.customerName) {
      console.log(`[confirm_order] FAILED: No customer name`);
      return { success: false, message: "Please provide your name first." };
    }
    if (!orderState.customerEmail) {
      console.log(`[confirm_order] FAILED: No customer email`);
      return { success: false, message: "Please provide your email first." };
    }

    try {
      console.log(`[confirm_order] Recording to sheets...`);
      // Record to Google Sheets
      const sheetResult = await recordOrderToSheets({
        items: orderState.items,
        customerName: orderState.customerName,
        customerEmail: orderState.customerEmail,
        total: orderState.total
      });

      const orderId = sheetResult.orderId;

      if (!sheetResult.skipped) {
        await updateOrderInSheets(orderId, "Confirmed", {});
      }

      // Save order details for response
      const confirmedOrder = {
        orderId,
        items: [...orderState.items],
        customerName: orderState.customerName,
        customerEmail: orderState.customerEmail,
        total: orderState.total
      };

      // Clear order state
      orderState.items = [];
      orderState.customerName = null;
      orderState.customerEmail = null;
      orderState.total = 0;

      return {
        success: true,
        orderId,
        order: confirmedOrder,
        message: `Order ${orderId} confirmed! Total: ${symbol}${confirmedOrder.total.toFixed(2)}`,
        instagram: BUSINESS_CONFIG.contact.instagram
      };
    } catch (error) {
      console.error("Order confirmation error:", error);
      return {
        success: false,
        message: "Sorry, there was an error placing your order. Please try again."
      };
    }
  }
});

/**
 * Tool: Cancel order
 */
const cancelOrderTool = new FunctionTool({
  name: "cancel_order",
  description: "Cancel the current order and clear all items. Call this when the customer wants to cancel or start over.",
  execute: async (input, toolContext) => {
    // Get session ID from invocation context or session
    const sessionId = toolContext?.invocationContext?.session?.id || toolContext?.invocationContext?.sessionId || "default";
    const orderState = getOrderState(sessionId);

    const hadItems = orderState.items.length > 0;

    // Clear everything
    orderState.items = [];
    orderState.customerName = null;
    orderState.customerEmail = null;
    orderState.total = 0;
    orderState.pendingItems = [];
    orderState.awaitingConfirmation = false;

    return {
      success: true,
      hadItems,
      message: hadItems
        ? "Order cancelled. Is there anything else I can help with?"
        : "No problem! Would you like to place a new order?"
    };
  }
});

/**
 * Tool: Answer FAQ
 */
const answerFaqTool = new FunctionTool({
  name: "answer_faq",
  description: "Search the FAQ knowledge base to answer customer questions about the business, products, policies, ingredients, delivery, etc. Call this for any question that isn't about placing an order.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The customer's question to look up"
      }
    },
    required: ["question"]
  },
  execute: async (input) => {
    // Check for product-specific ingredient questions
    const lower = input.question.toLowerCase();

    if (lower.includes("ingredient") || lower.includes("what's in") || lower.includes("made of")) {
      const products = await getProducts();

      for (const product of products) {
        if (lower.includes(product.name.toLowerCase())) {
          if (product.ingredients) {
            return {
              found: true,
              answer: `The ${product.name} cookies contain: ${product.ingredients}. Let me know if you have any allergy concerns!`
            };
          } else {
            return {
              found: false,
              answer: `I don't have the specific ingredients list for ${product.name}. Please contact us at ${BUSINESS_CONFIG.contact.email} for detailed ingredient information.`
            };
          }
        }
      }
    }

    // Search FAQ
    const results = await searchKnowledgeAsync(input.question);

    if (results.length > 0 && results[0].score >= 2) {
      return {
        found: true,
        answer: results[0].answer,
        source: "faq"
      };
    }

    // Check for common patterns
    if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) {
      const products = await getProducts();
      const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
      const prices = products.map(p => `${p.name}: ${symbol}${p.price.toFixed(2)}/${p.unit}`).join(", ");
      return {
        found: true,
        answer: `Our prices are: ${prices}. Would you like to order?`
      };
    }

    if (lower.includes("instagram") || lower.includes("social")) {
      return {
        found: true,
        answer: `Follow us on Instagram ${BUSINESS_CONFIG.contact.instagram} for updates, new flavors, and pickup information!`
      };
    }

    if (lower.includes("contact") || lower.includes("email") || lower.includes("reach")) {
      return {
        found: true,
        answer: `You can reach us at ${BUSINESS_CONFIG.contact.email} or follow us on Instagram ${BUSINESS_CONFIG.contact.instagram}. We're located in ${BUSINESS_CONFIG.contact.location}.`
      };
    }

    return {
      found: false,
      answer: `I'm not sure about that. You can contact us at ${BUSINESS_CONFIG.contact.email} or DM us on Instagram ${BUSINESS_CONFIG.contact.instagram} for more help.`
    };
  }
});

/**
 * Build the agent instruction dynamically with menu data
 */
async function buildInstruction() {
  const products = await getProducts();
  const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;

  const menuList = products.map(p =>
    `- ${p.name}: ${symbol}${p.price.toFixed(2)}/${p.unit}${p.description ? ` - ${p.description}` : ""}`
  ).join("\n");

  return `You are a friendly customer service assistant for "${BUSINESS_CONFIG.businessName}".
${BUSINESS_CONFIG.tagline}

AVAILABLE MENU:
${menuList}

YOUR CAPABILITIES (use these tools):
- get_menu: Show available flavors and prices. Use the formattedMenu from the response - it's already nicely formatted with bullet points.
- add_to_order: Add items to customer's order (quantity in DOZENS, e.g., "2 dozen" = quantity 2)
- get_order_status: Check current order
- remove_from_order: Remove items from order
- set_customer_info: Collect customer name and email
- confirm_order: Finalize the order (only after items + name + email collected)
- cancel_order: Cancel current order
- answer_faq: Answer questions about the business

ORDER FLOW:
1. Customer orders items → use add_to_order tool
2. Customer says "done" or "checkout" → ask for name
3. After name → use set_customer_info tool, then ask for email
4. After email → use set_customer_info tool, show order summary and ask to confirm
5. Customer confirms → YOU MUST call confirm_order tool to record the order to the system

CRITICAL: When the customer says "yes", "confirm", "place order" etc., you MUST call the confirm_order tool. Do NOT just say "your order is confirmed" without calling the tool - the order won't be recorded!

QUANTITY RULES (CRITICAL):
- Quantities are in DOZENS
- "1 dozen chocolate chip" = quantity: 1
- "2 dozen sugar cookies" = quantity: 2
- "chocolate chip cookies" (no number) = quantity: 1

RESPONSE STYLE:
- Be warm, friendly, and efficient
- Keep responses concise (2-3 sentences max for general chat)
- For menu requests: use the formattedMenu exactly as returned by get_menu tool
- Always show order totals in ${symbol}
- After confirming an order, ALWAYS mention Instagram ${BUSINESS_CONFIG.contact.instagram} for pickup info

IMPORTANT - NO HALLUCINATIONS:
- You have NO memory of past conversations or sessions
- NEVER pretend to remember previous orders, emails, names, or interactions
- If a customer says "I gave you my email before" or "last time I ordered...", politely explain you don't have access to past orders and ask them to provide the info again
- Only reference information from the CURRENT conversation
- If you don't know something, say so honestly - don't make things up

CONTACT INFO:
- Instagram: ${BUSINESS_CONFIG.contact.instagram}
- Email: ${BUSINESS_CONFIG.contact.email}
- Location: ${BUSINESS_CONFIG.contact.location}`;
}

// Create the agent
let agent = null;
let runner = null;

/**
 * Initialize or get the agent
 */
async function getAgent() {
  if (!agent) {
    const instruction = await buildInstruction();

    agent = new LlmAgent({
      name: "ewe_cookies_agent",
      model: "gemini-2.0-flash",
      instruction,
      tools: [
        getMenuTool,
        addToOrderTool,
        getOrderStatusTool,
        removeFromOrderTool,
        setCustomerInfoTool,
        confirmOrderTool,
        cancelOrderTool,
        answerFaqTool
      ],
      generateContentConfig: {
        temperature: 0.7,
        maxOutputTokens: 500
      }
    });

    runner = new Runner({
      appName: "ewe_cookies",
      agent,
      sessionService
    });
  }

  return { agent, runner };
}

// Track created sessions
const createdSessions = new Set();

/**
 * Ensure session exists in the session service
 */
async function ensureSession(sessionId) {
  if (!createdSessions.has(sessionId)) {
    await sessionService.createSession({
      appName: "ewe_cookies",
      userId: "user",
      sessionId,
      state: {}
    });
    createdSessions.add(sessionId);
  }
}

/**
 * Process a message using the ADK agent
 * @param {string} message - User message
 * @param {string} sessionId - Session ID
 * @returns {Promise<{response: string, session: object}>}
 */
export async function processWithADK(message, sessionId) {
  const { runner } = await getAgent();

  // Ensure session exists in ADK and order state exists
  await ensureSession(sessionId);
  getOrderState(sessionId);

  let response = "";

  try {
    // Run the agent
    console.log(`[ADK] Processing message for session ${sessionId}: "${message}"`);

    const events = runner.runAsync({
      userId: "user",
      sessionId,
      newMessage: {
        role: "user",
        parts: [{ text: message }]
      }
    });

    // Collect the final response
    for await (const event of events) {
      // Log function calls
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if (part.functionCall) {
            console.log(`[ADK] Function called: ${part.functionCall.name}`, JSON.stringify(part.functionCall.args));
          }
          if (part.functionResponse) {
            console.log(`[ADK] Function response for: ${part.functionResponse.name}`);
          }
          if (part.text) {
            console.log(`[ADK] Found text response: ${part.text.slice(0, 100)}`);
            response = part.text;
          }
        }
      }

      // Check for errors
      if (event.errorMessage) {
        console.error(`[ADK] Error: ${event.errorMessage}`);
      }
    }

    console.log(`[ADK] Final response: ${response.slice(0, 100) || "(empty)"}`);

    if (!response) {
      response = "I'm here to help! Would you like to see our menu or place an order?";
    }

    return {
      response,
      session: {
        id: sessionId,
        order: getOrderState(sessionId)
      }
    };
  } catch (error) {
    console.error("ADK Agent error:", error);

    // Fallback response
    return {
      response: "I'm sorry, I had trouble processing that. Could you try rephrasing? You can ask about our menu or place an order.",
      session: {
        id: sessionId,
        order: getOrderState(sessionId)
      }
    };
  }
}

/**
 * Create a new session ID
 */
export function createADKSession() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
