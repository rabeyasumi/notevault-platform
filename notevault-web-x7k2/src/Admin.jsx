import { useState } from 'react';
import { api, splitInterests } from './api';
import { usePaged } from './usePaged';
import Pager from './Pager';

const EMPTY_USER = { name: '', email: '', password: '', role: 'user', interests: '' };

export function Users({ me }) {
  const list = usePaged('/users');
  const [form, setForm] = useState(EMPTY_USER);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const reset = () => {
    setForm(EMPTY_USER);
    setEditingId(null);
  };

  const run = async (action) => {
    setError('');
    try {
      await action();
      list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...form, interests: splitInterests(form.interests) };
      if (!body.password) delete body.password;
      await api(editingId ? `/users/${editingId}` : '/users', { method: editingId ? 'PATCH' : 'POST', body });
      reset();
    });
  };

  const edit = (u) => {
    setEditingId(u._id);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, interests: u.interests.join(', ') });
  };

  return (
    <section>
      <form className="card" onSubmit={save}>
        <h3>{editingId ? 'Edit user' : 'Add user'}</h3>
        <input name="name" placeholder="Name" value={form.name} onChange={change} required />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={change} required />
        <input
          name="password"
          type="password"
          placeholder={editingId ? 'New password (leave empty to keep)' : 'Password (min 8 characters)'}
          value={form.password}
          onChange={change}
          required={!editingId}
        />
        <select name="role" value={form.role} onChange={change}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <input name="interests" placeholder="Interests, comma separated" value={form.interests} onChange={change} />
        <div className="row">
          <button>{editingId ? 'Save changes' : 'Add user'}</button>
          {editingId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {list.error && <p className="error">{list.error}</p>}
      {list.loading && !list.response && <p>Loading...</p>}

      {list.response && (
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Interests</th><th>Id</th><th /></tr>
          </thead>
          <tbody>
            {list.response.data.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.interests.join(', ')}</td>
                <td><code>{u._id}</code></td>
                <td className="row">
                  <button onClick={() => edit(u)}>Edit</button>
                  <button disabled={u._id === me._id} onClick={() => run(() => api(`/users/${u._id}`, { method: 'DELETE' }))}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager list={list} />
    </section>
  );
}

function NotesTable({ path }) {
  const list = usePaged(path);
  if (list.error) return <p className="error">{list.error}</p>;
  if (!list.response) return <p>Loading...</p>;

  return (
    <>
      <table>
        <thead>
          <tr><th>Owner</th><th>Title</th><th>Content</th><th>Created</th></tr>
        </thead>
        <tbody>
          {list.response.data.map((n) => (
            <tr key={n._id}>
              <td>{n.owner ? `${n.owner.name} (${n.owner.email})` : 'deleted user'}</td>
              <td>{n.title}</td>
              <td>{n.content}</td>
              <td>{new Date(n.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager list={list} />
    </>
  );
}

export function AllNotes() {
  const [ownerInput, setOwnerInput] = useState('');
  const [owner, setOwner] = useState('');

  return (
    <section>
      <div className="card">
        <h3>All notes</h3>
        <div className="row">
          <input value={ownerInput} onChange={(e) => setOwnerInput(e.target.value.trim())} placeholder="Filter by user id (optional)" />
          <button onClick={() => setOwner(ownerInput)}>Apply</button>
        </div>
      </div>
      <NotesTable key={owner} path={owner ? `/notes/all?owner=${owner}` : '/notes/all'} />
    </section>
  );
}

export function InterestGroups() {
  const list = usePaged('/users/by-interest');
  if (list.error) return <p className="error">{list.error}</p>;
  if (!list.response) return <p>Loading...</p>;

  return (
    <section>
      {list.response.data.length === 0 && <p>No users with interests yet.</p>}
      {list.response.data.map((group) => (
        <article className="card" key={group.interest}>
          <h4>{group.interest} <small>({group.count})</small></h4>
          <p>{group.users.map((u) => u.name).join(', ')}</p>
        </article>
      ))}
      <Pager list={list} />
    </section>
  );
}
