import { currentUser } from '../auth.js';
import AccountMenu from './account-menu.jsx';
import Home from './chat-home.jsx';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await currentUser();
  return <Home key={user?.id || 'guest'} userId={user?.id} accountMenu={<AccountMenu user={user} />} />;
}
