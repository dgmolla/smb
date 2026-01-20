/**
 * Conversation Handler
 *
 * Uses Google ADK for AI-powered order processing with function calling.
 * The ADK agent handles intent classification and parameter extraction reliably.
 */

import { processWithADK, createADKSession } from "./adk-agent.js";

/**
 * Create a new session
 */
export function createSession() {
  return {
    id: createADKSession(),
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
 * Process a message using the ADK agent
 * @param {string} message - User message
 * @param {object} session - Session object
 * @returns {Promise<{response: string, session: object}>}
 */
export async function processMessage(message, session) {
  // Track message in history
  session.history.push({ role: "user", content: message });

  try {
    // Process with ADK agent
    const result = await processWithADK(message, session.id);

    // Update session with order state from ADK
    if (result.session?.order) {
      session.order = result.session.order;
    }

    // Track response in history
    session.history.push({ role: "assistant", content: result.response });

    return {
      response: result.response,
      session
    };
  } catch (error) {
    console.error("Chat API error:", error);

    const errorResponse = "I'm sorry, something went wrong. Please try again or ask about our menu!";
    session.history.push({ role: "assistant", content: errorResponse });

    return {
      response: errorResponse,
      session
    };
  }
}

// Export STATES for backward compatibility (not used with ADK)
export const STATES = {
  IDLE: "idle",
  COLLECTING_ORDER: "collecting_order",
  CONFIRMING_ITEM: "confirming_item",
  COLLECTING_NAME: "collecting_name",
  COLLECTING_EMAIL: "collecting_email",
  CONFIRMING_ORDER: "confirming_order",
};
