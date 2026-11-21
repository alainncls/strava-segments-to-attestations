import React, { useState } from 'react';
import { readThemeMode, setThemeMode, type ThemeMode } from '@/utils/theme';
import styles from './ThemeSwitch.module.css';

export default function ThemeSwitch(): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value as ThemeMode;
    setThemeMode(next);
    setMode(next);
  };

  return (
    <select className={styles.select} value={mode} onChange={handleChange} aria-label="Theme">
      <option value="system">System theme</option>
      <option value="light">Light theme</option>
      <option value="dark">Dark theme</option>
    </select>
  );
}
