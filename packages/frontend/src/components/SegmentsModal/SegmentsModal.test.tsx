import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type * as Constants from '@/utils/constants';
import SegmentsModal from './SegmentsModal';

vi.mock('@/utils/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof Constants>()),
  IS_WALLET_CONFIGURED: false,
}));

it('shows a notice in place of the wallet flow when the wallet is not configured', () => {
  render(<SegmentsModal displayModal onHide={() => undefined} accessToken="token" />);

  expect(screen.getByRole('dialog', { name: 'Segments' })).toHaveTextContent(
    /wallet configuration is missing/i,
  );
});
