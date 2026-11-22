import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DayTotal } from '@/utils/heatmap';
import { formatActivityType, formatDayKey, formatDistance, formatDuration } from '@/utils/format';
import styles from './Heatmap.module.css';

const WIDTH = 288;

interface DayTooltipProps {
  dayKey: string;
  day: DayTotal | undefined;
  anchor: SVGRectElement;
  onClose: () => void;
}

export default function DayTooltip({
  dayKey,
  day,
  anchor,
  onClose,
}: DayTooltipProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const box = anchor.getBoundingClientRect();
  const top = box.bottom + window.scrollY + 6;
  const left = Math.max(8, Math.min(box.left + window.scrollX, window.innerWidth - WIDTH - 8));

  useEffect(() => {
    ref.current?.focus();
    const close = (): void => {
      onClose();
      anchor.focus();
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !(target instanceof SVGRectElement)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handlePointer);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={formatDayKey(dayKey)}
      tabIndex={-1}
      className={styles.tooltip}
      style={{ top, left, width: WIDTH }}
    >
      <p className={styles.tooltipTitle}>{formatDayKey(dayKey)}</p>
      {day ? (
        <>
          <p className={styles.tooltipMeta}>
            {formatDistance(day.distance)} · {formatDuration(day.duration)}
          </p>
          <ul className={styles.tooltipList}>
            {day.activities.map((activity) => (
              <li key={activity.id}>
                <span>
                  {activity.name} ({formatActivityType(activity.sportType)})
                </span>
                <a
                  href={`https://www.strava.com/activities/${String(activity.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.stravaLink}
                >
                  View on Strava
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.tooltipMeta}>No activity</p>
      )}
    </div>,
    document.body,
  );
}
