/**
 * The app frame. `AppShell` takes named slots (portrait, title, toolbar, list, options, footer, stage, drawer tabs);
 * the parts below fill them with consistent spacing. See `src/app/Workbench.tsx`.
 */
export { AppShell, type AppShellProps, type DrawerTab } from "./AppShell";
export {
  InspectorSection,
  EmptyNote,
  Stage,
  StageMessage,
  StageToolbar,
  ToolbarSeparator,
  ToolbarText,
} from "./parts";
