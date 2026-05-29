import type { SVGProps } from 'react';

// Line-icon set (stroke 1.6, 24x24) — ported from the design's icons.jsx.
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Library: (p: IconProps) => (
    <Svg {...p}>
      <rect x={4} y={5} width={5} height={14} rx={1} />
      <rect x={11} y={5} width={5} height={14} rx={1} />
      <path d="M18.5 6.2l2.2 13.3" />
    </Svg>
  ),
  Book: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19a1 1 0 0 1 1 1v13H6a2 2 0 0 0-2 2z" />
      <path d="M20 18v3H6a2 2 0 0 1-2-2" />
    </Svg>
  ),
  Doc: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M13 3v5h5" />
    </Svg>
  ),
  Pencil: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 5l5 5M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
    </Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
    </Svg>
  ),
  Star: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l2.3 4.9 5.2.7-3.8 3.7.9 5.3L12 16.9 7.4 18.6l.9-5.3L4.5 9.6l5.2-.7z" />
    </Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H4a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 5.3 7.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V4a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8z" />
    </Svg>
  ),
  Chart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 4v15a1 1 0 0 0 1 1h14" />
      <path d="M8 16l3-4 3 2 4-6" />
    </Svg>
  ),
  Users: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={9} cy={8} r={3.2} />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17 19a5.5 5.5 0 0 0-2-4.3" />
    </Svg>
  ),
  Chevron: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  ChevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  ChevUpDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </Svg>
  ),
  PanelLeft: (p: IconProps) => (
    <Svg {...p}>
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <line x1={9} y1={5} x2={9} y2={19} />
    </Svg>
  ),
  Plus: (p: IconProps) => (
    <Svg {...p}>
      <line x1={12} y1={5} x2={12} y2={19} />
      <line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  ),
  Grip: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={9} cy={6} r={1.1} />
      <circle cx={15} cy={6} r={1.1} />
      <circle cx={9} cy={12} r={1.1} />
      <circle cx={15} cy={12} r={1.1} />
      <circle cx={9} cy={18} r={1.1} />
      <circle cx={15} cy={18} r={1.1} />
    </Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </Svg>
  ),
  CheckCircle: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={12} cy={12} r={9} />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </Svg>
  ),
  Link: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 13a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L11 7" />
      <path d="M14 11a3.5 3.5 0 0 0-5 0l-2.5 2.5a3.5 3.5 0 0 0 5 5L13 17" />
    </Svg>
  ),
  Image: (p: IconProps) => (
    <Svg {...p}>
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <circle cx={8.5} cy={10} r={1.6} />
      <path d="M5 18l4.5-4.5L13 17l3-3 3 3" />
    </Svg>
  ),
  Heading: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 5v14M16 5v14M6 12h10" />
    </Svg>
  ),
  Text: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 6h14M7 6v13M17 6v13M14 19h6M4 19h6" />
    </Svg>
  ),
  Quote: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v0a3 3 0 0 1-3 3M19 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v0a3 3 0 0 1-3 3" />
    </Svg>
  ),
  Callout: (p: IconProps) => (
    <Svg {...p}>
      <rect x={3} y={5} width={18} height={14} rx={3} />
      <line x1={7.5} y1={10} x2={13} y2={10} />
      <line x1={7.5} y1={14} x2={16} y2={14} />
    </Svg>
  ),
  ListBullet: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={5} cy={7} r={1.1} />
      <circle cx={5} cy={12} r={1.1} />
      <circle cx={5} cy={17} r={1.1} />
      <line x1={9} y1={7} x2={19} y2={7} />
      <line x1={9} y1={12} x2={19} y2={12} />
      <line x1={9} y1={17} x2={19} y2={17} />
    </Svg>
  ),
  ListNumber: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 6.5h1V10M4 14h1.8c.6 0 .6.8 0 1.1L4 17h2" />
      <line x1={9} y1={7} x2={19} y2={7} />
      <line x1={9} y1={12} x2={19} y2={12} />
      <line x1={9} y1={17} x2={19} y2={17} />
    </Svg>
  ),
  Divider: (p: IconProps) => (
    <Svg {...p}>
      <line x1={4} y1={12} x2={20} y2={12} />
      <circle cx={12} cy={12} r={0.2} />
    </Svg>
  ),
  Table: (p: IconProps) => (
    <Svg {...p}>
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <line x1={3} y1={10} x2={21} y2={10} />
      <line x1={3} y1={15} x2={21} y2={15} />
      <line x1={10} y1={5} x2={10} y2={19} />
    </Svg>
  ),
  Bold: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </Svg>
  ),
  Italic: (p: IconProps) => (
    <Svg {...p}>
      <line x1={10} y1={5} x2={18} y2={5} />
      <line x1={6} y1={19} x2={14} y2={19} />
      <line x1={14} y1={5} x2={10} y2={19} />
    </Svg>
  ),
  Underline: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 5v6a5 5 0 0 0 10 0V5" />
      <line x1={5} y1={20} x2={19} y2={20} />
    </Svg>
  ),
  Pin: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 21v-7" />
      <path d="M8 4h8l-1 6 2 2v1H7v-1l2-2z" />
    </Svg>
  ),
  Eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx={12} cy={12} r={2.6} />
    </Svg>
  ),
  Sparkle: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18 15l.7 1.8L20.5 17.5l-1.8.7L18 20l-.7-1.8L15.5 17.5l1.8-.7z" />
    </Svg>
  ),
  Clock: (p: IconProps) => (
    <Svg {...p}>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  Copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x={8} y={8} width={12} height={12} rx={2} />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Svg>
  ),
  ArrowLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  ),
  Logo: (p: IconProps) => (
    <Svg {...p}>
      <rect x={4} y={4} width={16} height={16} rx={4} />
      <path d="M9 9h6v6H9z" fill="currentColor" />
    </Svg>
  ),
} satisfies Record<string, (p: IconProps) => JSX.Element>;

export type IconName = keyof typeof Icons;

export function Icon({ name, ...props }: { name: IconName } & IconProps) {
  const Cmp = Icons[name];
  return <Cmp {...props} />;
}
