import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";

const VARIANTS = {
  connected: { color: "success", label: "متصل" },
  connecting: { color: "warning", label: "در حال اتصال" },
  disconnected: { color: "default", label: "قطع" },
  error: { color: "error", label: "خطای اتصال" },
};

export default function ConnectionBadge({ status = "disconnected" }) {
  const variant = VARIANTS[status] ?? VARIANTS.disconnected;
  return (
    <Tooltip title="وضعیت اتصال WebSocket">
      <Chip
        size="small"
        color={variant.color}
        label={variant.label}
        variant={status === "connected" ? "filled" : "outlined"}
        sx={{ fontWeight: 600 }}
      />
    </Tooltip>
  );
}