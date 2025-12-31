/**
 * Format distance from meters to kilometers
 */
export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

/**
 * Format date string to localized format
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get emoji icon for activity type
 */
export function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
    Ride: '🚴',
    Swim: '🏊',
    Walk: '🚶',
    Hike: '🥾',
    AlpineSki: '⛷️',
    NordicSki: '🎿',
  };
  return icons[type] ?? '🏅';
}
