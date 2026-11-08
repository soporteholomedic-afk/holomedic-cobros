import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionShell from "../components/SessionShell";
import { AuthProvider } from "../features/auth/presentation/hooks/useAuth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Holomedic Suite | Gestión de Cobranza y Valoraciones",
  description: "Suite de gestión para Holomedic: cobranza, facturación, consolidados, valoraciones, áreas y CRM en una sola plataforma.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <SessionShell>{children}</SessionShell>
        </AuthProvider>
      </body>
    </html>
  );
}
