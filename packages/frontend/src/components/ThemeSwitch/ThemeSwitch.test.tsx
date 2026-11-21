import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeSwitch from './ThemeSwitch';

describe('ThemeSwitch', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('applies and saves the chosen theme, and returns to the system theme', () => {
    render(<ThemeSwitch />);
    const select = screen.getByRole('combobox', { name: 'Theme' });
    expect(select).toHaveValue('system');

    fireEvent.change(select, { target: { value: 'light' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');

    fireEvent.change(select, { target: { value: 'system' } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('shows the saved theme', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeSwitch />);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
  });
});
