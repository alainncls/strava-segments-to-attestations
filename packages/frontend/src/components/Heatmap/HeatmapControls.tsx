import React from 'react';
import type { HeatmapSettings } from '@/utils/activityStore';
import { PALETTES } from '@/utils/heatmapPalettes';
import { formatActivityType } from '@/utils/format';
import { Button } from '@/components/Button/Button';
import styles from './Heatmap.module.css';

export interface ViewState {
  mode: 'year' | 'continuous';
  dayCount: number;
  fromYear: number;
  toYear: number;
}

interface HeatmapControlsProps {
  settings: HeatmapSettings;
  onSettings: (change: Partial<HeatmapSettings>) => void;
  view: ViewState;
  onView: (change: Partial<ViewState>) => void;
  sports: string[];
  years: number[];
  onResetThresholds: () => void;
}

export default function HeatmapControls({
  settings,
  onSettings,
  view,
  onView,
  sports,
  years,
  onResetThresholds,
}: HeatmapControlsProps): React.JSX.Element {
  const thresholds = settings.thresholds[settings.metric];
  const unit = settings.metric === 'distance' ? 'km' : 'min';

  const setThreshold = (index: number, value: string): void => {
    const number = Number(value);
    if (value === '' || !Number.isFinite(number)) return;
    const next = thresholds.map((t, i) => (i === index ? number : t));
    onSettings({ thresholds: { ...settings.thresholds, [settings.metric]: next } });
  };

  return (
    <div className={styles.controls}>
      <fieldset className={styles.fieldset}>
        <legend>View</legend>
        <label>
          Layout
          <select
            value={view.mode}
            onChange={(e) => onView({ mode: e.target.value as ViewState['mode'] })}
          >
            <option value="year">By year</option>
            <option value="continuous">Last days</option>
          </select>
        </label>
        {view.mode === 'continuous' ? (
          <label>
            Days
            <input
              type="number"
              min={1}
              max={3660}
              value={view.dayCount}
              onChange={(e) => {
                const count = Math.round(Number(e.target.value));
                if (count >= 1 && count <= 3660) onView({ dayCount: count });
              }}
            />
          </label>
        ) : (
          <>
            <label>
              From
              <select
                value={view.fromYear}
                onChange={(e) => onView({ fromYear: Number(e.target.value) })}
              >
                {years
                  .filter((year) => year <= view.toYear)
                  .map((year) => (
                    <option key={year}>{year}</option>
                  ))}
              </select>
            </label>
            <label>
              To
              <select
                value={view.toYear}
                onChange={(e) => onView({ toYear: Number(e.target.value) })}
              >
                {years
                  .filter((year) => year >= view.fromYear)
                  .map((year) => (
                    <option key={year}>{year}</option>
                  ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={settings.converged}
                onChange={(e) => onSettings({ converged: e.target.checked })}
              />
              Converged
            </label>
          </>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.labels}
            onChange={(e) => onSettings({ labels: e.target.checked })}
          />
          Labels
        </label>
        <label>
          Size
          <select
            value={settings.size}
            onChange={(e) => onSettings({ size: e.target.value as HeatmapSettings['size'] })}
          >
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Data</legend>
        <label>
          Sport
          <select
            value={settings.sport ?? ''}
            onChange={(e) => onSettings({ sport: e.target.value || null })}
          >
            <option value="">All</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {formatActivityType(sport)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Threshold type
          <select
            value={settings.metric}
            onChange={(e) => onSettings({ metric: e.target.value as HeatmapSettings['metric'] })}
          >
            <option value="distance">Distance (km)</option>
            <option value="duration">Duration (minutes)</option>
          </select>
        </label>
        <label>
          Palette
          <select
            value={settings.palette}
            onChange={(e) => onSettings({ palette: e.target.value })}
          >
            {Object.keys(PALETTES).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Thresholds ({unit})</legend>
        {thresholds.map((value, index) => (
          <label key={index} className={styles.threshold}>
            <span
              className={styles.swatch}
              style={{ background: (PALETTES[settings.palette] ?? [])[4 - index] }}
              aria-hidden="true"
            />
            Shade {5 - index} above
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setThreshold(index, e.target.value)}
            />
          </label>
        ))}
        <Button type="button" onClick={onResetThresholds}>
          Reset thresholds
        </Button>
      </fieldset>
    </div>
  );
}
