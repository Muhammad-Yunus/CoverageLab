import React from 'react';

export const LandCoverIllustration: React.FC<{ typeKey: string }> = ({ typeKey }) => {
  switch (typeKey) {
    case 'water':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <defs>
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <rect width="180" height="110" fill="url(#waterGrad)" />
          <path d="M0 24 Q22 14 45 24 T90 24 T135 24 T180 24" fill="none" stroke="#bfdbfe" strokeWidth="3" opacity="0.65" />
          <path d="M0 52 Q22 42 45 52 T90 52 T135 52 T180 52" fill="none" stroke="#dbeafe" strokeWidth="3.5" opacity="0.7" />
          <path d="M0 82 Q22 72 45 82 T90 82 T135 82 T180 82" fill="none" stroke="#93c5fd" strokeWidth="3" opacity="0.6" />
        </svg>
      );
    case 'trees':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#84a955" />
          <circle cx="30" cy="30" r="24" fill="#4d7c0f" />
          <circle cx="68" cy="22" r="26" fill="#65a30d" />
          <circle cx="115" cy="28" r="24" fill="#3f6212" />
          <circle cx="155" cy="25" r="25" fill="#4d7c0f" />
          <circle cx="20" cy="75" r="25" fill="#3f6212" />
          <circle cx="62" cy="82" r="26" fill="#4d7c0f" />
          <circle cx="110" cy="78" r="24" fill="#65a30d" />
          <circle cx="152" cy="80" r="25" fill="#3f6212" />
        </svg>
      );
    case 'grassland':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#a3be67" />
          <ellipse cx="45" cy="75" rx="60" ry="26" fill="#b7ce7a" />
          <ellipse cx="140" cy="85" rx="55" ry="22" fill="#8ca851" />
          <path d="M22 92 L26 78 M28 92 L31 80 M130 96 L133 82 M136 96 L140 83" stroke="#5b7829" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'marsh':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#7da888" />
          <ellipse cx="90" cy="68" rx="70" ry="24" fill="#60a5fa" opacity="0.55" />
          <path d="M18 98 L22 65 M25 98 L27 68 M148 96 L145 64 M155 96 L154 67" stroke="#3f6212" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="22" cy="63" r="3" fill="#78350f" />
          <circle cx="145" cy="62" r="3" fill="#78350f" />
        </svg>
      );
    case 'crops':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#a18253" />
          <path d="M0 20 L180 8 M0 40 L180 28 M0 60 L180 48 M0 80 L180 68 M0 100 L180 88" stroke="#65a30d" strokeWidth="7" opacity="0.8" />
          <path d="M0 30 L180 18 M0 50 L180 38 M0 70 L180 58 M0 90 L180 78" stroke="#854d0e" strokeWidth="3" opacity="0.4" />
        </svg>
      );
    case 'light_foliage':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#d6d9b8" />
          <circle cx="26" cy="28" r="18" fill="#84a955" />
          <circle cx="152" cy="28" r="19" fill="#6d9242" />
          <circle cx="32" cy="86" r="16" fill="#92b562" />
          <circle cx="146" cy="88" r="17" fill="#7a9e4e" />
          <circle cx="92" cy="18" r="14" fill="#9ab96a" />
        </svg>
      );
    case 'urban':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#d1d5db" />
          <rect x="8" y="28" width="38" height="72" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
          <polygon points="8,28 27,10 46,28" fill="#b45309" />
          <rect x="52" y="16" width="42" height="84" fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" />
          <rect x="102" y="34" width="36" height="66" fill="#9ca3af" stroke="#475569" strokeWidth="1.5" />
          <polygon points="136,42 156,24 176,42" fill="#991b1b" />
          <rect x="136" y="42" width="40" height="58" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        </svg>
      );
    case 'bare_ground':
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#c7b299" />
          <ellipse cx="42" cy="86" rx="22" ry="12" fill="#9e876f" />
          <ellipse cx="146" cy="78" rx="24" ry="14" fill="#a89078" />
          <polygon points="18,32 34,18 46,34" fill="#8b735b" />
          <polygon points="135,28 152,14 166,30" fill="#8b735b" />
        </svg>
      );
    case 'snow_ice':
    default:
      return (
        <svg viewBox="0 0 180 110" className="w-full h-full object-cover" aria-hidden="true">
          <rect width="180" height="110" fill="#e2eef8" />
          <polygon points="0,110 45,38 95,110" fill="#cbd5e1" />
          <polygon points="45,38 66,68 45,62 32,70" fill="#ffffff" />
          <polygon points="75,110 128,28 180,110" fill="#94a3b8" />
          <polygon points="128,28 152,65 128,58 106,66" fill="#ffffff" />
        </svg>
      );
  }
};
