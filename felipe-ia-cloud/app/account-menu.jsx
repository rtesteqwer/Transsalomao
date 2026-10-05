import { cookies } from 'next/headers';
import { signOut } from '../auth.js';

export default function AccountMenu({ user }) {
  if (!user) return <a className="accountLogin" href="/login">Entrar ou criar conta com Google</a>;
  return <div className="accountMenu">
    <div><strong>{user.name}</strong><small>{user.email}</small></div>
    <form action={async () => {
      'use server';
      const store = await cookies();
      for (const cookie of store.getAll()) {
        if (cookie.name.startsWith('felipe_plugin_')) store.delete(cookie.name);
      }
      await signOut({ redirectTo: '/' });
    }}><button type="submit">Sair</button></form>
  </div>;
}
