// app/layout.tsx
export const metadata = {
  title: "Rahab Punkaholic Girls",
  description: "PGirls NFT Minting Site",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0, backgroundColor: "black", color: "white" }}>
        {children}
      </body>
    </html>
  );
}
