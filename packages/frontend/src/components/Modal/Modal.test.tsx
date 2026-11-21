import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { Modal } from './Modal';

function Page(): React.JSX.Element {
  const [show, setShow] = useState(false);

  return (
    <>
      <button onClick={() => setShow(true)}>Open</button>
      <Modal show={show} onHide={() => setShow(false)} title="Segments">
        Content
      </Modal>
    </>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

it('moves focus into the modal, isolates the page behind, and gives focus back at close', () => {
  const root = document.body.appendChild(document.createElement('div'));
  root.id = 'root';
  render(<Page />, { container: root });
  const opener = screen.getByRole('button', { name: 'Open' });

  opener.focus();
  fireEvent.click(opener);

  expect(screen.getByRole('dialog', { name: 'Segments' })).toHaveFocus();
  expect(root).toHaveAttribute('inert');

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(root).not.toHaveAttribute('inert');
  expect(opener).toHaveFocus();
});
