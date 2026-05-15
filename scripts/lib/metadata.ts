/**
 * Shared metadata generation logic.
 *
 * Exported for testing. The CLI entry point is in generate-metadata.ts.
 */

export interface DeploymentConfig {
  cloudflareProjectName: string;
  productionOrigin: string;
  finalProductionOrigin: string;
  stagingBranch: string;
}

export class MetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

export function validateOrigin(origin: string): string {
  if (!origin) {
    throw new MetadataError('Origin is empty.');
  }

  if (origin.endsWith('/')) {
    throw new MetadataError(
      `Origin must not have a trailing slash, got "${origin}".`,
    );
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') {
      throw new MetadataError(`Origin must use HTTPS, got "${origin}".`);
    }
    if (url.pathname !== '/') {
      throw new MetadataError(`Origin must not have a path, got "${origin}".`);
    }
  } catch (e) {
    if (e instanceof MetadataError) throw e;
    throw new MetadataError(`Origin is not a valid URL: "${origin}".`);
  }

  return origin;
}

export function generateRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
}

export function generateSitemapXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}
