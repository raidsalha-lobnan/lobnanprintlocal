import React, { useEffect } from 'react';

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  className?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ value, onChange, className, ...rest }) => {
  const getTodayIso = () => new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!value) {
      onChange({ target: { value: getTodayIso() } });
    }
  }, []);

  return (
    <input
      type="date"
      lang="en-GB"
      value={value || ''}
      onChange={(e) => onChange({ target: { value: e.target.value } })}
      className={`${className || ''} hide-calendar-indicator text-center font-mono`}
      style={{
        direction: 'ltr',
      }}
      {...rest}
    />
  );
};
