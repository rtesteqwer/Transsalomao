export default function SetupRequiredPage() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1220', color: '#f8fafc' }}>
      <section style={{ maxWidth: 620, padding: 28, border: '1px solid #7c2d12', borderRadius: 18, background: '#111c2e' }}>
        <h1 style={{ fontSize: 25, marginTop: 0 }}>Configuração de segurança necessária</h1>
        <p style={{ color: '#cbd5e1' }}>O acesso foi bloqueado porque faltam variáveis de autenticação no servidor. Configure as duas variáveis abaixo na Vercel e faça um novo deploy.</p>
        <ul style={{ lineHeight: 1.9 }}>
          <li><code>FELIPE_IA_ACCESS_PASSWORD</code></li>
          <li><code>FELIPE_IA_SESSION_SECRET</code></li>
        </ul>
        <p style={{ color: '#cbd5e1' }}>Não coloque esses valores no código, no navegador ou em arquivos versionados.</p>
      </section>
    </main>
  );
}
