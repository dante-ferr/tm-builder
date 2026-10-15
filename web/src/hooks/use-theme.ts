'use client';
import {useEffect, useState} from 'react';
import type {Theme} from '../lib/types';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tm-builder-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') setTheme(saved);
    } catch { /* The workspace also works when storage is unavailable. */ }
  }, []);
  function chooseTheme(next: Theme) {
    setTheme(next);
    try { localStorage.setItem('tm-builder-theme', next); } catch { /* Keep this session's preference. */ }
  }
  return {theme, setTheme: chooseTheme};
}
