export default function Table({ columns, data, renderRow, title, actions, footer }) {
  return (
    <div className="table-wrap">
      {(title || actions) && (
        <div className="table-wrap__header">
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key || col.label}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => renderRow(row, i))}
        </tbody>
      </table>

      {footer && <div className="table-wrap__footer">{footer}</div>}
    </div>
  );
}
