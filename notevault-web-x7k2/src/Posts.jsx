import { useState } from 'react';
import { api } from './api';
import { usePaged } from './usePaged';
import Pager from './Pager';

function UserPosts({ userId }) {
  const list = usePaged(`/users/${userId}/posts`);
  if (list.error) return <p className="error">{list.error}</p>;
  if (!list.response) return <p>Loading...</p>;

  return (
    <div>
      <h4>Posts by {list.response.user.name}</h4>
      {list.response.data.length === 0 && <p>No posts yet.</p>}
      {list.response.data.map((post) => (
        <article className="card" key={post._id}>
          <h4>{post.title}</h4>
          <p>{post.body}</p>
          <small>{new Date(post.createdAt).toLocaleString()}</small>
        </article>
      ))}
      <Pager list={list} />
    </div>
  );
}

export default function Posts({ user }) {
  const [form, setForm] = useState({ title: '', body: '' });
  const [lookupId, setLookupId] = useState(user._id);
  const [viewId, setViewId] = useState(user._id);
  const [viewKey, setViewKey] = useState(0);
  const [message, setMessage] = useState('');

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const publish = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api('/posts', { method: 'POST', body: form });
      setForm({ title: '', body: '' });
      setViewId(user._id);
      setLookupId(user._id);
      setViewKey((k) => k + 1);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <section>
      <form className="card" onSubmit={publish}>
        <h3>Write a post (public)</h3>
        <input name="title" placeholder="Title" value={form.title} onChange={change} required />
        <textarea name="body" placeholder="Post" rows={3} value={form.body} onChange={change} required />
        <button>Publish</button>
        {message && <p className="error">{message}</p>}
      </form>

      <div className="card">
        <h3>Browse posts by user id</h3>
        <div className="row">
          <input value={lookupId} onChange={(e) => setLookupId(e.target.value.trim())} placeholder="User id" />
          <button onClick={() => setViewId(lookupId)}>Show</button>
        </div>
        <small>Your id is {user._id}. Admins can see every user's id on the Users tab.</small>
      </div>

      <UserPosts key={`${viewId}-${viewKey}`} userId={viewId} />
    </section>
  );
}
