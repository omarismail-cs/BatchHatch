import Image from "next/image";
import Link from "next/link";

export default function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label="BatchHatch home"
      style={{ display: "flex", alignItems: "center", flexShrink: 0, lineHeight: 0 }}
    >
      <span style={{ width: 200, height: 40, overflow: "hidden", position: "relative", display: "block", borderRadius: 6 }}>
        <Image
          src="/logo-mark.png"
          alt="BatchHatch"
          fill
          sizes="200px"
          style={{ objectFit: "cover", objectPosition: "center 50%" }}
          priority
        />
      </span>
    </Link>
  );
}
