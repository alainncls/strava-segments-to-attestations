import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Activities from './Activities';

describe('Activities request recovery states', () => {
  it('shows the initial page error and retries instead of claiming the list is empty', () => {
    const retry = vi.fn();
    render(
      <Activities
        activities={[]}
        hasMore
        activitiesError="Could not load activities page 1. Retry this page."
        onLoadMore={retry}
        onActivityClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('page 1');
    expect(screen.queryByText(/No activities found/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry activities' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps retry disabled during Retry-After and hides retry on expired authentication', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <Activities
        activities={[]}
        hasMore
        activitiesError="Rate limited. Retry page 1."
        isRetryBlocked
        onLoadMore={retry}
        onActivityClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Wait before retrying' })).toBeDisabled();
    rerender(
      <Activities
        activities={[]}
        hasMore
        activitiesError="Your Strava session expired. Reconnect Strava."
        isAuthenticationError
        onLoadMore={retry}
        onActivityClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Reconnect Strava');
    expect(screen.queryByRole('button', { name: 'Retry activities' })).not.toBeInTheDocument();
  });
});
