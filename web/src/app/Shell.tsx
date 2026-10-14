import { Outlet } from "react-router";
import { CommandPalette } from "../screens/S15-command-palette/CommandPalette";
import { Rail } from "./Rail";
import styles from "./Shell.module.css";

/** Frame for every railed screen. S07 (/login) renders outside it. */
export function Shell() {
  return (
    <>
      <Rail />
      <CommandPalette />
      <main className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}
