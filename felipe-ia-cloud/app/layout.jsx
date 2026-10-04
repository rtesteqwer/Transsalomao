import './globals.css';

export const metadata = {
  title: 'Felipe IA',
  description: 'Assistente pessoal em nuvem com Qwen, memória e modo Code.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0b'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
