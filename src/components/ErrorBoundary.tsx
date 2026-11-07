import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[280px] w-full flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border border-rose-200 shadow-xs my-4"
          dir="rtl"
        >
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {this.props.fallbackTitle || 'حدث تنبيه في عرض هذا الجزء'}
          </h3>
          <p className="text-[10px] text-slate-400 font-light max-w-md mb-4 leading-relaxed">
            تم تفادي توقف البرنامج تلقائياً. يمكنك إعادة المحاولة أو المتابعة بأمان.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة المحاولة</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
