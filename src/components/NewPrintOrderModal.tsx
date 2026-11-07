import React from 'react';
import { NewPrintOrderView, PrintOrderLineItem } from './NewPrintOrderView';

export type { PrintOrderLineItem };

interface NewPrintOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (orderId: string) => void;
}

export const NewPrintOrderModal: React.FC<NewPrintOrderModalProps> = ({
  isOpen,
  onClose,
  onOrderCreated
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden">
      <NewPrintOrderView onBack={onClose} onOrderCreated={onOrderCreated} />
    </div>
  );
};
