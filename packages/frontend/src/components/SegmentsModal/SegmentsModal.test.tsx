import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SegmentsModal from './SegmentsModal';

vi.mock('@/utils/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/constants')>()),
  IS_WALLET_CONFIGURED: false,
}));

it('shows a notice in place of the wallet flow when the wallet is not configured', () => {
  render(<SegmentsModal displayModal onHide={() => {}} accessToken="token" />);

  expect(screen.getByRole('dialog', { name: 'Segments' })).toHaveTextContent(
    /wallet configuration is missing/i,
  );
});
