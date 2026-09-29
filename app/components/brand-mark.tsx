import Image from "next/image";

/** Decorative mark: the adjacent product name provides its accessible label. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return <Image src="/favicon.svg" alt="" width={size} height={size} unoptimized />;
}
