// Run this once to set up Menu and FAQ sheets
// Usage: node setup-data-sheets.js

import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

async function setup() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Get existing sheets
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

  console.log("Existing sheets:", existingSheets);

  // Create Menu sheet if it doesn't exist
  if (!existingSheets.includes("Menu")) {
    console.log("Creating Menu sheet...");
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: "Menu" }
          }
        }]
      }
    });
  } else {
    console.log("Menu sheet already exists.");
  }

  // Create FAQ sheet if it doesn't exist
  if (!existingSheets.includes("FAQ")) {
    console.log("Creating FAQ sheet...");
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: "FAQ" }
          }
        }]
      }
    });
  } else {
    console.log("FAQ sheet already exists.");
  }

  // Add Menu headers and sample data
  console.log("Adding Menu data...");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Menu!A1:E10",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        ["Name", "Price", "Unit", "Description", "Ingredients"],
        ["Chocolate Chip", 18.00, "dozen", "Classic cookies with premium chocolate chunks", "Flour, butter, sugar, eggs, chocolate chips, vanilla, baking soda, salt"],
        ["Oatmeal Raisin", 16.00, "dozen", "Hearty oats with plump raisins", "Flour, oats, butter, brown sugar, eggs, raisins, cinnamon, baking soda, salt"],
        ["Snickerdoodle", 15.00, "dozen", "Cinnamon-sugar perfection", "Flour, butter, sugar, eggs, cream of tartar, cinnamon, baking soda, salt"],
        ["Peanut Butter", 17.00, "dozen", "Rich and creamy peanut butter cookies", "Flour, peanut butter, butter, sugar, eggs, baking soda, salt"],
        ["Sugar Cookie", 14.00, "dozen", "Classic buttery sugar cookies", "Flour, butter, sugar, eggs, vanilla, baking powder, salt"],
        ["Double Chocolate", 19.00, "dozen", "For serious chocolate lovers", "Flour, cocoa powder, butter, sugar, eggs, chocolate chips, vanilla, baking soda, salt"],
      ],
    },
  });

  // Add FAQ headers and sample data
  console.log("Adding FAQ data...");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "FAQ!A1:C10",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        ["Question", "Answer", "Keywords"],
        ["What are your hours?", "We're open Monday-Saturday 8am-6pm, and Sunday 9am-3pm.", "hours,open,time,closed,when"],
        ["Do you deliver?", "Yes! We deliver within 15 miles for orders over 3 dozen. Delivery fee is $5.", "delivery,deliver,ship,shipping"],
        ["Do you have gluten-free options?", "Yes! We have gluten-free chocolate chip and sugar cookies available. Just ask when ordering!", "gluten,allergy,gf,free,celiac"],
        ["What's your return policy?", "We guarantee freshness! If you're not satisfied, contact us within 24 hours for a full refund.", "return,refund,policy,guarantee,money back"],
        ["Can I place a large order for an event?", "Absolutely! For orders over 10 dozen, please contact us directly at orders@sweetdelights.com or call (555) 123-4567.", "large,bulk,catering,event,party,wedding"],
        ["Are your cookies nut-free?", "Our Peanut Butter cookies contain nuts. All other flavors are made in a facility that processes nuts, so we cannot guarantee nut-free.", "nut,allergy,peanut,tree nut"],
      ],
    },
  });

  console.log("Done! Menu and FAQ sheets are ready.");
  console.log("\nYou can now edit these sheets directly in Google Sheets to customize your menu and FAQs.");
}

setup().catch(console.error);
