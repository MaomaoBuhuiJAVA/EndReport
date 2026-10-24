import Image from "next/image";

export function BrandLogo({ variant = "mark", size = 42, className = "" }: {
  variant?: "mark" | "wordmark";
  size?: number;
  className?: string;
}) {
  const wordmark = variant === "wordmark";
  return (
    <Image
      className={`kexiaobei-brand-logo ${className}`}
      src={wordmark ? "/assets/brand/kexiaobei-logo-v1.png" : "/assets/brand/kexiaobei-mark-v1.png"}
      alt={wordmark ? "科小贝 · 教学智能体" : "科小贝标志"}
      width={wordmark ? 860 : 334}
      height={340}
      style={{ width: wordmark ? Math.round(size * 860 / 340) : Math.round(size * 334 / 340), height: size, objectFit: "contain", flexShrink: 0 }}
      unoptimized
    />
  );
}
