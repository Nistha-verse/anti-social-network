import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { shortAddress } from "../chain";

export type CharacterMood = "neutral" | "smug" | "sheepish" | "side-eye";

type CharacterProps = {
  pubkey: PublicKey;
  mood?: CharacterMood;
  size?: number;
};

const bodyColors = ["#ffb6a3", "#ffd38f", "#b9e4c9", "#b8d9ff", "#d8bbf4", "#f5b9d1"];
const eyeColors = ["#392d3b", "#293849", "#403029", "#283a36", "#4b3154", "#443c2d"];
const accessories = ["none", "bow", "leaf", "star", "sprout", "spark"] as const;

function faceFromKey(pubkey: PublicKey) {
  const bytes = pubkey.toBytes();
  return {
    body: bodyColors[bytes[0] % bodyColors.length],
    eye: eyeColors[bytes[11] % eyeColors.length],
    eyeShape: bytes[17] % 6,
    mouth: bytes[23] % 6,
    accessory: accessories[bytes[29] % accessories.length],
    tilt: (bytes[7] % 7) - 3,
  };
}

export function Character({ pubkey, mood = "neutral", size = 88 }: CharacterProps) {
  const face = useMemo(() => faceFromKey(pubkey), [pubkey]);
  const label = `Character for wallet ${shortAddress(pubkey, 4)}`;
  const eyeRadius = face.eyeShape % 2 === 0 ? 7 : 6;
  const eyeY = face.eyeShape === 4 ? 56 : 52;
  const mouthY = mood === "sheepish" ? 76 : 73;

  return (
    <span className={`character character--${mood}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <g transform={`rotate(${face.tilt} 50 55)`}>
          <path
            className="character__body"
            fill={face.body}
            d="M50 13c-23 0-37 15-37 38 0 24 15 36 37 36s37-12 37-36c0-23-14-38-37-38Z"
          />
          <path className="character__shine" d="M29 34c5-8 12-12 21-13" />
          <g className="character__eyes" fill={face.eye}>
            <ellipse className="character__eye" cx="35" cy={eyeY} rx={eyeRadius} ry={eyeRadius + 2} />
            <ellipse className="character__eye" cx="65" cy={eyeY + (face.eyeShape === 5 ? 2 : 0)} rx={eyeRadius} ry={eyeRadius + 2} />
          </g>
          <g fill="#fff">
            <circle cx="33" cy={eyeY - 2} r="2.3" />
            <circle cx="63" cy={eyeY - 2} r="2.3" />
          </g>
          {mood === "side-eye" && <path className="character__brow" d="M58 42l15 4" />}
          {mood === "smug" && <path className="character__brow" d="M56 42c5-3 10-3 14 0" />}
          {mood === "sheepish" && <path className="character__blush" d="M27 69l6-2m-3 5l6-2m31-1l6-2m-3 5l6-2" />}
          <path
            className="character__mouth"
            d={
              mood === "smug"
                ? "M43 76c5 4 11 4 16-1"
                : mood === "sheepish"
                  ? "M44 75c4-3 8-3 12 0"
                  : mood === "side-eye"
                    ? "M43 74c4 2 9 2 14 0"
                    : face.mouth % 2 === 0
                      ? `M43 ${mouthY}c4 5 10 5 14 0`
                      : `M45 ${mouthY}h10`
            }
          />
          {face.accessory === "bow" && (
            <g className="character__accessory" fill="#f07b9e">
              <path d="M67 20c10-8 18-4 17 5-1 7-9 8-17 2Z" />
              <path d="M68 27c-10-8-18-4-17 5 1 7 9 8 17 2Z" />
              <circle cx="68" cy="27" r="4" />
            </g>
          )}
          {face.accessory === "leaf" && (
            <path className="character__accessory" fill="#4ea879" d="M55 18c1-11 10-15 18-14-1 9-7 15-18 14Z" />
          )}
          {face.accessory === "star" && (
            <path className="character__accessory" fill="#f6bd3c" d="m31 17 2.5 6 6.5.5-5 4 1.5 6-5.5-3.3-5.5 3.3 1.5-6-5-4 6.5-.5Z" />
          )}
          {face.accessory === "sprout" && (
            <g className="character__accessory" fill="none" stroke="#4ea879" strokeWidth="3" strokeLinecap="round">
              <path d="M50 18v9" />
              <path d="M50 19c-9-6-14-1-14 5 7 1 11-1 14-5Zm0 1c9-6 14-1 14 5-7 1-11-1-14-5Z" />
            </g>
          )}
          {face.accessory === "spark" && <path className="character__accessory" fill="#f6bd3c" d="m70 14 2 7 6 2-6 2-2 7-2-7-6-2 6-2Z" />}
        </g>
      </svg>
    </span>
  );
}
