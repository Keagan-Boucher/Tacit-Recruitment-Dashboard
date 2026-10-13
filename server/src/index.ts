import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { initFirebase } from "./firebase/admin.ts";

const config = loadConfig();
createApp(config, initFirebase(config)).listen(config.port, () => {
  console.log(`Tacit proxy listening on :${config.port}`);
});
