const activityIcons: Record<string, string> = {
  Run: '🏃',
  Ride: '🚴',
  Swim: '🏊',
  Walk: '🚶',
  Hike: '🥾',
  AlpineSki: '⛷️',
  NordicSki: '🎿',
};

const activityDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const segmentDateFormatter = new Intl.DateTimeFormat();

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

export function formatDate(dateString: string): string {
  return activityDateFormatter.format(new Date(dateString));
}

export function formatSegmentDate(dateString: string): string {
  return segmentDateFormatter.format(new Date(dateString));
}

export function getActivityIcon(type: string): string {
  return activityIcons[type] ?? '🏅';
}
