import { Check } from 'lucide-react';
import { ACCOUNT_DESIGN_OPTIONS } from '../../utils/accountDesign';

export default function AccountDesignPicker({ value, onChange, className = '' }) {
  return (
    <div className={`account-design-picker${className ? ` ${className}` : ''}`}>
      {ACCOUNT_DESIGN_OPTIONS.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`account-design-picker__option account-card account-card--${option.value}${selected ? ' account-design-picker__option--selected' : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
          >
            <div className="account-design-picker__header">
              <div>
                <div className="account-design-picker__eyebrow">Дизайн счёта</div>
                <div className="account-design-picker__title">{option.label}</div>
              </div>
              {selected && <Check size={16} className="account-design-picker__check" />}
            </div>

            <div className="account-design-picker__preview-number">{option.sampleNumber}</div>
            <div className="account-design-picker__description">{option.description}</div>

            <div className="account-design-picker__footer">
              <span>{selected ? 'Выбрано' : 'Нажмите, чтобы выбрать'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}