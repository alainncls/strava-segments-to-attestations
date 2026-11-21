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
    expect(screen.queryByText(/No activities yet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
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

    expect(screen.getByRole('button', { name: 'Retry soon' })).toBeDisabled();
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
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps focus on a loading activity and ignores clicks on it', () => {
    const onActivityClick = vi.fn();
    render(
      <Activities
        activities={[
          {
            id: 7,
            name: 'Morning run',
            type: 'Run',
            startDate: '2026-06-14T07:31:02Z',
            distance: 5000,
          },
        ]}
        loadingActivityId={7}
        onActivityClick={onActivityClick}
      />,
    );

    const row = screen.getByRole('button', { name: /morning run/i });
    row.focus();
    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).not.toBeDisabled();
    expect(row).toHaveFocus();
    expect(onActivityClick).not.toHaveBeenCalled();
  });
});
