/**
 * Business Configuration
 *
 * Core settings for the business. Product/FAQ data comes from Google Sheets.
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
  // ORDER SETTINGS
  // ==========================================
  orderSettings: {
    minQuantity: 1,
    maxQuantity: 50,
    currency: "USD",
    currencySymbol: "$",
    defaultUnit: "dozen"
  },

  // ==========================================
  // GOOGLE SHEETS (source of truth for menu/FAQ/orders)
  // ==========================================
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,

  // ==========================================
  // CONTACT INFO
  // ==========================================
  contact: {
    email: "ewe.cookies@gmail.com",
    instagram: "@ewe_cookies",
    location: "Los Angeles, CA"
  }
};
