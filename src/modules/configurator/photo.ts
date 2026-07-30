import type { ConfiguratorImage } from '../marketplace-config/types';
import { CONFIGURATOR_PHOTOS, type Photo } from '../ui/photos';

const byId = new Map(CONFIGURATOR_PHOTOS.map((photo) => [photo.id, photo]));

/**
 * configurator.json only authors which photo id an option shows; the alt text,
 * licence source and crop focus live once in the shared photo catalogue (see
 * src/modules/ui/photos.ts) so they never drift between the two files.
 */
export function resolveConfiguratorPhoto(image: ConfiguratorImage, fallbackAlt: string): Photo {
  return (
    byId.get(image.id) ?? {
      id: image.id,
      alt: fallbackAlt,
      photographer: image.photographer,
      source: image.sourcePage,
      width: 1200,
      mode: 'heat',
    }
  );
}
