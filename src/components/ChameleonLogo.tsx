import React from 'react';

export type LogoVariant = 'a' | 'b' | 'c';

interface ChameleonLogoProps {
  className?: string;
  variant?: LogoVariant;
  size?: number;
}

export const ChameleonLogo: React.FC<ChameleonLogoProps> = ({
  className = 'w-6 h-6',
  variant = 'a',
}) => {
  if (variant === 'b') {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cxGradB1" x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
          <linearGradient id="cxGradB2" x1="85" y1="15" x2="15" y2="85" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <path
          d="M 22 20 C 35 16 55 20 76 42 L 80 38 C 82 36 85 37 85 40 L 83 55 C 83 57 81 59 78 58 L 64 54 C 61 53 61 50 63 48 L 68 45 C 52 30 38 27 24 30 C 21 31 19 28 20 25 C 20.5 23 21 21 22 20 Z"
          fill="url(#cxGradB1)"
        />
        <path
          d="M 78 22 C 81 25 80 29 76 33 L 34 75 C 28 81 22 83 17 80 C 13 77 14 70 20 65 C 24 61 30 61 32 64 C 33 66 31 69 28 69 C 25 69 24 67 24 66 C 21 68 20 72 23 74 C 26 76 30 74 34 70 L 73 31 C 76 28 76 24 73 21 C 71 19 75 19 78 22 Z"
          fill="url(#cxGradB2)"
        />
        <circle cx="72" cy="48" r="4.5" fill="#38BDF8" />
        <circle cx="72" cy="48" r="2" fill="#FFFFFF" />
      </svg>
    );
  }

  if (variant === 'c') {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cxGradC" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="60%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>
        <path
          d="M 50 14 C 64 20 78 22 84 25 C 84 52 75 75 50 88 C 25 75 16 52 16 25 C 22 22 36 20 50 14 Z"
          stroke="url(#cxGradC)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 50 28 C 65 28 72 37 72 48 C 72 58 64 66 53 66 C 43 66 36 59 36 50 C 36 43 41 38 48 38 C 54 38 58 42 58 47 C 58 51 55 54 51 54 C 48 54 46 52 46 49"
          stroke="url(#cxGradC)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="62" cy="40" r="3.5" fill="#10B981" />
      </svg>
    );
  }

  // 方案 A: 鈦合金深空配色的靈動變色龍
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cxTitaniumGradA" x1="10" y1="15" x2="90" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="55%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
        <linearGradient id="cxTitaniumEyeA" x1="60" y1="28" x2="76" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>
      <path
        d="M 68 22 C 82 22 88 32 88 42 C 88 53 80 60 70 60 C 58 60 52 50 44 50 C 38 50 34 54 34 60 C 34 66 39 71 45 71 C 51 71 54 67 54 63 C 54 61 52 59 50 59 C 48 59 47 60 47 61 C 47 62 48 64 45 64 C 42 64 40 62 40 60 C 40 57 42 56 44 56 C 50 56 55 64 68 64 C 82 64 94 54 94 40 C 94 25 80 15 62 15 C 44 15 28 26 22 42 C 16 58 20 76 34 86 C 48 96 66 94 78 86 C 81 84 82 81 80 79 C 78 77 75 77 73 79 C 63 86 48 88 37 80 C 26 72 23 57 28 44 C 33 30 46 22 68 22 Z"
        fill="url(#cxTitaniumGradA)"
      />
      <circle cx="68" cy="36" r="9" fill="#0C0E12" stroke="url(#cxTitaniumEyeA)" strokeWidth="2.5" />
      <circle cx="70" cy="35" r="4.5" fill="url(#cxTitaniumEyeA)" />
      <circle cx="71.5" cy="33.5" r="1.5" fill="#FFFFFF" />
    </svg>
  );
};
