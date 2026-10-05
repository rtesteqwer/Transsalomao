import { redirect } from 'next/navigation';
import { currentUser, signIn } from '../../auth.js';
import { googleSignupReady } from '../../lib/account-policy.js';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  if (await currentUser()) redirect('/');
  const ready = googleSignupReady();
  const { error } = await searchParams;
  return <main className="loginPage">
    <section className="loginCard">
      <a className="loginBack" href="/">← Felipe IA</a>
      <div className="loginMark" aria-hidden="true">F</div>
      <h1>Sua conta na Felipe IA</h1>
      <p>Entre com Google. No primeiro acesso, seu cadastro é criado automaticamente.</p>
      {error && <p className="errorBox" role="alert">Não foi possível concluir o acesso. Tente novamente com sua conta Google.</p>}
      <form action={async () => {
        'use server';
        if (!googleSignupReady()) redirect('/login?error=Configuration');
        await signIn('google', { redirectTo: '/' });
      }}>
        <button className="googleLogin" disabled={!ready} type="submit">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.31 2.99-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z"/></svg>
          Continuar com Google
        </button>
      </form>
      {!ready && <p role="status">O cadastro com Google está sendo preparado. Você pode continuar usando a Felipe IA como visitante.</p>}
      <p className="loginDetail">Usamos seu nome e e-mail para identificar sua conta. Conectar Gmail ou YouTube é opcional e feito separadamente em Plugins.</p>
      <p className="loginDetail">Seu histórico fica neste navegador, separado por conta. Ele ainda não é sincronizado entre dispositivos.</p>
      <a className="loginGuest" href="/">Continuar como visitante</a>
    </section>
  </main>;
}
