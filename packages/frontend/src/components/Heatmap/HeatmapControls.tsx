import React, { useId, useState } from 'react';
import type { HeatmapSettings } from '@/utils/activityStore';
import { PALETTES, shadesFor } from '@/utils/heatmapPalettes';
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
  colors: readonly string[];
  emptyColor: string;
  dark: boolean;
  onResetThresholds: () => void;
  exportPanel: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  className?: string;
  legend: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({
  className,
  legend,
  value,
  options,
  onChange,
}: SegmentedProps<T>): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className={`${styles.segmented} ${className ?? ''}`}>
      <legend className={styles.fieldLabel}>{legend}</legend>
      <div className={styles.segments}>
        {options.map(([option, label]) => (
          <label key={option} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Panel = 'customize' | 'export' | null;

export default function HeatmapControls({
  settings,
  onSettings,
  view,
  onView,
  sports,
  years,
  colors,
  emptyColor,
  dark,
  onResetThresholds,
  exportPanel,
}: HeatmapControlsProps): React.JSX.Element {
  const [panel, setPanel] = useState<Panel>(null);
  const id = useId();
  const thresholds = settings.thresholds[settings.metric];
  const unit = settings.metric === 'distance' ? 'km' : 'min';

  const toggle = (next: Panel): void => setPanel((current) => (current === next ? null : next));

  // Thresholds are stored darkest first; the scale shows them lightest first.
  const setThreshold = (index: number, value: string): void => {
    const number = Number(value);
    if (value === '' || !Number.isFinite(number) || number < 0) return;
    const next = thresholds.map((t, i) => (i === index ? number : t));
    onSettings({ thresholds: { ...settings.thresholds, [settings.metric]: next } });
  };

  return (
    <div className={styles.controls}>
      <div className={styles.toolbar}>
        {view.mode === 'year' ? (
          <div className={styles.field} role="group" aria-labelledby={`${id}-years`}>
            <span className={styles.fieldLabel} id={`${id}-years`}>
              Years
            </span>
            <div className={styles.range}>
              <select
                aria-label="From year"
                value={view.fromYear}
                onChange={(e) => onView({ fromYear: Number(e.target.value) })}
              >
                {years
                  .filter((year) => year <= view.toYear)
                  .map((year) => (
                    <option key={year}>{year}</option>
                  ))}
              </select>
              <span aria-hidden="true">to</span>
              <select
                aria-label="To year"
                value={view.toYear}
                onChange={(e) => onView({ toYear: Number(e.target.value) })}
              >
                {years
                  .filter((year) => year >= view.fromYear)
                  .map((year) => (
                    <option key={year}>{year}</option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Last days</span>
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={3660}
              value={view.dayCount}
              onChange={(e) => {
                const count = Math.round(Number(e.target.value));
                if (count >= 1 && count <= 3660) onView({ dayCount: count });
              }}
            />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Sport</span>
          <select
            value={settings.sport ?? ''}
            onChange={(e) => onSettings({ sport: e.target.value || null })}
          >
            <option value="">All sports</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {formatActivityType(sport)}
              </option>
            ))}
          </select>
        </label>

        <Segmented
          legend="Color by"
          value={settings.metric}
          options={[
            ['distance', 'Distance'],
            ['duration', 'Time'],
          ]}
          onChange={(metric) => onSettings({ metric })}
        />

        <Segmented
          className={styles.sizeControl}
          legend="Cell size"
          value={settings.size}
          options={[
            ['S', 'S'],
            ['M', 'M'],
            ['L', 'L'],
          ]}
          onChange={(size) => onSettings({ size })}
        />

        <div className={styles.toolbarActions}>
          <Button
            type="button"
            aria-expanded={panel === 'customize'}
            aria-controls={`${id}-customize`}
            onClick={() => toggle('customize')}
          >
            Customize
          </Button>
          <Button
            type="button"
            aria-expanded={panel === 'export'}
            aria-controls={`${id}-export`}
            onClick={() => toggle('export')}
          >
            Export
          </Button>
        </div>
      </div>

      <div className={styles.scale} role="img" aria-label={scaleLabel(thresholds, unit)}>
        <span className={styles.scaleEnd}>Less</span>
        <span className={styles.scaleCell} style={{ background: emptyColor }} />
        {colors.map((color) => (
          <span key={color} className={styles.scaleCell} style={{ background: color }} />
        ))}
        <span className={styles.scaleEnd}>More</span>
      </div>

      <section
        id={`${id}-customize`}
        className={styles.panel}
        hidden={panel !== 'customize'}
        aria-label="Customize"
      >
        <div className={styles.panelGroup}>
          <Segmented
            legend="Layout"
            value={view.mode}
            options={[
              ['year', 'By year'],
              ['continuous', 'Last days'],
            ]}
            onChange={(mode) => onView({ mode })}
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.converged}
              disabled={view.mode !== 'year'}
              onChange={(e) => onSettings({ converged: e.target.checked })}
            />
            Join the months
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.labels}
              onChange={(e) => onSettings({ labels: e.target.checked })}
            />
            Day names
          </label>
        </div>

        <fieldset className={styles.panelGroup}>
          <legend className={styles.fieldLabel}>Color scale ({unit})</legend>
          <div className={styles.scaleEditor}>
            {colors.map((color, shade) => {
              const index = 4 - shade;
              const word = shade === 0 ? 'From' : 'Above';
              return (
                <label key={color} className={styles.scaleStep}>
                  <span className={styles.scaleCell} style={{ background: color }} />
                  <span className={styles.fieldLabel}>{word}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    autoComplete="off"
                    min={0}
                    value={thresholds[index]}
                    aria-label={`Shade ${shade + 1}: ${word.toLowerCase()} (${unit})`}
                    onChange={(e) => setThreshold(index, e.target.value)}
                  />
                </label>
              );
            })}
          </div>
          <p className={styles.hint}>A day below the first value stays empty.</p>
          <Button type="button" onClick={onResetThresholds}>
            Fit the scale to my activities
          </Button>
        </fieldset>

        <fieldset className={`${styles.panelGroup} ${styles.wide}`}>
          <legend className={styles.fieldLabel}>Palette</legend>
          <div className={styles.palettes}>
            {Object.keys(PALETTES).map((name) => (
              <label key={name} className={styles.palette}>
                <input
                  type="radio"
                  name={`${id}-palette`}
                  value={name}
                  checked={settings.palette === name}
                  onChange={() => onSettings({ palette: name })}
                />
                <span className={styles.paletteSwatches} aria-hidden="true">
                  {shadesFor(name, dark).map((shade) => (
                    <span key={shade} style={{ background: shade }} />
                  ))}
                </span>
                <span>{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section
        id={`${id}-export`}
        className={styles.panel}
        hidden={panel !== 'export'}
        aria-label="Export"
      >
        {exportPanel}
      </section>
    </div>
  );
}

function scaleLabel(thresholds: number[], unit: string): string {
  const steps = [...thresholds].reverse();
  return `Color scale: empty below ${steps[0]} ${unit}, then darker above ${steps.slice(1).join(', ')} ${unit}`;
}
