import Image from 'next/image';

interface AnatomicalImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}

export function AnatomicalImage({ src, alt, className, sizes = '100vw' }: AnatomicalImageProps) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <Image src={src} alt={alt} fill className="object-contain" sizes={sizes} />
    </div>
  );
}
