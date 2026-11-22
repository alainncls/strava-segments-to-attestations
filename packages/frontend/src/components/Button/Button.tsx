import React from 'react';
import { buttonClassName, type ButtonVariant } from './buttonClassName';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}
