import { formatBytes, formatResolution } from '../lib/format';
import { labelForMime } from '../lib/image';
import type { ImageAsset } from '../types';

interface ImageMetaProps {
  asset: Pick<ImageAsset, 'type' | 'width' | 'height' | 'size'>;
  extra?: string[];
  className?: string;
}

/** Metadaten als reiner Text mit „·“-Trennern. */
export function ImageMeta({ asset, extra = [], className = '' }: ImageMetaProps) {
  const parts = [
    labelForMime(asset.type),
    ...(asset.width > 0 && asset.height > 0 ? [formatResolution(asset.width, asset.height)] : []),
    formatBytes(asset.size),
    ...extra,
  ];
  return (
    <p className={`meta truncate ${className}`}>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <span className="px-1.5 text-subtle">·</span>}
          <span className={index === 0 ? '' : 'font-mono text-[11px]'}>{part}</span>
        </span>
      ))}
    </p>
  );
}
