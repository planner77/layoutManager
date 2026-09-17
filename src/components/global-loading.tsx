'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

type LoadingTask = { id: string; message: string; sequence: number };

type GlobalLoadingContextValue = {
  isLoading: boolean;
  beginLoading: (message?: string) => string;
  endLoading: (taskId: string) => void;
  runWithLoading: <T>(message: string, action: () => Promise<T>) => Promise<T>;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function GlobalLoadingOverlay({ message = '처리 중입니다...' }: { message?: string }) {
  return <div
    className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]"
    data-testid="global-loading-overlay"
    role="status"
    aria-live="polite"
    aria-label={message}
  >
    <div className="flex min-w-64 flex-col items-center gap-4 rounded-2xl bg-white px-8 py-7 shadow-2xl">
      <LoaderCircle className="animate-spin text-teal-700" size={38} aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-800">{message}</p>
    </div>
  </div>;
}

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<LoadingTask[]>([]);
  const sequenceRef = useRef(0);

  const beginLoading = useCallback((message = '처리 중입니다...') => {
    const id = crypto.randomUUID();
    const sequence = ++sequenceRef.current;
    setTasks(current => [...current, { id, message, sequence }]);
    return id;
  }, []);

  const endLoading = useCallback((taskId: string) => {
    setTasks(current => current.filter(task => task.id !== taskId));
  }, []);

  const runWithLoading = useCallback(async <T,>(message: string, action: () => Promise<T>) => {
    const taskId = beginLoading(message);
    try {
      return await action();
    } finally {
      endLoading(taskId);
    }
  }, [beginLoading, endLoading]);

  const activeTask = tasks.reduce<LoadingTask | null>((latest, task) => !latest || task.sequence > latest.sequence ? task : latest, null);
  const isLoading = tasks.length > 0;

  useEffect(() => {
    if (!isLoading) {
      document.body.removeAttribute('aria-busy');
      document.body.style.removeProperty('overflow');
      return;
    }
    document.body.setAttribute('aria-busy', 'true');
    document.body.style.overflow = 'hidden';
    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKeyboard, true);
    return () => {
      window.removeEventListener('keydown', blockKeyboard, true);
      document.body.removeAttribute('aria-busy');
      document.body.style.removeProperty('overflow');
    };
  }, [isLoading]);

  const value = useMemo<GlobalLoadingContextValue>(() => ({ isLoading, beginLoading, endLoading, runWithLoading }), [isLoading, beginLoading, endLoading, runWithLoading]);

  return <GlobalLoadingContext.Provider value={value}>
    {children}
    {activeTask && <GlobalLoadingOverlay message={activeTask.message} />}
  </GlobalLoadingContext.Provider>;
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) throw new Error('useGlobalLoading must be used inside GlobalLoadingProvider.');
  return context;
}
