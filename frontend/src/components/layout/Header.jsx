import { Search } from 'lucide-react';
import { useState } from 'react';

export default function Header({ title }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="top-header">
      <div className="top-header__title">{title}</div>
      <div className="top-header__right">
        {searchOpen && (
          <input
            className="top-header__search"
            type="search"
            placeholder="Поиск..."
            autoFocus
            onBlur={() => setSearchOpen(false)}
          />
        )}
        <button className="top-header__badge" onClick={() => setSearchOpen(!searchOpen)}>
          <Search size={16} />
        </button>
      </div>
    </header>
  );
}
