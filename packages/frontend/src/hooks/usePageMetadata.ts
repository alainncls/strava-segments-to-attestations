import { useEffect } from 'react';

const SITE_URL = 'https://strava.alainnicolas.fr';
const DEFAULT_IMAGE = `${SITE_URL}/favicon-dark.png`;

interface PageMetadata {
  title: string;
  description: string;
  path: string;
  robots?: string;
  type?: string;
  schema?: Record<string, unknown>;
}

function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.content = content;
}

function upsertCanonical(url: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }

  element.href = url;
}

function upsertJsonLd(schema?: Record<string, unknown>): void {
  const id = 'page-json-ld';
  let element = document.getElementById(id) as HTMLScriptElement | null;

  if (!schema) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement('script');
    element.id = id;
    element.type = 'application/ld+json';
    document.head.appendChild(element);
  }

  element.textContent = JSON.stringify(schema);
}

export function usePageMetadata({
  title,
  description,
  path,
  robots = 'index,follow',
  type = 'website',
  schema,
}: PageMetadata): void {
  useEffect(() => {
    const url = absoluteUrl(path);

    document.title = title;
    upsertCanonical(url);
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:image', DEFAULT_IMAGE);
    upsertMeta('name', 'twitter:card', 'summary');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', DEFAULT_IMAGE);
    upsertJsonLd(schema);
  }, [description, path, robots, schema, title, type]);
}

export { SITE_URL };
