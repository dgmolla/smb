import { BUSINESS_CONFIG } from "../config.js";

export const metadata = {
  title: `${BUSINESS_CONFIG.businessName} - Order Online`,
  description: BUSINESS_CONFIG.tagline,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
