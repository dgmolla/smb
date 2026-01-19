/**
 * /api/chat - Serverless API Route
 * Handles chat messages and returns AI responses
 */

import { NextResponse } from "next/server";
import { processMessage, createSession } from "../../../lib/conversation.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, session: clientSession } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    // Restore or create session
    const session = clientSession || createSession();

    // Process message
    const result = await processMessage(message.trim(), session);

    return NextResponse.json({
      success: true,
      response: result.response,
      session: result.session,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process message",
        response: "I'm sorry, something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Chat API is running",
    timestamp: new Date().toISOString(),
  });
}
