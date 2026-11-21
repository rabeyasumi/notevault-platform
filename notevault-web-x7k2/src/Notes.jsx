import { useState } from 'react';
import { api } from './api';
import { usePaged } from './usePaged';
import Pager from './Pager';

const EMPTY = { title: '', content: '' };

export default function Notes() {
  const list = usePaged('/notes');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const reset = () => {
    setForm(EMPTY);
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
      await api(editingId ? `/notes/${editingId}` : '/notes', { method: editingId ? 'PATCH' : 'POST', body: form });
      reset();
    });
  };

  return (
    <section>
      <form className="card" onSubmit={save}>
        <h3>{editingId ? 'Edit note' : 'New note'}</h3>
        <input name="title" placeholder="Title" value={form.title} onChange={change} required />
        <textarea name="content" placeholder="Content" rows={3} value={form.content} onChange={change} />
        <div className="row">
          <button>{editingId ? 'Save changes' : 'Add note'}</button>
          {editingId && <button type="button" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {list.error && <p className="error">{list.error}</p>}
      {list.loading && !list.response && <p>Loading...</p>}
      {list.response?.data.length === 0 && <p>No notes yet.</p>}

      {list.response?.data.map((note) => (
        <article className="card" key={note._id}>
          <h4>{note.title}</h4>
          <p>{note.content}</p>
          <small>{new Date(note.createdAt).toLocaleString()}</small>
          <div className="row">
            <button onClick={() => { setEditingId(note._id); setForm({ title: note.title, content: note.content }); }}>Edit</button>
            <button onClick={() => run(() => api(`/notes/${note._id}`, { method: 'DELETE' }))}>Delete</button>
          </div>
        </article>
      ))}
      <Pager list={list} />
    </section>
  );
}
