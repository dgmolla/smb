# Bakery Bot - Reusable AI Small Business Chatbot

A **configuration-first** AI chatbot for small businesses. The "engine" (code) stays the same - you only change the "fuel" (config.js + environment variables) for each deployment.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React Chat    │────▶│  /api/chat       │────▶│  Gemini 2.5     │
│   Component     │     │  (Vercel)        │     │  Flash          │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
              ┌──────────┐              ┌──────────┐
              │ Google   │              │  Your    │
              │ Sheets   │              │  Tool    │
              └──────────┘              └──────────┘
                  ↑                         ↑
               OPTIONAL                  SWAPPABLE
```

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/bakery-bot.git
cd bakery-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and add at minimum:

```
GEMINI_API_KEY=your_key_from_google_ai_studio
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel

```bash
npx vercel
```

Or connect your GitHub repo to Vercel for auto-deployments.

---

## Configuration

### Customize for Your Business

Edit `config.js` to change:

| Field | Description |
|-------|-------------|
| `businessName` | Your business name |
| `tagline` | Shown in header |
| `brandColor` | Single CSS color for white-labeling |
| `products` | Your products with prices |
| `flavorAliases` | Natural language shortcuts |
| `knowledgeBase` | FAQs the bot can answer |
| `orderSettings` | Min/max quantities, currency |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `GOOGLE_SPREADSHEET_ID` | No | For order recording |
| `GOOGLE_CREDENTIALS` | No | Service account JSON |

---

## Swapping Integrations

### Replace Google Sheets

Edit `lib/tools/sheets.js`:

```javascript
// Replace recordOrderToSheets() with your database
export async function recordOrderToSheets(orderData) {
  // Example: Airtable
  await airtable.create('Orders', orderData);

  // Example: Supabase
  await supabase.from('orders').insert(orderData);

  // Example: MongoDB
  await db.collection('orders').insertOne(orderData);
}
```

### Add Payment/Invoice Integration

Create a new file `lib/tools/payments.js`:

```javascript
// Example: Stripe
export async function createInvoice(orderData) {
  const invoice = await stripe.invoices.create({...});
  return { invoiceId: invoice.id };
}

// Example: Square
export async function createInvoice(orderData) {
  const invoice = await square.invoices.create({...});
  return { invoiceId: invoice.id };
}

// Example: Just send email
export async function createInvoice(orderData) {
  await sendEmail(orderData.customerEmail, 'Your Invoice', ...);
  return { success: true };
}
```

---

## File Structure

```
bakery-bot/
├── config.js              # 👈 CUSTOMIZE THIS: Business data
├── .env.local             # 👈 CUSTOMIZE THIS: API keys
│
├── app/
│   ├── page.js            # React chat component
│   ├── page.module.css    # White-label styles
│   ├── layout.js          # HTML wrapper
│   └── api/chat/route.js  # Serverless API endpoint
│
├── lib/
│   ├── gemini.js          # Gemini AI integration
│   ├── conversation.js    # State machine
│   └── tools/
│       └── sheets.js      # Google Sheets (swappable)
│
├── package.json
└── README.md
```

---

## White-Labeling

Change the brand color in `app/page.module.css`:

```css
.main {
  --brand-color: #f5576c; /* Change this one value */
}
```

Or for a completely different look, the gradient:

```css
.main {
  --brand-gradient: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
}
```

---

## Testing

### Test Conversation Flow

```
You: Hello!
Bot: Welcome to Sweet Delights Bakery!...

You: I want to order cookies
Bot: Here's what we have: [menu]

You: 2 dozen chocolate chip
Bot: Added! Total: $36.00. Say 'done' to checkout.

You: done
Bot: What's your name?

You: John Smith
Bot: Thanks! What's your email?

You: john@example.com
Bot: Order summary... Type 'confirm' to place order.

You: confirm
Bot: 🎉 Order confirmed! Order ID: ORD-XXX
```

---

## License

MIT - Use freely for any business!
