/** Use Zod's interpreted validator: strict CSP must never need eval, including a swallowed capability probe. */
import { z } from "zod";
z.config({ jitless: true });
export { z };
