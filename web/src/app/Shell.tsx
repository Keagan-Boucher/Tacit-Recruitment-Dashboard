import { Outlet } from "react-router";
import { Rail } from "./Rail";
import styles from "./Shell.module.css";

/** Frame for every railed screen. S07 (/login) renders outside it. */
export function Shell() {
  return (
    <>
      <Rail />
      <main className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}
