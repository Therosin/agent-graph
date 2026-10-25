import { runDesktop } from "../packages/desktop/main";
import { verifyDesktop } from "../packages/desktop/smoke";

try {
  await runDesktop(verifyDesktop);
  console.log("Native WebView smoke checks passed; backend stopped.");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
