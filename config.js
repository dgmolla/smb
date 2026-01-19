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
  businessName: "Ewe Cookies",
  tagline: "We bake chewy cookies with a gooey twist ❤️",

  // Brand colors (red and white theme)
  brandColor: "#e63946",
  brandColorLight: "#fff",

  // ==========================================
  // PRODUCTS & PRICING
  // ==========================================
  products: [
    {
      id: "froot-loops",
      name: "Froot Loops",
      price: 18.00,
      unit: "dozen",
      description: "Colorful cereal-infused cookies",
      ingredients: null, // Add ingredients here, e.g., "flour, sugar, butter, Froot Loops cereal, eggs"
      available: true
    },
    {
      id: "matcha-oreo",
      name: "Matcha/Oreo",
      price: 19.00,
      unit: "dozen",
      description: "Matcha green tea with Oreo chunks",
      ingredients: null,
      available: true
    },
    {
      id: "lotus",
      name: "Lotus",
      price: 18.00,
      unit: "dozen",
      description: "Biscoff cookie butter delight",
      ingredients: null,
      available: true
    },
    {
      id: "corn-flakes",
      name: "Corn Flakes",
      price: 16.00,
      unit: "dozen",
      description: "Crispy corn flake cookies",
      ingredients: null,
      available: true
    },
    {
      id: "cheddar-cheese",
      name: "Cheddar Cheese",
      price: 17.00,
      unit: "dozen",
      description: "Savory cheddar cheese cookies",
      ingredients: null,
      available: true
    },
    {
      id: "smore",
      name: "S'more",
      price: 19.00,
      unit: "dozen",
      description: "Graham, chocolate, and marshmallow",
      ingredients: null,
      available: true
    },
    {
      id: "dubai-chewy",
      name: "Dubai Chewy",
      price: 20.00,
      unit: "dozen",
      description: "Premium Dubai-style chewy cookies",
      ingredients: null,
      available: true
    }
  ],

  // Flavor aliases for natural language understanding
  flavorAliases: {
    "froot loop": "Froot Loops",
    "fruit loops": "Froot Loops",
    "fruity": "Froot Loops",
    "matcha": "Matcha/Oreo",
    "oreo": "Matcha/Oreo",
    "green tea": "Matcha/Oreo",
    "biscoff": "Lotus",
    "cookie butter": "Lotus",
    "corn flake": "Corn Flakes",
    "cornflake": "Corn Flakes",
    "cheddar": "Cheddar Cheese",
    "cheese": "Cheddar Cheese",
    "savory": "Cheddar Cheese",
    "smore": "S'more",
    "s'mores": "S'more",
    "smores": "S'more",
    "marshmallow": "S'more",
    "dubai": "Dubai Chewy",
    "chewy": "Dubai Chewy"
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
    email: "ewe.cookies@gmail.com",
    instagram: "@ewe_cookies",
    location: "Los Angeles, CA"
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
