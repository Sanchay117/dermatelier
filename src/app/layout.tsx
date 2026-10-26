import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DermAtelier — Clinical Skin AI × Dermal-Governed Virtual Try-On",
  description:
    "Powered by Perfect Corp. YouCam S2S API v2.0. Evaluates 14+ clinical skin metrics to govern Makeup & Apparel Virtual Try-On, eliminate active-ingredient barrier clashes, and cut eCommerce returns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#FAF7F2] text-[#171412] selection:bg-[#B85D43]/20">
        {children}
      </body>
    </html>
  );
}
