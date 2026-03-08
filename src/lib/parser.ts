// Simple deterministic hash for stable block IDs (avoids full React re-mount on every parse)
function stableBlockId(index: number, type: string, content: string): string {
    let hash = 0x811c9dc5; // FNV offset basis
    const str = `${index}:${type}:${content.slice(0, 60)}`;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0; // FNV prime, unsigned
    }
    return `blk_${hash.toString(36)}`;
}

export type BlockType =
    | 'text'
    | 'todo'
    | 'table'
    | 'code'
    | 'quote'
    | 'callout'
    | 'timeline'
    | 'compare'
    | 'vs'
    | 'stats'
    | 'accordion'
    | 'progress'
    | 'roadmap'
    | 'gallery'
    | 'tabs'
    | 'chart'
    | 'mindmap'
    | 'flashcards'
    | 'flashcard'
    | 'cards'
    | 'kanban'
    | 'embed'
    | 'poll'
    | 'math'
    | 'calendar'
    | 'diagram';

export interface ParsedBlock {
    id: string; // Deterministic ID for React rendering
    type: BlockType;
    args?: string;
    content: string; // The text content inside the block (or just text if type='text')
    raw: string; // The entire raw string including tags
}

let blockCounter = 0;

export function parseDocument(text: string): ParsedBlock[] {
    if (!text) return [];

    const blocks: ParsedBlock[] = [];
    const lines = text.split(/\r?\n/);

    let currentContent: string[] = [];
    let currentRaw: string[] = [];
    blockCounter = 0;

    // Regex looks for (type) or (type args) on its own line
    const blockRegex = /^\(([a-z]+)(?:\s+(.+))?\)$/i;

    const pushCurrentText = () => {
        if (currentRaw.length > 0) {
            const content = currentContent.join('\n').trim();
            blocks.push({
                id: stableBlockId(blockCounter++, 'text', content),
                type: 'text',
                content,
                raw: currentRaw.join('\n')
            });
            currentContent = [];
            currentRaw = [];
        }
    };

    const pushCurrentBlock = (type: BlockType, args: string | undefined, content: string[], raw: string[]) => {
        const contentStr = content.join('\n');
        blocks.push({
            id: stableBlockId(blockCounter++, type, contentStr),
            type,
            args,
            content: contentStr,
            raw: raw.join('\n')
        });
    };

    let inBlock = false;
    let blockType: BlockType | null = null;
    let blockArgs: string | undefined = undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.trim().match(blockRegex);

        if (match) {
            const type = match[1].toLowerCase() as BlockType;
            const args = match[2];

            if (!inBlock) {
                // We found a starting tag
                pushCurrentText(); // push any preceding text
                inBlock = true;
                blockType = type;
                blockArgs = args;
                currentRaw.push(line); // Tag goes into raw, not content
            } else {
                // We are already inside a block. Is this the closing tag?
                if (type === blockType) {
                    currentRaw.push(line);
                    pushCurrentBlock(blockType, blockArgs, currentContent, currentRaw);

                    // Reset
                    inBlock = false;
                    blockType = null;
                    blockArgs = undefined;
                    currentContent = [];
                    currentRaw = [];
                } else {
                    // It's another tag inside a block. We don't support nested blocks yet,
                    // so we treat it as literal content.
                    currentContent.push(line);
                    currentRaw.push(line);
                }
            }
        } else {
            // Normal line
            currentContent.push(line);
            currentRaw.push(line);
        }
    }

    // File ended. Push any remaining content.
    if (inBlock && blockType) {
        // The block was never closed. We auto-close it!
        pushCurrentBlock(blockType, blockArgs, currentContent, currentRaw);
    } else if (currentRaw.length > 0) {
        pushCurrentText();
    }

    return blocks;
}
