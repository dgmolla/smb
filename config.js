/**
 * Business Configuration
 *
 * CUSTOMIZE THIS FILE for each business deployment.
 * All business-specific data lives here - the engine code never changes.
 */

export const BUSINESS_CONFIG = {
  // ==========================================
  // BUSINESS IDENTITY
  // ==========================================
  businessName: "Sweet Delights Bakery",
  tagline: "Fresh-baked cookies delivered to your door",

  // Brand color (used throughout the UI)
  // Change this single value to white-label the entire app
  brandColor: "#f5576c",

  // ==========================================
  // PRODUCTS & PRICING
  // ==========================================
  products: [
    {
      id: "chocolate-chip",
      name: "Chocolate Chip",
      price: 18.00,
      unit: "dozen",
      description: "Classic cookies with premium chocolate chunks",
      available: true
    },
    {
      id: "oatmeal-raisin",
      name: "Oatmeal Raisin",
      price: 16.00,
      unit: "dozen",
      description: "Hearty oats with plump raisins",
      available: true
    },
    {
      id: "snickerdoodle",
      name: "Snickerdoodle",
      price: 15.00,
      unit: "dozen",
      description: "Cinnamon-sugar perfection",
      available: true
    },
    {
      id: "peanut-butter",
      name: "Peanut Butter",
      price: 17.00,
      unit: "dozen",
      description: "Rich and creamy peanut butter cookies",
      available: true
    },
    {
      id: "sugar-cookie",
      name: "Sugar Cookie",
      price: 14.00,
      unit: "dozen",
      description: "Classic buttery sugar cookies",
      available: true
    },
    {
      id: "double-chocolate",
      name: "Double Chocolate",
      price: 19.00,
      unit: "dozen",
      description: "For serious chocolate lovers",
      available: true
    }
  ],

  // Flavor aliases for natural language understanding
  flavorAliases: {
    "chocolate": "Chocolate Chip",
    "choc chip": "Chocolate Chip",
    "cc": "Chocolate Chip",
    "oatmeal": "Oatmeal Raisin",
    "oat": "Oatmeal Raisin",
    "snicker": "Snickerdoodle",
    "cinnamon": "Snickerdoodle",
    "pb": "Peanut Butter",
    "peanut": "Peanut Butter",
    "sugar": "Sugar Cookie",
    "plain": "Sugar Cookie",
    "double choc": "Double Chocolate"
  },

  // ==========================================
  // KNOWLEDGE BASE (FAQs)
  // ==========================================
  knowledgeBase: [
    {
      question: "What are your hours?",
      answer: "We're open Monday-Saturday 8am-6pm, and Sunday 9am-3pm.",
      keywords: ["hours", "open", "time", "closed", "when"]
    },
    {
      question: "Do you deliver?",
      answer: "Yes! We deliver within 15 miles for orders over 3 dozen. Delivery fee is $5.",
      keywords: ["delivery", "deliver", "ship", "shipping"]
    },
    {
      question: "Do you have gluten-free options?",
      answer: "Yes! We have gluten-free chocolate chip and sugar cookies available. Just ask when ordering!",
      keywords: ["gluten", "allergy", "gf", "free", "celiac"]
    },
    {
      question: "What's your return policy?",
      answer: "We guarantee freshness! If you're not satisfied, contact us within 24 hours for a full refund.",
      keywords: ["return", "refund", "policy", "guarantee", "money back"]
    },
    {
      question: "Can I place a large order for an event?",
      answer: "Absolutely! For orders over 10 dozen, please contact us directly at orders@sweetdelights.com or call (555) 123-4567.",
      keywords: ["large", "bulk", "catering", "event", "party", "wedding"]
    },
    {
      question: "Are your cookies nut-free?",
      answer: "Our Peanut Butter cookies contain nuts. All other flavors are made in a facility that processes nuts, so we cannot guarantee nut-free.",
      keywords: ["nut", "allergy", "peanut", "tree nut"]
    }
  ],

  // ==========================================
  // ORDER SETTINGS
  // ==========================================
  orderSettings: {
    minQuantity: 1,        // Minimum dozens per flavor
    maxQuantity: 50,       // Maximum dozens per order
    currency: "USD",
    currencySymbol: "$"
  },

  // ==========================================
  // GOOGLE SHEETS (optional - for order recording)
  // ==========================================
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || null,

  // ==========================================
  // CONTACT INFO
  // ==========================================
  contact: {
    email: "orders@sweetdelights.com",
    phone: "(555) 123-4567"
  }
};

/**
 * Get available products only
 */
export function getAvailableProducts() {
  return BUSINESS_CONFIG.products.filter(p => p.available);
}

/**
 * Get product by name (case-insensitive, handles aliases)
 */
export function getProductByName(name) {
  const normalized = name.toLowerCase().trim();

  // Check aliases first
  const aliasMatch = BUSINESS_CONFIG.flavorAliases[normalized];
  if (aliasMatch) {
    return BUSINESS_CONFIG.products.find(p => p.name === aliasMatch);
  }

  // Direct match
  return BUSINESS_CONFIG.products.find(p =>
    p.name.toLowerCase() === normalized ||
    p.name.toLowerCase().includes(normalized)
  );
}

/**
 * Search knowledge base
 */
export function searchKnowledge(query) {
  const queryWords = query.toLowerCase().split(/\s+/);

  return BUSINESS_CONFIG.knowledgeBase
    .map(entry => {
      let score = 0;
      for (const word of queryWords) {
        if (entry.keywords.some(k => k.includes(word))) score += 3;
        if (entry.question.toLowerCase().includes(word)) score += 2;
        if (entry.answer.toLowerCase().includes(word)) score += 1;
      }
      return { ...entry, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
