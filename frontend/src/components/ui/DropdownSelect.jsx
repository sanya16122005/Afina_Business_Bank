import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

function getOptionLabel(option) {
  if (!option) return '';
  return option.label ?? option.text ?? String(option.value ?? '');
}

export default function DropdownSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Выберите значение',
  disabled = false,
  className = '',
  ariaLabel,
}) {
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      zIndex: 400,
    });
  };

  // Найти следующий не-disabled индекс циклически.
  const findNextEnabled = (start, dir) => {
    if (options.length === 0) return -1;
    const n = options.length;
    let i = start;
    for (let k = 0; k < n; k += 1) {
      i = (i + dir + n) % n;
      if (!options[i]?.disabled) return i;
    }
    return -1;
  };

  useEffect(() => {
    if (!open) return undefined;

    updateMenuPosition();

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      closeMenu();
    };

    const handleViewportChange = () => {
      updateMenuPosition();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  // Прокручиваем активную опцию в видимую область.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = optionRefs.current[activeIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const openMenu = (initialActive) => {
    if (disabled) return;
    setOpen(true);
    const start = initialActive ?? (selectedIndex >= 0 ? selectedIndex : findNextEnabled(-1, 1));
    setActiveIndex(start);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (open) closeMenu();
    else openMenu();
  };

  const handleSelect = (nextValue) => {
    onChange?.(nextValue);
    closeMenu();
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(findNextEnabled(0, -1));
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeMenu();
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((idx) => findNextEnabled(idx, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((idx) => findNextEnabled(idx, -1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(findNextEnabled(-1, 1));
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(findNextEnabled(0, -1));
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const opt = options[activeIndex];
        if (opt && !opt.disabled) handleSelect(opt.value);
        break;
      }
      case 'Tab':
        closeMenu();
        break;
      default:
        break;
    }
  };

  const activeOptionId = open && activeIndex >= 0
    ? `dropdown-option-${activeIndex}`
    : undefined;

  const menu = open && menuStyle
    ? createPortal(
      <div
        ref={menuRef}
        className="dropdown-select__menu"
        style={menuStyle}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={activeOptionId}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = index === activeIndex;
          const optionId = `dropdown-option-${index}`;

          return (
            <button
              key={String(option.value)}
              id={optionId}
              ref={(el) => { optionRefs.current[index] = el; }}
              type="button"
              className={`dropdown-select__option${isSelected ? ' dropdown-select__option--selected' : ''}${isActive ? ' dropdown-select__option--active' : ''}`}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setActiveIndex(index)}
              disabled={option.disabled}
              role="option"
              aria-selected={isSelected}
              tabIndex={-1}
            >
              <span className="dropdown-select__option-label">
                {getOptionLabel(option)}
              </span>
              {isSelected && <Check size={14} className="dropdown-select__option-check" />}
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className={`dropdown-select${disabled ? ' dropdown-select--disabled' : ''} ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className={`dropdown-select__button${open ? ' dropdown-select__button--open' : ''}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={activeOptionId}
      >
        <span className={`dropdown-select__value${!selectedOption ? ' dropdown-select__value--placeholder' : ''}`}>
          {selectedOption ? getOptionLabel(selectedOption) : placeholder}
        </span>
        <ChevronDown size={16} className="dropdown-select__icon" />
      </button>
      {menu}
    </div>
  );
}
