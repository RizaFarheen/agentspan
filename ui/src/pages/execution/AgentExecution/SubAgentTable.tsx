import { useState, useMemo } from "react";
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowRight } from "@phosphor-icons/react";
import { AgentRunData, AgentStatus, AgentStrategy } from "./types";
import { formatDuration, formatTokens } from "./agentExecutionUtils";

interface SubAgentTableProps {
  subAgents: AgentRunData[];
  strategy?: AgentStrategy;
  onDrillIn: (agentRun: AgentRunData) => void;
}

const PAGE_SIZE = 20;

type SortField = "name" | "status" | "tokens" | "duration";

const STATUS_ORDER: Record<AgentStatus, number> = {
  [AgentStatus.RUNNING]: 0,
  [AgentStatus.WAITING]: 1,
  [AgentStatus.FAILED]: 2,
  [AgentStatus.COMPLETED]: 3,
};

function getStatusChipProps(status: AgentStatus): {
  label: string;
  sx: object;
} {
  switch (status) {
    case AgentStatus.COMPLETED:
      return { label: "Completed", sx: { bgcolor: "#388e3c", color: "#fff" } };
    case AgentStatus.FAILED:
      return { label: "Failed", sx: { bgcolor: "#d32f2f", color: "#fff" } };
    case AgentStatus.RUNNING:
      return { label: "Running", sx: { bgcolor: "#f57c00", color: "#fff" } };
    case AgentStatus.WAITING:
      return { label: "Waiting", sx: { bgcolor: "#f57c00", color: "#fff" } };
    default:
      return { label: status, sx: {} };
  }
}

export function SubAgentTable({
  subAgents,
  strategy,
  onDrillIn,
}: SubAgentTableProps) {
  const usePagination = subAgents.length > PAGE_SIZE;

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!usePagination) return subAgents;
    const q = search.trim().toLowerCase();
    return q
      ? subAgents.filter((a) => a.agentName.toLowerCase().includes(q))
      : subAgents;
  }, [subAgents, search, usePagination]);

  const sorted = useMemo(() => {
    if (!usePagination) return filtered;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.agentName.localeCompare(b.agentName);
        case "status":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        case "tokens":
          return (
            (b.totalTokens?.totalTokens ?? 0) -
            (a.totalTokens?.totalTokens ?? 0)
          );
        case "duration":
          return b.totalDurationMs - a.totalDurationMs;
        default:
          return 0;
      }
    });
  }, [filtered, sortField, usePagination]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = usePagination
    ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : subAgents;

  // Summary counts
  const completedCount = subAgents.filter(
    (a) => a.status === AgentStatus.COMPLETED,
  ).length;
  const failedCount = subAgents.filter(
    (a) => a.status === AgentStatus.FAILED,
  ).length;
  const activeCount = subAgents.filter(
    (a) =>
      a.status === AgentStatus.RUNNING || a.status === AgentStatus.WAITING,
  ).length;

  const STRATEGY_CHIP_CFG: Record<AgentStrategy, { label: string; color: string; bg: string }> = {
    [AgentStrategy.HANDOFF]:    { label: "Handoff",    color: "#7c3aed", bg: "#ede9fe" },
    [AgentStrategy.PARALLEL]:   { label: "Parallel",   color: "#0369a1", bg: "#e0f2fe" },
    [AgentStrategy.SEQUENTIAL]: { label: "Sequential", color: "#0369a1", bg: "#e0f2fe" },
    [AgentStrategy.ROUTER]:     { label: "Router",     color: "#b45309", bg: "#fef3c7" },
    [AgentStrategy.SINGLE]:     { label: "Single",     color: "#6b7280", bg: "#f3f4f6" },
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleSortChange = (value: SortField) => {
    setSortField(value);
    setPage(1);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography
          variant="overline"
          sx={{ fontWeight: 700, letterSpacing: 1 }}
        >
          SUB-AGENTS ({subAgents.length})
        </Typography>
        {strategy && (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              backgroundColor: STRATEGY_CHIP_CFG[strategy]?.bg ?? "#f3f4f6",
              color: STRATEGY_CHIP_CFG[strategy]?.color ?? "#6b7280",
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {STRATEGY_CHIP_CFG[strategy]?.label ?? strategy}
          </Box>
        )}
      </Box>

      {/* Search + Sort controls (only when > 20 agents) */}
      {usePagination && (
        <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, alignItems: "center" }}>
          <TextField
            size="small"
            placeholder="Search by name..."
            value={search}
            onChange={handleSearchChange}
            sx={{ flexGrow: 1 }}
          />
          <Select
            size="small"
            value={sortField}
            onChange={(e) => handleSortChange(e.target.value as SortField)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="name">Sort: Name</MenuItem>
            <MenuItem value="status">Sort: Status</MenuItem>
            <MenuItem value="tokens">Sort: Tokens</MenuItem>
            <MenuItem value="duration">Sort: Duration</MenuItem>
          </Select>
        </Box>
      )}

      {/* Table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Turns
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Tokens
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Duration
              </TableCell>
              <TableCell sx={{ width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((agent) => {
              const chipProps = getStatusChipProps(agent.status);
              return (
                <TableRow key={agent.id} hover>
                  <TableCell>{agent.agentName}</TableCell>
                  <TableCell>
                    <Chip
                      label={chipProps.label}
                      size="small"
                      sx={{ ...chipProps.sx, fontWeight: 500, fontSize: 11 }}
                    />
                  </TableCell>
                  <TableCell align="right">{agent.turns.length}</TableCell>
                  <TableCell align="right">
                    {formatTokens(agent.totalTokens?.totalTokens ?? 0)}
                  </TableCell>
                  <TableCell align="right">
                    {formatDuration(agent.totalDurationMs)}
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => onDrillIn(agent)}
                      aria-label={`Drill into ${agent.agentName}`}
                    >
                      <ArrowRight size={16} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination (only when > 20 agents) */}
      {usePagination && totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 1.5 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_e, value) => setPage(value)}
            size="small"
          />
        </Box>
      )}

      {/* Summary row */}
      <Box
        sx={{
          mt: 1,
          pt: 1,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          gap: 2,
          alignItems: "center",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {subAgents.length} total:
        </Typography>
        <Typography variant="caption" sx={{ color: "#388e3c" }}>
          {completedCount} ✓
        </Typography>
        <Typography variant="caption" sx={{ color: "#d32f2f" }}>
          {failedCount} ✗
        </Typography>
        <Typography variant="caption" sx={{ color: "#f57c00" }}>
          {activeCount} ⏳
        </Typography>
      </Box>
    </Box>
  );
}

export default SubAgentTable;
