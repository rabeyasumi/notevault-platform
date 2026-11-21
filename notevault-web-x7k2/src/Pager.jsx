export default function Pager({ list }) {
  const pagination = list.response?.pagination;
  if (!pagination) return null;

  const hasNext = pagination.totalPages !== undefined ? pagination.page < pagination.totalPages : pagination.hasNextPage;
  const total = pagination.totalPages !== undefined ? ` of ${Math.max(pagination.totalPages, 1)}` : '';

  return (
    <div className="pager">
      <button disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>Previous</button>
      <span>Page {list.page}{total}</span>
      <button disabled={!hasNext} onClick={() => list.setPage(list.page + 1)}>Next</button>
    </div>
  );
}
