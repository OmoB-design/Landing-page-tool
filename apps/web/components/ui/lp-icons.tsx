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
