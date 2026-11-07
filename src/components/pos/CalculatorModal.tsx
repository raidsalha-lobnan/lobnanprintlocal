import React, { useState } from 'react';
import { X, Delete, Check } from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyResult?: (value: number) => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({
  isOpen,
  onClose,
  onApplyResult
}) => {
  const [display, setDisplay] = useState<string>('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const handleBackspace = () => {
    if (display && display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const performOperation = (nextOp: string) => {
    const inputValue = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (operation) {
      const currentValue = prevValue || 0;
      let newValue = currentValue;

      switch (operation) {
        case '+':
          newValue = currentValue + inputValue;
          break;
        case '-':
          newValue = currentValue - inputValue;
          break;
        case '×':
          newValue = currentValue * inputValue;
          break;
        case '÷':
          newValue = inputValue !== 0 ? currentValue / inputValue : 0;
          break;
        case '%':
          newValue = (currentValue * inputValue) / 100;
          break;
        default:
          break;
      }

      setPrevValue(newValue);
      setDisplay(String(Number(newValue.toFixed(4))));
    }

    setWaitingForOperand(true);
    setOperation(nextOp);
  };

  const handleEquals = () => {
    if (!operation || prevValue === null) return;
    const inputValue = parseFloat(display);
    let newValue = prevValue;

    switch (operation) {
      case '+':
        newValue = prevValue + inputValue;
        break;
      case '-':
        newValue = prevValue - inputValue;
        break;
      case '×':
        newValue = prevValue * inputValue;
        break;
      case '÷':
        newValue = inputValue !== 0 ? prevValue / inputValue : 0;
        break;
      case '%':
        newValue = (prevValue * inputValue) / 100;
        break;
      default:
        break;
    }

    setDisplay(String(Number(newValue.toFixed(4))));
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-80 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-sm flex items-center gap-2">
            <span>🧮</span>
            <span>الآلة الحاسبة للكاشير</span>
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display */}
        <div className="bg-slate-950 p-4 text-left font-mono">
          <div className="text-[10px] text-slate-400 font-light h-4">
            {prevValue !== null && operation ? `${prevValue} ${operation}` : ''}
          </div>
          <div className="text-3xl font-black text-emerald-400 truncate tracking-wider">
            {display}
          </div>
        </div>

        {/* Keypad */}
        <div className="p-3 grid grid-cols-4 gap-2 bg-slate-100 font-bold text-sm">
          <button
            onClick={handleClear}
            className="bg-rose-100 hover:bg-rose-200 text-rose-700 py-3 rounded-xl cursor-pointer"
          >
            C
          </button>
          <button
            onClick={() => performOperation('%')}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 py-3 rounded-xl cursor-pointer"
          >
            %
          </button>
          <button
            onClick={handleBackspace}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 py-3 rounded-xl flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            onClick={() => performOperation('÷')}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl cursor-pointer"
          >
            ÷
          </button>

          {['7', '8', '9'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 py-3 rounded-xl cursor-pointer shadow-2xs"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('×')}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl cursor-pointer"
          >
            ×
          </button>

          {['4', '5', '6'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 py-3 rounded-xl cursor-pointer shadow-2xs"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('-')}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl cursor-pointer"
          >
            -
          </button>

          {['1', '2', '3'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 py-3 rounded-xl cursor-pointer shadow-2xs"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('+')}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl cursor-pointer"
          >
            +
          </button>

          <button
            onClick={() => handleDigit('0')}
            className="col-span-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 py-3 rounded-xl cursor-pointer shadow-2xs"
          >
            0
          </button>
          <button
            onClick={handleDecimal}
            className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 py-3 rounded-xl cursor-pointer shadow-2xs"
          >
            .
          </button>
          <button
            onClick={handleEquals}
            className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl cursor-pointer shadow-xs"
          >
            =
          </button>
        </div>

        {/* Footer Actions */}
        {onApplyResult && (
          <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
            <button
              onClick={() => {
                onApplyResult(parseFloat(display) || 0);
                onClose();
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>إدراج الناتج في الفاتورة ({display})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
