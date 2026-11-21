import { useEffect, useState } from 'react';
import { api } from './api';

const PAGE_SIZE = 5;

// Loads one page of a list endpoint. Returns the response plus paging controls.
export function usePaged(path) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ response: null, error: '', loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const separator = path.includes('?') ? '&' : '?';

    api(`${path}${separator}page=${page}&limit=${PAGE_SIZE}`)
      .then((response) => {
        if (cancelled) return;
        // Deleted the last item of a page: step back instead of showing an empty page.
        if (response.data.length === 0 && page > 1) return setPage(page - 1);
        setState({ response, error: '', loading: false });
      })
      .catch((err) => !cancelled && setState({ response: null, error: err.message, loading: false }));

    return () => {
      cancelled = true;
    };
  }, [path, page, reloadKey]);

  return { ...state, page, setPage, reload: () => setReloadKey((k) => k + 1) };
}
