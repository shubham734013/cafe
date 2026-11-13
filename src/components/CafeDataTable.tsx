import React, { useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CafeDataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  pageSize?: number;
  emptyText?: string;
  getRowClassName?: (row: TData) => string;
  getRowTestId?: (row: TData) => string | undefined;
}

export function CafeDataTable<TData>({
  data,
  columns,
  pageSize = 8,
  emptyText = 'No matching records found.',
  getRowClassName,
  getRowTestId,
}: CafeDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  return (
    <div className="rounded-xl bg-surface-container-low shadow-md overflow-hidden border border-outline-variant/20">
      <Table>
        <TableHeader className="bg-surface-container-high/60">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-outline-variant/25 hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant px-3 py-2.5"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="material-symbols-outlined text-[14px] text-outline">
                          {sorted === 'asc'
                            ? 'arrow_upward'
                            : sorted === 'desc'
                              ? 'arrow_downward'
                              : 'unfold_more'}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-8 text-xs text-on-surface-variant"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-testid={getRowTestId ? getRowTestId(row.original) : undefined}
                className={`border-outline-variant/15 hover:bg-surface-container transition-colors ${
                  getRowClassName ? getRowClassName(row.original) : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-3 py-2.5 text-xs text-on-surface">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface-container border-t border-outline-variant/20 text-[11px] text-on-surface-variant">
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ({data.length}{' '}
            rows)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright disabled:opacity-40 text-on-surface font-semibold cursor-pointer"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright disabled:opacity-40 text-on-surface font-semibold cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
