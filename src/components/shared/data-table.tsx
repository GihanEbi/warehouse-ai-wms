"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState, TableSkeleton } from "./states";
import { NativeSelect } from "./form-controls";
import type { LucideIcon } from "lucide-react";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** providing a sort value makes the column sortable */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  /** hidden below the `lg` breakpoint to keep tables compact on tablets/phones */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** navigates on row click */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  /** renders the row as a card on small screens instead of a wide table */
  mobileCard?: (row: T) => React.ReactNode;
  loading?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  initialSort?: { id: string; desc?: boolean };
  empty?: { title: string; description?: string; icon?: LucideIcon; action?: React.ReactNode };
  /** shown on the left of the pagination footer (e.g. totals) */
  footerNote?: React.ReactNode;
  className?: string;
  testId?: string;
  /** hide the pagination bar when everything fits on one page */
  compact?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  rowHref,
  onRowClick,
  mobileCard,
  loading,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  initialSort,
  empty,
  footerNote,
  className,
  testId = "data-table",
  compact,
}: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.id, desc: !!initialSort.desc }] : []);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        accessorFn: (row: T) => c.sortValue?.(row) ?? "",
        cell: ({ row }) => c.cell(row.original),
        enableSorting: !!c.sortValue,
        sortUndefined: "last",
        meta: { align: c.align, className: c.className, hideOnMobile: c.hideOnMobile },
      })),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: defs,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  });

  if (loading) return <TableSkeleton />;
  if (data.length === 0) {
    return <EmptyState title={empty?.title ?? "No records found"} description={empty?.description ?? "Try adjusting your search or filters."} icon={empty?.icon} action={empty?.action} />;
  }

  const rows = table.getRowModel().rows;
  const total = data.length;
  const from = pagination.pageIndex * pagination.pageSize + 1;
  const to = Math.min(total, from + rows.length - 1);
  const clickable = !!(rowHref || onRowClick);
  const go = (row: T) => {
    if (onRowClick) onRowClick(row);
    else if (rowHref) {
      const href = rowHref(row);
      if (href) router.push(href);
    }
  };
  const alignClass = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      {mobileCard && (
        <ul className="divide-y md:hidden" data-testid={`${testId}-cards`}>
          {rows.map((r) => (
            <li
              key={r.id}
              data-row={r.id}
              className={cn("p-3", clickable && "cursor-pointer active:bg-muted/60")}
              onClick={clickable ? () => go(r.original) : undefined}
            >
              {mobileCard(r.original)}
            </li>
          ))}
        </ul>
      )}
      <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
        <table className="w-full caption-bottom text-sm">
          <thead className="border-b bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as { align?: string; hideOnMobile?: boolean } | undefined;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "h-9 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground",
                        alignClass(meta?.align),
                        meta?.hideOnMobile && "hidden lg:table-cell",
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn("inline-flex items-center gap-1 rounded hover:text-foreground", meta?.align === "right" && "flex-row-reverse")}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                data-row={r.id}
                className={cn("border-b last:border-b-0 transition-colors", clickable && "cursor-pointer hover:bg-muted/50")}
                onClick={clickable ? () => go(r.original) : undefined}
              >
                {r.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { align?: string; className?: string; hideOnMobile?: boolean } | undefined;
                  return (
                    <td
                      key={cell.id}
                      className={cn("px-3 py-2.5 align-middle", alignClass(meta?.align), meta?.hideOnMobile && "hidden lg:table-cell", meta?.className)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!(compact && total <= pagination.pageSize) && (
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span data-testid={`${testId}-range`}>
              Showing {from}–{to} of {total}
            </span>
            {footerNote}
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Rows per page"
              value={String(pagination.pageSize)}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} / page` }))}
              className="w-28"
            />
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="min-w-12 text-center tabular-nums">
              {pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
