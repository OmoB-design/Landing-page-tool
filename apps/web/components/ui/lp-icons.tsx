// Icons drawn in the owner's Figma file (side nav, page header, menus), as SVG components with
// the exact paths from Figma. Greys follow `currentColor` (set icon-system / icon-nav-active on the
// element); the blue accents use the spot-500-blue token. D69: these are used where the Figma
// design calls for them; everything else keeps using lucide-react through ./icons.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Home (nav). */
export function NavHomeIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M2.79556 5.28889L7.46222 1.74222C7.78045 1.50044 8.22044 1.50044 8.53778 1.74222L13.2044 5.28889C13.4258 5.45689 13.5556 5.71911 13.5556 5.99644V12.6667C13.5556 13.6489 12.76 14.4444 11.7778 14.4444H4.22222C3.24 14.4444 2.44444 13.6489 2.44444 12.6667V5.99644C2.44444 5.71822 2.57422 5.45689 2.79556 5.28889Z"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** New page (nav). */
export function NavNewPageIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M8 2.88889V13.1111"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.88889 8H13.1111"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Pages (nav). */
export function NavPagesIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M5.11111 6H6.88889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.11111 8.66667H10.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.11111 11.3333H10.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.44444 12.6667V3.33333C2.44444 2.35111 3.24 1.55556 4.22222 1.55556H9.18756C9.42311 1.55556 9.64978 1.64889 9.816 1.816L13.2951 5.29511C13.4622 5.46222 13.5556 5.688 13.5556 5.92356V12.6667C13.5556 13.6489 12.76 14.4444 11.7778 14.4444H4.22222C3.24 14.4444 2.44444 13.6489 2.44444 12.6667Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.4756 5.55556H10.4444C9.95378 5.55556 9.55556 5.15733 9.55556 4.66667V1.64622"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Templates (nav). */
export function NavTemplatesIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M12.6667 7.33332H3.33333C2.84267 7.33332 2.44444 7.73154 2.44444 8.22221V12.6667C2.44444 13.1573 2.84267 13.5555 3.33333 13.5555H12.6667C13.1573 13.5555 13.5556 13.1573 13.5556 12.6667V8.22221C13.5556 7.73154 13.1573 7.33332 12.6667 7.33332Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.88889 5.55557C2.88889 5.0649 3.28711 4.66668 3.77778 4.66668H12.2222C12.7129 4.66668 13.1111 5.0649 13.1111 5.55557"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33333 2.88889C3.33333 2.39822 3.73155 2 4.22222 2H11.7778C12.2684 2 12.6667 2.39822 12.6667 2.88889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Brands (nav). */
export function NavBrandsIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M2.88889 2H7.264C7.73511 2 8.18756 2.18756 8.52089 2.52089L13.632 7.632C14.3262 8.32622 14.3262 9.45156 13.632 10.1458L10.1458 13.632C9.45156 14.3262 8.32622 14.3262 7.632 13.632L2.52089 8.52089C2.18756 8.18756 2 7.73511 2 7.264V2.88889C2 2.39822 2.39822 2 2.88889 2Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.55556 6.66667C6.16921 6.66667 6.66667 6.16921 6.66667 5.55556C6.66667 4.94191 6.16921 4.44444 5.55556 4.44444C4.94191 4.44444 4.44444 4.94191 4.44444 5.55556C4.44444 6.16921 4.94191 6.66667 5.55556 6.66667Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Library (nav). */
export function NavLibraryIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M2.44444 12.4444V3.77778C2.44444 2.79556 3.24 2 4.22222 2H13.5556V10.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.77778 12.4444H6.22222V15.5556C6.22222 15.7351 6.33067 15.8978 6.49689 15.9662C6.66311 16.0364 6.85333 15.9973 6.98133 15.8702L8 14.8516L9.01867 15.8702C9.104 15.9556 9.21778 16 9.33333 16C9.39022 16 9.44889 15.9893 9.50311 15.9662C9.66933 15.8978 9.77778 15.7351 9.77778 15.5556V12.4444Z"
        fill="currentColor"
      />
      <path
        d="M4.66667 14H4C3.14133 14 2.44444 13.304 2.44444 12.4444C2.44444 11.5849 3.14133 10.8889 4 10.8889H13.5556C12.9858 11.6391 12.9031 13.1529 13.5556 14H11.3333"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.11111 9.33333C5.4793 9.33333 5.77778 9.03486 5.77778 8.66667C5.77778 8.29848 5.4793 8 5.11111 8C4.74292 8 4.44444 8.29848 4.44444 8.66667C4.44444 9.03486 4.74292 9.33333 5.11111 9.33333Z"
        fill="currentColor"
      />
      <path
        d="M5.11111 4.88889C5.4793 4.88889 5.77778 4.59041 5.77778 4.22222C5.77778 3.85403 5.4793 3.55556 5.11111 3.55556C4.74292 3.55556 4.44444 3.85403 4.44444 4.22222C4.44444 4.59041 4.74292 4.88889 5.11111 4.88889Z"
        fill="currentColor"
      />
      <path
        d="M5.11111 7.11111C5.4793 7.11111 5.77778 6.81263 5.77778 6.44444C5.77778 6.07625 5.4793 5.77778 5.11111 5.77778C4.74292 5.77778 4.44444 6.07625 4.44444 6.44444C4.44444 6.81263 4.74292 7.11111 5.11111 7.11111Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Analytics (nav). */
export function NavAnalyticsIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M13.1111 2.44444H12.6667C12.1757 2.44444 11.7778 2.84241 11.7778 3.33333V12.6667C11.7778 13.1576 12.1757 13.5556 12.6667 13.5556H13.1111C13.602 13.5556 14 13.1576 14 12.6667V3.33333C14 2.84241 13.602 2.44444 13.1111 2.44444Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.22222 6.88889H7.77778C7.28686 6.88889 6.88889 7.28686 6.88889 7.77778V12.6667C6.88889 13.1576 7.28686 13.5556 7.77778 13.5556H8.22222C8.71314 13.5556 9.11111 13.1576 9.11111 12.6667V7.77778C9.11111 7.28686 8.71314 6.88889 8.22222 6.88889Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33333 10.4444H2.88889C2.39797 10.4444 2 10.8424 2 11.3333V12.6667C2 13.1576 2.39797 13.5556 2.88889 13.5556H3.33333C3.82425 13.5556 4.22222 13.1576 4.22222 12.6667V11.3333C4.22222 10.8424 3.82425 10.4444 3.33333 10.4444Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.55556 2.44444H7.77778V4.66667"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.55556 2.66667L2.44444 7.77778"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Search, 14 px (sidebar top row). */
export function SidebarSearchIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M12.25 12.25L9.05225 9.05225"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.02778 10.3056C8.39028 10.3056 10.3056 8.39028 10.3056 6.02778C10.3056 3.66528 8.39028 1.75 6.02778 1.75C3.66528 1.75 1.75 3.66528 1.75 6.02778C1.75 8.39028 3.66528 10.3056 6.02778 10.3056Z"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sidebar left / collapse, 14 px. */
export function SidebarCollapseIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M4.86111 2.13889V11.8611"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.52778 5.05556L7.58333 7L9.52778 8.94444"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.91667 11.8611L11.0833 11.8611C11.9424 11.8611 12.6389 11.1647 12.6389 10.3056L12.6389 3.69444C12.6389 2.83533 11.9424 2.13889 11.0833 2.13889L2.91667 2.13889C2.05756 2.13889 1.36111 2.83533 1.36111 3.69444L1.36111 10.3056C1.36111 11.1647 2.05756 11.8611 2.91667 11.8611Z"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chevron after the workspace name, 12 px. */
export function MenuChevronIcon(props: IconProps) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M3 4.875L6 7.875L9 4.875"
        stroke="currentColor"
        strokeWidth="1.05882"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Filled caret after a nav group label. */
export function GroupCaretIcon(props: IconProps) {
  return (
    <svg
      width="5.60002"
      height="4"
      viewBox="0 0 5.60002 4"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M0.80001 0.8L2.80001 3.2L4.80001 0.8H0.80001Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Up-down chevrons on the profile card, 16 px. */
export function ExpandIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M11.1111 5.55556L8 2.44444L4.88889 5.55556"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.1111 10.4444L8 13.5556L4.88889 10.4444"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chevron on the getting-started card. */
export function CardChevronIcon(props: IconProps) {
  return (
    <svg
      width="7.55556"
      height="4.44444"
      viewBox="0 0 7.55556 4.44444"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M6.88889 0.666667L3.77778 3.77778L0.666667 0.666667"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Settings (account menu). */
export function MenuSettingsIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M5.55556 3.76622L8 8"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.55556 12.2347L8 8"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.8889 8H8"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.8889C10.7001 12.8889 12.8889 10.7001 12.8889 8C12.8889 5.29994 10.7001 3.11111 8 3.11111C5.29994 3.11111 3.11111 5.29994 3.11111 8C3.11111 10.7001 5.29994 12.8889 8 12.8889Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 1.55556V3.11111"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.41867 4.77778L3.76622 5.55556"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.55556 8H3.11111"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.4444 8H12.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.41867 11.2222L3.76622 10.4444"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 14.4444V12.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.2222 13.5813L10.4444 12.2338"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.77778 13.5813L5.55556 12.2338"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5813 11.2222L12.2338 10.4444"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5813 4.77778L12.2338 5.55556"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.2222 2.41867L10.4444 3.76622"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.77778 2.41867L5.55556 3.76622"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Themes (account menu). */
export function MenuThemesIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M5.11111 14.4444L6 11.7778"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.8889 14.4444L10 11.7778"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 2.44444H3.33333C2.35149 2.44444 1.55556 3.24038 1.55556 4.22222V10C1.55556 10.9818 2.35149 11.7778 3.33333 11.7778H12.6667C13.6485 11.7778 14.4444 10.9818 14.4444 10V4.22222C14.4444 3.24038 13.6485 2.44444 12.6667 2.44444Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 2.44444V1.33333"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logout (account menu). */
export function MenuLogoutIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M10.4444 5.11111V2.88889C10.4444 2.39822 10.0462 2 9.55556 2H3.77778C3.28711 2 2.88889 2.39822 2.88889 2.88889V13.1111C2.88889 13.6018 3.28711 14 3.77778 14H9.55556C10.0462 14 10.4444 13.6018 10.4444 13.1111V10.8889"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.8889 5.55556L15.3333 8L12.8889 10.4444"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.3333 8H10"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.07289 2.35378L6.02489 4.184C6.28622 4.34578 6.44533 4.632 6.44533 4.93956V11.0613C6.44533 11.3689 6.28622 11.6542 6.02489 11.8169L3.072 13.648"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Arrow after the next setup step, 14 px. */
export function MenuArrowIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M11.8611 7H2.13889"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.55556 3.69444L11.8611 7L8.55556 10.3056"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Notifications (page header). */
export function HeaderBellIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M14 11.3333C13.0178 11.3333 12.2222 10.5378 12.2222 9.55556V5.77778C12.2222 3.44622 10.3316 1.55556 8 1.55556C5.66844 1.55556 3.77778 3.44622 3.77778 5.77778V9.55556C3.77778 10.5378 2.98222 11.3333 2 11.3333H14Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.33333 13.6749C9.06711 14.1349 8.56969 14.4444 8 14.4444C7.43031 14.4444 6.93289 14.1349 6.66667 13.6749"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Jobs (page header). */
export function HeaderJobsIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M3.33333 10.4444H8"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 7.77778H3.33333C1.86057 7.77778 0.666667 8.97169 0.666667 10.4444C0.666667 11.9172 1.86057 13.1111 3.33333 13.1111H12.6667C14.1394 13.1111 15.3333 11.9172 15.3333 10.4444C15.3333 8.97169 14.1394 7.77778 12.6667 7.77778Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.35911 4.49067L9.92089 2.24178C10.1218 1.952 9.91467 1.55556 9.56178 1.55556H6.43911C6.08622 1.55556 5.87911 1.952 6.08 2.24178L7.64178 4.49067C7.816 4.74133 8.18489 4.74133 8.35911 4.49067Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A finished job, 10 px (blue). */
export function JobDoneIcon(props: IconProps) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M3.34179 8.96167C3.15429 8.9675 2.96012 8.86917 2.84179 8.71167L0.966789 6.21167C0.759289 5.935 0.815956 5.54333 1.09179 5.33667C1.36929 5.13 1.76012 5.18584 1.96679 5.46167L3.34346 7.2975L8.03512 1.07833C8.24346 0.802501 8.63512 0.748335 8.91012 0.955835C9.18596 1.16417 9.24012 1.55583 9.03262 1.83083L3.84096 8.7125C3.72262 8.86917 3.53846 8.96167 3.34179 8.96167Z"
        className="fill-spot-500-blue"
      />
    </svg>
  );
}

/** A finished setup step, 14 px (blue disc, white tick). */
export function StepDoneIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <circle cx="7" cy="7" r="7" className="fill-spot-500-blue" />
      <path
        d="M5.76178 9.95808C5.62178 9.96243 5.4768 9.88901 5.38845 9.77141L3.98845 7.90474C3.83351 7.69817 3.87583 7.40572 4.08178 7.25141C4.28898 7.0971 4.5808 7.13879 4.73511 7.34474L5.76303 8.7155L9.26614 4.07186C9.42169 3.8659 9.71414 3.82546 9.91947 3.98039C10.1254 4.13594 10.1659 4.42839 10.0109 4.63372L6.13449 9.77203C6.04614 9.88901 5.90863 9.95808 5.76178 9.95808Z"
        className="fill-button-primary-text"
      />
    </svg>
  );
}

/** An open setup step, 14 px ring. */
export function StepTodoIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0C10.866 0 14 3.13401 14 7ZM0.628815 7C0.628815 10.5187 3.48129 13.3712 7 13.3712C10.5187 13.3712 13.3712 10.5187 13.3712 7C13.3712 3.48129 10.5187 0.628815 7 0.628815C3.48129 0.628815 0.628815 3.48129 0.628815 7Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Pages (Figma: All Pages 81:1559) ────────────────────────────────────────────────────

/** Filter (Pages toolbar, 14 px). */
export function PagesFilterIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M13.125 4.08333H0.875C0.392 4.08333 0 3.69133 0 3.20833C0 2.72533 0.392 2.33333 0.875 2.33333H13.125C13.608 2.33333 14 2.72533 14 3.20833C14 3.69133 13.608 4.08333 13.125 4.08333Z"
        fill="currentColor"
      />
      <path
        d="M10.7917 8.16667H3.20833C2.72533 8.16667 2.33333 7.77467 2.33333 7.29167C2.33333 6.80867 2.72533 6.41667 3.20833 6.41667H10.7917C11.2747 6.41667 11.6667 6.80867 11.6667 7.29167C11.6667 7.77467 11.2747 8.16667 10.7917 8.16667Z"
        fill="currentColor"
      />
      <path
        d="M8.45833 12.25H5.54167C5.05867 12.25 4.66667 11.858 4.66667 11.375C4.66667 10.892 5.05867 10.5 5.54167 10.5H8.45833C8.94133 10.5 9.33333 10.892 9.33333 11.375C9.33333 11.858 8.94133 12.25 8.45833 12.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** List view (Pages layout toggle, 15 px). */
export function ViewListIcon(props: IconProps) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.07143"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.125 8.74965C3.81536 8.74965 4.375 8.19001 4.375 7.49965C4.375 6.8093 3.81536 6.24965 3.125 6.24965C2.43464 6.24965 1.875 6.8093 1.875 7.49965C1.875 8.19001 2.43464 8.74965 3.125 8.74965Z" />
        <path d="M6.87221 7.5H13.1222" />
        <path d="M3.125 4.375C3.81536 4.375 4.375 3.81536 4.375 3.125C4.375 2.43464 3.81536 1.875 3.125 1.875C2.43464 1.875 1.875 2.43464 1.875 3.125C1.875 3.81536 2.43464 4.375 3.125 4.375Z" />
        <path d="M6.87221 3.12535H13.1222" />
        <path d="M3.125 13.1253C3.81536 13.1253 4.375 12.5657 4.375 11.8753C4.375 11.185 3.81536 10.6253 3.125 10.6253C2.43464 10.6253 1.875 11.185 1.875 11.8753C1.875 12.5657 2.43464 13.1253 3.125 13.1253Z" />
        <path d="M6.87221 11.8747H13.1222" />
      </g>
    </svg>
  );
}

/** Grid view (Pages layout toggle, 16 px). */
export function ViewGridIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.14286"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12.5079 2.28571H4.06349C3.08127 2.28571 2.28571 3.08571 2.28571 4.06349V11.619C2.28571 12.5968 3.08127 13.3968 4.06349 13.3968H12.5079C13.4902 13.3968 14.2857 12.5968 14.2857 11.619V4.06349C14.2857 3.08571 13.4902 2.28571 12.5079 2.28571Z" />
        <path d="M10 2.4442V13.5553" />
        <path d="M6 2.4442V13.5553" />
      </g>
    </svg>
  );
}

/** Group chevron (status group headers, 12 px). */
export function GroupChevronIcon(props: IconProps) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M3 4.875L6 7.875L9 4.875"
        stroke="currentColor"
        strokeWidth="1.05882"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Status ring (Needs review group, 20 px; colour from currentColor). */
export function StatusRingIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10ZM1.91918 10C1.91918 14.4629 5.53709 18.0808 10 18.0808C14.4629 18.0808 18.0808 14.4629 18.0808 10C18.0808 5.53709 14.4629 1.91918 10 1.91918C5.53709 1.91918 1.91918 5.53709 1.91918 10Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Advertorial template type (14 px). */
export function TypeAdvertorialFigmaIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.37498 1.45833H13.125V10.2083C13.125 11.497 12.0804 12.5417 10.7917 12.5417H2.625" />
        <path d="M7.58333 4.95833H9.91667" />
        <path d="M7.58333 8.45833H9.91667" />
        <path d="M0.874999 5.54167L0.875 10.7917C0.875 11.7581 1.6585 12.5417 2.625 12.5417C3.5915 12.5417 4.375 11.7581 4.375 10.7917V1.45833" />
      </g>
    </svg>
  );
}

/** Listicle template type (16 px). */
export function TypeListicleFigmaIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.33333 6.44444C4.31517 6.44444 5.11111 5.64851 5.11111 4.66667C5.11111 3.68483 4.31517 2.88889 3.33333 2.88889C2.35149 2.88889 1.55556 3.68483 1.55556 4.66667C1.55556 5.64851 2.35149 6.44444 3.33333 6.44444Z" />
        <path d="M3.33333 13.1111C4.31517 13.1111 5.11111 12.3152 5.11111 11.3333C5.11111 10.3515 4.31517 9.55556 3.33333 9.55556C2.35149 9.55556 1.55556 10.3515 1.55556 11.3333C1.55556 12.3152 2.35149 13.1111 3.33333 13.1111Z" />
        <path d="M7.77778 4.66667H14.4444" />
        <path d="M7.77778 11.3333H14.4444" />
      </g>
    </svg>
  );
}

/** Row actions ⋯ (14 px). */
export function RowMoreIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 7.38889C7.21478 7.38889 7.38889 7.21478 7.38889 7C7.38889 6.78522 7.21478 6.61111 7 6.61111C6.78522 6.61111 6.61111 6.78522 6.61111 7C6.61111 7.21478 6.78522 7.38889 7 7.38889Z" />
        <path d="M2.52778 7.38889C2.74255 7.38889 2.91667 7.21478 2.91667 7C2.91667 6.78522 2.74255 6.61111 2.52778 6.61111C2.313 6.61111 2.13889 6.78522 2.13889 7C2.13889 7.21478 2.313 7.38889 2.52778 7.38889Z" />
        <path d="M11.4722 7.38889C11.687 7.38889 11.8611 7.21478 11.8611 7C11.8611 6.78522 11.687 6.61111 11.4722 6.61111C11.2575 6.61111 11.0833 6.78522 11.0833 7C11.0833 7.21478 11.2575 7.38889 11.4722 7.38889Z" />
      </g>
    </svg>
  );
}

// ── Page states and template types (Figma: All Pages/states light and state dark) ────────

/** Building: eight spokes fading round the circle (20 px). */
export function StatusBuildingFigmaIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 1.94443V4.72221" />
        <path opacity="0.88" d="M15.6967 4.30328L13.7323 6.26773" />
        <path opacity="0.75" d="M18.0555 10H15.2777" />
        <path opacity="0.63" d="M15.6967 15.6966L13.7323 13.7321" />
        <path opacity="0.5" d="M10 18.0555V15.2777" />
        <path opacity="0.38" d="M4.30359 15.6966L6.26803 13.7321" />
        <path opacity="0.25" d="M1.94458 10H4.72236" />
        <path opacity="0.13" d="M4.30359 4.30328L6.26803 6.26773" />
      </g>
    </svg>
  );
}

/** Published: a tick in a circle (20 px). */
export function StatusPublishedFigmaIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.0003 18.0555C14.4493 18.0555 18.0559 14.4489 18.0559 9.99996C18.0559 5.551 14.4493 1.94441 10.0003 1.94441C5.55135 1.94441 1.94475 5.551 1.94475 9.99996C1.94475 14.4489 5.55135 18.0555 10.0003 18.0555Z" />
        <path d="M6.38881 10.2777L8.88881 13.0555L13.611 6.94441" />
      </g>
    </svg>
  );
}

/** Approved: a ticked bubble and a pointing hand (18 px). */
export function StatusApprovedFigmaIcon(props: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.4998 5.75007L4.9998 7.25007L7.24981 3.75007" />
        <path d="M10.1156 4.56143C9.67854 2.39273 7.79855 0.749927 5.50015 0.749927C2.87715 0.749927 0.750147 2.87693 0.750147 5.49993C0.750147 7.80703 2.40676 9.69233 4.58786 10.12" />
        <path d="M17.2501 15.225C17.2501 13.166 17.0141 11.586 16.2501 11.002C15.3751 10.333 13.0981 10.164 10.9551 10.77L9.62504 7.94305C9.33204 7.31705 8.58804 7.04705 7.96204 7.34005C7.33704 7.63205 7.06604 8.37605 7.35804 9.00105L9.91904 14.457L7.19504 13.956C6.60804 13.848 6.02804 14.18 5.82404 14.741C5.59204 15.378 5.92203 16.081 6.56003 16.31L9.17603 17.251" />
      </g>
    </svg>
  );
}

/** Failed: a cross in a circle (20 px). */
export function StatusFailedFigmaIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.0003 18.0555C14.4493 18.0555 18.0559 14.4489 18.0559 9.99996C18.0559 5.551 14.4493 1.94441 10.0003 1.94441C5.55135 1.94441 1.94475 5.551 1.94475 9.99996C1.94475 14.4489 5.55135 18.0555 10.0003 18.0555Z" />
        <path d="M6.94475 6.94441L13.0559 13.0555" />
        <path d="M13.0559 6.94441L6.94475 13.0555" />
      </g>
    </svg>
  );
}

/** The source-leak score's shield (11 px). */
export function ScoreShieldIcon(props: IconProps) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="0.916667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.68631 1.12936L8.89465 2.15603C9.14765 2.23731 9.31937 2.47258 9.31937 2.73781V6.72225C9.31937 8.57392 6.45693 9.62381 5.68815 9.87253C5.56409 9.91286 5.43576 9.91286 5.3117 9.87253C4.54293 9.62381 1.68048 8.57392 1.68048 6.72225V2.73781C1.68048 2.47197 1.8522 2.2367 2.1052 2.15603L5.31354 1.12936C5.43454 1.09086 5.5647 1.09086 5.68631 1.12936Z" />
        <path d="M3.97058 5.95833L4.95386 6.875L7.0298 4.125" />
      </g>
    </svg>
  );
}

/** Comparison template type: an open book (11 x 16). */
export function TypeComparisonFigmaIcon(props: IconProps) {
  return (
    <svg
      width="11"
      height="16"
      viewBox="0 0 11 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.5 13.3787C5.60389 13.3787 5.70717 13.3387 5.80189 13.2596C6.19483 12.9298 6.86033 12.5067 7.72139 12.5084C8.27078 12.5093 8.74011 12.6836 9.10861 12.8951C9.50461 13.1218 9.92995 12.6818 9.92995 12.0622V3.98844C9.92995 3.67378 9.81933 3.384 9.63294 3.224C9.24367 2.88978 8.57817 2.45689 7.71406 2.45689C6.55906 2.45689 5.75972 3.232 5.49939 3.50756" />
        <path d="M5.5 13.3787C5.39611 13.3787 5.29283 13.3387 5.19811 13.2596C4.80517 12.9298 4.13967 12.5067 3.27861 12.5084C2.72922 12.5093 2.25989 12.6836 1.89139 12.8951C1.49539 13.1218 1.07006 12.6844 1.07006 12.0658C1.07006 9.76089 1.07006 5.424 1.07006 3.98578C1.07006 3.67111 1.18067 3.38489 1.36706 3.22489C1.75633 2.89067 2.42183 2.45778 3.28594 2.45778C4.44095 2.45778 5.24028 3.23289 5.50061 3.50844V13.3787H5.5Z" />
      </g>
    </svg>
  );
}

/** Long-form template type: a scroll (11 x 14). */
export function TypeLongFormFigmaIcon(props: IconProps) {
  return (
    <svg
      width="11"
      height="14"
      viewBox="0 0 11 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.01389 12.25C9.51989 12.25 9.93056 11.7273 9.93056 11.0833V10.3056C9.93056 10.0909 9.79367 9.91667 9.625 9.91667H5.04167C4.873 9.91667 4.73611 10.0909 4.73611 10.3056V11.0833C4.73611 11.7273 4.32544 12.25 3.81944 12.25C3.31344 12.25 2.90278 11.7273 2.90278 11.0833V2.91667C2.90278 2.27267 2.49211 1.75 1.98611 1.75C1.48011 1.75 1.06944 2.27267 1.06944 2.91667V4.47222C1.06944 4.90156 1.34322 5.25 1.68056 5.25H2.90278" />
        <path d="M9.01389 12.25H3.81944" />
        <path d="M1.98611 1.75H7.79167C8.29767 1.75 8.70833 2.27267 8.70833 2.91667V7.97222" />
        <path d="M4.58333 4.47222H7.02778" />
        <path d="M4.58333 6.80556H7.02778" />
      </g>
    </svg>
  );
}

/** Versus template type: books on a shelf (12 x 14). */
export function TypeVersusFigmaIcon(props: IconProps) {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.83333 2.13889H4.5C4.13181 2.13889 3.83333 2.48711 3.83333 2.91667V11.0833C3.83333 11.5129 4.13181 11.8611 4.5 11.8611H5.83333C6.20152 11.8611 6.5 11.5129 6.5 11.0833V2.91667C6.5 2.48711 6.20152 2.13889 5.83333 2.13889Z" />
        <path d="M3.16667 3.69444H2.5C2.13181 3.69444 1.83333 4.04267 1.83333 4.47222V11.0833C1.83333 11.5129 2.13181 11.8611 2.5 11.8611H3.16667C3.53486 11.8611 3.83333 11.5129 3.83333 11.0833V4.47222C3.83333 4.04267 3.53486 3.69444 3.16667 3.69444Z" />
        <path d="M8.09018 3.68194L7.13565 4.02973C6.7842 4.15779 6.58827 4.59399 6.69803 5.00401L8.38731 11.3145C8.49707 11.7246 8.87095 11.9531 9.2224 11.8251L10.1769 11.4773C10.5284 11.3492 10.7243 10.913 10.6146 10.503L8.92527 4.19249C8.81551 3.78247 8.44163 3.55389 8.09018 3.68194Z" />
        <path d="M7.28933 7.21156L9.51667 6.39956" />
        <path d="M3.83333 5.63889H6.5" />
        <path d="M1.83333 6.80556H3.83333" />
        <path d="M0.666667 11.8611H11.3333" />
      </g>
    </svg>
  );
}

/** Any other template type: a document (12 x 15). */
export function TypeOtherFigmaIcon(props: IconProps) {
  return (
    <svg
      width="12"
      height="15"
      viewBox="0 0 12 15"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.83333 5.625H5.16667" />
        <path d="M3.83333 8.125H8.16667" />
        <path d="M3.83333 10.625H8.16667" />
        <path d="M1.83333 11.875V3.125C1.83333 2.20417 2.43 1.45833 3.16667 1.45833H6.89067C7.06733 1.45833 7.23733 1.54583 7.362 1.7025L9.97133 4.96417C10.0967 5.12083 10.1667 5.3325 10.1667 5.55333V11.875C10.1667 12.7958 9.57 13.5417 8.83333 13.5417H3.16667C2.43 13.5417 1.83333 12.7958 1.83333 11.875Z" />
        <path d="M10.1067 5.20833H7.83333C7.46533 5.20833 7.16667 4.835 7.16667 4.375V1.54333" />
      </g>
    </svg>
  );
}

// ── Template cards (Figma: Template/Library and Template/Yours) ──────────────────────────

/** Use Template: a plus of two filled 1.17 px bars (14 px). */
export function PlusFigmaIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M11.4722 7.58326H2.52773C2.20573 7.58326 1.9444 7.32193 1.9444 6.99993C1.9444 6.67793 2.20573 6.4166 2.52773 6.4166H11.4722C11.7942 6.4166 12.0555 6.67793 12.0555 6.99993C12.0555 7.32193 11.7942 7.58326 11.4722 7.58326Z" />
      <path d="M7.00014 12.0555C6.67814 12.0555 6.41681 11.7942 6.41681 11.4722V2.52773C6.41681 2.20573 6.67814 1.9444 7.00014 1.9444C7.32214 1.9444 7.58348 2.20573 7.58348 2.52773V11.4722C7.58348 11.7942 7.32214 12.0555 7.00014 12.0555Z" />
    </svg>
  );
}

/** Preview: a box with an arrow out of its corner (14 px). */
export function ExternalLinkFigmaIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8.16667 2.13889H11.8611V5.83333" />
        <path d="M11.8611 2.13889L7 7" />
        <path d="M10.3056 8.16667V10.3056C10.3056 11.165 9.60944 11.8611 8.75 11.8611H3.69444C2.835 11.8611 2.13889 11.165 2.13889 10.3056V5.25C2.13889 4.39056 2.835 3.69444 3.69444 3.69444H5.83333" />
      </g>
    </svg>
  );
}

/** Delete: a bin with a lid (14 px). */
export function TrashFigmaIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.6538 6.0278L10.3833 11.1611C10.3398 11.9934 9.65689 12.6389 8.83012 12.6389H5.1707C4.34315 12.6389 3.66103 11.9934 3.61747 11.1611L3.34705 6.0278" />
        <path d="M2.13879 3.6944H11.861" />
        <path d="M5.25 3.69454V2.13898C5.25 1.71121 5.59844 1.36121 6.02778 1.36121H7.97222C8.40156 1.36121 8.75 1.71121 8.75 2.13898V3.69454" />
      </g>
    </svg>
  );
}
