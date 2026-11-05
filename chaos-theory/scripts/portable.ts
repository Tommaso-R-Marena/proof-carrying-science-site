import { buildPortable } from "./portable-build";
console.log(JSON.stringify(await buildPortable(), null, 2));
