import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "LKW Planning",
  description: "Internal LKW planning application",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

