import { useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import Auth from './Auth';
import Notes from './Notes';
import Posts from './Posts';
import { Users, AllNotes, InterestGroups } from './Admin';

const USER_TABS = ['My notes', 'Posts'];
const ADMIN_TABS = ['Users', 'All notes', 'Users by interest'];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));
  const [tab, setTab] = useState(USER_TABS[0]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then(({ user: me }) => setUser(me))
      .catch((err) => err.status === 401 && tokenStore.clear())
      .finally(() => setChecking(false));
  }, []);

  const logout = () => {
    tokenStore.clear();
    setUser(null);
    setTab(USER_TABS[0]);
  };

  if (checking) return <p className="center">Connecting to the server...</p>;
  if (!user) return <Auth onLogin={setUser} />;

  const tabs = user.role === 'admin' ? [...USER_TABS, ...ADMIN_TABS] : USER_TABS;

  return (
    <main>
      <header>
        <h1>NoteVault</h1>
        <span>{user.name} <em>({user.role})</em></span>
        <button onClick={logout}>Log out</button>
      </header>
      <nav>
        {tabs.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === 'My notes' && <Notes />}
      {tab === 'Posts' && <Posts user={user} />}
      {tab === 'Users' && <Users me={user} />}
      {tab === 'All notes' && <AllNotes />}
      {tab === 'Users by interest' && <InterestGroups />}
    </main>
  );
}
