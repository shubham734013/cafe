import React from 'react';

interface CafeBrandEmblemProps {
  className?: string;
}

export const CafeBrandEmblem: React.FC<CafeBrandEmblemProps> = ({
  className = 'w-full h-full',
}) => {
  return (
    <img
      src="/images/tsc-logo.jpg"
      alt="The Sawariya Cafe Logo"
      className={`${className} object-cover rounded-full shadow-sm`}
      loading="eager"
    />
  );
};
