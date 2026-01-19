/**
 * Conversation State Machine
 * Handles the order flow and state transitions
 */

import { BUSINESS_CONFIG, getAvailableProducts, getProductByName } from "../config.js";
import { processWithGemini, extractOrderDetails, classifyIntentQuick } from "./gemini.js";
import { recordOrderToSheets, updateOrderInSheets } from "./tools/sheets.js";

// Conversation states
export const STATES = {
  IDLE: "idle",
  COLLECTING_ORDER: "collecting_order",
  COLLECTING_NAME: "collecting_name",
  COLLECTING_EMAIL: "collecting_email",
  CONFIRMING_ORDER: "confirming_order",
  PROCESSING: "processing",
};

/**
 * Create a new session
 */
export function createSession() {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    state: STATES.IDLE,
    history: [],
    order: {
      items: [],
      customerName: null,
      customerEmail: null,
      total: 0,
    },
  };
}

/**
 * Process a message through the state machine
 */
export async function processMessage(message, session) {
  // Add to history
  session.history.push({ role: "user", content: message });

  // Quick intent classification
  const quickIntent = classifyIntentQuick(message);

  // Route based on current state
  let result;
  switch (session.state) {
    case STATES.IDLE:
      result = await handleIdle(message, session, quickIntent);
      break;
    case STATES.COLLECTING_ORDER:
      result = await handleCollectingOrder(message, session, quickIntent);
      break;
    case STATES.COLLECTING_NAME:
      result = handleCollectingName(message, session);
      break;
    case STATES.COLLECTING_EMAIL:
      result = handleCollectingEmail(message, session);
      break;
    case STATES.CONFIRMING_ORDER:
      result = await handleConfirming(message, session, quickIntent);
      break;
    default:
      result = { response: "Something went wrong. How can I help you?", newState: STATES.IDLE };
  }

  // Update state
  session.state = result.newState;

  // Add response to history
  session.history.push({ role: "assistant", content: result.response });

  return {
    response: result.response,
    session,
  };
}

/**
 * IDLE state handler
 */
async function handleIdle(message, session, intent) {
  const config = BUSINESS_CONFIG;

  if (intent === "GREETING") {
    const products = getAvailableProducts();
    return {
      response: `Hello! Welcome to ${config.businessName}! I can help you place an order or answer questions. We have ${products.length} delicious cookie flavors available. What can I do for you?`,
      newState: STATES.IDLE,
    };
  }

  if (intent === "ORDER" || intent === "ORDER_ITEM") {
    const extracted = await extractOrderDetails(message);

    if (extracted.items?.length > 0) {
      addItemsToOrder(session, extracted.items);
      return {
        response: formatOrderProgress(session.order) +
          "\n\nWould you like to add more? Say 'done' when ready to checkout.",
        newState: STATES.COLLECTING_ORDER,
      };
    }

    const products = getAvailableProducts();
    const productList = products
      .map(p => `• ${p.name} - ${config.orderSettings.currencySymbol}${p.price.toFixed(2)}/${p.unit}`)
      .join("\n");

    return {
      response: `I'd love to help you order! Here's what we have:\n\n${productList}\n\nJust tell me what you'd like (e.g., "2 dozen chocolate chip")`,
      newState: STATES.COLLECTING_ORDER,
    };
  }

  // Use AI for FAQs and unknown intents
  const aiResult = await processWithGemini(message, session.history.slice(-4), session.state, session.id);
  return {
    response: aiResult.response,
    newState: STATES.IDLE,
  };
}

/**
 * COLLECTING_ORDER state handler
 */
async function handleCollectingOrder(message, session, intent) {
  const lower = message.toLowerCase();

  // Check for done/checkout
  if (["done", "checkout", "that's all", "proceed", "finish"].some(w => lower.includes(w)) || intent === "CONFIRM") {
    if (session.order.items.length === 0) {
      return {
        response: "You haven't added any items yet! What would you like to order?",
        newState: STATES.COLLECTING_ORDER,
      };
    }
    return {
      response: formatOrderSummary(session.order) + "\n\nGreat! What's your name?",
      newState: STATES.COLLECTING_NAME,
    };
  }

  // Check for cancel
  if (intent === "CANCEL" || lower.includes("cancel")) {
    session.order = { items: [], customerName: null, customerEmail: null, total: 0 };
    return {
      response: "Order cancelled. Is there anything else I can help with?",
      newState: STATES.IDLE,
    };
  }

  // Try to extract order items
  const extracted = await extractOrderDetails(message);

  if (extracted.items?.length > 0) {
    addItemsToOrder(session, extracted.items);
    return {
      response: `Added!\n\n${formatOrderProgress(session.order)}\n\nAnything else? Say 'done' to checkout.`,
      newState: STATES.COLLECTING_ORDER,
    };
  }

  return {
    response: "I didn't catch that. Please specify flavor and quantity (e.g., '2 dozen chocolate chip')",
    newState: STATES.COLLECTING_ORDER,
  };
}

/**
 * COLLECTING_NAME state handler
 */
function handleCollectingName(message, session) {
  const name = message.trim();

  if (name.length < 2) {
    return {
      response: "Please enter your full name.",
      newState: STATES.COLLECTING_NAME,
    };
  }

  session.order.customerName = name;
  return {
    response: `Thanks, ${name}! What's your email address?`,
    newState: STATES.COLLECTING_EMAIL,
  };
}

/**
 * COLLECTING_EMAIL state handler
 */
function handleCollectingEmail(message, session) {
  const email = message.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      response: "That doesn't look like a valid email. Please try again.",
      newState: STATES.COLLECTING_EMAIL,
    };
  }

  session.order.customerEmail = email;
  return {
    response: formatFinalConfirmation(session.order) +
      "\n\nType 'confirm' to place your order, 'modify' to change it, or 'cancel' to cancel.",
    newState: STATES.CONFIRMING_ORDER,
  };
}

/**
 * CONFIRMING_ORDER state handler
 */
async function handleConfirming(message, session, intent) {
  const lower = message.toLowerCase();

  // Accept various confirmations: "confirm", "yes", "yea", "yeah", "yep", "sure", "ok"
  const confirmWords = ["confirm", "yes", "yea", "yeah", "yep", "sure", "ok", "okay", "place order", "submit"];
  const isConfirm = intent === "CONFIRM" || confirmWords.some(word => lower.includes(word));

  if (isConfirm) {
    // Process the order
    const result = await processOrder(session.order);

    // Clear order
    const completedOrder = { ...session.order };
    session.order = { items: [], customerName: null, customerEmail: null, total: 0 };

    return {
      response: `🎉 Order confirmed!\n\n` +
        `**Order ID:** ${result.orderId}\n` +
        `**Total:** ${BUSINESS_CONFIG.orderSettings.currencySymbol}${completedOrder.total.toFixed(2)}\n\n` +
        `Thank you for your order, ${completedOrder.customerName}! Check our Instagram @ewe_cookies for pickup information.\n\n` +
        `Is there anything else I can help with?`,
      newState: STATES.IDLE,
    };
  }

  if (lower.includes("modify") || lower.includes("change")) {
    return {
      response: formatOrderProgress(session.order) + "\n\nWhat would you like to change?",
      newState: STATES.COLLECTING_ORDER,
    };
  }

  if (intent === "CANCEL" || lower.includes("cancel")) {
    session.order = { items: [], customerName: null, customerEmail: null, total: 0 };
    return {
      response: "Order cancelled. Is there anything else I can help with?",
      newState: STATES.IDLE,
    };
  }

  return {
    response: "Please type 'confirm', 'modify', or 'cancel'.",
    newState: STATES.CONFIRMING_ORDER,
  };
}

/**
 * Process order - record to sheets
 */
async function processOrder(order) {
  // Record to Google Sheets (optional - works without credentials)
  const sheetResult = await recordOrderToSheets(order);
  const orderId = sheetResult.orderId;

  // Update sheet status
  if (!sheetResult.skipped) {
    await updateOrderInSheets(orderId, "Confirmed", {});
  }

  return {
    success: true,
    orderId,
  };
}

/**
 * Add items to order (merge same flavors)
 */
function addItemsToOrder(session, items) {
  for (const item of items) {
    const product = getProductByName(item.flavor);
    if (!product) continue;

    const existing = session.order.items.find(
      i => i.flavor.toLowerCase() === product.name.toLowerCase()
    );

    if (existing) {
      existing.quantity += item.quantity || 1;
    } else {
      session.order.items.push({
        flavor: product.name,
        quantity: item.quantity || 1,
        price: product.price,
      });
    }
  }

  // Recalculate total
  session.order.total = session.order.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
}

/**
 * Format order progress
 */
function formatOrderProgress(order) {
  const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
  const lines = order.items.map(
    item => `• ${item.quantity} dozen ${item.flavor}: ${symbol}${(item.quantity * item.price).toFixed(2)}`
  );
  return `**Current Order:**\n${lines.join("\n")}\n\n**Total: ${symbol}${order.total.toFixed(2)}**`;
}

/**
 * Format order summary
 */
function formatOrderSummary(order) {
  const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
  const items = order.items.map(i => `${i.quantity} dozen ${i.flavor}`).join(", ");
  return `**Order:** ${items}\n**Total:** ${symbol}${order.total.toFixed(2)}`;
}

/**
 * Format final confirmation
 */
function formatFinalConfirmation(order) {
  const symbol = BUSINESS_CONFIG.orderSettings.currencySymbol;
  const lines = order.items.map(
    item => `• ${item.quantity} dozen ${item.flavor}: ${symbol}${(item.quantity * item.price).toFixed(2)}`
  );

  return `**Order Summary**\n` +
    `───────────────\n` +
    `**Name:** ${order.customerName}\n` +
    `**Email:** ${order.customerEmail}\n\n` +
    `**Items:**\n${lines.join("\n")}\n\n` +
    `**Total: ${symbol}${order.total.toFixed(2)}**`;
}
