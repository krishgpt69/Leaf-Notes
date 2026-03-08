import { useState, useMemo } from 'react';
import type { ParsedBlock } from '../../lib/parser';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';

interface SmartTableProps {
    block: ParsedBlock;
}

export default function SmartTable({ block }: SmartTableProps) {
    const [sortCol, setSortCol] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [search, setSearch] = useState('');

    const { headers, rows } = useMemo(() => {
        const lines = block.content.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return { headers: [], rows: [] };

        // Determine separator: pipe or comma
        const firstLine = lines[0];
        const separator = firstLine.includes('|') ? '|' : ',';

        const parseLine = (line: string) => line.split(separator).map(s => s.trim());

        const headers = parseLine(lines[0]);

        // Check if second line is markdown table divider (e.g. ---|---|---)
        let startIndex = 1;
        if (lines.length > 1 && /^[-\s|:]+$/.test(lines[1])) {
            startIndex = 2;
        }

        const rows = lines.slice(startIndex).map((line, id) => ({
            id,
            cells: parseLine(line)
        }));

        return { headers, rows };
    }, [block.content]);

    const handleSort = (colIndex: number) => {
        if (sortCol === colIndex) {
            if (sortDir === 'asc') setSortDir('desc');
            else setSortCol(null); // Reset
        } else {
            setSortCol(colIndex);
            setSortDir('asc');
        }
    };

    const filteredAndSortedRows = useMemo(() => {
        let result = [...rows];

        // Filter
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(row =>
                row.cells.some(cell => cell.toLowerCase().includes(q))
            );
        }

        // Sort
        if (sortCol !== null) {
            result.sort((a, b) => {
                const valA = a.cells[sortCol] || '';
                const valB = b.cells[sortCol] || '';

                // Try numeric sort first
                const numA = Number(valA.replace(/[^0-9.-]+/g, ""));
                const numB = Number(valB.replace(/[^0-9.-]+/g, ""));

                let cmp = 0;
                if (!isNaN(numA) && !isNaN(numB) && valA.trim() !== '' && valB.trim() !== '') {
                    cmp = numA - numB;
                } else {
                    cmp = valA.localeCompare(valB);
                }

                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [rows, search, sortCol, sortDir]);

    if (headers.length === 0) {
        return null;
    }

    return (
        <div className="smart-table-wrapper">
            <div className="smart-table-toolbar">
                <div className="smart-table-search">
                    <Search size={14} className="text-tertiary" />
                    <input
                        type="text"
                        placeholder="Search table..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="smart-table-count">
                    {filteredAndSortedRows.length} {filteredAndSortedRows.length === 1 ? 'row' : 'rows'}
                </div>
            </div>

            <div className="smart-table-container">
                <table className="smart-table">
                    <thead>
                        <tr>
                            {headers.map((header, i) => (
                                <th key={i} onClick={() => handleSort(i)}>
                                    <div className="th-content">
                                        <span>{header}</span>
                                        <span className="sort-icon text-tertiary">
                                            {sortCol !== i && <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100" />}
                                            {sortCol === i && sortDir === 'asc' && <ArrowUp size={12} className="text-accent" />}
                                            {sortCol === i && sortDir === 'desc' && <ArrowDown size={12} className="text-accent" />}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSortedRows.map(row => (
                            <tr key={row.id}>
                                {headers.map((_, i) => (
                                    <td key={i}>{row.cells[i] || ''}</td>
                                ))}
                            </tr>
                        ))}
                        {filteredAndSortedRows.length === 0 && (
                            <tr>
                                <td colSpan={headers.length} className="text-center py-8 text-secondary italic">
                                    No matching rows found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <style>{`
        .smart-table-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-family: var(--font-ui);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .smart-table-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-surface-2);
        }

        .smart-table-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 6px 10px;
          width: 250px;
          transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
        }
        
        .smart-table-search:focus-within {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 2px var(--color-accent-light);
        }

        .smart-table-search input {
          border: none;
          background: transparent;
          outline: none;
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--color-text-1);
          width: 100%;
        }

        .smart-table-count {
          font-size: 12px;
          color: var(--color-text-3);
          font-weight: 500;
        }

        .smart-table-container {
          overflow-x: auto;
          width: 100%;
        }

        .smart-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 14px;
        }

        .smart-table th {
          background: var(--color-surface);
          color: var(--color-text-2);
          font-weight: 600;
          padding: 12px 16px;
          border-bottom: 2px solid var(--color-border);
          cursor: pointer;
          user-select: none;
          position: sticky;
          top: 0;
          transition: background var(--dur-fast);
        }

        .smart-table th:hover {
          background: var(--color-surface-2);
        }

        .th-content {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .smart-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
          color: var(--color-text-1);
        }

        .smart-table tbody tr {
          transition: background-color var(--dur-fast);
        }

        .smart-table tbody tr:hover {
          background-color: var(--color-surface-2);
        }

        .smart-table tbody tr:last-child td {
          border-bottom: none;
        }
      `}</style>
        </div>
    );
}
