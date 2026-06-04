import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "../components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Holomedic Facturación | Gestión de Cobranza y Valoraciones",
  description: "Plataforma de facturación, cobranza y valoraciones automatizadas para Holomedic.",
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
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 md:ml-64 min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          {children}
        </main>
      </body>
    </html>
  );
}
