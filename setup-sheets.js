// Run this once to set up the Orders sheet
// Usage: node setup-sheets.js

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

  // Check if Orders sheet exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const ordersSheet = spreadsheet.data.sheets?.find(
    s => s.properties?.title === "Orders"
  );

  if (!ordersSheet) {
    console.log("Creating Orders sheet...");
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: "Orders" }
          }
        }]
      }
    });
  } else {
    console.log("Orders sheet already exists.");
  }

  // Add headers
  console.log("Adding headers...");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Orders!A1:H1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        "Order ID",
        "Timestamp",
        "Customer Name",
        "Customer Email",
        "Items (JSON)",
        "Total",
        "Status",
        "Notes"
      ]],
    },
  });

  console.log("Done! Orders sheet is ready.");
}

setup().catch(console.error);
