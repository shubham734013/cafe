import React, { useEffect, useState } from 'react';

interface CafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon?: string;
}

export const CafeImage: React.FC<CafeImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackIcon = 'local_cafe',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
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
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
