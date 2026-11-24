import React, { useEffect, useState } from 'react';
import { hasMenuProductArtwork, MenuProductArtwork } from './MenuProductArtwork';
import { getMenuProductPhoto } from '../data/menuProductPhotos';

interface CafeImageProps {
  src: string;
  alt: string;
  productId?: string;
  className?: string;
  fallbackIcon?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
}

export const CafeImage: React.FC<CafeImageProps> = ({
  src,
  alt,
  productId,
  className = 'w-full h-full object-cover',
  fallbackIcon = 'local_cafe',
  loading = 'lazy',
  fetchPriority = 'auto',
  sizes,
}) => {
  const [failed, setFailed] = useState(false);
  const isDefaultArtwork =
    /^\/images\/[^/]+\.(?:svg|png)$/i.test(src) && hasMenuProductArtwork(src);
  const productPhoto =
    (!src || isDefaultArtwork) && productId ? getMenuProductPhoto(productId) : undefined;
  const imageSrc = productPhoto ?? src;

  useEffect(() => {
    setFailed(false);
  }, [src, productId]);

  if ((failed || !productPhoto) && isDefaultArtwork) {
    return <MenuProductArtwork src={src} name={alt} className={className} />;
  }

  if (failed || !imageSrc) {
    return (
      <div
        aria-label={alt}
        className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container-lowest text-primary/80 p-2 text-center"
      >
        <span className="material-symbols-outlined text-[28px] mb-1">{fallbackIcon}</span>
        <span className="text-[10px] font-medium text-on-surface-variant line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={loading}
      fetchPriority={fetchPriority}
      sizes={sizes}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
