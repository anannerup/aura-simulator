/**
 * The app frame. `AppShell` takes named slots (brand, topBar, left, stage, inspector, drawer); the parts below fill
 * them with consistent spacing. Panels from other features drop into a slot as children; see `src/app/Workbench.tsx`.
 */
export { AppShell, useShell, type AppShellProps, type DrawerTab, type ShellState } from "./AppShell";
export {
  Brand,
  LogoMark,
  TopBarGroup,
  TopBarSpacer,
  TopBarDivider,
  TopBarChip,
  InspectorSection,
  EmptyNote,
  Stage,
  StageMessage,
  StageToolbar,
  ToolbarSeparator,
  ToolbarText,
} from "./parts";
