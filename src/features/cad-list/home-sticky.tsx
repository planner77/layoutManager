'use client';

import { useEffect } from 'react';

/** Home owns the app navigation offset without changing other routes. */
export function HomeSticky({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]');
    if (!header) return;
    header.dataset.homeSticky = 'true';
    const panel = document.querySelector<HTMLElement>('.home-sticky-panel');
    const update = () => {
      document.documentElement.style.setProperty('--home-nav-height', `${header.getBoundingClientRect().height}px`);
      document.documentElement.style.setProperty('--home-panel-height', `${panel?.getBoundingClientRect().height ?? 0}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (panel) observer.observe(panel);
    update();
    return () => { observer.disconnect(); delete header.dataset.homeSticky; document.documentElement.style.removeProperty('--home-nav-height'); document.documentElement.style.removeProperty('--home-panel-height'); };
  }, []);
  return <div className="home-list">{children}</div>;
}
