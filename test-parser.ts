import { parseDocument } from "./src/lib/parser";

const doc = `Here is some text
(todo)
[ ] test item
[x] finished item
(todo)
End text

(timeline)
2024: Started project
2025: Finished project
(timeline)
`;

console.log(JSON.stringify(parseDocument(doc), null, 2));
